/**
 * useProjectWorkflowAssets
 * -----------------------
 * Reads all stored assets for one project — issued PDFs (ProjectAssetExport)
 * and uploaded images (ProposalAsset) — and groups them by design version.
 *
 * Used by the Project Assets section on the Projects page and the Room
 * Designer header for v2 projects. Only assets that actually exist (with a
 * file_uri or file_url) are listed; nothing is regenerated or inferred.
 */
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { subscribeIssuedExportStored } from '@/components/library/issuedExportSignal';

const asItems = (page) => (Array.isArray(page) ? page : (page?.items || []));

export function useProjectWorkflowAssets({ projectId = null, enabled = true } = {}) {
  const [exports, setExports] = useState([]);
  const [images, setImages] = useState([]);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // Lightweight totals so a collapsed section can show the asset count without
  // expanding first. Counts are fetched eagerly (even when full records are
  // not); when full records load they are re-derived for exact parity with the
  // expanded list.
  const [exportCount, setExportCount] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [countLoaded, setCountLoaded] = useState(false);
  useEffect(() => {
    setExports([]); setImages([]); setVersions([]); setLoaded(false); setError(null);
    setExportCount(0); setImageCount(0); setCountLoaded(false);
  }, [projectId]);
  useEffect(() => subscribeIssuedExportStored((id) => {
    if (id === projectId) setRevision((n) => n + 1);
  }), [projectId]);

  useEffect(() => {
    if (!projectId) {
      setExports([]);
      setImages([]);
      setVersions([]);
      setLoading(false);
      setExportCount(0); setImageCount(0); setCountLoaded(false);
      return;
    }
    let cancelled = false;

    // Always fetch lightweight counts so the heading can show the total
    // regardless of whether the full record list has been requested.
    (async () => {
      try {
        const [ec, ic] = await Promise.all([
          base44.entities.ProjectAssetExport.count({ project_id: projectId }),
          base44.entities.ProposalAsset.count({ project_id: projectId }),
        ]);
        if (!cancelled) {
          setExportCount(Number(ec) || 0);
          setImageCount(Number(ic) || 0);
          setCountLoaded(true);
        }
      } catch (err) {
        console.warn('[useProjectWorkflowAssets] count failed:', err);
      }
    })();

    if (!enabled) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [exportPage, imagePage, versionPage] = await Promise.all([
          base44.entities.ProjectAssetExport.filter(
            { project_id: projectId },
            { sort: '-exported_at', limit: 200 },
          ),
          base44.entities.ProposalAsset.filter({ project_id: projectId }),
          base44.entities.ProjectVersion.filter(
            { project_id: projectId },
            { sort: 'version_number', limit: 20 },
          ),
        ]);
        if (!cancelled) {
          const expItems = asItems(exportPage);
          const imgItems = asItems(imagePage);
          setExports(expItems);
          setImages(imgItems);
          setVersions(asItems(versionPage));
          // Derive counts from the loaded records so the heading total always
          // matches exactly what the expanded list shows.
          setExportCount(expItems.filter((e) => e?.file_uri || e?.file_url).length);
          setImageCount(imgItems.filter((i) => i?.file_url).length);
          setCountLoaded(true);
          setLoaded(true);
        }
      } catch (err) {
        console.warn('[useProjectWorkflowAssets] read failed:', err);
        if (!cancelled) {
          setError('Stored assets could not be loaded. Please retry.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, revision, enabled]);

  const totalCount = exportCount + imageCount;
  return {
    exports, images, versions, loading, loaded, error,
    refresh: () => setRevision((n) => n + 1),
    exportCount, imageCount, totalCount, countLoaded,
  };
}

export default useProjectWorkflowAssets;