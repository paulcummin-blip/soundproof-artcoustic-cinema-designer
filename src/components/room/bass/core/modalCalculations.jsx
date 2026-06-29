/**
 * modalCalculations.js
 * Shared stateless acoustic primitives for modal room simulation.
 *
 * Canonical source of truth for:
 *   - computeRoomModesLocal  (extracted from rewBassEngine.js lines 94–122)
 *   - estimateModeQLocal     (extracted from rewBassEngine.js lines 128–154)
 *   - modeShapeValueLocal    (extracted from rewBassEngine.js lines 174–186)
 *   - resonantTransfer       (extracted from modalPressureContributionLocal, rewBassEngine.js lines 196–230)
 *
 * Consumers:
 *   - bass/core/rewBassEngine.js
 *   - components/room/bass/RewProductionCandidateGenerator.jsx
 *
 * DO NOT add UI, state, side-effects, or pressure summation logic here.
 * Each function is pure and stateless.
 */

const SPEED_OF_SOUND_MPS = 343;

/**
 * Generate all room modes up to fMax for a rectangular room.
 * Returns array of { nx, ny, nz, freq, type } sorted by ascending frequency.
 *
 * @param {object} params
 * @param {number} params.widthM
 * @param {number} params.lengthM
 * @param {number} params.heightM
 * @param {number} params.fMax
 * @param {number} [params.c=343]
 * @returns {Array<{nx:number, ny:number, nz:number, freq:number, type:string}>}
 */
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

/**
 * Estimate modal Q using Sabine's equation — topology-aware (2026-06-29).
 * Each mode is damped primarily by the surface pairs on its active axes.
 * Axial modes: one opposing pair at PRIMARY_WEIGHT, others at residual.
 * Tangential: two active pairs at primary, one at residual.
 * Oblique: all three pairs at equal primary weight.
 * Falls back to global six-surface average when mode indices are not provided.
 *
 * @param {object} params
 * @param {{widthM:number, lengthM:number, heightM:number}} params.roomDims
 * @param {{front:number, back:number, left:number, right:number, floor:number, ceiling:number}} params.surfaceAbsorption
 * @param {number} params.f0   - Mode centre frequency in Hz
 * @param {{nx:number, ny:number, nz:number}} [params.mode] - Mode indices for topology weighting
 * @returns {number}
 */
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

  const sFrontBack = widthM  * heightM;
  const sLeftRight = lengthM * heightM;
  const sFloorCeil = lengthM * widthM;

  // If no mode indices supplied, fall back to original global average.
  if (!mode || (mode.nx == null && mode.ny == null && mode.nz == null)) {
    const absorptionArea =
      sFloorCeil * aFloor   + sFloorCeil * aCeiling +
      sFrontBack * aFront   + sFrontBack * aBack    +
      sLeftRight * aLeft    + sLeftRight * aRight;
    const rt60    = 0.161 * volume / Math.max(absorptionArea, 1e-6);
    const tau     = rt60 / 13.815;
    return Math.max(1, Math.min(80, 2 * Math.PI * f0 * tau));
  }

  // Topology weights: active-axis surface pairs carry PRIMARY_WEIGHT,
  // inactive pairs share RESIDUAL_WEIGHT. Sums to 1.0.
  const PRIMARY_WEIGHT  = 0.80;
  const RESIDUAL_WEIGHT = 0.20;

  const hasX = (mode.nx ?? 0) > 0; // width axis  → left/right walls
  const hasY = (mode.ny ?? 0) > 0; // length axis → front/back walls
  const hasZ = (mode.nz ?? 0) > 0; // height axis → floor/ceiling

  const activeCount   = (hasX ? 1 : 0) + (hasY ? 1 : 0) + (hasZ ? 1 : 0);
  const inactiveCount = 3 - activeCount;

  const primaryShare  = activeCount   > 0 ? PRIMARY_WEIGHT  / activeCount  : 0;
  const residualShare = inactiveCount > 0 ? RESIDUAL_WEIGHT / inactiveCount : 0;

  const weightFrontBack = hasY ? primaryShare : residualShare; // ny axis
  const weightLeftRight = hasX ? primaryShare : residualShare; // nx axis
  const weightFloorCeil = hasZ ? primaryShare : residualShare; // nz axis

  const aFrontBackMean = (aFront + aBack)     / 2;
  const aLeftRightMean = (aLeft  + aRight)    / 2;
  const aFloorCeilMean = (aFloor + aCeiling)  / 2;

  const weightedAbsorption =
    (2 * sFrontBack * aFrontBackMean * weightFrontBack) +
    (2 * sLeftRight * aLeftRightMean * weightLeftRight) +
    (2 * sFloorCeil * aFloorCeilMean * weightFloorCeil);

  const rt60    = 0.161 * volume / Math.max(weightedAbsorption, 1e-6);
  const tau     = rt60 / 13.815;
  const qSabine = 2 * Math.PI * f0 * tau;

  return Math.max(1, Math.min(80, qSabine));
}

/**
 * Compute the signed mode-shape value (cosine product) at a single position.
 * Returns the coupled excitation/response value for one axis triple.
 * Caller computes source and receiver couplings separately.
 *
 * @param {{nx:number, ny:number, nz:number}} mode
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {{widthM:number, lengthM:number, heightM:number}} roomDims
 * @returns {number}
 */
export function modeShapeValueLocal(mode, x, y, z, roomDims) {
  const widthM  = Math.max(1e-6, Number(roomDims?.widthM)  || 0);
  const lengthM = Math.max(1e-6, Number(roomDims?.lengthM) || 0);
  const heightM = Math.max(1e-6, Number(roomDims?.heightM) || 0);

  const shapeX = mode.nx > 0 ? Math.cos(mode.nx * Math.PI * x / widthM)  : 1;
  const shapeY = mode.ny > 0 ? Math.cos(mode.ny * Math.PI * y / lengthM) : 1;
  const shapeZ = mode.nz > 0 ? Math.cos(mode.nz * Math.PI * z / heightM) : 1;

  return shapeX * shapeY * shapeZ;
}

/**
 * Standard second-order resonant transfer function.
 *
 *   H(jω) = 1 / (1 - (ω/ω₀)² + j·ω/(ω₀·Q))
 *
 * Real part: realDen / denomSq
 * Imag part: -imagDen / denomSq   (standard convention — negative imaginary)
 *
 * Also returns transferMag = sqrt(re² + im²) for selection ranking.
 *
 * Sign convention matches rewBassEngine.js modalPressureContributionLocal.
 * Do NOT change the sign of the imaginary component without full parity review.
 *
 * @param {number} f   - Evaluation frequency Hz
 * @param {number} f0  - Mode resonant frequency Hz
 * @param {number} q   - Mode Q value
 * @returns {{ re:number, im:number, transferMag:number, realDen:number, imagDen:number, denominatorSq:number }}
 */
export function resonantTransfer(f, f0, q) {
  const omega  = 2 * Math.PI * f;
  const omega0 = 2 * Math.PI * Math.max(f0, 1e-6);
  const ratio  = omega / omega0;

  const realDen      = 1 - (ratio * ratio);
  const imagDen      = omega / (Math.max(q, 1e-6) * omega0);
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