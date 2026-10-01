/**
 * Admin-safe copy for a rejected Partner Portal launch.
 *
 * A launch that consumes its binding and is then rejected must name the gate
 * that rejected it. One generic access failure is not enough to act on: the
 * designer needs to know whether the portal profile, the portal user, the
 * expiry, the dealer link or the app environment rejected the launch.
 *
 * Pure module: no React, no I/O.
 */

const REASON_DETAIL = {
  // Launch binding gate
  PORTAL_BINDING_PROFILE_MISMATCH: 'Portal profile mismatch',
  PORTAL_BINDING_PORTAL_USER_MISMATCH: 'Portal user mismatch',
  PORTAL_BINDING_TARGET_MISMATCH: 'Launch consumed by a different app or environment',
  PORTAL_BINDING_EXPIRED: 'Binding expired',
  PORTAL_BINDING_MISSING: 'Launch binding incomplete',
  PORTAL_BINDING_SESSION_MISSING: 'Launch binding carries no live Portal session',
  PORTAL_BINDING_ACCOUNT_NAME_MISSING: 'Launch binding carries no Portal account name',
  PORTAL_BINDING_EXPIRY_MISSING: 'Launch binding carries no expiry',

  // Bridge envelope
  PORTAL_SESSION_REJECTED: 'the Portal bridge rejected the launch pass',
  PORTAL_BRIDGE_URL_UNAVAILABLE: 'the launch bridge is not configured for this environment',
  PORTAL_BRIDGE_URL_INVALID: 'the launch bridge is not configured for this environment',
  PROVIDER_TOKEN_UNAVAILABLE: 'no verified Portal token was available for this launch',
  PROVIDER_ACCESS_TOKEN_UNAVAILABLE: 'no verified Portal token was available for this launch',
  LAUNCH_PASS_INVALID: 'the launch pass was malformed',
  PORTAL_TARGET_MISMATCH: 'Launch consumed by a different app or environment',

  // Dealer link and account
  PORTAL_MAPPING_AMBIGUOUS: 'External dealer link ambiguous',
  PORTAL_EXTERNAL_LINK_NOT_FOUND: 'no external dealer link for this Portal user',
  PORTAL_ACCOUNT_INACTIVE: 'Dealer account inactive',
  DEALER_IDENTITY_MISMATCH: 'the stored dealer identity disagrees with the Portal identity',

  // Seat claim
  PROFILE_MISMATCH: 'Portal profile mismatch',
  PILOT_SUBJECT_MISMATCH: 'Portal user mismatch',
  PILOT_ACCOUNT_NOT_ELIGIBLE: 'Dealer account not eligible for this Portal launch',
  PORTAL_MEMBERSHIP_AMBIGUOUS: 'Sound Proof seat ambiguous',
  PORTAL_MEMBERSHIP_ALREADY_CLAIMED: 'Sound Proof seat already claimed by another user',
  PORTAL_MEMBERSHIP_ACCOUNT_MISMATCH: 'Sound Proof seat belongs to another account',
  PORTAL_MEMBERSHIP_EMAIL_MISMATCH: 'Sound Proof seat email mismatch',
  PORTAL_MEMBERSHIP_EMAIL_REQUIRED: 'no Portal email on this login',
  PORTAL_USER_UNVERIFIED: 'Portal login not verified',
  PORTAL_USER_DISABLED: 'Portal login disabled',
  PORTAL_USER_EMAIL_REQUIRED: 'no Portal email on this login',
  PILOT_SEAT_BOUND_TO_PLATFORM_ADMIN: 'Sound Proof seat is bound to a platform administrator',
  PILOT_SEAT_BOUND_USER_MISSING: 'Sound Proof seat is bound to a missing user',

  // Portal identity
  PORTAL_IDENTITY_CONFLICT: 'Portal identity conflict',
  PORTAL_IDENTITY_AMBIGUOUS: 'Portal identity conflict',
};

/**
 * The specific, admin-safe message shown when a Portal launch was rejected
 * after the binding was consumed.
 *
 * @param {string} reason - the machine reason returned by the launch function
 * @returns {string}
 */
export function portalLaunchRejectionMessage(reason) {
  const detail = REASON_DETAIL[String(reason || '')]
    || 'the binding did not satisfy this account\'s Portal rules';
  return `Sound Proof received the Portal launch but rejected the binding: ${detail}.`;
}