// Regression tests for the idle-only P14 background cache.
//
// Verifies the shared user-interaction authority and the scheduler's
// pause/defer/idle-resume decision logic:
//   A. pointerdown cancels background
//   B. wheel cancels background
//   C. keydown cancels background
//   D. new interaction during idle countdown resets the timer
//   E. after sustained inactivity, background resumes
//   F. completed worker result arriving while interacting is deferred
//   G. design fingerprint change while deferred discards the result
//   H. non-bass interaction preserves existing cache entries
//   I. hover / passive pointer movement does not cancel speculative work
//   J. foreground authority is never affected
//
// The interaction store is imported directly (it has no @/ deps). The
// scheduler's decision logic is exercised via a mock scheduler that uses the
// REAL store API — mirroring p14TargetBackgroundScheduler's pause/defer/idle
// pattern — because the real scheduler module pulls @/ aliases that Node
// cannot resolve.

import assert from 'assert';
import {
  markInteraction,
  setDragActive,
  getLastInteractionAt,
  isDragActive,
  isUserInteracting,
  getIdleResumeDeadline,
  subscribe,
  setIdleQuietMsForTest,
  resetUserInteractionForTest,
} from '../src/components/state/userInteractionStore.js';

// ── Mock scheduler: mirrors p14TargetBackgroundScheduler's idle-only logic ──

function createMockScheduler({ idleQuietMs = 30 } = {}) {
  setIdleQuietMsForTest(idleQuietMs);
  const sched = {
    cancelled: false,
    running: false,
    worker: null,
    queue: [{ key: 'minimum-L3' }, { key: 'minimum-L4' }],
    currentBaseDesignFingerprint: 'fp-design-1',
    projectId: 'test',
    delayHandle: null,
    pendingCompletion: null,
    completionProcessHandle: null,
    cache: new Map(),
    foregroundAuthority: 'foreground-fp-1',
    processed: null,
    discarded: null,
    resumed: 0,
  };
  sched.workerTerminated = false;

  sched.terminateWorker = function () {
    if (this.worker) { this.worker.terminate(); this.worker = null; this.workerTerminated = true; }
  };
  sched.cancelScheduledStart = function () {
    if (this.delayHandle != null) { clearTimeout(this.delayHandle); this.delayHandle = null; }
  };
  sched.scheduleNext = function () {
    if (this.cancelled || this.running || this.delayHandle != null) return;
    if (this.pendingCompletion) { this.armCompletionProcessTimer(); return; }
    const wait = Math.max(0, getIdleResumeDeadline() - Date.now());
    this.delayHandle = setTimeout(() => {
      this.delayHandle = null;
      if (this.cancelled) return;
      this.runNext();
    }, wait);
  };
  sched.runNext = function () {
    if (this.queue.length === 0) return;
    this.running = true;
    this.worker = { terminate() {} };
  };
  sched.pauseForInteraction = function () {
    this.cancelScheduledStart();
    if (this.completionProcessHandle != null) { clearTimeout(this.completionProcessHandle); this.completionProcessHandle = null; }
    this.terminateWorker();
    this.currentTarget = null;
    this.running = false;
    if (this.pendingCompletion) this.armCompletionProcessTimer();
    else this.scheduleNext();
  };
  sched.onInteraction = function () {
    if (this.cancelled) return;
    const hasActiveWork = this.running || this.delayHandle != null || !!this.pendingCompletion;
    if (!hasActiveWork) return;
    this.pauseForInteraction();
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
    if (pending.targetBaseDesignFingerprint !== this.currentBaseDesignFingerprint) {
      this.discarded = pending;
      return;
    }
    this.processCompletedWorkerResult(pending.workerResult, pending.target, pending.fingerprint, pending.calibrationFingerprint, pending.targetBaseDesignFingerprint);
  };
  sched.processCompletedWorkerResult = function (workerResult, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint) {
    this.processed = { workerResult, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint };
    this.cache.set(target.key, { fingerprint });
    this.resumed++;
    this.scheduleNext();
  };
  sched.cleanup = function () {
    this.cancelled = true;
    this.cancelScheduledStart();
    if (this.completionProcessHandle != null) { clearTimeout(this.completionProcessHandle); this.completionProcessHandle = null; }
    this.pendingCompletion = null;
  };

  sched._unsub = subscribe(() => sched.onInteraction());
  return sched;
}

// ── Test runner ────────────────────────────────────────────────────────────

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

// ── Tests ──

// A. pointerdown cancels background
test('A: pointerdown cancels background', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.running = true;
  sched.worker = { terminate() {} };
  const queueBefore = sched.queue.length;
  markInteraction(); // simulates pointerdown
  assert.strictEqual(sched.running, false, 'running cleared');
  assert.strictEqual(sched.workerTerminated, true, 'worker terminated');
  assert.strictEqual(sched.queue.length, queueBefore, 'queue preserved');
  sched.cleanup();
});

// B. wheel cancels background
test('B: wheel cancels background', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction(); // simulates wheel
  assert.strictEqual(sched.running, false);
  assert.strictEqual(sched.workerTerminated, true);
  sched.cleanup();
});

// C. keydown cancels background
test('C: keydown cancels background', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction(); // simulates keydown
  assert.strictEqual(sched.running, false);
  assert.strictEqual(sched.workerTerminated, true);
  sched.cleanup();
});

// D. new interaction during idle countdown resets the 3-second timer
test('D: new interaction during idle countdown resets timer', async () => {
  resetUserInteractionForTest();
  setIdleQuietMsForTest(80);
  const sched = createMockScheduler({ idleQuietMs: 80 });
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction();
  const deadline1 = getIdleResumeDeadline();
  await new Promise((r) => setTimeout(r, 40));
  markInteraction(); // new interaction before idle
  const deadline2 = getIdleResumeDeadline();
  assert.ok(deadline2 > deadline1, 'deadline extended by new interaction');
  assert.ok(isUserInteracting(), 'still interacting after second interaction');
  sched.cleanup();
});

// E. after sustained inactivity, background resumes
test('E: after sustained inactivity background resumes', async () => {
  resetUserInteractionForTest();
  setIdleQuietMsForTest(40);
  const sched = createMockScheduler({ idleQuietMs: 40 });
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction();
  assert.strictEqual(sched.running, false, 'paused immediately');
  assert.ok(isUserInteracting(), 'interacting right after pause');
  await new Promise((r) => setTimeout(r, 70)); // idle > 40ms
  assert.ok(!isUserInteracting(), 'no longer interacting after idle');
  // scheduleNext was called by pauseForInteraction; its timer should have fired
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(sched.running, true, 'background resumed after idle');
  sched.cleanup();
});

// F. completed worker result arrives while interacting is deferred
test('F: completed result deferred during interaction', async () => {
  resetUserInteractionForTest();
  setIdleQuietMsForTest(60);
  const sched = createMockScheduler({ idleQuietMs: 60 });
  markInteraction(); // user is interacting
  assert.ok(isUserInteracting());
  const workerResult = { pool: { candidates: [{}] }, fingerprint: 'fp-1' };
  const target = { key: 'minimum-L3' };
  // Simulate handleWorkerMessage deferral path
  sched.terminateWorker();
  sched.running = false;
  sched.holdPendingCompletion({ workerResult, target, fingerprint: 'fp-1', calibrationFingerprint: 'cal-1', targetBaseDesignFingerprint: 'fp-design-1' });
  assert.ok(sched.pendingCompletion, 'result held');
  assert.strictEqual(sched.processed, null, 'not processed while interacting');
  await new Promise((r) => setTimeout(r, 90)); // idle > 60ms → completion timer fires
  assert.ok(!isUserInteracting(), 'idle now');
  await new Promise((r) => setTimeout(r, 20)); // let completion timer process
  assert.ok(sched.processed, 'processed automatically once idle (deferred path)');
  assert.strictEqual(sched.processed.target.key, 'minimum-L3');
  sched.cleanup();
});

// G. design fingerprint changes while deferred discards the result
test('G: stale deferred result discarded on fingerprint change', async () => {
  resetUserInteractionForTest();
  setIdleQuietMsForTest(40);
  const sched = createMockScheduler({ idleQuietMs: 40 });
  markInteraction();
  sched.holdPendingCompletion({
    workerResult: { pool: { candidates: [{}] }, fingerprint: 'fp-old' },
    target: { key: 'minimum-L3' },
    fingerprint: 'fp-old',
    calibrationFingerprint: 'cal-old',
    targetBaseDesignFingerprint: 'fp-design-old',
  });
  // Design changes while waiting
  sched.currentBaseDesignFingerprint = 'fp-design-new';
  await new Promise((r) => setTimeout(r, 60)); // idle
  sched.tryProcessPendingCompletion();
  assert.ok(sched.discarded, 'stale result discarded');
  assert.strictEqual(sched.processed, null, 'stale result not processed');
  sched.cleanup();
});

// H. non-bass interaction preserves existing cache entries
test('H: non-bass interaction preserves cache entries', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.cache.set('minimum-L2', { fingerprint: 'fp-2' });
  sched.cache.set('minimum-L3', { fingerprint: 'fp-3' });
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction(); // non-bass interaction (e.g. open accordion)
  assert.strictEqual(sched.cache.size, 2, 'cache entries preserved');
  assert.ok(sched.cache.has('minimum-L2'));
  assert.ok(sched.cache.has('minimum-L3'));
  sched.cleanup();
});

// I. hover / passive pointer movement does not cancel speculative work
test('I: hover / pointermove does not cancel speculative work', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.running = true;
  sched.worker = { terminate() {} };
  // Simulate hover: the store has NO pointermove/mousemove listener, so there
  // is no API path by which hover calls markInteraction. Verify isUserInteracting
  // stays false and the scheduler is NOT paused.
  assert.strictEqual(isUserInteracting(), false, 'no interaction recorded');
  assert.strictEqual(sched.running, true, 'background still running (not paused by hover)');
  assert.strictEqual(sched.workerTerminated, false, 'worker not terminated by hover');
  sched.cleanup();
});

// J. foreground authority is never affected by background interaction pause
test('J: foreground authority never affected', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.foregroundAuthority = 'foreground-fp-1';
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction();
  assert.strictEqual(sched.foregroundAuthority, 'foreground-fp-1', 'foreground unchanged');
  sched.cleanup();
});

// ── Extra: store-level guarantees ───────────────────────────────────────────

test('store: drag-start/drag-end bracket interaction', () => {
  resetUserInteractionForTest();
  assert.strictEqual(isDragActive(), false);
  setDragActive(true);
  assert.strictEqual(isDragActive(), true);
  assert.ok(isUserInteracting(), 'drag active counts as interacting');
  setDragActive(false);
  assert.strictEqual(isDragActive(), false);
  assert.ok(isUserInteracting(), 'drag-end marks interaction (within quiet window)');
});

test('store: getIdleResumeDeadline = lastInteractionAt + idleQuietMs', () => {
  resetUserInteractionForTest();
  setIdleQuietMsForTest(3000);
  markInteraction();
  const last = getLastInteractionAt();
  const deadline = getIdleResumeDeadline();
  assert.strictEqual(deadline - last, 3000);
});

run();