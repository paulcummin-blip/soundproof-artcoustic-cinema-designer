// stage2CandidateEligibility.js
// ---------------------------------------------------------------------------
// Canonical eligibility authority for Stage 2 subwoofer placement candidates.
//
// A candidate is eligible for an actionable recommendation or Apply ONLY when:
//   - Physical geometry and cabinet boundaries are valid (no physical rejection;
//     the evaluated physicalValidation passed).
//   - No prohibited cabinet overlap exists (a physical rejection reason).
//   - Required canonical evaluation completed successfully (non-terminal result
//     carrying a ranking tuple).
//   - Required candidate-specific P19/P20 evidence is valid (the requested P14
//     operating point was achieved and the aggregate P19 level is present and
//     non-negative).
//
// Physically rejected candidates are EXCLUDED from actionable recommendation
// selection regardless of their ranking tuple. They remain in diagnostic
// evidence (evaluatedFinalists) with their original rejection reasons — never
// erased, never falsely described as unevaluated.
//
// This module reuses the existing physical-validation and evidence fields the
// Stage 2 canonical evaluation already produces. It creates no competing
// geometry rules and changes no acoustic physics, RP22 scoring, candidate
// generation, Stage 1 screening or ranking maths.
// ---------------------------------------------------------------------------

/**
 * Is a Stage 2 result's canonical P19/P20 evidence valid to act on?
 *
 * A result that failed the requested P14 operating point, that carried a
 * physical rejection, or that terminated without canonical assessment never
 * carries valid P19/P20 — so it is never shown as a predicted RP22 result and
 * never eligible for an actionable recommendation.
 *
 * This is the single evidence-validity authority. The evaluated-option
 * presentation re-exports it so the display path and the eligibility path share
 * one definition.
 *
 * @param {object} result — Stage 2 canonical finalist result
 * @returns {boolean}
 */
export function resultEvidenceIsValid(result) {
  if (!result || result.terminal === true || result.physicalRejection) return false;
  if (result.requestedP14Pass === false) return false;
  // Explicit null guard: Number(null) === 0, which Number.isFinite accepts.
  // A null/undefined P19 level must never be treated as a valid Level 0.
  const p19Level = result.achievedP19Level;
  if (p19Level == null || !Number.isFinite(Number(p19Level)) || Number(p19Level) < 0) return false;
  return true;
}

/**
 * Full recommendation eligibility for a Stage 2 candidate result.
 *
 * Combines the physical-validation, canonical-completion and evidence checks
 * the actionable recommendation and Apply paths must all pass before a
 * candidate can be selected or applied.
 *
 * @param {object} result — Stage 2 canonical finalist result
 * @returns {{ eligible: boolean, reason: string|null }}
 *   reason is the original rejection reason (kept verbatim for diagnostics)
 *   when the candidate was physically rejected, or a stable gate id otherwise.
 */
export function candidateRecommendationEligibility(result) {
  if (!result) return { eligible: false, reason: "no-result" };

  // Physical geometry & cabinet boundaries (existing authority output).
  if (result.physicalRejection) {
    return { eligible: false, reason: result.physicalRejection.reason || "physical-rejection" };
  }
  if (result.physicalValidation && result.physicalValidation.passed === false) {
    return { eligible: false, reason: result.physicalValidation.reason || "physical-validation-failed" };
  }
  // Terminal candidate (e.g. a placement that could not be canonically assessed).
  if (result.terminal === true) return { eligible: false, reason: "terminal-candidate" };

  // Required canonical evaluation completed successfully.
  if (!Array.isArray(result?.rankingData?.rankingTuple)) {
    return { eligible: false, reason: "canonical-evaluation-incomplete" };
  }

  // Required candidate-specific P19/P20 evidence is valid (reuses the single
  // evidence authority — covers the requested P14 operating point and the
  // aggregate P19 level).
  if (!resultEvidenceIsValid(result)) {
    if (result.requestedP14Pass === false) {
      return { eligible: false, reason: result.p14NotAchievedReason || "p14-operating-point-not-achieved" };
    }
    return { eligible: false, reason: "missing-p19-p20-evidence" };
  }

  return { eligible: true, reason: null };
}

/**
 * Convenience boolean for the recommendation selection boundary.
 * @param {object} result — Stage 2 canonical finalist result
 * @returns {boolean}
 */
export function isCandidateEligibleForRecommendation(result) {
  return candidateRecommendationEligibility(result).eligible;
}