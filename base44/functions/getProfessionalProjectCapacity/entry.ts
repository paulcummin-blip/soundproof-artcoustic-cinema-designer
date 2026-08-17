import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Read-only Professional Project capacity reader.
 *
 * Resolves the authenticated user's authoritative account_id (NOT
 * client-supplied), then reads CapacityLedger SUM(delta) for that account.
 *
 * Returns:
 *   { status: "OK", available: N }              — dealer with linked account
 *   { status: "ADMIN", available: null }         — admin (no dealer capacity)
 *   { status: "ACCOUNT_NOT_LINKED", available: null } — dealer with no account
 *   { status: "ERROR", available: null }        — fail-closed
 *
 * No ledger writes. No project writes. No client-supplied account_id.
 * Uses the same authoritative account resolution pattern as
 * getEffectivePromotion and createProfessionalProject.
 */

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ status: "ACCOUNT_NOT_LINKED", available: null });

    // Resolve authoritative account_id from the authenticated user record.
    const userRecords = await base44.asServiceRole.entities.User.filter({ id: user.id });
    const authoritativeUser = (Array.isArray(userRecords) && userRecords.length > 0) ? userRecords[0] : null;
    const accountId = authoritativeUser?.account_id || null;
    const userRole = authoritativeUser?.role || user?.role || 'user';
    const isAdmin = userRole === 'admin';

    if (isAdmin) {
      return Response.json({ status: "ADMIN", available: null });
    }
    if (!accountId) {
      return Response.json({ status: "ACCOUNT_NOT_LINKED", available: null });
    }

    const entries = await base44.asServiceRole.entities.CapacityLedger.filter(
      { account_id: accountId },
      "-created_date",
      1000
    );

    // SUM(delta) — REVERSAL entries net to zero automatically.
    const available = (Array.isArray(entries) ? entries : []).reduce((sum, e) => {
      const d = Number(e?.delta);
      return sum + (Number.isFinite(d) ? d : 0);
    }, 0);

    return Response.json({ status: "OK", available });
  } catch (error) {
    return Response.json({ status: "ERROR", available: null });
  }
}