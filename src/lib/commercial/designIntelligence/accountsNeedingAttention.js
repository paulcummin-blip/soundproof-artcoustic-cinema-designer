/**
 * accountsNeedingAttention.js
 * ----------------------------
 * "Who needs attention?" — Premium Partners who have not activated Sound
 * Proof, approved dealers who have not created projects, and dealers whose
 * recorded design activity or specification patterns warrant a conversation.
 *
 * Does not presume that a small system indicates a lost opportunity, or that
 * a dealer with no Sound Proof projects has no cinema business. Does not
 * treat missing login history as proof of inactivity.
 *
 * Pure: no React, no side effects.
 */

import { safeArray, text } from '../projectReporting/reportingUtils';
import { floorAreaOf } from './roomSizeAnalysis';
import { isCommercialDealerAccount } from './internalAccountFilter';

/**
 * Build "needs attention" opportunity signals.
 *
 * @param {Array} families — all families from the consolidated report
 * @param {Array} accounts — all Account records
 * @param {Map} accountsById — Account lookup
 * @returns {Array} opportunity signals
 */
export function buildAccountsNeedingAttention(families, accounts, accountsById) {
  const list = safeArray(families);
  const projectsByAccount = new Map();
  for (const family of list) {
    if (!family.accountId) continue;
    if (!projectsByAccount.has(family.accountId)) projectsByAccount.set(family.accountId, []);
    projectsByAccount.get(family.accountId).push(family);
  }

  const opportunities = [];

  for (const account of safeArray(accounts)) {
    // Only confirmed commercial dealers — excludes internal, admin,
    // professional, and unclassified (null dealer_group) accounts.
    if (!isCommercialDealerAccount(account)) continue;

    const group = text(account.dealer_group).toUpperCase();
    const isPremium = group === 'PREMIUM_PARTNER';
    const projects = projectsByAccount.get(account.id) || [];
    const hasProjects = projects.length > 0;
    const isActivated = account.status === 'active';
    const isEligible = account.soundproof_eligible === true;

    // 1. Premium Partners who have not activated Sound Proof
    if (isPremium && !isActivated) {
      opportunities.push({
        opportunityKey: `attention:${account.id}:no_activation`,
        opportunityType: 'needs_attention',
        accountId: account.id,
        dealerName: account.name || 'Unnamed',
        sectorKey: 'premium_partners',
        territory: account.territory || null,
        dealerGroup: account.dealer_group || null,
        observation: `Premium Partner with Sound Proof status "${account.status || 'unknown'}". No activation recorded.`,
        reason: 'This Premium Partner has not activated Sound Proof access. They may need onboarding support or a conversation about the value of the platform.',
        suggestedQuestion: `I wanted to check in — we set you up as a Premium Partner but I see Sound Proof hasn't been activated yet. Is there anything holding you back, or anything I can help you get started with?`,
        evidence: {
          accountStatus: account.status,
          soundproofEligible: isEligible,
          firstActivatedAt: account.first_activated_at || null,
          projectCount: projects.length,
        },
      });
    }

    // 2. Approved/eligible dealers who have not created any projects
    if ((isPremium || isEligible) && !hasProjects && isActivated) {
      opportunities.push({
        opportunityKey: `attention:${account.id}:no_projects`,
        opportunityType: 'needs_attention',
        accountId: account.id,
        dealerName: account.name || 'Unnamed',
        sectorKey: isPremium ? 'premium_partners' : 'unclassified',
        territory: account.territory || null,
        dealerGroup: account.dealer_group || null,
        observation: `Activated dealer with 0 Sound Proof projects. Eligibility: ${isEligible ? 'eligible' : 'not flagged eligible'}.`,
        reason: 'This dealer has activated Sound Proof but has not created any projects yet. They may need training, a demo, or a conversation about their current pipeline.',
        suggestedQuestion: `I see you've got access to Sound Proof but haven't started a project yet. Are you working on any cinema rooms at the moment where the tool could help?`,
        evidence: {
          accountStatus: account.status,
          soundproofEligible: isEligible,
          projectCount: 0,
          lastAccessAt: account.last_access_at || null,
        },
      });
    }

    // 3. Dealers with specification patterns warranting a conversation
    // (low value relative to room size — only with sufficient sample)
    if (hasProjects && projects.length >= 2) {
      const roomAreas = projects.map(floorAreaOf).filter((a) => a !== null);
      const liveValues = projects.map((f) => f.liveValue).filter((v) => v !== null && v !== undefined);
      if (roomAreas.length >= 2 && liveValues.length >= 2) {
        const avgArea = roomAreas.reduce((s, a) => s + a, 0) / roomAreas.length;
        const avgValue = liveValues.reduce((s, v) => s + Number(v), 0) / liveValues.length;
        // Flag only when room is substantial (>20m²) but value is modest (<£15k)
        // These thresholds are transparent and shown in the evidence.
        if (avgArea > 20 && avgValue < 15000) {
          opportunities.push({
            opportunityKey: `attention:${account.id}:modest_specs`,
            opportunityType: 'needs_attention',
            accountId: account.id,
            dealerName: account.name || 'Unnamed',
            sectorKey: isPremium ? 'premium_partners' : (account.dealer_group === 'OTHER_DEALER' ? 'trade_accounts' : 'unclassified'),
            territory: account.territory || null,
            dealerGroup: account.dealer_group || null,
            observation: `${projects.length} project(s) with average room ${avgArea.toFixed(1)} m² and average live design value £${Math.round(avgValue).toLocaleString('en-GB')} ex VAT.`,
            reason: 'Substantial rooms with modest system specifications relative to room size. This may indicate an opportunity to discuss higher-tier solutions, or it may simply reflect client budget. Do not presume a missed sale.',
            suggestedQuestion: `I noticed your recent cinema designs have generous rooms with relatively modest systems. Are your clients choosing entry-level packages, or would it help to talk through the higher-tier options you could offer?`,
            evidence: {
              projectCount: projects.length,
              avgRoomArea: avgArea,
              avgLiveValue: avgValue,
              comparisonNote: 'Comparison within same dealer only. Room-size quartile comparison available in the secondary view with sufficient cross-dealer sample.',
            },
          });
        }
      }
    }
  }

  return opportunities;
}