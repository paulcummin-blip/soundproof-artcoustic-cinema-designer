/**
 * internalAccountFilter.js
 * --------------------------
 * Authoritative exclusion of internal, admin, and non-dealer accounts from
 * commercial opportunity detection.
 *
 * Uses verified account identities (account_type, dealer_group) — NOT
 * email-text heuristics. An account with no dealer_group is "unclassified"
 * and is NOT treated as a Trade Account or a commercial dealer opportunity.
 *
 * Pure: no React, no side effects.
 */

import { text } from '../projectReporting/reportingUtils';

/** Account types that are internal/administrative, not commercial dealers. */
const INTERNAL_ACCOUNT_TYPES = new Set(['admin', 'internal']);

/** Dealer groups that are internal/professional, not commercial dealers. */
const NON_DEALER_GROUPS = new Set(['INTERNAL', 'PROFESSIONAL']);

/**
 * True when an Account record is internal/administrative and should never
 * appear as a commercial dealer opportunity.
 *
 * Checks (authoritative, not email-based):
 *   1. account_type is 'admin' or 'internal'
 *   2. dealer_group is 'INTERNAL' (Sound Proof internal organisation)
 *   3. account_type is 'professional' (non-dealer professional user)
 *   4. dealer_group is 'PROFESSIONAL'
 */
export function isInternalAccount(account) {
  if (!account) return true;
  const type = text(account.account_type).toLowerCase();
  if (INTERNAL_ACCOUNT_TYPES.has(type)) return true;
  if (type === 'professional') return true;
  const group = text(account.dealer_group).toUpperCase();
  if (NON_DEALER_GROUPS.has(group)) return true;
  return false;
}

/**
 * True when an Account record is a confirmed commercial dealer that may
 * appear in opportunity detection.
 *
 * Requires a recognised, non-empty dealer_group. An account with a
 * null/empty dealer_group is unclassified — it is NOT automatically
 * treated as a Trade Account or any other commercial sector.
 */
export function isCommercialDealerAccount(account) {
  if (!account) return false;
  if (isInternalAccount(account)) return false;
  const group = text(account.dealer_group).toUpperCase();
  if (!group) return false; // unclassified — not a confirmed dealer
  return true;
}

/**
 * Filter a list of families (projects) to exclude internal accounts.
 * Uses the family's accountType field (stamped from the Account record).
 */
export function filterInternalFamilies(families) {
  const list = Array.isArray(families) ? families : [];
  return list.filter((family) => {
    const type = text(family?.accountType).toLowerCase();
    if (INTERNAL_ACCOUNT_TYPES.has(type)) return false;
    if (type === 'professional') return false;
    const group = text(family?.accountGroup).toUpperCase();
    if (NON_DEALER_GROUPS.has(group)) return false;
    return true;
  });
}