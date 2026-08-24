import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Internal invitation transport.
 *
 * This function is invoked with service-role authentication only after
 * manageAccountUsers has authorised the tenant, actor, seat limit and role.
 * Direct calls from dealer users fail because they do not hold Base44's
 * built-in platform admin role.
 *
 * Branding: a supplementary welcome email is sent from "Sound Proof" via the
 * SendEmail integration (from_name: "Sound Proof") so the recipient sees the
 * Sound Proof sender identity — never the initiating admin's personal email.
 * The platform activation email (with auth token) is sent separately by
 * base44.users.inviteUser; this does NOT change authentication or token
 * behaviour. The initiating admin's identity is retained in the internal
 * audit trail by manageAccountUsers (AccountUserAudit + AccountMembership).
 */

const SENDER_NAME = 'Sound Proof';
const INVITE_SUBJECT = "You're invited to Sound Proof — Professional Home Cinema Engineering";

function buildBrandedInvitationBody() {
  return [
    '<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1B1A1A;">',
    '<h2 style="color: #213428; margin-bottom: 4px; font-size: 22px;">Sound Proof</h2>',
    '<p style="margin-top: 0; margin-bottom: 24px; color: #625143; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 600;">Professional Home Cinema Engineering</p>',
    '<p style="font-size: 15px; line-height: 1.5;">You have been invited to join <strong>Sound Proof</strong>, the professional home cinema engineering platform powered by Artcoustic Design Intelligence.</p>',
    '<p style="font-size: 15px; line-height: 1.5;">A separate activation email with your secure sign-in link has been sent to this address. Use that link to complete your account setup and access Sound Proof.</p>',
    '<p style="font-size: 15px; line-height: 1.5;">If you have any questions, please contact the Sound Proof team.</p>',
    '<p style="margin-top: 32px; font-size: 13px; color: #625143;">If you did not expect this invitation, you can safely ignore this email.</p>',
    '<hr style="border: none; border-top: 1px solid #DCDBD6; margin: 24px 0;" />',
    '<p style="font-size: 11px; color: #625143; line-height: 1.6;">Sound Proof &mdash; Professional Home Cinema Engineering<br/>Powered by Artcoustic Design Intelligence (ADI)</p>',
    '</div>',
  ].join('');
}

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

    // 1. Platform activation email (carries the auth/invite token).
    //    Sender name/address are controlled by the app's Dashboard settings
    //    (app name + custom email domain). This call must remain unchanged
    //    to preserve authentication and invite-token behaviour.
    await base44.users.inviteUser(email, 'user');

    // 2. Branded welcome email from "Sound Proof". This supplements (does not
    //    replace) the platform activation email so the recipient always sees
    //    the Sound Proof sender identity. The initiating admin's personal
    //    email is never exposed to the recipient — it remains only in the
    //    internal audit trail written by manageAccountUsers.
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject: INVITE_SUBJECT,
        body: buildBrandedInvitationBody(),
        from_name: SENDER_NAME,
      });
    } catch (emailError) {
      // The branded email is supplementary; the platform activation email
      // (with auth token) has already been sent. Do not fail the invitation.
      console.error('Branded invitation email failed:', emailError?.message || emailError);
    }

    return Response.json({ sent: true });
  } catch (error) {
    return Response.json({
      error: 'Invitation failed',
      message: error?.message || 'Unable to send invitation.',
    }, { status: 502 });
  }
}