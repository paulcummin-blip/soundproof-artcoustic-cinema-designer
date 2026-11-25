/**
 * Sends the branded supplementary invitation email for a given invitation.
 *
 * Called by sendAccountUserInvitation AFTER the native Base44 invitation
 * (which carries the secure registration link) has been accepted. The native
 * email (UserInvite.html) is neutral and safe for every recipient; this
 * supplementary email carries the dealer-classification-specific wording.
 *
 * Fail-open: the native invitation already delivered the secure link, so a
 * failure here never blocks the invitation. The error is returned for audit
 * but does not throw.
 *
 * Reach: the invitee is not yet a registered app user. SendEmail reaches
 * non-registered addresses when the app has a verified custom domain on a paid
 * plan (soundproofcinemadesigner.com is connected). If that requirement is not
 * met, the branded email is not delivered; the native invitation is unaffected.
 */

import { resolveApplicablePromotion, selectInvitationEmail } from './invitationEmailSelection.js';
import { renderInvitationEmail } from './invitationEmailTemplates.js';

export async function sendBrandedInvitationEmail(base44, { email, accountId, invitationType, firstName }) {
  const service = base44.asServiceRole;
  const normalisedType = invitationType === 'additional' ? 'additional' : 'initial';

  // Resolve the authoritative account classification. Never infer it.
  let account = null;
  try {
    const id = String(accountId || '').trim();
    if (id) {
      const rows = await service.entities.Account.filter({ id });
      account = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }
  } catch {
    account = null;
  }

  // Resolve the applicable unlimited-project promotion (general dealer only).
  let promotion = null;
  if (normalisedType !== 'additional') {
    promotion = await resolveApplicablePromotion(service, account);
  }

  const selection = selectInvitationEmail({
    account,
    invitationType: normalisedType,
    promotion,
  });

  const { subject, html } = renderInvitationEmail(selection, { firstName: firstName || null });

  try {
    await base44.integrations.Core.SendEmail({
      to: email,
      subject,
      html,
      category: 'transactional',
    });
    return {
      sent: true,
      template: selection.template,
      include_promo: selection.includePromo,
      promo_expiry: selection.promoExpiry,
      dealer_group: selection.dealerGroup,
    };
  } catch (error) {
    return {
      sent: false,
      error: String(error?.message || error),
      template: selection.template,
      include_promo: selection.includePromo,
      promo_expiry: selection.promoExpiry,
      dealer_group: selection.dealerGroup,
    };
  }
}