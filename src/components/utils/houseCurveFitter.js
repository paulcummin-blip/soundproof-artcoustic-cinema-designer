// houseCurveFitter.js — Seat-aware house-curve EQ optimiser.
// Generates a shared filter bank optimised for the worst-seat house-curve
// deviation. Uses the existing RBJ filter response, bank limits, and
// capability protection from designEqCalibration.js. The Standard baseline
// is retained as the first checkpoint so the result can never be worse.

import {
  peakingEqResponseDb, evaluateProvisionalBankLimits, limitBoostForCapability,
  scaleCandidateForBankLimits, isNearDuplicate, countSameSignFiltersInRegion,
  buildCurveFromBank, emptyFilters, normaliseCurve, findRegions,
  qForRegion, DESIGN_EQ_FIT_PROFILES,
} from "@/components/utils/designEqCalibration";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

const isNumber = (v) => Number.isFinite(Number(v));

// P19 level from max abs deviation: L4 ≤2, L3 ≤3, L2 ≤4, L1 ≤5, else FAIL.
export function houseCurveP19Level(deviationDb) {
  if (!isNumber(deviationDb)) return 0;
  if (deviationDb <= 2) return 4;
  if (deviationDb <= 3) return 3;
  if (deviationDb <= 4) return 2;
  if (deviationDb <= 5) return 1;
  return 0;
}

// Apply shared filter bank to a seat's raw response, smooth, and calculate
// per-seat house-curve deviation metrics in the assessment band.
function calculateSeatMetrics(seatRaw, filters, assessmentStartHz, assessmentEndHz, anchorDb) {
  const corrected = buildCurveFromBank(seatRaw, filters);
  const smoothed = applyBassSmoothing(corrected, "third");
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
  const worstPoint = assessedPoints.reduce((best, p) => Math.abs(p.deviationDb) > Math.abs(best.deviationDb) ? p : best);
  return { maxAbsDeviationDb: maxAbsDev, rmsDeviationDb: rmsDev, worstFrequencyHz: worstPoint.frequency };
}

// Calculate metrics across all seats for a given filter bank.
function calculateAllSeatMetrics(perSeatCurves, filters, assessmentStartHz, assessmentEndHz, anchorDb) {
  const seatMetrics = [];
  for (const seat of perSeatCurves) {
    const metrics = calculateSeatMetrics(seat.raw, filters, assessmentStartHz, assessmentEndHz, anchorDb);
    if (metrics) seatMetrics.push({ seatId: seat.seatId, isPrimary: seat.isPrimary, ...metrics });
  }
  if (!seatMetrics.length) return null;
  const worstSeat = seatMetrics.reduce((worst, m) => m.maxAbsDeviationDb > worst.maxAbsDeviationDb ? m : worst);
  const meanMaxDev = seatMetrics.reduce((sum, m) => sum + m.maxAbsDeviationDb, 0) / seatMetrics.length;
  const rmsTargetError = Math.sqrt(seatMetrics.reduce((sum, m) => sum + m.rmsDeviationDb ** 2, 0) / seatMetrics.length);
  return {
    seatMetrics,
    worstSeatId: worstSeat.seatId,
    worstSeatMaxDeviationDb: worstSeat.maxAbsDeviationDb,
    worstSeatP19Level: houseCurveP19Level(worstSeat.maxAbsDeviationDb),
    meanSeatMaxDeviationDb: meanMaxDev,
    rmsSeatTargetErrorDb: rmsTargetError,
  };
}

// Find the worst residual region across all seats.
function findWorstResidualRegionAcrossSeats(perSeatCurves, filters, assessmentStartHz, assessmentEndHz, anchorDb, peakThresholdDb, valleyThresholdDb) {
  const allRegions = [];
  for (const seat of perSeatCurves) {
    const corrected = buildCurveFromBank(seat.raw, filters);
    const smoothed = applyBassSmoothing(corrected, "third");
    const trendPoints = smoothed
      .filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
      .map((p) => ({ ...p, deviationDb: p.spl - (anchorDb + artcousticHouseCurveOffsetAt(p.frequency)) }));
    const regions = [
      ...findRegions(trendPoints, "peak", peakThresholdDb, valleyThresholdDb),
      ...findRegions(trendPoints, "valley", peakThresholdDb, valleyThresholdDb),
    ];
    for (const region of regions) allRegions.push({ ...region, seatId: seat.seatId });
  }
  if (!allRegions.length) return null;
  allRegions.sort((a, b) => b.severityDb - a.severityDb);
  return allRegions[0];
}

// Seat-aware house-curve EQ fitter. Optimises a shared filter bank for the
// worst-seat house-curve deviation. The Standard baseline is retained as
// the seed so the result can never be worse than Standard.
export function calculateHouseCurveEqCurve(rawCurve, perSeatRawCurves, usableLfHz, activeSubs = [], options = {}) {
  const rspRaw = normaliseCurve(rawCurve);
  if (!rspRaw.length) return { filters: emptyFilters([]), curve: [], combinedEqCurve: [], designEqFitProfile: "house_curve", perSeatMetrics: [] };

  // Combine RSP and real seats into a single array.
  const perSeatCurves = [
    { seatId: "rsp", isPrimary: true, raw: rspRaw },
    ...(Array.isArray(perSeatRawCurves) ? perSeatRawCurves : [])
      .filter((s) => s?.seatId && s.seatId !== "rsp" && !s.__isSyntheticRsp && Array.isArray(s?.responseData) && s.responseData.length > 0)
      .map((s) => ({ seatId: s.seatId, isPrimary: !!s.isPrimary, raw: normaliseCurve(s.responseData) })),
  ];
  if (!perSeatCurves.length) return { filters: emptyFilters([]), curve: [], combinedEqCurve: [], designEqFitProfile: "house_curve", perSeatMetrics: [] };

  const assessmentStartHz = Number.isFinite(Number(options.assessmentStartHz)) ? Number(options.assessmentStartHz) : 20;
  const assessmentEndHz = Number.isFinite(Number(options.assessmentEndHz)) ? Number(options.assessmentEndHz) : 200;
  const anchorDb = Number.isFinite(Number(options.targetAnchorDb)) ? Number(options.targetAnchorDb) : 0;
  if (!isNumber(anchorDb)) return { filters: emptyFilters([]), curve: [], combinedEqCurve: [], designEqFitProfile: "house_curve", perSeatMetrics: [] };

  const requestedSystemOutputDb = Number(options.requestedSystemOutputDb);
  const collectDiagnostics = options.collectDiagnostics !== false;
  const profile = DESIGN_EQ_FIT_PROFILES.accuracy;
  const peakThresholdDb = 1;
  const valleyThresholdDb = 1;
  const bankRaw = rspRaw;

  // Seed from Standard filter bank if provided.
  const initialFilters = Array.isArray(options.initialFilters)
    ? options.initialFilters
        .filter((f) => f && f.enabled && Number.isFinite(f.frequencyHz) && f.frequencyHz > 0 && Number.isFinite(f.gainDb) && Number.isFinite(f.Q) && f.Q > 0)
        .slice(0, 10)
        .map((f) => ({ ...f }))
    : [];
  const filters = initialFilters.map((f) => ({ ...f }));

  let currentMetrics = calculateAllSeatMetrics(perSeatCurves, filters, assessmentStartHz, assessmentEndHz, anchorDb);
  if (!currentMetrics) return { filters: emptyFilters([]), curve: [], combinedEqCurve: [], designEqFitProfile: "house_curve", perSeatMetrics: [] };

  const baselineWorstSeatDeviation = currentMetrics.worstSeatMaxDeviationDb;
  const maxOperations = 30;
  let operations = 0;
  let stopReason = "no safe improvement remained";
  const gainScales = [1, 0.75, 0.5];
  const qMultipliers = [1, 1.5, 2, 3];
  let bankEvalCount = 0;

  while (operations < maxOperations) {
    const worstRegion = findWorstResidualRegionAcrossSeats(perSeatCurves, filters, assessmentStartHz, assessmentEndHz, anchorDb, peakThresholdDb, valleyThresholdDb);
    if (!worstRegion) { stopReason = "no residual regions found"; break; }

    const isPeak = worstRegion.kind === "peak";
    const maximumCutDb = profile.maximumCutDb;
    const maximumAggregateBoostDb = profile.maximumAggregateBoostDb;
    const requestedGainDb = isPeak
      ? -Math.min(maximumCutDb, worstRegion.severityDb * 0.85)
      : Math.min(maximumAggregateBoostDb, worstRegion.severityDb * 0.75);

    const baseCandidate = limitBoostForCapability({
      band: filters.length + 1, enabled: true, type: "Peak",
      frequencyHz: worstRegion.centrePoint.frequency, gainDb: requestedGainDb,
      Q: qForRegion(worstRegion), startHz: worstRegion.startHz, endHz: worstRegion.endHz,
      reason: isPeak ? "Worst-seat residual peak above house curve" : "Worst-seat residual valley below house curve",
    }, activeSubs, usableLfHz, requestedSystemOutputDb);

    if (Math.abs(baseCandidate.gainDb) <= 0.1) { stopReason = "no capable correction for worst residual"; break; }

    const trials = [];
    const seenVariants = new Set();

    // Append candidates (if < 10 filters)
    if (filters.length < 10) {
      for (const gainScale of gainScales) {
        for (const qMultiplier of qMultipliers) {
          const scaled = { ...baseCandidate, gainDb: baseCandidate.gainDb * gainScale, Q: Math.max(0.5, Math.min(10, baseCandidate.Q * qMultiplier)) };
          const candidate = scaled.gainDb > 0 ? limitBoostForCapability(scaled, activeSubs, usableLfHz, requestedSystemOutputDb) : scaled;
          const key = `${candidate.gainDb.toFixed(4)}:${candidate.Q.toFixed(4)}`;
          if (seenVariants.has(key) || Math.abs(candidate.gainDb) <= 0.1) continue;
          seenVariants.add(key);
          if (isNearDuplicate(candidate, filters)) continue;
          if (countSameSignFiltersInRegion(candidate, filters) >= 2) continue;
          const bankResult = scaleCandidateForBankLimits(candidate, filters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
          bankEvalCount++;
          if (!bankResult.filter) continue;
          trials.push({ action: "append", filter: bankResult.filter });
        }
      }
    }

    // Gain revision candidates
    for (const gainScale of gainScales) {
      const correctionDelta = baseCandidate.gainDb * gainScale;
      if (Math.abs(correctionDelta) <= 0.1) continue;
      for (let fi = 0; fi < filters.length; fi++) {
        const existing = filters[fi];
        if (!existing.enabled) continue;
        const existingSign = existing.gainDb > 0 ? 1 : -1;
        const correctionSign = correctionDelta > 0 ? 1 : -1;
        if (existingSign !== correctionSign) continue;
        const freqRatio = Math.log2(Math.max(baseCandidate.frequencyHz, existing.frequencyHz) / Math.min(baseCandidate.frequencyHz, existing.frequencyHz));
        if (freqRatio > 1 / 12) continue;
        const proposedGain = existing.gainDb + correctionDelta;
        const clampedGain = existing.gainDb > 0 ? Math.min(maximumAggregateBoostDb, proposedGain) : Math.max(-maximumCutDb, proposedGain);
        if (Math.abs(clampedGain - existing.gainDb) <= 0.1) continue;
        trials.push({ action: "revise", filter: { ...existing, gainDb: clampedGain }, replacedFilterIndex: fi });
      }
    }

    if (!trials.length) { stopReason = "no admissible trial"; break; }

    // Evaluate trials — accept only if worst-seat improves or stays same while mean/RMS improves.
    let bestTrial = null;
    let bestTrialMetrics = null;
    for (const trial of trials) {
      const trialFilters = trial.action === "append"
        ? [...filters, trial.filter]
        : filters.map((f, i) => i === trial.replacedFilterIndex ? trial.filter : f);
      const trialMetrics = calculateAllSeatMetrics(perSeatCurves, trialFilters, assessmentStartHz, assessmentEndHz, anchorDb);
      if (!trialMetrics) continue;
      const worstSeatImproves = trialMetrics.worstSeatMaxDeviationDb < currentMetrics.worstSeatMaxDeviationDb - 0.05;
      const worstSeatUnchanged = Math.abs(trialMetrics.worstSeatMaxDeviationDb - currentMetrics.worstSeatMaxDeviationDb) <= 0.05;
      const meanImproves = trialMetrics.meanSeatMaxDeviationDb < currentMetrics.meanSeatMaxDeviationDb - 0.05;
      const rmsImproves = trialMetrics.rmsSeatTargetErrorDb < currentMetrics.rmsSeatTargetErrorDb - 0.05;
      if (!worstSeatImproves && !(worstSeatUnchanged && (meanImproves || rmsImproves))) continue;
      if (!bestTrial || trialMetrics.worstSeatMaxDeviationDb < bestTrialMetrics.worstSeatMaxDeviationDb ||
          (Math.abs(trialMetrics.worstSeatMaxDeviationDb - bestTrialMetrics.worstSeatMaxDeviationDb) <= 0.05 && trialMetrics.meanSeatMaxDeviationDb < bestTrialMetrics.meanSeatMaxDeviationDb)) {
        bestTrial = trial;
        bestTrialMetrics = trialMetrics;
      }
    }

    if (!bestTrial) { stopReason = "no trial improved worst-seat objective"; break; }
    if (bestTrial.action === "append") filters.push(bestTrial.filter);
    else filters[bestTrial.replacedFilterIndex] = bestTrial.filter;
    currentMetrics = bestTrialMetrics;
    operations++;
  }

  if (operations >= maxOperations && stopReason === "no safe improvement remained") stopReason = "operation ceiling reached";

  // Final metrics
  const finalMetrics = calculateAllSeatMetrics(perSeatCurves, filters, assessmentStartHz, assessmentEndHz, anchorDb);
  const rspCorrected = buildCurveFromBank(rspRaw, filters);
  const rspSmoothed = applyBassSmoothing(rspCorrected, "third");
  const rspAssessed = rspSmoothed
    .filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
    .map((p) => ({ frequency: p.frequency, deviationDb: p.spl - (anchorDb + artcousticHouseCurveOffsetAt(p.frequency)) }))
    .filter((p) => isNumber(p.deviationDb));
  const rspMaxDev = rspAssessed.length ? Math.max(...rspAssessed.map((p) => Math.abs(p.deviationDb))) : Infinity;

  const bankLimits = evaluateProvisionalBankLimits(filters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  const combinedEqCurve = rspRaw.map((p) => ({ frequency: p.frequency, spl: filters.reduce((sum, f) => sum + peakingEqResponseDb(p.frequency, f), 0) }));
  const curve = rspRaw.map((p, i) => ({ frequency: p.frequency, spl: p.spl + combinedEqCurve[i].spl }));

  // Determine limiting reason
  let limitingReason = "none";
  if (filters.length >= 10) limitingReason = "filter-limited";
  else if (bankLimits.maxAggregateBoostDb >= 5.95) limitingReason = "boost-limited";
  else if (bankLimits.maxAggregateCutDb <= -14.95) limitingReason = "cut-limited";
  else if (stopReason === "no capable correction for worst residual") limitingReason = "product-limited";

  return {
    filters: emptyFilters(filters),
    curve,
    combinedEqCurve,
    designEqFitProfile: "house_curve",
    designEqFitProfileConfig: {
      preserveP14: false, fittingToleranceDb: 1,
      maximumCutDb: 15, maximumAggregateBoostDb: 6,
      peakDiscoveryThresholdDb: 1, valleyDiscoveryThresholdDb: 1,
    },
    perSeatMetrics: finalMetrics?.seatMetrics || [],
    worstSeatId: finalMetrics?.worstSeatId || null,
    worstSeatMaxDeviationDb: finalMetrics?.worstSeatMaxDeviationDb || null,
    worstSeatP19Level: finalMetrics?.worstSeatP19Level || 0,
    meanSeatMaxDeviationDb: finalMetrics?.meanSeatMaxDeviationDb || null,
    rmsSeatTargetErrorDb: finalMetrics?.rmsSeatTargetErrorDb || null,
    rspMaxDeviationDb: rspMaxDev,
    rspP19Level: houseCurveP19Level(rspMaxDev),
    baselineWorstSeatDeviationDb: baselineWorstSeatDeviation,
    bankLimits: {
      maxAggregateBoostDb: bankLimits.maxAggregateBoostDb,
      maxAggregateBoostHz: bankLimits.maxAggregateBoostHz,
      maxAggregateCutDb: bankLimits.maxAggregateCutDb,
      maxAggregateCutHz: bankLimits.maxAggregateCutHz,
    },
    stopReason,
    limitingReason,
    enabledFilterCount: filters.length,
    selectedCheckpoint: {
      enabledFilterCount: filters.length,
      maximumAbsoluteDeviationDb: rspMaxDev,
      rmsDeviationDb: null, worstResidualFrequencyHz: null,
      rawMinimumSpl: null, p14MinimumSpl: null, p14Safe: false,
      broadBelowTargetWorsening: false,
    },
    iterationTrace: [],
    bankDiagnostics: {
      completedBankEvaluationCount: bankEvalCount,
      selectedBankLimits: {
        maxAggregateBoostDb: bankLimits.maxAggregateBoostDb,
        maxAggregateBoostHz: bankLimits.maxAggregateBoostHz,
        maxAggregateCutDb: bankLimits.maxAggregateCutDb,
        maxAggregateCutHz: bankLimits.maxAggregateCutHz,
        sameRegionFilterCount: 0,
      },
    },
    checkpointSummaries: [],
    worstResidualDiagnostics: [],
    selectionReason: `House-curve fitter: ${operations} operations, worst-seat ${finalMetrics?.worstSeatId || "—"} at ±${(finalMetrics?.worstSeatMaxDeviationDb || 0).toFixed(1)} dB. ${stopReason}.`,
    revisionDiagnostics: { attempts: [] },
    requestedP19ToleranceDb: Number.isFinite(Number(options.targetToleranceDb)) ? Number(options.targetToleranceDb) : 0,
  };
}