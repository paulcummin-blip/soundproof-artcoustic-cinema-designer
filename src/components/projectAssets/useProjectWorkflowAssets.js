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
  useEffect(() => subscribeIssuedExportStored((id) => {
    if (id === projectId) setRevision((n) => n + 1);
  }), [projectId]);

  useEffect(() => {
    if (!projectId) {
      setExports([]);
      setImages([]);
      setVersions([]);
      setLoading(false);
      return;
    }
    if (!enabled) return;
    let cancelled = false;
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
          setExports(asItems(exportPage));
          setImages(asItems(imagePage));
          setVersions(asItems(versionPage));
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

  return { exports, images, versions, loading, loaded, error, refresh: () => setRevision((n) => n + 1) };
}

export default useProjectWorkflowAssets;