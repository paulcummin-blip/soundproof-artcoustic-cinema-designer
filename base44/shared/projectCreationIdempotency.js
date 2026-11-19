/**
 * projectCreationIdempotency.js (shared)
 * --------------------------------------
 * Request-level idempotency for Professional Project creation.
 *
 * A client-supplied request_id (UUID) scoped to the account makes a repeated
 * request return its original result instead of creating a second project.
 *
 * Receipt lifecycle (stage tracks the last CONFIRMED write for crash recovery):
 *   PENDING        — reserved, no write attempted/confirmed yet.
 *   PROJECT_CREATED — the Project write returned successfully (project_id known).
 *   LEDGER_CREATED  — the CapacityLedger -1 entry was confirmed (capacity path).
 *   USAGE_CREATED   — the PromotionUsage row was confirmed (promotional path).
 *   COMPLETED       — fully done; response_payload is replayable to an identical retry.
 *   RECONCILING     — an uncertain failure: a write may have committed before the
 *                     response was lost. Do NOT retry blindly; recovery inspects
 *                     the real Project/Ledger/Usage state (projectCreationRecovery).
 *
 * Rules honoured by createProfessionalProject:
 *   - A COMPLETED receipt replays its stored payload.
 *   - A non-COMPLETED receipt is RECONCILED (see projectCreationRecovery), never
 *     blindly replayed or deleted.
 *   - A receipt is NEVER deleted merely because a Project/Ledger write returned
 *     an error (that write may have committed).
 *   - The only confirmed no-write exit that deletes the receipt is OUT_OF_CAPACITY
 *     (a read-only determination made before any write).
 *   - No automatic refund/rollback is ever issued without confirming the original
 *     transaction.
 */

export async function findExistingReceipt(service, accountId, requestId) {
  if (!accountId || !requestId) return null;
  const rows = await service.entities.ProjectCreationReceipt.filter({
    account_id: accountId,
    request_id: requestId,
  });
  const arr = Array.isArray(rows) ? rows : [];
  return arr.length > 0 ? arr[0] : null;
}

export async function createPendingReceipt(service, accountId, requestId, nowIso, creationPath) {
  return service.entities.ProjectCreationReceipt.create({
    account_id: accountId,
    request_id: requestId,
    status: 'PENDING',
    stage: 'PENDING',
    creation_path: creationPath || 'capacity',
    created_at: nowIso,
  });
}

export async function completeReceipt(service, receiptId, payload, nowIso) {
  if (!receiptId) return null;
  return service.entities.ProjectCreationReceipt.update(receiptId, {
    status: 'COMPLETED',
    stage: 'COMPLETED',
    project_id: payload?.project_id || null,
    promotion_id: payload?.promotion_id || null,
    ledger_entry_id: payload?.ledger_entry_id || null,
    response_payload: payload?.response_payload || null,
    completed_at: nowIso,
  });
}

/**
 * Persist the creation stage and any newly-known object id on the receipt, so an
 * interrupted creation is recoverable. Best-effort: stage is for recovery only.
 */
export async function updateReceiptStage(service, receiptId, patch) {
  if (!receiptId) return null;
  try {
    return await service.entities.ProjectCreationReceipt.update(receiptId, patch);
  } catch { /* best-effort: stage is diagnostic for recovery */ return null; }
}

export async function markReceiptReconciling(service, receiptId) {
  return updateReceiptStage(service, receiptId, { stage: 'RECONCILING' });
}

export async function deleteReceipt(service, receiptId) {
  if (!receiptId) return;
  try {
    await service.entities.ProjectCreationReceipt.delete(receiptId);
  } catch { /* best-effort */ }
}