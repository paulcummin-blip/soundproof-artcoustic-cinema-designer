import test from "node:test";
import assert from "node:assert/strict";
import {
  attemptRecoveryRetry,
  isAuthoritativeForFingerprint,
  contractStructurallyComplete,
  POST_APPLY_FAILURE_PHASES,
  TERMINAL_FAILURE_OUTCOMES,
} from "../src/components/room/bass/optimiseWorkflow/recoveryRetry.js";
import {
  getOptimiseWorkflowState,
  setWorkflowError,
  setRecoveryComplete,
  appendRecoveryFailure,
  resetWorkflow,
} from "../src/components/room/bass/optimiseWorkflow/optimiseWorkflowStore.js";

// ---------------------------------------------------------------------------
// Bass-owner lifecycle simulator.
//
// Models the real BassBackgroundAnalysisOwner contract the orchestrator reads:
//   - onCalculate() returns { action: "queued", requestId, fingerprint } when
//     canCalculate, or { action: "blocked" } otherwise.
//   - calculationInProgress masks calculationOutcome (phase shown while running).
//   - On success: completedBassAuthority becomes AUTHORITATIVE with a
//     structurally complete contract (resultFingerprint === currentJobFingerprint
//     === cacheKey), calculationInProgress=false, calculationOutcome="success".
//   - On failure: calculationOutcome becomes a terminal failure, terminalMessage
//     set, calculationInProgress=false, no authoritative contract.
//   - onCalculate does NOT synchronously clear lastTerminalOutcome: an old
//     terminal present at entry lingers until the new request masks it via
//     calculationInProgress.
// ---------------------------------------------------------------------------

function makeOwner({
  cacheKey = "cal:v1:design",
  canCalculate = true,
  initialOutcome = null,
  initialTerminalMessage = null,
  initialInProgress = false,
  initialAuthoritative = false, // authoritative result already present at entry
  // lifecycle timing
  startAfterTicks = 1,
  resolveAfterTicks = 3,
  tickMs = 5,
  // outcome of the NEW dispatched calculation: "success" | "rejected" | "error" | "timeout"
  newOutcome = "success",
} = {}) {
  const state = {
    cacheKey,
    calculationInProgress: initialInProgress,
    calculationOutcome: initialInProgress ? "preparing" : initialOutcome,
    terminalMessage: initialInProgress ? null : initialTerminalMessage,
    completedBassAuthority: initialAuthoritative
      ? {
          authorityStatus: "AUTHORITATIVE",
          contract: {
            job: {
              status: "complete",
              resultFingerprint: cacheKey,
              currentJobFingerprint: cacheKey,
            },
          },
        }
      : { authorityStatus: "UPDATING", contract: { job: { status: "updating" } } },
  };
  const sharedRef = { current: state };
  let seq = 0;
  const onCalculate = () => {
    if (!canCalculate) return { action: "blocked" };
    seq += 1;
    const requestId = `req-${seq}`;
    const fingerprint = state.cacheKey;
    // Schedule lifecycle: start (in-progress) then resolve.
    let ticks = 0;
    const interval = setInterval(() => {
      ticks += 1;
      if (ticks >= startAfterTicks && !state.calculationInProgress) {
        // New request starts running — masks any old terminal.
        state.calculationInProgress = true;
        state.calculationOutcome = "preparing";
        state.terminalMessage = null;
      }
      if (ticks >= resolveAfterTicks) {
        clearInterval(interval);
        state.calculationInProgress = false;
        if (newOutcome === "success") {
          state.calculationOutcome = "success";
          state.terminalMessage = null;
          state.completedBassAuthority = {
            authorityStatus: "AUTHORITATIVE",
            contract: {
              job: {
                status: "complete",
                resultFingerprint: state.cacheKey,
                currentJobFingerprint: state.cacheKey,
              },
            },
          };
        } else {
          state.calculationOutcome = newOutcome;
          state.terminalMessage = `New calculation ${newOutcome}: simulated failure`;
          // No authoritative contract on failure.
        }
      }
    }, tickMs);
    return { action: "queued", requestId, fingerprint };
  };
  state.onCalculate = onCalculate;
  return { sharedRef, onCalculate };
}

function makeIdentity({
  projectId = "proj-1",
  versionId = "ver-1",
  settingsSignature = "sig-1",
} = {}) {
  const identity = { projectId, versionId, settingsSignature };
  return {
    read: () => ({ ...identity }),
    set: (patch) => Object.assign(identity, patch),
  };
}

function makePhase() {
  return { current: "idle" };
}

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. Non-post-apply phases fall back to reset (no recovery attempted).
// ---------------------------------------------------------------------------
test("recovery: non-post-apply phase falls back to reset", async () => {
  const owner = makeOwner();
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "applying",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleep: () => Promise.resolve(),
  });
  assert.equal(result.action, "fallback-reset");
});

test("recovery: genuine optimiser failure (null phase) falls back to reset", async () => {
  const owner = makeOwner();
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: null,
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleep: () => Promise.resolve(),
  });
  assert.equal(result.action, "fallback-reset");
});

// ---------------------------------------------------------------------------
// 2. CORRECTION 1 — initial rejected (old terminal) -> fresh dispatch -> success.
//    The old terminal must NOT cause an immediate failure; recovery dispatches a
//    fresh onCalculate and accepts the new authoritative result.
// ---------------------------------------------------------------------------
test("recovery: initial rejected terminal dispatches fresh calc and succeeds", async () => {
  const owner = makeOwner({
    initialOutcome: "rejected",
    initialTerminalMessage: "Original bass calculation rejected",
    newOutcome: "success",
    startAfterTicks: 1,
    resolveAfterTicks: 3,
  });
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: realSleep,
  });
  assert.equal(result.action, "success");
  assert.equal(result.reused, false, "a new calculation ran, not a reuse");
  assert.equal(result.pinned.cacheKey, "cal:v1:design");
  // Original diagnostics preserved even on success path? Not required on
  // success, but the new result must be authoritative and matching.
  assert.equal(
    owner.sharedRef.current.completedBassAuthority.contract.job.resultFingerprint,
    "cal:v1:design",
  );
});

// ---------------------------------------------------------------------------
// 3. CORRECTION 1 — initial rejected -> fresh dispatch -> NEW rejection.
//    The new failure is returned (new terminalMessage), and the OLD diagnostics
//    are preserved on the result.
// ---------------------------------------------------------------------------
test("recovery: initial rejected then new rejection preserves new failure and old diagnostics", async () => {
  const owner = makeOwner({
    initialOutcome: "rejected",
    initialTerminalMessage: "Original bass calculation rejected",
    newOutcome: "rejected",
    startAfterTicks: 1,
    resolveAfterTicks: 3,
  });
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: realSleep,
  });
  assert.equal(result.action, "failed");
  assert.equal(result.outcome, "rejected", "the NEW terminal outcome is reported");
  assert.match(result.reason, /New calculation rejected/);
  assert.equal(result.originalOutcome, "rejected", "old outcome preserved");
  assert.equal(result.originalTerminalMessage, "Original bass calculation rejected");
});

// ---------------------------------------------------------------------------
// 4. Initial error/timeout old terminal -> fresh dispatch -> success.
// ---------------------------------------------------------------------------
test("recovery: initial error terminal dispatches fresh calc and succeeds", async () => {
  const owner = makeOwner({
    initialOutcome: "error",
    initialTerminalMessage: "Original error",
    newOutcome: "success",
  });
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "publishing",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: realSleep,
  });
  assert.equal(result.action, "success");
  assert.equal(result.reused, false);
});

test("recovery: initial timeout terminal dispatches fresh calc and succeeds", async () => {
  const owner = makeOwner({
    initialOutcome: "timeout",
    initialTerminalMessage: "Original timeout",
    newOutcome: "success",
  });
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: realSleep,
  });
  assert.equal(result.action, "success");
  assert.equal(result.originalOutcome, "timeout");
});

// ---------------------------------------------------------------------------
// 5. Old terminal prohibits stale-authority reuse AND old authority is not
//    accepted before the new request completes.
// ---------------------------------------------------------------------------
test("recovery: old terminal with authoritative present dispatches fresh, does not reuse", async () => {
  let onCalculateCalls = 0;
  const owner = makeOwner({
    initialAuthoritative: true, // authoritative result already present
    initialOutcome: "rejected", // but an old terminal is also present
    initialTerminalMessage: "Original rejected",
    newOutcome: "success",
  });
  const origOnCalc = owner.onCalculate;
  owner.sharedRef.current.onCalculate = () => { onCalculateCalls += 1; return origOnCalc(); };
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: realSleep,
  });
  assert.equal(result.action, "success");
  assert.equal(result.reused, false, "must NOT reuse the pre-existing authority when an old terminal is present");
  assert.equal(onCalculateCalls, 1, "a fresh onCalculate must have been dispatched");
});

test("recovery: old authority not accepted before new request completes", async () => {
  // Authoritative result present at entry matching pinned, old terminal present.
  // The new dispatch is delayed from starting (startAfterTicks high) so the old
  // authority is still visible during the wait. It must NOT be accepted until
  // the new request runs and settles.
  const owner = makeOwner({
    initialAuthoritative: true,
    initialOutcome: "rejected",
    initialTerminalMessage: "Original rejected",
    newOutcome: "success",
    startAfterTicks: 4, // new request starts late
    resolveAfterTicks: 6,
  });
  const id = makeIdentity();
  let sawOldAuthorityDuringWait = false;
  const phaseRef = makePhase();
  // Wrap to peek: after a couple of ticks, the old authority is still present
  // but the new request hasn't started yet.
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef,
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: async (ms) => {
      // Before the new request starts, the authoritative result is present
      // but must not be accepted.
      if (owner.sharedRef.current.calculationInProgress === false
          && owner.sharedRef.current.completedBassAuthority?.authorityStatus === "AUTHORITATIVE") {
        sawOldAuthorityDuringWait = true;
      }
      await realSleep(ms);
    },
  });
  assert.equal(result.action, "success");
  assert.equal(result.reused, false);
  assert.equal(sawOldAuthorityDuringWait, true, "test observed the old authority during the wait");
});

// ---------------------------------------------------------------------------
// 6. No old terminal + authoritative present -> explicit reuse (no dispatch).
// ---------------------------------------------------------------------------
test("recovery: no terminal + authoritative present is reused without dispatch", async () => {
  let onCalculateCalled = false;
  const owner = makeOwner({
    initialAuthoritative: true,
    initialOutcome: null, // no old terminal
  });
  owner.sharedRef.current.onCalculate = () => { onCalculateCalled = true; return { action: "queued", requestId: "x", fingerprint: "cal:v1:design" }; };
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleep: () => Promise.resolve(),
  });
  assert.equal(result.action, "success");
  assert.equal(result.reused, true);
  assert.equal(onCalculateCalled, false, "onCalculate must NOT be called for explicit reuse");
});

// ---------------------------------------------------------------------------
// 7. Blocked dispatch (canCalculate false) -> failed.
// ---------------------------------------------------------------------------
test("recovery: blocked dispatch returns failed", async () => {
  const owner = makeOwner({ canCalculate: false, initialOutcome: "rejected", initialTerminalMessage: "orig" });
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleep: () => Promise.resolve(),
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /not ready \(blocked\)/);
  assert.equal(result.originalOutcome, "rejected");
});

// ---------------------------------------------------------------------------
// 8. Dispatch fingerprint mismatch (design changed at dispatch) -> failed.
// ---------------------------------------------------------------------------
test("recovery: dispatch fingerprint mismatch returns failed", async () => {
  const owner = makeOwner({ initialOutcome: "rejected", initialTerminalMessage: "orig" });
  // Override onCalculate to return a fingerprint different from pinned cacheKey.
  owner.sharedRef.current.onCalculate = () => ({ action: "queued", requestId: "r1", fingerprint: "cal:v2:different" });
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleep: () => Promise.resolve(),
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /design changed at recovery dispatch/);
  assert.equal(result.actualCacheKey, "cal:v2:different");
});

// ---------------------------------------------------------------------------
// 9. cacheKey changes during wait -> failed (identity change).
// ---------------------------------------------------------------------------
test("recovery: cacheKey change during wait is rejected", async () => {
  const owner = makeOwner({ initialOutcome: "rejected", initialTerminalMessage: "orig", newOutcome: "success", startAfterTicks: 2, resolveAfterTicks: 8 });
  const id = makeIdentity();
  const phaseRef = makePhase();
  let ticks = 0;
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef,
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: async (ms) => {
      ticks += 1;
      if (ticks === 2) owner.sharedRef.current.cacheKey = "cal:v2:changed";
      await realSleep(ms);
    },
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /design changed during recovery/);
  assert.equal(result.actualCacheKey, "cal:v2:changed");
});

// ---------------------------------------------------------------------------
// 10. versionId changes during wait -> failed.
// ---------------------------------------------------------------------------
test("recovery: versionId change during wait is rejected", async () => {
  const owner = makeOwner({ initialOutcome: "rejected", initialTerminalMessage: "orig", newOutcome: "success", startAfterTicks: 2, resolveAfterTicks: 8 });
  const id = makeIdentity({ versionId: "ver-1" });
  const phaseRef = makePhase();
  let ticks = 0;
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef,
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: async (ms) => {
      ticks += 1;
      if (ticks === 2) id.set({ versionId: "ver-2" });
      await realSleep(ms);
    },
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /project or version changed during recovery/);
  assert.equal(result.actualIdentity.versionId, "ver-2");
});

// ---------------------------------------------------------------------------
// 11. settingsSignature changes during wait -> failed.
// ---------------------------------------------------------------------------
test("recovery: settingsSignature change during wait is rejected", async () => {
  const owner = makeOwner({ initialOutcome: "rejected", initialTerminalMessage: "orig", newOutcome: "success", startAfterTicks: 2, resolveAfterTicks: 8 });
  const id = makeIdentity({ settingsSignature: "sig-1" });
  const phaseRef = makePhase();
  let ticks = 0;
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef,
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: async (ms) => {
      ticks += 1;
      if (ticks === 2) id.set({ settingsSignature: "sig-2" });
      await realSleep(ms);
    },
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /subwoofer settings changed during recovery/);
  assert.equal(result.actualSettingsSignature, "sig-2");
});

// ---------------------------------------------------------------------------
// 12. Cancel during wait -> failed.
// ---------------------------------------------------------------------------
test("recovery: cancel during wait returns failed", async () => {
  const owner = makeOwner({ initialOutcome: "rejected", initialTerminalMessage: "orig", newOutcome: "success", startAfterTicks: 2, resolveAfterTicks: 8 });
  const id = makeIdentity();
  const phaseRef = makePhase();
  let ticks = 0;
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef,
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: async (ms) => {
      ticks += 1;
      if (ticks >= 2) phaseRef.current = "cancelled";
      await realSleep(ms);
    },
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /cancelled/);
});

// ---------------------------------------------------------------------------
// 13. Timeout: dispatched calc never resolves -> failed.
// ---------------------------------------------------------------------------
test("recovery: no resolution within timeout returns failed", async () => {
  const owner = makeOwner({ initialOutcome: "rejected", initialTerminalMessage: "orig", newOutcome: "success", resolveAfterTicks: 100 });
  const id = makeIdentity();
  const result = await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 60,
    sleep: realSleep,
  });
  assert.equal(result.action, "failed");
  assert.match(result.reason, /could not be published within the expected time/);
});

// ---------------------------------------------------------------------------
// 14. Only onCalculate is called; no search/apply functions invoked.
// ---------------------------------------------------------------------------
test("recovery: only onCalculate called, no search/apply", async () => {
  const calls = [];
  const owner = makeOwner({ initialOutcome: "rejected", initialTerminalMessage: "orig", newOutcome: "success" });
  owner.sharedRef.current.onCalculate = () => { calls.push("onCalculate"); return { action: "queued", requestId: "r1", fingerprint: "cal:v1:design" }; };
  // schedule resolution since the overridden onCalculate won't.
  let ticks = 0;
  const interval = setInterval(() => {
    ticks += 1;
    if (ticks >= 3) {
      clearInterval(interval);
      const s = owner.sharedRef.current;
      s.calculationInProgress = false;
      s.calculationOutcome = "success";
      s.completedBassAuthority = {
        authorityStatus: "AUTHORITATIVE",
        contract: { job: { status: "complete", resultFingerprint: s.cacheKey, currentJobFingerprint: s.cacheKey } },
      };
    }
  }, 5);
  owner.sharedRef.current.runOptimisation = () => calls.push("search");
  owner.sharedRef.current.applyCalibration = () => calls.push("apply");
  const id = makeIdentity();
  await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleepMs: 5,
    timeoutMs: 5000,
    sleep: realSleep,
  });
  assert.deepEqual(calls, ["onCalculate"]);
});

// ---------------------------------------------------------------------------
// 15. Settings/plan immutability: orchestrator does not mutate settings or plan.
// ---------------------------------------------------------------------------
test("recovery: orchestrator does not mutate settings or plan fields", async () => {
  const owner = makeOwner({ initialAuthoritative: true, initialOutcome: null });
  owner.sharedRef.current.authoritative = { crossover: { frequencyHz: 80 }, sources: [] };
  owner.sharedRef.current.savedPlan = { runId: "run-1", decisionApplied: false };
  const id = makeIdentity();
  await attemptRecoveryRetry({
    lastErrorPhase: "recalculating",
    sharedRef: owner.sharedRef,
    phaseRef: makePhase(),
    readLiveIdentity: id.read,
    sleep: () => Promise.resolve(),
  });
  assert.deepEqual(owner.sharedRef.current.authoritative.crossover, { frequencyHz: 80 });
  assert.equal(owner.sharedRef.current.savedPlan.runId, "run-1");
  assert.equal(owner.sharedRef.current.savedPlan.decisionApplied, false);
});

// ---------------------------------------------------------------------------
// 16. isAuthoritativeForFingerprint / contractStructurallyComplete.
// ---------------------------------------------------------------------------
test("contractStructurallyComplete requires ready/complete + matching fingerprints", () => {
  assert.equal(contractStructurallyComplete({
    job: { status: "complete", resultFingerprint: "fp", currentJobFingerprint: "fp" },
  }), true);
  assert.equal(contractStructurallyComplete({
    job: { status: "ready", resultFingerprint: "fp", currentJobFingerprint: "fp" },
  }), true);
  assert.equal(contractStructurallyComplete({
    job: { status: "updating", resultFingerprint: "fp", currentJobFingerprint: "fp" },
  }), false);
  assert.equal(contractStructurallyComplete({
    job: { status: "complete", resultFingerprint: "fp", currentJobFingerprint: "other" },
  }), false, "mismatched currentJobFingerprint is not complete");
  assert.equal(contractStructurallyComplete({ job: { status: "complete" } }), false);
});

test("isAuthoritativeForFingerprint requires authoritative + structural + matching fingerprints", () => {
  const ok = {
    completedBassAuthority: {
      authorityStatus: "AUTHORITATIVE",
      contract: { job: { status: "complete", resultFingerprint: "fp-A", currentJobFingerprint: "fp-A" } },
    },
  };
  assert.equal(isAuthoritativeForFingerprint(ok, "fp-A"), true);
  assert.equal(isAuthoritativeForFingerprint(ok, "fp-B"), false);
  assert.equal(isAuthoritativeForFingerprint({ ...ok, completedBassAuthority: { ...ok.completedBassAuthority, authorityStatus: "UPDATING" } }, "fp-A"), false);
  // currentJobFingerprint must match too
  const stale = {
    completedBassAuthority: {
      authorityStatus: "AUTHORITATIVE",
      contract: { job: { status: "complete", resultFingerprint: "fp-A", currentJobFingerprint: "fp-X" } },
    },
  };
  assert.equal(isAuthoritativeForFingerprint(stale, "fp-A"), false, "stale currentJobFingerprint rejected");
  assert.equal(isAuthoritativeForFingerprint(null, "fp-A"), false);
});

// ---------------------------------------------------------------------------
// 17. POST_APPLY_FAILURE_PHASES / TERMINAL_FAILURE_OUTCOMES sets.
// ---------------------------------------------------------------------------
test("POST_APPLY_FAILURE_PHASES contains recalculating and publishing only", () => {
  assert.ok(POST_APPLY_FAILURE_PHASES.has("recalculating"));
  assert.ok(POST_APPLY_FAILURE_PHASES.has("publishing"));
  assert.equal(POST_APPLY_FAILURE_PHASES.has("applying"), false);
  assert.equal(POST_APPLY_FAILURE_PHASES.has("history"), false);
  assert.equal(POST_APPLY_FAILURE_PHASES.has("idle"), false);
});

test("TERMINAL_FAILURE_OUTCOMES contains the terminal failures", () => {
  for (const o of ["error", "rejected", "timeout", "cancelled", "stale"]) {
    assert.ok(TERMINAL_FAILURE_OUTCOMES.has(o));
  }
  assert.equal(TERMINAL_FAILURE_OUTCOMES.has("success"), false);
  assert.equal(TERMINAL_FAILURE_OUTCOMES.has("idle"), false);
});

// ---------------------------------------------------------------------------
// 18. Store: setRecoveryComplete preserves autoApplied/recommendations and
//     records the original error; appendRecoveryFailure records diagnostics
//     without resetting.
// ---------------------------------------------------------------------------
test("setRecoveryComplete preserves autoApplied/recommendations and records original error", () => {
  const projectId = "test-recovery-proj-" + Date.now();
  const versionId = "test-recovery-ver";
  setWorkflowError(projectId, versionId, "The optimisation completed, but the recalculated bass result could not be published. Retry the update.");
  const store = getOptimiseWorkflowState(projectId, versionId);
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
  resetWorkflow(projectId, versionId);
});

test("appendRecoveryFailure records failure diagnostics without resetting autoApplied", () => {
  const projectId = "test-recovery-fail-" + Date.now();
  const versionId = "test-recovery-ver";
  setWorkflowError(projectId, versionId, "original error");
  const store = getOptimiseWorkflowState(projectId, versionId);
  store.autoApplied = { phase: true };
  store.recommendations = { addSubs: true };
  appendRecoveryFailure(projectId, versionId, {
    originalError: "original error",
    failureReason: "new rejection reason",
    diagnostics: { pinned: { cacheKey: "cal:v1" }, outcome: "rejected" },
  });
  const after = getOptimiseWorkflowState(projectId, versionId);
  assert.equal(after.status, "error", "failure does not mark complete");
  assert.deepEqual(after.autoApplied, { phase: true }, "autoApplied preserved");
  assert.deepEqual(after.recommendations, { addSubs: true }, "recommendations preserved");
  assert.ok(after.recoveryHistory.length >= 1);
  const entry = after.recoveryHistory[after.recoveryHistory.length - 1];
  assert.equal(entry.failureReason, "new rejection reason");
  assert.equal(entry.diagnostics.outcome, "rejected");
  resetWorkflow(projectId, versionId);
});

test("setRecoveryComplete does not reset autoApplied (unlike resetWorkflow)", () => {
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