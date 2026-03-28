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

// Reused from the existing bass engine pattern, kept local and independent here.
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

// Reused from the existing bass engine pattern, kept local and independent here.
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

  const shapeX = mode.nx > 0 ? Math.cos(mode.nx * Math.PI * x / widthM) : 1;
  const shapeY = mode.ny > 0 ? Math.cos(mode.ny * Math.PI * y / lengthM) : 1;
  const shapeZ = mode.nz > 0 ? Math.cos(mode.nz * Math.PI * z / heightM) : 1;

  return shapeX * shapeY * shapeZ;
}

function modalContributionLocal(frequencyHz, modeFrequencyHz, qValue, coupling, sourceAmplitudeLinear) {
  const angularFrequency = 2 * Math.PI * frequencyHz;
  const modalAngularFrequency = 2 * Math.PI * modeFrequencyHz;
  const bandwidth = modalAngularFrequency / qValue;
  const deltaFrequency = angularFrequency - modalAngularFrequency;

  const denominator = Math.sqrt(deltaFrequency * deltaFrequency + bandwidth * bandwidth);
  const resonanceMagnitude = qValue * (bandwidth / denominator);
  const resonancePhase = -Math.atan2(deltaFrequency, bandwidth);
  const scaledMagnitude = sourceAmplitudeLinear * coupling * resonanceMagnitude * 2;

  return {
    real: scaledMagnitude * Math.cos(resonancePhase),
    imag: scaledMagnitude * Math.sin(resonancePhase),
  };
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
    imageSources.forEach((imageSource) => {
      const imageDx = imageSource.x - seat.x;
      const imageDy = imageSource.y - seat.y;
      const imageDz = imageSource.z - seat.z;
      const imageDistanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(imageDx * imageDx + imageDy * imageDy + imageDz * imageDz));

      const imageDistanceLossDb = -20 * Math.log10(imageDistanceM / 1);
      const imageMagnitudeDb = curveDb + imageDistanceLossDb + source.tuning.gainDb;
      const imageAmplitude = Math.pow(10, imageMagnitudeDb / 20) * imageSource.reflectionCoefficient;

      const imageTimeOfFlightPhase = -2 * Math.PI * frequencyHz * (imageDistanceM / SPEED_OF_SOUND_MPS);
      const imageTotalPhase = imageTimeOfFlightPhase + delayPhase + polarityPhase;

      sumRe += imageAmplitude * Math.cos(imageTotalPhase);
      sumIm += imageAmplitude * Math.sin(imageTotalPhase);
    });

    const preModalMagnitude = Math.sqrt(sumRe * sumRe + sumIm * sumIm);

    // Optional modal contributions
    if (enableModes) {
      modes.forEach((mode) => {
        const bandwidthHz = mode.freq / mode.qValue;
        if (Math.abs(frequencyHz - mode.freq) > 3 * bandwidthHz) {
          return;
        }

        const sourceCoupling = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });
        const receiverCoupling = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
        const combinedCoupling = sourceCoupling * receiverCoupling;

        if (Math.abs(combinedCoupling) < 1e-6) {
          return;
        }

        const modalContribution = modalContributionLocal(frequencyHz, mode.freq, mode.qValue, combinedCoupling, preModalMagnitude);
        sumRe += modalContribution.real;
        sumIm += modalContribution.imag;
      });
    }

    return {
      re: sumRe,
      im: sumIm,
    };
  });

  const splDbRaw = complexPressure.map(({ re, im }) => {
    const magnitude = Math.sqrt(re * re + im * im);
    return 20 * Math.log10(magnitude);
  });

  return {
    freqsHz,
    splDbRaw,
    complexPressure,
  };
}

export default simulateBassResponseRewCore;