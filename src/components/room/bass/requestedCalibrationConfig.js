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

export function deriveRequestedCalibrationConfig({
  splConfig,
  optimisationTransitionHz,
  designEqSystemLimits,
}) {
  const targetSpl = Number.isFinite(splConfig?.targetSpl) ? splConfig.targetSpl : null;
  const transitionHz = Number.isFinite(optimisationTransitionHz) ? optimisationTransitionHz : null;
  const usableLfHz = Number.isFinite(designEqSystemLimits?.usableLfHz) ? designEqSystemLimits.usableLfHz : null;

  return {
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
  };
}