/**
 * notificationGroupKey.js (shared)
 * ---------------------------------
 * Computes the notification group identity for a system health incident.
 *
 * The group key separates failures by:
 *   1. Verified underlying failure mechanism (e.g. ENTITY_RATE_LIMIT_429)
 *   2. Runtime environment (preview vs production)
 *   3. Affected account scope
 *
 * This deliberately excludes volatile details (operation, page, project,
 * version) so that the same underlying defect manifesting on different
 * operations, pages or projects is recognised as the same notification group.
 *
 * Preview and production NEVER share a group. Different production dealer
 * accounts NEVER share a group.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/**
 * Classify an HTTP status as a rate-limit mechanism.
 * Returns the mechanism string, or null if the status is not a rate limit.
 */
function classifyRateLimit(httpStatus) {
  if (httpStatus === 429) return 'ENTITY_RATE_LIMIT_429';
  return null;
}

/**
 * Normalize the underlying failure mechanism from the incident context.
 *
 * When structured evidence (http_status) confirms a rate-limit exhaustion,
 * all related failures — across different entity operations, pages, projects
 * and versions, including consequential project-opening failures — share
 * the same mechanism. This is the key grouping insight: a failed data
 * request that prevents a project from opening produces a PROJECT_LOAD_FAILED
 * error code but the same ENTITY_RATE_LIMIT_429 mechanism.
 *
 * Where the underlying mechanism is ambiguous (no http_status, or an error
 * code that could have multiple causes), the error code itself is used as
 * the mechanism. This keeps unrelated failures in separate groups.
 *
 * @param {Object} input
 * @param {string} [input.error_code]
 * @param {number} [input.http_status]
 * @param {string} [input.component]
 * @param {string} [input.operation]
 * @returns {string} the normalized failure mechanism
 */
export function normalizeFailureMechanism({
  error_code = '',
  http_status = null,
  component = '',
  operation = '',
  detail = '',
} = {}) {
  // HTTP 429 rate limit: the strongest evidence. When the HTTP status is
  // explicitly 429, the mechanism is the rate limit regardless of the
  // error code (DATA_REQUEST_FAILED, PROJECT_LOAD_FAILED, etc.).
  const rateLimit = classifyRateLimit(http_status);
  if (rateLimit) return rateLimit;

  // Authentication failures have a distinct, stable mechanism.
  if (error_code === 'AUTHENTICATION_CONTEXT_FAILED') return 'AUTHENTICATION_CONTEXT_FAILED';

  // REPORT_NARRATIVE_FAILED covers several genuinely independent terminal
  // causes (a validation rule refusal, a writer flag-off, a provider failure,
  // an acceptance-text-missing outcome). Grouping them all under one generic
  // mechanism suppresses independent failures affecting different projects: a
  // dealer blocked by a verification-disclaimer refusal and a dealer blocked by
  // a provider timeout are not the same underlying defect. The detail string
  // carries the specific sub-cause (e.g. "validation_failed:
  // verification_disclaimer:conditional_on_future_confirmation" or
  // "writer_flag_off" or "provider_failed"), so the mechanism is refined to
  // the specific cause. The same cause recurring on different projects still
  // groups together (one underlying defect, no duplicate emails); different
  // causes stay in separate actionable incidents.
  if (error_code === 'REPORT_NARRATIVE_FAILED') {
    return refineReportNarrativeMechanism(detail);
  }

  // For all other failures, use the error code as the mechanism. This is
  // conservative: two different error codes are never grouped together
  // unless they share the same HTTP status evidence.
  return error_code || 'UNKNOWN';
}

/**
 * Refine the REPORT_NARRATIVE_FAILED mechanism to the specific underlying
 * cause carried in the detail string. The detail arrives as
 * "<reason>: <rule>:<sub-rule>" (e.g. "validation_failed:
 * verification_disclaimer:conditional_on_future_confirmation") or as a single
 * refusal code ("writer_flag_off", "provider_failed",
 * "accepted_text_missing"). The first two colon-separated segments identify
 * the cause family and the specific rule, which is the right granularity for
 * grouping: the same validation rule recurring is one underlying defect; a
 * different validation rule or a non-validation refusal is a different one.
 */
function refineReportNarrativeMechanism(detail) {
  const text = String(detail || '').trim();
  if (!text) return 'REPORT_NARRATIVE_FAILED:unknown';
  const segments = text.split(':').map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0) return 'REPORT_NARRATIVE_FAILED:unknown';
  // reason (e.g. "validation_failed") identifies the cause family.
  const reason = segments[0] || 'unknown';
  // The second segment is the specific rule for a validation failure (e.g.
  // "verification_disclaimer"). For a non-validation refusal (writer_flag_off,
  // provider_failed) there is no second segment, so the reason alone is the
  // specific cause.
  const rule = segments[1] || null;
  return rule
    ? `REPORT_NARRATIVE_FAILED:${reason}:${rule}`
    : `REPORT_NARRATIVE_FAILED:${reason}`;
}

/**
 * Compute the notification group key.
 *
 * @param {Object} input
 * @param {string} input.failure_mechanism — normalized mechanism from normalizeFailureMechanism
 * @param {string} input.runtime_environment — 'preview' or 'production'
 * @param {string} [input.account_id] — affected account ID, or null for internal
 * @returns {string} the notification group key
 */
export function computeNotificationGroupKey({
  failure_mechanism = '',
  runtime_environment = 'production',
  account_id = null,
} = {}) {
  const env = runtime_environment === 'preview' ? 'preview' : 'production';
  const account = account_id || 'internal';
  return `${failure_mechanism}::${env}::${account}`;
}

export default computeNotificationGroupKey;