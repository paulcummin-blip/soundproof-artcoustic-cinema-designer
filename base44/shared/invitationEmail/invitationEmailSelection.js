/**
 * Canonical invitation-email selection authority.
 *
 * Determines which branded supplementary email wording applies to a given
 * invitation, based on the authoritative dealer account classification and
 * the invitation type. Used by sendBrandedInvitationEmail so every invitation
 * path (Portal activation, master-admin dealer invite, account-admin
 * additional-user invite, and resends) selects wording from the same rule.
 *
 * Selection rules (priority order):
 *   1. Additional-user invitation (joining an existing activated account) →
 *      additional-user wording. This ALWAYS wins over dealer classification.
 *   2. Initial dealer activation, account.dealer_group === 'PREMIUM_PARTNER'
 *      → Premium Partner wording (the exclusive invitation).
 *   3. Any other initial activation (Trade, Richer Sounds, Other, International,
 *      Professional) or unresolvable classification → general dealer wording.
 *
 * Premium Partner status is NEVER inferred from email, company name, promotion
 * entitlement, eligibility or any field other than account.dealer_group.
 *
 * The general-dealer promotion paragraph is included ONLY when an effective
 * UNLIMITED_PRO_PROJECTS promotion applies to the account, using the actual
 * promotion expiry date. No unresolved date placeholder is ever emitted.
 */

import { findEffectivePromotion } from '../promotionAuthority.js';

/**
 * Format a promotion's effective end (exclusive ISO) as the inclusive end
 * date in Europe/London, e.g. "1 March 2027". Consistent with the Account
 * Access & Credits admin interface (isoToEndDisplayDate).
 */
export function formatPromoExpiry(effectiveEndsAtIso) {
  if (!effectiveEndsAtIso) return null;
  const ms = Date.parse(effectiveEndsAtIso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  // End is stored exclusive; the inclusive end date is one day earlier.
  d.setDate(d.getDate() - 1);
  try {
    return d.toLocaleDateString('en-GB', {
      timeZone: 'Europe/London',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}

/**
 * Resolve the effective unlimited-project promotion (if any) for an account.
 * Returns null when the account is missing or no promotion applies.
 */
export async function resolveApplicablePromotion(service, account) {
  if (!account) return null;
  try {
    return await findEffectivePromotion(service, account, Date.now());
  } catch {
    return null;
  }
}

/**
 * Select the branded invitation email for a given invitation.
 *
 * @param {object} args
 * @param {object|null} args.account - Account record (must carry dealer_group)
 * @param {'initial'|'additional'} args.invitationType
 * @param {object|null} args.promotion - resolved effective promotion (or null)
 * @returns {{template: 'premiumPartner'|'generalDealer'|'additionalUser', includePromo: boolean, promoExpiry: string|null, dealerGroup: string|null}}
 */
export function selectInvitationEmail({ account, invitationType, promotion }) {
  // Additional-user invitations always use the additional-user wording,
  // regardless of the dealer's classification.
  if (invitationType === 'additional') {
    return {
      template: 'additionalUser',
      includePromo: false,
      promoExpiry: null,
      dealerGroup: account?.dealer_group || null,
    };
  }

  // Initial dealer activation.
  if (account && account.dealer_group === 'PREMIUM_PARTNER') {
    return {
      template: 'premiumPartner',
      includePromo: false,
      promoExpiry: null,
      dealerGroup: 'PREMIUM_PARTNER',
    };
  }

  // General dealer: Trade, Richer Sounds, Other, International, Professional,
  // or unresolvable classification. Include the promotion paragraph only when
  // an applicable unlimited-project promotion resolves with a valid expiry.
  const promoExpiry = promotion ? formatPromoExpiry(promotion.effective_ends_at || promotion.ends_at) : null;
  return {
    template: 'generalDealer',
    includePromo: Boolean(promoExpiry),
    promoExpiry,
    dealerGroup: account?.dealer_group || null,
  };
}