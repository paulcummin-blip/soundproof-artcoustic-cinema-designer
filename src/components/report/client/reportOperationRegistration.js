import { boundedExportRead } from '../../library/issuedDocument/issuedExportDurability.js';
const refusalStatuses = new Set([400, 401, 403, 404, 413, 415, 422, 429]);
const registeredStates = new Set(['unprepared', 'ready', 'refused', 'uploading', 'unknown', 'stored']);

// Only an unsettled request retains a promise. A transport failure is an unknown
// outcome, not evidence that registration did not commit.
export async function ensureReportRegistration({ attempt, invoke, projectId, versionId,
  online = typeof navigator === 'undefined' || navigator.onLine !== false, timeoutMs = 15000 }) {
  if (attempt.confirmed) return;
  if (!projectId || !versionId) throw new Error('Report storage needs a saved project and design version. No PDF capture was started.');
  if (!online) throw new Error('You are offline. Restore the connection, then Retry storage. No PDF capture was started.');
  const reconcile = async () => {
    try {
      const response = await boundedExportRead(() => invoke({action:'report_upload_status',operation_id:attempt.operationId}), 'Report registration reconciliation', timeoutMs);
      if (!response?.data?.error && registeredStates.has(response?.data?.state)) {attempt.confirmed=true;return true;}
    } catch { /* Failed read never grants permission to repeat an uncertain write. */ }
    return false;
  };
  if (attempt.requested && await reconcile()) return;
  if (!attempt.start && (!attempt.requested || ['refused','not_started'].includes(attempt.outcome))) {
    attempt.requested=true;
    attempt.outcome='pending';
    const request=Promise.resolve().then(()=>invoke({action:'start',operation_id:attempt.operationId,
      operation_type:'report_export',project_id:projectId,version_id:versionId,initial_stage:'readiness'}));
    attempt.start=request;
    request.then(response=>{
      attempt.result=response?.data;
      attempt.outcome=response?.data?.recorded===true?'recorded':response?.data?.registration_outcome||'unknown';
      if(response?.data?.recorded===true && response.data.operation_id===attempt.operationId)attempt.confirmed=true;
    },error=>{
      const status=Number(error?.response?.status||error?.status||0);
      attempt.outcome=refusalStatuses.has(status)?'refused':'unknown';
    }).finally(()=>{if(attempt.start===request)attempt.start=null;});
  }
  if(attempt.start) await boundedExportRead(()=>attempt.start,'Report registration',timeoutMs).catch(()=>null);
  if(attempt.confirmed || await reconcile())return;
  const definite=['refused','not_started'].includes(attempt.outcome);
  throw new Error(definite
    ? `Report registration was refused before completion. No PDF capture was started. Restore access or connection, then Retry storage with this same operation. Reference: ${attempt.operationId}`
    : `Report registration has an unconfirmed outcome. No PDF capture was started. Retry checks the original operation; another registration will not be submitted while its outcome is unknown. Reference: ${attempt.operationId}`);
}
