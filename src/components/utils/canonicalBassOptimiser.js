import { calculateDesignEqCurve, DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import { calculateHouseCurveEqCurve } from "@/components/utils/houseCurveFitter";
import { calculateAllSeatMetricsFromCorrected } from "@/components/utils/houseCurveFitterCore";
import { annotateCandidatePoolForHouseCurveRanking } from "@/components/utils/houseCurveCandidateRankingMetrics";
import { isPhysicallyCredibleBassCandidate } from "@/components/utils/bassCandidatePoolEligibility";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { buildCurveSignature, stampPoolAuthority } from "@/components/room/bass/bassResultAuthority";
import { BASS_OPTIMISER_POOL_VERSION } from "@/components/room/bass/bassOptimiserWorkerProtocol";
import {
  buildCanonicalAbsoluteHouseCurveTarget,
  deriveProductionEqVerticalAnchor,
  resolveHouseCurveDomains,
} from "@/components/utils/houseCurveTargetAuthority";
import { identifyProtectedNullRegions } from "@/components/utils/houseCurveFitProtection";

const FIT_PROFILES = [DESIGN_EQ_FIT_PROFILES.standard, DESIGN_EQ_FIT_PROFILES.accuracy];

function interpolateCorrection(curve, frequency) {
  if (!Array.isArray(curve) || !curve.length) return 0;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve.at(-1).frequency) return curve.at(-1).spl;
  const upperIndex = curve.findIndex((point) => point.frequency >= frequency);
  const low = curve[upperIndex - 1];
  const high = curve[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}

function applyBankToSeats(seats, correction) {
  return (Array.isArray(seats) ? seats : []).filter((seat) => seat?.seatId !== "rsp" && Array.isArray(seat?.responseData))
    .map((seat) => ({
      seatId: seat.seatId,
      isPrimary: !!seat.isPrimary,
      responseData: seat.responseData.map((point) => ({
        frequency: point.frequency,
        spl: point.spl + interpolateCorrection(correction, point.frequency),
      })),
    }));
}

function bankLimits(eq) {
  const limits = eq.designEqFitProfile === "house_curve" ? eq.bankLimits : eq.bankDiagnostics?.selectedBankLimits;
  return {
    maxAggregateBoostDb: limits?.maxAggregateBoostDb ?? null,
    maxAggregateBoostHz: limits?.maxAggregateBoostHz ?? null,
    maxAggregateCutDb: limits?.maxAggregateCutDb ?? null,
    maxAggregateCutHz: limits?.maxAggregateCutHz ?? null,
    boostLimitOk: limits?.boostLimitOk ?? null,
    cutLimitOk: limits?.cutLimitOk ?? null,
    sourceDomainHeadroomOk: limits?.sourceDomainHeadroomOk ?? null,
    allOk: limits?.allOk ?? eq.bankValidationPassed ?? null,
  };
}

function buildCanonicalCandidate({ rawCurve, perSeatRawCurves, eq, domains, targetCurve, targetShape, verticalOffsetDb, protectedNullRegions }) {
  const perSeatPostEqCurves = applyBankToSeats(perSeatRawCurves, eq.combinedEqCurve);
  const seatsForMetrics = perSeatPostEqCurves.length
    ? perSeatPostEqCurves
    : [{ seatId: "rsp", isPrimary: true, responseData: eq.curve }];
  const seatMetrics = calculateAllSeatMetricsFromCorrected(
    seatsForMetrics,
    domains.p19StartHz,
    domains.p19EndHz,
    verticalOffsetDb,
    targetCurve,
  );
  const limits = bankLimits(eq);
  const positiveEqDemandCurve = (eq.combinedEqCurve || []).map((point) => ({
    frequency: point.frequency,
    demandDb: Math.max(0, Number(point.spl) || 0),
  }));
  const smoothed = applyBassSmoothing(eq.curve || [], "third")
    .filter((point) => point.frequency >= domains.correctionStartHz && point.frequency <= domains.correctionEndHz);
  return {
    canonical: true,
    designEqFitProfile: eq.designEqFitProfile || "standard",
    designEqFitProfileConfig: eq.designEqFitProfileConfig || null,
    startStrategy: eq.designEqFitProfile === "house_curve" ? "multi-start" : "single",
    selectedStart: eq.selectedStart ?? null,
    rawResponseCurve: rawCurve.map((point) => ({ ...point })),
    rawResponseSignature: buildCurveSignature(rawCurve),
    generatedFilterBank: eq.filters || [],
    finalPostEqCurve: eq.curve || [],
    combinedEqCurve: eq.combinedEqCurve || [],
    perSeatPostEqCurves,
    productionHouseCurveTarget: targetCurve.map((point) => ({ ...point })),
    fitterHouseCurveTarget: (eq.fitterHouseCurveTarget || targetCurve).map((point) => ({ ...point })),
    canonicalHouseCurveShape: targetShape.map((point) => ({ ...point })),
    canonicalVerticalOffsetDb: verticalOffsetDb,
    positiveEqDemandCurve,
    protectedNullRegions: protectedNullRegions.map((region) => ({ ...region })),
    assessmentStartHz: domains.p19StartHz,
    assessmentEndHz: domains.p19EndHz,
    correctionStartHz: domains.correctionStartHz,
    correctionEndHz: domains.correctionEndHz,
    physicalEqAuthorityPassed: eq.physicalEqAuthorityPassed !== false,
    physicalAuthorityViolations: eq.physicalAuthorityViolations || [],
    bankValidationResult: limits,
    aggregateBankLimits: limits,
    physicalValidation: { passed: eq.physicalEqAuthorityPassed !== false && limits.allOk !== false, bankLimits: limits },
    fitMetrics: {
      maximumResidualDb: eq.rspObjectiveMaxDeviationDb ?? eq.rspMaxDeviationDb ?? eq.selectedCheckpoint?.maximumAbsoluteDeviationDb ?? null,
      rmsResidualDb: eq.rspRmsDeviationDb ?? eq.selectedCheckpoint?.rmsDeviationDb ?? null,
      meanSignedResidualDb: eq.rspMeanSignedResidualDb ?? null,
      shapeRmsResidualDb: eq.rspShapeRmsDeviationDb ?? null,
      smoothedPointCount: smoothed.length,
    },
    worstSeatMaxDeviationDb: seatMetrics?.worstSeatMaxDeviationDb ?? eq.worstSeatMaxDeviationDb ?? null,
    meanSeatMaxDeviationDb: seatMetrics?.meanSeatMaxDeviationDb ?? eq.meanSeatMaxDeviationDb ?? null,
    rmsSeatTargetErrorDb: seatMetrics?.rmsSeatTargetErrorDb ?? eq.rmsSeatTargetErrorDb ?? null,
    perSeatMetrics: seatMetrics?.seatMetrics ?? eq.perSeatMetrics ?? [],
    rspObjectiveMaxDeviationDb: eq.rspObjectiveMaxDeviationDb ?? eq.rspMaxDeviationDb ?? null,
    rspRmsResidualDb: eq.rspRmsDeviationDb ?? eq.selectedCheckpoint?.rmsDeviationDb ?? null,
    rspMeanSignedResidualDb: eq.rspMeanSignedResidualDb ?? null,
    rspMeanAbsoluteResidualDb: null,
    rspShapeRmsResidualDb: eq.rspShapeRmsDeviationDb ?? null,
    designEqIterationTrace: eq.iterationTrace || [],
    designEqDetectedRegions: eq.detectedRegions || [],
    designEqCandidateAcceptanceDiagnostics: eq.candidateAcceptanceDiagnostics || [],
    designEqCandidateSelectionDiagnostics: eq.candidateSelectionDiagnostics || [],
    designEqFilterDecisionDiagnostics: eq.filterDecisionDiagnostics || [],
    rejectedEqCandidates: eq.rejectedEqCandidates || [],
    seatToleranceAdjustedCandidates: eq.seatToleranceAdjustedCandidates || [],
    seatRegressionToleranceDiagnostics: eq.seatRegressionToleranceDiagnostics || null,
    designEqStopReason: eq.stopReason || null,
    designEqSelectionReason: eq.selectionReason || null,
    designEqBankDiagnostics: eq.bankDiagnostics || null,
    houseCurveDiagnostics: eq.houseCurveDiagnostics || null,
  };
}

export function generateCanonicalCandidatePool({
  rawCurve = [], activeSubs = [], usableLfHz = null, transitionHz = 120,
  correctionEndHz = 200, perSeatRawCurves = [], collectDiagnostics = false,
  onProgress = null, reuseExactHouseCurveEvaluations = true,
} = {}) {
  const missingInputs = [!rawCurve.length && "rawCurve", !activeSubs.length && "activeSubs"].filter(Boolean);
  if (missingInputs.length) return stampPoolAuthority({
    poolVersion: BASS_OPTIMISER_POOL_VERSION, candidates: [], selectablePool: [], poolId: null,
    generatedCandidateCount: 0, physicallyCredibleCount: 0, generationStatus: "invalid-inputs", missingInputs,
    warningMessage: `Missing mandatory optimiser input${missingInputs.length > 1 ? "s" : ""}: ${missingInputs.join(", ")}`,
  });

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const domains = resolveHouseCurveDomains(rawCurve.map((point) => point.frequency), correctionEndHz);
  const verticalOffsetDb = deriveProductionEqVerticalAnchor(rawCurve);
  if (!Number.isFinite(verticalOffsetDb)) return stampPoolAuthority({
    poolVersion: BASS_OPTIMISER_POOL_VERSION, candidates: [], selectablePool: [], poolId: null,
    generatedCandidateCount: 0, physicallyCredibleCount: 0, generationStatus: "invalid-anchor",
    missingInputs: ["canonicalVerticalOffsetDb"], warningMessage: "Could not align the house-curve shape to the raw response.",
  });
  const targetCurve = buildCanonicalAbsoluteHouseCurveTarget({
    frequencyGrid: rawCurve.map((point) => point.frequency), targetAnchorDb: verticalOffsetDb,
    correctionStartHz: domains.correctionStartHz, correctionEndHz: domains.correctionEndHz,
  });
  const targetShape = targetCurve.map((point) => ({ frequency: point.frequency, offsetDb: point.spl - verticalOffsetDb }));
  const protectedNullRegions = identifyProtectedNullRegions(
    rawCurve, domains.correctionStartHz, domains.correctionEndHz, verticalOffsetDb,
    activeSubs, usableLfHz, null, targetCurve,
  );
  const seats = (Array.isArray(perSeatRawCurves) ? perSeatRawCurves : [])
    .filter((seat) => Array.isArray(seat?.responseData) && seat.responseData.length);
  const totalTasks = FIT_PROFILES.length + 1;
  let completedTasks = 0;
  const report = (phase) => onProgress?.({ phase, completedTasks, totalTasks, completedRequests: completedTasks, totalRequests: totalTasks });
  report("Canonical target aligned");

  const fitOptions = (profile, initialFilters = []) => ({
    targetAnchorDb: verticalOffsetDb,
    canonicalTargetCurve: targetCurve,
    protectedNullRegions,
    fitProfile: profile,
    assessmentStartHz: domains.correctionStartHz,
    assessmentEndHz: domains.correctionEndHz,
    collectDiagnostics,
    initialFilters,
  });
  const eqResults = [];
  const standardEq = calculateDesignEqCurve(rawCurve, null, [], fitOptions("standard"));
  eqResults.push(standardEq);
  completedTasks += 1;
  report("Canonical standard fit complete");
  // Seed the Accuracy and house-curve fitters from the standard fit's seed
  // checkpoint — a physically valid checkpoint with enabled filters that
  // improves RMS meaningfully without worsening max residual by more than a
  // small tolerance. Falls back to the selected checkpoint filters only if no
  // useful seed field exists. Never forces a seed when none qualified.
  const seedSource = (standardEq.standardSeedFilters && standardEq.standardSeedFilters.length)
    ? standardEq.standardSeedFilters
    : (standardEq.bestSeedFilters && standardEq.bestSeedFilters.length)
      ? standardEq.bestSeedFilters
      : (standardEq.filters || []);
  const seed = seedSource.filter((filter) => filter?.enabled);
  const accuracyEq = calculateDesignEqCurve(rawCurve, null, [], fitOptions("accuracy", seed));
  eqResults.push(accuracyEq);
  completedTasks += 1;
  report("Canonical accuracy fit complete");
  const houseEq = calculateHouseCurveEqCurve(rawCurve, seats, null, [], {
    ...fitOptions("house_curve", seed),
    assessmentStartHz: domains.p19StartHz,
    assessmentEndHz: domains.p19EndHz,
    fitStartHz: domains.correctionStartHz,
    fitEndHz: domains.correctionEndHz,
    correctionStartHz: domains.correctionStartHz,
    correctionEndHz: domains.correctionEndHz,
    reuseExactEvaluations: reuseExactHouseCurveEvaluations,
  });
  eqResults.push(houseEq);
  completedTasks += 1;
  report("Canonical house-curve fit complete");

  const candidates = annotateCandidatePoolForHouseCurveRanking(eqResults.map((eq) => buildCanonicalCandidate({
    rawCurve, perSeatRawCurves: seats, eq, domains, targetCurve, targetShape, verticalOffsetDb, protectedNullRegions,
  })));
  const selectablePool = candidates.filter(isPhysicallyCredibleBassCandidate);
  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const poolId = `canonical:${buildCurveSignature(rawCurve)}:${activeSubs.length}:${seats.length}:${verticalOffsetDb.toFixed(4)}`;
  return stampPoolAuthority({
    poolVersion: BASS_OPTIMISER_POOL_VERSION,
    candidates,
    selectablePool,
    poolId,
    generatedCandidateCount: candidates.length,
    physicallyCredibleCount: selectablePool.length,
    standardFitCount: 1,
    accuracyFitCount: 1,
    houseCurveFitCount: 1,
    generationStatus: "complete",
    missingInputs: [],
    warningMessage: null,
    canonical: true,
    canonicalVerticalOffsetDb: verticalOffsetDb,
    canonicalHouseCurveShape: targetShape,
    canonicalTargetCurve: targetCurve,
    protectedNullRegions,
    transitionHz,
    performanceSummary: {
      totalOptimiserTimeMs: endedAt - startedAt,
      requestCount: 1,
      profileCount: totalTasks,
      candidateBankCount: candidates.length,
      seatCount: seats.length,
    },
  });
}