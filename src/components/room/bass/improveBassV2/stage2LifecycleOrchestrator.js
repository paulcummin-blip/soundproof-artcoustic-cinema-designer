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

import { getStage2State, subscribeStage2 } from "../stage2/stage2PlacementStore";
import {
  getBassHeavyAction,
  subscribeBassHeavyAction,
  cancelBassHeavyAction,
} from "../bassHeavyActionStore";

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
export function isStage2ReadyForConsumption(stage2State) {
  if (!stage2State) return false;
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
export function waitForStage2Terminal(projectId, { isCancelled, getCurrentFingerprint, startFingerprint } = {}) {
  return new Promise((resolve) => {
    let resolved = false;
    let unsubscribeStage2 = null;
    let unsubscribeHeavy = null;
    let timeoutHandle = null;

    const cleanup = () => {
      if (unsubscribeStage2) { unsubscribeStage2(); unsubscribeStage2 = null; }
      if (unsubscribeHeavy) { unsubscribeHeavy(); unsubscribeHeavy = null; }
      if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
    };

    const settle = (result) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    const check = () => {
      if (resolved) return;

      // Cancellation — user pressed Cancel
      if (isCancelled && isCancelled()) {
        cancelBassHeavyAction(projectId, "Improve Bass cancelled");
        settle({ status: "cancelled" });
        return;
      }

      // Design changed during Stage 2 — reject stale finalists
      if (startFingerprint && getCurrentFingerprint) {
        try {
          const currentFp = getCurrentFingerprint();
          if (currentFp && currentFp !== startFingerprint) {
            cancelBassHeavyAction(projectId, "Design changed during Stage 2");
            settle({ status: "stale", message: "Design changed during Stage 2 evaluation" });
            return;
          }
        } catch {
          // If fingerprint computation fails, skip stale check (safe fallback)
        }
      }

      // Stage 2 complete — consume evaluatedFinalists
      const stage2 = getStage2State(projectId);
      if (stage2.status === "complete") {
        settle({ status: "complete", stage2 });
        return;
      }

      // Stage 2 error — terminate cleanly
      if (stage2.status === "error") {
        settle({ status: "error", error: stage2.errorMessage || "Stage 2 evaluation failed" });
        return;
      }

      // Heavy action cancelled or error (safety net — BassBackgroundAnalysisOwner
      // cancels the heavy action when the design changes)
      const heavy = getBassHeavyAction(projectId);
      if (heavy?.status === "cancelled") {
        settle({ status: "cancelled" });
        return;
      }
      if (heavy?.status === "error") {
        settle({ status: "error", error: heavy.error || "Stage 2 evaluation failed" });
        return;
      }
    };

    // Safety timeout
    timeoutHandle = setTimeout(() => {
      settle({ status: "timeout", error: "Stage 2 evaluation timed out" });
    }, STAGE2_WAIT_TIMEOUT_MS);

    // Check immediately (Stage 2 might already be complete)
    check();

    // Subscribe if not yet resolved
    if (!resolved) {
      unsubscribeStage2 = subscribeStage2(check);
      unsubscribeHeavy = subscribeBassHeavyAction(check);
      // Re-check after subscribing (state might have changed between check and subscribe)
      check();
    }
  });
}