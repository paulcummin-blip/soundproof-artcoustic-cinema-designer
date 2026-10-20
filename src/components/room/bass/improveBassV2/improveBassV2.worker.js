import { captureCombinedIntegrationTransfers } from "../combinedIntegrationEngine";
import { simulateAuthoritativeBassResponse } from "../authoritativeBassResponseEngine";
import { runCrossoverIntegrationSearch } from "./crossoverIntegrationSearch";
import { setRoomSimulationObserver } from "./improveBassV2RuntimeMetrics";
let integrationContext = null;
function attachIntegration(rawTransfer) {
  if (!integrationContext?.speakerSources?.length || !rawTransfer) return rawTransfer;
  const seatingPositions = rawTransfer.seatingPositions || integrationContext.seatingPositions;
  const rspPosition = rawTransfer.rspPosition || integrationContext.rspPosition;
  const payload = {
    roomDims: integrationContext.roomDims, seatingPositions, rspPosition,
    physics: integrationContext.physics, qStrategyOverride: "ab_corrected",
    sources: rawTransfer.sources,
  };
  const flat = rawTransfer.perSourceRspComplexTransfers?.length
    ? rawTransfer.perSourceRspComplexTransfers
    : simulateAuthoritativeBassResponse({ ...payload, seatingPositions: [] }).perSourceRspComplexTransfers;
  const integrationTransfers = captureCombinedIntegrationTransfers({
    ...payload, subSources: rawTransfer.sources,
    subTransfers: rawTransfer.perSourcePerSeatComplexTransfers,
    speakerSources: integrationContext.speakerSources,
  });
  if (!integrationTransfers?.available) throw new Error("Combined source transfer capture failed");
  return { ...rawTransfer, perSourceRspComplexTransfers: flat, integrationTransfers, crossover: integrationContext.crossover };
}
// improveBassV2.worker.js
// Worker for the V2 Improve Bass Response heavy computation phases.
// Handles placement evaluation (modal simulation) and canonical confirmation
// (EQ pool, P14/P18/P19/P20 authority) off the main thread.

import { evaluateStage2Placement, evaluateStage2ConfirmationWithTuning } from "../stage2/stage2CanonicalEvaluation";
import { evaluateSeatingBatch } from "../stage2/stage2SeatingBatchEvaluation.js";

import { runGroupedDelaySearch } from "./groupedDelaySearch.js";
import { runGroupedGainSearch } from "./groupedGainSearch.js";
import { runGroupedPhaseSearch } from "./groupedPhaseSearch.js";

self.onmessage = (event) => {
  const { requestId, phase, ...params } = event.data || {};
  if (!requestId) {
    self.postMessage({ type: "error", requestId: null, error: "Missing requestId" });
    return;
  }
  setRoomSimulationObserver(kind => self.postMessage({ type: "diagnostic", requestId, counts: { [kind]: 1 } }));
  try {
    if (phase === "integration-context") {
      integrationContext = params.context;
      self.postMessage({ type: "complete", requestId, phase, result: { ready: true } });
    } else if (phase === "crossover-integration") {
      const rawTransfer = attachIntegration(params.rawTransfer);
      const result = runCrossoverIntegrationSearch({ ...params, rawTransfer,
        crossover: integrationContext.crossover,
        speakerModels: integrationContext.speakerSources.map(s => s.modelKey) });
      self.postMessage({ type: "complete", requestId, phase, result });
    } else if (phase === "placement") {
      const result = evaluateStage2Placement(params);
      self.postMessage({ type: "complete", requestId, phase: "placement", result });
    } else if (phase === "seating-batch") {
      const result = evaluateSeatingBatch(params);
      self.postMessage({ type: "complete", requestId, phase: "seating-batch", result });
    } else if (phase === "grouped-phase") {
      const result = runGroupedPhaseSearch(params);
      self.postMessage({ type: "complete", requestId, phase, result });
    } else if (phase === "grouped-delay") {
      const result = runGroupedDelaySearch(params);
      self.postMessage({ type: "complete", requestId, phase, result });
    } else if (phase === "grouped-gain") {
      const result = runGroupedGainSearch(params);
      self.postMessage({ type: "complete", requestId, phase, result });
    } else if (phase === "confirmation") {
      const { rawTransfer, tuning, tuningVariant, ...p14Params } = params;
      const result = evaluateStage2ConfirmationWithTuning(attachIntegration(rawTransfer), {
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