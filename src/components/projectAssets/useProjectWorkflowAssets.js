/**
 * useProjectWorkflowAssets
 * -----------------------
 * Reads all stored assets for one project — issued PDFs (ProjectAssetExport)
 * and uploaded images (ProposalAsset) — and groups them by design version.
 *
 * Used by the Project Assets section on the Projects page and the Room
 * Designer header for v2 projects. Only assets that actually exist (with a
 * file_uri or file_url) are listed; nothing is regenerated or inferred.
 *
 * Refresh reliability: a notification arriving while a read is already in
 * flight is retained and processed once the active read completes, so a
 * stored document or image is never missed. Multiple notifications coalesce
 * into a single follow-up read. An older response can never populate a newly
 * selected project: results are committed only when the project identity
 * captured at read time still matches the live projectId.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { subscribeIssuedExportStored } from '@/components/library/issuedExportSignal';
import {
  createProjectAssetsRefreshState,
  requestRead,
  onReadEnd,
  consumePendingSilent,
  requestCount,
  onCountEnd,
} from '@/components/library/projectAssetsRefreshState';

const asItems = (page) => (Array.isArray(page) ? page : (page?.items || []));

export function useProjectWorkflowAssets({ projectId = null, enabled = true } = {}) {
  const [exports, setExports] = useState([]);
  const [images, setImages] = useState([]);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // Lightweight totals so a collapsed section can show the asset count without
  // expanding first. Counts are fetched eagerly (even when full records are
  // not); when full records load they are re-derived for exact parity with the
  // expanded list.
  const [exportCount, setExportCount] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [countLoaded, setCountLoaded] = useState(false);

  // The current project identity is held in a ref (updated on every render)
  // so the stable useCallback closures always read the live project. The
  // state machine's activeProjectId is managed solely by requestRead /
  // requestCount so the visit generation is bumped correctly on every switch.
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // Guards against overlapping reads, obsolete responses and excessive count
  // requests, enforced by the pure state machine both asset readers share.
  const refreshStateRef = useRef(createProjectAssetsRefreshState());

  /**
   * Read the project's full asset records. Coalesces refresh requests: if a
   * read is already in flight, a new request is retained and processed once
   * the active read completes, so a notification is never discarded. An
   * obsolete response (wrong project or earlier visit) is discarded by the
   * state machine's generation check and never written to state.
   */
  const load = useCallback(async ({ silent = false } = {}) => {
    const currentProjectId = projectIdRef.current;
    if (!currentProjectId) {
      setExports([]);
      setImages([]);
      setVersions([]);
      setLoading(false);
      setLoaded(false);
      setError(null);
      setExportCount(0);
      setImageCount(0);
      setCountLoaded(false);
      return;
    }
    const { shouldRun, generation } = requestRead(refreshStateRef.current, { projectId: currentProjectId, silent });
    if (!shouldRun) return;
    if (!silent) setLoading(true);
    setError(null);
    let resultData = null;
    let caughtError = null;
    try {
      const [exportPage, imagePage, versionPage] = await Promise.all([
        base44.entities.ProjectAssetExport.filter(
          { project_id: currentProjectId },
          { sort: '-exported_at', limit: 200 },
        ),
        base44.entities.ProposalAsset.filter({ project_id: currentProjectId }),
        base44.entities.ProjectVersion.filter(
          { project_id: currentProjectId },
          { sort: 'version_number', limit: 20 },
        ),
      ]);
      resultData = { exportPage, imagePage, versionPage };
    } catch (err) {
      caughtError = err;
    }
    const { shouldCommit, pendingRefresh } = onReadEnd(refreshStateRef.current, { projectId: currentProjectId, generation });
    if (shouldCommit) {
      if (resultData) {
        const expItems = asItems(resultData.exportPage);
        const imgItems = asItems(resultData.imagePage);
        setExports(expItems);
        setImages(imgItems);
        setVersions(asItems(resultData.versionPage));
        // Derive counts from the loaded records so the heading total always
        // matches exactly what the expanded list shows.
        setExportCount(expItems.filter((e) => e?.file_uri || e?.file_url).length);
        setImageCount(imgItems.filter((i) => i?.file_url).length);
        setCountLoaded(true);
        setLoaded(true);
      } else {
        console.warn('[useProjectWorkflowAssets] read failed:', caughtError);
        setError('Stored assets could not be loaded. Please retry.');
      }
      setLoading(false);
    }
    if (pendingRefresh) {
      load({ silent: consumePendingSilent(refreshStateRef.current) });
    }
  }, []);

  /**
   * Lightweight counts so a collapsed section can show the total without
   * fetching every record. Coalesced: five notifications during one count
   * produce one follow-up count, not five. An obsolete count (wrong project
   * or earlier visit) is discarded by the generation check.
   */
  const refreshCounts = useCallback(async () => {
    const currentProjectId = projectIdRef.current;
    if (!currentProjectId) {
      setExportCount(0);
      setImageCount(0);
      setCountLoaded(false);
      return;
    }
    const { shouldRun, generation } = requestCount(refreshStateRef.current, { projectId: currentProjectId });
    if (!shouldRun) return;
    try {
      const [ec, ic] = await Promise.all([
        base44.entities.ProjectAssetExport.count({ project_id: currentProjectId }),
        base44.entities.ProposalAsset.count({ project_id: currentProjectId }),
      ]);
      const { shouldCommit, pendingRefresh } = onCountEnd(refreshStateRef.current, { projectId: currentProjectId, generation });
      if (shouldCommit) {
        setExportCount(Number(ec) || 0);
        setImageCount(Number(ic) || 0);
        setCountLoaded(true);
      }
      if (pendingRefresh) {
        refreshCounts();
      }
    } catch (err) {
      onCountEnd(refreshStateRef.current, { projectId: currentProjectId, generation });
      console.warn('[useProjectWorkflowAssets] count failed:', err);
    }
  }, []);

  // Reset state immediately on project switch so assets from the previous
  // project never appear while the new project's read is outstanding.
  useEffect(() => {
    setExports([]);
    setImages([]);
    setVersions([]);
    setLoaded(false);
    setError(null);
    setExportCount(0);
    setImageCount(0);
    setCountLoaded(false);
    setLoading(true);
  }, [projectId]);

  // Read on project switch or when the section is expanded. The full record
  // read only runs when enabled; counts always run.
  useEffect(() => {
    refreshCounts();
    if (enabled) {
      load();
    } else {
      setLoading(false);
    }
  }, [projectId, enabled, load, refreshCounts]);

  // A document or image stored while this section is open is listed as soon
  // as it exists. The notification is project-scoped and coalesced: many
  // notifications during one read produce a single follow-up read, and many
  // during one count produce a single follow-up count.
  useEffect(() => subscribeIssuedExportStored((storedProjectId) => {
    if (!projectIdRef.current || storedProjectId !== projectIdRef.current) return;
    refreshCounts();
    if (enabled) load({ silent: true });
  }), [enabled, load, refreshCounts]);

  const totalCount = exportCount + imageCount;
  return {
    exports, images, versions, loading, loaded, error,
    refresh: () => { refreshCounts(); if (enabled) load({ silent: true }); },
    exportCount, imageCount, totalCount, countLoaded,
  };
}

export default useProjectWorkflowAssets;