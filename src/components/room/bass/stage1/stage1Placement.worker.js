// stage1Placement.worker.js
// Background worker for Stage 1 placement search.
// The dispatcher lives for the worker lifetime; cancellation belongs to a job.
// Search is synchronous: queued jobs run serially. Active UI cancellation still
// terminates the worker in the controller, rather than waiting for this event loop.

import { runFullStage1Search } from "./stage1PlacementEngine";

let activeJob = null;

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "cancel") {
    if (activeJob?.requestId === message.requestId) {
      activeJob.cancellationChecker.cancelled = true;
    }
    return;
  }
  // Existing job messages have no type; control messages are not search jobs.
  if (message.type || !message.requestId) return;
  const { requestId, fingerprint, payload } = message;
  const cancellationChecker = { cancelled: false };
  activeJob = { requestId, cancellationChecker };

  try {
    const result = runFullStage1Search({
      roomDims: payload.roomDims,
      rspPosition: payload.rspPosition,
      seatingPositions: payload.seatingPositions,
      physicsOptions: payload.physicsOptions,
      generationId: cancellationChecker,
    });

    if (cancellationChecker.cancelled) {
      self.postMessage({ type: "cancelled", requestId, fingerprint });
      return;
    }

    self.postMessage({ type: "complete", requestId, fingerprint, result });
  } catch (error) {
    if (cancellationChecker.cancelled) {
      self.postMessage({ type: "cancelled", requestId, fingerprint });
      return;
    }
    self.postMessage({ type: "error", requestId, fingerprint, error: error?.message || String(error) });
  } finally {
    activeJob = null;
  }
};