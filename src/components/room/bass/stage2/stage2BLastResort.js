// stage2BLastResort.js
// RP22 B last-resort eligibility gate, finalist generation, and material
// improvement comparison rule.
//
// B is ONLY evaluated when every promoted practical four-sub candidate has
// been evaluated and none passes the credibility gate. B then runs through
// the exact same canonical evaluation pipeline — no B-specific acoustic maths.
//
// B is not automatically the winner merely because it was needed. It must be
// materially better on Primary-seat acoustic fields to beat a practical family.

import {
  FAMILY_IDS,
  FAMILY_SEEDS,
  isBFamily,
  isProhibitedFamily,
} from "../stage1/stage1FamilyRegistry";
import { compareStage2Results } from "./stage2Ranking";
import { STAGE2_B_MATERIAL_IMPROVEMENT_DB, STAGE2_TIE_TOLERANCE_DB } from "./stage2Constants";

// Practical four-sub families that must be exhausted before B is eligible.
const PRACTICAL_FOUR_SUB_FAMILIES = [
  FAMILY_IDS.RP22_C,
  FAMILY_IDS.RP22_E,
  FAMILY_IDS.RP22_D,
  FAMILY_IDS.FOUR_SYMMETRIC_BOUNDARY_CUSTOM,
  FAMILY_IDS.FOUR_ASYMMETRIC_BOUNDARY_CUSTOM,
];

/**
 * Check if a Stage 2 result passes the credibility gate.
 *
 * Credibility gate:
 * - selected P14 target achieved
 * - valid achieved P18
 * - every Primary seat P19 >= L2
 * - every Primary seat P20 >= L2
 */
export function passesCredibilityGate(result) {
  if (!result) return false;
  // P14 achieved
  if (result.p14Limited) return false;
  // Valid P18
  if (result.p18Limited) return false;
  if (!Number.isFinite(result.achievedP18Hz) || result.achievedP18Hz === null) return false;
  // Every Primary seat P19 >= L2 and P20 >= L2
  const primaryP19 = (result.perSeatP19 || []).filter((s) => s.isPrimary);
  if (primaryP19.length === 0) return false;
  const p20BySeat = new Map((result.perSeatP20 || []).map((s) => [String(s.seatId), s]));
  for (const seat of primaryP19) {
    if ((seat.level || 0) < 2) return false;
    const p20 = p20BySeat.get(String(seat.seatId));
    if (!p20 || (p20.level || 0) < 2) return false;
  }
  return true;
}

function describeCredibilityFailure(result) {
  if (!result) return "no_result";
  if (result.p14Limited) return "p14_not_achieved";
  if (result.p18Limited) return "p18_invalid";
  const primarySeats = (result.perSeatP19 || []).filter((s) => s.isPrimary);
  if (primarySeats.length === 0) return "no_primary_seats";
  const p20BySeat = new Map((result.perSeatP20 || []).map((s) => [String(s.seatId), s]));
  for (const seat of primarySeats) {
    if ((seat.level || 0) < 2) return `primary_p19_below_l2:${seat.seatId}`;
    const p20 = p20BySeat.get(String(seat.seatId));
    if (!p20 || (p20.level || 0) < 2) return `primary_p20_below_l2:${seat.seatId}`;
  }
  return "unknown";
}

/**
 * Evaluate B eligibility after all practical four-sub candidates have been
 * evaluated.
 *
 * Conditions:
 * 1. RP22 C evaluated where available (promoted)
 * 2. RP22 E evaluated where available (promoted)
 * 3. RP22 D evaluated where available (promoted)
 * 4. Practical/custom symmetric finalists evaluated where promoted
 * 5. Evaluations completed successfully (not cancelled/stale)
 * 6. No practical candidate passes the credibility gate
 *
 * @param {object} params
 * @param {Array} params.evaluatedResults — 4-sub results from Stage 2
 * @param {Array} params.promotedFinalists — 4-sub finalists that were promoted
 * @param {string} params.fingerprint — fingerprint when B check runs
 * @param {string} params.currentFingerprint — current active fingerprint
 * @returns {object} { eligible, reason, failedCandidates }
 */
export function evaluateBEligibility({
  evaluatedResults,
  promotedFinalists,
  fingerprint,
  currentFingerprint,
}) {
  // Condition 5: not stale
  if (fingerprint !== currentFingerprint) {
    return { eligible: false, reason: "stale_fingerprint", failedCandidates: [] };
  }

  // Families that were promoted for 4-sub (practical only)
  const promotedPracticalFamilies = new Set(
    (promotedFinalists || [])
      .map((f) => f?.familyId)
      .filter((f) => f && !isProhibitedFamily(f) && !isBFamily(f))
  );

  // Families that were actually evaluated (non-B, non-A)
  const evaluatedFamilies = new Set();
  for (const result of evaluatedResults || []) {
    if (result?.familyId && !isProhibitedFamily(result.familyId) && !isBFamily(result.familyId)) {
      evaluatedFamilies.add(result.familyId);
    }
  }

  // Conditions 1-4: all promoted practical families were evaluated
  for (const fam of promotedPracticalFamilies) {
    if (!evaluatedFamilies.has(fam)) {
      return { eligible: false, reason: `family_${fam}_not_evaluated`, failedCandidates: [] };
    }
  }

  // Condition 6: no practical candidate passes the credibility gate
  const practicalResults = (evaluatedResults || []).filter(
    (r) => r && !isBFamily(r.familyId) && !isProhibitedFamily(r.familyId)
  );

  const failedCandidates = [];
  let passingCount = 0;

  for (const result of practicalResults) {
    if (passesCredibilityGate(result)) {
      passingCount += 1;
    } else {
      failedCandidates.push({
        finalistId: result.finalistId,
        familyId: result.familyId,
        reason: describeCredibilityFailure(result),
      });
    }
  }

  if (passingCount > 0) {
    return { eligible: false, reason: "practical_candidate_passes", failedCandidates: [] };
  }

  // All conditions met — B is eligible
  return {
    eligible: true,
    reason: "all_practical_candidates_failed_credibility_gate",
    failedCandidates,
  };
}

/**
 * Generate the B family finalist (four wall midpoints).
 * Uses the same acoustic centre-point convention as Stage 1.
 *
 * @returns {object} B finalist { id, familyId, sources, searchTier, symmetryState, seedDisplacement }
 */
export function generateBFinalist() {
  const seeds = FAMILY_SEEDS[FAMILY_IDS.RP22_B_LAST_RESORT];
  const sources = seeds.map((s) => ({ xNorm: s.xNorm, yNorm: s.yNorm }));
  const id = `${FAMILY_IDS.RP22_B_LAST_RESORT}:${sources
    .map((s) => `${s.xNorm}_${s.yNorm}`)
    .join("|")}`;
  return {
    id,
    familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
    sources,
    searchTier: 99,
    symmetryState: "symmetric",
    seedDisplacement: 0,
  };
}

/**
 * Compare B against a practical candidate with the B material improvement rule.
 *
 * B wins only if its acoustic Primary-seat result is materially better:
 * - B improves a whole-dB level field (positions 0-4), OR
 * - B improves a raw deviation field (positions 5-6) by >= MATERIAL_IMPROVEMENT_DB
 *
 * If B is tied on whole-dB levels and only fractionally better on raw
 * deviations, the practical candidate wins on family preference.
 *
 * @param {object} bResult — B finalist result (with rankingTuple)
 * @param {object} practicalResult — practical finalist result (with rankingTuple)
 * @returns {number} negative if B ranks higher, positive if practical ranks higher
 */
export function compareBAgainstPractical(bResult, practicalResult) {
  const tb = bResult?.rankingTuple;
  const tp = practicalResult?.rankingTuple;
  if (!tb || !tp) return 0;

  // Check whole-dB level fields (positions 0-4).
  // Higher = better for all of these.
  for (let i = 0; i < 5; i += 1) {
    const vb = tb[i] ?? 0;
    const vp = tp[i] ?? 0;
    if (Math.abs(vb - vp) > 0.01) return vb > vp ? -1 : 1;
  }

  // Whole-dB levels are tied. Check raw deviation fields (positions 5-6).
  // B must improve by >= MATERIAL_IMPROVEMENT_DB to win on raw deviations.
  for (let i = 5; i < 7; i += 1) {
    const vb = tb[i] ?? 0;
    const vp = tp[i] ?? 0;
    if (vb - vp >= STAGE2_B_MATERIAL_IMPROVEMENT_DB) return -1; // B wins
    if (vp - vb >= STAGE2_B_MATERIAL_IMPROVEMENT_DB) return 1; // practical wins
  }

  // No material improvement on Primary acoustic fields (positions 0-6).
  // Compare remaining fields (positions 7+) — practical wins on family preference.
  const len = Math.max(tb.length, tp.length);
  for (let i = 7; i < len; i += 1) {
    const vb = tb[i] ?? 0;
    const vp = tp[i] ?? 0;
    if (typeof vb === "number" && typeof vp === "number") {
      if (Math.abs(vb - vp) > STAGE2_TIE_TOLERANCE_DB) return vb > vp ? -1 : 1;
    } else {
      if (vb !== vp) return vb < vp ? -1 : 1;
    }
  }

  // Completely tied — practical wins on family preference (position 12).
  return 1;
}