// stage2LifecycleOrchestrator.js
// Orchestrates the Stage 2 placement lifecycle through the existing
// requestBassHeavyAction flow. Improve Bass uses this to either reuse an
// existing valid Stage 2 authority (Case A) or request a new one and wait
// for it to reach a terminal state (Case B) before continuing into the
// V2 finalist/local optimisation flow.
//
// This module does NOT duplicate the Stage 2 engine. It uses the existing
// requestBassHeavyAction lifecycle and the existing mounted Stage 1/Stage 2
// hooks in RoomDesigner.jsx. There is one canonical Stage 2 execution path.

import { getStage2State, subscribeStage2, stage2PlacementController } from "../stage2/stage2PlacementStore";
import {
  getBassHeavyAction,
  subscribeBassHeavyAction,
  cancelBassHeavyAction,
  markBassHeavyActionError,
} from "../bassHeavyActionStore";

import { getStage1State, subscribeStage1, stage1PlacementController } from "../stage1/stage1PlacementStore";
import { subscribeImproveBassV2 } from "./improveBassV2Store";
import { saveStage2TerminalDiagnostics } from "./stage2TerminalDiagnostics";

// Safety timeout — if Stage 2 never reaches a terminal state (e.g. the hook
// never starts because the heavy action was rejected), the orchestrator
// terminates cleanly instead of hanging forever. Generous ceiling matching
// the V2 engine's provisional whole-run timeout.
const STAGE2_WAIT_TIMEOUT_MS = 300000;

/**
 * Check if the current Stage 2 state is ready for consumption by Improve Bass.
 *
 * A valid Stage 2 authority has:
 *   - status === "complete"
 *   - non-null placementFingerprint (raw transfer cache identity)
 *   - non-null fingerprint (combined P14-dependent identity)
 *
 * The useStage2PlacementOptimiser hook validates the fingerprint against the
 * current design on every render when enabled. If the hook detects a mismatch
 * it cancels and marks idle, so a "complete" status with non-null fingerprints
 * is authoritative for the current design.
 *
 * @param {object} stage2State — from getStage2State(projectId)
 * @returns {boolean}
 */
export function isStage2ReadyForConsumption(stage2State, quantity = null) {
  if (!stage2State) return false;
  // A selected-quantity result only serves the quantity it was computed for.
  if (stage2State.scopeQuantity && stage2State.scopeQuantity !== quantity) return false;
  return stage2State.status === "complete"
    && !!stage2State.placementFingerprint
    && !!stage2State.fingerprint;
}

/**
 * Wait for Stage 2 to reach a terminal state after requesting the heavy action.
 *
 * Resolves with:
 *   { status: "complete", stage2 }  — Stage 2 completed successfully
 *   { status: "error", error }      — Stage 2 errored
 *   { status: "cancelled" }          — cancellation was requested
 *   { status: "stale", message }     — design changed during the wait
 *   { status: "timeout", error }    — safety timeout exceeded
 *
 * @param {string} projectId
 * @param {object} options
 * @param {function} options.isCancelled — returns true if cancellation was requested
 * @param {function} [options.getCurrentFingerprint] — returns the current V2 design fingerprint
 * @param {string} [options.startFingerprint] — the V2 design fingerprint at request time
 * @returns {Promise<object>}
 */
export function waitForStage2Terminal(projectId, versionId, {
  isCancelled, getCurrentFingerprint, startFingerprint,
  requestId = null, runId = null, timeoutMs = STAGE2_WAIT_TIMEOUT_MS,
} = {}) {
  return new Promise((resolve) => {
    let resolved = false;
    const subscriptions = [];
    let timeoutHandle = null;
    const startedAtMs = Date.now();
    const trace = [];
    let previousSignature = null;
    const brief = state => ({
      status: state.status, fingerprint: state.fingerprint, ownerRequestId: state.ownerRequestId,
      phase: state.phase, workerRequestId: state.workerRequestId, workerStarted: state.workerStarted,
      completedJobs: state.completedJobs, totalJobsPlanned: state.totalJobsPlanned,
      error: state.errorMessage || null, runtimeDiagnostics: state.runtimeDiagnostics || null,
    });
    const settle = result => {
      if (resolved) return;
      resolved = true;
      subscriptions.forEach(unsubscribe => unsubscribe());
      clearTimeout(timeoutHandle);
      const heavy = getBassHeavyAction(projectId, versionId);
      const diagnostics = saveStage2TerminalDiagnostics({
        runId, requestId: requestId || heavy?.requestId, projectId, versionId,
        sourceFingerprint: heavy?.sourceFingerprint || null,
        startedAtMs, completedAtMs: Date.now(), elapsedMs: Date.now() - startedAtMs,
        outcome: result.status, error: result.error || result.message || null,
        stage1: brief(getStage1State(projectId, versionId)),
        stage2: brief(getStage2State(projectId, versionId)), trace,
      });
      // Only the owner may stop its work. A superseded wait cannot cancel a
      // replacement run, even if both designs have the same fingerprint.
      if (result.status !== "complete" && (!requestId || heavy?.requestId === requestId)) {
        const activeStage1 = stage1PlacementController.activeRequest || stage1PlacementController.pendingRequest;
        if (activeStage1?.projectId === projectId && activeStage1?.versionId === versionId) {
          stage1PlacementController.cancelActive(result.status);
        }
        if (stage2PlacementController.projectId === projectId && stage2PlacementController.versionId === versionId) {
          stage2PlacementController.cancelAll(result.status);
        }
        if (["error", "timeout"].includes(result.status)) {
          markBassHeavyActionError(projectId, versionId, heavy?.requestId, result.error);
        } else cancelBassHeavyAction(projectId, versionId, result.message || result.status);
      }
      resolve({ ...result, diagnostics });
    };

    const check = () => {
      if (resolved) return;
      const heavy = getBassHeavyAction(projectId, versionId);
      const stage1 = getStage1State(projectId, versionId);
      const stage2 = getStage2State(projectId, versionId);
      const signature = JSON.stringify([heavy?.status, stage1.status, stage2.status, stage2.phase,
        stage1.runtimeDiagnostics?.lastProgressAtMs, stage2.completedJobs]);
      if (signature !== previousSignature) {
        previousSignature = signature;
        trace.push({ atMs: Date.now(), heavy: heavy?.status, stage1: stage1.status,
          stage2: stage2.status, phase: stage2.phase, completedJobs: stage2.completedJobs });
        if (trace.length > 24) trace.shift();
      }
      if (requestId && heavy?.requestId !== requestId) {
        settle({ status: "stale", message: "Stage 2 request was superseded" }); return;
      }
      if (isCancelled?.()) { settle({ status: "cancelled" }); return; }
      if (startFingerprint && getCurrentFingerprint) {
        try {
          const currentFp = getCurrentFingerprint();
          if (currentFp && currentFp !== startFingerprint) {
            settle({ status: "stale", message: "Design changed during Stage 2 evaluation" }); return;
          }
        } catch { /* no unverified result is promoted */ }
      }
      // Subscribe to the prerequisite directly. React may subsequently reset
      // the disabled hook to idle; the definitive worker failure must survive.
      if ((!requestId || stage1.ownerRequestId === requestId)
          && ["error", "cancelled", "stale"].includes(stage1.status)) {
        settle({ status: stage1.status, error: stage1.errorMessage || "Stage 1 placement search stopped",
          message: stage1.status === "stale" ? "Design changed during placement search" : undefined }); return;
      }
      if (heavy?.status === "error") {
        settle({ status: "error", error: heavy.error || "Placement analysis failed" }); return;
      }
      if (heavy?.status === "cancelled") { settle({ status: "cancelled" }); return; }
      if (!requestId || stage2.ownerRequestId === requestId) {
        if (stage2.status === "complete") { settle({ status: "complete", stage2 }); return; }
        if (["error", "cancelled", "stale"].includes(stage2.status)) {
          settle({ status: stage2.status, error: stage2.errorMessage || "Stage 2 evaluation stopped" }); return;
        }
      }
    };

    timeoutHandle = setTimeout(() => settle({ status: "timeout",
      error: "Placement analysis timed out — retry the optimisation." }), timeoutMs);
    subscriptions.push(subscribeStage1(check), subscribeStage2(check),
      subscribeBassHeavyAction(check), subscribeImproveBassV2(check));
    check();
  });
}
