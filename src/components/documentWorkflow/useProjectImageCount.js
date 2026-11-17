/**
 * useProjectImageCount
 * ---------------------
 * Reads the count of uploaded images (ProposalAsset records) for one project,
 * for the Documents & Assets workflow panel's "Uploaded Images" entry.
 *
 * Counts every ProposalAsset for the project — both project-wide and
 * version-specific uploads — without counting generated PDFs (those live in
 * ProjectAssetExport). ProposalAsset requires file_url, so every record is a
 * real uploaded image; no duplicate references are counted.
 *
 * Refreshes on mount and when the window regains focus, so a designer who
 * clicks "Manage / Upload Images", uploads on the Project Library page and
 * returns sees the updated count. No signal is emitted into the upload flow.
 */
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export function useProjectImageCount(projectId) {
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setCount(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const n = await base44.entities.ProposalAsset.count({ project_id: projectId });
        if (!cancelled) setCount(typeof n === 'number' ? n : 0);
      } catch (err) {
        console.warn('[useProjectImageCount] read failed:', err);
        if (!cancelled) setCount(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, tick]);

  // Re-fetch when the window regains focus (covers uploads done on the
  // Project Library page in another tab, or after navigating back).
  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return { count, loading, refresh: () => setTick((t) => t + 1) };
}

export default useProjectImageCount;