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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  REPORT_DOCUMENT_TYPES,
  PROPOSAL_DOCUMENT_TYPES,
} from '@/components/library/issuedDocument/issuedDocumentTypes';
import { collapseLiveReports, markSuperseded } from '@/components/library/librarySourceStatus';
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

  const load = useCallback(async () => {
    if (!projectId) {
      setVersions([]);
      setSavedReports([]);
      setIssuedExports([]);
      setLoading(false);
      return;
    }

    setLoading(true);
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
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const versionById = useMemo(
    () => new Map(versions.map((version) => [version.id, version])),
    [versions],
  );
  const versionNameById = useMemo(() => buildVersionNameMap(versions), [versions]);

  /**
   * ONE row per project version and report type: the newest saved report for
   * that version and type. A report regenerated five times still produces one
   * row — the earlier generations are never listed — and the rows read in the
   * order the report types are declared.
   */
  const liveReports = useMemo(() => collapseLiveReports(savedReports)
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
  [savedReports]);

  const markedExports = useMemo(() => markSuperseded(issuedExports), [issuedExports]);

  const reportExports = useMemo(
    () => markedExports.filter(({ record }) => REPORT_DOCUMENT_TYPES.includes(record.document_type)),
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