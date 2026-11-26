import { boundedExportRead } from '../../library/issuedDocument/issuedExportDurability.js';

// Registration is required by private storage. Monitoring progress remains
// advisory; registration must be confirmed before PDF capture starts.
export async function ensureReportRegistration({ attempt, invoke, projectId, versionId,
  online = typeof navigator === 'undefined' || navigator.onLine !== false, timeoutMs = 15000 }) {
  if (attempt.confirmed) return;
  if (!projectId || !versionId) throw new Error('Report storage needs a saved project and design version. No PDF capture was started.');
  if (!online) throw new Error('You are offline. Restore the connection, then Retry storage. No PDF capture was started.');
  if (!attempt.start) {
    // Retain the single start request even if its browser acknowledgement fails.
    attempt.start = Promise.resolve().then(() => invoke({ action: 'start',
      operation_id: attempt.operationId, operation_type: 'report_export',
      project_id: projectId, version_id: versionId, initial_stage: 'readiness',
    })).then(response => response?.data, () => null);
  }
  const started = await boundedExportRead(() => attempt.start, 'Report registration', timeoutMs).catch(() => null);
  if (started?.recorded === true && started.operation_id === attempt.operationId) {
    attempt.confirmed = true;
    return;
  }
  // Existing status checks exactly one operation and applies project/version
  // ownership checks before returning even an unprepared upload receipt.
  const status = await boundedExportRead(() => invoke({ action: 'report_upload_status',
    operation_id: attempt.operationId }), 'Report registration reconciliation', timeoutMs).catch(() => null);
  if (status?.data?.state === 'unprepared' && !status.data.error) {
    attempt.confirmed = true;
    return;
  }
  throw new Error(`Report storage registration could not be confirmed. No PDF capture was started. Retry checks this same operation; if it remains unavailable, administrator reconciliation is required. Reference: ${attempt.operationId}`);
}
