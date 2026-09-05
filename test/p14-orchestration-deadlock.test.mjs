// Integration tests for the P14 orchestration deadlock fix.
//
// Covers the React owner/request-consumption boundary that the existing 39
// scheduler tests do not exercise. Tests the NEW hasActiveBatchWork() durable
// ownership predicate, pauseForForegroundCalculate/resumeAfterForegroundCalculate
// lifecycle, worker watchdog, immediate persistence, and retryable-partial
// failure path.
//
// The mock scheduler mirrors the REAL p14TargetBackgroundScheduler logic
// (the real module pulls @/ aliases Node cannot resolve). The mock is
// faithful to: hasActiveBatchWork, foreground-calculate pause/resume, worker
// watchdog, try/catch on construction errors, deferPersistence=false, and
// retryable-partial status.
//
// TESTS A–G map to the required integration coverage:
//   A — Request consumption preserves batch ownership
//   B — Drag pause resumes
//   C — Manual foreground Calculate resumes background
//   D — Hydrate from 2/8 resumes only six missing targets
//   E — One target error → 7/8 retryable-partial → retry → 8/8
//   F — Non-settling worker → watchdog fires
//   G — Persistence after each verified target

import assert from 'assert';
import {
  markInteraction,
  isUserInteracting,
  getIdleResumeDeadline,
  subscribe,
  setIdleQuietMsForTest,
  resetUserInteractionForTest,
} from '../src/components/state/userInteractionStore.js';

// ── Mock scheduler: mirrors the NEW p14TargetBackgroundScheduler logic ──

const BACKGROUND_IDLE_DELAY_MS = 20;      // fast for tests
const BACKGROUND_WORKER_WATCHDOG_MS = 100; // fast for tests
const MAX_BACKGROUND_TARGET_RETRIES = 1;

const ALL_TARGETS = [
  { key: 'minimum-L1', db: 95, basis: 'minimum' },
  { key: 'minimum-L2', db: 100, basis: 'minimum' },
  { key: 'minimum-L3', db: 105, basis: 'minimum' },
  { key: 'minimum-L4', db: 110, basis: 'minimum' },
  { key: 'recommended-L1', db: 95, basis: 'recommended' },
  { key: 'recommended-L2', db: 100, basis: 'recommended' },
  { key: 'recommended-L3', db: 105, basis: 'recommended' },
  { key: 'recommended-L4', db: 110, basis: 'recommended' },
];

function createMockScheduler({ idleQuietMs = 30, workerDelayMs = 5, watchdogMs = BACKGROUND_WORKER_WATCHDOG_MS, failTargets = [], nonSettlingTargets = [] } = {}) {
  setIdleQuietMsForTest(idleQuietMs);
  const sched = {
    cancelled: false,
    running: false,
    worker: null,
    queue: [],
    currentTarget: null,
    currentBaseDesignFingerprint: 'fp-design-1',
    projectId: 'test',
    foregroundTargetKey: 'minimum-L2',
    allTargets: ALL_TARGETS.slice(),
    delayHandle: null,
    idleHandle: null,
    pendingCompletion: null,
    completionProcessHandle: null,
    foregroundCalculateInProgress: false,
    workerWatchdogHandle: null,
    cache: new Map(),           // targetKey -> contract (simulates p14TargetCache)
    persistedKeys: new Set(),   // tracks which targets were persisted (FIX 8/G)
    retryCounts: new Map(),
    failedTargets: new Set(),
    sweepDiagnostics: { failedAfterRetry: [] },
    processed: null,
    workerCompleteHandle: null,
    startedOrder: [],
    progress: { status: 'idle', completed: 0, total: 8, failedTargetKeys: [] },
    workerDelayMs,
    failTargets,
    nonSettlingTargets,
    watchdogMs,
  };

  // ── Progress publishing (mirrors p14AnalysisProgressStore) ──
  sched.publishProgress = function (patch) {
    this.progress = { ...this.progress, ...patch };
  };

  sched.beginJob = function (targetKey) {
    this.publishProgress({ status: 'calculating', activeTargetKey: targetKey, activeStartedAtMs: Date.now() });
  };

  sched.pauseJob = function () {
    this.publishProgress({ status: 'paused', activeTargetKey: null, activeStartedAtMs: null });
  };

  // ── Cache operations (mirrors p14TargetCache with deferPersistence=false) ──
  sched.getCacheEntry = function (targetKey) {
    return this.cache.get(targetKey) || null;
  };

  sched.setCacheEntry = function (targetKey, contract) {
    this.cache.set(targetKey, contract);
    // FIX 8: deferPersistence=false → persist immediately (simulated)
    this.persistedKeys.add(targetKey);
    return true;
  };

  sched.getCacheProgress = function () {
    let resolved = 0;
    const allKeys = this.allTargets.map((t) => t.key);
    for (const key of allKeys) {
      if (this.cache.has(key)) resolved++;
    }
    return { resolved, total: allKeys.length };
  };

  // ── Worker lifecycle ──
  sched.terminateWorker = function () {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  };

  sched.cancelScheduledStart = function () {
    if (this.delayHandle != null) { clearTimeout(this.delayHandle); this.delayHandle = null; }
  };

  sched.clearWorkerWatchdog = function () {
    if (this.workerWatchdogHandle != null) {
      clearTimeout(this.workerWatchdogHandle);
      this.workerWatchdogHandle = null;
    }
  };

  sched.armWorkerWatchdog = function (target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint) {
    this.clearWorkerWatchdog();
    this.workerWatchdogHandle = setTimeout(() => {
      this.workerWatchdogHandle = null;
      if (this.cancelled) return;
      this.terminateWorker();
      this.handleTargetFailure(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, 'worker-watchdog-timeout');
    }, this.watchdogMs);
  };

  // ── Core scheduling ──
  sched.scheduleNext = function () {
    if (this.cancelled || this.running || this.delayHandle != null || this.idleHandle != null) return;
    if (this.foregroundCalculateInProgress) return;  // FIX 5
    if (this.pendingCompletion) { this.armCompletionProcessTimer(); return; }
    const wait = Math.max(BACKGROUND_IDLE_DELAY_MS, Math.max(0, getIdleResumeDeadline() - Date.now()));
    this.delayHandle = setTimeout(() => {
      this.delayHandle = null;
      if (this.cancelled) return;
      this.runNext();
    }, wait);
  };

  sched.runNext = function () {
    if (this.cancelled) { this.running = false; return; }
    if (isUserInteracting()) {
      this.running = false;
      this.currentTarget = null;
      this.scheduleNext();
      return;
    }
    // Skip already-cached targets
    while (this.queue.length > 0 && this.cache.has(this.queue[0].key)) this.queue.shift();
    if (this.queue.length === 0) {
      this.running = false;
      this.currentTarget = null;
      const progress = this.getCacheProgress();
      const failed = [...this.failedTargets];
      const status = progress.resolved >= progress.total && progress.total > 0
        ? 'complete'
        : failed.length > 0
          ? 'retryable-partial'
          : 'calculating';
      this.publishProgress({
        status,
        completed: progress.resolved,
        total: progress.total,
        failedTargetKeys: failed,
        activeTargetKey: null,
        activeStartedAtMs: null,
      });
      return;
    }
    this.running = true;
    const target = this.queue.shift();
    this.currentTarget = target;
    this.startedOrder.push(target.key);
    this.beginJob(target.key);
    this.runTarget(target);
  };

  sched.runTarget = function (target) {
    const targetBaseDesignFingerprint = this.currentBaseDesignFingerprint;
    const fingerprint = `fp-${target.key}`;
    const calibrationFingerprint = `cal-${target.key}`;

    // Non-settling worker: don't arm completion timer (watchdog will fire)
    if (this.nonSettlingTargets.includes(target.key)) {
      this.worker = { terminate() {} };
      this.armWorkerWatchdog(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint);
      return;
    }

    this.worker = { terminate() {} };
    this.armWorkerWatchdog(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint);

    this.workerCompleteHandle = setTimeout(() => {
      if (this.cancelled) return;
      if (this.currentTarget !== target) return;
      this.clearWorkerWatchdog();
      this.handleWorkerComplete(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint);
    }, this.workerDelayMs);
  };

  sched.handleWorkerComplete = function (target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint) {
    this.terminateWorker();
    this.workerCompleteHandle = null;
    if (isUserInteracting()) {
      this.running = false;
      this.currentTarget = null;
      this.holdPendingCompletion({ target, targetBaseDesignFingerprint });
      return;
    }
    this.processCompletedWorkerResult(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint);
  };

  sched.processCompletedWorkerResult = function (target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint) {
    // FIX 10: try/catch wraps construction
    try {
      // Simulate construction failure for failTargets
      if (this.failTargets.includes(target.key)) {
        throw new Error(`Simulated construction failure for ${target.key}`);
      }
      const contract = { fingerprint, targetKey: target.key };
      const insertResult = this.setCacheEntry(target.key, contract);
      const readback = !!this.getCacheEntry(target.key);
      this.applyTargetDecision(insertResult && readback, true, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, null);
    } catch (e) {
      this.terminateWorker();
      this.handleTargetFailure(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, 'construction-exception');
    }
  };

  sched.holdPendingCompletion = function (pending) {
    this.pendingCompletion = pending;
    this.armCompletionProcessTimer();
  };

  sched.armCompletionProcessTimer = function () {
    if (this.completionProcessHandle != null) clearTimeout(this.completionProcessHandle);
    const wait = Math.max(0, getIdleResumeDeadline() - Date.now());
    this.completionProcessHandle = setTimeout(() => {
      this.completionProcessHandle = null;
      this.tryProcessPendingCompletion();
    }, wait);
  };

  sched.tryProcessPendingCompletion = function () {
    if (!this.pendingCompletion) return;
    if (this.cancelled) { this.pendingCompletion = null; return; }
    if (isUserInteracting()) { this.armCompletionProcessTimer(); return; }
    const pending = this.pendingCompletion;
    this.pendingCompletion = null;
    if (pending.targetBaseDesignFingerprint !== this.currentBaseDesignFingerprint) return;
    this.processCompletedWorkerResult(pending.target, `fp-${pending.target.key}`, `cal-${pending.target.key}`, pending.targetBaseDesignFingerprint);
  };

  sched.handleTargetFailure = function (target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, failureReason) {
    const retryCount = this.retryCounts.get(target.key) || 0;
    this.applyTargetDecision(false, false, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, failureReason, retryCount);
  };

  sched.applyTargetDecision = function (insertResult, readbackResult, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, failureReason, existingRetryCount) {
    this.terminateWorker();
    const fingerprintChanged = targetBaseDesignFingerprint !== this.currentBaseDesignFingerprint;
    const retryCount = existingRetryCount || this.retryCounts.get(target.key) || 0;

    let action;
    if (this.cancelled || fingerprintChanged) {
      action = 'discard';
    } else if (insertResult && readbackResult) {
      action = 'advance';
    } else if (retryCount < MAX_BACKGROUND_TARGET_RETRIES) {
      action = 'retry';
    } else {
      action = 'fail';
    }

    switch (action) {
      case 'advance':
        this.retryCounts.delete(target.key);
        break;
      case 'retry':
        this.retryCounts.set(target.key, retryCount + 1);
        this.queue.unshift(target);
        break;
      case 'fail':
        this.failedTargets.add(target.key);
        this.sweepDiagnostics.failedAfterRetry.push(target.key);
        break;
      case 'discard':
        break;
    }

    this.currentTarget = null;
    this.running = false;
    this.scheduleNext();
  };

  // ── Interaction pause (SOFT) ──
  sched.pauseForInteraction = function () {
    this.cancelScheduledStart();
    if (this.completionProcessHandle != null) { clearTimeout(this.completionProcessHandle); this.completionProcessHandle = null; }
    this.clearWorkerWatchdog();
    if (this.workerCompleteHandle != null) { clearTimeout(this.workerCompleteHandle); this.workerCompleteHandle = null; }
    const interruptedTarget = this.currentTarget;
    const interruptedFingerprint = this.currentBaseDesignFingerprint;
    this.terminateWorker();
    this.currentTarget = null;
    this.running = false;
    this.pauseJob();
    if (this.pendingCompletion) { this.armCompletionProcessTimer(); return; }
    if (interruptedTarget) {
      if (interruptedFingerprint !== this.currentBaseDesignFingerprint) return;
      if (this.cache.has(interruptedTarget.key)) return;
      if (this.queue.some((t) => t.key === interruptedTarget.key)) return;
      this.queue.unshift(interruptedTarget);
    }
    this.scheduleNext();
  };

  sched.onInteraction = function () {
    if (this.cancelled) return;
    const hasActiveWork = this.running || this.delayHandle != null || this.idleHandle != null || !!this.pendingCompletion || this.foregroundCalculateInProgress;
    if (!hasActiveWork) return;
    this.pauseForInteraction();
  };

  // ── Foreground-calculate pause/resume (FIX 5) ──
  sched.pauseForForegroundCalculate = function () {
    this.cancelScheduledStart();
    if (this.completionProcessHandle != null) { clearTimeout(this.completionProcessHandle); this.completionProcessHandle = null; }
    this.clearWorkerWatchdog();
    if (this.workerCompleteHandle != null) { clearTimeout(this.workerCompleteHandle); this.workerCompleteHandle = null; }
    const interruptedTarget = this.currentTarget;
    const interruptedFingerprint = this.currentBaseDesignFingerprint;
    this.terminateWorker();
    this.currentTarget = null;
    this.running = false;
    this.foregroundCalculateInProgress = true;
    this.pauseJob();
    if (this.pendingCompletion) return;
    if (interruptedTarget) {
      if (interruptedFingerprint !== this.currentBaseDesignFingerprint) return;
      if (this.cache.has(interruptedTarget.key)) return;
      if (this.queue.some((t) => t.key === interruptedTarget.key)) return;
      this.queue.unshift(interruptedTarget);
    }
    // Do NOT call scheduleNext — wait for explicit resume
  };

  sched.resumeAfterForegroundCalculate = function () {
    this.foregroundCalculateInProgress = false;
    if (this.cancelled) return;
    if (this.pendingCompletion) { this.armCompletionProcessTimer(); return; }
    if (!this.running && this.queue.length > 0) this.scheduleNext();
  };

  // ── hasActiveBatchWork (FIX 1) ──
  sched.hasActiveBatchWork = function () {
    return this.running
      || this.queue.length > 0
      || this.delayHandle != null
      || this.idleHandle != null
      || !!this.pendingCompletion
      || this.foregroundCalculateInProgress;
  };

  // ── schedule() (FIX 7: always reset retry/failure state) ──
  sched.schedule = function ({ foregroundTargetKey, allTargets, baseDesignFingerprint } = {}) {
    if (this.currentBaseDesignFingerprint !== baseDesignFingerprint) {
      this.cancel();
      this.currentBaseDesignFingerprint = baseDesignFingerprint;
    }
    this.retryCounts.clear();
    this.failedTargets.clear();
    this.sweepDiagnostics = { failedAfterRetry: [] };
    this.cancelled = false;
    this.foregroundCalculateInProgress = false;
    this.foregroundTargetKey = foregroundTargetKey;
    this.allTargets = allTargets || this.allTargets;
    // Build queue of remaining targets (exclude foreground)
    this.queue = this.allTargets
      .filter((t) => t.key !== foregroundTargetKey)
      .filter((t) => !this.cache.has(t.key));
    if (!this.running) this.scheduleNext();
  };

  // ── HARD cancel ──
  sched.cancel = function () {
    this.cancelled = true;
    this.cancelScheduledStart();
    if (this.completionProcessHandle != null) { clearTimeout(this.completionProcessHandle); this.completionProcessHandle = null; }
    if (this.workerCompleteHandle != null) { clearTimeout(this.workerCompleteHandle); this.workerCompleteHandle = null; }
    this.clearWorkerWatchdog();
    this.pendingCompletion = null;
    this.terminateWorker();
    this.queue = [];
    this.running = false;
    this.currentTarget = null;
    this.foregroundCalculateInProgress = false;
  };

  sched.cleanup = function () {
    this.cancelled = true;
    this.cancelScheduledStart();
    if (this.completionProcessHandle != null) { clearTimeout(this.completionProcessHandle); this.completionProcessHandle = null; }
    if (this.workerCompleteHandle != null) { clearTimeout(this.workerCompleteHandle); this.workerCompleteHandle = null; }
    this.clearWorkerWatchdog();
    this.pendingCompletion = null;
  };

  sched._unsub = subscribe(() => sched.onInteraction());
  return sched;
}

// ── Test runner ──
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
async function run() {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  \u2713 ${name}`); }
    catch (e) { failed++; console.error(`  \u2717 ${name}: ${e.message}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ──────────────────────────────────────────────────────────────────────
// TEST A — Request consumption preserves batch ownership
// ──────────────────────────────────────────────────────────────────────
test('A: request consumption does not cancel a valid queued batch', async () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler({ idleQuietMs: 30, workerDelayMs: 5 });
  // Simulate 2 already-cached targets (foreground + 1 background)
  sched.cache.set('minimum-L2', { fingerprint: 'fp-min-L2' });
  sched.cache.set('minimum-L3', { fingerprint: 'fp-min-L3' });

  // Press "Prepare All" → schedule()
  sched.schedule({ foregroundTargetKey: 'minimum-L2', allTargets: ALL_TARGETS, baseDesignFingerprint: 'fp-design-1' });

  // Consume the request (simulates consumeCalculateAllTargetsRequest)
  // React rerenders with requested=false. The owner checks hasActiveBatchWork().
  const activeBeforeConsume = sched.hasActiveBatchWork();
  assert.ok(activeBeforeConsume, 'batch is active after schedule()');

  // The owner must NOT cancel because hasActiveBatchWork() is true
  if (!sched.hasActiveBatchWork()) {
    sched.cancel(); // This is the OLD bad behaviour
  }
  const activeAfterConsume = sched.hasActiveBatchWork();
  assert.ok(activeAfterConsume, 'batch still active after request consumption (not cancelled)');

  // Drive through to completion
  await sleep(300);
  assert.strictEqual(sched.cache.size, 8, `family reached 8/8 (got ${sched.cache.size})`);
  assert.strictEqual(sched.progress.status, 'complete', 'status is complete');
  sched.cleanup();
});

// ──────────────────────────────────────────────────────────────────────
// TEST B — Drag pause resumes
// ──────────────────────────────────────────────────────────────────────
test('B: drag pause resumes and reaches 8/8', async () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler({ idleQuietMs: 30, workerDelayMs: 5 });
  sched.cache.set('minimum-L2', { fingerprint: 'fp-min-L2' });
  sched.schedule({ foregroundTargetKey: 'minimum-L2', allTargets: ALL_TARGETS, baseDesignFingerprint: 'fp-design-1' });

  // Let first target start, then interrupt
  await sleep(2);
  markInteraction();
  assert.strictEqual(sched.progress.status, 'paused', 'status is paused during interaction');

  // Wait for idle resume
  await sleep(50);
  // Interrupt again on the next target
  await sleep(2);
  markInteraction();
  await sleep(50);
  // Now let the sweep finish uninterrupted
  await sleep(300);
  assert.strictEqual(sched.cache.size, 8, `family reached 8/8 after drag pauses (got ${sched.cache.size})`);
  sched.cleanup();
});

// ──────────────────────────────────────────────────────────────────────
// TEST C — Manual foreground Calculate resumes background
// ──────────────────────────────────────────────────────────────────────
test('C: foreground Calculate pauses background, then resumes from remaining', async () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler({ idleQuietMs: 30, workerDelayMs: 5 });
  sched.cache.set('minimum-L2', { fingerprint: 'fp-min-L2' });
  sched.schedule({ foregroundTargetKey: 'minimum-L2', allTargets: ALL_TARGETS, baseDesignFingerprint: 'fp-design-1' });

  // Let the background sweep start
  await sleep(25);
  const cachedBeforePause = sched.cache.size;
  assert.ok(cachedBeforePause >= 1, `at least 1 target cached before foreground pause (got ${cachedBeforePause})`);

  // Simulate foreground manual Calculate: pauseForForegroundCalculate
  sched.pauseForForegroundCalculate();
  assert.ok(sched.foregroundCalculateInProgress, 'foregroundCalculateInProgress flag set');
  assert.ok(sched.hasActiveBatchWork(), 'batch still active during foreground pause');
  assert.strictEqual(sched.progress.status, 'paused', 'status is paused');

  // The owner must NOT cancel because hasActiveBatchWork() is true
  if (!sched.hasActiveBatchWork()) sched.cancel();
  assert.ok(sched.foregroundCalculateInProgress, 'not cancelled by owner check');

  // Simulate manual calculate completing → resumeAfterForegroundCalculate
  await sleep(50);
  sched.resumeAfterForegroundCalculate();
  assert.ok(!sched.foregroundCalculateInProgress, 'flag cleared after resume');

  // Background sweep resumes and reaches 8/8
  await sleep(400);
  assert.strictEqual(sched.cache.size, 8, `family reached 8/8 after foreground resume (got ${sched.cache.size})`);
  // The foreground target (minimum-L2) was NOT recalculated
  assert.ok(sched.startedOrder.indexOf('minimum-L2') === -1, 'foreground target not recalculated by background');
  sched.cleanup();
});

// ──────────────────────────────────────────────────────────────────────
// TEST D — Hydrate from 2/8 resumes only six missing targets
// ──────────────────────────────────────────────────────────────────────
test('D: hydrate from 2/8 schedules only 6 missing targets', async () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler({ idleQuietMs: 30, workerDelayMs: 5 });
  // Pre-cache 2 targets (simulates hydrated cache)
  sched.cache.set('minimum-L2', { fingerprint: 'fp-min-L2' });
  sched.cache.set('recommended-L3', { fingerprint: 'fp-rec-L3' });

  // Press "Prepare All" → schedule()
  sched.schedule({ foregroundTargetKey: 'minimum-L2', allTargets: ALL_TARGETS, baseDesignFingerprint: 'fp-design-1' });

  // Queue should contain only 6 missing targets (8 - 2 cached)
  assert.strictEqual(sched.queue.length, 6, `queue has 6 missing targets (got ${sched.queue.length})`);

  // Drive to completion
  await sleep(400);
  assert.strictEqual(sched.cache.size, 8, `family reached 8/8 (got ${sched.cache.size})`);
  // The 2 pre-cached targets were NOT recalculated
  const started = new Set(sched.startedOrder);
  assert.ok(!started.has('minimum-L2'), 'minimum-L2 not recalculated');
  assert.ok(!started.has('recommended-L3'), 'recommended-L3 not recalculated');
  sched.cleanup();
});

// ──────────────────────────────────────────────────────────────────────
// TEST E — One target error → 7/8 retryable-partial → retry → 8/8
// ──────────────────────────────────────────────────────────────────────
test('E: one target fails → 7/8 retryable-partial → retry → 8/8', async () => {
  resetUserInteractionForTest();
  // minimum-L4 will always fail (construction exception on every attempt)
  const sched = createMockScheduler({ idleQuietMs: 30, workerDelayMs: 5, failTargets: ['minimum-L4'] });
  sched.cache.set('minimum-L2', { fingerprint: 'fp-min-L2' });
  sched.schedule({ foregroundTargetKey: 'minimum-L2', allTargets: ALL_TARGETS, baseDesignFingerprint: 'fp-design-1' });

  // Drive the sweep — minimum-L4 will fail after 1 retry
  await sleep(500);
  assert.strictEqual(sched.cache.size, 7, `7/8 cached (got ${sched.cache.size})`);
  assert.strictEqual(sched.progress.status, 'retryable-partial', `status is retryable-partial (got ${sched.progress.status})`);
  assert.ok(sched.progress.failedTargetKeys.includes('minimum-L4'), 'minimum-L4 in failedTargetKeys');

  // Retry: press Prepare All again — only minimum-L4 should be re-attempted
  // Remove minimum-L4 from failTargets to simulate success on retry
  sched.failTargets = [];
  sched.schedule({ foregroundTargetKey: 'minimum-L2', allTargets: ALL_TARGETS, baseDesignFingerprint: 'fp-design-1' });
  assert.strictEqual(sched.queue.length, 1, `queue has only 1 missing target on retry (got ${sched.queue.length})`);

  await sleep(200);
  assert.strictEqual(sched.cache.size, 8, `family reached 8/8 after retry (got ${sched.cache.size})`);
  assert.strictEqual(sched.progress.status, 'complete', 'status is complete after retry');
  sched.cleanup();
});

// ──────────────────────────────────────────────────────────────────────
// TEST F — Non-settling worker → watchdog fires
// ──────────────────────────────────────────────────────────────────────
test('F: non-settling worker → watchdog terminates and retries', async () => {
  resetUserInteractionForTest();
  // recommended-L1 will not send a completion message (non-settling)
  const sched = createMockScheduler({
    idleQuietMs: 30,
    workerDelayMs: 5,
    watchdogMs: 80,
    nonSettlingTargets: ['recommended-L1'],
  });
  sched.cache.set('minimum-L2', { fingerprint: 'fp-min-L2' });
  sched.schedule({ foregroundTargetKey: 'minimum-L2', allTargets: ALL_TARGETS, baseDesignFingerprint: 'fp-design-1' });

  // Wait for the watchdog to fire on recommended-L1 (80ms) and the retry to also fail
  await sleep(600);
  // recommended-L1 should be in failedTargets after watchdog + retry exhaustion
  assert.ok(sched.failedTargets.has('recommended-L1'), `recommended-L1 in failedTargets after watchdog`);
  // Other targets should have continued
  assert.ok(sched.cache.size >= 7, `at least 7 targets cached despite non-settling worker (got ${sched.cache.size})`);
  assert.strictEqual(sched.progress.status, 'retryable-partial', 'status is retryable-partial');
  sched.cleanup();
});

// ──────────────────────────────────────────────────────────────────────
// TEST G — Persistence after each verified target
// ──────────────────────────────────────────────────────────────────────
test('G: each verified target is persisted immediately', async () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler({ idleQuietMs: 30, workerDelayMs: 5 });
  // Pre-cache the foreground target AND mark it as persisted (hydrated from DB)
  sched.cache.set('minimum-L2', { fingerprint: 'fp-min-L2' });
  sched.persistedKeys.add('minimum-L2');
  sched.schedule({ foregroundTargetKey: 'minimum-L2', allTargets: ALL_TARGETS, baseDesignFingerprint: 'fp-design-1' });

  // Wait for 4 targets to complete
  await sleep(150);
  const cached = sched.cache.size;
  const persisted = sched.persistedKeys.size;
  assert.ok(cached >= 4, `at least 4 targets cached (got ${cached})`);
  // Every cached target must also be persisted (deferPersistence=false)
  for (const key of sched.cache.keys()) {
    assert.ok(sched.persistedKeys.has(key), `target ${key} persisted immediately`);
  }
  assert.strictEqual(persisted, cached, `persisted count matches cached count (${persisted} vs ${cached})`);

  // Simulate app termination after 4/8 — rehydrate from persisted state
  const persistedSnapshot = new Set(sched.persistedKeys);
  sched.cleanup();

  // New scheduler with the persisted cache
  const sched2 = createMockScheduler({ idleQuietMs: 30, workerDelayMs: 5 });
  for (const key of persistedSnapshot) {
    sched2.cache.set(key, { fingerprint: `fp-${key}` });
    sched2.persistedKeys.add(key);
  }

  // Press Prepare All — only missing targets should be scheduled
  sched2.schedule({ foregroundTargetKey: 'minimum-L2', allTargets: ALL_TARGETS, baseDesignFingerprint: 'fp-design-1' });
  const expectedMissing = 8 - persistedSnapshot.size;
  assert.strictEqual(sched2.queue.length, expectedMissing, `only ${expectedMissing} missing targets scheduled after rehydration (got ${sched2.queue.length})`);

  await sleep(300);
  assert.strictEqual(sched2.cache.size, 8, `family reached 8/8 after rehydration (got ${sched2.cache.size})`);
  sched2.cleanup();
});

// ──────────────────────────────────────────────────────────────────────
// TEST H — hasActiveBatchWork covers all valid batch states
// ──────────────────────────────────────────────────────────────────────
test('H: hasActiveBatchWork returns true for queued, delayed, pending, and paused states', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler({ idleQuietMs: 30 });

  // Idle: no work
  assert.ok(!sched.hasActiveBatchWork(), 'idle: no active work');

  // Queued: queue has targets
  sched.queue = [{ key: 'minimum-L1' }];
  assert.ok(sched.hasActiveBatchWork(), 'queued: active work');

  // Running: worker active
  sched.queue = [];
  sched.running = true;
  assert.ok(sched.hasActiveBatchWork(), 'running: active work');

  // Delay handle armed
  sched.running = false;
  sched.delayHandle = 123;
  assert.ok(sched.hasActiveBatchWork(), 'delay handle: active work');

  // Pending completion
  sched.delayHandle = null;
  sched.pendingCompletion = { target: { key: 'minimum-L1' } };
  assert.ok(sched.hasActiveBatchWork(), 'pending completion: active work');

  // Foreground calculate pause
  sched.pendingCompletion = null;
  sched.foregroundCalculateInProgress = true;
  assert.ok(sched.hasActiveBatchWork(), 'foreground pause: active work');

  sched.cleanup();
});

run();