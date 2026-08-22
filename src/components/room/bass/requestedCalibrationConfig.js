// Derives the fixed requested RP22 bass target and calibration inputs.
// The requested Level 1–4 authority determines the house-curve anchor before
// EQ; product capability is deliberately excluded from this target selection.

import { DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { resolveRequestedRp22HouseCurveTarget } from "@/components/utils/requestedRp22HouseCurveAuthority";
import { normalizeP18TargetBasis, p18ThresholdHzForLevel } from "@/components/utils/p18ExtensionAuthority";

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
  const p14TargetBasis = splConfig?.selectedP14TargetBasis === "recommended" ? "recommended"
    : splConfig?.selectedP14TargetBasis === "minimum" ? "minimum"
    : null;
  const p18TargetBasis = normalizeP18TargetBasis(splConfig?.selectedP18TargetBasis || splConfig?.p18Mode);
  const rawP14Level = splConfig?.selectedP14Level;
  // Explicit null guard: Number(null) === 0, which Number.isFinite accepts.
  // A null/undefined/0/NaN level must remain null — never coerced to L1.
  const requestedLevel = (Number.isFinite(Number(rawP14Level)) && Number(rawP14Level) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(rawP14Level))))
    : null;
  // P14 target not yet selected — return null P14 identity. No bass optimisation
  // runs until the user explicitly selects a P14 target.
  if (!p14TargetBasis || !requestedLevel) {
    return {
      p14TargetBasis: null,
      requestedLevel: null,
      selectedP14TargetBasis: null,
      selectedP14Level: null,
      selectedP14TargetDb: null,
      p18TargetBasis,
      selectedP18TargetBasis: p18TargetBasis,
      selectedP18RequiredExtensionHz: p18ThresholdHzForLevel(p18TargetBasis, 1),
      selectedP14RequiredExtensionHz: null,
      requestedAssessmentStartHz: null,
      requestedAssessmentEndHz: transitionHz,
      requestedTargetAnchorDb: null,
      requestedFitProfile: null,
      requestedOutputDb: null,
      requestedUsableLfHz: usableLfHz,
      evaluatedProfiles: deriveEvaluatedProfiles(),
    };
  }
  const target = resolveRequestedRp22HouseCurveTarget(getRp22BassOperatingDefinitions(p14TargetBasis, p18TargetBasis), requestedLevel);
  // P14 and P18 are independent RP22 parameters. P14 is the user's fixed
  // 20–120 Hz SPL demand; it does not silently request the same numbered P18
  // level. P18 is graded from the extension actually delivered at that P14
  // operating output. The only P18 requirement carried here is the selected
  // basis' L1 floor, used to distinguish a real P18 FAIL from an achieved level.
  const selectedP18RequiredExtensionHz = p18ThresholdHzForLevel(p18TargetBasis, 1);
  const targetSpl = target.targetAnchorDb;

  return {
    p14TargetBasis,
    requestedLevel,
    selectedP14TargetBasis: p14TargetBasis,
    selectedP14Level: requestedLevel,
    selectedP14TargetDb: targetSpl,
    p18TargetBasis,
    selectedP18TargetBasis: p18TargetBasis,
    selectedP18RequiredExtensionHz,
    // P14 always uses the fixed RP22 LFE assessment band. This identity must
    // never inherit a P18 extension threshold.
    selectedP14RequiredExtensionHz: 20,
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