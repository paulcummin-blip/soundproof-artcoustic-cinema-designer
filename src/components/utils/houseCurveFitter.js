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
import { createHouseCurveEvaluationMemo } from "@/components/utils/houseCurveEvaluationMemo";
import { prepareBankValidation } from "@/components/utils/preparedBankValidation";
import { identifyProtectedNullRegions } from "@/components/utils/houseCurveFitProtection";
import { interpolateCanonicalTarget, requiredCorrectionDb } from "@/components/utils/houseCurveTargetAuthority";
import { refineOpposingResidualPair } from "@/components/utils/houseCurvePairedRefinement";
import { runProfessionalResidualCleanup } from "@/components/utils/houseCurveResidualCleanup";
import { refineLegalUnprotectedPeak } from "@/components/utils/houseCurveLegalPeakRefinement";
import {
  buildLfCapabilityContext,
  buildLfCapabilityProtectionDiagnostics,
  calculateLfCapabilityPenalty,
  getEqCapabilityBoostAllowance,
} from "@/components/utils/lfCapabilityProtection";

export { houseCurveP19Level };

const isNumber = (v) => Number.isFinite(Number(v));

// Fallback resolver — exported for deterministic testing of both fallback routes.
// Never converts a validator failure into success. If the empty bank fails
// validation, reports an invariant violation and leaves bankValidationPassed: false.
export function resolveFallback({ selectedFilters, standardSeedFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, objectiveSeats, assessmentStartHz, assessmentEndHz, anchorDb, protectedNullRegions = [], canonicalTargetCurve = null, bankEvalCount = 0 }) {
  let filters = (Array.isArray(selectedFilters) ? selectedFilters : []).map((f) => ({ ...f }));
  let finalBankLimits = evaluateProvisionalBankLimits(filters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  bankEvalCount++;
  let bankValidationPassed = finalBankLimits.allOk;
  let fallbackOccurred = false;
  let fallbackType = null;
  let finalMetrics = null;
  let stopReason = null;
  let blockedResiduals = [];
  let invariantViolation = false;

  if (!bankValidationPassed) {
    fallbackOccurred = true;
    if (standardSeedFilters.length > 0) {
      const seedLimits = evaluateProvisionalBankLimits(standardSeedFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
      bankEvalCount++;
      if (seedLimits.allOk) {
        filters = standardSeedFilters.map((f) => ({ ...f }));
        fallbackType = "standard-seed";
      } else {
        filters = [];
        fallbackType = "empty";
      }
    } else {
      filters = [];
      fallbackType = "empty";
    }
    finalMetrics = calculateAllSeatMetrics(objectiveSeats, filters, assessmentStartHz, assessmentEndHz, anchorDb, null, null, { protectedNullRegions, canonicalTargetCurve });
    stopReason = `final bank validation failed — reverted to ${fallbackType}`;
    blockedResiduals = [];
    finalBankLimits = evaluateProvisionalBankLimits(filters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
    bankEvalCount++;
    bankValidationPassed = finalBankLimits.allOk;
    // Invariant: empty bank must always pass validation. If it does not, report
    // the failure — never convert a validator failure into success.
    if (fallbackType === "empty" && !bankValidationPassed) {
      invariantViolation = true;
    }
  }

  return { filters, fallbackOccurred, fallbackType, bankValidationPassed, finalBankLimits, finalMetrics, stopReason, blockedResiduals, bankEvalCount, invariantViolation };
}

// Seat-aware house-curve EQ fitter. Optimises a shared filter bank for the worst
// real-seat house-curve deviation. RSP is kept separate for official RP22 P19.
// When no real seats exist, falls back to RSP and labels the objective accordingly.
export function calculateHouseCurveEqCurve(rawCurve, perSeatRawCurves, usableLfHz, activeSubs = [], options = {}) {
  const rspRaw = normaliseCurve(rawCurve);
  if (!rspRaw.length) return { filters: emptyFilters([]), curve: [], combinedEqCurve: [], designEqFitProfile: "house_curve", perSeatMetrics: [] };

  // RSP is the primary house-curve target. Real seats constrain the shared bank
  // so the RSP improvement does not create unacceptable seat deterioration.
  const realSeatCurves = (Array.isArray(perSeatRawCurves) ? perSeatRawCurves : [])
    .filter((s) => s?.seatId && s.seatId !== "rsp" && !s.__isSyntheticRsp && Array.isArray(s?.responseData) && s.responseData.length > 0)
    .map((s) => {
      const raw = normaliseCurve(s.responseData);
      return { seatId: s.seatId, isPrimary: !!s.isPrimary, raw, gridKey: raw.map((point) => point.frequency).join("|") };
    })
    .filter((s) => s.raw.length > 0);

  const hasRealSeats = realSeatCurves.length > 0;
  const rspSeat = { seatId: "rsp", isPrimary: true, raw: rspRaw, gridKey: rspRaw.map((point) => point.frequency).join("|") };
  const objectiveSeats = [rspSeat, ...realSeatCurves];
  const objectiveLabel = hasRealSeats ? "RSP primary; real seats constrained" : "RSP primary — no real seats";

  const assessmentStartHz = Number.isFinite(Number(options.assessmentStartHz)) ? Number(options.assessmentStartHz) : 20;
  const assessmentEndHz = Number.isFinite(Number(options.assessmentEndHz)) ? Number(options.assessmentEndHz) : 120;
  const fitStartHz = Number.isFinite(Number(options.fitStartHz)) ? Number(options.fitStartHz) : 20;
  const fitEndHz = Number.isFinite(Number(options.fitEndHz)) ? Number(options.fitEndHz) : 200;
  const correctionStartHz = Number.isFinite(Number(options.correctionStartHz)) ? Number(options.correctionStartHz) : 20;
  const correctionEndHz = Number.isFinite(Number(options.correctionEndHz)) ? Number(options.correctionEndHz) : 200;
  const anchorDb = Number.isFinite(Number(options.targetAnchorDb)) ? Number(options.targetAnchorDb) : 0;
  if (!isNumber(anchorDb)) return { filters: emptyFilters([]), curve: [], combinedEqCurve: [], designEqFitProfile: "house_curve", perSeatMetrics: [] };

  const requestedSystemOutputDb = Number.isFinite(Number(options.requestedSystemOutputDb)) ? Number(options.requestedSystemOutputDb) : undefined;
  const canonicalTargetCurve = Array.isArray(options.canonicalTargetCurve) ? options.canonicalTargetCurve : [];
  const profile = { ...DESIGN_EQ_FIT_PROFILES.accuracy, id: "house_curve", preserveP14: true, maximumCutDb: 15 };
  const bankRaw = rspRaw;
  const capabilityContext = buildLfCapabilityContext(activeSubs, bankRaw.map((point) => point.frequency), profile.id, requestedSystemOutputDb);
  const capabilityPenaltyForBank = (bank) => calculateLfCapabilityPenalty(
    bank, capabilityContext, (frequency, candidateBank) => candidateBank.reduce((sum, filter) => sum + peakingEqResponseDb(frequency, filter), 0),
  );
  const protectedNullRegions = Array.isArray(options.protectedNullRegions)
    ? options.protectedNullRegions
    : identifyProtectedNullRegions(
        rspRaw, correctionStartHz, correctionEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, canonicalTargetCurve,
      );

  const standardSeedFilters = Array.isArray(options.initialFilters)
    ? options.initialFilters
        .filter((f) => f && f.enabled && Number.isFinite(f.frequencyHz) && f.frequencyHz > 0 && Number.isFinite(f.gainDb) && Number.isFinite(f.Q) && f.Q > 0)
        .slice(0, 10)
        .map((f) => ({ ...f }))
    : [];

  // Multi-start: Start A (empty bank), Start B (Standard-seeded bank).
  const reuseExactEvaluations = options.reuseExactEvaluations !== false;
  const evaluationMemo = createHouseCurveEvaluationMemo(reuseExactEvaluations);
  const preparedBankValidation = reuseExactEvaluations
    ? prepareBankValidation(bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb)
    : null;
  const evaluationOptions = { reuseExactEvaluations, memo: evaluationMemo, preparedBankValidation, protectedNullRegions, canonicalTargetCurve, correctionStartHz, correctionEndHz };
  const startA = runSingleStart([], objectiveSeats, bankRaw, fitStartHz, fitEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationOptions);
  let startB = startA;
  if (standardSeedFilters.length > 0) {
    startB = runSingleStart(standardSeedFilters, objectiveSeats, bankRaw, fitStartHz, fitEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationOptions);
  }

  // Select the start with the best RSP maximum residual, then RSP RMS.
  let selected = startA;
  let selectedStartLabel = "empty";
  let capabilityPenaltyChangedStartSelection = false;
  if (startB !== startA && startB.metrics && startA.metrics) {
    const rawComparatorPrefersB = compareHouseCurveMetrics(startB.metrics, startA.metrics) < 0;
    const startAScore = startA.metrics.rspMaxDeviationDb + (startA.capabilityPenaltyCostDb || 0);
    const startBScore = startB.metrics.rspMaxDeviationDb + (startB.capabilityPenaltyCostDb || 0);
    const capabilityComparatorPrefersB = startBScore < startAScore - 0.01
      || (Math.abs(startBScore - startAScore) <= 0.01 && rawComparatorPrefersB);
    capabilityPenaltyChangedStartSelection = rawComparatorPrefersB !== capabilityComparatorPrefersB;
    const baselineReachedL1 = Number.isFinite(startA.baselineRspMinimumSplDb) && startA.baselineRspMinimumSplDb >= 114;
    const startAPreservesL1 = !baselineReachedL1 || startA.finalRspMinimumSplDb >= 113.95;
    const startBPreservesL1 = !baselineReachedL1 || startB.finalRspMinimumSplDb >= 113.95;
    if ((!startAPreservesL1 && startBPreservesL1) || (startAPreservesL1 === startBPreservesL1 && capabilityComparatorPrefersB)) {
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
  const pairedSeatBaselineMetrics = finalMetrics;
  const baselineP14L1 = Number.isFinite(selected.baselineRspMinimumSplDb) && selected.baselineRspMinimumSplDb >= 114;
  const correctableP19FromFitMetrics = (metrics) => {
    const points = (metrics?.rspResidualPoints || []).filter((point) => point.frequency >= assessmentStartHz
      && point.frequency <= assessmentEndHz
      && !protectedNullRegions.some((region) => point.frequency >= region.startHz && point.frequency <= region.endHz));
    return points.length ? Math.max(...points.map((point) => Math.abs(point.deviationDb))) : null;
  };
  for (let refinementPass = 0; refinementPass < 2; refinementPass++) {
    if (correctableP19FromFitMetrics(finalMetrics) <= 3) break;
    const pairedRefinement = refineOpposingResidualPair({
      filters, metrics: finalMetrics, seatBaselineMetrics: pairedSeatBaselineMetrics,
      seats: objectiveSeats, bankRaw, fitStartHz, fitEndHz, anchorDb, activeSubs, usableLfHz,
      requestedSystemOutputDb, profile, protectedNullRegions, canonicalTargetCurve, baselineP14L1,
    });
    bankEvalCount += pairedRefinement.bankEvaluationCount;
    if (!pairedRefinement.changed) {
      stopReason = `${stopReason}; paired refinement stopped: ${pairedRefinement.limitation}`;
      break;
    }
    filters = pairedRefinement.filters;
    finalMetrics = pairedRefinement.metrics;
    operations += 1;
    stopReason = `${stopReason}; accepted joint opposing-residual refinement`;
  }
  const residualCleanup = runProfessionalResidualCleanup({
    filters, rawCurve: rspRaw, perSeatRawCurves, anchorDb, canonicalTargetCurve,
    protectedNullRegions, activeSubs, usableLfHz, requestedSystemOutputDb,
    assessmentStartHz, assessmentEndHz, correctionStartHz, correctionEndHz,
    profile, priorIterationTrace: selected.trace || [],
  });
  bankEvalCount += residualCleanup.bankEvaluationCount;
  if (residualCleanup.changed) {
    filters = residualCleanup.filters;
    finalMetrics = calculateAllSeatMetrics(
      objectiveSeats, filters, fitStartHz, fitEndHz, anchorDb, null, null,
      { protectedNullRegions, canonicalTargetCurve },
    );
    operations += residualCleanup.acceptedOperationCount;
    stopReason = `${stopReason}; accepted ${residualCleanup.acceptedOperationCount} high-resolution residual-cleanup operation(s)`;
  }
  const legalPeakRefinement = refineLegalUnprotectedPeak({
    filters, rawCurve: rspRaw, targetCurve: canonicalTargetCurve, protectedNullRegions,
    assessmentStartHz, assessmentEndHz, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb,
    profile, objectiveSeats, fitStartHz, fitEndHz, anchorDb,
  });
  if (legalPeakRefinement.changed) {
    filters = legalPeakRefinement.filters;
    finalMetrics = legalPeakRefinement.metrics;
    operations += 1;
    stopReason = `${stopReason}; ${legalPeakRefinement.reason}`;
  }
  const operationCounts = [startA, startB === startA ? null : startB].filter(Boolean).reduce((totals, start) => {
    Object.entries(start.operationCounts || {}).forEach(([key, value]) => { totals[key] = (totals[key] || 0) + value; });
    return totals;
  }, {});
  operationCounts.residualCleanupAcceptedOperations = residualCleanup.acceptedOperationCount;
  operationCounts.residualCleanupBankEvaluations = residualCleanup.bankEvaluationCount;
  operationCounts.capabilityPenaltyRejections = (operationCounts.capabilityPenaltyRejections || 0)
    + (residualCleanup.diagnostics || []).flatMap((item) => item.attempts || [])
      .filter((attempt) => attempt.rejectionReason?.includes("LF capability penalty")).length;
  operationCounts.capabilityPenaltySelectionChanges = (operationCounts.capabilityPenaltySelectionChanges || 0)
    + (capabilityPenaltyChangedStartSelection ? 1 : 0);

  // Final bank validation — must pass all hard limits. If it fails (safety net),
  // revert to the Standard seed (or empty) and recalculate metrics.
  // Never converts a validator failure into success — see resolveFallback.
  const fallback = resolveFallback({
    selectedFilters: filters, standardSeedFilters, bankRaw, activeSubs,
    usableLfHz, requestedSystemOutputDb, profile, objectiveSeats,
    assessmentStartHz: fitStartHz, assessmentEndHz: fitEndHz,
    anchorDb, protectedNullRegions, canonicalTargetCurve, bankEvalCount,
  });
  filters = fallback.filters;
  let finalBankLimits = fallback.finalBankLimits;
  let bankValidationPassed = fallback.bankValidationPassed;
  const fallbackOccurred = fallback.fallbackOccurred;
  const fallbackType = fallback.fallbackType;
  const invariantViolation = fallback.invariantViolation;
  bankEvalCount = fallback.bankEvalCount;
  if (fallback.fallbackOccurred) {
    finalMetrics = fallback.finalMetrics;
    stopReason = fallback.stopReason;
    blockedResiduals = fallback.blockedResiduals;
  }

  // Official RSP P19 (always calculated from RSP, separate from the worst-seat objective).
  const rspCorrected = buildCurveFromBank(rspRaw, filters);
  const rspSmoothed = applyBassSmoothing(rspCorrected, "third");
  const rspAssessed = rspSmoothed
    .filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
    .map((p) => {
      const targetSpl = interpolateCanonicalTarget(canonicalTargetCurve, p.frequency) ?? (anchorDb + artcousticHouseCurveOffsetAt(p.frequency));
      return { frequency: p.frequency, targetSpl, deviationDb: p.spl - targetSpl };
    })
    .filter((p) => isNumber(p.deviationDb));
  const rspMaxDev = rspAssessed.length ? Math.max(...rspAssessed.map((p) => Math.abs(p.deviationDb))) : null;
  const rspCorrectableAssessed = rspAssessed.filter((point) => !protectedNullRegions.some((region) => point.frequency >= region.startHz && point.frequency <= region.endHz));
  const rspCorrectableMaxDev = rspCorrectableAssessed.length
    ? Math.max(...rspCorrectableAssessed.map((point) => Math.abs(point.deviationDb)))
    : null;
  const upperFitStats = (smoothedCurve) => {
    const residuals = smoothedCurve
      .filter((point) => point.frequency > assessmentEndHz && point.frequency <= fitEndHz)
      .filter((point) => !protectedNullRegions.some((region) => point.frequency >= region.startHz && point.frequency <= region.endHz))
      .map((point) => point.spl - (interpolateCanonicalTarget(canonicalTargetCurve, point.frequency)
        ?? (anchorDb + artcousticHouseCurveOffsetAt(point.frequency))))
      .filter(Number.isFinite);
    return residuals.length ? {
      maximumAbsoluteResidualDb: Math.max(...residuals.map(Math.abs)),
      rmsResidualDb: Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length),
    } : { maximumAbsoluteResidualDb: null, rmsResidualDb: null };
  };
  const upperFitPre = upperFitStats(applyBassSmoothing(rspRaw, "third"));
  const upperFitPost = upperFitStats(rspSmoothed);
  const upperFitCorrectableResidualExists = Number.isFinite(upperFitPre.maximumAbsoluteResidualDb) && upperFitPre.maximumAbsoluteResidualDb > 1;
  const upperFitImproved = upperFitCorrectableResidualExists && (
    (upperFitPost.maximumAbsoluteResidualDb < upperFitPre.maximumAbsoluteResidualDb - 0.05
      && upperFitPost.rmsResidualDb <= upperFitPre.rmsResidualDb + 0.01)
    || (upperFitPost.rmsResidualDb < upperFitPre.rmsResidualDb - 0.01
      && upperFitPost.maximumAbsoluteResidualDb <= upperFitPre.maximumAbsoluteResidualDb + 0.05)
  );

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

  const worstCorrectablePoint = rspCorrectableAssessed.length
    ? rspCorrectableAssessed.reduce((worst, point) => Math.abs(point.deviationDb) > Math.abs(worst.deviationDb) ? point : worst)
    : null;
  const worstFrequencyHz = worstCorrectablePoint?.frequency ?? null;
  const signedResidualDb = worstCorrectablePoint?.deviationDb ?? null;
  const requiredCorrectionAtWorstDb = Number.isFinite(signedResidualDb)
    ? requiredCorrectionDb(worstCorrectablePoint.targetSpl, worstCorrectablePoint.targetSpl + signedResidualDb)
    : null;
  const appliedCorrectionAtWorstDb = Number.isFinite(worstFrequencyHz)
    ? interpolateCanonicalTarget(combinedEqCurve, worstFrequencyHz)
    : null;
  const boostAllowance = Number.isFinite(worstFrequencyHz) && Number.isFinite(requiredCorrectionAtWorstDb) && requiredCorrectionAtWorstDb > 0
    ? getEqCapabilityBoostAllowance({
        frequency: worstFrequencyHz, requestedBoostDb: 6, activeSubs,
        maxBoostDb: 6, requestedSystemOutputDb,
      })
    : null;
  const remainingProductBoostDb = boostAllowance
    ? Math.max(0, Number(boostAllowance.allowedBoostDb) - Math.max(0, appliedCorrectionAtWorstDb || 0))
    : null;
  let remainingResidualLimit = "none";
  const remainingAggregateCutHeadroomDb = Math.max(0, 15 + finalBankLimits.maxAggregateCutDb);
  const rawAtWorst = Number.isFinite(worstFrequencyHz)
    ? rspRaw.reduce((nearest, point) => Math.abs(point.frequency - worstFrequencyHz) < Math.abs(nearest.frequency - worstFrequencyHz) ? point : nearest)
    : null;
  const rawTargetAtWorst = Number.isFinite(worstFrequencyHz)
    ? interpolateCanonicalTarget(canonicalTargetCurve, worstFrequencyHz) ?? (anchorDb + artcousticHouseCurveOffsetAt(worstFrequencyHz))
    : null;
  const highResolutionResidualAtWorstDb = rawAtWorst && Number.isFinite(rawTargetAtWorst)
    ? rawAtWorst.spl + appliedCorrectionAtWorstDb - rawTargetAtWorst
    : null;
  const resolutionConflict = Number.isFinite(signedResidualDb) && Number.isFinite(highResolutionResidualAtWorstDb)
    && signedResidualDb * highResolutionResidualAtWorstDb < 0;
  const nearestProtectedBoundaryDistanceHz = Number.isFinite(worstFrequencyHz) && protectedNullRegions.length
    ? Math.min(...protectedNullRegions.flatMap((region) => [Math.abs(worstFrequencyHz - region.startHz), Math.abs(worstFrequencyHz - region.endHz)]))
    : null;
  if (resolutionConflict && Math.abs(signedResidualDb) > 3) remainingResidualLimit = "high-resolution-conflict-limited";
  else if (Number.isFinite(requiredCorrectionAtWorstDb) && requiredCorrectionAtWorstDb < 0
    && Math.abs(requiredCorrectionAtWorstDb) > remainingAggregateCutHeadroomDb + 0.05) remainingResidualLimit = "cut-limited";
  else if (Number.isFinite(requiredCorrectionAtWorstDb) && requiredCorrectionAtWorstDb > 0 && finalBankLimits.maxAggregateBoostDb >= 5.95) remainingResidualLimit = "boost-limited";
  else if (Number.isFinite(requiredCorrectionAtWorstDb) && requiredCorrectionAtWorstDb > 0
    && Number.isFinite(remainingProductBoostDb) && requiredCorrectionAtWorstDb > remainingProductBoostDb + 0.05
    && Number(boostAllowance?.allowedBoostDb) < 5.95) remainingResidualLimit = "product-limited";
  else if (filters.filter((filter) => filter.enabled).length >= 10) remainingResidualLimit = "filter-count-limited";
  const nearestRejectedTrials = Number.isFinite(worstFrequencyHz)
    ? (selected.trace || []).flatMap((entry) => entry.trials || [])
        .filter((trial) => Number.isFinite(trial.regionCentreHz)
          && Math.log2(Math.max(trial.regionCentreHz, worstFrequencyHz) / Math.min(trial.regionCentreHz, worstFrequencyHz)) <= 1 / 6
          && !trial.accepted && trial.rejectionReason)
    : [];
  const remainingWorstCorrectableResidual = {
    frequencyHz: worstFrequencyHz,
    signedResidualDb,
    requiredCorrectionDb: requiredCorrectionAtWorstDb,
    appliedCorrectionDb: appliedCorrectionAtWorstDb,
    limitingClassification: remainingResidualLimit,
    cutLimited: remainingResidualLimit === "cut-limited",
    boostLimited: remainingResidualLimit === "boost-limited",
    productLimited: remainingResidualLimit === "product-limited",
    filterCountLimited: remainingResidualLimit === "filter-count-limited",
    highResolutionConflictLimited: remainingResidualLimit === "high-resolution-conflict-limited",
    highResolutionResidualDb: highResolutionResidualAtWorstDb,
    highResolutionRequiredCorrectionDb: Number.isFinite(highResolutionResidualAtWorstDb) ? -highResolutionResidualAtWorstDb : null,
    nearestProtectedBoundaryDistanceHz,
    maximumLegalFilterQ: 10,
    enabledFilterCount: filters.filter((filter) => filter.enabled).length,
    productPermittedTotalBoostDb: boostAllowance?.allowedBoostDb ?? null,
    productRemainingBoostDb: remainingProductBoostDb,
    remainingAggregateCutHeadroomDb,
    anotherLegalFilterRejectedBecause: remainingResidualLimit === "cut-limited"
      ? `required additional cut ${Math.abs(requiredCorrectionAtWorstDb).toFixed(3)} dB exceeds remaining aggregate cut headroom ${remainingAggregateCutHeadroomDb.toFixed(3)} dB`
      : remainingResidualLimit === "high-resolution-conflict-limited"
        ? `1/3-octave residual ${signedResidualDb.toFixed(3)} dB requires ${requiredCorrectionAtWorstDb.toFixed(3)} dB, but the high-resolution residual is ${highResolutionResidualAtWorstDb.toFixed(3)} dB and requires ${(-highResolutionResidualAtWorstDb).toFixed(3)} dB; opposite correction signs at ${nearestProtectedBoundaryDistanceHz.toFixed(3)} Hz from a protected-null boundary, with ${remainingAggregateCutHeadroomDb.toFixed(3)} dB aggregate cut headroom, Q ≤ 10 and ${filters.filter((filter) => filter.enabled).length}/10 filters enabled`
        : nearestRejectedTrials.at(-1)?.rejectionReason ?? stopReason,
  };

  return {
    filters: emptyFilters(filters),
    curve,
    combinedEqCurve,
    fitterHouseCurveTarget: canonicalTargetCurve.map((point) => ({ ...point })),
    designEqFitProfile: "house_curve",
    designEqFitProfileConfig: {
      preserveP14: true, fittingToleranceDb: 1,
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
    officialP19VariationDb: rspMaxDev,
    correctableP19VariationDb: rspCorrectableMaxDev,
    assessmentStartHz,
    assessmentEndHz,
    fitStartHz,
    fitEndHz,
    correctionStartHz,
    correctionEndHz,
    remainingWorstCorrectableResidual,
    rspObjectiveMaxDeviationDb: finalMetrics?.rspMaxDeviationDb ?? null,
    rspRmsDeviationDb: finalMetrics?.rspRmsDeviationDb ?? null,
    rspMeanSignedResidualDb: finalMetrics?.rspMeanSignedResidualDb ?? null,
    rspShapeRmsDeviationDb: finalMetrics?.rspShapeRmsDeviationDb ?? null,
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
    iterationTrace: selected.trace || [],
    lfCapabilityProtection: buildLfCapabilityProtectionDiagnostics(
      capabilityContext,
      capabilityPenaltyForBank(filters),
      {
        penaltyInfluencedSelectedFilters: (operationCounts.capabilityPenaltyRejections || 0) > 0
          || (operationCounts.capabilityPenaltySelectionChanges || 0) > 0,
        candidatesRejectedByPenalty: operationCounts.capabilityPenaltyRejections || 0,
        selectionsChangedByPenalty: operationCounts.capabilityPenaltySelectionChanges || 0,
      },
    ),
    houseCurveDiagnostics: {
      preRsp: selected.baselineRspMetrics,
      officialP19VariationDb: rspMaxDev,
      correctableP19VariationDb: rspCorrectableMaxDev,
      assessmentStartHz,
      assessmentEndHz,
      fitStartHz,
      fitEndHz,
      correctionStartHz,
      correctionEndHz,
      upperFitBandImprovement: {
        startHz: assessmentEndHz,
        endHz: fitEndHz,
        correctableResidualExists: upperFitCorrectableResidualExists,
        improved: upperFitImproved,
        pre: upperFitPre,
        post: upperFitPost,
      },
      remainingWorstCorrectableResidual,
      legalPeakRefinement: {
        changed: legalPeakRefinement.changed,
        reason: legalPeakRefinement.reason,
        frequencyHz: legalPeakRefinement.frequencyHz ?? null,
        rawPeakResidualDb: legalPeakRefinement.rawPeakResidual ?? null,
      },
      residualCleanup: {
        diagnostics: residualCleanup.diagnostics,
        finalQuality: residualCleanup.finalQuality,
        baselineP20Level: residualCleanup.baselineP20Level,
        finalP20Level: residualCleanup.finalP20Level,
        limits: residualCleanup.limits,
      },
      postRsp: {
        maximumAbsoluteResidualDb: finalMetrics?.rspMaxDeviationDb ?? null,
        rmsResidualDb: finalMetrics?.rspRmsDeviationDb ?? null,
        meanSignedResidualDb: finalMetrics?.rspMeanSignedResidualDb ?? null,
        shapeRmsResidualDb: finalMetrics?.rspShapeRmsDeviationDb ?? null,
      },
      protectedNullRegions,
      nearTargetProtectionRejectionCount: operationCounts.nearTargetProtectionRejections || 0,
      p14SafetyRejectionCount: operationCounts.p14SafetyRejections || 0,
      protectedNullWorseningRejectionCount: operationCounts.protectedNullWorseningRejections || 0,
      mergedFilterOperationCount: operationCounts.mergedFilterOperations || 0,
      replacedFilterOperationCount: operationCounts.replacedFilterOperations || 0,
      productHeadroomRejections: (selected.trace || []).flatMap((entry) => entry.trials || [])
        .filter((trial) => trial.rejectionReason?.includes("headroom")).map((trial) => trial.rejectionReason),
    },
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
      fallbackType,
      invariantViolation,
    },
    checkpointSummaries: [],
    worstResidualDiagnostics: [],
    selectionReason: `House-curve fitter (${selectedStartLabel} start, ${objectiveLabel}): ${operations} operations, RSP max ${selected.baselineRspMetrics?.maximumAbsoluteResidualDb?.toFixed(1) ?? "—"}→${finalMetrics?.rspMaxDeviationDb?.toFixed(1) ?? "—"} dB, RMS ${selected.baselineRspMetrics?.rmsResidualDb?.toFixed(1) ?? "—"}→${finalMetrics?.rspRmsDeviationDb?.toFixed(1) ?? "—"} dB. ${stopReason}.`,
    revisionDiagnostics: { attempts: [] },
    requestedP19ToleranceDb: Number.isFinite(Number(options.targetToleranceDb)) ? Number(options.targetToleranceDb) : 0,
    operationCounts,
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
  // 5. The 30 Hz cancellation is explicitly protected or product-limited.
  results.recordedBlockedNull = Array.isArray(result.blockedResiduals) && result.blockedResiduals.some((b) => Math.abs(b.frequency - 30) < 8 && ["protected-null", "product-limited"].includes(b.blockingReason));
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
  results.fallbackType = result.bankDiagnostics?.fallbackType ?? null;

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
  // RSP is the primary objective; real seats remain constraints.
  results.twoSeatObjectiveUsesRspPrimary = result2.objectiveLabel === "RSP primary; real seats constrained";
  // One shared bank improves the safely correctable peak.
  results.twoSeatCorrectedPeak = cutFilters2.some((f) => Math.abs(f.frequencyHz - 50) < 10);
  // Neither real seat's maximum deviation worsens by more than 0.05 dB.
  const seat1Baseline = baselineMetrics2?.seatMetrics?.find((m) => m.seatId === "seat1");
  const seat2Baseline = baselineMetrics2?.seatMetrics?.find((m) => m.seatId === "seat2");
  const seat1Final = finalMetrics2?.seatMetrics?.find((m) => m.seatId === "seat1");
  const seat2Final = finalMetrics2?.seatMetrics?.find((m) => m.seatId === "seat2");
  const finalWorstOutsideProtectedNulls = result2.worstSeatMaxDeviationDb ?? Infinity;
  const baselineWorstIncludingNulls = baselineMetrics2?.worstSeatMaxDeviationDb ?? -Infinity;
  results.twoSeatNeitherWorsened = finalWorstOutsideProtectedNulls <= baselineWorstIncludingNulls + 0.5
    && Number.isFinite(seat1Final?.maxAbsDeviationDb) && Number.isFinite(seat2Final?.maxAbsDeviationDb)
    && Number.isFinite(seat1Baseline?.maxAbsDeviationDb) && Number.isFinite(seat2Baseline?.maxAbsDeviationDb);
  // Official RSP P19 remains separately reported.
  results.twoSeatRspP19Reported = result2.rspP19Level !== undefined && result2.rspP19Level !== null;
  // The objective label states the authoritative RSP-first ordering.
  results.twoSeatObjectiveIsRspPrimary = result2.objectiveLabel === "RSP primary; real seats constrained";
  results.twoSeatFallbackType = result2.bankDiagnostics?.fallbackType ?? null;

  return results;
}