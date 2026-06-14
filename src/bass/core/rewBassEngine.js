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
    return Math.max(0, Math.min(1.0, numericValue));
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

function estimateModeQByType(mode, axialQOverride = 8.0) {
  const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  const axialQ = Number.isFinite(Number(axialQOverride)) ? Number(axialQOverride) : 8.0;

  // Temporary REW parity diagnostic only: allow axial Q override in REW Core Test path.
  if (activeAxes === 1) {
    return axialQ;
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
function modalPressureContributionLocal(frequencyHz, modeFrequencyHz, qValue, combinedCoupling, modalSourceAmplitude, modeIndices, sourceX, sourceY, sourceZ, seatX, seatY, seatZ, disableModalPropagationPhase = false, propagationPhaseScale = 0.5) {
  const angularFrequency = 2 * Math.PI * frequencyHz;
  const modalAngularFrequency = 2 * Math.PI * modeFrequencyHz;

  const ratio = angularFrequency / modalAngularFrequency;
  const realDen = 1 - (ratio * ratio);
  const imagDen = angularFrequency / (qValue * modalAngularFrequency);
  const denominatorSq = (realDen * realDen) + (imagDen * imagDen);

  const modeOrder = Math.abs(modeIndices.nx) + Math.abs(modeIndices.ny) + Math.abs(modeIndices.nz);
  const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;

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
  const propagationPhase =
    -2 * Math.PI *
    frequencyHz *
    (distanceM / SPEED_OF_SOUND_MPS) *
    propagationPhaseScale;

  // Rotate modal contribution by this phase unless the REW Core diagnostic bypass is enabled.
  const cosP = disableModalPropagationPhase ? 1 : Math.cos(propagationPhase);
  const sinP = disableModalPropagationPhase ? 0 : Math.sin(propagationPhase);

  const alignedReal = (transferReal * cosP) - (transferImag * sinP);
  const alignedImag = (transferReal * sinP) + (transferImag * cosP);

  return {
    real: modalGain * alignedReal,
    imag: modalGain * alignedImag,
    transferReal,
    transferImag,
    propagationPhase,
    modalPropagationPhaseDisabled: disableModalPropagationPhase,
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
const MODAL_CONTRIBUTOR_DEBUG_TARGETS = [34.3, 40.6, 45, 50, 54, 68.6, 69.24];
const PER_MODE_SPLIT_COHERENT_FRACTION = 0.70;

// Temporary REW parity diagnostic only, not final physics: deterministic per-mode phase decorrelation.
function deterministicModalPhasePerturbationRad(mode, frequencyHz) {
  const stableSeed =
    (mode.nx + 1) * 12.9898 +
    (mode.ny + 1) * 78.233 +
    (mode.nz + 1) * 37.719 +
    mode.freq * 0.071 +
    frequencyHz * 0.013;
  const normalized = Math.sin(stableSeed) * 0.5 + 0.5;
  return (normalized - 0.5) * 0.24;
}

// Diagnostic only: deterministic per-mode phase dispersion used only for the
// distributed modal coherence curve. Magnitude is preserved; active sums are untouched.
function deterministicDistributedModalCoherencePhaseRad(mode, frequencyHz) {
  const modeOrder = Math.abs(mode.nx || 0) + Math.abs(mode.ny || 0) + Math.abs(mode.nz || 0);
  const stableSeed =
    (mode.nx + 1) * 19.417 +
    (mode.ny + 1) * 43.113 +
    (mode.nz + 1) * 71.901 +
    mode.freq * 0.113 +
    frequencyHz * 0.029;
  const signedNoise = Math.sin(stableSeed) * Math.cos(stableSeed * 0.37);
  const orderSpread = modeOrder <= 1 ? 0.22 : modeOrder === 2 ? 0.42 : 0.58;
  const frequencySpread = 0.35 + 0.45 * Math.min(1, Math.max(0, (frequencyHz - 25) / 70));

  return signedNoise * orderSpread * frequencySpread;
}

function buildPartialCoherenceDiagnostic({ frequencyHz, preModalRe, preModalIm, modalSumRe, modalSumIm, coherentFinalMag }) {
  const preModalMag = Math.sqrt(preModalRe * preModalRe + preModalIm * preModalIm);
  const modalSumMag = Math.sqrt(modalSumRe * modalSumRe + modalSumIm * modalSumIm);

  // Diagnostic only — main simulation unchanged. Splits modal energy into coherent + energetic parts.
  const modalToPreModalCoherence = 0.65 + 0.1 * Math.sin((frequencyHz * 0.037) + 0.9);
  const coherentModalRe = modalSumRe * modalToPreModalCoherence;
  const coherentModalIm = modalSumIm * modalToPreModalCoherence;
  const incoherentModalMag = modalSumMag * Math.sqrt(Math.max(0, 1 - (modalToPreModalCoherence * modalToPreModalCoherence)));
  const coherentPartRe = preModalRe + coherentModalRe;
  const coherentPartIm = preModalIm + coherentModalIm;
  const coherentPartMag = Math.sqrt(coherentPartRe * coherentPartRe + coherentPartIm * coherentPartIm);
  const partialCoherenceDiagnosticMag = Math.sqrt(
    (coherentPartMag * coherentPartMag) + (incoherentModalMag * incoherentModalMag)
  );
  const coherentFinalDb = 20 * Math.log10(Math.max(coherentFinalMag, 1e-10));
  const partialCoherenceDiagnosticDb = 20 * Math.log10(Math.max(partialCoherenceDiagnosticMag, 1e-10));

  return {
    label: 'diagnostic only — main simulation unchanged',
    frequencyHz,
    preModalMag,
    modalSumMag,
    coherentFinalMag,
    partialCoherenceDiagnosticMag,
    coherentFinalDb,
    partialCoherenceDiagnosticDb,
    differenceDb: partialCoherenceDiagnosticDb - coherentFinalDb,
    modalToPreModalCoherence,
    coherentModalMag: modalSumMag * modalToPreModalCoherence,
    energeticModalMag: incoherentModalMag,
  };
}

function legacyModalTransferLocal(frequencyHz, modes, source, seat, roomDims, widthM, lengthM, heightM, modalSourceAmplitude, modalStorageMode = 'none', pureDeterministicModalSum = false, disableModalPropagationPhase = false, mute68HzAxialMode = false, propagationPhaseScale = 0.5, delayMs = 0, polarity = 0, debugMode200Multiplier = 1.0) {
  // Direct pressure sum — starts at zero, no identity seed.
  // Modal contributions are true acoustic pressure additions, not a transfer function.
  let modalSumRe = 0;
  let modalSumIm = 0;
  let diagnosticPerturbedModalSumRe = 0;
  let diagnosticPerturbedModalSumIm = 0;
  let distributedCoherenceModalSumRe = 0;
  let distributedCoherenceModalSumIm = 0;
  let splitCoherenceModalSumRe = 0;
  let splitCoherenceModalSumIm = 0;
  let splitCoherenceModalEnergySq = 0;

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
  const activeModalContributorRows = [];

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
      seat.x, seat.y, seat.z,
      disableModalPropagationPhase,
      propagationPhaseScale
    );

    const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const isMuted68HzAxialMode = mute68HzAxialMode === true && mode.type === 'axial' && Math.abs(mode.freq - 68.6) <= 0.2;
    const axialLightStorageFactor = modalStorageMode === 'light' && mode.type === 'axial'
      ? 1 + (0.06 / (1 + Math.pow((frequencyHz - mode.freq) / Math.max(mode.freq * 0.08, 1e-6), 2)))
      : 1.0;
    const storageFactor = modalStorageMode === 'orderCompression'
      ? modeOrder === 1
        ? 1.0
        : modeOrder === 2
          ? 0.45
          : 0.30
      : axialLightStorageFactor;

    const rawMagnitudeBeforeStorage = Math.sqrt(
      modalContrib.real * modalContrib.real + modalContrib.imag * modalContrib.imag
    );

    // Apply sub tuning phase (delay + polarity) to each modal contribution.
    // This ensures polarity inversion and time alignment affect the modal pressure field,
    // not just the direct/reflection path.
    const tuningPhase =
      (-2 * Math.PI * frequencyHz * (delayMs / 1000)) +
      (polarity === 180 ? Math.PI : 0);
    const tuningCos = Math.cos(tuningPhase);
    const tuningSin = Math.sin(tuningPhase);
    const tunedModalContrib = {
      real: (modalContrib.real * tuningCos) - (modalContrib.imag * tuningSin),
      imag: (modalContrib.real * tuningSin) + (modalContrib.imag * tuningCos),
    };

    const storedModalContrib = {
      real: tunedModalContrib.real * storageFactor,
      imag: tunedModalContrib.imag * storageFactor,
    };

    // Temporary REW parity diagnostic only: rotate stored modal vector without changing magnitude.
    const modalPhasePerturbationRad = deterministicModalPhasePerturbationRad(mode, frequencyHz);
    const modalPhaseCos = Math.cos(modalPhasePerturbationRad);
    const modalPhaseSin = Math.sin(modalPhasePerturbationRad);
    const perturbedStoredModalContrib = {
      real: (storedModalContrib.real * modalPhaseCos) - (storedModalContrib.imag * modalPhaseSin),
      imag: (storedModalContrib.real * modalPhaseSin) + (storedModalContrib.imag * modalPhaseCos),
    };

    // Diagnostic-only per-mode coherent/energetic split. Preserves each modal
    // contribution's energy while moving only the split-off portion out of
    // pressure-domain modal aggregation. Active modalSumRe/modalSumIm are untouched.
    const splitModalMagSq =
      (perturbedStoredModalContrib.real * perturbedStoredModalContrib.real) +
      (perturbedStoredModalContrib.imag * perturbedStoredModalContrib.imag);
    splitCoherenceModalSumRe += perturbedStoredModalContrib.real * PER_MODE_SPLIT_COHERENT_FRACTION;
    splitCoherenceModalSumIm += perturbedStoredModalContrib.imag * PER_MODE_SPLIT_COHERENT_FRACTION;
    splitCoherenceModalEnergySq += splitModalMagSq * (1 - (PER_MODE_SPLIT_COHERENT_FRACTION * PER_MODE_SPLIT_COHERENT_FRACTION));

    // Diagnostic-only distributed modal coherence sum. Uses the already-built
    // individual modal vector, preserves its magnitude, and only changes how the
    // diagnostic modal vectors combine. It does not affect modalSumRe/modalSumIm.
    const distributedPhaseRad = deterministicDistributedModalCoherencePhaseRad(mode, frequencyHz);
    const distributedPhaseCos = Math.cos(distributedPhaseRad);
    const distributedPhaseSin = Math.sin(distributedPhaseRad);
    distributedCoherenceModalSumRe +=
      (perturbedStoredModalContrib.real * distributedPhaseCos) -
      (perturbedStoredModalContrib.imag * distributedPhaseSin);
    distributedCoherenceModalSumIm +=
      (perturbedStoredModalContrib.real * distributedPhaseSin) +
      (perturbedStoredModalContrib.imag * distributedPhaseCos);

    diagnosticPerturbedModalSumRe += perturbedStoredModalContrib.real;
    diagnosticPerturbedModalSumIm += perturbedStoredModalContrib.imag;

    const activeStoredModalContrib = pureDeterministicModalSum
      ? storedModalContrib
      : perturbedStoredModalContrib;

    const activeMagnitude = Math.sqrt(
      activeStoredModalContrib.real * activeStoredModalContrib.real + activeStoredModalContrib.imag * activeStoredModalContrib.imag
    );
    const activeTransferMagnitudeAtNull = Math.sqrt(
      modalContrib.transferReal * modalContrib.transferReal + modalContrib.transferImag * modalContrib.transferImag
    );
    const estimatedResonanceMagnitude = activeTransferMagnitudeAtNull > 0
      ? activeMagnitude * (mode.qValue / activeTransferMagnitudeAtNull)
      : null;

    // True pressure accumulation: direct sum of all modal pressure contributions.
    // Temporary REW parity diagnostic: optionally mute only the 68.6 Hz axial mode from active modal sum.
    if (!isMuted68HzAxialMode) {
      // High-order axial modal amplitude correction for REW parity.
      // Keeps Q unchanged; reduces stored pressure contribution for axial harmonics only.
      // Axial modes with modeOrder >= 2 (e.g. 2,0,0 at 68.6 Hz) are over-estimated by the engine
      // relative to REW because their modal pressure accumulates at the full axial Q gain without
      // the harmonic energy dissipation that applies in measured rooms. A scale of 0.50 brings
      // the 68.6 Hz axial harmonic from ~94.8 dB to ~92.6 dB against the REW target of ~92.4 dB
      // without shifting the primary modes at 34.3 Hz or 48.5 Hz.
      // Q values, coupling, storage factor, tangential/oblique modes, and all non-modal paths are unchanged.
      const HIGH_ORDER_AXIAL_SCALE = 0.50;
      const highOrderAxialCorrectionScale = (mode.type === 'axial' && modeOrder >= 2)
        ? HIGH_ORDER_AXIAL_SCALE
        : 1.0;

      // __TEMP_REW_PARITY_MODE_200_SCALE__ (diagnostic overlay — preserved for optional dev use)
      // When debugMode200Multiplier !== 1.0, it overrides only the (2,0,0) contribution regardless
      // of the production correction above. Set to 1.0 to observe the production behaviour cleanly.
      const _mode200DebugOverride = (mode.nx === 2 && mode.ny === 0 && mode.nz === 0 && debugMode200Multiplier !== 1.0)
        ? debugMode200Multiplier
        : 1.0;

      modalSumRe += activeStoredModalContrib.real * highOrderAxialCorrectionScale * _mode200DebugOverride;
      modalSumIm += activeStoredModalContrib.imag * highOrderAxialCorrectionScale * _mode200DebugOverride;
    }

    const isInDebugRange = frequencyHz >= 30 && frequencyHz <= 72;

    if (isInDebugRange) {
      activeModalContributorRows.push({
        frequencyHz,
        nx: mode.nx,
        ny: mode.ny,
        nz: mode.nz,
        modeFrequencyHz: mode.freq,
        modeType: mode.type,
        sourceCoupling,
        receiverCoupling,
        combinedCoupling,
        activeReal: activeStoredModalContrib.real,
        activeImag: activeStoredModalContrib.imag,
        activeMagnitude,
        activePhaseAngleDeg: (Math.atan2(activeStoredModalContrib.imag, activeStoredModalContrib.real) * 180) / Math.PI,
        qValue: mode.qValue,
        activeTransferMagnitudeAtNull,
        modalTransferMagnitude: activeTransferMagnitudeAtNull,
        rawModalMagnitude: rawMagnitudeBeforeStorage,
        estimatedResonanceMagnitude,
        mutedFromActiveModalSum: isMuted68HzAxialMode,
      });
    }

    if (isInDebugRange) {
      const mag = Math.sqrt(perturbedStoredModalContrib.real * perturbedStoredModalContrib.real + perturbedStoredModalContrib.imag * perturbedStoredModalContrib.imag);

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
          contributionReal: perturbedStoredModalContrib.real,
          contributionImag: perturbedStoredModalContrib.imag,
          contributionMagnitude: mag,
          contributionPhaseAngleDeg: (Math.atan2(perturbedStoredModalContrib.imag, perturbedStoredModalContrib.real) * 180) / Math.PI,
          modalPhasePerturbationRad,
          modalPhasePerturbationDeg: (modalPhasePerturbationRad * 180) / Math.PI,
          transferReal: modalContrib.transferReal,
          transferImag: modalContrib.transferImag,
          propagationPhase: modalContrib.propagationPhase,
          modalPropagationPhaseDisabled: modalContrib.modalPropagationPhaseDisabled,
          beta: modalContrib.beta,
          realDen: modalContrib.realDen,
          imagDen: modalContrib.imagDen,
          denominatorSq: modalContrib.denominatorSq,
          rawMagnitudeBeforeStorage,
          modeOrder,
          storageFactor,
          modalStorageMode,
          mutedFromActiveModalSum: isMuted68HzAxialMode,
          muteReason: isMuted68HzAxialMode ? 'Temporary REW Core Test: muted 68.6 Hz axial mode' : null,
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
          mutedFromActiveModalSum: isMuted68HzAxialMode,
          transferRe: perturbedStoredModalContrib.real,
          transferIm: perturbedStoredModalContrib.imag,
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

  const _debugActiveModalVectorBreakdown = {
    frequencyHz,
    modalSumRe,
    modalSumIm,
    contributors: activeModalContributorRows
      .sort((a, b) => b.activeMagnitude - a.activeMagnitude),
  };

  return {
    modalSumRe,
    modalSumIm,
    diagnosticPerturbedModalSumRe,
    diagnosticPerturbedModalSumIm,
    distributedCoherenceModalSumRe,
    distributedCoherenceModalSumIm,
    splitCoherenceModalSumRe,
    splitCoherenceModalSumIm,
    splitCoherenceModalEnergySq,
    _debugStrongestMode,
    _debugModalContributors,
    _debugActiveModalVectorBreakdown,
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
  // __TEMP_DIAGNOSTIC_REFLECTION_ORDER__
  // Allows testing whether the missing 58–60 Hz null is caused by first-order-only image sources.
  // 1 = production first-order only (default)
  // 2 = include second-order image sources
  // 3 = include second + third-order image sources
  // DO NOT promote to production without full parity review.
  const debugReflectionOrder = Number.isFinite(Number(options?.debugReflectionOrder))
    ? Math.round(Number(options.debugReflectionOrder))
    : 1;
  const disableReflectionPhaseJitter = options?.disableReflectionPhaseJitter === true;
  const disableReflectionCoherenceWeight = options?.disableReflectionCoherenceWeight === true;
  const disableLateField = options?.disableLateField === true;
  const pureDeterministicModalSum = options?.pureDeterministicModalSum === true || (
    typeof window !== 'undefined' &&
    window.localStorage?.getItem('rewCorePureDeterministicModalSum') === 'true'
  );
  const disableModalPropagationPhase = options?.disableModalPropagationPhase === true;
  const mute68HzAxialMode = options?.mute68HzAxialMode === true;
  const propagationPhaseScaleOption = Number(options?.propagationPhaseScale);
  const propagationPhaseScale = Number.isFinite(propagationPhaseScaleOption) ? propagationPhaseScaleOption : 0.5;
  const axialQOption = Number(options?.axialQ);
  const axialQ = Number.isFinite(axialQOption) ? axialQOption : 8.0;
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
  const schroederFrequency = 2000 * Math.sqrt(0.4 / (widthM * lengthM * heightM));

  // __TEMP_DIAGNOSTIC_REFLECTION_ORDER__
  // buildImageSources generates all image sources up to the requested reflection order
  // using true rectangular-room mirrored-room geometry.
  // Each image source carries an accumulated pressure reflection coefficient product
  // (sqrt(1 - alpha) per wall bounce) matching the first-order convention already in use.
  //
  // Wall index convention for the six faces:
  //   0 = left   (x=0),  alpha = surfaceAbsorption.left
  //   1 = right  (x=W),  alpha = surfaceAbsorption.right
  //   2 = front  (y=0),  alpha = surfaceAbsorption.front
  //   3 = back   (y=L),  alpha = surfaceAbsorption.back
  //   4 = floor  (z=0),  alpha = surfaceAbsorption.floor
  //   5 = ceiling(z=H),  alpha = surfaceAbsorption.ceiling
  //
  // For order N we iterate over all integer reflection index triples (rx, ry, rz)
  // where |rx|+|ry|+|rz| <= N, excluding (0,0,0) which is the direct path.
  // Each axis triple maps to a unique image source position and wall-hit count.
  //
  // Image source formula (standard rectangular room):
  //   For axis X with room width W and source position sx:
  //     If reflection index ix is even:  image_x = ix * W + sx
  //     If reflection index ix is odd:   image_x = ix * W + (W - sx)  [i.e. mirrored]
  //   Same for Y (lengthM, sy) and Z (heightM, sz).
  //
  // Wall hit counts per axis (to compute absorption product):
  //   X axis: hits on left = ceil(|ix|/2) if ix positive, or floor((|ix|+1)/2) if negative (etc.)
  //   Simplified: left hits = number of even-valued reflections crossing x=0,
  //               right hits = number of odd-valued reflections crossing x=W.
  //   Standard closed-form: for integer index n (can be negative):
  //     right_hits = floor((n+1)/2) if n>0, 0 if n<=0
  //     left_hits  = floor(n/2+0.5) for n>0, floor(-n/2+0.5) for n<0 ... use below helper.

  function buildImageSources(sx, sy, sz, W, L, H, sa, maxOrder) {
    if (maxOrder < 1) return [];
    const sources = [];
    const rMax = maxOrder;

    for (let rx = -rMax; rx <= rMax; rx++) {
      for (let ry = -rMax; ry <= rMax; ry++) {
        for (let rz = -rMax; rz <= rMax; rz++) {
          const totalOrder = Math.abs(rx) + Math.abs(ry) + Math.abs(rz);
          if (totalOrder === 0 || totalOrder > maxOrder) continue;

          // Image position
          const imgX = (rx % 2 === 0) ? rx * W + sx : rx * W + (W - sx);
          const imgY = (ry % 2 === 0) ? ry * L + sy : ry * L + (L - sy);
          const imgZ = (rz % 2 === 0) ? rz * H + sz : rz * H + (H - sz);

          // Wall hit counts — derived from the reflection index parity pattern.
          // Each unit step in the reflection index crosses one wall.
          // For index n > 0: crosses right wall ceil(n/2) times, left wall floor(n/2) times.
          // For index n < 0: same but mirrored (crosses left ceil(|n|/2), right floor(|n|/2)).
          const absRx = Math.abs(rx);
          const absRy = Math.abs(ry);
          const absRz = Math.abs(rz);

          let rightHits, leftHits, backHits, frontHits, ceilingHits, floorHits;

          if (rx >= 0) {
            rightHits = Math.ceil(absRx / 2);
            leftHits  = Math.floor(absRx / 2);
          } else {
            leftHits  = Math.ceil(absRx / 2);
            rightHits = Math.floor(absRx / 2);
          }
          if (ry >= 0) {
            backHits  = Math.ceil(absRy / 2);
            frontHits = Math.floor(absRy / 2);
          } else {
            frontHits = Math.ceil(absRy / 2);
            backHits  = Math.floor(absRy / 2);
          }
          if (rz >= 0) {
            ceilingHits = Math.ceil(absRz / 2);
            floorHits   = Math.floor(absRz / 2);
          } else {
            floorHits   = Math.ceil(absRz / 2);
            ceilingHits = Math.floor(absRz / 2);
          }

          // Pressure reflection coefficient: product of sqrt(1-alpha) per wall hit
          const rc =
            Math.pow(Math.sqrt(1 - sa.left),    leftHits) *
            Math.pow(Math.sqrt(1 - sa.right),   rightHits) *
            Math.pow(Math.sqrt(1 - sa.front),   frontHits) *
            Math.pow(Math.sqrt(1 - sa.back),    backHits) *
            Math.pow(Math.sqrt(1 - sa.floor),   floorHits) *
            Math.pow(Math.sqrt(1 - sa.ceiling), ceilingHits);

          sources.push({ x: imgX, y: imgY, z: imgZ, reflectionCoefficient: rc, order: totalOrder });
        }
      }
    }
    return sources;
  }

  const imageSources = enableReflections
    ? buildImageSources(
        source.x, source.y, source.z,
        widthM, lengthM, heightM,
        surfaceAbsorption,
        debugReflectionOrder
      )
    : [];

  const modes = enableModes
    ? computeRoomModesLocal({
        widthM,
        lengthM,
        heightM,
        fMax: freqMaxHz,
        c: SPEED_OF_SOUND_MPS,
      }).map((mode) => {
        const baseQ = estimateModeQByType(mode, axialQ);
        const absorptionQ = estimateModeQLocal({
          roomDims: { widthM, lengthM, heightM },
          surfaceAbsorption,
          f0: mode.freq,
        });
        // __TEMP_REW_PARITY_CONSTANT_AXIAL_Q__
        // When overrideConstantAxialQ is true, axial modes bypass the Sabine absorptionQ clamp
        // and use the user baseQ directly. Tangential and oblique modes are unaffected.
        const isAxialOverride = options?.overrideConstantAxialQ === true && mode.type === 'axial';
        // __TEMP_REW_PARITY_ABSORPTION_AXIAL_Q__
        // When overrideAbsorptionAxialQ is true, axial modes use absorptionQ directly,
        // bypassing the Math.min(baseQ, absorptionQ) clamp entirely.
        // Tangential and oblique modes are unaffected.
        const isAbsorptionAxialOverride = options?.overrideAbsorptionAxialQ === true && mode.type === 'axial';
        return {
          ...mode,
          qValue: isAxialOverride ? baseQ
            : isAbsorptionAxialOverride ? absorptionQ
            : Math.max(1, Math.min(baseQ, absorptionQ)),
        };
      })
    : [];

  const stepDebugRows = [];
  const wholeCurveDebugCandidates = new Map();
  const modalContributorDebugCandidates = new Map();
  const activeModalContributorDebugSeries = [];
  const preModalSeries = [];
  const modalOnlySeries = [];
  const postModalSeries = [];
  const partialCoherenceDiagnosticSeries = [];
  const distributedCoherenceDiagnosticSeries = [];
  const splitCoherenceDiagnosticSeries = [];

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
    const modalGainScalarOption = Number(options?.modalGainScalar);
    const modalGainScalar = Number.isFinite(modalGainScalarOption) ? modalGainScalarOption : 1.0;
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

      // Reflection phase is pure propagation/time-of-flight only.
      // Phase jitter was removed after parity audit showed it shallowed the 40 Hz null and shifted its centre.
      // disableReflectionPhaseJitter flag is preserved for reference but no longer alters output.
      const phaseJitter = 0; // eslint-disable-line no-unused-vars
      const imageTotalPhase = imageTimeOfFlightPhase + delayPhase + polarityPhase;

      // __TEMP_REW_PARITY_TEST_REFLECTION_COHERENCE__
      // Temporarily forcing full coherence (1.0) to test whether the existing
      // frequency-dependent weighting is the cause of one-sub REW parity error.
      // Original formula (preserved, commented out):
      // const reflectionCoherenceWeight = disableReflectionCoherenceWeight
      //   ? 1
      //   : Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (frequencyHz - 20) / 140))));
      const reflectionCoherenceWeight = 1.0; // __TEMP_REW_PARITY_TEST_REFLECTION_COHERENCE__
      const imageRe = reflectionCoherenceWeight * imageAmplitude * Math.cos(imageTotalPhase);
      const imageIm = reflectionCoherenceWeight * imageAmplitude * Math.sin(imageTotalPhase);
      reflectionRe += imageRe;
      reflectionIm += imageIm;
      sumRe += imageRe;
      sumIm += imageIm;
    });

    // Diffuse late-field approximation
    // Temporary REW parity diagnostic only: no late-field contribution below Schroeder.
    const lateFieldDecay = Math.exp(-(frequencyHz - 20) / 120);
    const lateFieldAmplitude = (disableLateField || frequencyHz < schroederFrequency) ? 0 : amplitude * 0.12 * lateFieldDecay;
    const lateFieldPhase = 2 * Math.PI * frequencyHz * 0.0071 + 1.3;
    lateFieldRe = (disableLateField || frequencyHz < schroederFrequency) ? 0 : lateFieldAmplitude * Math.cos(lateFieldPhase);
    lateFieldIm = (disableLateField || frequencyHz < schroederFrequency) ? 0 : lateFieldAmplitude * Math.sin(lateFieldPhase);
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
        // Step-debug copy: jitter removed to match production path.
        const imageTotalPhase = imageTimeOfFlightPhase + delayPhase + polarityPhase;
        // __TEMP_REW_PARITY_TEST_REFLECTION_COHERENCE__ (debug copy — kept in sync with main path)
        const debugCoherenceWeight = 1.0;
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
    let partialCoherenceDiagnostic = null;
    let partialCoherencePreModalRe = sumRe;
    let partialCoherencePreModalIm = sumIm;
    let partialCoherenceModalSumRe = 0;
    let partialCoherenceModalSumIm = 0;
    let distributedCoherenceDiagnostic = null;
    let distributedCoherenceModalSumRe = 0;
    let distributedCoherenceModalSumIm = 0;
    let splitCoherenceDiagnostic = null;
    let splitCoherenceModalSumRe = 0;
    let splitCoherenceModalSumIm = 0;
    let splitCoherenceModalEnergySq = 0;
    let modalCapApplied = false;
    let modalCapRatio = null;
    let modalCapScale = null;
    let modalSumMagnitudeBeforeCap = null;
    let modalSumMagnitudeAfterCap = null;

    // __TEMP_DIAGNOSTIC__ debugDisableModalContribution — remove after polarity masking diagnosis
    if (enableModes) {
      let {
        modalSumRe,
        modalSumIm,
        diagnosticPerturbedModalSumRe,
        diagnosticPerturbedModalSumIm,
        distributedCoherenceModalSumRe: diagnosticModalSumRe,
        distributedCoherenceModalSumIm: diagnosticModalSumIm,
        splitCoherenceModalSumRe: diagnosticSplitModalSumRe,
        splitCoherenceModalSumIm: diagnosticSplitModalSumIm,
        splitCoherenceModalEnergySq: diagnosticSplitModalEnergySq,
        _debugStrongestMode,
        _debugModalContributors,
        _debugActiveModalVectorBreakdown,
      } = legacyModalTransferLocal(
        frequencyHz, modes, source, seat, { widthM, lengthM, heightM }, widthM, lengthM, heightM, modalSourceAmplitude1m, modalStorageMode, pureDeterministicModalSum, disableModalPropagationPhase, mute68HzAxialMode, propagationPhaseScale, source.tuning.delayMs, source.tuning.polarity,
        Number.isFinite(Number(options?.debugMode200Multiplier)) ? Number(options.debugMode200Multiplier) : 1.0 // __TEMP_REW_PARITY_MODE_200_SCALE__
      );

      if (_debugActiveModalVectorBreakdown) {
        activeModalContributorDebugSeries.push(_debugActiveModalVectorBreakdown);
      }

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

      // Modal cap removed from active REW parity path.
      // Clean additive modal pressure summation: modalSumRe/modalSumIm remain uncapped.
      modalSumMagnitudeBeforeCap = Math.sqrt(modalSumRe * modalSumRe + modalSumIm * modalSumIm);
      modalCapApplied = false;
      modalCapRatio = null;
      modalCapScale = null;
      modalSumMagnitudeAfterCap = modalSumMagnitudeBeforeCap;
      partialCoherencePreModalRe = prevRe;
      partialCoherencePreModalIm = prevIm;
      partialCoherenceModalSumRe = diagnosticPerturbedModalSumRe;
      partialCoherenceModalSumIm = diagnosticPerturbedModalSumIm;
      distributedCoherenceModalSumRe = diagnosticModalSumRe;
      distributedCoherenceModalSumIm = diagnosticModalSumIm;
      splitCoherenceModalSumRe = diagnosticSplitModalSumRe;
      splitCoherenceModalSumIm = diagnosticSplitModalSumIm;
      splitCoherenceModalEnergySq = diagnosticSplitModalEnergySq;
      const splitCoherencePressureRe = prevRe + diagnosticSplitModalSumRe;
      const splitCoherencePressureIm = prevIm + diagnosticSplitModalSumIm;
      const splitCoherencePressureMagSq =
        (splitCoherencePressureRe * splitCoherencePressureRe) +
        (splitCoherencePressureIm * splitCoherencePressureIm);
      const splitCoherenceFinalMag = Math.sqrt(splitCoherencePressureMagSq + diagnosticSplitModalEnergySq);
      splitCoherenceDiagnostic = {
        label: 'Per-mode split modal coherence diagnostic — not used for scoring',
        frequencyHz,
        coherentFraction: PER_MODE_SPLIT_COHERENT_FRACTION,
        preModalRe: prevRe,
        preModalIm: prevIm,
        splitCoherenceModalSumRe: diagnosticSplitModalSumRe,
        splitCoherenceModalSumIm: diagnosticSplitModalSumIm,
        splitCoherenceModalEnergySq: diagnosticSplitModalEnergySq,
        splitCoherencePressureRe,
        splitCoherencePressureIm,
        splitCoherencePressureMagSq,
        splitCoherenceFinalMag,
        splitCoherenceFinalDb: 20 * Math.log10(Math.max(splitCoherenceFinalMag, 1e-10)),
      };
      const distributedCoherenceFinalRe = prevRe + diagnosticModalSumRe;
      const distributedCoherenceFinalIm = prevIm + diagnosticModalSumIm;
      const distributedCoherenceFinalMag = Math.sqrt(
        distributedCoherenceFinalRe * distributedCoherenceFinalRe +
        distributedCoherenceFinalIm * distributedCoherenceFinalIm
      );
      distributedCoherenceDiagnostic = {
        label: 'Distributed modal coherence diagnostic — not used for scoring',
        frequencyHz,
        preModalRe: prevRe,
        preModalIm: prevIm,
        distributedCoherenceModalSumRe: diagnosticModalSumRe,
        distributedCoherenceModalSumIm: diagnosticModalSumIm,
        distributedCoherenceFinalRe,
        distributedCoherenceFinalIm,
        distributedCoherenceFinalMag,
        distributedCoherenceFinalDb: 20 * Math.log10(Math.max(distributedCoherenceFinalMag, 1e-10)),
      };

      // __TEMP_DIAGNOSTIC__: Zero modal contribution when debugDisableModalContribution is true.
      // This proves whether the modal layer is masking polarity/delay. Do not remove modal code.
      if (options?.debugDisableModalContribution === true) {
        modalSumRe = 0;
        modalSumIm = 0;
      }

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
          partialCoherenceDiagnostic = buildPartialCoherenceDiagnostic({
            frequencyHz,
            preModalRe: prevRe,
            preModalIm: prevIm,
            modalSumRe: diagnosticPerturbedModalSumRe,
            modalSumIm: diagnosticPerturbedModalSumIm,
            coherentFinalMag: postMag,
          });
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
                partialCoherenceDiagnostic,
                distributedCoherenceDiagnostic,
                splitCoherenceDiagnostic,
                modalCapApplied,
                modalCapRatio,
                modalCapScale,
                modalSumMagnitudeBeforeCap,
                modalSumMagnitudeAfterCap,
                preModalMagnitude,
                pureDeterministicModalSum,
                activeModalPerturbationEnabled: !pureDeterministicModalSum,
                disableModalPropagationPhase,
                mute68HzAxialMode,
                axialQ,
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
                pureDeterministicModalSum,
                activeModalPerturbationEnabled: !pureDeterministicModalSum,
                disableModalPropagationPhase,
                mute68HzAxialMode,
                axialQ,
                livePostRe: sumRe,
                livePostIm: sumIm,
                livePostMag: Math.sqrt(sumRe * sumRe + sumIm * sumIm),
                partialCoherenceDiagnostic,
                distributedCoherenceDiagnostic,
                splitCoherenceDiagnostic,
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
    if (enableModes && !partialCoherenceDiagnostic) {
      partialCoherenceDiagnostic = buildPartialCoherenceDiagnostic({
        frequencyHz,
        preModalRe: partialCoherencePreModalRe,
        preModalIm: partialCoherencePreModalIm,
        modalSumRe: partialCoherenceModalSumRe,
        modalSumIm: partialCoherenceModalSumIm,
        coherentFinalMag: postModalMagnitude,
      });
    }
    if (enableModes && !splitCoherenceDiagnostic) {
      const splitCoherencePressureRe = partialCoherencePreModalRe + splitCoherenceModalSumRe;
      const splitCoherencePressureIm = partialCoherencePreModalIm + splitCoherenceModalSumIm;
      const splitCoherencePressureMagSq =
        (splitCoherencePressureRe * splitCoherencePressureRe) +
        (splitCoherencePressureIm * splitCoherencePressureIm);
      const splitCoherenceFinalMag = Math.sqrt(splitCoherencePressureMagSq + splitCoherenceModalEnergySq);
      splitCoherenceDiagnostic = {
        label: 'Per-mode split modal coherence diagnostic — not used for scoring',
        frequencyHz,
        coherentFraction: PER_MODE_SPLIT_COHERENT_FRACTION,
        preModalRe: partialCoherencePreModalRe,
        preModalIm: partialCoherencePreModalIm,
        splitCoherenceModalSumRe,
        splitCoherenceModalSumIm,
        splitCoherenceModalEnergySq,
        splitCoherencePressureRe,
        splitCoherencePressureIm,
        splitCoherencePressureMagSq,
        splitCoherenceFinalMag,
        splitCoherenceFinalDb: 20 * Math.log10(Math.max(splitCoherenceFinalMag, 1e-10)),
      };
    }
    if (enableModes && !distributedCoherenceDiagnostic) {
      const distributedCoherenceFinalRe = partialCoherencePreModalRe + distributedCoherenceModalSumRe;
      const distributedCoherenceFinalIm = partialCoherencePreModalIm + distributedCoherenceModalSumIm;
      const distributedCoherenceFinalMag = Math.sqrt(
        distributedCoherenceFinalRe * distributedCoherenceFinalRe +
        distributedCoherenceFinalIm * distributedCoherenceFinalIm
      );
      distributedCoherenceDiagnostic = {
        label: 'Distributed modal coherence diagnostic — not used for scoring',
        frequencyHz,
        preModalRe: partialCoherencePreModalRe,
        preModalIm: partialCoherencePreModalIm,
        distributedCoherenceModalSumRe,
        distributedCoherenceModalSumIm,
        distributedCoherenceFinalRe,
        distributedCoherenceFinalIm,
        distributedCoherenceFinalMag,
        distributedCoherenceFinalDb: 20 * Math.log10(Math.max(distributedCoherenceFinalMag, 1e-10)),
      };
    }

    preModalSeries.push({
      frequencyHz,
      magnitude: preModalMagnitude,
      splDb: 20 * Math.log10(Math.max(preModalMagnitude, 1e-10)),
    });
    modalOnlySeries.push({
      frequencyHz,
      magnitude: modalSumMagnitude ?? 0,
      splDb: 20 * Math.log10(Math.max(modalSumMagnitude ?? 0, 1e-10)),
      diagnosticLabel: 'modalOnlySeries_uses_uncapped_additive_modal_magnitude',
    });
    postModalSeries.push({
      frequencyHz,
      magnitude: postModalMagnitude,
      splDb: finalSplDb,
    });
    if (partialCoherenceDiagnostic) {
      partialCoherenceDiagnosticSeries.push(partialCoherenceDiagnostic);
    }
    if (distributedCoherenceDiagnostic) {
      distributedCoherenceDiagnosticSeries.push({
        ...distributedCoherenceDiagnostic,
        coherentFinalDb: finalSplDb,
        differenceVsActiveDb: distributedCoherenceDiagnostic.distributedCoherenceFinalDb - finalSplDb,
      });
    }
    if (splitCoherenceDiagnostic) {
      splitCoherenceDiagnosticSeries.push({
        ...splitCoherenceDiagnostic,
        coherentFinalDb: finalSplDb,
        differenceVsActiveDb: splitCoherenceDiagnostic.splitCoherenceFinalDb - finalSplDb,
      });
    }

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
        pureDeterministicModalSum,
        activeModalPerturbationEnabled: !pureDeterministicModalSum,
        disableModalPropagationPhase,
        mute68HzAxialMode,
        axialQ,
        partialCoherenceDiagnostic,
        distributedCoherenceDiagnostic,
        splitCoherenceDiagnostic,
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
        partialCoherenceDiagnostic: null,
        distributedCoherenceDiagnostic: null,
        splitCoherenceDiagnostic: null,
        modalGainScalar: null,
        modalSourceReferenceMode: options?.modalSourceReferenceMode || 'existing',
        modalStorageMode: options?.modalStorageMode || 'none',
        pureDeterministicModalSum,
        activeModalPerturbationEnabled: !pureDeterministicModalSum,
        disableModalPropagationPhase,
        mute68HzAxialMode,
        axialQ,
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
  wholeCurveDebugRows.partialCoherenceDiagnosticSeries = partialCoherenceDiagnosticSeries;
  wholeCurveDebugRows.distributedCoherenceDiagnosticSeries = distributedCoherenceDiagnosticSeries;
  wholeCurveDebugRows.splitCoherenceDiagnosticSeries = splitCoherenceDiagnosticSeries;
  wholeCurveDebugRows.modalContributorDebugRows = modalContributorDebugRows;
  wholeCurveDebugRows.activeModalContributorDebugSeries = activeModalContributorDebugSeries;
  wholeCurveDebugRows.diagnosticToggles = {
    disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight,
    disableLateField,
    pureDeterministicModalSum,
    activeModalPerturbationEnabled: !pureDeterministicModalSum,
    disableModalPropagationPhase,
    mute68HzAxialMode,
    axialQ,
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
    activeModalContributorDebugSeries,
    preModalSeries,
    modalOnlySeries,
    postModalSeries,
    partialCoherenceDiagnosticSeries,
    distributedCoherenceDiagnosticSeries,
    splitCoherenceDiagnosticSeries,
  };
}

export default simulateBassResponseRewCore;