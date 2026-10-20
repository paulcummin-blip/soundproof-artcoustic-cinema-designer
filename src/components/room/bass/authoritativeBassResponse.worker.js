import { simulateAuthoritativeBassResponse } from "./authoritativeBassResponseEngine";
import { captureCombinedIntegrationTransfers } from "./combinedIntegrationEngine";

// The combined LCR + subwoofer model is ADDITIVE. A failure inside it must never
// take the authoritative subwoofer-only simulation down with it, so its result
// is isolated and reported as unavailable instead of thrown.
//
// The subwoofer transfers are passed straight through from the authoritative
// run — the combined model never recomputes them.
function captureIntegrationTransfers(payload, result) {
  const integration = payload?.integration;
  if (!integration || integration.enabled === false) return null;
  try {
    return captureCombinedIntegrationTransfers({
      roomDims: payload.roomDims,
      seatingPositions: payload.seatingPositions,
      rspPosition: payload.rspPosition,
      subTransfers: result?.perSourcePerSeatComplexTransfers,
      speakerSources: integration.speakerSources,
      physics: payload.physics,
      qStrategyOverride: payload.qStrategyOverride,
    });
  } catch (error) {
    return { available: false, reason: error?.message || "combined-integration-failed" };
  }
}

self.onmessage = (event) => {
  const { generation, payload } = event.data || {};
  if (!Number.isFinite(generation)) {
    self.postMessage({ type: "error", generation: null, error: "Missing simulation generation" });
    return;
  }

  try {
    const result = simulateAuthoritativeBassResponse(payload || {});
    const integrationTransfers = captureIntegrationTransfers(payload, result);
    self.postMessage({
      type: "complete",
      generation,
      result: integrationTransfers ? { ...result, integrationTransfers } : result,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      generation,
      error: error?.message || String(error) || "Authoritative bass simulation failed",
    });
  }
};