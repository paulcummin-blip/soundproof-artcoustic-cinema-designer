import { evaluateProvisionalBankLimits, limitBoostForCapability } from "@/components/utils/designEqCalibration";
import { calculateAllSeatMetrics, compareHouseCurveMetrics } from "@/components/utils/houseCurveFitterCore";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";

const Q_VALUES = [6, 8, 10];
const GAIN_SCALES = [0.25, 0.5, 0.75, 1];

function realSeatsRemainConstrained(before, after, protectedNullRegions) {
  const beforeById = new Map((before?.seatMetrics || []).map((metric) => [metric.seatId, metric]));
  return (after?.seatMetrics || []).every((metric) => {
    if (metric.seatId === "rsp") return true;
    const baseline = beforeById.get(metric.seatId);
    if (!baseline) return true;
    const scored = (metric.residualPoints || []).filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
    const candidateMax = scored.length ? Math.max(...scored.map((point) => Math.abs(point.deviationDb))) : metric.maxAbsDeviationDb;
    const baselineScored = (baseline.residualPoints || []).filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
    const baselineMax = baselineScored.length ? Math.max(...baselineScored.map((point) => Math.abs(point.deviationDb))) : baseline.maxAbsDeviationDb;
    return candidateMax <= baselineMax + 0.5;
  });
}

export function refineOpposingResidualPair({ filters, metrics, seats, bankRaw, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile, protectedNullRegions, canonicalTargetCurve }) {
  const points = (metrics?.rspResidualPoints || []).filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
  const peak = points.filter((point) => point.deviationDb > 0).sort((a, b) => b.deviationDb - a.deviationDb)[0];
  const valley = points.filter((point) => point.deviationDb < 0).sort((a, b) => a.deviationDb - b.deviationDb)[0];
  if (!peak || !valley || filters.length > 8 || Math.max(peak.deviationDb, Math.abs(valley.deviationDb)) <= 3) {
    return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: null };
  }
  let bestFilters = filters;
  let bestMetrics = metrics;
  let bankEvaluationCount = 0;
  for (const cutQ of Q_VALUES) for (const boostQ of Q_VALUES) {
    for (const cutScale of GAIN_SCALES) for (const boostScale of GAIN_SCALES) {
      const cut = { band: filters.length + 1, enabled: true, type: "Peak", frequencyHz: peak.frequency,
        gainDb: -Math.min(15, peak.deviationDb * cutScale), Q: cutQ, reason: "Joint refinement of opposing correctable residuals" };
      const requestedBoost = { band: filters.length + 2, enabled: true, type: "Peak", frequencyHz: valley.frequency,
        gainDb: Math.min(6, Math.abs(valley.deviationDb) * boostScale), Q: boostQ, reason: "Joint refinement of opposing correctable residuals" };
      const boost = limitBoostForCapability(requestedBoost, activeSubs, usableLfHz, requestedSystemOutputDb);
      if (boost.gainDb <= 0.1) continue;
      const proposed = [...filters, cut, boost];
      const limits = evaluateProvisionalBankLimits(proposed, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
      bankEvaluationCount++;
      if (!limits.allOk) continue;
      const candidateMetrics = calculateAllSeatMetrics(seats, proposed, assessmentStartHz, assessmentEndHz, anchorDb, null, null, { protectedNullRegions, canonicalTargetCurve });
      if (!candidateMetrics || candidateMetrics.rspMaxDeviationDb >= bestMetrics.rspMaxDeviationDb - 0.01) continue;
      const baselineP14L1 = Number.isFinite(metrics.rspMinimumSmoothedSplDb) && metrics.rspMinimumSmoothedSplDb >= 114;
      if (baselineP14L1 && candidateMetrics.rspMinimumSmoothedSplDb < 113.95) continue;
      if (!realSeatsRemainConstrained(metrics, candidateMetrics, protectedNullRegions)) continue;
      if (compareHouseCurveMetrics(candidateMetrics, bestMetrics) < 0) {
        bestFilters = proposed;
        bestMetrics = candidateMetrics;
      }
    }
  }
  return {
    filters: bestFilters,
    metrics: bestMetrics,
    changed: bestFilters !== filters,
    bankEvaluationCount,
    diagnostic: { peakFrequencyHz: peak.frequency, peakResidualDb: peak.deviationDb, valleyFrequencyHz: valley.frequency, valleyResidualDb: valley.deviationDb },
  };
}