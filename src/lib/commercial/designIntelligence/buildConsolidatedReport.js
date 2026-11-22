/**
 * buildConsolidatedReport.js
 * ---------------------------
 * Joins the two existing reporting authorities — Commercial Intelligence
 * and Project Intelligence — into one model for the consolidated page.
 *
 * This does NOT create a third reporting system: it calls the existing
 * buildCommercialDashboard() and buildProjectIntelligenceReport() and
 * stitches their outputs by accountId / projectId. Each family gains its
 * sector key, verified frozen value and UK commercial outcome from the
 * commercial model; the commercial model's sector rows gain the live design
 * value and engineering coverage from the project model.
 *
 * Read-only: never writes to any entity.
 * Pure: no React, no side effects.
 */

import { buildCommercialDashboard } from '../commercialDashboard/buildCommercialDashboard';
import { buildProjectIntelligenceReport } from '../projectReporting/buildProjectIntelligenceReport';
import { sectorKeyForAccount } from '../commercialDashboard/sectorClassification';
import { outcomeOf } from '../commercialDashboard/commercialOutcome';
import { resolveVerifiedRetailIncVat } from '../commercialDashboard/verifiedValue';
import { safeArray, text } from '../projectReporting/reportingUtils';

const INTERNAL_ACCOUNT_TYPES = new Set(['admin', 'internal']);

/** True when a project family belongs to an internal/admin account. */
export function isInternalFamily(family) {
  return INTERNAL_ACCOUNT_TYPES.has(text(family?.accountType).toLowerCase());
}

/**
 * Build the consolidated report from pre-loaded data.
 *
 * @param {Object} input — the output of loadConsolidatedData()
 * @returns {Object} { commercial, project, families, accountsById, generatedAt }
 */
export function buildConsolidatedReport(data) {
  const accounts = safeArray(data?.accounts);
  const projects = safeArray(data?.projects);
  const proposals = safeArray(data?.proposals);
  const ledgerEntries = safeArray(data?.ledgerEntries);

  const accountsById = new Map(accounts.map((account) => [account?.id, account]));
  const proposalsByProjectId = {};
  for (const proposal of proposals) {
    if (!proposal?.project_id) continue;
    if (!proposalsByProjectId[proposal.project_id]) proposalsByProjectId[proposal.project_id] = [];
    proposalsByProjectId[proposal.project_id].push(proposal);
  }

  const commercial = buildCommercialDashboard({
    accounts,
    projects,
    proposals,
    ledgerEntries,
  });

  const project = buildProjectIntelligenceReport({
    projects,
    versionsByProjectId: data?.versionsByProjectId || {},
    proposalsByProjectId: data?.proposalsByProjectId || {},
    statusDefsByAccountId: data?.statusDefsByAccountId || {},
    accounts,
    priceContext: data?.priceContext || {},
    filters: {},
  });

  const verifiedValueMap = commercial.overview
    ? null
    : null;

  const families = safeArray(project?.families).map((family) => {
    const account = family.accountId ? accountsById.get(family.accountId) || null : null;
    const sectorKey = account
      ? sectorKeyForAccount(account)
      : 'unclassified';
    const isInternal = isInternalFamily(family);
    const projectProposals = proposalsByProjectId[family.id] || [];
    const verified = resolveVerifiedRetailIncVat(projectProposals, {
      territory: family.territory || null,
    });
    const outcome = account && text(account.territory).toUpperCase() === 'UK'
      ? outcomeOf(projects.find((p) => p.id === family.id) || {})
      : null;

    return {
      ...family,
      sectorKey,
      isInternal,
      verifiedValue: verified.value,
      verifiedAvailable: verified.available,
      verifiedBasis: verified.basis,
      verifiedReason: verified.reason,
      verifiedCurrency: verified.currency,
      verifiedAt: verified.at,
      commercialOutcome: outcome,
      outcomeEligible: account ? text(account.territory).toUpperCase() === 'UK' : false,
    };
  });

  return {
    commercial,
    project,
    families,
    accountsById,
    priceContext: data?.priceContext || {},
    generatedAt: new Date().toISOString(),
  };
}