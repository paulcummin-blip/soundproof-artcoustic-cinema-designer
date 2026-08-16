import { buildHouseCurveAccuracyReference } from "@/components/utils/houseCurveAccuracyFixtures";
import { generateCandidatePool, selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { deriveRequestedCalibrationConfig } from "./requestedCalibrationConfig";
import { BassBackgroundAnalysisController } from "./bassBackgroundAnalysisStore";
import { validateCachedBassResult } from "./bassResultAuthority";
import { BASS_OPTIMISER_VERSIONS, createCompleteMessage } from "./bassOptimiserWorkerProtocol";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";
import { buildBassGraphSeries } from "./bassGraphDomainBuilder";
import { buildFinalOptimisedBassResponse } from "./finalOptimisedBassResponse";

class FixtureClock {
  constructor() { this.time = 0; this.jobs = []; }
  now = () => this.time;
  setTimer = (fn, delay) => { const job = { fn, at: this.time + delay, cancelled: false }; this.jobs.push(job); return job; };
  clearTimer = (job) => { if (job) job.cancelled = true; };
  tick(ms) { this.time += ms; this.jobs.filter((job) => !job.cancelled && job.at <= this.time).forEach((job) => { job.cancelled = true; job.fn(); }); }
}

class ProductionFixtureWorker {
  constructor(registry) { this.terminated = false; registry.push(this); }
  postMessage(message) { this.request = message; }
  terminate() { this.terminated = true; }
  complete(pool) {
    this.onmessage?.({ data: createCompleteMessage(
      this.request.requestId,
      this.request.fingerprint,
      pool,
      { ...this.request.identity, ...BASS_OPTIMISER_VERSIONS, poolId: pool.poolId },
      this.request.diagnosticToken,
      this.request.collectDiagnostics,
    ) });
  }
}

export function runFourSeatBassLifecycleFixture() {
  const { rawCurve, perSeatRawCurves } = buildHouseCurveAccuracyReference();
  const splConfig = { globalPowerW: 500, globalEqHeadroomDb: 6, radiationMode: "half_space" };
  const requested = deriveRequestedCalibrationConfig({
    splConfig,
    optimisationTransitionHz: 120,
    designEqSystemLimits: { usableLfHz: 20 },
  });
  const stages = [];
  const startedAt = performance.now();
  const pool = generateCandidatePool({
    rawCurve,
    perSeatRawCurves,
    activeSubs: [{ modelKey: "SUB2-12" }, { modelKey: "SUB2-12" }],
    usableLfHz: 20,
    transitionHz: 120,
    selectedP14TargetDb: requested.selectedP14TargetDb,
    p14TargetBasis: requested.p14TargetBasis,
    p14TargetLevel: requested.requestedLevel,
    onProgress: (progress) => stages.push(progress.phase),
  });

  const clock = new FixtureClock();
  const workers = [];
  const fingerprint = "four-seat-production-no-global-target";
  const identity = { ...BASS_OPTIMISER_VERSIONS, fingerprint, calibrationFingerprint: fingerprint, canonicalPriorityMode: "all-canonical-priorities" };
  const controller = new BassBackgroundAnalysisController({
    workerFactory: () => new ProductionFixtureWorker(workers),
    debounceMs: 1,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  controller.updateInputs({ valid: true, fingerprint, payload: { rawCurve, perSeatRawCurves, activeSubs: [{ modelKey: "SUB2-12" }, { modelKey: "SUB2-12" }], selectedP14TargetDb: requested.selectedP14TargetDb, p14TargetBasis: requested.p14TargetBasis, p14TargetLevel: requested.requestedLevel }, identity });
  clock.tick(1);
  workers[0].complete(pool);
  const lifecycle = controller.getSnapshot();
  const validation = validateCachedBassResult(lifecycle.result, { fingerprint });
  const profileCounts = pool.candidates.reduce((counts, candidate) => ({ ...counts, [candidate.designEqFitProfile]: (counts[candidate.designEqFitProfile] || 0) + 1 }), {});
  const workersBeforeRerank = workers.length;
  const selected = selectCandidateFromPool(pool);
  selectCandidateFromPool(pool);
  const invalidPool = generateCandidatePool({ rawCurve: [], activeSubs: [{ modelKey: "SUB2-12" }] });
  const invalidFingerprint = "four-seat-invalid-input-reporting";
  const invalidValidation = validateCachedBassResult({
    ...BASS_OPTIMISER_VERSIONS,
    fingerprint: invalidFingerprint,
    identity: { ...BASS_OPTIMISER_VERSIONS, fingerprint: invalidFingerprint },
    pool: invalidPool,
  }, { fingerprint: invalidFingerprint });
  const candidate = selected.selectedCandidate;
  const finalOptimisedBassResponse = buildFinalOptimisedBassResponse({ optimisationResult: selected });
  const graphOptimisationResult = {
    ...selected,
    selectedP14TargetDb: requested.selectedP14TargetDb,
    finalOptimisedBassResponse,
  };
  const enabledFilters = (candidate?.generatedFilterBank || []).filter((filter) => filter.enabled);
  const canonicalTargets = new Set(pool.candidates.map((entry) => JSON.stringify(entry.productionHouseCurveTarget)));
  const targetValues = Object.fromEntries([20, 30, 40, 80, 120, 200].map((frequency) => [frequency, interpolateCanonicalTarget(candidate?.productionHouseCurveTarget, frequency)]));
  const exactGraphAuthority = candidate?.finalPostEqCurve?.every((point, index) => {
    const operating = candidate.requestedPreEqOperatingCurve[index];
    const correction = candidate.combinedEqCurve[index];
    return operating?.frequency === point.frequency && correction?.frequency === point.frequency
      && Math.abs(point.spl - (operating.spl + correction.spl)) < 1e-9;
  });
  const correctionValues = candidate?.combinedEqCurve?.map((point) => point.spl) || [];
  const graphSeries = buildBassGraphSeries({
    designEqEnabled: true,
    showHouseCurve: true,
    rspRawCurve: rawCurve,
    optimisationResult: graphOptimisationResult,
    hasMatchingDetailedResult: true,
    smoothingMode: "none",
  });
  const graphRaw = graphSeries.find((series) => series.kind === "raw")?.data;
  const graphPostEq = graphSeries.find((series) => series.kind === "post-eq")?.data;
  const graphTarget = graphSeries.find((series) => series.kind === "house-curve")?.data;
  const graphSeriesAuthorityExact = JSON.stringify(graphRaw) === JSON.stringify(rawCurve)
    && JSON.stringify(graphPostEq) === JSON.stringify(finalOptimisedBassResponse?.postEqRspCurve)
    && JSON.stringify(graphTarget) === JSON.stringify(candidate?.productionHouseCurveTarget);
  const residualMagnitudeAt = (curve, frequency) => Math.abs(
    interpolateCanonicalTarget(curve, frequency) - interpolateCanonicalTarget(candidate.productionHouseCurveTarget, frequency)
  );
  const markerImprovements = Object.fromEntries([78, 100, 120].map((frequency) => [frequency,
    residualMagnitudeAt(rawCurve, frequency) - residualMagnitudeAt(candidate.finalPostEqCurve, frequency)
  ]));
  const correctionAtFrequencies = Object.fromEntries([34, 40, 78, 100, 120].map((frequency) => [
    frequency, interpolateCanonicalTarget(candidate?.combinedEqCurve, frequency),
  ]));
  const correctionAt40Hz = correctionAtFrequencies[40];
  const remainingResidual = candidate?.houseCurveDiagnostics?.remainingWorstCorrectableResidual ?? null;
  const permittedLimitProven = ["cut-limited", "boost-limited", "product-limited", "high-resolution-conflict-limited"].includes(remainingResidual?.limitingClassification)
    && Number.isFinite(remainingResidual?.frequencyHz)
    && Number.isFinite(remainingResidual?.signedResidualDb)
    && Number.isFinite(remainingResidual?.requiredCorrectionDb)
    && Number.isFinite(remainingResidual?.appliedCorrectionDb)
    && (remainingResidual?.limitingClassification !== "high-resolution-conflict-limited"
      || (Number.isFinite(remainingResidual?.highResolutionResidualDb)
        && Number.isFinite(remainingResidual?.nearestProtectedBoundaryDistanceHz)
        && Number.isFinite(remainingResidual?.remainingAggregateCutHeadroomDb)
        && remainingResidual?.maximumLegalFilterQ === 10
        && remainingResidual?.enabledFilterCount <= 10))
    && !!remainingResidual?.anotherLegalFilterRejectedBecause;
  const elapsedMs = performance.now() - startedAt;
  const checks = [
    ["Production P14 intent is explicit and not taken from targetSpl", !("targetSpl" in splConfig) && requested.selectedP14TargetDb === 118 && requested.p14TargetBasis === "minimum"],
    ["Four real seats are evaluated", pool.performanceSummary?.seatCount === 4],
    ["Canonical pool generation completes", pool.generationStatus === "complete"],
    ["Pool contains the four canonical candidates", pool.generatedCandidateCount === 4 && pool.candidates.length === 4 && pool.selectablePool.length === 4],
    ["Pool contains one Standard, Accuracy, House-curve and Identity candidate", profileCounts.standard === 1 && profileCounts.accuracy === 1 && profileCounts.house_curve === 1 && profileCounts.identity === 1],
    ["Every candidate carries the identical fixed canonical target", canonicalTargets.size === 1],
    ["P14-normalised target is in the expected fixed range", targetValues[20] >= 112 && targetValues[20] <= 114 && targetValues[200] >= 107 && targetValues[200] <= 109 && targetValues[20] > targetValues[200]],
    ["Selected candidate is physically bank-valid", !!candidate && candidate.bankValidationResult?.allOk === true && candidate.physicalEqAuthorityPassed !== false],
    ["Final curve equals operating response plus selected correction", exactGraphAuthority],
    ["Final response preserves selected candidate identity", finalOptimisedBassResponse?.selectedCandidateId === selected.selectedCandidateId && finalOptimisedBassResponse?.filterBankSignature === selected.filterBankSignature],
    ["Graph series exactly match selected authority", graphSeriesAuthorityExact],
    ["34 Hz peak receives a material cut", interpolateCanonicalTarget(candidate?.combinedEqCurve, 34) <= -5],
    ["Ordinary 78, 100 and 120 Hz peaks move toward target", Object.values(markerImprovements).every((improvement) => improvement > 0.05)],
    ["Protected 40 Hz null receives no positive boost", correctionAt40Hz <= 0.25],
    ["Aggregate correction stays within -15/+6 dB", Math.min(...correctionValues) >= -15.05 && Math.max(...correctionValues) <= 6.05],
    ["P19 assessment and correction domains remain distinct", candidate?.assessmentStartHz === 20 && candidate?.assessmentEndHz === 120 && candidate?.correctionStartHz === 20 && candidate?.correctionEndHz === 200],
    ["Any remaining residual limitation retains explicit proof", !remainingResidual || permittedLimitProven],
    ["Enabled filter count stays within ten", enabledFilters.length <= 10],
    ["Enabled bank materially changes the final curve", enabledFilters.length > 0 && correctionValues.some((value) => Math.abs(value) >= 0.5)],
    ["Completed pool passes result validation", validation.valid],
    ["Invalid pool reports exact missing input", invalidValidation.reason === "candidate-pool-invalid-inputs" && invalidValidation.message.includes("rawCurve")],
    ["Lifecycle reaches ready complete without replacement", lifecycle.status === "ready" && lifecycle.terminalOutcome === "complete" && lifecycle.replacementRunCount === 0],
    ["Canonical selection completed", !!selected.selectedCandidate && selected.selectedMode === "balanced"],
    ["Selection reuse does not restart the worker", workers.length === workersBeforeRerank && workers.length === 1],
    ["Canonical fitter progress is reported", stages.includes("Canonical target aligned") && stages.includes("Canonical standard fit complete") && stages.includes("Canonical accuracy fit complete") && stages.includes("Canonical house-curve fit complete")],
  ].map(([name, passed]) => ({ name, passed: !!passed }));
  return {
    checks,
    passed: checks.filter((check) => check.passed).length,
    total: checks.length,
    allPassed: checks.every((check) => check.passed),
    elapsedMs,
    candidateCounts: { total: pool.candidates.length, standard: profileCounts.standard || 0, accuracy: profileCounts.accuracy || 0, houseCurve: profileCounts.house_curve || 0, identity: profileCounts.identity || 0 },
    workerRequests: workers.length,
    replacementRuns: lifecycle.replacementRunCount,
    lastStage: stages.at(-1) || null,
    poolId: pool.poolId,
    validation,
    numericalReport: {
      selectedP14TargetDb: requested.selectedP14TargetDb,
      targetValues,
      correctableResidual: {
        preMaximumDb: candidate?.houseCurveDiagnostics?.preRsp?.maximumAbsoluteResidualDb ?? null,
        postMaximumDb: candidate?.houseCurveDiagnostics?.postRsp?.maximumAbsoluteResidualDb ?? null,
        preRmsDb: candidate?.houseCurveDiagnostics?.preRsp?.rmsResidualDb ?? null,
        postRmsDb: candidate?.houseCurveDiagnostics?.postRsp?.rmsResidualDb ?? null,
      },
      officialP19VariationDb: candidate?.officialP19VariationDb ?? null,
      correctableP19VariationDb: candidate?.correctableP19VariationDb ?? null,
      protectedNullRegions: candidate?.protectedNullRegions ?? [],
      selectedFilters: enabledFilters,
      aggregateMaximumCutDb: Math.min(0, ...correctionValues),
      aggregateMaximumBoostDb: Math.max(0, ...correctionValues),
      markerImprovements,
      correctionAtFrequencies,
      correctionAt40Hz,
      remainingWorstCorrectableResidual: remainingResidual,
      assessmentDomainHz: { start: candidate?.assessmentStartHz ?? null, end: candidate?.assessmentEndHz ?? null },
      fitDomainHz: { start: candidate?.fitStartHz ?? null, end: candidate?.fitEndHz ?? null },
      correctionDomainHz: { start: candidate?.correctionStartHz ?? null, end: candidate?.correctionEndHz ?? null },
      enabledFilterCount: enabledFilters.length,
      upperFitBandImprovement: candidate?.houseCurveDiagnostics?.upperFitBandImprovement ?? null,
      gates: {
        selectedBankValid: candidate?.bankValidationResult?.allOk === true,
        assessmentDomain: candidate?.assessmentStartHz === 20 && candidate?.assessmentEndHz === 120,
        correctionDomain: candidate?.correctionStartHz === 20 && candidate?.correctionEndHz === 200,
        enabledFilterCount: enabledFilters.length <= 10,
        aggregateCutDb: Math.min(0, ...correctionValues) >= -15.05,
        aggregateBoostDb: Math.max(0, ...correctionValues) <= 6.05,
        finalResponseIdentity: finalOptimisedBassResponse?.selectedCandidateId === selected.selectedCandidateId,
      },
      graphAuthorityExact: exactGraphAuthority && graphSeriesAuthorityExact,
      rawSeriesExact: JSON.stringify(graphRaw) === JSON.stringify(rawCurve),
      postEqSeriesExact: JSON.stringify(graphPostEq) === JSON.stringify(finalOptimisedBassResponse?.postEqRspCurve),
      targetSeriesExact: JSON.stringify(graphTarget) === JSON.stringify(candidate?.productionHouseCurveTarget),
    },
  };
}