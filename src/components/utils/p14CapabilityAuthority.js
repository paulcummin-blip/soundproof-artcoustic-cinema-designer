import { getApprovedContinuousSplDb } from "@/components/models/speakers/registry";

export const P14_MINIMUM_THRESHOLDS = Object.freeze({ L1: 109, L2: 112, L3: 115, L4: 118 });
export const P14_RECOMMENDED_THRESHOLDS = Object.freeze({ L1: 114, L2: 117, L3: 120, L4: 123 });

function gradeAtThresholds(value, thresholds) {
  if (!Number.isFinite(value)) return 0;
  if (value >= thresholds.L4) return 4;
  if (value >= thresholds.L3) return 3;
  if (value >= thresholds.L2) return 2;
  if (value >= thresholds.L1) return 1;
  return 0;
}

export const gradeP14Minimum = (value) => gradeAtThresholds(value, P14_MINIMUM_THRESHOLDS);
export const gradeP14Recommended = (value) => gradeAtThresholds(value, P14_RECOMMENDED_THRESHOLDS);
export const normalizeP14TargetBasis = (basis) => basis === "recommended" ? "recommended" : "minimum";
export const p14ThresholdsForBasis = (basis) => normalizeP14TargetBasis(basis) === "recommended"
  ? P14_RECOMMENDED_THRESHOLDS
  : P14_MINIMUM_THRESHOLDS;
export const gradeP14ForBasis = (value, basis) => gradeAtThresholds(value, p14ThresholdsForBasis(basis));
export const formatP14Capability = (value) => Number.isFinite(value) ? `${Math.ceil(value - 1e-8)} dBC` : "—";
export const formatP14BasisLabel = (basis) => normalizeP14TargetBasis(basis) === "recommended" ? "Recommended" : "Minimum";

export function combinedApprovedP14Capability(activeSubs) {
  const values = (activeSubs || []).map((sub) => getApprovedContinuousSplDb(sub?.modelKey ?? sub?.model));
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return 10 * Math.log10(values.reduce((sum, value) => sum + Math.pow(10, value / 10), 0));
}

export const P14_EQ_ASSESSMENT_RANGE_HZ = Object.freeze({ lowerHz: 20, upperHz: 120 });

function maximumPositiveEqPoint(points) {
  return points.reduce((maximum, point) => {
    const frequency = Number(point?.frequency);
    const boostDb = Number(point?.spl);
    if (!Number.isFinite(frequency) || !Number.isFinite(boostDb) || boostDb <= maximum.boostDb) return maximum;
    return { boostDb, frequencyHz: frequency };
  }, { boostDb: 0, frequencyHz: null });
}

export function analyseP14EqHeadroom(combinedEqCurve) {
  const validPoints = (combinedEqCurve || []).filter((point) => Number.isFinite(Number(point?.frequency)) && Number.isFinite(Number(point?.spl)));
  const wholeBankMaximum = maximumPositiveEqPoint(validPoints);
  const inBandMaximum = maximumPositiveEqPoint(validPoints.filter((point) => {
    const frequency = Number(point.frequency);
    return frequency >= P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz && frequency <= P14_EQ_ASSESSMENT_RANGE_HZ.upperHz;
  }));
  return {
    assessmentRangeHz: P14_EQ_ASSESSMENT_RANGE_HZ,
    maximumInBandPositiveEqBoostDb: inBandMaximum.boostDb,
    maximumInBandPositiveEqBoostFrequencyHz: inBandMaximum.frequencyHz,
    wholeBankMaximumPositiveEqBoostDb: wholeBankMaximum.boostDb,
    wholeBankMaximumPositiveEqBoostFrequencyHz: wholeBankMaximum.frequencyHz,
    wholeBankMaximumExcludedFromP14: wholeBankMaximum.boostDb > inBandMaximum.boostDb,
  };
}

export function consumedEqBoostDb(combinedEqCurve) {
  return analyseP14EqHeadroom(combinedEqCurve).maximumInBandPositiveEqBoostDb;
}

export function assessP14Capability({ activeSubs = [], productCapabilityDb = null, combinedEqCurve = [], targetBasis = "minimum" } = {}) {
  const product = Number.isFinite(productCapabilityDb) ? productCapabilityDb : combinedApprovedP14Capability(activeSubs);
  const normalizedTargetBasis = normalizeP14TargetBasis(targetBasis);
  if (!Number.isFinite(product)) return null;
  const eqHeadroomDiagnostics = analyseP14EqHeadroom(combinedEqCurve);
  const consumedHeadroomDb = eqHeadroomDiagnostics.maximumInBandPositiveEqBoostDb;
  const value = product - consumedHeadroomDb;
  return {
    value,
    formatted: formatP14Capability(value),
    level: gradeP14ForBasis(value, normalizedTargetBasis),
    targetBasis: normalizedTargetBasis,
    targetBasisLabel: formatP14BasisLabel(normalizedTargetBasis),
    minimumLevel: gradeP14Minimum(value),
    recommendedLevel: gradeP14Recommended(value),
    productCapabilityBeforeEqDb: product,
    maximumAggregateEqBoostDb: consumedHeadroomDb,
    headroomConsumedByEqDb: consumedHeadroomDb,
    capabilityRemainingAfterEqDb: value,
    assessmentRangeHz: eqHeadroomDiagnostics.assessmentRangeHz,
    maximumInBandPositiveEqBoostDb: eqHeadroomDiagnostics.maximumInBandPositiveEqBoostDb,
    maximumInBandPositiveEqBoostFrequencyHz: eqHeadroomDiagnostics.maximumInBandPositiveEqBoostFrequencyHz,
    wholeBankMaximumPositiveEqBoostDb: eqHeadroomDiagnostics.wholeBankMaximumPositiveEqBoostDb,
    wholeBankMaximumPositiveEqBoostFrequencyHz: eqHeadroomDiagnostics.wholeBankMaximumPositiveEqBoostFrequencyHz,
    wholeBankMaximumExcludedFromP14: eqHeadroomDiagnostics.wholeBankMaximumExcludedFromP14,
    eqHeadroomDiagnostics,
    protectedNullDirectEffectDb: 0,
    source: "combined-approved-continuous-lfe-capability-post-eq-headroom",
  };
}

export function formatP14RecommendedDetail(level) {
  return level > 0 ? `Recommended target: L${level} achieved` : "Recommended target: L1 not achieved";
}

export function formatP14TargetBasisDetail(basis) {
  return `Target basis: ${formatP14BasisLabel(basis)}`;
}