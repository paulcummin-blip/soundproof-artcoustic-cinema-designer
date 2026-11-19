/**
 * soundProofAccessFlagAuthority.js (shared)
 * ------------------------------------------
 * The pure decision: for one linked user, should their
 * soundproof_access_enabled flag be true or false, given the account's
 * resulting state and the user's membership status?
 *
 * Leaf module: no SDK, no clock, no writes. Imported by the
 * manageSoundProofAccess backend function so the rule is testable in
 * isolation, and so the same rule could be reused by any future
 * reconciliation path.
 */

/**
 * @param {object} input
 * @param {boolean} input.accountAllowsAccess — the account is active AND its
 *   90-day term has not expired after the access-management action.
 * @param {string|null|undefined} input.membershipStatus — the user's
 *   AccountMembership status: 'active', 'pending', 'removed', 'suspended',
 *   or undefined when the user is linked only via User.account_id (legacy /
 *   directory-imported) and has no membership record.
 * @returns {boolean} the desired soundproof_access_enabled flag.
 */
export function desiredAccessFlag({ accountAllowsAccess, membershipStatus } = {}) {
  if (!accountAllowsAccess) return false;
  const status = String(membershipStatus || '').toLowerCase();
  if (status === 'removed' || status === 'suspended') return false;
  // 'active', 'pending', or no membership record (legacy User.account_id
  // link): preserve access while the account is active and unexpired.
  return true;
}

export default desiredAccessFlag;