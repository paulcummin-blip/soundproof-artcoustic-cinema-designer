/**
 * modalCalculations.js — canonical source of truth for modal acoustic primitives.
 *
 * Consumers:
 *   - bass/core/rewBassEngine.js          → import './modalCalculations.js'
 *   - components/room/bass/RewProductionCandidateGenerator.jsx  → import '../../../bass/core/modalCalculations.js'
 *
 * DO NOT add UI, state, side-effects, or pressure summation logic here.
 * Each function is pure and stateless.
 */

const SPEED_OF_SOUND_MPS = 343;

export function computeRoomModesLocal({ widthM, lengthM, heightM, fMax, c = SPEED_OF_SOUND_MPS }) {
  const modes = [];
  const nMax = Math.ceil((fMax / c) * 2 * Math.max(widthM, lengthM, heightM)) + 5;

  for (let nx = 0; nx <= nMax; nx += 1) {
    for (let ny = 0; ny <= nMax; ny += 1) {
      for (let nz = 0; nz <= nMax; nz += 1) {
        if (nx === 0 && ny === 0 && nz === 0) continue;

        const freq = (c / 2) * Math.sqrt(
          Math.pow(nx / widthM, 2) +
          Math.pow(ny / lengthM, 2) +
          Math.pow(nz / heightM, 2)
        );

        if (!Number.isFinite(freq) || freq <= 0 || freq > fMax) continue;

        const activeAxes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
        let type = 'oblique';
        if (activeAxes === 1) type = 'axial';
        else if (activeAxes === 2) type = 'tangential';

        modes.push({ nx, ny, nz, freq, type });
      }
    }
  }

  return modes.sort((a, b) => a.freq - b.freq);
}

// Topology-aware modal Q estimation (2026-06-29).
// Each mode is damped primarily by the surface pairs on its active axes.
// Axial modes: one opposing surface pair at full weight, others at residual weight.
// Tangential: two active surface pairs at full weight, one at residual.
// Oblique: all three surface pairs at full weight.
// This ensures front-wall absorption strongly affects length-axis modes
// but barely affects height or width modes — matching physical reality.
export function estimateModeQLocal({ roomDims, surfaceAbsorption, f0, mode }) {
  const widthM  = Number(roomDims?.widthM)  || 1;
  const lengthM = Number(roomDims?.lengthM) || 1;
  const heightM = Number(roomDims?.heightM) || 1;
  const volume  = widthM * lengthM * heightM;

  const sa = surfaceAbsorption || {};
  const aFront   = sa.front   ?? 0.3;
  const aBack    = sa.back    ?? 0.3;
  const aLeft    = sa.left    ?? 0.3;
  const aRight   = sa.right   ?? 0.3;
  const aFloor   = sa.floor   ?? 0.3;
  const aCeiling = sa.ceiling ?? 0.3;

  // Surface areas
  const sFrontBack = widthM  * heightM; // front and back walls (same area)
  const sLeftRight = lengthM * heightM; // left and right walls (same area)
  const sFloorCeil = lengthM * widthM;  // floor and ceiling (same area)

  // Determine which axes are active from mode indices.
  // Falls back to global average if mode is not provided (backwards compat).
  const nx = mode?.nx ?? -1;
  const ny = mode?.ny ?? -1;
  const nz = mode?.nz ?? -1;
  const hasX = nx > 0; // width axis — damped by left/right walls
  const hasY = ny > 0; // length axis — damped by front/back walls
  const hasZ = nz > 0; // height axis — damped by floor/ceiling

  // If no mode info supplied, use the original global average (safe fallback).
  if (nx < 0) {
    const absorptionArea =
      sFloorCeil * aFloor +
      sFloorCeil * aCeiling +
      sFrontBack * aFront +
      sFrontBack * aBack +
      sLeftRight * aLeft +
      sLeftRight * aRight;
    const rt60    = 0.161 * volume / Math.max(absorptionArea, 1e-6);
    const tau     = rt60 / 13.815;
    const qSabine = 2 * Math.PI * f0 * tau;
    return Math.max(1, Math.min(80, qSabine));
  }

  // Primary weight: 0.80 on active-axis surface pairs, residual 0.20 shared equally
  // across non-active pairs. This preserves a realistic contribution from all
  // surfaces (scattering, edge diffraction) while making damping topology-sensitive.
  const PRIMARY_WEIGHT  = 0.80;
  const RESIDUAL_WEIGHT = 0.20;

  const activeCount = (hasX ? 1 : 0) + (hasY ? 1 : 0) + (hasZ ? 1 : 0);
  const inactiveCount = 3 - activeCount;

  // Effective absorption per surface pair: primary axis surfaces get PRIMARY_WEIGHT,
  // inactive axes split the residual equally.
  const primaryShare  = activeCount  > 0 ? PRIMARY_WEIGHT  / activeCount  : 0;
  const residualShare = inactiveCount > 0 ? RESIDUAL_WEIGHT / inactiveCount : 0;

  const weightFrontBack = hasY ? primaryShare : residualShare;
  const weightLeftRight = hasX ? primaryShare : residualShare;
  const weightFloorCeil = hasZ ? primaryShare : residualShare;

  const aFrontBackMean = (aFront + aBack) / 2;
  const aLeftRightMean = (aLeft  + aRight)  / 2;
  const aFloorCeilMean = (aFloor + aCeiling) / 2;

  let weightedAbsorption =
    (2 * sFrontBack * aFrontBackMean * weightFrontBack) +
    (2 * sLeftRight * aLeftRightMean * weightLeftRight) +
    (2 * sFloorCeil * aFloorCeilMean * weightFloorCeil);

  // TEMPORARY TEST ONLY (2026-07-01): low-frequency damping multiplier.
  // Applies only to modes below 50 Hz, only to weightedAbsorption, before Q calc.
  // Does not touch Q cap, resonantTransfer, modal summation, family scales,
  // highOrderAxialScale, storageFactor, or modalGainScalar.
  const LOW_FREQ_DAMPING_TEST_THRESHOLD_HZ = 55;
  const lowFreqDampingMultiplier = 1.5;
  if (Number.isFinite(f0) && f0 < LOW_FREQ_DAMPING_TEST_THRESHOLD_HZ) {
    weightedAbsorption = weightedAbsorption * lowFreqDampingMultiplier;
  }

  // RT60 normalised to actual room surface (Sabine equation stays in consistent units).
  // We weight the *absorption contribution* of each pair, not the surface area.
  const rt60    = 0.161 * volume / Math.max(weightedAbsorption, 1e-6);
  const tau     = rt60 / 13.815;
  const qSabine = 2 * Math.PI * f0 * tau;

  return Math.max(1, Math.min(80, qSabine));
}

export function modeShapeValueLocal(mode, x, y, z, roomDims) {
  const widthM  = Math.max(1e-6, Number(roomDims?.widthM)  || 0);
  const lengthM = Math.max(1e-6, Number(roomDims?.lengthM) || 0);
  const heightM = Math.max(1e-6, Number(roomDims?.heightM) || 0);

  const shapeX = mode.nx > 0 ? Math.cos(mode.nx * Math.PI * x / widthM)  : 1;
  const shapeY = mode.ny > 0 ? Math.cos(mode.ny * Math.PI * y / lengthM) : 1;
  const shapeZ = mode.nz > 0 ? Math.cos(mode.nz * Math.PI * z / heightM) : 1;

  return shapeX * shapeY * shapeZ;
}

export function resonantTransfer(f, f0, q) {
  const omega  = 2 * Math.PI * f;
  const omega0 = 2 * Math.PI * Math.max(f0, 1e-6);
  const ratio  = omega / omega0;

  const realDen       = 1 - (ratio * ratio);
  const imagDen       = omega / (Math.max(q, 1e-6) * omega0);
  const denominatorSq = (realDen * realDen) + (imagDen * imagDen);

  const re = realDen  / denominatorSq;
  const im = -imagDen / denominatorSq;

  return {
    re,
    im,
    transferMag: Math.sqrt(re * re + im * im),
    realDen,
    imagDen,
    denominatorSq,
  };
}