/**
 * Branded supplementary invitation email templates + renderer.
 *
 * Three cohesive branded emails reuse the existing Sound Proof email design
 * (brand header, content card, footer) with different body copy:
 *   - premiumPartner : the existing Premium Partner invitation wording, unchanged
 *   - generalDealer  : general dealer wording (Trade, Richer Sounds, Other…)
 *   - additionalUser  : additional-user wording (joining an existing account)
 *
 * The secure registration link ({{action_url}}) is delivered by the native
 * platform invitation email (UserInvite.html); it cannot be retrieved for use
 * here. These branded emails' "Accept your invitation" button links to the
 * app, where the recipient signs in after registering via the native email.
 *
 * Rendered to raw inbox-safe HTML (inline styles, 600px table) and sent via
 * SendEmail with an `html` body and {{variable}} substitution performed here,
 * so no unresolved placeholder is ever emitted.
 */

const APP_URL = 'https://soundproofcinemadesigner.com';
const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg';
const FONT = "'Didact Gothic', 'Century Gothic', Arial, sans-serif";

function escapeText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
}

const HEAD = (title, preview) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeText(title)}</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        .brand-logo { display: block; width: 100%; max-width: 440px; height: auto; margin: 0 auto; border: 0; }
        .header-caption { margin-left: auto; margin-right: auto; text-align: center; }
        .about-box, .invite-wrap, .content-card, .footer-cell p { word-break: break-word; overflow-wrap: break-word; }
        .invite-btn { box-sizing: border-box; }
        @media only screen and (max-width: 600px) {
            .outer-cell { padding: 12px 10px 0 !important; }
            .email-shell { width: 100% !important; max-width: 100% !important; border-radius: 6px !important; }
            .brand-header { padding: 24px 18px 22px !important; }
            .brand-logo { max-width: 260px !important; height: auto !important; }
            .content-wrap { padding: 16px 10px 20px !important; }
            .content-card { padding: 24px 18px !important; }
            .about-box { padding: 20px 16px !important; }
            .mobile-text { font-size: 16px !important; line-height: 1.5 !important; }
            .invite-btn { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 14px 16px !important; font-size: 15px !important; text-align: center !important; }
            .footer-cell { padding: 20px 14px 26px !important; }
            .footer-cell p { max-width: 100% !important; }
        }
    </style>
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Didact+Gothic&display=swap" rel="stylesheet" type="text/css"><!--<![endif]--></head>
<body style="margin:0;padding:0;background-color:#F3F0EB;font-family:${FONT};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <span style="display:none;font-size:1px;color:#F3F0EB;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
        ${escapeText(preview)}
    </span>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#F3F0EB;">
        <tr>
            <td align="center" class="outer-cell" style="padding:28px 20px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-shell" style="width:600px;max-width:600px;background-color:#FFFFFF;border:1px solid #DCDBD6;border-radius:8px;overflow:hidden;">

                    <tr>
                        <td class="brand-header" style="padding:38px 44px 30px;background-color:#FFFFFF;text-align:center;border-bottom:3px solid #213428;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" align="center">
                                <tr>
                                    <td style="text-align:center;vertical-align:middle;">
                                        <img src="${LOGO_URL}" alt="Sound Proof" class="brand-logo" style="display:block;width:100%;max-width:440px;height:auto;margin:0 auto;border:0;" />
                                        <div class="header-caption" style="margin-top:16px;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#1B1A1A;">
                                            Professional Home Cinema Engineering
                                        </div>
                                        <div class="header-caption" style="margin-top:4px;font-family:${FONT};font-size:9px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;color:#625143;">
                                            Powered by Artcoustic Design Intelligence (ADI)
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td class="content-wrap" style="padding:28px 30px 34px;background-color:#FFFFFF;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #DCDBD6;border-radius:8px;background-color:#FFFFFF;">
                                <tr>
                                    <td class="content-card" style="padding:40px;">
                                        __BODY__
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#F3F0EB;">
        <tr>
            <td align="center" class="footer-cell" style="padding:24px 20px 32px;">
                <p style="max-width:600px;margin:0;color:#737373;font-size:12px;font-family:${FONT};line-height:18px;text-align:center;">
                    This is a system-generated email from Sound Proof. Replies to this email address are not monitored.
                </p>
                <p style="max-width:600px;margin:6px 0 0;color:#737373;font-size:11px;font-family:${FONT};line-height:16px;text-align:center;">
                    Sound Proof is an Artcoustic platform.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>`;

const BTN = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="invite-wrap" style="margin:8px 0 28px;">
    <tr>
        <td style="text-align:center;">
            <a href="${APP_URL}" class="invite-btn" style="background-color:#213428;color:#FFFFFF;text-decoration:none;display:inline-block;width:auto;max-width:100%;box-sizing:border-box;padding:14px 34px;border-radius:8px;font-family:${FONT};font-size:16px;font-weight:600;border:1px solid #213428;">
                Accept your invitation
            </a>
        </td>
    </tr>
</table>`;

const ABOUT_BOX = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 18px;">
    <tr>
        <td class="about-box" style="background-color:#F3F0EB;border-radius:8px;padding:20px 22px;text-align:left;border:1px solid #DCDBD6;">
            <p style="margin:0 0 6px;color:#1B1A1A;font-family:${FONT};font-size:16px;font-weight:400;line-height:1.5;">Once registered, you can sign in directly at:</p>
            <p style="margin:0;"><a href="${APP_URL}" style="color:#213428;font-family:${FONT};font-size:16px;font-weight:700;text-decoration:none;">www.soundproofcinemadesigner.com</a></p>
        </td>
    </tr>
</table>`;

const SIGN_OFF = `<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 4px;line-height:1.5;font-weight:400;">
    <strong style="color:#1B1A1A;font-family:${FONT};font-weight:700;">The Sound Proof Team</strong><br>
    Artcoustic
</p>`;

function premiumPartnerBody() {
  return `<h1 class="mobile-text" style="font-family:${FONT};font-size:22px;font-weight:700;color:#213428;margin:0 0 18px;line-height:1.25;text-align:center;">
    Welcome to Sound Proof
</h1>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 16px;line-height:1.5;font-weight:400;">
    As an Artcoustic Premium Partner, you've been invited to join Sound Proof with early access and unlimited usage for 3 months. Sound Proof is Artcoustic's professional home cinema design platform.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 24px;line-height:1.5;font-weight:400;">
    Sound Proof helps you design, develop and present home cinema systems, with loudspeaker placement, acoustic analysis and performance predictions aligned with CEDIA RP22 principles.
</p>
${BTN}
<h2 class="mobile-text" style="font-family:${FONT};font-size:16px;font-weight:700;color:#213428;margin:0 0 12px;line-height:1.3;">
    Getting started
</h2>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 14px;line-height:1.5;font-weight:400;">
    Accept your invitation and create your personal login.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 18px;line-height:1.5;font-weight:400;">
    Your dealer account includes an initial <strong style="color:#1B1A1A;font-family:${FONT};font-weight:700;">90-day licence</strong>, starting when the first account administrator completes activation.
</p>
${ABOUT_BOX}
<p class="mobile-text" style="font-family:${FONT};font-size:16px;font-weight:700;color:#213428;margin:0 0 6px;line-height:1.3;">
    Device compatibility
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;font-weight:400;margin:0 0 26px;line-height:1.5;">
    Sound Proof is currently designed for desktop and laptop browsers. iPad optimisation is planned for Q1 2027.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 26px;line-height:1.5;font-weight:400;">
    When your licence expires, renew it through your secure Artcoustic Dealer Portal. Your existing projects and designs will remain available.
</p>
<h2 class="mobile-text" style="font-family:${FONT};font-size:16px;font-weight:700;color:#213428;margin:0 0 12px;line-height:1.3;">
    Your Project Tokens
</h2>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 14px;line-height:1.5;font-weight:400;">
    For every <strong style="color:#1B1A1A;font-family:${FONT};font-weight:700;">&pound;10,000</strong> of qualifying Artcoustic loudspeakers ordered at trade prices, your dealer account earns <strong style="color:#1B1A1A;font-family:${FONT};font-weight:700;">5 Project Tokens</strong>. Your turnover for 2026 qualifies for your Project Tokens already achieved and available.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 14px;line-height:1.5;font-weight:400;">
    Each Project Token allows you to create one new cinema project.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 14px;line-height:1.5;font-weight:400;">
    Additional Project Tokens can be purchased through Sound Proof when purchasing becomes available.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 26px;line-height:1.5;font-weight:400;">
    Your earned and purchased Project Tokens remain in your account until used.
</p>
<h2 class="mobile-text" style="font-family:${FONT};font-size:16px;font-weight:700;color:#213428;margin:0 0 12px;line-height:1.3;">
    Explore up to five designs per project
</h2>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 14px;line-height:1.5;font-weight:400;">
    Each cinema project includes up to <strong style="color:#1B1A1A;font-family:${FONT};font-weight:700;">five design variations</strong>, allowing you to explore different speaker layouts, screen sizes, seating arrangements and other design choices for the same client.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 26px;line-height:1.5;font-weight:400;">
    A fair usage policy applies. Design variations are intended for alternative approaches to the same physical cinema, not unrelated projects.
</p>
${SIGN_OFF}`;
}

function generalDealerBody({ includePromo, promoExpiry }) {
  const promoParagraph = includePromo && promoExpiry
    ? `<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 18px;line-height:1.5;font-weight:400;">
    As part of our introductory promotion, you can create unlimited projects until <strong style="color:#1B1A1A;font-family:${FONT};font-weight:700;">${escapeText(promoExpiry)}</strong>, subject to your account having active access.
</p>`
    : '';
  return `<h1 class="mobile-text" style="font-family:${FONT};font-size:22px;font-weight:700;color:#213428;margin:0 0 18px;line-height:1.25;text-align:center;">
    Welcome to Sound Proof
</h1>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 16px;line-height:1.5;font-weight:400;">
    You've been invited to join Sound Proof, Artcoustic's professional home cinema design platform.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 24px;line-height:1.5;font-weight:400;">
    Sound Proof helps you design, develop and present home cinema systems, with loudspeaker placement, acoustic analysis and performance predictions aligned with CEDIA RP22 principles.
</p>
${BTN}
<h2 class="mobile-text" style="font-family:${FONT};font-size:16px;font-weight:700;color:#213428;margin:0 0 12px;line-height:1.3;">
    Getting started
</h2>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 14px;line-height:1.5;font-weight:400;">
    Accept your invitation and create your personal login.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 18px;line-height:1.5;font-weight:400;">
    Your dealer account includes an initial <strong style="color:#1B1A1A;font-family:${FONT};font-weight:700;">90-day licence</strong>, starting when the first account administrator completes activation.
</p>
${promoParagraph}
${ABOUT_BOX}
${SIGN_OFF}`;
}

function additionalUserBody() {
  return `<h1 class="mobile-text" style="font-family:${FONT};font-size:22px;font-weight:700;color:#213428;margin:0 0 18px;line-height:1.25;text-align:center;">
    Welcome to Sound Proof
</h1>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 16px;line-height:1.5;font-weight:400;">
    You've been invited to join your company's Sound Proof account.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 24px;line-height:1.5;font-weight:400;">
    Sound Proof is Artcoustic's professional home cinema design platform, helping you design, develop and present home cinema systems aligned with CEDIA RP22 principles.
</p>
${BTN}
<h2 class="mobile-text" style="font-family:${FONT};font-size:16px;font-weight:700;color:#213428;margin:0 0 12px;line-height:1.3;">
    Getting started
</h2>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 14px;line-height:1.5;font-weight:400;">
    Accept your invitation and create your personal login to access your company's Sound Proof workspace.
</p>
<p class="mobile-text" style="color:#1B1A1A;font-family:${FONT};font-size:16px;margin:0 0 18px;line-height:1.5;font-weight:400;">
    Your access is managed by your company's Sound Proof account administrator and is subject to the existing dealer account licence.
</p>
${ABOUT_BOX}
${SIGN_OFF}`;
}

const SUBJECTS = {
  premiumPartner: "You're invited to Sound Proof",
  generalDealer: "You're invited to Sound Proof",
  additionalUser: "You're invited to Sound Proof",
};

const PREVIEWS = {
  premiumPartner: "Welcome to Sound Proof, Artcoustic's professional home cinema design platform.",
  generalDealer: "You've been invited to join Sound Proof, Artcoustic's professional home cinema design platform.",
  additionalUser: "You've been invited to join your company's Sound Proof account.",
};

/**
 * Render the branded supplementary email for a selection result.
 *
 * @param {{template: string, includePromo: boolean, promoExpiry: string|null}} selection
 * @param {{firstName?: string|null}} [options]
 * @returns {{subject: string, html: string}}
 */
export function renderInvitationEmail(selection, options = {}) {
  let body;
  if (selection.template === 'premiumPartner') {
    body = premiumPartnerBody();
  } else if (selection.template === 'additionalUser') {
    body = additionalUserBody();
  } else {
    body = generalDealerBody({
      includePromo: selection.includePromo,
      promoExpiry: selection.promoExpiry,
    });
  }
  const subject = SUBJECTS[selection.template] || SUBJECTS.generalDealer;
  const preview = PREVIEWS[selection.template] || PREVIEWS.generalDealer;
  const html = HEAD(subject, preview).replace('__BODY__', body);
  return { subject, html };
}