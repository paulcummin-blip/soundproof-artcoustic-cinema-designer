// Preview-only adapter to the existing exact batch modal evaluator.
// No cached response interpolation: every source/listener uses its exact coordinates.
import { prepareSourceRoomField, evaluateReceiversFromPreparedField } from "@/bass/core/batchModalEvaluator";
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
  const prepared = prepareSourceRoomField({
    roomDims,
    sources: sources.map(source => ({ ...source, sourceCurve })),
    precomputedModes: preparedModes,
    physics,
    qStrategyOverride: "ab_corrected",
    precomputedFreqsHz: buildFrequencyAxis(15, 200, pointsPerOctave),
  });
  // When every source has identical tuning and spectrum, linear superposition
  // permits summing their spatial mode couplings before the listener loop.
  // Use the existing evaluator unchanged; retain separate transfers whenever
  // RSP per-source evidence is required or tuning differs.
  const tuningKey = source => JSON.stringify([
    source.tuning?.gainDb ?? 0, source.tuning?.delayMs ?? 0,
    source.tuning?.polarity ?? 0,
    source.tuning?.phaseControlDeg ?? source.tuning?.phaseAdjust ?? 0,
  ]);
  const summed = listeners.every(listener => !listener.__isRsp) &&
    sources.every(source => tuningKey(source) === tuningKey(sources[0]));
  let field = prepared;
  if (summed && prepared.nSources > 1) {
    const coupling = new Float64Array(prepared.nModes);
    for (let source = 0; source < prepared.nSources; source++) {
      for (let mode = 0; mode < prepared.nModes; mode++) {
        coupling[mode] += prepared.sourceModeCoupling[source * prepared.nModes + mode];
      }
    }
    field = { ...prepared, nSources: 1, sourceModeCoupling: coupling };
  }
  const batch = evaluateReceiversFromPreparedField(field, listeners.map(listener => ({
    id: listener.__listenerKey, x: listener.x, y: listener.y,
    z: Number.isFinite(Number(listener.z)) ? Number(listener.z) : 1.2,
  })));
  const byListener = new Map();
  for (const transfer of batch.perSourcePerListenerTransfers) {
    if (!byListener.has(transfer.listenerId)) byListener.set(transfer.listenerId, new Map());
    byListener.get(transfer.listenerId).set(transfer.sourceIndex, {
      freqsHz: batch.freqsHz,
      complexPressure: transfer.points,
    });
  }
  return { byListener, summed };
}
