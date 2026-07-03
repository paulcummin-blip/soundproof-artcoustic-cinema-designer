// frequencyScalingChainAuditEngine.jsx
// Pure computation helpers for the Frequency Scaling Chain Audit.
// STRICT DIAGNOSTIC: read-only. Reuses canonical primitives from modalCalculations.js
// (estimateModeQLocal, modeShapeValueLocal, resonantTransfer) plus the exact production
// soft-Q-cap and diagnostic-scale formulas already present in bass/core/rewBassEngine.js
// (smoothSoftQCap, highOrderAxialScale, family scales, modalGainScalar, modalSourceReferenceMode).
// No production Q/damping/coupling/weighting/SPL changes are made — this only re-derives the
// same per-mode multiplier chain to inspect each stage, and runs isolated disable tests.

import { estimateModeQLocal, modeShapeValueLocal, resonantTransfer } from '@/bass/core/modalCalculations';

const SPEED_OF_SOUND_MPS = 343;
const PROPAGATION_PHASE_SCALE = 0.5;

export const TRACKED_MODES = [
  { nx: 0, ny: 1, nz: 0 },
  { nx: 0, ny: 2, nz: 0 },
  { nx: 0, ny: 3, nz: 0 },
  { nx: 0, ny: 4, nz: 0 },
  { nx: 2, ny: 0, nz: 0 },
  { nx: 2, ny: 2, nz: 0 },
];

export const TARGET_SPL_FREQS = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];

// Exact copy of the production smooth soft-Q-cap from rewBassEngine.js (read-only reuse, not imported
// because it is not exported there — kept numerically identical: A=200, n=0.52, clamp [8,45]).
function smoothSoftQCap(freqHz) {
  const A = 200, n = 0.52;
  const cap = A / Math.pow(Math.max(freqHz, 1), n);
  return Math.max(8, Math.min(45, cap));
}

function keyOf(nx, ny, nz) { return `${nx},${ny},${nz}`; }
function familyOf(nx, ny, nz) {
  const active = [nx > 0, ny > 0, nz > 0].filter(Boolean).length;
  return active === 1 ? 'axial' : active === 2 ? 'tangential' : 'oblique';
}
function modeNativeFreq(nx, ny, nz, roomDims, c = SPEED_OF_SOUND_MPS) {
  const widthM = Number(roomDims?.widthM) || 1, lengthM = Number(roomDims?.lengthM) || 1, heightM = Number(roomDims?.heightM) || 1;
  return (c / 2) * Math.sqrt(Math.pow(nx / widthM, 2) + Math.pow(ny / lengthM, 2) + Math.pow(nz / heightM, 2));
}

export function buildModes(roomDims, surfaceAbsorption) {
  return TRACKED_MODES.map(({ nx, ny, nz }) => {
    const freq = modeNativeFreq(nx, ny, nz, roomDims);
    const type = familyOf(nx, ny, nz);
    const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: freq, mode: { nx, ny, nz } });
    const softCap = smoothSoftQCap(freq);
    const qValue = Math.max(1, Math.min(absorptionQ, softCap));
    return { nx, ny, nz, key: keyOf(nx, ny, nz), family: type, modeFrequencyHz: freq, qValue, modeOrder: Math.abs(nx) + Math.abs(ny) + Math.abs(nz) };
  });
}

function interpCurveDb(curve, hz) {
  if (!Array.isArray(curve) || curve.length === 0) return 90;
  const pts = curve.map((p) => ({ hz: Number(p?.hz ?? p?.frequency ?? p?.[0]), db: Number(p?.db ?? p?.spl ?? p?.[1]) }))
    .filter((p) => Number.isFinite(p.hz) && Number.isFinite(p.db)).sort((a, b) => a.hz - b.hz);
  if (pts.length === 0) return 90;
  if (hz <= pts[0].hz) return pts[0].db;
  if (hz >= pts[pts.length - 1].hz) return pts[pts.length - 1].db;
  for (let i = 0; i < pts.length - 1; i++) {
    if (hz >= pts[i].hz && hz <= pts[i + 1].hz) {
      const r = (hz - pts[i].hz) / (pts[i + 1].hz - pts[i].hz);
      return pts[i].db + (pts[i + 1].db - pts[i].db) * r;
    }
  }
  return pts[0].db;
}

// Default toggle state — matches current production defaults exactly (all optional diagnostic
// layers at their neutral/no-op value). Disable tests flip specific toggles OFF relative to this.
export function defaultToggles() {
  return {
    freqDependentCorrectionEnabled: false, // production default: freqDependentQCap not active (qStrategy !== 'freq_dependent_cap')
    highOrderAxialScale: 1.0,              // production default
    axialFamilyScale: 1.0,
    tangentialFamilyScale: 1.0,
    obliqueFamilyScale: 1.0,
    modalWeightingEnabled: false,          // orderWeight is always 1.0 in production ("global attenuation removed")
    sourceCurveEnabled: true,              // production always applies the real product curve
    roomNormalisationEnabled: false,       // modalSourceReferenceMode default 'existing' = no room-volume normalisation
    distanceAttenuationEnabled: false,     // production's modal path is distance-decoupled (FIX_MODAL_EXCITATION_DECOUPLED)
    couplingEnabled: true,                 // source/receiver mode-shape coupling always applied
    modalGainScalar: 1.0,
  };
}

// Builds the full 16-stage multiplier chain for one mode at one frequency, given a toggle set.
export function computeChainForMode(mode, freqHz, source, seat, roomDims, curveDb, toggles) {
  const stages = [];
  const push = (name, valueBefore, multiplier, valueAfter, freqDependent, note) => {
    const pctChange = (Number.isFinite(valueBefore) && valueBefore !== 0)
      ? ((valueAfter - valueBefore) / Math.abs(valueBefore)) * 100
      : null;
    stages.push({ name, valueBefore, multiplier, valueAfter, pctChange, freqDependent, note });
  };

  // 1–2: raw transfer magnitude & phase (production resonantTransfer — frequency-dependent by definition)
  const tf = resonantTransfer(freqHz, mode.modeFrequencyHz, mode.qValue);
  push('1. Raw transfer magnitude', 0, tf.transferMag, tf.transferMag, true, 'resonantTransfer(f, f0, Q)');
  const transferPhaseDeg = (Math.atan2(tf.im, tf.re) * 180) / Math.PI;
  push('2. Raw transfer phase (deg)', 0, transferPhaseDeg, transferPhaseDeg, true, 'atan2(im, re)');

  // 3: Q (frequency-dependent via soft-cap formula, but constant per-mode once resolved)
  push('3. Q', 0, mode.qValue, mode.qValue, true, 'smoothSoftQCap(f0) clamped by Sabine absorption Q');

  // 4–6: coupling
  const sourceCoupling = toggles.couplingEnabled ? modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims) : 1.0;
  const receiverCoupling = toggles.couplingEnabled ? modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims) : 1.0;
  const combinedCoupling = sourceCoupling * receiverCoupling;
  push('4. Source coupling', 1, sourceCoupling, sourceCoupling, false, 'cos() mode-shape product at source position — frequency-independent');
  push('5. Receiver coupling', 1, receiverCoupling, receiverCoupling, false, 'cos() mode-shape product at seat position — frequency-independent');
  let running = tf.transferMag;
  const afterCoupling = running * combinedCoupling;
  push('6. Combined coupling', running, combinedCoupling, afterCoupling, false, 'source × receiver coupling');
  running = afterCoupling;

  // 7: distance attenuation — production's modal path is decoupled from listener distance (no-op by design)
  const distanceAttenMultiplier = toggles.distanceAttenuationEnabled ? (() => {
    const dx = source.x - seat.x, dy = source.y - seat.y, dz = (source.z ?? 0.35) - (seat.z ?? 1.2);
    const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
    return Math.pow(10, (-20 * Math.log10(distanceM)) / 20);
  })() : 1.0;
  const afterDistance = running * distanceAttenMultiplier;
  push('7. Distance attenuation', running, distanceAttenMultiplier, afterDistance, false, toggles.distanceAttenuationEnabled ? 'synthetic test-only re-application' : 'not applied in production (modal excitation decoupled from listener distance)');
  running = afterDistance;

  // 8 + 13: modal source amplitude / room normalisation (folds in source/radiation curve dB)
  const gainDb = source?.tuning?.gainDb ?? 0;
  const curveDbUsed = toggles.sourceCurveEnabled ? curveDb : 0; // "disabled" = flat 0 dB reference curve
  const modalGainScalar = toggles.modalGainScalar;
  const baseAmplitude = Math.pow(10, (curveDbUsed + gainDb) / 20) * modalGainScalar;
  const roomVolumeM3 = (Number(roomDims?.widthM) || 1) * (Number(roomDims?.lengthM) || 1) * (Number(roomDims?.heightM) || 1);
  const modalSourceAmplitude = toggles.roomNormalisationEnabled ? baseAmplitude / Math.sqrt(Math.max(roomVolumeM3, 1e-6)) : baseAmplitude;
  const afterSource = running * modalSourceAmplitude;
  push('8. Modal source amplitude / room normalisation', running, modalSourceAmplitude, afterSource, false, `curveDb=${curveDbUsed.toFixed(1)}dB, gainDb=${gainDb}, roomNorm=${toggles.roomNormalisationEnabled}`);
  running = afterSource;

  // 9: frequency-dependent correction (optional freqDependentQCap layer — off by production default)
  const freqDepMultiplier = 1.0; // production default path never applies a separate post-Q frequency correction
  push('9. Frequency-dependent correction', running, freqDepMultiplier, running * freqDepMultiplier, toggles.freqDependentCorrectionEnabled, toggles.freqDependentCorrectionEnabled ? 'active (diagnostic test)' : 'inactive in current production (qStrategy=production)');
  running = running * freqDepMultiplier;

  // 10: high-order axial scale (production diagnostic param — default 1.0, applies to axial modes order>=2)
  const isHighOrderAxial = mode.family === 'axial' && mode.modeOrder >= 2;
  const highOrderMultiplier = isHighOrderAxial ? toggles.highOrderAxialScale : 1.0;
  const afterHighOrder = running * highOrderMultiplier;
  push('10. High-order axial scale', running, highOrderMultiplier, afterHighOrder, false, isHighOrderAxial ? `applies (axial, order=${mode.modeOrder})` : 'does not apply to this mode');
  running = afterHighOrder;

  // 11: family scale
  const familyMultiplier = mode.family === 'axial' ? toggles.axialFamilyScale : mode.family === 'tangential' ? toggles.tangentialFamilyScale : toggles.obliqueFamilyScale;
  const afterFamily = running * familyMultiplier;
  push('11. Family scale', running, familyMultiplier, afterFamily, false, `${mode.family} family scale`);
  running = afterFamily;

  // 12: modal weighting term (orderWeight — always 1.0 in production; "global attenuation removed" per code comment)
  const weightingMultiplier = toggles.modalWeightingEnabled ? 1.0 : 1.0; // structurally always 1.0 — production has no active weighting term
  push('12. Modal weighting term', running, weightingMultiplier, running * weightingMultiplier, false, 'orderWeight is hard-coded to 1.0 in production (no active weighting term)');

  // 13: radiation/source curve term — already folded into stage 8 (curveDb). Shown for completeness only.
  push('13. Radiation/source curve term', running, 1.0, running, true, `already applied at stage 8 (curveDb=${curveDbUsed.toFixed(1)}dB) — no separate multiplier`);

  // 14: air-loss term — no air-absorption model exists in production (always a no-op)
  push('14. Air-loss term', running, 1.0, running, true, 'not modelled in production (no-op)');

  // 15: global modal gain
  const afterGlobalGain = running; // modalGainScalar already applied inside stage 8 to mirror production's single application point
  push('15. Global modal gain', running, 1.0, afterGlobalGain, false, `modalGainScalar=${modalGainScalar.toFixed(2)} already applied at stage 8`);
  running = afterGlobalGain;

  // 16: final Re/Im/magnitude/phase — apply propagation + tuning phase rotation (phase-only, does not affect magnitude)
  const dx = source.x - seat.x, dy = source.y - seat.y, dz = (source.z ?? 0.35) - (seat.z ?? 1.2);
  const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const propagationPhase = -2 * Math.PI * freqHz * (distanceM / SPEED_OF_SOUND_MPS) * PROPAGATION_PHASE_SCALE;
  const delayMs = source?.tuning?.delayMs ?? 0, polarity = source?.tuning?.polarity ?? 0;
  const tuningPhase = (-2 * Math.PI * freqHz * (delayMs / 1000)) + (polarity === 180 ? Math.PI : 0);
  const totalPhaseRot = transferPhaseDeg * (Math.PI / 180) + propagationPhase + tuningPhase;
  const finalRe = running * Math.cos(totalPhaseRot);
  const finalIm = running * Math.sin(totalPhaseRot);
  push('16. Final magnitude', running, 1.0, Math.sqrt(finalRe * finalRe + finalIm * finalIm), true, 'magnitude after all stages (phase rotation does not change magnitude)');

  return { stages, finalRe, finalIm, finalMagnitude: running, sourceCoupling, receiverCoupling, combinedCoupling };
}

function directFieldAt(freqHz, curveDb, source, seat) {
  const dx = source.x - seat.x, dy = source.y - seat.y, dz = (source.z ?? 0.35) - (seat.z ?? 1.2);
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM);
  const gainDb = source?.tuning?.gainDb ?? 0;
  const amplitude = Math.pow(10, (curveDb + distanceLossDb + gainDb) / 20);
  const delayMs = source?.tuning?.delayMs ?? 0, polarity = source?.tuning?.polarity ?? 0;
  const totalPhase = (-2 * Math.PI * freqHz * (distanceM / SPEED_OF_SOUND_MPS)) + (-2 * Math.PI * freqHz * (delayMs / 1000)) + (polarity === 180 ? Math.PI : 0);
  return { re: amplitude * Math.cos(totalPhase), im: amplitude * Math.sin(totalPhase) };
}

function toDb(re, im) { return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10)); }

// Full multi-mode field at one frequency, given a toggle set — used for baseline + each disable test.
function fieldAtFreq(freqHz, modes, source, seat, roomDims, curve, toggles) {
  const curveDb = interpCurveDb(curve, freqHz);
  const direct = directFieldAt(freqHz, curveDb, source, seat);
  let re = direct.re, im = direct.im;
  modes.forEach((m) => {
    const chain = computeChainForMode(m, freqHz, source, seat, roomDims, curveDb, toggles);
    re += chain.finalRe; im += chain.finalIm;
  });
  return toDb(re, im);
}

// ── Per-mode, per-frequency full chain table for the sweep range ──
export function buildChainSweep(modes, roomDims, seat, source, curve, freqStart, freqEnd, step) {
  const toggles = defaultToggles();
  const rows = [];
  for (let f = freqStart; f <= freqEnd + 1e-9; f += step) {
    const curveDb = interpCurveDb(curve, f);
    const perMode = {};
    modes.forEach((m) => { perMode[m.key] = computeChainForMode(m, f, source, seat, roomDims, curveDb, toggles); });
    rows.push({ frequencyHz: f, perMode });
  }
  return rows;
}

// ── Disable tests A–J ──
export const DISABLE_TESTS = [
  { id: 'A', label: 'Disable frequency-dependent correction only', apply: (t) => ({ ...t, freqDependentCorrectionEnabled: false }) },
  { id: 'B', label: 'Disable high-order axial scale only', apply: (t) => ({ ...t, highOrderAxialScale: 1.0 }) },
  { id: 'C', label: 'Disable family scale only', apply: (t) => ({ ...t, axialFamilyScale: 1.0, tangentialFamilyScale: 1.0, obliqueFamilyScale: 1.0 }) },
  { id: 'D', label: 'Disable modal weighting only', apply: (t) => ({ ...t, modalWeightingEnabled: false }) },
  { id: 'E', label: 'Disable source/radiation curve only', apply: (t) => ({ ...t, sourceCurveEnabled: false }) },
  { id: 'F', label: 'Disable room normalisation only', apply: (t) => ({ ...t, roomNormalisationEnabled: false }) },
  { id: 'G', label: 'Disable distance attenuation only', apply: (t) => ({ ...t, distanceAttenuationEnabled: false }) },
  { id: 'H', label: 'Disable coupling only', apply: (t) => ({ ...t, couplingEnabled: false }) },
  { id: 'I', label: 'Disable all non-transfer multipliers', apply: (t) => ({ ...t, couplingEnabled: false, sourceCurveEnabled: false, roomNormalisationEnabled: false, distanceAttenuationEnabled: false, freqDependentCorrectionEnabled: false, highOrderAxialScale: 1.0, axialFamilyScale: 1.0, tangentialFamilyScale: 1.0, obliqueFamilyScale: 1.0 }) },
  { id: 'J', label: 'Transfer only (Q + resonantTransfer alone)', apply: (t) => ({ ...t, couplingEnabled: false, sourceCurveEnabled: false, roomNormalisationEnabled: false, distanceAttenuationEnabled: false, freqDependentCorrectionEnabled: false, highOrderAxialScale: 1.0, axialFamilyScale: 1.0, tangentialFamilyScale: 1.0, obliqueFamilyScale: 1.0, modalGainScalar: 1.0 }) },
];

function checkPassConditions(deltas) {
  const recoveryReduction = Math.max(Math.abs(deltas[35] ?? 0), Math.abs(deltas[40] ?? 0), Math.abs(deltas[45] ?? 0));
  const preservesLowEnd = Math.abs(deltas[29.5] ?? 0) <= 1.5 && Math.abs(deltas[30] ?? 0) <= 1.5;
  const preservesFiftyHz = Math.abs(deltas[50] ?? 0) <= 2;
  const preservesHighEnd = Math.abs(deltas[57] ?? 0) <= 2 && Math.abs(deltas[58] ?? 0) <= 2;
  const noNewNotch = Math.abs(deltas[50] ?? 0) <= 3;
  return {
    pass: recoveryReduction >= 2 && preservesLowEnd && preservesFiftyHz && preservesHighEnd && noNewNotch,
    recoveryReduction, preservesLowEnd, preservesFiftyHz, preservesHighEnd, noNewNotch,
  };
}

// Bandwidth-normalised collapse error: spread of normalised transfer magnitude across tracked modes,
// sampled at fixed Δf/(f0/Q) offsets. Only Q/transfer determine this — none of tests A–J alter Q or
// resonantTransfer, so collapse error is expected to be identical before/after every disable test.
function collapseErrorForModes(modes) {
  const sampleOffsets = [-1.5, -1.0, -0.5, 0.5, 1.0, 1.5];
  let totalSpread = 0;
  sampleOffsets.forEach((bwOffset) => {
    const vals = modes.map((m) => {
      const bwHz = m.modeFrequencyHz / Math.max(m.qValue, 1e-6);
      const f = m.modeFrequencyHz + bwOffset * bwHz;
      const peakMag = resonantTransfer(m.modeFrequencyHz, m.modeFrequencyHz, m.qValue).transferMag;
      return resonantTransfer(f, m.modeFrequencyHz, m.qValue).transferMag / Math.max(peakMag, 1e-10);
    });
    totalSpread += Math.max(...vals) - Math.min(...vals);
  });
  return totalSpread / sampleOffsets.length;
}

export function runDisableTests(modes, roomDims, seat, source, curve) {
  const baselineToggles = defaultToggles();
  const collapseErrorBefore = collapseErrorForModes(modes);

  const results = DISABLE_TESTS.map(({ id, label, apply }) => {
    const toggles = apply(baselineToggles);
    const deltas = {};
    TARGET_SPL_FREQS.forEach((tf) => {
      const baselineDb = fieldAtFreq(tf, modes, source, seat, roomDims, curve, baselineToggles);
      const testDb = fieldAtFreq(tf, modes, source, seat, roomDims, curve, toggles);
      deltas[tf] = testDb - baselineDb;
    });
    const collapseErrorAfter = collapseErrorForModes(modes); // unaffected by A–J (none alter Q/transfer)
    const collapseImprovementPct = collapseErrorBefore > 0 ? ((collapseErrorBefore - collapseErrorAfter) / collapseErrorBefore) * 100 : 0;
    const passInfo = checkPassConditions(deltas);
    const collateralDamage = Math.abs(deltas[29.5] ?? 0) + Math.abs(deltas[30] ?? 0) + Math.abs(deltas[57] ?? 0) + Math.abs(deltas[58] ?? 0);
    return { id, label, deltas, collapseErrorBefore, collapseErrorAfter, collapseImprovementPct, collateralDamage, ...passInfo };
  });

  return results;
}

// ── Automatic ranking + final conclusion ──
export function buildRanking(disableResults) {
  // Rank by: (1) contribution to low-side skirt excess ≈ |35/40/45 delta|, (2) collapse improvement,
  // (3) pass-condition score, (4) smallest collateral damage.
  return [...disableResults].sort((a, b) => {
    if (a.recoveryReduction !== b.recoveryReduction) return b.recoveryReduction - a.recoveryReduction;
    if (a.collapseImprovementPct !== b.collapseImprovementPct) return b.collapseImprovementPct - a.collapseImprovementPct;
    if (a.pass !== b.pass) return a.pass ? -1 : 1;
    return a.collateralDamage - b.collateralDamage;
  });
}

export function buildConclusion(rankedResults) {
  const bestPassing = rankedResults.find((r) => r.pass);
  if (bestPassing) {
    return {
      hasCulprit: true,
      culprit: bestPassing.label,
      evidence: `Disabling this multiplier reduces 35–45 Hz recovery by ${bestPassing.recoveryReduction.toFixed(2)} dB while keeping 29.5/30 Hz, 50 Hz and 57/58 Hz within tolerance.`,
      deltas: bestPassing.deltas,
      collapseImprovementPct: bestPassing.collapseImprovementPct,
      confidence: bestPassing.collapseImprovementPct > 0 ? 'Medium — passes SPL conditions and improves collapse fit' : 'Medium — passes SPL conditions; collapse error unchanged (expected, as this multiplier does not alter Q/transfer shape)',
    };
  }
  const closest = rankedResults[0];
  return {
    hasCulprit: false,
    remainingLikelyCause: closest
      ? `No single disable test met all pass conditions. Closest candidate was "${closest.label}" (35–45 Hz reduction ${closest.recoveryReduction.toFixed(2)} dB) but failed on ${!closest.preservesLowEnd ? 'low-end tolerance' : !closest.preservesFiftyHz ? '50 Hz tolerance' : !closest.preservesHighEnd ? 'high-end tolerance' : 'notch guard'}.`
      : 'No disable test produced a measurable change.',
    nextAuditTarget: 'Since none of the amplitude-domain multipliers (coupling, source amplitude, family/high-order scales, room normalisation) explain the gap, and none of them alter Q or the transfer function shape, the next audit target should be the Q/transfer stage itself (mode Q resolution or the resonant transfer formula) — see Isolated Modal Transfer Root Cause Audit and Modal Transfer Skirt Shape Audit.',
  };
}