// axialPhaseSignParityAuditEngine.js
// Pure, read-only diagnostic engine — Axial Phase Sign Parity Audit.
// Investigates whether the 30 Hz B44 null (REW shows a peak) is caused by a
// phase/sign/coordinate-origin mismatch in the length-axial mode shape or
// coupling signs. Re-implements only the mode-shape/sign variants locally;
// reuses the shared, UNMODIFIED computeRoomModesLocal/estimateModeQLocal/
// resonantTransfer primitives from modalCalculations.js. Never edits
// rewBassEngine.js or modalCalculations.js. No production changes.

import { computeRoomModesLocal, estimateModeQLocal, resonantTransfer } from '@/bass/core/modalCalculations';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { buildLiveEngineOptions, LIVE_SOURCE_CURVE } from '@/components/room/bass/liveBassAuditOptions';

export const TEST_HZ = [28, 29, 30, 31, 32, 33, 34, 35];
export const VARIANTS = [
  { key: 'A', label: 'Production current' },
  { key: 'B', label: 'Flip receiver coupling sign only' },
  { key: 'C', label: 'Flip source coupling sign only' },
  { key: 'D', label: 'Flip both source and receiver coupling signs' },
  { key: 'E', label: 'cos(nπx/L) current coordinate convention' },
  { key: 'F', label: 'cos(nπ(L-x)/L) reversed length coordinate' },
  { key: 'G', label: 'sin(nπx/L) mode shape' },
  { key: 'H', label: 'π phase shift on odd length axial modes only' },
  { key: 'I', label: 'Remove modal propagation phase entirely' },
  { key: 'J', label: 'Pressure anti-node convention (front/rear same polarity, n=1)' },
];

const AXIAL_Q_DEFAULT = 4.0;

function smoothSoftQCapLocal(freqHz) {
  // Mirrors rewBassEngine.js smoothSoftQCap (documented, unmodified original) —
  // duplicated here read-only so this diagnostic never imports non-exported internals.
  const A = 200, n = 0.52;
  const cap = A / Math.pow(Math.max(freqHz, 1), n);
  return Math.max(8, Math.min(45, cap));
}

// Mode-shape value with variant-specific sign/coordinate conventions applied
// only to the length (Y) axis — width (X) and height (Z) axes always use the
// unmodified production convention cos(nπ·coord/dim).
function shapeValueVariant(n, coord, dimM, axis, variantKey) {
  if (n <= 0) return 1;
  let val;
  if (axis === 'y' && variantKey === 'F') {
    val = Math.cos((n * Math.PI * (dimM - coord)) / dimM);
  } else if (axis === 'y' && variantKey === 'G') {
    val = Math.sin((n * Math.PI * coord) / dimM);
  } else {
    val = Math.cos((n * Math.PI * coord) / dimM);
  }
  if (axis === 'y' && variantKey === 'J' && n === 1) {
    val = Math.abs(val); // front/rear same polarity for n=1
  }
  return val;
}

function computeCoupling(mode, point, roomDims, variantKey) {
  const sx = shapeValueVariant(mode.nx, point.x, roomDims.widthM, 'x', variantKey);
  const sy = shapeValueVariant(mode.ny, point.y, roomDims.lengthM, 'y', variantKey);
  const sz = shapeValueVariant(mode.nz, point.z, roomDims.heightM, 'z', variantKey);
  return sx * sy * sz;
}

function buildModesFor(roomDims, surfaceAbsorption) {
  return computeRoomModesLocal({ widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM, fMax: 200, c: 343 })
    .map((mode) => {
      const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq, mode });
      const softCap = smoothSoftQCapLocal(mode.freq);
      const qValue = Math.max(1, Math.min(absorptionQ, softCap));
      return { ...mode, qValue };
    });
}

// Computes one variant's complex modal field + direct field at one frequency.
function computeVariantAtFrequency(freqHz, roomDims, source, seat, surfaceAbsorption, modes, variantKey) {
  const curveDb = 94; // flat reference matching buildLiveEngineOptions / LIVE_SOURCE_CURVE
  const distanceM = Math.max(0.01, Math.sqrt((source.x - seat.x) ** 2 + (source.y - seat.y) ** 2 + (source.z - seat.z) ** 2));
  const distanceLossDb = -20 * Math.log10(distanceM / 1);
  const directAmplitude = Math.pow(10, (curveDb + distanceLossDb) / 20);
  const timeOfFlightPhase = variantKey === 'I' ? 0 : (-2 * Math.PI * freqHz * (distanceM / 343));
  const directRe = directAmplitude * Math.cos(timeOfFlightPhase);
  const directIm = directAmplitude * Math.sin(timeOfFlightPhase);

  const modalSourceAmplitude1m = Math.pow(10, curveDb / 20); // distance-independent, matches modalSourceReferenceMode 'existing'

  let modalSumRe = 0, modalSumIm = 0;
  const lengthAxialRows = [];
  let dominant = { magnitude: -1 };

  modes.forEach((mode) => {
    let sourceCoupling = computeCoupling(mode, source, roomDims, variantKey);
    let receiverCoupling = computeCoupling(mode, seat, roomDims, variantKey);
    if (variantKey === 'B') receiverCoupling = -receiverCoupling;
    if (variantKey === 'C') sourceCoupling = -sourceCoupling;
    if (variantKey === 'D') { sourceCoupling = -sourceCoupling; receiverCoupling = -receiverCoupling; }

    let combinedCoupling = sourceCoupling * receiverCoupling;

    const isLengthAxial = mode.nx === 0 && mode.ny > 0 && mode.nz === 0;
    if (variantKey === 'H' && isLengthAxial && mode.ny % 2 === 1) {
      combinedCoupling = -combinedCoupling; // π phase shift = sign flip
    }

    const transfer = resonantTransfer(freqHz, mode.freq, mode.qValue); // shared, unmodified
    const transferRe = variantKey === 'I' ? (1 / (1 - Math.pow(freqHz / mode.freq, 2))) : transfer.re;
    const transferIm = variantKey === 'I' ? 0 : transfer.im;

    const modalGain = modalSourceAmplitude1m * combinedCoupling;
    const contribRe = modalGain * transferRe;
    const contribIm = modalGain * transferIm;
    modalSumRe += contribRe;
    modalSumIm += contribIm;

    const magnitude = Math.sqrt(contribRe * contribRe + contribIm * contribIm);
    if (magnitude > dominant.magnitude) {
      dominant = {
        magnitude,
        key: `(${mode.nx},${mode.ny},${mode.nz})`,
        modeFrequencyHz: mode.freq,
        type: mode.type,
      };
    }

    if (mode.nx <= 3 && isLengthAxial === false && mode.ny > 0 && mode.nx === 0 && mode.nz === 0) {
      // unreachable — kept isLengthAxial as the single gate below
    }
    if (isLengthAxial && mode.ny <= 3) {
      const transferPhaseDeg = (Math.atan2(transferIm, transferRe) * 180) / Math.PI;
      const finalPhaseDeg = (Math.atan2(contribIm, contribRe) * 180) / Math.PI;
      const directMag = Math.sqrt(directRe * directRe + directIm * directIm);
      const dotWithDirect = (contribRe * directRe + contribIm * directIm) / Math.max(directMag, 1e-10);
      lengthAxialRows.push({
        modeKey: `(${mode.nx},${mode.ny},${mode.nz})`,
        modeFrequencyHz: mode.freq,
        sourceCoupling, receiverCoupling, combinedCoupling,
        transferPhaseDeg, finalPhaseDeg,
        contribRe, contribIm, magnitude,
        constructive: dotWithDirect >= 0,
      });
    }
  });

  const finalRe = directRe + modalSumRe;
  const finalIm = directIm + modalSumIm;
  const finalMag = Math.sqrt(finalRe * finalRe + finalIm * finalIm);
  const finalDb = 20 * Math.log10(Math.max(finalMag, 1e-10));

  return { finalDb, dominant, lengthAxialRows, directRe, directIm };
}

function severity(deltaAt30, deltaAt3545) {
  // deltaAt30: variant - production at 30Hz (want positive, turning null into peak)
  // deltaAt3545: worst-case new error introduced in 35-45Hz band vs production at same points (not directly available here — using 35Hz only per requested range)
  if (deltaAt30 <= 1) return 'FAIL — null not removed';
  if (Math.abs(deltaAt3545) > 6) return 'FAIL — new severe error introduced';
  return 'PASS';
}

export function runAxialPhaseSignParityAudit() {
  const roomDims = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 };
  const source = { x: 2.25, y: 0.1, z: 0.35 }; // centre of front wall
  const seat = { x: 2.25, y: 4.0, z: 1.2 }; // centre width, 4.0m from front wall
  const surfaceAbsorption = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };

  const modes = buildModesFor(roomDims, surfaceAbsorption);

  // Production baseline via the real, unmodified engine (matches other audits' "current production" reference).
  const prodOptionsByFreq = {};
  TEST_HZ.forEach((hz) => {
    const options = buildLiveEngineOptions(hz, surfaceAbsorption);
    const result = simulateBassResponseRewCore(roomDims, seat, { modelKey: '', x: source.x, y: source.y, z: source.z, tuning: {} }, LIVE_SOURCE_CURVE, options);
    const row = (result.perFrequencyVectorDebug || []).reduce((best, r) => (!best || Math.abs(r.frequencyHz - hz) < Math.abs(best.frequencyHz - hz) ? r : best), null);
    if (row) {
      const finalMag = Math.sqrt((row.finalRe) ** 2 + (row.finalIm) ** 2);
      prodOptionsByFreq[hz] = 20 * Math.log10(Math.max(finalMag, 1e-10));
    }
  });

  const perVariant = VARIANTS.map((variant) => {
    const rows = TEST_HZ.map((hz) => {
      const computed = computeVariantAtFrequency(hz, roomDims, source, seat, surfaceAbsorption, modes, variant.key);
      const productionDb = prodOptionsByFreq[hz] ?? null;
      const variantDb = variant.key === 'A' ? productionDb : computed.finalDb;
      const delta = productionDb !== null && variantDb !== null ? variantDb - productionDb : null;
      return {
        frequencyHz: hz,
        productionDb, variantDb, delta,
        dominantMode: computed.dominant.key ? `${computed.dominant.key}@${computed.dominant.modeFrequencyHz?.toFixed(1)}Hz` : '—',
        lengthAxialRows: computed.lengthAxialRows,
      };
    });
    const row30 = rows.find((r) => r.frequencyHz === 30);
    const row35 = rows.find((r) => r.frequencyHz === 35);
    const deltaAt30 = row30?.delta ?? 0;
    const deltaAt35 = row35?.delta ?? 0;
    const passFail = variant.key === 'A' ? 'BASELINE' : severity(deltaAt30, deltaAt35);
    return { ...variant, rows, passFail };
  });

  return { roomDims, source, seat, surfaceAbsorption, perVariant };
}