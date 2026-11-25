/**
 * incidentEmailBuilder.js (shared)
 * ---------------------------------
 * Email subject and HTML body builder for System Health alert notifications.
 *
 * Extracted from incidentRecorder.js to keep the recorder focused on the
 * recording flow. The email branding (Sound Proof / Artcoustic) and design
 * are preserved exactly as before; only the subject line format and a few
 * body fields (environment, occurrence count, notification type) are new.
 *
 * Pure: no React, no SDK, no runtime-specific APIs (except Date).
 */

const AMP = '\x26amp;';
const LT = '\x26lt;';
const GT = '\x26gt;';
const QUOT = '\x26quot;';
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': AMP, '<': LT, '>': GT, '"': QUOT, "'": '&#39;' }[c]));

/**
 * Build a human-readable description for the email subject line.
 */
export function buildEmailDescription({ failure_mechanism, error_code, component }) {
  const descriptions = {
    ENTITY_RATE_LIMIT_429: 'API rate limit exceeded',
    AUTHENTICATION_CONTEXT_FAILED: 'Authentication failure',
    DATA_REQUEST_FAILED: 'Data request failed',
    PROJECT_LOAD_FAILED: 'Project load failed',
    RENDER_FAILED: 'Application render failure',
    RENDER_VALUE_REJECTED: 'Application render error',
    UNHANDLED_ERROR: 'Unexpected browser error',
    UNHANDLED_REJECTION: 'Unhandled async error',
    UI_UNRESPONSIVE: 'Application unresponsive',
    DATA_REQUEST_STALLED: 'Data request stalled',
    PROJECT_LOAD_STALLED: 'Project load stalled',
    DRAFT_REJECTED: 'Proposal draft rejected',
    PROVIDER_FAILED: 'AI provider failure',
    SECTION_MAPPING_FAILED: 'Proposal section mapping failed',
    WRITER_REFUSAL: 'Proposal writer refused',
    OPERATION_STALLED: 'Operation stalled',
  };
  return (
    descriptions[failure_mechanism] ||
    descriptions[error_code] ||
    `${component || 'System'} failure`
  );
}

/**
 * Build the email subject line with environment, severity, account and
 * description. Clearly identifies PREVIEW or PRODUCTION.
 *
 * Examples:
 *   Sound Proof | PREVIEW | HIGH | API rate limit exceeded
 *   Sound Proof | PRODUCTION | CRITICAL | Custom Install 93 | Authentication failure
 */
export function buildEmailSubject({ environment, severity, accountName, failure_mechanism, error_code, component, action }) {
  const env = environment === 'preview' ? 'PREVIEW' : 'PRODUCTION';
  const sev = (severity || 'medium').toUpperCase();
  const description = buildEmailDescription({ failure_mechanism, error_code, component });
  const parts = ['Sound Proof', env, sev];
  if (accountName) parts.push(accountName);
  parts.push(description);
  const base = parts.join(' | ');

  if (action === 'send_reminder') return `${base} (reminder)`;
  if (action === 'send_escalation') return `${base} (escalated to critical)`;
  if (action === 'send_new_account') return `${base} (new account affected)`;
  if (action === 'send_recurrence') return `${base} (recurrence)`;
  return base;
}

/**
 * Build the HTML body for the alert email. Uses the Sound Proof brand colors.
 * Never includes proposal text, client names or credentials.
 */
export function buildAlertEmailHtml({
  reference,
  component,
  operation,
  severity,
  diagnosticSummary,
  identity,
  user_blocked,
  workaround_available,
  cause_classification,
  environment,
  occurrenceCount,
  action,
}) {
  reference = escapeHtml(reference);
  component = escapeHtml(component);
  operation = escapeHtml(operation);
  diagnosticSummary = escapeHtml(diagnosticSummary);
  identity = Object.fromEntries(Object.entries(identity || {}).map(([k, v]) => [k, v == null ? null : escapeHtml(v)]));
  const isTest = operation === 'controlled_alert_test';
  const severityLabel = severity.charAt(0).toUpperCase() + severity.slice(1);
  const severityColor = severity === 'critical' ? '#B23A3A' : severity === 'high' ? '#625143' : '#3E4349';
  const envLabel = environment === 'preview' ? 'PREVIEW' : 'PRODUCTION';
  const incidentUrl = `https://soundproofcinemadesigner.com/admin/system-health?incident=${encodeURIComponent(reference)}`;
  const dealerName = identity?.dealerName || (isTest ? 'Administrator test' : 'Not resolved — see account ID');
  const projectName = identity?.projectName || (isTest ? 'No project selected for this test' : 'No project context available');
  const clientName = identity?.clientName || null;
  const projectDisplay = clientName ? `${projectName} (${clientName})` : projectName;
  const blockedLabel = user_blocked === true ? 'Yes — user cannot proceed without a fix' : user_blocked === false ? 'No — user can retry' : 'Unknown';
  const workaroundLabel = workaround_available === true ? 'Yes — retry is available' : workaround_available === false ? 'No workaround available' : 'Unknown';
  const causeLabel = cause_classification === 'confirmed' ? 'Confirmed' : cause_classification === 'suspected' ? 'Suspected' : 'Unknown';
  const occLabel = occurrenceCount != null ? String(occurrenceCount) : '1';
  const actionLabel = action === 'send_initial' ? 'Initial alert' : action === 'send_reminder' ? '24-hour reminder' : action === 'send_escalation' ? 'Severity escalation' : action === 'send_new_account' ? 'New account affected' : action === 'send_recurrence' ? 'Recurrence after resolution' : 'Alert';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sound Proof Incident ${reference}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; }
    .brand-logo { display: block; width: 100%; max-width: 440px; height: auto; margin: 0 auto; border: 0; }
    .header-caption { margin-left: auto; margin-right: auto; text-align: center; }
    @media only screen and (max-width: 600px) {
      .outer-cell { padding: 12px 10px 0 !important; }
      .email-shell { width: 100% !important; max-width: 100% !important; border-radius: 6px !important; }
      .brand-header { padding: 24px 18px 22px !important; }
      .brand-logo { max-width: 260px !important; height: auto !important; }
      .content-wrap { padding: 16px 10px 20px !important; }
      .content-card { padding: 24px 18px !important; }
    }
  </style>
  <!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Didact+Gothic&display=swap" rel="stylesheet" type="text/css"><!--<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#F3F0EB;font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#F3F0EB;">
    <tr>
      <td align="center" class="outer-cell" style="padding:28px 20px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-shell" style="width:600px;max-width:600px;background-color:#FFFFFF;border:1px solid #DCDBD6;border-radius:8px;overflow:hidden;">
          <tr>
            <td class="brand-header" style="padding:38px 44px 30px;background-color:#FFFFFF;text-align:center;border-bottom:3px solid #213428;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" align="center">
                <tr>
                  <td style="text-align:center;vertical-align:middle;">
                    <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg" alt="Sound Proof" class="brand-logo" style="display:block;width:100%;max-width:440px;height:auto;margin:0 auto;border:0;" />
                    <div class="header-caption" style="margin-top:16px;font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#1B1A1A;">
                      Professional Home Cinema Engineering
                    </div>
                    <div class="header-caption" style="margin-top:4px;font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:9px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;color:#625143;">
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
                    <h1 style="font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:22px;font-weight:700;color:#213428;margin:0 0 6px;line-height:1.25;text-align:center;">
                      ${isTest ? 'System Health — Test Alert' : 'System Health Incident'}
                    </h1>
                    <p style="font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:14px;font-weight:600;color:#625143;margin:0 0 24px;text-align:center;letter-spacing:0.02em;">
                      ${reference} — ${envLabel} — ${actionLabel}
                    </p>
                    <p style="color:#1B1A1A;font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:15px;margin:0 0 20px;line-height:1.5;font-weight:400;">
                      ${isTest ? 'This is a controlled alert delivery test. No dealer failure occurred.' : 'A user-experience failure has been recorded in Sound Proof for administrator review.'}
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
                      <tr>
                        <td style="background-color:#F3F0EB;border-radius:8px;padding:18px 22px;border:1px solid #DCDBD6;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:14px;color:#1B1A1A;">
                            <tr><td style="padding:4px 0;color:#625143;width:110px;font-weight:600;">Environment:</td><td style="padding:4px 0;color:#1B1A1A;font-weight:700;">${envLabel}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Component:</td><td style="padding:4px 0;color:#1B1A1A;">${component}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Operation:</td><td style="padding:4px 0;color:#1B1A1A;">${operation}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Severity:</td><td style="padding:4px 0;color:${severityColor};font-weight:700;">${severityLabel}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Occurrences:</td><td style="padding:4px 0;color:#1B1A1A;">${occLabel}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Account:</td><td style="padding:4px 0;">${identity?.accountName || (isTest ? 'Administrator test' : 'Not resolved — see account ID')}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Dealer:</td><td style="padding:4px 0;color:#1B1A1A;">${dealerName}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Project:</td><td style="padding:4px 0;color:#1B1A1A;">${projectDisplay}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Reference:</td><td style="padding:4px 0;">${identity?.projectReference || 'Not applicable'}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Version:</td><td style="padding:4px 0;">${identity?.versionName || 'No design version selected'}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Cause:</td><td style="padding:4px 0;color:#1B1A1A;">${causeLabel}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">User blocked:</td><td style="padding:4px 0;color:#1B1A1A;">${blockedLabel}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Workaround:</td><td style="padding:4px 0;color:#1B1A1A;">${workaroundLabel}</td></tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    <p style="font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:13px;font-weight:700;color:#213428;margin:0 0 8px;">
                      Diagnostic summary
                    </p>
                    <p style="font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:13px;color:#1B1A1A;background:#F3F0EB;padding:14px 16px;border-radius:8px;border:1px solid #DCDBD6;margin:0 0 24px;line-height:1.5;">
                      ${diagnosticSummary}
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:8px 0 28px;">
                      <tr>
                        <td style="text-align:center;">
                          <a href="${incidentUrl}" style="background-color:#213428;color:#FFFFFF;text-decoration:none;display:inline-block;width:auto;max-width:100%;box-sizing:border-box;padding:14px 34px;border-radius:8px;font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:15px;font-weight:600;border:1px solid #213428;">
                            View in System Health
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:13px;color:#625143;margin:0 0 6px;line-height:1.5;">
                      This private administrator alert contains account and project identifiers and diagnostic details. It excludes credentials, design briefs and document content.
                    </p>
                    <p style="font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:15px;font-weight:700;color:#213428;margin:18px 0 4px;">
                      The Sound Proof Team<br>Artcoustic
                    </p>
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
      <td align="center" style="padding:24px 20px 32px;">
        <p style="max-width:600px;margin:0;color:#737373;font-size:12px;font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;line-height:18px;text-align:center;">
          This is an automated system health alert from Sound Proof. Replies to this email address are not monitored.
        </p>
        <p style="max-width:600px;margin:6px 0 0;color:#737373;font-size:11px;font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;line-height:16px;text-align:center;">
          Sound Proof is an Artcoustic platform.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}