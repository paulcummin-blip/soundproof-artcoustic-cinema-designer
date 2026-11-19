import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';

/**
 * Master-admin-only backend authority for managing Sound Proof access on
 * Premium Partner dealer accounts.
 *
 * Actions:
 *   enable   — Set status=active, soundproof_access_expires_at = now + 90 days,
 *               enable all linked users (soundproof_access_enabled=true).
 *   suspend   — Set status=suspended, disable all linked users
 *               (soundproof_access_enabled=false).
 *   restore   — Set status=active. If the 90-day term has NOT expired, re-enable
 *               linked users. If the term HAS expired, leave users disabled (the
 *               dealer must renew). Does NOT extend the expiry.
 *
 * Accepts either a single account_id or an array of account_ids for bulk
 * operations. Each account is processed independently: a failure on one account
 * does not block the others, and every result is reported individually.
 *
 * Audit: each action is recorded in AccountUserAudit.
 *
 * Security:
 * - Only master admins may call this function.
 * - No client-supplied account_id is trusted beyond the initial admin check.
 * - Projects, credits, turnover records, promotions and membership
 *   associations are never touched.
 */
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const accessContext = await resolveAccountAccess(base44, user);
    if (!accessContext?.isMasterAdmin) {
      return Response.json({ error: 'Master admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, account_id, account_ids } = body || {};

    if (!['enable', 'suspend', 'restore'].includes(action)) {
      return Response.json({ error: 'action must be enable, suspend or restore.' }, { status: 400 });
    }

    const ids = Array.isArray(account_ids) && account_ids.length > 0
      ? account_ids
      : account_id
        ? [account_id]
        : [];

    if (ids.length === 0) {
      return Response.json({ error: 'account_id or account_ids required.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const results = [];

    for (const targetAccountId of ids) {
      try {
        const result = await processAccount(base44, {
          action,
          accountId: targetAccountId,
          actor: user,
          now,
        });
        results.push(result);
      } catch (err) {
        results.push({
          account_id: targetAccountId,
          ok: false,
          error: err?.message || 'Failed to process this account.',
        });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return Response.json({
      ok: failed === 0,
      action,
      processed: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Access management failed.' }, { status: 500 });
  }
}

async function processAccount(base44, { action, accountId, actor, now }) {
  const service = base44.asServiceRole;

  const accounts = await service.entities.Account.filter({ id: accountId });
  const account = (Array.isArray(accounts) && accounts.length > 0) ? accounts[0] : null;
  if (!account) {
    return { account_id: accountId, ok: false, error: 'Account not found.' };
  }

  // Find all users linked to this account. Two linkage paths exist:
  //   1. AccountMembership records (the canonical seat model).
  //   2. User.account_id (legacy and directory-imported accounts whose users
  //      were linked directly rather than through a membership).
  // The soundproof_access_enabled RLS flag must be projected onto EVERY user
  // who can read this account's protected data, so both paths are resolved and
  // de-duplicated. This also serves as the backfill mechanism: running `enable`
  // on an active account sets the flag for all linked users.
  const memberships = await service.entities.AccountMembership.filter({ account_id: accountId });
  const linkedUserIds = new Set(
    (Array.isArray(memberships) ? memberships : [])
      .filter((m) => m.user_id && String(m.status || 'active') !== 'removed')
      .map((m) => m.user_id),
  );
  const accountUsers = await service.entities.User.filter({ account_id: accountId });
  for (const u of (Array.isArray(accountUsers) ? accountUsers : [])) {
    if (u.id) linkedUserIds.add(u.id);
  }

  let newStatus = account.status;
  let newExpiresAt = account.soundproof_access_expires_at || null;
  let userEnabled = null;

  if (action === 'enable') {
    newStatus = 'active';
    newExpiresAt = new Date(Date.now() + NINETY_DAYS_MS).toISOString();
    userEnabled = true;
  } else if (action === 'suspend') {
    newStatus = 'suspended';
    userEnabled = false;
  } else if (action === 'restore') {
    newStatus = 'active';
    // Check if the 90-day term has expired.
    if (newExpiresAt) {
      const expiresAtMs = new Date(newExpiresAt).getTime();
      if (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now()) {
        // Expired: do NOT re-enable users. They need to renew.
        userEnabled = false;
      } else {
        userEnabled = true;
      }
    } else {
      // No expiry set: re-enable (account was active before the expiry system).
      userEnabled = true;
    }
  }

  // Update the account.
  await service.entities.Account.update(accountId, {
    status: newStatus,
    soundproof_access_expires_at: newExpiresAt,
  });

  // Update all linked users' soundproof_access_enabled flag.
  if (userEnabled !== null && linkedUserIds.length > 0) {
    for (const userId of linkedUserIds) {
      try {
        await service.entities.User.update(userId, {
          soundproof_access_enabled: userEnabled,
        });
      } catch (userErr) {
        // Report but continue: a single user update failure should not
        // block the account status change.
        console.error(`[manageSoundProofAccess] user update failed for ${userId}: ${userErr?.message}`);
      }
    }
  }

  // Audit trail.
  try {
    await service.entities.AccountUserAudit.create({
      account_id: accountId,
      actor_user_id: String(actor.id),
      actor_email: actor.email || 'admin',
      action: `SOUNDPROOF_${action.toUpperCase()}`,
      target_user_id: null,
      target_email: null,
      before_access_level: account.status,
      after_access_level: newStatus,
      occurred_at: now,
      details: {
        previous_status: account.status,
        new_status: newStatus,
        previous_expires_at: account.soundproof_access_expires_at || null,
        new_expires_at: newExpiresAt,
        user_enabled: userEnabled,
        linked_user_count: linkedUserIds.size,
        linked_user_ids: [...linkedUserIds],
      },
    });
  } catch (auditErr) {
    console.error(`[manageSoundProofAccess] audit failed: ${auditErr?.message}`);
  }

  return {
    account_id: accountId,
    account_name: account.name,
    ok: true,
    action,
    previous_status: account.status,
    new_status: newStatus,
    new_expires_at: newExpiresAt,
    user_enabled: userEnabled,
    linked_users_updated: linkedUserIds.size,
  };
}