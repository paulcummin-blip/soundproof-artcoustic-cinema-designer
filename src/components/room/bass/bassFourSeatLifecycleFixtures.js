import { buildHouseCurveAccuracyReference } from "@/components/utils/houseCurveAccuracyFixtures";
import { generateCandidatePool, selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { deriveRequestedCalibrationConfig } from "./requestedCalibrationConfig";
import { BassBackgroundAnalysisController } from "./bassBackgroundAnalysisStore";
import { validateCachedBassResult } from "./bassResultAuthority";
import { BASS_OPTIMISER_VERSIONS, createCompleteMessage } from "./bassOptimiserWorkerProtocol";

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
    targetAnchorSource: "rp22-request.p14.p14TargetDb",
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
  const selected = selectCandidateFromPool(pool, "balanced");
  selectCandidateFromPool(pool, "depth");
  const invalidPool = generateCandidatePool({ rawCurve: [], activeSubs: [{ modelKey: "SUB2-12" }] });
  const invalidFingerprint = "four-seat-invalid-input-reporting";
  const invalidValidation = validateCachedBassResult({
    ...BASS_OPTIMISER_VERSIONS,
    fingerprint: invalidFingerprint,
    identity: { ...BASS_OPTIMISER_VERSIONS, fingerprint: invalidFingerprint },
    pool: invalidPool,
  }, { fingerprint: invalidFingerprint });
  const elapsedMs = performance.now() - startedAt;
  const checks = [
    ["Production splConfig has no targetSpl", !("targetSpl" in splConfig) && requested.requestedTargetAnchorDb === null],
    ["Four real seats evaluated", pool.performanceSummary?.seatCount === 4],
    ["Pool contains 192 candidates", pool.generatedCandidateCount === 192 && pool.candidates.length === 192],
    ["Pool contains 64 Standard candidates", profileCounts.standard === 64],
    ["Pool contains 64 Accuracy candidates", profileCounts.accuracy === 64],
    ["Pool contains 64 House-curve candidates", profileCounts.house_curve === 64],
    ["Every RP22 request has all three profiles", requestProfiles.size === 64 && [...requestProfiles.values()].every((profiles) => ["standard", "accuracy", "house_curve"].every((profile) => profiles.has(profile)))],
    ["Every candidate uses its requested P14 anchor", pool.candidates.every((candidate) => candidate.requestedTargetSpl === candidate.requestedP14TargetDb && candidate.targetAnchorSource === "rp22-request.p14.p14TargetDb")],
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
  };
}