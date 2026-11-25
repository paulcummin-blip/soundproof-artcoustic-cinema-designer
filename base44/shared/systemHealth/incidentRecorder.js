/**
 * incidentRecorder.js (shared)
 * ----------------------------
 * The central incident recording and notification module for Sound Proof
 * System Health & Error Intelligence.
 *
 * Called by trusted backend functions when a significant operation fails. It:
 *
 *   1. Always creates an IncidentOccurrence record preserving the full
 *      diagnostic evidence (timestamp, operation, page, environment, account,
 *      project, version, error details, severity, user impact).
 *   2. Finds or creates a SystemHealthIncident notification group, keyed by
 *      mechanism + environment + account.
 *   3. Atomically updates the group (occurrence count, highest severity,
 *      affected production accounts).
 *   4. Determines whether an email notification should be sent (initial,
 *      escalation, new account, recurrence, 24-hour reminder, or skip).
 *   5. Atomically claims the notification via conditional updateMany so
 *      concurrent occurrences cannot send duplicate emails.
 *   6. Sends the alert email (fail-open: a failure never blocks the response).
 *
 * FAIL-OPEN: if incident recording or email sending fails, the calling
 * operation's error response is still returned.
 *
 * SAFETY: the incident record never stores proposal text, client briefs,
 * passwords, tokens, secrets or confidential content.
 *
 * Backend-only: receives the service-role SDK client from the calling function.
 */

import { computeIncidentFingerprint } from './incidentFingerprint.js';
import { FAILURE_TYPE } from './incidentMessages.js';
import { classifyCause, determineUserImpact, readOperationDiagnostics } from './incidentDiagnostics.js';
import { normalizeFailureMechanism, computeNotificationGroupKey } from './notificationGroupKey.js';
import {
  NOTIFICATION_ACTION,
  determineNotificationAction,
  claimNotification,
  releaseNotificationClaim,
} from './notificationRules.js';
import { buildAlertEmailHtml, buildEmailSubject } from './incidentEmailBuilder.js';
import { resolveIncidentIdentity, readAlertConfig } from './incidentIdentityResolver.js';

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const ALERT_SEVERITIES = new Set(['critical', 'high']);

function generateIncidentReference() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INC-${yy}${mm}${dd}-${random}`;
}

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

function extractViolationCodes(validationErrors) {
  if (!Array.isArray(validationErrors)) return [];
  return validationErrors.map((v) => v?.code).filter((code) => typeof code === 'string' && code.length > 0);
}

function buildDiagnosticSummary(incidentContext, errorMessage) {
  const parts = [];
  const failureType = incidentContext?.failureType || 'unknown';
  const errorCode = incidentContext?.errorCode || 'UNEXPECTED_ERROR';
  parts.push(`Failure type: ${failureType}`);
  parts.push(`Error code: ${errorCode}`);
  if (incidentContext?.violationCodes?.length > 0) parts.push(`Validation violations: ${incidentContext.violationCodes.join(', ')}`);
  if (incidentContext?.unmappedSections?.length > 0) parts.push(`Unmapped sections: ${incidentContext.unmappedSections.join(', ')}`);
  if (incidentContext?.recoveryAttempted) parts.push(`Recovery attempted: ${incidentContext.recoverySuccessful ? 'succeeded' : 'failed'}`);
  if (errorMessage) parts.push(`Error: ${String(errorMessage).slice(0, 200)}`);
  return parts.join('. ');
}

/**
 * Send an alert email to the nominated recipients.
 */
async function sendAlertNotification(serviceClient, params) {
  const {
    reference, component, operation, severity, diagnosticSummary, identity,
    user_blocked, workaround_available, cause_classification,
    environment, failure_mechanism, error_code, action, occurrenceCount,
  } = params;

  const config = await readAlertConfig(serviceClient);
  if (!config.enabled) return { status: 'not_required', sent_at: null, error: 'Alerts disabled' };
  if (!config.recipients?.length) return { status: 'not_required', sent_at: null, error: 'No recipients configured' };
  if (!ALERT_SEVERITIES.has(severity) && action !== NOTIFICATION_ACTION.REMINDER) {
    return { status: 'skipped', sent_at: null, error: `Severity ${severity} does not warrant an alert` };
  }

  const accountName = identity?.accountName || identity?.dealerName || null;
  const subject = operation === 'controlled_alert_test'
    ? `Sound Proof TEST alert ${reference}${identity?.projectName ? ': ' + identity.projectName : ''}`
    : buildEmailSubject({ environment, severity, accountName, failure_mechanism, error_code, component, action });
  const html = buildAlertEmailHtml({
    reference, component, operation, severity, diagnosticSummary, identity,
    user_blocked, workaround_available, cause_classification,
    environment, occurrenceCount, action,
  });

  let lastError = null;
  for (const recipient of config.recipients) {
    try {
      await serviceClient.integrations.Core.SendEmail({ to: recipient, subject, html, category: 'transactional' });
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }
  if (lastError) return { status: 'failed', sent_at: null, error: lastError };
  return { status: 'sent', sent_at: new Date().toISOString(), error: null };
}

function firstRow(r) { return (Array.isArray(r) ? r : r?.items || [])[0] || null; }

/**
 * Find an existing notification group (open, investigating, or resolved).
 * Returns { group, isRecurrence }.
 */
async function findExistingGroup(serviceClient, groupKey) {
  const openResult = await serviceClient.asServiceRole.entities.SystemHealthIncident.filter(
    { notification_group_key: groupKey, incident_status: { $in: ['open', 'investigating'] } },
    { sort: '-last_detected_at', limit: 1 },
  );
  const openGroup = firstRow(openResult);
  if (openGroup) return { group: openGroup, isRecurrence: false };

  const resolvedResult = await serviceClient.asServiceRole.entities.SystemHealthIncident.filter(
    { notification_group_key: groupKey, incident_status: 'resolved' },
    { sort: '-last_detected_at', limit: 1 },
  );
  const resolvedGroup = firstRow(resolvedResult);
  if (resolvedGroup) return { group: resolvedGroup, isRecurrence: true };

  return { group: null, isRecurrence: false };
}

/**
 * Core recording flow: always create an occurrence, find-or-create the group,
 * atomically update it, and claim-and-send a notification if rules require.
 */
async function recordIncidentOccurrence(serviceClient, details) {
  const {
    component = 'operation_monitoring',
    operation = 'unknown',
    error_code = 'UNKNOWN',
    severity = 'medium',
    account_id = null,
    project_id = null,
    version_id = null,
    page_path = null,
    error_detail = null,
    component_stack = null,
    runtime_environment = 'production',
    http_status = null,
    diagnostic_summary = '',
    user_blocked = null,
    workaround_available = null,
    cause_classification = 'unknown',
    cause_summary = null,
    test_run_id = null,
    operation_id = null,
    operation_started_at = null,
    operation_last_progress_at = null,
    stage_failed = null,
    stage_timeline = null,
    data_committed = null,
    data_integrity_summary = null,
    grouping_scope = null,
  } = details;

  const now = new Date();
  const nowIso = now.toISOString();
  const env = runtime_environment === 'preview' ? 'preview' : 'production';

  // 1. Compute failure mechanism and notification group key.
  const failureMechanism = normalizeFailureMechanism({ error_code, http_status, component, operation, detail: error_detail });
  const accountScope = account_id || 'internal';
  const groupKey = computeNotificationGroupKey({ failure_mechanism: failureMechanism, runtime_environment: env, account_id: accountScope });

  // 2. Resolve identity for denormalized fields.
  const identity = await resolveIncidentIdentity(serviceClient, { account_id, project_id, version_id });

  // 3. Always create the occurrence record (preserves full diagnostic evidence).
  const occurrenceId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `occ-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let createdOccurrenceId = null;
  try {
    const createdOccurrence = await serviceClient.asServiceRole.entities.IncidentOccurrence.create({
      occurrence_id: occurrenceId,
      notification_group_key: groupKey,
      incident_id: null,
      incident_reference: null,
      timestamp: nowIso,
      component, operation, error_code, severity,
      runtime_environment: env,
      failure_mechanism: failureMechanism,
      http_status: http_status || null,
      account_id: account_id || null,
      project_id: project_id || null,
      version_id: version_id || null,
      page_path: page_path || null,
      error_detail: error_detail || null,
      component_stack: component_stack || null,
      diagnostic_summary: diagnostic_summary || '',
      user_blocked, workaround_available,
      cause_classification, cause_summary,
      account_name: identity.accountName,
      dealer_name: identity.dealerName,
      project_name: identity.projectName,
      client_name: identity.clientName,
      test_run_id: test_run_id || null,
    });
    // The platform generates the record's primary `id`; the `occurrence_id`
    // field above is a custom UUID, NOT the record's primary key. The link
    // update below must use the platform-generated id, not the UUID field, or
    // it silently fails to find the record and the occurrence stays unlinked.
    createdOccurrenceId = createdOccurrence?.id || null;
  } catch (err) {
    console.error(`[incidentRecorder] failed to create occurrence: ${err?.message || err}`);
  }

  // 4. Find or create the notification group.
  let { group, isRecurrence } = await findExistingGroup(serviceClient, groupKey);
  let created = false;

  if (!group) {
    const reference = generateIncidentReference();
    const legacyFingerprint = computeIncidentFingerprint({
      component, operation, errorCode: error_code,
      violationCodes: [account_id, project_id, version_id, grouping_scope].filter(Boolean),
    });
    try {
      group = await serviceClient.asServiceRole.entities.SystemHealthIncident.create({
        incident_reference: reference,
        first_detected_at: nowIso,
        last_detected_at: nowIso,
        component, operation, error_code, severity,
        highest_severity: severity,
        account_id: account_id || null,
        project_id: project_id || null,
        diagnostic_summary,
        grouping_fingerprint: groupKey,
        notification_group_key: groupKey,
        failure_mechanism: failureMechanism,
        http_status: http_status || null,
        occurrence_count: 1,
        affected_production_accounts: env === 'production' && account_id ? [account_id] : [],
        incident_status: 'open',
        notification_status: 'pending',
        notifications_sent_count: 0,
        initial_notification_claimed: false,
        critical_notification_sent: false,
        recurrence_claimed: false,
        resolved_at: null,
        test_run_id: test_run_id || null,
        version_id: version_id || null,
        page_path: page_path || null,
        error_detail: error_detail || null,
        component_stack: component_stack || null,
        account_name: identity.accountName,
        dealer_name: identity.dealerName,
        project_name: identity.projectName,
        client_name: identity.clientName,
        project_reference: identity.projectReference,
        version_name: identity.versionName,
        cause_classification, cause_summary,
        user_blocked, workaround_available,
        operation_id: operation_id || null,
        operation_started_at: operation_started_at || null,
        operation_last_progress_at: operation_last_progress_at || null,
        operation_failed_at: nowIso,
        stage_failed: stage_failed || null,
        stage_timeline: stage_timeline || null,
        data_committed: data_committed ?? null,
        data_integrity_summary: data_integrity_summary || null,
      });
      created = true;

      // Re-check for duplicate groups (concurrent creation race). If found,
      // the oldest is canonical; dismiss the new one and switch to canonical.
      const dupes = await serviceClient.asServiceRole.entities.SystemHealthIncident.filter(
        { notification_group_key: groupKey, incident_status: { $in: ['open', 'investigating'] } },
        { sort: 'first_detected_at', limit: 10 },
      );
      const dupeList = Array.isArray(dupes) ? dupes : (dupes?.items || []);
      if (dupeList.length > 1) {
        const canonical = dupeList[0]; // oldest by first_detected_at
        if (canonical.id !== group.id) {
          await serviceClient.asServiceRole.entities.SystemHealthIncident.updateMany(
            { id: group.id },
            { $set: { incident_status: 'dismissed', admin_notes: `Duplicate group from concurrent creation; merged into ${canonical.incident_reference}` } },
          );
          group = canonical;
          created = false;
          isRecurrence = canonical.incident_status === 'resolved';
        }
      }
    } catch (err) {
      console.error(`[incidentRecorder] failed to create group: ${err?.message || err}`);
      return null;
    }
  } else {
    // 5a. Existing group: atomically increment count and update last_detected_at.
    await serviceClient.asServiceRole.entities.SystemHealthIncident.updateMany(
      { id: group.id },
      { $inc: { occurrence_count: 1 }, $set: { last_detected_at: nowIso } },
    );
    // Track affected production accounts (idempotent).
    if (env === 'production' && account_id) {
      await serviceClient.asServiceRole.entities.SystemHealthIncident.updateMany(
        { id: group.id },
        { $addToSet: { affected_production_accounts: account_id } },
      );
    }
    // Update highest severity if this occurrence is more severe.
    const currentHighest = group.highest_severity || group.severity || severity;
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[currentHighest]) {
      await serviceClient.asServiceRole.entities.SystemHealthIncident.updateMany(
        { id: group.id, highest_severity: currentHighest },
        { $set: { highest_severity: severity } },
      );
    }
  }

  // 5b. Link the occurrence to the group, using the platform-generated record id
  // captured at creation (not the custom occurrence_id UUID field).
  const occurrenceRecordId = createdOccurrenceId || occurrenceId;
  try {
    await serviceClient.asServiceRole.entities.IncidentOccurrence.update(occurrenceRecordId, {
      incident_id: group.id,
      incident_reference: group.incident_reference,
    });
  } catch {}

  // 6. Re-read the group to get current state for notification decision.
  const currentGroup = await serviceClient.asServiceRole.entities.SystemHealthIncident.get(group.id);

  // 7. Determine notification action.
  const action = determineNotificationAction(
    currentGroup,
    { severity, runtime_environment: env, account_id },
    now.getTime(),
  );

  if (action === NOTIFICATION_ACTION.SKIP) {
    return {
      recorded: true,
      reference: group.incident_reference,
      incident_id: group.id,
      created,
      occurrence_id: occurrenceId,
      notification_status: currentGroup.notification_status || 'skipped',
    };
  }

  // 8. Atomically claim the notification.
  const claimed = await claimNotification(serviceClient, group.id, action, occurrenceId, nowIso);
  if (!claimed) {
    return {
      recorded: true,
      reference: group.incident_reference,
      incident_id: group.id,
      created,
      occurrence_id: occurrenceId,
      notification_status: 'skipped',
    };
  }

  // 9. Send the alert email (fail-open).
  const notificationResult = await sendAlertNotification(serviceClient, {
    reference: group.incident_reference,
    component, operation, severity,
    diagnosticSummary: [runtime_environment && `Environment: ${runtime_environment}.`, diagnostic_summary, page_path && `Page: ${page_path}.`, error_detail && `Detail: ${error_detail}`, account_id && `Account ID: ${account_id}.`, project_id && `Project ID: ${project_id}.`, version_id && `Version ID: ${version_id}.`].filter(Boolean).join(' '),
    identity,
    user_blocked, workaround_available, cause_classification,
    environment: env, failure_mechanism: failureMechanism, error_code, action,
    occurrenceCount: currentGroup.occurrence_count || 1,
  });

  // 10. Update notification status. Release claim on failure.
  if (notificationResult.status === 'sent') {
    await serviceClient.asServiceRole.entities.SystemHealthIncident.updateMany(
      { id: group.id },
      {
        $set: {
          notification_status: 'sent',
          notification_sent_at: notificationResult.sent_at,
          last_alert_sent_at: notificationResult.sent_at,
          notifications_sent_count: (currentGroup.notifications_sent_count || 0) + 1,
          ...(action === NOTIFICATION_ACTION.REMINDER ? { last_reminder_sent_at: notificationResult.sent_at } : {}),
        },
      },
    );
  } else {
    // Release the claim so the next occurrence can retry.
    await releaseNotificationClaim(serviceClient, group.id, action, occurrenceId);
    await serviceClient.asServiceRole.entities.SystemHealthIncident.updateMany(
      { id: group.id },
      { $set: { notification_status: notificationResult.status, notification_error: notificationResult.error } },
    );
  }

  return {
    recorded: true,
    reference: group.incident_reference,
    incident_id: group.id,
    created,
    occurrence_id: occurrenceId,
    notification_status: notificationResult.status,
  };
}

/**
 * Record a proposal-generation incident.
 */
export async function recordProposalGenerationIncident(serviceClient, details) {
  const {
    project_id = null, account_id = null, proposal_id = null,
    error = '', operation_id = null, data_committed = null,
    data_integrity_summary = null, test_run_id = null, incidentContext = {},
    version_id = null, runtime_environment = 'production',
    error_detail = null, component_stack = null,
  } = details;

  const component = 'proposal_generation';
  const operation = 'generateProposal';
  const errorCode = incidentContext.errorCode || 'UNEXPECTED_ERROR';
  const failureType = incidentContext.failureType || FAILURE_TYPE.UNEXPECTED_ERROR;
  const severity = determineSeverity(failureType);
  const generationId = incidentContext.generationId || null;
  const violationCodes = extractViolationCodes(incidentContext.validationErrors);
  const diagnosticSummary = buildDiagnosticSummary(incidentContext, error);

  const opDiagnostics = operation_id ? await readOperationDiagnostics(serviceClient, operation_id) : null;
  const { cause_classification, cause_summary } = classifyCause(errorCode, component);
  const { user_blocked, workaround_available } = determineUserImpact(errorCode, component);

  return recordIncidentOccurrence(serviceClient, {
    component, operation, error_code: errorCode, severity,
    account_id, project_id, version_id, runtime_environment,
    error_detail, component_stack, page_path: '/ProposalCentre',
    diagnostic_summary: diagnosticSummary,
    test_run_id, operation_id,
    user_blocked, workaround_available,
    cause_classification, cause_summary,
    operation_started_at: opDiagnostics?.operation_started_at || null,
    operation_last_progress_at: opDiagnostics?.operation_last_progress_at || null,
    stage_failed: opDiagnostics?.stage_failed || null,
    stage_timeline: opDiagnostics?.stage_timeline || null,
    data_committed: data_committed ?? opDiagnostics?.data_committed ?? null,
    data_integrity_summary: data_integrity_summary || opDiagnostics?.data_integrity_summary || null,
    grouping_scope: [violationCodes.join(','), generationId || ''].join(':'),
  });
}

/**
 * Record a general system incident (not specific to proposal generation).
 */
export async function recordSystemIncident(serviceClient, details) {
  const {
    component = 'operation_monitoring',
    operation = 'unknown',
    error_code = 'UNKNOWN',
    severity = 'medium',
    account_id = null, project_id = null,
    diagnostic_summary = '',
    operation_id = null,
    operation_started_at = null, operation_last_progress_at = null,
    stage_failed = null, stage_timeline = null,
    data_committed = null, data_integrity_summary = null,
    test_run_id = null, grouping_scope = null,
    version_id = null, page_path = null,
    error_detail = null, component_stack = null,
    runtime_environment = null, http_status = null,
  } = details;

  const { cause_classification, cause_summary } = classifyCause(error_code, component);
  const { user_blocked, workaround_available } = determineUserImpact(test_run_id ? 'CONTROLLED_ALERT_TEST' : error_code, component);

  return recordIncidentOccurrence(serviceClient, {
    component, operation, error_code, severity,
    account_id, project_id, version_id, page_path,
    error_detail, component_stack,
    runtime_environment: runtime_environment || 'production',
    http_status,
    diagnostic_summary,
    user_blocked, workaround_available,
    cause_classification, cause_summary,
    test_run_id, operation_id,
    operation_started_at, operation_last_progress_at,
    stage_failed, stage_timeline,
    data_committed, data_integrity_summary,
    grouping_scope,
  });
}

export { resolveIncidentIdentity } from './incidentIdentityResolver.js';
export default recordProposalGenerationIncident;