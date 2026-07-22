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
export const formatP14Capability = (value) => Number.isFinite(value) ? `${Math.ceil(value - 1e-8)} dBC` : "—";

export function combinedApprovedP14Capability(activeSubs) {
  const values = (activeSubs || []).map((sub) => getApprovedContinuousSplDb(sub?.modelKey ?? sub?.model));
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return 10 * Math.log10(values.reduce((sum, value) => sum + Math.pow(10, value / 10), 0));
}

export function consumedEqBoostDb(combinedEqCurve) {
  const values = (combinedEqCurve || []).map((point) => Number(point?.spl)).filter(Number.isFinite);
  return values.length ? Math.max(0, ...values) : 0;
}

export function assessP14Capability({ activeSubs = [], productCapabilityDb = null, combinedEqCurve = [] } = {}) {
  const product = Number.isFinite(productCapabilityDb) ? productCapabilityDb : combinedApprovedP14Capability(activeSubs);
  if (!Number.isFinite(product)) return null;
  const consumedHeadroomDb = consumedEqBoostDb(combinedEqCurve);
  const value = product - consumedHeadroomDb;
  return {
    value,
    formatted: formatP14Capability(value),
    minimumLevel: gradeP14Minimum(value),
    recommendedLevel: gradeP14Recommended(value),
    productCapabilityBeforeEqDb: product,
    maximumAggregateEqBoostDb: consumedHeadroomDb,
    headroomConsumedByEqDb: consumedHeadroomDb,
    capabilityRemainingAfterEqDb: value,
    protectedNullDirectEffectDb: 0,
    source: "combined-approved-continuous-lfe-capability-post-eq-headroom",
  };
}

export function formatP14RecommendedDetail(level) {
  return level > 0 ? `Recommended target: L${level} achieved` : "Recommended target: L1 not achieved";
}