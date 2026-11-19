import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { forceReleaseCreationLock, readCreationLockState } from '../../shared/projectCreationLock.js';
import { findExistingReceipt } from '../../shared/projectCreationIdempotency.js';
import { findActivationEntry } from '../../shared/capacityAuthority.js';

/**
 * Master-admin-only reconciliation path for stuck or uncertain Professional
 * Project creations.
 *
 * Read-only by default: reports the per-account creation lock state and every
 * ProjectCreationReceipt for the account (or a single request_id), with the
 * real Project / CapacityLedger / PromotionUsage existence checked for each,
 * so an administrator can see exactly what committed.
 *
 * With force_release_lock: true it force-releases a stuck creation lock (one
 * left by a crashed request). It does NOT reclaim based on age and does NOT
 * delete receipts, projects, ledgers or usages — those remain for the admin
 * to resolve deliberately. No automatic refund is ever issued here.
 */

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const accessContext = await resolveAccountAccess(base44, user);
    if (!accessContext?.isMasterAdmin) {
      return Response.json({ error: 'Master admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { account_id, request_id, force_release_lock } = body || {};
    if (!account_id) {
      return Response.json({ error: 'account_id required.' }, { status: 400 });
    }

    const service = base44.asServiceRole;
    const lockState = await readCreationLockState(service, account_id);

    // Gather receipts to inspect.
    const receiptRows = [];
    if (request_id) {
      const r = await findExistingReceipt(service, account_id, request_id);
      if (r) receiptRows.push(r);
    } else {
      const rows = await service.entities.ProjectCreationReceipt.filter({ account_id });
      for (const r of (Array.isArray(rows) ? rows : [])) receiptRows.push(r);
    }

    const inspected = [];
    for (const r of receiptRows) {
      const entry = {
        request_id: r.request_id,
        status: r.status,
        stage: r.stage || 'PENDING',
        creation_path: r.creation_path || null,
        project_id: r.project_id || null,
        ledger_entry_id: r.ledger_entry_id || null,
        promotion_id: r.promotion_id || null,
      };
      if (r.project_id) {
        try {
          const pRows = await service.entities.Project.filter({ id: r.project_id });
          entry.project_exists = (Array.isArray(pRows) && pRows.length > 0);
        } catch { entry.project_exists = 'unknown'; }
        try {
          entry.ledger_exists = !!(await findActivationEntry(service, r.project_id));
        } catch { entry.ledger_exists = 'unknown'; }
        try {
          const uRows = await service.entities.PromotionUsage.filter({ project_id: r.project_id });
          entry.usage_exists = (Array.isArray(uRows) && uRows.length > 0);
        } catch { entry.usage_exists = 'unknown'; }
      } else {
        entry.project_exists = false;
        entry.ledger_exists = false;
        entry.usage_exists = false;
      }
      inspected.push(entry);
    }

    let lockReleased = false;
    if (force_release_lock === true) {
      lockReleased = await forceReleaseCreationLock(service, account_id);
    }

    return Response.json({
      account_id,
      lock: lockState,
      lock_released: lockReleased,
      receipts: inspected,
    }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error?.message || 'Reconciliation failed.' }, { status: 500 });
  }
}