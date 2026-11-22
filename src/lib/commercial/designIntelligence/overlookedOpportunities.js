/**
 * overlookedOpportunities.js
 * ---------------------------
 * "Who am I overlooking?" — Non-Premium Partner dealers showing meaningful
 * recorded design engagement, especially those creating substantial or
 * increasingly ambitious cinema projects.
 *
 * Evidence shown: project creation count, room sizes, configurations,
 * current design values, proposal activity. Flagged as potential
 * relationship-development opportunities, not automatic Premium Partner
 * recommendations.
 *
 * Pure: no React, no side effects. Reads only from the consolidated report's
 * families and account data.
 */

import { safeArray, text } from '../projectReporting/reportingUtils';
import { floorAreaOf, hasValidRoomDims } from './roomSizeAnalysis';
import { isCommercialDealerAccount } from './internalAccountFilter';

const MIN_PROJECTS_FOR_ENGAGEMENT = 2;

/**
 * Build overlooked opportunity signals for non-Premium Partner dealers.
 *
 * @param {Array} families — all families from the consolidated report
 * @param {Map} accountsById — Account lookup
 * @returns {Array} opportunity signals
 */
export function buildOverlookedOpportunities(families, accountsById) {
  const list = safeArray(families);
  const byAccount = new Map();

  for (const family of list) {
    if (!family.accountId) continue;
    const account = accountsById?.get(family.accountId);
    if (!account) continue;
    // Only confirmed commercial dealers — excludes internal, admin,
    // professional, and unclassified (null dealer_group) accounts.
    if (!isCommercialDealerAccount(account)) continue;
    // Only non-Premium Partner dealers (Premium Partners are in their own sector)
    if (text(account.dealer_group).toUpperCase() === 'PREMIUM_PARTNER') continue;

    if (!byAccount.has(family.accountId)) {
      byAccount.set(family.accountId, {
        accountId: family.accountId,
        dealerName: family.dealerName || family.accountName || account.name || 'Unnamed',
        sectorKey: family.sectorKey,
        territory: family.territory || null,
        dealerGroup: account.dealer_group || null,
        families: [],
      });
    }
    byAccount.get(family.accountId).families.push(family);
  }

  const opportunities = [];
  for (const entry of byAccount.values()) {
    if (entry.families.length < MIN_PROJECTS_FOR_ENGAGEMENT) continue;

    const roomAreas = entry.families.map(floorAreaOf).filter((a) => a !== null);
    const liveValues = entry.families.map((f) => f.liveValue).filter((v) => v !== null && v !== undefined);
    const configs = entry.families
      .map((f) => f.variations?.find((v) => v.isActive)?.format)
      .filter(Boolean);
    const proposalCount = entry.families.reduce((sum, f) => sum + (f.quotedProposalId ? 1 : 0), 0);

    const maxRoomArea = roomAreas.length > 0 ? Math.max(...roomAreas) : null;
    const totalLiveValue = liveValues.length > 0 ? liveValues.reduce((s, v) => s + Number(v), 0) : null;
    const uniqueConfigs = [...new Set(configs)];

    const evidence = [];
    evidence.push(`${entry.families.length} project(s) created`);
    if (maxRoomArea !== null) evidence.push(`largest room ${maxRoomArea.toFixed(1)} m²`);
    if (uniqueConfigs.length > 0) evidence.push(`configuration(s): ${uniqueConfigs.join(', ')}`);
    if (totalLiveValue !== null) evidence.push(`combined live design value £${Math.round(totalLiveValue).toLocaleString('en-GB')} ex VAT`);
    if (proposalCount > 0) evidence.push(`${proposalCount} proposal(s) generated`);

    opportunities.push({
      opportunityKey: `overlooked:${entry.accountId}`,
      opportunityType: 'overlooked',
      accountId: entry.accountId,
      dealerName: entry.dealerName,
      sectorKey: entry.sectorKey,
      territory: entry.territory,
      dealerGroup: entry.dealerGroup,
      observation: evidence.join('; '),
      reason: `${entry.families.length} recorded project(s) with active design engagement from a non-Premium Partner dealer. This may indicate a relationship worth developing.`,
      suggestedQuestion: `I see you've been working on ${entry.families.length} cinema project(s) with us. How are things going, and is there anything we can do to support your design work?`,
      evidence: {
        projectCount: entry.families.length,
        maxRoomArea,
        totalLiveValue,
        uniqueConfigs,
        proposalCount,
        families: entry.families.map((f) => ({ id: f.id, name: f.name, liveValue: f.liveValue })),
      },
    });
  }

  return opportunities.sort((a, b) => b.evidence.projectCount - a.evidence.projectCount);
}