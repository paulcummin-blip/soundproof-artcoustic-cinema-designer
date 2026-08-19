import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { findEffectivePromotion } from '../../shared/promotionAuthority.js';
import { assertCapability, resolveAccountAccess } from '../../shared/accountAccessAuthority.js';

/**
 * P3 Dealer-facing promotion eligibility reader.
 *
 * Read-only. No commercial writes. No CapacityLedger changes.
 *
 * Resolves the authenticated user's authoritative account_id (NOT
 * client-supplied), then uses the canonical promotionAuthority to find
 * the effective UNLIMITED_PRO_PROJECTS promotion for that account.
 *
 * Returns ONLY dealer-facing display fields:
 *   { is_effective, promotion_type, headline, message, ends_at }
 *
 * Never returns: internal name, promotion id, target enums, admin
 * controls, or cross-account usage totals.
 *
 * Admin users receive { is_effective: false } — admin does not need the
 * dealer-facing promotion display.
 */

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ is_effective: false }, { status: 200 });

    const accessContext = await resolveAccountAccess(base44, user);
    try {
      assertCapability(accessContext, 'commercial');
    } catch {
      return Response.json({ is_effective: false }, { status: 403 });
    }

    // Resolve authoritative account_id from the authenticated user record.
    const userRecords = await base44.asServiceRole.entities.User.filter({ id: user.id });
    const authoritativeUser = (Array.isArray(userRecords) && userRecords.length > 0) ? userRecords[0] : null;
    const accountId = authoritativeUser?.account_id || null;
    const userRole = authoritativeUser?.role || user?.role || 'user';
    const isAdmin = userRole === 'admin';

    // Admin does not receive dealer-facing promotion display.
    if (isAdmin || !accountId) {
      return Response.json({ is_effective: false });
    }

    // Fetch the account to check status and dealer_group.
    const accounts = await base44.asServiceRole.entities.Account.filter({ id: accountId });
    const account = (Array.isArray(accounts) && accounts.length > 0) ? accounts[0] : null;
    if (!account) {
      return Response.json({ is_effective: false });
    }

    // Suspended accounts are blocked by the existing suspended-account
    // authority. Promotion must never override suspension. We still
    // return is_effective: false here so the dealer UI shows no promotion
    // while suspended (the suspended screen itself blocks the app).
    if (account.status === 'suspended') {
      return Response.json({ is_effective: false });
    }

    // Inactive accounts: the promotion may exist but the user has not yet
    // been onboarded. recordAccountAccess transitions inactive→active on
    // login, so by the time this function is called the account is
    // typically active. If still inactive, do not show the promotion.
    if (account.status !== 'active') {
      return Response.json({ is_effective: false });
    }

    // Canonical authority — same function used by createProfessionalProject.
    const promotion = await findEffectivePromotion(base44.asServiceRole, account, Date.now());

    if (!promotion) {
      return Response.json({ is_effective: false });
    }

    // Return ONLY dealer-facing display fields.
    return Response.json({
      is_effective: true,
      promotion_type: promotion.promotion_type,
      headline: promotion.headline || null,
      message: promotion.message || null,
      ends_at: promotion.ends_at,
    });
  } catch (error) {
    // Fail-closed: on any error, show no promotion. The dealer sees normal
    // capacity UI. Commercial enforcement is unaffected (backend authority).
    return Response.json({ is_effective: false });
  }
}