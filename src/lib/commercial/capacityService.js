// CapacityLedger-backed commercial capacity service.
//
// This is the SINGLE canonical source for Professional Project capacity.
// Available capacity = SUM(valid CapacityLedger.delta) for the account.
// Do NOT subtract project counts separately — PROJECT_ACTIVATION entries
// already carry delta=-1.
//
// Stage B1: infrastructure only. Not wired to any enforcement gate.

import { base44 } from "@/api/base44Client";

/**
 * Get available Professional Project capacity for an account.
 *
 * Returns the sum of all valid (non-reversed) CapacityLedger.delta values
 * for the given account_id. Returns 0 when no ledger records exist.
 *
 * @param {string} accountId - The Account ID to query.
 * @returns {Promise<number>} Available capacity (can be negative if over-consumed).
 */
export async function getAvailableProfessionalProjects(accountId) {
  if (!accountId) return 0;

  const entries = await base44.entities.CapacityLedger.filter(
    { account_id: accountId },
    "-created_date",
    1000
  );

  if (!Array.isArray(entries) || entries.length === 0) return 0;

  // Sum all deltas. REVERSAL entries have negative delta that cancels the
  // original; the original entry's reversal_of pointer is informational only.
  // The canonical calculation is simply SUM(delta) — a REVERSAL with
  // delta = -(original delta) netts to zero automatically.
  return entries.reduce((sum, entry) => {
    const delta = Number(entry?.delta);
    return sum + (Number.isFinite(delta) ? delta : 0);
  }, 0);
}

/**
 * Build a canonical idempotency key for a transaction.
 *
 * @param {string} type - Transaction type prefix.
 * @param {...string} parts - Key components.
 * @returns {string} The idempotency key.
 */
export function buildIdempotencyKey(type, ...parts) {
  return [type, ...parts].join(":");
}