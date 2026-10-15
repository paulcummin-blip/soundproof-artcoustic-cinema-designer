/**
 * Client-side master-admin access context.
 *
 * A platform administrator's access is resolved from the authenticated Base44
 * session role alone — the same authority the server resolver
 * (base44/shared/accountAccessAuthority.js) applies for role 'admin'. The shape
 * returned here is deliberately identical to that server context, so every
 * consumer (Layout, AccessGate, report audience, pricing) reads one contract.
 *
 * Admin access never requires a Sound Proof account linkage, an
 * AccountMembership, a dealer_account_id, a Partner Portal launch pass or a
 * PortalIdentity — none of which an internal administrator has. Dealer sessions
 * never reach this module; they resolve through getAccountAccessContext.
 */

export const PLATFORM_ADMIN_ACCESS_LEVEL = 'FULL_ACCESS';

export const PLATFORM_ADMIN_CAPABILITIES = Object.freeze({
  soundProof: true,
  priceList: true,
  commercial: true,
  manageUsers: true,
  masterAdmin: true,
});

export function buildPlatformAdminAccessContext(sessionUser) {
  return {
    allowed: true,
    reason: null,
    isMasterAdmin: true,
    isAccountAdmin: false,
    accessLevel: PLATFORM_ADMIN_ACCESS_LEVEL,
    capabilities: { ...PLATFORM_ADMIN_CAPABILITIES },
    user: {
      id: sessionUser?.id || null,
      email: sessionUser?.email || null,
      full_name: sessionUser?.full_name || null,
      role: 'admin',
      territory: sessionUser?.territory || 'UK',
      account_id: sessionUser?.account_id || null,
      account_role: 'admin',
      access_level: PLATFORM_ADMIN_ACCESS_LEVEL,
      app_role: 'Super Admin',
      dealer_account_id: sessionUser?.dealer_account_id || null,
      dealer_name: sessionUser?.dealer_name || null,
    },
    account: null,
    membership: null,
  };
}