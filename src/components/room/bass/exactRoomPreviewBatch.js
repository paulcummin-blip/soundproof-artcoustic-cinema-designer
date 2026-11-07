// Preview-only adapter to the existing exact batch modal evaluator.
// No cached response interpolation: every source/listener uses its exact coordinates.
import { evaluateBatchModalTransfers } from "@/bass/core/batchModalEvaluator";
import { buildFrequencyAxis } from "@/bass/core/rewCorePrimitives";
import { buildNormalizedPhysicsOptions } from "./normalizedPhysicsOptionsBuilder";

const KNOWN_OPTIONS = new Set(Object.keys(buildNormalizedPhysicsOptions({ qStrategy: "ab_corrected" })));
export function canUseExactRoomPreviewBatch(physics, sources) {
  const p = physics || {};
  if (Object.keys(p).some(key => !KNOWN_OPTIONS.has(key))) return false;
  if (p.qStrategy !== "ab_corrected" || p.enableModes !== true ||
      p.enableReflections !== false || p.rewParityFieldMode !== "modes_only" ||
      p.abApplyModeMultiplicity !== true || p.roomIsSealed !== true ||
      p.abMidbandQScale !== 1 || p.modalCoherenceMode !== "coherent" ||
      p.rewParityModalMagnitudeScale !== 1 ||
      p.debugDisableModalContribution || p.mute68HzAxialMode ||
      p.debugMode200Multiplier !== 1 || p.highOrderAxialScale !== 1 ||
      p.debugModalHSign !== "normal" || p.debugModalPhaseConvention !== "normal") return false;
  return Array.isArray(sources) && sources.length > 0 && sources.every(source =>
    ["x", "y", "z"].every(key => Number.isFinite(source?.[key])) &&
    ["gainDb", "delayMs", "polarity", "phaseControlDeg", "phaseAdjust"].every(key =>
      source?.tuning?.[key] == null || Number.isFinite(source.tuning[key])));
}

export function buildExactRoomPreviewTransfers({
  roomDims, listeners, sources, physics, preparedModes, pointsPerOctave, sourceCurve,
}) {
  const batch = evaluateBatchModalTransfers({
    roomDims,
    sources: sources.map(source => ({ ...source, sourceCurve })),
    listeners: listeners.map(listener => ({
      id: listener.__listenerKey, x: listener.x, y: listener.y,
      z: Number.isFinite(Number(listener.z)) ? Number(listener.z) : 1.2,
    })),
    precomputedModes: preparedModes,
    physics,
    qStrategyOverride: "ab_corrected",
    precomputedFreqsHz: buildFrequencyAxis(15, 200, pointsPerOctave),
  });
  const byListener = new Map();
  for (const transfer of batch.perSourcePerListenerTransfers) {
    if (!byListener.has(transfer.listenerId)) byListener.set(transfer.listenerId, new Map());
    byListener.get(transfer.listenerId).set(transfer.sourceIndex, {
      freqsHz: batch.freqsHz,
      complexPressure: transfer.points,
    });
  }
  return byListener;
}
