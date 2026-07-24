import { evaluateProvisionalBankLimits, limitBoostForCapability, peakingEqResponseDb } from "@/components/utils/designEqCalibration";
import { calculateAllSeatMetrics, compareHouseCurveMetrics } from "@/components/utils/houseCurveFitterCore";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";

const Q_VALUES = [6, 8, 10];
const GAIN_SCALES = [0.25, 0.5, 0.75, 1];
const PROTECTED_EDGE_GUARD_OCTAVES = 1 / 24;

function boostWouldSpillIntoProtectedNull(frequency, protectedNullRegions) {
  return (protectedNullRegions || []).some((region) => (
    frequency >= region.startHz / 2 ** PROTECTED_EDGE_GUARD_OCTAVES
    && frequency <= region.endHz * 2 ** PROTECTED_EDGE_GUARD_OCTAVES
  ));
}

function realSeatsRemainConstrained(baseline, after, protectedNullRegions) {
  const beforeById = new Map((baseline?.seatMetrics || []).map((metric) => [metric.seatId, metric]));
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

export function refineOpposingResidualPair({ filters, metrics, seatBaselineMetrics, seats, bankRaw, fitStartHz, fitEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile, protectedNullRegions, canonicalTargetCurve }) {
  const points = (metrics?.rspResidualPoints || []).filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
  const peak = points.filter((point) => point.deviationDb > 0).sort((a, b) => b.deviationDb - a.deviationDb)[0];
  const valley = points.filter((point) => point.deviationDb < 0).sort((a, b) => a.deviationDb - b.deviationDb)[0];
  const enabledFilterCount = filters.filter((filter) => filter.enabled).length;
  if (!peak || !valley) return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: null, limitation: "no opposing correctable residual pair remained" };
  if (boostWouldSpillIntoProtectedNull(valley.frequency, protectedNullRegions)) {
    return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: { valleyFrequencyHz: valley.frequency }, limitation: "valley boost rejected because its filter would spill into a protected cancellation region" };
  }
  if (enabledFilterCount > 8) return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: null, limitation: "ten-filter ceiling left no room for a paired operation" };
  if (Math.max(peak.deviationDb, Math.abs(valley.deviationDb)) <= 3) {
    return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: null, limitation: "fit residual already within 3 dB" };
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
      const candidateMetrics = calculateAllSeatMetrics(seats, proposed, fitStartHz, fitEndHz, anchorDb, null, null, { protectedNullRegions, canonicalTargetCurve });
      if (!candidateMetrics) continue;
      if (!realSeatsRemainConstrained(seatBaselineMetrics, candidateMetrics, protectedNullRegions)) continue;
      const maxImprovementDb = bestMetrics.rspMaxDeviationDb - candidateMetrics.rspMaxDeviationDb;
      const rmsImprovementDb = bestMetrics.rspRmsDeviationDb - candidateMetrics.rspRmsDeviationDb;
      if (maxImprovementDb + 0.35 * rmsImprovementDb <= 0.01) continue;
      const maxImproved = maxImprovementDb > 0.05;
      const rmsImproved = rmsImprovementDb > 0.01;
      const maxNotWorse = candidateMetrics.rspMaxDeviationDb <= bestMetrics.rspMaxDeviationDb + 0.05;
      const rmsNotWorse = candidateMetrics.rspRmsDeviationDb <= bestMetrics.rspRmsDeviationDb + 0.01;
      if (!((maxImproved && rmsNotWorse) || (rmsImproved && maxNotWorse))) continue;
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
    limitation: bestFilters === filters ? "no legal pair improved the 20–200 Hz maximum or RMS within equivalence tolerances" : null,
    diagnostic: { peakFrequencyHz: peak.frequency, peakResidualDb: peak.deviationDb, valleyFrequencyHz: valley.frequency, valleyResidualDb: valley.deviationDb },
  };
}