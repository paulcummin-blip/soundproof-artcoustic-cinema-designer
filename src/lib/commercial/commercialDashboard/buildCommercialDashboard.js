/**
 * buildCommercialDashboard.js
 * ---------------------------
 * The Commercial Intelligence dashboard derivation.
 *
 * Assembles the full dashboard model from pre-fetched records:
 *   · Country-first sector classification
 *   · Proposal creation events (distinct from the one-project-one-count pipeline)
 *   · Verified frozen retail value including VAT (or unavailable)
 *   · UK-only Live/Won/Lost commercial outcomes
 *   · CapacityLedger credit breakdown per account
 *
 * ONE PROJECT IS ONE COMMERCIAL FAMILY in the pipeline. Counts are project
 * counts. Proposal events are separate: a project with three proposals
 * contributes three creation events but is counted once in the pipeline.
 *
 * Read-only: never writes to Project, Proposal, Account, CapacityLedger or any
 * other entity. The only write path is the admin-only setProjectCommercialOutcome
 * backend function, called from the UI checkbox.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { safeArray, safeObject, text, timeOf } from '../projectReporting/reportingUtils';
import {
  groupAccountsBySector,
  isUkOutcomeEligible,
  sectorDefinitionByKey,
  ALL_SECTOR_KEYS,
} from './sectorClassification';
import { buildProposalEvents, buildProposalActivityByProject } from './proposalEvents';
import { buildVerifiedValueMap, resolveVerifiedRetailIncVat } from './verifiedValue';
import { outcomeOf, partitionByOutcome } from './commercialOutcome';
import { aggregateCapacityBreakdown } from '../capacityService';

function buildAccountsById(accounts) {
  return new Map(safeArray(accounts).map((account) => [account?.id, account]));
};

function buildProposalsByProjectId(proposals) {
  const map = {};
  for (const proposal of safeArray(proposals)) {
    if (!proposal?.project_id) continue;
    if (!map[proposal.project_id]) map[proposal.project_id] = [];
    map[proposal.project_id].push(proposal);
  }
  return map;
};

function buildProjectsByAccountId(projects) {
  const map = new Map();
  for (const project of safeArray(projects)) {
    if (!project?.account_id) continue;
    if (!map.has(project.account_id)) map.set(project.account_id, []);
    map.get(project.account_id).push(project);
  }
  return map;
};

function buildLedgerByAccount(ledgerEntries) {
  const map = new Map();
  for (const entry of safeArray(ledgerEntries)) {
    if (!entry?.account_id) continue;
    if (!map.has(entry.account_id)) map.set(entry.account_id, []);
    map.get(entry.account_id).push(entry);
  }
  return map;
};

/**
 * Build one account row for the sector account list.
 */
function buildAccountRow(account, projectsByAccountId, proposalsByProjectId, verifiedValueMap, accountsById, ledgerByAccount, proposalActivityByProject) {
  const projects = projectsByAccountId?.get(account.id) || [];
  const ledgerEntries = ledgerByAccount?.get(account.id) || [];
  const capacity = aggregateCapacityBreakdown(ledgerEntries);

  const isUk = isUkOutcomeEligible({ account_id: account.id }, accountsById);
  const projectRows = projects.map((project) => {
    const proposals = proposalsByProjectId[project.id] || [];
    const activity = proposalActivityByProject?.get(project.id) || { count: 0, latestEventAt: null };
    const verified = verifiedValueMap?.get(project.id) || { value: null, available: false, reason: 'No snapshot' };
    const outcome = isUk ? outcomeOf(project) : null; // null = not tracked (international)
    return {
      id: project.id,
      name: text(project.name) || 'Untitled project',
      client: text(project.client_name) || null,
      reference: text(project.project_reference) || null,
      createdAt: project.created_date || null,
      updatedAt: project.updated_date || null,
      lifecycleStatus: text(project.lifecycle_status) || 'Draft',
      dolbyConfig: project.dolby_config || null,
      proposalCount: proposals.length,
      latestProposalAt: activity.latestEventAt || null,
      verifiedValue: verified.value,
      verifiedAvailable: verified.available,
      verifiedBasis: verified.basis,
      verifiedReason: verified.reason,
      outcome,
      outcomeEligible: isUk,
    };
  });

  // Pipeline totals for this account: count each project once.
  const ukProjects = isUk ? projectRows : [];
  const partitioned = partitionByOutcome(projects.filter((p) => isUkOutcomeEligible(p, accountsById)));
  const liveCount = partitioned.live.length;
  const wonCount = partitioned.won.length;
  const lostCount = partitioned.lost.length;

  // Verified monetary pipeline: only UK projects that are Live AND have a
  // qualifying proposal with verified frozen retail value inc VAT.
  const monetaryPipelineProjects = ukProjects.filter(
    (row) => row.outcome === 'live' && row.verifiedAvailable && row.proposalCount > 0,
  );
  const monetaryPipelineValue = monetaryPipelineProjects.reduce(
    (sum, row) => sum + (Number(row.verifiedValue) || 0),
    0,
  );

  return {
    account,
    projectCount: projects.length,
    projectRows,
    liveCount,
    wonCount,
    lostCount,
    monetaryPipelineValue,
    monetaryPipelineProjectCount: monetaryPipelineProjects.length,
    credits: {
      rewarded: capacity.rewarded,
      purchased: capacity.purchased,
      promotional: capacity.promotional,
      adminGranted: capacity.adminGranted,
      trial: capacity.trial,
      internal: capacity.internal,
      distributor: capacity.distributorAllocated,
      used: capacity.consumed,
      available: capacity.remaining,
    },
    isUk,
  };
};

/**
 * Build the full Commercial Intelligence dashboard model.
 *
 * @param {Object} input
 * @param {Array} input.accounts
 * @param {Array} input.projects
 * @param {Array} input.proposals
 * @param {Array} input.ledgerEntries
 * @returns {Object} the dashboard model
 */
export function buildCommercialDashboard({
  accounts = [],
  projects = [],
  proposals = [],
  ledgerEntries = [],
}) {
  const accountsById = buildAccountsById(accounts);
  const proposalsByProjectId = buildProposalsByProjectId(proposals);
  const projectsByAccountId = buildProjectsByAccountId(projects);
  const ledgerByAccount = buildLedgerByAccount(ledgerEntries);
  const proposalEvents = buildProposalEvents(proposals, { accountsById });
  const proposalActivityByProject = buildProposalActivityByProject(proposalEvents);
  const verifiedValueMap = buildVerifiedValueMap(projects, proposalsByProjectId, accountsById);

  const accountsBySector = groupAccountsBySector(accounts);

  // Build account rows per sector
  const sectorModels = {};
  for (const sectorKey of ALL_SECTOR_KEYS) {
    const sectorAccounts = accountsBySector[sectorKey] || [];
    const sectorDef = sectorDefinitionByKey(sectorKey);
    const rows = sectorAccounts
      .map((account) =>
        buildAccountRow(
          account,
          projectsByAccountId,
          proposalsByProjectId,
          verifiedValueMap,
          accountsById,
          ledgerByAccount,
          proposalActivityByProject,
        ),
      )
      .sort((a, b) => String(a.account.name || '').localeCompare(String(b.account.name || '')));

    const projectCount = rows.reduce((sum, row) => sum + row.projectCount, 0);
    const liveCount = rows.reduce((sum, row) => sum + row.liveCount, 0);
    const wonCount = rows.reduce((sum, row) => sum + row.wonCount, 0);
    const lostCount = rows.reduce((sum, row) => sum + row.lostCount, 0);
    const monetaryPipelineValue = rows.reduce((sum, row) => sum + row.monetaryPipelineValue, 0);
    const monetaryPipelineProjectCount = rows.reduce((sum, row) => sum + row.monetaryPipelineProjectCount, 0);
    const availableCredits = rows.reduce((sum, row) => sum + row.credits.available, 0);

    sectorModels[sectorKey] = {
      key: sectorKey,
      label: sectorDef.label,
      description: sectorDef.description,
      accountCount: rows.length,
      projectCount,
      liveCount,
      wonCount,
      lostCount,
      monetaryPipelineValue,
      monetaryPipelineProjectCount,
      availableCredits,
      rows,
    };
  }

  // Overall totals
  const totalAccounts = accounts.length;
  const totalProjects = projects.length;
  const totalProposals = proposals.length;
  const totalLive = ALL_SECTOR_KEYS.reduce(
    (sum, key) => sum + (sectorModels[key]?.liveCount || 0),
    0,
  );
  const totalWon = ALL_SECTOR_KEYS.reduce(
    (sum, key) => sum + (sectorModels[key]?.wonCount || 0),
    0,
  );
  const totalLost = ALL_SECTOR_KEYS.reduce(
    (sum, key) => sum + (sectorModels[key]?.lostCount || 0),
    0,
  );
  const totalMonetaryPipeline = ALL_SECTOR_KEYS.reduce(
    (sum, key) => sum + (sectorModels[key]?.monetaryPipelineValue || 0),
    0,
  );
  const totalMonetaryProjects = ALL_SECTOR_KEYS.reduce(
    (sum, key) => sum + (sectorModels[key]?.monetaryPipelineProjectCount || 0),
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    sectorModels,
    overview: {
      totalAccounts,
      totalProjects,
      totalProposals,
      totalLive,
      totalWon,
      totalLost,
      totalMonetaryPipeline,
      totalMonetaryProjects,
      proposalEventCount: proposalEvents.length,
    },
    proposalEvents,
    accountsById,
  };
};