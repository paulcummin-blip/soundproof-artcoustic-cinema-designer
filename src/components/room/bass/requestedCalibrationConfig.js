// requestedCalibrationConfig.js — Phase 2A: Derives the requested calibration
// configuration from the ACTUAL inputs passed to the optimiser, not from an
// inferred L1/Standard baseline.
//
// The optimiser (generateCandidatePool) receives:
//   { rawCurve, activeSubs, usableLfHz, transitionHz, perSeatRawCurves }
// and internally searches ALL RP22 level combinations (L1–L4 for p14/p18/p19)
// with BOTH "standard" and "accuracy" fit profiles.
//
// Values that genuinely exist before a candidate is created:
//   - transitionHz  → assessment end / transition boundary
//   - usableLfHz     → usable LF limit
//   - targetSpl      → requested output / target anchor
//
// Values that do NOT exist as single requested values (the optimiser searches
// across all combinations):
//   - P14 target     → null (searched, not requested)
//   - P18 boundary   → null (searched, not requested)
//   - Fit profile    → null (both standard and accuracy are evaluated)
//   - EQ constraints → null (no single profile selected)
//
// This is more truthful than inventing L1 or Standard.

import { DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";

// The sorted set of fit profiles actually evaluated by the optimiser.
// Derived from the same exported DESIGN_EQ_FIT_PROFILES used by
// generateCandidatePool (FIT_PROFILES_TO_GENERATE iterates these entries).
// Values are NOT duplicated manually — id, maximumAggregateBoostDb, and
// maximumCutDb are read directly from the profile definitions so any future
// change to the exported constants is reflected here automatically.
export function deriveEvaluatedProfiles() {
  return Object.keys(DESIGN_EQ_FIT_PROFILES)
    .sort()
    .map((id) => {
      const p = DESIGN_EQ_FIT_PROFILES[id];
      return {
        id: p.id,
        maximumAggregateBoostDb: p.maximumAggregateBoostDb,
        maximumCutDb: p.maximumCutDb,
      };
    });
}

export function deriveRequestedCalibrationConfig({
  splConfig,
  optimisationTransitionHz,
  designEqSystemLimits,
}) {
  const targetSpl = Number.isFinite(splConfig?.targetSpl) ? splConfig.targetSpl : null;
  const transitionHz = Number.isFinite(optimisationTransitionHz) ? optimisationTransitionHz : null;
  const usableLfHz = Number.isFinite(designEqSystemLimits?.usableLfHz) ? designEqSystemLimits.usableLfHz : null;
  // The optimiser keeps the existing Minimum authority. Minimum/Recommended is
  // now a presentation interpretation and must never restart the worker.
  const p14TargetBasis = "minimum";

  return {
    p14TargetBasis,
    // P18 boundary — searched across all RP22 levels by the optimiser, not a
    // single requested value. null is truthful.
    requestedAssessmentStartHz: null,
    // Assessment end / transition — real input to generateCandidatePool.
    requestedAssessmentEndHz: transitionHz,
    // Target anchor — the user's requested target SPL.
    requestedTargetAnchorDb: targetSpl,
    // Fit profile — optimiser evaluates both "standard" and "accuracy".
    // No single requested profile exists. null is truthful.
    requestedFitProfile: null,
    // Requested output — the user's requested target SPL.
    requestedOutputDb: targetSpl,
    // Usable LF limit — real input to generateCandidatePool.
    requestedUsableLfHz: usableLfHz,
    // Evaluated profiles — the sorted set of fit profiles the optimiser
    // actually evaluates, with their real named constraints (id, max aggregate
    // boost, max cut) derived from DESIGN_EQ_FIT_PROFILES. Included in the
    // calibration fingerprint so a change to the profile definitions (e.g.
    // raising the cut ceiling) invalidates cached results.
    evaluatedProfiles: deriveEvaluatedProfiles(),
  };
}