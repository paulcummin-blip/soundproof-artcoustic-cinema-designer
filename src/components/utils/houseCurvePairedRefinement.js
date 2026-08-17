import { evaluateProvisionalBankLimits, limitBoostForCapability, peakingEqResponseDb } from "@/components/utils/designEqCalibration";
import { calculateAllSeatMetrics, compareHouseCurveMetrics } from "@/components/utils/houseCurveFitterCore";
import { isProtectedSmoothedFrequency } from "@/components/utils/houseCurveFitProtection";
import { evaluatePreparedBankLimits } from "@/components/utils/preparedBankValidation";

const Q_VALUES = [6, 8, 10];
const BROAD_VALLEY_MAX_Q = 4;
const GAIN_SCALES = [0.25, 0.5, 0.75, 1];
const PROTECTED_EDGE_GUARD_OCTAVES = 1 / 24;

function boostWouldSpillIntoProtectedNull(frequency, protectedNullRegions) {
  return (protectedNullRegions || []).some((region) => (
    frequency >= region.startHz / 2 ** PROTECTED_EDGE_GUARD_OCTAVES
    && frequency <= region.endHz * 2 ** PROTECTED_EDGE_GUARD_OCTAVES
  ));
}

function broadValleyQValues(points, valley) {
  const centreIndex = points.findIndex((point) => point.frequency === valley?.frequency);
  if (centreIndex <= 0 || centreIndex >= points.length - 1) return { qValues: Q_VALUES, region: null };
  const halfOctave = 2 ** 0.5;
  const leftPeak = points
    .filter((point) => point.frequency >= valley.frequency / halfOctave && point.frequency < valley.frequency)
    .reduce((best, point) => !best || point.deviationDb > best.deviationDb ? point : best, null);
  const rightPeak = points
    .filter((point) => point.frequency > valley.frequency && point.frequency <= valley.frequency * halfOctave)
    .reduce((best, point) => !best || point.deviationDb > best.deviationDb ? point : best, null);
  const hasMaterialShoulders = leftPeak && rightPeak
    && leftPeak.deviationDb >= valley.deviationDb + 2
    && rightPeak.deviationDb >= valley.deviationDb + 2;
  if (!hasMaterialShoulders || rightPeak.frequency <= leftPeak.frequency) return { qValues: Q_VALUES, region: null };
  const widthOctaves = Math.log2(rightPeak.frequency / leftPeak.frequency);
  if (widthOctaves < 1 / 3) return { qValues: Q_VALUES, region: null };
  const baseQ = Math.max(0.5, Math.min(BROAD_VALLEY_MAX_Q,
    valley.frequency / Math.max(1, rightPeak.frequency - leftPeak.frequency)));
  const qValues = [...new Set([baseQ * 0.65, baseQ, Math.min(BROAD_VALLEY_MAX_Q, baseQ * 1.25)]
    .map((value) => Number(Math.max(0.5, Math.min(BROAD_VALLEY_MAX_Q, value)).toFixed(4))))];
  return {
    qValues,
    region: { startHz: leftPeak.frequency, endHz: rightPeak.frequency, widthOctaves },
  };
}

function realSeatsRemainConstrained(baseline, after, protectedNullRegions) {
  const beforeById = new Map((baseline?.seatMetrics || []).map((metric) => [metric.seatId, metric]));
  return (after?.seatMetrics || []).every((metric) => {
    if (metric.seatId === "rsp") return true;
    const baseline = beforeById.get(metric.seatId);
    if (!baseline) return true;
    const scored = (metric.residualPoints || []).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
    const candidateMax = scored.length ? Math.max(...scored.map((point) => Math.abs(point.deviationDb))) : metric.maxAbsDeviationDb;
    const baselineScored = (baseline.residualPoints || []).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
    const baselineMax = baselineScored.length ? Math.max(...baselineScored.map((point) => Math.abs(point.deviationDb))) : baseline.maxAbsDeviationDb;
    return candidateMax <= baselineMax + 0.5;
  });
}

export function refineOpposingResidualPair({ filters, metrics, seatBaselineMetrics, seats, bankRaw, fitStartHz, fitEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile, protectedNullRegions, canonicalTargetCurve, evaluationMemo = null, preparedBankValidation = null, operationCounts = null }) {
  const points = (metrics?.rspResidualPoints || []).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
  const peak = points.filter((point) => point.deviationDb > 0).sort((a, b) => b.deviationDb - a.deviationDb)[0];
  const valley = points.filter((point) => point.deviationDb < 0).sort((a, b) => a.deviationDb - b.deviationDb)[0];
  const enabledFilterCount = filters.filter((filter) => filter.enabled).length;
  if (!peak || !valley) return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: null, limitation: "no opposing correctable residual pair remained" };
  if (boostWouldSpillIntoProtectedNull(valley.frequency, protectedNullRegions)) {
    return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: { valleyFrequencyHz: valley.frequency }, limitation: "valley boost rejected because its filter would spill into a protected cancellation region" };
  }
  const replacementPairs = [];
  if (enabledFilterCount > 8) {
    const replaceable = filters
      .map((filter, index) => ({
        filter,
        index,
        activity: Math.abs(filter.gainDb || 0),
        outsideAssessment: filter.frequencyHz > fitEndHz,
      }))
      .filter((entry) => entry.filter.enabled
        && entry.filter.frequencyHz >= Math.max(40, Number(usableLfHz || 20) * 1.25))
      .sort((left, right) =>
        Number(right.outsideAssessment) - Number(left.outsideAssessment)
        || left.activity - right.activity)
      .slice(0, 4);
    for (let left = 0; left < replaceable.length; left++) {
      for (let right = left + 1; right < replaceable.length; right++) {
        replacementPairs.push([replaceable[left], replaceable[right]]);
      }
    }
    if (!replacementPairs.length) {
      return {
        filters, metrics, changed: false, bankEvaluationCount: 0,
        diagnostic: { peakFrequencyHz: peak.frequency, valleyFrequencyHz: valley.frequency },
        limitation: "ten-filter ceiling had no safe pair of non-low-frequency slots to repurpose",
      };
    }
  }
  const fittingToleranceDb = Number.isFinite(profile?.fittingToleranceDb) ? profile.fittingToleranceDb : 1;
  if (Math.max(peak.deviationDb, Math.abs(valley.deviationDb)) <= fittingToleranceDb) {
    return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: null, limitation: `fit residual already within ${fittingToleranceDb} dB` };
  }
  let bestFilters = filters;
  let bestMetrics = metrics;
  let bankEvaluationCount = 0;
  const boostRegion = broadValleyQValues(points, valley);

  for (const cutQ of Q_VALUES) for (const boostQ of boostRegion.qValues) {
    for (const cutScale of GAIN_SCALES) for (const boostScale of GAIN_SCALES) {
      const cut = { band: filters.length + 1, enabled: true, type: "Peak", frequencyHz: peak.frequency,
        gainDb: -Math.min(15, peak.deviationDb * cutScale), Q: cutQ, reason: "Joint refinement of opposing correctable residuals" };
      const requestedBoost = { band: filters.length + 2, enabled: true, type: "Peak", frequencyHz: valley.frequency,
        gainDb: Math.min(6, Math.abs(valley.deviationDb) * boostScale), Q: boostQ,
        ...(boostRegion.region || {}),
        reason: boostRegion.region
          ? "Joint broad-valley refinement of opposing correctable residuals"
          : "Joint refinement of opposing correctable residuals" };
      const boost = limitBoostForCapability(requestedBoost, activeSubs, usableLfHz, requestedSystemOutputDb);
      if (boost.gainDb <= 0.1) continue;
      const proposedBanks = enabledFilterCount <= 8
        ? [[...filters, cut, boost]]
        : replacementPairs.map(([cutSlot, boostSlot]) => filters.map((filter, index) => {
          if (index === cutSlot.index) return {
            ...cut,
            band: filter.band,
            reason: "Joint refinement: repurposed weak slot for residual peak cut",
          };
          if (index === boostSlot.index) return {
            ...boost,
            band: filter.band,
            reason: boostRegion.region
              ? "Joint broad-valley refinement: repurposed weak slot for residual boost"
              : "Joint refinement: repurposed weak slot for residual boost",
          };
          return { ...filter };
        }));
      for (const proposed of proposedBanks) {
        const limits = preparedBankValidation
          ? evaluatePreparedBankLimits(preparedBankValidation, proposed, profile, operationCounts)
          : evaluateProvisionalBankLimits(proposed, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
        bankEvaluationCount++;
        if (!limits.allOk) continue;
        const candidateMetrics = calculateAllSeatMetrics(
          seats, proposed, fitStartHz, fitEndHz, anchorDb, operationCounts, evaluationMemo,
          { protectedNullRegions, canonicalTargetCurve },
        );
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
  }
  return {
    filters: bestFilters,
    metrics: bestMetrics,
    changed: bestFilters !== filters,
    bankEvaluationCount,
    limitation: bestFilters === filters ? "no legal pair improved the 20–200 Hz maximum or RMS within equivalence tolerances" : null,
    diagnostic: {
      peakFrequencyHz: peak.frequency,
      peakResidualDb: peak.deviationDb,
      valleyFrequencyHz: valley.frequency,
      valleyResidualDb: valley.deviationDb,
      valleyRegion: boostRegion.region,
      boostQValues: boostRegion.qValues,
      replacementPairCount: replacementPairs.length,
      repurposedExistingSlots: enabledFilterCount > 8,
    },
  };
}