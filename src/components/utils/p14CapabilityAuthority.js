import { getApprovedContinuousSplDb, getSubwooferCurve } from "@/components/models/speakers/registry";

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
export const formatP14Capability = (value) => Number.isFinite(value) ? `${Math.floor(value + 1e-8)} dBC` : "—";
export const formatP14BasisLabel = (basis) => normalizeP14TargetBasis(basis) === "recommended" ? "Recommended" : "Minimum";

export function combinedApprovedP14Capability(activeSubs) {
  const values = (activeSubs || []).map((sub) => getApprovedContinuousSplDb(sub?.modelKey ?? sub?.model));
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return 10 * Math.log10(values.reduce((sum, value) => sum + Math.pow(10, value / 10), 0));
}

export const P14_EQ_ASSESSMENT_RANGE_HZ = Object.freeze({ lowerHz: 20, upperHz: 120 });
export const P14_SAFETY_MARGIN_DB = 2;
export const P14_CAPABILITY_REGIONS = Object.freeze([
  Object.freeze({ key: "extension", label: "20–30 Hz extension", lowerHz: 20, upperHz: 30, weight: 0.2 }),
  Object.freeze({ key: "primary", label: "30–80 Hz primary LFE", lowerHz: 30, upperHz: 80, weight: 0.6 }),
  Object.freeze({ key: "integration", label: "80–120 Hz integration", lowerHz: 80, upperHz: 120, weight: 0.2 }),
]);

const P14_FREQUENCY_GRID_HZ = Object.freeze([
  20, 22.45, 25.2, 28.28, 30, 31.75, 35.64, 40, 44.9, 50.4,
  56.57, 63.5, 71.27, 80, 89.8, 100.79, 113.14, 120,
]);

function interpolateCurve(curve, frequency, valueKey = "spl") {
  const points = (curve || [])
    .filter((point) => Number.isFinite(Number(point?.frequency)) && Number.isFinite(Number(point?.[valueKey])))
    .map((point) => ({ frequency: Number(point.frequency), value: Number(point[valueKey]) }))
    .sort((left, right) => left.frequency - right.frequency);
  if (!points.length || frequency < points[0].frequency || frequency > points[points.length - 1].frequency) return null;
  const upperIndex = points.findIndex((point) => point.frequency >= frequency);
  if (upperIndex <= 0) return points[0].value;
  const low = points[upperIndex - 1];
  const high = points[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.value + (high.value - low.value) * ratio;
}

function positiveEqBoostAt(combinedEqCurve, frequency) {
  const boost = interpolateCurve(combinedEqCurve, frequency);
  return Number.isFinite(boost) ? Math.max(0, boost) : 0;
}

function referenceCapabilityDb(curve) {
  const values = (curve || [])
    .filter((point) => point.frequency >= 30 && point.frequency <= 80 && Number.isFinite(point.spl))
    .map((point) => point.spl);
  return values.length ? Math.max(...values) : null;
}

function singleSubCapabilityAt(sub, frequency) {
  const modelKey = sub?.modelKey ?? sub?.model;
  const approvedDb = getApprovedContinuousSplDb(modelKey);
  const curve = getSubwooferCurve(modelKey)?.map((point) => ({ frequency: point.hz, spl: point.db })) || [];
  const referenceDb = referenceCapabilityDb(curve);
  const curveDb = interpolateCurve(curve, frequency);
  if (!Number.isFinite(approvedDb) || !Number.isFinite(referenceDb) || !Number.isFinite(curveDb)) return null;
  return Math.min(approvedDb, approvedDb + curveDb - referenceDb);
}

function powerSumDb(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return 10 * Math.log10(values.reduce((sum, value) => sum + Math.pow(10, value / 10), 0));
}

function regionForFrequency(frequency) {
  if (frequency < 30) return P14_CAPABILITY_REGIONS[0];
  if (frequency < 80) return P14_CAPABILITY_REGIONS[1];
  return P14_CAPABILITY_REGIONS[2];
}

function weightedRegionValue(curve, valueKey) {
  const regional = P14_CAPABILITY_REGIONS.map((region) => {
    const points = curve.filter((point) => regionForFrequency(point.frequency).key === region.key);
    const value = points.length ? points.reduce((sum, point) => sum + point[valueKey], 0) / points.length : null;
    return { ...region, value };
  });
  if (regional.some((region) => !Number.isFinite(region.value))) return { value: null, regional };
  return {
    value: regional.reduce((sum, region) => sum + region.value * region.weight, 0),
    regional,
  };
}

function buildCapabilityCurve(activeSubs, productCapabilityDb, combinedEqCurve) {
  return P14_FREQUENCY_GRID_HZ.map((frequency) => {
    const individualCapabilities = (activeSubs || []).map((sub) => singleSubCapabilityAt(sub, frequency));
    const rawCapabilityDb = individualCapabilities.length
      ? powerSumDb(individualCapabilities)
      : Number.isFinite(productCapabilityDb) ? productCapabilityDb : null;
    if (!Number.isFinite(rawCapabilityDb)) return null;
    const positiveEqBoostDb = positiveEqBoostAt(combinedEqCurve, frequency);
    return {
      frequency,
      rawCapabilityDb,
      positiveEqBoostDb,
      remainingCapabilityDb: rawCapabilityDb - positiveEqBoostDb,
      region: regionForFrequency(frequency).key,
    };
  }).filter(Boolean);
}

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
  const normalizedTargetBasis = normalizeP14TargetBasis(targetBasis);
  const capabilityCurve = buildCapabilityCurve(activeSubs, productCapabilityDb, combinedEqCurve);
  if (!capabilityCurve.length) return null;

  const rawAssessment = weightedRegionValue(capabilityCurve, "rawCapabilityDb");
  const postEqAssessment = weightedRegionValue(capabilityCurve, "remainingCapabilityDb");
  if (!Number.isFinite(rawAssessment.value) || !Number.isFinite(postEqAssessment.value)) return null;

  const limitingRegion = postEqAssessment.regional.reduce((lowest, region) => (
    !lowest || region.value < lowest.value ? region : lowest
  ), null);
  const limitingPoint = capabilityCurve
    .filter((point) => point.region === limitingRegion?.key)
    .reduce((lowest, point) => !lowest || point.remainingCapabilityDb < lowest.remainingCapabilityDb ? point : lowest, null);
  const eqHeadroomConsumedDb = Math.max(0, rawAssessment.value - postEqAssessment.value);
  const p14CapabilityDb = postEqAssessment.value - P14_SAFETY_MARGIN_DB;
  const eqHeadroomDiagnostics = analyseP14EqHeadroom(combinedEqCurve);

  return {
    p14CapabilityDb,
    limitingFrequency: limitingPoint?.frequency ?? null,
    rawCapabilityDb: rawAssessment.value,
    eqHeadroomConsumedDb,
    safetyMarginDb: P14_SAFETY_MARGIN_DB,
    capabilityCurve,
    limitingFrequencyRegion: limitingRegion?.label ?? null,
    regionalCapability: postEqAssessment.regional,
    value: p14CapabilityDb,
    formatted: formatP14Capability(p14CapabilityDb),
    level: gradeP14ForBasis(p14CapabilityDb, normalizedTargetBasis),
    targetBasis: normalizedTargetBasis,
    targetBasisLabel: formatP14BasisLabel(normalizedTargetBasis),
    minimumLevel: gradeP14Minimum(p14CapabilityDb),
    recommendedLevel: gradeP14Recommended(p14CapabilityDb),
    productCapabilityBeforeEqDb: rawAssessment.value,
    maximumAggregateEqBoostDb: eqHeadroomConsumedDb,
    headroomConsumedByEqDb: eqHeadroomConsumedDb,
    capabilityRemainingAfterEqDb: p14CapabilityDb,
    assessmentRangeHz: eqHeadroomDiagnostics.assessmentRangeHz,
    maximumInBandPositiveEqBoostDb: eqHeadroomDiagnostics.maximumInBandPositiveEqBoostDb,
    maximumInBandPositiveEqBoostFrequencyHz: eqHeadroomDiagnostics.maximumInBandPositiveEqBoostFrequencyHz,
    wholeBankMaximumPositiveEqBoostDb: eqHeadroomDiagnostics.wholeBankMaximumPositiveEqBoostDb,
    wholeBankMaximumPositiveEqBoostFrequencyHz: eqHeadroomDiagnostics.wholeBankMaximumPositiveEqBoostFrequencyHz,
    wholeBankMaximumExcludedFromP14: eqHeadroomDiagnostics.wholeBankMaximumExcludedFromP14,
    eqHeadroomDiagnostics,
    protectedNullDirectEffectDb: 0,
    source: "weighted-frequency-dependent-approved-continuous-lfe-capability-post-eq",
  };
}

export function formatP14RecommendedDetail(level) {
  return level > 0 ? `Recommended target: L${level} achieved` : "Recommended target: L1 not achieved";
}

export function formatP14TargetBasisDetail(basis) {
  return `Target basis: ${formatP14BasisLabel(basis)}`;
}