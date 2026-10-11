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
  function abCorrectedModalTransferLocal(frequencyHz, modes, source2, seat, dims, modalSourceAmplitude1m, delayMs, polarity, phaseControlDeg = 0, captureContributions = false, applyModeMultiplicity = false, roomIsSealed = false) {
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
      const sourceCoupling = modeShapeValueLocal(mode, source2.x, source2.y, source2.z, { widthM, lengthM, heightM });
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
  function legacyModalTransferLocal(frequencyHz, modes, source2, seat, roomDims, widthM, lengthM, heightM, modalSourceAmplitude, modalStorageMode = "none", pureDeterministicModalSum = false, disableModalPropagationPhase = false, mute68HzAxialMode = false, propagationPhaseScale = 0.5, delayMs = 0, polarity = 0, phaseControlDeg = 0, debugMode200Multiplier = 1, debugModalHSign = "normal", highOrderAxialScale = 1, axialFamilyScale = 1, tangentialFamilyScale = 1, obliqueFamilyScale = 1, muteModeKey = null) {
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
      const sourceCoupling = modeShapeValueLocal(mode, source2.x, source2.y, source2.z, { widthM, lengthM, heightM });
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
        source2.x,
        source2.y,
        source2.z,
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
    const source2 = {
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
    if (!Number.isFinite(source2.x) || !Number.isFinite(source2.y) || !Number.isFinite(source2.z)) {
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
      source2.x,
      source2.y,
      source2.z,
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
      const dx = source2.x - seat.x;
      const dy = source2.y - seat.y;
      const dz = source2.z - seat.z;
      const distanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const distanceLossDb = -20 * Math.log10(distanceM / 1);
      const totalMagnitudeDb = curveDb + distanceLossDb + source2.tuning.gainDb;
      const amplitude = Math.pow(10, totalMagnitudeDb / 20);
      const modalGainScalarOption = Number(options == null ? void 0 : options.modalGainScalar);
      const modalGainScalar = Number.isFinite(modalGainScalarOption) ? modalGainScalarOption : 1;
      const modalSourceReferenceMode = (options == null ? void 0 : options.modalSourceReferenceMode) || (rewParityModalPhase ? "room_volume" : "existing");
      const modalStorageMode = (options == null ? void 0 : options.modalStorageMode) || "none";
      const modalSourceAmplitudeBase = Math.pow(10, (curveDb + source2.tuning.gainDb) / 20) * modalGainScalar;
      const roomVolumeM3 = widthM * lengthM * heightM;
      const modalSourceAmplitude1m = modalSourceReferenceMode === "distance_normalized" ? modalSourceAmplitudeBase * Math.pow(10, distanceLossDb / 20) : modalSourceReferenceMode === "room_volume" || modalSourceReferenceMode === "room_normalized" ? modalSourceAmplitudeBase / Math.sqrt(Math.max(roomVolumeM3, 1e-6)) : modalSourceAmplitudeBase;
      const timeOfFlightPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS);
      const delayPhase = -2 * Math.PI * frequencyHz * (source2.tuning.delayMs / 1e3);
      const polarityPhase = source2.tuning.polarity === 180 ? Math.PI : 0;
      const phaseControlPhase = allPassPhaseRadians(frequencyHz, source2.tuning.phaseControlDeg);
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
        const imageMagnitudeDb = curveDb + imageDistanceLossDb + source2.tuning.gainDb;
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
          const imageMagnitudeDb = curveDb + imageDistanceLossDb + source2.tuning.gainDb;
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
          source2,
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
          source2.tuning.delayMs,
          source2.tuning.polarity,
          source2.tuning.phaseControlDeg,
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
          const abSourceUnit = Math.pow(10, (curveDb + source2.tuning.gainDb) / 20);
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
            source2,
            seat,
            { widthM, lengthM, heightM },
            abSourceUnit,
            source2.tuning.delayMs,
            source2.tuning.polarity,
            source2.tuning.phaseControlDeg,
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
        source: { modelKey: source2.modelKey, x: source2.x, y: source2.y, z: source2.z },
        receiver: seat,
        direct: { curveDb, distanceM, distanceLossDb, userGainDb: source2.tuning.gainDb, amplitude, timeOfFlightPhase, delayPhase, polarityPhase, directRe, directIm, directMagnitude: Math.hypot(directRe, directIm), directSplDb: 20 * Math.log10(Math.max(Math.hypot(directRe, directIm), 1e-10)) },
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
  const BEST_SUB_LAYOUT_CONSTANTS = Object.freeze({
    candidateDefinitionVersion: "rp22-guided-layouts-v3-practical-install",
    previewPointsPerOctave: 8,
    debounceMs: 80,
    maximumRecommendations: 3,
    allowedSourceCounts: [1, 2, 4],
    fallbackSourceHeightM: 0.05,
    minimumWallClearanceM: 0.1,
    openingClearanceM: 0.2,
    nullRule: { smoothingRadiusBins: 1, shoulderRadiusBins: 4, minimumContiguousBins: 2, destructiveDepthDb: 8 },
    extension: { referenceStartHz: 60, referenceEndHz: 100, allowedDropDb: 10 },
    efficiency: {
      assessmentStartHz: 30,
      assessmentEndHz: 120,
      strongMinRelativeDb: -3,
      balancedMinRelativeDb: -6,
      transferBaselinePercentile: 0.75,
      explanation: "Room-minus-direct transfer over 30–120 Hz, referenced to that seat's upper-quartile transfer and averaged using cancellation-only residuals. Identical source coordinates, count and listeners remove source level and coherent source-count gain; the upper-quartile baseline removes common room gain without allowing peaks to compensate for losses."
    },
    grades: {
      aPlusMaxVariationDb: 4,
      aMaxVariationDb: 6,
      bMaxVariationDb: 9,
      individualSeatMaxNullDb: 8,
      individualSeatMaxExtensionHz: 40
    },
    tieTolerance: { nullDepthDb: 0.1, variationDb: 0.1, extensionHz: 0.5, efficiencyDb: 0.1 }
  });
  const DEFAULT_CLEARANCE_M = 0.01;
  function getSubPlacementGuideCoordinates({
    widthM,
    lengthM,
    cabinetHalfExtents,
    wallClearance
  }) {
    const W = Number(widthM);
    const L = Number(lengthM);
    if (!Number.isFinite(W) || !Number.isFinite(L) || W <= 0 || L <= 0) return null;
    const nominalInset = Math.min(BEST_SUB_LAYOUT_CONSTANTS.minimumWallClearanceM, W / 4, L / 4);
    const clearance = Number.isFinite(Number(wallClearance)) ? Number(wallClearance) : DEFAULT_CLEARANCE_M;
    const halfX = Number.isFinite(cabinetHalfExtents == null ? void 0 : cabinetHalfExtents.halfX) ? Math.max(0, cabinetHalfExtents.halfX) : 0;
    const halfY = Number.isFinite(cabinetHalfExtents == null ? void 0 : cabinetHalfExtents.halfY) ? Math.max(0, cabinetHalfExtents.halfY) : 0;
    const physicalLeftX = halfX + clearance;
    const physicalRightX = W - halfX - clearance;
    const physicalFrontY = halfY + clearance;
    const physicalRearY = L - halfY - clearance;
    const leftX = Math.max(nominalInset, physicalLeftX);
    const rightX = Math.min(W - nominalInset, physicalRightX);
    const frontY = Math.max(nominalInset, physicalFrontY);
    const rearY = Math.min(L - nominalInset, physicalRearY);
    const quarterX1 = W * 0.25;
    const midX = W * 0.5;
    const quarterX3 = W * 0.75;
    const thirdX1 = W / 3;
    const thirdX3 = W * 2 / 3;
    const quarterY1 = L * 0.25;
    const midY = L * 0.5;
    const quarterY3 = L * 0.75;
    return {
      frontY,
      rearY,
      leftX,
      rightX,
      quarterX1,
      midX,
      quarterX3,
      thirdX1,
      thirdX3,
      quarterY1,
      midY,
      quarterY3,
      nominalInset
    };
  }
  function resolveHeights(sourceHeights) {
    const frontValid = Number.isFinite(Number(sourceHeights == null ? void 0 : sourceHeights.front));
    const rearValid = Number.isFinite(Number(sourceHeights == null ? void 0 : sourceHeights.rear));
    return {
      front: frontValid ? Number(sourceHeights.front) : BEST_SUB_LAYOUT_CONSTANTS.fallbackSourceHeightM,
      rear: rearValid ? Number(sourceHeights.rear) : BEST_SUB_LAYOUT_CONSTANTS.fallbackSourceHeightM,
      usedHeightFallback: { front: !frontValid, rear: !rearValid }
    };
  }
  const source = (x, y, placement, index, heights) => ({
    id: `layout-source-${index + 1}`,
    x,
    y,
    z: placement === "rear" ? heights.rear : heights.front,
    placement,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 }
  });
  function candidate(id, name, placementFamily, placementMode, points, heights, practicalTier = 1) {
    return {
      id,
      name,
      placementFamily,
      placementMode,
      practicalTier,
      sources: points.map((point, index) => source(point.x, point.y, point.placement, index, heights))
    };
  }
  function generateBestSubLayoutCandidateSet(roomDims, sourceHeights, roomElements = [], cabinetHalfExtents = null) {
    const width = Number(roomDims == null ? void 0 : roomDims.widthM), length = Number(roomDims == null ? void 0 : roomDims.lengthM);
    const heights = resolveHeights(sourceHeights);
    const diagnostics = { usedHeightFallback: heights.usedHeightFallback, sourceHeightsM: { front: heights.front, rear: heights.rear } };
    if (!(width > 0) || !(length > 0)) return { candidates: [], diagnostics };
    const guide = getSubPlacementGuideCoordinates({ widthM: width, lengthM: length, cabinetHalfExtents });
    if (!guide) return { candidates: [], diagnostics };
    const front = guide.frontY, rear = guide.rearY, left = guide.leftX, right = guide.rightX;
    const q1 = guide.quarterX1, q3 = guide.quarterX3, midX = guide.midX;
    const t1 = guide.thirdX1, t3 = guide.thirdX3;
    const make = (id, name, family, mode, points, practicalTier = 1) => candidate(id, name, family, mode, points, heights, practicalTier);
    const centreOffsetX = width / 12;
    const cx1 = midX - centreOffsetX;
    const cx2 = midX + centreOffsetX;
    const raw = [
      // 1 sub: front/rear wall centre only. No side-wall positions — an installer
      // would never default a single subwoofer to the middle of a side wall.
      make("front-centre-1", "Front-wall centre", "Front wall", "Front-wall centre", [{ x: midX, y: front, placement: "front" }]),
      make("rear-centre-1", "Rear-wall centre", "Rear wall", "Rear-wall centre", [{ x: midX, y: rear, placement: "rear" }]),
      // 2 subs: practical front/rear wall layouts only.
      make("front-quarter-2", "Front-wall 1/4 points", "Front wall", "Front-wall quarter points", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }]),
      make("front-corners-2", "Front-wall corners", "Front wall", "Front-wall corners", [{ x: left, y: front, placement: "front" }, { x: right, y: front, placement: "front" }]),
      make("front-thirds-2", "Front-wall 1/3 points", "Front wall", "Front-wall third points", [{ x: t1, y: front, placement: "front" }, { x: t3, y: front, placement: "front" }]),
      make("front-rear-centre-2", "Front + rear centres", "Front + rear", "Front and rear wall centres", [{ x: midX, y: front, placement: "front" }, { x: midX, y: rear, placement: "rear" }]),
      // 4 subs: practical front/rear wall layouts only. No side-wall centres,
      // no mid-wall locations, no floating room positions — every subwoofer sits
      // on either the front wall or the rear wall.
      make("four-corners-4", "Front + rear corners", "Front + rear", "Front and rear wall corners", [{ x: left, y: front, placement: "front" }, { x: right, y: front, placement: "front" }, { x: left, y: rear, placement: "rear" }, { x: right, y: rear, placement: "rear" }]),
      make("front-rear-pairs-4", "Front + rear 1/4 points", "Front + rear", "Front and rear quarter points", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }, { x: q1, y: rear, placement: "rear" }, { x: q3, y: rear, placement: "rear" }]),
      make("front-rear-pairs-third-4", "Front + rear 1/3 points", "Front + rear", "Front and rear third points", [{ x: t1, y: front, placement: "front" }, { x: t3, y: front, placement: "front" }, { x: t1, y: rear, placement: "rear" }, { x: t3, y: rear, placement: "rear" }]),
      make("front-rear-centres-4", "Front + rear centres", "Front + rear", "Front and rear wall centres", [{ x: cx1, y: front, placement: "front" }, { x: cx2, y: front, placement: "front" }, { x: cx1, y: rear, placement: "rear" }, { x: cx2, y: rear, placement: "rear" }])
    ];
    const openings = (Array.isArray(roomElements) ? roomElements : []).filter((element) => (element == null ? void 0 : element.type) === "door");
    const blocked = (item) => openings.some((opening) => {
      const openingWall = opening.wall === "back" ? "rear" : opening.wall;
      if (openingWall !== item.placement) return false;
      const along = ["front", "rear"].includes(item.placement) ? item.x : item.y;
      const wallSpan = ["front", "rear"].includes(item.placement) ? width : length;
      const fractionalStart = Number(opening.x_position);
      const start = Number.isFinite(Number(opening.pos_m)) ? Number(opening.pos_m) : Number.isFinite(fractionalStart) ? fractionalStart * wallSpan : 0;
      const size = Number(opening.length_m ?? opening.width ?? 0.9);
      return along >= start - BEST_SUB_LAYOUT_CONSTANTS.openingClearanceM && along <= start + size + BEST_SUB_LAYOUT_CONSTANTS.openingClearanceM;
    });
    const candidates = raw.filter((layout) => BEST_SUB_LAYOUT_CONSTANTS.allowedSourceCounts.includes(layout.sources.length) && layout.sources.every((item) => !blocked(item)));
    return { candidates, diagnostics: { ...diagnostics, rejectedForOpenings: raw.length - candidates.length } };
  }
  const number = (value, fallback = Number.POSITIVE_INFINITY) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  function hasSideWallInvolvement(layout) {
    return ((layout == null ? void 0 : layout.sources) || []).some((source2) => (source2 == null ? void 0 : source2.placement) === "left" || (source2 == null ? void 0 : source2.placement) === "right");
  }
  function compareFastPlacementCandidates(a, b) {
    const A = (a == null ? void 0 : a.metrics) || {};
    const B = (b == null ? void 0 : b.metrics) || {};
    const fields = [
      "priorityNullCount30To60",
      "worstPriorityNullDepthDb",
      "worstSeatVariationDb",
      "meanSeatVariationDb",
      "houseCurveCompatibilityDb",
      "destructiveBroadNullCount"
    ];
    for (const field of fields) {
      const delta = number(A[field]) - number(B[field]);
      if (Math.abs(delta) > 0.05) return delta;
    }
    const tierDelta = number(a == null ? void 0 : a.practicalTier, 9) - number(b == null ? void 0 : b.practicalTier, 9);
    if (tierDelta !== 0) return tierDelta;
    return String((a == null ? void 0 : a.id) || "").localeCompare(String((b == null ? void 0 : b.id) || ""));
  }
  function isSideWallGainMaterial({
    sideCandidate,
    practicalCandidate,
    quantity
  }) {
    if (!(sideCandidate == null ? void 0 : sideCandidate.metrics) || !(practicalCandidate == null ? void 0 : practicalCandidate.metrics)) return false;
    const side = sideCandidate.metrics;
    const practical = practicalCandidate.metrics;
    const variationThresholdDb = Number(quantity) === 4 ? 2.5 : Number(quantity) === 2 ? 2 : 0.75;
    const variationGain = number(practical.worstSeatVariationDb, 0) - number(side.worstSeatVariationDb, 0);
    const smoothnessGain = number(practical.houseCurveCompatibilityDb, 0) - number(side.houseCurveCompatibilityDb, 0);
    const removesPriorityNull = number(practical.priorityNullCount30To60, 0) > number(side.priorityNullCount30To60, 0) && number(practical.worstPriorityNullDepthDb, 0) >= 8 && number(side.worstPriorityNullDepthDb, 0) <= number(practical.worstPriorityNullDepthDb, 0) - 3;
    const poorToCredible = number(practical.worstSeatVariationDb, 0) > 9 && number(side.worstSeatVariationDb, 0) <= 6;
    const materiallySmoother = smoothnessGain >= 2.5 && variationGain >= -0.5;
    return removesPriorityNull || variationGain >= variationThresholdDb || poorToCredible || materiallySmoother;
  }
  function selectPracticalRecommendation(candidates, quantity) {
    const pool = (Array.isArray(candidates) ? candidates : []).filter((candidate2) => {
      var _a;
      return ((_a = candidate2 == null ? void 0 : candidate2.metrics) == null ? void 0 : _a.sourceCount) === Number(quantity);
    }).slice().sort(compareFastPlacementCandidates);
    if (!pool.length) return null;
    const acousticWinner = pool[0];
    if (!hasSideWallInvolvement(acousticWinner) || Number(quantity) === 1) {
      return {
        ...acousticWinner,
        recommendationKind: hasSideWallInvolvement(acousticWinner) ? "side-wall-alternative" : "practical",
        practicalReason: hasSideWallInvolvement(acousticWinner) ? "The room-scored single-sub option uses an RP22-style side-wall quarter point." : "Highest-ranked practical canonical layout for this room and seating area."
      };
    }
    const practicalWinner = pool.find((candidate2) => !hasSideWallInvolvement(candidate2));
    if (!practicalWinner || isSideWallGainMaterial({
      sideCandidate: acousticWinner,
      practicalCandidate: practicalWinner,
      quantity
    })) {
      return {
        ...acousticWinner,
        recommendationKind: "side-wall-alternative",
        practicalReason: "Acoustic alternative — less practical placement. It is surfaced because the predicted improvement is material."
      };
    }
    return {
      ...practicalWinner,
      recommendationKind: "practical-preferred",
      practicalReason: "Preferred practical front/rear-wall solution; the side-wall gain was too small to justify the installation compromise."
    };
  }
  const SPEED_OF_SOUND = 343;
  function alignSubsToRSP(sources, rspPosition) {
    if (!Array.isArray(sources) || sources.length === 0) return sources;
    if (!rspPosition || !Number.isFinite(rspPosition.x) || !Number.isFinite(rspPosition.y)) {
      return sources;
    }
    const rsp = {
      x: rspPosition.x,
      y: rspPosition.y,
      z: rspPosition.z ?? 1.2
    };
    const subDistances = sources.map((sub) => {
      var _a;
      const dx = sub.x - rsp.x;
      const dy = sub.y - rsp.y;
      const dz = (sub.z ?? 0) - rsp.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const arrivalTime = distance / SPEED_OF_SOUND;
      const manualDelayMsRaw = Number((_a = sub.tuning) == null ? void 0 : _a.delayMs);
      const manualDelayMs = Number.isFinite(manualDelayMsRaw) ? manualDelayMsRaw : 0;
      return {
        sub,
        distance,
        arrivalTime,
        manualDelayMs,
        effectiveArrivalMs: arrivalTime * 1e3 + manualDelayMs
      };
    });
    const maxEffectiveArrivalMs = Math.max(...subDistances.map((s) => s.effectiveArrivalMs));
    return subDistances.map(({ sub, manualDelayMs, effectiveArrivalMs }) => {
      var _a, _b;
      const userDelayMs = manualDelayMs;
      const alignmentDelayMs = maxEffectiveArrivalMs - effectiveArrivalMs;
      return {
        ...sub,
        tuning: {
          ...sub.tuning || {},
          gainDb: ((_a = sub.tuning) == null ? void 0 : _a.gainDb) || 0,
          delayMs: userDelayMs + alignmentDelayMs,
          polarity: ((_b = sub.tuning) == null ? void 0 : _b.polarity) || "normal"
        }
      };
    });
  }
  const finite = (value) => Number.isFinite(Number(value));
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
  function smoothCurve(curve, radius = 1) {
    const points = Array.isArray(curve) ? curve : [];
    return points.map((point, index) => {
      const values = points.slice(Math.max(0, index - radius), index + radius + 1).map((entry) => Number(entry == null ? void 0 : entry.spl)).filter(Number.isFinite);
      return { frequency: Number(point == null ? void 0 : point.frequency), spl: mean(values) };
    }).filter((point) => finite(point.frequency) && finite(point.spl));
  }
  function detectBroadNulls(curve) {
    const smooth = smoothCurve(curve);
    const assessed = smooth.map((point, index) => {
      const shoulders = smooth.slice(Math.max(0, index - 4), Math.max(0, index - 1)).concat(smooth.slice(index + 2, index + 5)).map((entry) => entry.spl).filter(Number.isFinite);
      return { ...point, depthDb: Math.max(0, mean(shoulders) - point.spl) };
    });
    const groups = [];
    let active = [];
    assessed.forEach((point) => {
      if (point.depthDb >= 8) active.push(point);
      else if (active.length) {
        groups.push(active);
        active = [];
      }
    });
    if (active.length) groups.push(active);
    return groups.filter((group) => group.length >= 2).map((group) => {
      const worst = group.reduce((result, point) => point.depthDb > result.depthDb ? point : result);
      return {
        startHz: round(group[0].frequency, 1),
        endHz: round(group[group.length - 1].frequency, 1),
        centreHz: round(worst.frequency, 1),
        depthDb: round(worst.depthDb)
      };
    });
  }
  function houseCurveCompatibility(curve) {
    const points = smoothCurve(curve).filter((point) => point.frequency >= 20 && point.frequency <= 120);
    if (!points.length) return Number.POSITIVE_INFINITY;
    const residuals = points.map((point) => {
      const targetShape = Math.max(0, Math.min(6, 3 * Math.log2(80 / point.frequency)));
      return point.spl - targetShape;
    });
    const offset = mean(residuals);
    return Math.sqrt(mean(residuals.map((value) => (value - offset) ** 2)));
  }
  function variationMetrics(curves) {
    if (curves.length < 2) return { worstSeatVariationDb: 0, meanSeatVariationDb: 0 };
    const length = Math.min(...curves.map((curve) => curve.length));
    const variations = Array.from({ length }, (_, index) => {
      const values = curves.map((curve) => {
        var _a;
        return Number((_a = curve[index]) == null ? void 0 : _a.spl);
      }).filter(Number.isFinite);
      return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
    });
    return {
      worstSeatVariationDb: Math.max(0, ...variations),
      meanSeatVariationDb: mean(variations)
    };
  }
  function describeConsistency(value, rspOnly) {
    if (rspOnly) return "RSP-only indication";
    if (value <= 4) return "Strong expected consistency";
    if (value <= 7) return "Good expected consistency";
    if (value <= 10) return "Moderate seat variation";
    return "Higher seat-variation risk";
  }
  function describeNullRisk(count, depth) {
    if (count === 0 && depth < 6) return "Low 30–60 Hz null risk";
    if (count === 0) return "Moderate 30–60 Hz risk";
    return "Elevated 30–60 Hz null risk";
  }
  function assessCandidate(layout, transfer, rspOnly) {
    const rawCurves = rspOnly ? [transfer == null ? void 0 : transfer.rspCurve] : ((transfer == null ? void 0 : transfer.seatCurves) || []).map((seat) => seat == null ? void 0 : seat.responseData);
    const curves = rawCurves.filter((curve) => Array.isArray(curve) && curve.length > 0);
    const perListener = curves.map((curve, index) => {
      const nulls = detectBroadNulls(curve);
      const priorityNulls2 = nulls.filter((item) => item.centreHz >= 30 && item.centreHz <= 60);
      return {
        listenerIndex: index,
        nulls,
        priorityNulls: priorityNulls2,
        houseCurveCompatibilityDb: houseCurveCompatibility(curve)
      };
    });
    const variation = variationMetrics(curves);
    const priorityNulls = perListener.flatMap((listener) => listener.priorityNulls);
    const allNulls = perListener.flatMap((listener) => listener.nulls);
    const houseFit = mean(perListener.map((listener) => listener.houseCurveCompatibilityDb).filter(Number.isFinite));
    const metrics = {
      sourceCount: layout.sources.length,
      seatsAssessed: rspOnly ? 0 : curves.length,
      rspOnly,
      priorityNullCount30To60: priorityNulls.length,
      worstPriorityNullDepthDb: Math.max(0, ...priorityNulls.map((item) => item.depthDb)),
      destructiveBroadNullCount: allNulls.length,
      worstBroadNullDepthDb: Math.max(0, ...allNulls.map((item) => item.depthDb)),
      worstSeatVariationDb: round(variation.worstSeatVariationDb),
      meanSeatVariationDb: round(variation.meanSeatVariationDb),
      houseCurveCompatibilityDb: round(houseFit),
      expectedConsistencyLabel: describeConsistency(variation.worstSeatVariationDb, rspOnly),
      nullRiskLabel: describeNullRisk(priorityNulls.length, Math.max(0, ...priorityNulls.map((item) => item.depthDb))),
      smoothnessLabel: houseFit <= 3 ? "Smooth broad response" : houseFit <= 5 ? "Workable broad response" : "More correction likely"
    };
    return { ...layout, metrics };
  }
  function runFastBassPlacementAdvisor({
    roomDims,
    seatingPositions,
    rspPosition,
    physicsOptions,
    sourceHeights,
    roomElements,
    cabinetHalfExtents
  }) {
    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    const realSeats = (Array.isArray(seatingPositions) ? seatingPositions : []).filter((seat) => finite(seat == null ? void 0 : seat.x) && finite(seat == null ? void 0 : seat.y));
    const rspOnly = realSeats.length === 0;
    const generated = generateBestSubLayoutCandidateSet(
      roomDims,
      sourceHeights,
      roomElements,
      cabinetHalfExtents
    );
    const options = {
      ...physicsOptions,
      freqMinHz: 20,
      freqMaxHz: 160,
      smoothing: "none",
      pointsPerOctave: BEST_SUB_LAYOUT_CONSTANTS.previewPointsPerOctave
    };
    const preparedModes = prepareModeBank(roomDims, options);
    const listeners = {
      rspPosition: rspOnly ? rspPosition : null,
      seatingPositions: rspOnly ? [] : realSeats
    };
    const assessed = generated.candidates.map((layout) => {
      const sources = rspPosition ? alignSubsToRSP(layout.sources, rspPosition) : layout.sources;
      const transfer = computeNormalizedRoomTransfer({
        roomDims,
        ...listeners,
        subsForSimulation: sources,
        physicsOptions: options,
        preparedModes,
        pointsPerOctave: BEST_SUB_LAYOUT_CONSTANTS.previewPointsPerOctave
      });
      return assessCandidate({ ...layout, sources }, transfer, rspOnly);
    });
    const recommendations = {
      1: selectPracticalRecommendation(assessed, 1),
      2: selectPracticalRecommendation(assessed, 2),
      4: selectPracticalRecommendation(assessed, 4)
    };
    const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      recommendations,
      candidateCount: assessed.length,
      rspOnly,
      diagnostics: generated.diagnostics,
      calculationTimeMs: ended - started,
      authority: "lightweight-placement-advisor",
      grading: "none"
    };
  }
  self.onmessage = (event) => {
    const { requestId, fingerprint: fingerprint2, payload } = event.data || {};
    try {
      const result = runFastBassPlacementAdvisor(payload);
      self.postMessage({ type: "complete", requestId, fingerprint: fingerprint2, result });
    } catch (error) {
      self.postMessage({
        type: "error",
        requestId,
        fingerprint: fingerprint2,
        error: (error == null ? void 0 : error.message) || String(error)
      });
    }
  };
})();
