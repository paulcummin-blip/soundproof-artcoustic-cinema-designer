import { recordSystemIncident } from './incidentRecorder.js';
import { safeDiagnostic } from './clientIncidentPolicy.js';

export function safeAuthCorrelation(value) {
  return /^[a-zA-Z0-9-]{8,100}$/.test(String(value || '')) ? String(value) : crypto.randomUUID();
}
export function expectedAuthFailure(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  return [400,401,403,404,409,422,423].includes(status);
}
export async function authIncidentAccount(service, user) {
  if (!user?.id || user.is_verified !== true) return null;
  const rows = await service.entities.User.filter({id:user.id});
  const current = rows.length === 1 ? rows[0] : null;
  if (!current?.is_verified || current.disabled === true) return null;
  if (current.account_id) return current.account_id;
  const email = String(current.email || '').trim().toLowerCase();
  if (!email) return null;
  const seats = await service.entities.AccountMembership.filter({email});
  const matches = seats.filter(m => (!m.user_id && m.status === 'pending') || m.user_id === current.id);
  return matches.length === 1 ? matches[0].account_id : null;
}
export async function recordAuthIncident(base44, {user, stage, correlationId, error, operation='getAccountAccessContext', runtimeEnvironment='deployed'}) {
  try {
    if (expectedAuthFailure(error)) return null;
    let accountId = null;
    try { accountId = await authIncidentAccount(base44.asServiceRole, user); } catch { /* retain user ID when account lookup is unavailable */ }
    const userId = user?.id || 'not_resolved';
    return await recordSystemIncident(base44, {
      component:'authentication',operation,
      error_code:'AUTHENTICATION_CONTEXT_FAILED',severity:'critical',
      account_id:accountId,operation_id:safeAuthCorrelation(correlationId),
      stage_failed:stage,grouping_scope:userId + ':' + stage,
      runtime_environment:runtimeEnvironment,
      diagnostic_summary:'Authenticated user: ' + userId + '. Failing stage: ' + stage + '.',
      error_detail:safeDiagnostic(error?.message || 'Unexpected authentication-context failure'),
      data_integrity_summary:'Account verification did not complete. Existing claim state must be checked before recovery; no membership bypass was performed.',
    });
  } catch { return null; } // Reporting must not replace the original outcome.
}
