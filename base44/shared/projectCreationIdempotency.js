/**
 * projectCreationIdempotency.js (shared)
 * --------------------------------------
 * Request-level idempotency for Professional Project creation.
 *
 * A client-supplied request_id (UUID) scoped to the account makes a repeated
 * request return its original result instead of creating a second project.
 *
 * Lifecycle of a receipt:
 *   - On entry (under the per-account creation lock), if a COMPLETED receipt
 *     exists for (account_id, request_id), its response_payload is replayed.
 *   - If a PENDING receipt exists, another request is mid-flight: return
 *     CREATION_BUSY (never create a second project).
 *   - Otherwise a PENDING receipt is reserved before any Project/Ledger write,
 *     so a crash mid-creation leaves PENDING and a later retry backs off
 *     rather than duplicating the project (the safe failure).
 *   - On success the receipt is completed with the exact response payload.
 *   - On a recoverable failure (OUT_OF_CAPACITY, CREATION_FAILED with
 *     successful rollback) the PENDING receipt is deleted so a later retry
 *     can proceed fresh.
 *
 * The receipt lookup is itself check-then-create and is NOT atomic, but it
 * runs under the per-account creation lock, so two receipts for the same
 * request_id cannot race.
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

export async function createPendingReceipt(service, accountId, requestId, nowIso) {
  return service.entities.ProjectCreationReceipt.create({
    account_id: accountId,
    request_id: requestId,
    status: 'PENDING',
    created_at: nowIso,
  });
}

export async function completeReceipt(service, receiptId, payload, nowIso) {
  if (!receiptId) return null;
  return service.entities.ProjectCreationReceipt.update(receiptId, {
    status: 'COMPLETED',
    project_id: payload?.project_id || null,
    promotion_id: payload?.promotion_id || null,
    ledger_entry_id: payload?.ledger_entry_id || null,
    response_payload: payload?.response_payload || null,
    completed_at: nowIso,
  });
}

export async function deleteReceipt(service, receiptId) {
  if (!receiptId) return;
  try {
    await service.entities.ProjectCreationReceipt.delete(receiptId);
  } catch { /* best-effort */ }
}