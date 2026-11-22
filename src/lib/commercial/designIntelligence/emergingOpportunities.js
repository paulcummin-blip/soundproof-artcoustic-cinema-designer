/**
 * emergingOpportunities.js
 * -------------------------
 * "Where is future business developing?" — Changes over time in genuine
 * project creation, design ambition, system values, room sizes,
 * configurations and recorded proposal activity.
 *
 * Only shows trends where reliable historical records or dated snapshots
 * support them. Does NOT manufacture history from current design states.
 * Where historical activity data is missing, shows insufficient evidence
 * rather than treating silence as disengagement.
 *
 * Pure: no React, no side effects.
 */

import { safeArray, text, timeOf } from '../projectReporting/reportingUtils';

const RECENT_MONTHS = 3;
const COMPARISON_MONTHS = 6;

/**
 * Build emerging opportunity signals from dated records only.
 *
 * @param {Array} families — all families from the consolidated report
 * @param {Array} proposalEvents — proposal creation events from the commercial dashboard
 * @param {Map} accountsById — Account lookup
 * @returns {Array} opportunity signals
 */
export function buildEmergingOpportunities(families, proposalEvents, accountsById) {
  const now = Date.now();
  const recentCutoff = now - (RECENT_MONTHS * 30 * 86400000);
  const comparisonCutoff = now - (COMPARISON_MONTHS * 30 * 86400000);

  // Group project creation by account and period
  const byAccount = new Map();
  for (const family of safeArray(families)) {
    if (!family.accountId) continue;
    const account = accountsById?.get(family.accountId);
    if (!account) continue;
    const type = text(account.account_type).toLowerCase();
    if (type === 'admin' || type === 'internal') continue;

    if (!byAccount.has(family.accountId)) {
      byAccount.set(family.accountId, {
        accountId: family.accountId,
        dealerName: family.dealerName || family.accountName || account.name || 'Unnamed',
        sectorKey: family.sectorKey,
        territory: family.territory || null,
        dealerGroup: account.dealer_group || null,
        projects: [],
        proposals: [],
      });
    }
    byAccount.get(family.accountId).projects.push(family);
  }

  // Group proposal events by account
  const proposalsByAccount = new Map();
  for (const event of safeArray(proposalEvents)) {
    if (!event.accountId) continue;
    if (!proposalsByAccount.has(event.accountId)) proposalsByAccount.set(event.accountId, []);
    proposalsByAccount.get(event.accountId).push(event);
  }
  for (const [accountId, entry] of byAccount) {
    entry.proposals = proposalsByAccount.get(accountId) || [];
  }

  const opportunities = [];

  for (const entry of byAccount.values()) {
    const recentProjects = entry.projects.filter((f) => {
      const t = timeOf(f.createdDate);
      return t !== null && t >= recentCutoff;
    });
    const olderProjects = entry.projects.filter((f) => {
      const t = timeOf(f.createdDate);
      return t !== null && t < recentCutoff && t >= comparisonCutoff;
    });

    const recentProposals = entry.proposals.filter((p) => {
      const t = timeOf(p.createdAt);
      return t !== null && t >= recentCutoff;
    });
    const olderProposals = entry.proposals.filter((p) => {
      const t = timeOf(p.createdAt);
      return t !== null && t < recentCutoff && t >= comparisonCutoff;
    });

    // Signal: increasing project creation rate
    if (recentProjects.length > 0 && recentProjects.length > olderProjects.length) {
      const evidence = [
        `${olderProjects.length} project(s) in the previous ${RECENT_MONTHS} months`,
        `${recentProjects.length} project(s) in the last ${RECENT_MONTHS} months`,
      ];
      const recentRoomSizes = recentProjects.map((f) => f.roomDims?.widthM && f.roomDims?.lengthM ? f.roomDims.widthM * f.roomDims.lengthM : null).filter(Boolean);
      if (recentRoomSizes.length > 0) {
        evidence.push(`recent room sizes: ${recentRoomSizes.map((a) => a.toFixed(1) + ' m²').join(', ')}`);
      }
      opportunities.push({
        opportunityKey: `emerging:${entry.accountId}:increasing_creation`,
        opportunityType: 'emerging',
        accountId: entry.accountId,
        dealerName: entry.dealerName,
        sectorKey: entry.sectorKey,
        territory: entry.territory,
        dealerGroup: entry.dealerGroup,
        observation: evidence.join('; '),
        reason: `Project creation has increased from ${olderProjects.length} to ${recentProjects.length} over the last ${RECENT_MONTHS} months. This may indicate a developing pipeline.`,
        suggestedQuestion: `I see you've been creating more cinema projects with us recently. What's driving the activity — are there particular clients or opportunities you're working on?`,
        evidence: {
          recentProjectCount: recentProjects.length,
          olderProjectCount: olderProjects.length,
          recentProposalCount: recentProposals.length,
          olderProposalCount: olderProposals.length,
          recentRoomSizes,
        },
      });
    }

    // Signal: first proposal activity after a gap
    if (recentProposals.length > 0 && olderProposals.length === 0 && entry.projects.length > 0) {
      opportunities.push({
        opportunityKey: `emerging:${entry.accountId}:first_proposals`,
        opportunityType: 'emerging',
        accountId: entry.accountId,
        dealerName: entry.dealerName,
        sectorKey: entry.sectorKey,
        territory: entry.territory,
        dealerGroup: entry.dealerGroup,
        observation: `${recentProposals.length} proposal(s) generated in the last ${RECENT_MONTHS} months, with none in the previous ${COMPARISON_MONTHS - RECENT_MONTHS} months.`,
        reason: 'New proposal activity after a period with none recorded. This may indicate a project moving toward a client decision.',
        suggestedQuestion: `I see you've generated some proposals recently. How are those conversations going with the client?`,
        evidence: {
          recentProposalCount: recentProposals.length,
          olderProposalCount: olderProposals.length,
          projectCount: entry.projects.length,
        },
      });
    }

    // Signal: insufficient evidence (show explicitly, do not treat silence as disengagement)
    if (entry.projects.length > 0 && recentProjects.length === 0 && olderProjects.length === 0) {
      const allUndated = entry.projects.every((f) => timeOf(f.createdDate) === null);
      if (allUndated) {
        opportunities.push({
          opportunityKey: `emerging:${entry.accountId}:insufficient_evidence`,
          opportunityType: 'emerging',
          accountId: entry.accountId,
          dealerName: entry.dealerName,
          sectorKey: entry.sectorKey,
          territory: entry.territory,
          dealerGroup: entry.dealerGroup,
          observation: `${entry.projects.length} project(s) with no creation date recorded. Cannot determine trend.`,
          reason: 'Insufficient dated history to identify a trend. Do not treat as disengagement.',
          suggestedQuestion: null,
          evidence: {
            projectCount: entry.projects.length,
            hasCreationDates: false,
          },
        });
      }
    }
  }

  return opportunities;
}