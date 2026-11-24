import {recordSystemIncident} from "./incidentRecorder.js";
/**
 * operationMonitor.js (shared)
 * ----------------------------
 * Durable operation lifecycle tracking for Sound Proof System Health.
 *
 * Called by trusted backend functions (generateProposal, manageMonitoredOperation,
 * runSystemHealthWatchdog) to record the start, progress, completion and failure
 * of critical operations. Each operation gets a durable MonitoredOperation record
 * that the watchdog inspects to detect stalls.
 *
 * FAIL-OPEN: every function catches its own errors and never throws. Monitoring
 * failures must not block the dealer's operation. A failed monitoring write
 * returns { recorded: false, error } and the caller continues.
 *
 * SAFETY: the record never stores proposal text, client briefs, passwords,
 * tokens, secrets or confidential content — only safe diagnostic codes, stage
 * names and operation identifiers.
 *
 * Backend-only: receives the service-role SDK client from the calling function.
 */

export const OPERATION_TYPE = Object.freeze({
  PROPOSAL_GENERATION: 'proposal_generation',
  REPORT_EXPORT: 'report_export',
  CLIENT_REQUEST: 'client_request',
});

/**
 * Conservative initial stall thresholds (milliseconds), informed by measured
 * durations. A long but progressing 42-page report must not be marked failed.
 *
 * - suspected_ms: time since last_progress_at before marking 'suspected_stalled'.
 * - confirmed_ms: time since last_progress_at before confirming failure.
 *
 * Proposal generation: 10 min suspected, 20 min confirmed.
 * Report export: 15 min suspected, 30 min confirmed (PDF capture can be slow).
 */
export const STALL_THRESHOLDS = Object.freeze({
  client_request: { suspected_ms: 120000, confirmed_ms: 180000 },
  proposal_generation: { suspected_ms: 10 * 60 * 1000, confirmed_ms: 20 * 60 * 1000 },
  report_export: { suspected_ms: 15 * 60 * 1000, confirmed_ms: 30 * 60 * 1000 },
});

/**
 * Determine the severity of a confirmed stall for a given operation type.
 * Proposal generation stall = high (dealer is waiting, needs email alert).
 * Report export stall = high (dealer cannot finish; alert the administrator).
 */
export function stallSeverity(operationType) {
  switch (operationType) {
    case OPERATION_TYPE.PROPOSAL_GENERATION:
      return 'high';
    case OPERATION_TYPE.REPORT_EXPORT:
    case OPERATION_TYPE.CLIENT_REQUEST:
      return 'high';
    default:
      return 'medium';
  }
}

function extractRecord(filterResult) {
  return (Array.isArray(filterResult) ? filterResult : (filterResult?.items || []))[0] || null;
}

/**
 * Start monitoring an operation. Creates a MonitoredOperation record.
 */
export async function startOperation(serviceClient, {
  operation_id,
  operation_type,
  account_id = null,
  project_id = null,
  version_id = null,
  proposal_id = null,
  initial_stage = 'started',
  initiated_by = null,
  test_run_id = null,
}) {
  try {
    const now = new Date().toISOString();
    await serviceClient.asServiceRole.entities.MonitoredOperation.create({
      operation_id,
      operation_type,
      initiated_by,
      account_id,
      project_id,
      version_id,
      proposal_id,
      started_at: now,
      last_progress_at: now,
      current_stage: initial_stage,
      stage_timeline: [{ stage: initial_stage, timestamp: now }],
      state: 'running',
      error_code: null,
      diagnostic_summary: null,
      data_committed: null,
      data_integrity_summary: null,
      incident_reference: null,
      completed_at: null,
      cancelled_at: null,
      watchdog_notified: false,
      test_run_id: test_run_id || null,
    });
    return { recorded: true, operation_id };
  } catch (err) {
    console.error(`[operationMonitor] startOperation failed: ${err?.message || err}`);
    return { recorded: false, error: err?.message };
  }
}

/**
 * Report meaningful progress. Updates current_stage and last_progress_at,
 * and clears a suspected_stalled state back to running.
 */
export async function reportOperationProgress(serviceClient, { operation_id, stage }) {
  try {
    const existing = await serviceClient.asServiceRole.entities.MonitoredOperation.filter(
      { operation_id },
      { limit: 1 },
    );
    const record = extractRecord(existing);
    if (!record) return { recorded: false, error: 'Operation not found' };

    const now = new Date().toISOString();
    const timeline = Array.isArray(record.stage_timeline) ? record.stage_timeline : [];
    timeline.push({ stage, timestamp: now });
    await serviceClient.asServiceRole.entities.MonitoredOperation.update(record.id, {
      current_stage: stage,
      last_progress_at: now,
      stage_timeline: timeline,
      ...(record.state === 'suspected_stalled' ? { state: 'running' } : {}),
    });
    return { recorded: true, operation_id, stage };
  } catch (err) {
    console.error(`[operationMonitor] reportOperationProgress failed: ${err?.message || err}`);
    return { recorded: false, error: err?.message };
  }
}

/**
 * Mark an operation as completed. Only call after the stored artifact has
 * passed verification.
 */
export async function completeOperation(serviceClient, { operation_id, proposal_id = null, data_committed = null, data_integrity_summary = null }) {
  try {
    const existing = await serviceClient.asServiceRole.entities.MonitoredOperation.filter(
      { operation_id },
      { limit: 1 },
    );
    const record = extractRecord(existing);
    if (!record) return { recorded: false, error: 'Operation not found' };

    const now = new Date().toISOString();
    await serviceClient.asServiceRole.entities.MonitoredOperation.update(record.id, {
      state: 'completed',
      current_stage: 'completed',
      last_progress_at: now,
      completed_at: now,
      ...(proposal_id ? { proposal_id } : {}),
      ...(data_committed !== null ? { data_committed } : {}),
      ...(data_integrity_summary !== null ? { data_integrity_summary } : {}),
    });
    return { recorded: true, operation_id };
  } catch (err) {
    console.error(`[operationMonitor] completeOperation failed: ${err?.message || err}`);
    return { recorded: false, error: err?.message };
  }
}

/**
 * Mark an operation as failed. Links the incident reference when available.
 */
export async function failOperation(serviceClient, {
  operation_id,
  error_code,
  diagnostic_summary = null,
  incident_reference = null,
  data_committed = null,
  data_integrity_summary = null,
}) {
  try {
    const existing = await serviceClient.asServiceRole.entities.MonitoredOperation.filter(
      { operation_id },
      { limit: 1 },
    );
    const record = extractRecord(existing);
    if (!record) return { recorded: false, error: 'Operation not found' };

    if (!incident_reference) {
      const incident = await recordSystemIncident(serviceClient, {
        component:'operation_monitoring',operation:record.operation_type,error_code:error_code || 'UNEXPECTED_ERROR',severity:'high',
        account_id:record.account_id,project_id:record.project_id,version_id:record.version_id,
        diagnostic_summary:diagnostic_summary || 'The monitored operation failed.',
        operation_id,stage_failed:record.current_stage,stage_timeline:record.stage_timeline,
        data_committed,data_integrity_summary,
      });
      incident_reference=incident?.reference || null;
    }
    await serviceClient.asServiceRole.entities.MonitoredOperation.update(record.id, {
      state: 'failed',
      error_code: error_code || 'UNKNOWN',
      diagnostic_summary,
      incident_reference,
      last_progress_at: new Date().toISOString(),
      ...(data_committed !== null ? { data_committed } : {}),
      ...(data_integrity_summary !== null ? { data_integrity_summary } : {}),
    });
    return { recorded: true, operation_id };
  } catch (err) {
    console.error(`[operationMonitor] failOperation failed: ${err?.message || err}`);
    return { recorded: false, error: err?.message };
  }
}

/**
 * Mark an operation as cancelled (abandoned by the dealer).
 */
export async function cancelOperation(serviceClient, { operation_id }) {
  try {
    const existing = await serviceClient.asServiceRole.entities.MonitoredOperation.filter(
      { operation_id },
      { limit: 1 },
    );
    const record = extractRecord(existing);
    if (!record) return { recorded: false, error: 'Operation not found' };

    const now = new Date().toISOString();
    await serviceClient.asServiceRole.entities.MonitoredOperation.update(record.id, {
      state: 'cancelled',
      cancelled_at: now,
      last_progress_at: now,
    });
    return { recorded: true, operation_id };
  } catch (err) {
    console.error(`[operationMonitor] cancelOperation failed: ${err?.message || err}`);
    return { recorded: false, error: err?.message };
  }
}

export default {
  startOperation,
  reportOperationProgress,
  completeOperation,
  failOperation,
  cancelOperation,
  OPERATION_TYPE,
  STALL_THRESHOLDS,
  stallSeverity,
};