import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { reportFailureCode } from './reportFailureSignal';
const reported = new Set();
const pending = new Set();
export default function useReportFailureMonitoring({ projectId, versionId, reportType, loading, readFailed, blocked, hasSavedEvidence }) {
  const code = reportFailureCode({ loading, readFailed, blocked, hasSavedEvidence });
  useEffect(() => {
    if (!projectId || !versionId || !code) return;
    const key = [projectId, versionId, reportType, code].join('::');
    if (reported.has(key) || pending.has(key)) return;
    // Allow a transient restore/publication handoff to settle before reporting.
    const timer = setTimeout(() => {
      if (reported.has(key) || pending.has(key)) return;
      pending.add(key);
      base44.functions.invoke('recordReportReadinessIncident', {
        project_id: projectId, version_id: versionId, report_type: reportType, error_code: code,
      }).then(result => {
        if (result?.data?.recorded === true || result?.recorded === true) reported.add(key);
      }).catch(() => {}).finally(() => pending.delete(key));
    }, 1500);
    return () => clearTimeout(timer);
  }, [projectId, versionId, reportType, code]);
}
