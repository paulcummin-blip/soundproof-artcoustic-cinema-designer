// qTransferResolutionAuditEngine.jsx
// Pure computation helpers for the Q And Transfer Resolution Audit.
// STRICT DIAGNOSTIC: read-only. Reuses canonical primitives from modalCalculations.js
// (estimateModeQLocal, modeShapeValueLocal, resonantTransfer). No production
// Q/damping/coupling/weighting/SPL changes are made — this only substitutes the
// Q/bandwidth resolution used by an isolated copy of the transfer + field summation
// to see whether Q-driven bandwidth explains the fast 30-50 Hz recovery.

import { estimateModeQLocal, modeShapeValueLocal, resonantTransfer } from '@/bass/core/modalCalculations';

const SPEED_OF_SOUND_MPS = 343;

export const TRACKED_MODES = [
  { nx: 0, ny: 1, nz: 0 },
  { nx: 0, ny: 2, nz: 0 },
  { nx: 0, ny: 3, nz: 0 },
  { nx: 0, ny: 4, nz: 0 },
  { nx: 2, ny: 0, nz: 0 },
  { nx: 2, ny: 2, nz: 0 },
];

export const TARGET_SPL_FREQS = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];

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
    const productionQ = Math.max(1, Math.min(absorptionQ, softCap));
    return { nx, ny, nz, key: keyOf(nx, ny, nz), family: type, modeFrequencyHz: freq, productionQ, modeOrder: Math.abs(nx) + Math.abs(ny) + Math.abs(nz) };
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

// ── Test variants: each returns {qValue, bandwidthHz} per mode for a given resolution strategy ──
export const TEST_VARIANTS = [
  { id: '1', label: 'Current production Q + current transfer', kind: 'production' },
  { id: '2', label: 'Constant Q = 4', kind: 'constantQ', value: 4 },
  { id: '3', label: 'Constant Q = 8', kind: 'constantQ', value: 8 },
  { id: '4', label: 'Constant Q = 12', kind: 'constantQ', value: 12 },
  { id: '5', label: 'Constant Q = 16', kind: 'constantQ', value: 16 },
  { id: '6', label: 'Constant bandwidth = 4 Hz', kind: 'constantBw', value: 4 },
  { id: '7', label: 'Constant bandwidth = 6 Hz', kind: 'constantBw', value: 6 },
  { id: '8', label: 'Constant bandwidth = 8 Hz', kind: 'constantBw', value: 8 },
  { id: '9', label: 'Constant bandwidth = 10 Hz', kind: 'constantBw', value: 10 },
  { id: '10', label: 'Frequency-proportional Q disabled (use bandwidth directly)', kind: 'directBandwidth' },
  { id: '11', label: 'Low-side-only bandwidth clamp (match (0,1,0) below resonance)', kind: 'lowSideClamp' },
  { id: '12', label: 'Higher-mode low-side tail limiter (tailScale below resonance, modes >50Hz)', kind: 'tailLimiter' },
];

// Resolve per-mode {qValue, bandwidthHz} for a given variant, given production modes (each has productionQ, modeFrequencyHz).
function resolveModeParams(modes, variant) {
  const baseBandwidthOf = (m) => m.modeFrequencyHz / m.productionQ;
  const refMode = modes.find((m) => m.key === '0,1,0') || modes[0];
  const refBandwidth = baseBandwidthOf(refMode);

  return modes.map((m) => {
    switch (variant.kind) {
      case 'production':
        return { ...m, qValue: m.productionQ, bandwidthHz: baseBandwidthOf(m) };
      case 'constantQ':
        return { ...m, qValue: variant.value, bandwidthHz: m.modeFrequencyHz / variant.value };
      case 'constantBw':
        return { ...m, qValue: m.modeFrequencyHz / variant.value, bandwidthHz: variant.value };
      case 'directBandwidth':
        // "disable frequency-proportional Q": use production bandwidth value directly (Δf/bandwidth
        // Lorentzian shape) instead of routing through Q-driven resonantTransfer.
        return { ...m, qValue: m.productionQ, bandwidthHz: baseBandwidthOf(m), useDirectBandwidth: true };
      case 'lowSideClamp':
        return { ...m, qValue: m.productionQ, bandwidthHz: baseBandwidthOf(m), lowSideBandwidthOverride: refBandwidth };
      case 'tailLimiter':
        return { ...m, qValue: m.productionQ, bandwidthHz: baseBandwidthOf(m), tailLimiterActive: m.modeFrequencyHz > 50 };
      default:
        return { ...m, qValue: m.productionQ, bandwidthHz: baseBandwidthOf(m) };
    }
  });
}

// Transfer magnitude given a resolved mode + frequency, honoring variant-specific shaping.
function transferMagFor(resolvedMode, freqHz, variant) {
  const { modeFrequencyHz, qValue, bandwidthHz, lowSideBandwidthOverride, tailLimiterActive } = resolvedMode;
  const belowResonance = freqHz < modeFrequencyHz;

  if (variant.kind === 'lowSideClamp' && belowResonance && lowSideBandwidthOverride) {
    const bw = lowSideBandwidthOverride;
    const halfBw = bw / 2;
    const delta = modeFrequencyHz - freqHz;
    return 1 / Math.sqrt(1 + Math.pow(delta / halfBw, 2));
  }

  if (variant.kind === 'directBandwidth') {
    const halfBw = bandwidthHz / 2;
    const delta = freqHz - modeFrequencyHz;
    return 1 / Math.sqrt(1 + Math.pow(delta / halfBw, 2));
  }

  // Default path (production, constantQ, constantBw, tailLimiter-base): use canonical resonantTransfer with resolved Q.
  const tf = resonantTransfer(freqHz, modeFrequencyHz, qValue);
  let mag = tf.transferMag;

  if (variant.kind === 'tailLimiter' && tailLimiterActive && belowResonance) {
    const targetFalloffWidth = 20; // Hz — width over which the tail is faded below resonance, per spec
    const tailScale = Math.min(1, Math.abs(freqHz - modeFrequencyHz) / targetFalloffWidth);
    // tailScale=0 at resonance (no change), tailScale=1 far from resonance (tail suppressed to 15% of unlimited value)
    mag = tf.transferMag * (1 - tailScale) + tf.transferMag * tailScale * 0.15;
  }

  return mag;
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

function fieldAtFreqForVariant(freqHz, resolvedModes, source, seat, roomDims, curve, variant) {
  const curveDb = interpCurveDb(curve, freqHz);
  const direct = directFieldAt(freqHz, curveDb, source, seat);
  let re = direct.re, im = direct.im;
  resolvedModes.forEach((m) => {
    const mag = transferMagFor(m, freqHz, variant);
    const sourceCoupling = modeShapeValueLocal(m, source.x, source.y, source.z, roomDims);
    const receiverCoupling = modeShapeValueLocal(m, seat.x, seat.y, seat.z, roomDims);
    const combinedCoupling = sourceCoupling * receiverCoupling;
    const gainDb = source?.tuning?.gainDb ?? 0;
    const amplitude = Math.pow(10, (curveDb + gainDb) / 20) * mag * combinedCoupling;
    const dx = source.x - seat.x, dy = source.y - seat.y, dz = (source.z ?? 0.35) - (seat.z ?? 1.2);
    const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const propagationPhase = -2 * Math.PI * freqHz * (distanceM / SPEED_OF_SOUND_MPS) * 0.5;
    const delayMs = source?.tuning?.delayMs ?? 0, polarity = source?.tuning?.polarity ?? 0;
    const tuningPhase = (-2 * Math.PI * freqHz * (delayMs / 1000)) + (polarity === 180 ? Math.PI : 0);
    const totalPhase = propagationPhase + tuningPhase;
    re += amplitude * Math.cos(totalPhase);
    im += amplitude * Math.sin(totalPhase);
  });
  return toDb(re, im);
}

function checkPassConditions(deltas) {
  const recoveryReduction = Math.max(Math.abs(deltas[35] ?? 0), Math.abs(deltas[40] ?? 0), Math.abs(deltas[45] ?? 0));
  const preservesLowEnd = Math.abs(deltas[29.5] ?? 0) <= 1.5 && Math.abs(deltas[30] ?? 0) <= 1.5;
  const preservesFiftyHz = Math.abs(deltas[50] ?? 0) <= 2;
  const preservesHighEnd = Math.abs(deltas[57] ?? 0) <= 2 && Math.abs(deltas[58] ?? 0) <= 2;
  const noNewNotch = Math.abs(deltas[50] ?? 0) <= 3;
  return { pass: recoveryReduction >= 2 && preservesLowEnd && preservesFiftyHz && preservesHighEnd && noNewNotch, recoveryReduction, preservesLowEnd, preservesFiftyHz, preservesHighEnd, noNewNotch };
}

// Bandwidth-normalised collapse error using Δf/bandwidth (as specified for this audit).
function collapseErrorForModes(resolvedModes) {
  const sampleOffsets = [-1.5, -1.0, -0.5, 0.5, 1.0, 1.5];
  let totalSpread = 0;
  sampleOffsets.forEach((bwOffset) => {
    const vals = resolvedModes.map((m) => {
      const bw = m.bandwidthHz || (m.modeFrequencyHz / m.qValue);
      const f = m.modeFrequencyHz + bwOffset * bw;
      const halfBw = bw / 2;
      const deltaAtPeak = 0;
      const peakMag = 1 / Math.sqrt(1 + Math.pow(deltaAtPeak / halfBw, 2));
      const delta = f - m.modeFrequencyHz;
      return (1 / Math.sqrt(1 + Math.pow(delta / halfBw, 2))) / peakMag;
    });
    totalSpread += Math.max(...vals) - Math.min(...vals);
  });
  return totalSpread / sampleOffsets.length;
}

function lowSideTailAt(resolvedMode, offsetHz) {
  const f = resolvedMode.modeFrequencyHz - offsetHz;
  if (f <= 0) return null;
  const dummyVariantProd = { kind: 'production' };
  return 20 * Math.log10(Math.max(transferMagFor(resolvedMode, f, dummyVariantProd), 1e-10));
}

function lowSideBandwidthAt(resolvedMode, dropDb) {
  // find frequency below resonance where magnitude drops by dropDb from peak (peak = 1 => 0 dB)
  const targetMag = Math.pow(10, -dropDb / 20);
  let f = resolvedMode.modeFrequencyHz;
  const step = 0.05;
  const dummyVariantProd = { kind: 'production' };
  for (let i = 0; i < 4000; i++) {
    f -= step;
    if (f <= 0) return null;
    const mag = transferMagFor(resolvedMode, f, dummyVariantProd);
    if (mag <= targetMag) return resolvedMode.modeFrequencyHz - f;
  }
  return null;
}

export function runQTransferAudit(roomDims, seat, source, curve, surfaceAbsorption) {
  const modes = buildModes(roomDims, surfaceAbsorption);
  const productionVariant = TEST_VARIANTS[0];
  const productionResolved = resolveModeParams(modes, productionVariant);
  const productionDeltasBase = {};
  TARGET_SPL_FREQS.forEach((tf) => { productionDeltasBase[tf] = fieldAtFreqForVariant(tf, productionResolved, source, seat, roomDims, curve, productionVariant); });

  const collapseErrorBefore = collapseErrorForModes(productionResolved);

  const results = TEST_VARIANTS.map((variant) => {
    const resolved = resolveModeParams(modes, variant);
    const deltas = {};
    TARGET_SPL_FREQS.forEach((tf) => {
      const testDb = fieldAtFreqForVariant(tf, resolved, source, seat, roomDims, curve, variant);
      deltas[tf] = testDb - productionDeltasBase[tf];
    });
    const collapseErrorAfter = collapseErrorForModes(resolved);
    const collapseImprovementPct = collapseErrorBefore > 0 ? ((collapseErrorBefore - collapseErrorAfter) / collapseErrorBefore) * 100 : 0;
    const passInfo = checkPassConditions(deltas);
    const collateralDamage = Math.abs(deltas[29.5] ?? 0) + Math.abs(deltas[30] ?? 0) + Math.abs(deltas[57] ?? 0) + Math.abs(deltas[58] ?? 0);

    const perMode = resolved.map((m) => ({
      key: m.key,
      qValue: m.qValue,
      bandwidthHz: m.bandwidthHz,
      lowSideMinus3: lowSideBandwidthAt(m, 3),
      lowSideMinus6: lowSideBandwidthAt(m, 6),
      tailAtMinus10: lowSideTailAt(m, 10),
      tailAtMinus20: lowSideTailAt(m, 20),
      tailAtMinus30: lowSideTailAt(m, 30),
    }));

    return { id: variant.id, label: variant.label, deltas, collapseErrorBefore, collapseErrorAfter, collapseImprovementPct, collateralDamage, perMode, ...passInfo };
  });

  return { modes, results };
}

export function buildRanking(results) {
  // Exclude test 1 (production baseline, delta=0 by definition) from ranking of candidates.
  const candidates = results.filter((r) => r.id !== '1');
  return [...candidates].sort((a, b) => {
    if (a.recoveryReduction !== b.recoveryReduction) return b.recoveryReduction - a.recoveryReduction;
    if (a.collapseImprovementPct !== b.collapseImprovementPct) return b.collapseImprovementPct - a.collapseImprovementPct;
    if (a.pass !== b.pass) return a.pass ? -1 : 1;
    return a.collateralDamage - b.collateralDamage;
  });
}

export function buildConclusion(ranked) {
  const bestPassing = ranked.find((r) => r.pass);
  if (bestPassing) {
    return {
      hasCandidate: true,
      bestCandidate: bestPassing.label,
      scope: bestPassing.id === '11' || bestPassing.id === '12' ? 'Applies only below resonance, to higher modes' : 'Applies to all tracked modes',
      deltas: bestPassing.deltas,
      collapseImprovementPct: bestPassing.collapseImprovementPct,
      confidence: 'Medium — passes all SPL tolerance conditions at the target frequencies',
    };
  }
  return {
    hasCandidate: false,
    nextTarget: 'production response calibration layer, not modal physics',
  };
}