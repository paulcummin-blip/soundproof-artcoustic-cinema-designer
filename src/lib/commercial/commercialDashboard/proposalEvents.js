/**
 * proposalEvents.js
 * -----------------
 * Historical proposal-creation event authority for the Commercial Intelligence
 * dashboard.
 *
 * Each surviving genuine Proposal record contributes ONE historical creation
 * event, using its created_date. This is distinct from the one-project-one-count
 * live pipeline: a project with three proposals contributes three creation
 * events but is counted once in the pipeline.
 *
 * Deleted proposals are an unrecoverable historical gap — disclosed, never
 * fabricated. We do not introduce a competing event ledger.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { safeArray, text, timeOf } from '../projectReporting/reportingUtils';

/**
 * Build one proposal creation event per surviving Proposal record.
 *
 * @param {Array} proposals — Proposal records
 * @param {Object} [options]
 * @param {Map} [options.accountsById] — Account lookup for territory + name
 * @returns {Array} events sorted newest first
 */
export function buildProposalEvents(proposals, { accountsById = null } = {}) {
  return safeArray(proposals)
    .map((proposal) => {
      const stamp = timeOf(proposal?.created_date);
      if (stamp === null) return null;
      const account = proposal?.account_id && accountsById
        ? accountsById.get(proposal.account_id) || null
        : null;
      return {
        proposalId: proposal?.id || null,
        projectId: proposal?.project_id || null,
        accountId: proposal?.account_id || null,
        accountName: account?.name || null,
        territory: account?.territory || null,
        status: proposal?.status || null,
        proposalType: proposal?.proposal_type || null,
        createdAt: proposal?.created_date || null,
        stamp,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.stamp - a.stamp);
};

/**
 * Group proposal events into calendar months.
 *
 * @param {Array} events — from buildProposalEvents
 * @param {Object} [options]
 * @param {number} [options.months] — how many months to show (default 12)
 * @param {number} [options.now] — reference instant
 * @param {string} [options.sectorFilter] — 'uk' | 'international' | null
 * @param {Function} [options.isUkEvent] — predicate (event) => boolean
 * @returns {Array} monthly buckets with event counts and unique project counts
 */
export function buildProposalEventTimeline(events, {
  months = 12,
  now = null,
  sectorFilter = null,
  isUkEvent = null,
} = {}) {
  const reference = now && Number.isFinite(now) ? now : Date.now();
  const filtered = sectorFilter && typeof isUkEvent === 'function'
    ? events.filter((event) =>
        sectorFilter === 'uk' ? isUkEvent(event) : !isUkEvent(event))
    : events;

  const buckets = [];
  const refDate = new Date(reference);
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
    const start = date.getTime();
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
    const label = date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

    const inMonth = filtered.filter((event) => event.stamp >= start && event.stamp < end);
    const uniqueProjectIds = new Set(inMonth.map((event) => event.projectId).filter(Boolean));

    buckets.push({
      label,
      start,
      end,
      events: inMonth.length,
      uniqueProjects: uniqueProjectIds.size,
      partial: i === 0, // current month is partial
    });
  }
  return buckets;
};

/** Totals across a set of proposal events. */
export function summarizeProposalEvents(events) {
  const list = safeArray(events);
  const uniqueProjects = new Set(list.map((event) => event.projectId).filter(Boolean));
  return {
    totalEvents: list.length,
    uniqueProjects: uniqueProjects.size,
  };
};

/**
 * Map proposal events to their parent project, so the account/project list
 * can show proposal activity per project.
 *
 * @param {Array} events — from buildProposalEvents
 * @returns {Map} projectId → { count, latestEventAt, latestEvent }
 */
export function buildProposalActivityByProject(events) {
  const map = new Map();
  for (const event of safeArray(events)) {
    if (!event.projectId) continue;
    const existing = map.get(event.projectId) || { count: 0, latestEventAt: null, latestEvent: null };
    existing.count += 1;
    if (!existing.latestEventAt || event.stamp > existing.latestEventAt) {
      existing.latestEventAt = event.stamp;
      existing.latestEvent = event;
    }
    map.set(event.projectId, existing);
  }
  return map;
};