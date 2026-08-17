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

/**
 * Empty breakdown shape (used when no ledger entries exist).
 */
function emptyBreakdown() {
  return {
    purchased: 0,
    rewarded: 0,
    promotional: 0,
    distributorAllocated: 0,
    adminGranted: 0,
    trial: 0,
    internal: 0,
    consumed: 0,
    remaining: 0,
  };
}

/**
 * Aggregate a pre-fetched array of CapacityLedger entries into a per-type
 * breakdown for a single account. Pure function — no API calls.
 *
 * - consumed is ABS(SUM(PROJECT_ACTIVATION delta)) — presented as positive.
 * - remaining is the raw canonical SUM(all delta).
 * - DISTRIBUTOR_RECLAIM and REVERSAL contribute to remaining but have no
 *   dedicated breakdown bucket (they are rare correction entries).
 *
 * @param {Array} entries - CapacityLedger records for one account.
 * @returns {object} Breakdown object.
 */
export function aggregateCapacityBreakdown(entries) {
  const b = emptyBreakdown();
  if (!Array.isArray(entries) || entries.length === 0) return b;

  for (const e of entries) {
    const delta = Number.isFinite(Number(e?.delta)) ? Number(e.delta) : 0;
    switch (e?.transaction_type) {
      case "PURCHASED":
        b.purchased += delta;
        break;
      case "UK_TURNOVER_REWARD":
        b.rewarded += delta;
        break;
      case "PROMOTIONAL":
        b.promotional += delta;
        break;
      case "DISTRIBUTOR_ALLOCATION":
        b.distributorAllocated += delta;
        break;
      case "ADMIN_GRANT":
        b.adminGranted += delta;
        break;
      case "TRIAL":
        b.trial += delta;
        break;
      case "INTERNAL":
        b.internal += delta;
        break;
      case "PROJECT_ACTIVATION":
        b.consumed += delta; // negative in ledger
        break;
      // DISTRIBUTOR_RECLAIM, REVERSAL — included in remaining only
      default:
        break;
    }
    b.remaining += delta;
  }

  b.consumed = Math.abs(b.consumed);
  return b;
}

/**
 * Get the full capacity breakdown for a single account.
 * Fetches CapacityLedger entries and aggregates by transaction_type.
 *
 * @param {string} accountId
 * @returns {Promise<object>} Breakdown object (purchased, rewarded, ..., remaining).
 */
export async function getCapacityBreakdown(accountId) {
  if (!accountId) return emptyBreakdown();
  const entries = await base44.entities.CapacityLedger.filter(
    { account_id: accountId },
    "-created_date",
    1000
  );
  return aggregateCapacityBreakdown(entries);
}