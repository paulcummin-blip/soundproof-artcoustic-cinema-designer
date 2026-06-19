// RewParityAutoSweep.jsx
// Diagnostic-only: auto-sweeps parameter combinations and ranks by MAE against REW_BENCHMARK.
// Does NOT change the active simulation, graph, defaults, or benchmark values.

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { getSubwooferCurve } from '@/components/models/speakers/registry';

// ── REW benchmark targets (same values as RewBenchmarkComparisonTable) ────────
// Keep in sync with the canonical benchmark table. Do not modify here.
const REW_BENCHMARK = [
  { hz: 20,  db: 90.0 },
  { hz: 25,  db: 91.5 },
  { hz: 30,  db: 93.0 },
  { hz: 33.5,db: 93.6 },
  { hz: 35,  db: 92.5 },
  { hz: 40,  db: 72.9 },
  { hz: 45,  db: 87.5 },
  { hz: 50,  db: 90.5 },
  { hz: 57,  db: 91.0 },
  { hz: 60,  db: 91.5 },
  { hz: 67.9,db: 92.4 },
  { hz: 70,  db: 91.8 },
  { hz: 80,  db: 90.5 },
  { hz: 100, db: 89.5 },
  { hz: 120, db: 88.5 },
  { hz: 150, db: 87.5 },
  { hz: 180, db: 86.5 },
  { hz: 200, db: 86.0 },
];

// ── Sweep grid ────────────────────────────────────────────────────────────────
const SWEEP_GRID = {
  modalDistanceBlend:   [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65],
  modalCoherenceMode:   ['coherent', 'distributed'],
  axialQ:               [6, 7, 8],
  highOrderAxialScale:  [1.00, 0.85],
  rewParityModalMagnitudeScale: [0.85, 0.90, 0.95, 1.00, 1.05],
};

const FLAT_SOURCE_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function interpolateSpl(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.frequency - b.frequency);
  if (targetHz <= sorted[0].frequency) return sorted[0].spl;
  if (targetHz >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i], p2 = sorted[i + 1];
    if (targetHz >= p1.frequency && targetHz <= p2.frequency) {
      const t = (targetHz - p1.frequency) / (p2.frequency - p1.frequency);
      return p1.spl + (p2.spl - p1.spl) * t;
    }
  }
  return null;
}

function computeMAE(series) {
  let sumAbsErr = 0;
  let worstErr = 0;
  let count = 0;
  for (const target of REW_BENCHMARK) {
    const b44 = interpolateSpl(series, target.hz);
    if (b44 === null || !Number.isFinite(b44)) continue;
    const absErr = Math.abs(b44 - target.db);
    sumAbsErr += absErr;
    if (absErr > worstErr) worstErr = absErr;
    count++;
  }
  if (count === 0) return { mae: null, worst: null };
  return { mae: sumAbsErr / count, worst: worstErr };
}

function runOneCombination(roomDims, seat, sub, sourceCurve, surfaceAbsorption, combo) {
  const { modalDistanceBlend, modalCoherenceMode, axialQ, highOrderAxialScale, rewParityModalMagnitudeScale } = combo;

  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const blend = Math.max(0, Math.min(1, modalDistanceBlend));

  // Distance blend → gain scalar (mirrors BassResponse logic)
  let engineModalRefMode = 'existing';
  let engineModalGainScalar = 1.0;
  if (blend >= 1.0) {
    engineModalRefMode = 'distance_normalized';
  } else if (blend > 0) {
    const dx = sub.x - seat.x;
    const dy = sub.y - seat.y;
    const dz = sub.z - seatZ;
    const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const fullLossDb = -20 * Math.log10(distM / 1);
    engineModalGainScalar = Math.pow(10, (fullLossDb * blend) / 20);
  }

  let result;
  try {
    result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      sourceCurve,
      {
        enableReflections: false,   // flat_rew_reference parity: no reflections
        enableModes: true,
        surfaceAbsorption,
        freqMinHz: 20,
        freqMaxHz: 200,
        smoothing: 'none',
        modalSourceReferenceMode: engineModalRefMode,
        modalGainScalar: engineModalGainScalar,
        axialQ,
        modalStorageMode: 'none',
        propagationPhaseScale: 0,
        pureDeterministicModalSum: true,
        disableModalPropagationPhase: true,
        modalCoherenceMode,
        highOrderAxialScale,
        rewParityModalMagnitudeScale,
        debugReflectionOrder: 1,
        disableLateField: true,
      }
    );
  } catch (e) {
    return null;
  }

  if (!result?.freqsHz || !result?.splDbRaw) return null;

  const series = result.freqsHz.map((hz, i) => ({ frequency: hz, spl: result.splDbRaw[i] }));
  return computeMAE(series);
}

function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RewParityAutoSweep({ roomDims, seat, sub, surfaceAbsorption }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  const runSweep = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);
    setError(null);

    const subCurve = getSubwooferCurve(sub?.modelKey);
    const sourceCurve = FLAT_SOURCE_CURVE; // always flat REW reference for this sweep

    // Build all combos
    const combos = [];
    for (const blend of SWEEP_GRID.modalDistanceBlend)
      for (const coherence of SWEEP_GRID.modalCoherenceMode)
        for (const q of SWEEP_GRID.axialQ)
          for (const hoScale of SWEEP_GRID.highOrderAxialScale)
            for (const magScale of SWEEP_GRID.rewParityModalMagnitudeScale)
              combos.push({
                modalDistanceBlend: blend,
                modalCoherenceMode: coherence,
                axialQ: q,
                highOrderAxialScale: hoScale,
                rewParityModalMagnitudeScale: magScale,
              });

    setTotal(combos.length);
    setProgress(0);

    const scored = [];
    const CHUNK = 20; // process in chunks to keep UI responsive

    for (let i = 0; i < combos.length; i += CHUNK) {
      const chunk = combos.slice(i, i + CHUNK);
      for (const combo of chunk) {
        const metrics = runOneCombination(roomDims, seat, sub, sourceCurve, surfaceAbsorption, combo);
        if (metrics?.mae !== null) {
          scored.push({ ...combo, mae: metrics.mae, worst: metrics.worst });
        }
      }
      setProgress(Math.min(i + CHUNK, combos.length));
      // Yield to browser between chunks
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    scored.sort((a, b) => a.mae - b.mae);
    setResults(scored.slice(0, 10));
    setRunning(false);
    setProgress(combos.length);
  }, [roomDims, seat, sub, surfaceAbsorption, canRun]);

  const thStyle = {
    textAlign: 'right', padding: '3px 6px', fontSize: 10, fontWeight: 700,
    background: '#f0fdf4', borderBottom: '2px solid #86efac', color: '#166534',
    whiteSpace: 'nowrap',
  };
  const tdStyle = { textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace' };

  return (
    <div style={{
      marginTop: 12, borderTop: '1px solid #CBD5E1', paddingTop: 10,
      border: '1px solid #86efac', borderRadius: 8, background: '#f0fdf4', padding: '10px 12px',
    }}>
      <div style={{ fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
        REW Parity Auto Sweep
        <span style={{ fontWeight: 400, color: '#4ade80', marginLeft: 8, fontSize: 10 }}>diagnostic only · does not affect active simulation</span>
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dimensions, a valid seat, and a valid sub to run the sweep.
        </div>
      )}

      <div style={{ marginBottom: 8, fontSize: 10, fontFamily: 'monospace', color: '#374151' }}>
        Grid: {SWEEP_GRID.modalDistanceBlend.length} blend ×{' '}
        {SWEEP_GRID.modalCoherenceMode.length} coherence ×{' '}
        {SWEEP_GRID.axialQ.length} Q ×{' '}
        {SWEEP_GRID.highOrderAxialScale.length} hoScale ×{' '}
        {SWEEP_GRID.rewParityModalMagnitudeScale.length} magScale ={' '}
        <strong>
          {SWEEP_GRID.modalDistanceBlend.length *
            SWEEP_GRID.modalCoherenceMode.length *
            SWEEP_GRID.axialQ.length *
            SWEEP_GRID.highOrderAxialScale.length *
            SWEEP_GRID.rewParityModalMagnitudeScale.length} combinations
        </strong>
        . Source: flat 94 dB REW reference. Top 10 shown by lowest MAE.
      </div>

      <button
        onClick={runSweep}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #16a34a', background: running ? '#e5e7eb' : '#16a34a',
          color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {running ? `Running… ${progress} / ${total}` : (results ? 'Re-run sweep' : 'Run sweep')}
      </button>

      {running && total > 0 && (
        <div style={{ marginBottom: 8, fontSize: 10, fontFamily: 'monospace', color: '#166534' }}>
          <div style={{ background: '#dcfce7', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ background: '#16a34a', height: '100%', width: `${(progress / total) * 100}%`, transition: 'width 0.1s' }} />
          </div>
          <span style={{ fontSize: 9, color: '#4ade80' }}>{Math.round((progress / total) * 100)}%</span>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 10, color: '#dc2626', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ {error}
        </div>
      )}

      {results && results.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>Rank</th>
                <th style={thStyle}>MAE (dB)</th>
                <th style={thStyle}>Worst err (dB)</th>
                <th style={thStyle}>Distance blend</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Coherence</th>
                <th style={thStyle}>Axial Q</th>
                <th style={thStyle}>HO axial scale</th>
                <th style={thStyle}>Modal mag scale</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid #bbf7d0',
                    background: i === 0 ? '#dcfce7' : i < 3 ? '#f0fdf4' : undefined,
                  }}
                >
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#166534' : '#374151' }}>
                    {i === 0 ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `#${i + 1}`}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#166534' : '#374151' }}>
                    {fmt(row.mae, 3)}
                  </td>
                  <td style={{ ...tdStyle, color: row.worst > 5 ? '#dc2626' : row.worst > 3 ? '#b45309' : '#374151' }}>
                    {fmt(row.worst, 3)}
                  </td>
                  <td style={tdStyle}>{fmt(row.modalDistanceBlend, 2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{row.modalCoherenceMode}</td>
                  <td style={tdStyle}>{fmt(row.axialQ, 1)}</td>
                  <td style={tdStyle}>{fmt(row.highOrderAxialScale, 2)}</td>
                  <td style={tdStyle}>{fmt(row.rewParityModalMagnitudeScale, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && results.length === 0 && (
        <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
          No valid results — check room/seat/sub configuration.
        </div>
      )}
    </div>
  );
}