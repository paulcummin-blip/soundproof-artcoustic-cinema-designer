/**
 * Dealer identity display authority
 * ---------------------------------
 * Decides whether a client-facing surface (proposal / report cover) may present
 * a dealer identity, and what that name is.
 *
 * Rule: only an account belonging to an external trading or professional
 * business may present a dealer name. Sound Proof's own admin and internal
 * accounts are platform identities, never client-facing dealer branding —
 * "Sound Proof Admin Account" must never appear on a client cover.
 *
 * Pure module: no React, no side effects, no I/O.
 */

// Account types that represent an external business. Deliberately excludes
// admin/internal (Sound Proof itself) and demo/client (not a dealer identity).
const DEALER_ACCOUNT_TYPES = new Set(['dealer', 'distributor', 'professional']);

export function isDealerIdentityAccount(account) {
  if (!account) return false;
  return DEALER_ACCOUNT_TYPES.has(account.account_type);
}

/**
 * Resolve the dealer name for client-facing presentation.
 *
 * @param {object|null} account - the Account that owns the project
 * @param {object|null} brand - the account's BrandAsset record
 * @returns {string|null} the dealer name, or null when no dealer identity may be shown
 */
export function resolveDealerIdentityName(account, brand) {
  if (!isDealerIdentityAccount(account)) return null;
  return brand?.display_name_override?.trim()
    || brand?.company_name?.trim()
    || account?.name?.trim()
    || null;
}