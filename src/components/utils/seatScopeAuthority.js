/**
 * seatScopeAuthority.js
 * ---------------------
 * Single shared Primary/Secondary seat-scope authority.
 *
 * Returns the current scoped seat IDs and a deterministic priority fingerprint
 * from canonical `appState.seatingPositions`. Consumed by:
 *
 *   - left ASDR Primary/Secondary summaries (useAppDesignRating)
 *   - Compliance Report priority labels/grouping
 *   - Design Review scoped summaries
 *   - any other Primary/Secondary category floor presentation
 *
 * The per-seat RP22 metric authority (P1/P4/P5/P6/P9/P10/P16/P17/P19/P20)
 * is NOT touched here — this module only resolves WHICH seats belong to each
 * scope.
 */

import { resolveSeatPriority, PRIMARY, SECONDARY } from './seatPriorityAuthority';

/**
 * Deterministic fingerprint of the current seat-priority set.
 * Format: sorted "seatId:priority" pairs joined by "|".
 *
 * Used as a scope-identity stamp on published ratings so consumers can detect
 * when a published scoped rating was calculated from a different priority set
 * than the current live one.
 *
 * @param {Array<object>} seats
 * @returns {string}
 */
export function buildSeatPriorityFingerprint(seats) {
  if (!Array.isArray(seats)) return '';
  return seats
    .filter((s) => s && s.id)
    .map((s) => `${s.id}:${resolveSeatPriority(s)}`)
    .sort()
    .join('|');
}

/**
 * Return the current Primary and Secondary seat ID arrays from canonical
 * seatingPositions. This is the single scope authority — every consumer
 * should call this instead of filtering seats independently.
 *
 * @param {Array<object>} seats
 * @returns {{ primarySeatIds: string[], secondarySeatIds: string[] }}
 */
export function getScopedSeatIds(seats) {
  const list = Array.isArray(seats) ? seats : [];
  const primarySeatIds = [];
  const secondarySeatIds = [];
  for (const s of list) {
    if (!s || !s.id) continue;
    if (resolveSeatPriority(s) === PRIMARY) {
      primarySeatIds.push(s.id);
    } else {
      secondarySeatIds.push(s.id);
    }
  }
  return { primarySeatIds, secondarySeatIds };
}

/**
 * Ensure every active seat carries an explicit canonical `priority` field.
 * Returns the SAME array reference when no change is needed.
 *
 * Applied at seat-creation/hydration entry points so no active seat reaches
 * scoped-rating calculation with undefined/null/empty-string priority.
 *
 * @param {Array<object>} seats
 * @returns {Array<object>} same ref if unchanged, new array otherwise
 */
export function normaliseSeatPriorities(seats) {
  if (!Array.isArray(seats)) return seats;
  let changed = false;
  const next = seats.map((s) => {
    if (!s || !s.id) return s;
    const p = resolveSeatPriority(s);
    if (s.priority !== p) {
      changed = true;
      return { ...s, priority: p };
    }
    return s;
  });
  return changed ? next : seats;
}