import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// TEMPORARY DIAGNOSTIC FUNCTION — inlines the production rewBassEngine + modalCalculations
// math (unmodified) so we can run the real simulation server-side and get actual SPL numbers,
// comparing baseline (no low-freq damping) vs the 55Hz/1.5x lowFreqDampingMultiplier test.
// Delete after the investigation concludes.

const SPEED_OF_SOUND_MPS = 343;
const MIN_DISTANCE_M = 0.01;

function computeRoomModesLocal({ widthM, lengthM, heightM, fMax, c = SPEED_OF_SOUND_MPS }) {
  const modes = [];
  const nMax = Math.ceil((fMax / c) * 2 * Math.max(widthM, lengthM, heightM)) + 5;
  for (let nx = 0; nx <= nMax; nx += 1) {
    for (let ny = 0; ny <= nMax; ny += 1) {
      for (let nz = 0; nz <= nMax; nz += 1) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const freq = (c / 2) * Math.sqrt(Math.pow(nx / widthM, 2) + Math.pow(ny / lengthM, 2) + Math.pow(nz / heightM, 2));
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

// estimateModeQLocal with an optional test-only low-frequency damping multiplier.
function estimateModeQLocal({ roomDims, surfaceAbsorption, f0, mode, useLowFreqDampingTest = false }) {
  const widthM = Number(roomDims?.widthM) || 1;
  const lengthM = Number(roomDims?.lengthM) || 1;
  const heightM = Number(roomDims?.heightM) || 1;
  const volume = widthM * lengthM * heightM;

  const sa = surfaceAbsorption || {};
  const aFront = sa.front ?? 0.3;
  const aBack = sa.back ?? 0.3;
  const aLeft = sa.left ?? 0.3;
  const aRight = sa.right ?? 0.3;
  const aFloor = sa.floor ?? 0.3;
  const aCeiling = sa.ceiling ?? 0.3;

  const sFrontBack = widthM * heightM;
  const sLeftRight = lengthM * heightM;
  const sFloorCeil = lengthM * widthM;

  const nx = mode?.nx ?? -1;
  const ny = mode?.ny ?? -1;
  const nz = mode?.nz ?? -1;
  const hasX = nx > 0;
  const hasY = ny > 0;
  const hasZ = nz > 0;

  if (nx < 0) {
    const absorptionArea = sFloorCeil * aFloor + sFloorCeil * aCeiling + sFrontBack * aFront + sFrontBack * aBack + sLeftRight * aLeft + sLeftRight * aRight;
    const rt60 = 0.161 * volume / Math.max(absorptionArea, 1e-6);
    const tau = rt60 / 13.815;
    const qSabine = 2 * Math.PI * f0 * tau;
    return Math.max(1, Math.min(80, qSabine));
  }

  const PRIMARY_WEIGHT = 0.80;
  const RESIDUAL_WEIGHT = 0.20;
  const activeCount = (hasX ? 1 : 0) + (hasY ? 1 : 0) + (hasZ ? 1 : 0);
  const inactiveCount = 3 - activeCount;
  const primaryShare = activeCount > 0 ? PRIMARY_WEIGHT / activeCount : 0;
  const residualShare = inactiveCount > 0 ? RESIDUAL_WEIGHT / inactiveCount : 0;

  const weightFrontBack = hasY ? primaryShare : residualShare;
  const weightLeftRight = hasX ? primaryShare : residualShare;
  const weightFloorCeil = hasZ ? primaryShare : residualShare;

  const aFrontBackMean = (aFront + aBack) / 2;
  const aLeftRightMean = (aLeft + aRight) / 2;
  const aFloorCeilMean = (aFloor + aCeiling) / 2;

  let weightedAbsorption =
    (2 * sFrontBack * aFrontBackMean * weightFrontBack) +
    (2 * sLeftRight * aLeftRightMean * weightLeftRight) +
    (2 * sFloorCeil * aFloorCeilMean * weightFloorCeil);

  // TEMPORARY TEST: low-frequency damping multiplier — gate 55Hz, multiplier 1.5x
  if (useLowFreqDampingTest && Number.isFinite(f0) && f0 < 55) {
    weightedAbsorption = weightedAbsorption * 1.5;
  }

  const rt60 = 0.161 * volume / Math.max(weightedAbsorption, 1e-6);
  const tau = rt60 / 13.815;
  const qSabine = 2 * Math.PI * f0 * tau;
  return Math.max(1, Math.min(80, qSabine));
}

function modeShapeValueLocal(mode, x, y, z, roomDims) {
  const widthM = Math.max(1e-6, Number(roomDims?.widthM) || 0);
  const lengthM = Math.max(1e-6, Number(roomDims?.lengthM) || 0);
  const heightM = Math.max(1e-6, Number(roomDims?.heightM) || 0);
  const shapeX = mode.nx > 0 ? Math.cos(mode.nx * Math.PI * x / widthM) : 1;
  const shapeY = mode.ny > 0 ? Math.cos(mode.ny * Math.PI * y / lengthM) : 1;
  const shapeZ = mode.nz > 0 ? Math.cos(mode.nz * Math.PI * z / heightM) : 1;
  return shapeX * shapeY * shapeZ;
}

function resonantTransfer(f, f0, q) {
  const omega = 2 * Math.PI * f;
  const omega0 = 2 * Math.PI * Math.max(f0, 1e-6);
  const ratio = omega / omega0;
  const realDen = 1 - (ratio * ratio);
  const imagDen = omega / (Math.max(q, 1e-6) * omega0);
  const denominatorSq = (realDen * realDen) + (imagDen * imagDen);
  const re = realDen / denominatorSq;
  const im = -imagDen / denominatorSq;
  return { re, im, transferMag: Math.sqrt(re * re + im * im), realDen, imagDen, denominatorSq };
}

function estimateModeQByType(mode, axialQOverride = 4.0) {
  const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  const axialQ = Number.isFinite(Number(axialQOverride)) ? Number(axialQOverride) : 4.0;
  if (activeAxes === 1) return axialQ;
  if (activeAxes === 2) return 3.9;
  return 2.5;
}

function smoothSoftQCap(freqHz) {
  const A = 200;
  const n = 0.52;
  const cap = A / Math.pow(Math.max(freqHz, 1), n);
  return Math.max(8, Math.min(45, cap));
}

function interpolateCurveDb(curvePoints, hz) {
  const points = curvePoints.map((p) => ({ hz: Number(p.hz), db: Number(p.db) })).sort((a, b) => a.hz - b.hz);
  if (hz <= points[0].hz) return points[0].db;
  if (hz >= points[points.length - 1].hz) return points[points.length - 1].db;
  for (let i = 0; i < points.length - 1; i++) {
    const left = points[i]; const right = points[i + 1];
    if (hz >= left.hz && hz <= right.hz) {
      const t = (hz - left.hz) / (right.hz - left.hz);
      return left.db + (right.db - left.db) * t;
    }
  }
  return points[0].db;
}

function modalPressureContributionLocal(frequencyHz, modeFrequencyHz, qValue, combinedCoupling, modalSourceAmplitude, disableModalPropagationPhase, propagationPhaseScale, sourceX, sourceY, sourceZ, seatX, seatY, seatZ) {
  const { re: transferReal, im: transferImag } = resonantTransfer(frequencyHz, modeFrequencyHz, qValue);
  const modalGain = modalSourceAmplitude * combinedCoupling;
  const dx = sourceX - seatX, dy = sourceY - seatY, dz = sourceZ - seatZ;
  const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const propagationPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS) * propagationPhaseScale;
  const cosP = disableModalPropagationPhase ? 1 : Math.cos(propagationPhase);
  const sinP = disableModalPropagationPhase ? 0 : Math.sin(propagationPhase);
  return {
    real: modalGain * ((transferReal * cosP) - (transferImag * sinP)),
    imag: modalGain * ((transferReal * sinP) + (transferImag * cosP)),
  };
}

// Simplified production-equivalent path: direct + modes only (matches the app's live default
// REW-parity preset: reflections off, late field off, deterministic modal sum, no propagation phase).
function simulate(roomDims, seatPos, sub, subProductCurve, useLowFreqDampingTest) {
  const widthM = roomDims.widthM, lengthM = roomDims.lengthM, heightM = roomDims.heightM;
  const seat = { x: seatPos.x, y: seatPos.y, z: seatPos.z };
  const source = { x: sub.x, y: sub.y, z: sub.z, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  const surfaceAbsorption = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
  const axialQ = 4.0;

  const freqMinHz = 20, freqMaxHz = 200;
  const freqsHz = [];
  const octaves = Math.log2(freqMaxHz / freqMinHz);
  const pointsPerOctave = 96;
  const totalPoints = Math.ceil(octaves * pointsPerOctave);
  for (let i = 0; i <= totalPoints; i++) {
    const hz = freqMinHz * Math.pow(2, i / pointsPerOctave);
    if (hz > freqMaxHz) break;
    freqsHz.push(hz);
  }
  if (freqsHz[freqsHz.length - 1] !== freqMaxHz) freqsHz.push(freqMaxHz);

  const modes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: freqMaxHz }).map((mode) => {
    const absorptionQ = estimateModeQLocal({ roomDims: { widthM, lengthM, heightM }, surfaceAbsorption, f0: mode.freq, mode, useLowFreqDampingTest });
    const softCap = smoothSoftQCap(mode.freq);
    const finalQValue = Math.max(1, Math.min(absorptionQ, softCap));
    return { ...mode, qValue: finalQValue };
  });

  const splByFreq = freqsHz.map((frequencyHz) => {
    const curveDb = interpolateCurveDb(subProductCurve, frequencyHz);
    const dx = source.x - seat.x, dy = source.y - seat.y, dz = source.z - seat.z;
    const distanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const distanceLossDb = -20 * Math.log10(distanceM / 1);
    const totalMagnitudeDb = curveDb + distanceLossDb + source.tuning.gainDb;
    const amplitude = Math.pow(10, totalMagnitudeDb / 20);
    const totalPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS);
    let sumRe = amplitude * Math.cos(totalPhase);
    let sumIm = amplitude * Math.sin(totalPhase);

    // modalSourceReferenceMode: 'distance_normalized' (matches live app default preset)
    const modalSourceAmplitudeBase = Math.pow(10, (curveDb + source.tuning.gainDb) / 20) * 1.0;
    const modalSourceAmplitude1m = modalSourceAmplitudeBase * Math.pow(10, distanceLossDb / 20);

    let modalSumRe = 0, modalSumIm = 0;
    modes.forEach((mode) => {
      const sourceCoupling = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });
      const receiverCoupling = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
      const combinedCoupling = sourceCoupling * receiverCoupling;
      const contrib = modalPressureContributionLocal(
        frequencyHz, mode.freq, mode.qValue, combinedCoupling, modalSourceAmplitude1m,
        true, // disableModalPropagationPhase (forced true for flat_rew_reference preset)
        0,    // propagationPhaseScale (forced 0)
        source.x, source.y, source.z, seat.x, seat.y, seat.z
      );
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const highOrderAxialCorrectionScale = (mode.type === 'axial' && modeOrder >= 2) ? 1.0 : 1.0;
      modalSumRe += contrib.real * highOrderAxialCorrectionScale;
      modalSumIm += contrib.imag * highOrderAxialCorrectionScale;
    });

    sumRe += modalSumRe;
    sumIm += modalSumIm;
    const magnitude = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
    return { frequencyHz, splDb: 20 * Math.log10(Math.max(magnitude, 1e-10)) };
  });

  return splByFreq;
}

function nearestSpl(series, targetHz) {
  let best = null, bestDist = Infinity;
  for (const row of series) {
    const dist = Math.abs(row.frequencyHz - targetHz);
    if (dist < bestDist) { bestDist = dist; best = row; }
  }
  return best ? best.splDb : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roomDims = { widthM: 4.0, lengthM: 6.0, heightM: 2.4 };
    const flatRewCurve = [{ hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 }];
    const sub = { x: 2.0, y: 0.15, z: 0.35 };
    const seats = {
      R1S1: { x: 1.0, y: 3.6, z: 1.2 },
      R1S2: { x: 2.0, y: 3.6, z: 1.2 },
      R1S3: { x: 3.0, y: 3.6, z: 1.2 },
    };
    const targetFreqs = [29.5, 32, 35, 40, 40.6, 45, 50, 51.5, 58];

    const results = {};
    for (const [seatId, seatPos] of Object.entries(seats)) {
      const baseline = simulate(roomDims, seatPos, sub, flatRewCurve, false);
      const test = simulate(roomDims, seatPos, sub, flatRewCurve, true);
      const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
      results[seatId] = targetFreqs.map((hz) => {
        const b = nearestSpl(baseline, hz);
        const t = nearestSpl(test, hz);
        return { f: hz, base: r2(b), test: r2(t), delta: (t !== null && b !== null) ? r2(t - b) : null };
      });
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});