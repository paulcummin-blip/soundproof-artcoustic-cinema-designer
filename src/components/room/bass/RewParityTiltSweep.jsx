// RewParityTiltSweep.jsx
// Diagnostic-only: sweeps low-band and high-band spectral scale factors to identify
// whether the remaining REW parity error is caused by frequency-dependent scaling.
// Does NOT modify the active simulation, defaults, or engine.

import React, { useState, useCallback, useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

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

const LOW_BAND_SCALES  = [0.80, 0.85, 0.90, 0.95, 1.00, 1.05];
const HIGH_BAND_SCALES = [0.80, 0.85, 0.90, 0.95, 1.00, 1.05];

const FLAT_SOURCE_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const BANDS = [
  { label: '20–40',   lo: 20,  hi: 40  },
  { label: '40–80',   lo: 40,  hi: 80  },
  { label: '80–120',  lo: 80,  hi: 120 },
  { label: '120–200', lo: 120, hi: 200 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Apply per-point dB scaling: points below 40Hz get lowScale, above 150Hz get highScale.
// Points in between are interpolated linearly between the two scales.
function applyTiltScale(series, lowScale, highScale) {
  return series.map(pt => {
    const hz = pt.frequency;
    let scale;
    if (hz <= 40)  scale = lowScale;
    else if (hz >= 150) scale = highScale;
    else {
      // linear blend between 40Hz and 150Hz
      const t = (hz - 40) / (150 - 40);
      scale = lowScale + (highScale - lowScale) * t;
    }
    // scale is a linear amplitude multiplier — convert to dB offset: 20*log10(scale)
    const dbOffset = 20 * Math.log10(Math.max(0.001, scale));
    return { frequency: hz, spl: pt.spl + dbOffset };
  });
}

function computeMetrics(series) {
  let sumAbsErr = 0, worstErr = 0, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const b44 = interpolateSpl(series, hz);
    if (!Number.isFinite(b44)) continue;
    const absErr = Math.abs(b44 - db);
    sumAbsErr += absErr;
    if (absErr > worstErr) worstErr = absErr;
    count++;
  }
  if (count === 0) return { mae: null, worst: null, bands: BANDS.map(() => null) };
  const mae = sumAbsErr / count;
  const bands = BANDS.map(({ lo, hi }) => {
    const pts = REW_BENCHMARK.filter(p => p.hz >= lo && p.hz <= hi);
    if (pts.length === 0) return null;
    let s = 0, c = 0;
    for (const { hz, db } of pts) {
      const v = interpolateSpl(series, hz);
      if (!Number.isFinite(v)) continue;
      s += Math.abs(v - db); c++;
    }
    return c > 0 ? s / c : null;
  });
  return { mae, worst: worstErr, bands };
}

function resolveEngineModalParams(seat, sub, modalSourceReferenceMode, modalDistanceBlend, modalGainScalar) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  let engineModalRefMode  = modalSourceReferenceMode;
  let engineModalGainScalar = modalGainScalar ?? 1.0;
  if (modalSourceReferenceMode === 'distance_blend') {
    const blend = Math.max(0, Math.min(1, modalDistanceBlend));
    if (blend >= 1.0) {
      engineModalRefMode = 'distance_normalized';
    } else if (blend <= 0.0) {
      engineModalRefMode = 'existing';
    } else {
      const dx = sub.x - seat.x, dy = sub.y - seat.y;
      const dz = (Number.isFinite(sub.z) ? sub.z : 0.35) - seatZ;
      const distM = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
      const fullLossDb = -20 * Math.log10(distM / 1);
      engineModalGainScalar = (modalGainScalar ?? 1.0) * Math.pow(10, (fullLossDb * blend) / 20);
      engineModalRefMode = 'existing';
    }
  }
  return { engineModalRefMode, engineModalGainScalar, seatZ };
}

function runBaseSim(roomDims, seat, sub, activeSettings) {
  const {
    modalSourceReferenceMode, modalDistanceBlend, modalCoherenceMode,
    axialQ, highOrderAxialScale, rewParityModalMagnitudeScale,
    modalGainScalar, enableReflections, disableLateField,
    propagationPhaseScale, pureDeterministicModalSum, disableModalPropagationPhase,
    modalStorageMode,
  } = activeSettings;

  const { engineModalRefMode, engineModalGainScalar, seatZ } =
    resolveEngineModalParams(seat, sub, modalSourceReferenceMode, modalDistanceBlend, modalGainScalar);

  let result;
  try {
    result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      FLAT_SOURCE_CURVE,
      {
        enableReflections:            enableReflections ?? false,
        enableModes:                  true,
        surfaceAbsorption:            activeSettings.surfaceAbsorption,
        freqMinHz:                    20,
        freqMaxHz:                    200,
        smoothing:                    'none',
        modalSourceReferenceMode:     engineModalRefMode,
        modalGainScalar:              engineModalGainScalar,
        axialQ,
        modalStorageMode:             modalStorageMode ?? 'none',
        propagationPhaseScale:        propagationPhaseScale ?? 0,
        pureDeterministicModalSum:    pureDeterministicModalSum ?? true,
        disableModalPropagationPhase: disableModalPropagationPhase ?? true,
        modalCoherenceMode,
        highOrderAxialScale,
        rewParityModalMagnitudeScale,
        debugReflectionOrder:         1,
        disableLateField:             disableLateField ?? true,
      }
    );
  } catch { return null; }
  if (!result?.freqsHz || !result?.splDbRaw) return null;
  return result.freqsHz.map((hz, i) => ({ frequency: hz, spl: result.splDbRaw[i] }));
}

function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

const thStyle = {
  textAlign: 'right', padding: '3px 6px', fontSize: 10, fontWeight: 700,
  background: '#f0fdf4', borderBottom: '2px solid #86efac', color: '#166534',
  whiteSpace: 'nowrap',
};
const tdStyle = { textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace' };

// ── Component ─────────────────────────────────────────────────────────────────
export default function RewParityTiltSweep({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [tiltResults, setTiltResults]   = useState(null);   // sorted scored combos (all)
  const [currentMetrics, setCurrentMetrics] = useState(null); // metrics for current (scale 1,1)
  const [running, setRunning]           = useState(false);
  const [progress, setProgress]         = useState(0);
  const [total, setTotal]               = useState(0);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null &&
    activeSettings
  );

  const runTiltSweep = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setTiltResults(null);
    setCurrentMetrics(null);

    // Run the base simulation once — all tilt combos just post-process this
    const baseSeries = runBaseSim(roomDims, seat, sub, { ...activeSettings, surfaceAbsorption });
    if (!baseSeries) { setRunning(false); return; }

    // Current active (scale 1.0 / 1.0)
    const currentM = computeMetrics(baseSeries);
    setCurrentMetrics(currentM);

    // Build combo list
    const combos = [];
    for (const lo of LOW_BAND_SCALES)
      for (const hi of HIGH_BAND_SCALES)
        combos.push({ lowScale: lo, highScale: hi });

    setTotal(combos.length);
    setProgress(0);

    const scored = [];
    const CHUNK = 10;

    for (let i = 0; i < combos.length; i += CHUNK) {
      const chunk = combos.slice(i, i + CHUNK);
      for (const { lowScale, highScale } of chunk) {
        const tilted  = applyTiltScale(baseSeries, lowScale, highScale);
        const metrics = computeMetrics(tilted);
        if (metrics.mae !== null) scored.push({ lowScale, highScale, ...metrics });
      }
      setProgress(Math.min(i + CHUNK, combos.length));
      await new Promise(r => setTimeout(r, 0));
    }

    scored.sort((a, b) => a.mae - b.mae);
    setTiltResults(scored);
    setRunning(false);
    setProgress(combos.length);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  const totalCombos = LOW_BAND_SCALES.length * HIGH_BAND_SCALES.length;

  // Tilt sensitivity summary
  const tiltSummary = useMemo(() => {
    if (!tiltResults || tiltResults.length === 0 || !currentMetrics?.mae) return null;
    const best = tiltResults[0];
    const maeDelta  = currentMetrics.mae - best.mae;
    const worstDelta = (currentMetrics.worst ?? 0) - (best.worst ?? 0);
    return { best, maeDelta, worstDelta, currentMae: currentMetrics.mae };
  }, [tiltResults, currentMetrics]);

  // Show top 36 (all combos — 6×6 = 36 total)
  const displayRows = tiltResults;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #86efac', paddingTop: 10 }}>
      <div style={{ fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Frequency Tilt Sweep
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {LOW_BAND_SCALES.length} low-band × {HIGH_BAND_SCALES.length} high-band = {totalCombos} combos · diagnostic only · does not modify active simulation
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 8 }}>
        Low band scale applied ≤40 Hz · High band scale applied ≥150 Hz · linear blend 40–150 Hz · all other settings fixed to current active
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dimensions, a valid seat, a valid sub, and active settings to run.
        </div>
      )}

      <button
        onClick={runTiltSweep}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #0369a1', background: running ? '#e5e7eb' : '#0369a1',
          color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {running ? `Running… ${progress} / ${total}` : (tiltResults ? 'Re-run tilt sweep' : 'Run tilt sweep')}
      </button>

      {running && total > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ background: '#dbeafe', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ background: '#0369a1', height: '100%', width: `${(progress / total) * 100}%`, transition: 'width 0.1s' }} />
          </div>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#0369a1' }}>{Math.round((progress / total) * 100)}%</span>
        </div>
      )}

      {/* ── Main results table ── */}
      {(displayRows || currentMetrics) && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>Rank</th>
                <th style={thStyle}>Overall MAE</th>
                <th style={thStyle}>Worst Err</th>
                <th style={thStyle}>Low Scale</th>
                <th style={thStyle}>High Scale</th>
                {BANDS.map(b => <th key={b.label} style={thStyle}>{b.label} MAE</th>)}
              </tr>
            </thead>
            <tbody>
              {/* ★ CURRENT row */}
              {currentMetrics && (
                <tr style={{ borderBottom: '2px solid #86efac', background: '#fff7ed' }}>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700, color: '#b45309', fontSize: 9 }}>★ CURRENT</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#b45309' }}>{fmt(currentMetrics.mae, 3)}</td>
                  <td style={{ ...tdStyle, color: (currentMetrics.worst ?? 0) > 5 ? '#dc2626' : '#b45309', fontWeight: 600 }}>
                    {fmt(currentMetrics.worst, 3)}
                  </td>
                  <td style={{ ...tdStyle, color: '#78350f' }}>1.00</td>
                  <td style={{ ...tdStyle, color: '#78350f' }}>1.00</td>
                  {currentMetrics.bands.map((v, bi) => (
                    <td key={bi} style={{ ...tdStyle, color: (v ?? 0) > 5 ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151', fontWeight: 600 }}>
                      {fmt(v, 2)}
                    </td>
                  ))}
                </tr>
              )}
              {/* Sweep rows */}
              {displayRows && displayRows.map((row, i) => {
                const isBest = i === 0;
                const isIdentity = row.lowScale === 1.0 && row.highScale === 1.0;
                return (
                  <tr key={i} style={{
                    borderBottom: '1px solid #bbf7d0',
                    background: isBest ? '#dcfce7' : isIdentity ? '#fef9c3' : i < 3 ? '#f0fdf4' : undefined,
                  }}>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: isBest ? 700 : 400, color: isBest ? '#166534' : '#374151' }}>
                      {isBest ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `#${i + 1}`}
                      {isIdentity && <span style={{ fontSize: 8, color: '#b45309', marginLeft: 4 }}>identity</span>}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: isBest ? 700 : 400, color: isBest ? '#166534' : '#374151' }}>
                      {fmt(row.mae, 3)}
                    </td>
                    <td style={{ ...tdStyle, color: (row.worst ?? 0) > 5 ? '#dc2626' : (row.worst ?? 0) > 3 ? '#b45309' : '#374151' }}>
                      {fmt(row.worst, 3)}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: row.lowScale !== 1.0 ? 700 : 400, color: row.lowScale < 1.0 ? '#0369a1' : row.lowScale > 1.0 ? '#dc2626' : '#374151' }}>
                      {row.lowScale.toFixed(2)}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: row.highScale !== 1.0 ? 700 : 400, color: row.highScale < 1.0 ? '#0369a1' : row.highScale > 1.0 ? '#dc2626' : '#374151' }}>
                      {row.highScale.toFixed(2)}
                    </td>
                    {row.bands.map((v, bi) => {
                      const activeBand = currentMetrics?.bands[bi];
                      const improved = v !== null && activeBand !== null && v < activeBand - 0.01;
                      const worse    = v !== null && activeBand !== null && v > activeBand + 0.01;
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tilt Sensitivity Summary ── */}
      {tiltSummary && (
        <div style={{ marginTop: 12, borderTop: '1px dashed #86efac', paddingTop: 8 }}>
          <div style={{ fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
            REW Parity Tilt Sensitivity Report
            <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
              diagnostic summary
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
            {[
              { label: 'Best Low Band Scale',      value: tiltSummary.best.lowScale.toFixed(2),  note: tiltSummary.best.lowScale === 1.0 ? 'no change' : tiltSummary.best.lowScale < 1.0 ? 'attenuated' : 'boosted' },
              { label: 'Best High Band Scale',     value: tiltSummary.best.highScale.toFixed(2), note: tiltSummary.best.highScale === 1.0 ? 'no change' : tiltSummary.best.highScale < 1.0 ? 'attenuated' : 'boosted' },
              { label: 'Current MAE',              value: fmt(tiltSummary.currentMae, 3) + ' dB', note: 'baseline' },
              { label: 'Best MAE',                 value: fmt(tiltSummary.best.mae, 3) + ' dB',  note: '🥇 winner' },
              { label: 'MAE Improvement',          value: (tiltSummary.maeDelta >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(tiltSummary.maeDelta), 3) + ' dB', note: tiltSummary.maeDelta > 0.5 ? 'significant tilt bias' : tiltSummary.maeDelta > 0.1 ? 'mild tilt bias' : 'negligible — error is modal' },
              { label: 'Worst Error Improvement',  value: (tiltSummary.worstDelta >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(tiltSummary.worstDelta), 3) + ' dB', note: '' },
            ].map(({ label, value, note }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>{value}</div>
                {note && <div style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>{note}</div>}
              </div>
            ))}
          </div>

          {/* Diagnostic conclusion */}
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: tiltSummary.maeDelta > 0.5 ? '#fef3c7' : '#dcfce7',
            border: `1px solid ${tiltSummary.maeDelta > 0.5 ? '#fbbf24' : '#86efac'}`,
            fontSize: 10, fontFamily: 'monospace',
            color: tiltSummary.maeDelta > 0.5 ? '#92400e' : '#166534',
          }}>
            {tiltSummary.maeDelta > 0.5 ? (
              <>
                <strong>⚠ Spectral tilt bias detected.</strong> The best tilt combination reduces MAE by {fmt(tiltSummary.maeDelta, 2)} dB.
                This suggests the remaining parity error has a significant <strong>frequency-dependent scaling</strong> component
                (low={tiltSummary.best.lowScale.toFixed(2)}, high={tiltSummary.best.highScale.toFixed(2)}).
                Consider reviewing the source curve or modal gain scaling in the engine.
              </>
            ) : tiltSummary.maeDelta > 0.1 ? (
              <>
                <strong>Mild tilt sensitivity.</strong> Best improvement = {fmt(tiltSummary.maeDelta, 2)} dB.
                The error is mostly modal in origin, but a small spectral slope component may be present.
              </>
            ) : (
              <>
                <strong>✓ Error is modal, not tilt-related.</strong> Tilt scaling provides negligible improvement ({fmt(tiltSummary.maeDelta, 2)} dB).
                The remaining parity gap is caused by <strong>modal behaviour</strong>, not incorrect spectral balance.
              </>
            )}
          </div>

          <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
            ▼ = improved vs current · ▲ = worse · "identity" = 1.0/1.0 combo matches unscaled result
          </div>
        </div>
      )}
    </div>
  );
}