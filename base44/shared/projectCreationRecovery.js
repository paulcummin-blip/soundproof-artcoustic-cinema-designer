/**
 * projectCreationRecovery.js (shared)
 * ----------------------------------
 * Reconciles an interrupted (non-COMPLETED) ProjectCreationReceipt against the
 * real Project / CapacityLedger / PromotionUsage state, instead of risking a
 * duplicate project or duplicate charge on retry.
 *
 * Returns one of:
 *   { outcome: 'replay',                 responsePayload }  — COMPLETED receipt, replay verbatim.
 *   { outcome: 'resumed_to_completion',   responsePayload }  — a missing ledger/usage was created
 *                                                               (idempotently) and the receipt completed.
 *   { outcome: 'restart',                reason }             — confirmed no committed write for
 *                                                               this request; safe to create fresh.
 *   { outcome: 'reconciling',            reason, error?, project_id? } — a write may have committed
 *                                                               and cannot be auto-resolved; admin must
 *                                                               reconcile. Never create a duplicate here.
 *
 * This module never deletes an existing transaction, never creates a second
 * ledger/usage for the same project (idempotency_key / project_id guards), and
 * never creates a second project. A 'restart' outcome means the caller may
 * delete the stale receipt and proceed with a fresh creation.
 */

import { findActivationEntry, getAvailableCapacity } from './capacityAuthority.js';
import { completeReceipt, markReceiptReconciling } from './projectCreationIdempotency.js';

async function fetchProject(service, projectId) {
  if (!projectId) return null;
  try {
    const rows = await service.entities.Project.filter({ id: projectId });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch { return null; }
}

async function findUsageForProject(service, projectId) {
  if (!projectId) return null;
  try {
    const rows = await service.entities.PromotionUsage.filter({ project_id: projectId });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch { return null; }
}

function capacitySuccessPayload(project, ledgerEntry, capacityBefore, capacityAfter) {
  return {
    status: 'SUCCESS',
    project,
    capacity_before: capacityBefore,
    capacity_after: capacityAfter,
    ledger_entry: {
      id: ledgerEntry.id,
      transaction_type: ledgerEntry.transaction_type,
      delta: ledgerEntry.delta,
      idempotency_key: ledgerEntry.idempotency_key,
    },
  };
}

function promoSuccessPayload(project, promotionId) {
  return {
    status: 'SUCCESS',
    project,
    promotion: { id: promotionId, promotion_type: 'UNLIMITED_PRO_PROJECTS' },
    capacity_before: null,
    capacity_after: null,
    ledger_entry: null,
  };
}

export async function reconcilePendingReceipt(service, receipt, ctx) {
  if (!receipt) return { outcome: 'restart', reason: 'NO_RECEIPT' };

  if (receipt.status === 'COMPLETED' && receipt.response_payload) {
    return { outcome: 'replay', responsePayload: receipt.response_payload };
  }

  const stage = receipt.stage || 'PENDING';
  const accountId = receipt.account_id;
  const projectId = receipt.project_id || null;
  const creationPath = receipt.creation_path || 'capacity';
  const nowIso = new Date().toISOString();

  // ── Capacity path: a project was confirmed created (capacity path only) ──
  // The promotional path is handled below, so exclude it here to avoid a
  // promo PROJECT_CREATED receipt being treated as a capacity creation.
  if (creationPath !== 'promotion' && (stage === 'PROJECT_CREATED' || stage === 'LEDGER_CREATED')) {
    const project = await fetchProject(service, projectId);
    if (!project) {
      // Project reported created but is absent. If a ledger exists for it, a
      // charge was made for a now-missing project — admin must reconcile.
      const ledger = await findActivationEntry(service, projectId);
      if (ledger) {
        await markReceiptReconciling(service, receipt.id);
        return { outcome: 'reconciling', reason: 'PROJECT_MISSING_LEDGER_EXISTS', project_id: projectId };
      }
      // No project and no ledger: nothing committed. Safe to restart.
      return { outcome: 'restart', reason: 'PROJECT_MISSING_NO_LEDGER' };
    }

    let ledger = await findActivationEntry(service, project.id);
    if (ledger) {
      // The creation actually succeeded before the interruption — complete it.
      const after = await getAvailableCapacity(service, accountId);
      const payload = capacitySuccessPayload(project, ledger, after, after);
      await completeReceipt(service, receipt.id, {
        project_id: project.id, ledger_entry_id: ledger.id, response_payload: payload,
      }, nowIso);
      return { outcome: 'resumed_to_completion', responsePayload: payload };
    }

    // Project exists, no ledger — create it now (idempotent by project id).
    try {
      ledger = await service.entities.CapacityLedger.create({
        account_id: accountId,
        transaction_type: 'PROJECT_ACTIVATION',
        delta: -1,
        idempotency_key: `activation:${project.id}`,
        source_system: 'SOUND_PROOF',
        source_ref: { project_id: project.id },
        reason: `Project activation (recovery): ${project.name || ''}`,
      });
      try {
        await service.entities.Project.update(project.id, { activation_ledger_entry_id: ledger.id });
      } catch { /* non-fatal */ }
      const after = await getAvailableCapacity(service, accountId);
      const before = after + 1;
      const payload = capacitySuccessPayload(project, ledger, before, after);
      await completeReceipt(service, receipt.id, {
        project_id: project.id, ledger_entry_id: ledger.id, response_payload: payload,
      }, nowIso);
      return { outcome: 'resumed_to_completion', responsePayload: payload };
    } catch (err) {
      await markReceiptReconciling(service, receipt.id);
      return { outcome: 'reconciling', reason: 'LEDGER_CREATE_FAILED', error: err?.message, project_id: projectId };
    }
  }

  // ── Promotional path: project confirmed created, usage pending ──────────
  if (stage === 'USAGE_CREATED' || (stage === 'PROJECT_CREATED' && creationPath === 'promotion')) {
    const project = await fetchProject(service, projectId);
    if (!project) {
      const usage = await findUsageForProject(service, projectId);
      if (usage) {
        await markReceiptReconciling(service, receipt.id);
        return { outcome: 'reconciling', reason: 'PROJECT_MISSING_USAGE_EXISTS', project_id: projectId };
      }
      // No project, no usage, no ledger (promo path charges nothing): safe restart.
      return { outcome: 'restart', reason: 'PROJECT_MISSING_NO_USAGE' };
    }

    let usage = await findUsageForProject(service, project.id);
    if (usage) {
      const payload = promoSuccessPayload(project, receipt.promotion_id);
      await completeReceipt(service, receipt.id, {
        project_id: project.id, promotion_id: receipt.promotion_id, response_payload: payload,
      }, nowIso);
      return { outcome: 'resumed_to_completion', responsePayload: payload };
    }

    try {
      usage = await service.entities.PromotionUsage.create({
        promotion_id: receipt.promotion_id,
        account_id: accountId,
        project_id: project.id,
        promotion_type: 'UNLIMITED_PRO_PROJECTS',
        used_at: nowIso,
      });
      const payload = promoSuccessPayload(project, receipt.promotion_id);
      await completeReceipt(service, receipt.id, {
        project_id: project.id, promotion_id: receipt.promotion_id, response_payload: payload,
      }, nowIso);
      return { outcome: 'resumed_to_completion', responsePayload: payload };
    } catch (err) {
      await markReceiptReconciling(service, receipt.id);
      return { outcome: 'reconciling', reason: 'USAGE_CREATE_FAILED', error: err?.message, project_id: projectId };
    }
  }

  // ── PENDING with no confirmed write ──────────────────────────────────────
  // project.create may have committed without us recording its id. We cannot
  // find the orphan without scanning, so we refuse to create a duplicate.
  await markReceiptReconciling(service, receipt.id);
  return { outcome: 'reconciling', reason: 'UNCERTAIN_PRE_PROJECT_CREATE' };
}