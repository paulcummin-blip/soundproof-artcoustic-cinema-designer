// stage2FinalistPromotion.js
// Selects which Stage 1 finalists to promote for Stage 2 canonical evaluation.
//
// Normal target: 2 acoustically diverse finalists per quantity.
// Maximum: 3 per quantity (only when tie / same family / not reaching L2 /
// Stage 1 evidence suggests material improvement).
//
// A remains prohibited. B is NOT promoted by this module — the B last-resort
// gate is handled separately by the engine after normal evaluation.

import { STAGE2_FINALISTS_NORMAL, STAGE2_FINALISTS_MAX } from "./stage2Constants";
import { isProhibitedFamily, isBFamily } from "../stage1/stage1FamilyRegistry";

/**
 * Promote finalists for a single quantity from Stage 1 results.
 *
 * @param {Array} stage1Finalists — Stage 1 finalists for this quantity
 * @returns {Array} promoted finalists (max STAGE2_FINALISTS_MAX)
 */
export function promoteFinalistsForQuantity(stage1Finalists) {
  const finalists = (Array.isArray(stage1Finalists) ? stage1Finalists : [])
    .filter((f) => f && f.id && !isProhibitedFamily(f.familyId) && !isBFamily(f.familyId));

  if (finalists.length <= STAGE2_FINALISTS_NORMAL) return finalists.slice(0, STAGE2_FINALISTS_MAX);

  // Select the best 2 acoustically diverse finalists.
  // Stage 1 finalists are already ranked by screening quality, so the first
  // finalist from each distinct family gives the best diversity.
  const promoted = [];
  const familiesSeen = new Set();

  // First pass: best from each family (up to NORMAL count)
  for (const f of finalists) {
    if (promoted.length >= STAGE2_FINALISTS_NORMAL) break;
    if (!familiesSeen.has(f.familyId)) {
      promoted.push(f);
      familiesSeen.add(f.familyId);
    }
  }

  // Second pass: fill remaining NORMAL slots with next-best finalists
  for (const f of finalists) {
    if (promoted.length >= STAGE2_FINALISTS_NORMAL) break;
    if (!promoted.includes(f)) promoted.push(f);
  }

  return promoted.slice(0, STAGE2_FINALISTS_MAX);
}

/**
 * Decide whether a third finalist should be evaluated for a quantity.
 *
 * @param {Array} evaluatedResults — results from the first 2 finalists
 * @param {Array} remainingFinalists — finalists not yet evaluated
 * @returns {boolean} true if a third finalist should be evaluated
 */
export function shouldEvaluateThirdFinalist(evaluatedResults, remainingFinalists) {
  if (!remainingFinalists.length) return false;
  if (evaluatedResults.length < STAGE2_FINALISTS_NORMAL) return true;

  const [first, second] = evaluatedResults;
  if (!first || !second) return true;

  // Effectively tied? (same ranking tuple within tolerance)
  const firstRank = first?.rankingData?.rankingTuple;
  const secondRank = second?.rankingData?.rankingTuple;
  if (!firstRank || !secondRank) return true;

  // Check if first two are effectively tied (first 7 tuple elements match)
  let tied = true;
  for (let i = 0; i < 7; i += 1) {
    const va = firstRank[i] ?? 0;
    const vb = secondRank[i] ?? 0;
    if (Math.abs(va - vb) > 0.15) { tied = false; break; }
  }

  // Both come from the same family and another plausible family remains
  const sameFamily = first.familyId === second.familyId;
  const otherFamilyRemains = remainingFinalists.some(
    (f) => f.familyId !== first.familyId && f.familyId !== second.familyId,
  );
  if (sameFamily && otherFamilyRemains) return true;

  // Neither reaches the Primary L2 objective
  const firstPrimaryL2 = first.rankingData?.primarySummary?.p19BelowL2 === 0
    && first.rankingData?.primarySummary?.p20BelowL2 === 0;
  const secondPrimaryL2 = second.rankingData?.primarySummary?.p19BelowL2 === 0
    && second.rankingData?.primarySummary?.p20BelowL2 === 0;
  if (!firstPrimaryL2 && !secondPrimaryL2) return true;

  // Effectively tied — evaluate third to break the tie
  if (tied) return true;

  return false;
}

/**
 * Build the full promotion plan for all quantities.
 *
 * @param {object} stage1Results — { one_sub_result, two_sub_result, four_sub_result }
 * @returns {object} { 1: [...], 2: [...], 4: [...] } promoted finalists per quantity
 */
export function buildPromotionPlan(stage1Results) {
  const plan = {};
  const quantityMap = { 1: "one_sub_result", 2: "two_sub_result", 4: "four_sub_result" };
  for (const qty of [1, 2, 4]) {
    const result = stage1Results?.[quantityMap[qty]];
    plan[qty] = promoteFinalistsForQuantity(result?.finalists || []);
  }
  return plan;
}