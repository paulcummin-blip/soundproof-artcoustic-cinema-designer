(function() {
  "use strict";
  const SPEED_OF_SOUND_MPS$1 = 343;
  function computeRoomModesLocal({ widthM, lengthM, heightM, fMax, c = SPEED_OF_SOUND_MPS$1 }) {
    const modes = [];
    const nMax = Math.ceil(fMax / c * 2 * Math.max(widthM, lengthM, heightM)) + 5;
    for (let nx = 0; nx <= nMax; nx += 1) {
      for (let ny = 0; ny <= nMax; ny += 1) {
        for (let nz = 0; nz <= nMax; nz += 1) {
          if (nx === 0 && ny === 0 && nz === 0) continue;
          const freq = c / 2 * Math.sqrt(
            Math.pow(nx / widthM, 2) + Math.pow(ny / lengthM, 2) + Math.pow(nz / heightM, 2)
          );
          if (!Number.isFinite(freq) || freq <= 0 || freq > fMax) continue;
          const activeAxes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
          let type = "oblique";
          if (activeAxes === 1) type = "axial";
          else if (activeAxes === 2) type = "tangential";
          modes.push({ nx, ny, nz, freq, type });
        }
      }
    }
    return modes.sort((a, b) => a.freq - b.freq);
  }
  function estimateModeQLocal({ roomDims, surfaceAbsorption, f0, mode }) {
    const widthM = Number(roomDims == null ? void 0 : roomDims.widthM) || 1;
    const lengthM = Number(roomDims == null ? void 0 : roomDims.lengthM) || 1;
    const heightM = Number(roomDims == null ? void 0 : roomDims.heightM) || 1;
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
    const nx = (mode == null ? void 0 : mode.nx) ?? -1;
    const ny = (mode == null ? void 0 : mode.ny) ?? -1;
    const nz = (mode == null ? void 0 : mode.nz) ?? -1;
    const hasX = nx > 0;
    const hasY = ny > 0;
    const hasZ = nz > 0;
    if (nx < 0) {
      const absorptionArea = sFloorCeil * aFloor + sFloorCeil * aCeiling + sFrontBack * aFront + sFrontBack * aBack + sLeftRight * aLeft + sLeftRight * aRight;
      const rt602 = 0.161 * volume / Math.max(absorptionArea, 1e-6);
      const tau2 = rt602 / 13.815;
      const qSabine2 = 2 * Math.PI * f0 * tau2;
      return Math.max(1, Math.min(80, qSabine2));
    }
    const PRIMARY_WEIGHT = 0.8;
    const RESIDUAL_WEIGHT = 0.2;
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
    const weightedAbsorption = 2 * sFrontBack * aFrontBackMean * weightFrontBack + 2 * sLeftRight * aLeftRightMean * weightLeftRight + 2 * sFloorCeil * aFloorCeilMean * weightFloorCeil;
    const rt60 = 0.161 * volume / Math.max(weightedAbsorption, 1e-6);
    const tau = rt60 / 13.815;
    let qSabine = 2 * Math.PI * f0 * tau;
    return Math.max(1, Math.min(80, qSabine));
  }
  function estimateModeQBoundaryLossLocal({ roomDims, surfaceAbsorption, mode }) {
    const widthM = Math.max(1e-6, Number(roomDims == null ? void 0 : roomDims.widthM) || 0);
    const lengthM = Math.max(1e-6, Number(roomDims == null ? void 0 : roomDims.lengthM) || 0);
    const heightM = Math.max(1e-6, Number(roomDims == null ? void 0 : roomDims.heightM) || 0);
    const clampAlpha = (value) => Math.max(0, Math.min(1, Number(value) || 0));
    const sa = surfaceAbsorption || {};
    const pressureReflection = (alpha) => Math.sqrt(Math.max(1e-12, 1 - clampAlpha(alpha)));
    const pairLoss = (alphaA, alphaB) => -Math.log(Math.max(
      1e-12,
      pressureReflection(alphaA) * pressureReflection(alphaB)
    ));
    const kx = Math.max(0, Number(mode == null ? void 0 : mode.nx) || 0) * Math.PI / widthM;
    const ky = Math.max(0, Number(mode == null ? void 0 : mode.ny) || 0) * Math.PI / lengthM;
    const kz = Math.max(0, Number(mode == null ? void 0 : mode.nz) || 0) * Math.PI / heightM;
    const kSquared = kx * kx + ky * ky + kz * kz;
    if (kSquared <= 0) return 1;
    const decayTerm = Math.abs(kx) * pairLoss(sa.left ?? 0.3, sa.right ?? 0.3) / widthM + Math.abs(ky) * pairLoss(sa.front ?? 0.3, sa.back ?? 0.3) / lengthM + Math.abs(kz) * pairLoss(sa.floor ?? 0.3, sa.ceiling ?? 0.3) / heightM;
    const qBoundaryLoss = kSquared / Math.max(decayTerm, 1e-12);
    return Math.max(1, Math.min(80, qBoundaryLoss));
  }
  function modeShapeValueLocal(mode, x, y, z, roomDims) {
    const widthM = Math.max(1e-6, Number(roomDims == null ? void 0 : roomDims.widthM) || 0);
    const lengthM = Math.max(1e-6, Number(roomDims == null ? void 0 : roomDims.lengthM) || 0);
    const heightM = Math.max(1e-6, Number(roomDims == null ? void 0 : roomDims.heightM) || 0);
    const shapeX = mode.nx > 0 ? Math.cos(mode.nx * Math.PI * x / widthM) : 1;
    const shapeY = mode.ny > 0 ? Math.cos(mode.ny * Math.PI * y / lengthM) : 1;
    const shapeZ = mode.nz > 0 ? Math.cos(mode.nz * Math.PI * z / heightM) : 1;
    return shapeX * shapeY * shapeZ;
  }
  function resonantTransfer(f, f0, q) {
    const omega = 2 * Math.PI * f;
    const omega0 = 2 * Math.PI * Math.max(f0, 1e-6);
    const ratio = omega / omega0;
    const realDen = 1 - ratio * ratio;
    const imagDen = omega / (Math.max(q, 1e-6) * omega0);
    const denominatorSq = realDen * realDen + imagDen * imagDen;
    const re = realDen / denominatorSq;
    const im = -imagDen / denominatorSq;
    return {
      re,
      im,
      transferMag: Math.sqrt(re * re + im * im),
      realDen,
      imagDen,
      denominatorSq
    };
  }
  function buildFrequencyAxis(freqMinHz, freqMaxHz, pointsPerOctave) {
    const ppo = Number.isFinite(Number(pointsPerOctave)) && Number(pointsPerOctave) > 0 ? Math.round(Number(pointsPerOctave)) : 96;
    const minHz = Math.max(1, Number(freqMinHz) || 15);
    const maxHz = Math.max(minHz, Number(freqMaxHz) || 200);
    const freqsHz = [];
    const totalPoints = Math.ceil(Math.log2(maxHz / minHz) * ppo);
    for (let index = 0; index <= totalPoints; index += 1) {
      const hz = minHz * Math.pow(2, index / ppo);
      if (hz > maxHz) break;
      freqsHz.push(hz);
    }
    if (freqsHz[freqsHz.length - 1] !== maxHz) freqsHz.push(maxHz);
    return freqsHz;
  }
  function interpolateCurveDb(curvePoints, hz) {
    if (!Array.isArray(curvePoints) || curvePoints.length === 0) return 90;
    const points = curvePoints.map((point) => ({ hz: Number((point == null ? void 0 : point.hz) ?? (point == null ? void 0 : point.frequency) ?? (point == null ? void 0 : point[0])), db: Number((point == null ? void 0 : point.db) ?? (point == null ? void 0 : point.spl) ?? (point == null ? void 0 : point[1])) })).filter((point) => Number.isFinite(point.hz) && Number.isFinite(point.db)).sort((a, b) => a.hz - b.hz);
    if (points.length === 0) return 90;
    if (hz <= points[0].hz) return points[0].db;
    if (hz >= points[points.length - 1].hz) return points[points.length - 1].db;
    for (let index = 0; index < points.length - 1; index += 1) {
      const left = points[index];
      const right = points[index + 1];
      if (hz >= left.hz && hz <= right.hz) return left.db + (hz - left.hz) / (right.hz - left.hz) * (right.db - left.db);
    }
    return points[0].db;
  }
  const PHASE_CONTROL_REFERENCE_HZ = 80;
  const PHASE_CONTROL_MIN_DEG = 0;
  const PHASE_CONTROL_MAX_DEG = 175;
  function normalisePhaseControlDeg(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(PHASE_CONTROL_MIN_DEG, Math.min(PHASE_CONTROL_MAX_DEG, numeric));
  }
  function allPassPhaseRadians(frequencyHz, phaseControlDeg, referenceHz = PHASE_CONTROL_REFERENCE_HZ) {
    const frequency = Number(frequencyHz);
    const reference = Number(referenceHz);
    const phaseDeg = normalisePhaseControlDeg(phaseControlDeg);
    if (!(frequency > 0) || !(reference > 0) || phaseDeg <= 0) return 0;
    const phaseAtReferenceRad = phaseDeg * Math.PI / 180;
    const poleRadPerSecond = 2 * Math.PI * reference / Math.tan(phaseAtReferenceRad / 2);
    if (!(poleRadPerSecond > 0) || !Number.isFinite(poleRadPerSecond)) return -Math.PI;
    return -2 * Math.atan(2 * Math.PI * frequency / poleRadPerSecond);
  }
  function tuningPhaseRadians(frequencyHz, tuning = {}) {
    const delayMs = Number(tuning == null ? void 0 : tuning.delayMs);
    const delayPhase = Number.isFinite(delayMs) ? -2 * Math.PI * Number(frequencyHz) * (delayMs / 1e3) : 0;
    const polarityPhase = (tuning == null ? void 0 : tuning.polarity) < 0 || Number(tuning == null ? void 0 : tuning.polarity) === 180 ? Math.PI : 0;
    const phaseControl = allPassPhaseRadians(
      frequencyHz,
      (tuning == null ? void 0 : tuning.phaseControlDeg) ?? (tuning == null ? void 0 : tuning.phaseAdjust)
    );
    return delayPhase + polarityPhase + phaseControl;
  }
  const SPEED_OF_SOUND_MPS = 343;
  const MIN_DISTANCE_M = 0.01;
  function normalizeSubTuning(tuning) {
    const defaults = { gainDb: 0, delayMs: 0, polarity: 0, phaseControlDeg: 0 };
    if (!tuning || typeof tuning !== "object") {
      return defaults;
    }
    return {
      gainDb: Number.isFinite(Number(tuning.gainDb)) ? Number(tuning.gainDb) : 0,
      delayMs: Number.isFinite(Number(tuning.delayMs)) ? Number(tuning.delayMs) : 0,
      polarity: Number(tuning.polarity) === 180 || Number(tuning.polarity) < 0 ? 180 : 0,
      phaseControlDeg: normalisePhaseControlDeg(tuning.phaseControlDeg ?? tuning.phaseAdjust)
    };
  }
  function normalizeSurfaceAbsorption(surfaceAbsorption) {
    const defaultCoefficient = 0.3;
    const clampAbsorption = (value) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return defaultCoefficient;
      }
      return Math.max(0, Math.min(1, numericValue));
    };
    return {
      front: clampAbsorption(surfaceAbsorption == null ? void 0 : surfaceAbsorption.front),
      back: clampAbsorption(surfaceAbsorption == null ? void 0 : surfaceAbsorption.back),
      left: clampAbsorption(surfaceAbsorption == null ? void 0 : surfaceAbsorption.left),
      right: clampAbsorption(surfaceAbsorption == null ? void 0 : surfaceAbsorption.right),
      floor: clampAbsorption(surfaceAbsorption == null ? void 0 : surfaceAbsorption.floor),
      ceiling: clampAbsorption(surfaceAbsorption == null ? void 0 : surfaceAbsorption.ceiling)
    };
  }
  function estimateModeQByType(mode, axialQOverride = 4) {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const axialQ = Number.isFinite(Number(axialQOverride)) ? Number(axialQOverride) : 4;
    if (activeAxes === 1) {
      return axialQ;
    }
    if (activeAxes === 2) {
      return 3.9;
    }
    return 2.5;
  }
  function freqDependentQCap(freqHz) {
    if (freqHz < 50) return 80;
    if (freqHz < 85) return 50;
    if (freqHz < 160) return 30;
    return 20;
  }
  function smoothSoftQCap(freqHz) {
    const A = 200;
    const n = 0.52;
    const cap = A / Math.pow(Math.max(freqHz, 1), n);
    return Math.max(8, Math.min(45, cap));
  }
  function rewAbsorptionAuthorityQ(freqHz, absorptionQ, surfaceAbsorption) {
    const avgAbsorption = (((surfaceAbsorption == null ? void 0 : surfaceAbsorption.front) ?? 0.3) + ((surfaceAbsorption == null ? void 0 : surfaceAbsorption.back) ?? 0.3) + ((surfaceAbsorption == null ? void 0 : surfaceAbsorption.left) ?? 0.3) + ((surfaceAbsorption == null ? void 0 : surfaceAbsorption.right) ?? 0.3) + ((surfaceAbsorption == null ? void 0 : surfaceAbsorption.floor) ?? 0.3) + ((surfaceAbsorption == null ? void 0 : surfaceAbsorption.ceiling) ?? 0.3)) / 6;
    const rigidRoomCeilingQ = smoothSoftQCap(freqHz) * 1.6;
    const fullAbsorptionFloorQ = 1.3;
    const authorityQ = rigidRoomCeilingQ - (rigidRoomCeilingQ - fullAbsorptionFloorQ) * Math.pow(avgAbsorption, 0.85);
    return Math.max(1, Math.min(absorptionQ, authorityQ));
  }
  function rewModalBandwidthQ(freqHz, absorptionQ, bandwidthScale) {
    const softCap = smoothSoftQCap(freqHz);
    const finalQ = Math.max(1, Math.min(absorptionQ, softCap));
    const scale = Number.isFinite(Number(bandwidthScale)) ? Number(bandwidthScale) : 0.55;
    return Math.max(1, finalQ * scale);
  }
  function abCorrectedModalTransferLocal(frequencyHz, modes, source, seat, dims, modalSourceAmplitude1m, delayMs, polarity, phaseControlDeg = 0, captureContributions = false, applyModeMultiplicity = false, roomIsSealed = false) {
    const { widthM, lengthM, heightM } = dims;
    const contributions = [];
    const roomVolumeM3 = widthM * lengthM * heightM;
    const k = 2 * Math.PI * frequencyHz / SPEED_OF_SOUND_MPS;
    const tuningPhase = tuningPhaseRadians(frequencyHz, { delayMs, polarity, phaseControlDeg });
    const tuningCos = Math.cos(tuningPhase);
    const tuningSin = Math.sin(tuningPhase);
    let modalSumRe = 0;
    let modalSumIm = 0;
    const abModes = roomIsSealed ? [{ nx: 0, ny: 0, nz: 0, freq: 0, type: "zero", qValue: 1 }, ...modes] : modes;
    abModes.forEach((mode) => {
      const sourceCoupling = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });
      const receiverCoupling = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
      const combinedCoupling = sourceCoupling * receiverCoupling;
      const kr = 2 * Math.PI * mode.freq / SPEED_OF_SOUND_MPS;
      const realDen = kr * kr - k * k;
      const imagDen = k * kr / Math.max(mode.qValue, 1e-6);
      const denomSq = realDen * realDen + imagDen * imagDen;
      const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
      const modeMultiplicity = applyModeMultiplicity ? Math.pow(2, activeAxes) : 1;
      const spectralWeight = Number.isFinite(Number(mode.abSpectralWeight)) ? Math.max(0, Math.min(1, Number(mode.abSpectralWeight))) : 1;
      const gain = modalSourceAmplitude1m * combinedCoupling * modeMultiplicity * spectralWeight * (1 / roomVolumeM3);
      const contribRe = gain * (realDen / denomSq);
      const contribIm = gain * (-imagDen / denomSq);
      const tunedRe = contribRe * tuningCos - contribIm * tuningSin;
      const tunedIm = contribRe * tuningSin + contribIm * tuningCos;
      modalSumRe += tunedRe;
      modalSumIm += tunedIm;
      if (captureContributions) contributions.push({ nx: mode.nx, ny: mode.ny, nz: mode.nz, type: mode.type, f0: mode.freq, q: mode.qValue, sourceCoupling, receiverCoupling, combinedCoupling, modeMultiplicity, gain, reBeforeScale: contribRe, imBeforeScale: contribIm, tunedRe, tunedIm });
    });
    return { modalSumRe, modalSumIm, contributions };
  }
  function modalPressureContributionLocal(frequencyHz, modeFrequencyHz, qValue, combinedCoupling, modalSourceAmplitude, modeIndices, sourceX, sourceY, sourceZ, seatX, seatY, seatZ, disableModalPropagationPhase = false, propagationPhaseScale = 0.5, debugModalHSign = "normal") {
    const { re: _tfRe, im: _tfIm, realDen, imagDen, denominatorSq } = resonantTransfer(frequencyHz, modeFrequencyHz, qValue);
    const transferReal = _tfRe;
    const transferImag = debugModalHSign === "rew_test" ? +imagDen / denominatorSq : _tfIm;
    const ratio = 2 * Math.PI * frequencyHz / (2 * Math.PI * Math.max(modeFrequencyHz, 1e-6));
    const orderWeight = 1;
    const effectiveCoupling = combinedCoupling;
    const modalGain = modalSourceAmplitude * effectiveCoupling * orderWeight;
    const dx = sourceX - seatX;
    const dy = sourceY - seatY;
    const dz = sourceZ - seatZ;
    const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const propagationPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS) * propagationPhaseScale;
    const cosP = disableModalPropagationPhase ? 1 : Math.cos(propagationPhase);
    const sinP = disableModalPropagationPhase ? 0 : Math.sin(propagationPhase);
    const alignedReal = transferReal * cosP - transferImag * sinP;
    const alignedImag = transferReal * sinP + transferImag * cosP;
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
      denominatorSq
    };
  }
  const TARGET_DEBUG_FREQUENCIES = [20, 25, 30, 40, 50, 57, 60, 70, 80, 85, 100, 120, 150, 180, 200];
  const WHOLE_CURVE_DEBUG_TARGETS = [20, 25, 30, 40, 50, 57, 60, 70, 80, 85, 100, 120, 150, 180, 200];
  const MODAL_CONTRIBUTOR_DEBUG_TARGETS = [20, 25, 30, 40, 50, 57, 60, 70, 80, 85, 100, 120, 150, 180, 200];
  const PER_MODE_SPLIT_COHERENT_FRACTION = 0.7;
  function deterministicModalPhasePerturbationRad(mode, frequencyHz) {
    const stableSeed = (mode.nx + 1) * 12.9898 + (mode.ny + 1) * 78.233 + (mode.nz + 1) * 37.719 + mode.freq * 0.071 + frequencyHz * 0.013;
    const normalized = Math.sin(stableSeed) * 0.5 + 0.5;
    return (normalized - 0.5) * 0.24;
  }
  function deterministicDistributedModalCoherencePhaseRad(mode, frequencyHz) {
    const modeOrder = Math.abs(mode.nx || 0) + Math.abs(mode.ny || 0) + Math.abs(mode.nz || 0);
    const stableSeed = (mode.nx + 1) * 19.417 + (mode.ny + 1) * 43.113 + (mode.nz + 1) * 71.901 + mode.freq * 0.113 + frequencyHz * 0.029;
    const signedNoise = Math.sin(stableSeed) * Math.cos(stableSeed * 0.37);
    const orderSpread = modeOrder <= 1 ? 0.22 : modeOrder === 2 ? 0.42 : 0.58;
    const frequencySpread = 0.35 + 0.45 * Math.min(1, Math.max(0, (frequencyHz - 25) / 70));
    return signedNoise * orderSpread * frequencySpread;
  }
  function buildPartialCoherenceDiagnostic({ frequencyHz, preModalRe, preModalIm, modalSumRe, modalSumIm, coherentFinalMag }) {
    const preModalMag = Math.sqrt(preModalRe * preModalRe + preModalIm * preModalIm);
    const modalSumMag = Math.sqrt(modalSumRe * modalSumRe + modalSumIm * modalSumIm);
    const modalToPreModalCoherence = 0.65 + 0.1 * Math.sin(frequencyHz * 0.037 + 0.9);
    const coherentModalRe = modalSumRe * modalToPreModalCoherence;
    const coherentModalIm = modalSumIm * modalToPreModalCoherence;
    const incoherentModalMag = modalSumMag * Math.sqrt(Math.max(0, 1 - modalToPreModalCoherence * modalToPreModalCoherence));
    const coherentPartRe = preModalRe + coherentModalRe;
    const coherentPartIm = preModalIm + coherentModalIm;
    const coherentPartMag = Math.sqrt(coherentPartRe * coherentPartRe + coherentPartIm * coherentPartIm);
    const partialCoherenceDiagnosticMag = Math.sqrt(
      coherentPartMag * coherentPartMag + incoherentModalMag * incoherentModalMag
    );
    const coherentFinalDb = 20 * Math.log10(Math.max(coherentFinalMag, 1e-10));
    const partialCoherenceDiagnosticDb = 20 * Math.log10(Math.max(partialCoherenceDiagnosticMag, 1e-10));
    return {
      label: "diagnostic only — main simulation unchanged",
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
      energeticModalMag: incoherentModalMag
    };
  }
  function legacyModalTransferLocal(frequencyHz, modes, source, seat, roomDims, widthM, lengthM, heightM, modalSourceAmplitude, modalStorageMode = "none", pureDeterministicModalSum = false, disableModalPropagationPhase = false, mute68HzAxialMode = false, propagationPhaseScale = 0.5, delayMs = 0, polarity = 0, phaseControlDeg = 0, debugMode200Multiplier = 1, debugModalHSign = "normal", highOrderAxialScale = 1, axialFamilyScale = 1, tangentialFamilyScale = 1, obliqueFamilyScale = 1, muteModeKey = null) {
    let modalSumRe = 0;
    let modalSumIm = 0;
    let diagnosticPerturbedModalSumRe = 0;
    let diagnosticPerturbedModalSumIm = 0;
    let distributedCoherenceModalSumRe = 0;
    let distributedCoherenceModalSumIm = 0;
    let splitCoherenceModalSumRe = 0;
    let splitCoherenceModalSumIm = 0;
    let splitCoherenceModalEnergySq = 0;
    let _debugStrongestMode = null;
    let _debugStrongestMag = -1;
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
        source.x,
        source.y,
        source.z,
        seat.x,
        seat.y,
        seat.z,
        disableModalPropagationPhase,
        propagationPhaseScale,
        debugModalHSign
      );
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const isMuted68HzAxialMode = mute68HzAxialMode === true && mode.type === "axial" && Math.abs(mode.freq - 68.6) <= 0.2;
      const isMutedByKey = !!muteModeKey && mode.nx === muteModeKey.nx && mode.ny === muteModeKey.ny && mode.nz === muteModeKey.nz;
      const axialLightStorageFactor = modalStorageMode === "light" && mode.type === "axial" ? 1 + 0.06 / (1 + Math.pow((frequencyHz - mode.freq) / Math.max(mode.freq * 0.08, 1e-6), 2)) : 1;
      const storageFactor = modalStorageMode === "orderCompression" ? modeOrder === 1 ? 1 : modeOrder === 2 ? 0.45 : 0.3 : axialLightStorageFactor;
      const rawMagnitudeBeforeStorage = Math.sqrt(
        modalContrib.real * modalContrib.real + modalContrib.imag * modalContrib.imag
      );
      const tuningPhase = tuningPhaseRadians(frequencyHz, {
        delayMs,
        polarity,
        phaseControlDeg
      });
      const tuningCos = Math.cos(tuningPhase);
      const tuningSin = Math.sin(tuningPhase);
      const tunedModalContrib = {
        real: modalContrib.real * tuningCos - modalContrib.imag * tuningSin,
        imag: modalContrib.real * tuningSin + modalContrib.imag * tuningCos
      };
      const storedModalContrib = {
        real: tunedModalContrib.real * storageFactor,
        imag: tunedModalContrib.imag * storageFactor
      };
      const modalPhasePerturbationRad = deterministicModalPhasePerturbationRad(mode, frequencyHz);
      const modalPhaseCos = Math.cos(modalPhasePerturbationRad);
      const modalPhaseSin = Math.sin(modalPhasePerturbationRad);
      const perturbedStoredModalContrib = {
        real: storedModalContrib.real * modalPhaseCos - storedModalContrib.imag * modalPhaseSin,
        imag: storedModalContrib.real * modalPhaseSin + storedModalContrib.imag * modalPhaseCos
      };
      const activeStoredModalContrib = pureDeterministicModalSum ? storedModalContrib : perturbedStoredModalContrib;
      const splitModalMagSq = activeStoredModalContrib.real * activeStoredModalContrib.real + activeStoredModalContrib.imag * activeStoredModalContrib.imag;
      splitCoherenceModalSumRe += activeStoredModalContrib.real * PER_MODE_SPLIT_COHERENT_FRACTION;
      splitCoherenceModalSumIm += activeStoredModalContrib.imag * PER_MODE_SPLIT_COHERENT_FRACTION;
      splitCoherenceModalEnergySq += splitModalMagSq * (1 - PER_MODE_SPLIT_COHERENT_FRACTION * PER_MODE_SPLIT_COHERENT_FRACTION);
      const distributedPhaseRad = deterministicDistributedModalCoherencePhaseRad(mode, frequencyHz);
      const distributedPhaseCos = Math.cos(distributedPhaseRad);
      const distributedPhaseSin = Math.sin(distributedPhaseRad);
      distributedCoherenceModalSumRe += activeStoredModalContrib.real * distributedPhaseCos - activeStoredModalContrib.imag * distributedPhaseSin;
      distributedCoherenceModalSumIm += activeStoredModalContrib.real * distributedPhaseSin + activeStoredModalContrib.imag * distributedPhaseCos;
      diagnosticPerturbedModalSumRe += perturbedStoredModalContrib.real;
      diagnosticPerturbedModalSumIm += perturbedStoredModalContrib.imag;
      const activeMagnitude = Math.sqrt(
        activeStoredModalContrib.real * activeStoredModalContrib.real + activeStoredModalContrib.imag * activeStoredModalContrib.imag
      );
      const activeTransferMagnitudeAtNull = Math.sqrt(
        modalContrib.transferReal * modalContrib.transferReal + modalContrib.transferImag * modalContrib.transferImag
      );
      const estimatedResonanceMagnitude = activeTransferMagnitudeAtNull > 0 ? activeMagnitude * (mode.qValue / activeTransferMagnitudeAtNull) : null;
      if (!isMuted68HzAxialMode && !isMutedByKey) {
        const HIGH_ORDER_AXIAL_SCALE = Number.isFinite(Number(highOrderAxialScale)) ? Number(highOrderAxialScale) : 1;
        const highOrderAxialCorrectionScale = mode.type === "axial" && modeOrder >= 2 ? HIGH_ORDER_AXIAL_SCALE : 1;
        const _mode200DebugOverride = mode.nx === 2 && mode.ny === 0 && mode.nz === 0 && debugMode200Multiplier !== 1 ? debugMode200Multiplier : 1;
        const _familyScale = mode.type === "axial" ? axialFamilyScale : mode.type === "tangential" ? tangentialFamilyScale : mode.type === "oblique" ? obliqueFamilyScale : 1;
        modalSumRe += activeStoredModalContrib.real * highOrderAxialCorrectionScale * _mode200DebugOverride * _familyScale;
        modalSumIm += activeStoredModalContrib.imag * highOrderAxialCorrectionScale * _mode200DebugOverride * _familyScale;
      }
      const isInDebugRange = frequencyHz >= 18 && frequencyHz <= 205;
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
          activePhaseAngleDeg: Math.atan2(activeStoredModalContrib.imag, activeStoredModalContrib.real) * 180 / Math.PI,
          qValue: mode.qValue,
          activeTransferMagnitudeAtNull,
          modalTransferMagnitude: activeTransferMagnitudeAtNull,
          rawModalMagnitude: rawMagnitudeBeforeStorage,
          estimatedResonanceMagnitude,
          mutedFromActiveModalSum: isMuted68HzAxialMode || isMutedByKey,
          // __TEMP_DIAGNOSTIC_ADDITIVE_FIELDS__ — read-only extra fields for Live Modal Vector Build panel.
          transferReal: modalContrib.transferReal,
          transferImag: modalContrib.transferImag,
          transferPhaseDeg: Math.atan2(modalContrib.transferImag, modalContrib.transferReal) * 180 / Math.PI
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
            contributionPhaseAngleDeg: Math.atan2(perturbedStoredModalContrib.imag, perturbedStoredModalContrib.real) * 180 / Math.PI,
            modalPhasePerturbationRad,
            modalPhasePerturbationDeg: modalPhasePerturbationRad * 180 / Math.PI,
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
            muteReason: isMuted68HzAxialMode ? "Temporary REW Core Test: muted 68.6 Hz axial mode" : null
          });
        }
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
            mutedFromActiveModalSum: isMuted68HzAxialMode || isMutedByKey,
            transferRe: perturbedStoredModalContrib.real,
            transferIm: perturbedStoredModalContrib.imag
          };
        }
      }
    });
    const _debugModalContributors = contributorTargetHz !== null ? {
      targetHz: contributorTargetHz,
      frequencyHz,
      contributors: modalContributorRows.sort((a, b) => b.contributionMagnitude - a.contributionMagnitude).slice(0, 8)
    } : null;
    const contributorsInEngineOrder = [...activeModalContributorRows];
    const _debugActiveModalVectorBreakdown = {
      frequencyHz,
      modalSumRe,
      modalSumIm,
      contributors: activeModalContributorRows.sort((a, b) => b.activeMagnitude - a.activeMagnitude),
      contributorsInEngineOrder
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
      _debugActiveModalVectorBreakdown
    };
  }
  function computeModesWithQ({ widthM, lengthM, heightM, modeGenerationFMaxHz, evaluationFMaxHz, axialQ, surfaceAbsorption, enableModes, options = (
    /** @type {any} */
    {}
  ) }) {
    if (!enableModes) return [];
    return computeRoomModesLocal({
      widthM,
      lengthM,
      heightM,
      fMax: modeGenerationFMaxHz,
      c: SPEED_OF_SOUND_MPS
    }).map((mode) => {
      const baseQ = estimateModeQByType(mode, axialQ);
      const absorptionQ = estimateModeQLocal({
        roomDims: { widthM, lengthM, heightM },
        surfaceAbsorption,
        f0: mode.freq,
        mode
      });
      const boundaryLossQ = estimateModeQBoundaryLossLocal({
        roomDims: { widthM, lengthM, heightM },
        surfaceAbsorption,
        mode
      });
      const isAxialOverride = (options == null ? void 0 : options.overrideConstantAxialQ) === true && mode.type === "axial";
      const isAbsorptionAxialOverride = (options == null ? void 0 : options.overrideAbsorptionAxialQ) === true && mode.type === "axial";
      const qStrategy = (options == null ? void 0 : options.qStrategy) || "production";
      let finalQValue;
      if (isAxialOverride) {
        finalQValue = baseQ;
      } else if (isAbsorptionAxialOverride) {
        finalQValue = absorptionQ;
      } else if (qStrategy === "ab_corrected") {
        finalQValue = boundaryLossQ;
      } else if (qStrategy === "freq_dependent_cap") {
        const fdCap = freqDependentQCap(mode.freq);
        finalQValue = Math.max(1, Math.min(absorptionQ, fdCap));
      } else if (qStrategy === "smooth_soft_cap") {
        const softCap = smoothSoftQCap(mode.freq);
        finalQValue = Math.max(1, Math.min(absorptionQ, softCap));
      } else if (qStrategy === "rew_absorption_authority") {
        finalQValue = rewAbsorptionAuthorityQ(mode.freq, absorptionQ, surfaceAbsorption);
      } else if (qStrategy === "rew_modal_bandwidth") {
        finalQValue = rewModalBandwidthQ(mode.freq, absorptionQ, options == null ? void 0 : options.rewModalBandwidthScale);
      } else {
        const softCap = smoothSoftQCap(mode.freq);
        finalQValue = Math.max(1, Math.min(absorptionQ, softCap));
      }
      let abSpectralWeight = 1;
      const usesAbConvergenceWindow = qStrategy === "ab_corrected" && (options == null ? void 0 : options.abDisableSpectralConvergenceWindow) !== true && Number.isFinite(Number(evaluationFMaxHz)) && Number(modeGenerationFMaxHz) > Number(evaluationFMaxHz);
      if (usesAbConvergenceWindow && mode.freq > Number(evaluationFMaxHz)) {
        const taperSpanHz = Number(modeGenerationFMaxHz) - Number(evaluationFMaxHz);
        const taperPosition = Math.max(
          0,
          Math.min(1, (mode.freq - Number(evaluationFMaxHz)) / Math.max(taperSpanHz, 1e-6))
        );
        abSpectralWeight = 0.5 * (1 + Math.cos(Math.PI * taperPosition));
      }
      return { ...mode, qValue: finalQValue, abSpectralWeight };
    });
  }
  function prepareModeBank(roomDims, options = {}) {
    const widthM = Number(roomDims == null ? void 0 : roomDims.widthM);
    const lengthM = Number(roomDims == null ? void 0 : roomDims.lengthM);
    const heightM = Number(roomDims == null ? void 0 : roomDims.heightM);
    const enableModes = (options == null ? void 0 : options.enableModes) === true;
    const axialQOption = Number(options == null ? void 0 : options.axialQ);
    const axialQ = Number.isFinite(axialQOption) ? axialQOption : 8;
    const surfaceAbsorption = normalizeSurfaceAbsorption(options == null ? void 0 : options.surfaceAbsorption);
    const freqMaxHz = Number(options == null ? void 0 : options.freqMaxHz);
    const usesAbConvergenceWindow = (options == null ? void 0 : options.qStrategy) === "ab_corrected" && (options == null ? void 0 : options.abDisableSpectralConvergenceWindow) !== true;
    const modeGenerationFMaxHz = Number.isFinite(Number(options == null ? void 0 : options.modeGenerationFMaxHz)) ? Number(options.modeGenerationFMaxHz) : usesAbConvergenceWindow ? freqMaxHz * 3 : freqMaxHz;
    return computeModesWithQ({
      widthM,
      lengthM,
      heightM,
      modeGenerationFMaxHz,
      evaluationFMaxHz: freqMaxHz,
      axialQ,
      surfaceAbsorption,
      enableModes,
      options
    });
  }
  function simulateBassResponseRewCore(roomDims, seatPos, sub, subProductCurve, options = {}) {
    var _a;
    const widthM = Number(roomDims == null ? void 0 : roomDims.widthM);
    const lengthM = Number(roomDims == null ? void 0 : roomDims.lengthM);
    const heightM = Number(roomDims == null ? void 0 : roomDims.heightM);
    const seat = {
      x: Number(seatPos == null ? void 0 : seatPos.x),
      y: Number(seatPos == null ? void 0 : seatPos.y),
      z: Number(seatPos == null ? void 0 : seatPos.z)
    };
    const source = {
      modelKey: (sub == null ? void 0 : sub.modelKey) || "",
      x: Number(sub == null ? void 0 : sub.x),
      y: Number(sub == null ? void 0 : sub.y),
      z: Number(sub == null ? void 0 : sub.z),
      tuning: normalizeSubTuning(sub == null ? void 0 : sub.tuning)
    };
    const smoothing = (options == null ? void 0 : options.smoothing) ?? "none";
    if (smoothing !== "none") {
      throw new Error('Milestone 1b supports only smoothing: "none".');
    }
    const enableReflections = (options == null ? void 0 : options.enableReflections) === true;
    const enableModes = (options == null ? void 0 : options.enableModes) === true;
    const debugReflectionOrder = Number.isFinite(Number(options == null ? void 0 : options.debugReflectionOrder)) ? Math.round(Number(options.debugReflectionOrder)) : 1;
    const disableReflectionPhaseJitter = (options == null ? void 0 : options.disableReflectionPhaseJitter) === true;
    const disableReflectionCoherenceWeight = (options == null ? void 0 : options.disableReflectionCoherenceWeight) === true;
    const disableLateField = (options == null ? void 0 : options.disableLateField) === true;
    const pureDeterministicModalSum = (options == null ? void 0 : options.pureDeterministicModalSum) === true || typeof window !== "undefined" && ((_a = window.localStorage) == null ? void 0 : _a.getItem("rewCorePureDeterministicModalSum")) === "true";
    const rewParityModalPhase = (options == null ? void 0 : options.rewParityModalPhase) === true;
    const lfReflectionHandoffPrototype = (options == null ? void 0 : options.lfReflectionHandoffPrototype) === true;
    const usesCompleteAbRoomField = (options == null ? void 0 : options.qStrategy) === "ab_corrected" && (options == null ? void 0 : options.abUseLegacyAdditiveField) !== true;
    const isModeOnlyParity = usesCompleteAbRoomField || (options == null ? void 0 : options.rewSourceCurveMode) === "flat_rew_reference" && (options == null ? void 0 : options.rewParityFieldMode) === "full_field" || (options == null ? void 0 : options.rewParityFieldMode) === "modes_only";
    const skipLegacyModal = (options == null ? void 0 : options.qStrategy) === "ab_corrected" && isModeOnlyParity && ((options == null ? void 0 : options.modalCoherenceMode) || "coherent") === "coherent" && (options == null ? void 0 : options.legacyModalDiagnostics) !== true;
    const disableModalPropagationPhase = rewParityModalPhase ? true : (options == null ? void 0 : options.disableModalPropagationPhase) === true;
    const mute68HzAxialMode = (options == null ? void 0 : options.mute68HzAxialMode) === true;
    const propagationPhaseScaleOption = Number(options == null ? void 0 : options.propagationPhaseScale);
    const propagationPhaseScale = rewParityModalPhase ? 0 : Number.isFinite(propagationPhaseScaleOption) ? propagationPhaseScaleOption : 0.5;
    const axialQOption = Number(options == null ? void 0 : options.axialQ);
    const axialQ = Number.isFinite(axialQOption) ? axialQOption : 8;
    const surfaceAbsorption = normalizeSurfaceAbsorption(options == null ? void 0 : options.surfaceAbsorption);
    const debugModalHSign = (options == null ? void 0 : options.debugModalHSign) === "rew_test" ? "rew_test" : "normal";
    const highOrderAxialScale = Number.isFinite(Number(options == null ? void 0 : options.highOrderAxialScale)) ? Number(options.highOrderAxialScale) : 1;
    const axialFamilyScale = Number.isFinite(Number(options == null ? void 0 : options.axialFamilyScale)) ? Number(options.axialFamilyScale) : 1;
    const tangentialFamilyScale = Number.isFinite(Number(options == null ? void 0 : options.tangentialFamilyScale)) ? Number(options.tangentialFamilyScale) : 1;
    const obliqueFamilyScale = Number.isFinite(Number(options == null ? void 0 : options.obliqueFamilyScale)) ? Number(options.obliqueFamilyScale) : 1;
    const muteModeKey = (options == null ? void 0 : options.muteModeKey) && Number.isFinite(Number(options.muteModeKey.nx)) && Number.isFinite(Number(options.muteModeKey.ny)) && Number.isFinite(Number(options.muteModeKey.nz)) ? { nx: Number(options.muteModeKey.nx), ny: Number(options.muteModeKey.ny), nz: Number(options.muteModeKey.nz) } : null;
    if (!Number.isFinite(widthM) || !Number.isFinite(lengthM) || !Number.isFinite(heightM)) {
      throw new Error("roomDims must include finite widthM, lengthM, and heightM values.");
    }
    if (!Number.isFinite(seat.x) || !Number.isFinite(seat.y) || !Number.isFinite(seat.z)) {
      throw new Error("seatPos must include finite x, y, and z values.");
    }
    if (!Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(source.z)) {
      throw new Error("sub must include finite x, y, and z values.");
    }
    if (!Array.isArray(subProductCurve) || subProductCurve.length === 0) {
      throw new Error("subProductCurve must be a non-empty array of { hz, db }.");
    }
    const freqMinHz = options == null ? void 0 : options.freqMinHz;
    const freqMaxHz = options == null ? void 0 : options.freqMaxHz;
    const freqsHz = buildFrequencyAxis(freqMinHz, freqMaxHz, options == null ? void 0 : options.pointsPerOctave);
    const captureFrequencies = (options == null ? void 0 : options.runtimeVectorCapture) === true ? [20, freqsHz.reduce((best, hz) => Math.abs(hz - 34.3) < Math.abs(best - 34.3) ? hz : best, freqsHz[0])] : [];
    const runtimeVectorCapture = [];
    const schroederFrequency = 2e3 * Math.sqrt(0.4 / (widthM * lengthM * heightM));
    function buildImageSources(sx, sy, sz, W, L, H, sa, maxOrder) {
      if (maxOrder < 1) return [];
      const sources = [];
      const rMax = maxOrder;
      for (let rx = -rMax; rx <= rMax; rx++) {
        for (let ry = -rMax; ry <= rMax; ry++) {
          for (let rz = -rMax; rz <= rMax; rz++) {
            const totalOrder = Math.abs(rx) + Math.abs(ry) + Math.abs(rz);
            if (totalOrder === 0 || totalOrder > maxOrder) continue;
            const imgX = rx % 2 === 0 ? rx * W + sx : rx * W + (W - sx);
            const imgY = ry % 2 === 0 ? ry * L + sy : ry * L + (L - sy);
            const imgZ = rz % 2 === 0 ? rz * H + sz : rz * H + (H - sz);
            const absRx = Math.abs(rx);
            const absRy = Math.abs(ry);
            const absRz = Math.abs(rz);
            let rightHits, leftHits, backHits, frontHits, ceilingHits, floorHits;
            if (rx >= 0) {
              rightHits = Math.ceil(absRx / 2);
              leftHits = Math.floor(absRx / 2);
            } else {
              leftHits = Math.ceil(absRx / 2);
              rightHits = Math.floor(absRx / 2);
            }
            if (ry >= 0) {
              backHits = Math.ceil(absRy / 2);
              frontHits = Math.floor(absRy / 2);
            } else {
              frontHits = Math.ceil(absRy / 2);
              backHits = Math.floor(absRy / 2);
            }
            if (rz >= 0) {
              ceilingHits = Math.ceil(absRz / 2);
              floorHits = Math.floor(absRz / 2);
            } else {
              floorHits = Math.ceil(absRz / 2);
              ceilingHits = Math.floor(absRz / 2);
            }
            const rc = Math.pow(Math.sqrt(1 - sa.left), leftHits) * Math.pow(Math.sqrt(1 - sa.right), rightHits) * Math.pow(Math.sqrt(1 - sa.front), frontHits) * Math.pow(Math.sqrt(1 - sa.back), backHits) * Math.pow(Math.sqrt(1 - sa.floor), floorHits) * Math.pow(Math.sqrt(1 - sa.ceiling), ceilingHits);
            const boundary = rx < 0 ? "left" : rx > 0 ? "right" : ry < 0 ? "front" : ry > 0 ? "rear" : rz < 0 ? "floor" : "ceiling";
            sources.push({ x: imgX, y: imgY, z: imgZ, reflectionCoefficient: rc, order: totalOrder, boundary });
          }
        }
      }
      return sources;
    }
    const imageSources = enableReflections ? buildImageSources(
      source.x,
      source.y,
      source.z,
      widthM,
      lengthM,
      heightM,
      surfaceAbsorption,
      debugReflectionOrder
    ) : [];
    const usesAbConvergenceWindow = (options == null ? void 0 : options.qStrategy) === "ab_corrected" && (options == null ? void 0 : options.abDisableSpectralConvergenceWindow) !== true;
    const modeGenerationFMaxHz = Number.isFinite(Number(options == null ? void 0 : options.modeGenerationFMaxHz)) ? Number(options.modeGenerationFMaxHz) : usesAbConvergenceWindow ? Number(freqMaxHz) * 3 : freqMaxHz;
    const modes = Array.isArray(options == null ? void 0 : options.precomputedModes) ? options.precomputedModes : computeModesWithQ({
      widthM,
      lengthM,
      heightM,
      modeGenerationFMaxHz,
      evaluationFMaxHz: Number(freqMaxHz),
      axialQ,
      surfaceAbsorption,
      enableModes,
      options
    });
    const stepDebugRows = [];
    const wholeCurveDebugCandidates = /* @__PURE__ */ new Map();
    const modalContributorDebugCandidates = /* @__PURE__ */ new Map();
    const activeModalContributorDebugSeries = [];
    const preModalSeries = [];
    const modalOnlySeries = [];
    const postModalSeries = [];
    const partialCoherenceDiagnosticSeries = [];
    const distributedCoherenceDiagnosticSeries = [];
    const splitCoherenceDiagnosticSeries = [];
    const perFrequencyVectorDebug = [];
    const complexPressure = freqsHz.map((frequencyHz) => {
      const captureThisFrequency = captureFrequencies.includes(frequencyHz);
      const capturedReflections = [];
      const curveDb = interpolateCurveDb(subProductCurve, frequencyHz);
      let sumRe = 0;
      let sumIm = 0;
      let directRe = 0;
      let directIm = 0;
      let reflectionRe = 0;
      let reflectionIm = 0;
      let lateFieldRe = 0;
      let lateFieldIm = 0;
      const dx = source.x - seat.x;
      const dy = source.y - seat.y;
      const dz = source.z - seat.z;
      const distanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const distanceLossDb = -20 * Math.log10(distanceM / 1);
      const totalMagnitudeDb = curveDb + distanceLossDb + source.tuning.gainDb;
      const amplitude = Math.pow(10, totalMagnitudeDb / 20);
      const modalGainScalarOption = Number(options == null ? void 0 : options.modalGainScalar);
      const modalGainScalar = Number.isFinite(modalGainScalarOption) ? modalGainScalarOption : 1;
      const modalSourceReferenceMode = (options == null ? void 0 : options.modalSourceReferenceMode) || (rewParityModalPhase ? "room_volume" : "existing");
      const modalStorageMode = (options == null ? void 0 : options.modalStorageMode) || "none";
      const modalSourceAmplitudeBase = Math.pow(10, (curveDb + source.tuning.gainDb) / 20) * modalGainScalar;
      const roomVolumeM3 = widthM * lengthM * heightM;
      const modalSourceAmplitude1m = modalSourceReferenceMode === "distance_normalized" ? modalSourceAmplitudeBase * Math.pow(10, distanceLossDb / 20) : modalSourceReferenceMode === "room_volume" || modalSourceReferenceMode === "room_normalized" ? modalSourceAmplitudeBase / Math.sqrt(Math.max(roomVolumeM3, 1e-6)) : modalSourceAmplitudeBase;
      const timeOfFlightPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS);
      const delayPhase = -2 * Math.PI * frequencyHz * (source.tuning.delayMs / 1e3);
      const polarityPhase = source.tuning.polarity === 180 ? Math.PI : 0;
      const phaseControlPhase = allPassPhaseRadians(frequencyHz, source.tuning.phaseControlDeg);
      const sourceTuningPhase = delayPhase + polarityPhase + phaseControlPhase;
      const totalPhase = timeOfFlightPhase + sourceTuningPhase;
      directRe = amplitude * Math.cos(totalPhase);
      directIm = amplitude * Math.sin(totalPhase);
      if (!isModeOnlyParity) {
        sumRe += directRe;
        sumIm += directIm;
      }
      const reflectionHandoffScale = lfReflectionHandoffPrototype ? Math.max(0, Math.min(1, (frequencyHz - schroederFrequency) / 40)) : 1;
      imageSources.forEach((imageSource, reflectionIndex) => {
        const imageDx = imageSource.x - seat.x;
        const imageDy = imageSource.y - seat.y;
        const imageDz = imageSource.z - seat.z;
        const imageDistanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(imageDx * imageDx + imageDy * imageDy + imageDz * imageDz));
        const imageDistanceLossDb = -20 * Math.log10(imageDistanceM / 1);
        const imageMagnitudeDb = curveDb + imageDistanceLossDb + source.tuning.gainDb;
        let imageAmplitude = Math.pow(10, imageMagnitudeDb / 20) * imageSource.reflectionCoefficient;
        const reflectionGainScale = Number.isFinite(Number(options == null ? void 0 : options.reflectionGainScale)) ? Number(options.reflectionGainScale) : 1;
        if (reflectionGainScale !== 1) imageAmplitude *= reflectionGainScale;
        const imageTimeOfFlightPhase = -2 * Math.PI * frequencyHz * (imageDistanceM / SPEED_OF_SOUND_MPS);
        const imageTotalPhase = imageTimeOfFlightPhase + sourceTuningPhase;
        const reflectionCoherenceWeight = disableReflectionCoherenceWeight ? 1 : Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (frequencyHz - 20) / 140))));
        const imageRe = reflectionCoherenceWeight * imageAmplitude * Math.cos(imageTotalPhase) * reflectionHandoffScale;
        const imageIm = reflectionCoherenceWeight * imageAmplitude * Math.sin(imageTotalPhase) * reflectionHandoffScale;
        reflectionRe += imageRe;
        reflectionIm += imageIm;
        if (captureThisFrequency) capturedReflections.push({ boundary: imageSource.boundary, x: imageSource.x, y: imageSource.y, z: imageSource.z, distanceM: imageDistanceM, reflectionCoefficient: imageSource.reflectionCoefficient, coherenceWeight: reflectionCoherenceWeight, phase: imageTotalPhase, re: imageRe, im: imageIm });
        if (!rewParityModalPhase && !isModeOnlyParity) {
          sumRe += imageRe;
          sumIm += imageIm;
        }
      });
      const lateFieldDecay = Math.exp(-(frequencyHz - 20) / 120);
      const lateFieldAmplitude = disableLateField || frequencyHz < schroederFrequency ? 0 : amplitude * 0.12 * lateFieldDecay;
      const lateFieldPhase = 2 * Math.PI * frequencyHz * 71e-4 + 1.3 + sourceTuningPhase;
      lateFieldRe = disableLateField || frequencyHz < schroederFrequency ? 0 : lateFieldAmplitude * Math.cos(lateFieldPhase);
      lateFieldIm = disableLateField || frequencyHz < schroederFrequency ? 0 : lateFieldAmplitude * Math.sin(lateFieldPhase);
      if (!rewParityModalPhase && !isModeOnlyParity) {
        sumRe += lateFieldRe;
        sumIm += lateFieldIm;
      }
      const preModalMagnitude = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
      if (frequencyHz >= 30 && frequencyHz <= 88) {
        let _refSumRe = 0;
        let _refSumIm = 0;
        imageSources.forEach((imageSource, reflectionIndex) => {
          const imageDx = imageSource.x - seat.x;
          const imageDy = imageSource.y - seat.y;
          const imageDz = imageSource.z - seat.z;
          const imageDistanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(imageDx * imageDx + imageDy * imageDy + imageDz * imageDz));
          const imageDistanceLossDb = -20 * Math.log10(imageDistanceM / 1);
          const imageMagnitudeDb = curveDb + imageDistanceLossDb + source.tuning.gainDb;
          let imageAmplitude = Math.pow(10, imageMagnitudeDb / 20) * imageSource.reflectionCoefficient;
          const reflectionGainScale = Number.isFinite(Number(options == null ? void 0 : options.reflectionGainScale)) ? Number(options.reflectionGainScale) : 1;
          if (reflectionGainScale !== 1) imageAmplitude *= reflectionGainScale;
          const imageTimeOfFlightPhase = -2 * Math.PI * frequencyHz * (imageDistanceM / SPEED_OF_SOUND_MPS);
          const imageTotalPhase = imageTimeOfFlightPhase + sourceTuningPhase;
          const debugCoherenceWeight = disableReflectionCoherenceWeight ? 1 : Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (frequencyHz - 20) / 140))));
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
            im: amplitude * Math.sin(totalPhase)
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
          modalTransferImFinal: null
        });
      }
      let modalSumMagnitude = null;
      let _debugStrongestModeForRow = null;
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
      let _finalModalSumRe = 0;
      let _finalModalSumIm = 0;
      let abCapture = null;
      let abSqrtVScale = null;
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
          _debugActiveModalVectorBreakdown
        } = skipLegacyModal ? { modalSumRe: 0, modalSumIm: 0, diagnosticPerturbedModalSumRe: 0, diagnosticPerturbedModalSumIm: 0, distributedCoherenceModalSumRe: 0, distributedCoherenceModalSumIm: 0, splitCoherenceModalSumRe: 0, splitCoherenceModalSumIm: 0, splitCoherenceModalEnergySq: 0, _debugStrongestMode: null, _debugModalContributors: null, _debugActiveModalVectorBreakdown: null } : legacyModalTransferLocal(
          frequencyHz,
          modes,
          source,
          seat,
          {},
          widthM,
          lengthM,
          heightM,
          modalSourceAmplitude1m,
          modalStorageMode,
          pureDeterministicModalSum,
          disableModalPropagationPhase,
          mute68HzAxialMode,
          propagationPhaseScale,
          source.tuning.delayMs,
          source.tuning.polarity,
          source.tuning.phaseControlDeg,
          Number.isFinite(Number(options == null ? void 0 : options.debugMode200Multiplier)) ? Number(options.debugMode200Multiplier) : 1,
          // __TEMP_REW_PARITY_MODE_200_SCALE__
          debugModalHSign,
          // __TEMP_DIAGNOSTIC_MODAL_H_SIGN__
          highOrderAxialScale,
          // __TEMP_REW_PARITY_HIGH_ORDER_AXIAL_SCALE__
          axialFamilyScale,
          tangentialFamilyScale,
          obliqueFamilyScale,
          // __TEMP_DIAGNOSTIC_FAMILY_SCALES__
          muteModeKey
          // __TEMP_DIAGNOSTIC_MUTE_MODE_KEY__
        );
        if ((options == null ? void 0 : options.qStrategy) === "ab_corrected") {
          const abSourceUnit = Math.pow(10, (curveDb + source.tuning.gainDb) / 20);
          const requestedGlobalQScale = Number(options == null ? void 0 : options.abGlobalQScale);
          const abGlobalQScale = Number.isFinite(requestedGlobalQScale) ? Math.max(0.25, Math.min(4, requestedGlobalQScale)) : 1;
          const requestedMidbandQScale = Number(options == null ? void 0 : options.abMidbandQScale);
          const abMidbandQScale = Number.isFinite(requestedMidbandQScale) ? Math.max(0.25, Math.min(4, requestedMidbandQScale)) : 1;
          const abModes = modes.map((mode) => {
            const inMidBand = mode.freq >= 70 && mode.freq <= 120;
            const qScale = abGlobalQScale * (inMidBand ? abMidbandQScale : 1);
            if (qScale === 1) return mode;
            return { ...mode, qValue: mode.qValue * qScale };
          });
          const abResult = abCorrectedModalTransferLocal(
            frequencyHz,
            abModes,
            source,
            seat,
            { widthM, lengthM, heightM },
            abSourceUnit,
            source.tuning.delayMs,
            source.tuning.polarity,
            source.tuning.phaseControlDeg,
            captureThisFrequency,
            (options == null ? void 0 : options.abApplyModeMultiplicity) !== false,
            (options == null ? void 0 : options.roomIsSealed) !== false
          );
          abSqrtVScale = Math.sqrt(Math.max(roomVolumeM3, 1e-6));
          modalSumRe = abResult.modalSumRe * abSqrtVScale;
          modalSumIm = abResult.modalSumIm * abSqrtVScale;
          if (captureThisFrequency) abCapture = abResult.contributions.map((item) => ({ ...item, reAfterScale: item.tunedRe * abSqrtVScale, imAfterScale: item.tunedIm * abSqrtVScale }));
        }
        _debugStrongestModeForRow = _debugStrongestMode ?? null;
        if (_debugActiveModalVectorBreakdown) {
          activeModalContributorDebugSeries.push(_debugActiveModalVectorBreakdown);
        }
        if (_debugModalContributors) {
          const existingContributor = modalContributorDebugCandidates.get(_debugModalContributors.targetHz);
          const distanceFromTarget = Math.abs(_debugModalContributors.frequencyHz - _debugModalContributors.targetHz);
          if (!existingContributor || existingContributor.distanceFromTarget > distanceFromTarget) {
            modalContributorDebugCandidates.set(_debugModalContributors.targetHz, {
              ..._debugModalContributors,
              distanceFromTarget
            });
          }
        }
        const prevRe = sumRe;
        const prevIm = sumIm;
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
        const splitCoherencePressureMagSq = splitCoherencePressureRe * splitCoherencePressureRe + splitCoherencePressureIm * splitCoherencePressureIm;
        const splitCoherenceFinalMag = Math.sqrt(splitCoherencePressureMagSq + diagnosticSplitModalEnergySq);
        splitCoherenceDiagnostic = {
          label: "Per-mode split modal coherence diagnostic — not used for scoring",
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
          splitCoherenceFinalDb: 20 * Math.log10(Math.max(splitCoherenceFinalMag, 1e-10))
        };
        const distributedCoherenceFinalRe = prevRe + diagnosticModalSumRe;
        const distributedCoherenceFinalIm = prevIm + diagnosticModalSumIm;
        const distributedCoherenceFinalMag = Math.sqrt(
          distributedCoherenceFinalRe * distributedCoherenceFinalRe + distributedCoherenceFinalIm * distributedCoherenceFinalIm
        );
        distributedCoherenceDiagnostic = {
          label: "Distributed modal coherence diagnostic — not used for scoring",
          frequencyHz,
          preModalRe: prevRe,
          preModalIm: prevIm,
          distributedCoherenceModalSumRe: diagnosticModalSumRe,
          distributedCoherenceModalSumIm: diagnosticModalSumIm,
          distributedCoherenceFinalRe,
          distributedCoherenceFinalIm,
          distributedCoherenceFinalMag,
          distributedCoherenceFinalDb: 20 * Math.log10(Math.max(distributedCoherenceFinalMag, 1e-10))
        };
        if ((options == null ? void 0 : options.debugDisableModalContribution) === true) {
          modalSumRe = 0;
          modalSumIm = 0;
        }
        if ((options == null ? void 0 : options.debugInvertModalVector) === true) {
          modalSumRe *= -1;
          modalSumIm *= -1;
        }
        {
          const _conv = options == null ? void 0 : options.debugModalPhaseConvention;
          if (_conv === "invert") {
            modalSumRe *= -1;
            modalSumIm *= -1;
          } else if (_conv === "conjugate") {
            modalSumIm *= -1;
          } else if (_conv === "negative_conjugate") {
            modalSumRe *= -1;
          }
        }
        const _rewParityModalMagnitudeScale = Number.isFinite(Number(options == null ? void 0 : options.rewParityModalMagnitudeScale)) ? Number(options.rewParityModalMagnitudeScale) : 1;
        if (_rewParityModalMagnitudeScale !== 1) {
          modalSumRe *= _rewParityModalMagnitudeScale;
          modalSumIm *= _rewParityModalMagnitudeScale;
        }
        const _modalCoherenceMode = (options == null ? void 0 : options.modalCoherenceMode) || "coherent";
        if (_modalCoherenceMode === "distributed") {
          sumRe = prevRe + diagnosticModalSumRe;
          sumIm = prevIm + diagnosticModalSumIm;
          _finalModalSumRe = diagnosticModalSumRe;
          _finalModalSumIm = diagnosticModalSumIm;
        } else {
          sumRe = prevRe + modalSumRe;
          sumIm = prevIm + modalSumIm;
          _finalModalSumRe = modalSumRe;
          _finalModalSumIm = modalSumIm;
        }
        const modalTransferRe = null;
        const modalTransferIm = null;
        modalSumMagnitude = modalSumMagnitudeAfterCap;
        if (stepDebugRows.length > 0) {
          const nearestRow = stepDebugRows.reduce((bestRow, row) => {
            if (!bestRow) return row;
            return Math.abs(row.frequencyHz - frequencyHz) < Math.abs(bestRow.frequencyHz - frequencyHz) ? row : bestRow;
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
              coherentFinalMag: postMag
            });
            _debugStrongestMode ? Math.sqrt(
              (_debugStrongestMode.transferRe || 0) * (_debugStrongestMode.transferRe || 0) + (_debugStrongestMode.transferIm || 0) * (_debugStrongestMode.transferIm || 0)
            ) : null;
            if (TARGET_DEBUG_FREQUENCIES.some((targetHz) => Math.abs(nearestRow.frequencyHz - targetHz) < 0.75)) {
              nearestRow.targetVectorDebug = {
                frequencyHz: nearestRow.frequencyHz,
                summedBeforeModes: {
                  sumRe: prevRe,
                  sumIm: prevIm,
                  preModalMagnitude: Math.sqrt(prevRe * prevRe + prevIm * prevIm)
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
                  axialQ
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
                  strongestModeMag: _debugStrongestMode ? Math.sqrt(
                    _debugStrongestMode.transferRe * _debugStrongestMode.transferRe + _debugStrongestMode.transferIm * _debugStrongestMode.transferIm
                  ) : null,
                  preModalComponents: {
                    direct: {
                      re: directRe,
                      im: directIm,
                      magnitude: Math.sqrt(directRe * directRe + directIm * directIm)
                    },
                    reflections: {
                      re: reflectionRe,
                      im: reflectionIm,
                      magnitude: Math.sqrt(reflectionRe * reflectionRe + reflectionIm * reflectionIm)
                    },
                    lateField: {
                      re: lateFieldRe,
                      im: lateFieldIm,
                      magnitude: Math.sqrt(lateFieldRe * lateFieldRe + lateFieldIm * lateFieldIm)
                    }
                  }
                },
                strongestMode: _debugStrongestMode ? {
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
                    _debugStrongestMode.transferRe * _debugStrongestMode.transferRe + _debugStrongestMode.transferIm * _debugStrongestMode.transferIm
                  )
                } : null
              };
            }
          }
        }
      }
      const _coherenceMode = (options == null ? void 0 : options.modalCoherenceMode) || "coherent";
      let postModalMagnitude;
      if (_coherenceMode === "split" && splitCoherenceDiagnostic) {
        postModalMagnitude = splitCoherenceDiagnostic.splitCoherenceFinalMag;
      } else {
        postModalMagnitude = Math.hypot(sumRe, sumIm);
      }
      const finalSplDb = 20 * Math.log10(postModalMagnitude);
      if (captureThisFrequency) runtimeVectorCapture.push({
        frequencyHz,
        source: { modelKey: source.modelKey, x: source.x, y: source.y, z: source.z },
        receiver: seat,
        direct: { curveDb, distanceM, distanceLossDb, userGainDb: source.tuning.gainDb, amplitude, timeOfFlightPhase, delayPhase, polarityPhase, directRe, directIm, directMagnitude: Math.hypot(directRe, directIm), directSplDb: 20 * Math.log10(Math.max(Math.hypot(directRe, directIm), 1e-10)) },
        reflections: capturedReflections,
        reflectionRe,
        reflectionIm,
        directPlusReflectionRe: directRe + reflectionRe,
        directPlusReflectionIm: directIm + reflectionIm,
        directPlusReflectionMagnitude: Math.hypot(directRe + reflectionRe, directIm + reflectionIm),
        directPlusReflectionSplDb: 20 * Math.log10(Math.max(Math.hypot(directRe + reflectionRe, directIm + reflectionIm), 1e-10)),
        preModalRe: partialCoherencePreModalRe,
        preModalIm: partialCoherencePreModalIm,
        preModalMagnitude,
        preModalSplDb: 20 * Math.log10(Math.max(preModalMagnitude, 1e-10)),
        abSqrtVScale,
        modes: abCapture || [],
        modalRe: _finalModalSumRe,
        modalIm: _finalModalSumIm,
        modalMagnitude: Math.hypot(_finalModalSumRe, _finalModalSumIm),
        modalSplEquivalentDb: 20 * Math.log10(Math.max(Math.hypot(_finalModalSumRe, _finalModalSumIm), 1e-10)),
        finalRe: sumRe,
        finalIm: sumIm,
        finalMagnitude: postModalMagnitude,
        finalSplDb
      });
      if (enableModes && !partialCoherenceDiagnostic) {
        partialCoherenceDiagnostic = buildPartialCoherenceDiagnostic({
          frequencyHz,
          preModalRe: partialCoherencePreModalRe,
          preModalIm: partialCoherencePreModalIm,
          modalSumRe: partialCoherenceModalSumRe,
          modalSumIm: partialCoherenceModalSumIm,
          coherentFinalMag: postModalMagnitude
        });
      }
      if (enableModes && !splitCoherenceDiagnostic) {
        const splitCoherencePressureRe = partialCoherencePreModalRe + splitCoherenceModalSumRe;
        const splitCoherencePressureIm = partialCoherencePreModalIm + splitCoherenceModalSumIm;
        const splitCoherencePressureMagSq = splitCoherencePressureRe * splitCoherencePressureRe + splitCoherencePressureIm * splitCoherencePressureIm;
        const splitCoherenceFinalMag = Math.sqrt(splitCoherencePressureMagSq + splitCoherenceModalEnergySq);
        splitCoherenceDiagnostic = {
          label: "Per-mode split modal coherence diagnostic — not used for scoring",
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
          splitCoherenceFinalDb: 20 * Math.log10(Math.max(splitCoherenceFinalMag, 1e-10))
        };
      }
      if (enableModes && !distributedCoherenceDiagnostic) {
        const distributedCoherenceFinalRe = partialCoherencePreModalRe + distributedCoherenceModalSumRe;
        const distributedCoherenceFinalIm = partialCoherencePreModalIm + distributedCoherenceModalSumIm;
        const distributedCoherenceFinalMag = Math.sqrt(
          distributedCoherenceFinalRe * distributedCoherenceFinalRe + distributedCoherenceFinalIm * distributedCoherenceFinalIm
        );
        distributedCoherenceDiagnostic = {
          label: "Distributed modal coherence diagnostic — not used for scoring",
          frequencyHz,
          preModalRe: partialCoherencePreModalRe,
          preModalIm: partialCoherencePreModalIm,
          distributedCoherenceModalSumRe,
          distributedCoherenceModalSumIm,
          distributedCoherenceFinalRe,
          distributedCoherenceFinalIm,
          distributedCoherenceFinalMag,
          distributedCoherenceFinalDb: 20 * Math.log10(Math.max(distributedCoherenceFinalMag, 1e-10))
        };
      }
      preModalSeries.push({
        frequencyHz,
        magnitude: preModalMagnitude,
        splDb: 20 * Math.log10(Math.max(preModalMagnitude, 1e-10))
      });
      modalOnlySeries.push({
        frequencyHz,
        magnitude: modalSumMagnitude ?? 0,
        splDb: 20 * Math.log10(Math.max(modalSumMagnitude ?? 0, 1e-10)),
        diagnosticLabel: "modalOnlySeries_uses_uncapped_additive_modal_magnitude"
      });
      postModalSeries.push({
        frequencyHz,
        magnitude: postModalMagnitude,
        splDb: finalSplDb
      });
      if (partialCoherenceDiagnostic) {
        partialCoherenceDiagnosticSeries.push(partialCoherenceDiagnostic);
      }
      if (distributedCoherenceDiagnostic) {
        distributedCoherenceDiagnosticSeries.push({
          ...distributedCoherenceDiagnostic,
          coherentFinalDb: finalSplDb,
          differenceVsActiveDb: distributedCoherenceDiagnostic.distributedCoherenceFinalDb - finalSplDb
        });
      }
      if (splitCoherenceDiagnostic) {
        splitCoherenceDiagnosticSeries.push({
          ...splitCoherenceDiagnostic,
          coherentFinalDb: finalSplDb,
          differenceVsActiveDb: splitCoherenceDiagnostic.splitCoherenceFinalDb - finalSplDb
        });
      }
      WHOLE_CURVE_DEBUG_TARGETS.forEach((targetHz) => {
        const distanceFromTarget = Math.abs(frequencyHz - targetHz);
        if (distanceFromTarget > 1) return;
        const existing = wholeCurveDebugCandidates.get(targetHz);
        if (existing && existing.distanceFromTarget <= distanceFromTarget) return;
        const _topModeLabel = (() => {
          if (!enableModes) return null;
          const sm = _debugStrongestModeForRow;
          if (!sm) return null;
          const indices = `(${sm.nx},${sm.ny},${sm.nz})`;
          const freqStr = Number.isFinite(sm.freq) ? sm.freq.toFixed(1) : "?";
          return `${indices} ${sm.type ?? ""} @ ${freqStr} Hz`;
        })();
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
          topMode: _topModeLabel
        });
      });
      perFrequencyVectorDebug.push({
        frequencyHz,
        directRe,
        directIm,
        reflectionRe,
        reflectionIm,
        modalSumRe: _finalModalSumRe,
        modalSumIm: _finalModalSumIm,
        finalRe: sumRe,
        finalIm: sumIm
      });
      return { re: sumRe, im: sumIm };
    });
    const splDbRaw = complexPressure.map(({ re, im }) => {
      const magnitude = Math.hypot(re, im);
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
          modalSourceReferenceMode: (options == null ? void 0 : options.modalSourceReferenceMode) || "existing",
          modalStorageMode: (options == null ? void 0 : options.modalStorageMode) || "none",
          pureDeterministicModalSum,
          activeModalPerturbationEnabled: !pureDeterministicModalSum,
          disableModalPropagationPhase,
          mute68HzAxialMode,
          axialQ
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
      axialQ
    };
    const activeModalVectorPath = skipLegacyModal ? "ab_corrected production path (legacy skipped)" : pureDeterministicModalSum ? "storedModalContrib clean path" : "perturbedStoredModalContrib diagnostic path";
    return {
      freqsHz,
      splDbRaw,
      complexPressure,
      activeModalVectorPath,
      stepDebug: stepDebugRows.map((row) => row.targetVectorDebug).filter(Boolean),
      wholeCurveDebugRows,
      modalContributorDebugRows,
      activeModalContributorDebugSeries,
      preModalSeries,
      modalOnlySeries,
      postModalSeries,
      partialCoherenceDiagnosticSeries,
      distributedCoherenceDiagnosticSeries,
      splitCoherenceDiagnosticSeries,
      perFrequencyVectorDebug,
      runtimeVectorCapture
    };
  }
  const FINGERPRINT_VERSION = 8;
  function num(v, decimals = 6) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
  }
  function stableStringify(value) {
    if (value === null || value === void 0) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return "[" + value.map(stableStringify).join(",") + "]";
    }
    if (typeof value === "object") {
      const keys = Object.keys(value).sort();
      const parts = keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]));
      return "{" + parts.join(",") + "}";
    }
    return "null";
  }
  function fnv1a32Seeded(str, offsetBasis) {
    let hash = offsetBasis;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function fingerprint64(canonical) {
    const str = stableStringify(canonical);
    const hashA = fnv1a32Seeded(str, 2166136261);
    const hashB = fnv1a32Seeded(str, 1073773159);
    return hashA + hashB;
  }
  function fingerprint(canonical, prefix) {
    return `${prefix}:v${FINGERPRINT_VERSION}:${fingerprint64(canonical)}`;
  }
  function sortById(arr) {
    return arr.slice().sort((a, b) => {
      const aId = a.id || "";
      const bId = b.id || "";
      if (aId < bId) return -1;
      if (aId > bId) return 1;
      return 0;
    });
  }
  function normalizeSourceGeometry(s) {
    var _a, _b, _c, _d, _e;
    const phaseControlDeg = num(((_a = s == null ? void 0 : s.tuning) == null ? void 0 : _a.phaseControlDeg) ?? ((_b = s == null ? void 0 : s.tuning) == null ? void 0 : _b.phaseAdjust), 3);
    const rotationDeg = num((s == null ? void 0 : s.rotationDeg) ?? (s == null ? void 0 : s.rotation_deg) ?? (s == null ? void 0 : s.rotation), 3);
    return {
      id: (s == null ? void 0 : s.id) || null,
      x: num(s == null ? void 0 : s.x),
      y: num(s == null ? void 0 : s.y),
      z: num(s == null ? void 0 : s.z),
      // rotationDeg is a bass-relevant geometry field — a subwoofer orientation
      // change must invalidate per-seat P19/P20 results. Included even when 0
      // so the fingerprint captures the full physical identity.
      rotationDeg,
      gainDb: num((_c = s == null ? void 0 : s.tuning) == null ? void 0 : _c.gainDb),
      delayMs: num((_d = s == null ? void 0 : s.tuning) == null ? void 0 : _d.delayMs, 3),
      polarity: ((_e = s == null ? void 0 : s.tuning) == null ? void 0 : _e.polarity) ?? 0,
      // Preserve every existing zero-phase fingerprint/cache identity. A
      // non-zero all-pass setting becomes part of the calibration identity.
      ...phaseControlDeg ? { phaseControlDeg } : {}
    };
  }
  function normalizeSeat(s) {
    return {
      id: (s == null ? void 0 : s.id) || `${num(s == null ? void 0 : s.x)}-${num(s == null ? void 0 : s.y)}`,
      x: num(s == null ? void 0 : s.x),
      y: num(s == null ? void 0 : s.y),
      z: num(s == null ? void 0 : s.z)
    };
  }
  function resolveSources(inputs) {
    if (Array.isArray(inputs.sources)) return inputs.sources;
    if (Array.isArray(inputs.subsForSimulation)) return inputs.subsForSimulation;
    return [];
  }
  function computeGeometryFingerprint(inputs) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const i = inputs || {};
    const sources = sortById(resolveSources(i).map(normalizeSourceGeometry));
    const seats = sortById((Array.isArray(i.seatingPositions) ? i.seatingPositions : []).map(normalizeSeat));
    const canonical = {
      room: {
        w: num((_a = i.roomDims) == null ? void 0 : _a.widthM),
        l: num((_b = i.roomDims) == null ? void 0 : _b.lengthM),
        h: num((_c = i.roomDims) == null ? void 0 : _c.heightM)
      },
      rsp: i.rspPosition ? { x: num(i.rspPosition.x), y: num(i.rspPosition.y), z: num(i.rspPosition.z), designatedRspSeatId: i.rspPosition.designatedRspSeatId ?? null } : null,
      sources,
      sourceCount: sources.length,
      seats,
      absorption: {
        front: num((_d = i.surfaceAbsorption) == null ? void 0 : _d.front, 4),
        back: num((_e = i.surfaceAbsorption) == null ? void 0 : _e.back, 4),
        left: num((_f = i.surfaceAbsorption) == null ? void 0 : _f.left, 4),
        right: num((_g = i.surfaceAbsorption) == null ? void 0 : _g.right, 4),
        ceiling: num((_h = i.surfaceAbsorption) == null ? void 0 : _h.ceiling, 4),
        floor: num((_i = i.surfaceAbsorption) == null ? void 0 : _i.floor, 4)
      },
      roomDamping: num(i.roomDamping, 2),
      axialQ: num(i.axialQ, 3),
      modalSourceReferenceMode: i.modalSourceReferenceMode || null,
      modalGainScalar: num(i.modalGainScalar, 4),
      modalDistanceBlend: num(i.modalDistanceBlend, 4),
      modalStorageMode: i.modalStorageMode || null,
      propagationPhaseScale: num(i.propagationPhaseScale, 4),
      enableRewCoreReflections: !!i.enableRewCoreReflections,
      rewSourceCurveMode: i.rewSourceCurveMode || null,
      qStrategy: i.qStrategy || null,
      rewModalBandwidthScale: num(i.rewModalBandwidthScale, 4),
      disableReflectionPhaseJitter: !!i.disableReflectionPhaseJitter,
      disableReflectionCoherenceWeight: !!i.disableReflectionCoherenceWeight,
      disableLateField: !!i.disableLateField,
      disableModalPropagationPhase: !!i.disableModalPropagationPhase,
      mute68HzAxialMode: !!i.mute68HzAxialMode,
      debugDisableModalContribution: !!i.debugDisableModalContribution,
      rewParityFieldMode: i.rewParityFieldMode || null,
      abApplyModeMultiplicity: i.abApplyModeMultiplicity !== false,
      roomIsSealed: i.roomIsSealed !== false,
      abMidbandQScale: num(i.abMidbandQScale, 4),
      abGlobalQScale: num(i.abGlobalQScale, 4),
      modeGenerationFMaxHz: num(i.modeGenerationFMaxHz, 2),
      overrideConstantAxialQ: !!i.overrideConstantAxialQ,
      overrideAbsorptionAxialQ: !!i.overrideAbsorptionAxialQ,
      debugMode200Multiplier: num(i.debugMode200Multiplier, 4),
      debugModalPhaseConvention: i.debugModalPhaseConvention || null,
      reflectionGainScale: num(i.reflectionGainScale, 4),
      debugModalHSign: i.debugModalHSign || null,
      rewParityModalMagnitudeScale: num(i.rewParityModalMagnitudeScale, 4),
      modalCoherenceMode: i.modalCoherenceMode || null,
      highOrderAxialScale: num(i.highOrderAxialScale, 4)
    };
    return fingerprint(canonical, "geo");
  }
  const REW_SOURCE_CURVES = {
    // Flat 94 dB source from 15–200 Hz. The 20–200 Hz segment remains unchanged for REW parity;
    // the 15 Hz point permits product-capability composition through the RP22 extension band.
    flat_rew_reference: [
      { hz: 15, db: 94 },
      { hz: 20, db: 94 },
      { hz: 50, db: 94 },
      { hz: 100, db: 94 },
      { hz: 200, db: 94 }
    ]
  };
  const FLAT_SOURCE_CURVE = REW_SOURCE_CURVES.flat_rew_reference;
  const NORMALIZATION_REFERENCE = {
    sourceCurveDb: 94,
    sourceCurveId: "flat_rew_reference",
    description: "Production flat 94 dB source (REW_SOURCE_CURVES.flat_rew_reference) across 15–200 Hz. Output is relative room transfer referenced to this flat source, not absolute product SPL.",
    frequencyRangeHz: [15, 200]
  };
  const RSP_KEY = "__rsp__";
  const seatKey = (index) => `__seat_${index}__`;
  function complexToDb(re, im) {
    const magnitude = Math.sqrt(re * re + im * im);
    return 20 * Math.log10(Math.max(magnitude, 1e-10));
  }
  function buildListeners(rspPosition, seatingPositions) {
    const listeners = [];
    if (rspPosition && Number.isFinite(rspPosition.x) && Number.isFinite(rspPosition.y)) {
      listeners.push({
        ...rspPosition,
        __listenerKey: RSP_KEY,
        __isRsp: true,
        __originalId: rspPosition.id || null
      });
    }
    if (Array.isArray(seatingPositions)) {
      seatingPositions.forEach((seat, index) => {
        if (seat && Number.isFinite(seat.x) && Number.isFinite(seat.y)) {
          listeners.push({
            ...seat,
            __listenerKey: seatKey(index),
            __isRsp: false,
            __originalId: seat.id || null,
            __seatIndex: index
          });
        }
      });
    }
    return listeners;
  }
  function buildSourceLayout(subs) {
    if (!Array.isArray(subs) || subs.length === 0) return null;
    return {
      count: subs.length,
      positions: subs.map((s) => {
        var _a, _b, _c;
        return {
          id: (s == null ? void 0 : s.id) || null,
          x: Number.isFinite(s == null ? void 0 : s.x) ? s.x : null,
          y: Number.isFinite(s == null ? void 0 : s.y) ? s.y : null,
          z: Number.isFinite(s == null ? void 0 : s.z) ? s.z : null,
          placement: (s == null ? void 0 : s.placement) || null,
          tuning: {
            gainDb: Number.isFinite((_a = s == null ? void 0 : s.tuning) == null ? void 0 : _a.gainDb) ? s.tuning.gainDb : 0,
            delayMs: Number.isFinite((_b = s == null ? void 0 : s.tuning) == null ? void 0 : _b.delayMs) ? s.tuning.delayMs : 0,
            polarity: ((_c = s == null ? void 0 : s.tuning) == null ? void 0 : _c.polarity) ?? 0
          }
        };
      })
    };
  }
  function computeNormalizedRoomTransfer({
    roomDims,
    rspPosition,
    seatingPositions,
    subsForSimulation,
    physicsOptions = {},
    pointsPerOctave,
    preparedModes
  }) {
    const startedAtMs = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    if (!roomDims || !Number.isFinite(roomDims.widthM) || !Number.isFinite(roomDims.lengthM) || !Number.isFinite(roomDims.heightM)) {
      return {
        status: "error",
        errorMessage: "roomDims must include finite widthM, lengthM, and heightM.",
        responseDomain: "normalized_room_transfer",
        rspCurve: [],
        seatCurves: [],
        frequencies: [],
        sourceLayout: null,
        geometryFingerprint: null,
        normalizationReference: NORMALIZATION_REFERENCE,
        calculationDurationMs: 0
      };
    }
    if (!Array.isArray(subsForSimulation) || subsForSimulation.length === 0) {
      return {
        status: "error",
        errorMessage: "subsForSimulation must be a non-empty array.",
        responseDomain: "normalized_room_transfer",
        rspCurve: [],
        seatCurves: [],
        frequencies: [],
        sourceLayout: null,
        geometryFingerprint: null,
        normalizationReference: NORMALIZATION_REFERENCE,
        calculationDurationMs: 0
      };
    }
    const listeners = buildListeners(rspPosition, seatingPositions);
    if (listeners.length === 0) {
      return {
        status: "error",
        errorMessage: "No valid listener positions (RSP or seats).",
        responseDomain: "normalized_room_transfer",
        rspCurve: [],
        seatCurves: [],
        frequencies: [],
        sourceLayout: buildSourceLayout(subsForSimulation),
        geometryFingerprint: null,
        normalizationReference: NORMALIZATION_REFERENCE,
        calculationDurationMs: 0
      };
    }
    const geometryFingerprint = computeGeometryFingerprint({
      roomDims,
      rspPosition,
      seatingPositions,
      sources: subsForSimulation,
      surfaceAbsorption: physicsOptions.surfaceAbsorption,
      roomDamping: physicsOptions.roomDamping,
      axialQ: physicsOptions.axialQ,
      modalSourceReferenceMode: physicsOptions.modalSourceReferenceMode,
      modalGainScalar: physicsOptions.modalGainScalar,
      modalDistanceBlend: physicsOptions.modalDistanceBlend,
      modalStorageMode: physicsOptions.modalStorageMode,
      propagationPhaseScale: physicsOptions.propagationPhaseScale,
      enableRewCoreReflections: physicsOptions.enableReflections,
      rewSourceCurveMode: "normalized_room_transfer",
      qStrategy: physicsOptions.qStrategy,
      rewModalBandwidthScale: physicsOptions.rewModalBandwidthScale,
      disableReflectionPhaseJitter: physicsOptions.disableReflectionPhaseJitter,
      disableReflectionCoherenceWeight: physicsOptions.disableReflectionCoherenceWeight,
      disableLateField: physicsOptions.disableLateField,
      disableModalPropagationPhase: physicsOptions.disableModalPropagationPhase,
      mute68HzAxialMode: physicsOptions.mute68HzAxialMode,
      debugDisableModalContribution: physicsOptions.debugDisableModalContribution,
      rewParityFieldMode: physicsOptions.rewParityFieldMode,
      abApplyModeMultiplicity: physicsOptions.abApplyModeMultiplicity,
      roomIsSealed: physicsOptions.roomIsSealed,
      abMidbandQScale: physicsOptions.abMidbandQScale,
      abGlobalQScale: physicsOptions.abGlobalQScale,
      modeGenerationFMaxHz: physicsOptions.modeGenerationFMaxHz,
      overrideConstantAxialQ: physicsOptions.overrideConstantAxialQ,
      overrideAbsorptionAxialQ: physicsOptions.overrideAbsorptionAxialQ,
      debugMode200Multiplier: physicsOptions.debugMode200Multiplier,
      debugModalPhaseConvention: physicsOptions.debugModalPhaseConvention,
      reflectionGainScale: physicsOptions.reflectionGainScale,
      debugModalHSign: physicsOptions.debugModalHSign,
      rewParityModalMagnitudeScale: physicsOptions.rewParityModalMagnitudeScale,
      modalCoherenceMode: physicsOptions.modalCoherenceMode,
      highOrderAxialScale: physicsOptions.highOrderAxialScale
    });
    const engineOptions = {
      ...physicsOptions,
      freqMinHz: 15,
      freqMaxHz: 200,
      smoothing: "none",
      ...Number.isFinite(pointsPerOctave) ? { pointsPerOctave } : {}
    };
    const precomputedModes = Array.isArray(preparedModes) ? preparedModes : prepareModeBank(roomDims, engineOptions);
    const seatResponses = {};
    let perSourceRspComplexTransfers = [];
    let frequencies = [];
    listeners.forEach((listener) => {
      const listenerKey = listener.__listenerKey;
      let sumRe = null;
      let sumIm = null;
      let freqsHz = null;
      const sourceComplexTransfers = [];
      subsForSimulation.forEach((sub, sourceIndex) => {
        if (!Number.isFinite(sub == null ? void 0 : sub.x) || !Number.isFinite(sub == null ? void 0 : sub.y) || !Number.isFinite(sub == null ? void 0 : sub.z)) return;
        const listenerZ = Number.isFinite(Number(listener.z)) ? Number(listener.z) : 1.2;
        const rewResult = simulateBassResponseRewCore(
          {
            widthM: roomDims.widthM,
            lengthM: roomDims.lengthM,
            heightM: roomDims.heightM
          },
          {
            x: listener.x,
            y: listener.y,
            z: listenerZ
          },
          sub,
          FLAT_SOURCE_CURVE,
          {
            ...engineOptions,
            precomputedModes
          }
        );
        sourceComplexTransfers.push({
          sourceIndex,
          sourceId: (sub == null ? void 0 : sub.id) || null,
          amplitudeDomain: "pressure amplitude relative to 20 µPa",
          sourceReferenceDb: 94,
          sourceReferenceAmplitude: Math.pow(10, 94 / 20),
          dimensionlessTransferOperation: "complexPressure / sourceReferenceAmplitude",
          points: rewResult.freqsHz.map((frequency, index) => {
            var _a, _b;
            return {
              frequency,
              re: ((_a = rewResult.complexPressure[index]) == null ? void 0 : _a.re) ?? null,
              im: ((_b = rewResult.complexPressure[index]) == null ? void 0 : _b.im) ?? null
            };
          })
        });
        if (!freqsHz) {
          freqsHz = rewResult.freqsHz;
          sumRe = rewResult.complexPressure.map((cp) => cp.re);
          sumIm = rewResult.complexPressure.map((cp) => cp.im);
        } else {
          rewResult.complexPressure.forEach((cp, index) => {
            if (Number.isFinite(cp.re) && Number.isFinite(cp.im)) {
              sumRe[index] += cp.re;
              sumIm[index] += cp.im;
            }
          });
        }
      });
      if (freqsHz && sumRe && sumIm) {
        if (listener.__isRsp) perSourceRspComplexTransfers = sourceComplexTransfers;
        seatResponses[listenerKey] = {
          freqsHz,
          splDb: sumRe.map((re, index) => complexToDb(re, sumIm[index])),
          isRsp: listener.__isRsp,
          originalId: listener.__originalId,
          seatIndex: Number.isFinite(listener.__seatIndex) ? listener.__seatIndex : null
        };
      }
    });
    for (const key of Object.keys(seatResponses)) {
      frequencies = seatResponses[key].freqsHz;
      break;
    }
    const rspResponse = seatResponses[RSP_KEY];
    const rspCurve = rspResponse ? rspResponse.freqsHz.map((frequency, i) => ({
      frequency,
      spl: Number.isFinite(rspResponse.splDb[i]) ? rspResponse.splDb[i] : null
    })).filter((p) => Number.isFinite(p.frequency) && p.frequency > 0 && Number.isFinite(p.spl)) : [];
    const seatCurves = Object.entries(seatResponses).filter(([key]) => key !== RSP_KEY).map(([key, response]) => ({
      seatKey: key,
      originalSeatId: response.originalId,
      seatIndex: response.seatIndex,
      responseData: response.freqsHz.map((frequency, i) => ({
        frequency,
        spl: Number.isFinite(response.splDb[i]) ? response.splDb[i] : null
      })).filter((p) => Number.isFinite(p.frequency) && p.frequency > 0 && Number.isFinite(p.spl))
    })).filter((seat) => seat.responseData.length > 0);
    const completedAtMs = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    return {
      status: "complete",
      errorMessage: null,
      responseDomain: "normalized_room_transfer",
      rspCurve,
      seatCurves,
      perSourceRspComplexTransfers,
      frequencies,
      sourceLayout: buildSourceLayout(subsForSimulation),
      geometryFingerprint,
      normalizationReference: NORMALIZATION_REFERENCE,
      calculationDurationMs: Math.max(0, completedAtMs - startedAtMs)
    };
  }
  const BASS_NORMALIZED_PHYSICS_DEFAULTS = Object.freeze({
    surfaceAbsorption: Object.freeze({ front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 }),
    qStrategy: "ab_corrected",
    enableRewCoreReflections: false,
    roomDamping: 20,
    axialQ: 4,
    modalSourceReferenceMode: "existing",
    modalGainScalar: 1,
    modalDistanceBlend: 0.55,
    modalStorageMode: "none",
    propagationPhaseScale: 0,
    disableReflectionPhaseJitter: false,
    disableReflectionCoherenceWeight: false,
    mute68HzAxialMode: false,
    debugDisableModalContribution: false,
    rewParityFieldMode: "full_field",
    overrideConstantAxialQ: false,
    overrideAbsorptionAxialQ: false,
    debugMode200Multiplier: 1,
    reflectionGainScale: 1,
    modalCoherenceMode: "coherent",
    highOrderAxialScale: 1,
    rewModalBandwidthScale: 0.55
  });
  function buildNormalizedPhysicsOptions(params) {
    const p = params || {};
    return {
      surfaceAbsorption: p.surfaceAbsorption,
      enableReflections: p.qStrategy === "ab_corrected" ? false : p.enableRewCoreReflections,
      enableModes: true,
      roomDamping: p.roomDamping,
      axialQ: p.axialQ,
      modalSourceReferenceMode: p.modalSourceReferenceMode,
      modalGainScalar: p.modalGainScalar,
      modalDistanceBlend: p.modalDistanceBlend,
      modalStorageMode: p.modalStorageMode,
      propagationPhaseScale: p.propagationPhaseScale,
      pureDeterministicModalSum: true,
      disableReflectionPhaseJitter: p.disableReflectionPhaseJitter,
      disableReflectionCoherenceWeight: p.disableReflectionCoherenceWeight,
      disableLateField: true,
      disableModalPropagationPhase: true,
      mute68HzAxialMode: p.mute68HzAxialMode,
      debugDisableModalContribution: p.debugDisableModalContribution,
      rewSourceCurveMode: "flat_rew_reference",
      rewParityFieldMode: p.qStrategy === "ab_corrected" ? "modes_only" : p.rewParityFieldMode,
      abApplyModeMultiplicity: p.qStrategy === "ab_corrected",
      roomIsSealed: p.qStrategy === "ab_corrected",
      abMidbandQScale: 1,
      overrideConstantAxialQ: p.overrideConstantAxialQ,
      overrideAbsorptionAxialQ: p.overrideAbsorptionAxialQ,
      debugMode200Multiplier: p.debugMode200Multiplier,
      debugModalPhaseConvention: "normal",
      debugReflectionOrder: 1,
      reflectionGainScale: p.reflectionGainScale,
      debugModalHSign: "normal",
      rewParityModalMagnitudeScale: 1,
      modalCoherenceMode: p.modalCoherenceMode,
      highOrderAxialScale: p.highOrderAxialScale,
      qStrategy: p.qStrategy,
      rewModalBandwidthScale: p.rewModalBandwidthScale
    };
  }
  const DEFAULT_BEST_SUB_LAYOUT_PHYSICS = Object.freeze(
    buildNormalizedPhysicsOptions(BASS_NORMALIZED_PHYSICS_DEFAULTS)
  );
  const STAGE1_SCREENING_FREQ_MIN_HZ = 20;
  const STAGE1_SCREENING_FREQ_MAX_HZ = 80;
  const STAGE1_POINTS_PER_OCTAVE = 8;
  const STAGE1_FALLBACK_SOURCE_HEIGHT_M = 0.05;
  const STAGE1_CANDIDATE_BUDGETS = Object.freeze({
    1: { normal: 96, fallback: 160 },
    2: { normal: 128, fallback: 240, allocation: { C_FRONT_PAIR: 48, RP22_F: 40, RP22_G: 40 } },
    4: { normal: 192, fallback: 280, allocation: { RP22_C: 72, RP22_E: 60, RP22_D: 60 } }
  });
  const STAGE1_FINALIST_COUNT = Object.freeze({
    1: 5,
    2: 5,
    4: 5
  });
  const STAGE1_DIVERSITY_MIN_DISPLACEMENT_NORM = 0.03;
  const STAGE1_A_PROHIBITION_TOLERANCE_NORM = 0.05;
  const STAGE1_NULL_RULE = Object.freeze({
    smoothingRadiusBins: 1,
    shoulderRadiusBins: 4,
    minimumContiguousBins: 2,
    destructiveDepthDb: 8,
    severeDepthDb: 10
  });
  const STAGE1_TIE_TOLERANCE = Object.freeze({
    variationDb: 0.15,
    smoothnessDb: 0.15,
    coherenceDb: 0.15,
    efficiencyDb: 0.1
  });
  const STAGE1_LOCAL_SEARCH = Object.freeze({
    coarseStep: 0.05,
    fineStep: 0.01,
    fineRadius: 0.04,
    coarseRange: { min: 0.15, max: 0.35 },
    sideWallRange: { min: 0.15, max: 0.85 },
    frontWallRange: { min: 0.1, max: 0.9 }
  });
  const FAMILY_IDS = Object.freeze({
    // One sub
    ONE_FRONT_MID: "ONE_FRONT_MID",
    ONE_FRONT_QUARTER: "ONE_FRONT_QUARTER",
    ONE_REAR_MID: "ONE_REAR_MID",
    ONE_SIDE_QUARTER: "ONE_SIDE_QUARTER",
    ONE_BOUNDARY_CUSTOM: "ONE_BOUNDARY_CUSTOM",
    // Two subs
    C_FRONT_PAIR: "C_FRONT_PAIR",
    FRONT_THIRD_PAIR: "FRONT_THIRD_PAIR",
    FRONT_CORNER_PAIR: "FRONT_CORNER_PAIR",
    REAR_QUARTER_PAIR: "REAR_QUARTER_PAIR",
    REAR_THIRD_PAIR: "REAR_THIRD_PAIR",
    REAR_CORNER_PAIR: "REAR_CORNER_PAIR",
    RP22_F: "RP22_F",
    RP22_G: "RP22_G",
    TWO_SYMMETRIC_BOUNDARY_CUSTOM: "TWO_SYMMETRIC_BOUNDARY_CUSTOM",
    TWO_ASYMMETRIC_BOUNDARY_CUSTOM: "TWO_ASYMMETRIC_BOUNDARY_CUSTOM",
    // Four subs
    RP22_C: "RP22_C",
    RP22_E: "RP22_E",
    FOUR_THIRD_PAIRS: "FOUR_THIRD_PAIRS",
    RP22_D: "RP22_D",
    FOUR_SYMMETRIC_BOUNDARY_CUSTOM: "FOUR_SYMMETRIC_BOUNDARY_CUSTOM",
    FOUR_ASYMMETRIC_BOUNDARY_CUSTOM: "FOUR_ASYMMETRIC_BOUNDARY_CUSTOM",
    RP22_B_LAST_RESORT: "RP22_B_LAST_RESORT",
    // Prohibited — never generated, never surfaces
    RP22_A: "RP22_A"
  });
  Object.freeze({
    [FAMILY_IDS.C_FRONT_PAIR]: {
      label: "Front quarter positions",
      description: "Derived from the front pair of RP22 layout C"
    },
    [FAMILY_IDS.FRONT_THIRD_PAIR]: {
      label: "Front third positions",
      description: "Front wall third positions (0.333W / 0.667W)"
    },
    [FAMILY_IDS.FRONT_CORNER_PAIR]: {
      label: "Front corners",
      description: "Front wall corner positions"
    },
    [FAMILY_IDS.REAR_QUARTER_PAIR]: {
      label: "Rear quarter positions",
      description: "Rear wall quarter positions (0.25W / 0.75W)"
    },
    [FAMILY_IDS.REAR_THIRD_PAIR]: {
      label: "Rear third positions",
      description: "Rear wall third positions (0.333W / 0.667W)"
    },
    [FAMILY_IDS.REAR_CORNER_PAIR]: {
      label: "Rear corners",
      description: "Rear wall corner positions"
    },
    [FAMILY_IDS.RP22_C]: {
      label: "RP22 C · Front/rear quarter positions",
      description: "Front and rear wall quarter positions"
    },
    [FAMILY_IDS.RP22_E]: {
      label: "RP22 E · Four corners",
      description: "Four corner positions"
    },
    [FAMILY_IDS.FOUR_THIRD_PAIRS]: {
      label: "Front/rear third positions",
      description: "Front and rear wall third positions (0.333W / 0.667W)"
    },
    [FAMILY_IDS.RP22_D]: {
      label: "RP22 D · Side-wall quarter positions",
      description: "Side-wall quarter positions"
    },
    [FAMILY_IDS.RP22_F]: {
      label: "RP22 F · Opposing wall midpoints",
      description: "Front and rear wall midpoints"
    },
    [FAMILY_IDS.RP22_G]: {
      label: "RP22 G · Side-wall midpoints",
      description: "Left and right wall midpoints"
    },
    [FAMILY_IDS.RP22_B_LAST_RESORT]: {
      label: "RP22 B · Four wall midpoints · fallback",
      description: "Four wall midpoints — last resort only"
    },
    [FAMILY_IDS.ONE_FRONT_MID]: { label: "Front wall midpoint", description: "Single front wall midpoint" },
    [FAMILY_IDS.ONE_FRONT_QUARTER]: { label: "Front wall quarter", description: "Single front wall quarter position" },
    [FAMILY_IDS.ONE_REAR_MID]: { label: "Rear wall midpoint", description: "Single rear wall midpoint" },
    [FAMILY_IDS.ONE_SIDE_QUARTER]: { label: "Side wall quarter", description: "Single side wall quarter position" },
    [FAMILY_IDS.ONE_BOUNDARY_CUSTOM]: { label: "Boundary custom", description: "Custom boundary position" },
    [FAMILY_IDS.TWO_SYMMETRIC_BOUNDARY_CUSTOM]: { label: "Symmetric boundary custom", description: "Custom symmetric boundary pair" },
    [FAMILY_IDS.TWO_ASYMMETRIC_BOUNDARY_CUSTOM]: { label: "Asymmetric boundary custom", description: "Custom asymmetric boundary pair" },
    [FAMILY_IDS.FOUR_SYMMETRIC_BOUNDARY_CUSTOM]: { label: "Symmetric boundary custom", description: "Custom symmetric boundary quad" },
    [FAMILY_IDS.FOUR_ASYMMETRIC_BOUNDARY_CUSTOM]: { label: "Asymmetric boundary custom", description: "Custom asymmetric boundary quad" }
    // RP22_A has NO display metadata — it must never surface.
  });
  const FAMILY_PREFERENCE_RANK = Object.freeze({
    // Two subs
    [FAMILY_IDS.C_FRONT_PAIR]: 1,
    [FAMILY_IDS.FRONT_THIRD_PAIR]: 2,
    [FAMILY_IDS.FRONT_CORNER_PAIR]: 3,
    [FAMILY_IDS.REAR_QUARTER_PAIR]: 4,
    [FAMILY_IDS.REAR_THIRD_PAIR]: 5,
    [FAMILY_IDS.REAR_CORNER_PAIR]: 6,
    [FAMILY_IDS.RP22_F]: 7,
    [FAMILY_IDS.RP22_G]: 8,
    [FAMILY_IDS.TWO_SYMMETRIC_BOUNDARY_CUSTOM]: 9,
    [FAMILY_IDS.TWO_ASYMMETRIC_BOUNDARY_CUSTOM]: 10,
    // Four subs
    [FAMILY_IDS.RP22_E]: 1,
    [FAMILY_IDS.RP22_C]: 2,
    [FAMILY_IDS.FOUR_THIRD_PAIRS]: 3,
    [FAMILY_IDS.RP22_D]: 4,
    [FAMILY_IDS.FOUR_SYMMETRIC_BOUNDARY_CUSTOM]: 5,
    [FAMILY_IDS.FOUR_ASYMMETRIC_BOUNDARY_CUSTOM]: 6,
    [FAMILY_IDS.RP22_B_LAST_RESORT]: 99,
    // One sub
    [FAMILY_IDS.ONE_FRONT_MID]: 1,
    [FAMILY_IDS.ONE_FRONT_QUARTER]: 2,
    [FAMILY_IDS.ONE_REAR_MID]: 3,
    [FAMILY_IDS.ONE_SIDE_QUARTER]: 4,
    [FAMILY_IDS.ONE_BOUNDARY_CUSTOM]: 5
  });
  Object.freeze({
    // One sub
    [FAMILY_IDS.ONE_FRONT_MID]: [{ xNorm: 0.5, yNorm: 0 }],
    [FAMILY_IDS.ONE_FRONT_QUARTER]: [
      { xNorm: 0.25, yNorm: 0 },
      { xNorm: 0.75, yNorm: 0 }
    ],
    [FAMILY_IDS.ONE_REAR_MID]: [{ xNorm: 0.5, yNorm: 1 }],
    [FAMILY_IDS.ONE_SIDE_QUARTER]: [
      { xNorm: 0, yNorm: 0.25 },
      { xNorm: 0, yNorm: 0.75 },
      { xNorm: 1, yNorm: 0.25 },
      { xNorm: 1, yNorm: 0.75 }
    ],
    // Two subs
    [FAMILY_IDS.C_FRONT_PAIR]: [
      { xNorm: 0.25, yNorm: 0 },
      { xNorm: 0.75, yNorm: 0 }
    ],
    [FAMILY_IDS.FRONT_THIRD_PAIR]: [
      { xNorm: 0.333, yNorm: 0 },
      { xNorm: 0.667, yNorm: 0 }
    ],
    [FAMILY_IDS.FRONT_CORNER_PAIR]: [
      { xNorm: 0, yNorm: 0 },
      { xNorm: 1, yNorm: 0 }
    ],
    [FAMILY_IDS.REAR_QUARTER_PAIR]: [
      { xNorm: 0.25, yNorm: 1 },
      { xNorm: 0.75, yNorm: 1 }
    ],
    [FAMILY_IDS.REAR_THIRD_PAIR]: [
      { xNorm: 0.333, yNorm: 1 },
      { xNorm: 0.667, yNorm: 1 }
    ],
    [FAMILY_IDS.REAR_CORNER_PAIR]: [
      { xNorm: 0, yNorm: 1 },
      { xNorm: 1, yNorm: 1 }
    ],
    [FAMILY_IDS.RP22_F]: [
      { xNorm: 0.5, yNorm: 0 },
      { xNorm: 0.5, yNorm: 1 }
    ],
    [FAMILY_IDS.RP22_G]: [
      { xNorm: 0, yNorm: 0.5 },
      { xNorm: 1, yNorm: 0.5 }
    ],
    // Four subs
    [FAMILY_IDS.RP22_C]: [
      { xNorm: 0.25, yNorm: 0 },
      { xNorm: 0.75, yNorm: 0 },
      { xNorm: 0.25, yNorm: 1 },
      { xNorm: 0.75, yNorm: 1 }
    ],
    [FAMILY_IDS.RP22_E]: [
      { xNorm: 0, yNorm: 0 },
      { xNorm: 1, yNorm: 0 },
      { xNorm: 0, yNorm: 1 },
      { xNorm: 1, yNorm: 1 }
    ],
    [FAMILY_IDS.FOUR_THIRD_PAIRS]: [
      { xNorm: 0.333, yNorm: 0 },
      { xNorm: 0.667, yNorm: 0 },
      { xNorm: 0.333, yNorm: 1 },
      { xNorm: 0.667, yNorm: 1 }
    ],
    [FAMILY_IDS.RP22_D]: [
      { xNorm: 0, yNorm: 0.25 },
      { xNorm: 1, yNorm: 0.25 },
      { xNorm: 0, yNorm: 0.75 },
      { xNorm: 1, yNorm: 0.75 }
    ],
    // B last resort — gated, not generated during normal Stage 1
    [FAMILY_IDS.RP22_B_LAST_RESORT]: [
      { xNorm: 0.5, yNorm: 0 },
      { xNorm: 0.5, yNorm: 1 },
      { xNorm: 0, yNorm: 0.5 },
      { xNorm: 1, yNorm: 0.5 }
    ]
  });
  const ENABLED_FAMILIES = Object.freeze({
    1: [
      FAMILY_IDS.ONE_FRONT_MID,
      FAMILY_IDS.ONE_FRONT_QUARTER,
      FAMILY_IDS.ONE_REAR_MID,
      FAMILY_IDS.ONE_SIDE_QUARTER
    ],
    2: [
      FAMILY_IDS.C_FRONT_PAIR,
      FAMILY_IDS.FRONT_THIRD_PAIR,
      FAMILY_IDS.FRONT_CORNER_PAIR,
      FAMILY_IDS.REAR_QUARTER_PAIR,
      FAMILY_IDS.REAR_THIRD_PAIR,
      FAMILY_IDS.REAR_CORNER_PAIR,
      FAMILY_IDS.RP22_F,
      FAMILY_IDS.RP22_G
    ],
    4: [
      FAMILY_IDS.RP22_E,
      FAMILY_IDS.RP22_C,
      FAMILY_IDS.FOUR_THIRD_PAIRS,
      FAMILY_IDS.RP22_D
    ]
  });
  function getFamilyPreferenceRank(familyId) {
    return Number.isFinite(FAMILY_PREFERENCE_RANK[familyId]) ? FAMILY_PREFERENCE_RANK[familyId] : 999;
  }
  const A_TARGET_POSITIONS = Object.freeze([
    { xNorm: 0.25, yNorm: 0.25 },
    { xNorm: 0.75, yNorm: 0.25 },
    { xNorm: 0.25, yNorm: 0.75 },
    { xNorm: 0.75, yNorm: 0.75 }
  ]);
  function normDistance(a, b) {
    const dx = a.xNorm - b.xNorm;
    const dy = a.yNorm - b.yNorm;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function matchesAProhibitedTopology(sources, tolerance = STAGE1_A_PROHIBITION_TOLERANCE_NORM) {
    if (!Array.isArray(sources) || sources.length !== 4) return { isA: false, matchedCount: 0, maxDistance: Infinity };
    const assigned = new Array(sources.length).fill(false);
    let matchedCount = 0;
    let maxDistance = 0;
    for (const target of A_TARGET_POSITIONS) {
      let bestIndex = -1;
      let bestDist = Infinity;
      for (let i = 0; i < sources.length; i += 1) {
        if (assigned[i]) continue;
        const dist = normDistance(target, sources[i]);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }
      if (bestIndex >= 0 && bestDist <= tolerance) {
        assigned[bestIndex] = true;
        matchedCount += 1;
        maxDistance = Math.max(maxDistance, bestDist);
      } else {
        return { isA: false, matchedCount, maxDistance };
      }
    }
    return { isA: matchedCount === 4, matchedCount, maxDistance };
  }
  function validateAProhibition(sources) {
    const check = matchesAProhibitedTopology(sources);
    if (check.isA) {
      return {
        passes: false,
        reason: `Candidate matches prohibited RP22 A topology (matched ${check.matchedCount}/4 within tolerance ${STAGE1_A_PROHIBITION_TOLERANCE_NORM})`
      };
    }
    return { passes: true, reason: null };
  }
  function filterAProhibited(candidates) {
    const accepted = [];
    const rejected = [];
    for (const candidate of candidates) {
      const validation = validateAProhibition(candidate.sources);
      if (validation.passes) accepted.push(candidate);
      else rejected.push({ ...candidate, rejectionReason: validation.reason });
    }
    return { accepted, rejected };
  }
  const roundNorm = (v) => Math.round(v * 1e3) / 1e3;
  function makeSource(xNorm, yNorm) {
    return { xNorm: roundNorm(xNorm), yNorm: roundNorm(yNorm) };
  }
  function makeCandidate(familyId, sources, searchTier = 1, symmetryState = "symmetric", seedDisplacement = 0) {
    const id = `${familyId}:${sources.map((s) => `${s.xNorm}_${s.yNorm}`).join("|")}`;
    return { id, familyId, sources, searchTier, symmetryState, seedDisplacement: roundNorm(seedDisplacement) };
  }
  function generateC_FRONT_PAIR() {
    const candidates = [];
    const { coarseRange, coarseStep, fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
    for (let q = coarseRange.min; q <= coarseRange.max + 1e-9; q += coarseStep) {
      const sources = [makeSource(q, 0), makeSource(1 - q, 0)];
      const displacement = Math.abs(q - 0.25);
      candidates.push(makeCandidate(FAMILY_IDS.C_FRONT_PAIR, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateC_FRONT_PAIR_Fine(bestQ) {
    const { fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
    const candidates = [];
    for (let q = bestQ - fineRadius; q <= bestQ + fineRadius + 1e-9; q += fineStep) {
      if (q < 0.05 || q > 0.45) continue;
      const sources = [makeSource(q, 0), makeSource(1 - q, 0)];
      const displacement = Math.abs(q - 0.25);
      candidates.push(makeCandidate(FAMILY_IDS.C_FRONT_PAIR, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateRP22_F() {
    const candidates = [];
    candidates.push(makeCandidate(FAMILY_IDS.RP22_F, [makeSource(0.5, 0), makeSource(0.5, 1)], 1, "symmetric", 0));
    for (const d of [0.05, 0.1, 0.15]) {
      candidates.push(makeCandidate(FAMILY_IDS.RP22_F, [makeSource(0.5, 0), makeSource(0.5, 1)], 1, "symmetric", 0));
    }
    for (const s of [-0.1, -0.05, 0.05, 0.1]) {
      const sources = [makeSource(0.5 + s, 0), makeSource(0.5 + s, 1)];
      candidates.push(makeCandidate(FAMILY_IDS.RP22_F, sources, 1, "symmetric", Math.abs(s)));
    }
    const seen = /* @__PURE__ */ new Map();
    for (const c of candidates) seen.set(c.id, c);
    return Array.from(seen.values());
  }
  function generateRP22_G() {
    const candidates = [];
    const yPositions = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75];
    for (const y of yPositions) {
      const sources = [makeSource(0, y), makeSource(1, y)];
      const displacement = Math.abs(y - 0.5);
      candidates.push(makeCandidate(FAMILY_IDS.RP22_G, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateRP22_C() {
    const candidates = [];
    const { coarseRange, coarseStep } = STAGE1_LOCAL_SEARCH;
    for (let q = coarseRange.min; q <= coarseRange.max + 1e-9; q += coarseStep) {
      const sources = [
        makeSource(q, 0),
        makeSource(1 - q, 0),
        makeSource(q, 1),
        makeSource(1 - q, 1)
      ];
      const displacement = Math.abs(q - 0.25);
      candidates.push(makeCandidate(FAMILY_IDS.RP22_C, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateRP22_C_Fine(bestQ) {
    const { fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
    const candidates = [];
    for (let q = bestQ - fineRadius; q <= bestQ + fineRadius + 1e-9; q += fineStep) {
      if (q < 0.05 || q > 0.45) continue;
      const sources = [
        makeSource(q, 0),
        makeSource(1 - q, 0),
        makeSource(q, 1),
        makeSource(1 - q, 1)
      ];
      const displacement = Math.abs(q - 0.25);
      candidates.push(makeCandidate(FAMILY_IDS.RP22_C, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateRP22_E() {
    const candidates = [];
    candidates.push(makeCandidate(FAMILY_IDS.RP22_E, [
      makeSource(0, 0),
      makeSource(1, 0),
      makeSource(0, 1),
      makeSource(1, 1)
    ], 1, "symmetric", 0));
    for (const d of [0.02, 0.05, 0.08]) {
      candidates.push(makeCandidate(FAMILY_IDS.RP22_E, [
        makeSource(d, d),
        makeSource(1 - d, d),
        makeSource(d, 1 - d),
        makeSource(1 - d, 1 - d)
      ], 1, "symmetric", d));
    }
    for (const d of [0.02, 0.05]) {
      candidates.push(makeCandidate(FAMILY_IDS.RP22_E, [
        makeSource(d, 0),
        makeSource(1 - d, 0),
        makeSource(d, 1),
        makeSource(1 - d, 1)
      ], 1, "symmetric", d));
    }
    return candidates;
  }
  function generateRP22_D() {
    const candidates = [];
    const { coarseRange, coarseStep } = STAGE1_LOCAL_SEARCH;
    for (let q = coarseRange.min; q <= coarseRange.max + 1e-9; q += coarseStep) {
      const sources = [
        makeSource(0, q),
        makeSource(1, q),
        makeSource(0, 1 - q),
        makeSource(1, 1 - q)
      ];
      const displacement = Math.abs(q - 0.25);
      candidates.push(makeCandidate(FAMILY_IDS.RP22_D, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateRP22_D_Fine(bestQ) {
    const { fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
    const candidates = [];
    for (let q = bestQ - fineRadius; q <= bestQ + fineRadius + 1e-9; q += fineStep) {
      if (q < 0.05 || q > 0.45) continue;
      const sources = [
        makeSource(0, q),
        makeSource(1, q),
        makeSource(0, 1 - q),
        makeSource(1, 1 - q)
      ];
      const displacement = Math.abs(q - 0.25);
      candidates.push(makeCandidate(FAMILY_IDS.RP22_D, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateFRONT_THIRD_PAIR() {
    const candidates = [];
    const { coarseStep } = STAGE1_LOCAL_SEARCH;
    for (let q = 0.23; q <= 0.4 + 1e-9; q += coarseStep) {
      const sources = [makeSource(q, 0), makeSource(1 - q, 0)];
      const displacement = Math.abs(q - 0.333);
      candidates.push(makeCandidate(FAMILY_IDS.FRONT_THIRD_PAIR, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateFRONT_THIRD_PAIR_Fine(bestQ) {
    const { fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
    const candidates = [];
    for (let q = bestQ - fineRadius; q <= bestQ + fineRadius + 1e-9; q += fineStep) {
      if (q < 0.05 || q > 0.45) continue;
      const sources = [makeSource(q, 0), makeSource(1 - q, 0)];
      const displacement = Math.abs(q - 0.333);
      candidates.push(makeCandidate(FAMILY_IDS.FRONT_THIRD_PAIR, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateFRONT_CORNER_PAIR() {
    const candidates = [];
    candidates.push(makeCandidate(FAMILY_IDS.FRONT_CORNER_PAIR, [
      makeSource(0, 0),
      makeSource(1, 0)
    ], 1, "symmetric", 0));
    for (const d of [0.02, 0.05, 0.08]) {
      candidates.push(makeCandidate(FAMILY_IDS.FRONT_CORNER_PAIR, [
        makeSource(d, 0),
        makeSource(1 - d, 0)
      ], 1, "symmetric", d));
    }
    return candidates;
  }
  function generateREAR_QUARTER_PAIR() {
    const candidates = [];
    const { coarseStep } = STAGE1_LOCAL_SEARCH;
    for (let q = 0.15; q <= 0.35 + 1e-9; q += coarseStep) {
      const sources = [makeSource(q, 1), makeSource(1 - q, 1)];
      const displacement = Math.abs(q - 0.25);
      candidates.push(makeCandidate(FAMILY_IDS.REAR_QUARTER_PAIR, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateREAR_QUARTER_PAIR_Fine(bestQ) {
    const { fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
    const candidates = [];
    for (let q = bestQ - fineRadius; q <= bestQ + fineRadius + 1e-9; q += fineStep) {
      if (q < 0.05 || q > 0.45) continue;
      const sources = [makeSource(q, 1), makeSource(1 - q, 1)];
      const displacement = Math.abs(q - 0.25);
      candidates.push(makeCandidate(FAMILY_IDS.REAR_QUARTER_PAIR, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateREAR_THIRD_PAIR() {
    const candidates = [];
    const { coarseStep } = STAGE1_LOCAL_SEARCH;
    for (let q = 0.23; q <= 0.4 + 1e-9; q += coarseStep) {
      const sources = [makeSource(q, 1), makeSource(1 - q, 1)];
      const displacement = Math.abs(q - 0.333);
      candidates.push(makeCandidate(FAMILY_IDS.REAR_THIRD_PAIR, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateREAR_THIRD_PAIR_Fine(bestQ) {
    const { fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
    const candidates = [];
    for (let q = bestQ - fineRadius; q <= bestQ + fineRadius + 1e-9; q += fineStep) {
      if (q < 0.05 || q > 0.45) continue;
      const sources = [makeSource(q, 1), makeSource(1 - q, 1)];
      const displacement = Math.abs(q - 0.333);
      candidates.push(makeCandidate(FAMILY_IDS.REAR_THIRD_PAIR, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateREAR_CORNER_PAIR() {
    const candidates = [];
    candidates.push(makeCandidate(FAMILY_IDS.REAR_CORNER_PAIR, [
      makeSource(0, 1),
      makeSource(1, 1)
    ], 1, "symmetric", 0));
    for (const d of [0.02, 0.05, 0.08]) {
      candidates.push(makeCandidate(FAMILY_IDS.REAR_CORNER_PAIR, [
        makeSource(d, 1),
        makeSource(1 - d, 1)
      ], 1, "symmetric", d));
    }
    return candidates;
  }
  function generateFOUR_THIRD_PAIRS() {
    const candidates = [];
    const { coarseStep } = STAGE1_LOCAL_SEARCH;
    for (let q = 0.23; q <= 0.4 + 1e-9; q += coarseStep) {
      const sources = [
        makeSource(q, 0),
        makeSource(1 - q, 0),
        makeSource(q, 1),
        makeSource(1 - q, 1)
      ];
      const displacement = Math.abs(q - 0.333);
      candidates.push(makeCandidate(FAMILY_IDS.FOUR_THIRD_PAIRS, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateFOUR_THIRD_PAIRS_Fine(bestQ) {
    const { fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
    const candidates = [];
    for (let q = bestQ - fineRadius; q <= bestQ + fineRadius + 1e-9; q += fineStep) {
      if (q < 0.05 || q > 0.45) continue;
      const sources = [
        makeSource(q, 0),
        makeSource(1 - q, 0),
        makeSource(q, 1),
        makeSource(1 - q, 1)
      ];
      const displacement = Math.abs(q - 0.333);
      candidates.push(makeCandidate(FAMILY_IDS.FOUR_THIRD_PAIRS, sources, 1, "symmetric", displacement));
    }
    return candidates;
  }
  function generateOneSub() {
    const candidates = [];
    const { frontWallRange, coarseStep } = STAGE1_LOCAL_SEARCH;
    candidates.push(makeCandidate(FAMILY_IDS.ONE_FRONT_MID, [makeSource(0.5, 0)], 1, "symmetric", 0));
    candidates.push(makeCandidate(FAMILY_IDS.ONE_FRONT_QUARTER, [makeSource(0.25, 0)], 1, "symmetric", 0));
    candidates.push(makeCandidate(FAMILY_IDS.ONE_FRONT_QUARTER, [makeSource(0.75, 0)], 1, "symmetric", 0));
    for (let x = frontWallRange.min; x <= frontWallRange.max + 1e-9; x += coarseStep) {
      if (Math.abs(x - 0.25) < 5e-3 || Math.abs(x - 0.5) < 5e-3 || Math.abs(x - 0.75) < 5e-3) continue;
      const displacement = Math.min(Math.abs(x - 0.25), Math.abs(x - 0.5), Math.abs(x - 0.75));
      const familyId = displacement < 0.05 ? FAMILY_IDS.ONE_FRONT_QUARTER : FAMILY_IDS.ONE_BOUNDARY_CUSTOM;
      candidates.push(makeCandidate(familyId, [makeSource(x, 0)], 1, "symmetric", displacement));
    }
    candidates.push(makeCandidate(FAMILY_IDS.ONE_REAR_MID, [makeSource(0.5, 1)], 2, "symmetric", 0));
    for (const y of [0.25, 0.75]) {
      candidates.push(makeCandidate(FAMILY_IDS.ONE_SIDE_QUARTER, [makeSource(0, y)], 2, "symmetric", 0));
      candidates.push(makeCandidate(FAMILY_IDS.ONE_SIDE_QUARTER, [makeSource(1, y)], 2, "symmetric", 0));
    }
    const seen = /* @__PURE__ */ new Map();
    for (const c of candidates) seen.set(c.id, c);
    return Array.from(seen.values());
  }
  function generateTwoSubFallback() {
    const candidates = [];
    for (const d of [0.1, 0.2]) {
      candidates.push(makeCandidate(FAMILY_IDS.TWO_SYMMETRIC_BOUNDARY_CUSTOM, [makeSource(0.5 - d, 0), makeSource(0.5 + d, 1)], 2, "symmetric", d));
    }
    return candidates;
  }
  function generateFourSubFallback() {
    const candidates = [];
    candidates.push(makeCandidate(FAMILY_IDS.FOUR_SYMMETRIC_BOUNDARY_CUSTOM, [
      makeSource(0.2, 0),
      makeSource(0.8, 0),
      makeSource(0.2, 1),
      makeSource(0.8, 1)
    ], 2, "symmetric", 0.05));
    return candidates;
  }
  const FAMILY_GENERATORS = {
    [FAMILY_IDS.C_FRONT_PAIR]: generateC_FRONT_PAIR,
    [FAMILY_IDS.FRONT_THIRD_PAIR]: generateFRONT_THIRD_PAIR,
    [FAMILY_IDS.FRONT_CORNER_PAIR]: generateFRONT_CORNER_PAIR,
    [FAMILY_IDS.REAR_QUARTER_PAIR]: generateREAR_QUARTER_PAIR,
    [FAMILY_IDS.REAR_THIRD_PAIR]: generateREAR_THIRD_PAIR,
    [FAMILY_IDS.REAR_CORNER_PAIR]: generateREAR_CORNER_PAIR,
    [FAMILY_IDS.RP22_F]: generateRP22_F,
    [FAMILY_IDS.RP22_G]: generateRP22_G,
    [FAMILY_IDS.RP22_C]: generateRP22_C,
    [FAMILY_IDS.RP22_E]: generateRP22_E,
    [FAMILY_IDS.FOUR_THIRD_PAIRS]: generateFOUR_THIRD_PAIRS,
    [FAMILY_IDS.RP22_D]: generateRP22_D
  };
  function generateStage1Candidates(quantity) {
    var _a;
    let candidates = [];
    const rejected = [];
    if (quantity === 1) {
      candidates = generateOneSub();
    } else if (quantity === 2) {
      for (const familyId of ENABLED_FAMILIES[2]) {
        const gen = FAMILY_GENERATORS[familyId];
        if (gen) candidates.push(...gen());
      }
      candidates.push(...generateTwoSubFallback());
    } else if (quantity === 4) {
      for (const familyId of ENABLED_FAMILIES[4]) {
        const gen = FAMILY_GENERATORS[familyId];
        if (gen) candidates.push(...gen());
      }
      candidates.push(...generateFourSubFallback());
    }
    const { accepted, rejected: aRejected } = filterAProhibited(candidates);
    rejected.push(...aRejected);
    const budget = ((_a = STAGE1_CANDIDATE_BUDGETS[quantity]) == null ? void 0 : _a.normal) || 100;
    const capped = accepted.slice(0, budget);
    const familyCoverage = {};
    for (const c of capped) {
      familyCoverage[c.familyId] = (familyCoverage[c.familyId] || 0) + 1;
    }
    return { candidates: capped, rejected, familyCoverage };
  }
  function generateFineCandidates(familyId, bestParam) {
    if (familyId === FAMILY_IDS.C_FRONT_PAIR) return generateC_FRONT_PAIR_Fine(bestParam);
    if (familyId === FAMILY_IDS.FRONT_THIRD_PAIR) return generateFRONT_THIRD_PAIR_Fine(bestParam);
    if (familyId === FAMILY_IDS.REAR_QUARTER_PAIR) return generateREAR_QUARTER_PAIR_Fine(bestParam);
    if (familyId === FAMILY_IDS.REAR_THIRD_PAIR) return generateREAR_THIRD_PAIR_Fine(bestParam);
    if (familyId === FAMILY_IDS.RP22_C) return generateRP22_C_Fine(bestParam);
    if (familyId === FAMILY_IDS.FOUR_THIRD_PAIRS) return generateFOUR_THIRD_PAIRS_Fine(bestParam);
    if (familyId === FAMILY_IDS.RP22_D) return generateRP22_D_Fine(bestParam);
    return [];
  }
  const PRIMARY = "primary";
  const SECONDARY = "secondary";
  function resolveSeatPriority(seat) {
    const p = seat == null ? void 0 : seat.priority;
    return p === SECONDARY ? SECONDARY : PRIMARY;
  }
  const mean = (values) => values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  function filterToScreeningBand(curve) {
    return (curve || []).filter(
      (p) => p.frequency >= STAGE1_SCREENING_FREQ_MIN_HZ && p.frequency <= STAGE1_SCREENING_FREQ_MAX_HZ && Number.isFinite(p.spl)
    );
  }
  function smoothCurve(curve) {
    const radius = STAGE1_NULL_RULE.smoothingRadiusBins;
    return curve.map((point, index) => {
      const values = curve.slice(Math.max(0, index - radius), index + radius + 1).map((item) => item.spl).filter(Number.isFinite);
      return { frequency: point.frequency, spl: mean(values) };
    });
  }
  function detectBroadNulls(curve) {
    const smooth = smoothCurve(curve);
    const depths = smooth.map((point, index) => {
      const radius = STAGE1_NULL_RULE.shoulderRadiusBins;
      const shoulders = smooth.slice(Math.max(0, index - radius), Math.max(0, index - 1)).concat(smooth.slice(index + 2, index + radius + 1)).map((item) => item.spl).filter(Number.isFinite);
      return { ...point, depthDb: Math.max(0, mean(shoulders) - point.spl) };
    });
    const groups = [];
    let active = [];
    depths.forEach((point) => {
      if (point.depthDb >= STAGE1_NULL_RULE.destructiveDepthDb) active.push(point);
      else if (active.length) {
        groups.push(active);
        active = [];
      }
    });
    if (active.length) groups.push(active);
    return groups.filter((group) => group.length >= STAGE1_NULL_RULE.minimumContiguousBins).map((group) => ({
      centreHz: group.reduce((best, item) => item.depthDb > best.depthDb ? item : best).frequency,
      depthDb: Math.max(...group.map((item) => item.depthDb)),
      bins: group.length
    }));
  }
  function seatVariationFromMean(curve) {
    if (!curve.length) return 0;
    const avg = mean(curve.map((p) => p.spl));
    return Math.sqrt(mean(curve.map((p) => (p.spl - avg) ** 2)));
  }
  function seatRspDifference(seatCurve, rspCurve) {
    if (!seatCurve.length || !rspCurve.length) return 0;
    const rspByHz = new Map(rspCurve.map((p) => [p.frequency, p.spl]));
    const diffs = seatCurve.map((p) => {
      const rsp = rspByHz.get(p.frequency);
      return Number.isFinite(rsp) ? Math.abs(p.spl - rsp) : null;
    }).filter(Number.isFinite);
    return mean(diffs);
  }
  function worstSpatialVariation(curves) {
    if (curves.length < 2) return 0;
    const length = Math.min(...curves.map((c) => c.length));
    let worst = 0;
    for (let i = 0; i < length; i += 1) {
      const values = curves.map((c) => {
        var _a;
        return (_a = c[i]) == null ? void 0 : _a.spl;
      }).filter(Number.isFinite);
      if (values.length > 1) {
        const variation = Math.max(...values) - Math.min(...values);
        if (variation > worst) worst = variation;
      }
    }
    return worst;
  }
  function screenCandidate({ transferResult, seatingPositions, candidate }) {
    const rspCurve = filterToScreeningBand(transferResult.rspCurve);
    const seatCurvesRaw = (transferResult.seatCurves || []).map((sc) => ({
      seatKey: sc.seatKey,
      originalSeatId: sc.originalSeatId,
      curve: filterToScreeningBand(sc.responseData)
    }));
    const seatPriorityMap = /* @__PURE__ */ new Map();
    (Array.isArray(seatingPositions) ? seatingPositions : []).forEach((seat) => {
      const id = String(seat.id || "");
      if (id) seatPriorityMap.set(id, resolveSeatPriority(seat));
    });
    const primaryCurves = [];
    const secondaryCurves = [];
    seatCurvesRaw.forEach((sc) => {
      const id = String(sc.originalSeatId || "");
      const priority = seatPriorityMap.get(id) || PRIMARY;
      if (priority === PRIMARY) primaryCurves.push(sc.curve);
      else secondaryCurves.push(sc.curve);
    });
    const primaryPerSeat = primaryCurves.map((curve) => {
      const nulls = detectBroadNulls(curve);
      const worstNullDepth = Math.max(0, ...nulls.map((n) => n.depthDb));
      const hasSevereNull = nulls.some((n) => n.depthDb >= STAGE1_NULL_RULE.severeDepthDb);
      const variationFromMean = seatVariationFromMean(curve);
      const rspDiff = seatRspDifference(curve, rspCurve);
      return { nulls, worstNullDepth, hasSevereNull, variationFromMean, rspDiff };
    });
    secondaryCurves.map((curve) => ({
      variationFromMean: seatVariationFromMean(curve)
    }));
    const primarySevereProblemCount = primaryPerSeat.filter((s) => s.hasSevereNull).length;
    const worstPrimarySpatialVariation = worstSpatialVariation(primaryCurves);
    const primaryResponseSmoothness = -mean(primaryPerSeat.map((s) => s.variationFromMean));
    const primaryRspCoherence = -mean(primaryPerSeat.map((s) => s.rspDiff));
    const secondarySpatialConsistency = secondaryCurves.length > 1 ? worstSpatialVariation(secondaryCurves) : 0;
    const efficiencyIndicator = rspCurve.length ? mean(rspCurve.map((p) => p.spl)) : 0;
    const familyPreferenceRank = getFamilyPreferenceRank(candidate.familyId);
    const rankingTuple = [
      -primarySevereProblemCount,
      -worstPrimarySpatialVariation,
      primaryResponseSmoothness,
      primaryRspCoherence,
      -secondarySpatialConsistency,
      efficiencyIndicator,
      -familyPreferenceRank
    ];
    return {
      familyId: candidate.familyId,
      sourceCount: candidate.sources.length,
      primarySevereProblemCount,
      worstPrimarySpatialVariation,
      primaryResponseSmoothness,
      primaryRspCoherence,
      secondarySpatialConsistency,
      efficiencyIndicator,
      familyPreferenceRank,
      rankingTuple,
      primarySeatCount: primaryCurves.length,
      secondarySeatCount: secondaryCurves.length,
      rspAvailable: rspCurve.length > 0
    };
  }
  function compareScreeningResults(a, b) {
    a.rankingTuple;
    b.rankingTuple;
    const tol = STAGE1_TIE_TOLERANCE;
    if (a.primarySevereProblemCount !== b.primarySevereProblemCount) {
      return a.primarySevereProblemCount - b.primarySevereProblemCount;
    }
    if (Math.abs(a.worstPrimarySpatialVariation - b.worstPrimarySpatialVariation) > tol.variationDb) {
      return a.worstPrimarySpatialVariation - b.worstPrimarySpatialVariation;
    }
    if (Math.abs(a.primaryResponseSmoothness - b.primaryResponseSmoothness) > tol.smoothnessDb) {
      return b.primaryResponseSmoothness - a.primaryResponseSmoothness;
    }
    if (Math.abs(a.primaryRspCoherence - b.primaryRspCoherence) > tol.coherenceDb) {
      return b.primaryRspCoherence - a.primaryRspCoherence;
    }
    if (Math.abs(a.secondarySpatialConsistency - b.secondarySpatialConsistency) > tol.variationDb) {
      return a.secondarySpatialConsistency - b.secondarySpatialConsistency;
    }
    if (Math.abs(a.efficiencyIndicator - b.efficiencyIndicator) > tol.efficiencyDb) {
      return b.efficiencyIndicator - a.efficiencyIndicator;
    }
    return a.familyPreferenceRank - b.familyPreferenceRank;
  }
  const round = (v, d = 3) => Number(Number(v || 0).toFixed(d));
  function candidateToSources(candidate, roomDims) {
    return candidate.sources.map((s, i) => ({
      id: `stage1-src-${i + 1}`,
      x: s.xNorm * roomDims.widthM,
      y: s.yNorm * roomDims.lengthM,
      z: STAGE1_FALLBACK_SOURCE_HEIGHT_M,
      placement: "front",
      tuning: { gainDb: 0, delayMs: 0, polarity: 0 }
    }));
  }
  function evaluateCandidate(candidate, roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes) {
    const sources = candidateToSources(candidate, roomDims);
    const transfer = computeNormalizedRoomTransfer({
      roomDims,
      rspPosition,
      seatingPositions,
      subsForSimulation: sources,
      physicsOptions,
      pointsPerOctave: STAGE1_POINTS_PER_OCTAVE,
      preparedModes
    });
    if (transfer.status !== "complete") return null;
    const screening = screenCandidate({ transferResult: transfer, seatingPositions, candidate });
    return { ...candidate, screening, transfer };
  }
  function extractBestParam(candidate) {
    var _a;
    if (!((_a = candidate == null ? void 0 : candidate.sources) == null ? void 0 : _a.length)) return 0.25;
    const s = candidate.sources[0];
    const q = s.xNorm < 0.5 ? s.xNorm : 1 - s.xNorm;
    return q;
  }
  function selectFinalists(ranked, quantity) {
    const maxFinalists = STAGE1_FINALIST_COUNT[quantity] || 5;
    const finalists = [];
    const familiesSeen = /* @__PURE__ */ new Set();
    for (const candidate of ranked) {
      if (finalists.length >= maxFinalists) break;
      if (!familiesSeen.has(candidate.familyId)) {
        finalists.push(candidate);
        familiesSeen.add(candidate.familyId);
      }
    }
    for (const candidate of ranked) {
      if (finalists.length >= maxFinalists) break;
      if (familiesSeen.has(candidate.familyId)) {
        const sameFamilyFinalists = finalists.filter((f) => f.familyId === candidate.familyId);
        const isMateriallyDifferent = sameFamilyFinalists.every((f) => {
          const maxDisp = Math.max(...candidate.sources.map((cs, i) => {
            const fs = f.sources[i];
            if (!fs) return 1;
            return Math.sqrt((cs.xNorm - fs.xNorm) ** 2 + (cs.yNorm - fs.yNorm) ** 2);
          }));
          return maxDisp >= STAGE1_DIVERSITY_MIN_DISPLACEMENT_NORM;
        });
        if (isMateriallyDifferent) {
          finalists.push(candidate);
          familiesSeen.add(candidate.familyId);
        }
      }
    }
    return finalists.slice(0, maxFinalists);
  }
  function runStage1SearchForQuantity({ roomDims, rspPosition, seatingPositions, physicsOptions, quantity, generationId }) {
    const started = performance.now();
    const W = Number(roomDims.widthM);
    const L = Number(roomDims.lengthM);
    Number(roomDims.heightM);
    const engineOptions = {
      ...physicsOptions,
      freqMaxHz: 200
    };
    const preparedModes = prepareModeBank(roomDims, engineOptions);
    const { candidates: coarseCandidates, rejected, familyCoverage } = generateStage1Candidates(quantity);
    const coarseResults = [];
    for (const candidate of coarseCandidates) {
      if (generationId && generationId.cancelled) return null;
      const evaluated = evaluateCandidate(candidate, roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes);
      if (evaluated) coarseResults.push(evaluated);
    }
    coarseResults.sort(compareScreeningResults);
    const fineResults = [];
    const parameterisedFamilies = [
      FAMILY_IDS.C_FRONT_PAIR,
      FAMILY_IDS.FRONT_THIRD_PAIR,
      FAMILY_IDS.REAR_QUARTER_PAIR,
      FAMILY_IDS.REAR_THIRD_PAIR,
      FAMILY_IDS.RP22_C,
      FAMILY_IDS.FOUR_THIRD_PAIRS,
      FAMILY_IDS.RP22_D
    ];
    for (const familyId of parameterisedFamilies) {
      if (generationId && generationId.cancelled) return null;
      const hasFamily = coarseResults.some((r) => r.familyId === familyId);
      if (!hasFamily) continue;
      const bestInFamily = coarseResults.find((r) => r.familyId === familyId);
      if (!bestInFamily) continue;
      const bestParam = extractBestParam(bestInFamily);
      const fineCandidates = generateFineCandidates(familyId, bestParam);
      for (const candidate of fineCandidates) {
        if (generationId && generationId.cancelled) return null;
        const exists = coarseResults.some((r) => r.id === candidate.id);
        if (exists) continue;
        const evaluated = evaluateCandidate(candidate, roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes);
        if (evaluated) fineResults.push(evaluated);
      }
    }
    const allResults = [...coarseResults, ...fineResults];
    const seen = /* @__PURE__ */ new Map();
    for (const r of allResults) seen.set(r.id, r);
    const deduped = Array.from(seen.values());
    deduped.sort(compareScreeningResults);
    const finalists = selectFinalists(deduped, quantity);
    let aProhibitionPass = true;
    for (const f of finalists) {
      const validation = validateAProhibition(f.sources);
      if (!validation.passes) {
        aProhibitionPass = false;
        break;
      }
    }
    const elapsedMs = performance.now() - started;
    const compactFinalists = finalists.map((f) => ({
      id: f.id,
      familyId: f.familyId,
      sources: f.sources.map((s) => ({
        xNorm: s.xNorm,
        yNorm: s.yNorm,
        x: round(s.xNorm * W, 3),
        y: round(s.yNorm * L, 3),
        z: STAGE1_FALLBACK_SOURCE_HEIGHT_M
      })),
      screening: f.screening,
      searchTier: f.searchTier,
      symmetryState: f.symmetryState,
      seedDisplacement: f.seedDisplacement
    }));
    return {
      quantity,
      status: "complete",
      candidateCount: deduped.length,
      coarseCandidateCount: coarseResults.length,
      fineCandidateCount: fineResults.length,
      rejectedCount: rejected.length,
      familyCoverage,
      finalists: compactFinalists,
      aProhibitionValidation: aProhibitionPass ? "PASS" : "FAIL",
      bEvaluated: false,
      searchTimingMs: round(elapsedMs, 1),
      tiersExhausted: ["coarse", "fine"]
    };
  }
  function runFullStage1Search({ roomDims, rspPosition, seatingPositions, physicsOptions, generationId }) {
    const overallStart = performance.now();
    const physics = physicsOptions || DEFAULT_BEST_SUB_LAYOUT_PHYSICS;
    const quantities = [2, 4, 1];
    const quantityResultKeys = {
      1: "one_sub_result",
      2: "two_sub_result",
      4: "four_sub_result"
    };
    const results = {};
    for (const quantity of quantities) {
      if (generationId && generationId.cancelled) return null;
      const result = runStage1SearchForQuantity({
        roomDims,
        rspPosition,
        seatingPositions,
        physicsOptions: physics,
        quantity,
        generationId
      });
      if (generationId && generationId.cancelled) return null;
      if (result) results[quantityResultKeys[quantity]] = result;
    }
    const totalMs = performance.now() - overallStart;
    return {
      results,
      totalWallClockMs: round(totalMs, 1)
    };
  }
  let activeJob = null;
  self.onmessage = (event) => {
    const message = event.data || {};
    if (message.type === "cancel") {
      if ((activeJob == null ? void 0 : activeJob.requestId) === message.requestId) {
        activeJob.cancellationChecker.cancelled = true;
      }
      return;
    }
    if (message.type || !message.requestId) return;
    const { requestId, fingerprint: fingerprint2, payload } = message;
    const cancellationChecker = { cancelled: false };
    activeJob = { requestId, cancellationChecker };
    try {
      const result = runFullStage1Search({
        roomDims: payload.roomDims,
        rspPosition: payload.rspPosition,
        seatingPositions: payload.seatingPositions,
        physicsOptions: payload.physicsOptions,
        generationId: cancellationChecker
      });
      if (cancellationChecker.cancelled) {
        self.postMessage({ type: "cancelled", requestId, fingerprint: fingerprint2 });
        return;
      }
      self.postMessage({ type: "complete", requestId, fingerprint: fingerprint2, result });
    } catch (error) {
      if (cancellationChecker.cancelled) {
        self.postMessage({ type: "cancelled", requestId, fingerprint: fingerprint2 });
        return;
      }
      self.postMessage({ type: "error", requestId, fingerprint: fingerprint2, error: (error == null ? void 0 : error.message) || String(error) });
    } finally {
      activeJob = null;
    }
  };
})();
