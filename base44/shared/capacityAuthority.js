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
export async function getAvailableCapacity(base44, accountId) {
  if (!accountId) return 0;
  const entries = await base44.entities.CapacityLedger.filter({ account_id: accountId });
  if (!Array.isArray(entries) || entries.length === 0) return 0;
  return entries.reduce((sum, e) => sum + (typeof e.delta === 'number' ? e.delta : 0), 0);
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