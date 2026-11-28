/**
 * rsApprovalAuthority.js (shared)
 * --------------------------------
 * Pure authority for the Richer Sounds internal (RS) approval dimension
 * introduced by RS-01, plus the dual-approval gate every Sound Proof
 * activation boundary must satisfy for ordinary Richer Sounds stores.
 *
 * Leaf module: imports nothing. No SDK, no clock, no writes. Every caller —
 * accountAccessAuthority, manageSoundProofAccess, portalSoundProofAccess,
 * createProfessionalProject, readRicherSoundsAdmin, richerSoundsAdminAuthority,
 * and the admin frontend — shares these identical rules.
 *
 * MODEL
 * -----
 * soundproof_eligible remains the SOLE Master Admin approval authority —
 * unchanged. rs_approval_status is a SEPARATE, second internal approval that
 * the Custom Install - 93 administrator (or a Master Admin) sets on ordinary
 * Richer Sounds stores. It never replaces or overlaps Sound Proof eligibility.
 *
 * Custom Install - 93 (the central master account, resolved dynamically from
 * its active Partner Portal link carrying trading number "93" with a stamped
 * portal_dealer_account_id) is EXEMPT from the RS approval dimension entirely:
 * it carries no rs_approval_status and the dual-approval gate skips it. It
 * still requires normal Sound Proof eligibility, activation and membership.
 *
 * Only ordinary RICHER_SOUNDS accounts (dealer_group === RICHER_SOUNDS and
 * NOT the 93 master) are subject to the dual-approval gate. Every other
 * dealer group (PREMIUM_PARTNER, OTHER_DEALER, INTERNATIONAL, INTERNAL,
 * PROFESSIONAL) keeps its existing behaviour untouched.
 */

export const RS_APPROVAL_STATES = Object.freeze({
  AWAITING: 'awaiting_approval',
  APPROVED: 'approved',
  SUSPENDED: 'suspended',
});

export const RICHER_SOUNDS_DEALER_GROUP = 'RICHER_SOUNDS';
export const RICHER_SOUNDS_MASTER_TRADING_NUMBER = '93';

/**
 * Normalise a stored rs_approval_status value to one of the canonical states.
 * A missing or unrecognised value is AWAITING — this is the honest default for
 * the 52 ordinary accounts that predate the field, and it is never silently
 * promoted to approved. Null is preserved as awaiting.
 */
export function normaliseRsApprovalStatus(value) {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === RS_APPROVAL_STATES.APPROVED) return RS_APPROVAL_STATES.APPROVED;
  if (candidate === RS_APPROVAL_STATES.SUSPENDED) return RS_APPROVAL_STATES.SUSPENDED;
  return RS_APPROVAL_STATES.AWAITING;
}

/**
 * True only for the Custom Install - 93 central master account. 93 is
 * identified dynamically (by masterAccountId resolved from its active Partner
 * Portal link) rather than by a stored flag, so the exemption travels with the
 * account identity and never needs a field to maintain.
 */
export function isRicherSoundsCentralAdministrator(accountId, masterAccountId) {
  return Boolean(masterAccountId)
    && Boolean(accountId)
    && String(accountId) === String(masterAccountId);
}

/**
 * Is this account an ordinary Richer Sounds store (subject to the RS approval
 * dimension and the dual-approval gate)? True only for RICHER_SOUNDS accounts
 * that are NOT the 93 central master. Non-RS groups and 93 itself return false.
 */
export function isOrdinaryRicherSoundsStore(account, masterAccountId) {
  if (!account) return false;
  if (account.dealer_group !== RICHER_SOUNDS_DEALER_GROUP) return false;
  return !isRicherSoundsCentralAdministrator(account.id, masterAccountId);
}

/**
 * Derive the RS approval display state for a Richer Sounds row.
 * Returns { label, tone } or null when the account is not an ordinary RS store
 * (93 and non-RS groups carry no RS approval badge).
 *
 * Tones mirror the Access-column design:
 *   approved          -> ok      (green, "RS Approved")
 *   awaiting_approval -> warn    (warm, "RS Awaiting Approval")
 *   suspended         -> danger  (red, "RS Suspended")
 */
export function rsApprovalState(account, masterAccountId) {
  if (!isOrdinaryRicherSoundsStore(account, masterAccountId)) return null;
  const status = normaliseRsApprovalStatus(account?.rs_approval_status);
  if (status === RS_APPROVAL_STATES.APPROVED) {
    return { label: 'RS Approved', tone: 'ok', status };
  }
  if (status === RS_APPROVAL_STATES.SUSPENDED) {
    return { label: 'RS Suspended', tone: 'danger', status };
  }
  return { label: 'RS Awaiting Approval', tone: 'warn', status };
}

/**
 * The dual-approval gate. Returns true when the account is ALLOWED to activate
 * and use Sound Proof from the approval dimension's perspective.
 *
 * - 93 (central administrator) is exempt: always passes (it still must pass the
 *   separate Sound Proof eligibility + activation + membership checks).
 * - Ordinary Richer Sounds stores require BOTH Sound Proof eligibility
 *   (soundproof_eligible === true, the existing Master Admin approval) AND RS
 *   approval (rs_approval_status === approved). Awaiting or suspended fails.
 * - Every other dealer group is unaffected: the gate passes (their access
 *   continues to be governed by the existing Sound Proof eligibility check).
 *
 * This is a pure approval check. It does not evaluate account.status, expiry,
 * membership, verification or the 90-day term — those remain the
 * responsibility of the existing activation checks that call this gate.
 */
export function isRsDualApprovalSatisfied(account, masterAccountId) {
  if (!account) return false;
  if (!isOrdinaryRicherSoundsStore(account, masterAccountId)) return true;
  if (account.soundproof_eligible !== true) return false;
  return normaliseRsApprovalStatus(account.rs_approval_status) === RS_APPROVAL_STATES.APPROVED;
}

/**
 * A denial reason for the gate, for audit and incident recording. Null when
 * the gate passes.
 */
export function rsDualApprovalDenialReason(account, masterAccountId) {
  if (!account) return 'ACCOUNT_NOT_FOUND';
  if (!isOrdinaryRicherSoundsStore(account, masterAccountId)) return null;
  if (account.soundproof_eligible !== true) return 'SOUNDPROOF_NOT_APPROVED';
  const status = normaliseRsApprovalStatus(account.rs_approval_status);
  if (status === RS_APPROVAL_STATES.SUSPENDED) return 'RS_APPROVAL_SUSPENDED';
  if (status !== RS_APPROVAL_STATES.APPROVED) return 'RS_APPROVAL_AWAITING';
  return null;
}