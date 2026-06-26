/**
 * ComplexVectorCoherenceAudit.jsx
 * Diagnostic only — no production changes, does not affect the live graph.
 * Collapsed by default.
 *
 * Goal: Starting from Variant Q (normalised vectors, null at ~41.5 Hz),
 * determine which real-world physical mechanism limits cancellation depth
 * to ~17 dB while preserving the correct null frequency.
 *
 * Baseline: normalised direct + normalised modal sum (Variant Q).
 * Only the coherence / partial-cancellation mechanism is varied.
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';

// ── Constants ──────────────────────────────────────────────────────────────────

const C         = 343;
const REW_NULL_HZ    = 40.6;
const REW_NULL_DEPTH = -17.0;
const FLAT_SRC_DB    = 94;
const NULL_RANGE     = { min: 20, max: 60 };
const TEST_HZ        = [30, 35, 40, 45, 50, 55, 60];
const REW_REF        = { 30: 87.5, 35: 85.0, 40: 76.0, 45: 85.5, 50: 91.0, 55: 89.0, 60: 88.0 };

// ── Physics classification ────────────────────────────────────────────────────

const PHYSICS = {
  'Likely physical':       { color: '#166534', bg: '#f0fdf4', border: '#86efac' },
  'Plausible':             { color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  'Artificial correction': { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  'Mathematically unstable': { color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
  'Do not recommend':      { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
};

// ── Variant definitions ────────────────────────────────────────────────────────
// Each variant defines: key, family, label, desc, physicsClass, coherenceFn
// coherenceFn(f, distM, modalEnergy, modalParticipation, modalMag, qValue, bw) => scalar [0..1]

const VARIANT_DEFS = [
  // Family A — Constant coherence
  { key: 'A_1.00', family: 'A', label: 'Coherence 1.00', desc: 'Full coherence — baseline Variant Q.',         physicsClass: 'Likely physical',       c: 1.00 },
  { key: 'A_0.95', family: 'A', label: 'Coherence 0.95', desc: '5% partial decoherence.',                     physicsClass: 'Plausible',             c: 0.95 },
  { key: 'A_0.90', family: 'A', label: 'Coherence 0.90', desc: '10% partial decoherence.',                    physicsClass: 'Plausible',             c: 0.90 },
  { key: 'A_0.85', family: 'A', label: 'Coherence 0.85', desc: '15% partial decoherence.',                    physicsClass: 'Plausible',             c: 0.85 },
  { key: 'A_0.80', family: 'A', label: 'Coherence 0.80', desc: '20% partial decoherence.',                    physicsClass: 'Plausible',             c: 0.80 },
  { key: 'A_0.75', family: 'A', label: 'Coherence 0.75', desc: '25% partial decoherence.',                    physicsClass: 'Plausible',             c: 0.75 },
  { key: 'A_0.70', family: 'A', label: 'Coherence 0.70', desc: '30% partial decoherence.',                    physicsClass: 'Plausible',             c: 0.70 },
  { key: 'A_0.65', family: 'A', label: 'Coherence 0.65', desc: '35% partial decoherence.',                    physicsClass: 'Artificial correction', c: 0.65 },
  { key: 'A_0.60', family: 'A', label: 'Coherence 0.60', desc: '40% partial decoherence.',                    physicsClass: 'Artificial correction', c: 0.60 },

  // Family B — Frequency-dependent coherence
  { key: 'B_lin60',  family: 'B', label: 'Linear 1.0→0.60',  desc: '20 Hz=1.00 → 200 Hz=0.60, linear decay.', physicsClass: 'Likely physical' },
  { key: 'B_lin75',  family: 'B', label: 'Linear 0.95→0.75', desc: '20 Hz=0.95 → 200 Hz=0.75, linear decay.', physicsClass: 'Likely physical' },
  { key: 'B_exp',    family: 'B', label: 'Exponential decay', desc: 'Coherence = exp(-f/80), mimics absorption.', physicsClass: 'Likely physical' },
  { key: 'B_log',    family: 'B', label: 'Logarithmic decay', desc: 'Coherence = 1 - 0.4·log10(f/20).',         physicsClass: 'Plausible' },

  // Family C — Modal-energy weighting
  { key: 'C_energy', family: 'C', label: 'Modal energy',           desc: 'Coherence ∝ modal energy (mag²).',         physicsClass: 'Plausible' },
  { key: 'C_partic', family: 'C', label: 'Modal participation',    desc: 'Coherence ∝ modal participation (mag).',   physicsClass: 'Plausible' },
  { key: 'C_press',  family: 'C', label: 'Modal pressure mag',     desc: 'Coherence ∝ normalised pressure magnitude.', physicsClass: 'Plausible' },
  { key: 'C_norm',   family: 'C', label: 'Normalised contribution', desc: 'Coherence = modal/direct ratio clamped 0–1.', physicsClass: 'Artificial correction' },

  // Family D — Distance weighting
  { key: 'D_srcSeat', family: 'D', label: 'Source-seat distance',      desc: 'Coherence decreases with source-seat distance.', physicsClass: 'Likely physical' },
  { key: 'D_modal',   family: 'D', label: 'Modal path length',          desc: 'Coherence ∝ 1/(1+modalPathEstimate).',           physicsClass: 'Plausible' },
  { key: 'D_avg',     family: 'D', label: 'Average propagation dist',   desc: 'Coherence ∝ 1/(1+avgPropagation).',              physicsClass: 'Plausible' },

  // Family E — Q weighting
  { key: 'E_invQ',  family: 'E', label: '1/Q',            desc: 'Coherence ∝ 1/Q — low-Q modes decohere most.',  physicsClass: 'Likely physical' },
  { key: 'E_sqrtQ', family: 'E', label: 'sqrt(Q)',         desc: 'Coherence ∝ sqrt(Q)/max(sqrt(Q)).',              physicsClass: 'Plausible' },
  { key: 'E_bw',    family: 'E', label: 'Modal bandwidth', desc: 'Coherence ∝ bandwidth = f/Q.',                   physicsClass: 'Plausible' },
  { key: 'E_pw',    family: 'E', label: 'Peak width',      desc: 'Coherence ∝ half-power bandwidth.',              physicsClass: 'Plausible' },

  // Family F — Mixed models
  { key: 'F_fxQ',  family: 'F', label: 'Freq × Q',          desc: 'Coherence ∝ f·Q product.',          physicsClass: 'Artificial correction' },
  { key: 'F_fxd',  family: 'F', label: 'Freq × distance',   desc: 'Coherence ∝ f·(1/dist) product.',   physicsClass: 'Artificial correction' },
  { key: 'F_exQ',  family: 'F', label: 'Energy × Q',        desc: 'Coherence ∝ energy·Q product.',     physicsClass: 'Plausible' },
  { key: 'F_exd',  family: 'F', label: 'Energy × distance', desc: 'Coherence ∝ energy·(1/dist).',      physicsClass: 'Plausible' },
  { key: 'F_fxe',  family: 'F', label: 'Freq × modal energy', desc: 'Coherence ∝ f·modalEnergy.',     physicsClass: 'Artificial correction' },
];

// ── Build modes ────────────────────────────────────────────────────────────────

function buildModes(roomDims, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  return computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 120, c: C }).map(m => {
    const baseQ = m.type === 'axial' ? (axialQ ?? 4.0) : m.type === 'tangential' ? 3.9 : 2.5;
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: m.freq });
    return { ...m, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });
}

// ── Coherence functions ───────────────────────────────────────────────────────
// coherenceFn(ctx) => scalar [0..1]
// ctx: { f, distM, modalMag, dirMag, qValue, bw, normalisedScore }

function makeCoherenceFn(def, maxModalMag, maxQ) {
  const clamp = v => Math.max(0, Math.min(1, v));

  if (def.family === 'A') return () => def.c;

  if (def.key === 'B_lin60')
    return ({ f }) => clamp(1.00 + (0.60 - 1.00) * (f - 20) / (200 - 20));
  if (def.key === 'B_lin75')
    return ({ f }) => clamp(0.95 + (0.75 - 0.95) * (f - 20) / (200 - 20));
  if (def.key === 'B_exp')
    return ({ f }) => clamp(Math.exp(-f / 80));
  if (def.key === 'B_log')
    return ({ f }) => clamp(1 - 0.4 * Math.log10(Math.max(f, 20) / 20));

  if (def.key === 'C_energy')
    return ({ modalMag }) => clamp(modalMag * modalMag / Math.max(maxModalMag * maxModalMag, 1e-10));
  if (def.key === 'C_partic')
    return ({ modalMag }) => clamp(modalMag / Math.max(maxModalMag, 1e-10));
  if (def.key === 'C_press')
    return ({ modalMag, dirMag }) => clamp(modalMag / Math.max(modalMag + dirMag, 1e-10));
  if (def.key === 'C_norm')
    return ({ modalMag, dirMag }) => clamp(dirMag / Math.max(modalMag, 1e-10));

  if (def.key === 'D_srcSeat')
    return ({ distM }) => clamp(1 / (1 + distM * 0.3));
  if (def.key === 'D_modal')
    return ({ distM }) => clamp(1 / (1 + distM * 0.5));
  if (def.key === 'D_avg')
    return ({ distM }) => clamp(1 / (1 + distM * 0.4));

  if (def.key === 'E_invQ')
    return ({ qValue }) => clamp(1 / Math.max(qValue, 1));
  if (def.key === 'E_sqrtQ')
    return ({ qValue }) => clamp(Math.sqrt(qValue) / Math.max(Math.sqrt(maxQ), 1e-10));
  if (def.key === 'E_bw')
    return ({ f, qValue }) => clamp((f / Math.max(qValue, 1)) / 40);
  if (def.key === 'E_pw')
    return ({ f, qValue }) => clamp((f / Math.max(qValue * Math.sqrt(2), 1)) / 30);

  if (def.key === 'F_fxQ')
    return ({ f, qValue }) => clamp(f * qValue / (200 * maxQ));
  if (def.key === 'F_fxd')
    return ({ f, distM }) => clamp(f / (200 * Math.max(distM, 0.01)));
  if (def.key === 'F_exQ')
    return ({ modalMag, qValue }) => clamp(modalMag * qValue / Math.max(maxModalMag * maxQ, 1e-10));
  if (def.key === 'F_exd')
    return ({ modalMag, distM }) => clamp(modalMag / (Math.max(maxModalMag, 1e-10) * Math.max(distM, 0.01)));
  if (def.key === 'F_fxe')
    return ({ f, modalMag }) => clamp(f * modalMag / Math.max(200 * maxModalMag, 1e-10));

  return () => 1;
}

// ── Frequency axis ─────────────────────────────────────────────────────────────

function buildFreqs(min = 15, max = 80, step = 0.5) {
  const out = [];
  for (let f = min; f <= max + 1e-9; f += step) out.push(Math.round(f * 100) / 100);
  return out;
}

// ── Core kernel (normalised-vector baseline = Variant Q) ──────────────────────

function runCoherenceKernel(freqsHz, roomDims, seat, sub, modes, coherenceFn) {
  const { widthM, lengthM, heightM } = roomDims;
  const srcAmpBase = Math.pow(10, FLAT_SRC_DB / 20);
  const dx = sub.x - seat.x, dy = sub.y - seat.y, dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const srcAmp = srcAmpBase / distM;

  return freqsHz.map(fHz => {
    // Direct (normalised to unit magnitude — Variant Q baseline)
    const dirPhase = -2 * Math.PI * fHz * distM / C;
    const rawDirRe = srcAmp * Math.cos(dirPhase);
    const rawDirIm = srcAmp * Math.sin(dirPhase);
    const dirMag   = Math.sqrt(rawDirRe ** 2 + rawDirIm ** 2) || 1;
    const dirRe    = rawDirRe / dirMag;
    const dirIm    = rawDirIm / dirMag;

    // Modal sum (normalised — Variant Q baseline)
    let modRawRe = 0, modRawIm = 0;
    modes.forEach(m => {
      const psiSrc = modeShapeValueLocal(m, sub.x,  sub.y,  sub.z  ?? 0.35, { widthM, lengthM, heightM });
      const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seat.z ?? 1.2,  { widthM, lengthM, heightM });
      const coupling  = psiSrc * psiRcv;
      const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
      const orderWt   = modeOrder >= 2 ? 0.5 : 1.0;
      const axialHO   = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
      const gain      = srcAmp * coupling * orderWt * axialHO;
      const { re: tfRe, im: tfIm } = resonantTransfer(fHz, m.freq, m.qValue);
      modRawRe += gain * tfRe;
      modRawIm += gain * tfIm;
    });
    const modalMag  = Math.sqrt(modRawRe ** 2 + modRawIm ** 2) || 1;
    const modNormRe = modRawRe / modalMag;
    const modNormIm = modRawIm / modalMag;

    // Coherence factor
    const avgQ = modes.length ? modes.reduce((s, m) => s + m.qValue, 0) / modes.length : 4;
    const avgBw = modes.length ? modes.reduce((s, m) => s + m.freq / m.qValue, 0) / modes.length : 10;
    const coherence = coherenceFn({ f: fHz, distM, modalMag: modalMag / srcAmp, dirMag: 1, qValue: avgQ, bw: avgBw });

    // Combine: direct + coherence·modal (both normalised, so magnitudes are 1 each)
    const totRe = dirRe + coherence * modNormRe;
    const totIm = dirIm + coherence * modNormIm;
    const totMag = Math.sqrt(totRe ** 2 + totIm ** 2);
    return 20 * Math.log10(Math.max(totMag, 1e-10));
  });
}

// ── Metrics helpers ───────────────────────────────────────────────────────────

function detectDeepestNull(freqsHz, splDb) {
  const band = freqsHz.map((f, i) => ({ f, s: splDb[i] }))
    .filter(p => p.f >= NULL_RANGE.min && p.f <= NULL_RANGE.max && Number.isFinite(p.s));
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

function detectPeak(freqsHz, splDb) {
  let peak = null;
  freqsHz.forEach((f, i) => {
    if (f < NULL_RANGE.min || f > NULL_RANGE.max) return;
    if (!Number.isFinite(splDb[i])) return;
    if (!peak || splDb[i] > peak.spl) peak = { hz: f, spl: splDb[i] };
  });
  return peak;
}

function computeMAE(freqsHz, splDb) {
  let sum = 0, n = 0;
  TEST_HZ.forEach(hz => {
    const ref = REW_REF[hz]; if (ref == null) return;
    let best = null, bestD = Infinity;
    freqsHz.forEach((f, i) => { const d = Math.abs(f - hz); if (d < bestD) { bestD = d; best = splDb[i]; } });
    if (best !== null && Number.isFinite(best)) { sum += Math.abs(best - ref); n++; }
  });
  return n ? sum / n : null;
}

function computeWorstErr(freqsHz, splDb) {
  let worst = 0, worstHz = null;
  TEST_HZ.forEach(hz => {
    const ref = REW_REF[hz]; if (ref == null) return;
    let best = null, bestD = Infinity;
    freqsHz.forEach((f, i) => { const d = Math.abs(f - hz); if (d < bestD) { bestD = d; best = splDb[i]; } });
    if (best !== null && Number.isFinite(best)) {
      const e = Math.abs(best - ref);
      if (e > worst) { worst = e; worstHz = hz; }
    }
  });
  return { worstErr: worst, worstHz };
}

function phaseAtNull(freqsHz, splDb, nullHz, roomDims, seat, sub, modes, coherenceFn) {
  if (!nullHz) return null;
  const { widthM, lengthM, heightM } = roomDims;
  const dx = sub.x - seat.x, dy = sub.y - seat.y, dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const srcAmp = Math.pow(10, FLAT_SRC_DB / 20) / distM;

  const dirPhase = -2 * Math.PI * nullHz * distM / C;
  const dirRe = Math.cos(dirPhase), dirIm = Math.sin(dirPhase);

  let modRe = 0, modIm = 0;
  modes.forEach(m => {
    const psiSrc = modeShapeValueLocal(m, sub.x,  sub.y,  sub.z  ?? 0.35, { widthM, lengthM, heightM });
    const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seat.z ?? 1.2,  { widthM, lengthM, heightM });
    const gain = srcAmp * psiSrc * psiRcv * (Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz) >= 2 ? 0.25 : 1.0);
    const { re: tfRe, im: tfIm } = resonantTransfer(nullHz, m.freq, m.qValue);
    modRe += gain * tfRe; modIm += gain * tfIm;
  });
  const modMag = Math.sqrt(modRe ** 2 + modIm ** 2) || 1;
  const mRe = modRe / modMag, mIm = modIm / modMag;

  const dp = (Math.atan2(dirIm, dirRe) * 180) / Math.PI;
  const mp = (Math.atan2(mIm,   mRe)   * 180) / Math.PI;
  let diff = mp - dp;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

function mdRatio(freqsHz, splDb, nullHz) {
  const peak = detectPeak(freqsHz, splDb);
  if (!peak || !nullHz) return null;
  let nullSpl = null, bestD = Infinity;
  freqsHz.forEach((f, i) => { const d = Math.abs(f - nullHz); if (d < bestD) { bestD = d; nullSpl = splDb[i]; } });
  return nullSpl !== null ? nullSpl - peak.spl : null;
}

// ── Scoring ────────────────────────────────────────────────────────────────────

function overallScore(distHz, depthDeltaAbs, mae) {
  // Lower is better
  return (distHz * 2) + depthDeltaAbs + (mae ?? 20);
}

// ── Run all variants ───────────────────────────────────────────────────────────

function runAll(roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const freqsHz = buildFreqs(15, 80, 0.5);
  const modes   = buildModes(roomDims, surfaceAbsorption, axialQ);

  // Pre-compute normalisation helpers
  const srcAmpBase = Math.pow(10, FLAT_SRC_DB / 20);
  const dx = sub.x - seat.x, dy = sub.y - seat.y, dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const srcAmp = srcAmpBase / distM;

  // maxModalMag and maxQ across modes for normalisation
  let maxModalMag = 0, maxQ = 0;
  const { widthM, lengthM, heightM } = roomDims;
  modes.forEach(m => {
    const psiSrc = modeShapeValueLocal(m, sub.x,  sub.y,  sub.z  ?? 0.35, { widthM, lengthM, heightM });
    const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seat.z ?? 1.2,  { widthM, lengthM, heightM });
    const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
    const gain = srcAmp * psiSrc * psiRcv * (modeOrder >= 2 ? 0.25 : 1.0);
    const { re: tfRe, im: tfIm } = resonantTransfer(40, m.freq, m.qValue);
    const mag = Math.abs(gain) * Math.sqrt(tfRe ** 2 + tfIm ** 2) / srcAmp;
    if (mag > maxModalMag) maxModalMag = mag;
    if (m.qValue > maxQ) maxQ = m.qValue;
  });
  if (maxModalMag < 1e-10) maxModalMag = 1;
  if (maxQ < 1) maxQ = 1;

  const results = VARIANT_DEFS.map(def => {
    const t0 = performance.now();
    try {
      const cohFn  = makeCoherenceFn(def, maxModalMag, maxQ);
      const splDb  = runCoherenceKernel(freqsHz, roomDims, seat, sub, modes, cohFn);
      const nullInfo  = detectDeepestNull(freqsHz, splDb);
      const peakInfo  = detectPeak(freqsHz, splDb);
      const mae       = computeMAE(freqsHz, splDb);
      const { worstErr, worstHz } = computeWorstErr(freqsHz, splDb);
      const phaseDiff = phaseAtNull(freqsHz, splDb, nullInfo?.hz ?? null, roomDims, seat, sub, modes, cohFn);
      const mdr       = mdRatio(freqsHz, splDb, nullInfo?.hz ?? null);
      const distHz    = nullInfo ? Math.abs(nullInfo.hz - REW_NULL_HZ) : 999;
      const depthDelta = nullInfo ? Math.abs(nullInfo.depth - REW_NULL_DEPTH) : 999;
      const score      = overallScore(distHz, depthDelta, mae);
      return {
        ...def,
        nullHz: nullInfo?.hz ?? null, nullDepth: nullInfo?.depth ?? null, nullSpl: nullInfo?.spl ?? null,
        peakHz: peakInfo?.hz ?? null, peakSpl: peakInfo?.spl ?? null,
        mae, worstErr, worstHz, phaseDiffAtNull: phaseDiff, modalDirectRatio: mdr,
        distFromRewNull: distHz, depthDelta, score,
        runtimeMs: performance.now() - t0,
      };
    } catch (e) {
      return { ...def, error: e.message, runtimeMs: performance.now() - t0 };
    }
  });

  return results;
}

// ── Ranking ────────────────────────────────────────────────────────────────────

function rankResults(results) {
  return [...results].filter(r => !r.error).sort((a, b) => {
    const da = a.distFromRewNull ?? 999, db = b.distFromRewNull ?? 999;
    if (Math.abs(da - db) > 0.5) return da - db;
    const dda = a.depthDelta ?? 999, ddb = b.depthDelta ?? 999;
    if (Math.abs(dda - ddb) > 0.5) return dda - ddb;
    return (a.mae ?? 999) - (b.mae ?? 999);
  });
}

// ── Engineering verdict ────────────────────────────────────────────────────────

function buildVerdict(ranked) {
  if (!ranked.length) return { text: 'No results.', type: 'neutral' };
  const best = ranked[0];
  const physCandidates = ranked.filter(r =>
    (r.physicsClass === 'Likely physical' || r.physicsClass === 'Plausible') &&
    (r.distFromRewNull ?? 999) < 2 &&
    (r.depthDelta ?? 999) < 3
  );

  if (physCandidates.length > 0) {
    const top = physCandidates[0];
    return {
      text: `${top.key} (${top.label}) — ${top.physicsClass} — reproduces null at ${top.nullHz?.toFixed(1)} Hz (target ${REW_NULL_HZ} Hz) with depth ${top.nullDepth?.toFixed(1)} dB (target ${REW_NULL_DEPTH} dB). MAE ${top.mae?.toFixed(2)} dB. Leading production candidate.`,
      type: 'candidate',
    };
  }

  const close = ranked.filter(r => (r.distFromRewNull ?? 999) < 2);
  if (close.length > 0 && (close[0].depthDelta ?? 999) > 3) {
    return {
      text: `Null frequency is reproducible (best: ${close[0].nullHz?.toFixed(1)} Hz) but depth mismatch persists (${close[0].nullDepth?.toFixed(1)} dB vs target ${REW_NULL_DEPTH} dB). Vector coherence alone cannot simultaneously fix both frequency and depth. The next investigation should focus on boundary interaction, source radiation model, or REW's modal excitation assumptions.`,
      type: 'partial',
    };
  }

  return {
    text: `No physically-plausible model simultaneously reproduces both null frequency (target ${REW_NULL_HZ} Hz) and null depth (target ${REW_NULL_DEPTH} dB) within tolerance. The remaining discrepancy is unlikely to be caused by vector coherence alone. The next investigation should focus on boundary interaction, source radiation model, or REW's modal excitation assumptions.`,
    type: 'investigate',
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

function TD({ v, unit = '', digits = 2, color }) {
  const n = Number(v);
  return (
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: color ?? (Number.isFinite(n) ? '#1c1917' : '#9ca3af') }}>
      {Number.isFinite(n) ? `${n.toFixed(digits)}${unit}` : '—'}
    </td>
  );
}

function NullHzCell({ hz }) {
  const dist = hz !== null && Number.isFinite(hz) ? Math.abs(hz - REW_NULL_HZ) : null;
  const col  = dist !== null ? (dist < 2 ? '#166534' : dist < 5 ? '#92400e' : '#991b1b') : '#9ca3af';
  return (
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: col, fontWeight: dist !== null && dist < 3 ? 700 : 400 }}>
      {hz !== null && Number.isFinite(hz) ? `${hz.toFixed(1)} Hz` : '—'}
    </td>
  );
}

function DepthCell({ depth }) {
  const delta = depth !== null && Number.isFinite(depth) ? Math.abs(depth - REW_NULL_DEPTH) : null;
  const col   = delta !== null ? (delta < 3 ? '#166534' : delta < 8 ? '#92400e' : '#991b1b') : '#9ca3af';
  return (
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: col, fontWeight: delta !== null && delta < 4 ? 700 : 400 }}>
      {depth !== null && Number.isFinite(depth) ? `${depth.toFixed(1)} dB` : '—'}
    </td>
  );
}

function PhysicsBadge({ label }) {
  const p = PHYSICS[label] ?? PHYSICS['Do not recommend'];
  return (
    <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3,
      background: p.bg, color: p.color, border: `1px solid ${p.border}`,
      fontSize: 8, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function FamilyLabel({ family }) {
  const colors = { A: '#7c3aed', B: '#0369a1', C: '#065f46', D: '#92400e', E: '#b45309', F: '#991b1b' };
  return (
    <span style={{ display: 'inline-block', width: 14, textAlign: 'center',
      fontWeight: 700, color: colors[family] ?? '#374151', fontFamily: 'monospace', fontSize: 10 }}>
      {family}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ComplexVectorCoherenceAudit({ roomDims, seat, sub, surfaceAbsorption, axialQ }) {
  const [running, setRunning] = useState(false);
  const [data, setData]       = useState(null);

  const handleRun = useCallback(() => {
    if (!roomDims || !seat || !sub) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const results = runAll(roomDims, seat, sub, surfaceAbsorption, axialQ ?? 4.0);
        const ranked  = rankResults(results);
        const verdict = buildVerdict(ranked);
        setData({ results, ranked, verdict });
      } catch (e) {
        setData({ error: e.message });
      }
      setRunning(false);
    }, 20);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ]);

  const verdictStyle = {
    candidate:   { bg: '#f0fdf4', border: '#166534', color: '#166534' },
    partial:     { bg: '#fffbeb', border: '#92400e', color: '#92400e' },
    investigate: { bg: '#eff6ff', border: '#1d4ed8', color: '#1d4ed8' },
    neutral:     { bg: '#f3f4f6', border: '#6b7280', color: '#374151' },
  };

  const FAMILIES = ['A', 'B', 'C', 'D', 'E', 'F'];
  const FAMILY_LABELS = {
    A: 'Family A — Constant coherence',
    B: 'Family B — Frequency-dependent coherence',
    C: 'Family C — Modal-energy weighting',
    D: 'Family D — Distance weighting',
    E: 'Family E — Q weighting',
    F: 'Family F — Mixed models',
  };

  return (
    <details style={{ border: '1px solid #0369a1', borderRadius: 8, background: '#f0f9ff', padding: 0, marginBottom: 8 }}>
      <summary style={{ fontWeight: 700, color: '#0c4a6e', fontSize: 11, fontFamily: 'monospace',
        cursor: 'pointer', padding: '8px 12px', userSelect: 'none' }}>
        Complex Vector Coherence Audit — {VARIANT_DEFS.length} variants · null depth vs REW −17 dB
        <span style={{ fontSize: 9, fontWeight: 400, color: '#0369a1', marginLeft: 8 }}>diagnostic only · collapsed by default</span>
      </summary>

      <div style={{ padding: '0 12px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#0369a1', maxWidth: '70%', lineHeight: 1.5 }}>
            Baseline: normalised-vector summation (Variant Q). Only coherence/partial-cancellation is varied.
            All other engine parameters held constant.
          </div>
          <button
            onClick={handleRun}
            disabled={running || !roomDims || !seat || !sub}
            style={{ padding: '5px 14px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
              background: running ? '#e5e7eb' : '#0369a1', color: running ? '#6b7280' : '#fff',
              border: 'none', cursor: running ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
          >
            {running ? `Running ${VARIANT_DEFS.length} variants…` : data ? 'Re-run' : 'Run Audit'}
          </button>
        </div>

        {(!seat || !sub) && (
          <div style={{ color: '#0369a1', fontSize: 10, fontFamily: 'monospace' }}>⚠ Need seat and sub to run.</div>
        )}
        {data?.error && (
          <div style={{ color: '#991b1b', fontSize: 10, fontFamily: 'monospace', padding: 6, background: '#fee2e2', borderRadius: 4 }}>
            Error: {data.error}
          </div>
        )}

        {data && !data.error && (() => {
          const { ranked, verdict } = data;
          const vc = verdictStyle[verdict.type] ?? verdictStyle.neutral;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* ── VERDICT ── */}
              <div style={{ padding: '8px 12px', borderRadius: 6, background: vc.bg,
                border: `2px solid ${vc.border}`, fontFamily: 'monospace', fontSize: 10,
                color: vc.color, fontWeight: 700, lineHeight: 1.6 }}>
                {verdict.text}
              </div>

              {/* ── NULL STORY TABLE (always visible) ── */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 10, color: '#0c4a6e', marginBottom: 4 }}>
                  Null Story — ranked by null frequency closest to REW ({REW_NULL_HZ} Hz), then depth closest to {REW_NULL_DEPTH} dB
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
                    <thead>
                      <tr>
                        <TH ch="Rank" left />
                        <TH ch="Fam" />
                        <TH ch="Variant" left />
                        <TH ch="Null Hz" />
                        <TH ch="Null depth" />
                        <TH ch="Δ from REW Hz" />
                        <TH ch="Δ depth dB" />
                        <TH ch="Score" />
                        <TH ch="Physics" left />
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.slice(0, 15).map((r, i) => {
                        const isBaseline = r.key === 'A_1.00';
                        const depthDelta = r.nullDepth !== null ? r.nullDepth - REW_NULL_DEPTH : null;
                        return (
                          <tr key={r.key} style={{ borderBottom: '1px solid #e0f2fe',
                            background: isBaseline ? '#e0f2fe' : i === 0 ? '#f0fdf4' : 'transparent' }}>
                            <td style={{ ...mono, padding: '2px 6px', color: '#6b7280', textAlign: 'right' }}>
                              {i + 1}{isBaseline ? ' ★' : ''}
                            </td>
                            <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                              <FamilyLabel family={r.family} />
                            </td>
                            <td style={{ ...mono, padding: '2px 6px', fontWeight: isBaseline || i === 0 ? 700 : 400 }}>
                              {r.label}
                              {i === 0 && !isBaseline && <span style={{ color: '#166534', marginLeft: 4, fontSize: 8 }}>★ best</span>}
                            </td>
                            <NullHzCell hz={r.nullHz} />
                            <DepthCell depth={r.nullDepth} />
                            <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
                              color: (r.distFromRewNull ?? 999) < 2 ? '#166534' : (r.distFromRewNull ?? 999) < 5 ? '#92400e' : '#991b1b',
                              fontWeight: (r.distFromRewNull ?? 999) < 3 ? 700 : 400 }}>
                              {Number.isFinite(r.distFromRewNull) ? `${r.distFromRewNull.toFixed(1)} Hz` : '—'}
                            </td>
                            <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
                              color: depthDelta !== null && Math.abs(depthDelta) < 3 ? '#166534' : '#6b7280' }}>
                              {depthDelta !== null && Number.isFinite(depthDelta) ? `${depthDelta > 0 ? '+' : ''}${depthDelta.toFixed(1)} dB` : '—'}
                            </td>
                            <TD v={r.score} digits={1} color={r.score < 10 ? '#166534' : r.score > 25 ? '#991b1b' : '#374151'} />
                            <td style={{ padding: '2px 6px' }}>
                              <PhysicsBadge label={r.physicsClass} />
                            </td>
                          </tr>
                        );
                      })}
                      {/* REW reference */}
                      <tr style={{ borderTop: '2px solid #bae6fd', background: '#fef9c3' }}>
                        <td colSpan={3} style={{ ...mono, padding: '2px 6px', fontWeight: 700, color: '#92400e' }}>REW target</td>
                        <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: '#92400e', fontWeight: 700 }}>{REW_NULL_HZ.toFixed(1)} Hz</td>
                        <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: '#92400e', fontWeight: 700 }}>{REW_NULL_DEPTH.toFixed(1)} dB</td>
                        <td colSpan={4} style={{ ...mono, padding: '2px 5px', color: '#9ca3af', fontSize: 9 }}>reference</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {ranked.length > 15 && (
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginTop: 3 }}>
                    Showing top 15 of {ranked.length}. See full metrics table below.
                  </div>
                )}
              </div>

              {/* ── PHYSICS ASSESSMENT (collapsed) ── */}
              <details>
                <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                  Physics Assessment — classification by family
                </summary>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {FAMILIES.map(fam => {
                    const famVariants = ranked.filter(r => r.family === fam);
                    if (!famVariants.length) return null;
                    return (
                      <div key={fam}>
                        <div style={{ fontWeight: 700, fontSize: 9, color: '#374151', marginBottom: 3, fontFamily: 'monospace' }}>
                          {FAMILY_LABELS[fam]}
                        </div>
                        {famVariants.map(r => (
                          <div key={r.key} style={{ display: 'flex', gap: 6, alignItems: 'center',
                            padding: '2px 6px', borderRadius: 3, marginBottom: 2,
                            background: '#f8f9fa', border: '1px solid #e5e7eb' }}>
                            <PhysicsBadge label={r.physicsClass} />
                            <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 600, color: '#374151' }}>{r.label}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#6b7280' }}>— {r.desc}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </details>

              {/* ── FULL METRICS TABLE (collapsed) ── */}
              <details>
                <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                  Full Metrics — all {ranked.length} variants (MAE, worst error, peak, phase)
                </summary>
                <div style={{ overflowX: 'auto', marginTop: 6 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
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
                        const isBase = r.key === 'A_1.00';
                        return (
                          <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6',
                            background: isBase ? '#e0f2fe' : i === 0 ? '#f0fdf4' : 'transparent' }}>
                            <td style={{ ...mono, padding: '2px 6px', fontWeight: isBase ? 700 : 400 }}>
                              <FamilyLabel family={r.family} />
                              <span style={{ marginLeft: 4 }}>{r.label}</span>
                            </td>
                            <TD v={r.mae} digits={2} unit=" dB"
                              color={r.mae < 3 ? '#166534' : r.mae > 6 ? '#991b1b' : undefined} />
                            <TD v={r.worstErr} digits={2} unit=" dB" />
                            <TD v={r.worstHz} digits={0} unit=" Hz" />
                            <NullHzCell hz={r.nullHz} />
                            <DepthCell depth={r.nullDepth} />
                            <TD v={r.peakHz} digits={1} unit=" Hz" />
                            <TD v={r.peakSpl} digits={1} unit=" dB" />
                            <TD v={r.modalDirectRatio} digits={1} unit=" dB" />
                            <TD v={r.phaseDiffAtNull} digits={0} unit="°"
                              color={r.phaseDiffAtNull !== null && Math.abs(r.phaseDiffAtNull) > 135 ? '#991b1b' : undefined} />
                            <TD v={r.runtimeMs} digits={1} unit=" ms" />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>

            </div>
          );
        })()}
      </div>
    </details>
  );
}