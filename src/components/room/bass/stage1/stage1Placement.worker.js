// stage1Placement.worker.js
// Background worker for Stage 1 placement search.
// The dispatcher lives for the worker lifetime; cancellation belongs to a job.
//
// The engine (runFullStage1Search) is now ASYNC: it dispatches independent
// coarse/fine candidate evaluations to a bounded POOL of evaluation workers
// (stage1Evaluation.worker.js) via runBoundedConfirmations, while generation,
// ranking, finalist selection and A-prohibition validation stay on this
// orchestrator. The phase barrier (coarse completes before fine starts) is
// preserved inside the engine.
//
// Cancellation: the cancel message sets the cancellation checker AND aborts
// the pool's AbortController, which terminates every pool worker — so no
// background candidate work survives cancellation.

import { runFullStage1Search } from "./stage1PlacementEngine";
import { createStage1EvaluationPool } from "./stage1EvaluationPool";
import { STAGE1_CONCURRENCY } from "./stage1Constants";

let activeJob = null;

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "cancel") {
    if (activeJob?.requestId === message.requestId) {
      activeJob.cancellationChecker.cancelled = true;
      try { activeJob.controller.abort(); } catch { /* already aborted */ }
    }
    return;
  }
  // Existing job messages have no type; control messages are not search jobs.
  if (message.type || !message.requestId) return;
  const { requestId, fingerprint, payload } = message;
  const cancellationChecker = { cancelled: false };
  const controller = new AbortController();
  activeJob = { requestId, cancellationChecker, controller };

  const context = {
    roomDims: payload.roomDims,
    rspPosition: payload.rspPosition,
    seatingPositions: payload.seatingPositions,
    physicsOptions: payload.physicsOptions,
  };
  const pool = createStage1EvaluationPool({
    size: STAGE1_CONCURRENCY,
    context,
    signal: controller.signal,
    onProgress: detail => self.postMessage({ type: "progress", requestId, fingerprint, detail }),
  });

  (async () => {
    try {
      const result = await runFullStage1Search({
        roomDims: payload.roomDims,
        rspPosition: payload.rspPosition,
        seatingPositions: payload.seatingPositions,
        physicsOptions: payload.physicsOptions,
        generationId: cancellationChecker,
        scopeQuantity: payload.scopeQuantity ?? null,
        pool,
        stage1Concurrency: STAGE1_CONCURRENCY,
      });

      if (cancellationChecker.cancelled) {
        self.postMessage({ type: "cancelled", requestId, fingerprint });
        return;
      }
      pool.throwIfFailed();

      self.postMessage({ type: "complete", requestId, fingerprint, result });
    } catch (error) {
      if (cancellationChecker.cancelled) {
        self.postMessage({ type: "cancelled", requestId, fingerprint });
        return;
      }
      self.postMessage({ type: "error", requestId, fingerprint, error: error?.message || String(error) });
    } finally {
      try { pool.terminateAll(); } catch { /* already terminated */ }
      activeJob = null;
    }
  })();
};