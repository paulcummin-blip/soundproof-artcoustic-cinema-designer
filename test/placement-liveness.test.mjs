import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./_alias-loader.mjs", import.meta.url);
const { createStage1EvaluationPool } = await import("../src/components/room/bass/stage1/stage1EvaluationPool.js");
const { waitForStage2Terminal } = await import("../src/components/room/bass/improveBassV2/stage2LifecycleOrchestrator.js");
const { requestBassHeavyAction, getBassHeavyAction } = await import("../src/components/room/bass/bassHeavyActionStore.js");
const { markStage1Updating, markStage1Error, stage1PlacementController } = await import("../src/components/room/bass/stage1/stage1PlacementStore.js");
const { setStage2StateForTest, Stage2PlacementController } = await import("../src/components/room/bass/stage2/stage2PlacementStore.js");
const { requestCancel } = await import("../src/components/room/bass/improveBassV2/improveBassV2Store.js");
const { readStage2TerminalDiagnostics } = await import("../src/components/room/bass/improveBassV2/stage2TerminalDiagnostics.js");
class Worker {
  constructor() { this.listeners = {}; this.sent = []; this.terminated = false; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  postMessage(message) { if (this.throwPost) throw Error("clone failed"); this.sent.push(message); }
  terminate() { this.terminated = true; }
  emit(type, data) { this.listeners[type]?.(type === "message" ? { data } : { message: data }); }
  ready() { this.emit("message", { type: "ready", requestId: this.sent[0].requestId }); }
  finish(type = "complete") { const m = this.sent.at(-1); this.emit("message", { type, requestId: m.requestId, result: { id: m.candidate?.id }, error: type === "error" ? "non-assessable" : null }); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function pool(options = {}) {
  const workers = [], events = [];
  const value = createStage1EvaluationPool({ size: 3, context: {}, workerFactory: () => { const w = new Worker(); workers.push(w); return w; }, onProgress: e => events.push(e), ...options });
  return { value, workers, events };
}
test("normal pool waits for ready, completes jobs and reuses bounded slots", async () => {
  const { value, workers } = pool();
  const jobs = [1,2,3,4].map(id => value.evaluate({ id }));
  assert.ok(workers.every(w => w.sent.length === 1));
  workers.forEach(w => w.ready()); await tick();
  workers.forEach(w => w.finish()); await tick();
  workers[0].finish();
  assert.deepEqual((await Promise.all(jobs)).map(x => x.id), [1,2,3,4]);
  value.terminateAll();
});
test("module-load failure rejects all queued borrowers immediately", async () => {
  const { value, workers, events } = pool();
  const jobs = Promise.allSettled([1,2,3,4,5].map(id => value.evaluate({ id })));
  workers[0].emit("error", "Failed to resolve module specifier");
  assert.ok((await jobs).every(x => x.status === "rejected"));
  assert.ok(workers.every(w => w.terminated));
  assert.throws(() => value.throwIfFailed(), /resolve module/);
  assert.equal(events.at(-1).event, "worker_failure");
});
test("worker crash after dispatch settles active AND queued jobs", async () => {
  const { value, workers } = pool();
  workers.forEach(w => w.ready());
  const jobs = Promise.allSettled([1,2,3,4].map(id => value.evaluate({ id })));
  await tick(); workers[1].emit("error", "crashed");
  assert.ok((await jobs).every(x => x.status === "rejected"));
});
test("candidate error is isolated and the pool remains usable", async () => {
  const { value, workers } = pool({ size: 1 }); workers[0].ready();
  const first = Promise.allSettled([value.evaluate({ id: 1 })]); await tick(); workers[0].finish("error");
  assert.equal((await first)[0].status, "rejected");
  const second = value.evaluate({ id: 2 }); await tick(); workers[0].finish();
  assert.equal((await second).id, 2); value.throwIfFailed(); value.terminateAll();
});
test("silent initialization has a bounded terminal failure", async () => {
  const { value } = pool({ timeoutMs: 10 });
  await assert.rejects(value.evaluate({}), /initialisation timed out/);
});
test("postMessage and messageerror do not strand borrowers", async () => {
  for (const kind of ["post", "messageerror"]) {
    const { value, workers } = pool({ size: 1 }); workers[0].ready();
    if (kind === "post") workers[0].throwPost = true;
    const job = assert.rejects(value.evaluate({}), /dispatch failed|decoded/);
    await tick(); if (kind === "messageerror") workers[0].emit("messageerror");
    await job; assert.equal(value.size, 0);
  }
});
test("abort settles active/waiting calls and a fresh pool can retry", async () => {
  const ac = new AbortController();
  const { value, workers } = pool({ signal: ac.signal }); workers.forEach(w => w.ready());
  const jobs = Promise.allSettled([1,2,3,4].map(id => value.evaluate({ id })));
  await tick(); ac.abort();
  assert.ok((await jobs).every(x => x.status === "rejected"));
  const retry = pool({ size: 1 }); retry.workers[0].ready();
  const job = retry.value.evaluate({ id: 9 }); await tick(); retry.workers[0].finish();
  assert.equal((await job).id, 9); retry.value.terminateAll();
});
function request(id) { return requestBassHeavyAction(id, "v1", "optimise", "cal-current"); }
test("Stage 1 definitive failure settles Stage 2 wait and retains run identity", async () => {
  const req = request("failed"), runId = "failure-run";
  markStage1Updating("failed", "v1", "s1", req.requestId);
  const pending = waitForStage2Terminal("failed", "v1", { requestId: req.requestId, runId, timeoutMs: 1000 });
  markStage1Error("failed", "v1", "s1", "child module failed");
  const result = await pending;
  assert.equal(result.status, "error"); assert.match(result.error, /child module/);
  assert.equal(result.diagnostics.runId, runId);
  assert.equal(getBassHeavyAction("failed", "v1").status, "error");
});
test("matching genuine Stage 2 completion resolves once; previous request is ignored", async () => {
  const req = request("success");
  setStage2StateForTest("success", "v1", { status:"complete", ownerRequestId:"old", fingerprint:"old", placementFingerprint:"old" });
  let done = false;
  const pending = waitForStage2Terminal("success", "v1", { requestId: req.requestId, runId:"success-run", timeoutMs:1000 }).then(r => { done=true; return r; });
  await tick(); assert.equal(done, false);
  setStage2StateForTest("success", "v1", { status:"complete", ownerRequestId:req.requestId, fingerprint:"new", placementFingerprint:"new" });
  assert.equal((await pending).status, "complete");
});
test("cancellation settles with no Stage 2 progress event", async () => {
  const req = request("cancel");
  let cancelled = false;
  const pending = waitForStage2Terminal("cancel", "v1", { requestId:req.requestId, runId:"cancel-run", isCancelled:() => cancelled, timeoutMs:1000 });
  cancelled = true;
  requestCancel("cancel", "v1");
  assert.equal((await pending).status, "cancelled");
});
test("superseded waiter cannot cancel replacement heavy action", async () => {
  const req = request("replace");
  const pending = waitForStage2Terminal("replace", "v1", { requestId:req.requestId, timeoutMs:1000 });
  const next = request("replace");
  assert.equal((await pending).status, "stale");
  assert.equal(getBassHeavyAction("replace", "v1").requestId, next.requestId);
  assert.equal(getBassHeavyAction("replace", "v1").status, "requested");
});
test("outer timeout cleans pending work and records actionable diagnostics", async () => {
  const req = request("timeout");
  const pending = waitForStage2Terminal("timeout", "v1", { requestId:req.requestId, runId:"timeout-run", timeoutMs:10 });
  const result = await pending;
  assert.equal(result.status, "timeout");
  assert.equal(getBassHeavyAction("timeout", "v1").status, "error");
  assert.equal(stage1PlacementController.activeRequest, null);
  assert.ok(readStage2TerminalDiagnostics().some(r => r.runId === "timeout-run"));
});
test("stale Stage 2 message cannot steal a newer job or clear its watchdog", () => {
  const controller = new Stage2PlacementController();
  controller.currentFingerprint="new";
  controller.activeJobs.set(0, { requestId:"new-job" });
  controller.startWatchdog(0);
  controller.handleMessage(0, { type:"complete", fingerprint:"old", requestId:"old-job" });
  assert.equal(controller.activeJobs.get(0).requestId, "new-job");
  assert.equal(controller.watchdogs.size, 1);
  controller.cancelAll("superseded");
});
