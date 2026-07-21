// normalizedRoomTransferEngine.js — Phase 2A: Fast, product-independent
// normalized room-transfer calculation path.
//
// Reuses the existing room-response physics engine (simulateBassResponseRewCore)
// with a flat 0 dB source curve, producing a relative room-transfer response
// that excludes all product-specific shaping (model response, sensitivity,
// max output, low-frequency capability, requested SPL, EQ fitting, RP22
// parameter grading).
//
// The output is a RELATIVE room-transfer response, not an absolute product
// SPL prediction. The normalization reference is documented in the returned
// result: a flat 0 dB source (unity gain) across 20–200 Hz. The resulting
// dB values represent the room transfer function (direct + modal + reflection
// summation) at each listener position, independent of which subwoofer
// model is placed at the source positions.
//
// Design rules:
//   - Reuses the existing acoustic maths. No copied or rewritten physics.
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

import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { computeGeometryFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";

// Flat 0 dB source curve — unity gain across the bass band. This is the
// normalization reference: the output represents the pure room transfer
// function with no product-specific frequency shaping.
const FLAT_NORMALIZED_SOURCE_CURVE = [
  { hz: 15, db: 0 },
  { hz: 20, db: 0 },
  { hz: 30, db: 0 },
  { hz: 40, db: 0 },
  { hz: 50, db: 0 },
  { hz: 63, db: 0 },
  { hz: 80, db: 0 },
  { hz: 100, db: 0 },
  { hz: 120, db: 0 },
  { hz: 160, db: 0 },
  { hz: 200, db: 0 },
];

const NORMALIZATION_REFERENCE = {
  sourceCurveDb: 0,
  description: "Flat 0 dB source (unity gain) across 20–200 Hz. Output is relative room transfer, not absolute SPL.",
  frequencyRangeHz: [20, 200],
};

// Private fixed RSP key. Never depends on rspPosition.id being absent or
// equal to "rsp" — the caller's id is ignored for the RSP listener.
const RSP_KEY = "__rsp__";

// Convert complex pressure sum to dB magnitude.
function complexToDb(re, im) {
  const magnitude = Math.sqrt(re * re + im * im);
  return 20 * Math.log10(Math.max(magnitude, 1e-10));
}

// Build the listener list: RSP first (with private key), then real seats.
function buildListeners(rspPosition, seatingPositions) {
  const listeners = [];
  if (rspPosition && Number.isFinite(rspPosition.x) && Number.isFinite(rspPosition.y)) {
    listeners.push({ ...rspPosition, __listenerKey: RSP_KEY, __isRsp: true });
  }
  if (Array.isArray(seatingPositions)) {
    seatingPositions.forEach((seat) => {
      if (seat && Number.isFinite(seat.x) && Number.isFinite(seat.y)) {
        const seatKey = seat.id || `seat_${seat.x}_${seat.y}`;
        listeners.push({ ...seat, __listenerKey: seatKey, __isRsp: false });
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
 * Reuses simulateBassResponseRewCore with a flat 0 dB source curve. Sums
 * complex pressure across all subs for each listener, then converts to dB.
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
  // This mirrors the production path in BassResponse.jsx exactly, except the
  // source curve is always the flat normalized reference (0 dB).
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
        FLAT_NORMALIZED_SOURCE_CURVE,
        {
          ...physicsOptions,
          freqMinHz: 20,
          freqMaxHz: 200,
          smoothing: "none",
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

  // Build per-seat curves (exclude RSP via private key)
  const seatCurves = Object.entries(seatResponses)
    .filter(([key]) => key !== RSP_KEY)
    .map(([key, response]) => ({
      seatId: key,
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