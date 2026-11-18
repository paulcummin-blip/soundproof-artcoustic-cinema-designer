import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Resolve old version-only links before mounting the wizard. Never let a saved
// browser draft choose a different project from an explicit entry point.
export default function useProposalEntryContext(projectId, versionId) {
  const key = [projectId || '', versionId || ''].join('|');
  const [result, setResult] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!versionId) {
      setResult({ key, projectId: projectId || null, versionId: null });
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const page = await base44.entities.ProjectVersion.filter({ id: versionId });
        const versions = Array.isArray(page) ? page : (page?.items || []);
        const version = versions.find((item) => item.id === versionId);
        if (!version?.project_id || (projectId && version.project_id !== projectId)) {
          throw new Error('The selected design version does not belong to this project. Return to Cinema Designer and open Create Client Proposal again.');
        }
        if (!cancelled) setResult({ key, projectId: version.project_id, versionId });
      } catch (error) {
        if (!cancelled) setResult({ key, error: error?.message || 'The proposal project could not be identified. Return to Cinema Designer and try again.' });
      }
    })();
    return () => { cancelled = true; };
  }, [key, projectId, versionId]);
  return result?.key === key ? { ...result, loading: false } : { loading: true };
}
