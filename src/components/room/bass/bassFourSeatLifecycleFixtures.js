import { buildHouseCurveAccuracyReference } from "@/components/utils/houseCurveAccuracyFixtures";
import { generateCandidatePool, selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { deriveRequestedCalibrationConfig } from "./requestedCalibrationConfig";
import { BassBackgroundAnalysisController } from "./bassBackgroundAnalysisStore";
import { validateCachedBassResult } from "./bassResultAuthority";
import { BASS_OPTIMISER_VERSIONS, createCompleteMessage } from "./bassOptimiserWorkerProtocol";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";
import { buildBassGraphSeries } from "./bassGraphDomainBuilder";

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
    targetAnchorDb: requested.requestedTargetAnchorDb,
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
  controller.updateInputs({ valid: true, fingerprint, payload: { rawCurve, perSeatRawCurves, activeSubs: [{ modelKey: "SUB2-12" }, { modelKey: "SUB2-12" }], targetAnchorDb: null }, identity });
  clock.tick(1);
  workers[0].complete(pool);
  const lifecycle = controller.getSnapshot();
  const validation = validateCachedBassResult(lifecycle.result, { fingerprint });
  const profileCounts = pool.candidates.reduce((counts, candidate) => ({ ...counts, [candidate.designEqFitProfile]: (counts[candidate.designEqFitProfile] || 0) + 1 }), {});
  const requestProfiles = new Map();
  pool.candidates.forEach((candidate) => {
    const key = [candidate.requestedP14Level, candidate.requestedP18Level, candidate.requestedP19Level].join("|");
    if (!requestProfiles.has(key)) requestProfiles.set(key, new Set());
    requestProfiles.get(key).add(candidate.designEqFitProfile);
  });
  const workersBeforeRerank = workers.length;
  const selected = selectCandidateFromPool(pool, "house_curve_accuracy");
  selectCandidateFromPool(pool, "depth");
  const invalidPool = generateCandidatePool({ rawCurve: [], activeSubs: [{ modelKey: "SUB2-12" }] });
  const invalidFingerprint = "four-seat-invalid-input-reporting";
  const invalidValidation = validateCachedBassResult({
    ...BASS_OPTIMISER_VERSIONS,
    fingerprint: invalidFingerprint,
    identity: { ...BASS_OPTIMISER_VERSIONS, fingerprint: invalidFingerprint },
    pool: invalidPool,
  }, { fingerprint: invalidFingerprint });
  const candidate = selected.selectedCandidate;
  const enabledFilters = (candidate?.generatedFilterBank || []).filter((filter) => filter.enabled);
  const canonicalTargets = new Set(pool.candidates.map((entry) => JSON.stringify(entry.productionHouseCurveTarget)));
  const targetValues = Object.fromEntries([20, 30, 40, 80, 120, 200].map((frequency) => [frequency, interpolateCanonicalTarget(candidate?.productionHouseCurveTarget, frequency)]));
  const exactGraphAuthority = candidate?.finalPostEqCurve?.every((point, index) => {
    const raw = rawCurve[index];
    const correction = candidate.combinedEqCurve[index];
    return raw?.frequency === point.frequency && correction?.frequency === point.frequency
      && Math.abs(point.spl - (raw.spl + correction.spl)) < 1e-9;
  });
  const correctionValues = candidate?.combinedEqCurve?.map((point) => point.spl) || [];
  const graphSeries = buildBassGraphSeries({
    designEqEnabled: true,
    showHouseCurve: true,
    rspRawCurve: rawCurve,
    optimisationResult: selected,
    hasMatchingDetailedResult: true,
    smoothingMode: "none",
  });
  const graphRaw = graphSeries.find((series) => series.kind === "raw")?.data;
  const graphPostEq = graphSeries.find((series) => series.kind === "post-eq")?.data;
  const graphTarget = graphSeries.find((series) => series.kind === "house-curve")?.data;
  const graphSeriesAuthorityExact = JSON.stringify(graphRaw) === JSON.stringify(rawCurve)
    && JSON.stringify(graphPostEq) === JSON.stringify(candidate?.finalPostEqCurve)
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
  const permittedLimitProven = ["cut-limited", "boost-limited", "product-limited"].includes(remainingResidual?.limitingClassification)
    && Number.isFinite(remainingResidual?.frequencyHz)
    && Number.isFinite(remainingResidual?.signedResidualDb)
    && Number.isFinite(remainingResidual?.requiredCorrectionDb)
    && Number.isFinite(remainingResidual?.appliedCorrectionDb)
    && !!remainingResidual?.anotherLegalFilterRejectedBecause;
  const elapsedMs = performance.now() - startedAt;
  const checks = [
    ["Production splConfig has no targetSpl", !("targetSpl" in splConfig) && requested.requestedTargetAnchorDb === null],
    ["Four real seats evaluated", pool.performanceSummary?.seatCount === 4],
    ["Pool contains 192 candidates", pool.generatedCandidateCount === 192 && pool.candidates.length === 192],
    ["Pool contains 64 Standard candidates", profileCounts.standard === 64],
    ["Pool contains 64 Accuracy candidates", profileCounts.accuracy === 64],
    ["Pool contains 64 House-curve candidates", profileCounts.house_curve === 64],
    ["Every RP22 request has all three profiles", requestProfiles.size === 64 && [...requestProfiles.values()].every((profiles) => ["standard", "accuracy", "house_curve"].every((profile) => profiles.has(profile)))],
    ["Target anchor is independent of requested P14 level", new Set(pool.candidates.map((entry) => entry.responseTargetAnchorDb)).size === 1 && new Set(pool.candidates.map((entry) => entry.requestedP14TargetDb)).size === 4],
    ["Every candidate uses the response-derived target source", pool.candidates.every((entry) => entry.targetAnchorSource === "product-aware-rsp-robust-average")],
    ["Every candidate carries the identical canonical target", canonicalTargets.size === 1],
    ["Final curve equals worker raw plus selected correction", exactGraphAuthority],
    ["Graph series exactly match selected authority", graphSeriesAuthorityExact],
    ["Response-derived target is in expected live range", targetValues[20] >= 119 && targetValues[20] <= 121 && targetValues[200] >= 114 && targetValues[200] <= 116],
    ["34 Hz peak receives a material cut", interpolateCanonicalTarget(candidate?.combinedEqCurve, 34) <= -5],
    ["Ordinary 78, 100 and 120 Hz peaks move toward target", Object.values(markerImprovements).every((improvement) => improvement > 0.05)],
    ["Protected 40 Hz null receives no material boost", correctionAt40Hz <= 0.25],
    ["Aggregate correction stays within -15/+6 dB", Math.min(...correctionValues) >= -15.05 && Math.max(...correctionValues) <= 6.05],
    ["Correctable maximum and RMS materially improve", candidate?.houseCurveDiagnostics?.preRsp?.maximumAbsoluteResidualDb - candidate?.houseCurveDiagnostics?.postRsp?.maximumAbsoluteResidualDb > 3 && candidate?.houseCurveDiagnostics?.preRsp?.rmsResidualDb - candidate?.houseCurveDiagnostics?.postRsp?.rmsResidualDb > 0.5],
    ["P19 is assessed over 20–120 Hz", candidate?.assessmentStartHz === 20 && candidate?.assessmentEndHz === 120 && candidate?.correctionStartHz === 20 && candidate?.correctionEndHz === 200],
    ["Correctable P19 reaches ±3 dB or proves a permitted physical limit", candidate?.correctableP19VariationDb <= 3 || permittedLimitProven],
    ["Enabled bank changes the final curve", enabledFilters.length > 0 && correctionValues.some((value) => Math.abs(value) >= 0.5)],
    ["Official P19 retains protected nulls", candidate?.officialP19VariationDb > candidate?.correctableP19VariationDb],
    ["Completed pool passes result validation", validation.valid],
    ["Invalid pool reports exact missing input", invalidValidation.reason === "candidate-pool-invalid-inputs" && invalidValidation.message.includes("rawCurve") && invalidValidation.reason !== "house-curve-candidate-missing"],
    ["Lifecycle reaches ready complete without replacement", lifecycle.status === "ready" && lifecycle.terminalOutcome === "complete" && lifecycle.replacementRunCount === 0],
    ["Priority selection completed", !!selected.selectedCandidate],
    ["Priority reranking does not restart worker", workers.length === workersBeforeRerank && workers.length === 1],
    ["Ranked candidate pool created", stages.includes("rankedCandidates created")],
    ["Ranked selectable pool created", stages.includes("rankedSelectablePool created")],
  ].map(([name, passed]) => ({ name, passed: !!passed }));
  return {
    checks,
    passed: checks.filter((check) => check.passed).length,
    total: checks.length,
    allPassed: checks.every((check) => check.passed),
    elapsedMs,
    candidateCounts: { total: pool.candidates.length, standard: profileCounts.standard || 0, accuracy: profileCounts.accuracy || 0, houseCurve: profileCounts.house_curve || 0 },
    workerRequests: workers.length,
    replacementRuns: lifecycle.replacementRunCount,
    lastStage: stages.at(-1) || null,
    poolId: pool.poolId,
    validation,
    numericalReport: {
      responseTargetAnchorDb: candidate?.responseTargetAnchorDb ?? null,
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
      correctionDomainHz: { start: candidate?.correctionStartHz ?? null, end: candidate?.correctionEndHz ?? null },
      graphAuthorityExact: exactGraphAuthority && graphSeriesAuthorityExact,
      rawSeriesExact: JSON.stringify(graphRaw) === JSON.stringify(rawCurve),
      postEqSeriesExact: JSON.stringify(graphPostEq) === JSON.stringify(candidate?.finalPostEqCurve),
      targetSeriesExact: JSON.stringify(graphTarget) === JSON.stringify(candidate?.productionHouseCurveTarget),
    },
  };
}