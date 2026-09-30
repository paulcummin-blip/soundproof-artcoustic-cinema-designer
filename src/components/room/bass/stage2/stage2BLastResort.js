// stage2BLastResort.js
// RP22 B last-resort eligibility gate and finalist generation.
//
// B is ONLY evaluated when the practical four-sub search is positively
// exhausted: Stage 1 is complete, every practical family that retained a
// finalist has been canonically evaluated (including representatives beyond
// the normal two-per-quantity promotion limit), and none passes the
// credibility gate. B then runs through the exact same canonical evaluation
// pipeline and is ranked identically to every other candidate — no
// B-specific acoustic maths, no B-specific threshold.
//
// B is never eligible merely because the practical candidate set is empty
// (no vacuous eligibility). An empty practical set means the optimiser is
// incomplete, not that B should step in.

import {
  FAMILY_IDS,
  FAMILY_SEEDS,
  isBFamily,
  isProhibitedFamily,
} from "../stage1/stage1FamilyRegistry.js";

/**
 * P19 credibility of a result.
 *
 * P19 is ONE authoritative RSP result, so it is read from the aggregate
 * `achievedP19Level`. A per-seat P19 array is obsolete evidence: it is used ONLY
 * when it actually exists, and its absence is never a failure and is never
 * converted into Level 0.
 *
 * @returns {boolean}
 */
function passesP19Credibility(result) {
  const aggregate = Number(result?.achievedP19Level);
  if (Number.isFinite(aggregate)) return aggregate >= 2;
  const legacyPrimary = (Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [])
    .filter((seat) => seat?.isPrimary);
  if (legacyPrimary.length === 0) return false; // no P19 evidence at all
  return legacyPrimary.every((seat) => (seat.level || 0) >= 2);
}

/**
 * Check if a Stage 2 result passes the credibility gate.
 *
 * Credibility gate:
 * - selected P14 target achieved
 * - valid achieved P18
 * - aggregate RSP P19 >= L2 (per-seat P19 is obsolete and never required)
 * - every Primary seat P20 >= L2 (P20 is the per-seat consistency result)
 */
export function passesCredibilityGate(result) {
  if (!result) return false;
  // P14 achieved
  if (result.p14Limited) return false;
  // Valid P18
  if (result.p18Limited) return false;
  if (!Number.isFinite(result.achievedP18Hz) || result.achievedP18Hz === null) return false;
  // P19 — one authoritative RSP aggregate
  if (!passesP19Credibility(result)) return false;
  // P20 — per-seat consistency, Primary seats only
  const primaryP20 = (Array.isArray(result.perSeatP20) ? result.perSeatP20 : [])
    .filter((seat) => seat?.isPrimary);
  if (primaryP20.length === 0) return false;
  for (const seat of primaryP20) {
    if ((seat.level || 0) < 2) return false;
  }
  return true;
}

function describeCredibilityFailure(result) {
  if (!result) return "no_result";
  if (result.p14Limited) return "p14_not_achieved";
  if (result.p18Limited) return "p18_invalid";
  const aggregateP19 = Number(result.achievedP19Level);
  if (Number.isFinite(aggregateP19)) {
    if (aggregateP19 < 2) return "rsp_p19_below_l2";
  } else {
    const legacyPrimary = (Array.isArray(result.perSeatP19) ? result.perSeatP19 : [])
      .filter((seat) => seat?.isPrimary);
    if (legacyPrimary.length === 0) return "no_p19_evidence";
    const below = legacyPrimary.find((seat) => (seat.level || 0) < 2);
    if (below) return `primary_p19_below_l2:${below.seatId}`;
  }
  const primaryP20 = (Array.isArray(result.perSeatP20) ? result.perSeatP20 : [])
    .filter((seat) => seat?.isPrimary);
  if (primaryP20.length === 0) return "no_primary_p20_evidence";
  const p20Below = primaryP20.find((seat) => (seat.level || 0) < 2);
  if (p20Below) return `primary_p20_below_l2:${p20Below.seatId}`;
  return "unknown";
}

/**
 * Evaluate B eligibility after the practical four-sub search is exhausted.
 *
 * B is eligible only when ALL of the following are positively proven:
 *
 * 1. Fingerprint is not stale.
 * 2. Stage 1 four-sub search is complete.
 * 3. Stage 1 produced at least one practical finalist (no vacuous eligibility).
 * 4. Every practical family that retained a Stage 1 finalist has canonical
 *    evidence — either a successful evaluation or a failed evaluation. A
 *    family that was not promoted but has a Stage 1 finalist must have its
 *    best representative evaluated before B can become eligible (this may
 *    exceed the normal two-finalists-per-quantity promotion limit).
 * 5. No required family evaluation failed technically (a failed required
 *    family means the optimiser is incomplete — B cannot conceal that).
 * 6. No practical candidate passes the credibility gate.
 *
 * @param {object} params
 * @param {Array} params.evaluatedResults — 4-sub canonical results so far
 * @param {Array} params.allStage1Finalists — ALL Stage 1 4-sub finalists (not just promoted)
 * @param {boolean} params.stage1Complete — whether Stage 1 4-sub search completed
 * @param {Set} params.evaluatedFamilyIds — family IDs with at least one successful evaluation
 * @param {Set} params.failedFamilyIds — family IDs where ALL evaluations failed
 * @param {string} params.fingerprint — fingerprint when B check runs
 * @param {string} params.currentFingerprint — current active fingerprint
 * @returns {object} { eligible, reason, failedCandidates, missingRepresentatives }
 *   missingRepresentatives: [{ familyId, finalist }] for families that still
 *   need canonical evaluation before B eligibility can be determined.
 */
export function evaluateBEligibility({
  evaluatedResults,
  allStage1Finalists,
  stage1Complete,
  evaluatedFamilyIds,
  failedFamilyIds,
  fingerprint,
  currentFingerprint,
}) {
  const empty = { eligible: false, reason: null, failedCandidates: [], missingRepresentatives: [] };

  // Condition 1: not stale
  if (fingerprint !== currentFingerprint) {
    return { ...empty, reason: "stale_fingerprint" };
  }

  // Condition 2: Stage 1 search must be complete
  if (!stage1Complete) {
    return { ...empty, reason: "stage1_incomplete" };
  }

  // Condition 3: must have practical Stage 1 finalists (no vacuous eligibility)
  const allFinalists = (allStage1Finalists || []).filter(
    (f) => f && f.id && !isProhibitedFamily(f.familyId) && !isBFamily(f.familyId)
  );
  if (allFinalists.length === 0) {
    return { ...empty, reason: "incomplete_practical_evidence" };
  }

  // Build required families: best (first) finalist per practical family that
  // Stage 1 retained. Stage 1 finalists are already ranked by screening
  // quality, so the first finalist from each family is its best representative.
  const familyToBestFinalist = new Map();
  for (const f of allFinalists) {
    if (!familyToBestFinalist.has(f.familyId)) {
      familyToBestFinalist.set(f.familyId, f);
    }
  }

  // Condition 4 & 5: every required family must have canonical evidence
  const missingRepresentatives = [];
  for (const [fam, finalist] of familyToBestFinalist.entries()) {
    if (evaluatedFamilyIds && evaluatedFamilyIds.has(fam)) continue; // has a success
    if (failedFamilyIds && failedFamilyIds.has(fam)) {
      // All evaluations for this required family failed technically
      return { ...empty, reason: `family_${fam}_evaluation_failed` };
    }
    // Not yet evaluated — needs a representative before B can be considered
    missingRepresentatives.push({ familyId: fam, finalist });
  }

  if (missingRepresentatives.length > 0) {
    return { ...empty, reason: "missing_representatives", missingRepresentatives };
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
    return { ...empty, reason: "practical_candidate_passes" };
  }

  // All required practical candidates genuinely failed the credibility gate
  return {
    ...empty,
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