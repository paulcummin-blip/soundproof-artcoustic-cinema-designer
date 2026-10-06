/**
 * Durable diagnostic trail for Partner Portal launches.
 *
 * One append-only PortalLaunchDiagnostic row per launch event, written with
 * the service role. Logging is a side observation only: it must never change
 * the launch outcome, so every write is best-effort and the helper never
 * throws.
 */

import { PORTAL_TARGET } from './pilotPortalConstants.js';

export const PORTAL_LAUNCH_DIAGNOSTIC_EVENTS = Object.freeze({
  NO_PORTAL_TOKEN: 'NO_PORTAL_TOKEN',
  PROFILE_MISMATCH: 'PROFILE_MISMATCH',
  PORTAL_MEMBERSHIP_EMAIL_MISMATCH: 'PORTAL_MEMBERSHIP_EMAIL_MISMATCH',
  PORTAL_IDENTITY_CREATED: 'PORTAL_IDENTITY_CREATED',
  MEMBERSHIP_CLAIMED: 'MEMBERSHIP_CLAIMED',
  MEMBERSHIP_CLAIM_FAILED: 'MEMBERSHIP_CLAIM_FAILED',
  // Launch lifecycle. Every gate between the consumed portal binding and the
  // completed launch records one of these before it returns or throws, so a
  // launch that consumes its pass and then stops can never leave the trail
  // empty — the binding path states which gate it stopped at and why.
  LAUNCH_STARTED: 'LAUNCH_STARTED',
  LAUNCH_COMPLETE: 'LAUNCH_COMPLETE',
  LAUNCH_REJECTED: 'LAUNCH_REJECTED',
  BRIDGE_CONSUME_ATTEMPTED: 'BRIDGE_CONSUME_ATTEMPTED',
  BRIDGE_CONSUME_RETURNED: 'BRIDGE_CONSUME_RETURNED',
  BRIDGE_RESPONSE_INVALID: 'BRIDGE_RESPONSE_INVALID',
  BINDING_MISSING: 'BINDING_MISSING',
  BINDING_EXPIRED: 'BINDING_EXPIRED',
  BINDING_TARGET_MISMATCH: 'BINDING_TARGET_MISMATCH',
  BINDING_PORTAL_USER_MISMATCH: 'BINDING_PORTAL_USER_MISMATCH',
  BINDING_PROFILE_MISMATCH: 'BINDING_PROFILE_MISMATCH',
  EXTERNAL_LINK_NOT_FOUND: 'EXTERNAL_LINK_NOT_FOUND',
  EXTERNAL_LINK_AMBIGUOUS: 'EXTERNAL_LINK_AMBIGUOUS',
  PILOT_BINDING_VERIFIED: 'PILOT_BINDING_VERIFIED',
  PILOT_CLAIM_ATTEMPTED: 'PILOT_CLAIM_ATTEMPTED',
  PILOT_CLAIM_SUCCEEDED: 'PILOT_CLAIM_SUCCEEDED',
  PILOT_CLAIM_FAILED: 'PILOT_CLAIM_FAILED',
  PORTAL_IDENTITY_CREATE_ATTEMPTED: 'PORTAL_IDENTITY_CREATE_ATTEMPTED',
  PORTAL_IDENTITY_CONFLICT: 'PORTAL_IDENTITY_CONFLICT',
});

export const PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
  FALLBACK_PILOT_BINDING: 'fallback_pilot_binding',
});

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function boundText(value) {
  return hasText(value) ? String(value).trim() : null;
}

/**
 * Which app environment recorded this row. A launch rejected by the wrong
 * environment is only visible if the environment is on the row.
 */
export function launchEnvironment() {
  const appId = globalThis.Deno?.env?.get?.('BASE44_APP_ID');
  return {
    app_id: boundText(appId),
    function_name: 'consumePortalLaunch',
    target: PORTAL_TARGET,
  };
}

/**
 * Non-reversible fingerprint of a single-use launch pass.
 *
 * The pass itself is a credential: it is never written to a diagnostic row,
 * logged, or returned. The fingerprint exists only so the same launch attempt
 * can be correlated with the Portal side.
 */
export function launchPassFingerprint(value) {
  if (!hasText(value)) return null;
  const text = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `pass:${hash.toString(16).padStart(8, '0')}:${text.length}`;
}

/**
 * The shared launch-attempt envelope, present on every launch row: what was
 * received, what was expected, whether they matched, and what the app could
 * observe at that point. Secrets are never included — the launch pass is
 * reduced to its fingerprint and no token is ever accepted here.
 */
export function launchDiagnosticContext({
  launchPass = null,
  binding = null,
  expectedSubject = null,
  expectedProfileId = null,
  externalLinkCount = null,
  pendingAdminSeatCount = null,
  failureReason = null,
  context = null,
} = {}) {
  const receivedSubject = boundText(binding?.user_id);
  const receivedProfileId = boundText(binding?.profile_id);
  const expected = boundText(expectedSubject);
  const expectedProfile = boundText(expectedProfileId);
  return {
    environment: launchEnvironment(),
    launch_pass_fingerprint: launchPassFingerprint(launchPass),
    portal_subject_received: receivedSubject,
    portal_profile_id_received: receivedProfileId,
    expected_pilot_subject: expected,
    expected_pilot_profile_id: expectedProfile,
    portal_subject_matched: expected && receivedSubject ? receivedSubject === expected : null,
    portal_profile_matched: expectedProfile && receivedProfileId
      ? receivedProfileId === expectedProfile
      : null,
    external_link_count: Number.isFinite(externalLinkCount) ? externalLinkCount : null,
    pending_admin_seat_count: Number.isFinite(pendingAdminSeatCount) ? pendingAdminSeatCount : null,
    failure_reason: boundText(failureReason),
    ...(context && typeof context === 'object' ? context : {}),
  };
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
  launchPass = null,
  expectedSubject = null,
  expectedProfileId = null,
  externalLinkCount = null,
  pendingAdminSeatCount = null,
  failureReason = null,
  context = null,
} = {}) {
  if (!hasText(event)) return null;

  const mergedDetails = launchDiagnosticContext({
    launchPass,
    binding,
    expectedSubject,
    expectedProfileId,
    externalLinkCount,
    pendingAdminSeatCount,
    failureReason,
    context,
  });
  if (details && typeof details === 'object') Object.assign(mergedDetails, details);

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
      details: mergedDetails,
    });
  } catch {
    // Diagnostics are never allowed to break a launch.
    return null;
  }
}