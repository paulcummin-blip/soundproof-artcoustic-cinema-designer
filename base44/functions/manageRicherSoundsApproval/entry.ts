import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  resolveRicherSoundsAdminContext,
  resolveRicherSoundsMasterAccount,
  PORTAL_SOURCE_SYSTEM,
  RICHER_SOUNDS_MASTER_TRADING_NUMBER,
} from '../../shared/richerSoundsAdminAuthority.js';
import {
  RS_APPROVAL_STATES,
  normaliseRsApprovalStatus,
  isOrdinaryRicherSoundsStore,
  isRicherSoundsCentralAdministrator,
} from '../../shared/rsApprovalAuthority.js';
import { normaliseEmail } from '../../shared/accountAccessRules.js';

/**
 * manageRicherSoundsApproval — RS-01 Richer Sounds internal approval authority.
 *
 * Admits Sound Proof master admins and authorised active account-admin members
 * of the Custom Install - 93 master account (the richerSoundsAdmin capability,
 * which is restricted to account admins). Sets, suspends or restores the RS
 * internal approval (rs_approval_status) on an ordinary Richer Sounds store.
 *
 * Actions:
 *   set      — rs_approval_status = approved. The store may now activate and
 *              use Sound Proof once Sound Proof eligibility is also present.
 *   suspend  — rs_approval_status = suspended. Linked users' access flags are
 *              cleared so the store cannot use Sound Proof until restored.
 *   restore  — rs_approval_status = approved (from suspended). Does NOT
 *              re-enable users automatically — the account must be re-enabled
 *              through the existing manageSoundProofAccess flow, which now
 *              requires both approvals.
 *
 * Security:
 * - No client-supplied account_id is trusted beyond the resolved context.
 * - The target must be an ordinary RICHER_SOUNDS store (NOT Custom Install - 93,
 *   which is exempt, and not a non-RS group).
 * - Only the manageRicherSoundsApproval backend function may change
 *   rs_approval_status. This is the sole writer.
 * - Audit: each action is recorded in AccountUserAudit.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me().catch((e) =>
      e?.status === 401 ? null : Promise.reject(e),
    );
    if (!sessionUser) {
      return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const ctx = await resolveRicherSoundsAdminContext(base44, sessionUser);
    if (!ctx.allowed) {
      return Response.json({ error: ctx.reason || 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim().toLowerCase();
    const targetAccountId = String(body?.account_id || '').trim();

    if (!['set', 'suspend', 'restore'].includes(action)) {
      return Response.json({ error: 'action must be set, suspend or restore.' }, { status: 400 });
    }
    if (!targetAccountId) {
      return Response.json({ error: 'account_id is required.' }, { status: 400 });
    }

    const service = base44.asServiceRole;
    const now = new Date().toISOString();

    // Resolve the 93 master account dynamically so the target is validated
    // against the real central administrator identity, not a client claim.
    let rsMasterAccountId = null;
    try {
      const rsMaster = await resolveRicherSoundsMasterAccount(service);
      rsMasterAccountId = rsMaster?.accountId || null;
    } catch (_rsErr) {
      rsMasterAccountId = null;
    }

    const accountRows = await service.entities.Account.filter({ id: targetAccountId });
    const account = (Array.isArray(accountRows) && accountRows.length > 0) ? accountRows[0] : null;
    if (!account) {
      return Response.json({ error: 'ACCOUNT_NOT_FOUND' }, { status: 404 });
    }

    // Only ordinary Richer Sounds stores carry the RS approval dimension.
    // 93 (central administrator) is exempt; non-RS groups are rejected.
    if (!isOrdinaryRicherSoundsStore(account, rsMasterAccountId)) {
      return Response.json({
        error: 'NOT_AN_ORDINARY_RICHER_SOUNDS_STORE',
        message: isRicherSoundsCentralAdministrator(account.id, rsMasterAccountId)
          ? 'Custom Install - 93 is the central administrator and is exempt from RS internal approval.'
          : 'RS internal approval applies only to ordinary Richer Sounds stores.',
      }, { status: 400 });
    }

    const previousStatus = normaliseRsApprovalStatus(account.rs_approval_status);
    const newStatus = action === 'suspend'
      ? RS_APPROVAL_STATES.SUSPENDED
      : RS_APPROVAL_STATES.APPROVED;

    if (previousStatus === newStatus) {
      return Response.json({
        ok: true,
        account_id: account.id,
        account_name: account.name,
        action,
        previous_status: previousStatus,
        new_status: newStatus,
        unchanged: true,
      });
    }

    const actorName = ctx.actorUser?.full_name || ctx.actorUser?.email || null;
    await service.entities.Account.update(account.id, {
      rs_approval_status: newStatus,
      rs_approval_set_at: now,
      rs_approval_set_by: actorName,
    });

    // On suspend, clear the access flags on every linked user so the store
    // cannot use Sound Proof while RS approval is suspended. On set/restore we
    // do NOT re-enable users here: activation flows through the existing
    // manageSoundProofAccess enable/reconcile, which now enforces the
    // dual-approval gate.
    let flagsCleared = 0;
    let flagErrors = [];
    if (action === 'suspend') {
      try {
        const memberships = await service.entities.AccountMembership.filter({ account_id: account.id });
        const linkedUserIds = new Set(
          (Array.isArray(memberships) ? memberships : [])
            .filter((m) => m.user_id)
            .map((m) => m.user_id),
        );
        const accountUsers = await service.entities.User.filter({ account_id: account.id });
        for (const u of (Array.isArray(accountUsers) ? accountUsers : [])) {
          if (u.id) linkedUserIds.add(u.id);
        }
        for (const userId of linkedUserIds) {
          try {
            await service.entities.User.update(userId, { soundproof_access_enabled: false });
            flagsCleared += 1;
          } catch (userErr) {
            flagErrors.push({ user_id: userId, error: userErr?.message || String(userErr) });
          }
        }
      } catch (_flagErr) {
        // Best-effort flag clear; the approval status is the authority.
      }
    }

    const auditAction = action === 'suspend'
      ? 'RS_APPROVAL_SUSPENDED'
      : previousStatus === RS_APPROVAL_STATES.SUSPENDED
        ? 'RS_APPROVAL_RESTORED'
        : 'RS_APPROVAL_SET';

    try {
      await service.entities.AccountUserAudit.create({
        account_id: account.id,
        actor_user_id: String(ctx.actorUser?.id || sessionUser.id || 'system'),
        actor_email: normaliseEmail(ctx.actorUser?.email || sessionUser.email),
        action: auditAction,
        target_user_id: null,
        target_email: account.contact_email || account.name || String(account.id),
        before_access_level: previousStatus,
        after_access_level: newStatus,
        occurred_at: now,
        details: {
          actor_is_master_admin: ctx.isMasterAdmin === true,
          actor_is_rs_delegated_admin: ctx.isMasterAdmin !== true,
          master_account_id: rsMasterAccountId,
          previous_rs_approval_status: previousStatus,
          new_rs_approval_status: newStatus,
          flags_cleared: flagsCleared,
          flag_errors: flagErrors,
        },
      });
    } catch (auditErr) {
      console.error(`[manageRicherSoundsApproval] audit failed: ${auditErr?.message}`);
    }

    return Response.json({
      ok: true,
      account_id: account.id,
      account_name: account.name,
      action,
      previous_status: previousStatus,
      new_status: newStatus,
      rs_approval_set_at: now,
      rs_approval_set_by: actorName,
      flags_cleared: flagsCleared,
      flag_errors: flagErrors,
      audit_action: auditAction,
    });
  } catch (error) {
    return Response.json({
      error: 'RICHER_SOUNDS_APPROVAL_FAILED',
      message: error?.message || 'Unable to change RS approval.',
    }, { status: 500 });
  }
}