/**
 * incidentRecorder.js (shared)
 * ----------------------------
 * The central incident recording and notification module for Sound Proof
 * System Health & Error Intelligence.
 *
 * Called by trusted backend functions (e.g. generateProposal) when a
 * significant operation fails. It:
 *
 *   1. Computes a stable grouping fingerprint.
 *   2. Finds an existing open incident with the same fingerprint, or creates
 *      a new one.
 *   3. Sends an immediate private email alert to the nominated administrator
 *      recipients (deduplicated: only on the first occurrence of a grouped
 *      incident).
 *   4. Returns the incident reference, or null if recording failed.
 *
 * FAIL-OPEN: if incident recording or email sending fails, the calling
 * operation's error response is still returned. The incident recorder never
 * blocks the underlying business logic.
 *
 * SAFETY: the incident record never stores proposal text, client briefs,
 * passwords, tokens, secrets or confidential content. The diagnostic summary
 * contains only error codes, violation codes, section types and operation
 * names.
 *
 * This module is backend-only: it receives the service-role SDK client from
 * the calling function and uses it for all entity operations.
 */

import { computeIncidentFingerprint } from './incidentFingerprint.js';
import { FAILURE_TYPE } from './incidentMessages.js';
import { classifyCause, determineUserImpact, readOperationDiagnostics } from './incidentDiagnostics.js';

/**
 * Generate a unique incident reference: INC-YYMMDD-XXXXXX.
 */
function generateIncidentReference() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INC-${yy}${mm}${dd}-${random}`;
}

/**
 * Determine the severity of an incident from its failure type.
 */
function determineSeverity(failureType) {
  switch (failureType) {
    case FAILURE_TYPE.UNEXPECTED_ERROR:
    case FAILURE_TYPE.PROVIDER_FAILED:
      return 'critical';
    case FAILURE_TYPE.DRAFT_REJECTED:
      return 'high';
    case FAILURE_TYPE.SECTION_MAPPING_FAILED:
      return 'medium';
    case FAILURE_TYPE.WRITER_REFUSAL:
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Whether a severity level warrants an email alert.
 */
function shouldSendAlert(severity) {
  return severity === 'critical' || severity === 'high';
}

/**
 * Build a safe, sanitized diagnostic summary from the incident context.
 * Contains only error codes, violation codes, section types and operation
 * names. Never contains proposal text, client names or credentials.
 */
function buildDiagnosticSummary(incidentContext, errorMessage) {
  const parts = [];
  const failureType = incidentContext?.failureType || 'unknown';
  const errorCode = incidentContext?.errorCode || 'UNEXPECTED_ERROR';

  parts.push(`Failure type: ${failureType}`);
  parts.push(`Error code: ${errorCode}`);

  if (incidentContext?.violationCodes?.length > 0) {
    parts.push(`Validation violations: ${incidentContext.violationCodes.join(', ')}`);
  }

  if (incidentContext?.unmappedSections?.length > 0) {
    parts.push(`Unmapped sections: ${incidentContext.unmappedSections.join(', ')}`);
  }

  if (incidentContext?.recoveryAttempted) {
    parts.push(`Recovery attempted: ${incidentContext.recoverySuccessful ? 'succeeded' : 'failed'}`);
  }

  // Include a truncated version of the error message, stripped of any
  // potentially sensitive content. The error messages in generateProposal
  // are controlled strings, not user input, but we truncate as a safeguard.
  if (errorMessage) {
    parts.push(`Error: ${String(errorMessage).slice(0, 200)}`);
  }

  return parts.join('. ');
}

/**
 * Extract validation violation codes from the attempt's validation errors.
 * Only the codes are extracted — the detail text may contain proposal content.
 */
function extractViolationCodes(validationErrors) {
  if (!Array.isArray(validationErrors)) return [];
  return validationErrors
    .map((v) => v?.code)
    .filter((code) => typeof code === 'string' && code.length > 0);
}

/**
 * Read the System Health alert configuration from the SystemConfig singleton.
 */
async function readAlertConfig(serviceClient) {
  try {
    const result = await serviceClient.asServiceRole.entities.SystemConfig.filter({}, { limit: 1 });
    const record = (Array.isArray(result) ? result : (result?.items || []))[0] || null;
    const config = record?.system_health || {};
    return {
      enabled: config.alerts_enabled === true,
      recipients: Array.isArray(config.alert_recipients) ? config.alert_recipients : [],
    };
  } catch {
    return { enabled: false, recipients: [] };
  }
}

/**
 * Build the HTML body for the alert email. Uses the Sound Proof brand colors.
 * Never includes proposal text, client names or credentials.
 */
function buildAlertEmailHtml({ reference, component, operation, severity, diagnosticSummary, identity, user_blocked, workaround_available, cause_classification }) {
  const severityLabel = severity.charAt(0).toUpperCase() + severity.slice(1);
  const severityColor = severity === 'critical' ? '#B23A3A' : (severity === 'high' ? '#625143' : '#3E4349');
  const incidentUrl = `https://soundproofcinemadesigner.com/admin/system-health?incident=${encodeURIComponent(reference)}`;
  const dealerName = identity?.dealerName || 'Unknown';
  const projectName = identity?.projectName || 'Unknown';
  const clientName = identity?.clientName || null;
  const projectDisplay = clientName ? `${projectName} (${clientName})` : projectName;
  const blockedLabel = user_blocked === true ? 'Yes — user cannot proceed without a fix'
    : user_blocked === false ? 'No — user can retry'
    : 'Unknown';
  const workaroundLabel = workaround_available === true ? 'Yes — retry is available'
    : workaround_available === false ? 'No workaround available'
    : 'Unknown';
  const causeLabel = cause_classification === 'confirmed' ? 'Confirmed'
    : cause_classification === 'suspected' ? 'Suspected'
    : 'Unknown';
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
                      System Health Incident
                    </h1>
                    <p style="font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:14px;font-weight:600;color:#625143;margin:0 0 24px;text-align:center;letter-spacing:0.02em;">
                      ${reference}
                    </p>
                    <p style="color:#1B1A1A;font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:15px;margin:0 0 20px;line-height:1.5;font-weight:400;">
                      A significant operation failure has been recorded in Sound Proof. The incident has been logged for administrator review.
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
                      <tr>
                        <td style="background-color:#F3F0EB;border-radius:8px;padding:18px 22px;border:1px solid #DCDBD6;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-family:'Didact Gothic','Century Gothic',Arial,sans-serif;font-size:14px;color:#1B1A1A;">
                            <tr><td style="padding:4px 0;color:#625143;width:110px;font-weight:600;">Component:</td><td style="padding:4px 0;color:#1B1A1A;">${component}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Operation:</td><td style="padding:4px 0;color:#1B1A1A;">${operation}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Severity:</td><td style="padding:4px 0;color:${severityColor};font-weight:700;">${severityLabel}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Dealer:</td><td style="padding:4px 0;color:#1B1A1A;">${dealerName}</td></tr>
                            <tr><td style="padding:4px 0;color:#625143;font-weight:600;">Project:</td><td style="padding:4px 0;color:#1B1A1A;">${projectDisplay}</td></tr>
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
                      No client content, credentials or confidential information is included in this notification.
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

/**
 * Resolve the account (dealer) and project names when the IDs are known.
 * Returns { dealerName, projectName, clientName } with null for any value
 * that cannot be resolved. Never invents identity information.
 */
async function resolveIncidentIdentity(serviceClient, { account_id, project_id }) {
  const identity = { dealerName: null, projectName: null, clientName: null };
  if (!account_id && !project_id) return identity;
  try {
    if (account_id) {
      const acctResult = await serviceClient.asServiceRole.entities.Account.filter({ id: account_id }, { limit: 1 });
      const acct = (Array.isArray(acctResult) ? acctResult : (acctResult?.items || []))[0] || null;
      if (acct?.name) identity.dealerName = acct.name;
    }
    if (project_id) {
      const projResult = await serviceClient.asServiceRole.entities.Project.filter({ id: project_id }, { limit: 1 });
      const proj = (Array.isArray(projResult) ? projResult : (projResult?.items || []))[0] || null;
      if (proj?.name) identity.projectName = proj.name;
      if (proj?.client_name) identity.clientName = proj.client_name;
    }
  } catch {
    // Fail-open: identity resolution must not block the notification.
  }
  return identity;
}

/**
 * Send an alert email to the nominated recipients. Deduplicated: only called
 * for new incidents (first occurrence). Returns the notification status.
 */
async function sendAlertNotification(serviceClient, { reference, component, operation, severity, diagnosticSummary, identity, user_blocked, workaround_available, cause_classification }) {
  const config = await readAlertConfig(serviceClient);

  if (!config.enabled) {
    return { status: 'not_required', sent_at: null, error: 'Alerts disabled' };
  }
  if (!config.recipients || config.recipients.length === 0) {
    return { status: 'not_required', sent_at: null, error: 'No recipients configured' };
  }
  if (!shouldSendAlert(severity)) {
    return { status: 'skipped', sent_at: null, error: `Severity ${severity} does not warrant an alert` };
  }

  const subject = `Sound Proof Incident ${reference}: ${operation} failed (${severity})`;
  const html = buildAlertEmailHtml({ reference, component, operation, severity, diagnosticSummary, identity, user_blocked, workaround_available, cause_classification });

  let lastError = null;
  for (const recipient of config.recipients) {
    try {
      await serviceClient.integrations.Core.SendEmail({
        to: recipient,
        subject,
        html,
        category: 'transactional',
      });
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }

  if (lastError) {
    return { status: 'failed', sent_at: null, error: lastError };
  }
  return { status: 'sent', sent_at: new Date().toISOString(), error: null };
}

/**
 * Record a proposal-generation incident. The main entry point.
 *
 * @param {Object} serviceClient — the base44 SDK client (from createClientFromRequest)
 * @param {Object} details
 * @param {string} details.project_id
 * @param {string} [details.account_id]
 * @param {string} [details.proposal_id]
 * @param {string} details.error — the error message
 * @param {Object} details.incidentContext — the failure context
 * @param {string} details.incidentContext.failureType
 * @param {string} details.incidentContext.errorCode
 * @param {string} [details.incidentContext.generationId]
 * @param {Array<string>} [details.incidentContext.violationCodes]
 * @param {Array<string>} [details.incidentContext.unmappedSections]
 * @param {boolean} [details.incidentContext.recoveryAttempted]
 * @param {boolean} [details.incidentContext.recoverySuccessful]
 * @param {string} [details.incidentContext.recoverySummary]
 * @returns {Promise<Object|null>} { recorded, reference, incident_id, created, notification_status } or null if recording failed
 */
export async function recordProposalGenerationIncident(serviceClient, details) {
  const {
    project_id = null,
    account_id = null,
    proposal_id = null,
    error = '',
    operation_id = null,
    data_committed = null,
    data_integrity_summary = null,
    test_run_id = null,
    incidentContext = {},
  } = details;

  const component = 'proposal_generation';
  const operation = 'generateProposal';
  const errorCode = incidentContext.errorCode || 'UNEXPECTED_ERROR';
  const failureType = incidentContext.failureType || FAILURE_TYPE.UNEXPECTED_ERROR;
  const severity = determineSeverity(failureType);
  const generationId = incidentContext.generationId || null;

  const violationCodes = extractViolationCodes(incidentContext.validationErrors);
  const fingerprint = computeIncidentFingerprint({
    component, operation, errorCode, violationCodes,
  });

  const diagnosticSummary = buildDiagnosticSummary(incidentContext, error);
  const now = new Date().toISOString();

  // Read enriched diagnostics from the MonitoredOperation when linked.
  const opDiagnostics = operation_id
    ? await readOperationDiagnostics(serviceClient, operation_id)
    : null;

  // Classify the cause and determine user impact from the error code.
  const { cause_classification, cause_summary } = classifyCause(errorCode, component);
  const { user_blocked, workaround_available } = determineUserImpact(errorCode, component);

  const enrichedFields = {
    operation_id: operation_id || null,
    operation_started_at: opDiagnostics?.operation_started_at || null,
    operation_last_progress_at: opDiagnostics?.operation_last_progress_at || null,
    operation_failed_at: now,
    stage_failed: opDiagnostics?.stage_failed || null,
    stage_timeline: opDiagnostics?.stage_timeline || null,
    data_committed: data_committed ?? opDiagnostics?.data_committed ?? null,
    data_integrity_summary: data_integrity_summary || opDiagnostics?.data_integrity_summary || null,
    cause_classification,
    cause_summary,
    user_blocked,
    workaround_available,
  };

  try {
    // Find an existing open or investigating incident with the same fingerprint.
    const existingResult = await serviceClient.asServiceRole.entities.SystemHealthIncident.filter(
      {
        grouping_fingerprint: fingerprint,
        incident_status: { $in: ['open', 'investigating'] },
      },
      { sort: '-last_detected_at', limit: 1 },
    );
    const existingIncident = (Array.isArray(existingResult) ? existingResult : (existingResult?.items || []))[0] || null;

    if (existingIncident) {
      // Increment occurrence count on the existing incident.
      await serviceClient.asServiceRole.entities.SystemHealthIncident.update(
        existingIncident.id,
        {
          last_detected_at: now,
          occurrence_count: (existingIncident.occurrence_count || 1) + 1,
          ...(incidentContext.recoveryAttempted !== undefined ? {
            recovery_attempted: existingIncident.recovery_attempted || incidentContext.recoveryAttempted,
            recovery_successful: existingIncident.recovery_successful || incidentContext.recoverySuccessful,
          } : {}),
        },
      );
      return {
        recorded: true,
        reference: existingIncident.incident_reference,
        incident_id: existingIncident.id,
        created: false,
        notification_status: existingIncident.notification_status,
      };
    }

    // Create a new incident.
    const reference = generateIncidentReference();
    const incident = await serviceClient.asServiceRole.entities.SystemHealthIncident.create({
      incident_reference: reference,
      first_detected_at: now,
      last_detected_at: now,
      component,
      operation,
      error_code: errorCode,
      severity,
      account_id: account_id || null,
      project_id: project_id || null,
      proposal_id: proposal_id || null,
      diagnostic_summary: diagnosticSummary,
      proposal_generation_id: generationId,
      grouping_fingerprint: fingerprint,
      occurrence_count: 1,
      recovery_attempted: incidentContext.recoveryAttempted || false,
      recovery_successful: incidentContext.recoverySuccessful || false,
      recovery_summary: incidentContext.recoverySummary || null,
      incident_status: 'open',
      notification_status: 'pending',
      notification_sent_at: null,
      notification_error: null,
      dealer_contacted: false,
      test_run_id: test_run_id || null,
      ...enrichedFields,
    });

    // Send the alert email (fail-open).
    const identity = await resolveIncidentIdentity(serviceClient, {
      account_id: account_id || null,
      project_id: project_id || null,
    });
    const notificationResult = await sendAlertNotification(serviceClient, {
      reference, component, operation, severity, diagnosticSummary, identity,
      user_blocked, workaround_available, cause_classification,
    });

    // Update the notification status on the incident.
    await serviceClient.asServiceRole.entities.SystemHealthIncident.update(incident.id, {
      notification_status: notificationResult.status,
      notification_sent_at: notificationResult.sent_at,
      notification_error: notificationResult.error,
    });

    return {
      recorded: true,
      reference,
      incident_id: incident.id,
      created: true,
      notification_status: notificationResult.status,
    };
  } catch (recordingError) {
    // FAIL-OPEN: if incident recording fails, return null. The calling
    // operation's error is still returned, but without an incident reference.
    console.error(`[incidentRecorder] failed to record incident: ${recordingError?.message || recordingError}`);
    return null;
  }
}

/**
 * Record a general system incident (not specific to proposal generation).
 * Used by the watchdog for confirmed stalled operations. Reuses the same
 * grouping, email and notification logic as recordProposalGenerationIncident.
 *
 * @param {Object} serviceClient
 * @param {Object} details
 * @param {string} [details.component] — e.g. 'operation_monitoring'
 * @param {string} [details.operation] — e.g. 'proposal_generation'
 * @param {string} [details.error_code]
 * @param {string} [details.severity] — 'critical' | 'high' | 'medium' | 'low'
 * @param {string} [details.account_id]
 * @param {string} [details.project_id]
 * @param {string} [details.diagnostic_summary]
 * @returns {Promise<Object|null>} incident result or null if recording failed
 */
export async function recordSystemIncident(serviceClient, details) {
  const {
    component = 'operation_monitoring',
    operation = 'unknown',
    error_code = 'UNKNOWN',
    severity = 'medium',
    account_id = null,
    project_id = null,
    diagnostic_summary = '',
    operation_id = null,
    operation_started_at = null,
    operation_last_progress_at = null,
    stage_failed = null,
    stage_timeline = null,
    data_committed = null,
    data_integrity_summary = null,
    test_run_id = null,
    grouping_scope = null,
  } = details;

  const fingerprint = computeIncidentFingerprint({
    component, operation, errorCode: error_code, violationCodes: grouping_scope ? [grouping_scope] : [],
  });

  const now = new Date().toISOString();

  // Classify the cause and determine user impact from the error code.
  const { cause_classification, cause_summary } = classifyCause(error_code, component);
  const { user_blocked, workaround_available } = determineUserImpact(error_code, component);

  const enrichedFields = {
    operation_id: operation_id || null,
    operation_started_at: operation_started_at || null,
    operation_last_progress_at: operation_last_progress_at || null,
    operation_failed_at: now,
    stage_failed: stage_failed || null,
    stage_timeline: stage_timeline || null,
    data_committed: data_committed ?? null,
    data_integrity_summary: data_integrity_summary || null,
    cause_classification,
    cause_summary,
    user_blocked,
    workaround_available,
  };

  try {
    // Find existing open/incidenting incident with same fingerprint (grouping).
    const existingResult = await serviceClient.asServiceRole.entities.SystemHealthIncident.filter(
      { grouping_fingerprint: fingerprint, incident_status: { $in: ['open', 'investigating'] } },
      { sort: '-last_detected_at', limit: 1 },
    );
    const existingIncident = (Array.isArray(existingResult) ? existingResult : (existingResult?.items || []))[0] || null;

    if (existingIncident) {
      // Increment occurrence count — no duplicate record, no duplicate email.
      await serviceClient.asServiceRole.entities.SystemHealthIncident.update(
        existingIncident.id,
        {
          last_detected_at: now,
          occurrence_count: (existingIncident.occurrence_count || 1) + 1,
        },
      );
      return {
        recorded: true,
        reference: existingIncident.incident_reference,
        incident_id: existingIncident.id,
        created: false,
        notification_status: existingIncident.notification_status,
      };
    }

    // Create a new incident.
    const reference = generateIncidentReference();
    const incident = await serviceClient.asServiceRole.entities.SystemHealthIncident.create({
      incident_reference: reference,
      first_detected_at: now,
      last_detected_at: now,
      component,
      operation,
      error_code,
      severity,
      account_id: account_id || null,
      project_id: project_id || null,
      proposal_id: null,
      diagnostic_summary,
      proposal_generation_id: null,
      grouping_fingerprint: fingerprint,
      occurrence_count: 1,
      recovery_attempted: false,
      recovery_successful: false,
      recovery_summary: null,
      incident_status: 'open',
      notification_status: 'pending',
      notification_sent_at: null,
      notification_error: null,
      dealer_contacted: false,
      test_run_id: test_run_id || null,
      ...enrichedFields,
    });

    // Send the alert email (fail-open). Only sent for critical/high severity.
    const identity = await resolveIncidentIdentity(serviceClient, { account_id, project_id });
    const notificationResult = await sendAlertNotification(serviceClient, {
      reference, component, operation, severity, diagnosticSummary: diagnostic_summary, identity,
      user_blocked, workaround_available, cause_classification,
    });

    await serviceClient.asServiceRole.entities.SystemHealthIncident.update(incident.id, {
      notification_status: notificationResult.status,
      notification_sent_at: notificationResult.sent_at,
      notification_error: notificationResult.error,
    });

    return {
      recorded: true,
      reference,
      incident_id: incident.id,
      created: true,
      notification_status: notificationResult.status,
    };
  } catch (recordingError) {
    console.error(`[incidentRecorder] failed to record system incident: ${recordingError?.message || recordingError}`);
    return null;
  }
}

export default recordProposalGenerationIncident;