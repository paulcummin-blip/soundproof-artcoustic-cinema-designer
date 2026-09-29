// p14-target-bank-stall-fix.test.mjs
//
// Focused regression tests for the P14/P18 target-bank background preparation
// stall fix. Two proven defects are covered:
//
//   FIX 1 — the owner's observe-inputs effect cancelled the background sweep
//     unconditionally, so ordinary publication/notification traffic (completed
//     authority updates, fingerprint/cacheKey changes) emptied the queue
//     mid-batch. The bank froze at N/8 with no failed targets and the UI fell
//     back to a passive "N of 8 prepared" with no reason and no Retry.
//     Fix: cancel ONLY on a genuine base-design fingerprint change
//     (p14SweepCancelAuthority.js).
//
//   FIX 2 — the background worker watchdog was cleared on the FIRST worker
//     message, before checking whether that message was terminal. The worker
//     posts progress, so the 60s watchdog was disarmed for every target; a
//     worker that then went silent left the sweep permanently "running"
//     (running=true, no timer) and frozen forever.
//     Fix: only terminal messages clear the watchdog; non-terminal messages
//     re-arm it.
//
// These tests exercise the REAL modules (scheduler, cancel authority, target
// cache, progress store) with a stubbed Worker and a controlled timer queue.
// The cache gates, retry/fail lifecycle and terminal progress publication are
// the production code paths.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { P14TargetBackgroundScheduler } from "@/components/room/bass/p14TargetBackgroundScheduler";
import { cancelP14SweepOnDesignChange, shouldCancelP14Sweep } from "@/components/room/bass/p14SweepCancelAuthority";
import {
  setTargetCacheEntry,
  getTargetCacheEntry,
  getTargetCacheProgress,
  _resetTargetCacheForTest,
} from "@/components/room/bass/p14TargetCache";
import {
  getP14AnalysisProgress,
  publishP14AnalysisProgress,
} from "@/components/room/bass/p14AnalysisProgressStore";
import {
  buildCanonicalBassResult,
  CANONICAL_BASS_RESULT_VERSION,
} from "@/components/room/bass/canonicalBassResult";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "@/lib/bassAuthorityVersion";

// ── Cache-key sentinel ─────────────────────────────────────────────────
// "free::free" is the in-memory-only cache key: all persistence is
// short-circuited, so these tests never touch the database.
const PROJECT_ID = "free";
const VERSION_ID = "free";

const BASE_FP_A = "cal:v8:aaaaaaaaaaaaaaaa|rs:32";
const BASE_FP_B = "cal:v8:bbbbbbbbbbbbbbbb|rs:32";

// ── Target family (the real 8 P14 combinations) ────────────────────────
const TARGETS = [
  { key: "minimum-L1", db: 109, basis: "minimum", level: 1, p14RequiredExtensionHz: 30, p18TargetBasis: "minimum", p18RequiredExtensionHz: 30 },
  { key: "minimum-L2", db: 112, basis: "minimum", level: 2, p14RequiredExtensionHz: 28, p18TargetBasis: "minimum", p18RequiredExtensionHz: 30 },
  { key: "minimum-L3", db: 115, basis: "minimum", level: 3, p14RequiredExtensionHz: 26, p18TargetBasis: "minimum", p18RequiredExtensionHz: 30 },
  { key: "minimum-L4", db: 118, basis: "minimum", level: 4, p14RequiredExtensionHz: 24, p18TargetBasis: "minimum", p18RequiredExtensionHz: 30 },
  { key: "recommended-L1", db: 114, basis: "recommended", level: 1, p14RequiredExtensionHz: 27, p18TargetBasis: "minimum", p18RequiredExtensionHz: 30 },
  { key: "recommended-L2", db: 117, basis: "recommended", level: 2, p14RequiredExtensionHz: 25, p18TargetBasis: "minimum", p18RequiredExtensionHz: 30 },
  { key: "recommended-L3", db: 120, basis: "recommended", level: 3, p14RequiredExtensionHz: 23, p18TargetBasis: "minimum", p18RequiredExtensionHz: 30 },
  { key: "recommended-L4", db: 123, basis: "recommended", level: 4, p14RequiredExtensionHz: 21, p18TargetBasis: "minimum", p18RequiredExtensionHz: 30 },
];

const DESIGN_CONTEXT = {
  payload: {},
  sources: [{ id: "sub-1" }],
  usableLfHz: 40,
  rspRawCurve: [{ frequency: 20, spl: 80 }],
  perSeatRawCurves: [],
  primarySeatIds: [],
  fingerprints: {},
  fingerprintInputs: {},
};

// ── Authoritative contract fixture (passes the real cache gates) ───────
// Minimal but fully valid compact contract: structural completeness, canonical
// seat-metric authority, assessment envelope, canonical BassResult, finished
// graph payload (postEqRspCurve + correctionCurve + referenceEq) and P19
// readiness. The canonical BassResult is projected by the production builder
// so the contract is internally consistent by construction.
const CURVE = [{ frequency: 20, spl: 80 }, { frequency: 30, spl: 78 }];

function makeAuthoritativeContract({ targetKey = "minimum-L2", fingerprint = "fp-1" } = {}) {
  const contract = {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    instanceAuthorityVersion: 4,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    selectedCandidateId: `cand-${targetKey}`,
    selectedCandidate: {
      id: `cand-${targetKey}`,
      candidateId: `cand-${targetKey}`,
      achievedP18FrequencyHz: 30,
      perSeatP19Results: [{ seatId: "seat-1", variationDbRaw: 2.5, level: 4 }],
      perSeatP20Results: [{ seatId: "seat-1", variationDbRaw: 2.0, level: 4 }],
    },
    provenance: { realSeatCount: 1, primarySeatIds: ["seat-1"] },
    metricPublication: {
      canonicalMetricPublicationValid: true,
      publicationRejectionReason: null,
    },
    assessmentEnvelope: {
      achievedP18FrequencyHz: 30,
      achievedP18Bounded: true,
      assessmentStartHz: 30,
      assessmentEndHz: 120,
      officialP19WorstFrequencyHz: 35,
      p19TargetIdentity: "house-curve-target",
    },
    job: {
      status: "complete",
      resultFingerprint: fingerprint,
      currentJobFingerprint: fingerprint,
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      resultSchemaVersion: 32,
      elapsedMs: 5000,
    },
    productAnalysis: {
      parameters: {
        p18: { status: "complete", value: 30 },
        p19: { status: "complete", value: 2.5, level: 4 },
        p20: { status: "complete", value: 2.0, level: 4 },
      },
    },
    graphPayload: {
      postEqRspCurve: CURVE,
      correctionCurve: [],
      referenceEq: CURVE,
      productionHouseCurveTarget: CURVE,
      postEqPerSeatCurves: [{ seatId: "seat-1", responseData: CURVE }],
      eqFilterBank: [{ frequency: 25, gainDb: -2, q: 1 }],
    },
  };

  const canonical = buildCanonicalBassResult(contract);
  assert.ok(canonical, "canonical BassResult projection must succeed for the fixture");
  contract.bassResult = {
    version: CANONICAL_BASS_RESULT_VERSION,
    candidateId: contract.selectedCandidateId,
    resultFingerprint: fingerprint,
    P19: canonical.P19,
    P20: canonical.P20,
    seatResults: { P19: [], P20: canonical.seatResults.P20 },
    grading: canonical.grading,
  };
  return contract;
}

function seedTarget(baseDesignFingerprint, targetKey) {
  const inserted = setTargetCacheEntry(
    PROJECT_ID,
    VERSION_ID,
    baseDesignFingerprint,
    targetKey,
    makeAuthoritativeContract({ targetKey, fingerprint: `fp-${baseDesignFingerprint.slice(-8)}-${targetKey}` }),
    { deferPersistence: true },
  );
  assert.equal(inserted, true, `fixture contract must pass the real cache gates for ${targetKey}`);
}

// ── Controlled timers ──────────────────────────────────────────────────
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
let fakeTimers = new Map();
let timerSeq = 0;

function installFakeTimers() {
  fakeTimers = new Map();
  timerSeq = 0;
  globalThis.setTimeout = (fn) => {
    const id = `t${++timerSeq}`;
    fakeTimers.set(id, fn);
    return id;
  };
  globalThis.clearTimeout = (id) => { fakeTimers.delete(id); };
}

function restoreTimers() {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}

function pendingTimers() { return fakeTimers.size; }

function flushTimers() {
  const entries = [...fakeTimers.entries()];
  fakeTimers.clear();
  for (const [, fn] of entries) fn();
}

const tick = () => new Promise((resolve) => realSetTimeout(resolve, 0));

/** Flush the scheduler's timer queue + microtasks until it settles. */
async function drainSweep(scheduler, { maxRounds = 400 } = {}) {
  for (let round = 0; round < maxRounds; round++) {
    await tick();
    if (pendingTimers() === 0) return round;
    flushTimers();
  }
  throw new Error("sweep did not settle — scheduler is frozen");
}

// ── Stubbed worker ─────────────────────────────────────────────────────
class FakeWorker {
  static instances = [];
  static behaviour = "hold";

  constructor() {
    this.terminated = false;
    this.messagesSent = 0;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.messagesSent += 1;
    const behaviour = FakeWorker.behaviour;
    if (behaviour === "progress-hold") {
      // One progress message, then silence — the exact pattern that disarmed
      // the watchdog before the fix.
      queueMicrotask(() => this.emit({ type: "progress", fingerprint: message.fingerprint }));
    }
    // "hold" / "silent" → no message at all.
  }

  emit(data) {
    if (this.terminated) return;
    if (typeof this.onmessage === "function") this.onmessage({ data });
  }

  terminate() { this.terminated = true; }
}

function resetProgress() {
  publishP14AnalysisProgress(PROJECT_ID, VERSION_ID, {
    baseDesignFingerprint: null,
    status: "idle",
    completed: 0,
    total: TARGETS.length,
    activeTargetKey: null,
    activeStartedAtMs: null,
    completedDurationsMs: [],
    failedTargetKeys: [],
  });
}

function makeScheduler() {
  return new P14TargetBackgroundScheduler();
}

function startSweep(scheduler, { baseDesignFingerprint = BASE_FP_A, foregroundTargetKey = TARGETS[0].key } = {}) {
  scheduler.schedule({
    projectId: PROJECT_ID,
    versionId: VERSION_ID,
    baseDesignFingerprint,
    foregroundTargetKey,
    allTargets: TARGETS,
    designContext: DESIGN_CONTEXT,
  });
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.behaviour = "hold";
  globalThis.Worker = FakeWorker;
  installFakeTimers();
  _resetTargetCacheForTest();
  resetProgress();
});

afterEach(() => {
  restoreTimers();
});

// ═══════════════════════════════════════════════════════════════════════
// 0. The cancel policy itself
// ═══════════════════════════════════════════════════════════════════════

test("0. Cancel policy: only a genuine base-design change cancels", () => {
  assert.equal(shouldCancelP14Sweep({
    activeBaseDesignFingerprint: BASE_FP_A,
    currentBaseDesignFingerprint: BASE_FP_A,
  }), false, "same design must never cancel the sweep");

  assert.equal(shouldCancelP14Sweep({
    activeBaseDesignFingerprint: BASE_FP_A,
    currentBaseDesignFingerprint: BASE_FP_B,
  }), true, "a changed design must cancel the sweep");

  assert.equal(shouldCancelP14Sweep({
    activeBaseDesignFingerprint: null,
    currentBaseDesignFingerprint: BASE_FP_A,
  }), false, "no active batch → nothing to cancel");

  assert.equal(shouldCancelP14Sweep({
    activeBaseDesignFingerprint: BASE_FP_A,
    currentBaseDesignFingerprint: null,
  }), false, "fingerprint not yet resolved → do not cancel on a transient");

  // A non-scheduler object must never be cancelled.
  assert.equal(cancelP14SweepOnDesignChange(null, BASE_FP_B), false);
});

// ═══════════════════════════════════════════════════════════════════════
// 1. Unrelated notifications do not cancel an in-flight sweep
// ═══════════════════════════════════════════════════════════════════════

test("1. Unrelated notifications do not cancel the sweep, and the bank reaches 8/8", async () => {
  const scheduler = makeScheduler();
  FakeWorker.behaviour = "progress-hold";

  // 6 of 8 already prepared; the sweep must prepare the remaining 2.
  for (const target of TARGETS.slice(0, 6)) seedTarget(BASE_FP_A, target.key);

  startSweep(scheduler);
  await tick();
  flushTimers();
  await tick();

  assert.equal(scheduler.cancelled, false, "sweep must be live");
  assert.equal(scheduler.currentTarget?.key, TARGETS[6].key, "first missing target in flight");
  assert.equal(scheduler.queue.length, 1, "one target still queued behind the in-flight one");
  assert.equal(FakeWorker.instances.length, 1, "one background worker started");

  // ── Unrelated publication/notification traffic ──
  // The owner's observe-inputs effect re-runs on every completed-authority /
  // fingerprint / cacheKey notification. Before the fix each of these called
  // cancel() and killed the batch.
  for (let i = 0; i < 5; i++) {
    const cancelled = cancelP14SweepOnDesignChange(scheduler, BASE_FP_A);
    assert.equal(cancelled, false, "unrelated notification must not cancel the sweep");
  }

  assert.equal(scheduler.cancelled, false, "scheduler must still own the batch");
  assert.equal(scheduler.queue.length, 1, "queue must be preserved");
  assert.equal(scheduler.currentTarget?.key, TARGETS[6].key, "in-flight target must survive");
  assert.equal(scheduler.hasActiveBatchWork(), true, "batch must still be owned");
  assert.equal(
    getP14AnalysisProgress(PROJECT_ID, VERSION_ID).status,
    "calculating",
    "a live sweep must publish 'calculating', never a false idle",
  );

  // ── The remaining targets now resolve (as worker completions would) ──
  seedTarget(BASE_FP_A, TARGETS[6].key);
  seedTarget(BASE_FP_A, TARGETS[7].key);

  await drainSweep(scheduler);

  const progress = getTargetCacheProgress(PROJECT_ID, VERSION_ID, BASE_FP_A, TARGETS.map((t) => t.key));
  assert.equal(progress.resolved, 8, "bank must reach 8/8 after the update");
  assert.equal(getP14AnalysisProgress(PROJECT_ID, VERSION_ID).status, "complete", "terminal status must be complete");
  assert.equal(scheduler.cancelled, false, "sweep must not have been cancelled");
  assert.equal(scheduler.hasActiveBatchWork(), false, "sweep must be settled, not frozen");
  assert.equal(scheduler.currentTarget, null, "no dangling in-flight target");
});

// ═══════════════════════════════════════════════════════════════════════
// 2. A genuine base-design change still cancels and restarts
// ═══════════════════════════════════════════════════════════════════════

test("2. A genuine base-design change cancels the old sweep and the new design builds its own bank", async () => {
  const scheduler = makeScheduler();
  FakeWorker.behaviour = "hold";

  for (const target of TARGETS.slice(0, 6)) seedTarget(BASE_FP_A, target.key);

  startSweep(scheduler, { baseDesignFingerprint: BASE_FP_A });
  await tick();
  flushTimers();
  await tick();

  assert.equal(scheduler.currentBaseDesignFingerprint, BASE_FP_A);
  assert.equal(scheduler.queue.length, 1);
  assert.ok(scheduler.currentTarget, "a target is in flight");

  // Design changed → cancel is legitimate.
  const cancelled = cancelP14SweepOnDesignChange(scheduler, BASE_FP_B);
  assert.equal(cancelled, true, "a changed design must cancel the sweep");
  assert.equal(scheduler.cancelled, true);
  assert.equal(scheduler.queue.length, 0, "old queue discarded");
  assert.equal(scheduler.currentTarget, null, "old in-flight target discarded");
  assert.equal(scheduler.running, false);
  assert.equal(scheduler.hasActiveBatchWork(), false);

  // The new design starts its own bank preparation.
  startSweep(scheduler, { baseDesignFingerprint: BASE_FP_B });
  assert.equal(scheduler.cancelled, false, "new sweep must be live");
  assert.equal(scheduler.currentBaseDesignFingerprint, BASE_FP_B);
  assert.equal(scheduler.queue.length, 7, "new design queues its own remaining targets");
  assert.equal(
    getTargetCacheProgress(PROJECT_ID, VERSION_ID, BASE_FP_B, TARGETS.map((t) => t.key)).resolved,
    0,
    "new design starts from 0/8 — no cross-design reuse",
  );

  for (const target of TARGETS) seedTarget(BASE_FP_B, target.key);
  await drainSweep(scheduler);

  assert.equal(
    getTargetCacheProgress(PROJECT_ID, VERSION_ID, BASE_FP_B, TARGETS.map((t) => t.key)).resolved,
    8,
    "new design's own bank must reach 8/8",
  );
  assert.equal(getP14AnalysisProgress(PROJECT_ID, VERSION_ID).status, "complete");
  assert.equal(
    getTargetCacheProgress(PROJECT_ID, VERSION_ID, BASE_FP_A, TARGETS.map((t) => t.key)).resolved,
    0,
    "the old design's bank must not be served for the new design",
  );
});

// ═══════════════════════════════════════════════════════════════════════
// 3. The watchdog survives a non-terminal progress message
// ═══════════════════════════════════════════════════════════════════════

test("3. Watchdog survives a progress message (no terminal message)", async () => {
  const scheduler = makeScheduler();
  FakeWorker.behaviour = "progress-hold";

  startSweep(scheduler);
  await tick();
  flushTimers();
  await tick(); // progress message delivered

  const worker = FakeWorker.instances[0];
  const inFlightKey = scheduler.currentTarget?.key;
  assert.equal(inFlightKey, "minimum-L2", "closest target to the selection runs first");
  assert.equal(worker.messagesSent, 1, "worker was dispatched");
  assert.equal(worker.terminated, false, "worker must still be alive after a progress message");
  assert.notEqual(
    scheduler.workerWatchdogHandle ?? null,
    null,
    "watchdog must still be armed after a non-terminal progress message",
  );
  assert.equal(pendingTimers() > 0, true, "a watchdog timer must be pending");

  // The worker stays silent → the watchdog must fire and terminate it.
  flushTimers();
  assert.equal(worker.terminated, true, "a silent worker must be terminated at the timeout");

  assert.equal(
    scheduler.retryCounts.get(inFlightKey) ?? null,
    1,
    "the target must enter the existing retry lifecycle (not be silently lost)",
  );

  // The sweep continues to fail/retry and terminates — it never freezes.
  await drainSweep(scheduler);
  assert.equal(scheduler.hasActiveBatchWork(), false, "sweep must settle, never freeze");
  assert.equal(scheduler.currentTarget, null);
  const progress = getP14AnalysisProgress(PROJECT_ID, VERSION_ID);
  assert.equal(progress.status, "retryable-partial", "terminal failure must be published for the UI");
  assert.equal(
    progress.failedTargetKeys.length,
    TARGETS.length - 1,
    "every queued target is reported as failed (the foreground target is never queued)",
  );
});

// ═══════════════════════════════════════════════════════════════════════
// 4. A silent worker death retries, then fails — never freezes
// ═══════════════════════════════════════════════════════════════════════

test("4. A silent worker (no messages at all) is terminated and the target retries then fails", async () => {
  const scheduler = makeScheduler();
  FakeWorker.behaviour = "silent";

  startSweep(scheduler);
  await tick();
  flushTimers();
  await tick();

  assert.equal(pendingTimers() > 0, true, "watchdog armed for a silent worker");
  assert.equal(scheduler.hasActiveBatchWork(), true);

  await drainSweep(scheduler);

  const workers = FakeWorker.instances;
  assert.ok(workers.length > 0, "background workers were started");
  assert.equal(workers.every((w) => w.terminated === true), true, "every hung worker was terminated");
  assert.equal(scheduler.hasActiveBatchWork(), false, "sweep must settle — never permanently active");
  assert.equal(
    scheduler.failedTargets.size,
    TARGETS.length - 1,
    "every queued target exhausted the retry budget",
  );
  assert.equal(getP14AnalysisProgress(PROJECT_ID, VERSION_ID).status, "retryable-partial");
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Progress state is never falsified
// ═══════════════════════════════════════════════════════════════════════

test("5. Progress state: running sweep is 'calculating'; incomplete sweep reports failures + retry", async () => {
  const scheduler = makeScheduler();
  FakeWorker.behaviour = "progress-hold";

  startSweep(scheduler);
  await tick();
  flushTimers();
  await tick();

  const running = getP14AnalysisProgress(PROJECT_ID, VERSION_ID);
  assert.equal(running.status, "calculating", "a live sweep must not publish idle/stalled");
  assert.ok(running.activeTargetKey, "the active target must be published");
  assert.equal(running.failedTargetKeys.length, 0, "no failures claimed while running");

  await drainSweep(scheduler);

  const settled = getP14AnalysisProgress(PROJECT_ID, VERSION_ID);
  assert.equal(settled.status, "retryable-partial", "failures must be published as retryable-partial");
  assert.ok(settled.failedTargetKeys.length > 0, "failed target keys must be published for the UI");
  assert.equal(settled.activeTargetKey, null, "no target left marked active");
});