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
import { buildFilterDecisionDiagnostics, classifyEqCorrectionRegion, findAggregatePeakBoostViolations, validatePhysicalEqAction } from "@/components/utils/designEqPhysicsAuthority";

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
  const profile = { ...DESIGN_EQ_FIT_PROFILES.accuracy, id: "house_curve", preserveP14: false, maximumCutDb: 15 };
  const bankRaw = rspRaw;
  const protectedNullRegions = Array.isArray(options.protectedNullRegions)
    ? options.protectedNullRegions
    : identifyProtectedNullRegions(
        rspRaw, correctionStartHz, correctionEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, canonicalTargetCurve,
      );

  const standardSeedFilters = Array.isArray(options.initialFilters)
    ? options.initialFilters
        .filter((f) => f && f.enabled && Number.isFinite(f.frequencyHz) && f.frequencyHz > 0 && Number.isFinite(f.gainDb) && Number.isFinite(f.Q) && f.Q > 0)
        .filter((filter) => {
          const frequency = Number(filter.frequencyHz);
          const rawPoint = rspRaw.reduce((nearest, point) => Math.abs(point.frequency - frequency) < Math.abs(nearest.frequency - frequency) ? point : nearest);
          const targetSpl = interpolateCanonicalTarget(canonicalTargetCurve, frequency) ?? (anchorDb + artcousticHouseCurveOffsetAt(frequency));
          const authority = classifyEqCorrectionRegion({
            frequency, rawSpl: rawPoint?.spl, currentSpl: rawPoint?.spl, targetSpl,
            protectedNull: protectedNullRegions.some((region) => frequency >= region.startHz && frequency <= region.endHz),
            requestedGainDb: filter.gainDb,
          });
          return validatePhysicalEqAction(authority.classification, filter.gainDb).passed;
        })
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
  if (startB !== startA && startB.metrics && startA.metrics) {
    const acousticComparatorPrefersB = compareHouseCurveMetrics(startB.metrics, startA.metrics) < 0;
    if (acousticComparatorPrefersB) {
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
  const correctableP19FromFitMetrics = (metrics) => {
    const points = (metrics?.rspResidualPoints || []).filter((point) => point.frequency >= assessmentStartHz
      && point.frequency <= assessmentEndHz
      && !protectedNullRegions.some((region) => point.frequency >= region.startHz && point.frequency <= region.endHz));
    return points.length ? Math.max(...points.map((point) => Math.abs(point.deviationDb))) : null;
  };
  for (let refinementPass = 0; refinementPass < 2; refinementPass++) {
    if (correctableP19FromFitMetrics(finalMetrics) <= profile.fittingToleranceDb) break;
    const pairedRefinement = refineOpposingResidualPair({
      filters, metrics: finalMetrics, seatBaselineMetrics: pairedSeatBaselineMetrics,
      seats: objectiveSeats, bankRaw, fitStartHz, fitEndHz, anchorDb, activeSubs, usableLfHz,
      requestedSystemOutputDb, profile, protectedNullRegions, canonicalTargetCurve,
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
  const remainingProductBoostDb = Number.isFinite(requiredCorrectionAtWorstDb) && requiredCorrectionAtWorstDb > 0
    ? Math.max(0, 6 - Math.max(0, appliedCorrectionAtWorstDb || 0))
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
    productLimited: false,
    filterCountLimited: remainingResidualLimit === "filter-count-limited",
    highResolutionConflictLimited: remainingResidualLimit === "high-resolution-conflict-limited",
    highResolutionResidualDb: highResolutionResidualAtWorstDb,
    highResolutionRequiredCorrectionDb: Number.isFinite(highResolutionResidualAtWorstDb) ? -highResolutionResidualAtWorstDb : null,
    nearestProtectedBoundaryDistanceHz,
    maximumLegalFilterQ: 10,
    enabledFilterCount: filters.filter((filter) => filter.enabled).length,
    maximumPermittedTotalBoostDb: 6,
    remainingBoostDb: remainingProductBoostDb,
    remainingAggregateCutHeadroomDb,
    anotherLegalFilterRejectedBecause: remainingResidualLimit === "cut-limited"
      ? `required additional cut ${Math.abs(requiredCorrectionAtWorstDb).toFixed(3)} dB exceeds remaining aggregate cut headroom ${remainingAggregateCutHeadroomDb.toFixed(3)} dB`
      : remainingResidualLimit === "high-resolution-conflict-limited"
        ? `1/3-octave residual ${signedResidualDb.toFixed(3)} dB requires ${requiredCorrectionAtWorstDb.toFixed(3)} dB, but the high-resolution residual is ${highResolutionResidualAtWorstDb.toFixed(3)} dB and requires ${(-highResolutionResidualAtWorstDb).toFixed(3)} dB; opposite correction signs at ${nearestProtectedBoundaryDistanceHz.toFixed(3)} Hz from a protected-null boundary, with ${remainingAggregateCutHeadroomDb.toFixed(3)} dB aggregate cut headroom, Q ≤ 10 and ${filters.filter((filter) => filter.enabled).length}/10 filters enabled`
        : nearestRejectedTrials.at(-1)?.rejectionReason ?? stopReason,
  };
  const candidateDecision = (trial) => ({
    filterFrequencyHz: trial.frequencyHz,
    gainDb: trial.gainDb,
    Q: trial.Q,
    classification: trial.regionClassification,
    beforeEqSpl: trial.beforeEqSpl,
    targetSpl: trial.targetSpl,
    expectedAction: trial.expectedAction,
    actualAction: trial.actualAction,
    rspImprovementDb: trial.rspImprovementDb,
    seatImpact: trial.seatImpact,
    capabilityPenaltyDb: trial.incrementalCapabilityPenaltyCostDb ?? trial.capabilityPenaltyCostDb,
    decision: trial.acceptedAfterSeatToleranceAdjustment ? "accepted after tolerance adjustment" : trial.accepted ? "accepted" : "rejected",
    rejectionReason: trial.rejectionReason,
  });
  const evaluatedEqCandidates = (selected.trace || []).flatMap((entry) => entry.trials || []);
  const rejectedEqCandidates = evaluatedEqCandidates.filter((trial) => !trial.accepted).map(candidateDecision);
  const filterDecisionDiagnostics = buildFilterDecisionDiagnostics(
    filters, rspRaw, curve, canonicalTargetCurve, protectedNullRegions,
  );
  const physicalAuthorityViolations = findAggregatePeakBoostViolations(rspRaw, curve, canonicalTargetCurve);
  const seatToleranceAdjustedCandidates = evaluatedEqCandidates
    .filter((trial) => trial.acceptedAfterSeatToleranceAdjustment)
    .map(candidateDecision);

  return {
    filters: emptyFilters(filters),
    curve,
    combinedEqCurve,
    fitterHouseCurveTarget: canonicalTargetCurve.map((point) => ({ ...point })),
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
    filterDecisionDiagnostics,
    physicalEqAuthorityPassed: physicalAuthorityViolations.length === 0,
    physicalAuthorityViolations,
    rejectedEqCandidates,
    seatToleranceAdjustedCandidates,
    seatRegressionToleranceDiagnostics: selected.seatRegressionToleranceDiagnostics,
    lfCapabilityProtection: null,
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
      p14SafetyRejectionCount: 0,
      protectedNullWorseningRejectionCount: operationCounts.protectedNullWorseningRejections || 0,
      mergedFilterOperationCount: operationCounts.mergedFilterOperations || 0,
      replacedFilterOperationCount: operationCounts.replacedFilterOperations || 0,
      productHeadroomRejections: [],
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