/**
 * Canonical promotion eligibility authority.
 *
 * Shared by backend functions that need to determine whether an account
 * qualifies for an active promotion at a given point in time.
 *
 * Effective entitlement = promotion.status === 'ACTIVE'
 *   && now >= promotion.starts_at
 *   && now < promotion.ends_at
 *   && target matches the account
 *
 * No cron, no workflow, no cleanup job — pure date evaluation.
 *
 * Imported via: import { findEffectivePromotion } from "../../shared/promotionAuthority.js";
 */

/**
 * Test whether a promotion is effective (within its date window and ACTIVE).
 * @param {object} promotion - Promotion record
 * @param {number} now - Date.now() timestamp
 * @returns {boolean}
 */
export function isEffective(promotion, now) {
  if (!promotion) return false;
  if (promotion.status !== 'ACTIVE') return false;

  const startMs = promotion.starts_at ? new Date(promotion.starts_at).getTime() : NaN;
  const endMs = promotion.ends_at ? new Date(promotion.ends_at).getTime() : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  if (endMs <= startMs) return false; // invalid range

  return now >= startMs && now < endMs;
}

/**
 * Test whether an account matches a promotion's target scope.
 *
 * @param {object} promotion - Promotion record
 * @param {object} account - Account record (must include dealer_group, id, parent_account_id)
 * @returns {boolean}
 */
export function matchesTarget(promotion, account) {
  if (!promotion || !account) return false;

  switch (promotion.target_scope) {
    case 'ALL_DEALER_GROUP':
      return promotion.target_dealer_group != null
        && account.dealer_group === promotion.target_dealer_group;

    case 'SINGLE_ACCOUNT':
      return promotion.target_account_id != null
        && account.id === promotion.target_account_id;

    case 'DISTRIBUTOR_DOWNSTREAM':
      return promotion.target_distributor_id != null
        && account.parent_account_id === promotion.target_distributor_id;

    default:
      return false;
  }
}

/**
 * Find the effective UNLIMITED_PRO_PROJECTS promotion for an account at the
 * current time. Returns the first qualifying promotion or null.
 *
 * Only UNLIMITED_PRO_PROJECTS affects project creation in Stage P1.
 * DISCOUNT_PERCENT and BONUS_PROJECTS are stored but do not alter the
 * project-creation path yet.
 *
 * @param {object} base44 - service-role base44 client (base44.asServiceRole)
 * @param {object} account - Account record with dealer_group, id, parent_account_id
 * @param {number} [now] - Optional timestamp override (defaults to Date.now())
 * @returns {Promise<object|null>} Qualifying Promotion record or null
 */
export async function findEffectivePromotion(base44, account, now = Date.now()) {
  if (!account) return null;

  // Fetch all ACTIVE promotions. The set is expected to be small (single digits).
  // Filter by status on the server to minimise payload.
  const promotions = await base44.entities.Promotion.filter({ status: 'ACTIVE' });
  if (!Array.isArray(promotions) || promotions.length === 0) return null;

  for (const promotion of promotions) {
    if (promotion.promotion_type !== 'UNLIMITED_PRO_PROJECTS') continue;
    if (!isEffective(promotion, now)) continue;
    if (!matchesTarget(promotion, account)) continue;
    return promotion;
  }

  return null;
}