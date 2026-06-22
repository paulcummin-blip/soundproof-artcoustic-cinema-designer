/**
 * RewParityTangentialSweep
 *
 * Diagnostic-only. Sweeps tangentialFamilyScale from 1.00 down to 0.40,
 * keeping axial = 1.0 and oblique = 1.0 fixed.
 * Reports MAE, worst error, worst frequency, and band errors.
 * Does NOT alter the production engine or live graph.
 */
import React, { useState, useCallback } from 'react';
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

const TANGENTIAL_SCALES = [1.00, 0.90, 0.80, 0.70, 0.60, 0.50, 0.40];

const FLAT_SOURCE_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const BAND_DEFS = [
  { label: '50–60 Hz',   lo: 50,  hi: 60  },
  { label: '70–80 Hz',   lo: 70,  hi: 80  },
  { label: '90–110 Hz',  lo: 90,  hi: 110 },
];

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

function computeMetrics(series) {
  let sumAbs = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const b44 = interpolateSpl(series, hz);
    if (b44 === null || !Number.isFinite(b44)) continue;
    const abs = Math.abs(b44 - db);
    sumAbs += abs;
    if (abs > worstErr) { worstErr = abs; worstHz = hz; }
    count++;
  }
  if (count === 0) return null;
  return { mae: sumAbs / count, worst: worstErr, worstHz };
}

function computeBandMAE(series, lo, hi) {
  const pts = REW_BENCHMARK.filter(p => p.hz >= lo && p.hz <= hi);
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

function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

function runSim(roomDims, seat, sub, surfaceAbsorption, activeSettings, tangentialScale) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  let result;
  try {
    result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      FLAT_SOURCE_CURVE,
      {
        enableReflections:             activeSettings?.enableReflections           ?? false,
        enableModes:                   true,
        surfaceAbsorption,
        freqMinHz:                     20,
        freqMaxHz:                     200,
        smoothing:                     'none',
        modalSourceReferenceMode:      activeSettings?.modalSourceReferenceMode    ?? 'existing',
        modalGainScalar:               activeSettings?.modalGainScalar             ?? 1.0,
        axialQ:                        activeSettings?.axialQ                      ?? 8,
        modalStorageMode:              'none',
        propagationPhaseScale:         activeSettings?.propagationPhaseScale       ?? 0,
        pureDeterministicModalSum:     activeSettings?.pureDeterministicModalSum   ?? true,
        disableModalPropagationPhase:  activeSettings?.disableModalPropagationPhase ?? true,
        modalCoherenceMode:            activeSettings?.modalCoherenceMode          ?? 'coherent',
        highOrderAxialScale:           activeSettings?.highOrderAxialScale         ?? 1.0,
        rewParityModalMagnitudeScale:  activeSettings?.rewParityModalMagnitudeScale ?? 1.0,
        debugReflectionOrder:          1,
        disableLateField:              activeSettings?.disableLateField            ?? true,
        // The sweep parameter:
        tangentialFamilyScale:         tangentialScale,
        // Keep axial and oblique unchanged:
        axialFamilyScale:              1.0,
        obliqueFamilyScale:            1.0,
      }
    );
  } catch {
    return null;
  }
  if (!result?.freqsHz || !result?.splDbRaw) return null;
  return result.freqsHz.map((hz, i) => ({ frequency: hz, spl: result.splDbRaw[i] }));
}

const thStyle = {
  textAlign: 'right', padding: '3px 6px', fontSize: 10, fontWeight: 700,
  background: '#f0fdf4', borderBottom: '2px solid #86efac', color: '#166534',
  whiteSpace: 'nowrap',
};
const tdStyle = { textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace' };

export default function RewParityTangentialSweep({
  roomDims, seat, sub, surfaceAbsorption, activeSettings,
}) {
  const [rows, setRows]       = useState(null);
  const [running, setRunning] = useState(false);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  const runSweep = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setRows(null);

    await new Promise(r => setTimeout(r, 0)); // yield to UI

    const computed = TANGENTIAL_SCALES.map(scale => {
      const series  = runSim(roomDims, seat, sub, surfaceAbsorption, activeSettings, scale);
      const metrics = series ? computeMetrics(series) : null;
      const bands   = BAND_DEFS.map(({ lo, hi }) =>
        series ? computeBandMAE(series, lo, hi) : null
      );
      return { scale, metrics, bands };
    });

    // find best MAE index
    let bestIdx = 0;
    let bestMae = Infinity;
    computed.forEach((r, i) => {
      if (r.metrics?.mae != null && r.metrics.mae < bestMae) {
        bestMae = r.metrics.mae;
        bestIdx = i;
      }
    });
    computed.forEach((r, i) => { r.isBest = i === bestIdx; });

    setRows(computed);
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid #86efac', borderRadius: 8,
      background: '#f0fdf4', padding: '10px 12px',
    }}>
      <div style={{ fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
        Tangential Weight Sweep
        <span style={{ fontWeight: 400, color: '#4ade80', marginLeft: 8, fontSize: 10 }}>
          diagnostic only · axial = 1.0, oblique = 1.0 fixed · does not affect active simulation
        </span>
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dimensions, a valid seat, and a valid sub to run.
        </div>
      )}

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
        {running ? 'Running…' : rows ? 'Re-run' : 'Run tangential sweep'}
      </button>

      {rows && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 540 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'center' }}>Tang. scale</th>
                <th style={thStyle}>MAE (dB)</th>
                <th style={thStyle}>Worst err (dB)</th>
                <th style={thStyle}>Worst Hz</th>
                {BAND_DEFS.map(b => (
                  <th key={b.label} style={thStyle}>{b.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const { scale, metrics, bands, isBest } = row;
                return (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid #bbf7d0',
                      background: isBest ? '#dcfce7' : i % 2 === 0 ? '#f0fdf4' : undefined,
                    }}
                  >
                    <td style={{
                      ...tdStyle, textAlign: 'center', fontWeight: isBest ? 700 : 400,
                      color: isBest ? '#166534' : '#374151',
                    }}>
                      {isBest ? `⭐ ${fmt(scale, 2)}` : fmt(scale, 2)}
                    </td>
                    <td style={{
                      ...tdStyle, fontWeight: isBest ? 700 : 400,
                      color: isBest ? '#166534' : '#374151',
                    }}>
                      {fmt(metrics?.mae, 3)}
                    </td>
                    <td style={{
                      ...tdStyle,
                      color: (metrics?.worst ?? 0) > 5 ? '#dc2626'
                           : (metrics?.worst ?? 0) > 3 ? '#b45309'
                           : '#374151',
                    }}>
                      {fmt(metrics?.worst, 3)}
                    </td>
                    <td style={{ ...tdStyle, color: '#374151' }}>
                      {metrics?.worstHz ?? '—'}
                    </td>
                    {bands.map((v, bi) => (
                      <td key={bi} style={{
                        ...tdStyle,
                        color: (v ?? 0) > 5 ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151',
                        fontWeight: isBest ? 700 : 400,
                      }}>
                        {fmt(v, 2)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}