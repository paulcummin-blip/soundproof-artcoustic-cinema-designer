import test from "node:test";
import assert from "node:assert/strict";
import {
  attemptRecoveryRetry,
  isAuthoritativeForFingerprint,
  POST_APPLY_FAILURE_PHASES,
} from "../src/components/room/bass/optimiseWorkflow/recoveryRetry.js";
import {
  getOptimiseWorkflowState,
  setWorkflowError,
  setRecoveryComplete,
  resetWorkflow,
} from "../src/components/room/bass/optimiseWorkflow/optimiseWorkflowStore.js";

// ---------------------------------------------------------------------------
// Helpers: controlled sharedRef / phaseRef with deferred calculation.
// ---------------------------------------------------------------------------

function makeShared({
  cacheKey = "cal:v1:baseline",
  resultFingerprint = null,
  authorityStatus = "AUTHORITATIVE",
  onCalculate = null,
  versionId = "ver1",
} = {}) {
  const state = {
    cacheKey,
    versionId,
    completedBassAuthority: {
      authorityStatus,
      contract: { job: { resultFingerprint } },
    },
    onCalculate: onCalculate || (() => {}),
  };
  return { current: state };
}

function makePhase() {
  return { current: "idle" };
}

// Simulates a deferred calculation: onCalculate sets a timer that advances
// the shared result to match the pinned cacheKey after N ticks.
function deferredCalculation(sharedRef, pinnedCacheKey, delayTicks, tickMs = 10) {
  let ticks = 0;
  let calcStarted = false;
  const onCalculate = () => {
    calcStarted = true;
    // Defer: after delayTicks poll cycles, the result lands.
    const interval = setInterval(() => {
      ticks += 1;
      if (ticks >= delayTicks) {
        clearInterval(interval);
        sharedRef.current = {
          ...sharedRef.current,
          cacheKey: pinnedCacheKey,
          completedBassAuthority: {
            authorityStatus: "AUTHORITATIVE",
            contract: { job: { resultFingerprint: pinnedCacheKey } },
          },
        };
      }
    }, tickMs);
  };
  return { onCalculate, wasCalcStarted: () => calcStarted };
}

// ---------------------------------------------------------------------------
// 1. attemptRecoveryRetry — fallback for non-post-apply phases
// ---------------------------------------------------------------------------
test("recovery: non-post-apply phase falls back to reset", async () => {
  const sharedRef = makeShared();
  const phaseRef = makePhase();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "applying",
    sharedRef, phaseRef,
    sleep: () => Promise.resolve(),
  });
  assert.equal(result.action, "fallback-reset");
});

test("recovery: genuine optimiser failure phase (null) falls back to reset", async () => {
  const sharedRef = makeShared();
  const phaseRef = makePhase();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: null,
    sharedRef, phaseRef,
    sleep: () => Promise.resolve(),
  });
  assert.equal(result.action, "fallback-reset");
});

// ---------------------------------------------------------------------------
// 2. Restored-baseline success: already-authoritative result is reused
//    WITHOUT launching another calculation.
// ---------------------------------------------------------------------------
test("recovery: already-authoritative result is reused without onCalculate", async () => {
  let onCalculateCalled = false;
  const sharedRef = makeShared({
    cacheKey: "cal:v1:baseline",
    resultFingerprint: "cal:v1:baseline", // already matches
    onCalculate: () => { onCalculateCalled = true; },
  });
  const phaseRef = makePhase();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef, phaseRef,
    sleep: () => Promise.resolve(),
  });
  assert.equal(result.action, "success");
  assert.equal(result.reused, true);
  assert.equal(onCalculateCalled, false, "onCalculate must NOT be called when result is already authoritative");
  assert.equal(result.pinnedCacheKey, "cal:v1:baseline");
});

// ---------------------------------------------------------------------------
// 3. Success: onCalculate triggers deferred publication, pinned cacheKey matches
// ---------------------------------------------------------------------------
test("recovery: deferred calculation publishes and matches pinned cacheKey", async () => {
  const sharedRef = makeShared({
    cacheKey: "cal:v1:restored",
    resultFingerprint: null, // not yet published
    authorityStatus: "UPDATING",
  });
  const phaseRef = makePhase();
  const calc = deferredCalculation(sharedRef, "cal:v1:restored", 3);
  sharedRef.current.onCalculate = calc.onCalculate;

  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef, phaseRef,
    sleepMs: 10, timeoutMs: 5000,
  });
  assert.equal(result.action, "success");
  assert.equal(result.reused, false);
  assert.equal(calc.wasCalcStarted(), true, "onCalculate must have been called");
  assert.equal(result.pinnedCacheKey, "cal:v1:restored");
});

// ---------------------------------------------------------------------------
// 4. Failed calculation: onCalculate called but no publication within timeout
// ---------------------------------------------------------------------------
test("recovery: no publication within timeout returns failed", async () => {
  const sharedRef = makeShared({
    cacheKey: "cal:v1:stuck",
    resultFingerprint: null,
    authorityStatus: "UPDATING",
    onCalculate: () => {}, // does nothing
  });
  const phaseRef = makePhase();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef, phaseRef,
    sleepMs: 5, timeoutMs: 50, // very short timeout
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /could not be published within the expected time/);
  assert.equal(result.pinnedCacheKey, "cal:v1:stuck");
});

// ---------------------------------------------------------------------------
// 5. Identity mismatch: cacheKey changes during wait
// ---------------------------------------------------------------------------
test("recovery: cacheKey change during wait is rejected as identity change", async () => {
  const sharedRef = makeShared({
    cacheKey: "cal:v1:original",
    resultFingerprint: null,
    authorityStatus: "UPDATING",
  });
  const phaseRef = makePhase();
  let tickCount = 0;
  sharedRef.current.onCalculate = () => {
    // After 2 poll cycles, the user switches design
    const interval = setInterval(() => {
      tickCount += 1;
      if (tickCount >= 2) {
        clearInterval(interval);
        sharedRef.current = {
          ...sharedRef.current,
          cacheKey: "cal:v2:different", // identity changed!
        };
      }
    }, 5);
  };
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef, phaseRef,
    sleepMs: 5, timeoutMs: 5000,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /design changed during recovery/);
  assert.equal(result.pinnedCacheKey, "cal:v1:original");
  assert.equal(result.actualCacheKey, "cal:v2:different");
});

// ---------------------------------------------------------------------------
// 6. Identity change: versionId changes during wait
// ---------------------------------------------------------------------------
test("recovery: versionId change during wait is rejected", async () => {
  const sharedRef = makeShared({
    cacheKey: "cal:v1:stable",
    versionId: "ver1",
    resultFingerprint: null,
    authorityStatus: "UPDATING",
  });
  const phaseRef = makePhase();
  let tickCount = 0;
  sharedRef.current.onCalculate = () => {
    const interval = setInterval(() => {
      tickCount += 1;
      if (tickCount >= 2) {
        clearInterval(interval);
        sharedRef.current = {
          ...sharedRef.current,
          versionId: "ver2", // version changed, cacheKey stays same for test
        };
      }
    }, 5);
  };
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef, phaseRef,
    pinnedVersionId: "ver1",
    sleepMs: 5, timeoutMs: 5000,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /project version changed during recovery/);
});

// ---------------------------------------------------------------------------
// 7. Cancel detection: phaseRef set to "cancelled" aborts the wait
// ---------------------------------------------------------------------------
test("recovery: cancel during wait returns failed with cancel reason", async () => {
  const sharedRef = makeShared({
    cacheKey: "cal:v1:cancel",
    resultFingerprint: null,
    authorityStatus: "UPDATING",
  });
  const phaseRef = makePhase();
  sharedRef.current.onCalculate = () => {};
  let tickCount = 0;
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef, phaseRef,
    sleepMs: 5, timeoutMs: 5000,
    sleep: async (ms) => {
      tickCount += 1;
      if (tickCount >= 2) phaseRef.current = "cancelled";
      await new Promise((r) => setTimeout(r, ms));
    },
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /cancelled/);
});

// ---------------------------------------------------------------------------
// 8. No candidate apply / no search: onCalculate is called but no search/apply
//    The orchestrator only calls onCalculate — it does NOT call any optimiser
//    or apply function.
// ---------------------------------------------------------------------------
test("recovery: only onCalculate is called, no search or apply", async () => {
  const calls = [];
  const sharedRef = makeShared({
    cacheKey: "cal:v1:clean",
    resultFingerprint: "cal:v1:clean", // already authoritative
    onCalculate: () => calls.push("onCalculate"),
  });
  // Add fake search/apply functions that must never be called
  sharedRef.current.runOptimisation = () => calls.push("search");
  sharedRef.current.applyCalibration = () => calls.push("apply");
  const phaseRef = makePhase();
  await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef, phaseRef,
    sleep: () => Promise.resolve(),
  });
  assert.deepEqual(calls, [], "no onCalculate, search or apply when already authoritative");
});

test("recovery: onCalculate called once for non-authoritative design, no search/apply", async () => {
  const calls = [];
  const sharedRef = makeShared({
    cacheKey: "cal:v1:needscalc",
    resultFingerprint: null,
    authorityStatus: "UPDATING",
  });
  const calc = deferredCalculation(sharedRef, "cal:v1:needscalc", 2);
  sharedRef.current.onCalculate = () => { calls.push("onCalculate"); calc.onCalculate(); };
  sharedRef.current.runOptimisation = () => calls.push("search");
  sharedRef.current.applyCalibration = () => calls.push("apply");
  const phaseRef = makePhase();
  await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef, phaseRef,
    sleepMs: 5, timeoutMs: 5000,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
  assert.deepEqual(calls, ["onCalculate"], "only onCalculate called, no search or apply");
});

// ---------------------------------------------------------------------------
// 9. Settings/plan immutability: the orchestrator does not mutate the shared
//    state's settings or plan — it only reads and calls onCalculate.
// ---------------------------------------------------------------------------
test("recovery: orchestrator does not mutate settings or plan fields", async () => {
  const sharedRef = makeShared({
    cacheKey: "cal:v1:immutable",
    resultFingerprint: "cal:v1:immutable", // already authoritative
  });
  sharedRef.current.authoritative = { crossover: { frequencyHz: 80 }, sources: [] };
  sharedRef.current.savedPlan = { runId: "run-1", decisionApplied: false };
  const phaseRef = makePhase();
  await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef, phaseRef,
    sleep: () => Promise.resolve(),
  });
  // Settings and plan must be untouched
  assert.deepEqual(sharedRef.current.authoritative.crossover, { frequencyHz: 80 });
  assert.equal(sharedRef.current.savedPlan.runId, "run-1");
  assert.equal(sharedRef.current.savedPlan.decisionApplied, false);
});

// ---------------------------------------------------------------------------
// 10. isAuthoritativeForFingerprint — rejects non-matching fingerprints
// ---------------------------------------------------------------------------
test("isAuthoritativeForFingerprint rejects non-matching fingerprint", () => {
  const shared = {
    completedBassAuthority: {
      authorityStatus: "AUTHORITATIVE",
      contract: { job: { resultFingerprint: "fp-A" } },
    },
  };
  assert.equal(isAuthoritativeForFingerprint(shared, "fp-A"), true);
  assert.equal(isAuthoritativeForFingerprint(shared, "fp-B"), false);
  assert.equal(isAuthoritativeForFingerprint(shared, null), false);
  assert.equal(isAuthoritativeForFingerprint(null, "fp-A"), false);
});

test("isAuthoritativeForFingerprint rejects non-AUTHORITATIVE status", () => {
  const shared = {
    completedBassAuthority: {
      authorityStatus: "UPDATING",
      contract: { job: { resultFingerprint: "fp-A" } },
    },
  };
  assert.equal(isAuthoritativeForFingerprint(shared, "fp-A"), false);
});

// ---------------------------------------------------------------------------
// 11. setRecoveryComplete — preserves autoApplied/recommendations, records
//     original error in recoveryHistory, does NOT reset.
// ---------------------------------------------------------------------------
test("setRecoveryComplete preserves autoApplied/recommendations and records original error", () => {
  const projectId = "test-recovery-proj-" + Date.now();
  const versionId = "test-recovery-ver";
  // Simulate a completed run that then errored during post-apply recalc
  const initial = getOptimiseWorkflowState(projectId, versionId);
  // Set the fields that a completed run would have
  setWorkflowError(projectId, versionId, "The optimisation completed, but the recalculated bass result could not be published. Retry the update.");
  // Manually set autoApplied/recommendations (they survive setWorkflowError
  // because it merges, not resets)
  const store = getOptimiseWorkflowState(projectId, versionId);
  // Simulate the fields being present from the completed run
  store.autoApplied = { phase: true, delay: false, gain: true };
  store.recommendations = { subPositions: null, seating: null, addSubs: false };
  store.noImprovementsFound = false;

  setRecoveryComplete(projectId, versionId, "The optimisation completed, but the recalculated bass result could not be published. Retry the update.");
  const recovered = getOptimiseWorkflowState(projectId, versionId);
  assert.equal(recovered.status, "complete");
  assert.equal(recovered.error, null);
  assert.deepEqual(recovered.autoApplied, { phase: true, delay: false, gain: true });
  assert.deepEqual(recovered.recommendations, { subPositions: null, seating: null, addSubs: false });
  assert.equal(recovered.noImprovementsFound, false);
  assert.ok(Array.isArray(recovered.recoveryHistory) && recovered.recoveryHistory.length === 1);
  assert.match(recovered.recoveryHistory[0].originalError, /recalculated bass result could not be published/);
  assert.ok(recovered.recoveryHistory[0].recoveredAt);

  // Cleanup
  resetWorkflow(projectId, versionId);
});

test("setRecoveryComplete does not reset autoApplied to null (unlike resetWorkflow)", () => {
  const projectId = "test-recovery-noreset-" + Date.now();
  const versionId = "test-recovery-ver";
  const store = getOptimiseWorkflowState(projectId, versionId);
  store.autoApplied = { phase: true };
  store.recommendations = { addSubs: true };
  setRecoveryComplete(projectId, versionId, "original error");
  const recovered = getOptimiseWorkflowState(projectId, versionId);
  assert.deepEqual(recovered.autoApplied, { phase: true });
  assert.deepEqual(recovered.recommendations, { addSubs: true });
  resetWorkflow(projectId, versionId);
  const reset = getOptimiseWorkflowState(projectId, versionId);
  assert.equal(reset.autoApplied, null, "resetWorkflow clears autoApplied");
  assert.equal(reset.recommendations, null);
});

// ---------------------------------------------------------------------------
// 12. POST_APPLY_FAILURE_PHASES set
// ---------------------------------------------------------------------------
test("POST_APPLY_FAILURE_PHASES contains recalculating and publishing only", () => {
  assert.ok(POST_APPLY_FAILURE_PHASES.has("recalculating"));
  assert.ok(POST_APPLY_FAILURE_PHASES.has("publishing"));
  assert.equal(POST_APPLY_FAILURE_PHASES.has("applying"), false);
  assert.equal(POST_APPLY_FAILURE_PHASES.has("history"), false);
  assert.equal(POST_APPLY_FAILURE_PHASES.has("idle"), false);
});

// ---------------------------------------------------------------------------
// 13. Stale-result rejection: a previously completed result for a DIFFERENT
//     fingerprint is NOT accepted as success for the pinned fingerprint.
// ---------------------------------------------------------------------------
test("recovery: stale result for different fingerprint is not accepted", async () => {
  const sharedRef = makeShared({
    cacheKey: "cal:v1:newdesign",
    resultFingerprint: "cal:v0:olddesign", // different fingerprint, already present
    authorityStatus: "AUTHORITATIVE",
  });
  const phaseRef = makePhase();
  let onCalculateCalled = false;
  // onCalculate eventually publishes the correct result
  sharedRef.current.onCalculate = () => {
    onCalculateCalled = true;
    setTimeout(() => {
      sharedRef.current = {
        ...sharedRef.current,
        cacheKey: "cal:v1:newdesign",
        completedBassAuthority: {
          authorityStatus: "AUTHORITATIVE",
          contract: { job: { resultFingerprint: "cal:v1:newdesign" } },
        },
      };
    }, 15);
  };
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef, phaseRef,
    sleepMs: 5, timeoutMs: 5000,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
  assert.equal(result.action, "success");
  assert.equal(onCalculateCalled, true, "onCalculate must be called because the existing result was for a different fingerprint");
  assert.equal(result.reused, false);
});