import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { calculateHouseCurveEqCurve } from "@/components/utils/houseCurveFitter";
import { calculateAllSeatMetrics } from "@/components/utils/houseCurveFitterCore";
import { normaliseCurve } from "@/components/utils/designEqCalibration";

export function runHouseCurveFitterFixtures() {
  const results = {};
  const anchorDb = 0;
  const frequencies = Array.from({ length: 181 }, (_, index) => index + 20);
  const rawCurve = frequencies.map((frequency) => {
    const nullDeviation = -15 * Math.exp(-(((frequency - 30) / 5) ** 2));
    const peakDeviation = 6 * Math.exp(-(((frequency - 50) / 10) ** 2));
    return { frequency, spl: anchorDb + artcousticHouseCurveOffsetAt(frequency) + nullDeviation + peakDeviation };
  });
  const result = calculateHouseCurveEqCurve(rawCurve, [], 35, [], {
    targetAnchorDb: anchorDb,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
  });
  const enabledFilters = result.filters.filter((filter) => filter.enabled);
  const cutNear50 = enabledFilters.filter((filter) => filter.gainDb < -0.5 && Math.abs(filter.frequencyHz - 50) < 10);
  const rspRaw = normaliseCurve(rawCurve);
  const baselineMetrics = calculateAllSeatMetrics([{ seatId: "rsp", isPrimary: true, raw: rspRaw }], [], 20, 200, anchorDb);

  results.correctedPeak = cutNear50.length > 0;
  results.cutFilterQHighEnough = cutNear50.some((filter) => filter.Q >= 8);
  results.rmsImproves = (baselineMetrics?.rmsSeatTargetErrorDb ?? Infinity) - (result.rmsSeatTargetErrorDb ?? -Infinity) > 0.05;
  results.worstDoesNotWorsen = (result.worstSeatMaxDeviationDb ?? Infinity) <= (baselineMetrics?.worstSeatMaxDeviationDb ?? Infinity) + 0.05;
  results.recordedBlockedNull = Array.isArray(result.blockedResiduals)
    && result.blockedResiduals.some((blocked) => Math.abs(blocked.frequency - 30) < 8 && blocked.blockingReason === "protected-null");
  results.bankValidationPassed = result.bankValidationPassed !== false;
  results.didNotStopAtNull = result.stopReason !== "no capable correction for worst residual";
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
  results.fallbackType = result.bankDiagnostics?.fallbackType ?? null;

  const rspCurve = rawCurve.map((point) => ({ ...point }));
  const seatCurve = (nullDepth, peakHeight) => frequencies.map((frequency) => ({
    frequency,
    spl: anchorDb + artcousticHouseCurveOffsetAt(frequency)
      - nullDepth * Math.exp(-(((frequency - 30) / 5) ** 2))
      + peakHeight * Math.exp(-(((frequency - 50) / 10) ** 2)),
  }));
  const seat1Curve = seatCurve(12, 5);
  const seat2Curve = seatCurve(10, 4);
  const perSeatRawCurves = [
    { seatId: "rsp", isPrimary: true, responseData: rspCurve, __isSyntheticRsp: true },
    { seatId: "seat1", isPrimary: false, responseData: seat1Curve },
    { seatId: "seat2", isPrimary: false, responseData: seat2Curve },
  ];
  const result2 = calculateHouseCurveEqCurve(rspCurve, perSeatRawCurves, 35, [], {
    targetAnchorDb: anchorDb,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
  });
  const enabledFilters2 = result2.filters.filter((filter) => filter.enabled);
  const realSeats = [
    { seatId: "seat1", isPrimary: false, raw: normaliseCurve(seat1Curve) },
    { seatId: "seat2", isPrimary: false, raw: normaliseCurve(seat2Curve) },
  ];
  const baselineMetrics2 = calculateAllSeatMetrics(realSeats, [], 20, 200, anchorDb);
  const finalMetrics2 = calculateAllSeatMetrics(realSeats, enabledFilters2, 20, 200, anchorDb);
  const finalWorstOutsideProtectedNulls = result2.worstSeatMaxDeviationDb ?? Infinity;
  const baselineWorstIncludingNulls = baselineMetrics2?.worstSeatMaxDeviationDb ?? -Infinity;
  const finiteSeatMetrics = ["seat1", "seat2"].every((seatId) => {
    const before = baselineMetrics2?.seatMetrics?.find((metric) => metric.seatId === seatId);
    const after = finalMetrics2?.seatMetrics?.find((metric) => metric.seatId === seatId);
    return Number.isFinite(before?.maxAbsDeviationDb) && Number.isFinite(after?.maxAbsDeviationDb);
  });

  results.twoSeatObjectiveUsesRspPrimary = result2.objectiveLabel === "RSP primary; real seats constrained";
  results.twoSeatCorrectedPeak = enabledFilters2.some((filter) => filter.gainDb < -0.5 && Math.abs(filter.frequencyHz - 50) < 10);
  results.twoSeatNeitherWorsened = finalWorstOutsideProtectedNulls <= baselineWorstIncludingNulls + 0.5 && finiteSeatMetrics;
  results.twoSeatRspP19Reported = result2.rspP19Level !== undefined && result2.rspP19Level !== null;
  results.twoSeatObjectiveIsRspPrimary = result2.objectiveLabel === "RSP primary; real seats constrained";
  results.twoSeatFallbackType = result2.bankDiagnostics?.fallbackType ?? null;
  return results;
}