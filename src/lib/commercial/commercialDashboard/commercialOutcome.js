/**
 * commercialOutcome.js
 * --------------------
 * UK-only commercial outcome authority (Live / Won / Lost).
 *
 * Independent of the dealer's own project_status. Default is Live (null).
 * Won and Lost are mutually exclusive. Only UK projects are tracked.
 * Only administrators may change the outcome.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { safeArray, text } from '../projectReporting/reportingUtils';

export const OUTCOME_VALUES = ['won', 'lost'];

export const OUTCOME_LABELS = {
  live: 'Live',
  won: 'Won',
  lost: 'Lost',
};

/** Read the canonical outcome from a project record. null/undefined = Live. */
export function outcomeOf(project) {
  const raw = text(project?.commercial_outcome).toLowerCase();
  if (raw === 'won') return 'won';
  if (raw === 'lost') return 'lost';
  return 'live';
};

/** Is the outcome Live (neither Won nor Lost)? */
export function isLiveOutcome(project) {
  return outcomeOf(project) === 'live';
};

/**
 * The next outcome value when the admin toggles a checkbox.
 * Ticking Won on a non-Won project → 'won'. Unticking Won on a Won project →
 * 'live' (null). Same for Lost. The two are mutually exclusive: setting Won
 * clears Lost and vice versa.
 *
 * @param {Object} project — the current project record
 * @param {'won'|'lost'} which — which checkbox was toggled
 * @param {boolean} checked — the new checkbox state
 * @returns {string|null} 'won' | 'lost' | null (Live)
 */
export function nextOutcome(project, which, checked) {
  if (!checked) return null; // unticking the selected box returns to Live
  if (which !== 'won' && which !== 'lost') return null;
  return which; // mutually exclusive: setting one clears the other
};

/**
 * Partition projects by outcome for pipeline counting.
 *
 * Live projects count towards the potential pipeline. Won and Lost are
 * excluded from Live but remain in historical proposal activity.
 *
 * @param {Array} projects — Project records (UK only, outcome-eligible)
 * @returns {Object} { live, won, lost } arrays of project records
 */
export function partitionByOutcome(projects) {
  const result = { live: [], won: [], lost: [] };
  for (const project of safeArray(projects)) {
    const outcome = outcomeOf(project);
    result[outcome].push(project);
  }
  return result;
};