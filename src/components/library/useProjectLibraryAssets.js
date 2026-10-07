/**
 * useProjectLibraryAssets
 * -----------------------
 * The Project Library's data layer, scoped to ONE project — the project that is
 * open. Nothing account-wide is read here: the page is the active project's own
 * library, exactly as the Project Images page was.
 *
 * Three server-side reads, each filtered to the project:
 *   - the project's design versions (the names every row is labelled with, and
 *     the published pointer each issued document is judged against)
 *   - the saved reports for those versions (the Current live report rows: the
 *     newest report per version and report type, never every generation)
 *   - the issued documents (the exported PDFs this Library holds)
 *
 * Supersession and source state are derived from what was read — no issued
 * document is ever modified by a Library read.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { subscribeIssuedExportStored } from '@/components/library/issuedExportSignal';
import {
  REPORT_DOCUMENT_TYPES,
  PROPOSAL_DOCUMENT_TYPES,
} from '@/components/library/issuedDocument/issuedDocumentTypes';
import {
  collapseLiveReports,
  markSuperseded,
  selectLatestExports,
} from '@/components/library/librarySourceStatus';
import { buildVersionNameMap } from '@/components/library/libraryVersionLabels';
import { isSnapshotRestorable } from '@/components/report/reportSnapshotAuthority';

const LIVE_REPORT_TYPES = ['visual', 'technical'];
const REPORT_SNAPSHOT_LIMIT = 100;
const ISSUED_EXPORT_LIMIT = 200;

const asItems = (result) => (Array.isArray(result) ? result : (result?.items || []));

export function useProjectLibraryAssets({ projectId }) {
  const [versions, setVersions] = useState([]);
  const [savedReports, setSavedReports] = useState([]);
  const [issuedExports, setIssuedExports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Guards against overlapping reads: a background export landing while a read
  // is already in flight simply waits for the next one.
  const inFlight = useRef(false);

  /**
   * Read the project's versions, saved reports and issued documents.
   *
   * `silent` re-reads without raising the loading state, so a refresh triggered
   * by a just-stored export or by returning to the tab never flashes the Loading
   * state over the rows already on screen.
   */
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!projectId) {
      setVersions([]);
      setSavedReports([]);
      setIssuedExports([]);
      setLoading(false);
      return;
    }
    if (inFlight.current) return;

    inFlight.current = true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [versionPage, snapshotPage, exportPage] = await Promise.all([
        base44.entities.ProjectVersion.filter(
          { project_id: projectId },
          { sort: 'version_number', limit: 20 },
        ),
        base44.entities.ReportSnapshot.filter(
          { project_id: projectId },
          { sort: '-generated_at', limit: REPORT_SNAPSHOT_LIMIT },
        ),
        base44.entities.ProjectAssetExport.filter(
          { project_id: projectId },
          { sort: '-exported_at', limit: ISSUED_EXPORT_LIMIT },
        ),
      ]);

      setVersions(asItems(versionPage));
      setSavedReports(asItems(snapshotPage));
      setIssuedExports(asItems(exportPage));
    } catch (loadError) {
      console.error('[ProjectLibrary] Failed to load project assets:', loadError);
      setError(loadError);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // A document stored while this Library is open is listed as soon as it exists.
  // The export is recorded in the background after the download, so the row can
  // land after this page has already read.
  useEffect(
    () => subscribeIssuedExportStored((storedProjectId) => {
      if (!projectId || storedProjectId !== projectId) return;
      load({ silent: true });
    }),
    [load, projectId],
  );

  // Returning to the tab — an export made in another tab, or a return from a
  // report — reads again rather than showing what was true when it was opened.
  useEffect(() => {
    const refresh = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load({ silent: true });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  const versionById = useMemo(
    () => new Map(versions.map((version) => [version.id, version])),
    [versions],
  );
  const versionNameById = useMemo(() => buildVersionNameMap(versions), [versions]);
  // Each version's CURRENT durable authority — the published engineering result
  // the version pointer holds. The canonical report row is resolved against it,
  // so a newer stale or incomplete duplicate cannot hide the valid Current
  // report the rest of the app shows for that version.
  const publishedFingerprintByVersionId = useMemo(
    () => new Map(versions.map((version) => [version.id, version.published_fingerprint || null])),
    [versions],
  );

  /**
   * ONE row per project version and report type: the CANONICAL saved report for
   * that version and type — complete evidence, proposal-ready, frozen against the
   * current authority, and only then the newest. A report regenerated five times
   * still produces one row — the earlier generations are never listed — and the
   * rows read in the order the report types are declared.
   */
  const liveReports = useMemo(() => collapseLiveReports(savedReports, {
    currentFingerprintByVersion: publishedFingerprintByVersionId,
  })
    .filter((snapshot) => LIVE_REPORT_TYPES.includes(snapshot.report_type))
    .filter(isSnapshotRestorable)
    .map((snapshot) => ({
      id: snapshot.id,
      versionId: snapshot.version_id,
      reportType: snapshot.report_type,
      generatedAt: snapshot.generated_at || null,
      generatedBy: snapshot.generated_by || null,
      status: snapshot.status || 'current',
      sourceRecordId: snapshot.id,
      sourceFingerprints: snapshot.source_fingerprints || {},
    }))
    .sort((a, b) => LIVE_REPORT_TYPES.indexOf(a.reportType) - LIVE_REPORT_TYPES.indexOf(b.reportType)),
  [savedReports, publishedFingerprintByVersionId]);

  const markedExports = useMemo(() => markSuperseded(issuedExports), [issuedExports]);

  /**
   * ONE exported PDF per project version and report type — the latest. An older
   * export of the same version and type is left in storage untouched and is not
   * listed: the Library states what each version holds now, not its export
   * history. Proposals are NOT collapsed this way — two different issued
   * proposals of the same version are separate documents, not revisions of one.
   */
  const reportExports = useMemo(
    () => selectLatestExports(
      markedExports.filter(({ record }) => REPORT_DOCUMENT_TYPES.includes(record.document_type)),
    ),
    [markedExports],
  );
  const proposalExports = useMemo(
    () => markedExports.filter(({ record }) => PROPOSAL_DOCUMENT_TYPES.includes(record.document_type)),
    [markedExports],
  );

  return {
    loading,
    error,
    reload: load,
    versions,
    versionById,
    versionNameById,
    liveReports,
    reportExports,
    proposalExports,
  };
}

export default useProjectLibraryAssets;