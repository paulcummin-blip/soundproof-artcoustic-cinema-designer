// stage2-empty-queue-and-three-sub-handoff.test.mjs
// ---------------------------------------------------------------------------
// Regression suite for the two Case B defects:
//
//   THREE-SUB QUANTITY HANDOFF — a design whose only valid Stage 1 finalists
//   are three-source must reach Stage 2 with quantity 3 in scope. The handoff
//   authority (resolveQuantityOrder) prepends the current/promoted quantity;
//   the installed-count memo in RoomDesigner must not drop 3.
//
//   EMPTY-QUEUE TERMINATION — when Stage 2 legitimately receives zero jobs
//   (no placement, no confirmation, no cached transfers), the run must
//   terminate immediately with an explicit outcome. It must NEVER sit in
//   "updating" until the ~300 s global safety timeout.
//
// The real controller is exercised via an esbuild bundle (persistence is
// stubbed; the worker is a mock). No acoustic maths, no P19/P20, no ranking.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// ── Mock Worker (Web Worker interface) ──────────────────────────────────────
class MockWorker {
  constructor(url, opts) { this.url = url; this.opts = opts; this.onmessage = null; this.onerror = null; this.terminated = false; }
  postMessage(msg) { this.lastMessage = msg; }
  terminate() { this.terminated = true; }
}
globalThis.Worker = MockWorker;

// ── Bundle the real store with persistence stubbed ──────────────────────────
const storeBundle = (await build({
  entryPoints: ["src/components/room/bass/stage2/stage2PlacementStore.js"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "stage2Store",
  platform: "node",
  define: { "import.meta.url": JSON.stringify("file:///stage2PlacementStore.js") },
  plugins: [{
    name: "stub-stage2-persistence",
    setup(b) {
      b.onResolve({ filter: /stage2PlacementPersistence$/ }, () => ({ path: "persistence", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: "export const syncStage2PlacementCache = async () => {}; export const hydrateStage2PlacementCache = async () => null; export const isStage2CacheValid = () => false; export const isRawTransferCacheValid = () => false;",
      }));
    },
  }],
}])).outputFiles[0].text;

const stage2Module = { exports: {} };
new Function("module", "exports", storeBundle)(stage2Module, stage2Module.exports);
const { stage2PlacementController, getStage2State } = stage2Module.exports;

// ── resolveQuantityOrder: pure handoff contract ────────────────────────────
const qtyOrderBundle = (await build({
  entryPoints: ["src/components/room/bass/stage2/stage2QuantityOrder.js"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "qtyOrder",
  platform: "node",
})).outputFiles[0].text;
const qtyModule = { exports: {} };
new Function("module", "exports", qtyOrderBundle)(qtyModule, qtyModule.exports);
const { resolveQuantityOrder } = qtyModule.exports;

// ── Helpers ─────────────────────────────────────────────────────────────────
const BASE_PARAMS = {
  roomDims: { widthM: 4.6, lengthM: 5.08, heightM: 2.4 },
  rspPosition: { x: 2.3, y: 3.0, z: 1.2 },
  seatingPositions: [{ id: "s1", x: 2.3, y: 3.0, z: 1.2, priority: "primary" }],
  selectedSubModel: "SUB3-12",
  amplifierPowerPerSubW: 500,
  p14TargetBasis: "reference",
  p14TargetLevel: "L2",
  p14TargetDb: 95,
  p18TargetBasis: "minimum",
  seatPriorityMap: new Map([["s1", "primary"]]),
  subwooferBottomHeightM: 0.2,
};

function promotionPlanFor(finalistsByQty) {
  const plan = {};
  for (const q of [1, 2, 3, 4]) {
    plan[q] = (finalistsByQty[q] || []).map((f, i) => ({
      id: f.id || `f${q}-${i}`,
      familyId: f.familyId || `FAM_Q${q}_${i}`,
      sources: f.sources || [{ xNorm: 0.5, yNorm: 0.1 }, { xNorm: 0.5, yNorm: 0.9 }],
    }));
  }
  return plan;
}

function scheduleWith({ quantityOrder, finalistsByQty, scopeQuantity = null }) {
  // Reset controller state between cases by cancelling any prior run.
  stage2PlacementController.cancelAll("test-reset");
  stage2PlacementController.schedule({
    projectId: "proj-test",
    versionId: "ver-test",
    fingerprint: `fp-${quantityOrder.join("")}-${scopeQuantity ?? "all"}-${Date.now()}`,
    placementFingerprint: null,   // no cached raw transfers → placement jobs are real
    confirmationFingerprint: null,
    promotionPlan: promotionPlanFor(finalistsByQty),
    allStage1Finalists: finalistsByQty,
    stage1Complete: true,
    params: BASE_PARAMS,
    quantityOrder,
    scopeQuantity,
    delay: 0,
  });
}

// ── resolveQuantityOrder contract ───────────────────────────────────────────

test("resolveQuantityOrder: 3-sub current quantity puts 3 first and includes it", () => {
  const order = resolveQuantityOrder(3);
  assert.deepEqual(order, [3, 2, 4, 1], "quantity 3 must be first and present");
  assert.equal(order.includes(3), true);
});

test("resolveQuantityOrder: 1-sub behaviour preserved", () => {
  assert.deepEqual(resolveQuantityOrder(1), [1, 2, 4]);
});

test("resolveQuantityOrder: 2-sub behaviour preserved", () => {
  assert.deepEqual(resolveQuantityOrder(2), [2, 4, 1]);
});

test("resolveQuantityOrder: 4-sub behaviour preserved", () => {
  assert.deepEqual(resolveQuantityOrder(4), [4, 2, 1]);
});

test("resolveQuantityOrder: unknown/missing quantity falls back to default order", () => {
  assert.deepEqual(resolveQuantityOrder(null), [2, 4, 1]);
  assert.deepEqual(resolveQuantityOrder(undefined), [2, 4, 1]);
  assert.deepEqual(resolveQuantityOrder(0), [2, 4, 1]);
});

// ── Three-sub handoff into Stage 2 (store-level) ────────────────────────────

test("three-sub finalists with quantity 3 in scope → Stage 2 schedules jobs for qty 3", () => {
  const finalists = {
    1: [], 2: [], 3: [
      { id: "t1", familyId: "THREE_FRONT_SINGLE_REAR_PAIR" },
      { id: "t2", familyId: "THREE_FRONT_PAIR_REAR_SINGLE" },
    ], 4: [],
  };
  scheduleWith({ quantityOrder: resolveQuantityOrder(3), finalistsByQty: finalists });
  assert.equal(stage2PlacementController.quantityOrder.includes(3), true,
    "quantity 3 must be in the Stage 2 scope");
  assert.ok(stage2PlacementController.queue.length > 0,
    "Stage 2 must have queued placement jobs for the three-sub finalists");
  assert.equal(stage2PlacementController.totalJobsPlanned > 0, true);
  // Every queued job belongs to quantity 3 (the selected quantity, processed first).
  assert.equal(stage2PlacementController.queue.every((j) => j.quantity === 3), true);
});

test("three-sub finalists WITHOUT quantity 3 in scope (the bug) → zero jobs (reproduces Case B)", () => {
  const finalists = { 1: [], 2: [], 3: [{ id: "t1" }, { id: "t2" }], 4: [] };
  // The pre-fix fallback order [2,4,1] excludes 3.
  scheduleWith({ quantityOrder: [2, 4, 1], finalistsByQty: finalists });
  assert.equal(stage2PlacementController.queue.length, 0,
    "no jobs are scheduled when the only finalists are for an excluded quantity");
  assert.equal(stage2PlacementController.totalJobsPlanned, 0);
});

// ── Empty-queue immediate termination ───────────────────────────────────────

test("empty queue (zero jobs) terminates immediately — never waits for the global timeout", () => {
  const finalists = { 1: [], 2: [], 3: [{ id: "t1" }], 4: [] };
  // The pre-fix fallback order excludes 3, so the three-sub finalists are
  // ignored and the queue is empty. The empty-queue rule must complete now.
  const t0 = Date.now();
  scheduleWith({ quantityOrder: [2, 4, 1], finalistsByQty: finalists });
  const elapsed = Date.now() - t0;

  const state = getStage2State("proj-test", "ver-test");
  assert.equal(state.status, "complete",
    "an empty Stage 2 queue must terminate immediately with a complete outcome, not sit in updating");
  assert.ok(elapsed < 1000,
    `empty-queue completion must be near-instant (took ${elapsed}ms; the global timeout is 300000ms)`);
  assert.equal(state.totalJobsPlanned ?? stage2PlacementController.totalJobsPlanned, 0,
    "the NO_JOBS outcome is distinguishable from IN_PROGRESS by its zero job count");
});

test("empty queue completion is honest — status complete with no overall_best", () => {
  scheduleWith({ quantityOrder: [2, 4, 1], finalistsByQty: { 1: [], 2: [], 3: [], 4: [] } });
  const state = getStage2State("proj-test", "ver-test");
  assert.equal(state.status, "complete");
  assert.equal(state.overall_best, null, "no jobs means no winner");
});

// ── Existing-quantity behaviour preserved at the store level ───────────────

test("1-sub finalists → Stage 2 schedules jobs for qty 1", () => {
  scheduleWith({
    quantityOrder: resolveQuantityOrder(1),
    finalistsByQty: { 1: [{ id: "o1", familyId: "ONE_FRONT_MID" }], 2: [], 3: [], 4: [] },
  });
  assert.equal(stage2PlacementController.quantityOrder[0], 1);
  assert.ok(stage2PlacementController.queue.length > 0);
  assert.equal(stage2PlacementController.queue.every((j) => j.quantity === 1), true);
});

test("2-sub finalists → Stage 2 schedules jobs for qty 2", () => {
  scheduleWith({
    quantityOrder: resolveQuantityOrder(2),
    finalistsByQty: { 1: [], 2: [{ id: "tw1", familyId: "C_FRONT_PAIR" }, { id: "tw2", familyId: "RP22_C" }], 3: [], 4: [] },
  });
  assert.equal(stage2PlacementController.quantityOrder[0], 2);
  assert.ok(stage2PlacementController.queue.length > 0);
  assert.equal(stage2PlacementController.queue.every((j) => j.quantity === 2), true);
});

test("4-sub finalists → Stage 2 schedules jobs for qty 4", () => {
  scheduleWith({
    quantityOrder: resolveQuantityOrder(4),
    finalistsByQty: { 1: [], 2: [], 3: [], 4: [{ id: "fo1", familyId: "FOUR_THIRD_PAIRS" }] },
  });
  assert.equal(stage2PlacementController.quantityOrder[0], 4);
  assert.ok(stage2PlacementController.queue.length > 0);
  assert.equal(stage2PlacementController.queue.every((j) => j.quantity === 4), true);
});

// ── Candidate count entering Stage 2 is preserved ───────────────────────────

test("candidate count entering Stage 2 is preserved — 3 finalists → 3 placement jobs", () => {
  const finalists = {
    1: [], 2: [], 3: [
      { id: "t1", familyId: "THREE_FRONT_SINGLE_REAR_PAIR" },
      { id: "t2", familyId: "THREE_FRONT_PAIR_REAR_SINGLE" },
      { id: "t3", familyId: "THREE_ASYMMETRIC_REAR_PAIR" },
    ], 4: [],
  };
  scheduleWith({ quantityOrder: resolveQuantityOrder(3), finalistsByQty: finalists });
  assert.equal(stage2PlacementController.queue.length, 3,
    "all three three-sub finalists must enter Stage 2 as placement jobs");
  assert.equal(stage2PlacementController.totalJobsPlanned, 3);
});