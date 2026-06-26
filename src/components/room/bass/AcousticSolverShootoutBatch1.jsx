/**
 * AcousticSolverShootoutBatch1.jsx
 * Diagnostic-only: Batch 1 Acoustic Solver Shootout
 *
 * Tests 6 variants across summation method (Family C) and damping (Family A).
 * Production solver (simulateBassResponseRewCore) is called read-only via safe option overrides.
 * No changes to rewBassEngine.js or BassResponse.jsx.
 *
 * REW reference targets:
 *   Null frequency : 40.6 Hz
 *   Null depth     : -17.0 dB
 */

import React, { useState } from 'react';
import { simulateBassResponseRewCore } from '../../../bass/core/rewBassEngine.js';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '../../../bass/core/modalCalculations.js';

// ─── REW Reference ───────────────────────────────────────────────────────────
const REW_NULL_HZ  = 40.6;
const REW_NULL_DB  = -17.0;
const FREQ_MIN     = 20;
const FREQ_MAX     = 200;
const SPEED_OF_SOUND = 343;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLogAxis(minHz = FREQ_MIN, maxHz = FREQ_MAX, ppOct = 96) {
  const freqs = [];
  const octaves = Math.log2(maxHz / minHz);
  const total = Math.ceil(octaves * ppOct);
  for (let i = 0; i <= total; i++) {
    const hz = minHz * Math.pow(2, i / ppOct);
    if (hz > maxHz) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== maxHz) freqs.push(maxHz);
  return freqs;
}

function detectNull(freqsHz, splDb) {
  // Find the global minimum in 20–80 Hz range
  let minDb = Infinity;
  let minHz = null;
  for (let i = 0; i < freqsHz.length; i++) {
    const hz = freqsHz[i];
    if (hz < 20 || hz > 80) continue;
    if (splDb[i] < minDb) {
      minDb = splDb[i];
      minHz = hz;
    }
  }
  return { nullHz: minHz, nullDb: minDb };
}

function detectPeak(freqsHz, splDb) {
  let maxDb = -Infinity;
  let maxHz = null;
  for (let i = 0; i < freqsHz.length; i++) {
    const hz = freqsHz[i];
    if (hz < 20 || hz > 150) continue;
    if (splDb[i] > maxDb) {
      maxDb = splDb[i];
      maxHz = hz;
    }
  }
  return { peakHz: maxHz, peakDb: maxDb };
}

function calcMAE(freqsHz, splDb, refSplDb) {
  // MAE against production baseline over 20–120 Hz
  if (!refSplDb || refSplDb.length !== splDb.length) return null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < 20 || freqsHz[i] > 120) continue;
    sum += Math.abs(splDb[i] - refSplDb[i]);
    count++;
  }
  return count > 0 ? sum / count : null;
}

function calcWorstError(freqsHz, splDb, refSplDb) {
  if (!refSplDb || refSplDb.length !== splDb.length) return null;
  let worst = 0;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < 20 || freqsHz[i] > 120) continue;
    const e = Math.abs(splDb[i] - refSplDb[i]);
    if (e > worst) worst = e;
  }
  return worst;
}

// ─── Incoherent Energy Sum runner ────────────────────────────────────────────
// Replicates the production mode-loop but accumulates |P_n|² instead of complex sum.
// Direct path uses the same complex amplitude as production.
function runEnergySum(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const freqsHz = buildLogAxis();

  // Build modes with same Q logic as production
  const modes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: FREQ_MAX, c: SPEED_OF_SOUND })
    .map((mode) => {
      const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
      const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? 3.9 : 2.5;
      const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq });
      return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
    });

  const source = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z) };
  const seat   = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z) };
  const gainDb = sub?.tuning?.gainDb ?? 0;

  const splDb = freqsHz.map((hz) => {
    // Direct pressure magnitude (same formula as production)
    const dx = source.x - seat.x;
    const dy = source.y - seat.y;
    const dz = source.z - seat.z;
    const dist = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
    const curveDb = 90; // flat reference — we only care about relative null depth
    const distLossDb = -20 * Math.log10(dist);
    const directAmp = Math.pow(10, (curveDb + distLossDb + gainDb) / 20);

    // Modal source amplitude (distance_normalized, matching production default)
    const modalSrcAmp = directAmp; // direct amplitude already carries distance loss

    // Incoherent energy accumulation
    let energySum = directAmp * directAmp; // direct energy

    modes.forEach((mode) => {
      const srcCoup = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
      const rcvCoup = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
      const combined = srcCoup * rcvCoup;
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const { re, im } = resonantTransfer(hz, mode.freq, mode.qValue);
      const gain = modalSrcAmp * combined * orderWeight;
      const contribMag = gain * Math.sqrt(re * re + im * im);
      energySum += contribMag * contribMag;
    });

    return 20 * Math.log10(Math.max(Math.sqrt(energySum), 1e-10));
  });

  return { freqsHz, splDb };
}

// ─── RMS Pressure Sum runner ──────────────────────────────────────────────────
// Computes RMS of all modal contribution magnitudes + direct, no phase.
function runRmsSum(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const freqsHz = buildLogAxis();

  const modes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: FREQ_MAX, c: SPEED_OF_SOUND })
    .map((mode) => {
      const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
      const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? 3.9 : 2.5;
      const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq });
      return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
    });

  const source = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z) };
  const seat   = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z) };
  const gainDb = sub?.tuning?.gainDb ?? 0;

  const splDb = freqsHz.map((hz) => {
    const dx = source.x - seat.x;
    const dy = source.y - seat.y;
    const dz = source.z - seat.z;
    const dist = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
    const curveDb = 90;
    const distLossDb = -20 * Math.log10(dist);
    const directAmp = Math.pow(10, (curveDb + distLossDb + gainDb) / 20);
    const modalSrcAmp = directAmp;

    // Collect all magnitudes
    const mags = [directAmp];

    modes.forEach((mode) => {
      const srcCoup = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
      const rcvCoup = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
      const combined = srcCoup * rcvCoup;
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const { re, im } = resonantTransfer(hz, mode.freq, mode.qValue);
      const gain = modalSrcAmp * combined * orderWeight;
      mags.push(Math.abs(gain * Math.sqrt(re * re + im * im)));
    });

    const sumSq = mags.reduce((s, m) => s + m * m, 0);
    const rms = Math.sqrt(sumSq / mags.length);
    return 20 * Math.log10(Math.max(rms, 1e-10));
  });

  return { freqsHz, splDb };
}

// ─── Frequency-dependent Sabine Q runner ─────────────────────────────────────
// Uses estimateModeQLocal per-mode only (bypasses estimateModeQByType base Q).
function runFreqDepSabineQ(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption) {
  // Re-run production engine but force overrideAbsorptionAxialQ=true (already wired in engine)
  return simulateBassResponseRewCore(
    roomDims,
    seatPos,
    sub,
    subProductCurve,
    {
      enableModes: true,
      enableReflections: false,
      disableLateField: true,
      freqMinHz: FREQ_MIN,
      freqMaxHz: FREQ_MAX,
      rewParityModalPhase: true,
      overrideAbsorptionAxialQ: true,   // axial modes use absorptionQ directly
      surfaceAbsorption,
      pureDeterministicModalSum: true,
    }
  );
}

// ─── Production baseline runner ──────────────────────────────────────────────
function runProductionBaseline(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, axialQ) {
  return simulateBassResponseRewCore(
    roomDims,
    seatPos,
    sub,
    subProductCurve,
    {
      enableModes: true,
      enableReflections: false,
      disableLateField: true,
      freqMinHz: FREQ_MIN,
      freqMaxHz: FREQ_MAX,
      rewParityModalPhase: true,
      axialQ,
      surfaceAbsorption,
      pureDeterministicModalSum: true,
    }
  );
}

// ─── Fixed Q runner ───────────────────────────────────────────────────────────
function runFixedQ(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, fixedQValue) {
  // Inject overrideConstantAxialQ=true with the desired Q, and a known axialQ
  // For all modes fixed Q: we use a custom path via the parity field solver approach
  // Since the engine's axialQ only controls axial modes, we build a local runner.
  const { widthM, lengthM, heightM } = roomDims;
  const freqsHz = buildLogAxis();

  const modes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: FREQ_MAX, c: SPEED_OF_SOUND })
    .map((mode) => ({ ...mode, qValue: fixedQValue })); // force all modes to fixed Q

  const source = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z) };
  const seat   = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z) };
  const gainDb = sub?.tuning?.gainDb ?? 0;

  const splDb = freqsHz.map((hz) => {
    const dx = source.x - seat.x;
    const dy = source.y - seat.y;
    const dz = source.z - seat.z;
    const dist = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
    const curveDb = 90;
    const distLossDb = -20 * Math.log10(dist);
    const directAmp  = Math.pow(10, (curveDb + distLossDb + gainDb) / 20);
    const modalSrcAmp = directAmp;

    let sumRe = directAmp; // direct path (phase = 0 for flat ref)
    let sumIm = 0;

    modes.forEach((mode) => {
      const srcCoup = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM });
      const rcvCoup = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
      const combined = srcCoup * rcvCoup;
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const { re, im } = resonantTransfer(hz, mode.freq, fixedQValue);
      const gain = modalSrcAmp * combined * orderWeight;
      sumRe += gain * re;
      sumIm += gain * im;
    });

    return 20 * Math.log10(Math.max(Math.sqrt(sumRe*sumRe + sumIm*sumIm), 1e-10));
  });

  return { freqsHz, splDb };
}

// ─── Verdict helper ──────────────────────────────────────────────────────────
function shortVerdict(nullHz, nullDb) {
  const dHz = nullHz != null ? (nullHz - REW_NULL_HZ).toFixed(1) : '?';
  const dDb = nullDb != null ? (nullDb - REW_NULL_DB).toFixed(1) : '?';
  const depthOk = nullDb != null && Math.abs(nullDb - REW_NULL_DB) < 10;
  const freqOk  = nullHz != null && Math.abs(nullHz - REW_NULL_HZ) < 2;
  if (depthOk && freqOk) return '✅ Close to REW';
  if (depthOk)           return '⚠️ Depth ok, freq off';
  if (freqOk)            return '⚠️ Freq ok, depth shallow';
  return '❌ Both off';
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AcousticSolverShootoutBatch1({
  roomDims,
  seatPos,
  sub,
  subProductCurve,
  surfaceAbsorption,
  axialQ = 4.0,
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  function runBatch() {
    setRunning(true);
    setError(null);
    try {
      const rows = [];

      // ── V1: Production coherent complex sum ──
      const v1 = runProductionBaseline(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, axialQ);
      const { nullHz: v1NHz, nullDb: v1NDb } = detectNull(v1.freqsHz, v1.splDbRaw);
      const baseSpl = v1.splDbRaw; // reference for MAE
      rows.push({
        name: 'V1 — Coherent complex (production)',
        nullHz: v1NHz,
        nullDb: v1NDb,
        dHz: v1NHz != null ? (v1NHz - REW_NULL_HZ) : null,
        dDb: v1NDb != null ? (v1NDb - REW_NULL_DB) : null,
        mae: null,
        worst: null,
        verdict: shortVerdict(v1NHz, v1NDb),
        isBaseline: true,
      });

      // ── V2: Incoherent energy sum ──
      const v2 = runEnergySum(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, axialQ);
      const { nullHz: v2NHz, nullDb: v2NDb } = detectNull(v2.freqsHz, v2.splDb);
      rows.push({
        name: 'V2 — Incoherent energy sum',
        nullHz: v2NHz,
        nullDb: v2NDb,
        dHz: v2NHz != null ? (v2NHz - REW_NULL_HZ) : null,
        dDb: v2NDb != null ? (v2NDb - REW_NULL_DB) : null,
        mae:   calcMAE(v2.freqsHz, v2.splDb, baseSpl),
        worst: calcWorstError(v2.freqsHz, v2.splDb, baseSpl),
        verdict: shortVerdict(v2NHz, v2NDb),
      });

      // ── V3: RMS pressure sum ──
      const v3 = runRmsSum(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, axialQ);
      const { nullHz: v3NHz, nullDb: v3NDb } = detectNull(v3.freqsHz, v3.splDb);
      rows.push({
        name: 'V3 — RMS pressure sum',
        nullHz: v3NHz,
        nullDb: v3NDb,
        dHz: v3NHz != null ? (v3NHz - REW_NULL_HZ) : null,
        dDb: v3NDb != null ? (v3NDb - REW_NULL_DB) : null,
        mae:   calcMAE(v3.freqsHz, v3.splDb, baseSpl),
        worst: calcWorstError(v3.freqsHz, v3.splDb, baseSpl),
        verdict: shortVerdict(v3NHz, v3NDb),
      });

      // ── V4: Baseline Q (same as V1, explicit label) ──
      rows.push({
        name: 'V4 — Baseline Q (same as V1)',
        nullHz: v1NHz,
        nullDb: v1NDb,
        dHz: v1NHz != null ? (v1NHz - REW_NULL_HZ) : null,
        dDb: v1NDb != null ? (v1NDb - REW_NULL_DB) : null,
        mae: null,
        worst: null,
        verdict: '= V1 (damping baseline)',
        isBaseline: true,
      });

      // ── V5: Fixed Q = 1.0 (maximally damped) ──
      const v5 = runFixedQ(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, 1.0);
      const { nullHz: v5NHz, nullDb: v5NDb } = detectNull(v5.freqsHz, v5.splDb);
      rows.push({
        name: 'V5 — Fixed Q = 1.0 (max damping)',
        nullHz: v5NHz,
        nullDb: v5NDb,
        dHz: v5NHz != null ? (v5NHz - REW_NULL_HZ) : null,
        dDb: v5NDb != null ? (v5NDb - REW_NULL_DB) : null,
        mae:   calcMAE(v5.freqsHz, v5.splDb, baseSpl),
        worst: calcWorstError(v5.freqsHz, v5.splDb, baseSpl),
        verdict: shortVerdict(v5NHz, v5NDb),
      });

      // ── V6: Frequency-dependent Sabine Q ──
      const v6 = runFreqDepSabineQ(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption);
      const { nullHz: v6NHz, nullDb: v6NDb } = detectNull(v6.freqsHz, v6.splDbRaw);
      rows.push({
        name: 'V6 — Freq-dependent Sabine Q',
        nullHz: v6NHz,
        nullDb: v6NDb,
        dHz: v6NHz != null ? (v6NHz - REW_NULL_HZ) : null,
        dDb: v6NDb != null ? (v6NDb - REW_NULL_DB) : null,
        mae:   calcMAE(v6.freqsHz, v6.splDbRaw, baseSpl),
        worst: calcWorstError(v6.freqsHz, v6.splDbRaw, baseSpl),
        verdict: shortVerdict(v6NHz, v6NDb),
      });

      // Derive overall diagnosis
      const candidates = rows.filter(r =>
        r.nullHz != null &&
        r.nullDb != null &&
        Math.abs(r.nullDb - REW_NULL_DB) < 10 &&
        Math.abs(r.nullHz - REW_NULL_HZ) < 2
      );

      let diagnosis = '';
      const summationCandidates = candidates.filter(r => ['V2 — Incoherent energy sum', 'V3 — RMS pressure sum'].includes(r.name));
      const dampingCandidates   = candidates.filter(r => ['V5 — Fixed Q = 1.0 (max damping)', 'V6 — Freq-dependent Sabine Q'].includes(r.name));

      if (summationCandidates.length > 0 && dampingCandidates.length === 0) {
        diagnosis = 'Likely presentation averaging, not solver physics — summation method hides the null.';
      } else if (dampingCandidates.length > 0 && summationCandidates.length === 0) {
        diagnosis = 'Likely modal damping or boundary loss mismatch — Q adjustment moves null depth toward REW.';
      } else if (summationCandidates.length > 0 && dampingCandidates.length > 0) {
        diagnosis = 'Both summation method and damping produce candidates — inspect further.';
      } else {
        diagnosis = 'No Batch 1 variant matches REW. Current solver family is structurally different — inspect modal formulation directly.';
      }

      setResults({ rows, diagnosis });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const fmt = (v, dec = 1) => (v == null ? '—' : Number(v).toFixed(dec));
  const fmtDelta = (v) => {
    if (v == null) return '—';
    const s = v > 0 ? '+' : '';
    return `${s}${Number(v).toFixed(1)}`;
  };

  return (
    <details className="border border-yellow-400 rounded bg-yellow-50 mt-4">
      <summary
        className="px-3 py-2 text-xs font-semibold cursor-pointer select-none text-yellow-800"
        onClick={() => setOpen(o => !o)}
      >
        🔬 Acoustic Solver Shootout — Batch 1 (Summation &amp; Damping)
      </summary>

      <div className="px-4 pb-4 pt-2 space-y-3">
        <p className="text-xs text-yellow-700">
          Diagnostic only — production solver unchanged. REW target: null @ <strong>40.6 Hz / −17.0 dB</strong>.
          Production null: ~41.5 Hz / ~−53.7 dB.
        </p>

        <button
          onClick={runBatch}
          disabled={running}
          className="px-3 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run Batch 1'}
        </button>

        {error && (
          <p className="text-xs text-red-600 font-mono">Error: {error}</p>
        )}

        {results && (
          <div className="space-y-3">
            {/* Results table */}
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-yellow-200 text-yellow-900">
                    <th className="text-left px-2 py-1 border border-yellow-300">Variant</th>
                    <th className="px-2 py-1 border border-yellow-300">Null Hz</th>
                    <th className="px-2 py-1 border border-yellow-300">Null dB</th>
                    <th className="px-2 py-1 border border-yellow-300">Δ Hz</th>
                    <th className="px-2 py-1 border border-yellow-300">Δ dB</th>
                    <th className="px-2 py-1 border border-yellow-300">MAE</th>
                    <th className="px-2 py-1 border border-yellow-300">Worst</th>
                    <th className="text-left px-2 py-1 border border-yellow-300">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {/* REW reference row */}
                  <tr className="bg-green-100 text-green-900 font-semibold">
                    <td className="px-2 py-1 border border-yellow-300">REW Reference</td>
                    <td className="text-center px-2 py-1 border border-yellow-300">{REW_NULL_HZ}</td>
                    <td className="text-center px-2 py-1 border border-yellow-300">{REW_NULL_DB}</td>
                    <td className="text-center px-2 py-1 border border-yellow-300">—</td>
                    <td className="text-center px-2 py-1 border border-yellow-300">—</td>
                    <td className="text-center px-2 py-1 border border-yellow-300">—</td>
                    <td className="text-center px-2 py-1 border border-yellow-300">—</td>
                    <td className="px-2 py-1 border border-yellow-300">Target</td>
                  </tr>
                  {results.rows.map((row, i) => {
                    const depthClose = row.dDb != null && Math.abs(row.dDb) < 10;
                    const freqClose  = row.dHz != null && Math.abs(row.dHz) < 2;
                    const rowBg = depthClose && freqClose
                      ? 'bg-green-50'
                      : row.isBaseline
                        ? 'bg-yellow-50'
                        : '';
                    return (
                      <tr key={i} className={rowBg}>
                        <td className="px-2 py-1 border border-yellow-200 font-medium">{row.name}</td>
                        <td className="text-center px-2 py-1 border border-yellow-200">{fmt(row.nullHz)}</td>
                        <td className="text-center px-2 py-1 border border-yellow-200">{fmt(row.nullDb)}</td>
                        <td className={`text-center px-2 py-1 border border-yellow-200 ${freqClose ? 'text-green-700 font-bold' : 'text-red-700'}`}>
                          {fmtDelta(row.dHz)}
                        </td>
                        <td className={`text-center px-2 py-1 border border-yellow-200 ${depthClose ? 'text-green-700 font-bold' : 'text-red-700'}`}>
                          {fmtDelta(row.dDb)}
                        </td>
                        <td className="text-center px-2 py-1 border border-yellow-200">{row.mae != null ? fmt(row.mae) + ' dB' : '—'}</td>
                        <td className="text-center px-2 py-1 border border-yellow-200">{row.worst != null ? fmt(row.worst) + ' dB' : '—'}</td>
                        <td className="px-2 py-1 border border-yellow-200">{row.verdict}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Diagnosis box */}
            <div className="p-3 bg-yellow-100 border border-yellow-400 rounded text-xs">
              <span className="font-semibold text-yellow-900">Batch 1 Diagnosis: </span>
              <span className="text-yellow-800">{results.diagnosis}</span>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}