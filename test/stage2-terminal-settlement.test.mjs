import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Mock Worker — simulates the Web Worker interface for integration tests.
// ---------------------------------------------------------------------------

class MockWorker {
  constructor(url, opts) {
    MockWorker.instances.push(this);
    this.url = url;
    this.opts = opts;
    this.onmessage = null;
    this.onerror = null;
    this.terminated = false;
    this._shouldThrowPostMessage = false;
  }
  postMessage(msg) {
    if (this._shouldThrowPostMessage) throw new Error("postMessage failed");
    this.lastMessage = msg;
  }
  terminate() {
    this.terminated = true;
  }
  emit(type, data) {
    if (this.onmessage && !this.terminated) {
      this.onmessage({ data: { type, ...data } });
    }
  }
  emitError(message) {
    if (this.onerror && !this.terminated) {
      this.onerror({ message });
    }
  }
}
MockWorker.instances = [];
MockWorker.reset = () => { MockWorker.instances = []; };
MockWorker.throwOnNextPostMessage = () => {
  for (const w of MockWorker.instances) w._shouldThrowPostMessage = true;
};

globalThis.Worker = MockWorker;

// Import the controller class and state accessor.
const { Stage2PlacementController, getStage2State } = await import(
  "../src/components/room/bass/stage2/stage2PlacementStore.js"
);

// ---------------------------------------------------------------------------
// Helper: create a controller with minimal state for confirmation testing.
// Does NOT call schedule() — sets up internal state directly so the test
// asserts ONLY the terminal settlement logic, never the acoustic equations.
// ---------------------------------------------------------------------------

function createControllerForConfirmation(qty = 2, expectedConfirmations = 1) {
  const controller = new Stage2PlacementController();
  controller.projectId = "test";
  controller.currentFingerprint = "test-fp";
  controller.placementFingerprint = "test-placement-fp";
  controller.params = {
    roomDims: { widthM: 6, lengthM: 8, heightM: 2.4 },
    seatPriorityMap: new Map(),
  };
  controller.quantityOrder = [qty];
  controller.quantityFinalists = { [qty]: [{ id: "f1", familyId: "familyA" }] };
  controller.quantityFinal = { [qty]: false };
  controller.confirmationQueued = { [qty]: true };
  controller.confirmationJobsExpectedByQty = { [qty]: expectedConfirmations };
  controller.confirmationJobsDoneByQty = { [qty]: 0 };
  controller.completedResults = {};
  controller.evaluatedFamilyIds = new Set();
  controller.failedFamilyIds = new Set();
  controller.bState = "not_eligible";
  controller.startTime = Date.now();
  controller.canonicalJobsRun = 0;
  controller.completedJobs = 0;
  controller.totalJobsPlanned = expectedConfirmations;
  controller.confirmationJobsPlanned = expectedConfirmations;
  controller.confirmationJobsDone = 0;
  controller.controllerPhase = "confirmation";
  return controller;
}

function addActiveConfirmationJob(controller, workerIndex = 0, requestId = "stage2-1") {
  controller.activeJobs.set(workerIndex, {
    requestId,
    quantity: 2,
    phase: "confirmation",
    isB: false,
    isRepresentative: false,
    finalist: { id: "f1", familyId: "familyA" },
  });
}

// ---------------------------------------------------------------------------
// TEST A — Normal success: all confirmation jobs settle and recommendation
// publishes.
// ---------------------------------------------------------------------------

test("A: normal success — confirmation settles and Stage 2 reaches complete", () => {
  const controller = createControllerForConfirmation(2, 1);
  addActiveConfirmationJob(controller, 0, "stage2-1");

  controller.settleJob(0, {
    type: "complete",
    result: {
      finalistId: "f1",
      familyId: "familyA",
      achievedP19VariationDb: 2.0,
      achievedP20VariationDb: 3.0,
    },
    requestId: "stage2-1",
  });

  assert.equal(controller.confirmationJobsDoneByQty[2], 1, "confirmationJobsDoneByQty should be 1");
  assert.equal(controller.quantityFinal[2], true, "quantity should be final");
  assert.equal(controller.activeJobs.size, 0, "no active jobs remaining");

  const state = getStage2State("test");
  assert.equal(state.status, "complete", "Stage 2 should publish complete status");
});

// ---------------------------------------------------------------------------
// TEST B — Worker onerror: confirmation job fails through Worker onerror.
// Expected: confirmationJobsDoneByQty increments, quantity becomes final,
// Compare exits (status = complete).
// ---------------------------------------------------------------------------

test("B: Worker onerror — confirmation error settles and quantity becomes final", () => {
  const controller = createControllerForConfirmation(2, 1);
  addActiveConfirmationJob(controller, 0, "stage2-1");

  // Simulate Worker onerror
  controller.handleError(0, "Worker crashed");

  assert.equal(controller.confirmationJobsDoneByQty[2], 1,
    "confirmationJobsDoneByQty must increment on Worker onerror (ROOT CAUSE FIX)");
  assert.equal(controller.quantityFinal[2], true,
    "quantity must become final even when a confirmation job fails");
  assert.equal(controller.activeJobs.size, 0, "no active jobs remaining");

  const state = getStage2State("test");
  assert.equal(state.status, "complete",
    "Stage 2 must reach complete status — Compare must not hang");
});

// ---------------------------------------------------------------------------
// TEST C — Worker-reported error: { type: "error" } message from worker.
// Must use the same settlement authority as success.
// ---------------------------------------------------------------------------

test("C: worker-reported error — same settlement authority as success", () => {
  const controller = createControllerForConfirmation(2, 1);
  addActiveConfirmationJob(controller, 0, "stage2-1");

  // Simulate worker-reported error via handleMessage
  controller.handleMessage(0, {
    type: "error",
    requestId: "stage2-1",
    fingerprint: "test-fp",
  });

  assert.equal(controller.confirmationJobsDoneByQty[2], 1,
    "confirmationJobsDoneByQty must increment on worker-reported error");
  assert.equal(controller.quantityFinal[2], true,
    "quantity must become final on worker-reported error");

  const state = getStage2State("test");
  assert.equal(state.status, "complete", "Stage 2 must reach complete status");
});

// ---------------------------------------------------------------------------
// TEST D — postMessage() throws: synchronous failure must settle correctly.
// ---------------------------------------------------------------------------

test("D: postMessage failure — job settles without stranding expected count", () => {
  MockWorker.reset();
  const controller = createControllerForConfirmation(2, 1);

  // Create a mock worker manually (simulating startWorker)
  const mockWorker = new MockWorker("test", {});
  mockWorker.onmessage = (event) => controller.handleMessage(0, event.data || {});
  mockWorker.onerror = (event) => controller.handleError(0, event?.message || "Worker error");
  controller.workers = [mockWorker];

  // Queue a confirmation job
  controller.queue = [{
    finalist: { id: "f1", familyId: "familyA" },
    quantity: 2,
    phase: "confirmation",
    rawTransfer: { finalistId: "f1", familyId: "familyA", sources: [] },
  }];

  // Make postMessage throw
  mockWorker._shouldThrowPostMessage = true;

  // Dispatch — postMessage will throw, settleJob should be called
  controller.dispatchToWorker(0, controller.queue.shift());

  assert.equal(controller.activeJobs.size, 0,
    "active job must be released after postMessage failure");
  assert.equal(controller.confirmationJobsDoneByQty[2], 1,
    "confirmationJobsDoneByQty must increment on postMessage failure");
  assert.equal(controller.quantityFinal[2], true,
    "quantity must become final on postMessage failure");

  const state = getStage2State("test");
  assert.equal(state.status, "complete",
    "Stage 2 must reach complete status — Compare must not hang");
});

// ---------------------------------------------------------------------------
// TEST E — Non-settling worker: watchdog fires, Compare exits.
// ---------------------------------------------------------------------------

test("E: watchdog timeout — non-settling worker is terminated and job settles", () => {
  const controller = createControllerForConfirmation(2, 1);
  addActiveConfirmationJob(controller, 0, "stage2-1");

  // Create a mock worker that will be terminated
  const mockWorker = new MockWorker("test", {});
  controller.workers = [mockWorker];

  // Start the watchdog
  controller.startWatchdog(0);
  assert.equal(controller.watchdogs.size, 1, "watchdog should be running");

  // Simulate watchdog timeout (call directly rather than waiting 60 sec)
  controller.handleWatchdogTimeout(0);

  assert.equal(mockWorker.terminated, true, "worker should be terminated by watchdog");
  assert.equal(controller.watchdogs.size, 0, "watchdog should be cleared");
  assert.equal(controller.activeJobs.size, 0, "active job should be released");
  assert.equal(controller.confirmationJobsDoneByQty[2], 1,
    "confirmationJobsDoneByQty must increment on watchdog timeout");
  assert.equal(controller.quantityFinal[2], true,
    "quantity must become final on watchdog timeout");

  const state = getStage2State("test");
  assert.equal(state.status, "complete",
    "Stage 2 must reach complete status — Compare must not hang on silent worker");
});

// ---------------------------------------------------------------------------
// TEST F — Late terminal event after watchdog: must not double-count.
// ---------------------------------------------------------------------------

test("F: late terminal after watchdog — exactly-once prevents double-count", () => {
  const controller = createControllerForConfirmation(2, 1);
  addActiveConfirmationJob(controller, 0, "stage2-1");

  const mockWorker = new MockWorker("test", {});
  controller.workers = [mockWorker];

  // Watchdog fires first
  controller.handleWatchdogTimeout(0);
  assert.equal(controller.confirmationJobsDoneByQty[2], 1,
    "watchdog should settle the job once");

  // Late onerror arrives — must NOT double-count
  controller.handleError(0, "Late worker error after watchdog");
  assert.equal(controller.confirmationJobsDoneByQty[2], 1,
    "late terminal event must NOT double-count (exactly-once guard)");

  // Late success message arrives — must NOT double-count
  controller.handleMessage(0, {
    type: "complete",
    result: { finalistId: "f1", familyId: "familyA" },
    requestId: "stage2-1",
    fingerprint: "test-fp",
  });
  assert.equal(controller.confirmationJobsDoneByQty[2], 1,
    "late success after watchdog must NOT double-count (exactly-once guard)");

  assert.equal(controller.completedJobs, 1,
    "completedJobs must be 1 — not 2 or 3");
  assert.equal(controller.canonicalJobsRun, 1,
    "canonicalJobsRun must be 1 — not 2 or 3");
});

// ---------------------------------------------------------------------------
// TEST G — Current remains best: all confirmations complete, Stage 2
// publishes a valid terminal outcome.
// ---------------------------------------------------------------------------

test("G: Current remains best — Stage 2 publishes valid terminal outcome", () => {
  const controller = createControllerForConfirmation(2, 2);
  controller.currentFingerprint = "test-fp";

  // First confirmation job (placement-only)
  addActiveConfirmationJob(controller, 0, "stage2-1");
  controller.settleJob(0, {
    type: "complete",
    result: {
      finalistId: "f1",
      familyId: "familyA",
      achievedP19VariationDb: 3.0,
      achievedP20VariationDb: 4.0,
    },
    requestId: "stage2-1",
  });
  assert.equal(controller.confirmationJobsDoneByQty[2], 1,
    "first confirmation should settle");
  assert.equal(controller.quantityFinal[2], false,
    "quantity should NOT be final after 1 of 2 confirmations");

  // Second confirmation job (delay-only)
  addActiveConfirmationJob(controller, 0, "stage2-2");
  controller.settleJob(0, {
    type: "complete",
    result: {
      finalistId: "f1",
      familyId: "familyA",
      tuningVariant: "delay-only",
      achievedP19VariationDb: 3.5,
      achievedP20VariationDb: 4.5,
    },
    requestId: "stage2-2",
  });
  assert.equal(controller.confirmationJobsDoneByQty[2], 2,
    "second confirmation should settle");
  assert.equal(controller.quantityFinal[2], true,
    "quantity should be final after 2 of 2 confirmations");

  const state = getStage2State("test");
  assert.equal(state.status, "complete",
    "Stage 2 must publish complete status — Current-best must terminate normally");
});

// ---------------------------------------------------------------------------
// TEST — Multiple confirmation failures all settle (5 expected, 2 fail).
// This is the exact scenario from the bug report: 5 expected, one fails
// via onerror, all 5 must eventually be terminal.
// ---------------------------------------------------------------------------

test("5 expected confirmations — 2 fail via onerror, all settle and Compare exits", () => {
  const controller = createControllerForConfirmation(2, 5);
  controller.currentFingerprint = "test-fp";

  // Simulate 5 confirmation jobs, 3 succeed and 2 fail via onerror
  for (let i = 0; i < 5; i++) {
    const requestId = `stage2-${i + 1}`;
    addActiveConfirmationJob(controller, 0, requestId);

    if (i === 1 || i === 3) {
      // 2nd and 4th fail via Worker onerror
      controller.handleError(0, `Worker error ${i}`);
    } else {
      // Others succeed
      controller.settleJob(0, {
        type: "complete",
        result: {
          finalistId: "f1",
          familyId: "familyA",
          achievedP19VariationDb: 2.0 + i * 0.1,
          achievedP20VariationDb: 3.0 + i * 0.1,
        },
        requestId,
      });
    }
  }

  assert.equal(controller.confirmationJobsDoneByQty[2], 5,
    "all 5 confirmation jobs must settle (3 success + 2 error)");
  assert.equal(controller.quantityFinal[2], true,
    "quantity must be final after all 5 settle");
  assert.equal(controller.completedJobs, 5,
    "completedJobs must be 5");
  assert.equal(controller.canonicalJobsRun, 5,
    "canonicalJobsRun must be 5");

  const state = getStage2State("test");
  assert.equal(state.status, "complete",
    "Stage 2 must reach complete — Compare must not hang");
});

// ---------------------------------------------------------------------------
// TEST — Placement phase error also settles correctly.
// ---------------------------------------------------------------------------

test("placement phase error — quantityPlacementProcessed increments", () => {
  const controller = new Stage2PlacementController();
  controller.projectId = "test";
  controller.currentFingerprint = "test-fp";
  controller.params = {
    roomDims: { widthM: 6, lengthM: 8, heightM: 2.4 },
    seatPriorityMap: new Map(),
  };
  controller.quantityOrder = [2];
  controller.quantityFinalists = { 2: [{ id: "f1", familyId: "familyA" }] };
  controller.quantityFinal = { 2: false };
  controller.confirmationQueued = { 2: false };
  controller.quantityPlacementProcessed = { 2: 0 };
  controller.placementResults = { 2: [] };
  controller.completedResults = {};
  controller.evaluatedFamilyIds = new Set();
  controller.failedFamilyIds = new Set();
  controller.bState = "not_eligible";
  controller.startTime = Date.now();
  controller.canonicalJobsRun = 0;
  controller.completedJobs = 0;
  controller.controllerPhase = "placement";

  // Simulate an active placement job
  controller.activeJobs.set(0, {
    requestId: "stage2-1",
    quantity: 2,
    phase: "placement",
    isB: false,
    isRepresentative: false,
    finalist: { id: "f1", familyId: "familyA" },
  });

  // Settle as error (Worker onerror during placement)
  controller.handleError(0, "Placement worker error");

  assert.equal(controller.quantityPlacementProcessed[2], 1,
    "quantityPlacementProcessed must increment on placement error");
  assert.equal(controller.failedFamilyIds.has("familyA"), true,
    "failed family should be tracked");
  assert.equal(controller.activeJobs.size, 0, "no active jobs remaining");
});