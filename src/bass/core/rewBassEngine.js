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

// Returns a complex pressure contribution (re, im) for one mode at the receiver position.
// This is a modal Green's function: it expresses the pressure response at the receiver
// due to a source, mediated by a single room mode.
//
// Formulation: p_mode(f) = [Ψ_s * Ψ_r] / [(f0/Q)^2 + j*(f/Q)*f0 - (f-f0)^2] scaled form
// Simplified to the standard resonant transfer: coupling * Q * (bw/denom) * e^(j*phase)
// where coupling = Ψ_source * Ψ_receiver (mode shape at source × mode shape at receiver).
// This is the physically correct room-mode pressure Green's function.
//
// IMPORTANT: combinedCoupling near zero means the mode is decoupled from either source
// or receiver. It correctly produces near-zero contribution in that case — this is physical.
// The fix for the identity-collapse bug is upstream: use abs(combinedCoupling) threshold
// that is appropriate for the cosine mode shape range [-1, +1], and accumulate as an
// additive pressure delta (not as a multiplicative transfer starting from identity 1+j0).
function modalPressureContributionLocal(frequencyHz, modeFrequencyHz, qValue, combinedCoupling) {
  const angularFrequency = 2 * Math.PI * frequencyHz;
  const modalAngularFrequency = 2 * Math.PI * modeFrequencyHz;
  const bandwidth = modalAngularFrequency / qValue;
  const deltaFrequency = angularFrequency - modalAngularFrequency;

  const denominator = Math.sqrt(deltaFrequency * deltaFrequency + bandwidth * bandwidth);
  const resonanceMagnitude = bandwidth / denominator;     // peak = 1 at f0, falls off with df
  const resonancePhase = -Math.atan2(deltaFrequency, bandwidth);

  // combinedCoupling = Ψ_source * Ψ_receiver ∈ [-1, +1]
  // Scale by Q so that strongly resonant modes (high Q) contribute more energy —
  // matching REW's modal pressure Green's function convention.
  const pressureMagnitude = combinedCoupling * qValue * resonanceMagnitude;

  return {
    real: pressureMagnitude * Math.cos(resonancePhase),
    imag: pressureMagnitude * Math.sin(resonancePhase),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY modal-transfer helper (multiplicative-from-identity, pre-additive-injection)
// Kept here for A/B validation only. Do not tune or ship as production path.
// ─────────────────────────────────────────────────────────────────────────────
function legacyModalTransferLocal(frequencyHz, modes, source, seat, roomDims, widthM, lengthM, heightM) {
  let tfRe = 1;
  let tfIm = 0;

  modes.forEach((mode) => {
    const bandwidthHz = mode.freq / mode.qValue;
    const df = Math.abs(frequencyHz - mode.freq);
    const normalized = df / (3 * bandwidthHz);
    if (normalized >= 1) return;

    const weight = 0.5 * (1 + Math.cos(Math.PI * normalized));

    const sourceCoupling = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });
    const receiverCoupling = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
    const combinedCoupling = sourceCoupling * receiverCoupling;

    if (Math.abs(combinedCoupling) < 1e-4) return;

    const modalContrib = modalPressureContributionLocal(
      frequencyHz,
      mode.freq,
      mode.qValue,
      combinedCoupling
    );

    // Legacy: accumulate as a multiplicative transfer function delta from identity (1+j0)
    tfRe += weight * modalContrib.real;
    tfIm += weight * modalContrib.imag;
  });

  return { tfRe, tfIm };
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

  // A/B modal model selector — "legacy_transfer" | "additive_pressure" (default)
  const modalModel = options?.modalModel === 'legacy_transfer' ? 'legacy_transfer' : 'additive_pressure';

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

  // __B44_STEP_DEBUG__ temporary probe — remove after diagnosis
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
      // Grows from ~0 at 20 Hz to ~0.4 rad at 200 Hz, stable per reflection identity.
      const phaseJitter = 0.002 * (frequencyHz - 20) * (1 + 0.3 * reflectionIndex);
      const imageTotalPhase = imageTimeOfFlightPhase + delayPhase + polarityPhase + phaseJitter;

      const f = frequencyHz;
      // Smooth coherence curve: ~0.75 at 20 Hz → ~0.25 at 200 Hz
      const reflectionCoherenceWeight = 0.25 + 0.6 * Math.exp(-(f - 20) / 70);
      sumRe += reflectionCoherenceWeight * imageAmplitude * Math.cos(imageTotalPhase);
      sumIm += reflectionCoherenceWeight * imageAmplitude * Math.sin(imageTotalPhase);
    });

    // Diffuse late-field approximation — higher-order / late reflection residual.
    // Derived from the direct-path amplitude, decaying with frequency.
    // Intentionally modest: adds believable residual energy without dominating.
    const lateFieldDecay = Math.exp(-(frequencyHz - 20) / 120);
    const lateFieldAmplitude = amplitude * 0.12 * lateFieldDecay;
    // Deterministic phase: offset from specular phases, stable per frequency.
    const lateFieldPhase = 2 * Math.PI * frequencyHz * 0.0071 + 1.3;
    sumRe += lateFieldAmplitude * Math.cos(lateFieldPhase);
    sumIm += lateFieldAmplitude * Math.sin(lateFieldPhase);

    const preModalMagnitude = Math.sqrt(sumRe * sumRe + sumIm * sumIm);

    // __B44_STEP_DEBUG__ temporary probe — remove after diagnosis
    if (frequencyHz >= 43 && frequencyHz <= 55) {
      // Aggregate weighted reflections from the live per-reflection contributions
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

      // Late-field values computed above (same formula)
      const _lfRe = lateFieldAmplitude * Math.cos(lateFieldPhase);
      const _lfIm = lateFieldAmplitude * Math.sin(lateFieldPhase);

      stepDebugRows.push({
        frequencyHz,
        curveDb,
        direct: {
          amplitude,
          totalPhase,
          re: amplitude * Math.cos(totalPhase),
          im: amplitude * Math.sin(totalPhase),
        },
        reflections: imageSources.map((imageSource, reflectionIndex) => {
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
          return {
            reflectionCoefficient: imageSource.reflectionCoefficient,
            imageDistanceM,
            imageAmplitude,
            imageTotalPhase,
            re: imageAmplitude * Math.cos(imageTotalPhase),
            im: imageAmplitude * Math.sin(imageTotalPhase),
            reflectionCoherenceWeight: debugCoherenceWeight,
            weightedRe: debugCoherenceWeight * imageAmplitude * Math.cos(imageTotalPhase),
            weightedIm: debugCoherenceWeight * imageAmplitude * Math.sin(imageTotalPhase),
          };
        }),
        // Aggregated reflection vector (sum of all weighted per-reflection contributions)
        summedWeightedReflectionsRe: _refSumRe,
        summedWeightedReflectionsIm: _refSumIm,
        summedWeightedReflectionsMag: Math.sqrt(_refSumRe * _refSumRe + _refSumIm * _refSumIm),
        // Late-field contribution
        lateFieldRe: _lfRe,
        lateFieldIm: _lfIm,
        lateFieldMag: lateFieldAmplitude,
        summedBeforeModes: {
          sumRe,   // pre-modal field real component (direct + reflections + late-field)
          sumIm,   // pre-modal field imaginary component
          preModalMagnitude,
        },
        // postModal is filled in after the modal transfer is applied below
        postModal: null,
      });
    }
    // __B44_STEP_DEBUG__ end

    // Modal pressure injection — adds modal resonance contributions directly to the
    // pre-modal complex pressure field as additive pressure deltas.
    //
    // Physical basis: each room mode is an independent resonator. Its contribution to
    // the total pressure field at the receiver is additive (superposition principle).
    // The modal pressure delta is: weight * Ψ_s * Ψ_r * Q * H(f, f0, Q)
    // where H is the resonant transfer amplitude and phase.
    //
    // This replaces the previous multiplicative-from-identity approach which collapsed
    // to no-op (TfRe=1, TfIm=0) whenever combinedCoupling was near zero at the receiver
    // (e.g. centre seat for axial modes — a common and physically valid configuration).
    //
    // Normalisation: modal pressure contributions are scaled by (1 / Q_ref) where
    // Q_ref is a reference Q to keep modal injection dimensionally consistent with the
    // direct-path amplitude. This prevents modes from dominating the field at all freqs.
    const Q_REF = 10; // reference Q for normalisation — typical room mode Q range 5–30

    if (enableModes) {
      // ── CONDITIONAL MODAL APPLICATION ──────────────────────────────────────
      // Branch on modalModel option: "legacy_transfer" or "additive_pressure"
      if (modalModel === 'legacy_transfer') {
        // LEGACY PATH: multiplicative transfer applied to current sumRe/sumIm field
        const { tfRe, tfIm } = legacyModalTransferLocal(
          frequencyHz, modes, source, seat, { widthM, lengthM, heightM }, widthM, lengthM, heightM
        );
        const prevRe = sumRe;
        const prevIm = sumIm;
        sumRe = prevRe * tfRe - prevIm * tfIm;
        sumIm = prevRe * tfIm + prevIm * tfRe;

        // __B44_STEP_DEBUG__ fill in post-modal for legacy path
        if (stepDebugRows.length > 0) {
          const lastRow = stepDebugRows[stepDebugRows.length - 1];
          if (lastRow && lastRow.postModal === null && Math.abs(lastRow.frequencyHz - frequencyHz) < 0.5) {
            const postMag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
            lastRow.postModal = { transferRe: tfRe, transferIm: tfIm, sumRe, sumIm, magnitude: postMag };
            lastRow.modalTransferReFinal = tfRe;
            lastRow.modalTransferImFinal = tfIm;
          }
        }
      } else {
      // ADDITIVE PRESSURE PATH (default) ─────────────────────────────────────
      // Accumulated modal pressure delta (additive to sumRe/sumIm)
      let modalDeltaRe = 0;
      let modalDeltaIm = 0;

      // __B44_STEP_DEBUG__ track strongest active mode for debug rows
      let _debugStrongestMode = null;
      let _debugStrongestModeWeightedMag = -1;

      modes.forEach((mode) => {
        const bandwidthHz = mode.freq / mode.qValue;
        const df = Math.abs(frequencyHz - mode.freq);
        const normalized = df / (3 * bandwidthHz);

        if (normalized >= 1) {
          return;
        }

        const weight = 0.5 * (1 + Math.cos(Math.PI * normalized));

        const sourceCoupling = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });
        const receiverCoupling = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
        const combinedCoupling = sourceCoupling * receiverCoupling;

        // Lower threshold: cosine mode shapes are in [-1, +1].
        // Near-zero combinedCoupling is physically meaningful (node at source or receiver)
        // and correctly produces near-zero modal injection — do not skip these modes.
        // Only skip if truly negligible (numerical noise floor).
        if (Math.abs(combinedCoupling) < 1e-4) {
          return;
        }

        const modalContrib = modalPressureContributionLocal(
          frequencyHz,
          mode.freq,
          mode.qValue,
          combinedCoupling
        );

        // Normalise by Q_REF so modal injection scales consistently with direct amplitude.
        // weight = Hann window over 3 bandwidths, tapers modes away from their peak.
        const normalisedWeight = weight / Q_REF;
        const weightedRe = normalisedWeight * modalContrib.real;
        const weightedIm = normalisedWeight * modalContrib.imag;
        const weightedMag = Math.sqrt(weightedRe * weightedRe + weightedIm * weightedIm);

        modalDeltaRe += weightedRe;
        modalDeltaIm += weightedIm;

        // __B44_STEP_DEBUG__ capture strongest active mode
        if (frequencyHz >= 43 && frequencyHz <= 55 && weightedMag > _debugStrongestModeWeightedMag) {
          _debugStrongestModeWeightedMag = weightedMag;
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
            bandwidthHz,
            df,
            normalized,
            weight,
            transferRe: modalContrib.real,
            transferIm: modalContrib.imag,
          };
        }
      });

      // Add modal pressure delta directly to the complex pressure field.
      // Scale by direct-path amplitude so modal injection is in the same units
      // as the direct field — modes modulate relative to the source level.
      sumRe -= amplitude * modalDeltaRe;
      sumIm -= amplitude * modalDeltaIm;

      // Build a virtual "transfer" for debug reporting (ratio of post/pre-modal field)
      const postMag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
      const preMagForDebug = preModalMagnitude > 1e-10 ? preModalMagnitude : 1;
      const debugTransferRe = (sumRe * Math.sqrt(sumRe * sumRe + sumIm * sumIm)) / (preMagForDebug * preMagForDebug + 1e-30) || 1;
      const debugTransferIm = (sumIm * Math.sqrt(sumRe * sumRe + sumIm * sumIm)) / (preMagForDebug * preMagForDebug + 1e-30) || 0;

      // __B44_STEP_DEBUG__ fill in post-modal result for debug rows in this frequency range
      if (stepDebugRows.length > 0) {
        const lastRow = stepDebugRows[stepDebugRows.length - 1];
        if (lastRow && lastRow.postModal === null && Math.abs(lastRow.frequencyHz - frequencyHz) < 0.5) {
          lastRow.postModal = {
            transferRe: modalDeltaRe,
            transferIm: modalDeltaIm,
            sumRe,
            sumIm,
            magnitude: postMag,
          };
          // Attach strongest-mode debug data and final delta to the row
          lastRow.modalTransferReFinal = modalDeltaRe;
          lastRow.modalTransferImFinal = modalDeltaIm;
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
            lastRow.strongestModeBandwidthHz = _debugStrongestMode.bandwidthHz;
            lastRow.strongestModeDf = _debugStrongestMode.df;
            lastRow.strongestModeNormalized = _debugStrongestMode.normalized;
            lastRow.strongestModeWeight = _debugStrongestMode.weight;
            lastRow.strongestModeTransferRe = _debugStrongestMode.transferRe;
            lastRow.strongestModeTransferIm = _debugStrongestMode.transferIm;
          }
        }
      }
      } // end additive_pressure else-branch
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
    stepDebug: stepDebugRows, // __B44_STEP_DEBUG__ temporary — remove after diagnosis
  };
}

export default simulateBassResponseRewCore;