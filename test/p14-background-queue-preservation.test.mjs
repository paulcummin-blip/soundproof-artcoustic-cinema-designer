// Regression tests for interrupted-target queue preservation on SOFT pause.
//
// Verifies that a speculative P14 background target interrupted by a user
// interaction is REQUEUED at the front (not lost), so the family reaches 8/8
// instead of stalling at 5/8. Also verifies:
//   - SOFT pause (interaction) requeues; HARD cancel (fingerprint change) does not.
//   - Interaction is NOT counted as a retry failure.
//   - No duplicate target (queued + pending + running are mutually exclusive).
//   - Completed cache entries are never cleared by a soft pause.
//   - 3-second idle resume restarts the interrupted target first.
//   - Repeated interactions keep exactly one queue entry and reset the timer.
//   - Eventual family: 1/8 interrupted several times still reaches 8/8.
//
// The interaction store is imported directly (no @/ deps). The scheduler's
// decision logic is exercised via a mock that mirrors the REAL
// p14TargetBackgroundScheduler pause/requeue/idle-resume logic (the real
// module pulls @/ aliases Node cannot resolve).

import assert from 'assert';
import {
  markInteraction,
  isUserInteracting,
  getIdleResumeDeadline,
  subscribe,
  setIdleQuietMsForTest,
  resetUserInteractionForTest,
} from '../src/components/state/userInteractionStore.js';

// ── Mock scheduler: mirrors the NEW requeue-on-soft-pause logic ──

function createMockScheduler({ idleQuietMs = 30, targets } = {}) {
  setIdleQuietMsForTest(idleQuietMs);
  const allTargets = targets || [
    { key: 'minimum-L3' }, { key: 'minimum-L4' }, { key: 'recommended-L3' },
    { key: 'recommended-L4' }, { key: 'reference-L3' }, { key: 'reference-L4' },
    { key: 'studio-L3' }, { key: 'studio-L4' },
  ];
  const sched = {
    cancelled: false,
    running: false,
    worker: null,
    queue: allTargets.slice(),
    currentTarget: null,
    currentBaseDesignFingerprint: 'fp-design-1',
    projectId: 'test',
    delayHandle: null,
    pendingCompletion: null,
    completionProcessHandle: null,
    cache: new Map(),
    retryCounts: new Map(),
    processed: null,
    workerCompleteHandle: null,
    startedOrder: [],
  };

  sched.terminateWorker = function () {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
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
    if (this.cancelled) return;
    while (this.queue.length > 0 && this.cache.has(this.queue[0].key)) this.queue.shift();
    if (this.queue.length === 0) { this.running = false; this.currentTarget = null; return; }
    this.running = true;
    this.currentTarget = this.queue.shift();
    this.startedOrder.push(this.currentTarget.key);
    this.worker = { terminate() {} };
    const tgt = this.currentTarget;
    this.workerCompleteHandle = setTimeout(() => {
      if (this.cancelled) return;
      if (this.currentTarget !== tgt) return; // interrupted before completion
      this.handleWorkerComplete(tgt);
    }, 5);
  };
  sched.handleWorkerComplete = function (target) {
    this.terminateWorker();
    this.workerCompleteHandle = null;
    if (isUserInteracting()) {
      this.running = false;
      this.currentTarget = null;
      this.holdPendingCompletion({ target, targetBaseDesignFingerprint: this.currentBaseDesignFingerprint });
      return;
    }
    this.processCompletedWorkerResult(target);
  };
  sched.processCompletedWorkerResult = function (target) {
    this.cache.set(target.key, { fingerprint: 'fp-' + target.key });
    this.processed = target;
    this.currentTarget = null;
    this.running = false;
    this.scheduleNext();
  };
  sched.pauseForInteraction = function () {
    this.cancelScheduledStart();
    if (this.workerCompleteHandle != null) { clearTimeout(this.workerCompleteHandle); this.workerCompleteHandle = null; }
    if (this.completionProcessHandle != null) { clearTimeout(this.completionProcessHandle); this.completionProcessHandle = null; }
    const interruptedTarget = this.currentTarget;
    const interruptedFingerprint = this.currentBaseDesignFingerprint;
    this.terminateWorker();
    this.currentTarget = null;
    this.running = false;
    if (this.pendingCompletion) { this.armCompletionProcessTimer(); return; }
    if (interruptedTarget) {
      // Mirror requeueInterruptedTargetOnSoftPause guards.
      if (interruptedFingerprint !== this.currentBaseDesignFingerprint) return;
      if (this.cache.has(interruptedTarget.key)) return;
      if (this.queue.some((t) => t.key === interruptedTarget.key)) return;
      if (this.pendingCompletion && this.pendingCompletion.target?.key === interruptedTarget.key) return;
      this.queue.unshift(interruptedTarget);
    }
    this.scheduleNext();
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
    if (pending.targetBaseDesignFingerprint !== this.currentBaseDesignFingerprint) return;
    this.processCompletedWorkerResult(pending.target);
  };
  // HARD cancel: design/project change. Queue is cleared; old target NOT requeued.
  sched.cancel = function () {
    this.cancelled = true;
    this.cancelScheduledStart();
    if (this.workerCompleteHandle != null) { clearTimeout(this.workerCompleteHandle); this.workerCompleteHandle = null; }
    if (this.completionProcessHandle != null) { clearTimeout(this.completionProcessHandle); this.completionProcessHandle = null; }
    this.pendingCompletion = null;
    this.terminateWorker();
    this.queue = [];
    this.running = false;
    this.currentTarget = null;
  };
  sched.cleanup = function () {
    this.cancelled = true;
    this.cancelScheduledStart();
    if (this.workerCompleteHandle != null) { clearTimeout(this.workerCompleteHandle); this.workerCompleteHandle = null; }
    if (this.completionProcessHandle != null) { clearTimeout(this.completionProcessHandle); this.completionProcessHandle = null; }
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

// A. current target running + pointer pause → requeued at front
test('A: pointer pause requeues current target at front', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.queue = [{ key: 'minimum-L4' }, { key: 'recommended-L3' }];
  sched.currentTarget = { key: 'minimum-L3' };
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction();
  assert.strictEqual(sched.queue[0].key, 'minimum-L3', 'interrupted target requeued at front');
  assert.strictEqual(sched.running, false, 'running cleared');
  sched.cleanup();
});

// B. current target running + keydown → requeued at front
test('B: keydown pause requeues current target at front', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.queue = [{ key: 'minimum-L4' }];
  sched.currentTarget = { key: 'minimum-L3' };
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction(); // keydown
  assert.strictEqual(sched.queue[0].key, 'minimum-L3', 'requeued at front');
  sched.cleanup();
});

// C. target already cached before pause → do not requeue
test('C: already-cached target is not requeued', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.cache.set('minimum-L3', { fingerprint: 'fp-min-L3' });
  sched.queue = [{ key: 'minimum-L4' }];
  sched.currentTarget = { key: 'minimum-L3' };
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction();
  assert.ok(!sched.queue.some((t) => t.key === 'minimum-L3'), 'cached target not requeued');
  sched.cleanup();
});

// D. target already in queue → no duplicate
test('D: target already in queue is not duplicated', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.queue = [{ key: 'minimum-L4' }, { key: 'minimum-L3' }];
  sched.currentTarget = { key: 'minimum-L3' };
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction();
  const count = sched.queue.filter((t) => t.key === 'minimum-L3').length;
  assert.strictEqual(count, 1, 'exactly one queue entry');
  assert.strictEqual(sched.queue[1].key, 'minimum-L3', 'existing entry preserved (not moved)');
  sched.cleanup();
});

// E. pendingCompletion exists → do not also requeue
test('E: pending completion prevents requeue (no duplicate)', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.queue = [{ key: 'minimum-L4' }];
  sched.pendingCompletion = { target: { key: 'minimum-L3' }, targetBaseDesignFingerprint: 'fp-design-1' };
  sched.currentTarget = null; // pendingCompletion implies currentTarget null
  sched.running = false;
  markInteraction();
  assert.ok(!sched.queue.some((t) => t.key === 'minimum-L3'), 'not requeued while pending exists');
  assert.ok(sched.pendingCompletion, 'pending preserved');
  sched.cleanup();
});

// F. soft pause → retryCount unchanged
test('F: soft pause does not increment retry count', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.retryCounts.set('minimum-L3', 0);
  sched.queue = [{ key: 'minimum-L4' }];
  sched.currentTarget = { key: 'minimum-L3' };
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction();
  assert.strictEqual(sched.retryCounts.get('minimum-L3'), 0, 'retry count unchanged by interaction');
  assert.strictEqual(sched.queue[0].key, 'minimum-L3', 'but target was requeued');
  sched.cleanup();
});

// G. hard cancel after fingerprint change → old target NOT requeued
test('G: hard cancel does not requeue old target', () => {
  resetUserInteractionForTest();
  const sched = createMockScheduler();
  sched.queue = [{ key: 'minimum-L4' }];
  sched.currentTarget = { key: 'minimum-L3' };
  sched.running = true;
  sched.worker = { terminate() {} };
  // Simulate design change → hard cancel (mirrors schedule() detecting a new fingerprint)
  sched.currentBaseDesignFingerprint = 'fp-design-2';
  sched.cancel();
  assert.strictEqual(sched.queue.length, 0, 'queue cleared by hard cancel');
  assert.ok(!sched.queue.some((t) => t.key === 'minimum-L3'), 'old target not requeued against new fingerprint');
  sched.cleanup();
});

// H. 3-second resume → interrupted target starts first
test('H: idle resume restarts interrupted target first', async () => {
  resetUserInteractionForTest();
  setIdleQuietMsForTest(40);
  const sched = createMockScheduler({ idleQuietMs: 40 });
  sched.queue = [{ key: 'minimum-L4' }, { key: 'recommended-L3' }];
  // Start the sweep: runNext picks minimum-L4
  sched.runNext();
  assert.strictEqual(sched.currentTarget.key, 'minimum-L4', 'first target started');
  // Interrupt before the 5ms worker completes
  markInteraction();
  assert.strictEqual(sched.running, false, 'paused');
  assert.strictEqual(sched.queue[0].key, 'minimum-L4', 'interrupted target requeued at front');
  // Wait for idle + resume
  await new Promise((r) => setTimeout(r, 70)); // idle > 40ms → scheduleNext timer fires → runNext
  assert.ok(!isUserInteracting(), 'idle now');
  await new Promise((r) => setTimeout(r, 15)); // let runNext execute
  assert.strictEqual(sched.startedOrder[0], 'minimum-L4', 'interrupted target restarted first');
  sched.cleanup();
});

// I. repeated interactions → one queue entry, timer resets, no duplicates
test('I: repeated interactions keep one entry and reset timer', async () => {
  resetUserInteractionForTest();
  setIdleQuietMsForTest(60);
  const sched = createMockScheduler({ idleQuietMs: 60 });
  sched.queue = [{ key: 'minimum-L4' }];
  sched.currentTarget = { key: 'minimum-L3' };
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction();
  const deadline1 = getIdleResumeDeadline();
  await new Promise((r) => setTimeout(r, 20));
  // Second interaction before idle — requeue guard sees target already in queue
  sched.currentTarget = { key: 'minimum-L3' }; // simulate it restarted briefly
  sched.running = true;
  sched.worker = { terminate() {} };
  markInteraction();
  const deadline2 = getIdleResumeDeadline();
  assert.ok(deadline2 > deadline1, 'timer reset by new interaction');
  const count = sched.queue.filter((t) => t.key === 'minimum-L3').length;
  assert.strictEqual(count, 1, 'exactly one queue entry after repeated interactions');
  sched.cleanup();
});

// J. eventual family: 1/8 → interrupted several times → still 8/8
test('J: interrupted sweep still reaches 8/8', async () => {
  resetUserInteractionForTest();
  setIdleQuietMsForTest(30);
  const sched = createMockScheduler({ idleQuietMs: 30 });
  // Pre-cache the foreground target (1/8 already done)
  sched.cache.set('minimum-L3', { fingerprint: 'fp-min-L3' });
  sched.queue = [
    { key: 'minimum-L4' }, { key: 'recommended-L3' }, { key: 'recommended-L4' },
    { key: 'reference-L3' }, { key: 'reference-L4' }, { key: 'studio-L3' }, { key: 'studio-L4' },
  ];
  sched.scheduleNext();
  // Let the first target start, then interrupt
  await new Promise((r) => setTimeout(r, 2));
  markInteraction();
  await new Promise((r) => setTimeout(r, 50)); // idle resume
  // Interrupt again on the next target
  await new Promise((r) => setTimeout(r, 2));
  markInteraction();
  await new Promise((r) => setTimeout(r, 50));
  // Interrupt a third time
  await new Promise((r) => setTimeout(r, 2));
  markInteraction();
  // Now let the sweep finish uninterrupted
  await new Promise((r) => setTimeout(r, 200));
  assert.strictEqual(sched.cache.size, 8, `family reached 8/8 (got ${sched.cache.size})`);
  sched.cleanup();
});

run();