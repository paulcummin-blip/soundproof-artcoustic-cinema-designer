/**
 * Canonical Professional Project capacity authority.
 *
 * Available capacity for an account = SUM(CapacityLedger.delta) for that account.
 * This is the single commercial authority — no mutable balance field is used.
 *
 * Shared by backend functions that need to read or consume capacity.
 * Imported via: import { getAvailableCapacity } from "../../shared/capacityAuthority.js";
 */

/**
 * Sums all CapacityLedger.delta values for a given account_id.
 * Uses service-role to bypass RLS (backend authority context).
 * @param {object} base44 - service-role base44 client (base44.asServiceRole)
 * @param {string} accountId
 * @returns {Promise<number>} available capacity (can be 0 or negative)
 */
export async function getCapacityLedgerEntries(base44, accountId) {
  if (!accountId) return [];
  const pageSize = 500;
  const entries = [];
  const seen = new Set();
  for (let skip = 0; ; skip += pageSize) {
    const page = await base44.entities.CapacityLedger.filter(
      { account_id: accountId }, 'created_date', pageSize, skip,
    );
    if (!Array.isArray(page)) throw new Error('CAPACITY_LEDGER_UNAVAILABLE');
    for (const entry of page) {
      if (!entry?.id || entry.account_id !== accountId || seen.has(entry.id)) {
        throw new Error('CAPACITY_LEDGER_PAGE_INCONSISTENT');
      }
      if (typeof entry.delta !== 'number' || !Number.isFinite(entry.delta)) {
        throw new Error('CAPACITY_LEDGER_DELTA_INVALID');
      }
      seen.add(entry.id);
      entries.push(entry);
    }
    if (page.length < pageSize) return entries;
  }
}

export async function getAvailableCapacity(base44, accountId) {
  const entries = await getCapacityLedgerEntries(base44, accountId);
  return entries.reduce((sum, entry) => sum + entry.delta, 0);
}

/**
 * Checks whether a PROJECT_ACTIVATION ledger entry already exists for a project.
 * Prevents double-consumption of capacity (idempotency guard).
 * @param {object} base44 - service-role base44 client
 * @param {string} projectId
 * @returns {Promise<object|null>} existing ledger entry or null
 */
export async function findActivationEntry(base44, projectId) {
  if (!projectId) return null;
  const entries = await base44.entities.CapacityLedger.filter({
    idempotency_key: `activation:${projectId}`
  });
  return (Array.isArray(entries) && entries.length > 0) ? entries[0] : null;
}

/**
 * Checks whether a cleanup REVERSAL ledger entry already exists for a project.
 * Prevents double-credit-restoration during cleanup retries (idempotency guard).
 * @param {object} base44 - service-role base44 client
 * @param {string} projectId
 * @returns {Promise<object|null>} existing reversal ledger entry or null
 */
export async function findCleanupReversalEntry(base44, projectId) {
  if (!projectId) return null;
  const entries = await base44.entities.CapacityLedger.filter({
    idempotency_key: `incomplete_cleanup_reversal:${projectId}`
  });
  return (Array.isArray(entries) && entries.length > 0) ? entries[0] : null;
}