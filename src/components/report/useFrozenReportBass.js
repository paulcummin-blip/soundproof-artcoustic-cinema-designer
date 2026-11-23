import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { subscribeProjectAnalysisCacheInvalidation } from '@/components/state/projectReadCache';
import selectFrozenReportBass from './frozenReportBass';

const empty = { contract: null, authoritative: false, hydrationSettled: false };
/** Read only the exact frozen publication. Durable saves notify this reader. */
export default function useFrozenReportBass(projectId, versionId, publication) {
  const [state, setState] = useState(empty);
  const [attempt, setAttempt] = useState(0);
  const fingerprint = publication?.provenance?.bass_fingerprint;
  const key = projectId + '::' + versionId + '::' + fingerprint;
  useEffect(() => subscribeProjectAnalysisCacheInvalidation(projectId, versionId, () => setAttempt(n => n + 1)),
    [projectId, versionId]);
  useEffect(() => {
    let cancelled = false;
    if (!projectId || !versionId || !publication) return;
    setState({ ...empty, key, currentFingerprint: fingerprint });
    // Select the needed fields only: publications and target banks can be many MB.
    base44.entities.ProjectAnalysisCache.filter({ project_id: projectId, version_id: versionId },
      '-updated_date', 100, 0, ['id', 'project_id', 'version_id', 'status', 'current_fingerprint', 'completed_by_fingerprint'])
      .then(rows => {
        if (!Array.isArray(rows) || rows.length === 100) throw new Error('Saved bass evidence could not be completely read.');
        if (!cancelled) {
          const result = selectFrozenReportBass(rows, publication);
          console.info('[frozen-bass-evidence]', JSON.stringify({ key, source: result.source, reason: result.verificationReason, publication: publication.fingerprint, curves: Object.fromEntries(['roomResponseCurve','physicalRawResponseCurve','postEqRspCurve','sourceCapabilityCurves'].map(k => [k, result.contract?.graphPayload?.[k]?.length || 0])) }));
          setState({ ...result, key });
          if (!result.authoritative) console.warn('[frozen-bass-read]', result.verificationReason);
        }
      }).catch(error => {
        if (!cancelled) setState({ ...empty, key, currentFingerprint: fingerprint, hydrationSettled: true,
          authorityStatus: 'ERROR', verificationReason: 'read-failed', error: error.message });
      });
    return () => { cancelled = true; };
  }, [projectId, versionId, publication, attempt, fingerprint, key]);
  return state.key === key ? state : empty;
}
