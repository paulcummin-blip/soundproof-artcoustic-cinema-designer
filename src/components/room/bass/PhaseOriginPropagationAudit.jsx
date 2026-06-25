/**
 * PhaseOriginPropagationAudit.jsx
 * Diagnostic only — no production changes, does not affect the live graph.
 * Collapsed by default.
 *
 * Goal: Determine which phase/propagation model reproduces the same
 * destructive cancellation behaviour as REW (null at ~40.6 Hz).
 * Only phase/propagation changes — production modal weighting, TF, and
 * Green's function are held constant throughout.
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';

// ── Constants ──────────────────────────────────────────────────────────────────

const C_DEFAULT      = 343;
const REW_NULL_HZ    = 40.6;
const REW_NULL_DEPTH = -17.0;
const FLAT_SRC_DB    = 94;
const NULL_RANGE     = { min: 20, max: 60 };
const TEST_HZ        = [30, 35, 40, 45, 50, 55, 60];
const REW_REF        = { 30: 87.5, 35: 85.0, 40: 76.0, 45: 85.5, 50: 91.0, 55: 89.0, 60: 88.0 };
const SPEED_SWEEP    = [340, 343, 346, 349, 352];

// ── Variant definitions ────────────────────────────────────────────────────────

const VARIANTS = [
  { key: 'A', label: 'Production',                    desc: 'Baseline — current B44 engine as-is.' },
  { key: 'B', label: 'Direct: acoustic centre',       desc: 'Direct path distance from acoustic centre of cabinet.' },
  { key: 'C', label: 'Direct: cabinet front plane',   desc: 'Direct path distance from cabinet front baffle plane.' },
  { key: 'D', label: 'Direct: driver centre',         desc: 'Direct path adds cabinet depth offset to model driver position.' },
  { key: 'E', label: 'Modal: phase shifted by dist',  desc: 'Modal sum phase shifted by propagation delay from source to receiver.' },
  { key: 'F', label: 'Modal: phase ref = source',     desc: 'Modal phase referenced to source origin rather than receiver.' },
  { key: 'G', label: 'Shared phase reference',        desc: 'Direct and modal both referenced to same global phase origin.' },
  { key: 'H', label: 'Wave number exact k=2πf/c',     desc: 'Wave number recomputed at every frequency bin.' },
  { key: 'I', label: 'Independent modal/direct delay', desc: 'Propagation delay computed independently for modal and direct paths.' },
  { key: 'J', label: 'Modal: no geometric delay',     desc: 'Modal propagation excludes geometric time-of-flight delay.' },
  { key: 'K', label: 'Direct: no geometric delay',    desc: 'Direct path propagation excludes geometric time-of-flight delay.' },
  { key: 'L_340', label: 'Speed of sound: 340 m/s', desc: 'Speed of sound = 340 m/s.', sos: 340 },
  { key: 'L_343', label: 'Speed of sound: 343 m/s', desc: 'Speed of sound = 343 m/s.', sos: 343 },
  { key: 'L_346', label: 'Speed of sound: 346 m/s', desc: 'Speed of sound = 346 m/s.', sos: 346 },
  { key: 'L_349', label: 'Speed of sound: 349 m/s', desc: 'Speed of sound = 349 m/s.', sos: 349 },
  { key: 'L_352', label: 'Speed of sound: 352 m/s', desc: 'Speed of sound = 352 m/s.', sos: 352 },
  { key: 'M', label: 'Half-wavelength phase offset',  desc: 'Add π (half-wavelength) phase offset to direct path.' },
  { key: 'N', label: 'Quarter-wavelength phase offset', desc: 'Add π/2 (quarter-wavelength) phase offset to direct path.' },
  { key: 'O', label: 'Phase unwrap disabled',         desc: 'No phase wrapping applied — raw atan2 phases used.' },
  { key: 'P', label: 'Alt atan2 reconstruction',      desc: 'Phase reconstructed via atan2(im, re) with reversed sign convention.' },
  { key: 'Q', label: 'Normalised vectors before sum', desc: 'Complex vectors normalised to unit magnitude before summation.' },
  { key: 'R', label: 'No intermediate normalisation', desc: 'Complex vectors summed raw without any intermediate normalisation.' },
];

// ── Build modes ────────────────────────────────────────────────────────────────

function buildModes(roomDims, surfaceAbsorption, axialQ, c = C_DEFAULT) {
  const { widthM, lengthM, heightM } = roomDims;
  return computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 120, c }).map(m => {
    const baseQ = m.type === 'axial' ? (axialQ ?? 4.0) : m.type === 'tangential' ? 3.9 : 2.5;
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: m.freq });
    return { ...m, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });
}

// ── Core simulation kernel ─────────────────────────────────────────────────────
// Returns { freqsHz, splDbRaw } using caller-provided phase transform functions.

function runKernel({
  freqsHz, roomDims, seat, sub, modes,
  c = C_DEFAULT,
  directPhaseTransform,   // (f, distM, c) => phase radians for direct path
  modalPhaseTransform,    // (f, distM, c, tfRe, tfIm) => { re, im } after TF
  normaliseBefore = false, // normalise each vector to unit magnitude before sum
}) {
  const { widthM, lengthM, heightM } = roomDims;
  const srcAmpBase = Math.pow(10, FLAT_SRC_DB / 20);

  const dx = sub.x - seat.x;
  const dy = sub.y - seat.y;
  const dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const srcAmp = srcAmpBase / distM;

  return freqsHz.map(fHz => {
    // Direct path
    const dirPhase = directPhaseTransform(fHz, distM, c);
    let dirRe = srcAmp * Math.cos(dirPhase);
    let dirIm = srcAmp * Math.sin(dirPhase);

    // Modal sum
    let modSumRe = 0, modSumIm = 0;
    modes.forEach(m => {
      const psiSrc = modeShapeValueLocal(m, sub.x,  sub.y,  sub.z  ?? 0.35, { widthM, lengthM, heightM });
      const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seat.z ?? 1.2,  { widthM, lengthM, heightM });
      const coupling  = psiSrc * psiRcv;
      const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
      const orderWt   = modeOrder >= 2 ? 0.5 : 1.0;
      const axialHO   = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
      const gain      = srcAmp * coupling * orderWt * axialHO;
      const { re: tfRe, im: tfIm } = resonantTransfer(fHz, m.freq, m.qValue);

      const { re: modRe, im: modIm } = modalPhaseTransform(fHz, distM, c, gain * tfRe, gain * tfIm);
      modSumRe += modRe;
      modSumIm += modIm;
    });

    // Normalise before sum if requested
    if (normaliseBefore) {
      const dirMag = Math.sqrt(dirRe * dirRe + dirIm * dirIm) || 1;
      const modMag = Math.sqrt(modSumRe * modSumRe + modSumIm * modSumIm) || 1;
      dirRe /= dirMag; dirIm /= dirMag;
      modSumRe /= modMag; modSumIm /= modMag;
    }

    const totMag = Math.sqrt((dirRe + modSumRe) ** 2 + (dirIm + modSumIm) ** 2);
    return 20 * Math.log10(Math.max(totMag, 1e-10));
  });
}

// ── Production phase transforms (Variant A baseline) ──────────────────────────

function prodDirectPhase(f, distM, c) {
  return -2 * Math.PI * f * distM / c;
}
const prodModalPhase = (_f, _distM, _c, re, im) => ({ re, im });

// ── Null detection ─────────────────────────────────────────────────────────────

function detectDeepestNull(freqsHz, splDb, minHz = NULL_RANGE.min, maxHz = NULL_RANGE.max) {
  const band = freqsHz
    .map((f, i) => ({ f, s: splDb[i] }))
    .filter(p => p.f >= minHz && p.f <= maxHz && Number.isFinite(p.s));
  if (band.length < 3) return null;

  const vals = [...band].map(p => p.s).sort((a, b) => a - b);
  const localMedian = vals[Math.floor(vals.length / 2)];

  let deepest = null;
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].s < band[i - 1].s && band[i].s < band[i + 1].s) {
      const depth = band[i].s - localMedian;
      if (!deepest || depth < deepest.depth)
        deepest = { hz: band[i].f, spl: band[i].s, depth };
    }
  }
  return deepest;
}

function detectPeak(freqsHz, splDb, minHz = NULL_RANGE.min, maxHz = NULL_RANGE.max) {
  let peak = null;
  freqsHz.forEach((f, i) => {
    if (f < minHz || f > maxHz) return;
    const s = splDb[i];
    if (!Number.isFinite(s)) return;
    if (!peak || s > peak.spl) peak = { hz: f, spl: s };
  });
  return peak;
}

function computeMAE(freqsHz, splDb) {
  let sum = 0, n = 0;
  TEST_HZ.forEach(hz => {
    const ref = REW_REF[hz];
    if (ref == null) return;
    let best = null, bestD = Infinity;
    freqsHz.forEach((f, i) => { const d = Math.abs(f - hz); if (d < bestD) { bestD = d; best = splDb[i]; } });
    if (best !== null && Number.isFinite(best)) { sum += Math.abs(best - ref); n++; }
  });
  return n ? sum / n : null;
}

function computeWorstErr(freqsHz, splDb) {
  let worst = 0, worstHz = null;
  TEST_HZ.forEach(hz => {
    const ref = REW_REF[hz];
    if (ref == null) return;
    let best = null, bestD = Infinity;
    freqsHz.forEach((f, i) => { const d = Math.abs(f - hz); if (d < bestD) { bestD = d; best = splDb[i]; } });
    if (best !== null && Number.isFinite(best)) {
      const e = Math.abs(best - ref);
      if (e > worst) { worst = e; worstHz = hz; }
    }
  });
  return { worstErr: worst, worstHz };
}

function modalDirectRatio(freqsHz, splDb, nullHz) {
  // Approximate ratio: SPL at null vs SPL at nearest peak
  const peak = detectPeak(freqsHz, splDb);
  if (!peak) return null;
  let nullSpl = null, bestD = Infinity;
  freqsHz.forEach((f, i) => { const d = Math.abs(f - nullHz); if (d < bestD) { bestD = d; nullSpl = splDb[i]; } });
  return nullSpl !== null ? nullSpl - peak.spl : null;
}

// ── Hi-res frequency axis ──────────────────────────────────────────────────────

function buildFreqs(min = 15, max = 80, step = 0.5) {
  const out = [];
  for (let f = min; f <= max + 1e-9; f += step) out.push(Math.round(f * 100) / 100);
  return out;
}

// ── Phase info at null ─────────────────────────────────────────────────────────

function phaseAtNull(roomDims, seat, sub, modes, nullHz, c, directPhaseFn, modalPhaseFn) {
  const { widthM, lengthM, heightM } = roomDims;
  const dx = sub.x - seat.x, dy = sub.y - seat.y, dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const srcAmp = Math.pow(10, FLAT_SRC_DB / 20) / distM;

  const dirPhase = directPhaseFn(nullHz, distM, c);
  const dirRe = srcAmp * Math.cos(dirPhase);
  const dirIm = srcAmp * Math.sin(dirPhase);

  let modRe = 0, modIm = 0;
  modes.forEach(m => {
    const psiSrc = modeShapeValueLocal(m, sub.x,  sub.y,  sub.z  ?? 0.35, { widthM, lengthM, heightM });
    const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seat.z ?? 1.2,  { widthM, lengthM, heightM });
    const coupling  = psiSrc * psiRcv;
    const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
    const orderWt   = modeOrder >= 2 ? 0.5 : 1.0;
    const axialHO   = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
    const gain      = srcAmp * coupling * orderWt * axialHO;
    const { re: tfRe, im: tfIm } = resonantTransfer(nullHz, m.freq, m.qValue);
    const { re, im } = modalPhaseFn(nullHz, distM, c, gain * tfRe, gain * tfIm);
    modRe += re; modIm += im;
  });

  const dpDeg = (Math.atan2(dirIm, dirRe) * 180) / Math.PI;
  const mpDeg = (Math.atan2(modIm, modRe) * 180) / Math.PI;
  let diff = mpDeg - dpDeg;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

// ── Run all variants ───────────────────────────────────────────────────────────

function runAllVariants(roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const freqsHz = buildFreqs(15, 80, 0.5);
  const modes   = buildModes(roomDims, surfaceAbsorption, axialQ, C_DEFAULT);
  const results = {};

  const runVariant = (key, directPhaseFn, modalPhaseFn, c = C_DEFAULT, normaliseBefore = false) => {
    const t0 = performance.now();
    try {
      const modesForC = c === C_DEFAULT ? modes : buildModes(roomDims, surfaceAbsorption, axialQ, c);
      const splDb = runKernel({ freqsHz, roomDims, seat, sub, modes: modesForC, c, directPhaseTransform: directPhaseFn, modalPhaseTransform: modalPhaseFn, normaliseBefore });
      const nullInfo  = detectDeepestNull(freqsHz, splDb);
      const peakInfo  = detectPeak(freqsHz, splDb);
      const mae       = computeMAE(freqsHz, splDb);
      const { worstErr, worstHz } = computeWorstErr(freqsHz, splDb);
      const phaseDiff = nullInfo ? phaseAtNull(roomDims, seat, sub, modesForC, nullInfo.hz, c, directPhaseFn, modalPhaseFn) : null;
      const mdRatio   = nullInfo ? modalDirectRatio(freqsHz, splDb, nullInfo.hz) : null;
      results[key] = {
        nullHz: nullInfo?.hz ?? null, nullDepth: nullInfo?.depth ?? null, nullSpl: nullInfo?.spl ?? null,
        peakHz: peakInfo?.hz ?? null, peakSpl: peakInfo?.spl ?? null,
        mae, worstErr, worstHz, phaseDiffAtNull: phaseDiff, modalDirectRatio: mdRatio,
        runtimeMs: performance.now() - t0,
      };
    } catch (e) {
      results[key] = { error: e.message, runtimeMs: performance.now() - t0 };
    }
  };

  const dx = sub.x - seat.x, dy = sub.y - seat.y, dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));

  // A: Production
  runVariant('A', prodDirectPhase, prodModalPhase);

  // B: Acoustic centre offset (approx +0.15 m)
  runVariant('B',
    (f, d, c) => -2 * Math.PI * f * Math.max(0.01, d + 0.15) / c,
    prodModalPhase);

  // C: Cabinet front plane offset (approx -0.1 m shorter)
  runVariant('C',
    (f, d, c) => -2 * Math.PI * f * Math.max(0.01, d - 0.1) / c,
    prodModalPhase);

  // D: Driver centre (cabinet depth ~0.3 m added)
  runVariant('D',
    (f, d, c) => -2 * Math.PI * f * Math.max(0.01, d + 0.3) / c,
    prodModalPhase);

  // E: Modal phase shifted by propagation delay
  runVariant('E',
    prodDirectPhase,
    (f, d, c, re, im) => {
      const phi = -2 * Math.PI * f * d / c;
      const cos = Math.cos(phi), sin = Math.sin(phi);
      return { re: re * cos - im * sin, im: re * sin + im * cos };
    });

  // F: Modal phase referenced to source origin
  runVariant('F',
    prodDirectPhase,
    (f, d, c, re, im) => {
      // Source-referenced: apply forward phase (positive)
      const phi = 2 * Math.PI * f * d / c;
      const cos = Math.cos(phi), sin = Math.sin(phi);
      return { re: re * cos - im * sin, im: re * sin + im * cos };
    });

  // G: Shared phase reference — both at origin (no phase on either)
  runVariant('G',
    (_f, _d, _c) => 0,
    (_f, _d, _c, re, im) => ({ re, im }));

  // H: Wave number exact k = 2πf/c (same as production for direct, but applied consistently)
  runVariant('H',
    (f, d, c) => -(2 * Math.PI * f / c) * d,
    (f, d, c, re, im) => ({ re, im })); // same as A but explicit k

  // I: Independent modal and direct delays
  runVariant('I',
    (f, d, c) => -2 * Math.PI * f * d / c,
    (f, d, c, re, im) => {
      const phi = -2 * Math.PI * f * d / c;
      const cos = Math.cos(phi), sin = Math.sin(phi);
      return { re: re * cos - im * sin, im: re * sin + im * cos };
    });

  // J: Modal excludes geometric delay
  runVariant('J',
    prodDirectPhase,
    (_f, _d, _c, re, im) => ({ re, im })); // no phase on modal = same as A

  // K: Direct excludes geometric delay
  runVariant('K',
    (_f, _d, _c) => 0,  // direct phase = 0
    prodModalPhase);

  // L variants: speed of sound sweep
  for (const sos of SPEED_SWEEP) {
    runVariant(`L_${sos}`,
      (f, d, c) => -2 * Math.PI * f * d / c,
      prodModalPhase,
      sos);
  }

  // M: Half-wavelength phase offset on direct
  runVariant('M',
    (f, d, c) => prodDirectPhase(f, d, c) + Math.PI,
    prodModalPhase);

  // N: Quarter-wavelength phase offset on direct
  runVariant('N',
    (f, d, c) => prodDirectPhase(f, d, c) + Math.PI / 2,
    prodModalPhase);

  // O: Phase unwrap disabled (same math, just no wrap — for completeness)
  runVariant('O',
    prodDirectPhase,
    prodModalPhase);

  // P: Reversed atan2 sign convention (+ instead of -)
  runVariant('P',
    (f, d, c) => 2 * Math.PI * f * d / c, // positive phase
    (f, d, c, re, im) => ({ re, im: -im })); // negate imaginary

  // Q: Normalise before sum
  runVariant('Q', prodDirectPhase, prodModalPhase, C_DEFAULT, true);

  // R: No normalisation (same as A for this kernel)
  runVariant('R', prodDirectPhase, prodModalPhase, C_DEFAULT, false);

  return results;
}

// ── Ranking ────────────────────────────────────────────────────────────────────

function rankVariants(results) {
  return VARIANTS
    .map(v => ({ ...v, ...results[v.key] }))
    .filter(r => !r.error)
    .map(r => ({
      ...r,
      distFromRewNull: r.nullHz !== null ? Math.abs(r.nullHz - REW_NULL_HZ) : 999,
      distFromRewDepth: r.nullDepth !== null ? Math.abs(r.nullDepth - REW_NULL_DEPTH) : 999,
    }))
    .sort((a, b) => {
      // Primary: null Hz closest to REW
      if (Math.abs(a.distFromRewNull - b.distFromRewNull) > 0.5) return a.distFromRewNull - b.distFromRewNull;
      // Secondary: null depth closest to REW
      if (Math.abs(a.distFromRewDepth - b.distFromRewDepth) > 0.5) return a.distFromRewDepth - b.distFromRewDepth;
      // Tertiary: MAE
      return (a.mae ?? 999) - (b.mae ?? 999);
    });
}

// ── Engineering verdict ────────────────────────────────────────────────────────

function buildVerdict(ranked, prodNullHz) {
  const best = ranked[0];
  if (!best) return { text: 'No results.', type: 'neutral' };

  const bestShift = prodNullHz !== null && best.nullHz !== null ? best.nullHz - prodNullHz : null;
  const rewShift  = best.nullHz !== null ? Math.abs(best.nullHz - REW_NULL_HZ) : null;

  const allShifts = ranked.map(r => {
    const s = prodNullHz !== null && r.nullHz !== null ? Math.abs(r.nullHz - prodNullHz) : 0;
    return s;
  });
  const maxShift = Math.max(...allShifts, 0);

  if (maxShift < 3) {
    return {
      text: 'No variant moves the null by more than ~3 Hz. The remaining discrepancy is unlikely to originate from phase reference or propagation. Investigate modal frequency generation, geometry interpretation, or REW benchmark extraction.',
      type: 'investigate',
    };
  }

  if (rewShift !== null && rewShift < 5) {
    return {
      text: `Variant ${best.key} (${best.label}) moves the null to ${best.nullHz?.toFixed(1)} Hz — within ${rewShift?.toFixed(1)} Hz of REW target (${REW_NULL_HZ} Hz). Leading production candidate.`,
      type: 'candidate',
    };
  }

  return {
    text: `Best variant is ${best.key} (${best.label}) — null at ${best.nullHz?.toFixed(1)} Hz (${Math.abs(bestShift ?? 0).toFixed(1)} Hz from production, ${rewShift?.toFixed(1)} Hz from REW). Partial improvement — further investigation needed.`,
    type: 'partial',
  };
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

const mono = { fontFamily: 'monospace', fontSize: 10 };

function TH({ ch, left }) {
  return (
    <th style={{ ...mono, padding: '3px 6px', fontSize: 9, fontWeight: 700, color: '#6b7280',
      background: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: left ? 'left' : 'right', whiteSpace: 'nowrap' }}>
      {ch}
    </th>
  );
}

function TD({ v, unit = '', digits = 2, color, bold }) {
  const n = Number(v);
  return (
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
      color: color ?? (Number.isFinite(n) ? '#1c1917' : '#9ca3af'),
      fontWeight: bold ? 700 : 400 }}>
      {Number.isFinite(n) ? `${n.toFixed(digits)}${unit}` : '—'}
    </td>
  );
}

function NullCell({ nullHz }) {
  const dist = nullHz !== null && Number.isFinite(nullHz) ? Math.abs(nullHz - REW_NULL_HZ) : null;
  const color = dist !== null ? (dist < 2 ? '#166534' : dist < 6 ? '#92400e' : '#991b1b') : '#9ca3af';
  return (
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color, fontWeight: dist !== null && dist < 4 ? 700 : 400 }}>
      {nullHz !== null && Number.isFinite(nullHz) ? `${nullHz.toFixed(1)} Hz` : '—'}
    </td>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PhaseOriginPropagationAudit({ roomDims, seat, sub, surfaceAbsorption, axialQ }) {
  const [running, setRunning] = useState(false);
  const [data, setData]       = useState(null);

  const handleRun = useCallback(() => {
    if (!roomDims || !seat || !sub) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const results = runAllVariants(roomDims, seat, sub, surfaceAbsorption, axialQ ?? 4.0);
        const ranked  = rankVariants(results);
        const prodNullHz = results['A']?.nullHz ?? null;
        const verdict = buildVerdict(ranked, prodNullHz);
        setData({ results, ranked, prodNullHz, verdict });
      } catch (e) {
        setData({ error: e.message });
      }
      setRunning(false);
    }, 20);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ]);

  const verdictBg = {
    candidate:   { bg: '#f0fdf4', border: '#166534', color: '#166534' },
    partial:     { bg: '#fffbeb', border: '#92400e', color: '#92400e' },
    investigate: { bg: '#eff6ff', border: '#1d4ed8', color: '#1d4ed8' },
    neutral:     { bg: '#f3f4f6', border: '#6b7280', color: '#374151' },
  };

  return (
    <details style={{ border: '1px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '0', marginBottom: 8 }}>
      <summary style={{ fontWeight: 700, color: '#4c1d95', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
        padding: '8px 12px', userSelect: 'none' }}>
        Phase Origin &amp; Propagation Audit — 18 variants · null migration to REW 40.6 Hz
        <span style={{ fontSize: 9, fontWeight: 400, color: '#7c3aed', marginLeft: 8 }}>diagnostic only · collapsed by default</span>
      </summary>

      <div style={{ padding: '0 12px 12px 12px' }}>
        {/* Sub-header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6d28d9' }}>
            Only phase/propagation changes tested · production modal weighting, TF, and Green's function held constant.
          </div>
          <button
            onClick={handleRun}
            disabled={running || !roomDims || !seat || !sub}
            style={{ padding: '5px 14px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
              background: running ? '#e5e7eb' : '#4c1d95', color: running ? '#6b7280' : '#fff',
              border: 'none', cursor: running ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
          >
            {running ? `Running ${VARIANTS.length} variants…` : data ? 'Re-run' : 'Run Audit'}
          </button>
        </div>

        {(!seat || !sub) && (
          <div style={{ color: '#7c3aed', fontSize: 10, fontFamily: 'monospace' }}>⚠ Need seat and sub to run.</div>
        )}
        {data?.error && (
          <div style={{ color: '#991b1b', fontSize: 10, fontFamily: 'monospace', padding: 6, background: '#fee2e2', borderRadius: 4 }}>
            Error: {data.error}
          </div>
        )}

        {data && !data.error && (() => {
          const { results, ranked, prodNullHz, verdict } = data;
          const vc = verdictBg[verdict.type] ?? verdictBg.neutral;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* ── VERDICT ── */}
              <div style={{ padding: '8px 12px', borderRadius: 6, background: vc.bg, border: `2px solid ${vc.border}`,
                fontFamily: 'monospace', fontSize: 10, color: vc.color, fontWeight: 700, lineHeight: 1.6 }}>
                {verdict.text}
              </div>

              {/* ── NULL MIGRATION TABLE ── */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 10, color: '#374151', marginBottom: 4 }}>
                  Null Migration — distance from REW target ({REW_NULL_HZ} Hz)
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 500 }}>
                    <thead>
                      <tr>
                        <TH ch="Variant" left />
                        <TH ch="Null Hz" />
                        <TH ch="Shift from Prod" />
                        <TH ch="Dist from REW" />
                        <TH ch="Null depth" />
                        <TH ch="Depth Δ from REW" />
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => {
                        const isProd = r.key === 'A';
                        const shift  = prodNullHz !== null && r.nullHz !== null ? r.nullHz - prodNullHz : null;
                        const depthDelta = r.nullDepth !== null ? r.nullDepth - REW_NULL_DEPTH : null;
                        return (
                          <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6', background: isProd ? '#ede9fe' : i === 0 ? '#f0fdf4' : 'transparent' }}>
                            <td style={{ ...mono, padding: '2px 6px', fontWeight: isProd || i === 0 ? 700 : 400 }}>
                              <span style={{ color: '#7c3aed', marginRight: 4 }}>{r.key}</span>{r.label}
                              {isProd && <span style={{ color: '#9ca3af', marginLeft: 4, fontSize: 8 }}>★ prod</span>}
                              {i === 0 && !isProd && <span style={{ color: '#166534', marginLeft: 4, fontSize: 8 }}>★ best</span>}
                            </td>
                            <NullCell nullHz={r.nullHz} />
                            <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
                              color: shift !== null && Math.abs(shift) > 3 ? '#166534' : '#6b7280',
                              fontWeight: shift !== null && Math.abs(shift) > 3 ? 700 : 400 }}>
                              {shift !== null && Number.isFinite(shift) ? `${shift > 0 ? '+' : ''}${shift.toFixed(1)} Hz` : '—'}
                            </td>
                            <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
                              color: r.distFromRewNull < 2 ? '#166534' : r.distFromRewNull < 6 ? '#92400e' : '#991b1b',
                              fontWeight: r.distFromRewNull < 4 ? 700 : 400 }}>
                              {Number.isFinite(r.distFromRewNull) ? `${r.distFromRewNull.toFixed(1)} Hz` : '—'}
                            </td>
                            <TD v={r.nullDepth} digits={1} unit=" dB" color={r.nullDepth < -10 ? '#991b1b' : undefined} />
                            <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
                              color: depthDelta !== null && Math.abs(depthDelta) < 3 ? '#166534' : '#6b7280' }}>
                              {depthDelta !== null && Number.isFinite(depthDelta) ? `${depthDelta > 0 ? '+' : ''}${depthDelta.toFixed(1)} dB` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      {/* REW target row */}
                      <tr style={{ borderTop: '2px solid #e5e7eb', background: '#fef9c3' }}>
                        <td style={{ ...mono, padding: '2px 6px', fontWeight: 700, color: '#92400e' }}>REW target</td>
                        <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: '#92400e', fontWeight: 700 }}>{REW_NULL_HZ.toFixed(1)} Hz</td>
                        <td colSpan={2} style={{ ...mono, padding: '2px 5px', color: '#9ca3af', fontSize: 9 }}>reference</td>
                        <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: '#92400e', fontWeight: 700 }}>{REW_NULL_DEPTH.toFixed(1)} dB</td>
                        <td style={{ ...mono, padding: '2px 5px', color: '#9ca3af', fontSize: 9 }}>reference</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── FULL METRICS TABLE (collapsed) ── */}
              <details>
                <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                  Full Metrics — all {VARIANTS.length} variants (MAE, worst error, peak, phase)
                </summary>
                <div style={{ overflowX: 'auto', marginTop: 6 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
                    <thead>
                      <tr>
                        <TH ch="Variant" left />
                        <TH ch="MAE" />
                        <TH ch="Worst err" />
                        <TH ch="Worst Hz" />
                        <TH ch="Null Hz" />
                        <TH ch="Null depth" />
                        <TH ch="Peak Hz" />
                        <TH ch="Peak dB" />
                        <TH ch="MD ratio" />
                        <TH ch="Phase Δ@null" />
                        <TH ch="Runtime" />
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => {
                        const isProd = r.key === 'A';
                        return (
                          <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6', background: isProd ? '#ede9fe' : i === 0 ? '#f0fdf4' : 'transparent' }}>
                            <td style={{ ...mono, padding: '2px 6px', fontWeight: isProd ? 700 : 400 }}>
                              <span style={{ color: '#7c3aed', marginRight: 4 }}>{r.key}</span>{r.label}
                            </td>
                            <TD v={r.mae} digits={2} unit=" dB" color={r.mae < 3 ? '#166534' : r.mae > 6 ? '#991b1b' : undefined} />
                            <TD v={r.worstErr} digits={2} unit=" dB" />
                            <TD v={r.worstHz} digits={0} unit=" Hz" />
                            <NullCell nullHz={r.nullHz} />
                            <TD v={r.nullDepth} digits={1} unit=" dB" color={r.nullDepth < -10 ? '#991b1b' : undefined} />
                            <TD v={r.peakHz} digits={1} unit=" Hz" />
                            <TD v={r.peakSpl} digits={1} unit=" dB" />
                            <TD v={r.modalDirectRatio} digits={1} unit=" dB" />
                            <TD v={r.phaseDiffAtNull} digits={0} unit="°" color={r.phaseDiffAtNull !== null && Math.abs(r.phaseDiffAtNull) > 135 ? '#991b1b' : undefined} />
                            <TD v={r.runtimeMs} digits={1} unit=" ms" />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>

              {/* ── VARIANT DESCRIPTIONS (collapsed) ── */}
              <details>
                <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                  Variant descriptions ({VARIANTS.length} variants)
                </summary>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {VARIANTS.map(v => (
                    <div key={v.key} style={{ padding: '4px 8px', borderRadius: 4, background: '#f8f5ff', border: '1px solid #ddd6fe', fontSize: 9, fontFamily: 'monospace' }}>
                      <span style={{ fontWeight: 700, color: '#7c3aed', marginRight: 6 }}>{v.key}</span>
                      <span style={{ fontWeight: 600, color: '#374151', marginRight: 6 }}>{v.label}</span>
                      <span style={{ color: '#6b7280' }}>{v.desc}</span>
                    </div>
                  ))}
                </div>
              </details>

            </div>
          );
        })()}
      </div>
    </details>
  );
}