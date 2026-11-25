/**
 * sendWelcomeEmail.js (shared)
 * ---------------------------------
 * Sends the one-time personalised welcome email AFTER a recipient has
 * successfully registered, signed in, claimed their pending membership and
 * joined their Sound Proof account.
 *
 * Called from accountAccessAuthority.js (resolveAccountAccess) on the
 * pending→active membership transition. Fail-open: welcome delivery failure
 * never prevents successful registration, membership acceptance or account
 * activation.
 *
 * ONE-TIME GUARANTEE (atomic conditional claim):
 *   The claim is a single conditional updateMany:
 *     { id, welcome_email_state: { $in: [null, 'pending'] } }
 *       → { $set: { welcome_email_state: 'sent', welcome_email_sent_at: now } }
 *   Only the request that gets updated === 1 wins the claim and sends. A
 *   concurrent request (or a repeated login that somehow re-enters the path)
 *   sees welcome_email_state !== pending and skips, so at most one welcome is
 *   sent per membership.
 *
 *   $in: [null, 'pending'] also matches legacy memberships created before the
 *   field existed (stored value null/missing), so a pre-existing pending
 *   invitation that is accepted after this feature ships still receives its
 *   welcome exactly once.
 *
 * FAILURE HANDLING:
 *   If SendEmail throws, the claim is released to 'failed' (no auto-retry —
 *   the next login does not re-enter the membershipWasPending path anyway) and
 *   a WELCOME_EMAIL_FAILED audit is recorded. A successful send records
 *   WELCOME_EMAIL_SENT. A delivery retry never blindly resends an email the
 *   provider may already have accepted, because the claim is already 'sent'.
 *
 * SELECTION:
 *   Reuses the existing selectInvitationEmail rules. invitationType is derived
 *   from whether the accepted member is the account administrator:
 *     isAccountAdmin → 'initial' (first dealer activation)
 *     otherwise       → 'additional' (joined an existing account)
 */

import { resolveApplicablePromotion, selectInvitationEmail } from './invitationEmailSelection.js';
import { renderWelcomeEmail } from './invitationEmailTemplates.js';

export async function sendWelcomeEmail(service, base44, {
  account,
  membership,
  user,
  isAccountAdmin,
}) {
  const membershipId = String(membership?.id || '').trim();
  if (!membershipId) return { sent: false, reason: 'no_membership' };

  const invitationType = isAccountAdmin ? 'initial' : 'additional';

  // Resolve the applicable unlimited-project promotion (initial activations only).
  let promotion = null;
  if (invitationType !== 'additional') {
    promotion = await resolveApplicablePromotion(service, account);
  }

  const selection = selectInvitationEmail({
    account,
    invitationType,
    promotion,
  });

  // --- Atomic one-time claim ---
  const now = new Date().toISOString();
  let claim;
  try {
    claim = await service.entities.AccountMembership.updateMany(
      { id: membershipId, welcome_email_state: { $in: [null, 'pending'] } },
      { $set: { welcome_email_state: 'sent', welcome_email_sent_at: now } },
    );
  } catch {
    return { sent: false, reason: 'claim_error', template: selection.template };
  }
  if (!claim || claim.updated !== 1) {
    return { sent: false, reason: 'already_sent', template: selection.template };
  }

  // --- Send (we won the claim) ---
  const recipientEmail = String(user?.email || membership?.email || '').trim();
  const { subject, html } = renderWelcomeEmail(selection);

  try {
    await base44.integrations.Core.SendEmail({
      to: recipientEmail,
      subject,
      html,
      category: 'transactional',
    });
  } catch (sendError) {
    // Release the claim to 'failed' so it is not stuck as 'sent'. No
    // auto-retry: subsequent logins do not re-enter the membershipWasPending
    // path, so this never resends blindly.
    try {
      await service.entities.AccountMembership.updateMany(
        { id: membershipId },
        { $set: { welcome_email_state: 'failed' } },
      );
    } catch { /* best-effort; the audit below carries the evidence */ }
    try {
      await service.entities.AccountUserAudit.create({
        account_id: account?.id || membership?.account_id || '',
        actor_user_id: String(user?.id || 'system'),
        actor_email: recipientEmail || 'system',
        action: 'WELCOME_EMAIL_FAILED',
        target_email: recipientEmail,
        occurred_at: now,
        details: {
          template: selection.template,
          membership_id: membershipId,
          include_promo: selection.includePromo,
          error: String(sendError?.message || sendError).slice(0, 500),
        },
      });
    } catch { /* audit is best-effort */ }
    return { sent: false, error: String(sendError?.message || sendError), template: selection.template };
  }

  try {
    await service.entities.AccountUserAudit.create({
      account_id: account?.id || membership?.account_id || '',
      actor_user_id: String(user?.id || 'system'),
      actor_email: recipientEmail,
      action: 'WELCOME_EMAIL_SENT',
      target_email: recipientEmail,
      occurred_at: now,
      details: {
        template: selection.template,
        membership_id: membershipId,
        include_promo: selection.includePromo,
        invitation_type: invitationType,
      },
    });
  } catch { /* audit is best-effort */ }

  return {
    sent: true,
    template: selection.template,
    include_promo: selection.includePromo,
    invitation_type: invitationType,
  };
}