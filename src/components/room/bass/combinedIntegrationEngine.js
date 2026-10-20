// combinedIntegrationEngine.js
// ---------------------------------------------------------------------------
// Captures the complex transfers the combined LCR + bass-managed subwoofer
// model needs. It does NOT build the combined response and it knows nothing
// about the crossover — that is deliberate.
//
// WHY THE CROSSOVER IS ABSENT HERE
//   The crossover frequency and slopes change nothing about the room transfer
//   from a source to a seat. They only change how the two paths are filtered
//   and summed. So the expensive part — the modal room transfer — is captured
//   once per geometry, and every crossover change afterwards is a cheap
//   re-combination on the main thread (combinedSystemResponse).
//
// NO DUPLICATE WORK
//   The subwoofer transfers are NOT recomputed here. They are handed in already
//   computed by the authoritative subwoofer-only simulation, with the real
//   product capability curve and tuning applied. This module therefore adds
//   exactly ONE extra engine pass (the screen channels as unit flat sources)
//   and nothing more.
//
// It does not add a second acoustic engine: the extra pass runs the SAME
// authoritative engine with a unit source curve, so each stored transfer is a
// dimensionless room transfer carrying only the room's own propagation and
// modal phase.
// ---------------------------------------------------------------------------

import { simulateAuthoritativeBassResponse } from "./authoritativeBassResponseEngine";

/** Unit flat source: 0 dB, so the stored transfer is dimensionless. */
export const COMBINED_INTEGRATION_UNIT_SOURCE_CURVE = Object.freeze([
  Object.freeze({ frequency: 15, spl: 0 }),
  Object.freeze({ frequency: 200, spl: 0 }),
]);

/** A screen channel runs with no tuning of its own — its path shape is the model. */
const SPEAKER_NEUTRAL_TUNING = Object.freeze({
  gainDb: 0, delayMs: 0, polarity: 0, phaseControlDeg: 0,
});

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
 * Capture the transfers the combined model needs.
 *
 * @param {object} params
 * @param {object} params.roomDims
 * @param {Array}  params.seatingPositions
 * @param {object} params.rspPosition
 * @param {Array}  params.subTransfers    the authoritative subwoofer-only run's
 *                                        perSourcePerSeatComplexTransfers — reused, never recomputed
 * @param {Array}  params.speakerSources  [{ id, modelKey, x, y, z }] — the LCR trio
 * @param {object} params.physics
 * @param {string} params.qStrategyOverride
 * @returns {object} raw transfers, or { available: false, reason }
 */
export function captureCombinedIntegrationTransfers({
  roomDims,
  seatingPositions,
  rspPosition,
  subTransfers,
  speakerSources,
  physics,
  qStrategyOverride,
}) {
  if (!Array.isArray(subTransfers) || subTransfers.length === 0) {
    return { available: false, reason: "no-subwoofer-transfers" };
  }
  const speakers = (Array.isArray(speakerSources) ? speakerSources : []).filter(
    (speaker) => Number.isFinite(Number(speaker?.x)) && Number.isFinite(Number(speaker?.y)),
  );
  if (speakers.length === 0) {
    return { available: false, reason: "no-lcr-speakers" };
  }

  // The ONLY extra engine pass: the screen channels as dimensionless units.
  const speakerRun = simulateAuthoritativeBassResponse({
    roomDims,
    seatingPositions,
    rspPosition,
    physics,
    qStrategyOverride,
    capturePerSourcePerSeat: true,
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

  const speakerTransfers = speakerRun?.perSourcePerSeatComplexTransfers || [];
  if (!speakerTransfers.length) {
    return { available: false, reason: "speaker-transfers-unavailable" };
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
    subwooferCount: new Set(subTransfers.map((transfer) => transfer.sourceId ?? transfer.sourceIndex)).size,
    speakerCount: speakers.length,
    speakerModels: [...new Set(speakers.map((speaker) => speaker.modelKey).filter(Boolean))],
  };
}