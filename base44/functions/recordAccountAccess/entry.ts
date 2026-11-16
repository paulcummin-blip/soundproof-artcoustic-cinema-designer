import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';

/**
 * Records a successful Sound Proof access for the authenticated user.
 *
 * - Admin users: no-op (always retain access).
 * - No account_id: no-op (user not linked to an organisation).
 * - Account status "suspended": returns suspended — NO update, NO auto-reactivation.
 * - Account status "inactive": returns not_activated — NO update, NO auto-activation.
 *   An inactive account must NEVER be enabled by login. Only the
 *   manageSoundProofAccess backend function (called by an administrator) may
 *   set an account to active.
 * - Account status "active" but expired: returns expired — NO update.
 * - Account status "active" and not expired: updates last_access_at only.
 *
 * This function uses the service role to bypass Account RLS (only admins can
 * update Account records via the client SDK; dealer users cannot update their
 * own account).
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const accessContext = await resolveAccountAccess(base44, user);

    // Master admin users bypass dealer account status checks entirely.
    if (accessContext.isMasterAdmin) {
      return Response.json({ status: 'ok', admin: true });
    }

    if (!accessContext.allowed) {
      if (accessContext.reason === 'ACCOUNT_SUSPENDED') {
        return Response.json({ status: 'suspended' });
      }
      if (accessContext.reason === 'ACCOUNT_NOT_ACTIVATED') {
        return Response.json({ status: 'not_activated' });
      }
      if (accessContext.reason === 'ACCOUNT_EXPIRED') {
        return Response.json({ status: 'expired' });
      }
      return Response.json({ status: 'forbidden' }, { status: 403 });
    }

    const accountId = accessContext.user?.account_id;
    if (!accountId) {
      return Response.json({ status: 'forbidden' }, { status: 403 });
    }

    // Fetch account via service role (bypasses RLS).
    const accounts = await base44.asServiceRole.entities.Account.filter({ id: accountId });
    const account = (accounts || [])[0];
    if (!account) {
      return Response.json({ status: 'ok', no_account: true });
    }

    const now = new Date().toISOString();

    // SUSPENDED — do NOT update, do NOT auto-reactivate.
    if (account.status === 'suspended') {
      return Response.json({ status: 'suspended' });
    }

    // INACTIVE — do NOT auto-activate. Only an administrator may enable.
    if (account.status === 'inactive') {
      return Response.json({ status: 'not_activated' });
    }

    // EXPIRED — account is active but the 90-day term has passed.
    if (account.status === 'active' && account.soundproof_access_expires_at) {
      const expiresAtMs = new Date(account.soundproof_access_expires_at).getTime();
      if (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now()) {
        return Response.json({ status: 'expired' });
      }
    }

    // ACTIVE — update last_access_at only.
    if (account.status === 'active') {
      await base44.asServiceRole.entities.Account.update(accountId, {
        last_access_at: now,
      });
      return Response.json({ status: 'active' });
    }

    // Any other status — record access without changing status.
    await base44.asServiceRole.entities.Account.update(accountId, {
      last_access_at: now,
    });
    return Response.json({ status: account.status || 'ok' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}