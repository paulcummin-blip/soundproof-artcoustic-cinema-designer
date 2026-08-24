import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Internal invitation transport.
 *
 * Invoked with service-role authentication only after manageAccountUsers has
 * authorised the tenant, actor, seat limit and role. Direct calls from dealer
 * users fail because they do not hold Base44's built-in platform admin role.
 *
 * Branding: exactly ONE email is sent per invite/resend — the native Base44
 * activation email from base44.users.inviteUser (which carries the auth token).
 * The sender name and address are controlled by the app's Dashboard settings:
 *   - App name (Dashboard → Overview) → default sender name
 *   - Custom email domain (Dashboard → Domains → Email domain) → sender address
 * Configure those to "Sound Proof" / invite@soundproofcinemadesigner.com so
 * the single native email is branded. No supplementary SendEmail is sent.
 * The initiating admin's identity remains in the internal audit trail only
 * (AccountUserAudit.actor_email, AccountMembership.invited_by_email/user_id).
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

    // Single native Base44 activation email — carries the auth/invite token.
    // Sender branding is controlled by Dashboard app-name + custom-email-domain.
    await base44.users.inviteUser(email, 'user');

    return Response.json({ sent: true });
  } catch (error) {
    return Response.json({
      error: 'Invitation failed',
      message: error?.message || 'Unable to send invitation.',
    }, { status: 502 });
  }
}