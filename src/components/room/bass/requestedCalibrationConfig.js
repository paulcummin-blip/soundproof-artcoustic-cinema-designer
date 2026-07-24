// Derives the fixed requested RP22 bass target and calibration inputs.
// The requested Level 1–4 authority determines the house-curve anchor before
// EQ; product capability is deliberately excluded from this target selection.

import { DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { resolveRequestedRp22HouseCurveTarget } from "@/components/utils/requestedRp22HouseCurveAuthority";

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
  const transitionHz = Number.isFinite(optimisationTransitionHz) ? optimisationTransitionHz : null;
  const usableLfHz = Number.isFinite(designEqSystemLimits?.usableLfHz) ? designEqSystemLimits.usableLfHz : null;
  const p14TargetBasis = "minimum";
  const requestedLevel = Math.max(1, Math.min(4, Math.round(Number(splConfig?.bassTargetLevel) || 4)));
  const target = resolveRequestedRp22HouseCurveTarget(getRp22BassOperatingDefinitions(p14TargetBasis), requestedLevel);
  const targetSpl = target.targetAnchorDb;

  return {
    p14TargetBasis,
    requestedLevel,
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