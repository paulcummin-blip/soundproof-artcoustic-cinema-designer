const SPEED_OF_SOUND_MPS = 343;
const MIN_DISTANCE_M = 0.01;

// Frequency axis generation
function buildFrequencyAxis(freqMinHz, freqMaxHz) {
  const minHz = Math.max(1, Number(freqMinHz) || 15);
  const maxHz = Math.max(minHz, Number(freqMaxHz) || 200);
  const freqsHz = [];

  const octaves = Math.log2(maxHz / minHz);
  const pointsPerOctave = 24;
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
// pressureMagnitude = combinedCoupling * Q * resonanceMagnitude
function modalPressureContributionLocal(frequencyHz, modeFrequencyHz, qValue, combinedCoupling) {
  const angularFrequency = 2 * Math.PI * frequencyHz;
  const modalAngularFrequency = 2 * Math.PI * modeFrequencyHz;
  const bandwidth = modalAngularFrequency / qValue;
  const deltaFrequency = angularFrequency - modalAngularFrequency;

  const denominator = Math.sqrt(deltaFrequency * deltaFrequency + bandwidth * bandwidth);
  const resonanceMagnitude = (bandwidth * bandwidth) / (denominator * denominator);
  const resonancePhase = -Math.atan2(deltaFrequency, bandwidth);

  const pressureMagnitude = combinedCoupling * resonanceMagnitude;

  return {
    real: pressureMagnitude * Math.cos(resonancePhase),
    imag: pressureMagnitude * Math.sin(resonancePhase),
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
// Accumulation: multiplicative transfer from identity (1+j0), direct combinedCoupling only.
// ─────────────────────────────────────────────────────────────────────────────
// Fixed low-mode keys to watch regardless of instantaneous magnitude ranking.
const LOW_MODE_KEYS = [
  { nx: 1, ny: 0, nz: 0 },
  { nx: 0, ny: 1, nz: 0 },
  { nx: 1, ny: 1, nz: 0 },
  { nx: 2, ny: 0, nz: 0 },
];

function legacyModalTransferLocal(frequencyHz, modes, source, seat, roomDims, widthM, lengthM, heightM) {
  let tfRe = 1;
  let tfIm = 0;

  // Step debug tracking for the strongest contributing mode
  let _debugStrongestMode = null;
  let _debugStrongestMag = -1;

  // Fixed low-mode debug capture: always report these modes regardless of ranking.
  const _debugLowModes = [];

  modes.forEach((mode) => {
    const sourceCoupling = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });

    // Receiver coupling: two-ear spatial receiver model.
    // The listener is modelled as two ear positions symmetric about the head centre (seat).
    // Inter-aural distance for low-frequency bass is ~0.175 m (half-span = 0.0875 m).
    // Ears are offset laterally (X axis) in the plan view, which is the axis that
    // most cleanly maps to the left/right head orientation of a seated listener.
    // receiverCoupling is the arithmetic mean of the signed mode-shape values at
    // both ear positions — sign is preserved, no magnitudes are averaged.
    const EAR_HALF_SPAN_M = 0.0875; // half of ~175 mm inter-aural distance
    const leftEarCoupling  = modeShapeValueLocal(mode, seat.x - EAR_HALF_SPAN_M, seat.y, seat.z, { widthM, lengthM, heightM });
    const rightEarCoupling = modeShapeValueLocal(mode, seat.x + EAR_HALF_SPAN_M, seat.y, seat.z, { widthM, lengthM, heightM });
    const receiverCoupling = 0.5 * (leftEarCoupling + rightEarCoupling);

    const combinedCoupling = sourceCoupling * receiverCoupling;

    const modalContrib = modalPressureContributionLocal(
      frequencyHz,
      mode.freq,
      mode.qValue,
      combinedCoupling
    );

    // Pure original accumulation: additive delta to transfer from identity (1+j0)
    tfRe += modalContrib.real;
    tfIm += modalContrib.imag;

    const isInDebugRange = frequencyHz >= 43 && frequencyHz <= 55;

    if (isInDebugRange) {
      const mag = Math.sqrt(modalContrib.real * modalContrib.real + modalContrib.imag * modalContrib.imag);

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
          transferRe: modalContrib.real,
          transferIm: modalContrib.imag,
        };
      }

      // New: fixed low-mode capture — always report (1,0,0) (0,1,0) (1,1,0) (2,0,0)
      const isLowMode = LOW_MODE_KEYS.some(k => k.nx === mode.nx && k.ny === mode.ny && k.nz === mode.nz);
      if (isLowMode) {
        _debugLowModes.push({
          freq: mode.freq,
          nx: mode.nx,
          ny: mode.ny,
          nz: mode.nz,
          type: mode.type,
          qValue: mode.qValue,
          sourceCoupling,
          receiverCoupling,
          combinedCoupling,
          transferRe: modalContrib.real,
          transferIm: modalContrib.imag,
          magnitude: mag,
        });
      }
    }
  });

  return { tfRe, tfIm, _debugStrongestMode, _debugLowModes };
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
        qValue: estimateModeQLocal({
          roomDims: { widthM, lengthM, heightM },
          surfaceAbsorption,
          f0: mode.freq,
        }),
      }))
    : [];

  const stepDebugRows = [];

  const complexPressure = freqsHz.map((frequencyHz) => {
    const curveDb = interpolateCurveDb(subProductCurve, frequencyHz);
    let sumRe = 0;
    let sumIm = 0;

    // Direct path
    const dx = source.x - seat.x;
    const dy = source.y - seat.y;
    const dz = source.z - seat.z;
    const distanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(dx * dx + dy * dy + dz * dz));

    const distanceLossDb = -20 * Math.log10(distanceM / 1);
    const totalMagnitudeDb = curveDb + distanceLossDb + source.tuning.gainDb;
    const amplitude = Math.pow(10, totalMagnitudeDb / 20);

    const timeOfFlightPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS);
    const delayPhase = -2 * Math.PI * frequencyHz * (source.tuning.delayMs / 1000);
    const polarityPhase = source.tuning.polarity === 180 ? Math.PI : 0;
    const totalPhase = timeOfFlightPhase + delayPhase + polarityPhase;

    sumRe += amplitude * Math.cos(totalPhase);
    sumIm += amplitude * Math.sin(totalPhase);

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
      const phaseJitter = 0.002 * (frequencyHz - 20) * (1 + 0.3 * reflectionIndex);
      const imageTotalPhase = imageTimeOfFlightPhase + delayPhase + polarityPhase + phaseJitter;

      // Smooth coherence curve: ~0.75 at 20 Hz → ~0.25 at 200 Hz
      const reflectionCoherenceWeight = 0.25 + 0.6 * Math.exp(-(frequencyHz - 20) / 70);
      sumRe += reflectionCoherenceWeight * imageAmplitude * Math.cos(imageTotalPhase);
      sumIm += reflectionCoherenceWeight * imageAmplitude * Math.sin(imageTotalPhase);
    });

    // Diffuse late-field approximation
    const lateFieldDecay = Math.exp(-(frequencyHz - 20) / 120);
    const lateFieldAmplitude = amplitude * 0.12 * lateFieldDecay;
    const lateFieldPhase = 2 * Math.PI * frequencyHz * 0.0071 + 1.3;
    sumRe += lateFieldAmplitude * Math.cos(lateFieldPhase);
    sumIm += lateFieldAmplitude * Math.sin(lateFieldPhase);

    const preModalMagnitude = Math.sqrt(sumRe * sumRe + sumIm * sumIm);

    // Collect step debug data for 43–55 Hz range
    if (frequencyHz >= 43 && frequencyHz <= 55) {
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
        const debugPhaseJitter = 0.002 * (frequencyHz - 20) * (1 + 0.3 * reflectionIndex);
        const imageTotalPhase = imageTimeOfFlightPhase + delayPhase + polarityPhase + debugPhaseJitter;
        const debugCoherenceWeight = 0.25 + 0.6 * Math.exp(-(frequencyHz - 20) / 70);
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

    // Clean legacy modal transfer path
    if (enableModes) {
      const { tfRe, tfIm, _debugStrongestMode, _debugLowModes } = legacyModalTransferLocal(
        frequencyHz, modes, source, seat, { widthM, lengthM, heightM }, widthM, lengthM, heightM
      );
      const prevRe = sumRe;
      const prevIm = sumIm;
      sumRe = prevRe * tfRe - prevIm * tfIm;
      sumIm = prevRe * tfIm + prevIm * tfRe;

      // Fill post-modal step debug
      if (stepDebugRows.length > 0) {
        const lastRow = stepDebugRows[stepDebugRows.length - 1];
        if (lastRow && lastRow.postModal === null && Math.abs(lastRow.frequencyHz - frequencyHz) < 0.5) {
          const postMag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
          lastRow.postModal = { transferRe: tfRe, transferIm: tfIm, sumRe, sumIm, magnitude: postMag };
          lastRow.modalTransferReFinal = tfRe;
          lastRow.modalTransferImFinal = tfIm;
          lastRow.lowModes = _debugLowModes || [];
          if (_debugStrongestMode) {
            lastRow.strongestModeFreq = _debugStrongestMode.freq;
            lastRow.strongestModeNx = _debugStrongestMode.nx;
            lastRow.strongestModeNy = _debugStrongestMode.ny;
            lastRow.strongestModeNz = _debugStrongestMode.nz;
            lastRow.strongestModeType = _debugStrongestMode.type;
            lastRow.strongestModeQ = _debugStrongestMode.qValue;
            lastRow.strongestModeSourceCoupling = _debugStrongestMode.sourceCoupling;
            lastRow.strongestModeReceiverCoupling = _debugStrongestMode.receiverCoupling;
            lastRow.strongestModeCombinedCoupling = _debugStrongestMode.combinedCoupling;
            lastRow.strongestModeTransferRe = _debugStrongestMode.transferRe;
            lastRow.strongestModeTransferIm = _debugStrongestMode.transferIm;
          }
        }
      }
    }

    return { re: sumRe, im: sumIm };
  });

  const splDbRaw = complexPressure.map(({ re, im }) => {
    const magnitude = Math.sqrt(re * re + im * im);
    return 20 * Math.log10(magnitude);
  });

  return {
    freqsHz,
    splDbRaw,
    complexPressure,
    stepDebug: stepDebugRows,
  };
}

export default simulateBassResponseRewCore;