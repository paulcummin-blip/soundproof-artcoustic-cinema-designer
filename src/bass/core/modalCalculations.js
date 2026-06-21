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

export function estimateModeQLocal({ roomDims, surfaceAbsorption, f0 }) {
  const widthM  = Number(roomDims?.widthM)  || 1;
  const lengthM = Number(roomDims?.lengthM) || 1;
  const heightM = Number(roomDims?.heightM) || 1;
  const volume  = widthM * lengthM * heightM;

  const surfaceFloor   = lengthM * widthM;
  const surfaceCeiling = lengthM * widthM;
  const surfaceFront   = widthM  * heightM;
  const surfaceBack    = widthM  * heightM;
  const surfaceLeft    = lengthM * heightM;
  const surfaceRight   = lengthM * heightM;

  const absorptionArea =
    surfaceFloor   * (surfaceAbsorption?.floor   ?? 0.3) +
    surfaceCeiling * (surfaceAbsorption?.ceiling ?? 0.3) +
    surfaceFront   * (surfaceAbsorption?.front   ?? 0.3) +
    surfaceBack    * (surfaceAbsorption?.back    ?? 0.3) +
    surfaceLeft    * (surfaceAbsorption?.left    ?? 0.3) +
    surfaceRight   * (surfaceAbsorption?.right   ?? 0.3);

  const rt60    = 0.161 * volume / Math.max(absorptionArea, 1e-6);
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