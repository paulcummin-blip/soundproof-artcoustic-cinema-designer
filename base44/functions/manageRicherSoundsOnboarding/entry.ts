import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  resolveRicherSoundsAdminContext,
  resolveRicherSoundsMasterAccount,
  RICHER_SOUNDS_DEALER_GROUP,
} from '../../shared/richerSoundsAdminAuthority.js';
import { appendAccountUserAudit } from '../../shared/accountAccessAuthority.js';

/**
 * manageRicherSoundsOnboarding — coordinate Richer Sounds onboarding.
 *
 * Admits master admins and active 93 members. 93 does NOT bypass the Partner
 * Portal or create first-time Sound Proof memberships. The only action today
 * is `resend`: re-send an EXISTING pending invitation on a Richer Sounds
 * branch (the branch's first admin was created through Portal activation).
 *
 * The resend reuses the existing sendAccountUserInvitation transport (the
 * single native Base44 activation email) via the service role, exactly as
 * manageAccountUsers does. The initiating 93 member's identity is recorded in
 * the AccountUserAudit trail.
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

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const action = String(body.action || 'resend');
    const service = base44.asServiceRole;

    if (action !== 'resend') {
      return Response.json({ error: 'INVALID_ACTION', message: 'Only resend is supported.' }, { status: 400 });
    }

    const accountId = String(body.account_id || '').trim();
    const membershipId = String(body.membership_id || '').trim();
    if (!accountId || !membershipId) {
      return Response.json({ error: 'ACCOUNT_AND_MEMBERSHIP_REQUIRED' }, { status: 400 });
    }

    // Target account must be Richer Sounds and must not be the 93 master.
    const accounts = await service.entities.Account.filter({ id: accountId });
    const account = Array.isArray(accounts) && accounts[0];
    if (!account) {
      return Response.json({ error: 'ACCOUNT_NOT_FOUND' }, { status: 404 });
    }
    if (account.dealer_group !== RICHER_SOUNDS_DEALER_GROUP) {
      return Response.json({ error: 'NOT_RICHER_SOUNDS' }, { status: 400 });
    }
    const master = await resolveRicherSoundsMasterAccount(service);
    if (master && account.id === master.accountId) {
      return Response.json({ error: 'CANNOT_RESEND_FOR_MASTER' }, { status: 400 });
    }
    if (account.soundproof_eligible !== true) {
      return Response.json({ error: 'BRANCH_NOT_ELIGIBLE', message: 'Paul has not approved this branch yet.' }, { status: 409 });
    }

    const memberships = await service.entities.AccountMembership.filter({ account_id: accountId });
    const membership = (Array.isArray(memberships) ? memberships : []).find((m) => m.id === membershipId);
    if (!membership) {
      return Response.json({ error: 'MEMBERSHIP_NOT_FOUND' }, { status: 404 });
    }
    if (membership.status !== 'pending') {
      return Response.json({ error: 'NOT_PENDING', message: 'Only pending invitations can be resent.' }, { status: 409 });
    }

    // Throttle: respect the same 60s window as manageAccountUsers.
    if (membership.invited_at && Date.now() - Date.parse(membership.invited_at) < 60000) {
      return Response.json({ error: 'INVITATION_RECENTLY_SENT' }, { status: 409 });
    }

    const email = String(membership.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return Response.json({ error: 'INVALID_EMAIL' }, { status: 400 });
    }

    // Reserve the delivery attempt, then send via the existing transport.
    await service.entities.AccountMembership.update(membership.id, {
      invited_at: new Date().toISOString(),
      invited_by_user_id: ctx.actorUser?.id || null,
      invited_by_email: ctx.actorUser?.email || null,
    });

    try {
      const isInitial = Boolean(
        membership.is_account_admin
        || membership.membership_role === 'dealer_admin'
        || membership.portal_activation_request_id,
      );
      const response = await base44.asServiceRole.functions.invoke('sendAccountUserInvitation', {
        email,
        account_id: accountId,
        invitation_type: isInitial ? 'initial' : 'additional',
      });
      const payload = response?.data || response || {};
      if (payload?.sent !== true) {
        throw new Error(payload?.message || payload?.error || 'INVITATION_SERVICE_UNAVAILABLE');
      }
    } catch (e) {
      await appendAccountUserAudit(service, {
        accountId,
        actor: ctx.actorUser,
        action: 'INVITATION_RESENT',
        target: { id: membership.user_id || null, email },
        afterAccessLevel: membership.access_level || 'FULL_ACCESS',
        details: { delegated_by: ctx.actorUser?.email || null, delivery_failed: true, error: e?.message || null },
      });
      return Response.json({ error: 'INVITATION_FAILED', message: 'The invitation could not be resent.' }, { status: 502 });
    }

    await service.entities.AccountMembership.update(membership.id, {
      invited_at: new Date().toISOString(),
    });

    await appendAccountUserAudit(service, {
      accountId,
      actor: ctx.actorUser,
      action: 'INVITATION_RESENT',
      target: { id: membership.user_id || null, email },
      afterAccessLevel: membership.access_level || 'FULL_ACCESS',
      details: { delegated_by: ctx.actorUser?.email || null, delegated_admin: true },
    });

    return Response.json({ sent: true, account_id: accountId, membership_id: membershipId });
  } catch (error) {
    return Response.json({ error: 'ONBOARDING_FAILED', message: error?.message || 'Unable to coordinate onboarding.' }, { status: 500 });
  }
}