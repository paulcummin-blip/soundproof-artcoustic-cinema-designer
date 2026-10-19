// combinedIntegrationEngine.js
// ---------------------------------------------------------------------------
// Captures the raw complex transfers the COMBINED LCR + bass-managed subwoofer
// model needs. It does not build the combined response and it does not know
// about the crossover — that is deliberate.
//
// The crossover frequency and slopes change NOTHING about the room transfer
// from a source to a seat. They only change how the two paths are filtered and
// summed. So the expensive part (the modal room transfer) is captured once per
// geometry+physics, and every crossover change afterwards is a cheap
// re-combination on the main thread (combinedSystemResponse). That is what
// keeps crossover and slope changes instant.
//
// It does not add a second simulation engine. It makes two passes of the SAME
// authoritative engine (authoritativeBassResponseEngine → simulateBassResponseRewCore):
//
//   PASS 1 — the installed subwoofers, exactly as the subwoofer-only authority
//            already runs them (real product capability curve, real tuning).
//   PASS 2 — the LCR speakers as UNIT flat sources, so each stored transfer is
//            a dimensionless room transfer carrying only the room's own
//            propagation and modal phase.
//
// The subwoofer-only pass is retained untouched so the existing subwoofer-only
// authority, publication and report paths keep behaving exactly as before.
// ---------------------------------------------------------------------------

import { simulateAuthoritativeBassResponse } from "./authoritativeBassResponseEngine";

/** Unit flat source: 0 dB, so the stored transfer is dimensionless. */
export const COMBINED_INTEGRATION_UNIT_SOURCE_CURVE = Object.freeze([
  Object.freeze({ frequency: 15, spl: 0 }),
  Object.freeze({ frequency: 200, spl: 0 }),
]);

/** A speaker runs with no tuning of its own — its path shape is the model. */
const SPEAKER_NEUTRAL_TUNING = Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0, phaseControlDeg: 0 });

function groupTransfersBySeat(transfers, modelKeyBySourceId) {
  const bySeat = {};
  (Array.isArray(transfers) ? transfers : []).forEach((transfer) => {
    if (!transfer?.seatId || !Array.isArray(transfer.points)) return;
    if (!bySeat[transfer.seatId]) bySeat[transfer.seatId] = [];
    bySeat[transfer.seatId].push({
      sourceId: transfer.sourceId ?? String(transfer.sourceIndex),
      modelKey: modelKeyBySourceId?.[transfer.sourceId] ?? null,
      points: transfer.points,
    });
  });
  return bySeat;
}

/**
 * Capture the complex room transfers for the combined model.
 *
 * @param {object} params
 * @param {object} params.roomDims
 * @param {Array}  params.seatingPositions
 * @param {object} params.rspPosition
 * @param {Array}  params.sources            installed subwoofers (canonical instances)
 * @param {Array}  params.speakerSources     [{ id, modelKey, x, y, z }] — the LCR trio
 * @param {object} params.physics
 * @param {string} params.qStrategyOverride
 * @returns {object} raw transfers, or { available: false, reason }
 */
export function captureCombinedIntegrationTransfers({
  roomDims,
  seatingPositions,
  rspPosition,
  sources,
  speakerSources,
  physics,
  qStrategyOverride,
}) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return { available: false, reason: "no-subwoofers" };
  }
  const speakers = (Array.isArray(speakerSources) ? speakerSources : []).filter(
    (speaker) => Number.isFinite(Number(speaker?.x)) && Number.isFinite(Number(speaker?.y)),
  );
  if (speakers.length === 0) {
    return { available: false, reason: "no-lcr-speakers" };
  }

  const common = {
    roomDims,
    seatingPositions,
    rspPosition,
    physics,
    qStrategyOverride,
    capturePerSourcePerSeat: true,
  };

  const subRun = simulateAuthoritativeBassResponse({ ...common, sources });
  const speakerRun = simulateAuthoritativeBassResponse({
    ...common,
    sources: speakers.map((speaker) => ({
      id: speaker.id,
      modelKey: speaker.modelKey,
      productCurve: COMBINED_INTEGRATION_UNIT_SOURCE_CURVE,
      x: Number(speaker.x),
      y: Number(speaker.y),
      z: Number.isFinite(Number(speaker.z)) ? Number(speaker.z) : 1.2,
      tuning: { ...SPEAKER_NEUTRAL_TUNING },
    })),
  });

  const subTransfers = subRun?.perSourcePerSeatComplexTransfers || [];
  const speakerTransfers = speakerRun?.perSourcePerSeatComplexTransfers || [];
  if (!subTransfers.length || !speakerTransfers.length) {
    return { available: false, reason: "complex-transfers-unavailable" };
  }

  const modelKeyBySourceId = {};
  speakers.forEach((speaker) => { modelKeyBySourceId[speaker.id] = speaker.modelKey; });

  const frequenciesHz = (subTransfers[0]?.points || [])
    .map((point) => Number(point?.frequency))
    .filter(Number.isFinite);

  return {
    available: true,
    reason: null,
    frequenciesHz,
    subTransfersBySeat: groupTransfersBySeat(subTransfers),
    speakerTransfersBySeat: groupTransfersBySeat(speakerTransfers, modelKeyBySourceId),
    subwooferCount: sources.length,
    speakerCount: speakers.length,
    speakerModels: [...new Set(speakers.map((speaker) => speaker.modelKey).filter(Boolean))],
  };
}