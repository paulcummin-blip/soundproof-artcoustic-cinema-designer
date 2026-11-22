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
  OPPORTUNITY_CATEGORIES,
  OPPORTUNITY_CATEGORY_PRIORITY,
  MANUAL_TO_CATEGORY,
  FILTER_KEYS,
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
 * Classify a dealer's signals into a system opportunity category.
 * Follow-up due is NOT a category here — it is a separate date-driven flag.
 *
 *   Overlooked            — overlooked signal passed thresholds.
 *   Need Attention        — needs_attention signal passed thresholds.
 *   Emerging              — emerging signal passed thresholds.
 *   No current opportunity — manual override only (not system-generated).
 *   Insufficient evidence  — has projects but all signals filtered out.
 *   No opportunity detected — no projects and no signals.
 */
function classifySystemCategory(signals, hasFamilies) {
  const hasOverlooked = signals.some((s) => s.opportunityType === 'overlooked');
  const hasAttention = signals.some((s) => s.opportunityType === 'needs_attention');
  const hasEmerging = signals.some((s) => s.opportunityType === 'emerging');

  if (hasEmerging) return OPPORTUNITY_CATEGORIES.EMERGING;
  if (hasOverlooked) return OPPORTUNITY_CATEGORIES.OVERLOOKED;
  if (hasAttention) return OPPORTUNITY_CATEGORIES.NEEDS_ATTENTION;
  if (hasFamilies) return OPPORTUNITY_CATEGORIES.INSUFFICIENT_EVIDENCE;
  return OPPORTUNITY_CATEGORIES.NO_OPPORTUNITY;
}

/**
 * Determine whether a follow-up is currently due (date-driven only).
 * A follow-up is due when status is awaiting_follow_up and the next
 * contact date has arrived or passed (or no date is set at all).
 */
function isFollowUpDue(followUpRecord) {
  if (!followUpRecord || followUpRecord.status !== 'awaiting_follow_up') return false;
  const nextDate = followUpRecord.next_contact_date;
  if (!nextDate) return true; // awaiting with no date = due
  const nextTs = timeOf(nextDate);
  if (nextTs === null) return true;
  return nextTs <= Date.now() + DAY_MS;
}

/**
 * Build a compact project summary for the expanded dealer row.
 */
function buildProjectSummary(families) {
  const list = safeArray(families);
  if (list.length === 0) return null;
  const dated = list.filter((f) => timeOf(f?.createdDate) !== null);
  const latestDate = dated.length > 0
    ? dated.map((f) => timeOf(f.createdDate)).sort((a, b) => b - a)[0]
    : null;
  const liveValue = list
    .filter((f) => f?.liveValue !== null && Number.isFinite(Number(f?.liveValue)))
    .reduce((s, f) => s + Number(f.liveValue), 0);
  const quotedValue = list
    .filter((f) => f?.quotedValue !== null && Number.isFinite(Number(f?.quotedValue)))
    .reduce((s, f) => s + Number(f.quotedValue), 0);
  return {
    count: list.length,
    latestDate,
    liveValue: liveValue > 0 ? liveValue : null,
    quotedValue: quotedValue > 0 ? quotedValue : null,
    projectNames: list.slice(0, 5).map((f) => f?.name || 'Unnamed').filter(Boolean),
    projects: list.map((f) => ({
      id: f?.id,
      name: f?.name,
      client: f?.client,
      config: f?.variations?.find((v) => v?.isActive)?.format || null,
      liveValue: f?.liveValue ?? null,
      quotedValue: f?.quotedValue ?? null,
      published: !!f?.variations?.find((v) => v?.isActive)?.publicationSummary,
      createdDate: f?.createdDate || null,
    })),
  };
}

/**
 * Pick the most relevant observation for the table's summary column.
 * Uses the same priority as classifyDealer.
 */
function pickPrimaryObservation(signals, manualOverride, systemCategory, hasFamilies) {
  // Manual override reason takes priority if present
  if (manualOverride) {
    return manualOverride.reason
      || `Manually assigned: ${MANUAL_TO_CATEGORY[manualOverride.manual_category] || manualOverride.manual_category}`;
  }
  const priority = ['emerging', 'overlooked', 'needs_attention'];
  for (const type of priority) {
    const signal = signals.find((s) => s.opportunityType === type && !s.opportunityKey.includes('insufficient_evidence'));
    if (signal) return signal.observation;
  }
  if (systemCategory === OPPORTUNITY_CATEGORIES.INSUFFICIENT_EVIDENCE) {
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
  categoryOverridesByAccount,
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

    const dealerFamilies = familiesByAccount.get(entry.accountId) || [];
    const hasFamilies = dealerFamilies.length > 0;
    const manualOverride = (categoryOverridesByAccount || new Map()).get(entry.accountId) || null;
    const systemCategory = classifySystemCategory(entry.signals, hasFamilies);
    const followUpDue = isFollowUpDue(followUpRecord);

    // Effective opportunity category: manual override takes precedence
    const opportunityCategory = manualOverride
      ? (MANUAL_TO_CATEGORY[manualOverride.manual_category] || systemCategory)
      : systemCategory;
    const opportunitySource = manualOverride ? 'manual' : 'system';

    const primaryObservation = pickPrimaryObservation(entry.signals, manualOverride, systemCategory, hasFamilies);

    // Signal labels for the table
    const signalLabels = entry.signals.map((s) => {
      if (s.opportunityType === 'overlooked') return 'Relationship';
      if (s.opportunityType === 'needs_attention') return 'Onboarding';
      if (s.opportunityKey.includes('insufficient_evidence')) return 'Insufficient';
      return 'Emerging';
    });

    // Sort priority: follow-up due dealers first, then by opportunity category
    const categoryPriority = (followUpDue ? 0 : 1) * 100 +
      (OPPORTUNITY_CATEGORY_PRIORITY[
        Object.keys(OPPORTUNITY_CATEGORIES).find((k) => OPPORTUNITY_CATEGORIES[k] === opportunityCategory)
      ] || 99);

    dealers.push({
      accountId: entry.accountId,
      dealerName: entry.dealerName,
      sectorKey: entry.sectorKey,
      territory: entry.territory,
      dealerGroup: entry.dealerGroup,
      accountType: account?.account_type || null,
      signals: entry.signals,
      signalLabels: [...new Set(signalLabels)],
      opportunityCategory,
      opportunitySource,
      systemCategory,
      manualOverride,
      followUpDue,
      categoryPriority,
      primaryObservation,
      followUpRecord,
      followUpStatus: followUpRecord?.status || null,
      nextContactDate: followUpRecord?.next_contact_date || null,
      projectSummary: buildProjectSummary(dealerFamilies),
    });
  }

  // Sort: follow-up due first, then by opportunity category priority, then by name
  dealers.sort((a, b) => {
    if (a.categoryPriority !== b.categoryPriority) return a.categoryPriority - b.categoryPriority;
    return String(a.dealerName).localeCompare(String(b.dealerName));
  });

  // Summary counts for the four cards. Overlooked/Need Attention/Emerging count
  // by opportunity category. Follow-ups Due counts dealers with a due follow-up
  // (date-driven, independent of opportunity category — a dealer can be both
  // Emerging and have a follow-up due).
  const summaryCounts = {
    overlooked: dealers.filter((d) => d.opportunityCategory === OPPORTUNITY_CATEGORIES.OVERLOOKED).length,
    needingAttention: dealers.filter((d) => d.opportunityCategory === OPPORTUNITY_CATEGORIES.NEEDS_ATTENTION).length,
    emerging: dealers.filter((d) => d.opportunityCategory === OPPORTUNITY_CATEGORIES.EMERGING).length,
    followUpsDue: dealers.filter((d) => d.followUpDue).length,
  };

  return { dealers, summaryCounts };
}