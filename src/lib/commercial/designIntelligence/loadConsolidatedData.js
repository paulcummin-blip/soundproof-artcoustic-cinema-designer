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
  const [piData, ledgerRes, auditRes] = await Promise.all([
    loadProjectIntelligenceData(),
    loadAllPages('CapacityLedger'),
    // AccountUserAudit provides the authoritative approval/activation dates
    // needed for the configurable thresholds in the Account Management view.
    loadAllPages('AccountUserAudit', {
      action: { $in: ['SOUNDPROOF_ELIGIBILITY_SET', 'SOUNDPROOF_ENABLE', 'SOUNDPROOF_TERM_STARTED'] },
    }),
  ]);

  return {
    ...piData,
    ledgerEntries: ledgerRes.items,
    auditRecords: auditRes.items,
    truncation: {
      ...piData.truncation,
      ledger: ledgerRes.truncated,
      audit: auditRes.truncated,
      any: piData.truncation.any || ledgerRes.truncated || auditRes.truncated,
    },
  };
}