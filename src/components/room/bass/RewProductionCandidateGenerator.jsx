// RewProductionCandidateGenerator.jsx
// Diagnostic-only: generates, scores and ranks complete candidate REW engines
// by combining all previously discovered winning dimensions in one automated sweep.
// No production engine changes. No project state writes. No graph changes.

import React, { useState, useCallback, useRef } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '../../../bass/core/modalCalculations.js';

// ── REW benchmark ─────────────────────────────────────────────────────────────
const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 },
  { hz: 25,  db: 93.6 },
  { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 },
  { hz: 50,  db: 91.8 },
  { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 },
  { hz: 70,  db: 86.8 },
  { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 },
  { hz: 100, db: 98.3 },
  { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 },
  { hz: 180, db: 99.3 },
  { hz: 200, db: 99.5 },
];

const BANDS = [
  { label: '20–40',   lo: 20,  hi: 40  },
  { label: '40–80',   lo: 40,  hi: 80  },
  { label: '80–120',  lo: 80,  hi: 120 },
  { label: '120–200', lo: 120, hi: 200 },
];

const FLAT_SOURCE_DB = 94;
const C = 343;

// ── Dimension grids ───────────────────────────────────────────────────────────

const PARTICIPATION_MODES = [
  { id: 'all',    label: 'All modes' },
  { id: 'top3',   label: 'Top 3',  topN: 3 },
  { id: 'top5',   label: 'Top 5',  topN: 5 },
  { id: 'bw1',    label: '±1 BW',  bwFactor: 1.0 },
  { id: 'bw2',    label: '±2 BW',  bwFactor: 2.0 },
];

const COUPLING_MODES = [
  { id: 'src_x_rcv', label: 'Source × listener', fn: (sc, rc) => sc * rc },
  { id: 'rcv_only',  label: 'Listener only',     fn: (_sc, rc) => rc },
  { id: 'src_only',  label: 'Source only',        fn: (sc, _rc) => sc },
  { id: 'bw_local',  label: 'Bandwidth-local',    fn: (sc, rc) => sc * rc }, // bw proximity handled separately
];

const Q_MULTIPLIERS = [
  { id: 'q075', label: 'Q × 0.75', scale: 0.75 },
  { id: 'q090', label: 'Q × 0.90', scale: 0.90 },
  { id: 'q100', label: 'Q × 1.00 (current)', scale: 1.00 },
  { id: 'q110', label: 'Q × 1.10', scale: 1.10 },
];

const FAMILY_WEIGHTINGS = [
  { id: 'current',    label: 'Current',           axial: 1.0, tang: 1.0, obli: 1.0 },
  { id: 'tang_red',   label: 'Tangential reduced', axial: 1.0, tang: 0.6, obli: 1.0 },
  { id: 'axial_red',  label: 'Axial reduced',      axial: 0.6, tang: 1.0, obli: 1.0 },
  { id: 'balanced',   label: 'Balanced',           axial: 0.8, tang: 0.8, obli: 0.8 },
  { id: 'obli_off',   label: 'Oblique ignored',    axial: 1.0, tang: 1.0, obli: 0.0 },
];

const SELECTION_MODES = [
  { id: 'coupling',   label: 'Coupling ranked' },
  { id: 'transfer',   label: 'Transfer ranked' },
  { id: 'energy',     label: 'Energy ranked' },
  { id: 'bandwidth',  label: 'Bandwidth ranked' },
];

// Total: 5 × 4 × 4 × 5 × 4 = 1600 combinations

// ── Acoustic primitives ───────────────────────────────────────────────────────
// buildModes, sabineQ, cosShape, resonator replaced by shared helpers imported above.
// typeBaseQ is local-only (not part of the shared helper) and is preserved here.

function buildFreqAxis(minHz = 20, maxHz = 200) {
  const freqs = [];
  const ppo = 48; // reduced for speed; still 144+ points/octave across 20-200
  const total = Math.ceil(Math.log2(maxHz / minHz) * ppo);
  for (let i = 0; i <= total; i++) {
    const hz = minHz * Math.pow(2, i / ppo);
    if (hz > maxHz) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== maxHz) freqs.push(maxHz);
  return freqs;
}

function typeBaseQ(type, axialQ) {
  if (type === 'axial') return axialQ;
  if (type === 'tangential') return 3.9;
  return 2.5;
}

// ── Single candidate simulation ───────────────────────────────────────────────

function simulateCandidate(candidate, W, L, H, modesWithBaseQ, freqsHz, sx, sy, sz, rx, ry, rz, axialQOverride) {
  const { participation, coupling, qScale, family, selection } = candidate;
  const srcAmp = Math.pow(10, FLAT_SOURCE_DB / 20);

  // Scale Q values
  const modes = modesWithBaseQ.map(m => ({
    ...m,
    q: Math.max(1, Math.min(80, m.baseQ * qScale)),
  }));

  return freqsHz.map(f => {
    // Direct path
    const dist = Math.max(0.01, Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2));
    const directAmp = srcAmp * Math.pow(10, -20 * Math.log10(dist) / 20);
    const tof = -2 * Math.PI * f * dist / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    // Build per-mode entries
    const entries = modes.map(mode => {
      const sc = modeShapeValueLocal(mode, sx, sy, sz, { widthM: W, lengthM: L, heightM: H });
      const rc = modeShapeValueLocal(mode, rx, ry, rz, { widthM: W, lengthM: L, heightM: H });

      // Coupling strategy
      let coupVal;
      if (coupling.id === 'bw_local') {
        const bw = mode.freq / Math.max(mode.q, 1e-6);
        const inBw = Math.abs(mode.freq - f) <= bw;
        coupVal = inBw ? sc * rc : 0;
      } else {
        coupVal = coupling.fn(sc, rc);
      }

      // Family weighting
      const fw = mode.type === 'axial' ? family.axial
               : mode.type === 'tangential' ? family.tang
               : family.obli;

      // Order weight (matching production engine)
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const hoScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;

      const { re: tRe, im: tIm, transferMag } = resonantTransfer(f, mode.freq, mode.q);

      const bw = mode.freq / Math.max(mode.q, 1e-6);
      const energyProxy = transferMag * Math.abs(coupVal) * fw * orderWeight;

      // Selection rank metric
      let rankMetric;
      if (selection.id === 'coupling') rankMetric = Math.abs(coupVal);
      else if (selection.id === 'transfer') rankMetric = transferMag;
      else if (selection.id === 'energy') rankMetric = energyProxy;
      else rankMetric = 1 / Math.max(bw, 1e-6); // bandwidth_ranked: prefer narrower

      const gain = srcAmp * coupVal * fw * orderWeight * hoScale;
      return { re: gain * tRe, im: gain * tIm, rankMetric };
    });

    // Participation filtering
    if (participation.topN != null) {
      const sorted = [...entries].sort((a, b) => b.rankMetric - a.rankMetric);
      for (let k = 0; k < Math.min(participation.topN, sorted.length); k++) {
        const e = sorted[k];
        if (Number.isFinite(e.re) && Number.isFinite(e.im)) { sumRe += e.re; sumIm += e.im; }
      }
    } else if (participation.bwFactor != null) {
      modes.forEach((mode, mi) => {
        const bw = mode.freq / Math.max(mode.q, 1e-6);
        if (Math.abs(mode.freq - f) <= participation.bwFactor * bw) {
          const e = entries[mi];
          if (Number.isFinite(e.re) && Number.isFinite(e.im)) { sumRe += e.re; sumIm += e.im; }
        }
      });
    } else {
      // All modes
      entries.forEach(e => {
        if (Number.isFinite(e.re) && Number.isFinite(e.im)) { sumRe += e.re; sumIm += e.im; }
      });
    }

    return 20 * Math.log10(Math.max(Math.sqrt(sumRe * sumRe + sumIm * sumIm), 1e-10));
  });
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function interpolate(freqsHz, splDb, targetHz) {
  if (!freqsHz?.length) return null;
  if (targetHz <= freqsHz[0]) return splDb[0];
  if (targetHz >= freqsHz[freqsHz.length - 1]) return splDb[splDb.length - 1];
  for (let i = 0; i < freqsHz.length - 1; i++) {
    if (targetHz >= freqsHz[i] && targetHz <= freqsHz[i + 1]) {
      const t = (targetHz - freqsHz[i]) / (freqsHz[i + 1] - freqsHz[i]);
      return splDb[i] + (splDb[i + 1] - splDb[i]) * t;
    }
  }
  return null;
}

function scoreResponse(freqsHz, splDb) {
  let sumErr = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const v = interpolate(freqsHz, splDb, hz);
    if (!Number.isFinite(v)) continue;
    const err = Math.abs(v - db);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  if (count === 0) return null;
  const bands = BANDS.map(({ lo, hi }) => {
    const pts = REW_BENCHMARK.filter(p => p.hz >= lo && p.hz <= hi);
    let s = 0, c = 0;
    for (const { hz, db } of pts) {
      const v = interpolate(freqsHz, splDb, hz);
      if (!Number.isFinite(v)) continue;
      s += Math.abs(v - db); c++;
    }
    return c > 0 ? s / c : null;
  });
  return { mae: sumErr / count, worstErr, worstHz, bands };
}

// ── Clustering & confidence ───────────────────────────────────────────────────

function buildClusterReport(top50) {
  if (!top50?.length) return null;
  const n = top50.length;

  const count = (key, val) => top50.filter(r => r.candidate[key] === val).length;

  const dims = [
    { dim: 'participation', values: PARTICIPATION_MODES,  key: 'id', label: 'Participation' },
    { dim: 'coupling',      values: COUPLING_MODES,       key: 'id', label: 'Coupling' },
    { dim: 'qScale',        values: Q_MULTIPLIERS,        key: 'scale', label: 'Q Multiplier' },
    { dim: 'family',        values: FAMILY_WEIGHTINGS,    key: 'id', label: 'Family weighting' },
    { dim: 'selection',     values: SELECTION_MODES,      key: 'id', label: 'Selection mode' },
  ];

  const dimResults = dims.map(({ dim, values, key, label }) => {
    // Compute count AND maeDelta for every value upfront
    const valueCounts = values.map(v => {
      const matchRuns = top50.filter(r => {
        const val = r.candidate[dim];
        return (val?.[key] ?? val) === (v[key] ?? v);
      });
      const otherRuns = top50.filter(r => {
        const val = r.candidate[dim];
        return (val?.[key] ?? val) !== (v[key] ?? v);
      });
      const c = matchRuns.length;
      let delta = null;
      if (matchRuns.length && otherRuns.length) {
        const matchAvg = matchRuns.reduce((s, r) => s + r.score.mae, 0) / matchRuns.length;
        const otherAvg = otherRuns.reduce((s, r) => s + r.score.mae, 0) / otherRuns.length;
        delta = otherAvg - matchAvg; // positive = this trait is better (lower MAE)
      }
      return { ...v, count: c, pct: Math.round((c / n) * 100), delta };
    }).sort((a, b) => b.count - a.count);

    // Most frequent trait (for display / COMMON WINNING TRAITS section)
    const winner = valueCounts[0];

    // maeDelta for the most-frequent winner (for COMMON WINNING TRAITS display)
    const maeDelta = winner.delta;

    // Safe winner: highest-frequency trait where delta >= 0 (beneficial or neutral).
    // Falls back to null — buildProductionRecommendation will use best candidate.
    const safeWinner = valueCounts.find(v => v.delta === null || v.delta >= 0) ?? null;

    return { label, dim, key, valueCounts, winner, safeWinner, maeDelta };
  });

  return dimResults;
}

function buildProductionRecommendation(top50, clusterReport) {
  if (!top50?.length || !clusterReport) return null;
  const best = top50[0];

  // Helper: resolve the safe winner for a dimension, falling back to best candidate value
  const resolve = (dimId, bestVal) => {
    const dim = clusterReport.find(d => d.dim === dimId);
    if (!dim) return { label: bestVal, fallback: true };
    if (dim.safeWinner) return { label: dim.safeWinner.label, fallback: false };
    return { label: bestVal, fallback: true };
  };

  const participation = resolve('participation', best.candidate.participation.label);
  const coupling      = resolve('coupling',      best.candidate.coupling.label);
  const qScale        = resolve('qScale',        best.candidate.qMult.label);
  const family        = resolve('family',        best.candidate.family.label);
  const selection     = resolve('selection',     best.candidate.selection.label);

  const spec = {
    participation: participation.label,
    coupling:      coupling.label,
    qScale:        qScale.label,
    family:        family.label,
    selection:     selection.label,
    fallbacks: {
      participation: participation.fallback,
      coupling:      coupling.fallback,
      qScale:        qScale.fallback,
      family:        family.fallback,
      selection:     selection.fallback,
    },
    predictedMae: best.score.mae,
  };

  // Attempt to find the exact candidate matching this combination
  const pDim = clusterReport.find(d => d.dim === 'participation');
  const cDim = clusterReport.find(d => d.dim === 'coupling');
  const qDim = clusterReport.find(d => d.dim === 'qScale');
  const fDim = clusterReport.find(d => d.dim === 'family');
  const sDim = clusterReport.find(d => d.dim === 'selection');
  const matchKey = `${pDim?.safeWinner?.id ?? best.candidate.participation.id}_${cDim?.safeWinner?.id ?? best.candidate.coupling.id}_${qDim?.safeWinner?.scale ?? best.candidate.qMult.scale}_${fDim?.safeWinner?.id ?? best.candidate.family.id}_${sDim?.safeWinner?.id ?? best.candidate.selection.id}`;
  const exact = top50.find(r => r.candidate._key === matchKey);
  if (exact) spec.predictedMae = exact.score.mae;

  return spec;
}

// ── Formatting ────────────────────────────────────────────────────────────────
const fmt = (v, d = 2) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';

const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#1e1b4b', borderBottom: '2px solid #818cf8', color: '#c7d2fe', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

// ── Component ─────────────────────────────────────────────────────────────────

export default function RewProductionCandidateGenerator({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results, setResults]   = useState(null);
  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const cancelRef = useRef(false);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  const totalCombos = PARTICIPATION_MODES.length * COUPLING_MODES.length * Q_MULTIPLIERS.length * FAMILY_WEIGHTINGS.length * SELECTION_MODES.length;

  const runGenerator = useCallback(async () => {
    if (!canRun || running) return;
    setRunning(true);
    setResults(null);
    setProgress({ done: 0, total: totalCombos });
    cancelRef.current = false;

    const W  = Number(roomDims.widthM);
    const L  = Number(roomDims.lengthM);
    const H  = Number(roomDims.heightM);
    const sx = Number(sub.x);
    const sy = Number(sub.y);
    const sz = Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35;
    const rx = Number(seat.x);
    const ry = Number(seat.y);
    const rz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
    const axialQOverride = activeSettings?.axialQ ?? 4.0;
    const sa = surfaceAbsorption ?? {};

    // Build modes with base Q (pre-scale — each Q scale applied per candidate)
    // Uses shared helpers: computeRoomModesLocal (was buildModes), estimateModeQLocal (was sabineQ).
    await new Promise(r => setTimeout(r, 0));
    const rawModes = computeRoomModesLocal({ widthM: W, lengthM: L, heightM: H, fMax: 210 });
    const modesWithBaseQ = rawModes.map(m => {
      const baseQ = typeBaseQ(m.type, axialQOverride);
      const absQ  = estimateModeQLocal({ roomDims: { widthM: W, lengthM: L, heightM: H }, surfaceAbsorption: sa, f0: m.freq });
      return { ...m, baseQ: Math.max(1, Math.min(baseQ, absQ)) };
    });

    const freqsHz = buildFreqAxis(20, 200);
    const allResults = [];
    let done = 0;

    // Batch size: process N candidates per frame to keep UI responsive
    const BATCH = 20;

    for (const participation of PARTICIPATION_MODES) {
      for (const coupling of COUPLING_MODES) {
        for (const qMult of Q_MULTIPLIERS) {
          for (const family of FAMILY_WEIGHTINGS) {
            for (const selection of SELECTION_MODES) {
              if (cancelRef.current) break;
              const candidate = {
                participation, coupling,
                qScale: qMult.scale, // convenience
                qMult,
                family, selection,
                _key: `${participation.id}_${coupling.id}_${qMult.scale}_${family.id}_${selection.id}`,
              };
              const splDb = simulateCandidate(candidate, W, L, H, modesWithBaseQ, freqsHz, sx, sy, sz, rx, ry, rz, axialQOverride);
              const score = scoreResponse(freqsHz, splDb);
              if (score) allResults.push({ candidate, score });
              done++;

              if (done % BATCH === 0) {
                setProgress({ done, total: totalCombos });
                await new Promise(r => setTimeout(r, 0));
              }
            }
            if (cancelRef.current) break;
          }
          if (cancelRef.current) break;
        }
        if (cancelRef.current) break;
      }
      if (cancelRef.current) break;
    }

    if (!cancelRef.current) {
      const sorted = [...allResults].sort((a, b) => a.score.mae - b.score.mae);
      const top50  = sorted.slice(0, 50);
      const top10  = sorted.slice(0, 10);
      const best   = sorted[0] ?? null;
      const clusterReport = buildClusterReport(top50);
      const recommendation = buildProductionRecommendation(top50, clusterReport);
      setResults({ sorted, top50, top10, best, clusterReport, recommendation, totalRan: allResults.length });
    }

    setRunning(false);
    setProgress({ done: 0, total: 0 });
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun, running]);

  const cancel = () => { cancelRef.current = true; };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ marginTop: 16, borderTop: '3px solid #4f46e5', paddingTop: 12 }}>
      {/* Header */}
      <div style={{ fontWeight: 800, color: '#312e81', fontSize: 12, fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.02em' }}>
        REW Parity Production Candidate Generator
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {totalCombos.toLocaleString()} combinations · auto sweep · diagnostic only
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#4338ca', marginBottom: 6, lineHeight: 1.4 }}>
        Sweeps all combinations of: Participation (5) × Coupling (4) × Q (4) × Family weighting (5) × Selection (4).
        Scores every candidate against the fixed REW benchmark. Outputs Top 50, Top 10, best candidate, and
        clustering analysis identifying the strongest recurring production traits.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, and valid sub position to run.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button
          onClick={runGenerator}
          disabled={running || !canRun}
          style={{
            height: 30, padding: '0 16px', borderRadius: 6,
            border: '1px solid #4f46e5', background: running ? '#e5e7eb' : '#4f46e5',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700,
          }}
        >
          {running ? `Generating… ${pct}% (${progress.done.toLocaleString()}/${progress.total.toLocaleString()})` : results ? 'Re-run Generator' : 'Run Production Candidate Generator'}
        </button>
        {running && (
          <button onClick={cancel} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #dc2626', background: '#fef2f2', color: '#dc2626', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
            Cancel
          </button>
        )}
      </div>

      {running && (
        <div style={{ width: '100%', background: '#e0e7ff', borderRadius: 4, height: 8, marginBottom: 10 }}>
          <div style={{ width: `${pct}%`, background: '#4f46e5', height: 8, borderRadius: 4, transition: 'width 0.15s' }} />
        </div>
      )}

      {results && (
        <>
          {/* ── Summary strip ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Total candidates', value: results.totalRan.toLocaleString(), color: '#312e81' },
              { label: 'Best MAE', value: fmt(results.best?.score?.mae, 3) + ' dB', color: '#15803d' },
              { label: 'Top-10 avg MAE', value: fmt(results.top10.reduce((s, r) => s + r.score.mae, 0) / (results.top10.length || 1), 3) + ' dB', color: '#1d4ed8' },
              { label: 'Best worst error', value: fmt(results.best?.score?.worstErr, 3) + ' dB @ ' + (results.best?.score?.worstHz ?? '—') + ' Hz', color: '#b45309' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#eef2ff', border: '1px solid #a5b4fc', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* ── COMMON WINNING TRAITS ── */}
          {results.clusterReport && (
            <div style={{ border: '2px solid #4f46e5', borderRadius: 8, background: '#eef2ff', padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: '#312e81', fontSize: 12, fontFamily: 'monospace', marginBottom: 8, letterSpacing: '0.04em' }}>
                COMMON WINNING TRAITS
                <span style={{ fontWeight: 400, fontSize: 9, color: '#6b7280', marginLeft: 8 }}>Top 50 candidates</span>
              </div>
              {results.clusterReport.map(dim => (
                <div key={dim.dim} style={{ marginBottom: 8, borderBottom: '1px dashed #a5b4fc', paddingBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: '#3730a3', fontSize: 10, fontFamily: 'monospace', marginBottom: 3 }}>{dim.label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {dim.valueCounts.map((v, vi) => (
                      <div key={v.id ?? v.scale ?? vi} style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 9, fontFamily: 'monospace',
                        background: vi === 0 ? '#312e81' : '#e0e7ff',
                        color: vi === 0 ? '#fff' : '#312e81',
                        fontWeight: vi === 0 ? 700 : 400,
                        border: `1px solid ${vi === 0 ? '#312e81' : '#a5b4fc'}`,
                      }}>
                        {v.label} — {v.pct}% ({v.count})
                      </div>
                    ))}
                  </div>
                  {dim.maeDelta != null && (
                    <div style={{ fontSize: 9, fontFamily: 'monospace', color: dim.maeDelta > 0.5 ? '#15803d' : '#6b7280', marginTop: 3 }}>
                      MAE impact: winner avg {dim.maeDelta > 0 ? `▼${fmt(dim.maeDelta, 3)} dB` : `▲${fmt(Math.abs(dim.maeDelta), 3)} dB`} vs rest
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── PRODUCTION CHANGE CONFIDENCE ── */}
          {results.clusterReport && (
            <div style={{ border: '2px solid #0891b2', borderRadius: 8, background: '#ecfeff', padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: '#0e7490', fontSize: 12, fontFamily: 'monospace', marginBottom: 8, letterSpacing: '0.04em' }}>
                PRODUCTION CHANGE CONFIDENCE
              </div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #a5f3fc', color: '#0e7490', fontSize: 9, fontFamily: 'monospace' }}>
                    <th style={{ textAlign: 'left', padding: '2px 6px' }}>Dimension</th>
                    <th style={{ textAlign: 'left', padding: '2px 6px' }}>Recommended value</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px' }}>Confidence</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px' }}>Evidence</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px' }}>MAE impact</th>
                  </tr>
                </thead>
                <tbody>
                  {results.clusterReport.map(dim => {
                    const winner = dim.valueCounts[0];
                    const conf = winner.pct;
                    return (
                      <tr key={dim.dim} style={{ borderBottom: '1px solid #cffafe' }}>
                        <td style={{ padding: '3px 6px', fontSize: 9, fontFamily: 'monospace', color: '#164e63', fontWeight: 700 }}>{dim.label}</td>
                        <td style={{ padding: '3px 6px', fontSize: 9, fontFamily: 'monospace', color: '#0c4a6e' }}>{winner.label}</td>
                        <td style={{ padding: '3px 6px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', fontWeight: 700, color: conf >= 70 ? '#166534' : conf >= 50 ? '#b45309' : '#6b7280' }}>
                          {conf}%
                        </td>
                        <td style={{ padding: '3px 6px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', color: '#0e7490' }}>{winner.count} / {results.top50.length}</td>
                        <td style={{ padding: '3px 6px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', color: dim.maeDelta > 0 ? '#166534' : '#6b7280' }}>
                          {dim.maeDelta != null ? (dim.maeDelta > 0 ? `▼${fmt(dim.maeDelta, 3)}` : `▲${fmt(Math.abs(dim.maeDelta), 3)}`) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── RECOMMENDED PRODUCTION TEST ENGINE ── */}
          {results.recommendation && (
            <div style={{ border: '3px solid #059669', borderRadius: 8, background: '#f0fdf4', padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: '#064e3b', fontSize: 12, fontFamily: 'monospace', marginBottom: 8, letterSpacing: '0.04em' }}>
                RECOMMENDED PRODUCTION TEST ENGINE
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 11, fontFamily: 'monospace', color: '#065f46', marginBottom: 8 }}>
                {[
                  { label: 'Participation', val: results.recommendation.participation, fb: results.recommendation.fallbacks?.participation },
                  { label: 'Coupling',      val: results.recommendation.coupling,      fb: results.recommendation.fallbacks?.coupling },
                  { label: 'Q',             val: results.recommendation.qScale,        fb: results.recommendation.fallbacks?.qScale },
                  { label: 'Family weighting', val: results.recommendation.family,     fb: results.recommendation.fallbacks?.family },
                  { label: 'Selection',     val: results.recommendation.selection,     fb: results.recommendation.fallbacks?.selection },
                ].map(({ label, val, fb }) => (
                  <div key={label}>
                    <span style={{ color: '#6b7280' }}>{label}:</span>{' '}
                    <strong>{val}</strong>
                    {fb && <span title="No beneficial trait found — using best candidate value" style={{ marginLeft: 5, fontSize: 9, color: '#b45309', background: '#fef3c7', borderRadius: 3, padding: '1px 4px' }}>↑ best fallback</span>}
                  </div>
                ))}
                <div><span style={{ color: '#6b7280' }}>Predicted MAE:</span> <strong style={{ color: '#15803d', fontSize: 14 }}>{fmt(results.recommendation.predictedMae, 3)} dB</strong></div>
              </div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#059669', background: '#dcfce7', borderRadius: 4, padding: '4px 8px' }}>
                Traits are selected from the Top 50 only where their average MAE impact is beneficial (▼). Harmful traits are excluded; where no beneficial trait exists, the best single candidate's value is used (shown as <span style={{ color: '#b45309' }}>↑ best fallback</span>).
              </div>
            </div>
          )}

          {/* ── Best candidate detail ── */}
          {results.best && (
            <div style={{ border: '1px solid #4ade80', borderRadius: 6, background: '#f0fdf4', padding: '8px 12px', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: '#14532d', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
                🏆 Best single candidate (MAE {fmt(results.best.score.mae, 3)} dB)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 16px', fontSize: 9, fontFamily: 'monospace', color: '#166534' }}>
                <span>Participation: {results.best.candidate.participation.label}</span>
                <span>Coupling: {results.best.candidate.coupling.label}</span>
                <span>Q: {results.best.candidate.qMult.label}</span>
                <span>Family: {results.best.candidate.family.label}</span>
                <span>Selection: {results.best.candidate.selection.label}</span>
                <span>Worst error: {fmt(results.best.score.worstErr, 2)} dB @ {results.best.score.worstHz} Hz</span>
              </div>
            </div>
          )}

          {/* ── Top 10 table ── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: '#312e81', fontSize: 10, fontFamily: 'monospace', marginBottom: 6 }}>
              Top 10 Candidates
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 920 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 30 }}>#</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 90 }}>Participation</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 110 }}>Coupling</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 80 }}>Q</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 110 }}>Family</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 90 }}>Selection</th>
                    <th style={thS}>MAE</th>
                    <th style={thS}>Worst err</th>
                    <th style={thS}>Worst Hz</th>
                    {BANDS.map(b => <th key={b.label} style={thS}>{b.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {results.top10.map((row, i) => {
                    const { candidate: c, score } = row;
                    const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
                    const isTop3 = i < 3;
                    return (
                      <tr key={c._key} style={{ borderBottom: '1px solid #c7d2fe', background: isTop3 ? '#eef2ff' : undefined }}>
                        <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#312e81' }}>{rankEmoji}</td>
                        <td style={{ ...tdS, textAlign: 'left', color: '#3730a3' }}>{c.participation.label}</td>
                        <td style={{ ...tdS, textAlign: 'left', color: '#3730a3' }}>{c.coupling.label}</td>
                        <td style={{ ...tdS, textAlign: 'left', color: '#3730a3' }}>{c.qMult.label}</td>
                        <td style={{ ...tdS, textAlign: 'left', color: '#3730a3' }}>{c.family.label}</td>
                        <td style={{ ...tdS, textAlign: 'left', color: '#3730a3' }}>{c.selection.label}</td>
                        <td style={{ ...tdS, fontWeight: 700, color: isTop3 ? '#15803d' : '#374151' }}>{fmt(score.mae, 3)}</td>
                        <td style={{ ...tdS, color: (score.worstErr ?? 0) > 5 ? '#dc2626' : '#374151' }}>{fmt(score.worstErr, 2)}</td>
                        <td style={{ ...tdS }}>{score.worstHz ?? '—'} Hz</td>
                        {score.bands.map((v, bi) => (
                          <td key={bi} style={{ ...tdS, color: (v ?? 0) > 4 ? '#b45309' : '#374151' }}>{fmt(v, 2)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Top 50 compact table ── */}
          <details style={{ borderTop: '1px dashed #a5b4fc', paddingTop: 8 }}>
            <summary style={{ fontWeight: 700, color: '#4338ca', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer', marginBottom: 6 }}>
              Full Top 50 (click to expand)
            </summary>
            <div style={{ overflowX: 'auto', marginTop: 6 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left' }}>#</th>
                    <th style={{ ...thS, textAlign: 'left' }}>Participation</th>
                    <th style={{ ...thS, textAlign: 'left' }}>Coupling</th>
                    <th style={{ ...thS, textAlign: 'left' }}>Q</th>
                    <th style={{ ...thS, textAlign: 'left' }}>Family</th>
                    <th style={{ ...thS, textAlign: 'left' }}>Selection</th>
                    <th style={thS}>MAE</th>
                    <th style={thS}>Worst</th>
                    {BANDS.map(b => <th key={b.label} style={thS}>{b.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {results.top50.map((row, i) => (
                    <tr key={row.candidate._key} style={{ borderBottom: '1px solid #e0e7ff' }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#4338ca' }}>{i + 1}</td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 8, color: '#374151' }}>{row.candidate.participation.label}</td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 8, color: '#374151' }}>{row.candidate.coupling.label}</td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 8, color: '#374151' }}>{row.candidate.qMult.label}</td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 8, color: '#374151' }}>{row.candidate.family.label}</td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 8, color: '#374151' }}>{row.candidate.selection.label}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: '#312e81' }}>{fmt(row.score.mae, 3)}</td>
                      <td style={{ ...tdS, color: (row.score.worstErr ?? 0) > 5 ? '#dc2626' : '#374151' }}>{fmt(row.score.worstErr, 2)}</td>
                      {row.score.bands.map((v, bi) => (
                        <td key={bi} style={{ ...tdS, color: (v ?? 0) > 4 ? '#b45309' : '#374151' }}>{fmt(v, 2)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}