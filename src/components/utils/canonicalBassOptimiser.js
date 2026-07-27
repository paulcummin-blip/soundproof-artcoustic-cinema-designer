import { calculateDesignEqCurve, DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import { calculateHouseCurveEqCurve } from "@/components/utils/houseCurveFitter";
import { calculateAllSeatMetricsFromCorrected } from "@/components/utils/houseCurveFitterCore";
import { annotateCandidatePoolForHouseCurveRanking } from "@/components/utils/houseCurveCandidateRankingMetrics";
import { isPhysicallyCredibleBassCandidate } from "@/components/utils/bassCandidatePoolEligibility";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { buildCurveSignature, buildFilterBankSignature, stampPoolAuthority } from "@/components/room/bass/bassResultAuthority";
import { BASS_OPTIMISER_POOL_VERSION } from "@/components/room/bass/bassOptimiserWorkerProtocol";
import {
  buildCanonicalAbsoluteHouseCurveTarget,
  deriveProductionEqVerticalAnchor,
  resolveHouseCurveDomains,
} from "@/components/utils/houseCurveTargetAuthority";
import { identifyProtectedNullRegions } from "@/components/utils/houseCurveFitProtection";
import { normaliseHouseCurveToP14Total, requiredP14ExtensionHz } from "@/components/utils/p14HouseCurveNormalisation";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { getCurrentSystemSourceOutput } from "@/components/utils/subwooferCapability";

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
  selectedP14TargetDb = 109, p14TargetBasis = "minimum", p14TargetLevel = 1,
} = {}) {
  const missingInputs = [!rawCurve.length && "rawCurve", !activeSubs.length && "activeSubs"].filter(Boolean);
  if (missingInputs.length) return stampPoolAuthority({
    poolVersion: BASS_OPTIMISER_POOL_VERSION, candidates: [], selectablePool: [], poolId: null,
    generatedCandidateCount: 0, physicallyCredibleCount: 0, generationStatus: "invalid-inputs", missingInputs,
    warningMessage: `Missing mandatory optimiser input${missingInputs.length > 1 ? "s" : ""}: ${missingInputs.join(", ")}`,
  });

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const domains = resolveHouseCurveDomains(rawCurve.map((point) => point.frequency), correctionEndHz);

  // ── Fixed house target: P14-normalised global vertical offset ──
  // The Artcoustic house-curve shape is shifted vertically by exactly one
  // global offset so that the complete applicable curve C-weighted power-sums
  // to the selected P14 target (e.g. 109 dBC for Minimum L1). This offset is
  // computed once and never changes during fitting — it is not moved by the
  // product model, subwoofer quantity, available headroom, current response
  // shape, P18/P19 results, or fitter failure.
  const houseCurveShape = [15, 20, 25, 31.5, 40, 50, 63, 80, 100, 120, 150, 200, 400]
    .map((f) => ({ frequency: f, offsetDb: artcousticHouseCurveOffsetAt(f) }));
  const requiredExtensionHz = requiredP14ExtensionHz(p14TargetBasis, p14TargetLevel);
  const p14Normalisation = normaliseHouseCurveToP14Total({
    houseCurveShape,
    selectedP14TargetDb: Number(selectedP14TargetDb),
    requiredExtensionHz,
    upperLfeHz: 120,
  });
  let verticalOffsetDb = p14Normalisation?.operatingCurveOffsetDb;
  if (!Number.isFinite(verticalOffsetDb)) {
    // Fallback: response-anchored offset (existing approved authority).
    verticalOffsetDb = deriveProductionEqVerticalAnchor(rawCurve);
  }
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
  // Resolve the requested source-domain output from the existing approved product
  // authority. This is the LFE output level the headroom calculation subtracts
  // from the manufacturer capability curve. Falls back to 114 dB when no tuning
  // is configured on the sub objects.
  const requestedSystemOutputDb = getCurrentSystemSourceOutput(activeSubs);
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
    requestedSystemOutputDb,
  });
  const eqResults = [];
  const standardEq = calculateDesignEqCurve(rawCurve, usableLfHz, activeSubs, fitOptions("standard"));
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
  const accuracyEq = calculateDesignEqCurve(rawCurve, usableLfHz, activeSubs, fitOptions("accuracy", seed));
  eqResults.push(accuracyEq);
  completedTasks += 1;
  report("Canonical accuracy fit complete");
  const houseEq = calculateHouseCurveEqCurve(rawCurve, seats, usableLfHz, activeSubs, {
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
  const __canonicalTrace__ = {
    receivedCollectDiagnostics: collectDiagnostics,
    profiles: eqResults.map((eq, i) => {
      const candidate = candidates[i];
      const eqTrace = eq.__designEqTrace__ || {};
      return {
        profile: eq.designEqFitProfile || (i === 0 ? "standard" : i === 1 ? "accuracy" : "house_curve"),
        inputCollectDiagnostics: eqTrace.inputCollectDiagnostics ?? null,
        detectedRegionCount: eqTrace.detectedRegionCount ?? null,
        appendTrialCount: eqTrace.appendTrialCount ?? null,
        revisionTrialCount: eqTrace.revisionTrialCount ?? null,
        candidateAcceptanceDiagnosticsCount: eqTrace.candidateAcceptanceDiagnosticsCount ?? null,
        finalEnabledFilterCount: (eq.filters || []).filter((f) => f.enabled).length,
        finalFilterBankSignature: buildFilterBankSignature({ generatedFilterBank: eq.filters }),
        stopReason: eqTrace.stopReason ?? eq.stopReason ?? null,
        designEqCandidateAcceptanceDiagnosticsCountAfterMapping: Array.isArray(candidate?.designEqCandidateAcceptanceDiagnostics)
          ? candidate.designEqCandidateAcceptanceDiagnostics.length : null,
      };
    }),
  };
  const selectablePool = candidates.filter(isPhysicallyCredibleBassCandidate);
  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const poolId = `canonical:${buildCurveSignature(rawCurve)}:${activeSubs.length}:${seats.length}:${verticalOffsetDb.toFixed(4)}`;
  // Mark diagnosticsIncluded: true ONLY when collectDiagnostics was requested
  // AND the real production candidates actually carry acceptance diagnostic
  // arrays. This is a cache-capability flag — it never changes EQ behaviour,
  // ranking, targets, filters, or P14/P18/P19/P20.
  const diagnosticsIncluded = !!collectDiagnostics && candidates.some((candidate) =>
    Array.isArray(candidate?.designEqCandidateAcceptanceDiagnostics)
    && candidate.designEqCandidateAcceptanceDiagnostics.length > 0
  );
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
    diagnosticsIncluded,
    __canonicalTrace__,
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