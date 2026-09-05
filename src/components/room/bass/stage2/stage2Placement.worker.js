// stage2Placement.worker.js
// Worker that evaluates Stage 1 finalists through the two-phase canonical
// bass authority pipeline.
//
// Phase 1 — PLACEMENT (P14-independent):
//   Runs evaluateStage2Placement to compute the raw modal transfer
//   (rspRawCurve, perSeatRawCurves, sources, alignment). Cached under
//   the placement fingerprint and reused across P14 changes.
//
// Phase 2 — CONFIRMATION (P14-dependent):
//   Runs evaluateStage2Confirmation using a cached raw transfer to
//   produce P14/P18/P19/P20 authority. Does NOT re-run the modal simulation.

import { evaluateStage2Placement, evaluateStage2Confirmation, evaluateStage2ConfirmationWithTuning } from "./stage2CanonicalEvaluation";

self.onmessage = (event) => {
  const { requestId, fingerprint, phase, finalist, rawTransfer, tuningVariant, ...params } = event.data || {};
  if (!requestId) {
    self.postMessage({ type: "error", requestId: null, error: "Missing requestId" });
    return;
  }
  try {
    if (phase === "placement") {
      const result = evaluateStage2Placement({ finalist, ...params });
      self.postMessage({ type: "complete", requestId, fingerprint, phase: "placement", finalistId: finalist?.id, result });
    } else if (phase === "confirmation") {
      if (!rawTransfer) {
        self.postMessage({ type: "error", requestId, fingerprint, phase: "confirmation", finalistId: finalist?.id, error: "Missing rawTransfer for confirmation phase" });
        return;
      }
      // Delay-only and level+delay variants re-sum the per-source per-seat
      // complex transfers with searched tuning, then run the full canonical
      // chain. Placement-only uses the existing confirmation path.
      if (tuningVariant === "delay-only" || tuningVariant === "level-delay") {
        const result = evaluateStage2ConfirmationWithTuning(rawTransfer, { tuningVariant, ...params });
        self.postMessage({ type: "complete", requestId, fingerprint, phase: "confirmation", finalistId: finalist?.id, tuningVariant, result });
      } else {
        const result = evaluateStage2Confirmation(rawTransfer, params);
        self.postMessage({ type: "complete", requestId, fingerprint, phase: "confirmation", finalistId: finalist?.id, result });
      }
    } else {
      // Legacy: full combined evaluation (backward compatibility)
      const result = evaluateStage2Confirmation(
        evaluateStage2Placement({ finalist, ...params }),
        params,
      );
      self.postMessage({ type: "complete", requestId, fingerprint, phase: "combined", finalistId: finalist?.id, result });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      fingerprint,
      phase: phase || "combined",
      finalistId: finalist?.id,
      error: error?.message || String(error) || "Stage 2 evaluation failed",
    });
  }
};