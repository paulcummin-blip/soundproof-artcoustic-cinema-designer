/**
 * loadConsolidatedData.js
 * -----------------------
 * Loads every entity the consolidated Commercial & Design Intelligence page
 * needs, in ONE pass. Reuses the existing Project Intelligence loader (which
 * already fetches Project, ProjectVersion, Proposal, ProjectStatus, Account
 * and the authorised Product Master) and adds CapacityLedger for the
 * commercial credit authority.
 *
 * Read-only: never writes to any entity.
 * Not pure (talks to the SDK), but contains no derivation logic.
 */

import { loadProjectIntelligenceData, loadAllPages } from '../projectReporting/loadProjectIntelligenceData';

export async function loadConsolidatedData() {
  const [piData, ledgerRes] = await Promise.all([
    loadProjectIntelligenceData(),
    loadAllPages('CapacityLedger'),
  ]);

  return {
    ...piData,
    ledgerEntries: ledgerRes.items,
    truncation: {
      ...piData.truncation,
      ledger: ledgerRes.truncated,
      any: piData.truncation.any || ledgerRes.truncated,
    },
  };
}