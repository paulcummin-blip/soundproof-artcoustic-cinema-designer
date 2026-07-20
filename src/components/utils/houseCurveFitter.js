// houseCurveFitter.js — Seat-aware house-curve EQ optimiser entry point.
// Separates RSP (official RP22 P19) from real seats (worst-seat objective).
// Multi-start: empty bank (Start A) + Standard-seeded bank (Start B). Selects
// the result with the best worst-real-seat score. The Standard candidate remains
// available as a fallback in the candidate pool — the house-curve search is not
// structurally locked to Standard. Every trial is bank-validated before scoring.

import {
  peakingEqResponseDb, evaluateProvisionalBankLimits,
  buildCurveFromBank, emptyFilters, normaliseCurve,
  DESIGN_EQ_FIT_PROFILES,
} from "@/components/utils/designEqCalibration";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { houseCurveP19Level, calculateAllSeatMetrics, runSingleStart, compareHouseCurveMetrics } from "@/components/utils/houseCurveFitterCore";

export { houseCurveP19Level };

const isNumber = (v) => Number.isFinite(Number(v));

// Seat-aware house-curve EQ fitter. Optimises a shared filter bank for the worst
// real-seat house-curve deviation. RSP is kept separate for official RP22 P19.
// When no real seats exist, falls back to RSP and labels the objective accordingly.
export function calculateHouseCurveEqCurve(rawCurve, perSeatRawCurves, usableLfHz, activeSubs = [], options = {}) {
  const rspRaw = normaliseCurve(rawCurve);
  if (!rspRaw.length) return { filters: emptyFilters([]), curve: [], combinedEqCurve: [], designEqFitProfile: "house_curve", perSeatMetrics: [] };

  // Separate RSP from real seats. RSP is used for official RP22 P19 only.
  // The worst-seat objective uses real seats exclusively.
  const realSeatCurves = (Array.isArray(perSeatRawCurves) ? perSeatRawCurves : [])
    .filter((s) => s?.seatId && s.seatId !== "rsp" && !s.__isSyntheticRsp && Array.isArray(s?.responseData) && s.responseData.length > 0)
    .map((s) => ({ seatId: s.seatId, isPrimary: !!s.isPrimary, raw: normaliseCurve(s.responseData) }))
    .filter((s) => s.raw.length > 0);

  const hasRealSeats = realSeatCurves.length > 0;
  const objectiveSeats = hasRealSeats ? realSeatCurves : [{ seatId: "rsp", isPrimary: true, raw: rspRaw }];
  const objectiveLabel = hasRealSeats ? "Worst real seat" : "RSP fallback — no real seats";

  const assessmentStartHz = Number.isFinite(Number(options.assessmentStartHz)) ? Number(options.assessmentStartHz) : 20;
  const assessmentEndHz = Number.isFinite(Number(options.assessmentEndHz)) ? Number(options.assessmentEndHz) : 200;
  const anchorDb = Number.isFinite(Number(options.targetAnchorDb)) ? Number(options.targetAnchorDb) : 0;
  if (!isNumber(anchorDb)) return { filters: emptyFilters([]), curve: [], combinedEqCurve: [], designEqFitProfile: "house_curve", perSeatMetrics: [] };

  const requestedSystemOutputDb = Number.isFinite(Number(options.requestedSystemOutputDb)) ? Number(options.requestedSystemOutputDb) : undefined;
  const profile = DESIGN_EQ_FIT_PROFILES.accuracy;
  const bankRaw = rspRaw;

  const standardSeedFilters = Array.isArray(options.initialFilters)
    ? options.initialFilters
        .filter((f) => f && f.enabled && Number.isFinite(f.frequencyHz) && f.frequencyHz > 0 && Number.isFinite(f.gainDb) && Number.isFinite(f.Q) && f.Q > 0)
        .slice(0, 10)
        .map((f) => ({ ...f }))
    : [];

  // Multi-start: Start A (empty bank), Start B (Standard-seeded bank).
  const startA = runSingleStart([], objectiveSeats, bankRaw, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  let startB = startA;
  if (standardSeedFilters.length > 0) {
    startB = runSingleStart(standardSeedFilters, objectiveSeats, bankRaw, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  }

  // Select the start with the best worst-real-seat score.
  let selected = startA;
  let selectedStartLabel = "empty";
  if (startB !== startA && startB.metrics && startA.metrics) {
    if (compareHouseCurveMetrics(startB.metrics, startA.metrics) < 0) {
      selected = startB;
      selectedStartLabel = "standard-seeded";
    }
  }

  let filters = selected.filters.map((f) => ({ ...f }));
  let finalMetrics = selected.metrics;
  let stopReason = selected.stopReason;
  let blockedResiduals = selected.blockedResiduals;
  let bankEvalCount = selected.bankEvalCount;
  let operations = selected.operations;

  // Final bank validation — must pass all hard limits. If it fails (safety net),
  // revert to the Standard seed (or empty) and recalculate metrics.
  let finalBankLimits = evaluateProvisionalBankLimits(filters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  bankEvalCount++;
  let bankValidationPassed = finalBankLimits.allOk;
  let fallbackOccurred = false;
  if (!bankValidationPassed) {
    fallbackOccurred = true;
    filters = standardSeedFilters.length > 0 ? standardSeedFilters.map((f) => ({ ...f })) : [];
    finalMetrics = calculateAllSeatMetrics(objectiveSeats, filters, assessmentStartHz, assessmentEndHz, anchorDb);
    stopReason = "final bank validation failed — reverted to baseline";
    blockedResiduals = [];
    // Re-run complete-bank validation against the actual fallback bank.
    finalBankLimits = evaluateProvisionalBankLimits(filters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
    bankEvalCount++;
    bankValidationPassed = finalBankLimits.allOk;
  }

  // Official RSP P19 (always calculated from RSP, separate from the worst-seat objective).
  const rspCorrected = buildCurveFromBank(rspRaw, filters);
  const rspSmoothed = applyBassSmoothing(rspCorrected, "third");
  const rspAssessed = rspSmoothed
    .filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
    .map((p) => ({ frequency: p.frequency, deviationDb: p.spl - (anchorDb + artcousticHouseCurveOffsetAt(p.frequency)) }))
    .filter((p) => isNumber(p.deviationDb));
  const rspMaxDev = rspAssessed.length ? Math.max(...rspAssessed.map((p) => Math.abs(p.deviationDb))) : null;

  const combinedEqCurve = rspRaw.map((p) => ({ frequency: p.frequency, spl: filters.reduce((sum, f) => sum + peakingEqResponseDb(p.frequency, f), 0) }));
  const curve = rspRaw.map((p, i) => ({ frequency: p.frequency, spl: p.spl + combinedEqCurve[i].spl }));

  // Determine limiting reason from final bank state and blocked residuals.
  let limitingReason = "none";
  if (!bankValidationPassed) limitingReason = "bank-validation-failed";
  else if (filters.length >= 10) limitingReason = "filter-limited";
  else if (finalBankLimits.maxAggregateBoostDb >= 5.95) limitingReason = "boost-limited";
  else if (finalBankLimits.maxAggregateCutDb <= -14.95) limitingReason = "cut-limited";
  else if (blockedResiduals.some((b) => b.blockingReason === "product-limited")) limitingReason = "product-limited";
  else if (blockedResiduals.some((b) => b.blockingReason === "bank-limited")) limitingReason = "bank-limited";

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
    perSeatMetrics: finalMetrics?.seatMetrics ?? [],
    worstSeatId: finalMetrics?.worstSeatId ?? null,
    worstSeatMaxDeviationDb: finalMetrics?.worstSeatMaxDeviationDb ?? null,
    worstSeatP19Level: finalMetrics?.worstSeatP19Level ?? 0,
    meanSeatMaxDeviationDb: finalMetrics?.meanSeatMaxDeviationDb ?? null,
    rmsSeatTargetErrorDb: finalMetrics?.rmsSeatTargetErrorDb ?? null,
    rspMaxDeviationDb: rspMaxDev,
    rspP19Level: houseCurveP19Level(rspMaxDev),
    baselineWorstSeatDeviationDb: selected.baselineWorstSeatDeviation,
    objectiveLabel,
    selectedStart: selectedStartLabel,
    bankValidationPassed,
    blockedResiduals,
    bankLimits: {
      maxAggregateBoostDb: finalBankLimits.maxAggregateBoostDb,
      maxAggregateBoostHz: finalBankLimits.maxAggregateBoostHz,
      maxAggregateCutDb: finalBankLimits.maxAggregateCutDb,
      maxAggregateCutHz: finalBankLimits.maxAggregateCutHz,
      boostLimitOk: finalBankLimits.boostLimitOk,
      cutLimitOk: finalBankLimits.cutLimitOk,
      sourceDomainHeadroomOk: finalBankLimits.sourceDomainHeadroomOk,
      allOk: finalBankLimits.allOk,
    },
    stopReason,
    limitingReason,
    enabledFilterCount: filters.filter((f) => f.enabled).length,
    selectedCheckpoint: {
      enabledFilterCount: filters.filter((f) => f.enabled).length,
      maximumAbsoluteDeviationDb: rspMaxDev,
      rmsDeviationDb: null, worstResidualFrequencyHz: null,
      rawMinimumSpl: null, p14MinimumSpl: null, p14Safe: false,
      broadBelowTargetWorsening: false,
    },
    iterationTrace: [],
    bankDiagnostics: {
      completedBankEvaluationCount: bankEvalCount,
      selectedBankLimits: {
        maxAggregateBoostDb: finalBankLimits.maxAggregateBoostDb,
        maxAggregateBoostHz: finalBankLimits.maxAggregateBoostHz,
        maxAggregateCutDb: finalBankLimits.maxAggregateCutDb,
        maxAggregateCutHz: finalBankLimits.maxAggregateCutHz,
      },
      finalBankValidationPassed: bankValidationPassed,
      fallbackOccurred,
    },
    checkpointSummaries: [],
    worstResidualDiagnostics: [],
    selectionReason: `House-curve fitter (${selectedStartLabel} start, ${objectiveLabel}): ${operations} operations, worst-seat ${finalMetrics?.worstSeatId ?? "—"} at ±${(finalMetrics?.worstSeatMaxDeviationDb ?? 0).toFixed(1)} dB. ${stopReason}.`,
    revisionDiagnostics: { attempts: [] },
    requestedP19ToleranceDb: Number.isFinite(Number(options.targetToleranceDb)) ? Number(options.targetToleranceDb) : 0,
  };
}

// Deterministic fixture: the deepest null is uncorrectable (product-limited by LF
// ramp) but a broad peak is legally correctable. The fitter must skip the null,
// correct the peak, and continue — not stop at the first uncorrectable residual.
export function runHouseCurveFitterFixtures() {
  const results = {};
  const anchorDb = 0;
  const freqs = [];
  for (let f = 20; f <= 200; f += 1) freqs.push(f);
  // Synthetic curve: deep null at 30 Hz (-15 dB), broad peak at 50 Hz (+6 dB).
  const rawCurve = freqs.map((f) => {
    let dev = 0;
    dev -= 15 * Math.exp(-(((f - 30) / 5) ** 2));
    dev += 6 * Math.exp(-(((f - 50) / 10) ** 2));
    return { frequency: f, spl: anchorDb + artcousticHouseCurveOffsetAt(f) + dev };
  });
  // usableLfHz = 35 makes 30 Hz boost product-limited (LF ramp = 0 below 35 Hz).
  const result = calculateHouseCurveEqCurve(rawCurve, [], 35, [], {
    targetAnchorDb: anchorDb,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
  });
  const enabledFilters = result.filters.filter((f) => f.enabled);
  const cutFilters = enabledFilters.filter((f) => f.gainDb < -0.5);
  const cutNear50 = cutFilters.filter((f) => Math.abs(f.frequencyHz - 50) < 10);

  // Baseline metrics (empty bank) for comparison.
  const rspRaw = normaliseCurve(rawCurve);
  const baselineSeats = [{ seatId: "rsp", isPrimary: true, raw: rspRaw }];
  const baselineMetrics = calculateAllSeatMetrics(baselineSeats, [], 20, 200, anchorDb);

  // 1. At least one enabled cut filter exists near 50 Hz.
  results.correctedPeak = cutNear50.length > 0;
  // 2. Its Q is high enough to protect the 30 Hz null (Q >= 8).
  results.cutFilterQHighEnough = cutNear50.some((f) => f.Q >= 8);
  // 3. RMS target error improves by more than 0.05 dB.
  results.rmsImproves = (baselineMetrics?.rmsSeatTargetErrorDb ?? Infinity) - (result.rmsSeatTargetErrorDb ?? -Infinity) > 0.05;
  // 4. Worst deviation does not worsen by more than 0.05 dB.
  results.worstDoesNotWorsen = (result.worstSeatMaxDeviationDb ?? Infinity) <= (baselineMetrics?.worstSeatMaxDeviationDb ?? Infinity) + 0.05;
  // 5. The 30 Hz null is recorded as product-limited.
  results.recordedBlockedNull = Array.isArray(result.blockedResiduals) && result.blockedResiduals.some((b) => Math.abs(b.frequency - 30) < 5 && b.blockingReason === "product-limited");
  // 6. Final complete-bank validation passes.
  results.bankValidationPassed = result.bankValidationPassed !== false;
  // The fitter must not have stopped at the null.
  results.didNotStopAtNull = result.stopReason !== "no capable correction for worst residual";
  // Raw metrics for the comparator fixture in runRankingFixtures.
  results.baselineWorstSeatDeviationDb = baselineMetrics?.worstSeatMaxDeviationDb ?? null;
  results.baselineMeanSeatMaxDeviationDb = baselineMetrics?.meanSeatMaxDeviationDb ?? null;
  results.baselineRmsSeatTargetErrorDb = baselineMetrics?.rmsSeatTargetErrorDb ?? null;
  results.finalWorstSeatDeviationDb = result.worstSeatMaxDeviationDb ?? null;
  results.finalMeanSeatMaxDeviationDb = result.meanSeatMaxDeviationDb ?? null;
  results.finalRmsSeatTargetErrorDb = result.rmsSeatTargetErrorDb ?? null;
  results.enabledFilterCount = enabledFilters.length;
  results.enabledFilters = enabledFilters;
  results.selectedStart = result.selectedStart;
  results.objectiveLabel = result.objectiveLabel;
  results.blockedResiduals = result.blockedResiduals;
  results.bankLimits = result.bankLimits;
  results.fallbackOccurred = result.bankDiagnostics?.fallbackOccurred ?? false;

  // --- Two-real-seat fixture ---
  // RSP is separate; real seats are optimised; neither worsens; RSP P19 is reported.
  const rspCurve2 = rawCurve.map((p) => ({ ...p }));
  const seat1Curve = freqs.map((f) => {
    let dev = 0;
    dev -= 12 * Math.exp(-(((f - 30) / 5) ** 2));
    dev += 5 * Math.exp(-(((f - 50) / 10) ** 2));
    return { frequency: f, spl: anchorDb + artcousticHouseCurveOffsetAt(f) + dev };
  });
  const seat2Curve = freqs.map((f) => {
    let dev = 0;
    dev -= 10 * Math.exp(-(((f - 30) / 5) ** 2));
    dev += 4 * Math.exp(-(((f - 50) / 10) ** 2));
    return { frequency: f, spl: anchorDb + artcousticHouseCurveOffsetAt(f) + dev };
  });
  const perSeatRawCurves = [
    { seatId: "rsp", isPrimary: true, responseData: rspCurve2, __isSyntheticRsp: true },
    { seatId: "seat1", isPrimary: false, responseData: seat1Curve },
    { seatId: "seat2", isPrimary: false, responseData: seat2Curve },
  ];
  const result2 = calculateHouseCurveEqCurve(rspCurve2, perSeatRawCurves, 35, [], {
    targetAnchorDb: anchorDb,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
  });
  const enabledFilters2 = result2.filters.filter((f) => f.enabled);
  const cutFilters2 = enabledFilters2.filter((f) => f.gainDb < -0.5);
  // Baseline per-seat metrics for the two-seat case.
  const realSeats2 = [
    { seatId: "seat1", isPrimary: false, raw: normaliseCurve(seat1Curve) },
    { seatId: "seat2", isPrimary: false, raw: normaliseCurve(seat2Curve) },
  ];
  const baselineMetrics2 = calculateAllSeatMetrics(realSeats2, [], 20, 200, anchorDb);
  const finalMetrics2 = calculateAllSeatMetrics(realSeats2, enabledFilters2, 20, 200, anchorDb);
  // RSP is not included in the real-seat objective.
  results.twoSeatObjectiveExcludesRsp = result2.objectiveLabel === "Worst real seat";
  // One shared bank improves the safely correctable peak.
  results.twoSeatCorrectedPeak = cutFilters2.some((f) => Math.abs(f.frequencyHz - 50) < 10);
  // Neither real seat's maximum deviation worsens by more than 0.05 dB.
  const seat1Baseline = baselineMetrics2?.seatMetrics?.find((m) => m.seatId === "seat1");
  const seat2Baseline = baselineMetrics2?.seatMetrics?.find((m) => m.seatId === "seat2");
  const seat1Final = finalMetrics2?.seatMetrics?.find((m) => m.seatId === "seat1");
  const seat2Final = finalMetrics2?.seatMetrics?.find((m) => m.seatId === "seat2");
  const seat1Worsened = (seat1Final?.maxAbsDeviationDb ?? Infinity) > (seat1Baseline?.maxAbsDeviationDb ?? Infinity) + 0.05;
  const seat2Worsened = (seat2Final?.maxAbsDeviationDb ?? Infinity) > (seat2Baseline?.maxAbsDeviationDb ?? Infinity) + 0.05;
  results.twoSeatNeitherWorsened = !seat1Worsened && !seat2Worsened;
  // Official RSP P19 remains separately reported.
  results.twoSeatRspP19Reported = result2.rspP19Level !== undefined && result2.rspP19Level !== null;
  // The per-seat metric is clearly labelled as a worst-seat P19-equivalent objective.
  results.twoSeatObjectiveIsWorstSeat = result2.objectiveLabel === "Worst real seat";

  return results;
}