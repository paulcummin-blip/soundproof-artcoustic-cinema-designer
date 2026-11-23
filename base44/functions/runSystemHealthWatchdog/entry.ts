import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { STALL_THRESHOLDS, stallSeverity } from '../../shared/systemHealth/operationMonitor.js';
import { recordSystemIncident } from '../../shared/systemHealth/incidentRecorder.js';

/**
 * runSystemHealthWatchdog
 * -----------------------
 * Independent scheduled watchdog that detects operations that started but
 * never reported successful completion or a known failure. Called by the
 * System Health Watchdog workflow every 5 minutes.
 *
 * SAFETY: the watchdog only inspects and updates MonitoredOperation and
 * SystemHealthIncident records. It NEVER restarts proposal generation,
 * creates projects/proposals, deducts tokens, sends invitations, creates
 * PDFs, changes engineering, or modifies dealer access.
 *
 * Admin-only: the workflow calls this as an app admin, but the endpoint is
 * also guarded so non-admins cannot invoke it directly.
 */
export default async function(req) {
  const results = { checked: 0, suspected: 0, confirmed: 0, cleared: 0, errors: 0 };

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const now = Date.now();

    // Find all running and suspected_stalled operations.
    const page = await base44.asServiceRole.entities.MonitoredOperation.filter(
      { state: { $in: ['running', 'suspected_stalled'] } },
      { sort: '-started_at', limit: 100 },
    );
    const operations = page?.items || [];
    results.checked = operations.length;

    for (const op of operations) {
      try {
        const thresholds = STALL_THRESHOLDS[op.operation_type] || STALL_THRESHOLDS.proposal_generation;
        const lastProgressMs = op.last_progress_at
          ? new Date(op.last_progress_at).getTime()
          : new Date(op.started_at).getTime();
        const elapsed = now - lastProgressMs;

        if (elapsed >= thresholds.confirmed_ms) {
          // Confirmed failure — create incident and mark failed.
          // Only if not already notified (prevents duplicate emails).
          if (!op.watchdog_notified) {
            const severity = stallSeverity(op.operation_type);
            const elapsedSec = Math.round(elapsed / 1000);
            const diagnostic = `Operation ${op.operation_type} stalled at stage "${op.current_stage}". No progress for ${elapsedSec}s. Operation ID: ${op.operation_id}.`;

            const incidentResult = await recordSystemIncident(base44, {
              component: 'operation_monitoring',
              operation: op.operation_type,
              error_code: 'OPERATION_STALLED',
              severity,
              account_id: op.account_id || null,
              project_id: op.project_id || null,
              diagnostic_summary: diagnostic,
              operation_id: op.operation_id,
              operation_started_at: op.started_at || null,
              operation_last_progress_at: op.last_progress_at || null,
              stage_failed: op.current_stage || null,
              stage_timeline: Array.isArray(op.stage_timeline) ? op.stage_timeline : null,
              data_committed: op.data_committed ?? null,
              data_integrity_summary: op.data_integrity_summary || null,
            });

            await base44.asServiceRole.entities.MonitoredOperation.update(op.id, {
              state: 'failed',
              error_code: 'OPERATION_STALLED',
              diagnostic_summary: diagnostic,
              incident_reference: incidentResult?.reference || null,
              watchdog_notified: true,
            });
            results.confirmed++;
          }
        } else if (elapsed >= thresholds.suspected_ms) {
          // Suspected stalled — mark for the first time.
          if (op.state !== 'suspected_stalled') {
            await base44.asServiceRole.entities.MonitoredOperation.update(op.id, {
              state: 'suspected_stalled',
            });
            results.suspected++;
          }
        } else {
          // Progress is recent — clear suspected if it was suspected.
          if (op.state === 'suspected_stalled') {
            await base44.asServiceRole.entities.MonitoredOperation.update(op.id, {
              state: 'running',
            });
            results.cleared++;
          }
        }
      } catch (opErr) {
        console.error(`[watchdog] error processing operation ${op.operation_id}: ${opErr?.message}`);
        results.errors++;
      }
    }

    return Response.json({ success: true, ...results });
  } catch (error) {
    // Fail-open: a watchdog crash must not block anything.
    return Response.json({ success: false, error: error?.message, ...results }, { status: 500 });
  }
}