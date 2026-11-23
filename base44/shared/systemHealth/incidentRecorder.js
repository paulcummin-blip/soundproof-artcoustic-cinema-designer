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
function buildAlertEmailHtml({ reference, component, operation, severity, diagnosticSummary }) {
  const severityColor = severity === 'critical' ? '#B23A3A' : '#625143';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Didact Gothic',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td style="padding:24px;">
      <table width="600" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#ef4444;color:#000000;padding:16px 24px;font-size:15px;font-weight:700;">
          Sound Proof System Health Alert
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#0a0a0a;">
            Incident ${reference}
          </p>
          <p style="margin:0 0 16px;font-size:14px;color:#737373;">
            A significant operation failure has been recorded.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#0a0a0a;">
            <tr><td style="padding:4px 0;color:#737373;width:120px;">Component:</td><td style="padding:4px 0;">${component}</td></tr>
            <tr><td style="padding:4px 0;color:#737373;">Operation:</td><td style="padding:4px 0;">${operation}</td></tr>
            <tr><td style="padding:4px 0;color:#737373;">Severity:</td><td style="padding:4px 0;color:${severityColor};font-weight:700;">${severity}</td></tr>
          </table>
          <p style="margin:16px 0 8px;font-size:13px;font-weight:700;color:#0a0a0a;">Diagnostic summary</p>
          <p style="margin:0 0 16px;font-size:13px;color:#0a0a0a;background:#f5f5f5;padding:12px;border-radius:6px;">
            ${diagnosticSummary}
          </p>
          <a href="https://soundproofcinemadesigner.com/admin/system-health"
             style="display:inline-block;padding:10px 20px;background:#ef4444;color:#000000;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;">
            View in System Health
          </a>
        </td></tr>
        <tr><td style="padding:12px 24px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:11px;color:#737373;">
            This is an automated alert from Sound Proof System Health. No client content or credentials are included in this notification.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Send an alert email to the nominated recipients. Deduplicated: only called
 * for new incidents (first occurrence). Returns the notification status.
 */
async function sendAlertNotification(serviceClient, { reference, component, operation, severity, diagnosticSummary }) {
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
  const html = buildAlertEmailHtml({ reference, component, operation, severity, diagnosticSummary });

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
    });

    // Send the alert email (fail-open).
    const notificationResult = await sendAlertNotification(serviceClient, {
      reference, component, operation, severity, diagnosticSummary,
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

export default recordProposalGenerationIncident;