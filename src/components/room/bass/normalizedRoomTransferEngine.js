// normalizedRoomTransferEngine.js — Phase 2A: Fast, product-independent
// normalized room-transfer calculation path.
//
// Reuses the existing room-response physics engine (simulateBassResponseRewCore)
// with the PRODUCTION flat-source definition (REW_SOURCE_CURVES.flat_rew_reference,
// flat 94 dB across 20–200 Hz), producing a relative room-transfer response
// that excludes all product-specific shaping (model response, sensitivity,
// max output, low-frequency capability, requested SPL, EQ fitting, RP22
// parameter grading).
//
// The output is a RELATIVE room-transfer response referenced to the same
// 94 dB flat source used by the production REW parity path. The normalization
// reference is documented in the returned result.
//
// Design rules:
//   - Reuses the EXISTING production flat-source definition (rewSourceCurves.js).
//     No second hand-written flat curve.
//   - Reuses the existing acoustic maths (simulateBassResponseRewCore). No
//     copied or rewritten physics.
//   - Same room dimensions, seat/RSP positions, source positions, source
//     quantity, front/rear placement, relative gain/delay/polarity, boundary
//     behaviour, modal behaviour, and summation behaviour as the production
//     path.
//   - Excludes: subwoofer model response, product sensitivity, product max
//     output, product low-frequency capability, requested system SPL, EQ
//     fitting, RP22 parameter grading.
//   - Pure, synchronous, structured-cloneable output. No React state, no
//     callbacks, no circular references.
//   - Does NOT invoke the EQ fitter, RP22 candidate search, or product
//     capability calculation.
//   - Collision-safe listener keys: __rsp__, __seat_0__, __seat_1__, …
//     Original seat IDs are preserved separately in the output. Duplicate
//     or missing seat IDs cannot overwrite responses.

import { simulateBassResponseRewCore, prepareModeBank } from "@/bass/core/rewBassEngine";
import { computeGeometryFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";
import { REW_SOURCE_CURVES } from "@/components/room/bass/rewSourceCurves";

// Reuse the EXACT production flat-source definition — no second curve.
const FLAT_SOURCE_CURVE = REW_SOURCE_CURVES.flat_rew_reference;

const NORMALIZATION_REFERENCE = {
  sourceCurveDb: 94,
  sourceCurveId: "flat_rew_reference",
  description: "Production flat 94 dB source (REW_SOURCE_CURVES.flat_rew_reference) across 20–200 Hz. Output is relative room transfer referenced to this flat source, not absolute product SPL.",
  frequencyRangeHz: [20, 200],
};

// Private fixed listener keys — never derived from caller IDs.
const RSP_KEY = "__rsp__";
const seatKey = (index) => `__seat_${index}__`;

// Convert complex pressure sum to dB magnitude.
function complexToDb(re, im) {
  const magnitude = Math.sqrt(re * re + im * im);
  return 20 * Math.log10(Math.max(magnitude, 1e-10));
}

// Build the listener list: RSP first (with private key), then real seats
// with index-based keys. Original seat IDs are preserved separately.
function buildListeners(rspPosition, seatingPositions) {
  const listeners = [];
  if (rspPosition && Number.isFinite(rspPosition.x) && Number.isFinite(rspPosition.y)) {
    listeners.push({
      ...rspPosition,
      __listenerKey: RSP_KEY,
      __isRsp: true,
      __originalId: rspPosition.id || null,
    });
  }
  if (Array.isArray(seatingPositions)) {
    seatingPositions.forEach((seat, index) => {
      if (seat && Number.isFinite(seat.x) && Number.isFinite(seat.y)) {
        listeners.push({
          ...seat,
          __listenerKey: seatKey(index),
          __isRsp: false,
          __originalId: seat.id || null,
          __seatIndex: index,
        });
      }
    });
  }
  return listeners;
}

// Build a compact source-layout summary (excludes model-specific data).
function buildSourceLayout(subs) {
  if (!Array.isArray(subs) || subs.length === 0) return null;
  return {
    count: subs.length,
    positions: subs.map((s) => ({
      id: s?.id || null,
      x: Number.isFinite(s?.x) ? s.x : null,
      y: Number.isFinite(s?.y) ? s.y : null,
      z: Number.isFinite(s?.z) ? s.z : null,
      placement: s?.placement || null,
      tuning: {
        gainDb: Number.isFinite(s?.tuning?.gainDb) ? s.tuning.gainDb : 0,
        delayMs: Number.isFinite(s?.tuning?.delayMs) ? s.tuning.delayMs : 0,
        polarity: s?.tuning?.polarity ?? 0,
      },
    })),
  };
}

/**
 * Compute the normalized room-transfer response for all listener positions.
 *
 * Reuses simulateBassResponseRewCore with the production flat 94 dB source
 * curve. Sums complex pressure across all subs for each listener, then
 * converts to dB.
 *
 * @param {Object} params
 * @param {Object} params.roomDims — { widthM, lengthM, heightM }
 * @param {Object} params.rspPosition — { x, y, z } or null
 * @param {Array} params.seatingPositions — [{ id, x, y, z }, ...]
 * @param {Array} params.subsForSimulation — [{ id, x, y, z, tuning, ... }, ...]
 * @param {Object} params.physicsOptions — modal/reflection/Q options passed
 *   through to the engine (same as production path).
 * @returns {Object} Normalized room-transfer result (structured-cloneable).
 */
export function computeNormalizedRoomTransfer({
  roomDims,
  rspPosition,
  seatingPositions,
  subsForSimulation,
  physicsOptions = {},
  pointsPerOctave,
  preparedModes,
}) {
  const startedAtMs = (typeof performance !== "undefined" && performance.now)
    ? performance.now()
    : Date.now();

  // Validate inputs
  if (!roomDims || !Number.isFinite(roomDims.widthM) || !Number.isFinite(roomDims.lengthM) || !Number.isFinite(roomDims.heightM)) {
    return {
      status: "error",
      errorMessage: "roomDims must include finite widthM, lengthM, and heightM.",
      responseDomain: "normalized_room_transfer",
      rspCurve: [],
      seatCurves: [],
      frequencies: [],
      sourceLayout: null,
      geometryFingerprint: null,
      normalizationReference: NORMALIZATION_REFERENCE,
      calculationDurationMs: 0,
    };
  }

  if (!Array.isArray(subsForSimulation) || subsForSimulation.length === 0) {
    return {
      status: "error",
      errorMessage: "subsForSimulation must be a non-empty array.",
      responseDomain: "normalized_room_transfer",
      rspCurve: [],
      seatCurves: [],
      frequencies: [],
      sourceLayout: null,
      geometryFingerprint: null,
      normalizationReference: NORMALIZATION_REFERENCE,
      calculationDurationMs: 0,
    };
  }

  const listeners = buildListeners(rspPosition, seatingPositions);
  if (listeners.length === 0) {
    return {
      status: "error",
      errorMessage: "No valid listener positions (RSP or seats).",
      responseDomain: "normalized_room_transfer",
      rspCurve: [],
      seatCurves: [],
      frequencies: [],
      sourceLayout: buildSourceLayout(subsForSimulation),
      geometryFingerprint: null,
      normalizationReference: NORMALIZATION_REFERENCE,
      calculationDurationMs: 0,
    };
  }

  // Build geometry fingerprint from the same inputs the engine uses.
  const geometryFingerprint = computeGeometryFingerprint({
    roomDims,
    rspPosition,
    seatingPositions,
    sources: subsForSimulation,
    surfaceAbsorption: physicsOptions.surfaceAbsorption,
    roomDamping: physicsOptions.roomDamping,
    axialQ: physicsOptions.axialQ,
    modalSourceReferenceMode: physicsOptions.modalSourceReferenceMode,
    modalGainScalar: physicsOptions.modalGainScalar,
    modalDistanceBlend: physicsOptions.modalDistanceBlend,
    modalStorageMode: physicsOptions.modalStorageMode,
    propagationPhaseScale: physicsOptions.propagationPhaseScale,
    enableRewCoreReflections: physicsOptions.enableReflections,
    rewSourceCurveMode: "normalized_room_transfer",
    qStrategy: physicsOptions.qStrategy,
    rewModalBandwidthScale: physicsOptions.rewModalBandwidthScale,
    disableReflectionPhaseJitter: physicsOptions.disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight: physicsOptions.disableReflectionCoherenceWeight,
    disableLateField: physicsOptions.disableLateField,
    disableModalPropagationPhase: physicsOptions.disableModalPropagationPhase,
    mute68HzAxialMode: physicsOptions.mute68HzAxialMode,
    debugDisableModalContribution: physicsOptions.debugDisableModalContribution,
    rewParityFieldMode: physicsOptions.rewParityFieldMode,
    overrideConstantAxialQ: physicsOptions.overrideConstantAxialQ,
    overrideAbsorptionAxialQ: physicsOptions.overrideAbsorptionAxialQ,
    debugMode200Multiplier: physicsOptions.debugMode200Multiplier,
    debugModalPhaseConvention: physicsOptions.debugModalPhaseConvention,
    reflectionGainScale: physicsOptions.reflectionGainScale,
    debugModalHSign: physicsOptions.debugModalHSign,
    rewParityModalMagnitudeScale: physicsOptions.rewParityModalMagnitudeScale,
    modalCoherenceMode: physicsOptions.modalCoherenceMode,
    highOrderAxialScale: physicsOptions.highOrderAxialScale,
  });

  // Run the engine for each listener, summing complex pressure across all subs.
  // This mirrors the production path in BassResponse.jsx exactly, using the
  // same production flat 94 dB source curve (REW_SOURCE_CURVES.flat_rew_reference).
  //
  // Mode-bank reuse: the room-mode bank depends only on room dimensions,
  // surface absorption, Q strategy and frequency range — never on the source
  // or listener position. Compute it once via the core-owned prepareModeBank
  // helper (which derives preprocessing identically to simulateBassResponseRewCore)
  // and pass it to every engine call via options.precomputedModes. This avoids
  // redundant mode computation across N subs × M listeners with zero behaviour
  // change — the engine uses the precomputed bank exactly as if it computed it.
  const engineOptions = {
    ...physicsOptions,
    freqMinHz: 20,
    freqMaxHz: 200,
    smoothing: "none",
    ...(Number.isFinite(pointsPerOctave) ? { pointsPerOctave } : {}),
  };
  const precomputedModes = Array.isArray(preparedModes)
    ? preparedModes
    : prepareModeBank(roomDims, engineOptions);

  const seatResponses = {};
  let frequencies = [];

  listeners.forEach((listener) => {
    const listenerKey = listener.__listenerKey;
    let sumRe = null;
    let sumIm = null;
    let freqsHz = null;

    subsForSimulation.forEach((sub) => {
      if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y) || !Number.isFinite(sub?.z)) return;

      const listenerZ = Number.isFinite(Number(listener.z)) ? Number(listener.z) : 1.2;

      const rewResult = simulateBassResponseRewCore(
        {
          widthM: roomDims.widthM,
          lengthM: roomDims.lengthM,
          heightM: roomDims.heightM,
        },
        {
          x: listener.x,
          y: listener.y,
          z: listenerZ,
        },
        sub,
        FLAT_SOURCE_CURVE,
        {
          ...engineOptions,
          precomputedModes,
        }
      );

      if (!freqsHz) {
        freqsHz = rewResult.freqsHz;
        sumRe = rewResult.complexPressure.map((cp) => cp.re);
        sumIm = rewResult.complexPressure.map((cp) => cp.im);
      } else {
        rewResult.complexPressure.forEach((cp, index) => {
          if (Number.isFinite(cp.re) && Number.isFinite(cp.im)) {
            sumRe[index] += cp.re;
            sumIm[index] += cp.im;
          }
        });
      }
    });

    if (freqsHz && sumRe && sumIm) {
      seatResponses[listenerKey] = {
        freqsHz,
        splDb: sumRe.map((re, index) => complexToDb(re, sumIm[index])),
        isRsp: listener.__isRsp,
        originalId: listener.__originalId,
        seatIndex: Number.isFinite(listener.__seatIndex) ? listener.__seatIndex : null,
      };
    }
  });

  // Extract frequencies from the first available response
  for (const key of Object.keys(seatResponses)) {
    frequencies = seatResponses[key].freqsHz;
    break;
  }

  // Build RSP curve (uses private fixed key — never confused with a real seat)
  const rspResponse = seatResponses[RSP_KEY];
  const rspCurve = rspResponse
    ? rspResponse.freqsHz
        .map((frequency, i) => ({
          frequency,
          spl: Number.isFinite(rspResponse.splDb[i]) ? rspResponse.splDb[i] : null,
        }))
        .filter((p) => Number.isFinite(p.frequency) && p.frequency > 0 && Number.isFinite(p.spl))
    : [];

  // Build per-seat curves (exclude RSP via private key; preserve original IDs)
  const seatCurves = Object.entries(seatResponses)
    .filter(([key]) => key !== RSP_KEY)
    .map(([key, response]) => ({
      seatKey: key,
      originalSeatId: response.originalId,
      seatIndex: response.seatIndex,
      responseData: response.freqsHz
        .map((frequency, i) => ({
          frequency,
          spl: Number.isFinite(response.splDb[i]) ? response.splDb[i] : null,
        }))
        .filter((p) => Number.isFinite(p.frequency) && p.frequency > 0 && Number.isFinite(p.spl)),
    }))
    .filter((seat) => seat.responseData.length > 0);

  const completedAtMs = (typeof performance !== "undefined" && performance.now)
    ? performance.now()
    : Date.now();

  return {
    status: "complete",
    errorMessage: null,
    responseDomain: "normalized_room_transfer",
    rspCurve,
    seatCurves,
    frequencies,
    sourceLayout: buildSourceLayout(subsForSimulation),
    geometryFingerprint,
    normalizationReference: NORMALIZATION_REFERENCE,
    calculationDurationMs: Math.max(0, completedAtMs - startedAtMs),
  };
}