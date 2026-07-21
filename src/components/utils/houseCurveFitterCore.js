// houseCurveFitterCore.js — Single-start iterative house-curve optimisation loop.
// Generates trials for EVERY broad residual region across all real seats, enforces
// complete-bank limits on every trial (append, gain revision, Q revision, replacement,
// removal), and selects the best admissible improvement across all regions. Blocked
// residuals are recorded separately. The fitter never stops at a single uncorrectable
// null — it skips blocked regions and continues evaluating other regions.

import {
  evaluateProvisionalBankLimits, findRegions, peakingEqResponseDb,
} from "@/components/utils/designEqCalibration";
import { generateHouseCurveTrials } from "@/components/utils/houseCurveFilterTrials";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { bankResponseSignature, createHouseCurveEvaluationMemo, readExactMemo, writeExactMemo } from "@/components/utils/houseCurveEvaluationMemo";
import { calculatePreparedBassCurveMetrics, prepareBassCurveMetricGrid } from "@/components/utils/preparedBassCurveMetrics";
import { evaluatePreparedBankLimits, prepareBankValidation } from "@/components/utils/preparedBankValidation";
import { evaluateNearTargetProtection, isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";

const isNumber = (v) => Number.isFinite(Number(v));

const levelValue = (level) => {
  const n = Number(level);
  return Number.isFinite(n) ? Math.max(0, Math.min(4, Math.round(n))) : 0;
};
const variationOr = (v) => Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER;
const filterCount = (obj) => {
  const bank = obj?.generatedFilterBank;
  return Array.isArray(bank) ? bank.filter((f) => f?.enabled).length : 0;
};

// Shared comparator. House-curve trials expose RSP metrics, which are compared
// first (maximum absolute residual, then RMS). Real-seat metrics are constraints
// and tie-breakers; legacy callers without RSP metrics retain the old ordering.
const WORST_EQUIV_DB = 0.05;
const MEAN_EQUIV_DB = 0.05;
const RMS_EPSILON_DB = 0.01;

export function compareHouseCurveMetrics(a, b) {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  if (Number.isFinite(a.rspMaxDeviationDb) && Number.isFinite(b.rspMaxDeviationDb)) {
    if (Math.abs(a.rspMaxDeviationDb - b.rspMaxDeviationDb) > WORST_EQUIV_DB) return a.rspMaxDeviationDb - b.rspMaxDeviationDb;
    if (Number.isFinite(a.rspRmsDeviationDb) && Number.isFinite(b.rspRmsDeviationDb)
      && Math.abs(a.rspRmsDeviationDb - b.rspRmsDeviationDb) > RMS_EPSILON_DB) return a.rspRmsDeviationDb - b.rspRmsDeviationDb;
  }
  // Legacy/worst-seat tie-breakers.
  const aWorstLevel = levelValue(a.worstSeatP19Level ?? a.worstRealSeatHouseCurveLevel);
  const bWorstLevel = levelValue(b.worstSeatP19Level ?? b.worstRealSeatHouseCurveLevel);
  if (aWorstLevel !== bWorstLevel) return bWorstLevel - aWorstLevel;
  // 2. Worst-seat maximum deviation (lower is better, within WORST_EQUIV_DB is equivalent)
  const aWorstDev = variationOr(a.worstSeatMaxDeviationDb ?? a.worstRealSeatHouseCurveVariationDb);
  const bWorstDev = variationOr(b.worstSeatMaxDeviationDb ?? b.worstRealSeatHouseCurveVariationDb);
  if (Math.abs(aWorstDev - bWorstDev) > WORST_EQUIV_DB) return aWorstDev - bWorstDev;
  // 3. Mean seat maximum deviation (skip if either side unavailable)
  const aMean = a.meanSeatMaxDeviationDb;
  const bMean = b.meanSeatMaxDeviationDb;
  if (Number.isFinite(aMean) && Number.isFinite(bMean)) {
    if (Math.abs(aMean - bMean) > MEAN_EQUIV_DB) return aMean - bMean;
  }
  // 4. RMS target error (skip if either side unavailable)
  const aRms = a.rmsSeatTargetErrorDb;
  const bRms = b.rmsSeatTargetErrorDb;
  if (Number.isFinite(aRms) && Number.isFinite(bRms)) {
    if (Math.abs(aRms - bRms) > RMS_EPSILON_DB) return aRms - bRms;
  }
  // 5. RSP P19 deviation (lower is better)
  const aRspDev = variationOr(a.rspMaxDeviationDb ?? a.achievedP19VariationDb);
  const bRspDev = variationOr(b.rspMaxDeviationDb ?? b.achievedP19VariationDb);
  if (Math.abs(aRspDev - bRspDev) > RMS_EPSILON_DB) return aRspDev - bRspDev;
  // 6. P14 level (higher is better)
  const aP14 = levelValue(a.achievedP14Level);
  const bP14 = levelValue(b.achievedP14Level);
  if (aP14 !== bP14) return bP14 - aP14;
  // 7. P18 level (higher is better)
  const aP18 = levelValue(a.achievedP18Level);
  const bP18 = levelValue(b.achievedP18Level);
  if (aP18 !== bP18) return bP18 - aP18;
  // 8. Fewest filters
  return filterCount(a) - filterCount(b);
}

// P19 level from max abs deviation: L4 <=2, L3 <=3, L2 <=4, L1 <=5, else FAIL (0).
export function houseCurveP19Level(deviationDb) {
  if (!isNumber(deviationDb)) return 0;
  if (deviationDb <= 2) return 4;
  if (deviationDb <= 3) return 3;
  if (deviationDb <= 4) return 2;
  if (deviationDb <= 5) return 1;
  return 0;
}

// Calculate per-seat house-curve deviation metrics from an already-corrected curve.
// Uses the identical 1/3-octave smoothing, assessment band, and target curve as the
// house-curve fitter. Shared between the fitter and the production optimiser.
function calculateSeatMetricsFromCorrected(correctedCurve, assessmentStartHz, assessmentEndHz, anchorDb, prepared = null) {
  if (prepared) return calculatePreparedBassCurveMetrics(correctedCurve, prepared);
  const smoothed = applyBassSmoothing(correctedCurve, "third");
  const assessedPoints = smoothed
    .filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
    .map((p) => ({
      frequency: p.frequency,
      spl: p.spl,
      targetDb: anchorDb + artcousticHouseCurveOffsetAt(p.frequency),
      deviationDb: p.spl - (anchorDb + artcousticHouseCurveOffsetAt(p.frequency)),
    }))
    .filter((p) => isNumber(p.deviationDb));
  if (!assessedPoints.length) return null;
  const maxAbsDev = Math.max(...assessedPoints.map((p) => Math.abs(p.deviationDb)));
  const rmsDev = Math.sqrt(assessedPoints.reduce((sum, p) => sum + p.deviationDb ** 2, 0) / assessedPoints.length);
  const meanSignedResidualDb = assessedPoints.reduce((sum, p) => sum + p.deviationDb, 0) / assessedPoints.length;
  const shapeRmsDeviationDb = Math.sqrt(assessedPoints.reduce((sum, p) => sum + (p.deviationDb - meanSignedResidualDb) ** 2, 0) / assessedPoints.length);
  const worstPoint = assessedPoints.reduce((best, p) => Math.abs(p.deviationDb) > Math.abs(best.deviationDb) ? p : best);
  return { maxAbsDeviationDb: maxAbsDev, rmsDeviationDb: rmsDev, meanSignedResidualDb, shapeRmsDeviationDb,
    minimumSmoothedSplDb: Math.min(...assessedPoints.map((p) => p.spl)), residualPoints: assessedPoints,
    worstFrequencyHz: worstPoint.frequency };
}

// Apply shared filter bank to a seat's raw response, smooth, and calculate per-seat
// house-curve deviation metrics in the assessment band.
function correctedCurvesForSharedBank(seats, filters, operationCounts, memo = null) {
  const bankKey = bankResponseSignature(filters);
  if (operationCounts) operationCounts.curveEvaluationRequests += seats.length;
  const cached = memo?.enabled ? readExactMemo(memo.correctedCurves, bankKey) : null;
  if (cached) {
    if (operationCounts) operationCounts.reusedCurveEvaluationRequests += seats.length;
    return cached;
  }

  const correctionsByFrequencyGrid = new Map();
  const corrected = seats.map((seat) => {
    const raw = seat.raw;
    const gridKey = raw.map((point) => point.frequency).join("|");
    let correction = correctionsByFrequencyGrid.get(gridKey);
    if (!correction) {
      correction = raw.map((point) => filters.reduce((sum, filter) => sum + peakingEqResponseDb(point.frequency, filter), 0));
      correctionsByFrequencyGrid.set(gridKey, correction);
      if (operationCounts) {
        operationCounts.uniqueCurveFilterEvaluations += 1;
        operationCounts.filterPointEvaluations += raw.length * filters.length;
      }
    }
    return {
      seat,
      corrected: raw.map((point, index) => ({ frequency: point.frequency, spl: point.spl + correction[index] })),
    };
  });
  return writeExactMemo(memo?.correctedCurves, bankKey, corrected, memo?.enabled);
}

function summarizeSeatMetrics(seatMetrics, protectedNullRegions = []) {
  if (!seatMetrics.length) return null;
  const rsp = seatMetrics.find((metric) => metric.seatId === "rsp") || null;
  const scoredRspPoints = (rsp?.residualPoints || []).filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
  const rspMaxDeviationDb = scoredRspPoints.length ? Math.max(...scoredRspPoints.map((point) => Math.abs(point.deviationDb))) : rsp?.maxAbsDeviationDb ?? null;
  const rspRmsDeviationDb = scoredRspPoints.length ? Math.sqrt(scoredRspPoints.reduce((sum, point) => sum + point.deviationDb ** 2, 0) / scoredRspPoints.length) : rsp?.rmsDeviationDb ?? null;
  const rspMeanSignedResidualDb = scoredRspPoints.length ? scoredRspPoints.reduce((sum, point) => sum + point.deviationDb, 0) / scoredRspPoints.length : rsp?.meanSignedResidualDb ?? null;
  const rspShapeRmsDeviationDb = scoredRspPoints.length ? Math.sqrt(scoredRspPoints.reduce((sum, point) => sum + (point.deviationDb - rspMeanSignedResidualDb) ** 2, 0) / scoredRspPoints.length) : rsp?.shapeRmsDeviationDb ?? null;
  const objectiveMetric = (metric) => {
    const points = (metric.residualPoints || []).filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
    return { ...metric,
      objectiveMaxAbsDeviationDb: points.length ? Math.max(...points.map((point) => Math.abs(point.deviationDb))) : metric.maxAbsDeviationDb,
      objectiveRmsDeviationDb: points.length ? Math.sqrt(points.reduce((sum, point) => sum + point.deviationDb ** 2, 0) / points.length) : metric.rmsDeviationDb,
    };
  };
  const realSeats = seatMetrics.filter((metric) => metric.seatId !== "rsp").map(objectiveMetric);
  const constrainedSeats = realSeats.length ? realSeats : (rsp ? [objectiveMetric(rsp)] : seatMetrics.map(objectiveMetric));
  const worstSeat = constrainedSeats.reduce((worst, metric) => metric.objectiveMaxAbsDeviationDb > worst.objectiveMaxAbsDeviationDb ? metric : worst);
  return {
    seatMetrics,
    worstSeatId: worstSeat.seatId,
    worstSeatMaxDeviationDb: worstSeat.objectiveMaxAbsDeviationDb,
    worstSeatP19Level: houseCurveP19Level(worstSeat.objectiveMaxAbsDeviationDb),
    meanSeatMaxDeviationDb: constrainedSeats.reduce((sum, metric) => sum + metric.objectiveMaxAbsDeviationDb, 0) / constrainedSeats.length,
    rmsSeatTargetErrorDb: Math.sqrt(constrainedSeats.reduce((sum, metric) => sum + metric.objectiveRmsDeviationDb ** 2, 0) / constrainedSeats.length),
    rspMaxDeviationDb,
    rspRmsDeviationDb,
    rspMeanSignedResidualDb,
    rspShapeRmsDeviationDb,
    rspMinimumSmoothedSplDb: scoredRspPoints.length ? Math.min(...scoredRspPoints.map((point) => point.smoothedSplDb ?? Infinity)) : rsp?.minimumSmoothedSplDb ?? null,
    rspResidualPoints: rsp?.residualPoints ?? [],
  };
}

// Calculate metrics across a set of already-corrected seat curves. Used by the
// production optimiser to compute uniform worst/mean/RMS metrics for every
// candidate profile (Standard, Accuracy, house-curve) from perSeatPostEqCurves.
export function calculateAllSeatMetricsFromCorrected(correctedCurves, assessmentStartHz, assessmentEndHz, anchorDb) {
  const seatMetrics = [];
  for (const seat of correctedCurves) {
    const curve = Array.isArray(seat.responseData) ? seat.responseData : seat.raw;
    if (!Array.isArray(curve) || curve.length === 0) continue;
    const metrics = calculateSeatMetricsFromCorrected(curve, assessmentStartHz, assessmentEndHz, anchorDb);
    if (metrics) seatMetrics.push({ seatId: seat.seatId, isPrimary: seat.isPrimary, ...metrics });
  }
  return summarizeSeatMetrics(seatMetrics);
}

// Calculate metrics across a set of seats for a given filter bank.
export function calculateAllSeatMetrics(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb, operationCounts = null, memo = null, qualityOptions = {}) {
  const startedAt = operationCounts ? performance.now() : 0;
  const correctedSeats = correctedCurvesForSharedBank(seats, filters, operationCounts, memo);
  if (operationCounts) operationCounts.perSeatMetricEvaluations += correctedSeats.length;
  const metricsKey = bankResponseSignature(filters);
  const cached = memo?.enabled ? readExactMemo(memo.metrics, metricsKey) : null;
  if (cached) {
    if (operationCounts) operationCounts.reusedPerSeatMetricEvaluations += correctedSeats.length;
    return cached;
  }

  const seatMetrics = [];
  for (const { seat, corrected } of correctedSeats) {
    if (operationCounts) operationCounts.metricGridPreparationRequests += 1;
    const gridKey = seat.gridKey || corrected.map((point) => point.frequency).join("|");
    let prepared = memo?.enabled ? memo.metricGrids.get(gridKey) : null;
    if (!prepared && memo?.enabled) {
      prepared = prepareBassCurveMetricGrid(corrected, assessmentStartHz, assessmentEndHz, anchorDb);
      memo.metricGrids.set(gridKey, prepared);
      if (operationCounts) operationCounts.uniqueMetricGridPreparations += 1;
    }
    const metrics = calculateSeatMetricsFromCorrected(corrected, assessmentStartHz, assessmentEndHz, anchorDb, prepared);
    if (metrics) seatMetrics.push({ seatId: seat.seatId, isPrimary: seat.isPrimary, ...metrics });
  }
  if (operationCounts) {
    operationCounts.uniquePerSeatMetricEvaluations += correctedSeats.length;
    operationCounts.perSeatEvaluationTimeMs += performance.now() - startedAt;
  }
  if (!seatMetrics.length) return null;
  return writeExactMemo(memo?.metrics, metricsKey, summarizeSeatMetrics(seatMetrics, qualityOptions.protectedNullRegions), memo?.enabled);
}

// Find ALL broad residual regions across all seats, sorted by severity (descending).
// Each region is seat-specific so trials can be generated per-seat while the shared
// bank is evaluated across all seats.
function findAllResidualRegions(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb, peakThresholdDb, valleyThresholdDb, operationCounts, memo, protectedNullRegions = []) {
  const allRegions = [];
  const correctedSeats = correctedCurvesForSharedBank(seats, filters, operationCounts, memo);
  const rspDiscoverySeats = correctedSeats.filter(({ seat }) => seat.seatId === "rsp");
  const discoverySeats = rspDiscoverySeats.length ? rspDiscoverySeats : correctedSeats;
  for (const { seat, corrected } of discoverySeats) {
    const smoothed = applyBassSmoothing(corrected, "third");
    const trendPoints = smoothed
      .filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
      .filter((p) => !isProtectedFrequency(p.frequency, protectedNullRegions))
      .map((p) => ({ ...p, deviationDb: p.spl - (anchorDb + artcousticHouseCurveOffsetAt(p.frequency)) }));
    const regions = [
      ...findRegions(trendPoints, "peak", peakThresholdDb, valleyThresholdDb),
      ...findRegions(trendPoints, "valley", peakThresholdDb, valleyThresholdDb),
    ];
    for (const region of regions) allRegions.push({ ...region, seatId: seat.seatId });
  }
  allRegions.sort((a, b) => b.severityDb - a.severityDb);
  return allRegions;
}

// Build the proposed filter bank for a trial.
function buildProposedBank(trial, filters) {
  if (trial.action === "append") return [...filters, trial.filter];
  if (trial.action === "remove") return filters.filter((_, i) => i !== trial.removedFilterIndex);
  if (trial.action === "merge") return [...filters.filter((_, i) => !trial.mergedFilterIndices.includes(i)), trial.filter];
  return filters.map((f, i) => i === trial.replacedFilterIndex ? trial.filter : f);
}

// Validate a proposed bank against complete-bank limits. If the bank fails and a
// single filter's gain can be scaled, binary-search the gain to find the largest
// admissible value. Returns { filters, limits, scaled } or { filters: null, limits, scaled }.
function validateAndScaleTrial(proposedFilters, scalableFilterIndex, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, operationCounts, preparedBankValidation) {
  if (operationCounts) operationCounts.bankValidationRequests += 1;
  const startedAt = operationCounts ? performance.now() : 0;
  const limits = preparedBankValidation
    ? evaluatePreparedBankLimits(preparedBankValidation, proposedFilters, profile, operationCounts)
    : evaluateProvisionalBankLimits(proposedFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  let result;
  if (limits.allOk) {
    result = { filters: proposedFilters, limits, scaled: false };
  } else if (scalableFilterIndex === null || scalableFilterIndex < 0 || scalableFilterIndex >= proposedFilters.length) {
    result = { filters: null, limits, scaled: false };
  } else {
    const scalable = proposedFilters[scalableFilterIndex];
    if (!scalable?.enabled || !Number.isFinite(scalable.gainDb) || Math.abs(scalable.gainDb) <= 0.1) {
      result = { filters: null, limits, scaled: false };
    } else {
      const isBoost = scalable.gainDb > 0;
      let lo = 0;
      let hi = Math.abs(scalable.gainDb);
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        const scaledGain = isBoost ? mid : -mid;
        const scaledFilters = proposedFilters.map((f, i) => i === scalableFilterIndex ? { ...f, gainDb: scaledGain } : f);
        const scaledLimits = preparedBankValidation
          ? evaluatePreparedBankLimits(preparedBankValidation, scaledFilters, profile, operationCounts)
          : evaluateProvisionalBankLimits(scaledFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
        if (scaledLimits.allOk) lo = mid; else hi = mid;
      }
      const scaledGainDb = isBoost ? lo : -lo;
      if (Math.abs(scaledGainDb) <= 0.1) {
        result = { filters: null, limits, scaled: true };
      } else {
        const scaledFilters = proposedFilters.map((f, i) => i === scalableFilterIndex ? { ...f, gainDb: scaledGainDb } : f);
        const finalLimits = preparedBankValidation
          ? evaluatePreparedBankLimits(preparedBankValidation, scaledFilters, profile, operationCounts)
          : evaluateProvisionalBankLimits(scaledFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
        result = { filters: finalLimits.allOk ? scaledFilters : null, limits: finalLimits, scaled: true };
      }
    }
  }
  if (operationCounts) {
    operationCounts.uniqueBankValidations += 1;
    operationCounts.candidateBankValidationTimeMs += performance.now() - startedAt;
  }
  return result;
}

// Run a single-start optimisation loop. Returns { filters, metrics, baselineWorstSeatDeviation,
// blockedResiduals, stopReason, bankEvalCount, operations }.
export function runSingleStart(initialFilters, seats, bankRaw, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile, options = {}) {
  const peakThresholdDb = profile.peakDiscoveryThresholdDb || 1;
  const valleyThresholdDb = profile.valleyDiscoveryThresholdDb || 1;
  const maxOperations = 30;
  const protectedNullRegions = Array.isArray(options.protectedNullRegions) ? options.protectedNullRegions : [];

  const operationCounts = {
    curveEvaluationRequests: 0,
    uniqueCurveFilterEvaluations: 0,
    reusedCurveEvaluationRequests: 0,
    filterPointEvaluations: 0,
    metricGridPreparationRequests: 0,
    uniqueMetricGridPreparations: 0,
    perSeatMetricEvaluations: 0,
    uniquePerSeatMetricEvaluations: 0,
    reusedPerSeatMetricEvaluations: 0,
    perSeatEvaluationTimeMs: 0,
    bankValidationRequests: 0,
    uniqueBankValidations: 0,
    reusedBankValidations: 0,
    filterResponseRequests: 0,
    uniqueFilterResponses: 0,
    bankFilterPointEvaluations: 0,
    candidateBankValidationTimeMs: 0,
    nearTargetProtectionRejections: 0,
    p14SafetyRejections: 0,
    protectedNullWorseningRejections: 0,
    mergedFilterOperations: 0,
    replacedFilterOperations: 0,
  };
  const memo = options.memo || createHouseCurveEvaluationMemo(options.reuseExactEvaluations !== false);
  const preparedBankValidation = options.preparedBankValidation || (options.reuseExactEvaluations !== false
    ? prepareBankValidation(bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb)
    : null);
  let filters = initialFilters.map((f) => ({ ...f }));
  let currentMetrics = calculateAllSeatMetrics(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb, operationCounts, memo, { protectedNullRegions });
  if (!currentMetrics) return { filters, metrics: null, baselineWorstSeatDeviation: null, blockedResiduals: [], stopReason: "no seat metrics", bankEvalCount: 0, operations: 0, operationCounts };

  const baselineWorstSeatDeviation = currentMetrics.worstSeatMaxDeviationDb;
  const baselineRspMetrics = {
    maximumAbsoluteResidualDb: currentMetrics.rspMaxDeviationDb,
    rmsResidualDb: currentMetrics.rspRmsDeviationDb,
    meanSignedResidualDb: currentMetrics.rspMeanSignedResidualDb,
    shapeRmsResidualDb: currentMetrics.rspShapeRmsDeviationDb,
  };
  const baselineRspPoints = currentMetrics.rspResidualPoints || [];
  const baselineRspMinimumSplDb = currentMetrics.rspMinimumSmoothedSplDb;
  // Baseline per-seat max deviations — no seat may drift more than WORST_EQUIV_DB
  // from its baseline, preventing cumulative regression across iterations.
  const baselineSeatMaxDeviations = new Map();
  if (currentMetrics.seatMetrics) {
    for (const m of currentMetrics.seatMetrics) {
      const points = (m.residualPoints || []).filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
      baselineSeatMaxDeviations.set(m.seatId, points.length ? Math.max(...points.map((point) => Math.abs(point.deviationDb))) : m.maxAbsDeviationDb);
    }
  }
  let blockedResiduals = [];
  let operations = 0;
  let stopReason = "no safe improvement remained";
  let bankEvalCount = 0;
  // Diagnostic trace — records every iteration's discovered regions and every
  // trial evaluated. Purely observational; does not influence selection, ranking,
  // or any control flow. Returned for read-only diagnostic inspection.
  const trace = [];

  while (operations < maxOperations) {
    const regions = findAllResidualRegions(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb, peakThresholdDb, valleyThresholdDb, operationCounts, memo, protectedNullRegions);
    if (!regions.length) { stopReason = "no residual regions found"; break; }

    const iterationEntry = {
      iteration: operations,
      regions: regions.map((r) => ({ seatId: r.seatId, kind: r.kind, startHz: r.startHz, endHz: r.endHz, centreFrequencyHz: r.centrePoint.frequency, severityDb: r.severityDb })),
      trials: [],
      bestTrialIndex: null,
    };

    blockedResiduals = protectedNullRegions.map((region) => ({
      seatId: "rsp", frequency: region.centreFrequencyHz, signedDeviationDb: region.signedResidualDb,
      requiredCorrectionDb: region.requiredBoostDb, permittedCorrectionDb: region.permittedBoostDb,
      blockingReason: "protected-null", reason: region.reason,
    })); // retain protected nulls alongside this iteration's blocked residuals
    let bestTrial = null;
    let bestTrialMetrics = null;
    let bestTrialFilters = null;
    let bestTrialTraceIndex = null;

    for (const region of regions) {
      const { trials, productLimited } = generateHouseCurveTrials(region, filters, profile, activeSubs, usableLfHz, requestedSystemOutputDb);
      let regionAdmissible = false;
      let regionBlockReason = productLimited ? "product-limited" : null;

      for (const trial of trials) {
        const proposedFilters = buildProposedBank(trial, filters);
        const validation = validateAndScaleTrial(proposedFilters, trial.scalableIndex, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, operationCounts, preparedBankValidation);
        bankEvalCount++;

        const trialEntry = {
          regionSeatId: region.seatId,
          regionKind: region.kind,
          regionCentreHz: region.centrePoint.frequency,
          regionSeverityDb: region.severityDb,
          action: trial.action,
          frequencyHz: trial.filter?.frequencyHz ?? null,
          gainDb: trial.filter?.gainDb ?? null,
          Q: trial.filter?.Q ?? null,
          scaled: validation.scaled,
          bankValidation: {
            allOk: validation.limits?.allOk ?? false,
            boostLimitOk: validation.limits?.boostLimitOk ?? null,
            cutLimitOk: validation.limits?.cutLimitOk ?? null,
            sourceDomainHeadroomOk: validation.limits?.sourceDomainHeadroomOk ?? null,
            maxAggregateBoostDb: validation.limits?.maxAggregateBoostDb ?? null,
            maxAggregateBoostHz: validation.limits?.maxAggregateBoostHz ?? null,
            maxAggregateCutDb: validation.limits?.maxAggregateCutDb ?? null,
            maxAggregateCutHz: validation.limits?.maxAggregateCutHz ?? null,
          },
          metricsBefore: {
            rspMaxDeviationDb: currentMetrics?.rspMaxDeviationDb ?? null,
            rspRmsDeviationDb: currentMetrics?.rspRmsDeviationDb ?? null,
            rspMeanSignedResidualDb: currentMetrics?.rspMeanSignedResidualDb ?? null,
            worstSeatMaxDeviationDb: currentMetrics?.worstSeatMaxDeviationDb ?? null,
          },
          metricsAfter: null,
          accepted: false,
          rejectionReason: null,
        };

        if (!validation.filters) {
          const failed = [];
          if (validation.limits?.boostLimitOk === false) failed.push("aggregate boost exceeded");
          if (validation.limits?.cutLimitOk === false) failed.push("aggregate cut exceeded");
          if (validation.limits?.sourceDomainHeadroomOk === false) failed.push("source-domain headroom exceeded");
          trialEntry.rejectionReason = `bank-limited: ${failed.join(", ") || "unknown limit"}`;
          regionBlockReason = regionBlockReason || "bank-limited";
          iterationEntry.trials.push(trialEntry);
          continue;
        }
        regionAdmissible = true;
        const trialMetrics = calculateAllSeatMetrics(seats, validation.filters, assessmentStartHz, assessmentEndHz, anchorDb, operationCounts, memo, { protectedNullRegions });
        if (!trialMetrics) {
          trialEntry.rejectionReason = "no metrics computed";
          iterationEntry.trials.push(trialEntry);
          continue;
        }
        trialEntry.metricsAfter = {
          rspMaxDeviationDb: trialMetrics.rspMaxDeviationDb ?? null,
          rspRmsDeviationDb: trialMetrics.rspRmsDeviationDb ?? null,
          rspMeanSignedResidualDb: trialMetrics.rspMeanSignedResidualDb ?? null,
          worstSeatMaxDeviationDb: trialMetrics.worstSeatMaxDeviationDb ?? null,
        };
        // The RSP objective is lexicographic: reduce maximum absolute residual,
        // or hold it effectively unchanged while reducing RMS.
        if (compareHouseCurveMetrics(trialMetrics, currentMetrics) >= 0) {
          trialEntry.rejectionReason = "not strictly better than current (comparator rejected)";
          iterationEntry.trials.push(trialEntry);
          continue;
        }
        const maxImprovementDb = currentMetrics.rspMaxDeviationDb - trialMetrics.rspMaxDeviationDb;
        const nearTarget = evaluateNearTargetProtection(baselineRspPoints, trialMetrics.rspResidualPoints, maxImprovementDb);
        if (!nearTarget.passed) {
          operationCounts.nearTargetProtectionRejections++;
          trialEntry.rejectionReason = nearTarget.violations[0].reason;
          trialEntry.nearTargetViolations = nearTarget.violations;
          iterationEntry.trials.push(trialEntry);
          continue;
        }
        // Protected cancellation regions are excluded from scoring and never receive
        // corrective boost. Incidental overlap from a credible neighbouring peak cut
        // is retained in the final physical response rather than blocking that cut.
        // P14/P18 are calculated from the final post-EQ response. Product capability
        // remains a hard aggregate-bank constraint for boosts; cuts are not rejected
        // merely because they lower a room-response minimum.
        // Real seats constrain the RSP fit without becoming its primary objective.
        if (trialMetrics.seatMetrics) {
          let seatWorsened = false;
          let worsenedSeatId = null;
          for (const m of trialMetrics.seatMetrics) {
            const baselineDev = baselineSeatMaxDeviations.get(m.seatId);
            const points = (m.residualPoints || []).filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
            const constrainedDeviation = points.length ? Math.max(...points.map((point) => Math.abs(point.deviationDb))) : m.maxAbsDeviationDb;
            if (m.seatId !== "rsp" && baselineDev !== undefined && constrainedDeviation > baselineDev + 0.5) {
              seatWorsened = true;
              worsenedSeatId = m.seatId;
              break;
            }
          }
          if (seatWorsened) {
            trialEntry.rejectionReason = `seat ${worsenedSeatId} worsened beyond baseline tolerance`;
            iterationEntry.trials.push(trialEntry);
            continue;
          }
        }
        trialEntry.accepted = true;
        trialEntry.acceptanceReason = maxImprovementDb > WORST_EQUIV_DB ? "reduced maximum absolute RSP residual" : "held maximum residual while reducing RSP RMS";
        iterationEntry.trials.push(trialEntry);
        if (!bestTrial || compareHouseCurveMetrics(trialMetrics, bestTrialMetrics) < 0) {
          bestTrial = trial;
          bestTrialMetrics = trialMetrics;
          bestTrialFilters = validation.filters;
          bestTrialTraceIndex = iterationEntry.trials.length - 1;
        }
      }

      if (!regionAdmissible && region.severityDb > 2 && regionBlockReason) {
        const alreadyBlocked = blockedResiduals.some((b) => b.seatId === region.seatId && Math.abs(b.frequency - region.centrePoint.frequency) < 2);
        if (!alreadyBlocked) {
          const requiredCorrectionDb = region.kind === "peak" ? -region.severityDb * 0.85 : region.severityDb * 0.75;
          blockedResiduals.push({
            seatId: region.seatId,
            frequency: region.centrePoint.frequency,
            signedDeviationDb: region.centrePoint.deviationDb,
            requiredCorrectionDb,
            permittedCorrectionDb: productLimited ? 0 : null,
            blockingReason: regionBlockReason,
          });
        }
      }
    }

    iterationEntry.bestTrialIndex = bestTrialTraceIndex;
    trace.push(iterationEntry);

    if (!bestTrial) { stopReason = "no admissible improvement from any region"; break; }
    filters = bestTrialFilters;
    currentMetrics = bestTrialMetrics;
    if (bestTrial.action === "merge") operationCounts.mergedFilterOperations++;
    if (["replace", "refit", "revise", "reviseQ"].includes(bestTrial.action)) operationCounts.replacedFilterOperations++;
    operations++;
  }

  if (operations >= maxOperations && stopReason === "no safe improvement remained") stopReason = "operation ceiling reached";

  return { filters, metrics: currentMetrics, baselineWorstSeatDeviation, blockedResiduals, stopReason, bankEvalCount, operations, operationCounts, trace, baselineRspMetrics };
}