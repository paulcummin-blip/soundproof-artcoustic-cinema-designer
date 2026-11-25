import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Internal invitation transport.
 *
 * Invoked with service-role authentication only after manageAccountUsers has
 * authorised the tenant, actor, seat limit and role, or after
 * portalActivationAuthority has authorised a Portal-first activation. Direct
 * calls from dealer users fail because they do not hold Base44's built-in
 * platform admin role.
 *
 * Email model (two-stage):
 *   1. base44.users.inviteUser(email, 'user') creates the user and sends the
 *      NATIVE Base44 activation email (UserInvite.html), which carries the
 *      secure registration link ({{action_url}}). This is the ONLY invitation
 *      email sent. UserInvite.html is a neutral, branded registration email
 *      (no dealer classification, 90-day licence, promotion or Premium Partner
 *      wording) so it is safe and appropriate for every recipient.
 *   2. A personalised branded WELCOME email is sent LATER, only after the
 *      recipient has successfully registered, signed in, claimed their pending
 *      membership and joined their account. That send lives in the membership
 *      acceptance path (accountAccessAuthority.js → sendWelcomeEmail.js), not
 *      here. This function never sends a supplementary email.
 *
 * Branding: the native sender name/address are controlled by Dashboard
 * settings (app name + custom email domain). The initiating admin's identity
 * remains in the internal audit trail only (AccountUserAudit, AccountMembership).
 *
 * Body params: { email, account_id?, invitation_type? }
 *   invitation_type is accepted for backward compatibility but no longer used
 *   here — the welcome email selection happens at acceptance time.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Invalid email' }, { status: 400 });
    }

    // Native Base44 activation email — the single registration invitation.
    // UserInvite.html is neutral and carries the genuine secure {{action_url}}.
    await base44.users.inviteUser(email, 'user');

    return Response.json({ sent: true, welcome_stage: 'after_acceptance' });
  } catch (error) {
    return Response.json({
      error: 'Invitation failed',
      message: error?.message || 'Unable to send invitation.',
    }, { status: 502 });
  }
}