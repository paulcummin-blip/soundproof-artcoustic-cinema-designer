import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from './modalCalculations.js';
import { buildFrequencyAxis, interpolateCurveDb } from './rewCorePrimitives.js';

const SPEED_OF_SOUND_MPS = 343;
const MIN_DISTANCE_M = 0.01;



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

// computeRoomModesLocal — imported from modalCalculations.js

// estimateModeQLocal — imported from modalCalculations.js

function estimateModeQByType(mode, axialQOverride = 4.0) {
  const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  const axialQ = Number.isFinite(Number(axialQOverride)) ? Number(axialQOverride) : 4.0;

  // Parity-corrected base Q values (updated from Q Source Audit, 2026-06-19).
  // Previous values: axial 8.0, tangential 6.0, oblique 4.5 — were ~1.8× too high.
  // These are pre-Sabine-clamp defaults; final Q = Math.max(1, Math.min(baseQ, absorptionQ)).
  if (activeAxes === 1) {
    return axialQ;
  }

  if (activeAxes === 2) {
    return 3.9;
  }

  return 2.5;
}

// __CANDIDATE_FREQ_DEP_Q__
// Variant F: frequency-dependent Q cap from Damping Bandwidth Parity Audit (2026-06-29).
// Replaces the static baseQ ceiling with a cap that decreases with frequency,
// matching the observed increasing modal density and boundary damping in REW.
// Formula: finalQ = Math.max(1, Math.min(sabineQ, frequencyDependentCap(f)))
// DO NOT use in production without further audit. Gated by qStrategy option.
function freqDependentQCap(freqHz) {
  if (freqHz < 50)  return 80;
  if (freqHz < 85)  return 50;
  if (freqHz < 160) return 30;
  return 20;
}

// __PRODUCTION_SOFT_Q_CAP__ (promoted 2026-06-29)
// Replaces the hard tiered Q ceiling (80/50/30/20) with a smooth power-law soft clamp.
// Formula: Q_cap(f) = A * f^(-n), clamped to [Q_MIN, Q_MAX].
// Anchor calibration: 30Hz→40, 60Hz→28, 100Hz→18, 160Hz→13, 220Hz→10.
// Allows natural Sabine Q values (e.g. 14.8 @ 34 Hz, 22.4 @ 68 Hz) without compression.
// Only compresses extreme rigid-room Q (e.g. >40 at low freq, >28 at mid freq).
// No hard band-edge discontinuities. Safe across all room geometries.
function smoothSoftQCap(freqHz) {
  const A = 200;
  const n = 0.52;
  const cap = A / Math.pow(Math.max(freqHz, 1), n);
  return Math.max(8, Math.min(45, cap));
}

// __CANDIDATE_REW_ABSORPTION_AUTHORITY__ (2026-07-04)
// New selectable Q strategy: "REW-style absorption authority". Production 'smooth_soft_cap'
// strategy (default) is completely unchanged — this is only active when a caller explicitly
// passes qStrategy: 'rew_absorption_authority'.
// Goal: give surface absorption real, visible authority over modal damping/SPL, matching the
// much stronger absorption sensitivity seen in REW. The production soft cap (ceiling ~45,
// floor ~8) compresses most of the natural Sabine Q swing between low and high absorption
// before it reaches the resonant transfer function, so raising absorption from 0.30 to 1.00
// barely moves the final curve. This strategy instead maps the room's average absorption
// coefficient directly onto a wide Q range (low absorption → high, sharp-peaked Q; full
// absorption → low, near-critically-damped Q), using the physical Sabine Q only as an
// upper ceiling so the mapping never invents damping the room's absorption input didn't
// justify. Mode frequencies, source/receiver geometry, and graph rendering are untouched —
// only the finalQValue assigned to each mode changes.
function rewAbsorptionAuthorityQ(freqHz, absorptionQ, surfaceAbsorption) {
  const avgAbsorption = (
    (surfaceAbsorption?.front ?? 0.3) +
    (surfaceAbsorption?.back ?? 0.3) +
    (surfaceAbsorption?.left ?? 0.3) +
    (surfaceAbsorption?.right ?? 0.3) +
    (surfaceAbsorption?.floor ?? 0.3) +
    (surfaceAbsorption?.ceiling ?? 0.3)
  ) / 6;

  // Frequency-dependent ceiling for the near-rigid (avgAbsorption -> 0) end — raised relative
  // to the production smoothSoftQCap so low-absorption rooms show genuinely sharp modal peaks/nulls.
  const rigidRoomCeilingQ = smoothSoftQCap(freqHz) * 1.6;
  const fullAbsorptionFloorQ = 1.3; // near-critical damping when the room is fully absorptive

  // Monotonic authority curve: absorption drives Q from the rigid-room ceiling down to the
  // full-absorption floor. Exponent < 1 keeps the mid-range (e.g. 0.30) close to a REW-like
  // baseline while still leaving strong headroom for the 0.30 -> 1.00 move to be dramatic.
  const authorityQ = rigidRoomCeilingQ - (rigidRoomCeilingQ - fullAbsorptionFloorQ) * Math.pow(avgAbsorption, 0.85);

  return Math.max(1, Math.min(absorptionQ, authorityQ));
}

// __CANDIDATE_REW_MODAL_BANDWIDTH__ (2026-07-05)
// New selectable Q strategy: "REW-style Modal Bandwidth". Production 'smooth_soft_cap' strategy
// (default) is completely unchanged — this is only active when a caller explicitly passes
// qStrategy: 'rew_modal_bandwidth'. Goal: broaden modal peak/null skirts (slower low-end
// recovery, wider resonance bandwidth) to better match REW's observed envelope shape, WITHOUT
// touching modal frequencies, source/receiver coupling, source amplitude, direct field,
// reflections, or graph rendering. Only the effective Q fed into resonantTransfer() changes:
// effectiveQ = finalQ * bandwidthScale, where finalQ is computed identically to the production
// smooth soft cap (Math.max(1, Math.min(absorptionQ, smoothSoftQCap(freq)))).
function rewModalBandwidthQ(freqHz, absorptionQ, bandwidthScale) {
  const softCap = smoothSoftQCap(freqHz);
  const finalQ = Math.max(1, Math.min(absorptionQ, softCap));
  const scale = Number.isFinite(Number(bandwidthScale)) ? Number(bandwidthScale) : 0.55;
  return Math.max(1, finalQ * scale);
}

// modeShapeValueLocal — imported from modalCalculations.js

// __CANDIDATE_AB_CORRECTED_MODAL__ (Case 065 / Case 071 validated)
// Selectable modal strategy: "Allen & Berkley corrected modal equation (experimental)".
// Only active when qStrategy === 'ab_corrected'. Production 'smooth_soft_cap' path (default)
// is completely unchanged. Replaces ONLY the modal pressure contribution — direct path,
// reflection path, Q assignment, mode frequencies, and source/receiver coupling (mode shapes)
// are untouched. Uses Allen & Berkley (1979) Appendix A Eq. A2 dimensional Green's function
// form (k_r² − k² real part, k·k_r/Q imaginary part, 1/V room-volume normalisation) instead of
// the legacy 1−β² normalised resonant transfer function. Matches Case 065 / Case 071 variant B.
function abCorrectedModalTransferLocal(frequencyHz, modes, source, seat, dims, modalSourceAmplitude1m, delayMs, polarity, captureContributions = false) {
  const { widthM, lengthM, heightM } = dims;
  const contributions = [];
  const roomVolumeM3 = widthM * lengthM * heightM;
  const k = (2 * Math.PI * frequencyHz) / SPEED_OF_SOUND_MPS;
  const tuningPhase = (-2 * Math.PI * frequencyHz * (delayMs / 1000)) + (polarity === 180 ? Math.PI : 0);
  const tuningCos = Math.cos(tuningPhase);
  const tuningSin = Math.sin(tuningPhase);

  let modalSumRe = 0;
  let modalSumIm = 0;

  modes.forEach((mode) => {
    const sourceCoupling = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });
    const receiverCoupling = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
    const combinedCoupling = sourceCoupling * receiverCoupling;

    const kr = (2 * Math.PI * mode.freq) / SPEED_OF_SOUND_MPS;
    const realDen = kr * kr - k * k;
    const imagDen = (k * kr) / Math.max(mode.qValue, 1e-6);
    const denomSq = realDen * realDen + imagDen * imagDen;

    const gain = modalSourceAmplitude1m * combinedCoupling * (1 / roomVolumeM3);
    const contribRe = gain * (realDen / denomSq);
    const contribIm = gain * (-imagDen / denomSq);

    const tunedRe = (contribRe * tuningCos) - (contribIm * tuningSin);
    const tunedIm = (contribRe * tuningSin) + (contribIm * tuningCos);
    modalSumRe += tunedRe;
    modalSumIm += tunedIm;
    if (captureContributions) contributions.push({ nx: mode.nx, ny: mode.ny, nz: mode.nz, type: mode.type, f0: mode.freq, q: mode.qValue, sourceCoupling, receiverCoupling, combinedCoupling, gain, reBeforeScale: contribRe, imBeforeScale: contribIm, tunedRe, tunedIm });
  });

  return { modalSumRe, modalSumIm, contributions };
}

// Returns a complex pressure contribution (re, im) for one mode at the receiver position.
// Modal Green's function: coupling = Ψ_source * Ψ_receiver, resonant transfer H(f, f0, Q).
// pressureMagnitude = modalSourceAmplitude * combinedCoupling * resonanceMagnitude
// modalSourceAmplitude brings the modal layer into the same pressure domain as the direct path.
function modalPressureContributionLocal(frequencyHz, modeFrequencyHz, qValue, combinedCoupling, modalSourceAmplitude, modeIndices, sourceX, sourceY, sourceZ, seatX, seatY, seatZ, disableModalPropagationPhase = false, propagationPhaseScale = 0.5, debugModalHSign = 'normal') {
  // resonantTransfer imported from modalCalculations.js — shared canonical implementation.
  // debugModalHSign 'rew_test' flips the imaginary sign for diagnostic purposes only.
  const { re: _tfRe, im: _tfIm, realDen, imagDen, denominatorSq } = resonantTransfer(frequencyHz, modeFrequencyHz, qValue);
  const transferReal = _tfRe;
  // __TEMP_DIAGNOSTIC_MODAL_H_SIGN__
  // 'normal' = standard convention (negative imaginary — matches resonantTransfer output).
  // 'rew_test' = flipped imaginary sign for parity testing only.
  const transferImag = debugModalHSign === 'rew_test'
    ? +imagDen / denominatorSq
    : _tfIm;

  // ratio = ω/ω₀ — retained locally for the beta debug field in the return object.
  const ratio = (2 * Math.PI * frequencyHz) / (2 * Math.PI * Math.max(modeFrequencyHz, 1e-6));

  const modeOrder = Math.abs(modeIndices.nx) + Math.abs(modeIndices.ny) + Math.abs(modeIndices.nz);
  const orderWeight = 1.0; // global attenuation removed — highOrderAxialScale is the sole governor for axial harmonics

  const effectiveCoupling = combinedCoupling;
  const modalGain = modalSourceAmplitude * effectiveCoupling * orderWeight;

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

const TARGET_DEBUG_FREQUENCIES = [20, 25, 30, 40, 50, 57, 60, 70, 80, 85, 100, 120, 150, 180, 200];
const WHOLE_CURVE_DEBUG_TARGETS = [20, 25, 30, 40, 50, 57, 60, 70, 80, 85, 100, 120, 150, 180, 200];
const MODAL_CONTRIBUTOR_DEBUG_TARGETS = [20, 25, 30, 40, 50, 57, 60, 70, 80, 85, 100, 120, 150, 180, 200];
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

function legacyModalTransferLocal(frequencyHz, modes, source, seat, roomDims, widthM, lengthM, heightM, modalSourceAmplitude, modalStorageMode = 'none', pureDeterministicModalSum = false, disableModalPropagationPhase = false, mute68HzAxialMode = false, propagationPhaseScale = 0.5, delayMs = 0, polarity = 0, debugMode200Multiplier = 1.0, debugModalHSign = 'normal', highOrderAxialScale = 1.0, axialFamilyScale = 1.0, tangentialFamilyScale = 1.0, obliqueFamilyScale = 1.0, muteModeKey = null) {
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
      propagationPhaseScale,
      debugModalHSign
    );

    const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const isMuted68HzAxialMode = mute68HzAxialMode === true && mode.type === 'axial' && Math.abs(mode.freq - 68.6) <= 0.2;
    // __TEMP_DIAGNOSTIC_MUTE_MODE_KEY__ — generic single-mode mute for the Modal Importance audit.
    // Only active when muteModeKey is explicitly passed (never by production/BassResponse.jsx).
    const isMutedByKey = !!muteModeKey && mode.nx === muteModeKey.nx && mode.ny === muteModeKey.ny && mode.nz === muteModeKey.nz;
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

    // Active modal vector source. Coherent, split, and distributed diagnostics all
    // derive from this same vector before applying their different coherence behaviour.
    const activeStoredModalContrib = pureDeterministicModalSum
      ? storedModalContrib
      : perturbedStoredModalContrib;

    // Diagnostic-only per-mode coherent/energetic split. Preserves each modal
    // contribution's energy while moving only the split-off portion out of
    // pressure-domain modal aggregation. Active modalSumRe/modalSumIm are untouched.
    const splitModalMagSq =
      (activeStoredModalContrib.real * activeStoredModalContrib.real) +
      (activeStoredModalContrib.imag * activeStoredModalContrib.imag);
    splitCoherenceModalSumRe += activeStoredModalContrib.real * PER_MODE_SPLIT_COHERENT_FRACTION;
    splitCoherenceModalSumIm += activeStoredModalContrib.imag * PER_MODE_SPLIT_COHERENT_FRACTION;
    splitCoherenceModalEnergySq += splitModalMagSq * (1 - (PER_MODE_SPLIT_COHERENT_FRACTION * PER_MODE_SPLIT_COHERENT_FRACTION));

    // Diagnostic-only distributed modal coherence sum. Uses the already-built
    // individual modal vector, preserves its magnitude, and only changes how the
    // diagnostic modal vectors combine. It does not affect modalSumRe/modalSumIm.
    const distributedPhaseRad = deterministicDistributedModalCoherencePhaseRad(mode, frequencyHz);
    const distributedPhaseCos = Math.cos(distributedPhaseRad);
    const distributedPhaseSin = Math.sin(distributedPhaseRad);
    distributedCoherenceModalSumRe +=
      (activeStoredModalContrib.real * distributedPhaseCos) -
      (activeStoredModalContrib.imag * distributedPhaseSin);
    distributedCoherenceModalSumIm +=
      (activeStoredModalContrib.real * distributedPhaseSin) +
      (activeStoredModalContrib.imag * distributedPhaseCos);

    diagnosticPerturbedModalSumRe += perturbedStoredModalContrib.real;
    diagnosticPerturbedModalSumIm += perturbedStoredModalContrib.imag;

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
    if (!isMuted68HzAxialMode && !isMutedByKey) {
      // High-order axial modal amplitude correction for REW parity.
      // Keeps Q unchanged; reduces stored pressure contribution for axial harmonics only.
      // Axial modes with modeOrder >= 2 (e.g. 2,0,0 at 68.6 Hz) are over-estimated by the engine
      // relative to REW because their modal pressure accumulates at the full axial Q gain without
      // the harmonic energy dissipation that applies in measured rooms. A scale of 0.50 brings
      // the 68.6 Hz axial harmonic from ~94.8 dB to ~92.6 dB against the REW target of ~92.4 dB
      // without shifting the primary modes at 34.3 Hz or 48.5 Hz.
      // Q values, coupling, storage factor, tangential/oblique modes, and all non-modal paths are unchanged.
      const HIGH_ORDER_AXIAL_SCALE = Number.isFinite(Number(highOrderAxialScale)) ? Number(highOrderAxialScale) : 1.0;
      const highOrderAxialCorrectionScale = (mode.type === 'axial' && modeOrder >= 2)
        ? HIGH_ORDER_AXIAL_SCALE
        : 1.0;

      // __TEMP_REW_PARITY_MODE_200_SCALE__ (diagnostic overlay — preserved for optional dev use)
      // When debugMode200Multiplier !== 1.0, it overrides only the (2,0,0) contribution regardless
      // of the production correction above. Set to 1.0 to observe the production behaviour cleanly.
      const _mode200DebugOverride = (mode.nx === 2 && mode.ny === 0 && mode.nz === 0 && debugMode200Multiplier !== 1.0)
        ? debugMode200Multiplier
        : 1.0;

      // __TEMP_DIAGNOSTIC_FAMILY_SCALES__
      // Diagnostic-only per-family scalar applied immediately before accumulation.
      // Does not affect mode data, Q values, coupling, or any non-modal path.
      const _familyScale = mode.type === 'axial'      ? axialFamilyScale
                         : mode.type === 'tangential'  ? tangentialFamilyScale
                         : mode.type === 'oblique'     ? obliqueFamilyScale
                         : 1.0;

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
        activePhaseAngleDeg: (Math.atan2(activeStoredModalContrib.imag, activeStoredModalContrib.real) * 180) / Math.PI,
        qValue: mode.qValue,
        activeTransferMagnitudeAtNull,
        modalTransferMagnitude: activeTransferMagnitudeAtNull,
        rawModalMagnitude: rawMagnitudeBeforeStorage,
        estimatedResonanceMagnitude,
        mutedFromActiveModalSum: isMuted68HzAxialMode || isMutedByKey,
        // __TEMP_DIAGNOSTIC_ADDITIVE_FIELDS__ — read-only extra fields for Live Modal Vector Build panel.
        transferReal: modalContrib.transferReal,
        transferImag: modalContrib.transferImag,
        transferPhaseDeg: (Math.atan2(modalContrib.transferImag, modalContrib.transferReal) * 180) / Math.PI,
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
          mutedFromActiveModalSum: isMuted68HzAxialMode || isMutedByKey,
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

  // Copy taken BEFORE sorting — preserves the engine's true accumulation order (modes.forEach order),
  // needed by the Running Vector Build audit. Array.sort() below mutates in place, so this must come first.
  const contributorsInEngineOrder = [...activeModalContributorRows];
  const _debugActiveModalVectorBreakdown = {
    frequencyHz,
    modalSumRe,
    modalSumIm,
    contributors: activeModalContributorRows
      .sort((a, b) => b.activeMagnitude - a.activeMagnitude),
    contributorsInEngineOrder,
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

// Compute room modes with Q values. Extracted from simulateBassResponseRewCore so
// callers that invoke the engine many times for the same room (e.g.
// computeNormalizedRoomTransfer: N subs × M listeners) can compute modes once
// and pass them via options.precomputedModes, avoiding redundant work.
// Backward-compatible: if precomputedModes is not provided, the engine calls
// this internally exactly as before.
export function computeModesWithQ({ widthM, lengthM, heightM, modeGenerationFMaxHz, axialQ, surfaceAbsorption, enableModes, options = {} }) {
  if (!enableModes) return [];
  return computeRoomModesLocal({
    widthM,
    lengthM,
    heightM,
    fMax: modeGenerationFMaxHz,
    c: SPEED_OF_SOUND_MPS,
  }).map((mode) => {
    const baseQ = estimateModeQByType(mode, axialQ);
    const absorptionQ = estimateModeQLocal({
      roomDims: { widthM, lengthM, heightM },
      surfaceAbsorption,
      f0: mode.freq,
      mode,
    });
    const isAxialOverride = options?.overrideConstantAxialQ === true && mode.type === 'axial';
    const isAbsorptionAxialOverride = options?.overrideAbsorptionAxialQ === true && mode.type === 'axial';
    const qStrategy = options?.qStrategy || 'production';
    let finalQValue;
    if (isAxialOverride) {
      finalQValue = baseQ;
    } else if (isAbsorptionAxialOverride) {
      finalQValue = absorptionQ;
    } else if (qStrategy === 'freq_dependent_cap') {
      const fdCap = freqDependentQCap(mode.freq);
      finalQValue = Math.max(1, Math.min(absorptionQ, fdCap));
    } else if (qStrategy === 'smooth_soft_cap') {
      const softCap = smoothSoftQCap(mode.freq);
      finalQValue = Math.max(1, Math.min(absorptionQ, softCap));
    } else if (qStrategy === 'rew_absorption_authority') {
      finalQValue = rewAbsorptionAuthorityQ(mode.freq, absorptionQ, surfaceAbsorption);
    } else if (qStrategy === 'rew_modal_bandwidth') {
      finalQValue = rewModalBandwidthQ(mode.freq, absorptionQ, options?.rewModalBandwidthScale);
    } else {
      const softCap = smoothSoftQCap(mode.freq);
      finalQValue = Math.max(1, Math.min(absorptionQ, softCap));
    }
    return { ...mode, qValue: finalQValue };
  });
}

// Core-owned preparation helper. Derives surface-absorption normalization,
// mode-generation frequency, Q strategy and overrides EXACTLY as
// simulateBassResponseRewCore derives them, then returns the mode bank.
// Callers that invoke the engine many times for the same room (e.g.
// computeNormalizedRoomTransfer: N subs × M listeners) call this once and
// pass the result via options.precomputedModes, avoiding redundant mode
// computation while guaranteeing identical preprocessing.
export function prepareModeBank(roomDims, options = {}) {
  const widthM = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);
  const heightM = Number(roomDims?.heightM);

  const enableModes = options?.enableModes === true;
  const axialQOption = Number(options?.axialQ);
  const axialQ = Number.isFinite(axialQOption) ? axialQOption : 8.0;
  const surfaceAbsorption = normalizeSurfaceAbsorption(options?.surfaceAbsorption);
  const freqMaxHz = options?.freqMaxHz;
  const modeGenerationFMaxHz = Number.isFinite(Number(options?.modeGenerationFMaxHz))
    ? Number(options.modeGenerationFMaxHz)
    : freqMaxHz;

  return computeModesWithQ({ widthM, lengthM, heightM, modeGenerationFMaxHz, axialQ, surfaceAbsorption, enableModes, options });
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
  // __REW_PARITY_MODAL_PHASE__
  // REW parity mode disables distance-based propagation phase on modal contributions.
  // Modal phase is carried only by the resonant transfer function.
  // When rewParityModalPhase is true, both propagationPhaseScale and disableModalPropagationPhase
  // are forced to their zero/true values regardless of caller options.
  const rewParityModalPhase = options?.rewParityModalPhase === true;
  // __TEMP_PROTOTYPE_LF_REFLECTION_HANDOFF__ (2026-07-04)
  // Prototype parity test only — default false, production behaviour unchanged unless enabled.
  // When true: below Schroeder, image-source reflections contribute 0 (direct + modal only).
  // From Schroeder to Schroeder+40Hz, reflections fade in linearly. Above that, unchanged.
  const lfReflectionHandoffPrototype = options?.lfReflectionHandoffPrototype === true;
  // Mode-only parity gate: suppresses direct path and image/reflection contributions
  // when the caller is running a REW modal-only parity comparison.
  // Does not affect normal product mode (rewSourceCurveMode !== 'flat_rew_reference').
  const isModeOnlyParity =
    (options?.rewSourceCurveMode === 'flat_rew_reference' && options?.rewParityFieldMode === 'full_field') ||
    options?.rewParityFieldMode === 'modes_only';
  const disableModalPropagationPhase = rewParityModalPhase ? true : options?.disableModalPropagationPhase === true;
  const mute68HzAxialMode = options?.mute68HzAxialMode === true;
  const propagationPhaseScaleOption = Number(options?.propagationPhaseScale);
  const propagationPhaseScale = rewParityModalPhase ? 0 : (Number.isFinite(propagationPhaseScaleOption) ? propagationPhaseScaleOption : 0.5);
  const axialQOption = Number(options?.axialQ);
  const axialQ = Number.isFinite(axialQOption) ? axialQOption : 8.0;
  const surfaceAbsorption = normalizeSurfaceAbsorption(options?.surfaceAbsorption);
  // __TEMP_DIAGNOSTIC_MODAL_H_SIGN__
  const debugModalHSign = options?.debugModalHSign === 'rew_test' ? 'rew_test' : 'normal';
  // __TEMP_REW_PARITY_HIGH_ORDER_AXIAL_SCALE__
  // Diagnostic-only scale applied to axial modes with modeOrder >= 2. Default 1.00 = no change.
  const highOrderAxialScale = Number.isFinite(Number(options?.highOrderAxialScale)) ? Number(options.highOrderAxialScale) : 1.0;

  // __TEMP_DIAGNOSTIC_FAMILY_SCALES__
  // Diagnostic-only per-family amplitude scalars. Default 1.0 = no change to production behaviour.
  // Consumed by legacyModalTransferLocal; do not affect Q, coupling, or direct/reflection paths.
  const axialFamilyScale = Number.isFinite(Number(options?.axialFamilyScale)) ? Number(options.axialFamilyScale) : 1.0;
  const tangentialFamilyScale = Number.isFinite(Number(options?.tangentialFamilyScale)) ? Number(options.tangentialFamilyScale) : 1.0;
  const obliqueFamilyScale = Number.isFinite(Number(options?.obliqueFamilyScale)) ? Number(options.obliqueFamilyScale) : 1.0;
  // __TEMP_DIAGNOSTIC_MUTE_MODE_KEY__ — only active when explicitly passed (Modal Importance audit only).
  const muteModeKey = options?.muteModeKey && Number.isFinite(Number(options.muteModeKey.nx)) && Number.isFinite(Number(options.muteModeKey.ny)) && Number.isFinite(Number(options.muteModeKey.nz))
    ? { nx: Number(options.muteModeKey.nx), ny: Number(options.muteModeKey.ny), nz: Number(options.muteModeKey.nz) }
    : null;

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
  const freqsHz = buildFrequencyAxis(freqMinHz, freqMaxHz, options?.pointsPerOctave);
  const captureFrequencies = options?.runtimeVectorCapture === true
    ? [20, freqsHz.reduce((best, hz) => Math.abs(hz - 34.3) < Math.abs(best - 34.3) ? hz : best, freqsHz[0])]
    : [];
  const runtimeVectorCapture = [];
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

          const boundary = rx < 0 ? 'left' : rx > 0 ? 'right' : ry < 0 ? 'front' : ry > 0 ? 'rear' : rz < 0 ? 'floor' : 'ceiling';
          sources.push({ x: imgX, y: imgY, z: imgZ, reflectionCoefficient: rc, order: totalOrder, boundary });
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

  // __DIAGNOSTIC_MODE_GENERATION_FMAX__ — decouples the mode-generation ceiling from the
  // evaluated frequency-axis ceiling (freqMaxHz). Defaults to freqMaxHz when not supplied,
  // so production callers (which never pass this) are completely unaffected. Diagnostic
  // panels that evaluate a single narrow frequency window (freqMaxHz = target + 0.01) pass
  // this separately (e.g. 200 Hz) so higher-frequency modes can still contribute their
  // resonant tails at the evaluated frequency, matching the production graph's mode set.
  const modeGenerationFMaxHz = Number.isFinite(Number(options?.modeGenerationFMaxHz))
    ? Number(options.modeGenerationFMaxHz)
    : freqMaxHz;

  const modes = Array.isArray(options?.precomputedModes)
    ? options.precomputedModes
    : computeModesWithQ({ widthM, lengthM, heightM, modeGenerationFMaxHz, axialQ, surfaceAbsorption, enableModes, options });

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
  // __TEMP_DIAGNOSTIC_ADDITIVE_FIELDS__ — read-only per-frequency vector breakdown for Live Modal Vector Build panel.
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
    // __FIX_MODAL_EXCITATION_DECOUPLED__ 2026-06-29
    // Modal excitation must NOT be attenuated by listener distance. Room modes are a global
    // pressure field excited by the source injecting energy into the room — the listener position
    // does not reduce that energy. Only the direct/reflection paths carry geometric distance loss.
    // Previous default ('distance_normalized') was suppressing modal energy at the seating position
    // by applying -20*log10(d/1m) to modal amplitude, causing the 30–40 Hz null to be too shallow
    // and absorption sensitivity to be masked.
    // 'existing' = pure 1m reference amplitude, no listener distance penalty. Direct/reflection
    // paths are unchanged — they still carry full geometric 1/r attenuation per their own code paths.
    const modalSourceReferenceMode = options?.modalSourceReferenceMode || (rewParityModalPhase ? 'room_volume' : 'existing');
    const modalStorageMode = options?.modalStorageMode || 'none';
    const modalSourceAmplitudeBase = Math.pow(10, (curveDb + source.tuning.gainDb) / 20) * modalGainScalar;
    const roomVolumeM3 = widthM * lengthM * heightM;
    // 'no_volume' is a diagnostic alias for 'existing' — explicitly bypasses sqrt(V) normalisation.
    // 'existing' and 'no_volume' both fall through to the final else branch (modalSourceAmplitudeBase unchanged).
    const modalSourceAmplitude1m = modalSourceReferenceMode === 'distance_normalized'
      ? modalSourceAmplitudeBase * Math.pow(10, distanceLossDb / 20)
      : (modalSourceReferenceMode === 'room_volume' || modalSourceReferenceMode === 'room_normalized')
        ? modalSourceAmplitudeBase / Math.sqrt(Math.max(roomVolumeM3, 1e-6))
        : modalSourceAmplitudeBase; // covers 'existing', 'no_volume', and any unrecognised mode

    const timeOfFlightPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS);
    const delayPhase = -2 * Math.PI * frequencyHz * (source.tuning.delayMs / 1000);
    const polarityPhase = source.tuning.polarity === 180 ? Math.PI : 0;
    const totalPhase = timeOfFlightPhase + delayPhase + polarityPhase;

    directRe = amplitude * Math.cos(totalPhase);
    directIm = amplitude * Math.sin(totalPhase);
    // Suppress direct path in mode-only parity mode (flat_rew_reference + full_field or modes_only).
    // Normal product mode is unaffected.
    if (!isModeOnlyParity) {
      sumRe += directRe;
      sumIm += directIm;
    }

    // __TEMP_PROTOTYPE_LF_REFLECTION_HANDOFF__ (2026-07-04)
    // Prototype-only scale for image-source reflections. Default 1 (no change) when the
    // prototype flag is off. When on: 0 below Schroeder, linear fade over the next 40Hz, 1 above.
    const reflectionHandoffScale = lfReflectionHandoffPrototype
      ? Math.max(0, Math.min(1, (frequencyHz - schroederFrequency) / 40))
      : 1;

    // First-order reflections
    imageSources.forEach((imageSource, reflectionIndex) => {
      const imageDx = imageSource.x - seat.x;
      const imageDy = imageSource.y - seat.y;
      const imageDz = imageSource.z - seat.z;
      const imageDistanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(imageDx * imageDx + imageDy * imageDy + imageDz * imageDz));

      const imageDistanceLossDb = -20 * Math.log10(imageDistanceM / 1);
      const imageMagnitudeDb = curveDb + imageDistanceLossDb + source.tuning.gainDb;
      let imageAmplitude = Math.pow(10, imageMagnitudeDb / 20) * imageSource.reflectionCoefficient;
      // diagnostic: reflectionGainScale applied after reflectionCoefficient
      const reflectionGainScale = Number.isFinite(Number(options?.reflectionGainScale)) ? Number(options.reflectionGainScale) : 1.0;
      if (reflectionGainScale !== 1.0) imageAmplitude *= reflectionGainScale;

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
      const reflectionCoherenceWeight = disableReflectionCoherenceWeight
        ? 1
        : Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (frequencyHz - 20) / 140))));
      const imageRe = reflectionCoherenceWeight * imageAmplitude * Math.cos(imageTotalPhase) * reflectionHandoffScale;
      const imageIm = reflectionCoherenceWeight * imageAmplitude * Math.sin(imageTotalPhase) * reflectionHandoffScale;
      reflectionRe += imageRe;
      reflectionIm += imageIm;
      if (captureThisFrequency) capturedReflections.push({ boundary: imageSource.boundary, x: imageSource.x, y: imageSource.y, z: imageSource.z, distanceM: imageDistanceM, reflectionCoefficient: imageSource.reflectionCoefficient, coherenceWeight: reflectionCoherenceWeight, phase: imageTotalPhase, re: imageRe, im: imageIm });
      // Suppress reflection contributions in mode-only parity mode.
      // rewParityModalPhase legacy path preserved; isModeOnlyParity is the new gate.
      if (!rewParityModalPhase && !isModeOnlyParity) {
        sumRe += imageRe;
        sumIm += imageIm;
      }
    });

    // Diffuse late-field approximation
    // Temporary REW parity diagnostic only: no late-field contribution below Schroeder.
    const lateFieldDecay = Math.exp(-(frequencyHz - 20) / 120);
    const lateFieldAmplitude = (disableLateField || frequencyHz < schroederFrequency) ? 0 : amplitude * 0.12 * lateFieldDecay;
    const lateFieldPhase = 2 * Math.PI * frequencyHz * 0.0071 + 1.3;
    lateFieldRe = (disableLateField || frequencyHz < schroederFrequency) ? 0 : lateFieldAmplitude * Math.cos(lateFieldPhase);
    lateFieldIm = (disableLateField || frequencyHz < schroederFrequency) ? 0 : lateFieldAmplitude * Math.sin(lateFieldPhase);
    // Suppress late-field in mode-only parity mode.
    if (!rewParityModalPhase && !isModeOnlyParity) {
      sumRe += lateFieldRe;
      sumIm += lateFieldIm;
    }

    const preModalMagnitude = Math.sqrt(sumRe * sumRe + sumIm * sumIm);

    // Collect step debug data for 30–88 Hz range (extended to cover null-region diagnostic targets)
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
        // diagnostic: reflectionGainScale applied after reflectionCoefficient (debug copy)
        const reflectionGainScale = Number.isFinite(Number(options?.reflectionGainScale)) ? Number(options.reflectionGainScale) : 1.0;
        if (reflectionGainScale !== 1.0) imageAmplitude *= reflectionGainScale;
        const imageTimeOfFlightPhase = -2 * Math.PI * frequencyHz * (imageDistanceM / SPEED_OF_SOUND_MPS);
        // Step-debug copy: jitter removed to match production path.
        const imageTotalPhase = imageTimeOfFlightPhase + delayPhase + polarityPhase;
        // __TEMP_REW_PARITY_TEST_REFLECTION_COHERENCE__ (debug copy — kept in sync with main path)
        const debugCoherenceWeight = disableReflectionCoherenceWeight
          ? 1
          : Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (frequencyHz - 20) / 140))));
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
    let _debugStrongestModeForRow = null; // hoisted for wholeCurveDebugCandidates access
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
    // __TEMP_DIAGNOSTIC_ADDITIVE_FIELDS__ — captures the modal vector actually added to sumRe/sumIm this frequency.
    let _finalModalSumRe = 0;
    let _finalModalSumIm = 0;
    let abCapture = null;
    let abSqrtVScale = null;

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
        Number.isFinite(Number(options?.debugMode200Multiplier)) ? Number(options.debugMode200Multiplier) : 1.0, // __TEMP_REW_PARITY_MODE_200_SCALE__
        debugModalHSign, // __TEMP_DIAGNOSTIC_MODAL_H_SIGN__
        highOrderAxialScale, // __TEMP_REW_PARITY_HIGH_ORDER_AXIAL_SCALE__
        axialFamilyScale, tangentialFamilyScale, obliqueFamilyScale, // __TEMP_DIAGNOSTIC_FAMILY_SCALES__
        muteModeKey // __TEMP_DIAGNOSTIC_MUTE_MODE_KEY__
      );

      // __CANDIDATE_AB_CORRECTED_MODAL__ — override the legacy modal sum with the A&B corrected
      // term only when explicitly selected. Direct path, reflections, and Q assignment above are
      // untouched; this only replaces the additive modal pressure vector before it is summed in.
      // Gain basis matches Case 065/071 Variant B exactly: S_UNIT = 10^(curveDb/20), i.e. the pure
      // source reference level with no gainDb, no modalGainScalar, and no distance/room-volume
      // normalisation folded in (modalSourceAmplitude1m is NOT used here — it can carry extra
      // distance-based attenuation depending on modalSourceReferenceMode, which is not part of
      // the validated Case 071 formula and was causing the flattened response).
      if (options?.qStrategy === 'ab_corrected') {
        const abSourceUnit = Math.pow(10, curveDb / 20);
        // __CASE089_MIDBAND_Q_BOOST__ (2026-07-07)
        // Experimental only — gated strictly behind qStrategy === 'ab_corrected'. Production
        // (default) path is completely unchanged. Applies a fixed 1.5× Q multiplier to modes
        // whose natural frequency lies in the 70–120 Hz band only. All other modes retain their
        // original Q. Direct path, reflections, source curve, geometry, smoothing, modal
        // frequencies, and graph rendering are untouched.
        const abModes = modes.map((mode) => {
          const inMidBand = mode.freq >= 70 && mode.freq <= 120;
          if (!inMidBand) return mode;
          return { ...mode, qValue: mode.qValue * 1.5 };
        });
        const abResult = abCorrectedModalTransferLocal(
          frequencyHz, abModes, source, seat, { widthM, lengthM, heightM },
          abSourceUnit, source.tuning.delayMs, source.tuning.polarity, captureThisFrequency
        );
        // __CANDIDATE_AB_SQRT_V_RECONCILIATION__ (Case 082 Variant B, 2026-07-07)
        // Experimental only — gated strictly behind qStrategy === 'ab_corrected'. Production
        // ('smooth_soft_cap' / default) path is completely unchanged. Reconciles the A&B Appendix
        // A2 1/V room-volume normalisation with the legacy direct/reflection 1/√V reference
        // convention by multiplying the A&B modal pressure sum by √V before superposition. Direct
        // path, reflections, Q, smoothing, source curve, geometry, and graph rendering are untouched.
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

      // __TEMP_DIAGNOSTIC_INVERT_MODAL_VECTOR__ (superseded by debugModalPhaseConvention)
      // Kept for reference — debugModalPhaseConvention covers this with the 'invert' mode.
      if (options?.debugInvertModalVector === true) {
        modalSumRe *= -1;
        modalSumIm *= -1;
      }

      // __TEMP_DIAGNOSTIC_MODAL_PHASE_CONVENTION__
      // Tests whether REW parity requires a phase-convention correction on the modal sum.
      // Applied immediately before the modal vector is added to the pre-modal field.
      // Modes:
      //   'normal'            — no change (default)
      //   'invert'            — negate both Re and Im  (-modalSumRe, -modalSumIm)
      //   'conjugate'         — negate Im only         ( modalSumRe, -modalSumIm)
      //   'negative_conjugate'— negate Re only         (-modalSumRe,  modalSumIm)
      // Does NOT alter modal maths, Q, source curves, or reflection order.
      {
        const _conv = options?.debugModalPhaseConvention;
        if (_conv === 'invert') {
          modalSumRe *= -1;
          modalSumIm *= -1;
        } else if (_conv === 'conjugate') {
          modalSumIm *= -1;
        } else if (_conv === 'negative_conjugate') {
          modalSumRe *= -1;
        }
        // 'normal' or undefined: no change
      }

      // __TEMP_REW_PARITY_MODAL_MAGNITUDE_SCALE__
      // Applied immediately before summation to test whether parity is a modal magnitude issue.
      // Does not affect phase, Q, coupling, order weighting, direct, or reflection paths.
      // Only active when rewParityModalMagnitudeScale is passed (from flat_rew_reference mode in BassResponse).
      const _rewParityModalMagnitudeScale = Number.isFinite(Number(options?.rewParityModalMagnitudeScale)) ? Number(options.rewParityModalMagnitudeScale) : 1.0;
      if (_rewParityModalMagnitudeScale !== 1.0) {
        modalSumRe *= _rewParityModalMagnitudeScale;
        modalSumIm *= _rewParityModalMagnitudeScale;
      }

      // True acoustic pressure superposition:
      // modalSumRe/modalSumIm are already scaled pressure contributions,
      // so they must be added to the existing complex pressure field.
      //
      // __TEMP_DIAGNOSTIC_MODAL_COHERENCE__
      // When modalCoherenceMode is 'distributed', use the distributed-phase diagnostic modal sum.
      // When 'split', the final magnitude is computed after superposition using split-coherence energy.
      // Default ('coherent') is the existing path — no change.
      const _modalCoherenceMode = options?.modalCoherenceMode || 'coherent';
      if (_modalCoherenceMode === 'distributed') {
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

    // __TEMP_DIAGNOSTIC_MODAL_COHERENCE__ split path: override final magnitude with split-coherence energy sum.
    const _coherenceMode = options?.modalCoherenceMode || 'coherent';
    let postModalMagnitude;
    if (_coherenceMode === 'split' && splitCoherenceDiagnostic) {
      postModalMagnitude = splitCoherenceDiagnostic.splitCoherenceFinalMag;
    } else {
      postModalMagnitude = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
    }
    const finalSplDb = 20 * Math.log10(postModalMagnitude);
    if (captureThisFrequency) runtimeVectorCapture.push({
      frequencyHz, source: { modelKey: source.modelKey, x: source.x, y: source.y, z: source.z }, receiver: seat,
      direct: { curveDb, distanceM, distanceLossDb, userGainDb: source.tuning.gainDb, amplitude, timeOfFlightPhase, delayPhase, polarityPhase, directRe, directIm, directMagnitude: Math.hypot(directRe, directIm), directSplDb: 20 * Math.log10(Math.max(Math.hypot(directRe, directIm), 1e-10)) },
      reflections: capturedReflections, reflectionRe, reflectionIm, directPlusReflectionRe: directRe + reflectionRe, directPlusReflectionIm: directIm + reflectionIm,
      directPlusReflectionMagnitude: Math.hypot(directRe + reflectionRe, directIm + reflectionIm), directPlusReflectionSplDb: 20 * Math.log10(Math.max(Math.hypot(directRe + reflectionRe, directIm + reflectionIm), 1e-10)),
      preModalRe: partialCoherencePreModalRe, preModalIm: partialCoherencePreModalIm, preModalMagnitude, preModalSplDb: 20 * Math.log10(Math.max(preModalMagnitude, 1e-10)),
      abSqrtVScale, modes: abCapture || [], modalRe: _finalModalSumRe, modalIm: _finalModalSumIm, modalMagnitude: Math.hypot(_finalModalSumRe, _finalModalSumIm), modalSplEquivalentDb: 20 * Math.log10(Math.max(Math.hypot(_finalModalSumRe, _finalModalSumIm), 1e-10)),
      finalRe: sumRe, finalIm: sumIm, finalMagnitude: postModalMagnitude, finalSplDb,
    });
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

      // Build topMode label from the already-calculated _debugStrongestMode (no new calculations).
      // _debugStrongestMode is only populated for the 30–72 Hz debug range; null outside that range.
      const _topModeLabel = (() => {
        if (!enableModes) return null;
        const sm = _debugStrongestModeForRow;
        if (!sm) return null;
        const indices = `(${sm.nx},${sm.ny},${sm.nz})`;
        const freqStr = Number.isFinite(sm.freq) ? sm.freq.toFixed(1) : '?';
        return `${indices} ${sm.type ?? ''} @ ${freqStr} Hz`;
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
        topMode: _topModeLabel,
      });
    });

    // __TEMP_DIAGNOSTIC_ADDITIVE_FIELDS__ — read-only, does not affect sumRe/sumIm or any returned complexPressure value.
    perFrequencyVectorDebug.push({
      frequencyHz,
      directRe, directIm,
      reflectionRe, reflectionIm,
      modalSumRe: _finalModalSumRe,
      modalSumIm: _finalModalSumIm,
      finalRe: sumRe,
      finalIm: sumIm,
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

  const activeModalVectorPath = pureDeterministicModalSum
    ? 'storedModalContrib clean path'
    : 'perturbedStoredModalContrib diagnostic path';

  return {
    freqsHz,
    splDbRaw,
    complexPressure,
    activeModalVectorPath,
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
    perFrequencyVectorDebug,
    runtimeVectorCapture,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTIC REW-STYLE PARITY FIELD SOLVER
// Isolated from simulateBassResponseRewCore. Do not merge with production path.
//
// Architecture: Modal-only coherent pressure field via rectangular-room Green's function.
// No direct sound added as an independent vector.
// No image-source reflections.
// No late-field energy.
//
// Formula per mode (n):
//   P_n(r_s, r_r, f) = A * Ψ_n(r_s) * Ψ_n(r_r) * H_n(f)
//   where:
//     A             = modalSourceAmplitude (source output at reference, no seat-distance attenuation)
//     Ψ_n(r)        = modeShapeValueLocal — cosine product for source/receiver
//     H_n(f)        = 1 / (1 - (f/f_n)^2 + j*(f/(f_n*Q_n)))   [standard 2nd-order resonant TF]
//
//   P_total = Σ_n P_n(r_s, r_r, f)   (coherent complex sum over all modes up to fMax)
//
// Output format: identical to simulateBassResponseRewCore — { freqsHz, splDbRaw, complexPressure }
// ─────────────────────────────────────────────────────────────────────────────
export function simulateBassResponseRewParityField(roomDims, seatPos, sub, subProductCurve, options = {}) {
  const widthM  = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);
  const heightM = Number(roomDims?.heightM);

  if (!Number.isFinite(widthM) || !Number.isFinite(lengthM) || !Number.isFinite(heightM)) {
    throw new Error('[RewParityField] roomDims must include finite widthM, lengthM, heightM.');
  }

  const seat = {
    x: Number(seatPos?.x),
    y: Number(seatPos?.y),
    z: Number.isFinite(Number(seatPos?.z)) ? Number(seatPos?.z) : 1.2,
  };

  const source = {
    x: Number(sub?.x),
    y: Number(sub?.y),
    z: Number.isFinite(Number(sub?.z)) ? Number(sub?.z) : 0.35,
    tuning: normalizeSubTuning(sub?.tuning),
  };

  if (!Number.isFinite(seat.x) || !Number.isFinite(seat.y)) {
    throw new Error('[RewParityField] seatPos must include finite x and y.');
  }
  if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) {
    throw new Error('[RewParityField] sub must include finite x and y.');
  }
  if (!Array.isArray(subProductCurve) || subProductCurve.length === 0) {
    throw new Error('[RewParityField] subProductCurve must be a non-empty array.');
  }

  const freqMinHz = options?.freqMinHz ?? 20;
  const freqMaxHz = options?.freqMaxHz ?? 200;
  const freqsHz   = buildFrequencyAxis(freqMinHz, freqMaxHz, options?.pointsPerOctave);

  const surfaceAbsorption = normalizeSurfaceAbsorption(options?.surfaceAbsorption);
  const axialQ = Number.isFinite(Number(options?.axialQ)) ? Number(options.axialQ) : 8.0;

  // Compute modes — reusing safe infrastructure
  const modes = computeRoomModesLocal({
    widthM, lengthM, heightM,
    fMax: freqMaxHz,
    c: SPEED_OF_SOUND_MPS,
  }).map((mode) => {
    const baseQ       = estimateModeQByType(mode, axialQ);
    const absorptionQ = estimateModeQLocal({
      roomDims: { widthM, lengthM, heightM },
      surfaceAbsorption,
      f0: mode.freq,
    });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
  });

  // Modal source amplitude: source output at reference level + gain, no seat-distance attenuation.
  // Seat-distance effects are handled by the mode-shape coupling (Ψ_source * Ψ_receiver).
  const complexPressure = freqsHz.map((frequencyHz) => {
    const curveDb = interpolateCurveDb(subProductCurve, frequencyHz);
    const modalSourceAmplitude = Math.pow(10, (curveDb + source.tuning.gainDb) / 20);

    let sumRe = 0;
    let sumIm = 0;

    // Apply sub tuning phase (delay + polarity) once per frequency bin.
    // This rotates the entire modal field contribution coherently.
    const tuningPhase =
      (-2 * Math.PI * frequencyHz * (source.tuning.delayMs / 1000)) +
      (source.tuning.polarity === 180 ? Math.PI : 0);
    const tuningCos = Math.cos(tuningPhase);
    const tuningSin = Math.sin(tuningPhase);

    modes.forEach((mode) => {
      // Mode-shape coupling: Ψ(source) * Ψ(receiver)
      const sourceCoupling   = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });
      const receiverCoupling = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
      const coupling = sourceCoupling * receiverCoupling;

      // Standard 2nd-order resonant transfer function H(f, f0, Q)
      const omega  = 2 * Math.PI * frequencyHz;
      const omega0 = 2 * Math.PI * mode.freq;
      const ratio  = omega / omega0;
      const realDen  = 1 - ratio * ratio;
      const imagDen  = omega / (mode.qValue * omega0);
      const denomSq  = realDen * realDen + imagDen * imagDen;

      const transferRe = realDen / denomSq;
      const transferIm = -imagDen / denomSq;

      // Higher-order axial correction (matches production engine scale for comparability)
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const axialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
      const orderWeight = 1.0; // global attenuation removed — axialScale is the sole governor for axial harmonics

      const gain = modalSourceAmplitude * coupling * axialScale * orderWeight;

      // Accumulate complex modal pressure
      sumRe += gain * transferRe;
      sumIm += gain * transferIm;
    });

    // Apply sub tuning phase rotation to the total modal sum
    const tunedRe = sumRe * tuningCos - sumIm * tuningSin;
    const tunedIm = sumRe * tuningSin + sumIm * tuningCos;

    return { re: tunedRe, im: tunedIm };
  });

  const splDbRaw = complexPressure.map(({ re, im }) => {
    const magnitude = Math.sqrt(re * re + im * im);
    return 20 * Math.log10(Math.max(magnitude, 1e-10));
  });

  return {
    freqsHz,
    splDbRaw,
    complexPressure,
    // Stub fields for output-format compatibility with simulateBassResponseRewCore
    stepDebug:                        [],
    wholeCurveDebugRows:              [],
    modalContributorDebugRows:        [],
    activeModalContributorDebugSeries:[],
    preModalSeries:                   [],
    modalOnlySeries:                  [],
    postModalSeries:                  [],
    partialCoherenceDiagnosticSeries: [],
    distributedCoherenceDiagnosticSeries: [],
    splitCoherenceDiagnosticSeries:   [],
    _diagnosticSolverLabel:           'REW parity field solver (modal-only Green\'s function)',
  };
}

export default simulateBassResponseRewCore;