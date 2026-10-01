/**
 * Durable diagnostic trail for Partner Portal launches.
 *
 * One append-only PortalLaunchDiagnostic row per launch event, written with
 * the service role. Logging is a side observation only: it must never change
 * the launch outcome, so every write is best-effort and the helper never
 * throws.
 */

export const PORTAL_LAUNCH_DIAGNOSTIC_EVENTS = Object.freeze({
  NO_PORTAL_TOKEN: 'NO_PORTAL_TOKEN',
  PROFILE_MISMATCH: 'PROFILE_MISMATCH',
  PORTAL_MEMBERSHIP_EMAIL_MISMATCH: 'PORTAL_MEMBERSHIP_EMAIL_MISMATCH',
  PORTAL_IDENTITY_CREATED: 'PORTAL_IDENTITY_CREATED',
  MEMBERSHIP_CLAIMED: 'MEMBERSHIP_CLAIMED',
  MEMBERSHIP_CLAIM_FAILED: 'MEMBERSHIP_CLAIM_FAILED',
});

export const PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
  FALLBACK_PILOT_BINDING: 'fallback_pilot_binding',
});

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function email(value) {
  const normalised = String(value || '').trim().toLowerCase();
  return normalised || null;
}

/**
 * Append one durable launch diagnostic row.
 *
 * @param {object} service - base44.asServiceRole
 * @param {object} entry
 * @param {string} entry.event - Diagnostic code (see PORTAL_LAUNCH_DIAGNOSTIC_EVENTS).
 * @param {string} [entry.outcome] - success | failure | fallback_pilot_binding
 * @param {string} [entry.reason] - Machine reason reported to the caller.
 * @returns {Promise<object|null>} the created row, or null when logging failed.
 */
export async function recordPortalLaunchDiagnostic(service, {
  event,
  outcome = PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
  reason = null,
  base44User = null,
  binding = null,
  accountId = null,
  membershipId = null,
  details = null,
} = {}) {
  if (!hasText(event)) return null;

  try {
    return await service.entities.PortalLaunchDiagnostic.create({
      event: String(event).trim(),
      outcome: hasText(outcome) ? String(outcome).trim() : PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
      reason: hasText(reason) ? String(reason).trim() : null,
      account_id: hasText(accountId) ? String(accountId).trim() : null,
      base44_user_id: hasText(base44User?.id) ? String(base44User.id).trim() : null,
      base44_user_email: email(base44User?.email),
      portal_subject: hasText(binding?.user_id) ? String(binding.user_id).trim() : null,
      portal_profile_id: hasText(binding?.profile_id) ? String(binding.profile_id).trim() : null,
      portal_session_id: hasText(binding?.session_id) ? String(binding.session_id).trim() : null,
      membership_id: hasText(membershipId) ? String(membershipId).trim() : null,
      occurred_at: new Date().toISOString(),
      details: details && typeof details === 'object' ? details : null,
    });
  } catch {
    // Diagnostics are never allowed to break a launch.
    return null;
  }
}