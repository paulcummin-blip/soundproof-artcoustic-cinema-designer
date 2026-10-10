import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

import selectFrozenReportBass from './frozenReportBass';
/** Graphs follow the report's publication pointer, never the current bass store. */
export default function useFrozenReportBass(projectId, versionId, publication) {
  const [state, setState] = useState({ contract: null, authoritative: false, hydrationSettled: false });
  useEffect(() => {
    let cancelled = false;
    if (!projectId || !versionId || !publication) return;
    setState({ contract: null, authoritative: false, hydrationSettled: false });
    base44.entities.ProjectAnalysisCache.filter({ project_id: projectId, version_id: versionId },
      { limit: 50 }).then(page => {
      if (!cancelled) setState(selectFrozenReportBass(page.items, publication));
    }).catch(error => {
      if (!cancelled) setState({ contract: null, authoritative: false, hydrationSettled: true, authorityStatus: 'ERROR', error: error.message });
    });
    return () => { cancelled = true; };
  }, [projectId, versionId, publication]);
  return state.currentFingerprint === publication?.provenance?.bass_fingerprint
    ? state : { contract: null, authoritative: false, hydrationSettled: false };
}