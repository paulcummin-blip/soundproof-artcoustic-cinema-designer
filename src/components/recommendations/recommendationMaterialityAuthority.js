/**
 * recommendationMaterialityAuthority.js
 * -------------------------------------
 * Canonical 5-percentage-point materiality threshold for ASDR recommendation
 * presentation eligibility.
 *
 * This is the FINAL eligibility gate, applied AFTER:
 *   1. RP22-first hierarchy (FAIL → L1 → L2 → L3 → L4)
 *   2. Viewing Priority comparator (Stage D)
 *   3. All existing candidate evaluation, profile checks, and cost protections
 *
 * Threshold is INCLUSIVE and uses UNROUNDED ASDR percentages (scoreDelta
 * derived from raw displayPercentage, never the rounded UI value).
 *
 *   Improvement:  scoreDelta >= +5.0 pp  → SHOW
 *   Cost-saving: scoreDelta <= -5.0 pp  → SHOW (if otherwise eligible)
 *
 * This module does NOT alter candidate evaluation, RP22/RP23/ASDR authorities,
 * viewing priority logic, pricing, or bass authority. It is a presentation
 * shortlist filter only.
 */

/** Absolute percentage-point movement required for a recommendation to be material. */
export const MATERIALITY_THRESHOLD_PP = 5.0;

/**
 * Whether an improvement candidate moves the ASDR by at least +5pp.
 * Uses the unrounded scoreDelta (percentage points).
 *
 * @param {number} scoreDelta - Unrounded ASDR percentage-point delta (new − baseline)
 * @returns {boolean}
 */
export function isMaterialImprovement(scoreDelta) {
  const delta = Number(scoreDelta);
  return Number.isFinite(delta) && delta >= MATERIALITY_THRESHOLD_PP;
}

/**
 * Whether a cost-saving candidate represents a material compromise: the ASDR
 * must drop by at least 5pp. Uses the unrounded scoreDelta (percentage points).
 *
 * @param {number} scoreDelta - Unrounded ASDR percentage-point delta (new − baseline)
 * @returns {boolean}
 */
export function isMaterialCostSaving(scoreDelta) {
  const delta = Number(scoreDelta);
  return Number.isFinite(delta) && delta <= -MATERIALITY_THRESHOLD_PP;
}