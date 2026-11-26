import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { desiredAccessFlag } from '../../shared/soundProofAccessFlagAuthority.js';
import { setFirstActivatedAtIfUnset } from '../../shared/accountActivationAuthority.js';

/**
 * Master-admin-only backend authority for managing Sound Proof access on
 * Premium Partner dealer accounts.
 *
 * Actions:
 *   enable   — Set status=active, soundproof_access_expires_at = now + 90 days,
 *               enable all linked users (soundproof_access_enabled=true).
 *   suspend   — Set status=suspended, disable all linked users
 *               (soundproof_access_enabled=false).
 *   reconcile — Reapply linked-user flags from current account state only.
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

    if (!['enable', 'suspend', 'restore', 'set_eligible', 'reconcile'].includes(action)) {
      return Response.json({ error: 'action must be enable, suspend, restore, set_eligible or reconcile.' }, { status: 400 });
    }

    // set_eligible requires an explicit boolean. No coercion: a missing or
    // non-boolean value is rejected so the eligibility flag is never changed
    // by accident.
    let eligibleValue = undefined;
    if (action === 'set_eligible') {
      if (typeof body.eligible !== 'boolean') {
        return Response.json({ error: 'eligible must be a boolean (true or false).' }, { status: 400 });
      }
      eligibleValue = body.eligible;
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
          eligible: eligibleValue,
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

async function processAccount(base44, { action, accountId, actor, now, eligible }) {
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
  // de-duplicated. Removed members are included so their flag can be cleared
  // explicitly, rather than left stale from a previous enable.
  const memberships = await service.entities.AccountMembership.filter({ account_id: accountId });
  const membershipStatusByUserId = new Map();
  for (const m of (Array.isArray(memberships) ? memberships : [])) {
    if (m.user_id) membershipStatusByUserId.set(m.user_id, String(m.status || 'active'));
  }
  const linkedUserIds = new Set(
    (Array.isArray(memberships) ? memberships : [])
      .filter((m) => m.user_id)
      .map((m) => m.user_id),
  );
  const accountUsers = await service.entities.User.filter({ account_id: accountId });
  for (const u of (Array.isArray(accountUsers) ? accountUsers : [])) {
    if (u.id) linkedUserIds.add(u.id);
  }

  let newStatus = account.status;
  let newExpiresAt = account.soundproof_access_expires_at || null;
  let newEligible = null;

  // set_eligible: sets soundproof_eligible on the account. Does NOT change
  // status, expiry, or any user flag. The 90-day term starts only on the
  // first Portal-originated user claim, not when eligibility is set.
  // The validated boolean is passed in from the request handler — no body
  // reference here, and no coercion of a non-boolean.
  if (action === 'set_eligible') {
    newEligible = eligible === true;
    await service.entities.Account.update(accountId, {
      soundproof_eligible: newEligible,
    });
    try {
      await service.entities.AccountUserAudit.create({
        account_id: accountId,
        actor_user_id: String(actor.id),
        actor_email: actor.email || 'admin',
        action: 'SOUNDPROOF_ELIGIBILITY_SET',
        target_user_id: null,
        // target_email is a required non-nullable string on AccountUserAudit.
        // Eligibility is an account-level action with no target user, so the
        // account's own contact email (or name, or id) stands in as a valid
        // string — never null.
        target_email: account.contact_email || account.name || String(accountId),
        before_access_level: account.soundproof_eligible ? 'eligible' : 'not_eligible',
        after_access_level: newEligible ? 'eligible' : 'not_eligible',
        occurred_at: now,
        details: {
          previous_eligible: account.soundproof_eligible === true,
          new_eligible: newEligible,
        },
      });
    } catch (auditErr) {
      console.error(`[manageSoundProofAccess] eligibility audit failed: ${auditErr?.message}`);
    }
    return {
      account_id: accountId,
      account_name: account.name,
      ok: true,
      action,
      previous_eligible: account.soundproof_eligible === true,
      new_eligible: newEligible,
    };
  }

  let accountAllowsAccess = false;

  if (action === 'enable') {
    newStatus = 'active';
    newExpiresAt = new Date(Date.now() + NINETY_DAYS_MS).toISOString();
    accountAllowsAccess = true;
  } else if (action === 'suspend') {
    newStatus = 'suspended';
    accountAllowsAccess = false;
  } else if (action === 'restore') {
    newStatus = 'active';
    // Check if the 90-day term has expired.
    if (newExpiresAt) {
      const expiresAtMs = new Date(newExpiresAt).getTime();
      if (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now()) {
        // Expired: do NOT re-enable users. They need to renew.
        accountAllowsAccess = false;
      } else {
        accountAllowsAccess = true;
      }
    } else {
      // No expiry set: re-enable (account was active before the expiry system).
      accountAllowsAccess = true;
    }
  }

  // Reconciliation projects the current authority only. It must not repeat
  // activation, renewal, suspension or restore, or change the existing term.
  if (action === 'reconcile') {
    const expiresAtMs = newExpiresAt ? new Date(newExpiresAt).getTime() : null;
    accountAllowsAccess = account.status === 'active'
      && (expiresAtMs === null || (Number.isFinite(expiresAtMs) && expiresAtMs >= Date.now()));
  } else {
    await service.entities.Account.update(accountId, {
      status: newStatus,
      soundproof_access_expires_at: newExpiresAt,
    });
  }

  // Record the canonical first-activation timestamp (write-once) on the first
  // admin enable. Suspend and restore never change it; renewal never changes
  // it (renewal is Portal-driven and sets it via startSoundProofTermOnFirstClaim).
  if (action === 'enable') {
    await setFirstActivatedAtIfUnset(service, accountId, now);
  }

  // Synchronise the soundproof_access_enabled flag on every linked user so it
  // accurately reflects the authoritative account and membership decisions.
  // Per-user computation (not a single blanket flag):
  //   - A suspended, inactive or expired account clears every flag.
  //   - On an active, unexpired account, active/pending members keep access;
  //     removed or suspended members have their flag cleared.
  //   - A legacy user linked only via User.account_id (no membership record)
  //     keeps access while the account is active and unexpired, preserving
  //     existing legitimate access.
  // Partial flag-update failures are collected and reported; they never turn
  // the account operation into an unconditional success.
  const flagFailures = [];
  let flagsEnabled = 0;
  let flagsDisabled = 0;

  if (linkedUserIds.size > 0) {
    for (const userId of linkedUserIds) {
      const desiredFlag = desiredAccessFlag({
        accountAllowsAccess,
        membershipStatus: membershipStatusByUserId.get(userId),
      });
      try {
        await service.entities.User.update(userId, {
          soundproof_access_enabled: desiredFlag,
        });
        if (desiredFlag) flagsEnabled++; else flagsDisabled++;
      } catch (userErr) {
        // Report but continue: a single user update failure should not
        // block the account status change.
        console.error(`[manageSoundProofAccess] user update failed for ${userId}: ${userErr?.message}`);
        flagFailures.push({ user_id: userId, error: userErr?.message || String(userErr) });
      }
    }
  }

  const flagSyncOk = flagFailures.length === 0;

  // Audit trail.
  try {
    await service.entities.AccountUserAudit.create({
      account_id: accountId,
      actor_user_id: String(actor.id),
      actor_email: actor.email || 'admin',
      action: `SOUNDPROOF_${action.toUpperCase()}`,
      target_user_id: null,
      // target_email is a required non-nullable string. An account-level
      // access action has no single target user, so the account's own
      // contact email (or name, or id) stands in — never null.
      target_email: account.contact_email || account.name || String(accountId),
      before_access_level: account.status,
      after_access_level: newStatus,
      occurred_at: now,
      details: {
        previous_status: account.status,
        new_status: newStatus,
        previous_expires_at: account.soundproof_access_expires_at || null,
        new_expires_at: newExpiresAt,
        account_allows_access: accountAllowsAccess,
        flags_enabled: flagsEnabled,
        flags_disabled: flagsDisabled,
        linked_user_count: linkedUserIds.size,
        linked_user_ids: [...linkedUserIds],
        flag_failures: flagFailures,
      },
    });
  } catch (auditErr) {
    console.error(`[manageSoundProofAccess] audit failed: ${auditErr?.message}`);
  }

  return {
    account_id: accountId,
    account_name: account.name,
    ok: flagSyncOk,
    account_updated: action !== 'reconcile',
    partial_failure: !flagSyncOk,
    error: flagSyncOk ? null : 'Account state is saved, but linked-user access enforcement is incomplete. Retry reconciliation; do not assume access has been revoked.',
    flag_sync_ok: flagSyncOk,
    action,
    previous_status: account.status,
    new_status: newStatus,
    new_expires_at: newExpiresAt,
    account_allows_access: accountAllowsAccess,
    flags_enabled: flagsEnabled,
    flags_disabled: flagsDisabled,
    linked_users_updated: flagsEnabled + flagsDisabled,
    linked_users_attempted: linkedUserIds.size,
    flag_failures: flagFailures,
  };
}