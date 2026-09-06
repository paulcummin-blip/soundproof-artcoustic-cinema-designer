// improveBassV2.worker.js
// Worker for the V2 Improve Bass Response heavy computation phases.
// Handles placement evaluation (modal simulation) and canonical confirmation
// (EQ pool, P14/P18/P19/P20 authority) off the main thread.

import { evaluateStage2Placement, evaluateStage2ConfirmationWithTuning } from "../stage2/stage2CanonicalEvaluation";

self.onmessage = (event) => {
  const { requestId, phase, ...params } = event.data || {};
  if (!requestId) {
    self.postMessage({ type: "error", requestId: null, error: "Missing requestId" });
    return;
  }
  try {
    if (phase === "placement") {
      const result = evaluateStage2Placement(params);
      self.postMessage({ type: "complete", requestId, phase: "placement", result });
    } else if (phase === "confirmation") {
      const { rawTransfer, tuning, tuningVariant, ...p14Params } = params;
      const result = evaluateStage2ConfirmationWithTuning(rawTransfer, {
        tuning,
        tuningVariant: tuningVariant || "delay-polarity-trim",
        ...p14Params,
      });
      self.postMessage({ type: "complete", requestId, phase: "confirmation", result });
    } else {
      self.postMessage({ type: "error", requestId, error: `Unknown phase: ${phase}` });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      error: error?.message || String(error) || "Improve Bass V2 worker failed",
    });
  }
};