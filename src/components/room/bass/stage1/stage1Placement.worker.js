// stage1Placement.worker.js
// Background worker for Stage 1 placement search.
// Handles cancellation via generation ID — stale results are never published.

import { runFullStage1Search } from "./stage1PlacementEngine";

self.onmessage = (event) => {
  const { requestId, generationId, fingerprint, payload } = event.data || {};
  const cancellationChecker = { cancelled: false };

  // Set up cancellation listener — if a new message arrives, mark as cancelled
  self.onmessage = (nextEvent) => {
    const next = nextEvent.data || {};
    if (next.type === "cancel" && next.requestId === requestId) {
      cancellationChecker.cancelled = true;
    }
  };

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
  }
};