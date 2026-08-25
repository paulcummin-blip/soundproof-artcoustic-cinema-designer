// stage2Placement.worker.js
// Worker that evaluates a SINGLE Stage 1 finalist through the full canonical
// bass authority pipeline. The controller maintains a pool of 2 workers for
// concurrent evaluation.

import { evaluateStage2Finalist } from "./stage2CanonicalEvaluation";

self.onmessage = (event) => {
  const { requestId, fingerprint, finalist, ...params } = event.data || {};
  if (!requestId) {
    self.postMessage({ type: "error", requestId: null, error: "Missing requestId" });
    return;
  }
  try {
    const result = evaluateStage2Finalist({ finalist, ...params });
    self.postMessage({ type: "complete", requestId, fingerprint, finalistId: finalist?.id, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      fingerprint,
      finalistId: finalist?.id,
      error: error?.message || String(error) || "Stage 2 canonical evaluation failed",
    });
  }
};