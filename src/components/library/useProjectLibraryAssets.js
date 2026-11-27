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
  createProjectAssetsRefreshState,
  requestRead,
  onReadEnd,
  consumePendingSilent,
} from '@/components/library/projectAssetsRefreshState';
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
import { selectCanonicalVersions } from '@/lib/canonicalVersionSelection';

// The ONE report a version states a current row for: the Project Report. The
// legacy Visual and Technical Reports are retired as proposal sources — their
// saved records and issued PDFs stay readable history, but they are never listed
// as a current required report.
const LIVE_REPORT_TYPES = ['project'];
const REPORT_SNAPSHOT_LIMIT = 100;
const ISSUED_EXPORT_LIMIT = 200;

const asItems = (result) => (Array.isArray(result) ? result : (result?.items || []));

export function useProjectLibraryAssets({ projectId, activeVersionId = null }) {
  const [versions, setVersions] = useState([]);
  const [savedReports, setSavedReports] = useState([]);
  const [issuedExports, setIssuedExports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Guards against overlapping reads: a notification arriving while a read is
  // in flight is retained and processed once the active read completes, so a
  // stored document is never missed. Many notifications coalesce into one
  // follow-up read. An older response can never populate a newly selected
  // project — the pure state machine enforces both rules.
  const refreshStateRef = useRef(createProjectAssetsRefreshState());
  refreshStateRef.current.activeProjectId = projectId;

  /**
   * Read the project's versions, saved reports and issued documents.
   *
   * `silent` re-reads without raising the loading state, so a refresh triggered
   * by a just-stored export or by returning to the tab never flashes the Loading
   * state over the rows already on screen.
   *
   * A refresh requested while a read is already in flight is retained, not
   * discarded: it runs as one coalesced follow-up once the active read settles.
   */
  const load = useCallback(async ({ silent = false } = {}) => {
    const currentProjectId = refreshStateRef.current.activeProjectId;
    if (!currentProjectId) {
      setVersions([]);
      setSavedReports([]);
      setIssuedExports([]);
      setLoading(false);
      setError(null);
      return;
    }
    const { shouldRun } = requestRead(refreshStateRef.current, { projectId: currentProjectId, silent });
    if (!shouldRun) return;
    if (!silent) setLoading(true);
    setError(null);
    let resultData = null;
    let caughtError = null;
    try {
      const [versionPage, snapshotPage, exportPage] = await Promise.all([
        base44.entities.ProjectVersion.filter(
          { project_id: currentProjectId },
          { sort: 'version_number', limit: 20 },
        ),
        base44.entities.ReportSnapshot.filter(
          { project_id: currentProjectId },
          { sort: '-generated_at', limit: REPORT_SNAPSHOT_LIMIT },
        ),
        base44.entities.ProjectAssetExport.filter(
          { project_id: currentProjectId },
          { sort: '-exported_at', limit: ISSUED_EXPORT_LIMIT },
        ),
      ]);
      resultData = { versionPage, snapshotPage, exportPage };
    } catch (loadError) {
      caughtError = loadError;
    }
    const { shouldCommit, pendingRefresh } = onReadEnd(refreshStateRef.current, { projectId: currentProjectId });
    if (shouldCommit) {
      if (resultData) {
        setVersions(asItems(resultData.versionPage));
        setSavedReports(asItems(resultData.snapshotPage));
        setIssuedExports(asItems(resultData.exportPage));
      } else {
        console.error('[ProjectLibrary] Failed to load project assets:', caughtError);
        setError(caughtError);
      }
      setLoading(false);
    }
    if (pendingRefresh) {
      load({ silent: consumePendingSilent(refreshStateRef.current) });
    }
  }, []);

  // Switching projects resets state immediately so assets from the previous
  // project never appear while the new project's read is outstanding.
  useEffect(() => {
    setVersions([]);
    setSavedReports([]);
    setIssuedExports([]);
    setError(null);
    setLoading(true);
    load();
  }, [load, projectId]);

  // A document or image stored while this Library is open is listed as soon
  // as it exists. The notification is project-scoped and coalesced.
  useEffect(() => subscribeIssuedExportStored((storedProjectId) => {
    if (!refreshStateRef.current.activeProjectId || storedProjectId !== refreshStateRef.current.activeProjectId) return;
    load({ silent: true });
  }), [load]);

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

  /**
   * ONE canonical version list for this project — the same shared rule every
   * other surface uses. A duplicated version slot collapses to the record the
   * project's active pointer names, or to the one carrying verified evidence:
   * the saved Project Report and issued documents this Library has already read.
   * A slot that cannot be resolved keeps both records and is flagged rather than
   * one being discarded — and an excluded migration artefact can no longer hold
   * the whole project's proposal readiness back.
   */
  const canonical = useMemo(() => {
    const evidenceByVersionId = new Map();
    for (const version of versions) {
      evidenceByVersionId.set(version.id, {
        hasProjectReport: savedReports.some((report) => report.version_id === version.id),
        hasLinkedRecords: issuedExports.some((record) => (
          record.version_id === version.id
          || (Array.isArray(record.selected_version_ids)
            && record.selected_version_ids.includes(version.id))
        )),
      });
    }
    return selectCanonicalVersions({ versions, activeVersionId, evidenceByVersionId });
  }, [versions, savedReports, issuedExports, activeVersionId]);

  // Labels resolve for EVERY record, including a preserved record the canonical
  // list excludes, so an older issued document never loses its version name.
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
    versions: canonical.versions,
    collisions: canonical.collisions,
    versionById,
    versionNameById,
    liveReports,
    reportExports,
    proposalExports,
  };
}

export default useProjectLibraryAssets;