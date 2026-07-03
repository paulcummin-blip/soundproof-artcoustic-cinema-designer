// modalTransferSkirtAuditEngine.jsx
// Pure computation helpers for the Modal Transfer Skirt Shape Audit.
// STRICT DIAGNOSTIC: read-only. Uses the canonical resonantTransfer() and
// estimateModeQLocal() from modalCalculations.js (the same functions the production
// engine uses) — no Q/damping/coupling/weighting/SPL changes, no production data touched.
// This only evaluates the transfer function shape for a fixed set of target modes.

import { resonantTransfer, estimateModeQLocal } from '@/bass/core/modalCalculations';

export const TARGET_MODES = [
  { nx: 0, ny: 1, nz: 0 },
  { nx: 0, ny: 2, nz: 0 },
  { nx: 0, ny: 3, nz: 0 },
  { nx: 0, ny: 4, nz: 0 },
  { nx: 2, ny: 0, nz: 0 },
  { nx: 2, ny: 2, nz: 0 },
];

const SKIRT_OFFSETS_HZ = [-5, -10, -15, -20, -25, -30];

function familyOf(nx, ny, nz) {
  const active = [nx > 0, ny > 0, nz > 0].filter(Boolean).length;
  return active === 1 ? 'axial' : active === 2 ? 'tangential' : 'oblique';
}

function modeNativeFreq(nx, ny, nz, roomDims, c = 343) {
  const widthM = Number(roomDims?.widthM) || 1;
  const lengthM = Number(roomDims?.lengthM) || 1;
  const heightM = Number(roomDims?.heightM) || 1;
  return (c / 2) * Math.sqrt(
    Math.pow(nx / widthM, 2) +
    Math.pow(ny / lengthM, 2) +
    Math.pow(nz / heightM, 2)
  );
}

// Build the target mode set with native frequency + Q resolved against the current room/absorption.
export function buildTargetModes(roomDims, surfaceAbsorption, axialQ = 4.0) {
  return TARGET_MODES.map(({ nx, ny, nz }) => {
    const freq = modeNativeFreq(nx, ny, nz, roomDims);
    const type = familyOf(nx, ny, nz);
    const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: freq, mode: { nx, ny, nz } });
    // Mirrors production's soft-cap intent for axial modes without importing the full soft-cap
    // curve — read-only diagnostic uses axialQ as the baseline ceiling for axial family only.
    const baseQ = type === 'axial' ? axialQ : type === 'tangential' ? 3.9 : 2.5;
    const qValue = Math.max(1, Math.min(baseQ, absorptionQ));
    return { nx, ny, nz, key: `${nx},${ny},${nz}`, family: type, modeFrequencyHz: freq, qValue };
  });
}

// Sweep normalised transfer magnitude across a frequency range for every target mode.
export function runSkirtSweep(freqStart, freqEnd, step, roomDims, surfaceAbsorption, axialQ = 4.0) {
  const modes = buildTargetModes(roomDims, surfaceAbsorption, axialQ);

  // Normalisation reference: transfer magnitude exactly at each mode's own resonance (peak).
  const peakByKey = new Map(
    modes.map((m) => [m.key, resonantTransfer(m.modeFrequencyHz, m.modeFrequencyHz, m.qValue).transferMag])
  );

  const rows = [];
  for (let f = freqStart; f <= freqEnd + 1e-9; f += step) {
    const point = { frequencyHz: f, modes: {} };
    modes.forEach((m) => {
      const tf = resonantTransfer(f, m.modeFrequencyHz, m.qValue);
      const peak = peakByKey.get(m.key) || 1e-10;
      point.modes[m.key] = {
        transferMagnitude: tf.transferMag,
        normalisedMagnitude: tf.transferMag / peak,
        deltaFreqHz: f - m.modeFrequencyHz,
        fractionalOffset: (f - m.modeFrequencyHz) / m.modeFrequencyHz,
      };
    });
    rows.push(point);
  }
  return { modes, rows, peakByKey };
}

function normalisedMagAt(modes, peakByKey, mode, targetFreq) {
  const tf = resonantTransfer(targetFreq, mode.modeFrequencyHz, mode.qValue);
  const peak = peakByKey.get(mode.key) || 1e-10;
  return tf.transferMag / peak;
}

// Low-side skirt levels at fixed Hz offsets below each mode's own resonance.
export function buildSkirtLevels(modes, peakByKey) {
  return modes.map((m) => {
    const levels = {};
    SKIRT_OFFSETS_HZ.forEach((offsetHz) => {
      const targetFreq = m.modeFrequencyHz + offsetHz;
      levels[offsetHz] = targetFreq > 0 ? normalisedMagAt(modes, peakByKey, m, targetFreq) : null;
    });
    return { key: m.key, family: m.family, modeFrequencyHz: m.modeFrequencyHz, qValue: m.qValue, levels };
  });
}

// Effective -3dB bandwidth on the low side and high side of resonance (Hz until magnitude drops
// to 1/sqrt(2) of peak), found by fine stepping outward from resonance.
export function buildBandwidthAsymmetry(modes, peakByKey) {
  const HALF_POWER = 1 / Math.SQRT2;
  return modes.map((m) => {
    let lowBw = null;
    for (let df = 0.1; df <= 100; df += 0.1) {
      const f = m.modeFrequencyHz - df;
      if (f <= 0) break;
      const mag = normalisedMagAt(modes, peakByKey, m, f);
      if (mag <= HALF_POWER) { lowBw = df; break; }
    }
    let highBw = null;
    for (let df = 0.1; df <= 100; df += 0.1) {
      const f = m.modeFrequencyHz + df;
      const mag = normalisedMagAt(modes, peakByKey, m, f);
      if (mag <= HALF_POWER) { highBw = df; break; }
    }
    const asymmetryRatio = (lowBw && highBw) ? lowBw / highBw : null;
    return { key: m.key, family: m.family, modeFrequencyHz: m.modeFrequencyHz, lowBandwidthHz: lowBw, highBandwidthHz: highBw, asymmetryRatio };
  });
}

// Automatic diagnosis per spec: compares (0,2,0) low-side skirt vs (0,1,0), flags fat skirts on
// higher-order axial modes, and flags if all modes collapse to the same curve (shape not the issue).
export function buildDiagnosis(modes, skirtLevels, bandwidthRows) {
  const m010 = skirtLevels.find((r) => r.key === '0,1,0');
  const m020 = skirtLevels.find((r) => r.key === '0,2,0');

  const flags = [];

  let m020ExplainsRecovery = false;
  let magnitudeExcess = null;
  if (m010 && m020) {
    const offsets = [-10, -20, -30];
    const excesses = offsets.map((o) => (m020.levels[o] ?? 0) - (m010.levels[o] ?? 0));
    magnitudeExcess = Math.max(...excesses);
    if (magnitudeExcess > 0.05) {
      m020ExplainsRecovery = true;
      flags.push(`(0,2,0) low-side skirt is ${(magnitudeExcess * 100).toFixed(1)}% stronger (normalised) than (0,1,0) at matching offsets.`);
    }
  }

  let worstOffendingMode = null;
  let worstOffset = null;
  let worstExcessValue = -Infinity;
  bandwidthRows.forEach((row) => {
    if (row.family !== 'axial' || !row.asymmetryRatio) return;
    if (row.asymmetryRatio > 1.3 && row.asymmetryRatio > worstExcessValue) {
      worstExcessValue = row.asymmetryRatio;
      worstOffendingMode = row.key;
      worstOffset = row.lowBandwidthHz;
    }
  });
  if (worstOffendingMode) {
    flags.push(`Mode (${worstOffendingMode}) has a fat low-side skirt: asymmetry ratio ${worstExcessValue.toFixed(2)} (low/high bandwidth).`);
  }

  // Collapse check: do all modes' normalised curves sit within a tight band at fixed Δf offsets?
  const sampleOffsets = [-5, -15, -25];
  let maxSpread = 0;
  sampleOffsets.forEach((offsetHz) => {
    const vals = skirtLevels.map((r) => r.levels[offsetHz]).filter((v) => v !== null && v !== undefined);
    if (vals.length < 2) return;
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread > maxSpread) maxSpread = spread;
  });
  const allCollapseToSameCurve = maxSpread < 0.03;
  if (allCollapseToSameCurve) {
    flags.push('All target modes collapse to the same normalised skirt curve — transfer shape itself is not the differentiator.');
  }

  const confidence = allCollapseToSameCurve
    ? 'Low — shape is not mode-dependent, look elsewhere (Q source, coupling, or storage)'
    : (m020ExplainsRecovery || worstOffendingMode)
      ? 'Medium — skirt shape shows a measurable asymmetry worth further isolation testing'
      : 'Low — no material skirt asymmetry found among target modes';

  return {
    m020ExplainsRecovery,
    worstOffendingMode: worstOffendingMode || (m020ExplainsRecovery ? '(0,2,0)' : null),
    worstOffset: worstOffset ?? (m020ExplainsRecovery ? -10 : null),
    magnitudeExcess,
    confidence,
    allCollapseToSameCurve,
    flags,
    nextAuditTarget: allCollapseToSameCurve
      ? 'Modal Q source / coupling audit (transfer shape ruled out)'
      : worstOffendingMode
        ? `Isolated bandwidth audit for ${worstOffendingMode}`
        : 'Modal storage / phase-accumulation audit',
  };
}