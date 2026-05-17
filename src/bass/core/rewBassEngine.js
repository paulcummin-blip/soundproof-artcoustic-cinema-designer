const SPEED_OF_SOUND_MPS = 343;
const MIN_DISTANCE_M = 0.01;

// Frequency axis generation
function buildFrequencyAxis(freqMinHz, freqMaxHz) {
  const minHz = Math.max(1, Number(freqMinHz) || 15);
  const maxHz = Math.max(minHz, Number(freqMaxHz) || 200);
  const freqsHz = [];

  const octaves = Math.log2(maxHz / minHz);
  const pointsPerOctave = 96;
  const totalPoints = Math.ceil(octaves * pointsPerOctave);

  for (let index = 0; index <= totalPoints; index += 1) {
    const hz = minHz * Math.pow(2, index / pointsPerOctave);
    if (hz > maxHz) break;
    freqsHz.push(hz);
  }

  if (freqsHz[freqsHz.length - 1] !== maxHz) {
    freqsHz.push(maxHz);
  }

  return freqsHz;
}

function interpolateCurveDb(curvePoints, hz) {
  if (!Array.isArray(curvePoints) || curvePoints.length === 0) {
    return 90;
  }

  const points = curvePoints
    .map((point) => ({
      hz: Number(point?.hz ?? point?.frequency ?? point?.[0]),
      db: Number(point?.db ?? point?.spl ?? point?.[1]),
    }))
    .filter((point) => Number.isFinite(point.hz) && Number.isFinite(point.db))
    .sort((a, b) => a.hz - b.hz);

  if (points.length === 0) {
    return 90;
  }

  if (hz <= points[0].hz) return points[0].db;
  if (hz >= points[points.length - 1].hz) return points[points.length - 1].db;

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];

    if (hz >= left.hz && hz <= right.hz) {
      const ratio = (hz - left.hz) / (right.hz - left.hz);
      return left.db + (right.db - left.db) * ratio;
    }
  }

  return points[0].db;
}

function normalizeSubTuning(tuning) {
  const defaults = { gainDb: 0, delayMs: 0, polarity: 0 };

  if (!tuning || typeof tuning !== 'object') {
    return defaults;
  }

  return {
    gainDb: Number.isFinite(Number(tuning.gainDb)) ? Number(tuning.gainDb) : 0,
    delayMs: Number.isFinite(Number(tuning.delayMs)) ? Number(tuning.delayMs) : 0,
    polarity: Number(tuning.polarity) === 180 ? 180 : 0,
  };
}

function normalizeSurfaceAbsorption(surfaceAbsorption) {
  const defaultCoefficient = 0.3;
  const clampAbsorption = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return defaultCoefficient;
    }
    return Math.max(0, Math.min(0.95, numericValue));
  };

  return {
    front: clampAbsorption(surfaceAbsorption?.front),
    back: clampAbsorption(surfaceAbsorption?.back),
    left: clampAbsorption(surfaceAbsorption?.left),
    right: clampAbsorption(surfaceAbsorption?.right),
    floor: clampAbsorption(surfaceAbsorption?.floor),
    ceiling: clampAbsorption(surfaceAbsorption?.ceiling),
  };
}

function computeRoomModesLocal({ widthM, lengthM, heightM, fMax, c }) {
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

// ─── ORIGINAL DAMPING BASELINE ───────────────────────────────────────────────
// Global Sabine-derived Q. No family weighting. No mode-axis-selective absorption.
// All six surfaces contribute to absorptionArea for every mode equally.
// ─────────────────────────────────────────────────────────────────────────────
function estimateModeQLocal({ roomDims, surfaceAbsorption, f0 }) {
  const widthM = Number(roomDims?.widthM) || 1;
  const lengthM = Number(roomDims?.lengthM) || 1;
  const heightM = Number(roomDims?.heightM) || 1;
  const volume = widthM * lengthM * heightM;

  const surfaceFloor = lengthM * widthM;
  const surfaceCeiling = lengthM * widthM;
  const surfaceFront = widthM * heightM;
  const surfaceBack = widthM * heightM;
  const surfaceLeft = lengthM * heightM;
  const surfaceRight = lengthM * heightM;

  const absorptionArea =
    surfaceFloor * (surfaceAbsorption?.floor ?? 0.3) +
    surfaceCeiling * (surfaceAbsorption?.ceiling ?? 0.3) +
    surfaceFront * (surfaceAbsorption?.front ?? 0.3) +
    surfaceBack * (surfaceAbsorption?.back ?? 0.3) +
    surfaceLeft * (surfaceAbsorption?.left ?? 0.3) +
    surfaceRight * (surfaceAbsorption?.right ?? 0.3);

  const rt60 = 0.161 * volume / Math.max(absorptionArea, 1e-6);
  const tau = rt60 / 13.815;
  const qSabine = 2 * Math.PI * f0 * tau;

  return Math.max(1, Math.min(80, qSabine));
}

function estimateModeQByType(mode) {
  const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  const axialHarmonicOrder = Math.max(mode.nx || 0, mode.ny || 0, mode.nz || 0);

  // Temporary REW parity diagnostic only, not final physics: reduce second axial harmonic Q.
  if (activeAxes === 1) {
    return axialHarmonicOrder === 2 ? 6.0 : 8.0;
  }

  if (activeAxes === 2) {
    return 6.0;
  }

  return 4.5;
}

function modeShapeValueLocal(mode, x, y, z, roomDims) {
  const widthM = Math.max(1e-6, Number(roomDims?.widthM) || 0);
  const lengthM = Math.max(1e-6, Number(roomDims?.lengthM) || 0);
  const heightM = Math.max(1e-6, Number(roomDims?.heightM) || 0);

  // Returns the signed mode-shape value for a single position.
  // Caller is responsible for computing source and receiver couplings separately.
  const shapeX = mode.nx > 0 ? Math.cos(mode.nx * Math.PI * x / widthM) : 1;
  const shapeY = mode.ny > 0 ? Math.cos(mode.ny * Math.PI * y / lengthM) : 1;
  const shapeZ = mode.nz > 0 ? Math.cos(mode.nz * Math.PI * z / heightM) : 1;

  return shapeX * shapeY * shapeZ;
}

// Returns a complex pressure contribution (re, im) for one mode at the receiver position.
// Modal Green's function: coupling = Ψ_source * Ψ_receiver, resonant transfer H(f, f0, Q).
// pressureMagnitude = modalSourceAmplitude * combinedCoupling * resonanceMagnitude
// modalSourceAmplitude brings the modal layer into the same pressure domain as the direct path.
function modalPressureContributionLocal(frequencyHz, modeFrequencyHz, qValue, combinedCoupling, modalSourceAmplitude, modeIndices, sourceX, sourceY, sourceZ, seatX, seatY, seatZ) {
  const angularFrequency = 2 * Math.PI * frequencyHz;
  const modalAngularFrequency = 2 * Math.PI * modeFrequencyHz;

  const ratio = angularFrequency / modalAngularFrequency;
  const realDen = 1 - (ratio * ratio);
  const imagDen = angularFrequency / (qValue * modalAngularFrequency);
  const denominatorSq = (realDen * realDen) + (imagDen * imagDen);

  const modeOrder = Math.abs(modeIndices.nx) + Math.abs(modeIndices.ny) + Math.abs(modeIndices.nz);
  const orderWeight = modeOrder >= 2 ? 0.72 : 1.0;

  const effectiveCoupling = combinedCoupling;
  const modalGain = modalSourceAmplitude * effectiveCoupling * orderWeight;

  // Standard second-order resonant transfer, derived directly from:
  // H(jω) = 1 / (1 - (ω/ω0)^2 + j * ω/(ω0 Q))
  //
  // Real(H) = realDen / denominatorSq
  // Imag(H) = -imagDen / denominatorSq
  //
  // No heuristic offsets, no hand-tuned real scaling.
  // Controlled phase-trajectory test transfer.
  // Goal:
  // - broadly constructive below the null region
  // - strong opposition through the null region
  // - recovery above the null region
  //
  // Real part follows realDen so it can change sign naturally across resonance.
  // Imaginary part follows imagDen but stays smooth and finite.
  // No arbitrary additive floor terms.
  const transferReal = realDen / denominatorSq;
  const transferImag = -imagDen / denominatorSq;

  // Approximate source-to-seat distance for phase alignment
  const dx = sourceX - seatX;
  const dy = sourceY - seatY;
  const dz = sourceZ - seatZ;
  const distanceM = Math.sqrt(dx*dx + dy*dy + dz*dz);

  // Convert to phase
  const propagationPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS);

  // Rotate modal contribution by this phase
  const cosP = Math.cos(propagationPhase);
  const sinP = Math.sin(propagationPhase);

  const alignedReal = (transferReal * cosP) - (transferImag * sinP);
  const alignedImag = (transferReal * sinP) + (transferImag * cosP);

  return {
    real: modalGain * alignedReal,
    imag: modalGain * alignedImag,
    transferReal,
    transferImag,
    beta: ratio,
    realDen,
    imagDen,
    denominatorSq,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEAN LEGACY MODAL TRANSFER
// Pure original legacy transfer baseline. No heuristic layers.
// Removed layers (frozen, not present here):
//   - node softening (normalized df window)
//   - degeneracy assist (partner coupling bleed)
//   - modal drive boost (LEGACY_MODAL_DRIVE constant)
//   - pre-modal-relative scaling (field-driven excitation)
//   - early receiver weighting (receiverWeight term)
// Accumulation: direct pressure sum (modalSumRe/Im starts at 0, no identity seed).
// Modal contributions are true pressure additions — NOT a transfer function.
// ─────────────────────────────────────────────────────────────────────────────
// Fixed low-mode keys to watch regardless of instantaneous magnitude ranking.
const LOW_MODE_KEYS = [
  { nx: 1, ny: 0, nz: 0 },
  { nx: 0, ny: 1, nz: 0 },
  { nx: 1, ny: 1, nz: 0 },
  { nx: 2, ny: 0, nz: 0 },
];

const TARGET_DEBUG_FREQUENCIES = [34.3, 40.4, 68.6];
const WHOLE_CURVE_DEBUG_TARGETS = [20, 30, 34.3, 40, 50, 60, 68.6, 70, 80, 90, 100];
const MODAL_CONTRIBUTOR_DEBUG_TARGETS = [40, 45, 50, 54];

function legacyModalTransferLocal(frequencyHz, modes, source, seat, roomDims, widthM, lengthM, heightM, modalSourceAmplitude, modalStorageMode = 'none') {
  // Direct pressure sum — starts at zero, no identity seed.
  // Modal contributions are true acoustic pressure additions, not a transfer function.
  let modalSumRe = 0;
  let modalSumIm = 0;

  // Step debug tracking for the strongest contributing mode
  let _debugStrongestMode = null;
  let _debugStrongestMag = -1;

  // Debug-only strongest mode capture for target-bin summaries.
  const contributorTargetHz = MODAL_CONTRIBUTOR_DEBUG_TARGETS.reduce((nearestTarget, targetHz) => {
    if (Math.abs(frequencyHz - targetHz) > 1) return nearestTarget;
    if (nearestTarget === null) return targetHz;
    return Math.abs(frequencyHz - targetHz) < Math.abs(frequencyHz - nearestTarget) ? targetHz : nearestTarget;
  }, null);
  const modalContributorRows = [];

  modes.forEach((mode) => {
    const sourceCoupling = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });

    const receiverCoupling = modeShapeValueLocal(
      mode,
      seat.x,
      seat.y,
      seat.z,
      { widthM, lengthM, heightM }
    );

    const combinedCoupling = sourceCoupling * receiverCoupling;

    const modalContrib = modalPressureContributionLocal(
      frequencyHz,
      mode.freq,
      mode.qValue,
      combinedCoupling,
      modalSourceAmplitude,
      { nx: mode.nx, ny: mode.ny, nz: mode.nz },
      source.x, source.y, source.z,
      seat.x, seat.y, seat.z
    );

    const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const storageFactor = modalStorageMode === 'orderCompression'
      ? modeOrder === 1
        ? 1.0
        : modeOrder === 2
          ? 0.45
          : 0.30
      : 1.0;

    const rawMagnitudeBeforeStorage = Math.sqrt(
      modalContrib.real * modalContrib.real + modalContrib.imag * modalContrib.imag
    );

    const storedModalContrib = {
      real: modalContrib.real * storageFactor,
      imag: modalContrib.imag * storageFactor,
    };

    // True pressure accumulation: direct sum of all modal pressure contributions.
    modalSumRe += storedModalContrib.real;
    modalSumIm += storedModalContrib.imag;

    const isInDebugRange = frequencyHz >= 30 && frequencyHz <= 72;

    if (isInDebugRange) {
      const mag = Math.sqrt(storedModalContrib.real * storedModalContrib.real + storedModalContrib.imag * storedModalContrib.imag);

      if (contributorTargetHz !== null) {
        modalContributorRows.push({
          targetHz: contributorTargetHz,
          frequencyHz,
          nx: mode.nx,
          ny: mode.ny,
          nz: mode.nz,
          modeFrequencyHz: mode.freq,
          modeType: mode.type,
          qValue: mode.qValue,
          sourceCoupling,
          receiverCoupling,
          combinedCoupling,
          contributionReal: storedModalContrib.real,
          contributionImag: storedModalContrib.imag,
          contributionMagnitude: mag,
          contributionPhaseAngleDeg: (Math.atan2(storedModalContrib.imag, storedModalContrib.real) * 180) / Math.PI,
          transferReal: modalContrib.transferReal,
          transferImag: modalContrib.transferImag,
          beta: modalContrib.beta,
          realDen: modalContrib.realDen,
          imagDen: modalContrib.imagDen,
          denominatorSq: modalContrib.denominatorSq,
          rawMagnitudeBeforeStorage,
          modeOrder,
          storageFactor,
          modalStorageMode,
        });
      }

      // Existing: strongest-mode tracking
      if (mag > _debugStrongestMag) {
        _debugStrongestMag = mag;
        _debugStrongestMode = {
          freq: mode.freq,
          nx: mode.nx,
          ny: mode.ny,
          nz: mode.nz,
          type: mode.type,
          qValue: mode.qValue,
          sourceCoupling,
          receiverCoupling,
          combinedCoupling,
          storageFactor,
          transferRe: storedModalContrib.real,
          transferIm: storedModalContrib.imag,
        };
      }


    }
  });

  const _debugModalContributors = contributorTargetHz !== null
    ? {
        targetHz: contributorTargetHz,
        frequencyHz,
        contributors: modalContributorRows
          .sort((a, b) => b.contributionMagnitude - a.contributionMagnitude)
          .slice(0, 8),
      }
    : null;

  return { modalSumRe, modalSumIm, _debugStrongestMode, _debugModalContributors };
}

export function simulateBassResponseRewCore(roomDims, seatPos, sub, subProductCurve, options = {}) {
  const widthM = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);
  const heightM = Number(roomDims?.heightM);

  const seat = {
    x: Number(seatPos?.x),
    y: Number(seatPos?.y),
    z: Number(seatPos?.z),
  };

  const source = {
    modelKey: sub?.modelKey || '',
    x: Number(sub?.x),
    y: Number(sub?.y),
    z: Number(sub?.z),
    tuning: normalizeSubTuning(sub?.tuning),
  };

  const smoothing = options?.smoothing ?? 'none';
  if (smoothing !== 'none') {
    throw new Error('Milestone 1b supports only smoothing: "none".');
  }

  const enableReflections = options?.enableReflections === true;
  const enableModes = options?.enableModes === true;
  const disableReflectionPhaseJitter = options?.disableReflectionPhaseJitter === true;
  const disableReflectionCoherenceWeight = options?.disableReflectionCoherenceWeight === true;
  const disableLateField = options?.disableLateField === true;
  const surfaceAbsorption = normalizeSurfaceAbsorption(options?.surfaceAbsorption);

  if (!Number.isFinite(widthM) || !Number.isFinite(lengthM) || !Number.isFinite(heightM)) {
    throw new Error('roomDims must include finite widthM, lengthM, and heightM values.');
  }

  if (!Number.isFinite(seat.x) || !Number.isFinite(seat.y) || !Number.isFinite(seat.z)) {
    throw new Error('seatPos must include finite x, y, and z values.');
  }

  if (!Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(source.z)) {
    throw new Error('sub must include finite x, y, and z values.');
  }

  if (!Array.isArray(subProductCurve) || subProductCurve.length === 0) {
    throw new Error('subProductCurve must be a non-empty array of { hz, db }.');
  }

  const freqMinHz = options?.freqMinHz;
  const freqMaxHz = options?.freqMaxHz;
  const freqsHz = buildFrequencyAxis(freqMinHz, freqMaxHz);

  const imageSources = enableReflections ? [
    { x: -source.x, y: source.y, z: source.z, reflectionCoefficient: Math.sqrt(1 - surfaceAbsorption.left) },
    { x: 2 * widthM - source.x, y: source.y, z: source.z, reflectionCoefficient: Math.sqrt(1 - surfaceAbsorption.right) },
    { x: source.x, y: -source.y, z: source.z, reflectionCoefficient: Math.sqrt(1 - surfaceAbsorption.front) },
    { x: source.x, y: 2 * lengthM - source.y, z: source.z, reflectionCoefficient: Math.sqrt(1 - surfaceAbsorption.back) },
    { x: source.x, y: source.y, z: -source.z, reflectionCoefficient: Math.sqrt(1 - surfaceAbsorption.floor) },
    { x: source.x, y: source.y, z: 2 * heightM - source.z, reflectionCoefficient: Math.sqrt(1 - surfaceAbsorption.ceiling) },
  ] : [];

  const modes = enableModes
    ? computeRoomModesLocal({
        widthM,
        lengthM,
        heightM,
        fMax: freqMaxHz,
        c: SPEED_OF_SOUND_MPS,
      }).map((mode) => ({
        ...mode,
        qValue: estimateModeQByType(mode),
      }))
    : [];

  const stepDebugRows = [];
  const wholeCurveDebugCandidates = new Map();
  const modalContributorDebugCandidates = new Map();
  const preModalSeries = [];
  const modalOnlySeries = [];
  const postModalSeries = [];

  const complexPressure = freqsHz.map((frequencyHz) => {
    const curveDb = interpolateCurveDb(subProductCurve, frequencyHz);
    let sumRe = 0;
    let sumIm = 0;
    let directRe = 0;
    let directIm = 0;
    let reflectionRe = 0;
    let reflectionIm = 0;
    let lateFieldRe = 0;
    let lateFieldIm = 0;

    // Direct path
    const dx = source.x - seat.x;
    const dy = source.y - seat.y;
    const dz = source.z - seat.z;
    const distanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(dx * dx + dy * dy + dz * dz));

    const distanceLossDb = -20 * Math.log10(distanceM / 1);
    const totalMagnitudeDb = curveDb + distanceLossDb + source.tuning.gainDb;
    const amplitude = Math.pow(10, totalMagnitudeDb / 20);

    // Modal source strength at 1 m: uses source output + gain only, no seat-distance attenuation.
    // Room modes are excited by energy injected into the room from the source.
    // Seat-distance effects are already handled separately by sourceCoupling / receiverCoupling.
    const modalGainScalar = 1.0;
    const modalSourceReferenceMode = options?.modalSourceReferenceMode || 'existing';
    const modalStorageMode = options?.modalStorageMode || 'none';
    const modalSourceAmplitudeBase = Math.pow(10, (curveDb + source.tuning.gainDb) / 20) * modalGainScalar;
    const roomVolumeM3 = widthM * lengthM * heightM;
    const modalSourceAmplitude1m = modalSourceReferenceMode === 'distance_normalized'
      ? modalSourceAmplitudeBase * Math.pow(10, distanceLossDb / 20)
      : modalSourceReferenceMode === 'room_normalized'
        ? modalSourceAmplitudeBase / Math.sqrt(Math.max(roomVolumeM3, 1e-6))
        : modalSourceAmplitudeBase;

    const timeOfFlightPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS);
    const delayPhase = -2 * Math.PI * frequencyHz * (source.tuning.delayMs / 1000);
    const polarityPhase = source.tuning.polarity === 180 ? Math.PI : 0;
    const totalPhase = timeOfFlightPhase + delayPhase + polarityPhase;

    directRe = amplitude * Math.cos(totalPhase);
    directIm = amplitude * Math.sin(totalPhase);
    sumRe += directRe;
    sumIm += directIm;

    // First-order reflections
    imageSources.forEach((imageSource, reflectionIndex) => {
      const imageDx = imageSource.x - seat.x;
      const imageDy = imageSource.y - seat.y;
      const imageDz = imageSource.z - seat.z;
      const imageDistanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(imageDx * imageDx + imageDy * imageDy + imageDz * imageDz));

      const imageDistanceLossDb = -20 * Math.log10(imageDistanceM / 1);
      const imageMagnitudeDb = curveDb + imageDistanceLossDb + source.tuning.gainDb;
      const imageAmplitude = Math.pow(10, imageMagnitudeDb / 20) * imageSource.reflectionCoefficient;

      const imageTimeOfFlightPhase = -2 * Math.PI * frequencyHz * (imageDistanceM / SPEED_OF_SOUND_MPS);

      // Deterministic frequency-dependent phase jitter — reflections only.
      const phaseJitter = disableReflectionPhaseJitter ? 0 : 0.002 * (frequencyHz - 20) * (1 + 0.3 * reflectionIndex);
      const imageTotalPhase = imageTimeOfFlightPhase + delayPhase + polarityPhase + phaseJitter;

      // Smooth coherence curve: ~0.75 at 20 Hz → ~0.25 at 200 Hz
      const reflectionCoherenceWeight = disableReflectionCoherenceWeight ? 1 : 0.25 + 0.6 * Math.exp(-(frequencyHz - 20) / 70);
      const imageRe = reflectionCoherenceWeight * imageAmplitude * Math.cos(imageTotalPhase);
      const imageIm = reflectionCoherenceWeight * imageAmplitude * Math.sin(imageTotalPhase);
      reflectionRe += imageRe;
      reflectionIm += imageIm;
      sumRe += imageRe;
      sumIm += imageIm;
    });

    // Diffuse late-field approximation
    const lateFieldDecay = Math.exp(-(frequencyHz - 20) / 120);
    const lateFieldAmplitude = disableLateField ? 0 : amplitude * 0.12 * lateFieldDecay;
    const lateFieldPhase = 2 * Math.PI * frequencyHz * 0.0071 + 1.3;
    lateFieldRe = disableLateField ? 0 : lateFieldAmplitude * Math.cos(lateFieldPhase);
    lateFieldIm = disableLateField ? 0 : lateFieldAmplitude * Math.sin(lateFieldPhase);
    sumRe += lateFieldRe;
    sumIm += lateFieldIm;

    const preModalMagnitude = Math.sqrt(sumRe * sumRe + sumIm * sumIm);

    // Collect step debug data for 30–72 Hz range
    if (frequencyHz >= 30 && frequencyHz <= 72) {
      let _refSumRe = 0;
      let _refSumIm = 0;
      imageSources.forEach((imageSource, reflectionIndex) => {
        const imageDx = imageSource.x - seat.x;
        const imageDy = imageSource.y - seat.y;
        const imageDz = imageSource.z - seat.z;
        const imageDistanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(imageDx * imageDx + imageDy * imageDy + imageDz * imageDz));
        const imageDistanceLossDb = -20 * Math.log10(imageDistanceM / 1);
        const imageMagnitudeDb = curveDb + imageDistanceLossDb + source.tuning.gainDb;
        const imageAmplitude = Math.pow(10, imageMagnitudeDb / 20) * imageSource.reflectionCoefficient;
        const imageTimeOfFlightPhase = -2 * Math.PI * frequencyHz * (imageDistanceM / SPEED_OF_SOUND_MPS);
        const debugPhaseJitter = disableReflectionPhaseJitter ? 0 : 0.002 * (frequencyHz - 20) * (1 + 0.3 * reflectionIndex);
        const imageTotalPhase = imageTimeOfFlightPhase + delayPhase + polarityPhase + debugPhaseJitter;
        const debugCoherenceWeight = disableReflectionCoherenceWeight ? 1 : 0.25 + 0.6 * Math.exp(-(frequencyHz - 20) / 70);
        _refSumRe += debugCoherenceWeight * imageAmplitude * Math.cos(imageTotalPhase);
        _refSumIm += debugCoherenceWeight * imageAmplitude * Math.sin(imageTotalPhase);
      });

      stepDebugRows.push({
        frequencyHz,
        curveDb,
        direct: {
          amplitude,
          totalPhase,
          re: amplitude * Math.cos(totalPhase),
          im: amplitude * Math.sin(totalPhase),
        },
        summedWeightedReflectionsRe: _refSumRe,
        summedWeightedReflectionsIm: _refSumIm,
        summedWeightedReflectionsMag: Math.sqrt(_refSumRe * _refSumRe + _refSumIm * _refSumIm),
        lateFieldRe: lateFieldAmplitude * Math.cos(lateFieldPhase),
        lateFieldIm: lateFieldAmplitude * Math.sin(lateFieldPhase),
        lateFieldMag: lateFieldAmplitude,
        summedBeforeModes: { sumRe, sumIm, preModalMagnitude },
        postModal: null,
        strongestModeFreq: null,
        modalTransferReFinal: null,
        modalTransferImFinal: null,
      });
    }

    // Additive modal pressure contribution path.
    // legacyModalTransferLocal returns the net modal pressure sum (starts at zero).
    // Modal contributions are added directly to the pre-modal field — true superposition.
    let modalSumMagnitude = null;
    let modalCapApplied = false;
    let modalCapRatio = 1;
    let modalCapScale = 1;
    let modalSumMagnitudeBeforeCap = null;
    let modalSumMagnitudeAfterCap = null;

    if (enableModes) {
      let { modalSumRe, modalSumIm, _debugStrongestMode, _debugModalContributors } = legacyModalTransferLocal(
        frequencyHz, modes, source, seat, { widthM, lengthM, heightM }, widthM, lengthM, heightM, modalSourceAmplitude1m, modalStorageMode
      );

      if (_debugModalContributors) {
        const existingContributor = modalContributorDebugCandidates.get(_debugModalContributors.targetHz);
        const distanceFromTarget = Math.abs(_debugModalContributors.frequencyHz - _debugModalContributors.targetHz);
        if (!existingContributor || existingContributor.distanceFromTarget > distanceFromTarget) {
          modalContributorDebugCandidates.set(_debugModalContributors.targetHz, {
            ..._debugModalContributors,
            distanceFromTarget,
          });
        }
      }
      const prevRe = sumRe;
      const prevIm = sumIm;

      // TEMP REW parity diagnostic: cap accumulated modal vector to pre-modal magnitude.
      // Preserves modal vector angle by scaling real/imaginary components equally.
      modalSumMagnitudeBeforeCap = Math.sqrt(modalSumRe * modalSumRe + modalSumIm * modalSumIm);
      if (modalSumMagnitudeBeforeCap > preModalMagnitude && modalSumMagnitudeBeforeCap > 0) {
        modalCapApplied = true;
        modalCapScale = preModalMagnitude / modalSumMagnitudeBeforeCap;
        modalCapRatio = modalCapScale;
        modalSumRe *= modalCapScale;
        modalSumIm *= modalCapScale;
      }
      modalSumMagnitudeAfterCap = Math.sqrt(modalSumRe * modalSumRe + modalSumIm * modalSumIm);

      // True acoustic pressure superposition:
      // modalSumRe/modalSumIm are already scaled pressure contributions,
      // so they must be added to the existing complex pressure field.
      sumRe = prevRe + modalSumRe;
      sumIm = prevIm + modalSumIm;

      const modalTransferRe = null;
      const modalTransferIm = null;
      modalSumMagnitude = modalSumMagnitudeAfterCap;

      // Fill post-modal step debug
      if (stepDebugRows.length > 0) {
        const nearestRow = stepDebugRows.reduce((bestRow, row) => {
          if (!bestRow) return row;
          return Math.abs(row.frequencyHz - frequencyHz) < Math.abs(bestRow.frequencyHz - frequencyHz)
            ? row
            : bestRow;
        }, null);

        if (nearestRow && nearestRow.postModal === null) {
          const postMag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
          const modalSumMag = Math.sqrt(modalSumRe * modalSumRe + modalSumIm * modalSumIm);
          modalSumMagnitude = modalSumMag;
          const strongestModeMagnitude = _debugStrongestMode
            ? Math.sqrt(
                (_debugStrongestMode.transferRe || 0) * (_debugStrongestMode.transferRe || 0) +
                (_debugStrongestMode.transferIm || 0) * (_debugStrongestMode.transferIm || 0)
              )
            : null;

          if (TARGET_DEBUG_FREQUENCIES.some((targetHz) => Math.abs(nearestRow.frequencyHz - targetHz) < 0.75)) {
            nearestRow.targetVectorDebug = {
              frequencyHz: nearestRow.frequencyHz,
              summedBeforeModes: {
                sumRe: prevRe,
                sumIm: prevIm,
                preModalMagnitude: Math.sqrt(prevRe * prevRe + prevIm * prevIm),
              },
              postModal: {
                modalSumRe,
                modalSumIm,
                sumRe,
                sumIm,
                magnitude: Math.sqrt(sumRe * sumRe + sumIm * sumIm),
                modalCapApplied,
                modalCapRatio,
                modalCapScale,
                modalSumMagnitudeBeforeCap,
                modalSumMagnitudeAfterCap,
                preModalMagnitude,
              },
              applicationComparison: {
                prevRe,
                prevIm,
                preModalMagnitude: Math.sqrt(prevRe * prevRe + prevIm * prevIm),
                modalSumRe,
                modalSumIm,
                modalSumMag: Math.sqrt(modalSumRe * modalSumRe + modalSumIm * modalSumIm),
                modalCapApplied,
                modalCapRatio,
                modalCapScale,
                modalSumMagnitudeBeforeCap,
                modalSumMagnitudeAfterCap,
                livePostRe: sumRe,
                livePostIm: sumIm,
                livePostMag: Math.sqrt(sumRe * sumRe + sumIm * sumIm),
                modalTransferRe,
                modalTransferIm,
                strongestModeMag: _debugStrongestMode
                  ? Math.sqrt(
                      _debugStrongestMode.transferRe * _debugStrongestMode.transferRe +
                      _debugStrongestMode.transferIm * _debugStrongestMode.transferIm
                    )
                  : null,
                preModalComponents: {
                  direct: {
                    re: directRe,
                    im: directIm,
                    magnitude: Math.sqrt(directRe * directRe + directIm * directIm),
                  },
                  reflections: {
                    re: reflectionRe,
                    im: reflectionIm,
                    magnitude: Math.sqrt(reflectionRe * reflectionRe + reflectionIm * reflectionIm),
                  },
                  lateField: {
                    re: lateFieldRe,
                    im: lateFieldIm,
                    magnitude: Math.sqrt(lateFieldRe * lateFieldRe + lateFieldIm * lateFieldIm),
                  }
                },
              },
              strongestMode: _debugStrongestMode
                ? {
                    freq: _debugStrongestMode.freq,
                    nx: _debugStrongestMode.nx,
                    ny: _debugStrongestMode.ny,
                    nz: _debugStrongestMode.nz,
                    type: _debugStrongestMode.type,
                    qValue: _debugStrongestMode.qValue,
                    sourceCoupling: _debugStrongestMode.sourceCoupling,
                    receiverCoupling: _debugStrongestMode.receiverCoupling,
                    combinedCoupling: _debugStrongestMode.combinedCoupling,
                    transferRe: _debugStrongestMode.transferRe,
                    transferIm: _debugStrongestMode.transferIm,
                    magnitude: Math.sqrt(
                      _debugStrongestMode.transferRe * _debugStrongestMode.transferRe +
                      _debugStrongestMode.transferIm * _debugStrongestMode.transferIm
                    ),
                  }
                : null,
            };
          }
        }
      }
    }

    const postModalMagnitude = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
    const finalSplDb = 20 * Math.log10(postModalMagnitude);

    preModalSeries.push({
      frequencyHz,
      magnitude: preModalMagnitude,
      splDb: 20 * Math.log10(Math.max(preModalMagnitude, 1e-10)),
    });
    modalOnlySeries.push({
      frequencyHz,
      magnitude: modalSumMagnitude ?? 0,
      splDb: 20 * Math.log10(Math.max(modalSumMagnitude ?? 0, 1e-10)),
      diagnosticLabel: 'TEMP_MODAL_CAP_ACTIVE_modalOnlySeries_uses_capped_magnitude',
    });
    postModalSeries.push({
      frequencyHz,
      magnitude: postModalMagnitude,
      splDb: finalSplDb,
    });

    WHOLE_CURVE_DEBUG_TARGETS.forEach((targetHz) => {
      const distanceFromTarget = Math.abs(frequencyHz - targetHz);
      if (distanceFromTarget > 1) return;

      const existing = wholeCurveDebugCandidates.get(targetHz);
      if (existing && existing.distanceFromTarget <= distanceFromTarget) return;

      wholeCurveDebugCandidates.set(targetHz, {
        distanceFromTarget,
        targetHz,
        frequencyHz,
        finalSplDb,
        curveDb,
        directMagnitude: Math.sqrt(directRe * directRe + directIm * directIm),
        reflectionMagnitude: Math.sqrt(reflectionRe * reflectionRe + reflectionIm * reflectionIm),
        lateFieldMagnitude: Math.sqrt(lateFieldRe * lateFieldRe + lateFieldIm * lateFieldIm),
        preModalMagnitude,
        modalSumMagnitude,
        modalCapApplied,
        modalCapRatio,
        modalCapScale,
        modalSumMagnitudeBeforeCap,
        modalSumMagnitudeAfterCap,
        postModalMagnitude,
        modalGainScalar,
        modalSourceReferenceMode,
        modalStorageMode,
      });
    });

    return { re: sumRe, im: sumIm };
  });

  const splDbRaw = complexPressure.map(({ re, im }) => {
    const magnitude = Math.sqrt(re * re + im * im);
    return 20 * Math.log10(magnitude);
  });

  const wholeCurveDebugRows = WHOLE_CURVE_DEBUG_TARGETS.map((targetHz) => {
    const row = wholeCurveDebugCandidates.get(targetHz);
    if (!row) {
      return {
        targetHz,
        frequencyHz: null,
        finalSplDb: null,
        curveDb: null,
        directMagnitude: null,
        reflectionMagnitude: null,
        lateFieldMagnitude: null,
        preModalMagnitude: null,
        modalSumMagnitude: null,
        modalCapApplied: false,
        modalCapRatio: null,
        modalCapScale: null,
        modalSumMagnitudeBeforeCap: null,
        modalSumMagnitudeAfterCap: null,
        postModalMagnitude: null,
        modalGainScalar: null,
        modalSourceReferenceMode: options?.modalSourceReferenceMode || 'existing',
        modalStorageMode: options?.modalStorageMode || 'none',
      };
    }

    const { distanceFromTarget, ...debugRow } = row;
    return debugRow;
  });

  const modalContributorDebugRows = MODAL_CONTRIBUTOR_DEBUG_TARGETS.map((targetHz) => {
    const row = modalContributorDebugCandidates.get(targetHz);
    if (!row) return { targetHz, frequencyHz: null, contributors: [] };
    const { distanceFromTarget, ...debugRow } = row;
    return debugRow;
  });

  wholeCurveDebugRows.preModalSeries = preModalSeries;
  wholeCurveDebugRows.modalOnlySeries = modalOnlySeries;
  wholeCurveDebugRows.postModalSeries = postModalSeries;
  wholeCurveDebugRows.modalContributorDebugRows = modalContributorDebugRows;
  wholeCurveDebugRows.diagnosticToggles = {
    disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight,
    disableLateField,
  };

  return {
    freqsHz,
    splDbRaw,
    complexPressure,
    stepDebug: stepDebugRows
      .map((row) => row.targetVectorDebug)
      .filter(Boolean),
    wholeCurveDebugRows,
    modalContributorDebugRows,
    preModalSeries,
    modalOnlySeries,
    postModalSeries,
  };
}

export default simulateBassResponseRewCore;