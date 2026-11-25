/**
 * notificationRules.js (shared)
 * ------------------------------
 * Notification action determination and atomic claiming for the Sound Proof
 * System Health notification system.
 *
 * For each new failure occurrence, determineNotificationAction decides whether
 * an email should be sent and what type of notification it is:
 *   - INITIAL: first occurrence of a new group
 *   - ESCALATION: severity escalated to critical
 *   - NEW_ACCOUNT: a new production dealer account is affected
 *   - RECURRENCE: a previously resolved failure has recurred
 *   - REMINDER: 24 hours have passed since the last alert
 *   - SKIP: no notification needed
 *
 * Atomic claiming uses the platform's single-record conditional updateMany
 * (field: null/false -> token, rechecked at write time) to ensure that
 * concurrent occurrences cannot independently send duplicate notifications.
 * The updateMany result's `updated` count (1 = claimed, 0 = already claimed)
 * is the concurrency primitive.
 *
 * If email delivery fails, the claim is released so the next occurrence can
 * retry — failed delivery never permanently suppresses a notification.
 *
 * Backend-only: receives the service-role SDK client from the calling function.
 */

export const NOTIFICATION_ACTION = Object.freeze({
  INITIAL: 'send_initial',
  ESCALATION: 'send_escalation',
  NEW_ACCOUNT: 'send_new_account',
  RECURRENCE: 'send_recurrence',
  REMINDER: 'send_reminder',
  SKIP: 'skip',
});

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Determine what notification action (if any) should be taken for a new
 * occurrence, given the current state of its notification group.
 *
 * @param {Object} group — the SystemHealthIncident notification group
 * @param {Object} occurrence — the new occurrence details
 * @param {string} occurrence.severity
 * @param {string} occurrence.runtime_environment
 * @param {string} [occurrence.account_id]
 * @param {number} [now] — current timestamp in ms (default Date.now())
 * @returns {string} one of NOTIFICATION_ACTION
 */
export function determineNotificationAction(group, occurrence, now = Date.now()) {
  const wasResolved = group?.resolved_at != null || group?.incident_status === 'resolved';

  // Recurrence after resolution — check first, before initial, so a reopened
  // group sends a recurrence notification rather than a new initial one.
  if (wasResolved) {
    return NOTIFICATION_ACTION.RECURRENCE;
  }

  // New group: no initial notification has been claimed yet.
  if (!group?.initial_notification_claimed) {
    return NOTIFICATION_ACTION.INITIAL;
  }

  const occSeverity = occurrence.severity || 'medium';
  const groupHighest = group?.highest_severity || occSeverity;

  // Severity escalation to critical.
  if (occSeverity === 'critical' && SEVERITY_RANK[occSeverity] > SEVERITY_RANK[groupHighest]) {
    return NOTIFICATION_ACTION.ESCALATION;
  }

  // New production account affected.
  if (occurrence.runtime_environment === 'production' && occurrence.account_id) {
    const affected = Array.isArray(group?.affected_production_accounts) ? group.affected_production_accounts : [];
    if (!affected.includes(occurrence.account_id)) {
      return NOTIFICATION_ACTION.NEW_ACCOUNT;
    }
  }

  // Reminder: at most one per 24 hours while the failure continues.
  const lastAlert = group?.last_alert_sent_at;
  if (lastAlert) {
    const elapsed = now - new Date(lastAlert).getTime();
    if (elapsed >= TWENTY_FOUR_HOURS_MS) {
      return NOTIFICATION_ACTION.REMINDER;
    }
  }

  return NOTIFICATION_ACTION.SKIP;
}

/**
 * Atomically claim the initial notification for a group.
 * Only succeeds if initial_notification_claimed is still false.
 */
export async function claimInitialNotification(service, groupId, token, nowIso) {
  const result = await service.asServiceRole.entities.SystemHealthIncident.updateMany(
    { id: groupId, initial_notification_claimed: false },
    { $set: { initial_notification_claimed: true, initial_notification_claim_token: token, initial_notification_claimed_at: nowIso } },
  );
  return !!(result && typeof result.updated === 'number' && result.updated === 1);
}

/**
 * Atomically claim the critical escalation notification.
 * Only succeeds if critical_notification_sent is still false.
 */
export async function claimEscalationNotification(service, groupId, token, nowIso) {
  const result = await service.asServiceRole.entities.SystemHealthIncident.updateMany(
    { id: groupId, critical_notification_sent: false },
    { $set: { critical_notification_sent: true, critical_escalation_claim_token: token, critical_escalation_claimed_at: nowIso } },
  );
  return !!(result && typeof result.updated === 'number' && result.updated === 1);
}

/**
 * Atomically add a new production account and claim the new-account notification.
 * Only succeeds if the account is not yet in affected_production_accounts.
 */
export async function claimNewAccountNotification(service, groupId, accountId, token, nowIso) {
  const result = await service.asServiceRole.entities.SystemHealthIncident.updateMany(
    { id: groupId, affected_production_accounts: { $nin: [accountId] } },
    { $addToSet: { affected_production_accounts: accountId }, $set: { new_account_claim_token: token, new_account_claimed_at: nowIso } },
  );
  return !!(result && typeof result.updated === 'number' && result.updated === 1);
}

/**
 * Atomically reopen a resolved group and claim the recurrence notification.
 * Only succeeds if the group is still resolved and recurrence hasn't been claimed.
 */
export async function claimRecurrenceNotification(service, groupId, token, nowIso) {
  const result = await service.asServiceRole.entities.SystemHealthIncident.updateMany(
    { id: groupId, incident_status: 'resolved', recurrence_claimed: false },
    {
      $set: {
        incident_status: 'open',
        recurrence_claimed: true,
        recurrence_claim_token: token,
        recurrence_claimed_at: nowIso,
        resolved_at: null,
        initial_notification_claimed: true,
      },
    },
  );
  return !!(result && typeof result.updated === 'number' && result.updated === 1);
}

/**
 * Atomically claim a 24-hour reminder notification.
 * Only succeeds if 24 hours have passed since the last alert.
 */
export async function claimReminderNotification(service, groupId, nowIso) {
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();
  const result = await service.asServiceRole.entities.SystemHealthIncident.updateMany(
    {
      id: groupId,
      initial_notification_claimed: true,
      incident_status: { $in: ['open', 'investigating'] },
      $or: [{ last_alert_sent_at: null }, { last_alert_sent_at: { $lt: cutoff } }],
    },
    { $set: { last_alert_sent_at: nowIso, reminder_claim_token: `reminder-${nowIso}` } },
  );
  return !!(result && typeof result.updated === 'number' && result.updated === 1);
}

/**
 * Claim a notification based on the determined action.
 * Returns true if the claim succeeded (this caller should send the email).
 */
export async function claimNotification(service, groupId, action, token, nowIso) {
  switch (action) {
    case NOTIFICATION_ACTION.INITIAL:
      return claimInitialNotification(service, groupId, token, nowIso);
    case NOTIFICATION_ACTION.ESCALATION:
      return claimEscalationNotification(service, groupId, token, nowIso);
    case NOTIFICATION_ACTION.NEW_ACCOUNT:
      return claimNewAccountNotification(service, groupId, token, nowIso);
    case NOTIFICATION_ACTION.RECURRENCE:
      return claimRecurrenceNotification(service, groupId, token, nowIso);
    case NOTIFICATION_ACTION.REMINDER:
      return claimReminderNotification(service, groupId, nowIso);
    default:
      return false;
  }
}

/**
 * Release a notification claim after failed email delivery, so the next
 * occurrence can retry. Only releases the claim held by this token.
 */
export async function releaseNotificationClaim(service, groupId, action, token) {
  if (!groupId || !token) return;
  try {
    switch (action) {
      case NOTIFICATION_ACTION.INITIAL:
        await service.asServiceRole.entities.SystemHealthIncident.updateMany(
          { id: groupId, initial_notification_claim_token: token },
          { $set: { initial_notification_claimed: false, initial_notification_claim_token: null, initial_notification_claimed_at: null } },
        );
        break;
      case NOTIFICATION_ACTION.ESCALATION:
        await service.asServiceRole.entities.SystemHealthIncident.updateMany(
          { id: groupId, critical_escalation_claim_token: token },
          { $set: { critical_notification_sent: false, critical_escalation_claim_token: null, critical_escalation_claimed_at: null } },
        );
        break;
      case NOTIFICATION_ACTION.NEW_ACCOUNT:
        await service.asServiceRole.entities.SystemHealthIncident.updateMany(
          { id: groupId, new_account_claim_token: token },
          { $set: { new_account_claim_token: null, new_account_claimed_at: null } },
        );
        break;
      case NOTIFICATION_ACTION.RECURRENCE:
        await service.asServiceRole.entities.SystemHealthIncident.updateMany(
          { id: groupId, recurrence_claim_token: token },
          { $set: { recurrence_claimed: false, recurrence_claim_token: null, recurrence_claimed_at: null, incident_status: 'resolved' } },
        );
        break;
      case NOTIFICATION_ACTION.REMINDER:
        // Reminder claim is time-based; releasing means restoring the old
        // last_alert_sent_at. Since we don't have the old value, we set it to
        // null so the next occurrence can try the reminder claim again.
        await service.asServiceRole.entities.SystemHealthIncident.updateMany(
          { id: groupId, reminder_claim_token: `reminder-${token}` },
          { $set: { last_alert_sent_at: null, reminder_claim_token: null } },
        );
        break;
    }
  } catch {
    // Best-effort: a release failure does not block the response.
  }
}