// RewParityAutoSweep.jsx
// Diagnostic-only: auto-sweeps parameter combinations and ranks by MAE against REW_BENCHMARK.
// Does NOT change the active simulation, graph, defaults, or benchmark values.

import React, { useState, useCallback, useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import RewParityTiltSweep from './RewParityTiltSweep';
import RewParityArchitectureSweep from './RewParityArchitectureSweep';

// ── REW benchmark targets — MUST match RewBenchmarkComparisonTable.jsx exactly ──
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

// ── Sweep grid ────────────────────────────────────────────────────────────────
const SWEEP_GRID = {
  modalDistanceBlend:           [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65],
  modalCoherenceMode:           ['coherent', 'distributed'],
  axialQ:                       [6, 7, 8],
  highOrderAxialScale:          [1.00, 0.85],
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

// MAE for a specific Hz band using benchmark points within [loHz, hiHz]
function computeBandMAE(series, loHz, hiHz) {
  const pts = REW_BENCHMARK.filter(p => p.hz >= loHz && p.hz <= hiHz);
  if (pts.length === 0) return null;
  let sum = 0, count = 0;
  for (const { hz, db } of pts) {
    const b44 = interpolateSpl(series, hz);
    if (!Number.isFinite(b44)) continue;
    sum += Math.abs(b44 - db);
    count++;
  }
  return count > 0 ? sum / count : null;
}

// Mirrors the distance-blend logic in BassResponse exactly.
function resolveEngineModalParams(seat, sub, modalSourceReferenceMode, modalDistanceBlend, modalGainScalar) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  let engineModalRefMode = modalSourceReferenceMode;
  let engineModalGainScalar = modalGainScalar ?? 1.0;

  if (modalSourceReferenceMode === 'distance_blend') {
    const blend = Math.max(0, Math.min(1, modalDistanceBlend));
    if (blend >= 1.0) {
      engineModalRefMode = 'distance_normalized';
    } else if (blend <= 0.0) {
      engineModalRefMode = 'existing';
    } else {
      const dx = sub.x - seat.x;
      const dy = sub.y - seat.y;
      const dz = (Number.isFinite(sub.z) ? sub.z : 0.35) - seatZ;
      const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const fullLossDb = -20 * Math.log10(distM / 1);
      engineModalGainScalar = (modalGainScalar ?? 1.0) * Math.pow(10, (fullLossDb * blend) / 20);
      engineModalRefMode = 'existing';
    }
  }

  return { engineModalRefMode, engineModalGainScalar, seatZ };
}

function runOneSim(roomDims, seat, sub, sourceCurve, surfaceAbsorption, params) {
  const {
    modalSourceReferenceMode, modalDistanceBlend, modalCoherenceMode,
    axialQ, highOrderAxialScale, rewParityModalMagnitudeScale,
    modalGainScalar, enableReflections, disableLateField,
    propagationPhaseScale, pureDeterministicModalSum, disableModalPropagationPhase,
    modalStorageMode,
  } = params;

  const { engineModalRefMode, engineModalGainScalar, seatZ } =
    resolveEngineModalParams(seat, sub, modalSourceReferenceMode, modalDistanceBlend, modalGainScalar);

  let result;
  try {
    result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      sourceCurve,
      {
        enableReflections:           enableReflections ?? false,
        enableModes:                 true,
        surfaceAbsorption,
        freqMinHz:                   20,
        freqMaxHz:                   200,
        smoothing:                   'none',
        modalSourceReferenceMode:    engineModalRefMode,
        modalGainScalar:             engineModalGainScalar,
        axialQ,
        modalStorageMode:            modalStorageMode ?? 'none',
        propagationPhaseScale:       propagationPhaseScale ?? 0,
        pureDeterministicModalSum:   pureDeterministicModalSum ?? true,
        disableModalPropagationPhase: disableModalPropagationPhase ?? true,
        modalCoherenceMode,
        highOrderAxialScale,
        rewParityModalMagnitudeScale,
        debugReflectionOrder:        1,
        disableLateField:            disableLateField ?? true,
      }
    );
  } catch (e) {
    return null;
  }

  if (!result?.freqsHz || !result?.splDbRaw) return null;
  return result.freqsHz.map((hz, i) => ({ frequency: hz, spl: result.splDbRaw[i] }));
}

function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RewParityAutoSweep({
  roomDims, seat, sub, surfaceAbsorption,
  liveB44Series,   // the same data passed to RewBenchmarkComparisonTable
  activeSettings,  // all current BassResponse engine settings
}) {
  const [results, setResults] = useState(null);            // top-10 sweep rows
  const [allScored, setAllScored] = useState(null);        // full scored list for influence analysis
  const [activeRow, setActiveRow] = useState(null);        // current-active computed row
  const [activeSeries, setActiveSeries] = useState(null);  // raw series for active settings
  const [bestSeries, setBestSeries] = useState(null);      // raw series for best sweep result
  const [topSeriesList, setTopSeriesList] = useState(null); // series for top-10 rows (same index)
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  // Compute live MAE from the series already shown in the benchmark table above
  const liveMae = useMemo(() => {
    if (!Array.isArray(liveB44Series) || liveB44Series.length === 0) return null;
    const result = computeMAE(liveB44Series);
    return Number.isFinite(result?.mae) ? result.mae : null;
  }, [liveB44Series]);

  const runSweep = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);
    setAllScored(null);
    setActiveRow(null);
    setActiveSeries(null);
    setBestSeries(null);
    setTopSeriesList(null);

    const sourceCurve = FLAT_SOURCE_CURVE;

    // ── Step 1: run CURRENT ACTIVE SETTINGS first ──────────────────────────
    let activeMetrics = null;
    let computedActiveSeries = null;
    if (activeSettings && seat && sub) {
      computedActiveSeries = runOneSim(roomDims, seat, sub, sourceCurve, surfaceAbsorption, activeSettings);
      if (computedActiveSeries) {
        activeMetrics = computeMAE(computedActiveSeries);
        setActiveSeries(computedActiveSeries);
      }
    }
    setActiveRow(activeMetrics ? {
      mae: activeMetrics.mae,
      worst: activeMetrics.worst,
      modalDistanceBlend: activeSettings?.modalDistanceBlend,
      modalCoherenceMode: activeSettings?.modalCoherenceMode,
      axialQ: activeSettings?.axialQ,
      highOrderAxialScale: activeSettings?.highOrderAxialScale,
      rewParityModalMagnitudeScale: activeSettings?.rewParityModalMagnitudeScale,
    } : null);

    // ── Step 2: sweep grid ─────────────────────────────────────────────────
    const combos = [];
    for (const blend of SWEEP_GRID.modalDistanceBlend)
      for (const coherence of SWEEP_GRID.modalCoherenceMode)
        for (const q of SWEEP_GRID.axialQ)
          for (const hoScale of SWEEP_GRID.highOrderAxialScale)
            for (const magScale of SWEEP_GRID.rewParityModalMagnitudeScale)
              combos.push({
                modalSourceReferenceMode:    'distance_blend',
                modalDistanceBlend:          blend,
                modalCoherenceMode:          coherence,
                axialQ:                      q,
                highOrderAxialScale:         hoScale,
                rewParityModalMagnitudeScale: magScale,
                modalGainScalar:             1.0,
                enableReflections:           false,
                disableLateField:            true,
                propagationPhaseScale:       0,
                pureDeterministicModalSum:   true,
                disableModalPropagationPhase: true,
                modalStorageMode:            'none',
              });

    setTotal(combos.length);
    setProgress(0);

    const scored = [];
    const CHUNK = 20;

    for (let i = 0; i < combos.length; i += CHUNK) {
      const chunk = combos.slice(i, i + CHUNK);
      for (const combo of chunk) {
        const series = runOneSim(roomDims, seat, sub, sourceCurve, surfaceAbsorption, combo);
        if (series) {
          const m = computeMAE(series);
          if (m.mae !== null) scored.push({ ...combo, mae: m.mae, worst: m.worst });
        }
      }
      setProgress(Math.min(i + CHUNK, combos.length));
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    scored.sort((a, b) => a.mae - b.mae);
    setAllScored(scored);
    const top10 = scored.slice(0, 10);
    setResults(top10);

    // Compute series for top-10 (for band error report + freq error report)
    const computedTopSeries = top10.map(combo =>
      runOneSim(roomDims, seat, sub, sourceCurve, surfaceAbsorption, combo)
    );
    setTopSeriesList(computedTopSeries);
    if (computedTopSeries[0]) setBestSeries(computedTopSeries[0]);

    setRunning(false);
    setProgress(combos.length);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  const totalCombos =
    SWEEP_GRID.modalDistanceBlend.length *
    SWEEP_GRID.modalCoherenceMode.length *
    SWEEP_GRID.axialQ.length *
    SWEEP_GRID.highOrderAxialScale.length *
    SWEEP_GRID.rewParityModalMagnitudeScale.length;

  const thStyle = {
    textAlign: 'right', padding: '3px 6px', fontSize: 10, fontWeight: 700,
    background: '#f0fdf4', borderBottom: '2px solid #86efac', color: '#166534',
    whiteSpace: 'nowrap',
  };
  const tdStyle = { textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace' };

  // ── Parameter influence analysis (computed from full scored set) ──────────
  const influenceReport = useMemo(() => {
    if (!allScored || allScored.length === 0) return null;

    const PARAMS = [
      { key: 'modalDistanceBlend',           label: 'Distance blend',        fmt: v => fmt(v, 2) },
      { key: 'modalCoherenceMode',           label: 'Coherence mode',        fmt: v => String(v) },
      { key: 'axialQ',                       label: 'Axial Q',               fmt: v => fmt(v, 1) },
      { key: 'highOrderAxialScale',          label: 'HO axial scale',        fmt: v => fmt(v, 2) },
      { key: 'rewParityModalMagnitudeScale', label: 'Modal magnitude scale', fmt: v => fmt(v, 2) },
    ];

    const report = PARAMS.map(({ key, label, fmt: fmtVal }) => {
      // Group all scored rows by this parameter value
      const byValue = {};
      for (const row of allScored) {
        const v = String(row[key]);
        if (!byValue[v]) byValue[v] = { value: row[key], maes: [] };
        byValue[v].maes.push(row.mae);
      }

      // For each value, compute average MAE across all combos with that value
      const valueSummaries = Object.values(byValue).map(({ value, maes }) => {
        const avg = maes.reduce((s, m) => s + m, 0) / maes.length;
        return { value, avg, best: Math.min(...maes), worst: Math.max(...maes) };
      });

      valueSummaries.sort((a, b) => a.avg - b.avg);

      const bestEntry  = valueSummaries[0];
      const worstEntry = valueSummaries[valueSummaries.length - 1];
      const maeRange   = Number.isFinite(bestEntry?.avg) && Number.isFinite(worstEntry?.avg)
        ? worstEntry.avg - bestEntry.avg
        : null;

      // Overall average MAE across all rows for this parameter (grand mean)
      const allMaes    = allScored.map(r => r.mae).filter(Number.isFinite);
      const avgMae     = allMaes.length > 0 ? allMaes.reduce((s, m) => s + m, 0) / allMaes.length : null;

      // Influence level
      let influence = 'inert';
      if (maeRange !== null) {
        if (maeRange >= 2.0) influence = 'high';
        else if (maeRange >= 0.5) influence = 'medium';
        else if (maeRange >= 0.1) influence = 'low';
      }

      return {
        label,
        bestValue:    bestEntry ? fmtVal(bestEntry.value) : '—',
        bestAvgMae:   bestEntry?.avg ?? null,
        worstAvgMae:  worstEntry?.avg ?? null,
        avgMae,
        maeRange,
        influence,
      };
    });

    // Sort by MAE spread descending
    report.sort((a, b) => (b.maeRange ?? 0) - (a.maeRange ?? 0));
    return report;
  }, [allScored]);

  // ── Per-frequency error report ───────────────────────────────────────────────
  const freqErrorReport = useMemo(() => {
    if (!activeSeries) return null;
    const rows = REW_BENCHMARK.map(({ hz, db: rewTarget }) => {
      const currentB44  = interpolateSpl(activeSeries, hz);
      const currentErr  = Number.isFinite(currentB44) ? currentB44 - rewTarget : null;
      const bestB44     = bestSeries ? interpolateSpl(bestSeries, hz) : null;
      const bestErr     = Number.isFinite(bestB44) ? bestB44 - rewTarget : null;
      const improvement = (currentErr !== null && bestErr !== null)
        ? Math.abs(currentErr) - Math.abs(bestErr)
        : null;
      return { hz, rewTarget, currentB44, currentErr, bestB44, bestErr, improvement };
    });
    // Sort by largest absolute current error first
    rows.sort((a, b) => Math.abs(b.currentErr ?? 0) - Math.abs(a.currentErr ?? 0));
    return rows;
  }, [activeSeries, bestSeries]);

  // ── Band MAE report (top-10 + active) ────────────────────────────────────────
  const BANDS = [
    { label: '20–40', lo: 20,  hi: 40  },
    { label: '40–80', lo: 40,  hi: 80  },
    { label: '80–120', lo: 80, hi: 120 },
    { label: '120–200', lo: 120, hi: 200 },
  ];

  const bandErrorReport = useMemo(() => {
    if (!results || !topSeriesList) return null;
    const rows = results.map((row, i) => {
      const series = topSeriesList[i];
      return {
        rank: i + 1,
        mae: row.mae,
        bands: BANDS.map(({ lo, hi }) => series ? computeBandMAE(series, lo, hi) : null),
        settings: `blend=${fmt(row.modalDistanceBlend,2)} ${row.modalCoherenceMode} Q=${fmt(row.axialQ,1)} ho=${fmt(row.highOrderAxialScale,2)} mag=${fmt(row.rewParityModalMagnitudeScale,2)}`,
      };
    });

    const activeEntry = activeSeries ? {
      rank: null,
      mae: activeRow?.mae ?? null,
      bands: BANDS.map(({ lo, hi }) => computeBandMAE(activeSeries, lo, hi)),
      settings: `blend=${fmt(activeRow?.modalDistanceBlend,2)} ${activeRow?.modalCoherenceMode ?? '—'} Q=${fmt(activeRow?.axialQ,1)} ho=${fmt(activeRow?.highOrderAxialScale,2)} mag=${fmt(activeRow?.rewParityModalMagnitudeScale,2)}`,
    } : null;

    return { rows, activeEntry };
  }, [results, topSeriesList, activeSeries, activeRow]);

  // Mismatch check: only compare when both values are valid finite numbers
  const activeRowMae = Number.isFinite(activeRow?.mae) ? activeRow.mae : null;
  const maeDelta = activeRowMae !== null && liveMae !== null
    ? Math.abs(activeRowMae - liveMae)
    : null;
  const hasMismatch = maeDelta !== null && maeDelta > 0.05;

  return (
    <div style={{
      marginTop: 12,
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
        Grid: {SWEEP_GRID.modalDistanceBlend.length} blend × {SWEEP_GRID.modalCoherenceMode.length} coherence × {SWEEP_GRID.axialQ.length} Q × {SWEEP_GRID.highOrderAxialScale.length} hoScale × {SWEEP_GRID.rewParityModalMagnitudeScale.length} magScale = <strong>{totalCombos} combinations</strong>. Source: flat 94 dB REW reference. Top 10 by lowest MAE.
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
        <div style={{ marginBottom: 8 }}>
          <div style={{ background: '#dcfce7', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ background: '#16a34a', height: '100%', width: `${(progress / total) * 100}%`, transition: 'width 0.1s' }} />
          </div>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#4ade80' }}>{Math.round((progress / total) * 100)}%</span>
        </div>
      )}

      {/* ── Mismatch warning ── */}
      {hasMismatch && (
        <div style={{
          marginBottom: 8, padding: '6px 10px', borderRadius: 6,
          background: '#fef2f2', border: '2px solid #fca5a5',
          fontSize: 10, fontFamily: 'monospace', color: '#dc2626', fontWeight: 700,
        }}>
          ⚠ SWEEP MISMATCH — active settings do not match live benchmark
          <div style={{ fontWeight: 400, marginTop: 2, color: '#991b1b' }}>
            Sweep "current active" MAE = {fmt(activeRowMae, 3)} dB &nbsp;|&nbsp;
            Live benchmark MAE = {fmt(liveMae, 3)} dB &nbsp;|&nbsp;
            Δ = {maeDelta !== null ? fmt(maeDelta, 3) : '—'} dB
          </div>
          <div style={{ fontWeight: 400, marginTop: 2, color: '#991b1b', fontSize: 9 }}>
            The sweep engine path does not reproduce the live graph. Check that activeSettings props match the production BassResponse engine call exactly.
          </div>
        </div>
      )}

      {/* ── Match confirmation ── */}
      {activeRowMae !== null && liveMae !== null && !hasMismatch && (
        <div style={{
          marginBottom: 8, padding: '4px 8px', borderRadius: 6,
          background: '#dcfce7', border: '1px solid #86efac',
          fontSize: 10, fontFamily: 'monospace', color: '#166534',
        }}>
          ✓ Sweep engine matches live benchmark (Δ = {maeDelta !== null ? fmt(maeDelta, 3) : '—'} dB)
          &nbsp;|&nbsp; sweep MAE = {fmt(activeRowMae, 3)} dB · live MAE = {fmt(liveMae, 3)} dB
        </div>
      )}

      {/* ── Results table ── */}
      {(activeRow || (results && results.length > 0)) && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>Rank</th>
                <th style={thStyle}>MAE (dB)</th>
                <th style={thStyle}>Worst (dB)</th>
                <th style={thStyle}>Dist blend</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Coherence</th>
                <th style={thStyle}>Axial Q</th>
                <th style={thStyle}>HO axial</th>
                <th style={thStyle}>Mag scale</th>
              </tr>
            </thead>
            <tbody>
              {/* Fixed first row: current active settings */}
              {activeRow && (
                <tr style={{ borderBottom: '2px solid #86efac', background: '#fff7ed' }}>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700, color: '#b45309', fontSize: 9 }}>
                    ★ CURRENT
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: hasMismatch ? '#dc2626' : '#b45309' }}>
                    {activeRowMae !== null ? fmt(activeRowMae, 3) : 'Calculating…'}
                    {hasMismatch && ' ⚠'}
                  </td>
                  <td style={{ ...tdStyle, color: Number.isFinite(activeRow?.worst) && activeRow.worst > 5 ? '#dc2626' : Number.isFinite(activeRow?.worst) && activeRow.worst > 3 ? '#b45309' : '#374151' }}>
                    {fmt(activeRow?.worst, 3)}
                  </td>
                  <td style={{ ...tdStyle, color: '#78350f' }}>{fmt(activeRow.modalDistanceBlend, 2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', color: '#78350f' }}>{activeRow.modalCoherenceMode ?? '—'}</td>
                  <td style={{ ...tdStyle, color: '#78350f' }}>{fmt(activeRow.axialQ, 1)}</td>
                  <td style={{ ...tdStyle, color: '#78350f' }}>{fmt(activeRow.highOrderAxialScale, 2)}</td>
                  <td style={{ ...tdStyle, color: '#78350f' }}>{fmt(activeRow.rewParityModalMagnitudeScale, 2)}</td>
                </tr>
              )}
              {/* Sweep top-10 */}
              {results && results.map((row, i) => (
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

      {/* ── REW Parity Sensitivity Report ── */}
      {influenceReport && (
        <div style={{ marginTop: 14, borderTop: '1px solid #86efac', paddingTop: 10 }}>
          <div style={{ fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
            REW Parity Sensitivity Report
            <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
              {allScored.length} combinations · sorted by MAE spread ↓ · diagnostic only
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580 }}>
              <thead>
                <tr>
                  {[
                    ['left',  'Parameter'],
                    ['left',  'Best setting'],
                    ['right', 'Best MAE'],
                    ['right', 'Avg MAE'],
                    ['right', 'Worst MAE'],
                    ['right', 'MAE spread'],
                  ].map(([align, label]) => (
                    <th key={label} style={{
                      textAlign: align, padding: '3px 6px', fontSize: 10, fontWeight: 700,
                      background: '#f0fdf4', borderBottom: '2px solid #86efac', color: '#166534',
                      whiteSpace: 'nowrap',
                    }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {influenceReport.map((row, i) => {
                  const spreadColor = row.influence === 'high'   ? '#dc2626'
                    : row.influence === 'medium' ? '#b45309'
                    : row.influence === 'low'    ? '#0369a1'
                    : '#6b7280';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #dcfce7', background: i === 0 ? '#fef9c3' : i % 2 === 0 ? '#f0fdf4' : undefined }}>
                      <td style={{ textAlign: 'left',  padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#166534' }}>{row.label}</td>
                      <td style={{ textAlign: 'left',  padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>{row.bestValue}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', color: '#15803d', fontWeight: 700 }}>{fmt(row.bestAvgMae, 3)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', color: '#374151' }}>{fmt(row.avgMae, 3)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', color: '#b91c1c' }}>{fmt(row.worstAvgMae, 3)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: spreadColor }}>{fmt(row.maeRange, 3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'monospace', color: '#374151' }}>
            Most influential parameter: <strong style={{ color: influenceReport[0]?.maeRange > 0 ? '#b45309' : '#6b7280' }}>{influenceReport[0]?.label ?? '—'}</strong>
            {influenceReport[0]?.maeRange > 0 && (
              <span style={{ color: '#6b7280' }}> (spread = {fmt(influenceReport[0].maeRange, 3)} dB)</span>
            )}
          </div>
        </div>
      )}

      {/* ── REW Parity Band Error Report ── */}
      {bandErrorReport && (
        <div style={{ marginTop: 14, borderTop: '1px solid #86efac', paddingTop: 10 }}>
          <div style={{ fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
            REW Parity Band Error Report
            <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
              top-10 sweep results · MAE per frequency band · diagnostic only
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Rank</th>
                  <th style={thStyle}>Overall MAE</th>
                  {BANDS.map(b => (
                    <th key={b.label} style={thStyle}>{b.label} MAE</th>
                  ))}
                  <th style={{ ...thStyle, textAlign: 'left' }}>Settings</th>
                </tr>
              </thead>
              <tbody>
                {/* Active settings row */}
                {bandErrorReport.activeEntry && (() => {
                  const ae = bandErrorReport.activeEntry;
                  return (
                    <tr style={{ borderBottom: '2px solid #86efac', background: '#fff7ed' }}>
                      <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700, color: '#b45309', fontSize: 9 }}>★ CURRENT</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#b45309' }}>{fmt(ae.mae, 3)}</td>
                      {ae.bands.map((v, bi) => (
                        <td key={bi} style={{ ...tdStyle, color: (v ?? 0) > 5 ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151', fontWeight: 600 }}>
                          {fmt(v, 2)}
                        </td>
                      ))}
                      <td style={{ ...tdStyle, textAlign: 'left', fontSize: 9, color: '#78350f' }}>{ae.settings}</td>
                    </tr>
                  );
                })()}
                {/* Top-10 sweep rows */}
                {bandErrorReport.rows.map((row, i) => {
                  const isBest = i === 0;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #bbf7d0', background: isBest ? '#dcfce7' : i < 3 ? '#f0fdf4' : undefined }}>
                      <td style={{ ...tdStyle, textAlign: 'left', fontWeight: isBest ? 700 : 400, color: isBest ? '#166534' : '#374151' }}>
                        {isBest ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `#${row.rank}`}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: isBest ? 700 : 400, color: isBest ? '#166534' : '#374151' }}>
                        {fmt(row.mae, 3)}
                      </td>
                      {row.bands.map((v, bi) => {
                        const activeBand = bandErrorReport.activeEntry?.bands[bi];
                        const improved = v !== null && activeBand !== null && v < activeBand;
                        const worse    = v !== null && activeBand !== null && v > activeBand;
                        return (
                          <td key={bi} style={{
                            ...tdStyle,
                            fontWeight: isBest ? 700 : 400,
                            color: improved ? '#15803d' : worse ? '#dc2626' : (v ?? 0) > 5 ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151',
                          }}>
                            {fmt(v, 2)}{improved ? ' ▼' : worse ? ' ▲' : ''}
                          </td>
                        );
                      })}
                      <td style={{ ...tdStyle, textAlign: 'left', fontSize: 9, color: '#374151' }}>{row.settings}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
            ▼ = better than current · ▲ = worse than current · compared against ★ CURRENT row
          </div>
        </div>
      )}

      {/* ── REW Parity Frequency Tilt Sweep ── */}
      <RewParityTiltSweep
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        surfaceAbsorption={surfaceAbsorption}
        activeSettings={activeSettings}
      />

      {/* ── REW Parity Modal Architecture Sweep ── */}
      <RewParityArchitectureSweep
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        surfaceAbsorption={surfaceAbsorption}
        activeSettings={activeSettings}
      />

      {/* ── REW Parity Frequency Error Report ── */}
      {freqErrorReport && (
        <div style={{ marginTop: 14, borderTop: '1px solid #86efac', paddingTop: 10 }}>
          <div style={{ fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
            REW Parity Frequency Error Report
            <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
              sorted by |current error| ↓ · diagnostic only
              {!bestSeries && <span style={{ color: '#b45309', marginLeft: 6 }}>· run sweep for Best column</span>}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
              <thead>
                <tr>
                  {[
                    ['right', 'Hz'],
                    ['right', 'REW target'],
                    ['right', 'Current B44'],
                    ['right', 'Current err'],
                    ['right', 'Best B44'],
                    ['right', 'Best err'],
                    ['right', 'Improvement'],
                  ].map(([align, label]) => (
                    <th key={label} style={{
                      textAlign: align, padding: '3px 6px', fontSize: 10, fontWeight: 700,
                      background: '#f0fdf4', borderBottom: '2px solid #86efac', color: '#166534',
                      whiteSpace: 'nowrap',
                    }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {freqErrorReport.map((row, i) => {
                  const absErr   = Math.abs(row.currentErr ?? 0);
                  const errColor = absErr >= 5 ? '#dc2626' : absErr >= 3 ? '#b45309' : absErr >= 1.5 ? '#854d0e' : '#374151';
                  const impColor = (row.improvement ?? 0) > 0.1 ? '#15803d'
                    : (row.improvement ?? 0) < -0.1 ? '#dc2626'
                    : '#6b7280';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #dcfce7', background: i % 2 === 0 ? '#f0fdf4' : undefined }}>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#166534' }}>{row.hz}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', color: '#374151' }}>{fmt(row.rewTarget, 1)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>{fmt(row.currentB44, 2)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: errColor }}>
                        {row.currentErr !== null ? (row.currentErr >= 0 ? '+' : '') + fmt(row.currentErr, 2) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', color: '#374151' }}>{row.bestB44 !== null ? fmt(row.bestB44, 2) : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', color: row.bestErr !== null ? errColor : '#6b7280' }}>
                        {row.bestErr !== null ? (row.bestErr >= 0 ? '+' : '') + fmt(row.bestErr, 2) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: impColor }}>
                        {row.improvement !== null ? (row.improvement >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(row.improvement), 2) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Top 5 summary */}
          <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'monospace', color: '#374151' }}>
            <span style={{ fontWeight: 700, color: '#166534' }}>Top 5 frequencies contributing most to MAE: </span>
            {freqErrorReport.slice(0, 5).map((row, i) => (
              <span key={row.hz}>
                <span style={{ fontWeight: 700, color: Math.abs(row.currentErr ?? 0) >= 5 ? '#dc2626' : '#b45309' }}>
                  {row.hz} Hz
                </span>
                <span style={{ color: '#6b7280' }}>
                  {' '}({row.currentErr !== null ? (row.currentErr >= 0 ? '+' : '') + fmt(row.currentErr, 2) : '—'} dB)
                </span>
                {i < 4 && <span style={{ color: '#86efac' }}> · </span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}