/**
 * AcousticSolverShootoutBatch2.jsx
 * Diagnostic-only: Batch 2 Acoustic Solver Shootout Matrix
 *
 * Families tested:
 *   A — Modal resonance phase convention (7 variants)
 *   B — Reflection coherence weighting (6 variants)
 *   C — Modal transfer function (7 variants)
 *   D — Family scaling (7 variants)
 *   E — Q implementation (8 variants)
 *
 * All variants use the live production response as baseline (liveProductionData prop).
 * No production paths are modified.
 *
 * REW targets: null frequency 40.6 Hz, null depth -17.0 dB
 */

import React, { useState, useMemo } from 'react';
import { simulateBassResponseRewCore } from '../../../bass/core/rewBassEngine.js';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '../../../bass/core/modalCalculations.js';

// ─── Constants ─────────────────────────────────────────────────────────────────
const REW_NULL_HZ   = 40.6;
const REW_NULL_DB   = -17.0;
const FREQ_MIN      = 20;
const FREQ_MAX      = 200;
const SPEED_OF_SOUND = 343;

const FLAT_REW_CURVE = [
  { hz: 20,  db: 94 },
  { hz: 50,  db: 94 },
  { hz: 100, db: 94 },
  { hz: 200, db: 94 },
];

// Base production engine options (flat_rew_reference + full_field parity path)
const BASE_OPTIONS = {
  enableModes:                  true,
  enableReflections:            false,
  disableLateField:             true,
  rewParityModalPhase:          false,
  propagationPhaseScale:        0,
  disableModalPropagationPhase: true,
  pureDeterministicModalSum:    true,
  modalSourceReferenceMode:     'distance_normalized',
  modalGainScalar:              1.0,
  modalStorageMode:             'none',
  highOrderAxialScale:          1.0,
  rewParityModalMagnitudeScale: 1.0,
  debugModalPhaseConvention:    'normal',
  debugModalHSign:              'normal',
  modalCoherenceMode:           'coherent',
  debugMode200Multiplier:       1.0,
  debugReflectionOrder:         1,
  overrideConstantAxialQ:       false,
  overrideAbsorptionAxialQ:     false,
  debugDisableModalContribution: false,
  freqMinHz: FREQ_MIN,
  freqMaxHz: FREQ_MAX,
  smoothing: 'none',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function detectNullDepth(freqsHz, splDb) {
  let minDb = Infinity, minIdx = -1;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < 20 || freqsHz[i] > 80) continue;
    if (splDb[i] < minDb) { minDb = splDb[i]; minIdx = i; }
  }
  if (minIdx === -1) return { nullHz: null, nullDepthDb: null };
  const nullHz = freqsHz[minIdx];
  const loHz = Math.max(20, nullHz / Math.pow(2, 1.5));
  const hiHz = Math.min(200, nullHz * Math.pow(2, 1.5));
  let peakDb = -Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < loHz || freqsHz[i] > hiHz) continue;
    if (splDb[i] > peakDb) peakDb = splDb[i];
  }
  return { nullHz, nullDepthDb: minDb - peakDb };
}

function detectNullFromSeries(data) {
  if (!Array.isArray(data) || data.length === 0) return { nullHz: null, nullDepthDb: null };
  return detectNullDepth(data.map(p => p.frequency), data.map(p => p.spl));
}

function getSplAt(freqsHz, splDb, targetHz) {
  let best = null, bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = splDb[i]; }
  }
  return best;
}

function localDepthAt(freqsHz, splDb, targetHz) {
  const spl = getSplAt(freqsHz, splDb, targetHz);
  if (spl == null) return null;
  const loHz = Math.max(20, targetHz / Math.pow(2, 1.5));
  const hiHz = Math.min(200, targetHz * Math.pow(2, 1.5));
  let peak = -Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < loHz || freqsHz[i] > hiHz) continue;
    if (splDb[i] > peak) peak = splDb[i];
  }
  return peak === -Infinity ? null : spl - peak;
}

function calcMAE(freqsHz, splDb, refSplDb) {
  if (!refSplDb || refSplDb.length !== splDb.length) return null;
  let sum = 0, count = 0;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < 20 || freqsHz[i] > 120) continue;
    sum += Math.abs(splDb[i] - refSplDb[i]);
    count++;
  }
  return count > 0 ? sum / count : null;
}

// Coherent multi-sub sum → freqsHz + splDb arrays
function multiSubSum(subsForSimulation, roomDims, seatPos, extraOptions, surfaceAbsorption) {
  const opts = { ...BASE_OPTIONS, surfaceAbsorption, ...extraOptions };
  let freqsHz = null, sumRe = null, sumIm = null;
  for (const sub of subsForSimulation) {
    const r = simulateBassResponseRewCore(roomDims, seatPos, sub, FLAT_REW_CURVE, opts);
    if (!freqsHz) {
      freqsHz = r.freqsHz;
      sumRe = r.complexPressure.map(cp => cp.re);
      sumIm = r.complexPressure.map(cp => cp.im);
    } else {
      r.complexPressure.forEach((cp, i) => {
        if (Number.isFinite(cp.re) && Number.isFinite(cp.im)) {
          sumRe[i] += cp.re;
          sumIm[i] += cp.im;
        }
      });
    }
  }
  if (!freqsHz) return null;
  const splDb = sumRe.map((re, i) => {
    const im = sumIm[i];
    return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
  });
  return { freqsHz, splDb };
}

// ─── Low-level custom coherent sum with per-mode transform ─────────────────────
function buildLogAxis() {
  const freqs = [];
  const ppOct = 96;
  const total = Math.ceil(Math.log2(FREQ_MAX / FREQ_MIN) * ppOct);
  for (let i = 0; i <= total; i++) {
    const hz = FREQ_MIN * Math.pow(2, i / ppOct);
    if (hz > FREQ_MAX) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== FREQ_MAX) freqs.push(FREQ_MAX);
  return freqs;
}

// Custom solver: takes a modalTransformFn(re, im) → {re, im} and familyScaleFn(mode) → number
function runCustomSolver(roomDims, seatPos, sub, surfaceAbsorption, axialQ, modalTransformFn, familyScaleFn, qFn) {
  const { widthM, lengthM, heightM } = roomDims;
  const freqsHz = buildLogAxis();
  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: FREQ_MAX, c: SPEED_OF_SOUND });
  const modes = rawModes.map(mode => {
    const q = qFn ? qFn(mode, axialQ, roomDims, surfaceAbsorption) : (() => {
      const axes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
      const baseQ = axes === 1 ? axialQ : axes === 2 ? 3.9 : 2.5;
      const absQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq });
      return Math.max(1, Math.min(baseQ, absQ));
    })();
    return { ...mode, qValue: q };
  });

  const src = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z) };
  const lst = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z) };
  const dxd = src.x - lst.x, dyd = src.y - lst.y, dzd = src.z - lst.z;
  const distD = Math.max(0.01, Math.sqrt(dxd*dxd + dyd*dyd + dzd*dzd));
  const gainDb = sub?.tuning?.gainDb ?? 0;
  const directAmp = Math.pow(10, (94 - 20 * Math.log10(distD) + gainDb) / 20);

  const splDb = freqsHz.map(hz => {
    let sumRe = directAmp, sumIm = 0;
    modes.forEach(mode => {
      const srcShape = modeShapeValueLocal(mode, src.x, src.y, src.z, { widthM, lengthM, heightM });
      const lstShape = modeShapeValueLocal(mode, lst.x, lst.y, lst.z, { widthM, lengthM, heightM });
      const combined = srcShape * lstShape;
      const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = order >= 2 ? 0.50 : 1.0;
      const familyScale = familyScaleFn ? familyScaleFn(mode, hz) : 1.0;
      const { re: tRe, im: tIm } = resonantTransfer(hz, mode.freq, mode.qValue);
      const { re: mRe, im: mIm } = modalTransformFn ? modalTransformFn(tRe, tIm) : { re: tRe, im: tIm };
      const gain = directAmp * combined * orderWeight * familyScale;
      sumRe += gain * mRe;
      sumIm += gain * mIm;
    });
    return 20 * Math.log10(Math.max(Math.sqrt(sumRe * sumRe + sumIm * sumIm), 1e-10));
  });

  return { freqsHz, splDb };
}

// ─── Family A: Modal phase convention ─────────────────────────────────────────
const FAMILY_A_VARIANTS = [
  {
    id: 'A1', label: 'Current phase convention',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      multiSubSum(subs, roomDims, seatPos, { axialQ: axQ }, sa),
  },
  {
    id: 'A2', label: 'Invert modal imaginary sign',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      multiSubSum(subs, roomDims, seatPos, { axialQ: axQ, debugModalPhaseConvention: 'conjugate' }, sa),
  },
  {
    id: 'A3', label: 'Invert modal real sign',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      multiSubSum(subs, roomDims, seatPos, { axialQ: axQ, debugModalPhaseConvention: 'negative_conjugate' }, sa),
  },
  {
    id: 'A4', label: 'Invert both (180°)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      multiSubSum(subs, roomDims, seatPos, { axialQ: axQ, debugModalPhaseConvention: 'invert' }, sa),
  },
  {
    id: 'A5', label: 'Rotate modal +90° (Im→Re, Re→−Im)',
    fn: (roomDims, seatPos, subs, sa, axQ) => {
      const sub = subs[0];
      return runCustomSolver(roomDims, seatPos, sub, sa, axQ,
        (re, im) => ({ re: im, im: -re }), null, null);
    },
  },
  {
    id: 'A6', label: 'Rotate modal −90° (−Im→Re, Re→Im)',
    fn: (roomDims, seatPos, subs, sa, axQ) => {
      const sub = subs[0];
      return runCustomSolver(roomDims, seatPos, sub, sa, axQ,
        (re, im) => ({ re: -im, im: re }), null, null);
    },
  },
  {
    id: 'A7', label: 'Force purely real modal (Im=0)',
    fn: (roomDims, seatPos, subs, sa, axQ) => {
      const sub = subs[0];
      return runCustomSolver(roomDims, seatPos, sub, sa, axQ,
        (re, im) => ({ re, im: 0 }), null, null);
    },
  },
  {
    id: 'A8', label: 'Force purely imaginary modal (Re=0)',
    fn: (roomDims, seatPos, subs, sa, axQ) => {
      const sub = subs[0];
      return runCustomSolver(roomDims, seatPos, sub, sa, axQ,
        (re, im) => ({ re: 0, im }), null, null);
    },
  },
];

// ─── Family B: Reflection coherence weighting ──────────────────────────────────
const FAMILY_B_VARIANTS = [
  {
    id: 'B1', label: 'Current (reflections off)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      multiSubSum(subs, roomDims, seatPos, { axialQ: axQ }, sa),
  },
  {
    id: 'B2', label: 'Reflections ON, coherence = 0',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      multiSubSum(subs, roomDims, seatPos, { axialQ: axQ, enableReflections: true, disableReflectionCoherenceWeight: true }, sa),
  },
  {
    id: 'B3', label: 'Reflections ON, reflectionGainScale = 0.25',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      multiSubSum(subs, roomDims, seatPos, { axialQ: axQ, enableReflections: true, reflectionGainScale: 0.25 }, sa),
  },
  {
    id: 'B4', label: 'Reflections ON, reflectionGainScale = 0.50',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      multiSubSum(subs, roomDims, seatPos, { axialQ: axQ, enableReflections: true, reflectionGainScale: 0.50 }, sa),
  },
  {
    id: 'B5', label: 'Reflections ON, reflectionGainScale = 1.00',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      multiSubSum(subs, roomDims, seatPos, { axialQ: axQ, enableReflections: true, reflectionGainScale: 1.00 }, sa),
  },
  {
    id: 'B6', label: 'Reflections ON, phase jitter disabled',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      multiSubSum(subs, roomDims, seatPos, { axialQ: axQ, enableReflections: true, disableReflectionPhaseJitter: true }, sa),
  },
];

// ─── Family C: Modal transfer function ─────────────────────────────────────────
const FAMILY_C_VARIANTS = [
  {
    id: 'C1', label: 'Current modal transfer',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, null, null),
  },
  {
    id: 'C2', label: 'Classic 2nd-order resonator (Lorentzian)',
    fn: (roomDims, seatPos, subs, sa, axQ) => {
      const sub = subs[0];
      const { widthM, lengthM, heightM } = roomDims;
      const freqsHz = buildLogAxis();
      const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: FREQ_MAX, c: SPEED_OF_SOUND });
      const modes = rawModes.map(m => {
        const axes = (m.nx>0?1:0)+(m.ny>0?1:0)+(m.nz>0?1:0);
        const bQ = axes===1 ? axQ : axes===2 ? 3.9 : 2.5;
        const absQ = estimateModeQLocal({ roomDims, surfaceAbsorption: sa, f0: m.freq });
        return { ...m, qValue: Math.max(1, Math.min(bQ, absQ)) };
      });
      const src = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z) };
      const lst = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z) };
      const dx=src.x-lst.x,dy=src.y-lst.y,dz=src.z-lst.z;
      const dist = Math.max(0.01, Math.sqrt(dx*dx+dy*dy+dz*dz));
      const gainDb = sub?.tuning?.gainDb ?? 0;
      const dA = Math.pow(10, (94 - 20*Math.log10(dist) + gainDb)/20);
      const splDb = freqsHz.map(hz => {
        let sRe = dA, sIm = 0;
        modes.forEach(m => {
          const srcS = modeShapeValueLocal(m, src.x, src.y, src.z, { widthM, lengthM, heightM });
          const lstS = modeShapeValueLocal(m, lst.x, lst.y, lst.z, { widthM, lengthM, heightM });
          const combined = srcS * lstS;
          const order = Math.abs(m.nx)+Math.abs(m.ny)+Math.abs(m.nz);
          const ow = order >= 2 ? 0.50 : 1.0;
          const f0 = m.freq, Q = m.qValue;
          // Classic Lorentzian: H(f) = f0²/(f0²-f²+j*f*f0/Q)
          const num = f0 * f0;
          const denRe = f0*f0 - hz*hz;
          const denIm = hz * f0 / Q;
          const denMag2 = denRe*denRe + denIm*denIm;
          const mRe = (num * denRe) / denMag2;
          const mIm = -(num * denIm) / denMag2;
          const gain = dA * combined * ow;
          sRe += gain * mRe;
          sIm += gain * mIm;
        });
        return 20 * Math.log10(Math.max(Math.sqrt(sRe*sRe+sIm*sIm), 1e-10));
      });
      return { freqsHz, splDb };
    },
  },
  {
    id: 'C3', label: 'Magnitude-only transfer |H|',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ,
        (re, im) => { const m = Math.sqrt(re*re+im*im); return { re: m, im: 0 }; }, null, null),
  },
  {
    id: 'C4', label: 'Real-only transfer Re(H)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ,
        (re, im) => ({ re, im: 0 }), null, null),
  },
  {
    id: 'C5', label: 'Imaginary-only transfer Im(H)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ,
        (re, im) => ({ re: 0, im }), null, null),
  },
  {
    id: 'C6', label: 'Conjugated transfer H*',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ,
        (re, im) => ({ re, im: -im }), null, null),
  },
  {
    id: 'C7', label: 'Denominator sign inverted',
    fn: (roomDims, seatPos, subs, sa, axQ) => {
      const sub = subs[0];
      const { widthM, lengthM, heightM } = roomDims;
      const freqsHz = buildLogAxis();
      const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: FREQ_MAX, c: SPEED_OF_SOUND });
      const modes = rawModes.map(m => {
        const axes = (m.nx>0?1:0)+(m.ny>0?1:0)+(m.nz>0?1:0);
        const bQ = axes===1 ? axQ : axes===2 ? 3.9 : 2.5;
        const absQ = estimateModeQLocal({ roomDims, surfaceAbsorption: sa, f0: m.freq });
        return { ...m, qValue: Math.max(1, Math.min(bQ, absQ)) };
      });
      const src = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z) };
      const lst = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z) };
      const dx=src.x-lst.x,dy=src.y-lst.y,dz=src.z-lst.z;
      const dist = Math.max(0.01, Math.sqrt(dx*dx+dy*dy+dz*dz));
      const gainDb = sub?.tuning?.gainDb ?? 0;
      const dA = Math.pow(10, (94 - 20*Math.log10(dist) + gainDb)/20);
      const splDb = freqsHz.map(hz => {
        let sRe = dA, sIm = 0;
        modes.forEach(m => {
          const srcS = modeShapeValueLocal(m, src.x, src.y, src.z, { widthM, lengthM, heightM });
          const lstS = modeShapeValueLocal(m, lst.x, lst.y, lst.z, { widthM, lengthM, heightM });
          const combined = srcS * lstS;
          const order = Math.abs(m.nx)+Math.abs(m.ny)+Math.abs(m.nz);
          const ow = order >= 2 ? 0.50 : 1.0;
          const f0 = m.freq, Q = m.qValue;
          // Denominator sign inverted: H = 1 / (f²-f0²+j*f0*f/Q) (anticonventional)
          const denRe = hz*hz - f0*f0;
          const denIm = f0 * hz / Q;
          const denMag2 = denRe*denRe + denIm*denIm;
          const mRe =  denRe / denMag2;
          const mIm = -denIm / denMag2;
          const gain = dA * combined * ow;
          sRe += gain * mRe;
          sIm += gain * mIm;
        });
        return 20 * Math.log10(Math.max(Math.sqrt(sRe*sRe+sIm*sIm), 1e-10));
      });
      return { freqsHz, splDb };
    },
  },
];

// ─── Family D: Family scaling ───────────────────────────────────────────────────
function makeFamilyScale(ax, ta, ob, disableTangObliqueBelowHz = 0) {
  return (mode, hz) => {
    const axes = (mode.nx>0?1:0)+(mode.ny>0?1:0)+(mode.nz>0?1:0);
    if (axes === 1) return ax;
    if (axes === 2) return (disableTangObliqueBelowHz > 0 && hz < disableTangObliqueBelowHz) ? 0 : ta;
    return (disableTangObliqueBelowHz > 0 && hz < disableTangObliqueBelowHz) ? 0 : ob;
  };
}

const FAMILY_D_VARIANTS = [
  {
    id: 'D1', label: 'Current family scales (ax 1.0, ta 0.5, ob 0.5 order≥2)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, null, null),
  },
  {
    id: 'D2', label: 'Axial only (ta=0, ob=0)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, makeFamilyScale(1.0, 0, 0), null),
  },
  {
    id: 'D3', label: 'Ax 1.0 / Ta 0.5 / Ob 0.25',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, makeFamilyScale(1.0, 0.5, 0.25), null),
  },
  {
    id: 'D4', label: 'Ax 1.0 / Ta 0.35 / Ob 0.15',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, makeFamilyScale(1.0, 0.35, 0.15), null),
  },
  {
    id: 'D5', label: 'Ax 1.0 / Ta 0.25 / Ob 0.10',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, makeFamilyScale(1.0, 0.25, 0.10), null),
  },
  {
    id: 'D6', label: 'All scales 1.0 (no family weight)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, makeFamilyScale(1.0, 1.0, 1.0), null),
  },
  {
    id: 'D7', label: 'Tang+oblique disabled below 60 Hz',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, makeFamilyScale(1.0, 0.5, 0.5, 60), null),
  },
];

// ─── Family E: Q implementation ────────────────────────────────────────────────
function makeFixedQFn(fixedQ) {
  return () => fixedQ;
}

function freqDepQFn(mode, axialQ, roomDims, surfaceAbsorption) {
  // Frequency-dependent: scales Q linearly with mode frequency relative to 40 Hz
  const axes = (mode.nx>0?1:0)+(mode.ny>0?1:0)+(mode.nz>0?1:0);
  const baseQ = axes===1 ? axialQ : axes===2 ? 3.9 : 2.5;
  const freqScale = Math.max(0.5, Math.min(2.0, mode.freq / 40));
  return Math.max(1, baseQ * freqScale);
}

function typeDepQFn(mode, axialQ) {
  const axes = (mode.nx>0?1:0)+(mode.ny>0?1:0)+(mode.nz>0?1:0);
  if (axes === 1) return axialQ * 1.5;  // axial higher
  if (axes === 2) return 2.5;           // tangential lower
  return 1.5;                           // oblique lower
}

function sabineOnlyQFn(mode, axialQ, roomDims, surfaceAbsorption) {
  return Math.max(1, estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq }));
}

const FAMILY_E_VARIANTS = [
  {
    id: 'E1', label: 'Current Q (axial=4.0, tang=3.9, obliq=2.5, absorption-capped)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, null, null),
  },
  {
    id: 'E2', label: 'Fixed Q = 2 (all modes)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, null, makeFixedQFn(2)),
  },
  {
    id: 'E3', label: 'Fixed Q = 4 (all modes)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, null, makeFixedQFn(4)),
  },
  {
    id: 'E4', label: 'Fixed Q = 8 (all modes)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, null, makeFixedQFn(8)),
  },
  {
    id: 'E5', label: 'Fixed Q = 12 (all modes)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, null, makeFixedQFn(12)),
  },
  {
    id: 'E6', label: 'Frequency-dependent Q (scales with f/40)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, null, freqDepQFn),
  },
  {
    id: 'E7', label: 'Type-dependent Q (axial higher, tang/obliq lower)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, null, typeDepQFn),
  },
  {
    id: 'E8', label: 'Sabine-only Q (absorption only)',
    fn: (roomDims, seatPos, subs, sa, axQ) =>
      runCustomSolver(roomDims, seatPos, subs[0], sa, axQ, null, null, sabineOnlyQFn),
  },
];

const ALL_FAMILIES = [
  { family: 'A', label: 'Modal phase convention',      variants: FAMILY_A_VARIANTS },
  { family: 'B', label: 'Reflection coherence',        variants: FAMILY_B_VARIANTS },
  { family: 'C', label: 'Modal transfer function',     variants: FAMILY_C_VARIANTS },
  { family: 'D', label: 'Family scaling',              variants: FAMILY_D_VARIANTS },
  { family: 'E', label: 'Q implementation',            variants: FAMILY_E_VARIANTS },
];

// ─── Credible candidate check ──────────────────────────────────────────────────
function isCredible(row) {
  return (
    row.nullHz != null &&
    Math.abs(row.nullHz - REW_NULL_HZ) <= 1.5 &&
    row.nullDepthDb != null &&
    row.nullDepthDb >= -20 &&
    row.nullDepthDb <= -14
  );
}

// ─── Final verdict ─────────────────────────────────────────────────────────────
function buildFinalVerdict(rows) {
  const credible = rows.filter(isCredible);
  if (credible.length === 0) return 'None of these families explain the null. Deeper structural difference required.';
  const families = [...new Set(credible.map(r => r.family))];
  const familyNames = {
    A: 'Phase convention',
    B: 'Reflection coherence',
    C: 'Modal transfer',
    D: 'Family scaling',
    E: 'Q implementation',
  };
  const labels = families.map(f => familyNames[f] || f);
  if (labels.length === 1) return `${labels[0]} likely explains the null — credible candidates found in family ${families[0]}.`;
  return `Multiple families produce credible candidates: ${labels.join(', ')}. Interaction effect possible.`;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function AcousticSolverShootoutBatch2({
  roomDims,
  seatPos,
  subsForSimulation,
  subProductCurve,
  surfaceAbsorption,
  axialQ = 4.0,
  liveProductionData = null,
}) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [showCredibleOnly, setShowCredibleOnly] = useState(false);
  const [showTopN, setShowTopN] = useState(10);
  const [view, setView] = useState('ranked'); // 'ranked' | 'by-family' | 'credible'

  function runBatch() {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      if (!Array.isArray(subsForSimulation) || subsForSimulation.length === 0) {
        setError('No active subs in subsForSimulation.');
        setRunning(false);
        return;
      }
      if (!liveProductionData || liveProductionData.length === 0) {
        setError('No live production data — select a seat with simulation output.');
        setRunning(false);
        return;
      }

      const { nullHz: liveNullHz, nullDepthDb: liveNullDepth } = detectNullFromSeries(liveProductionData);

      // Build baseline freqsHz+splDb from first family A variant (= production)
      const baseline = FAMILY_A_VARIANTS[0].fn(roomDims, seatPos, subsForSimulation, surfaceAbsorption, axialQ);
      const baselineFreqs = baseline?.freqsHz;
      const baselineSpl   = baseline?.splDb;

      // Run all variants
      const rows = [];
      for (const { family, label: familyLabel, variants } of ALL_FAMILIES) {
        for (const v of variants) {
          try {
            const res = v.fn(roomDims, seatPos, subsForSimulation, surfaceAbsorption, axialQ);
            const freqsHz = res?.freqsHz;
            const splDb   = res?.splDb ?? res?.splDbRaw;
            if (!freqsHz || !splDb) {
              rows.push({ id: v.id, family, familyLabel, label: v.label,
                nullHz: null, nullDepthDb: null, dHz: null, dDb: null,
                spl406: null, depth406: null, spl298: null, depth298: null,
                mae: null, verdict: '⚠️ No data' });
              continue;
            }

            const { nullHz, nullDepthDb } = detectNullDepth(freqsHz, splDb);
            const dHz   = nullHz      != null ? nullHz      - REW_NULL_HZ : null;
            const dDb   = nullDepthDb != null ? nullDepthDb - REW_NULL_DB  : null;
            const spl406   = getSplAt(freqsHz, splDb, REW_NULL_HZ);
            const depth406 = localDepthAt(freqsHz, splDb, REW_NULL_HZ);
            const spl298   = getSplAt(freqsHz, splDb, 29.8);
            const depth298 = localDepthAt(freqsHz, splDb, 29.8);
            const mae      = (baselineFreqs && baselineSpl)
              ? calcMAE(freqsHz, splDb, baselineSpl) : null;

            const credible = isCredible({ nullHz, nullDepthDb });
            const verdict = (() => {
              if (nullHz == null) return '⚠️ No null';
              if (credible) return '✅ Credible';
              if (dHz != null && Math.abs(dHz) <= 1.5) return '⚠️ Freq ok, depth off';
              if (dDb != null && Math.abs(dDb) <= 4)   return '⚠️ Depth ok, freq off';
              return '❌ Both off';
            })();

            rows.push({
              id: v.id, family, familyLabel, label: v.label,
              nullHz, nullDepthDb, dHz, dDb,
              spl406, depth406, spl298, depth298,
              mae, verdict, credible,
            });
          } catch (e2) {
            rows.push({ id: v.id, family, familyLabel, label: v.label,
              nullHz: null, nullDepthDb: null, dHz: null, dDb: null,
              spl406: null, depth406: null, spl298: null, depth298: null,
              mae: null, verdict: `❌ Error: ${e2.message}` });
          }
        }
      }

      // Sort: closest null freq → closest null depth → lowest MAE
      const ranked = [...rows].sort((a, b) => {
        const freqA = a.dHz != null ? Math.abs(a.dHz) : 999;
        const freqB = b.dHz != null ? Math.abs(b.dHz) : 999;
        if (Math.abs(freqA - freqB) > 0.05) return freqA - freqB;
        const depA = a.dDb != null ? Math.abs(a.dDb) : 999;
        const depB = b.dDb != null ? Math.abs(b.dDb) : 999;
        if (Math.abs(depA - depB) > 0.1) return depA - depB;
        const maeA = a.mae != null ? a.mae : 999;
        const maeB = b.mae != null ? b.mae : 999;
        return maeA - maeB;
      });

      // Best per family
      const bestPerFamily = {};
      for (const row of ranked) {
        if (!bestPerFamily[row.family]) bestPerFamily[row.family] = row;
      }

      const finalVerdict = buildFinalVerdict(rows);

      setResults({ rows, ranked, bestPerFamily, finalVerdict, liveNullHz, liveNullDepth });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const fmt  = (v, d = 1) => v == null ? '—' : Number(v).toFixed(d);
  const fmtD = (v) => { if (v == null) return '—'; return `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}`; };

  const displayRows = useMemo(() => {
    if (!results) return [];
    if (view === 'credible') return results.ranked.filter(r => r.credible);
    if (view === 'by-family') return Object.values(results.bestPerFamily);
    return results.ranked.slice(0, showTopN);
  }, [results, view, showTopN]);

  return (
    <details className="border border-blue-400 rounded bg-blue-50 mt-4">
      <summary className="px-3 py-2 text-xs font-semibold cursor-pointer select-none text-blue-900">
        🔬 Acoustic Solver Shootout — Batch 2 (Phase / Reflection / Transfer / Family / Q)
      </summary>

      <div className="px-4 pb-4 pt-2 space-y-3">
        <p className="text-xs text-blue-800">
          Diagnostic only. REW target: <strong>40.6 Hz / −17.0 dB depth</strong>.
          {' '}All variants use the live production response as baseline.
          Null depth = null dB minus local peak within ±1.5 octaves.
          Families: A=Phase, B=Reflections, C=Transfer, D=FamilyScale, E=Q.
        </p>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={runBatch}
            disabled={running}
            className="px-3 py-1 text-xs bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
          >
            {running ? 'Running…' : 'Run Batch 2'}
          </button>

          {results && (
            <>
              <div className="flex gap-1 text-xs">
                {['ranked', 'by-family', 'credible'].map(v => (
                  <button key={v} onClick={() => setView(v)}
                    className={`px-2 py-1 rounded border text-xs ${view === v ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-blue-800 border-blue-300 hover:bg-blue-100'}`}>
                    {v === 'ranked' ? `Top ${showTopN}` : v === 'by-family' ? 'Best per family' : 'Credible only'}
                  </button>
                ))}
              </div>
              {view === 'ranked' && (
                <select value={showTopN} onChange={e => setShowTopN(Number(e.target.value))}
                  className="h-6 text-xs border border-blue-300 rounded px-1 bg-white text-blue-800">
                  {[5, 10, 15, 20, 99].map(n => <option key={n} value={n}>{n === 99 ? 'All' : `Top ${n}`}</option>)}
                </select>
              )}
            </>
          )}
        </div>

        {error && <p className="text-xs text-red-700 font-mono border border-red-300 bg-red-50 rounded p-2">Error: {error}</p>}

        {results && (
          <div className="space-y-3">

            {/* Live baseline summary */}
            <div className="p-2 rounded border border-blue-300 bg-white text-xs font-mono text-blue-900">
              <span className="font-bold">Live production null: </span>
              {fmt(results.liveNullHz)} Hz / {fmt(results.liveNullDepth)} dB depth
              {'  '}|{'  '}
              <span className="font-bold">REW target: </span>
              {REW_NULL_HZ} Hz / {REW_NULL_DB} dB
            </div>

            {/* Variant table */}
            {displayRows.length === 0 ? (
              <div className="p-2 text-xs text-blue-700 font-mono">No variants match the selected filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="bg-blue-200 text-blue-900">
                      <th className="text-left px-2 py-1 border border-blue-300 whitespace-nowrap">ID</th>
                      <th className="text-left px-2 py-1 border border-blue-300 whitespace-nowrap">Variant</th>
                      <th className="px-2 py-1 border border-blue-300 whitespace-nowrap">Null Hz</th>
                      <th className="px-2 py-1 border border-blue-300 whitespace-nowrap">Depth dB</th>
                      <th className="px-2 py-1 border border-blue-300 whitespace-nowrap">Δ Hz</th>
                      <th className="px-2 py-1 border border-blue-300 whitespace-nowrap">Δ dB</th>
                      <th className="px-2 py-1 border border-blue-300 whitespace-nowrap">40.6Hz SPL</th>
                      <th className="px-2 py-1 border border-blue-300 whitespace-nowrap">40.6Hz depth</th>
                      <th className="px-2 py-1 border border-blue-300 whitespace-nowrap">29.8Hz SPL</th>
                      <th className="px-2 py-1 border border-blue-300 whitespace-nowrap">29.8Hz depth</th>
                      <th className="px-2 py-1 border border-blue-300 whitespace-nowrap">MAE</th>
                      <th className="text-left px-2 py-1 border border-blue-300 whitespace-nowrap">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* REW reference row */}
                    <tr className="bg-green-100 text-green-900 font-semibold">
                      <td className="px-2 py-1 border border-blue-200">REF</td>
                      <td className="px-2 py-1 border border-blue-200">REW Reference Target</td>
                      <td className="text-center px-2 py-1 border border-blue-200">{REW_NULL_HZ}</td>
                      <td className="text-center px-2 py-1 border border-blue-200">{REW_NULL_DB}</td>
                      <td className="text-center px-2 py-1 border border-blue-200">—</td>
                      <td className="text-center px-2 py-1 border border-blue-200">—</td>
                      <td className="text-center px-2 py-1 border border-blue-200">—</td>
                      <td className="text-center px-2 py-1 border border-blue-200">—</td>
                      <td className="text-center px-2 py-1 border border-blue-200">—</td>
                      <td className="text-center px-2 py-1 border border-blue-200">—</td>
                      <td className="text-center px-2 py-1 border border-blue-200">—</td>
                      <td className="px-2 py-1 border border-blue-200">Target</td>
                    </tr>
                    {displayRows.map((row, i) => {
                      const freqOk  = row.dHz != null && Math.abs(row.dHz) <= 1.5;
                      const depthOk = row.dDb != null && Math.abs(row.dDb) <= 4;
                      const bg = row.credible ? 'bg-green-50' : i === 0 ? 'bg-blue-50' : '';
                      return (
                        <tr key={row.id} className={bg}>
                          <td className="px-2 py-1 border border-blue-100 font-mono text-blue-700">{row.id}</td>
                          <td className="px-2 py-1 border border-blue-100 max-w-xs whitespace-nowrap overflow-hidden text-ellipsis" title={row.label}>{row.label}</td>
                          <td className="text-center px-2 py-1 border border-blue-100">{fmt(row.nullHz)}</td>
                          <td className="text-center px-2 py-1 border border-blue-100">{fmt(row.nullDepthDb)}</td>
                          <td className={`text-center px-2 py-1 border border-blue-100 font-bold ${freqOk ? 'text-green-700' : 'text-red-700'}`}>{fmtD(row.dHz)}</td>
                          <td className={`text-center px-2 py-1 border border-blue-100 font-bold ${depthOk ? 'text-green-700' : 'text-red-700'}`}>{fmtD(row.dDb)}</td>
                          <td className="text-center px-2 py-1 border border-blue-100">{fmt(row.spl406)}</td>
                          <td className="text-center px-2 py-1 border border-blue-100">{fmt(row.depth406)}</td>
                          <td className="text-center px-2 py-1 border border-blue-100">{fmt(row.spl298)}</td>
                          <td className="text-center px-2 py-1 border border-blue-100">{fmt(row.depth298)}</td>
                          <td className="text-center px-2 py-1 border border-blue-100">{row.mae != null ? fmt(row.mae) + ' dB' : '—'}</td>
                          <td className="px-2 py-1 border border-blue-100 whitespace-nowrap">{row.verdict}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Credible candidates summary */}
            {(() => {
              const cred = results.rows.filter(r => r.credible);
              return (
                <div className={`p-2 rounded border text-xs font-mono ${cred.length > 0 ? 'bg-green-50 border-green-400 text-green-900' : 'bg-gray-50 border-gray-300 text-gray-700'}`}>
                  <span className="font-bold">Credible candidates (±1.5 Hz, −14 to −20 dB): </span>
                  {cred.length === 0
                    ? 'None found.'
                    : cred.map(r => `${r.id} (${r.label})`).join(', ')}
                </div>
              );
            })()}

            {/* Best per family */}
            <div className="p-2 rounded border border-blue-300 bg-white text-xs font-mono text-blue-900">
              <div className="font-bold mb-1">Best per family (closest null freq):</div>
              <table className="border-collapse w-full">
                <thead>
                  <tr style={{ fontSize: 9 }} className="text-blue-700">
                    <th className="text-left pr-3">Family</th>
                    <th className="pr-3">Best variant</th>
                    <th className="pr-3">Null Hz</th>
                    <th className="pr-3">Depth dB</th>
                    <th className="pr-3">Δ Hz</th>
                    <th className="pr-3">Credible?</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_FAMILIES.map(({ family, label: fLabel }) => {
                    const best = results.bestPerFamily[family];
                    if (!best) return null;
                    return (
                      <tr key={family}>
                        <td className="pr-3 font-bold text-blue-800">{family}: {fLabel}</td>
                        <td className="pr-3">{best.id} — {best.label}</td>
                        <td className="pr-3">{fmt(best.nullHz)}</td>
                        <td className="pr-3">{fmt(best.nullDepthDb)}</td>
                        <td className={`pr-3 font-bold ${best.dHz != null && Math.abs(best.dHz) <= 1.5 ? 'text-green-700' : 'text-red-700'}`}>{fmtD(best.dHz)}</td>
                        <td>{best.credible ? '✅ Yes' : '❌ No'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Final verdict */}
            <div className="p-3 rounded border border-blue-500 bg-blue-100 text-xs text-blue-900">
              <span className="font-bold">Final verdict: </span>
              {results.finalVerdict}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}