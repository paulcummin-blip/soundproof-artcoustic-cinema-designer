// stage2OverallBestSelection.js
// ---------------------------------------------------------------------------
// The documented Stage 2 overall-best rule.
//
// overall_best is the best-RANKED candidate across every quantity, chosen with
// the SAME lexicographic comparator used everywhere else. It is never "the
// first quantity that happened to be processed" — a one-sub candidate must not
// be labelled the overall winner merely because it was ranked first.
// ---------------------------------------------------------------------------

import { compareStage2Results } from "./stage2Ranking.js";

/** The quantities Stage 2 evaluates, in processing order. */
export const STAGE2_QUANTITY_ORDER = Object.freeze([1, 2, 4]);

/**
 * The better-ranked of two candidates. Returns `current` when the candidate is
 * unrankable or ranks lower, so an unrankable result can never become the
 * overall winner.
 */
export function betterOverallBest(current, candidate) {
  if (!current) return candidate || null;
  if (!candidate) return current;
  return compareStage2Results(candidate, current) < 0 ? candidate : current;
}

/**
 * Whole-set rule: compare every quantity's winner and keep the best-ranked.
 *
 * @param {object} byQuantity - { 1: bestForQty1, 2: …, 4: … } (nulls allowed)
 * @returns {object|null} the overall best, tagged with its quantity
 */
export function selectOverallBest(byQuantity) {
  let best = null;
  for (const quantity of STAGE2_QUANTITY_ORDER) {
    const candidate = byQuantity?.[quantity] || null;
    if (!candidate) continue;
    best = betterOverallBest(best, { quantity, ...candidate });
  }
  return best;
}