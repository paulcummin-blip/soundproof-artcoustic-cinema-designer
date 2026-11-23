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
      if (!cancelled) {
        const result = selectFrozenReportBass(page.items, publication);
        console.info('[frozen-bass-read]', JSON.stringify({ responseShape: Array.isArray(page) ? 'array' : Object.keys(page || {}), rowCount: page?.items?.length, rows: page?.items?.map(row => ({id:row.id,status:row.status,keys:Object.keys(row.completed_by_fingerprint || {})})), publicationFingerprint: publication?.provenance?.bass_fingerprint, retained: !!publication?.bass_evidence, source: result.source, reason: result.verificationReason }));
        setState(result);
      }
    }).catch(error => {
      console.warn('[frozen-bass-read-failed]', error?.message);
      if (!cancelled) setState({ contract: null, authoritative: false, hydrationSettled: true, authorityStatus: 'ERROR', error: error.message });
    });
    return () => { cancelled = true; };
  }, [projectId, versionId, publication]);
  return state.currentFingerprint === publication?.provenance?.bass_fingerprint
    ? state : { contract: null, authoritative: false, hydrationSettled: false };
}