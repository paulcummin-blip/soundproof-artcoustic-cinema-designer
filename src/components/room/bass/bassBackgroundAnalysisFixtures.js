import { BassAnalysisLruCache, BassBackgroundAnalysisController } from "./bassBackgroundAnalysisStore.js";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import {
  BASS_OPTIMISER_POOL_PROPERTY,
  createCompleteMessage,
  createErrorMessage,
  createProgressMessage,
} from "./bassOptimiserWorkerProtocol";

class FakeClock {
  constructor() { this.time = 0; this.jobs = []; }
  now = () => this.time;
  setTimer = (fn, delay) => { const job = { fn, at: this.time + delay, cancelled: false }; this.jobs.push(job); return job; };
  clearTimer = (job) => { if (job) job.cancelled = true; };
  tick(ms) { this.time += ms; const due = this.jobs.filter((job) => !job.cancelled && job.at <= this.time); due.forEach((job) => { job.cancelled = true; job.fn(); }); }
}

class FakeWorker {
  constructor(registry) { this.registry = registry; this.terminated = false; registry.push(this); }
  postMessage(message) { this.message = message; }
  terminate() { this.terminated = true; }
  send(type, data = {}) { this.onmessage?.({ data: { type, requestId: this.message.requestId, fingerprint: this.message.fingerprint, ...data } }); }
}

function validInput(fingerprint = "cal:v1:0000000000000001") {
  return { valid: true, fingerprint, payload: { rawCurve: [{ frequency: 20, spl: 100 }], activeSubs: [{ modelKey: "sub2-12" }] } };
}

function harness() {
  const clock = new FakeClock();
  const workers = [];
  const cache = new BassAnalysisLruCache();
  const controller = new BassBackgroundAnalysisController({
    workerFactory: () => new FakeWorker(workers), cache,
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  return { clock, workers, cache, controller };
}

function completeCurrent(h, pool = { candidates: [{ id: "candidate" }], selectablePool: [] }) {
  h.workers[h.workers.length - 1].send("complete", { pool });
}

export function runBassBackgroundAnalysisFixtures() {
  const checks = [];
  const check = (name, passed, details = "") => checks.push({ name, passed: !!passed, details });

  { const h = harness(); h.controller.updateInputs(validInput()); check("1. Stable valid inputs queue automatically", h.controller.getSnapshot().status === "queued"); }
  { const h = harness(); h.controller.updateInputs({ valid: false, fingerprint: null, payload: null }); h.clock.tick(2000); check("2. Incomplete inputs remain idle", h.controller.getSnapshot().status === "idle" && h.workers.length === 0); }
  { const h = harness(); for (let i = 1; i <= 5; i++) { h.controller.updateInputs(validInput(`cal:v1:${String(i).padStart(16, "0")}`)); h.clock.tick(200); } h.clock.tick(1000); check("3. Continuous changes debounce once", h.workers.length === 1 && h.workers[0].message.fingerprint.endsWith("0000000000000005")); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); completeCurrent(h); h.controller.updateInputs(validInput("cal:v1:0000000000000002")); check("4. Geometry change marks stale immediately", h.controller.getSnapshot().status === "stale" && h.controller.getSnapshot().previousResultStale); }
  { const h = harness(); h.controller.updateInputs(validInput("cal:v1:0000000000000001")); h.controller.updateInputs(validInput("cal:v1:0000000000000002")); check("5. Product change queues newest job", h.controller.getSnapshot().currentJobFingerprint.endsWith("0000000000000002")); }
  { const h = harness(); h.controller.updateInputs(validInput("cal:v1:0000000000000001")); h.controller.updateInputs(validInput("cal:v1:0000000000000003")); check("6. Seat change queues newest job", h.controller.getSnapshot().status === "queued" && h.controller.getSnapshot().currentJobFingerprint.endsWith("3")); }
  { const h = harness(); h.controller.updateInputs(validInput("cal:v1:0000000000000001")); h.controller.updateInputs(validInput("cal:v1:0000000000000004")); check("7. Calibration change invalidates", h.controller.getSnapshot().currentJobFingerprint.endsWith("4")); }
  { const h = harness(); const input = { ...validInput(), graphSmoothing: "third" }; h.controller.updateInputs(input); h.controller.updateInputs({ ...input, graphSmoothing: "none" }); check("8. Graph smoothing does not invalidate", h.controller.getSnapshot().status === "queued" && h.clock.jobs.length === 1); }
  { const h = harness(); const input = { ...validInput(), panelExpanded: false }; h.controller.updateInputs(input); h.controller.updateInputs({ ...input, panelExpanded: true }); check("9. Panel expansion does not invalidate", h.clock.jobs.length === 1); }
  { const h = harness(); const input = { ...validInput(), priority: "balanced" }; h.controller.updateInputs(input); h.controller.updateInputs({ ...input, priority: "accuracy" }); check("10. Priority-only change starts no worker", h.clock.jobs.length === 1 && h.workers.length === 0); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.controller.updateInputs(validInput()); h.clock.tick(1000); check("11. Same queued fingerprint deduplicates", h.workers.length === 1); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); h.controller.updateInputs(validInput()); check("12. Same calculating fingerprint deduplicates", h.workers.length === 1 && !h.workers[0].terminated); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); const old = h.workers[0]; h.controller.updateInputs(validInput("cal:v1:0000000000000002")); old.send("complete", { pool: { candidates: ["old"] } }); check("13. Stale worker response rejected", h.controller.getSnapshot().result === null && h.controller.getSnapshot().currentJobFingerprint.endsWith("2")); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); completeCurrent(h); check("14. Matching response becomes ready", h.controller.getSnapshot().status === "ready" && h.controller.getSnapshot().resultFingerprint === validInput().fingerprint); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); h.workers[0].send("error", { error: "failed" }); check("15. Failed jobs are not cached", h.cache.keys().length === 0 && h.controller.getSnapshot().status === "error"); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); completeCurrent(h); check("16. Completed jobs are cached", h.cache.keys().length === 1); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); completeCurrent(h); h.controller.updateInputs(validInput("cal:v1:0000000000000002")); h.controller.updateInputs(validInput()); check("17. Exact cache hit starts no worker", h.workers.length === 1 && h.controller.getSnapshot().cacheStatus === "hit"); }
  { const cache = new BassAnalysisLruCache(); for (let i = 1; i <= 4; i++) cache.set(`f${i}`, { i }); check("18. Cache limited to three", cache.keys().length === 3); }
  { const cache = new BassAnalysisLruCache(); cache.set("a", { id: "a" }); cache.set("b", { id: "b" }); cache.set("c", { id: "c" }); cache.get("a"); cache.set("d", { id: "d" }); check("19. Least recently used evicted", !cache.keys().includes("b") && cache.keys().includes("a")); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); completeCurrent(h, { id: "room-a" }); h.controller.updateInputs(validInput("cal:v1:0000000000000002")); h.controller.updateInputs(validInput()); check("20. Cached configuration restores correct result", h.controller.getSnapshot().result?.pool?.id === "room-a"); }
  { const h = harness(); h.controller.updateInputs(validInput()); const manual = h.controller.requestManual({ ...validInput(), force: false }); h.clock.tick(1000); check("21. Manual and automatic share scheduler", manual.action === "duplicate_ignored" && h.workers.length === 1); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); completeCurrent(h); let serializable = true; try { structuredClone(h.controller.getSnapshot()); } catch { serializable = false; } check("22. Result contract serializable", serializable); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); completeCurrent(h); const s = h.controller.getSnapshot(); check("23. Current result matches current inputs", s.result?.calibrationFingerprint === s.currentCalibrationFingerprint); }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); completeCurrent(h); h.controller.updateInputs(validInput("cal:v1:0000000000000002")); const s = h.controller.getSnapshot(); check("24. Stale result cannot be current RP22", s.result === null && s.staleResult != null && s.resultFingerprint === null); }
  {
    const candidate = (id, level) => ({
      id, achievedP14Level: level, achievedP14Db: 100 + level,
      achievedP18Level: level, achievedP18FrequencyHz: 40 - level,
      achievedP19Level: level, achievedP19VariationDb: 6 - level,
      worstRealSeatHouseCurveLevel: level, worstRealSeatHouseCurveVariationDb: 6 - level,
      p20Available: false, generatedFilterBank: [], finalPostEqCurve: [{ frequency: 20, spl: 100 }],
      designEqFitProfile: "standard", meetsRequestedEnvelope: true,
    });
    const candidates = [candidate("a", 1), candidate("b", 2)];
    const pool = { candidates, selectablePool: candidates, poolId: "shared-pool", performanceSummary: {} };
    const balanced = selectCandidateFromPool(pool, "balanced");
    const accuracy = selectCandidateFromPool(pool, "accuracy");
    check("25. Priority reranking reuses compatible pool", balanced.heavyPoolReused && accuracy.heavyPoolReused && balanced.poolId === accuracy.poolId && pool.candidates === candidates);
  }
  { const h = harness(); h.controller.updateInputs(validInput()); h.clock.tick(1000); h.controller.dispose(); check("26. Worker terminates on unmount", h.workers[0].terminated); }
  {
    const message = createProgressMessage("request-1", "fingerprint-1", { phase: "Optimising" });
    check("27. Real worker progress protocol preserves envelope", message.type === "progress" && message.requestId === "request-1" && message.fingerprint === "fingerprint-1");
  }
  {
    const pool = { poolId: "protocol-pool", candidates: [] };
    const message = createCompleteMessage("request-2", "fingerprint-2", pool);
    check("28. Real worker complete protocol exposes controller pool property", message.type === "complete" && message.requestId === "request-2" && message.fingerprint === "fingerprint-2" && message[BASS_OPTIMISER_POOL_PROPERTY] === pool);
  }
  {
    const message = createErrorMessage("request-3", "fingerprint-3", "failed");
    check("29. Real worker error protocol preserves envelope", message.type === "error" && message.requestId === "request-3" && message.fingerprint === "fingerprint-3" && message.error === "failed");
  }

  const passed = checks.filter((item) => item.passed).length;
  return { results: checks, passed, total: checks.length, allPassed: passed === checks.length };
}