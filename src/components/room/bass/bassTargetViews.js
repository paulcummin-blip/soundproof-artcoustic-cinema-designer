import { identifyBassLimitingParameter } from "@/components/utils/bassLimitingParameter";
import { formatP14TargetBasisDetail } from "@/components/utils/p14CapabilityAuthority";
import { assessP18Extension, formatP18TargetBasisDetail, normalizeP18TargetBasis } from "@/components/utils/p18ExtensionAuthority";

const cloneParameter = (parameter) => ({ ...(parameter || {}) });

function achievedLevel(parameters) {
  const levels = Object.values(parameters)
    .filter((parameter) => parameter?.status !== "not_applicable")
    .map((parameter) => parameter?.level)
    .filter(Number.isFinite);
  return levels.length ? Math.min(...levels) : null;
}

function buildTarget(parameters, basis, selectedCandidate, p18TargetBasis) {
  const p14Base = cloneParameter(parameters?.p14);
  const p18Base = cloneParameter(parameters?.p18);
  const selectedP18Basis = normalizeP18TargetBasis(p18TargetBasis);
  const p18Assessment = assessP18Extension(p18Base.value, selectedP18Basis);
  const p18ResultAvailable = p18Assessment.level != null;
  // P14 level/value = USER-SELECTED target, not capability-graded.
  // The user explicitly chooses the P14 operating target (Minimum/Recommended
  // × L1–L4). That selection is authoritative. Available capability is retained
  // separately (achievedCapabilityDb) for feasibility and headroom display.
  // The capability never overwrites the target; the target never overwrites
  // the capability.
  const p14SelectedLevel = Number.isFinite(Number(p14Base.selectedLevel)) && Number(p14Base.selectedLevel) > 0
    ? Math.max(1, Math.min(4, Math.round(Number(p14Base.selectedLevel))))
    : null;
  const p14SelectedTargetDb = Number.isFinite(p14Base.selectedTargetDb ?? p14Base.requestedTargetDb)
    ? Number(p14Base.selectedTargetDb ?? p14Base.requestedTargetDb)
    : null;
  const p14Level = p14SelectedLevel;
  const p14Value = p14SelectedTargetDb;
  const targetParameters = {
    p14: {
      ...p14Base,
      level: p14Level,
      value: p14Value,
      passedL1: p14Base.pass === true,
      targetBasis: basis,
      targetBasisDetail: formatP14TargetBasisDetail(basis),
      achievedCapabilityDb: p14Base.achievedCapabilityDb ?? p14Base.availableCapabilityDb ?? null,
      availableCapabilityDb: p14Base.achievedCapabilityDb ?? p14Base.availableCapabilityDb ?? null,
      pass: p14Base.pass,
      selectedLevel: p14SelectedLevel,
      selectedTargetDb: p14SelectedTargetDb,
      requestedTargetDb: p14SelectedTargetDb,
    },
    p18: {
      ...p18Base,
      level: p18Assessment.level,
      passedL1: p18Assessment.level != null ? p18Assessment.level >= 1 : false,
      targetBasis: selectedP18Basis,
      targetBasisDetail: formatP18TargetBasisDetail(selectedP18Basis),
      designHz: p18Assessment.designHz,
      performanceBand: p18Assessment.performanceBand,
      performanceMultiplier: p18Assessment.performanceMultiplier,
      qualifiedAtSelectedP14Output: p18ResultAvailable,
    },
    p19: cloneParameter(parameters?.p19),
    p20: cloneParameter(parameters?.p20),
  };
  const postEqCapability = selectedCandidate?.postEqCapabilityAssessment;
  const genericRecommendation = identifyBassLimitingParameter({
    achievedP14Level: targetParameters.p14.level,
    achievedP18Level: targetParameters.p18.level,
    achievedP19Level: targetParameters.p19.level,
    achievedP20Level: targetParameters.p20.level,
    p20Available: targetParameters.p20.status !== "not_applicable" && Number.isFinite(targetParameters.p20.level),
    worstP20SeatId: selectedCandidate?.worstP20SeatId ?? null,
  });
  const limitingParameter = postEqCapability?.limitingParameter || "P14";
  const limitingParameterKey = limitingParameter.toLowerCase();
  const limitingLevel = postEqCapability?.parameterLevels?.[limitingParameter];
  const shortfallSuffix = limitingParameter === "P14" && Number.isFinite(postEqCapability?.splShortfallDb)
    ? ` ${postEqCapability.splShortfallDb.toFixed(1)} dB shortfall`
    : "";
  const limitingFrequencySuffix = Number.isFinite(postEqCapability?.limitingFrequencyHz)
    ? ` at ${postEqCapability.limitingFrequencyHz.toFixed(1)} Hz.`
    : "";
  const recommendation = postEqCapability?.limitation ? {
    parameterKey: limitingParameterKey,
    parameterName: limitingParameter === "P18" ? "Bass extension at selected output" : "Bass output capability",
    achievedLevel: Number.isFinite(limitingLevel) && limitingLevel > 0 ? `L${limitingLevel}` : "FAIL",
    reason: `${postEqCapability.failureMessage || postEqCapability.limitation}${shortfallSuffix}${limitingFrequencySuffix}`,
    recommendedImprovement: postEqCapability.recommendation,
  } : genericRecommendation;
  return { ...targetParameters, achievedLevel: achievedLevel(targetParameters), designRecommendation: recommendation };
}

export function buildBassTargetViews(parameters, selectedCandidate, p18TargetBasis = "minimum") {
  return {
    minimum: buildTarget(parameters, "minimum", selectedCandidate, p18TargetBasis),
    recommended: buildTarget(parameters, "recommended", selectedCandidate, p18TargetBasis),
  };
}