/**
 * useProjectLibraryImages
 * ----------------------
 * The images ONE project already holds in its Project Library, read for the
 * surfaces that only need to know what is there.
 *
 * This is deliberately the narrowest possible read: one project's image records,
 * filtered on the project, and nothing else — no reports, no issued documents, no
 * account-wide assets. It is not a second library and it holds no authority; the
 * selection of WHICH images represent a design is decided by the shared visual
 * context authority, never here.
 *
 * A failure is an empty list, never an error shown to the designer: this read sits
 * beside report generation and must never be able to hold anything up.
 */

import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const asItems = (result) => (Array.isArray(result) ? result : (result?.items || []));

export function useProjectLibraryImages({ projectId = null } = {}) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(Boolean(projectId));

  useEffect(() => {
    if (!projectId) {
      setAssets([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const result = await base44.entities.ProposalAsset.filter({ project_id: projectId });
        if (!cancelled) setAssets(asItems(result));
      } catch (error) {
        console.warn('[ProjectLibraryImages] Could not read this project’s images:', error);
        if (!cancelled) setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  return { assets, loading };
}

export default useProjectLibraryImages;