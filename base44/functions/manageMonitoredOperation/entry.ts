import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  startOperation,
  reportOperationProgress,
  completeOperation,
  failOperation,
  cancelOperation,
} from '../../shared/systemHealth/operationMonitor.js';

/**
 * manageMonitoredOperation
 * ------------------------
 * Frontend-facing endpoint for reporting operation lifecycle events to the
 * durable MonitoredOperation record. Used by browser-based operations (report
 * export) that need to report progress to the backend so the watchdog can
 * detect stalls when the browser tab closes.
 *
 * All actions are fail-open: a monitoring failure returns an error but never
 * blocks the dealer's operation.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      case 'start':
        return Response.json(await startOperation(base44, {
          operation_id: body.operation_id,
          operation_type: body.operation_type,
          account_id: body.account_id || null,
          project_id: body.project_id || null,
          version_id: body.version_id || null,
          proposal_id: body.proposal_id || null,
          initial_stage: body.initial_stage || 'started',
        }));

      case 'progress':
        return Response.json(await reportOperationProgress(base44, {
          operation_id: body.operation_id,
          stage: body.stage,
        }));

      case 'complete':
        return Response.json(await completeOperation(base44, {
          operation_id: body.operation_id,
          proposal_id: body.proposal_id || null,
        }));

      case 'fail':
        return Response.json(await failOperation(base44, {
          operation_id: body.operation_id,
          error_code: body.error_code || 'UNKNOWN',
          diagnostic_summary: body.diagnostic_summary || null,
          incident_reference: body.incident_reference || null,
        }));

      case 'cancel':
        return Response.json(await cancelOperation(base44, {
          operation_id: body.operation_id,
        }));

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    // Fail-open: never block the dealer's operation.
    return Response.json({ recorded: false, error: error?.message || 'Monitoring failed', fail_open: true });
  }
}