import { generateCandidatePool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { BassAnalysisLruCache, BassBackgroundAnalysisController } from "./bassBackgroundAnalysisStore";
import { stampPoolAuthority, validateCachedBassResult } from "./bassResultAuthority";
import {
  BASS_OPTIMISER_POOL_VERSION,
  BASS_OPTIMISER_PROTOCOL_VERSION,
  BASS_OPTIMISER_VERSIONS,
  BASS_RESULT_SCHEMA_VERSION,
  HOUSE_CURVE_ENGINE_VERSION,
  createCompleteMessage,
} from "./bassOptimiserWorkerProtocol";

class FixtureClock {
  constructor() { this.time = 0; this.jobs = []; }
  now = () => this.time;
  setTimer = (fn, delay) => { const job = { fn, at: this.time + delay, cancelled: false }; this.jobs.push(job); return job; };
  clearTimer = (job) => { if (job) job.cancelled = true; };
  tick(ms) {
    this.time += ms;
    this.jobs.filter((job) => !job.cancelled && job.at <= this.time).forEach((job) => { job.cancelled = true; job.fn(); });
  }
}

class FixtureWorker {
  constructor(workers) { this.terminated = false; workers.push(this); }
  postMessage(message) { this.request = message; }
  terminate() { this.terminated = true; }
  complete(pool) {
    this.onmessage?.({ data: createCompleteMessage(
      this.request.requestId,
      this.request.fingerprint,
      pool,
      { ...this.request.identity, ...BASS_OPTIMISER_VERSIONS },
    ) });
  }
}

const houseCandidate = {
  designEqFitProfile: "house_curve",
  startStrategy: "multi-start",
  designEqFitProfileConfig: { maximumCutDb: 15, maximumAggregateBoostDb: 6 },
  generatedFilterBank: [],
  finalPostEqCurve: [{ frequency: 20, spl: 100 }],
};
const currentPool = () => stampPoolAuthority({ candidates: [houseCandidate], selectablePool: [houseCandidate], poolId: "compatibility-fixture" });
const currentResult = (pool = currentPool(), fingerprint = "compatibility-current") => ({
  ...BASS_OPTIMISER_VERSIONS,
  fingerprint,
  identity: { ...BASS_OPTIMISER_VERSIONS, fingerprint },
  pool,
});
const previous = (value) => `${value}-previous`;

function createHarness(cache = new BassAnalysisLruCache()) {
  const clock = new FixtureClock();
  const workers = [];
  const controller = new BassBackgroundAnalysisController({
    cache,
    workerFactory: () => new FixtureWorker(workers),
    debounceMs: 1,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  return { cache, clock, workers, controller };
}

function input(fingerprint = "compatibility-current") {
  return {
    valid: true,
    fingerprint,
    payload: {},
    identity: {
      ...BASS_OPTIMISER_VERSIONS,
      fingerprint,
      calibrationFingerprint: fingerprint,
      canonicalPriorityMode: "all-canonical-priorities",
    },
  };
}

export function runBassOptimiserCompatibilityFixtures() {
  const checks = [];
  const check = (name, passed, details = null) => checks.push({ name, passed: !!passed, details });

  const accepted = createHarness();
  accepted.controller.updateInputs(input());
  accepted.clock.tick(1);
  accepted.workers[0].complete(currentPool());
  check("1. Current main thread and worker result accepted", accepted.controller.getSnapshot().status === "ready");

  const priorPool = currentPool();
  priorPool.poolVersion = previous(BASS_OPTIMISER_POOL_VERSION);
  const poolValidation = validateCachedBassResult(currentResult(priorPool), { fingerprint: "compatibility-current" });
  check("2. Previous pool version rejected", !poolValidation.valid && poolValidation.reason === "pool-version-mismatch", poolValidation.message);

  const priorEngine = { ...currentResult(), engineVersion: previous(HOUSE_CURVE_ENGINE_VERSION) };
  const engineValidation = validateCachedBassResult(priorEngine, { fingerprint: "compatibility-current" });
  check("3. Previous engine version rejected", !engineValidation.valid && engineValidation.reason === "engine-version-mismatch", engineValidation.message);

  const priorSchema = { ...currentResult(), resultSchemaVersion: BASS_RESULT_SCHEMA_VERSION - 1 };
  const schemaValidation = validateCachedBassResult(priorSchema, { fingerprint: "compatibility-current" });
  check("4. Previous schema version rejected", !schemaValidation.valid && schemaValidation.reason === "result-schema-version-mismatch", schemaValidation.message);

  const cache = new BassAnalysisLruCache();
  const fingerprint = "compatibility-cache";
  cache.set(fingerprint, { ...currentResult(currentPool(), fingerprint), poolVersion: previous(BASS_OPTIMISER_POOL_VERSION) });
  const replacement = createHarness(cache);
  replacement.controller.updateInputs(input(fingerprint));
  const removed = !cache.keys().includes(fingerprint) && replacement.controller.getSnapshot().cacheStatus === "rejected-stale";
  replacement.clock.tick(1);
  replacement.workers[0].complete(currentPool());
  const finalState = replacement.controller.getSnapshot();
  check("5. Rejected cache removed and recalculated", removed);
  check("6. Replacement current result reaches COMPLETE", finalState.status === "ready" && finalState.terminalOutcome === "complete");
  check("7. Only one recalculation started", replacement.workers.length === 1);

  const emittedPool = generateCandidatePool({ rawCurve: [], activeSubs: [], targetAnchorDb: null });
  check("8. Generated pool carries shared pool version", emittedPool.poolVersion === BASS_OPTIMISER_POOL_VERSION);
  check("Shared protocol value is current", emittedPool.protocolVersion === BASS_OPTIMISER_PROTOCOL_VERSION);

  const passed = checks.filter((item) => item.passed).length;
  return { checks, passed, total: checks.length, allPassed: passed === checks.length };
}