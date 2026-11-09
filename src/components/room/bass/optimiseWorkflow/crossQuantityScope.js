// crossQuantityScope.js
// Extracts the bounded eligible 1/2/4 cross-quantity scope from a Stage 2
// result so the V2 optimiser can evaluate physically valid finalist placements
// whose subwoofer quantity differs from the installed design.
//
// This module is a pure reader: it inspects the existing Stage 2 canonical
// evaluation evidence and returns the quantities that have at least one
// eligible evaluated finalist. It does not trigger any Stage 1 or Stage 2
// search, does not modify the Stage 2 state, and does not invent candidates.
//
// The eligible check reuses the single recommendation-eligibility authority
// (isCandidateEligibleForRecommendation) that the Stage 2 store itself uses to
// split evaluated finalists from rejected ones. A quantity whose only finalists
// are physically rejected, terminal, canonically incomplete or missing P19/P20
// evidence is excluded, so the V2 engine never receives a quantity it cannot
// canonically evaluate.

import { isCandidateEligibleForRecommendation } from "../stage2/stage2CandidateEligibility";

/**
 * The recommendation scope: 1, 2 and 4 subwoofers. 3-sub is excluded from this
 * workflow (it remains fully supported by the existing Stage 1/Stage 2 search
 * elsewhere). This matches RECOMMENDATION_QUANTITIES in stage1RecommendationScope.
 */
export const CROSS_QUANTITY_SCOPE = [1, 2, 4];

const QUANTITY_RESULT_KEYS = {
  1: "one_sub_result",
  2: "two_sub_result",
  3: "three_sub_result",
  4: "four_sub_result",
};

/**
 * Extract the eligible cross-quantity scope from a Stage 2 result.
 *
 * Returns the quantities from the recommendation scope [1, 2, 4] that:
 *   - differ from the installed quantity,
 *   - have a per-quantity result in the Stage 2 state,
 *   - have at least one eligible evaluated finalist (not physically rejected,
 *     not terminal, canonical evaluation complete, P19/P20 evidence valid).
 *
 * The result is bounded to the recommendation scope and sorted ascending.
 * A scoped Stage 2 result (selectedQuantityOnly) only carries the installed
 * quantity, so this returns an empty array in that case and the V2 engine
 * preserves its existing same-quantity behaviour unchanged.
 *
 * @param {object} stage2Result — from getStage2State(projectId, versionId)
 * @param {number} installedQuantity — the installed (enabled) subwoofer count
 * @returns {number[]} bounded eligible cross-quantity quantities (ascending)
 */
export function extractEligibleCrossQuantityScope(stage2Result, installedQuantity) {
  if (!stage2Result || !Number.isFinite(Number(installedQuantity)) || Number(installedQuantity) <= 0) {
    return [];
  }
  const scope = [];
  for (const qty of CROSS_QUANTITY_SCOPE) {
    if (qty === Number(installedQuantity)) continue;
    const key = QUANTITY_RESULT_KEYS[qty];
    const qtyResult = stage2Result?.[key];
    if (!qtyResult) continue;
    const finalists = Array.isArray(qtyResult.evaluatedFinalists)
      ? qtyResult.evaluatedFinalists
      : [];
    const hasEligible = finalists.some((f) => isCandidateEligibleForRecommendation(f));
    if (hasEligible) scope.push(qty);
  }
  return scope;
}