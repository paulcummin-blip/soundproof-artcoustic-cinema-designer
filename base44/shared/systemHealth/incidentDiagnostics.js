/**
 * incidentDiagnostics.js (shared)
 * ------------------------------
 * Classification and enrichment logic for System Health incidents.
 *
 * Determines cause classification (confirmed / suspected / unknown), user
 * impact (blocked / workaround available), and reads enriched diagnostics
 * from the MonitoredOperation record.
 *
 * Pure classification functions — no SDK, no React, no runtime-specific APIs.
 * The readOperationDiagnostics function receives the service-role SDK client
 * from the calling backend function.
 *
 * PRINCIPLE: a watchdog reporting no progress for 25 minutes is evidence of
 * a stalled operation, not proof of an AI provider failure. Cause
 * classifications are conservative: 'suspected' when the evidence is
 * circumstantial, 'confirmed' only when the error code directly states the
 * cause, 'unknown' when the cause is undetermined.
 */

/**
 * Classify the cause of an incident from its error code and component.
 * Returns { cause_classification, cause_summary }.
 *
 * @param {string} errorCode
 * @param {string} component
 * @returns {{ cause_classification: 'confirmed'|'suspected'|'unknown', cause_summary: string }}
 */
export function classifyCause(errorCode, component = '') {
  const code = errorCode || 'UNKNOWN';

  // Direct failures where the error code states the cause.
  const confirmedCauses = {
    DRAFT_REJECTED: 'The proposal writer produced a draft that failed the validation contract. The violation codes are recorded in the diagnostic summary.',
    SECTION_MAPPING_FAILED: 'The validated copy could not be mapped to the proposal section structure. The unmapped section types are recorded.',
    PROVIDER_FAILED: 'The AI provider returned an error or no response.',
    WRITER_REFUSAL: 'The writer refused to produce a draft because a pre-condition was not met.',
    EVIDENCE_READ_FAILED: 'The evidence reader could not build the frozen evidence pack from the saved Project Report.',
    READINESS_GATE_FAILED: 'The readiness gate blocked generation because the Project Report is stale or missing.',
    COMPARISON_EVIDENCE_MISSING: 'Comparison evidence could not be built for all selected versions.',
    COMPARISON_TABLE_EMPTY: 'The comparison table could not be built from the available evidence.',
    STORAGE_FAILED: 'The report PDF could not be stored to the issued-document library.',
    PRINT_PREPARATION_FAILED: 'Print preparation failed before the print dialogue could open.',
    EXPORT_FAILED: 'The report export failed during preparation.',
  };

  if (confirmedCauses[code]) {
    return { cause_classification: 'confirmed', cause_summary: confirmedCauses[code] };
  }

  // Circumstantial evidence: the watchdog detected no progress, but the
  // underlying cause is not confirmed by an error response.
  if (code === 'OPERATION_STALLED') {
    return {
      cause_classification: 'suspected',
      cause_summary: 'The operation stopped reporting progress. The watchdog confirmed no progress for the stall threshold duration. The underlying cause (provider failure, browser crash, network loss, or code defect) has not been confirmed by an error response.',
    };
  }

  // Unknown cause.
  return {
    cause_classification: 'unknown',
    cause_summary: 'The cause has not been determined. The error was unexpected and no specific failure path was recorded.',
  };
}

/**
 * Determine whether the user remains blocked and whether a workaround is
 * available, based on the error code and component.
 *
 * @param {string} errorCode
 * @param {string} component
 * @returns {{ user_blocked: boolean|null, workaround_available: boolean|null }}
 */
export function determineUserImpact(errorCode, component = '') {
  const code = errorCode || 'UNKNOWN';

  // Pre-condition failures: the user cannot proceed until the condition is
  // fixed. No workaround is available — they must regenerate the report or
  // fix the evidence.
  if (['WRITER_REFUSAL', 'EVIDENCE_READ_FAILED', 'READINESS_GATE_FAILED', 'COMPARISON_EVIDENCE_MISSING', 'COMPARISON_TABLE_EMPTY'].includes(code)) {
    return { user_blocked: true, workaround_available: false };
  }

  // Retryable failures: the user can retry the operation.
  if (['DRAFT_REJECTED', 'SECTION_MAPPING_FAILED', 'PROVIDER_FAILED', 'STORAGE_FAILED', 'PRINT_PREPARATION_FAILED', 'EXPORT_FAILED'].includes(code)) {
    return { user_blocked: false, workaround_available: true };
  }

  // Watchdog stall: the user may or may not still be waiting. The operation
  // might still be running, or the browser may have crashed. We cannot
  // determine whether the user is blocked without more information.
  if (code === 'OPERATION_STALLED') {
    return { user_blocked: null, workaround_available: null };
  }

  // Unknown: cannot determine.
  return { user_blocked: null, workaround_available: null };
}

/**
 * Read enriched diagnostics from the MonitoredOperation record.
 * Returns null when the operation is not found.
 *
 * @param {Object} serviceClient — base44 SDK client with asServiceRole
 * @param {string} operation_id
 * @returns {Promise<Object|null>}
 */
export async function readOperationDiagnostics(serviceClient, operation_id) {
  if (!operation_id) return null;
  try {
    const result = await serviceClient.asServiceRole.entities.MonitoredOperation.filter(
      { operation_id },
      { limit: 1 },
    );
    const record = (Array.isArray(result) ? result : (result?.items || []))[0] || null;
    if (!record) return null;

    return {
      operation_started_at: record.started_at || null,
      operation_last_progress_at: record.last_progress_at || null,
      stage_failed: record.current_stage || null,
      stage_timeline: Array.isArray(record.stage_timeline) ? record.stage_timeline : null,
      data_committed: record.data_committed ?? null,
      data_integrity_summary: record.data_integrity_summary || null,
    };
  } catch {
    return null;
  }
}