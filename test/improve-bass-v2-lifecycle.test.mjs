// improve-bass-v2-lifecycle.test.mjs
// V2 Improve Bass Response lifecycle safety tests.
//
// Tests cancellation, per-call timeout, whole-run timeout, single-settlement,
// cleanup, race conditions, and error classification using the runInWorker
// helper in isolation (no real Worker instantiation).
//
// Run: node --test test/improve-bass-v2-lifecycle.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

const {
  runInWorker,
  isFatalLifecycleError,
  V2AbortError,
  V2TimeoutError,
  V2RunTimeoutError,
} = await import("../src/components/room/bass/improveBassV2/improveBassV2WorkerLifecycle.js");

const { V2RuntimeMetrics } =
  await import("../src/components/room/bass/improveBassV2/improveBassV2RuntimeMetrics.js");

// ---------------------------------------------------------------------------
// Mock worker — lightweight EventTarget with terminate tracking
// ---------------------------------------------------------------------------

class MockWorker {
  constructor() {
    this._listeners = {};
    this.terminated = false;
    this.postMessageCalls = [];
  }
  addEventListener(type, listener) {
    if (!this._listeners[type]) this._listeners[type] = new Set();
    this._listeners[type].add(listener);
  }
  removeEventListener(type, listener) {
    if (this._listeners[type]) this._listeners[type].delete(listener);
  }
  dispatchEvent(event) {
    const type = event.type;
    if (this._listeners[type]) {
      for (const listener of [...this._listeners[type]]) {
        listener(event);
      }
    }
    return true;
  }
  postMessage(data) {
    this.postMessageCalls.push(data);
  }
  terminate() {
    this.terminated = true;
  }
  // Helpers to simulate worker responses
  sendResult(requestId, result) {
    this.dispatchEvent({ type: "message", data: { requestId, type: "complete", result } });
  }
  sendWorkerError(requestId, errorMessage) {
    this.dispatchEvent({ type: "message", data: { requestId, type: "error", error: errorMessage } });
  }
  sendWorkerCrash() {
    this.dispatchEvent({ type: "error", message: "Worker crashed" });
  }
  listenerCount(type) {
    return this._listeners[type]?.size || 0;
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// --- Normal completion ---

test("normal completion: resolves with result, worker not terminated", async () => {
  const worker = new MockWorker();
  const promise = runInWorker(worker, "placement", { test: true });
  assert.equal(worker.postMessageCalls.length, 1, "postMessage should be called once");
  const requestId = worker.postMessageCalls[0].requestId;
  worker.sendResult(requestId, { freqsHz: [20, 30], splDb: [80, 85] });
  const result = await promise;
  assert.deepEqual(result, { freqsHz: [20, 30], splDb: [80, 85] });
  assert.equal(worker.terminated, false, "worker should NOT be terminated on normal completion");
});

// --- Cancellation before worker call ---

test("cancellation before worker call: immediate AbortError, no postMessage", async () => {
  const worker = new MockWorker();
  const controller = new AbortController();
  controller.abort(); // pre-abort
  const promise = runInWorker(worker, "placement", {}, controller.signal);
  await assert.rejects(promise, (err) => err.name === "AbortError");
  assert.equal(worker.postMessageCalls.length, 0, "no postMessage should be sent");
  assert.equal(worker.terminated, true, "worker should be terminated");
});

// --- Cancellation during active worker call ---

test("cancellation during active worker call: worker terminated, rejects as AbortError", async () => {
  const worker = new MockWorker();
  const controller = new AbortController();
  const promise = runInWorker(worker, "placement", {}, controller.signal);
  assert.equal(worker.postMessageCalls.length, 1, "postMessage was sent");
  controller.abort(); // cancel while "active"
  await assert.rejects(promise, (err) => err.name === "AbortError");
  assert.equal(worker.terminated, true, "worker should be terminated immediately");
});

// --- Cancellation between candidates ---

test("cancellation between candidates: next candidate never starts", async () => {
  const worker = new MockWorker();
  const controller = new AbortController();
  // First call completes normally
  const promise1 = runInWorker(worker, "placement", {}, controller.signal);
  const requestId1 = worker.postMessageCalls[0].requestId;
  worker.sendResult(requestId1, { data: "result1" });
  await promise1;
  // Cancel between candidates
  controller.abort();
  // Second call should reject immediately via pre-check (no new postMessage)
  const promise2 = runInWorker(worker, "placement", {}, controller.signal);
  await assert.rejects(promise2, (err) => err.name === "AbortError");
  assert.equal(worker.postMessageCalls.length, 1, "second call should NOT postMessage");
});

// --- Cancellation/result race ---

test("cancellation/result race: exactly one settlement, no late publication", async () => {
  const worker = new MockWorker();
  const controller = new AbortController();
  const promise = runInWorker(worker, "placement", {}, controller.signal);
  const requestId = worker.postMessageCalls[0].requestId;
  // Race: dispatch result AND abort simultaneously
  worker.sendResult(requestId, { data: "result" });
  controller.abort();
  let result = null;
  let error = null;
  try {
    result = await promise;
  } catch (err) {
    error = err;
  }
  // Exactly one must be set
  assert.ok(result !== null || error !== null, "exactly one settlement must occur");
  assert.ok(!(result !== null && error !== null), "both must not be set");
  // If error won, it must be AbortError and worker must be terminated
  if (error) {
    assert.equal(error.name, "AbortError");
    assert.equal(worker.terminated, true);
  }
  // Late events must not cause unhandled rejections or double-settlement
  worker.sendResult(requestId, { data: "late" });
  controller.abort(); // second abort is a no-op
});

// --- Per-call timeout ---

test("per-call timeout: worker terminated, TimeoutError, no further calls", async () => {
  const worker = new MockWorker();
  const promise = runInWorker(worker, "placement", {}, null, { timeoutMs: 50 });
  assert.equal(worker.postMessageCalls.length, 1);
  await assert.rejects(promise, (err) => err.name === "TimeoutError");
  assert.equal(worker.terminated, true, "worker must be terminated on timeout");
  // Worker is dead — no further calls can be made on it
});

// --- Whole-run timeout ---

test("whole-run timeout: V2RunTimeoutError, worker terminated", async () => {
  const worker = new MockWorker();
  const controller = new AbortController();
  const promise = runInWorker(worker, "placement", {}, controller.signal);
  controller.abort(new V2RunTimeoutError("whole-run exceeded 300000ms"));
  await assert.rejects(promise, (err) => {
    assert.equal(err.name, "V2RunTimeoutError");
    assert.ok(err.message.includes("300000"));
    return true;
  });
  assert.equal(worker.terminated, true);
});

// --- Genuine candidate evaluation failure ---

test("genuine worker error: not fatal, can be swallowed", async () => {
  const worker = new MockWorker();
  const promise = runInWorker(worker, "placement", {});
  const requestId = worker.postMessageCalls[0].requestId;
  worker.sendWorkerError(requestId, "evaluation failed for this candidate");
  let error = null;
  try {
    await promise;
  } catch (err) {
    error = err;
  }
  assert.ok(error, "should reject");
  assert.equal(isFatalLifecycleError(error), false, "genuine failure is NOT fatal");
  assert.equal(worker.terminated, false, "worker should NOT be terminated for genuine failure");
});

test("worker crash (onerror): not fatal, can be swallowed", async () => {
  const worker = new MockWorker();
  const promise = runInWorker(worker, "placement", {});
  worker.sendWorkerCrash();
  let error = null;
  try {
    await promise;
  } catch (err) {
    error = err;
  }
  assert.ok(error, "should reject");
  assert.equal(isFatalLifecycleError(error), false, "worker crash is NOT fatal");
});

// --- Single-settlement guard ---

test("double settlement: late worker message after cancel does nothing", async () => {
  const worker = new MockWorker();
  const controller = new AbortController();
  const promise = runInWorker(worker, "placement", {}, controller.signal);
  const requestId = worker.postMessageCalls[0].requestId;
  controller.abort();
  await assert.rejects(promise, (err) => err.name === "AbortError");
  // Late worker message — must not throw unhandled rejection
  worker.sendResult(requestId, { data: "late" });
  // If we reach here without unhandled rejection, the guard works
  assert.ok(true);
});

test("double settlement: late timeout after result does nothing", async () => {
  const worker = new MockWorker();
  const promise = runInWorker(worker, "placement", {}, null, { timeoutMs: 50 });
  const requestId = worker.postMessageCalls[0].requestId;
  worker.sendResult(requestId, { data: "result" });
  const result = await promise;
  assert.deepEqual(result, { data: "result" });
  // Wait for the timeout to fire — must not cause issues
  await wait(80);
  assert.equal(worker.terminated, false, "worker should NOT be terminated (result won)");
});

test("double settlement: late cancel after timeout does nothing", async () => {
  const worker = new MockWorker();
  const controller = new AbortController();
  const promise = runInWorker(worker, "placement", {}, controller.signal, { timeoutMs: 30 });
  await assert.rejects(promise, (err) => err.name === "TimeoutError");
  // Late cancel — must not cause double settlement
  controller.abort();
  await wait(10);
  assert.ok(true, "no unhandled rejection from late cancel");
});

// --- Cleanup ---

test("cleanup: all listeners removed after normal completion", async () => {
  const worker = new MockWorker();
  const controller = new AbortController();
  const promise = runInWorker(worker, "placement", {}, controller.signal);
  const requestId = worker.postMessageCalls[0].requestId;
  worker.sendResult(requestId, { data: "result" });
  await promise;
  assert.equal(worker.listenerCount("message"), 0, "message listeners removed");
  assert.equal(worker.listenerCount("error"), 0, "error listeners removed");
  // Aborting the signal after completion should not cause issues
  controller.abort();
  await wait(10);
  assert.ok(true, "no unhandled rejection from late abort");
});

test("cleanup: all listeners removed after cancellation", async () => {
  const worker = new MockWorker();
  const controller = new AbortController();
  const promise = runInWorker(worker, "placement", {}, controller.signal);
  controller.abort();
  await assert.rejects(promise, (err) => err.name === "AbortError");
  assert.equal(worker.listenerCount("message"), 0, "message listeners removed");
  assert.equal(worker.listenerCount("error"), 0, "error listeners removed");
});

test("cleanup: all listeners removed after timeout", async () => {
  const worker = new MockWorker();
  const promise = runInWorker(worker, "placement", {}, null, { timeoutMs: 30 });
  await assert.rejects(promise, (err) => err.name === "TimeoutError");
  assert.equal(worker.listenerCount("message"), 0, "message listeners removed");
  assert.equal(worker.listenerCount("error"), 0, "error listeners removed");
});

// --- isFatalLifecycleError classification ---

test("isFatalLifecycleError classifies correctly", () => {
  assert.ok(isFatalLifecycleError(new V2AbortError()), "AbortError is fatal");
  assert.ok(isFatalLifecycleError(new V2TimeoutError()), "TimeoutError is fatal");
  assert.ok(isFatalLifecycleError(new V2RunTimeoutError()), "V2RunTimeoutError is fatal");
  assert.ok(!isFatalLifecycleError(new Error("genuine failure")), "generic Error is NOT fatal");
  assert.ok(!isFatalLifecycleError(null), "null is NOT fatal");
  assert.ok(!isFatalLifecycleError(undefined), "undefined is NOT fatal");
});

// --- V2RuntimeMetrics ---

test("V2RuntimeMetrics captures and reports metrics", () => {
  const metrics = new V2RuntimeMetrics("test-project");
  metrics.recordCurrentReuse(true);
  metrics.recordStage2TransferReused();
  metrics.recordStage2TransferReused();
  metrics.recordWorkerCall("placement", "cand-1", 100.5, false);
  metrics.recordWorkerCall("confirmation", "cand-1", 200.3, false);
  metrics.recordProxySearch("cand-1", 5.2);
  metrics.recordChallengerConfirmed();
  metrics.finish();
  const report = metrics.toReport();
  assert.equal(report.projectId, "test-project");
  assert.equal(report.currentReused, true);
  assert.equal(report.stage2TransfersReused, 2);
  assert.equal(report.workerCallCount, 2);
  assert.equal(report.workerCalls[0].phase, "placement");
  assert.equal(report.workerCalls[0].durationMs, 101); // rounded
  assert.equal(report.workerCalls[1].phase, "confirmation");
  assert.equal(report.proxySearchCount, 1);
  assert.equal(report.challengersConfirmed, 1);
  assert.ok(report.totalWallClockMs >= 0);
});

test("V2RuntimeMetrics logReport does not throw", () => {
  const metrics = new V2RuntimeMetrics("test");
  metrics.finish();
  // Should not throw
  metrics.logReport();
  assert.ok(true);
});