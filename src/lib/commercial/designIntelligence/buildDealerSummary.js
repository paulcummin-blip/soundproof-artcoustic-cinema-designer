/**
 * buildDealerSummary.js
 * -----------------------
 * Merges all opportunity signals (overlooked, needs_attention, emerging)
 * into a single deduplicated dealer table model.
 *
 * Each dealer appears exactly once, even when multiple signals apply.
 * Signals are filtered through configurable thresholds and classified
 * into transparent action categories (not numeric scores).
 *
 * Pure: no React, no side effects.
 */

import { safeArray, text, timeOf } from '../projectReporting/reportingUtils';
import { isCommercialDealerAccount, isInternalAccount } from './internalAccountFilter';
import { sectorKeyForAccount } from '../commercialDashboard/sectorClassification';
import { buildOverlookedOpportunities } from './overlookedOpportunities';
import { buildAccountsNeedingAttention } from './accountsNeedingAttention';
import { buildEmergingOpportunities } from './emergingOpportunities';
import {
  ACCOUNT_MANAGEMENT_THRESHOLDS,
  DAY_MS,
  ACTION_CATEGORIES,
  CATEGORY_PRIORITY,
} from './accountManagementConfig';

const THRESHOLDS = ACCOUNT_MANAGEMENT_THRESHOLDS;

/**
 * Build a map of account_id → eligibility-set timestamp from
 * AccountUserAudit records (action = SOUNDPROOF_ELIGIBILITY_SET).
 */
export function buildApprovalDateMap(auditRecords) {
  const map = new Map();
  for (const record of safeArray(auditRecords)) {
    if (text(record?.action) !== 'SOUNDPROOF_ELIGIBILITY_SET') continue;
    const ts = timeOf(record?.occurred_at);
    if (ts === null) continue;
    const existing = map.get(record.account_id);
    if (!existing || ts > existing) map.set(record.account_id, ts);
  }
  return map;
}

/**
 * Determine whether an "approved but not activated" signal has passed the
 * threshold (approved at least N days ago).
 */
function hasPassedApprovalThreshold(account, approvalDateMap) {
  const approvalTs = approvalDateMap.get(account?.id) || null;
  if (approvalTs === null) return false; // unknown approval date — don't flag
  const daysSinceApproval = (Date.now() - approvalTs) / DAY_MS;
  return daysSinceApproval >= THRESHOLDS.approvedNotActivatedDays;
}

/**
 * Determine whether an "activated but no projects" signal has passed the
 * threshold (activated at least N days ago).
 */
function hasPassedActivationThreshold(account) {
  const activatedTs = timeOf(account?.first_activated_at);
  if (activatedTs === null) return false;
  const daysSinceActivation = (Date.now() - activatedTs) / DAY_MS;
  return daysSinceActivation >= THRESHOLDS.activatedNoProjectsDays;
}

/**
 * Determine whether a "previously engaged but no new activity" signal has
 * passed the threshold (last activity between min and max days ago).
 * Only applies when reliable dated project evidence exists.
 */
function hasPassedInactivityThreshold(families) {
  const datedProjects = safeArray(families).filter((f) => timeOf(f?.createdDate) !== null);
  if (datedProjects.length === 0) return false; // no reliable dates
  const latestActivity = Math.max(...datedProjects.map((f) => timeOf(f.createdDate)));
  const daysSinceActivity = (Date.now() - latestActivity) / DAY_MS;
  return (
    daysSinceActivity >= THRESHOLDS.noActivityMinDays &&
    daysSinceActivity <= THRESHOLDS.noActivityMaxDays
  );
}

/**
 * Classify a dealer's signals into a transparent action category.
 *
 * Four categories, clearly distinguished:
 *   Follow-up due        — awaiting follow-up with a due (or missing) date.
 *   Developing opportunity — at least one signal passed the thresholds.
 *   Insufficient evidence — has projects but all signals were filtered out.
 *   No opportunity detected — no projects and no signals at all.
 */
function classifyDealer(signals, followUpRecord, hasFamilies) {
  // 1. Follow-up due — awaiting follow-up with a next_contact_date that has
  //    arrived or passed (or no date set at all).
  if (followUpRecord && followUpRecord.status === 'awaiting_follow_up') {
    const nextDate = followUpRecord.next_contact_date;
    if (nextDate) {
      const nextTs = timeOf(nextDate);
      if (nextTs !== null && nextTs <= Date.now() + DAY_MS) {
        return ACTION_CATEGORIES.FOLLOW_UP_DUE;
      }
    }
    if (!nextDate) return ACTION_CATEGORIES.FOLLOW_UP_DUE;
  }

  // 2. Developing opportunity — at least one signal survived the thresholds.
  if (signals.length > 0) return ACTION_CATEGORIES.DEVELOPING_OPPORTUNITY;

  // 3. Insufficient evidence — has projects but signals were filtered out.
  if (hasFamilies) return ACTION_CATEGORIES.INSUFFICIENT_EVIDENCE;

  // 4. No opportunity detected — no projects, no signals.
  return ACTION_CATEGORIES.NO_OPPORTUNITY;
}

/**
 * Pick the most relevant observation for the table's summary column.
 * Uses the same priority as classifyDealer.
 */
function pickPrimaryObservation(signals, followUpRecord, category, hasFamilies) {
  if (category === ACTION_CATEGORIES.FOLLOW_UP_DUE && followUpRecord) {
    return followUpRecord.observation || followUpRecord.conversation_notes || 'Follow-up due';
  }
  const priority = ['emerging', 'overlooked', 'needs_attention'];
  for (const type of priority) {
    const signal = signals.find((s) => s.opportunityType === type && !s.opportunityKey.includes('insufficient_evidence'));
    if (signal) return signal.observation;
  }
  if (category === ACTION_CATEGORIES.INSUFFICIENT_EVIDENCE) {
    return hasFamilies
      ? 'Has project history but no signals passed the action thresholds.'
      : 'No recorded signals';
  }
  return 'No project activity recorded.';
}

/**
 * Build the merged, deduplicated dealer summary for the account management
 * table.
 *
 * @param {Object} input
 * @param {Array} input.families — sector-scoped project families
 * @param {Array} input.accounts — sector-scoped Account records
 * @param {Map} input.accountsById — Account lookup (all accounts)
 * @param {Array} input.proposalEvents — proposal creation events
 * @param {Array} input.auditRecords — AccountUserAudit records
 * @param {Map} input.followUpsByKey — DealerFollowUp records indexed by opportunity_key
 * @param {Map} input.followUpsByAccount — DealerFollowUp records indexed by account_id
 * @param {string} input.sectorTab — active sector tab key
 * @returns {Object} { dealers, summaryCounts }
 */
export function buildDealerSummary({
  families,
  accounts,
  accountsById,
  proposalEvents,
  auditRecords,
  followUpsByKey,
  followUpsByAccount,
  sectorTab = 'all_dealers',
}) {
  const approvalDateMap = buildApprovalDateMap(auditRecords);

  // Build all signals using existing modules
  const overlookedSignals = buildOverlookedOpportunities(families, accountsById);
  const attentionSignals = buildAccountsNeedingAttention(families, accounts, accountsById);
  const emergingSignals = buildEmergingOpportunities(families, proposalEvents, accountsById);

  // Group families by account for threshold checks
  const familiesByAccount = new Map();
  for (const family of safeArray(families)) {
    if (!family.accountId) continue;
    if (!familiesByAccount.has(family.accountId)) familiesByAccount.set(family.accountId, []);
    familiesByAccount.get(family.accountId).push(family);
  }

  // Apply thresholds to filter signals
  const filterSignal = (signal) => {
    const account = accountsById?.get(signal.accountId);
    if (!account) return false;
    if (!isCommercialDealerAccount(account)) return false;

    // Threshold checks by signal type
    if (signal.opportunityKey.includes('no_activation')) {
      return hasPassedApprovalThreshold(account, approvalDateMap);
    }
    if (signal.opportunityKey.includes('no_projects')) {
      return hasPassedActivationThreshold(account);
    }
    if (signal.opportunityType === 'overlooked') {
      const dealerFamilies = familiesByAccount.get(signal.accountId) || [];
      return hasPassedInactivityThreshold(dealerFamilies);
    }
    // Emerging signals with dated evidence pass through
    if (signal.opportunityKey.includes('insufficient_evidence')) return false;
    return true;
  };

  const filteredOverlooked = overlookedSignals.filter(filterSignal);
  const filteredAttention = attentionSignals.filter(filterSignal);
  const filteredEmerging = emergingSignals.filter(filterSignal);

  // Merge signals by account (deduplicate)
  const byAccount = new Map();

  const addSignal = (signal) => {
    if (!byAccount.has(signal.accountId)) {
      const account = accountsById?.get(signal.accountId);
      byAccount.set(signal.accountId, {
        accountId: signal.accountId,
        dealerName: signal.dealerName || account?.name || 'Unnamed',
        sectorKey: signal.sectorKey || 'unclassified',
        territory: signal.territory || account?.territory || null,
        dealerGroup: signal.dealerGroup || account?.dealer_group || null,
        signals: [],
      });
    }
    byAccount.get(signal.accountId).signals.push(signal);
  };

  for (const signal of [...filteredOverlooked, ...filteredAttention, ...filteredEmerging]) {
    addSignal(signal);
  }

  // Also include dealers with follow-up records even if their signals were
  // filtered by thresholds — the admin needs to see active follow-ups.
  for (const [accountId, followUps] of (followUpsByAccount || new Map())) {
    if (byAccount.has(accountId)) continue;
    const account = accountsById?.get(accountId);
    if (!account || !isCommercialDealerAccount(account)) continue;
    byAccount.set(accountId, {
      accountId,
      dealerName: account.name || 'Unnamed',
      sectorKey: account.dealer_group || 'unclassified',
      territory: account.territory || null,
      dealerGroup: account.dealer_group || null,
      signals: [],
    });
  }

  // Include ALL confirmed commercial dealers in the selected sector, even
  // those with no signals. A dealer with no signals appears with "Insufficient
  // evidence" category so the admin has a complete view of every dealer.
  for (const account of safeArray(accounts)) {
    if (byAccount.has(account.id)) continue;
    if (!isCommercialDealerAccount(account)) continue;
    // Sector filter: in all_dealers, include every commercial dealer. In a
    // specific sector, only include dealers whose sector key matches.
    if (sectorTab !== 'all_dealers') {
      const accountSectorKey = sectorKeyForAccount(account);
      if (sectorTab === 'internal') continue; // internal sector handled separately
      if (accountSectorKey !== sectorTab) continue;
    }
    byAccount.set(account.id, {
      accountId: account.id,
      dealerName: account.name || 'Unnamed',
      sectorKey: sectorKeyForAccount(account),
      territory: account.territory || null,
      dealerGroup: account.dealer_group || null,
      signals: [],
    });
  }

  // Build the final dealer rows
  const dealers = [];
  for (const entry of byAccount.values()) {
    const account = accountsById?.get(entry.accountId);
    const accountFollowUps = (followUpsByAccount || new Map()).get(entry.accountId) || [];
    // Most recent follow-up by created_date
    const followUpRecord = accountFollowUps
      .sort((a, b) => (timeOf(b?.created_date) || 0) - (timeOf(a?.created_date) || 0))[0] || null;

    const hasFamilies = (familiesByAccount.get(entry.accountId) || []).length > 0;
    const category = classifyDealer(entry.signals, followUpRecord, hasFamilies);
    const primaryObservation = pickPrimaryObservation(entry.signals, followUpRecord, category, hasFamilies);

    // Signal labels for the table
    const signalLabels = entry.signals.map((s) => {
      if (s.opportunityType === 'overlooked') return 'Relationship';
      if (s.opportunityType === 'needs_attention') return 'Onboarding';
      if (s.opportunityKey.includes('insufficient_evidence')) return 'Insufficient';
      return 'Emerging';
    });

    dealers.push({
      accountId: entry.accountId,
      dealerName: entry.dealerName,
      sectorKey: entry.sectorKey,
      territory: entry.territory,
      dealerGroup: entry.dealerGroup,
      signals: entry.signals,
      signalLabels: [...new Set(signalLabels)],
      category,
      categoryPriority: CATEGORY_PRIORITY[category] || 99,
      primaryObservation,
      followUpRecord,
      followUpStatus: followUpRecord?.status || null,
      nextContactDate: followUpRecord?.next_contact_date || null,
    });
  }

  // Sort: follow-up due first, then by category priority, then by dealer name
  dealers.sort((a, b) => {
    if (a.categoryPriority !== b.categoryPriority) return a.categoryPriority - b.categoryPriority;
    return String(a.dealerName).localeCompare(String(b.dealerName));
  });

  // Summary counts for the four cards at the top — signal-type counts.
  const summaryCounts = {
    overlooked: dealers.filter((d) => d.signalLabels.includes('Relationship')).length,
    needingAttention: dealers.filter((d) => d.signalLabels.includes('Onboarding')).length,
    emerging: dealers.filter((d) => d.signalLabels.includes('Emerging')).length,
    followUpsDue: dealers.filter((d) => d.category === ACTION_CATEGORIES.FOLLOW_UP_DUE).length,
  };

  return { dealers, summaryCounts };
}