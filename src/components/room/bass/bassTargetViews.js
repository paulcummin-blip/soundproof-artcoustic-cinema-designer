import { identifyBassLimitingParameter } from "@/components/utils/bassLimitingParameter";
import {
  formatP14TargetBasisDetail,
  gradeP14Minimum,
  gradeP14Recommended,
} from "@/components/utils/p14CapabilityAuthority";

const cloneParameter = (parameter) => ({ ...(parameter || {}) });

function achievedLevel(parameters) {
  const levels = Object.values(parameters)
    .filter((parameter) => parameter?.status !== "not_applicable")
    .map((parameter) => parameter?.level)
    .filter(Number.isFinite);
  return levels.length ? Math.min(...levels) : null;
}

function buildTarget(parameters, basis, selectedCandidate) {
  const p14Base = cloneParameter(parameters?.p14);
  const p14Level = Number.isFinite(p14Base.value)
    ? (basis === "recommended" ? gradeP14Recommended(p14Base.value) : gradeP14Minimum(p14Base.value))
    : p14Base.level;
  const targetParameters = {
    p14: {
      ...p14Base,
      level: p14Level,
      passedL1: Number.isFinite(p14Level) ? p14Level >= 1 : null,
      targetBasis: basis,
      targetBasisDetail: formatP14TargetBasisDetail(basis),
    },
    p18: cloneParameter(parameters?.p18),
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

export function buildBassTargetViews(parameters, selectedCandidate) {
  return {
    minimum: buildTarget(parameters, "minimum", selectedCandidate),
    recommended: buildTarget(parameters, "recommended", selectedCandidate),
  };
}