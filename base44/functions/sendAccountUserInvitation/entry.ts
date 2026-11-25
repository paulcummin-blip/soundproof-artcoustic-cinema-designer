import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBrandedInvitationEmail } from '../../shared/invitationEmail/sendBrandedInvitationEmail.js';

/**
 * Internal invitation transport.
 *
 * Invoked with service-role authentication only after manageAccountUsers has
 * authorised the tenant, actor, seat limit and role, or after
 * portalActivationAuthority has authorised a Portal-first activation. Direct
 * calls from dealer users fail because they do not hold Base44's built-in
 * platform admin role.
 *
 * Email model:
 *   1. base44.users.inviteUser(email, 'user') creates the user and sends the
 *      NATIVE Base44 activation email (UserInvite.html), which carries the
 *      secure registration link ({{action_url}}). This is the only way to
 *      deliver the secure token; it cannot be retrieved for a separate email.
 *      UserInvite.html is a neutral registration email (no dealer
 *      classification, 90-day licence, promotion or Premium Partner wording)
 *      so it is safe for every recipient.
 *   2. A branded SUPPLEMENTARY email is then sent via SendEmail with the
 *      wording appropriate to the dealer classification and invitation type
 *      (Premium Partner / general dealer / additional user), resolved from
 *      the authoritative account record. The supplementary email's
 *      "Accept your invitation" button links to the app; the secure
 *      registration link lives in the native email.
 *
 * Branding: the native sender name/address are controlled by Dashboard
 * settings (app name + custom email domain). The supplementary email uses
 * the same SendEmail channel. The initiating admin's identity remains in the
 * internal audit trail only (AccountUserAudit, AccountMembership).
 *
 * Body params: { email, account_id?, invitation_type? }
 *   invitation_type: 'initial' (dealer activation) | 'additional' (user
 *   joining an existing activated account). Defaults to 'initial' when
 *   omitted, so legacy callers that only pass { email } behave as before.
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

    const accountId = String(body.account_id || body.accountId || '').trim() || null;
    const invitationType = body.invitation_type === 'additional' || body.invitationType === 'additional'
      ? 'additional'
      : 'initial';

    // 1. Native Base44 activation email — carries the auth/invite token.
    await base44.users.inviteUser(email, 'user');

    // 2. Branded supplementary email with classification-specific wording.
    //    Fail-open: the native invitation already succeeded; a supplementary
    //    delivery failure is reported but never blocks the invitation.
    let branded = null;
    try {
      branded = await sendBrandedInvitationEmail(base44, {
        email,
        accountId,
        invitationType,
        firstName: null,
      });
    } catch (brandedErr) {
      branded = {
        sent: false,
        error: String(brandedErr?.message || brandedErr),
        template: null,
      };
    }

    return Response.json({ sent: true, branded });
  } catch (error) {
    return Response.json({
      error: 'Invitation failed',
      message: error?.message || 'Unable to send invitation.',
    }, { status: 502 });
  }
}