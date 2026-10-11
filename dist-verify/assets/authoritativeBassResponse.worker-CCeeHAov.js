(function() {
  "use strict";
  const SPEED_OF_SOUND_MPS$2 = 343;
  function computeRoomModesLocal({ widthM, lengthM, heightM, fMax, c = SPEED_OF_SOUND_MPS$2 }) {
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
  const SPEED_OF_SOUND_MPS$1 = 343;
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
    const k = 2 * Math.PI * frequencyHz / SPEED_OF_SOUND_MPS$1;
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
      const kr = 2 * Math.PI * mode.freq / SPEED_OF_SOUND_MPS$1;
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
    const propagationPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS$1) * propagationPhaseScale;
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
      c: SPEED_OF_SOUND_MPS$1
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
      const timeOfFlightPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS$1);
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
        const imageTimeOfFlightPhase = -2 * Math.PI * frequencyHz * (imageDistanceM / SPEED_OF_SOUND_MPS$1);
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
          const imageTimeOfFlightPhase = -2 * Math.PI * frequencyHz * (imageDistanceM / SPEED_OF_SOUND_MPS$1);
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
  const SPEED_OF_SOUND_MPS = 343;
  function buildAbModes(modes, { abGlobalQScale, abMidbandQScale, roomIsSealed, applyModeMultiplicity }) {
    const scaled = modes.map((mode) => {
      mode.freq >= 70 && mode.freq <= 120;
      return mode;
    });
    return roomIsSealed ? [{ nx: 0, ny: 0, nz: 0, freq: 0, type: "zero", qValue: 1, abSpectralWeight: void 0 }, ...scaled] : scaled;
  }
  function computeSourceFrequencyAmplitude(sourceCurve, gainDb, freqsHz) {
    const safeGainDb = Number.isFinite(gainDb) ? Number(gainDb) : 0;
    const amplitude = new Float64Array(freqsHz.length);
    for (let fi = 0; fi < freqsHz.length; fi++) {
      const curveDb = interpolateCurveDb(sourceCurve, freqsHz[fi]);
      amplitude[fi] = Math.pow(10, (curveDb + safeGainDb) / 20);
    }
    return amplitude;
  }
  function computeModeFrequencyResponse(abModes, freqsHz) {
    const nModes = abModes.length;
    const nFreqs = freqsHz.length;
    const re = new Float64Array(nModes * nFreqs);
    const im = new Float64Array(nModes * nFreqs);
    const kr = new Float64Array(nModes);
    for (let mi = 0; mi < nModes; mi++) {
      kr[mi] = 2 * Math.PI * abModes[mi].freq / SPEED_OF_SOUND_MPS;
    }
    for (let fi = 0; fi < nFreqs; fi++) {
      const f = freqsHz[fi];
      const k = 2 * Math.PI * f / SPEED_OF_SOUND_MPS;
      const kSq = k * k;
      for (let mi = 0; mi < nModes; mi++) {
        const kr_mi = kr[mi];
        const realDen = kr_mi * kr_mi - kSq;
        const imagDen = k * kr_mi / Math.max(abModes[mi].qValue, 1e-6);
        const denomSq = realDen * realDen + imagDen * imagDen;
        const idx = mi * nFreqs + fi;
        re[idx] = realDen / denomSq;
        im[idx] = -imagDen / denomSq;
      }
    }
    return { re, im };
  }
  function computeSourceModeCoupling(sources, abModes, roomDims) {
    const nSources = sources.length;
    const nModes = abModes.length;
    const coupling = new Float64Array(nSources * nModes);
    for (let si = 0; si < nSources; si++) {
      const src = sources[si];
      for (let mi = 0; mi < nModes; mi++) {
        coupling[si * nModes + mi] = modeShapeValueLocal(
          abModes[mi],
          src.x,
          src.y,
          src.z,
          roomDims
        );
      }
    }
    return coupling;
  }
  function computeListenerModeCoupling(listeners, abModes, roomDims) {
    const nListeners = listeners.length;
    const nModes = abModes.length;
    const coupling = new Float64Array(nListeners * nModes);
    for (let li = 0; li < nListeners; li++) {
      const lis = listeners[li];
      for (let mi = 0; mi < nModes; mi++) {
        coupling[li * nModes + mi] = modeShapeValueLocal(
          abModes[mi],
          lis.x,
          lis.y,
          lis.z,
          roomDims
        );
      }
    }
    return coupling;
  }
  function computeModeWeights(abModes, applyModeMultiplicity) {
    const nModes = abModes.length;
    const weights = new Float64Array(nModes);
    for (let mi = 0; mi < nModes; mi++) {
      const mode = abModes[mi];
      const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
      const modeMultiplicity = applyModeMultiplicity ? Math.pow(2, activeAxes) : 1;
      const spectralWeight = Number.isFinite(Number(mode.abSpectralWeight)) ? Math.max(0, Math.min(1, Number(mode.abSpectralWeight))) : 1;
      weights[mi] = modeMultiplicity * spectralWeight;
    }
    return weights;
  }
  function computeTuningRotation(delayMs, polarity, phaseControlDeg, freqsHz) {
    const cos = new Float64Array(freqsHz.length);
    const sin = new Float64Array(freqsHz.length);
    for (let fi = 0; fi < freqsHz.length; fi++) {
      const f = freqsHz[fi];
      const tuningPhase = tuningPhaseRadians(f, { delayMs, polarity, phaseControlDeg });
      cos[fi] = Math.cos(tuningPhase);
      sin[fi] = Math.sin(tuningPhase);
    }
    return { cos, sin };
  }
  function prepareSourceRoomField({
    roomDims,
    sources,
    precomputedModes,
    physics,
    qStrategyOverride,
    freqMinHz = 15,
    freqMaxHz = 200,
    precomputedFreqsHz
  }) {
    var _a, _b, _c, _d, _e;
    const widthM = Number(roomDims.widthM);
    const lengthM = Number(roomDims.lengthM);
    const heightM = Number(roomDims.heightM);
    const roomVolumeM3 = widthM * lengthM * heightM;
    const abSqrtVScale = Math.sqrt(Math.max(roomVolumeM3, 1e-6));
    const invSqrtV = 1 / abSqrtVScale;
    const isAbCorrected = qStrategyOverride === "ab_corrected";
    const applyModeMultiplicity = isAbCorrected ? true : physics.abApplyModeMultiplicity;
    const roomIsSealed = isAbCorrected ? true : physics.roomIsSealed;
    const abGlobalQScale = 1;
    const abMidbandQScale = 1;
    const freqsHz = Array.isArray(precomputedFreqsHz) && precomputedFreqsHz.length ? precomputedFreqsHz : buildFrequencyAxis(freqMinHz, freqMaxHz, void 0);
    const nFreqs = freqsHz.length;
    const abModes = buildAbModes(precomputedModes, {
      abGlobalQScale,
      abMidbandQScale,
      roomIsSealed,
      applyModeMultiplicity
    });
    const nModes = abModes.length;
    const t0 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const modeFreq = computeModeFrequencyResponse(abModes, freqsHz);
    const t1 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const sourceModeCoupling = computeSourceModeCoupling(sources, abModes, { widthM, lengthM, heightM });
    const t2 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const modeWeight = computeModeWeights(abModes, applyModeMultiplicity);
    const t3 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const nSources = sources.length;
    const sourceFreqAmplitude = new Array(nSources);
    const sourceTuningCos = new Array(nSources);
    const sourceTuningSin = new Array(nSources);
    for (let si = 0; si < nSources; si++) {
      const src = sources[si];
      const sourceCurve = src.sourceCurve || src._sourceCurve;
      sourceFreqAmplitude[si] = computeSourceFrequencyAmplitude(
        sourceCurve,
        ((_a = src.tuning) == null ? void 0 : _a.gainDb) ?? 0,
        freqsHz
      );
      const tuning = computeTuningRotation(
        ((_b = src.tuning) == null ? void 0 : _b.delayMs) ?? 0,
        ((_c = src.tuning) == null ? void 0 : _c.polarity) ?? 0,
        ((_d = src.tuning) == null ? void 0 : _d.phaseControlDeg) ?? ((_e = src.tuning) == null ? void 0 : _e.phaseAdjust) ?? 0,
        freqsHz
      );
      sourceTuningCos[si] = tuning.cos;
      sourceTuningSin[si] = tuning.sin;
    }
    const t4 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    return {
      _kind: "preparedSourceRoomField",
      abModes,
      modeFreq,
      sourceModeCoupling,
      modeWeight,
      sourceFreqAmplitude,
      sourceTuningCos,
      sourceTuningSin,
      invSqrtV,
      freqsHz,
      nModes,
      nFreqs,
      nSources,
      roomDims: { widthM, lengthM, heightM },
      timing: {
        modeFreqMs: t1 - t0,
        sourceModeMs: t2 - t1,
        modeWeightMs: t3 - t2,
        sourceFreqMs: t4 - t3,
        totalPrepMs: t4 - t0
      }
    };
  }
  function evaluateReceiversFromPreparedField(preparedField, listeners) {
    const {
      modeFreq,
      sourceModeCoupling,
      modeWeight,
      sourceFreqAmplitude,
      sourceTuningCos,
      sourceTuningSin,
      invSqrtV,
      freqsHz,
      nModes,
      nFreqs,
      nSources,
      roomDims,
      abModes
    } = preparedField;
    const nListeners = listeners.length;
    const t0 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const listenerModeCoupling = computeListenerModeCoupling(listeners, abModes, roomDims);
    const t1 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const perSourcePerListenerTransfers = [];
    for (let si = 0; si < nSources; si++) {
      for (let li = 0; li < nListeners; li++) {
        const reOut = new Float64Array(nFreqs);
        const imOut = new Float64Array(nFreqs);
        const smBase = si * nModes;
        const lmBase = li * nModes;
        for (let fi = 0; fi < nFreqs; fi++) {
          let rawSumRe = 0;
          let rawSumIm = 0;
          for (let mi = 0; mi < nModes; mi++) {
            const sCoupling = sourceModeCoupling[smBase + mi];
            const lCoupling = listenerModeCoupling[lmBase + mi];
            const mw = modeWeight[mi];
            const coupling = sCoupling * lCoupling * mw;
            const mfIdx = mi * nFreqs + fi;
            rawSumRe += coupling * modeFreq.re[mfIdx];
            rawSumIm += coupling * modeFreq.im[mfIdx];
          }
          const amplitude = sourceFreqAmplitude[si][fi];
          const scalar = amplitude * invSqrtV;
          const tCos = sourceTuningCos[si][fi];
          const tSin = sourceTuningSin[si][fi];
          reOut[fi] = scalar * (rawSumRe * tCos - rawSumIm * tSin);
          imOut[fi] = scalar * (rawSumRe * tSin + rawSumIm * tCos);
        }
        perSourcePerListenerTransfers.push({
          sourceIndex: si,
          listenerId: listeners[li].id,
          points: freqsHz.map((frequency, fi) => ({
            frequency,
            re: reOut[fi],
            im: imOut[fi]
          }))
        });
      }
    }
    const t2 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    return {
      freqsHz,
      perSourcePerListenerTransfers,
      timing: {
        listenerModeMs: t1 - t0,
        transferMatrixMs: t2 - t1
      }
    };
  }
  function evaluateBatchModalTransfers({
    roomDims,
    sources,
    listeners,
    precomputedModes,
    physics,
    qStrategyOverride,
    freqMinHz = 15,
    freqMaxHz = 200,
    collectDiagnostics = false,
    precomputedFreqsHz
  }) {
    const prepared = prepareSourceRoomField({
      roomDims,
      sources,
      precomputedModes,
      physics,
      qStrategyOverride,
      freqMinHz,
      freqMaxHz,
      precomputedFreqsHz
    });
    const receiverResult = evaluateReceiversFromPreparedField(prepared, listeners);
    const diagnostics = collectDiagnostics ? {
      nModes: prepared.nModes,
      nFreqs: prepared.nFreqs,
      nSources: prepared.nSources,
      nListeners: listeners.length,
      timing: {
        modeFreqMs: prepared.timing.modeFreqMs,
        sourceModeMs: prepared.timing.sourceModeMs,
        listenerModeMs: receiverResult.timing.listenerModeMs,
        modeWeightMs: prepared.timing.modeWeightMs,
        sourceFreqMs: prepared.timing.sourceFreqMs,
        transferMatrixMs: receiverResult.timing.transferMatrixMs,
        totalMs: prepared.timing.totalPrepMs + receiverResult.timing.listenerModeMs + receiverResult.timing.transferMatrixMs
      },
      memory: {
        modeFreqRe: prepared.modeFreq.re.byteLength,
        modeFreqIm: prepared.modeFreq.im.byteLength,
        sourceModeCoupling: prepared.sourceModeCoupling.byteLength,
        listenerModeCoupling: listeners.length * prepared.nModes * 8,
        modeWeight: prepared.modeWeight.byteLength,
        sourceFreqAmplitude: prepared.sourceFreqAmplitude.reduce((s, a) => s + a.byteLength, 0),
        perSourcePerListenerTransfers: receiverResult.perSourcePerListenerTransfers.length * prepared.nFreqs * 2 * 8
      }
    } : null;
    return {
      freqsHz: receiverResult.freqsHz,
      perSourcePerListenerTransfers: receiverResult.perSourcePerListenerTransfers,
      diagnostics
    };
  }
  const trace = (rows) => Object.freeze(rows.map(([frequency, spl, phaseDeg]) => Object.freeze({ frequency, spl, phaseDeg })));
  const SUB2_12_TRACE = trace([
    [15, 104.854677, -172],
    [16, 105.974677, -168],
    [18, 108.004077, -162],
    [20, 109.834077, -154.750161],
    [20.667821, 110.273388, -158.005197],
    [21.357941, 110.704815, -109.875424],
    [22.071105, 111.128169, -74.635948],
    [22.808082, 111.543403, -47.990048],
    [23.569668, 112.388911, -14.578634],
    [24.356684, 113.2117, 18.749651],
    [25.169979, 114.011667, 52.032845],
    [26.010431, 114.787945, 85.304814],
    [26.878946, 115.535432, 118.59491],
    [27.776463, 116.216718, 151.937236],
    [28.703948, 116.830701, 145.362078],
    [29.662402, 117.376755, 138.895082],
    [30.652861, 117.854601, 132.556838],
    [31.676392, 118.264182, 126.362845],
    [32.7341, 118.60555, 120.323809],
    [33.827126, 118.878772, 114.446179],
    [34.956649, 119.082294, 108.734061],
    [36.123888, 119.220303, 103.192661],
    [37.330102, 119.331442, 97.819483],
    [38.576594, 119.418318, 92.610417],
    [39.864706, 119.483255, 87.560234],
    [41.195831, 119.528309, 82.662978],
    [42.571402, 119.555307, 77.912253],
    [43.992906, 119.561129, 73.304738],
    [45.461875, 119.546064, 68.833568],
    [46.979895, 119.514137, 64.49435],
    [48.548602, 119.468182, 60.282018],
    [50.169691, 119.409154, 56.189627],
    [51.844909, 119.33611, 52.214996],
    [53.576065, 119.244845, 48.363394],
    [55.365026, 119.135719, 44.627324],
    [57.213722, 119.009021, 40.999177],
    [59.124148, 118.869713, 37.467893],
    [61.098365, 118.714913, 34.04603],
    [63.138504, 118.541411, 30.741723],
    [65.246764, 118.348811, 27.548408],
    [67.425422, 118.136619, 24.459233],
    [69.676827, 117.902453, 21.492186],
    [72.003409, 117.64665, 18.658627],
    [74.407678, 117.367894, 15.95538],
    [76.892229, 117.064637, 13.379164],
    [79.45974, 116.729304, 11.015719],
    [82.112984, 116.362858, 8.859129],
    [84.854823, 115.96549, 6.90406],
    [87.688214, 115.533129, 5.262024],
    [90.616215, 115.329674, 4.318794],
    [93.641985, 115.114451, 3.454324],
    [96.768789, 114.889034, 2.660156],
    [100, 114.650755, 1.971426]
  ]);
  const SUB3_12_TRACE = trace([
    [20, 114.875867, 84.162794],
    [20.962263, 115.447429, 98.036585],
    [21.970823, 116.018283, 105.964695],
    [23.027908, 116.590059, 110.512586],
    [24.135853, 117.739395, 153.825413],
    [25.297104, 118.857071, 145.850222],
    [26.514227, 119.879525, 137.976506],
    [27.78991, 120.801581, 130.185025],
    [29.12697, 121.617017, 122.464022],
    [30.528359, 122.318487, 114.808757],
    [31.997174, 122.897782, 107.222839],
    [33.536659, 123.34605, 99.718111],
    [35.150212, 123.685709, 92.294269],
    [36.841399, 123.976824, 84.991703],
    [38.613955, 124.221536, 77.838903],
    [40.471793, 124.422886, 70.860249],
    [42.419018, 124.584963, 64.076731],
    [44.45993, 124.708902, 57.481314],
    [46.599036, 124.800342, 51.082463],
    [48.841062, 124.867557, 44.900897],
    [51.190958, 124.916677, 38.93592],
    [53.653916, 124.949812, 33.158453],
    [56.235374, 124.97244, 27.551785],
    [58.941034, 124.989694, 22.095171],
    [61.776872, 125.005326, 16.773052],
    [64.749151, 125.022763, 11.554981],
    [67.864435, 125.046006, 6.410477],
    [71.129606, 125.073107, 1.296343],
    [74.551874, 125.111289, -3.806785],
    [78.138799, 125.160564, -8.942846],
    [81.898301, 125.220765, -14.162761],
    [85.838685, 125.29805, -19.50686],
    [89.968653, 125.390605, -25.036494],
    [94.297327, 125.499138, -30.826273],
    [98.834267, 125.625049, -36.952496],
    [103.589494, 125.76473, -43.522329],
    [108.573509, 125.912224, -50.661762],
    [113.797321, 126.055142, -58.51253],
    [119.272466, 126.17237, -67.239577],
    [125.011039, 126.229286, -76.974704],
    [131.025711, 126.176729, -87.793223],
    [137.329769, 125.961389, -99.657056],
    [143.937135, 125.526675, -112.380617],
    [150.862401, 124.827297, -125.639792],
    [158.120864, 123.837027, -139.051561],
    [165.728555, 122.544817, -100.76488],
    [173.702275, 120.961024, -61.810939],
    [182.059636, 120.198782, -51.271832],
    [190.819095, 119.326351, -33.553504],
    [200, 118.358132, -3.386624]
  ]);
  const SUB4_12_TRACE = trace([
    [12, 116.203406, 169],
    [15, 120.066431, 162],
    [18, 121.781581, 156],
    [20, 122.203406, 151.325394],
    [20.962263, 122.230291, 148.400661],
    [21.970823, 122.275232, 145.568623],
    [23.027908, 122.348335, 142.740505],
    [24.135853, 122.517668, 136.670344],
    [25.297104, 122.721037, 130.79328],
    [26.514227, 122.987299, 124.716081],
    [27.78991, 123.319257, 118.205731],
    [29.12697, 123.70317, 111.138085],
    [30.528359, 124.105171, 103.484174],
    [31.997174, 124.48933, 95.304201],
    [33.536659, 124.823002, 86.734306],
    [35.150212, 125.079653, 77.944907],
    [36.841399, 125.247681, 69.167543],
    [38.613955, 125.328553, 60.615367],
    [40.471793, 125.327746, 52.4659],
    [42.419018, 125.265057, 44.842414],
    [44.45993, 125.168933, 37.850626],
    [46.599036, 125.061387, 31.480713],
    [48.841062, 124.959607, 25.679832],
    [51.190958, 124.874106, 20.362329],
    [53.653916, 124.807075, 15.417265],
    [56.235374, 124.761673, 10.755664],
    [58.941034, 124.739009, 6.298284],
    [61.776872, 124.727366, 1.915338],
    [64.749151, 124.724221, -2.448229],
    [67.864435, 124.731556, -6.819759],
    [71.129606, 124.74588, -11.238611],
    [74.551874, 124.773284, -15.720566],
    [78.138799, 124.812802, -20.305943],
    [81.898301, 124.863403, -25.041685],
    [85.838685, 124.929551, -29.96269],
    [89.968653, 125.007623, -35.124286],
    [94.297327, 125.096738, -40.59401],
    [98.834267, 125.196316, -46.438941],
    [103.589494, 125.300756, -52.752424],
    [108.573509, 125.401665, -59.638559],
    [113.797321, 125.484736, -67.207377],
    [119.272466, 125.529215, -75.581991],
    [125.011039, 125.504315, -84.84621],
    [131.025711, 125.368729, -95.035106],
    [137.329769, 125.080393, -106.098291],
    [143.937135, 124.594082, -117.876758],
    [150.862401, 123.872803, -130.103708],
    [158.120864, 122.894385, -142.468324],
    [165.728555, 121.647625, -103.195989],
    [173.702275, 120.138515, -63.390516],
    [182.059636, 119.416501, -52.35047],
    [190.819095, 118.597614, -34.21156],
    [200, 117.690453, -3.727474]
  ]);
  const capability = (usableLF_neg6dB, maxSPL, engineeringTrace) => Object.freeze({
    usableLF_neg6dB,
    frequencyResponseCurve: engineeringTrace,
    maxSPLCurve: Object.freeze(engineeringTrace.map(({ frequency, spl }) => Object.freeze({ frequency, spl }))),
    maxSPL,
    outputReference: "maximum continuous SPL at 1 m, half-space",
    responseModel: "frequency-dependent engineering curve"
  });
  const SUBWOOFER_BASS_CAPABILITIES = Object.freeze({
    "sub2-12": capability(22, 120, SUB2_12_TRACE),
    "sub3-12": capability(22, 125, SUB3_12_TRACE),
    "sub4-12": capability(12, 126, SUB4_12_TRACE)
  });
  function normaliseModelKey(name = "") {
    const raw = String(name).toLowerCase();
    let s = raw.replace(/[()]/g, " ").replace(/[^a-z0-9_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    s = s.replace(/^spitfire-q-(\d+)-(\d+)$/, "q$1-$2");
    s = s.replace(/^spitfire-q(\d+)-(\d+)$/, "q$1-$2");
    s = s.replace(/^evolve-(\d+)-(\d+)$/, "evolve-$1-$2");
    s = s.replace(/^architect-(pas2-2)$/, "architect-$1");
    s = s.replace(/^architect-mikro$/, "architect-mikro");
    if (s.endsWith("-s")) {
      s = s.slice(0, -2) + "_s";
    }
    return s;
  }
  const MODELS = [
    // LCR — EXACT ORDER
    { key: "q4-3", label: "Q4-3", category: "LCR", widthMm: 280, heightMm: 210, depthMm: 110, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 101, nominalOhms: 4, max_power: 120, max_spl_cont_db_1m_halfspace: 114, max_spl_peak_db_cf6_1m_halfspace: 120, max_spl_cont_db_1m_anechoic: 108, max_spl_peak_db_cf6_1m_anechoic: 114, frequency_response_low: 100, usable_lf_hz_minus6db: 97, coverage_deg: { horizontal: 90, vertical: 45 }, price_gbp_exVat: 1820, retailPriceGBP: 1820, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
    { key: "q6-3", label: "Q6-3", category: "LCR", widthMm: 280, heightMm: 280, depthMm: 110, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 100, nominalOhms: 10, max_power: 120, max_spl_cont_db_1m_halfspace: 118, max_spl_peak_db_cf6_1m_halfspace: 124, max_spl_cont_db_1m_anechoic: 112, max_spl_peak_db_cf6_1m_anechoic: 118, price_gbp_exVat: 2090, retailPriceGBP: 2090, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 39, minus3dB: 48, minus5dB: 64 } } },
    { key: "q4-5", label: "Q4-5", category: "LCR", widthMm: 500, heightMm: 400, depthMm: 160, sensitivity_dB_1w1m: 99, sensitivity_dB_2p83: 99, nominalOhms: 8, max_power: 400, max_spl_cont_db_1m_halfspace: 122, max_spl_peak_db_cf6_1m_halfspace: 128, max_spl_cont_db_1m_anechoic: 116, max_spl_peak_db_cf6_1m_anechoic: 122, price_gbp_exVat: 3910, retailPriceGBP: 3910, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 40, minus5deg: 50 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
    { key: "q8-5", label: "Q8-5", category: "LCR", widthMm: 500, heightMm: 600, depthMm: 160, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 106, nominalOhms: 4, max_power: 800, max_spl_cont_db_1m_halfspace: 128, max_spl_peak_db_cf6_1m_halfspace: 134, max_spl_cont_db_1m_anechoic: 122, max_spl_peak_db_cf6_1m_anechoic: 128, price_gbp_exVat: 5730, retailPriceGBP: 5730, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 40, minus5deg: 50 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
    { key: "evolve-1", label: "EVOLVE 1", category: "LCR", widthMm: 120, heightMm: 120, depthMm: 99, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 93, nominalOhms: 8, max_power: 30, max_spl_cont_db_1m_halfspace: 104, max_spl_peak_db_cf6_1m_halfspace: 110, max_spl_cont_db_1m_anechoic: 98, max_spl_peak_db_cf6_1m_anechoic: 104, frequency_response_low: 120, frequency_response_high: 2e4, usable_lf_hz_minus6db: 118, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: null },
    { key: "evolve-1-1", label: "EVOLVE 1-1", category: "LCR", widthMm: 150, heightMm: 150, depthMm: 72, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 93, nominalOhms: 8, max_power: 30, max_spl_cont_db_1m_halfspace: 104, max_spl_peak_db_cf6_1m_halfspace: 110, max_spl_cont_db_1m_anechoic: 98, max_spl_peak_db_cf6_1m_anechoic: 104, frequency_response_low: 120, frequency_response_high: 2e4, usable_lf_hz_minus6db: 118, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: null },
    { key: "sl-evolve-1-1", label: "SL EVOLVE 1-1", category: "LCR", widthMm: 150, heightMm: 150, depthMm: 72, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 93, nominalOhms: 8, max_power: 30, max_spl_cont_db_1m_halfspace: 102, max_spl_peak_db_cf6_1m_halfspace: 108, max_spl_cont_db_1m_anechoic: 96, max_spl_peak_db_cf6_1m_anechoic: 102, frequency_response_low: 90, frequency_response_high: 4e4, usable_lf_hz_minus6db: 87, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: 400, retailPriceGBP: 400, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-2-1", label: "EVOLVE 2-1", category: "LCR", widthMm: 200, heightMm: 200, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 100, nominalOhms: 4, max_power: 60, max_spl_cont_db_1m_halfspace: 108, max_spl_peak_db_cf6_1m_halfspace: 114, max_spl_cont_db_1m_anechoic: 102, max_spl_peak_db_cf6_1m_anechoic: 108, frequency_response_low: 90, frequency_response_high: 4e4, usable_lf_hz_minus6db: 87, coverage_deg: { horizontal: 70, vertical: 90 }, price_gbp_exVat: 780, retailPriceGBP: 780, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 31, minus3dB: 45, minus5dB: 64 } } },
    { key: "evolve-3-1", label: "EVOLVE 3-1", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 101, nominalOhms: 3, max_power: 90, max_spl_cont_db_1m_halfspace: 110, max_spl_peak_db_cf6_1m_halfspace: 116, max_spl_cont_db_1m_anechoic: 104, max_spl_peak_db_cf6_1m_anechoic: 110, frequency_response_low: 80, frequency_response_high: 4e4, usable_lf_hz_minus6db: 77, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: 1170, retailPriceGBP: 1170, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 39, minus3dB: 55, minus5dB: 73 } } },
    { key: "evolve-4-2", label: "EVOLVE 4-2", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 99, nominalOhms: 4, max_power: 120, max_spl_cont_db_1m_halfspace: 113, max_spl_peak_db_cf6_1m_halfspace: 119, max_spl_cont_db_1m_anechoic: 107, max_spl_peak_db_cf6_1m_anechoic: 113, frequency_response_low: 85, frequency_response_high: 4e4, usable_lf_hz_minus6db: 82, coverage_deg: { horizontal: 90, vertical: 58 }, price_gbp_exVat: 1780, retailPriceGBP: 1780, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
    { key: "evolve-6-3", label: "EVOLVE 6-3", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 103, nominalOhms: 4, max_power: 180, max_spl_cont_db_1m_halfspace: 118, max_spl_peak_db_cf6_1m_halfspace: 124, max_spl_cont_db_1m_anechoic: 112, max_spl_peak_db_cf6_1m_anechoic: 118, frequency_response_low: 90, frequency_response_high: 4e4, usable_lf_hz_minus6db: 87, coverage_deg: { horizontal: 90, vertical: 54 }, price_gbp_exVat: 2250, retailPriceGBP: 2250, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
    { key: "evolve-8-4", label: "EVOLVE 8-4", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 102, sensitivity_dB_2p83: 106, nominalOhms: 3, max_power: 240, max_spl_cont_db_1m_halfspace: 120, max_spl_peak_db_cf6_1m_halfspace: 126, max_spl_cont_db_1m_anechoic: 114, max_spl_peak_db_cf6_1m_anechoic: 120, frequency_response_low: 95, frequency_response_high: 3e4, usable_lf_hz_minus6db: 92, coverage_deg: { horizontal: 90, vertical: 50 }, price_gbp_exVat: 2720, retailPriceGBP: 2720, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
    // TODO: Replace C-1 dimensions with verified source dimensions if/when available.
    { key: "c-1", label: "C-1", category: "LCR", frontStageType: "center_only", widthType: "fixed", fixedWidthMm: 400, widthMm: 400, heightMm: 120, depthMm: 81, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 96, nominalOhms: 4, max_power: 60, max_spl: 108, peak_spl: 114, frequency_response_low: 90, usable_lf_hz_minus6db: 87, recommended_hpf_hz: 100, recommended_hpf_slope: "24dB/oct", hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 50, minus3dB: 70, minus5dB: 85 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 100 } } },
    // ONE loudspeaker, published in six cabinet lengths — 1222 mm (its smallest)
    // through 2230 mm. The lengths are the same acoustics in a different physical
    // width: sensitivity, impedance, power handling and maximum SPL are shared by
    // every variant, and only the cabinet width (and the illustration drawn for
    // it) changes. Three widths carry their own illustrated face artwork —
    // 1222 mm, 1441 mm and 1711 mm. tvWidthMap stays the preset-key lookup the TV
    // presets resolve through; cabinetLengthsMm is the catalogue's own list of
    // available variants, which the shared variant authority resolves against the
    // screen's physical width. dualCentreCabinetLengthMm names the variant the
    // dual-centre arrangement requires.
    { key: "c4-1", label: "C4-1", category: "LCR", frontStageType: "center_only", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, cabinetLengthsMm: [1222, 1411, 1441, 1711, 1872, 2230], dualCentreCabinetLengthMm: 1222, heightMm: 120, depthMm: 81, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 98, nominalOhms: 8, max_power: 120, max_spl: 109, peak_spl: 115, max_spl_cont_db_1m_halfspace: 109, max_spl_peak_db_cf6_1m_halfspace: 115, max_spl_cont_db_1m_anechoic: 103, max_spl_peak_db_cf6_1m_anechoic: 109, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 45, minus5deg: 60 }, dispersion: { horizontal: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 } } },
    { key: "multi-lcr", label: "Multi (LCR)", category: "LCR", frontStageType: "integrated_lcr", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 96, nominalOhms: 12, max_power: 60, max_spl: 108, peak_spl: 114, max_spl_cont_db_1m_halfspace: 108, max_spl_peak_db_cf6_1m_halfspace: 114, max_spl_cont_db_1m_anechoic: 102, max_spl_peak_db_cf6_1m_anechoic: 108, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 45, minus5deg: 60 }, dispersion: { horizontal: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 } } },
    { key: "multi-mono", label: "Multi (Mono)", category: "LCR", frontStageType: "center_only", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 101, sensitivity_dB_2p83: 101, nominalOhms: 12, max_power: 180, max_spl: 113, peak_spl: 119, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 45, minus5deg: 60 }, dispersion: { horizontal: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 } } },
    { key: "hspl-lcr", label: "HSPL (LCR)", category: "LCR", frontStageType: "integrated_lcr", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 98, nominalOhms: 8, max_power: 120, max_spl: 110, peak_spl: 116, max_spl_cont_db_1m_halfspace: 110, max_spl_peak_db_cf6_1m_halfspace: 116, max_spl_cont_db_1m_anechoic: 104, max_spl_peak_db_cf6_1m_anechoic: 110, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 50, minus3dB: 70, minus5dB: 85 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 100 } } },
    { key: "hspl-mono", label: "HSPL (Mono)", category: "LCR", frontStageType: "center_only", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 103, nominalOhms: 8, max_power: 360, max_spl: 115, peak_spl: 121, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 50, minus3dB: 70, minus5dB: 85 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 100 } } },
    // SURROUNDS — EXACT ORDER
    { key: "mikro", label: "MIKRO", category: "SURROUNDS", widthMm: 120, heightMm: 120, depthMm: 80, sensitivity_dB_1w1m: 86, sensitivity_dB_2p83: 86, nominalOhms: 8, max_power: 15, max_spl_cont_db_1m_halfspace: 102, max_spl_peak_db_cf6_1m_halfspace: 108, max_spl_cont_db_1m_anechoic: 96, max_spl_peak_db_cf6_1m_anechoic: 102, frequency_response_low: 300, frequency_response_high: 2e4, usable_lf_hz_minus6db: 297, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: null },
    { key: "evolve-1-1_s", label: "EVOLVE 1-1", category: "SURROUNDS", widthMm: 150, heightMm: 150, depthMm: 72, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 93, nominalOhms: 8, max_power: 30, max_spl_cont_db_1m_halfspace: 104, max_spl_peak_db_cf6_1m_halfspace: 110, max_spl_cont_db_1m_anechoic: 98, max_spl_peak_db_cf6_1m_anechoic: 104, frequency_response_low: 120, frequency_response_high: 2e4, usable_lf_hz_minus6db: 118, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: 550 },
    { key: "sl-evolve-1-1_s", label: "SL EVOLVE 1-1", category: "SURROUNDS", widthMm: 150, heightMm: 150, depthMm: 72, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 93, nominalOhms: 8, max_power: 30, max_spl_cont_db_1m_halfspace: 102, max_spl_peak_db_cf6_1m_halfspace: 108, max_spl_cont_db_1m_anechoic: 96, max_spl_peak_db_cf6_1m_anechoic: 102, frequency_response_low: 90, frequency_response_high: 4e4, usable_lf_hz_minus6db: 87, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: 400, retailPriceGBP: 400, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-2-1_s", label: "EVOLVE 2-1", category: "SURROUNDS", widthMm: 200, heightMm: 200, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 100, nominalOhms: 4, max_power: 60, price_gbp_exVat: 780, retailPriceGBP: 780, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-3-1_s", label: "EVOLVE 3-1", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 101, nominalOhms: 3, max_power: 90, price_gbp_exVat: 1170, retailPriceGBP: 1170, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-4-2_s", label: "EVOLVE 4-2", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 99, nominalOhms: 4, max_power: 120, price_gbp_exVat: 1780, retailPriceGBP: 1780, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-6-3_s", label: "EVOLVE 6-3", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 103, nominalOhms: 4, max_power: 180, price_gbp_exVat: 2250, retailPriceGBP: 2250, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-8-4_s", label: "EVOLVE 8-4", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 102, sensitivity_dB_2p83: 106, nominalOhms: 3, max_power: 240, price_gbp_exVat: 2720, retailPriceGBP: 2720, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "q4-3_s", label: "Q4-3", category: "SURROUNDS", widthMm: 280, heightMm: 210, depthMm: 110, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 101, nominalOhms: 4, max_power: 120, max_spl_cont_db_1m_halfspace: 114, max_spl_peak_db_cf6_1m_halfspace: 120, max_spl_cont_db_1m_anechoic: 108, max_spl_peak_db_cf6_1m_anechoic: 114, frequency_response_low: 100, usable_lf_hz_minus6db: 97, coverage_deg: { horizontal: 90, vertical: 45 }, price_gbp_exVat: 1820, retailPriceGBP: 1820, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "q6-3_s", label: "Q6-3", category: "SURROUNDS", widthMm: 280, heightMm: 280, depthMm: 110, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 100, nominalOhms: 10, max_power: 120, price_gbp_exVat: 2090, retailPriceGBP: 2090, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "q4-5_s", label: "Q4-5", category: "SURROUNDS", widthMm: 500, heightMm: 400, depthMm: 160, sensitivity_dB_1w1m: 99, sensitivity_dB_2p83: 99, nominalOhms: 8, max_power: 400, price_gbp_exVat: 3910, retailPriceGBP: 3910, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "q8-5_s", label: "Q8-5", category: "SURROUNDS", widthMm: 500, heightMm: 600, depthMm: 160, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 106, nominalOhms: 4, max_power: 800, price_gbp_exVat: 5730, retailPriceGBP: 5730, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    // ARCHITECT (OVERHEAD) — EXACT ORDER
    {
      key: "architect-mikro",
      label: "MIKRO Ci",
      category: "ARCHITECT",
      widthMm: 54,
      // short edge (left/right)
      depthMm: 138,
      // long edge (front/back)
      heightMm: 26,
      // physical depth only for reporting
      round: false,
      // MUST be explicitly false
      sensitivity_dB_1w1m: 86,
      sensitivity_dB_2p83: 86,
      nominalOhms: 8,
      max_power: 15,
      max_spl_cont_db_1m_halfspace: 102,
      max_spl_peak_db_cf6_1m_halfspace: 108,
      max_spl_cont_db_1m_anechoic: 96,
      max_spl_peak_db_cf6_1m_anechoic: 102,
      frequency_response_low: 300,
      frequency_response_high: 2e4,
      usable_lf_hz_minus6db: 297,
      coverage_deg: { horizontal: 90, vertical: 90 },
      price_gbp_exVat: null,
      builtInTiltDeg: 0,
      dispersion: {
        horizontal: {
          minus1p5dB: 90,
          minus3dB: 90,
          minus5dB: 90
        }
      }
    },
    {
      key: "architect-2-1",
      label: "ARCHITECT 2-1",
      category: "ARCHITECT",
      diameterMm: 240,
      depthMm: 120,
      round: true,
      sensitivity_dB_1w1m: 97,
      sensitivity_dB_2p83: 100,
      nominalOhms: 4,
      max_power: 60,
      max_spl_cont_db_1m_halfspace: 108,
      max_spl_peak_db_cf6_1m_halfspace: 114,
      max_spl_cont_db_1m_anechoic: 102,
      max_spl_peak_db_cf6_1m_anechoic: 108,
      frequency_response_low: 80,
      frequency_response_high: 4e4,
      usable_lf_hz_minus6db: 77,
      coverage_deg: { horizontal: 70, vertical: 90 },
      price_gbp_exVat: 740,
      retailPriceGBP: 740,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      builtInTiltDeg: 5,
      dispersion: {
        horizontal: {
          minus1p5dB: 40,
          minus3dB: 55,
          minus5dB: 72
        },
        vertical: {
          minus1p5dB: 40,
          minus3dB: 55,
          minus5dB: 72
        }
      }
    },
    {
      key: "architect-4-2",
      label: "ARCHITECT 4-2",
      category: "ARCHITECT",
      hiddenFromSelector: true,
      diameterMm: 300,
      depthMm: 120,
      round: true,
      sensitivity_dB_1w1m: 97,
      sensitivity_dB_2p83: 97,
      nominalOhms: 4,
      max_power: 120,
      price_gbp_exVat: 1230,
      retailPriceGBP: 1230,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      builtInTiltDeg: 5,
      dispersion: {
        horizontal: {
          minus1p5dB: 30,
          minus3dB: 45,
          minus5dB: 63
        },
        vertical: {
          minus1p5dB: 30,
          minus3dB: 45,
          minus5dB: 63
        }
      }
    },
    {
      key: "architect-pas2-2",
      label: "ARCHITECT PAS2-2",
      category: "ARCHITECT",
      hiddenFromSelector: true,
      diameterMm: 300,
      depthMm: 150,
      round: true,
      sensitivity_dB_1w1m: 97,
      sensitivity_dB_2p83: 97,
      nominalOhms: 4,
      max_power: 120,
      price_gbp_exVat: 1200,
      retailPriceGBP: 1200,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      builtInTiltDeg: 20,
      dispersion: {
        horizontal: {
          minus1p5dB: 43,
          minus3dB: 60,
          minus5dB: 82
        },
        vertical: {
          minus1p5dB: 24,
          minus3dB: 40,
          minus5dB: 60
        }
      }
    },
    {
      key: "spitfire-cloud",
      label: "SPITFIRE CLOUD",
      category: "ARCHITECT",
      diameterMm: 300,
      depthMm: 300,
      heightMm: 83,
      round: true,
      sensitivity_dB_1w1m: 98,
      sensitivity_dB_2p83: 98,
      nominalOhms: 4,
      max_power: 120,
      max_spl_cont_db_1m_halfspace: 114,
      max_spl_peak_db_cf6_1m_halfspace: 120,
      frequency_response_low: 100,
      usable_lf_hz_minus6db: 97,
      price_gbp_exVat: null,
      builtInTiltDeg: 22,
      // RP22 P17 MEASURED ENGINE — enabled for this model only (Stage 2C).
      polarModel: {
        type: "measured",
        axisTiltDeg: 22,
        dataset: "SpitfireCloud"
      }
    },
    {
      key: "architect-4-2-mk2",
      label: "ARCHITECT 4-2 mk II",
      category: "ARCHITECT",
      diameterMm: 300,
      depthMm: 300,
      heightMm: 83,
      round: true,
      sensitivity_dB_1w1m: 98,
      sensitivity_dB_2p83: 98,
      nominalOhms: 4,
      max_power: 120,
      max_spl_cont_db_1m_halfspace: 114,
      max_spl_peak_db_cf6_1m_halfspace: 120,
      frequency_response_low: 100,
      usable_lf_hz_minus6db: 97,
      price_gbp_exVat: null,
      builtInTiltDeg: 22,
      // Architect 4-2 Mk2 shares the measured polar dataset with Spitfire Cloud.
      polarModel: {
        type: "measured",
        axisTiltDeg: 22,
        dataset: "SpitfireCloud"
      }
    },
    // SUBWOOFERS — EXACT ORDER
    {
      key: "sub2-12",
      label: "SUB2-12",
      category: "SUBWOOFERS",
      widthMm: 500,
      heightMm: 500,
      depthMm: 255,
      sensitivity_dB_1w1m: 94,
      max_power: 350,
      max_spl_cont_db_1m_halfspace: 120,
      max_spl_peak_db_cf6_1m_halfspace: 126,
      max_spl_cont_db_1m_anechoic: 114,
      max_spl_peak_db_cf6_1m_anechoic: 120,
      max_spl_cont_db_30hz_halfspace: 118,
      max_spl_cont_db_30hz_anechoic: 112,
      price_gbp_exVat: 2190,
      retailPriceGBP: 2190,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      graphDerivedDesignEstimate: true,
      notes: "Dolby DART approved continuous SPL data",
      dolbyDartApproved: true,
      approvedContinuousSplAt1mDb: 120,
      approvedContinuousSplAt30HzDb: 118,
      approvedPeakSplDb: 126,
      approvedFrequencyRangeHz: [25, 170],
      approvedUsableLfHzMinus6dB: 22,
      bassCapability: SUBWOOFER_BASS_CAPABILITIES["sub2-12"],
      frequency_response_curve: SUBWOOFER_BASS_CAPABILITIES["sub2-12"].frequencyResponseCurve.map(({ frequency, spl }) => [frequency, spl])
    },
    {
      key: "sub3-12",
      label: "SUB3-12",
      category: "SUBWOOFERS",
      widthMm: 600,
      heightMm: 600,
      depthMm: 255,
      sensitivity_dB_1w1m: 97,
      max_power: 700,
      max_spl_cont_db_1m_halfspace: 125,
      max_spl_peak_db_cf6_1m_halfspace: 131,
      max_spl_cont_db_1m_anechoic: 119,
      max_spl_peak_db_cf6_1m_anechoic: 125,
      max_spl_cont_db_30hz_halfspace: 122,
      max_spl_cont_db_30hz_anechoic: 116,
      price_gbp_exVat: 3740,
      retailPriceGBP: 3740,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      graphDerivedDesignEstimate: true,
      notes: "Dolby DART approved continuous SPL data",
      dolbyDartApproved: true,
      approvedContinuousSplAt1mDb: 125,
      approvedContinuousSplAt30HzDb: 122,
      approvedPeakSplDb: 131,
      approvedFrequencyRangeHz: [25, 170],
      approvedUsableLfHzMinus6dB: 22,
      bassCapability: SUBWOOFER_BASS_CAPABILITIES["sub3-12"],
      frequency_response_curve: SUBWOOFER_BASS_CAPABILITIES["sub3-12"].frequencyResponseCurve.map(({ frequency, spl }) => [frequency, spl])
    },
    {
      key: "sub4-12",
      label: "SUB4-12",
      category: "SUBWOOFERS",
      widthMm: 440,
      heightMm: 1700,
      depthMm: 270,
      sensitivity_dB_1w1m: 99,
      max_power: 1400,
      max_spl_cont_db_1m_halfspace: 126,
      max_spl_peak_db_cf6_1m_halfspace: 132,
      max_spl_cont_db_1m_anechoic: 120,
      max_spl_peak_db_cf6_1m_anechoic: 126,
      max_spl_cont_db_30hz_halfspace: 126,
      max_spl_cont_db_30hz_anechoic: 120,
      price_gbp_exVat: 6600,
      retailPriceGBP: 6600,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      graphDerivedDesignEstimate: true,
      notes: "Dolby DART approved continuous SPL data",
      dolbyDartApproved: true,
      approvedContinuousSplAt1mDb: 126,
      approvedContinuousSplAt30HzDb: 126,
      approvedPeakSplDb: 132,
      approvedFrequencyRangeHz: [15, 170],
      approvedUsableLfHzMinus6dB: 12,
      bassCapability: SUBWOOFER_BASS_CAPABILITIES["sub4-12"],
      frequency_response_curve: SUBWOOFER_BASS_CAPABILITIES["sub4-12"].frequencyResponseCurve.map(({ frequency, spl }) => [frequency, spl])
    }
  ];
  new Map(MODELS.map((m, i) => [m.key, i]));
  function isValidCurve(curve) {
    if (!Array.isArray(curve)) return false;
    return curve.every(
      (point) => Array.isArray(point) && point.length === 2 && typeof point[0] === "number" && typeof point[1] === "number"
    );
  }
  function getSubwooferCurve(modelKey) {
    const normalized = normaliseModelKey(modelKey);
    const model = MODELS.find((m) => m.key === normalized);
    if (!model || !model.frequency_response_curve) {
      return null;
    }
    const rawCurve = model.frequency_response_curve;
    if (!isValidCurve(rawCurve)) {
      return null;
    }
    return rawCurve.map(([hz, db]) => ({ hz, db }));
  }
  const REW_SOURCE_CURVES = {
    product: null,
    // Flat 94 dB source from 15–200 Hz. The 20–200 Hz segment remains unchanged for REW parity;
    // the 15 Hz point permits product-capability composition through the RP22 extension band.
    flat_rew_reference: [
      { hz: 15, db: 94 },
      { hz: 20, db: 94 },
      { hz: 50, db: 94 },
      { hz: 100, db: 94 },
      { hz: 200, db: 94 }
    ],
    flat90: [
      { hz: 15, db: 90 },
      { hz: 200, db: 90 }
    ],
    rew20HzPorted: [
      { hz: 15, db: 78 },
      { hz: 18, db: 84 },
      { hz: 20, db: 87 },
      { hz: 25, db: 90 },
      { hz: 40, db: 90 },
      { hz: 80, db: 90 },
      { hz: 100, db: 89 },
      { hz: 200, db: 89 }
    ],
    // __TEMP_REW_PARITY__ truly flat source across full bass range — tests room model only, no product roll-off
    flat_0_500hz_rew_parity: [
      { hz: 0, db: 94 },
      { hz: 10, db: 94 },
      { hz: 20, db: 94 },
      { hz: 30, db: 94 },
      { hz: 40, db: 94 },
      { hz: 50, db: 94 },
      { hz: 63, db: 94 },
      { hz: 80, db: 94 },
      { hz: 100, db: 94 },
      { hz: 120, db: 94 },
      { hz: 160, db: 94 },
      { hz: 200, db: 94 },
      { hz: 300, db: 94 },
      { hz: 500, db: 94 }
    ]
  };
  const isPositivePower = (value) => value !== null && value !== void 0 && value !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
  const DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W = 1e3;
  function getPerSubwooferAmplifierAuthority(activeSubs, configuredPowerPerSubW = null) {
    const subs = Array.isArray(activeSubs) ? activeSubs : [];
    const firstConfiguredPowerW = subs.map((sub) => (sub == null ? void 0 : sub.subwooferAmplifierPowerW) ?? (sub == null ? void 0 : sub.amplifierPowerPerSubW)).find(isPositivePower);
    const defaultPowerPerSubW = isPositivePower(configuredPowerPerSubW) ? Number(configuredPowerPerSubW) : isPositivePower(firstConfiguredPowerW) ? Number(firstConfiguredPowerW) : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;
    const sourceAuthorities = subs.map((sub, index) => {
      const model = MODELS.find((candidate) => candidate.key === getModelKey(sub));
      const productPowerHandlingW = Number(model == null ? void 0 : model.max_power);
      const amplifierPowerW = isPositivePower((sub == null ? void 0 : sub.subwooferAmplifierPowerW) ?? (sub == null ? void 0 : sub.amplifierPowerPerSubW)) ? Number((sub == null ? void 0 : sub.subwooferAmplifierPowerW) ?? (sub == null ? void 0 : sub.amplifierPowerPerSubW)) : defaultPowerPerSubW;
      const powerRatio = Number.isFinite(productPowerHandlingW) && productPowerHandlingW > 0 ? Math.max(0, Math.min(1, amplifierPowerW / productPowerHandlingW)) : 1;
      return {
        index,
        modelKey: getModelKey(sub),
        amplifierPowerW,
        productPowerHandlingW: Number.isFinite(productPowerHandlingW) ? productPowerHandlingW : null,
        powerRatio,
        deratingDb: powerRatio > 0 ? 10 * Math.log10(powerRatio) : -Infinity,
        powerLimited: powerRatio < 1 - 1e-9
      };
    });
    return {
      powerPerSubW: defaultPowerPerSubW,
      totalAvailablePowerW: sourceAuthorities.reduce((sum, source) => sum + source.amplifierPowerW, 0),
      totalProductPowerHandlingW: sourceAuthorities.reduce((sum, source) => sum + (source.productPowerHandlingW || 0), 0),
      sourceAuthorities,
      powerLimited: sourceAuthorities.some((source) => source.powerLimited),
      allocationPolicy: "one-dedicated-amplifier-per-subwoofer"
    };
  }
  function getModelKey(sub) {
    return normaliseModelKey((sub == null ? void 0 : sub.modelKey) ?? (sub == null ? void 0 : sub.model) ?? "");
  }
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
  function isBatchModalEligible({ qStrategyOverride, physics, sources }) {
    if (qStrategyOverride !== "ab_corrected") return false;
    if (physics.rewSourceCurveMode !== "product") return false;
    if (physics.runtimeVectorCapture) return false;
    for (const src of sources) {
      const t = src == null ? void 0 : src.tuning;
      if (t && (Number(t.gainDb) !== 0 || Number(t.delayMs) !== 0 || Number(t.polarity) !== 0 || Number(t.phaseControlDeg ?? t.phaseAdjust ?? 0) !== 0)) return false;
    }
    return true;
  }
  function buildDeratedProductCurve(sub, sourceIndex, amplifierAuthority) {
    var _a;
    const subCurve = getSubwooferCurve(sub.modelKey);
    if (!(subCurve == null ? void 0 : subCurve.length)) return null;
    const deratingDb = ((_a = amplifierAuthority.sourceAuthorities[sourceIndex]) == null ? void 0 : _a.deratingDb) ?? 0;
    if (!Number.isFinite(deratingDb) || deratingDb === 0) return subCurve;
    return subCurve.map((point) => {
      const spl = Number(point == null ? void 0 : point.spl);
      const db = Number(point == null ? void 0 : point.db);
      if (Number.isFinite(spl)) return { ...point, spl: spl + deratingDb };
      if (Number.isFinite(db)) return { ...point, db: db + deratingDb };
      return { ...point };
    });
  }
  const FLAT_SOURCE_CURVE = REW_SOURCE_CURVES.flat_rew_reference;
  const REFERENCE_SOURCE_DB = 94;
  const REFERENCE_SOURCE_AMPLITUDE = Math.pow(10, REFERENCE_SOURCE_DB / 20);
  function simulateAuthoritativeBassResponse({ roomDims, seatingPositions, rspPosition, sources, physics, qStrategyOverride, capturePerSourcePerSeat }) {
    if (!sources.length || !(roomDims == null ? void 0 : roomDims.widthM) || !(roomDims == null ? void 0 : roomDims.lengthM) || !(roomDims == null ? void 0 : roomDims.heightM)) {
      return { seatResponses: {}, metrics: null, audit: null, runtimeVectorCapture: { rows: [] }, perSourceRspComplexTransfers: [], perSourcePerSeatComplexTransfers: [] };
    }
    const amplifierAuthority = getPerSubwooferAmplifierAuthority(sources);
    const seatResponses = {};
    let perSourcePerSeatComplexTransfers = capturePerSourcePerSeat ? [] : null;
    let stepDebug = null;
    let wholeCurveDebugRows = null;
    let activeModalVectorPath = null;
    const runtimeCaptureByHz = /* @__PURE__ */ new Map();
    const debugSeatId = "rsp";
    const debugSub = sources[0] || null;
    const listeners = [rspPosition, ...Array.isArray(seatingPositions) ? seatingPositions : []].filter(Boolean);
    const engineOptionsBase = {
      surfaceAbsorption: physics.surfaceAbsorption,
      freqMinHz: 15,
      freqMaxHz: 200,
      smoothing: "none",
      axialQ: physics.axialQ,
      qStrategy: qStrategyOverride,
      rewModalBandwidthScale: physics.rewModalBandwidthScale,
      enableRewCoreReflections: physics.enableRewCoreReflections,
      rewParityFieldMode: physics.rewParityFieldMode,
      abApplyModeMultiplicity: qStrategyOverride === "ab_corrected",
      roomIsSealed: qStrategyOverride === "ab_corrected",
      abMidbandQScale: 1,
      overrideConstantAxialQ: physics.overrideConstantAxialQ,
      overrideAbsorptionAxialQ: physics.overrideAbsorptionAxialQ,
      debugMode200Multiplier: physics.debugMode200Multiplier,
      debugModalPhaseConvention: "normal",
      reflectionGainScale: physics.reflectionGainScale,
      debugModalHSign: "normal",
      rewParityModalMagnitudeScale: physics.rewSourceCurveMode === "flat_rew_reference" ? physics.rewParityModalMagnitudeScale : 1,
      modalCoherenceMode: physics.modalCoherenceMode,
      highOrderAxialScale: physics.highOrderAxialScale,
      mute68HzAxialMode: physics.mute68HzAxialMode,
      debugDisableModalContribution: physics.debugDisableModalContribution,
      disableReflectionPhaseJitter: physics.disableReflectionPhaseJitter,
      disableReflectionCoherenceWeight: physics.disableReflectionCoherenceWeight,
      disableLateField: physics.disableLateField,
      disableModalPropagationPhase: physics.rewSourceCurveMode === "flat_rew_reference" ? true : physics.disableModalPropagationPhase,
      modalSourceReferenceMode: physics.modalSourceReferenceMode,
      modalGainScalar: physics.modalGainScalar,
      modalDistanceBlend: physics.modalDistanceBlend,
      modalStorageMode: physics.modalStorageMode,
      propagationPhaseScale: physics.propagationPhaseScale
    };
    const precomputedModes = prepareModeBank(roomDims, { ...engineOptionsBase, enableModes: true });
    const flatTransferPhysics = buildNormalizedPhysicsOptions({ ...physics, qStrategy: qStrategyOverride });
    const perSourceRspComplexTransfers = [];
    if (rspPosition && Number.isFinite(rspPosition.x) && Number.isFinite(rspPosition.y)) {
      const rspListenerZ = Number.isFinite(Number(rspPosition.z)) ? Number(rspPosition.z) : 1.2;
      sources.forEach((sub, sourceIndex) => {
        if (!Number.isFinite(sub == null ? void 0 : sub.x) || !Number.isFinite(sub == null ? void 0 : sub.y) || !Number.isFinite(sub == null ? void 0 : sub.z)) return;
        try {
          const flatResult = simulateBassResponseRewCore(
            roomDims,
            { x: rspPosition.x, y: rspPosition.y, z: rspListenerZ },
            sub,
            FLAT_SOURCE_CURVE,
            { ...flatTransferPhysics, freqMinHz: 15, freqMaxHz: 200, smoothing: "none", precomputedModes }
          );
          perSourceRspComplexTransfers.push({
            sourceIndex,
            sourceId: (sub == null ? void 0 : sub.id) || null,
            amplitudeDomain: "pressure amplitude relative to 20 µPa",
            sourceReferenceDb: REFERENCE_SOURCE_DB,
            sourceReferenceAmplitude: REFERENCE_SOURCE_AMPLITUDE,
            dimensionlessTransferOperation: "complexPressure / sourceReferenceAmplitude",
            points: (flatResult.freqsHz || []).map((frequency, index) => {
              var _a, _b;
              return {
                frequency,
                re: ((_a = flatResult.complexPressure[index]) == null ? void 0 : _a.re) ?? null,
                im: ((_b = flatResult.complexPressure[index]) == null ? void 0 : _b.im) ?? null
              };
            })
          });
        } catch {
        }
      });
    }
    const useBatchPath = isBatchModalEligible({ qStrategyOverride, physics, sources });
    if (useBatchPath) {
      const canonicalFreqsHz = buildFrequencyAxis(15, 200, void 0);
      const batchSources = sources.map((sub, sourceIndex) => ({
        ...sub,
        sourceCurve: buildDeratedProductCurve(sub, sourceIndex, amplifierAuthority)
      }));
      const batchListeners = listeners.map((seat) => ({
        id: seat.id || `${seat.x}-${seat.y}`,
        x: seat.x,
        y: seat.y,
        z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2
      }));
      const batchResult = evaluateBatchModalTransfers({
        roomDims,
        sources: batchSources,
        listeners: batchListeners,
        precomputedModes,
        physics,
        qStrategyOverride,
        precomputedFreqsHz: canonicalFreqsHz
      });
      const transfersBySeat = /* @__PURE__ */ new Map();
      for (const transfer of batchResult.perSourcePerListenerTransfers) {
        if (!transfersBySeat.has(transfer.listenerId)) transfersBySeat.set(transfer.listenerId, []);
        transfersBySeat.get(transfer.listenerId).push(transfer);
      }
      for (const [seatId, transfers] of transfersBySeat) {
        const freqsHz = batchResult.freqsHz;
        const sumRe = new Float64Array(freqsHz.length);
        const sumIm = new Float64Array(freqsHz.length);
        for (const transfer of transfers) {
          for (let fi = 0; fi < transfer.points.length; fi++) {
            const re = transfer.points[fi].re;
            const im = transfer.points[fi].im;
            if (Number.isFinite(re) && Number.isFinite(im)) {
              sumRe[fi] += re;
              sumIm[fi] += im;
            }
          }
        }
        seatResponses[seatId] = {
          freqsHz,
          splDb: sumRe.map((re, index) => 20 * Math.log10(Math.max(Math.hypot(re, sumIm[index]), 1e-10))),
          _sumRe: Array.from(sumRe),
          _sumIm: Array.from(sumIm),
          nulls: { count: 0, worstDb: 0, nulls: [] }
        };
      }
      if (capturePerSourcePerSeat) {
        if (!perSourcePerSeatComplexTransfers) perSourcePerSeatComplexTransfers = [];
        for (const transfer of batchResult.perSourcePerListenerTransfers) {
          const sub = sources[transfer.sourceIndex];
          perSourcePerSeatComplexTransfers.push({
            seatId: transfer.listenerId,
            sourceIndex: transfer.sourceIndex,
            sourceId: (sub == null ? void 0 : sub.id) || null,
            points: transfer.points
          });
        }
      }
    } else {
      listeners.forEach((seat) => {
        const seatId = seat.id || `${seat.x}-${seat.y}`;
        let freqsHz = null;
        let sumRe = null;
        let sumIm = null;
        sources.forEach((sub, sourceIndex) => {
          var _a, _b;
          const subCurve = getSubwooferCurve(sub.modelKey);
          if (!(subCurve == null ? void 0 : subCurve.length)) return;
          const sourceAmplifierDeratingDb = ((_a = amplifierAuthority.sourceAuthorities[sourceIndex]) == null ? void 0 : _a.deratingDb) ?? 0;
          const rawSourceCurve = REW_SOURCE_CURVES[physics.rewSourceCurveMode] || subCurve;
          const sourceCurve = physics.rewSourceCurveMode === "product" ? rawSourceCurve.map((point) => {
            const spl = Number(point == null ? void 0 : point.spl);
            const db = Number(point == null ? void 0 : point.db);
            if (Number.isFinite(spl)) return { ...point, spl: spl + sourceAmplifierDeratingDb };
            if (Number.isFinite(db)) return { ...point, db: db + sourceAmplifierDeratingDb };
            return { ...point };
          }) : rawSourceCurve;
          const parityFullField = physics.rewSourceCurveMode === "flat_rew_reference" && physics.rewParityFieldMode === "full_field";
          const fieldReflections = qStrategyOverride === "ab_corrected" ? false : parityFullField ? false : ["modes_only", "direct_plus_modes"].includes(physics.rewParityFieldMode) ? false : physics.rewParityFieldMode === "reflections_only" ? true : physics.enableRewCoreReflections;
          const fieldModes = parityFullField ? true : physics.rewParityFieldMode === "reflections_only" ? false : true;
          const fieldLateField = parityFullField ? true : ["reflections_only", "modes_only", "direct_plus_modes"].includes(physics.rewParityFieldMode) ? true : physics.disableLateField;
          const seatZ = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
          let modalReferenceMode = physics.modalSourceReferenceMode;
          let modalGainScalar = physics.modalGainScalar;
          if (physics.modalSourceReferenceMode === "distance_blend") {
            const blend = Math.max(0, Math.min(1, physics.modalDistanceBlend));
            if (blend >= 1) modalReferenceMode = "distance_normalized";
            else if (blend <= 0) modalReferenceMode = "existing";
            else {
              const distanceM = Math.max(0.01, Math.hypot(sub.x - seat.x, sub.y - seat.y, sub.z - seatZ));
              modalGainScalar = physics.modalGainScalar * Math.pow(10, -20 * Math.log10(distanceM) * blend / 20);
              modalReferenceMode = "existing";
            }
          }
          const result = simulateBassResponseRewCore(roomDims, { x: seat.x, y: seat.y, z: seatZ }, sub, sourceCurve, {
            enableReflections: fieldReflections,
            enableModes: fieldModes,
            surfaceAbsorption: physics.surfaceAbsorption,
            freqMinHz: 15,
            freqMaxHz: 200,
            smoothing: "none",
            modalSourceReferenceMode: modalReferenceMode,
            modalGainScalar,
            axialQ: physics.axialQ,
            modalStorageMode: physics.modalStorageMode,
            propagationPhaseScale: physics.propagationPhaseScale,
            pureDeterministicModalSum: physics.rewSourceCurveMode === "flat_rew_reference",
            disableReflectionPhaseJitter: physics.disableReflectionPhaseJitter,
            disableReflectionCoherenceWeight: physics.disableReflectionCoherenceWeight,
            disableLateField: fieldLateField,
            disableModalPropagationPhase: physics.rewSourceCurveMode === "flat_rew_reference" ? true : physics.disableModalPropagationPhase,
            debugInvertModalVector: false,
            debugModalPhaseConvention: "normal",
            mute68HzAxialMode: physics.mute68HzAxialMode,
            debugDisableModalContribution: physics.debugDisableModalContribution,
            rewSourceCurveMode: physics.rewSourceCurveMode,
            rewParityFieldMode: qStrategyOverride === "ab_corrected" ? "modes_only" : physics.rewParityFieldMode,
            abApplyModeMultiplicity: qStrategyOverride === "ab_corrected",
            roomIsSealed: qStrategyOverride === "ab_corrected",
            abMidbandQScale: 1,
            overrideConstantAxialQ: physics.overrideConstantAxialQ,
            overrideAbsorptionAxialQ: physics.overrideAbsorptionAxialQ,
            debugMode200Multiplier: physics.debugMode200Multiplier,
            debugReflectionOrder: physics.rewSourceCurveMode === "flat_rew_reference" || qStrategyOverride === "ab_corrected" ? 1 : 3,
            reflectionGainScale: physics.reflectionGainScale,
            debugModalHSign: "normal",
            rewParityModalMagnitudeScale: physics.rewSourceCurveMode === "flat_rew_reference" ? physics.rewParityModalMagnitudeScale : 1,
            modalCoherenceMode: physics.modalCoherenceMode,
            highOrderAxialScale: physics.highOrderAxialScale,
            qStrategy: qStrategyOverride,
            rewModalBandwidthScale: physics.rewModalBandwidthScale,
            runtimeVectorCapture: physics.runtimeVectorCapture,
            precomputedModes
          });
          if (stepDebug === null && seatId === debugSeatId && sub === debugSub && ((_b = result.stepDebug) == null ? void 0 : _b.length) > 0) {
            stepDebug = result.stepDebug;
            wholeCurveDebugRows = result.wholeCurveDebugRows;
            activeModalVectorPath = result.activeModalVectorPath ?? null;
            if (wholeCurveDebugRows) {
              wholeCurveDebugRows.preModalSeries = result.preModalSeries;
              wholeCurveDebugRows.modalOnlySeries = result.modalOnlySeries;
              wholeCurveDebugRows.postModalSeries = result.postModalSeries;
            }
          }
          if (seatId === debugSeatId && Array.isArray(result.runtimeVectorCapture)) {
            result.runtimeVectorCapture.forEach((row) => {
              const existing = runtimeCaptureByHz.get(row.frequencyHz) || { frequencyHz: row.frequencyHz, subs: [] };
              existing.subs.push({ subId: sub.id, ...row });
              runtimeCaptureByHz.set(row.frequencyHz, existing);
            });
          }
          if (!freqsHz) {
            freqsHz = result.freqsHz;
            sumRe = result.complexPressure.map((value) => value.re);
            sumIm = result.complexPressure.map((value) => value.im);
          } else {
            result.complexPressure.forEach((value, index) => {
              if (Number.isFinite(value.re) && Number.isFinite(value.im)) {
                sumRe[index] += value.re;
                sumIm[index] += value.im;
              }
            });
          }
          if (capturePerSourcePerSeat) {
            if (!perSourcePerSeatComplexTransfers) perSourcePerSeatComplexTransfers = [];
            perSourcePerSeatComplexTransfers.push({
              seatId,
              sourceIndex,
              sourceId: (sub == null ? void 0 : sub.id) || null,
              points: (result.freqsHz || []).map((frequency, index) => {
                var _a2, _b2;
                return {
                  frequency,
                  re: ((_a2 = result.complexPressure[index]) == null ? void 0 : _a2.re) ?? null,
                  im: ((_b2 = result.complexPressure[index]) == null ? void 0 : _b2.im) ?? null
                };
              })
            });
          }
        });
        if (freqsHz && sumRe && sumIm) {
          seatResponses[seatId] = {
            freqsHz,
            splDb: sumRe.map((re, index) => 20 * Math.log10(Math.max(Math.hypot(re, sumIm[index]), 1e-10))),
            _sumRe: sumRe,
            _sumIm: sumIm,
            nulls: { count: 0, worstDb: 0, nulls: [] }
          };
        }
      });
    }
    const runtimeRows = Array.from(runtimeCaptureByHz.values()).map((row) => {
      var _a, _b, _c;
      const response = seatResponses[debugSeatId];
      const index = ((_a = response == null ? void 0 : response.freqsHz) == null ? void 0 : _a.findIndex((hz) => hz === row.frequencyHz)) ?? -1;
      const finalRe = index >= 0 ? (_b = response._sumRe) == null ? void 0 : _b[index] : null;
      const finalIm = index >= 0 ? (_c = response._sumIm) == null ? void 0 : _c[index] : null;
      const sum = (key) => row.subs.reduce((total, item) => total + item[key], 0);
      const directRe = row.subs.reduce((total, item) => total + item.direct.directRe, 0);
      const directIm = row.subs.reduce((total, item) => total + item.direct.directIm, 0);
      const modalRe = sum("modalRe");
      const modalIm = sum("modalIm");
      const preModalRe = sum("preModalRe");
      const preModalIm = sum("preModalIm");
      const directPlusReflectionRe = sum("directPlusReflectionRe");
      const directPlusReflectionIm = sum("directPlusReflectionIm");
      const finalMagnitude = Math.hypot(finalRe, finalIm);
      return {
        ...row,
        directRe,
        directIm,
        modalRe,
        modalIm,
        preModalRe,
        preModalIm,
        preModalMagnitude: Math.hypot(preModalRe, preModalIm),
        preModalSplDb: 20 * Math.log10(Math.max(Math.hypot(preModalRe, preModalIm), 1e-10)),
        directPlusReflectionRe,
        directPlusReflectionIm,
        directPlusReflectionSplDb: 20 * Math.log10(Math.max(Math.hypot(directPlusReflectionRe, directPlusReflectionIm), 1e-10)),
        finalRe,
        finalIm,
        finalMagnitude,
        finalSplDb: 20 * Math.log10(Math.max(finalMagnitude, 1e-10)),
        plottedGraphValueDb: 20 * Math.log10(Math.max(finalMagnitude, 1e-10))
      };
    });
    return {
      seatResponses,
      metrics: null,
      audit: null,
      stepDebug,
      wholeCurveDebugRows,
      activeModalVectorPath,
      amplifierAuthority,
      runtimeVectorCapture: { rows: runtimeRows },
      perSourceRspComplexTransfers,
      perSourcePerSeatComplexTransfers: perSourcePerSeatComplexTransfers || []
    };
  }
  self.onmessage = (event) => {
    const { generation, payload } = event.data || {};
    if (!Number.isFinite(generation)) {
      self.postMessage({ type: "error", generation: null, error: "Missing simulation generation" });
      return;
    }
    try {
      const result = simulateAuthoritativeBassResponse(payload || {});
      self.postMessage({ type: "complete", generation, result });
    } catch (error) {
      self.postMessage({
        type: "error",
        generation,
        error: (error == null ? void 0 : error.message) || String(error) || "Authoritative bass simulation failed"
      });
    }
  };
})();
