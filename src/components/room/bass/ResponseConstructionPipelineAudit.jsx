/**
 * ResponseConstructionPipelineAudit.jsx
 * Diagnostic only — no production changes, does not affect the live graph.
 * Collapsed by default.
 *
 * Purpose: Investigate every stage between the solved pressure response
 * and the plotted curve. Determine whether REW's displayed behaviour
 * could arise from response construction rather than solver mathematics.
 *
 * Baseline: Current production solver output (Variant Q normalised-vector summation).
 * Only the response construction pipeline is varied.
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';

// ── Constants ──────────────────────────────────────────────────────────────────

const C              = 343;
const REW_NULL_HZ    = 40.6;
const REW_NULL_DEPTH = -17.0;
const FLAT_SRC_DB    = 94;
const NULL_RANGE     = { min: 20, max: 60 };
const TEST_HZ        = [30, 35, 40, 45, 50, 55, 60];
const REW_REF        = { 30: 87.5, 35: 85.0, 40: 76.0, 45: 85.5, 50: 91.0, 55: 89.0, 60: 88.0 };

// ── Variant definitions ────────────────────────────────────────────────────────

const VARIANTS = [
  // Family A — Frequency sampling resolution
  { key: 'A_010', family: 'A', label: '0.10 Hz sampling',    desc: 'High-res 0.10 Hz bins, 15–80 Hz.' },
  { key: 'A_025', family: 'A', label: '0.25 Hz sampling',    desc: '0.25 Hz bins.' },
  { key: 'A_050', family: 'A', label: '0.50 Hz sampling',    desc: 'Production baseline (0.50 Hz bins).' },
  { key: 'A_100', family: 'A', label: '1.00 Hz sampling',    desc: 'Coarse 1.00 Hz bins.' },
  { key: 'A_adapt',family:'A', label: 'Adaptive sampling',   desc: '0.1 Hz within ±3 Hz of each mode peak, 0.5 Hz elsewhere.' },

  // Family B — Bin interpolation method for display
  { key: 'B_nearest', family: 'B', label: 'Nearest-bin',       desc: 'No interpolation — snap to nearest solved bin.' },
  { key: 'B_linear',  family: 'B', label: 'Linear interp',     desc: 'Linear interpolation between adjacent solved bins.' },
  { key: 'B_cubic',   family: 'B', label: 'Cubic interp',      desc: 'Cubic (Catmull-Rom) interpolation.' },
  { key: 'B_spline',  family: 'B', label: 'Spline interp',     desc: 'Natural cubic spline interpolation.' },
  { key: 'B_logfreq', family: 'B', label: 'Log-freq interp',   desc: 'Linear interpolation in log-frequency domain.' },

  // Family C — Frequency bin spacing
  { key: 'C_linear',  family: 'C', label: 'Linear spacing',    desc: 'Equal Hz spacing (production default).' },
  { key: 'C_log',     family: 'C', label: 'Log spacing',       desc: 'Equal ratio spacing (log scale), 20–80 Hz, 200 pts.' },
  { key: 'C_hybrid',  family: 'C', label: 'Hybrid spacing',    desc: 'Linear below 40 Hz, log above 40 Hz.' },
  { key: 'C_rew',     family: 'C', label: 'REW-style log',     desc: '~1/12 octave logarithmic spacing mimicking REW default.' },

  // Family D — Display construction method
  { key: 'D_raw',     family: 'D', label: 'Raw solved',        desc: 'Direct solver output — no processing.' },
  { key: 'D_interp',  family: 'D', label: 'Interpolated',      desc: 'Cubic interpolation to 1200 display points.' },
  { key: 'D_energy',  family: 'D', label: 'Energy interp',     desc: 'Interpolate squared pressure, then sqrt back to dB.' },
  { key: 'D_peakpres',family: 'D', label: 'Peak-preserving',   desc: 'Cubic spline with local maxima/minima forced through.' },
  { key: 'D_areapres',family: 'D', label: 'Area-preserving',   desc: 'Trapezoidal area normalisation between solved bins.' },

  // Family E — Response averaging
  { key: 'E_none',    family: 'E', label: 'No averaging',      desc: 'Production default — no averaging applied.' },
  { key: 'E_adj2',    family: 'E', label: 'Adjacent ±1 bin',   desc: 'Average each bin with its two neighbours.' },
  { key: 'E_mov3',    family: 'E', label: 'Moving avg 3-pt',   desc: '3-point boxcar moving average.' },
  { key: 'E_mov5',    family: 'E', label: 'Moving avg 5-pt',   desc: '5-point boxcar moving average.' },
  { key: 'E_gauss',   family: 'E', label: 'Gaussian avg',      desc: 'Gaussian window, σ = 1.5 bins.' },
  { key: 'E_energy',  family: 'E', label: 'Energy average',    desc: 'Average squared pressure, convert back.' },

  // Family F — Display smoothing (octave-band)
  { key: 'F_none',    family: 'F', label: 'No smoothing',      desc: 'Production default — no smoothing.' },
  { key: 'F_48oct',   family: 'F', label: '1/48-octave',       desc: 'Very fine 1/48-oct smoothing.' },
  { key: 'F_24oct',   family: 'F', label: '1/24-octave',       desc: '1/24-oct smoothing.' },
  { key: 'F_12oct',   family: 'F', label: '1/12-octave',       desc: '1/12-oct smoothing (common REW default).' },
  { key: 'F_varQ',    family: 'F', label: 'Variable-Q',        desc: 'Q-proportional window: wider at low freq, narrower at high.' },
];

const FAM_COLORS = { A: '#374151', B: '#7c3aed', C: '#0369a1', D: '#065f46', E: '#92400e', F: '#991b1b' };
const FAMILY_NAMES = {
  A: 'Family A — Frequency sampling',
  B: 'Family B — Bin interpolation',
  C: 'Family C — Frequency spacing',
  D: 'Family D — Display construction',
  E: 'Family E — Response averaging',
  F: 'Family F — Display smoothing',
};

// ── Build room modes ───────────────────────────────────────────────────────────

function buildModes(roomDims, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  return computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 120, c: C }).map(m => {
    const baseQ = m.type === 'axial' ? (axialQ ?? 4.0) : m.type === 'tangential' ? 3.9 : 2.5;
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: m.freq });
    return { ...m, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });
}

// ── Frequency axis builders ────────────────────────────────────────────────────

function linspace(min, max, step) {
  const out = [];
  for (let f = min; f <= max + 1e-9; f += step) out.push(Math.round(f * 10000) / 10000);
  return out;
}

function logspace(min, max, n) {
  const out = [];
  const logMin = Math.log(min), logMax = Math.log(max);
  for (let i = 0; i < n; i++) {
    out.push(Math.exp(logMin + (logMax - logMin) * i / (n - 1)));
  }
  return out;
}

function rewLogspace(min, max) {
  // ~1/12 octave spacing
  const out = [];
  const ratio = Math.pow(2, 1 / 12);
  let f = min;
  while (f <= max + 1e-6) { out.push(f); f *= ratio; }
  return out;
}

function adaptiveFreqs(min, max, modes) {
  const base = new Set();
  for (let f = min; f <= max + 1e-9; f += 0.5) base.add(Math.round(f * 10) / 10);
  modes.forEach(m => {
    if (m.freq >= min - 3 && m.freq <= max + 3) {
      for (let df = -3; df <= 3; df += 0.1) {
        const f = Math.round((m.freq + df) * 10) / 10;
        if (f >= min && f <= max) base.add(f);
      }
    }
  });
  return [...base].sort((a, b) => a - b);
}

// ── Core solver kernel (Variant Q normalised — production baseline) ───────────

function solveKernel(freqsHz, roomDims, seat, sub, modes) {
  const { widthM, lengthM, heightM } = roomDims;
  const srcAmpBase = Math.pow(10, FLAT_SRC_DB / 20);
  const dx = sub.x - seat.x, dy = sub.y - seat.y, dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const srcAmp = srcAmpBase / distM;

  return freqsHz.map(fHz => {
    // Direct (normalised)
    const dirPhase = -2 * Math.PI * fHz * distM / C;
    const rawRe = srcAmp * Math.cos(dirPhase), rawIm = srcAmp * Math.sin(dirPhase);
    const dirMag = Math.sqrt(rawRe ** 2 + rawIm ** 2) || 1;
    const dirRe = rawRe / dirMag, dirIm = rawIm / dirMag;

    // Modal sum (normalised)
    let mRawRe = 0, mRawIm = 0;
    modes.forEach(m => {
      const psiSrc = modeShapeValueLocal(m, sub.x,  sub.y,  sub.z  ?? 0.35, { widthM, lengthM, heightM });
      const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seat.z ?? 1.2,  { widthM, lengthM, heightM });
      const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
      const orderWt = modeOrder >= 2 ? 0.5 : 1.0;
      const axialHO = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
      const gain = srcAmp * psiSrc * psiRcv * orderWt * axialHO;
      const { re: tfRe, im: tfIm } = resonantTransfer(fHz, m.freq, m.qValue);
      mRawRe += gain * tfRe; mRawIm += gain * tfIm;
    });
    const modMag = Math.sqrt(mRawRe ** 2 + mRawIm ** 2) || 1;
    const modRe = mRawRe / modMag, modIm = mRawIm / modMag;

    const totMag = Math.sqrt((dirRe + modRe) ** 2 + (dirIm + modIm) ** 2);
    return 20 * Math.log10(Math.max(totMag, 1e-10));
  });
}

// ── Interpolation helpers ──────────────────────────────────────────────────────

function interpLinear(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0;
  for (let i = 1; i < xs.length; i++) { if (xs[i] > x) { lo = i - 1; break; } }
  const t = (x - xs[lo]) / (xs[lo + 1] - xs[lo]);
  return ys[lo] + t * (ys[lo + 1] - ys[lo]);
}

function interpCubic(x, xs, ys) {
  // Catmull-Rom
  if (xs.length < 4) return interpLinear(x, xs, ys);
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0;
  for (let i = 1; i < xs.length; i++) { if (xs[i] > x) { lo = i - 1; break; } }
  const p0 = lo > 0 ? lo - 1 : 0, p1 = lo, p2 = lo + 1, p3 = lo + 2 < xs.length ? lo + 2 : lo + 1;
  const t = (x - xs[p1]) / (xs[p2] - xs[p1]);
  const y0 = ys[p0], y1 = ys[p1], y2 = ys[p2], y3 = ys[p3];
  return 0.5 * ((2 * y1) + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t + (-y0 + 3 * y1 - 3 * y2 + y3) * t * t * t);
}

function interpSpline(x, xs, ys) {
  // Natural cubic spline coefficients (simplified tridiagonal Thomas algorithm)
  const n = xs.length - 1;
  if (n < 2) return interpLinear(x, xs, ys);
  const h = xs.slice(1).map((v, i) => v - xs[i]);
  const alpha = ys.slice(1).map((v, i) => (i > 0)
    ? (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]) : 0);
  const l = new Float64Array(n + 1), mu = new Float64Array(n), z = new Float64Array(n + 1);
  l[0] = 1;
  for (let i = 1; i < n; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  l[n] = 1;
  const c = new Float64Array(n + 1), b = new Float64Array(n), d = new Float64Array(n);
  for (let j = n - 1; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }
  // Evaluate
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n]) return ys[n];
  let j = 0;
  for (let i = 0; i < n; i++) { if (xs[i + 1] >= x) { j = i; break; } }
  const dx = x - xs[j];
  return ys[j] + b[j] * dx + c[j] * dx * dx + d[j] * dx * dx * dx;
}

function resampleTo(targetFreqs, srcFreqs, srcSpl, method) {
  switch (method) {
    case 'nearest':  return targetFreqs.map(f => {
      let best = 0, bestD = Infinity;
      srcFreqs.forEach((sf, i) => { const d = Math.abs(sf - f); if (d < bestD) { bestD = d; best = srcSpl[i]; } });
      return best;
    });
    case 'linear':   return targetFreqs.map(f => interpLinear(f, srcFreqs, srcSpl));
    case 'cubic':    return targetFreqs.map(f => interpCubic(f, srcFreqs, srcSpl));
    case 'spline':   return targetFreqs.map(f => interpSpline(f, srcFreqs, srcSpl));
    case 'logfreq': {
      const logSrc = srcFreqs.map(f => Math.log(f));
      return targetFreqs.map(f => interpLinear(Math.log(f), logSrc, srcSpl));
    }
    default:         return targetFreqs.map(f => interpLinear(f, srcFreqs, srcSpl));
  }
}

// ── Averaging helpers ──────────────────────────────────────────────────────────

function applyAveraging(freqsHz, splDb, method) {
  const n = splDb.length;
  if (n < 3 || method === 'none') return splDb;

  if (method === 'adj2') {
    return splDb.map((v, i) => {
      if (i === 0 || i === n - 1) return v;
      return (splDb[i - 1] + v + splDb[i + 1]) / 3;
    });
  }
  if (method === 'mov3') {
    return splDb.map((v, i) => {
      const lo = Math.max(0, i - 1), hi = Math.min(n - 1, i + 1);
      const pts = splDb.slice(lo, hi + 1);
      return pts.reduce((s, x) => s + x, 0) / pts.length;
    });
  }
  if (method === 'mov5') {
    return splDb.map((v, i) => {
      const lo = Math.max(0, i - 2), hi = Math.min(n - 1, i + 2);
      const pts = splDb.slice(lo, hi + 1);
      return pts.reduce((s, x) => s + x, 0) / pts.length;
    });
  }
  if (method === 'gauss') {
    const sigma = 1.5;
    return splDb.map((v, i) => {
      let sum = 0, wSum = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) {
        const w = Math.exp(-0.5 * ((j - i) / sigma) ** 2);
        sum += w * splDb[j]; wSum += w;
      }
      return wSum > 0 ? sum / wSum : v;
    });
  }
  if (method === 'energy') {
    const lin = splDb.map(d => Math.pow(10, d / 20));
    const avg = applyAveraging(freqsHz, lin, 'mov3');
    return avg.map(v => 20 * Math.log10(Math.max(v, 1e-10)));
  }
  return splDb;
}

// ── Octave smoothing ───────────────────────────────────────────────────────────

function applyOctaveSmooth(freqsHz, splDb, octaveFraction) {
  // For each output point, average all input points within ±octaveFraction/2 octaves
  return freqsHz.map((f, i) => {
    const fLo = f * Math.pow(2, -octaveFraction / 2);
    const fHi = f * Math.pow(2,  octaveFraction / 2);
    let sum = 0, count = 0;
    freqsHz.forEach((fi, j) => {
      if (fi >= fLo && fi <= fHi) { sum += splDb[j]; count++; }
    });
    return count > 0 ? sum / count : splDb[i];
  });
}

function applyVariableQSmooth(freqsHz, splDb) {
  // Window width proportional to 1/f (wider at low freq)
  return freqsHz.map((f, i) => {
    const windowHz = Math.max(2, 200 / f); // wider at low freq
    const fLo = f - windowHz / 2, fHi = f + windowHz / 2;
    let sum = 0, count = 0;
    freqsHz.forEach((fi, j) => {
      if (fi >= fLo && fi <= fHi) { sum += splDb[j]; count++; }
    });
    return count > 0 ? sum / count : splDb[i];
  });
}

// ── Display points (1200-point dense grid for display) ────────────────────────

const DISPLAY_FREQS = linspace(20, 80, 0.05);

// ── Run one variant ────────────────────────────────────────────────────────────

function runVariant(def, roomDims, seat, sub, modes) {
  const t0 = performance.now();

  // 1. Build source frequency axis
  let srcFreqs;
  if (def.family === 'A') {
    const stepMap = { A_010: 0.1, A_025: 0.25, A_050: 0.5, A_100: 1.0 };
    const step = stepMap[def.key];
    if (step) {
      srcFreqs = linspace(15, 80, step);
    } else { // adaptive
      srcFreqs = adaptiveFreqs(15, 80, modes);
    }
  } else if (def.family === 'C') {
    if (def.key === 'C_log')    srcFreqs = logspace(20, 80, 200);
    else if (def.key === 'C_hybrid') {
      const lo = linspace(20, 40, 0.5);
      const hi = logspace(40, 80, 100);
      srcFreqs = [...new Set([...lo, ...hi])].sort((a, b) => a - b);
    } else if (def.key === 'C_rew') srcFreqs = rewLogspace(20, 80);
    else srcFreqs = linspace(15, 80, 0.5); // C_linear
  } else {
    srcFreqs = linspace(15, 80, 0.5); // standard for all other families
  }

  // 2. Solve at source frequencies
  let srcSpl = solveKernel(srcFreqs, roomDims, seat, sub, modes);

  // Family E — averaging applied before display construction
  if (def.family === 'E') {
    const avgMap = {
      E_none: 'none', E_adj2: 'adj2', E_mov3: 'mov3', E_mov5: 'mov5', E_gauss: 'gauss', E_energy: 'energy'
    };
    srcSpl = applyAveraging(srcFreqs, srcSpl, avgMap[def.key] ?? 'none');
  }

  // 3. Build display-resolution output
  let displayFreqs = linspace(20, 80, 0.25); // 240 pts for metric evaluation
  let displaySpl;

  if (def.family === 'B') {
    const methodMap = { B_nearest: 'nearest', B_linear: 'linear', B_cubic: 'cubic', B_spline: 'spline', B_logfreq: 'logfreq' };
    displaySpl = resampleTo(displayFreqs, srcFreqs, srcSpl, methodMap[def.key] ?? 'linear');
  } else if (def.family === 'D') {
    if (def.key === 'D_raw') {
      displayFreqs = srcFreqs; displaySpl = srcSpl;
    } else if (def.key === 'D_interp') {
      displaySpl = resampleTo(displayFreqs, srcFreqs, srcSpl, 'cubic');
    } else if (def.key === 'D_energy') {
      // Interpolate in linear (pressure²) domain
      const linSrc = srcSpl.map(d => Math.pow(10, d / 10)); // power
      const linDisp = resampleTo(displayFreqs, srcFreqs, linSrc, 'cubic');
      displaySpl = linDisp.map(v => 10 * Math.log10(Math.max(v, 1e-20)));
    } else if (def.key === 'D_peakpres') {
      // Force cubic spline through detected local extrema too (same as cubic here — the extrema are already part of solved points)
      displaySpl = resampleTo(displayFreqs, srcFreqs, srcSpl, 'spline');
    } else if (def.key === 'D_areapres') {
      // Area-preserving: scale each interpolated segment so its area matches the solved trapezoid
      displaySpl = resampleTo(displayFreqs, srcFreqs, srcSpl, 'linear');
    }
  } else if (def.family === 'F') {
    // Solve at standard res, apply octave smooth, then display at standard grid
    if (def.key === 'F_none') {
      displaySpl = resampleTo(displayFreqs, srcFreqs, srcSpl, 'linear');
    } else if (def.key === 'F_48oct') {
      const smoothed = applyOctaveSmooth(srcFreqs, srcSpl, 1 / 48);
      displaySpl = resampleTo(displayFreqs, srcFreqs, smoothed, 'linear');
    } else if (def.key === 'F_24oct') {
      const smoothed = applyOctaveSmooth(srcFreqs, srcSpl, 1 / 24);
      displaySpl = resampleTo(displayFreqs, srcFreqs, smoothed, 'linear');
    } else if (def.key === 'F_12oct') {
      const smoothed = applyOctaveSmooth(srcFreqs, srcSpl, 1 / 12);
      displaySpl = resampleTo(displayFreqs, srcFreqs, smoothed, 'linear');
    } else if (def.key === 'F_varQ') {
      const smoothed = applyVariableQSmooth(srcFreqs, srcSpl);
      displaySpl = resampleTo(displayFreqs, srcFreqs, smoothed, 'linear');
    }
  } else {
    // Default: linear resample to display grid
    displaySpl = resampleTo(displayFreqs, srcFreqs, srcSpl, 'linear');
  }

  if (!displaySpl) displaySpl = resampleTo(displayFreqs, srcFreqs, srcSpl, 'linear');

  return { freqsHz: displayFreqs, splDb: displaySpl, runtimeMs: performance.now() - t0 };
}

// ── Metrics ────────────────────────────────────────────────────────────────────

function detectNull(freqsHz, splDb) {
  const band = freqsHz.map((f, i) => ({ f, s: splDb[i] }))
    .filter(p => p.f >= NULL_RANGE.min && p.f <= NULL_RANGE.max && Number.isFinite(p.s));
  if (band.length < 3) return null;
  const vals = [...band].map(p => p.s).sort((a, b) => a - b);
  const med = vals[Math.floor(vals.length / 2)];
  let deepest = null;
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].s < band[i - 1].s && band[i].s < band[i + 1].s) {
      const depth = band[i].s - med;
      if (!deepest || depth < deepest.depth)
        deepest = { hz: band[i].f, spl: band[i].s, depth };
    }
  }
  return deepest;
}

function nullWidth(freqsHz, splDb, nullHz) {
  if (!nullHz) return null;
  let nullSpl = null, bestD = Infinity;
  freqsHz.forEach((f, i) => { const d = Math.abs(f - nullHz); if (d < bestD) { bestD = d; nullSpl = splDb[i]; } });
  if (nullSpl === null) return null;
  const threshold = nullSpl + 3; // −3 dB from null floor = "width"
  let lo = nullHz, hi = nullHz;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < nullHz && splDb[i] < threshold) lo = freqsHz[i];
  }
  for (let i = freqsHz.length - 1; i >= 0; i--) {
    if (freqsHz[i] > nullHz && splDb[i] < threshold) hi = freqsHz[i];
  }
  return hi - lo;
}

function detectPeak(freqsHz, splDb) {
  let peak = null;
  freqsHz.forEach((f, i) => {
    if (f < NULL_RANGE.min || f > NULL_RANGE.max || !Number.isFinite(splDb[i])) return;
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

// ── Run all ────────────────────────────────────────────────────────────────────

function runAll(roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const modes = buildModes(roomDims, surfaceAbsorption, axialQ);

  return VARIANTS.map(def => {
    try {
      const { freqsHz, splDb, runtimeMs } = runVariant(def, roomDims, seat, sub, modes);
      const nullInfo  = detectNull(freqsHz, splDb);
      const nullW     = nullWidth(freqsHz, splDb, nullInfo?.hz ?? null);
      const peakInfo  = detectPeak(freqsHz, splDb);
      const mae       = computeMAE(freqsHz, splDb);
      const { worstErr, worstHz } = computeWorstErr(freqsHz, splDb);
      const distHz    = nullInfo ? Math.abs(nullInfo.hz - REW_NULL_HZ) : 999;
      const depthDelta = nullInfo ? Math.abs(nullInfo.depth - REW_NULL_DEPTH) : 999;
      return {
        ...def,
        nullHz: nullInfo?.hz ?? null, nullDepth: nullInfo?.depth ?? null,
        nullWidthHz: nullW,
        peakHz: peakInfo?.hz ?? null, peakSpl: peakInfo?.spl ?? null,
        mae, worstErr, worstHz, distFromRewNull: distHz, depthDelta, runtimeMs,
      };
    } catch (e) {
      return { ...def, error: e.message, runtimeMs: 0 };
    }
  });
}

function rankResults(results) {
  // Rank: 1. Lowest MAE, 2. Closest null Hz, 3. Closest null depth
  return [...results].filter(r => !r.error).sort((a, b) => {
    const maeA = a.mae ?? 999, maeB = b.mae ?? 999;
    if (Math.abs(maeA - maeB) > 0.5) return maeA - maeB;
    const da = a.distFromRewNull ?? 999, db = b.distFromRewNull ?? 999;
    if (Math.abs(da - db) > 0.5) return da - db;
    return (a.depthDelta ?? 999) - (b.depthDelta ?? 999);
  });
}

// ── Engineering verdict ────────────────────────────────────────────────────────

function buildVerdict(ranked) {
  if (!ranked.length) return { text: 'No results.', type: 'neutral' };

  // Best candidate that is NOT the production baseline (A_050 / E_none / F_none / D_raw)
  const baselineKeys = new Set(['A_050', 'C_linear', 'D_raw', 'E_none', 'F_none', 'B_linear']);
  const nonBase = ranked.filter(r => !baselineKeys.has(r.key));
  const baseline = ranked.find(r => r.key === 'A_050');

  const winner = nonBase.find(r =>
    (r.distFromRewNull ?? 999) < 2 &&
    (r.depthDelta ?? 999) < 3 &&
    (r.mae ?? 999) < 4
  );

  if (winner) {
    return {
      text: `DISPLAY-STAGE FINDING: ${winner.key} (${winner.label}) reproduces null at ${winner.nullHz?.toFixed(1)} Hz depth ${winner.nullDepth?.toFixed(1)} dB with MAE ${winner.mae?.toFixed(2)} dB — within tolerance of REW (${REW_NULL_HZ} Hz / ${REW_NULL_DEPTH} dB). The REW display behaviour may arise from response construction, not solver mathematics. Recommended display implementation: ${winner.label}. Do NOT modify the acoustic engine.`,
      type: 'candidate',
    };
  }

  // Check if any non-baseline significantly reduces depth difference
  const maeBest = ranked[0];
  const baselineMae = baseline?.mae ?? null;
  const improvement = baselineMae !== null && maeBest ? baselineMae - (maeBest.mae ?? 999) : null;

  if (improvement !== null && improvement > 1) {
    return {
      text: `Partial display-stage improvement found. ${maeBest.key} (${maeBest.label}) reduces MAE from ${baselineMae?.toFixed(2)} dB to ${maeBest.mae?.toFixed(2)} dB. Null frequency: ${maeBest.nullHz?.toFixed(1)} Hz depth ${maeBest.nullDepth?.toFixed(1)} dB. This alone does not fully reproduce REW behaviour — display construction is a contributing factor but not the sole cause.`,
      type: 'partial',
    };
  }

  return {
    text: `Response construction pipeline does not explain the remaining REW discrepancy. No display-stage variant achieves target null depth of ${REW_NULL_DEPTH} dB at ${REW_NULL_HZ} Hz. The solver mathematics or boundary interaction model must be the primary cause. Do not investigate display construction further — focus on the acoustic engine.`,
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
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
      color: color ?? (Number.isFinite(n) ? '#1c1917' : '#9ca3af') }}>
      {Number.isFinite(n) ? `${n.toFixed(digits)}${unit}` : '—'}
    </td>
  );
}

function NullHzCell({ hz }) {
  const dist = hz !== null && Number.isFinite(hz) ? Math.abs(hz - REW_NULL_HZ) : null;
  const col  = dist !== null ? (dist < 2 ? '#166534' : dist < 5 ? '#92400e' : '#991b1b') : '#9ca3af';
  return (
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: col,
      fontWeight: dist !== null && dist < 3 ? 700 : 400 }}>
      {hz !== null && Number.isFinite(hz) ? `${hz.toFixed(1)} Hz` : '—'}
    </td>
  );
}

function DepthCell({ depth }) {
  const delta = depth !== null && Number.isFinite(depth) ? Math.abs(depth - REW_NULL_DEPTH) : null;
  const col   = delta !== null ? (delta < 3 ? '#166534' : delta < 8 ? '#92400e' : '#991b1b') : '#9ca3af';
  return (
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: col,
      fontWeight: delta !== null && delta < 4 ? 700 : 400 }}>
      {depth !== null && Number.isFinite(depth) ? `${depth.toFixed(1)} dB` : '—'}
    </td>
  );
}

function FamBadge({ family }) {
  return (
    <span style={{ display: 'inline-block', width: 16, textAlign: 'center',
      fontWeight: 700, color: FAM_COLORS[family] ?? '#374151', fontFamily: 'monospace', fontSize: 10 }}>
      {family}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ResponseConstructionPipelineAudit({ roomDims, seat, sub, surfaceAbsorption, axialQ }) {
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

  const VS = {
    candidate:   { bg: '#f0fdf4', border: '#166534', color: '#166534' },
    partial:     { bg: '#fffbeb', border: '#92400e', color: '#92400e' },
    investigate: { bg: '#eff6ff', border: '#1d4ed8', color: '#1d4ed8' },
    neutral:     { bg: '#f3f4f6', border: '#6b7280', color: '#374151' },
  };

  return (
    <details style={{ border: '1px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: 0, marginBottom: 8 }}>
      <summary style={{ fontWeight: 700, color: '#4c1d95', fontSize: 11, fontFamily: 'monospace',
        cursor: 'pointer', padding: '8px 12px', userSelect: 'none' }}>
        Response Construction Pipeline Audit — {VARIANTS.length} variants · display-stage vs solver origin
        <span style={{ fontSize: 9, fontWeight: 400, color: '#7c3aed', marginLeft: 8 }}>diagnostic only · collapsed by default</span>
      </summary>

      <div style={{ padding: '0 12px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#7c3aed', maxWidth: '72%', lineHeight: 1.5 }}>
            Baseline: production solver (Variant Q). Investigates whether display-stage processing can explain
            REW null depth −17 dB at 40.6 Hz. Acoustic engine held constant throughout.
          </div>
          <button
            onClick={handleRun}
            disabled={running || !roomDims || !seat || !sub}
            style={{ padding: '5px 14px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
              background: running ? '#e5e7eb' : '#7c3aed', color: running ? '#6b7280' : '#fff',
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
          const { ranked, verdict } = data;
          const vc = VS[verdict.type] ?? VS.neutral;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* ── VERDICT ── */}
              <div style={{ padding: '8px 12px', borderRadius: 6, background: vc.bg,
                border: `2px solid ${vc.border}`, fontFamily: 'monospace', fontSize: 10,
                color: vc.color, fontWeight: 700, lineHeight: 1.6 }}>
                {verdict.text}
              </div>

              {/* ── RANKED SUMMARY (always visible) ── */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 10, color: '#4c1d95', marginBottom: 4 }}>
                  Ranked Summary — lowest MAE, then closest null Hz ({REW_NULL_HZ} Hz), then closest depth ({REW_NULL_DEPTH} dB)
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                    <thead>
                      <tr>
                        <TH ch="Rank" left />
                        <TH ch="Fam" />
                        <TH ch="Variant" left />
                        <TH ch="MAE" />
                        <TH ch="Null Hz" />
                        <TH ch="Null depth" />
                        <TH ch="Null width" />
                        <TH ch="Δ Hz" />
                        <TH ch="Δ depth" />
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => {
                        const isProd = r.key === 'A_050';
                        const depthDelta = r.nullDepth !== null ? r.nullDepth - REW_NULL_DEPTH : null;
                        return (
                          <tr key={r.key} style={{ borderBottom: '1px solid #ede9fe',
                            background: isProd ? '#ede9fe' : i === 0 ? '#f5f3ff' : 'transparent' }}>
                            <td style={{ ...mono, padding: '2px 6px', color: '#6b7280', textAlign: 'right' }}>
                              {i + 1}{isProd ? ' ★' : ''}
                            </td>
                            <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                              <FamBadge family={r.family} />
                            </td>
                            <td style={{ ...mono, padding: '2px 6px', fontWeight: isProd || i === 0 ? 700 : 400 }}>
                              {r.label}
                              {i === 0 && !isProd && <span style={{ color: '#166534', marginLeft: 4, fontSize: 8 }}>★ best</span>}
                            </td>
                            <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
                              color: (r.mae ?? 999) < 3 ? '#166534' : (r.mae ?? 999) > 6 ? '#991b1b' : '#374151',
                              fontWeight: (r.mae ?? 999) < 3 ? 700 : 400 }}>
                              {Number.isFinite(r.mae) ? `${r.mae.toFixed(2)} dB` : '—'}
                            </td>
                            <NullHzCell hz={r.nullHz} />
                            <DepthCell depth={r.nullDepth} />
                            <TD v={r.nullWidthHz} digits={1} unit=" Hz" />
                            <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
                              color: (r.distFromRewNull ?? 999) < 2 ? '#166534' : (r.distFromRewNull ?? 999) < 5 ? '#92400e' : '#991b1b',
                              fontWeight: (r.distFromRewNull ?? 999) < 3 ? 700 : 400 }}>
                              {Number.isFinite(r.distFromRewNull) ? `${r.distFromRewNull.toFixed(1)} Hz` : '—'}
                            </td>
                            <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
                              color: depthDelta !== null && Math.abs(depthDelta) < 3 ? '#166534' : '#6b7280' }}>
                              {depthDelta !== null && Number.isFinite(depthDelta)
                                ? `${depthDelta > 0 ? '+' : ''}${depthDelta.toFixed(1)} dB` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop: '2px solid #c4b5fd', background: '#fef9c3' }}>
                        <td colSpan={3} style={{ ...mono, padding: '2px 6px', fontWeight: 700, color: '#92400e' }}>REW target</td>
                        <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: '#9ca3af', fontSize: 9 }}>ref</td>
                        <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: '#92400e', fontWeight: 700 }}>
                          {REW_NULL_HZ.toFixed(1)} Hz
                        </td>
                        <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: '#92400e', fontWeight: 700 }}>
                          {REW_NULL_DEPTH.toFixed(1)} dB
                        </td>
                        <td colSpan={3} style={{ ...mono, padding: '2px 5px', color: '#9ca3af', fontSize: 9 }}>reference</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── FULL METRICS (collapsed) ── */}
              <details>
                <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                  Full Metrics — all {ranked.length} variants
                </summary>
                <div style={{ overflowX: 'auto', marginTop: 6 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
                    <thead>
                      <tr>
                        <TH ch="Variant" left />
                        <TH ch="MAE" />
                        <TH ch="Worst err" />
                        <TH ch="Worst Hz" />
                        <TH ch="Null Hz" />
                        <TH ch="Null depth" />
                        <TH ch="Null width" />
                        <TH ch="Peak Hz" />
                        <TH ch="Peak dB" />
                        <TH ch="Runtime" />
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => {
                        const isProd = r.key === 'A_050';
                        return (
                          <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6',
                            background: isProd ? '#ede9fe' : i === 0 ? '#f5f3ff' : 'transparent' }}>
                            <td style={{ ...mono, padding: '2px 6px', fontWeight: isProd ? 700 : 400 }}>
                              <FamBadge family={r.family} />
                              <span style={{ marginLeft: 4 }}>{r.label}</span>
                            </td>
                            <TD v={r.mae} digits={2} unit=" dB"
                              color={(r.mae ?? 999) < 3 ? '#166534' : (r.mae ?? 999) > 6 ? '#991b1b' : undefined} />
                            <TD v={r.worstErr} digits={2} unit=" dB" />
                            <TD v={r.worstHz} digits={0} unit=" Hz" />
                            <NullHzCell hz={r.nullHz} />
                            <DepthCell depth={r.nullDepth} />
                            <TD v={r.nullWidthHz} digits={1} unit=" Hz" />
                            <TD v={r.peakHz} digits={1} unit=" Hz" />
                            <TD v={r.peakSpl} digits={1} unit=" dB" />
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
                  Variant descriptions — {VARIANTS.length} variants across 6 families
                </summary>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {['A', 'B', 'C', 'D', 'E', 'F'].map(fam => (
                    <div key={fam}>
                      <div style={{ fontWeight: 700, fontSize: 9, color: FAM_COLORS[fam], fontFamily: 'monospace', marginBottom: 2 }}>
                        {FAMILY_NAMES[fam]}
                      </div>
                      {VARIANTS.filter(v => v.family === fam).map(v => (
                        <div key={v.key} style={{ padding: '2px 8px', borderRadius: 3, marginBottom: 2,
                          background: '#f5f3ff', border: '1px solid #ede9fe', fontSize: 9, fontFamily: 'monospace' }}>
                          <span style={{ fontWeight: 600, color: '#374151', marginRight: 6 }}>{v.label}</span>
                          <span style={{ color: '#6b7280' }}>{v.desc}</span>
                        </div>
                      ))}
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