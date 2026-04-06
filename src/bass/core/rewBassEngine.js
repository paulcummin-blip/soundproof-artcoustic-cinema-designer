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
// pressureMagnitude = modalSourceAmplitude * combinedCoupling * resonanceMagnitude
// modalSourceAmplitude brings the modal layer into the same pressure domain as the direct path.
function modalPressureContributionLocal(frequencyHz, modeFrequencyHz, qValue, combinedCoupling, modalSourceAmplitude) {
  const angularFrequency = 2 * Math.PI * frequencyHz;
  const modalAngularFrequency = 2 * Math.PI * modeFrequencyHz;
  const bandwidth = modalAngularFrequency / qValue;
  const deltaFrequency = angularFrequency - modalAngularFrequency;

  const denominator = Math.sqrt(deltaFrequency * deltaFrequency + bandwidth * bandwidth);
  const resonanceMagnitude = (bandwidth * bandwidth) / (denominator * denominator);
  const resonancePhase = -Math.atan2(deltaFrequency, bandwidth);

  const pressureMagnitude = modalSourceAmplitude * combinedCoupling * resonanceMagnitude;

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

function legacyModalTransferLocal(frequencyHz, modes, source, seat, roomDims, widthM, lengthM, heightM, modalSourceAmplitude) {
  // Direct pressure sum — starts at zero, no identity seed.
  // Modal contributions are true acoustic pressure additions, not a transfer function.
  let modalSumRe = 0;
  let modalSumIm = 0;

  // Step debug tracking for the strongest contributing mode
  let _debugStrongestMode = null;
  let _debugStrongestMag = -1;

  // Fixed low-mode debug capture: always report these modes regardless of ranking.
  const _debugLowModes = [];

  // HIGH-PRECISION RAW DEBUG — only fires near 44.90 Hz, only for the four key modes.
  // Does not affect any simulation behaviour. Debug-only instrumentation.
  const _isHighPrecisionSlice = Math.abs(frequencyHz - 44.90) < 0.50;
  const _highPrecisionRaw = [];

  modes.forEach((mode) => {
    const sourceCoupling = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });

    // Receiver coupling: controlled REW-parity test — 2-point lateral receiver model.
    // Span widened from the anatomical ear half-span (0.0875 m) to 0.15 m.
    // Rationale: at a centre seat, both ear points at ±0.0875 m sit very close to the
    // (1,0,0) x-node (cos-null at x = W/2), leaving odd x-order modes artificially suppressed.
    // Widening to ±0.15 m materially lifts (1,0,0) coupling without heavily distorting (2,0,0).
    // 2-point absolute average is retained; no centre sample; no other framework changes.
    const RECEIVER_HALF_SPAN_M = 0.15;
    const leftEarCoupling  = modeShapeValueLocal(mode, seat.x - RECEIVER_HALF_SPAN_M, seat.y, seat.z, { widthM, lengthM, heightM });
    const rightEarCoupling = modeShapeValueLocal(mode, seat.x + RECEIVER_HALF_SPAN_M, seat.y, seat.z, { widthM, lengthM, heightM });
    const receiverCoupling = 0.5 * (Math.abs(leftEarCoupling) + Math.abs(rightEarCoupling));

    const combinedCoupling = sourceCoupling * receiverCoupling;

    const modalContrib = modalPressureContributionLocal(
      frequencyHz,
      mode.freq,
      mode.qValue,
      combinedCoupling,
      modalSourceAmplitude
    );

    // True pressure accumulation: direct sum of all modal pressure contributions.
    modalSumRe += modalContrib.real;
    modalSumIm += modalContrib.imag;

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

        // HIGH-PRECISION RAW DEBUG — surgical addition, debug-only, no simulation change.
        // Captures exact floating-point values passed to and returned from
        // modalPressureContributionLocal at the 44.90 Hz slice for the four key modes.
        if (_isHighPrecisionSlice) {
          const unscaledRe = Math.abs(combinedCoupling) > 1e-30
            ? modalContrib.real / combinedCoupling
            : null;
          const unscaledIm = Math.abs(combinedCoupling) > 1e-30
            ? modalContrib.imag / combinedCoupling
            : null;

          // ── PARALLEL RECEIVER MODEL COMPARISON (debug-only, no simulation change) ──
          // Computes three receiver coupling variants in parallel for the four key modes
          // at ~44.90 Hz. None of these touch modalSumRe/Im or any simulation output.

          // Model A — current live model (half-span=0.15, absolute average)
          const _rcvA_left  = modeShapeValueLocal(mode, seat.x - 0.15, seat.y, seat.z, { widthM, lengthM, heightM });
          const _rcvA_right = modeShapeValueLocal(mode, seat.x + 0.15, seat.y, seat.z, { widthM, lengthM, heightM });
          const _rcvA = 0.5 * (Math.abs(_rcvA_left) + Math.abs(_rcvA_right));
          const _combA = sourceCoupling * _rcvA;
          const _contribA = modalPressureContributionLocal(frequencyHz, mode.freq, mode.qValue, _combA, modalSourceAmplitude);
          const _magA = Math.sqrt(_contribA.real * _contribA.real + _contribA.imag * _contribA.imag);

          // Model B — anatomical ear model (half-span=0.0875, absolute average)
          const _rcvB_left  = modeShapeValueLocal(mode, seat.x - 0.0875, seat.y, seat.z, { widthM, lengthM, heightM });
          const _rcvB_right = modeShapeValueLocal(mode, seat.x + 0.0875, seat.y, seat.z, { widthM, lengthM, heightM });
          const _rcvB = 0.5 * (Math.abs(_rcvB_left) + Math.abs(_rcvB_right));
          const _combB = sourceCoupling * _rcvB;
          const _contribB = modalPressureContributionLocal(frequencyHz, mode.freq, mode.qValue, _combB, modalSourceAmplitude);
          const _magB = Math.sqrt(_contribB.real * _contribB.real + _contribB.imag * _contribB.imag);

          // Model C — point receiver at exact seat position
          const _rcvC = Math.abs(modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM }));
          const _combC = sourceCoupling * _rcvC;
          const _contribC = modalPressureContributionLocal(frequencyHz, mode.freq, mode.qValue, _combC, modalSourceAmplitude);
          const _magC = Math.sqrt(_contribC.real * _contribC.real + _contribC.imag * _contribC.imag);

          _highPrecisionRaw.push({
            label: `(${mode.nx},${mode.ny},${mode.nz})`,
            evalHz:            frequencyHz,
            modeFreq:          mode.freq,
            qValue:            mode.qValue,
            sourceCoupling:    sourceCoupling,
            // Live simulation values (Model A — identical to what tfRe/tfIm used)
            receiverCoupling:  receiverCoupling,
            combinedCoupling:  combinedCoupling,
            modalContribRe:    modalContrib.real,
            modalContribIm:    modalContrib.imag,
            mag:               mag,
            unscaledRe,
            unscaledIm,
            // Parallel receiver model comparison (debug only)
            receiverModels: {
              A: { label: 'live_0.15',      rcv: _rcvA, comb: _combA, re: _contribA.real, im: _contribA.imag, mag: _magA },
              B: { label: 'anatomical_0.0875', rcv: _rcvB, comb: _combB, re: _contribB.real, im: _contribB.imag, mag: _magB },
              C: { label: 'point_seat',     rcv: _rcvC, comb: _combC, re: _contribC.real, im: _contribC.imag, mag: _magC },
            },
          });
        }
      }
    }
  });

  return { modalSumRe, modalSumIm, _debugStrongestMode, _debugLowModes, _highPrecisionRaw };
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

    // Modal source strength at 1 m: uses source output + gain only, no seat-distance attenuation.
    // Room modes are excited by energy injected into the room from the source.
    // Seat-distance effects are already handled separately by sourceCoupling / receiverCoupling.
    const modalSourceAmplitude1m = Math.pow(10, (curveDb + source.tuning.gainDb) / 20);

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

    // Additive modal pressure contribution path.
    // legacyModalTransferLocal returns the net modal pressure sum (starts at zero).
    // Modal contributions are added directly to the pre-modal field — true superposition.
    if (enableModes) {
      const { modalSumRe, modalSumIm, _debugStrongestMode, _debugLowModes, _highPrecisionRaw } = legacyModalTransferLocal(
        frequencyHz, modes, source, seat, { widthM, lengthM, heightM }, widthM, lengthM, heightM, modalSourceAmplitude1m
      );
      const prevRe = sumRe;
      const prevIm = sumIm;
      sumRe = prevRe + modalSumRe;
      sumIm = prevIm + modalSumIm;

      // Fill post-modal step debug
      if (stepDebugRows.length > 0) {
        const lastRow = stepDebugRows[stepDebugRows.length - 1];
        if (lastRow && lastRow.postModal === null && Math.abs(lastRow.frequencyHz - frequencyHz) < 0.5) {
          const postMag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
          lastRow.postModal = { modalSumRe, modalSumIm, sumRe, sumIm, magnitude: postMag };
          lastRow.modalTransferReFinal = modalSumRe;
          lastRow.modalTransferImFinal = modalSumIm;
          lastRow.lowModes = _debugLowModes || [];
          lastRow.highPrecisionRaw = _highPrecisionRaw || [];
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

          // ── MODEL APPLICATION COMPARISON (debug-only, no simulation change) ──────
          // Current live method: true pressure superposition.
          //   sumRe = prevRe + modalSumRe,  sumIm = prevIm + modalSumIm
          //   modalSumRe/Im is the net sum of all modal pressure contributions (starts at 0).
          // No identity subtraction, no transfer function — modal layer is pure pressure addition.
          const _tfMag = Math.sqrt(modalSumRe * modalSumRe + modalSumIm * modalSumIm);

          // Additive path (identical to live; kept for structural symmetry in debug output)
          const _altRe = prevRe + modalSumRe;
          const _altIm = prevIm + modalSumIm;
          const _altMag = Math.sqrt(_altRe * _altRe + _altIm * _altIm);

          // Low-mode summary (complex sum + sum-of-magnitudes from the four tracked modes)
          const _lowModes = _debugLowModes || [];
          let _lowModeSumRe = 0, _lowModeSumIm = 0, _lowModeSumMag = 0;
          _lowModes.forEach(m => {
            _lowModeSumRe += (m.transferRe || 0);
            _lowModeSumIm += (m.transferIm || 0);
            _lowModeSumMag += (m.magnitude || 0);
          });

          // Strongest single-mode magnitude
          const _strongestMag = _debugStrongestMode
            ? Math.sqrt(
                (_debugStrongestMode.transferRe || 0) * (_debugStrongestMode.transferRe || 0) +
                (_debugStrongestMode.transferIm || 0) * (_debugStrongestMode.transferIm || 0)
              )
            : null;

          lastRow.applicationComparison = {
            prevRe,
            prevIm,
            preModalMagnitude: Math.sqrt(prevRe * prevRe + prevIm * prevIm),
            modalSumRe,
            modalSumIm,
            modalSumMag: _tfMag,
            // Live result (true pressure superposition)
            livePostRe:  sumRe,
            livePostIm:  sumIm,
            livePostMag: postMag,
            liveRatio:   postMag / Math.max(1e-30, Math.sqrt(prevRe * prevRe + prevIm * prevIm)),
            // Debug mirror (identical to live in this model)
            additivePostRe:  _altRe,
            additivePostIm:  _altIm,
            additivePostMag: _altMag,
            additiveRatio:   _altMag / Math.max(1e-30, Math.sqrt(prevRe * prevRe + prevIm * prevIm)),
            // Modal summary
            strongestModeMag:   _strongestMag,
            lowModeSumRe:       _lowModeSumRe,
            lowModeSumIm:       _lowModeSumIm,
            lowModeSumOfMags:   _lowModeSumMag,
          };
          // ── END MODEL APPLICATION COMPARISON ─────────────────────────────────────
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