/**
 * RewParityQSweep
 *
 * Diagnostic-only. Sweeps axialQ scale from 1.20 down to 0.60 (applied as a
 * multiplier on the axialQ option), keeping tangential = 1.0 and oblique = 1.0.
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

const Q_SCALES = [1.20, 1.10, 1.00, 0.90, 0.80, 0.70, 0.60];

const FLAT_SOURCE_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const BAND_DEFS = [
  { label: '50–60 Hz',  lo: 50,  hi: 60  },
  { label: '70–80 Hz',  lo: 70,  hi: 80  },
  { label: '90–110 Hz', lo: 90,  hi: 110 },
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

function runSim(roomDims, seat, sub, surfaceAbsorption, activeSettings, qScale) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const baseAxialQ = activeSettings?.axialQ ?? 8;
  const scaledAxialQ = baseAxialQ * qScale;
  let result;
  try {
    result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      FLAT_SOURCE_CURVE,
      {
        enableReflections:            activeSettings?.enableReflections          ?? false,
        enableModes:                  true,
        surfaceAbsorption,
        freqMinHz:                    20,
        freqMaxHz:                    200,
        smoothing:                    'none',
        modalSourceReferenceMode:     activeSettings?.modalSourceReferenceMode   ?? 'existing',
        modalGainScalar:              activeSettings?.modalGainScalar            ?? 1.0,
        axialQ:                       scaledAxialQ,
        modalStorageMode:             'none',
        propagationPhaseScale:        activeSettings?.propagationPhaseScale      ?? 0,
        pureDeterministicModalSum:    activeSettings?.pureDeterministicModalSum  ?? true,
        disableModalPropagationPhase: activeSettings?.disableModalPropagationPhase ?? true,
        modalCoherenceMode:           activeSettings?.modalCoherenceMode         ?? 'coherent',
        highOrderAxialScale:          activeSettings?.highOrderAxialScale        ?? 1.0,
        rewParityModalMagnitudeScale: activeSettings?.rewParityModalMagnitudeScale ?? 1.0,
        debugReflectionOrder:         1,
        disableLateField:             activeSettings?.disableLateField           ?? true,
        // Family scales fixed for Q sweep
        tangentialFamilyScale:        1.0,
        axialFamilyScale:             1.0,
        obliqueFamilyScale:           1.0,
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
  background: '#eff6ff', borderBottom: '2px solid #93c5fd', color: '#1d4ed8',
  whiteSpace: 'nowrap',
};
const tdStyle = { textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace' };

export default function RewParityQSweep({
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

    await new Promise(r => setTimeout(r, 0));

    const computed = Q_SCALES.map(qScale => {
      const series  = runSim(roomDims, seat, sub, surfaceAbsorption, activeSettings, qScale);
      const metrics = series ? computeMetrics(series) : null;
      const bands   = BAND_DEFS.map(({ lo, hi }) =>
        series ? computeBandMAE(series, lo, hi) : null
      );
      return { qScale, metrics, bands };
    });

    let bestIdx = 0, bestMae = Infinity;
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
      border: '1px solid #93c5fd', borderRadius: 8,
      background: '#eff6ff', padding: '10px 12px',
    }}>
      <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
        Modal Q Sweep
        <span style={{ fontWeight: 400, color: '#60a5fa', marginLeft: 8, fontSize: 10 }}>
          diagnostic only · axialQ × scale · tang = 1.0, oblique = 1.0 fixed · does not affect active simulation
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
          border: '1px solid #1d4ed8', background: running ? '#e5e7eb' : '#1d4ed8',
          color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {running ? 'Running…' : rows ? 'Re-run' : 'Run Q sweep'}
      </button>

      {rows && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 540 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'center' }}>Q scale</th>
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
                const { qScale, metrics, bands, isBest } = row;
                return (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid #bfdbfe',
                      background: isBest ? '#dbeafe' : i % 2 === 0 ? '#eff6ff' : undefined,
                    }}
                  >
                    <td style={{
                      ...tdStyle, textAlign: 'center', fontWeight: isBest ? 700 : 400,
                      color: isBest ? '#1d4ed8' : '#374151',
                    }}>
                      {isBest ? `⭐ ${fmt(qScale, 2)}` : fmt(qScale, 2)}
                    </td>
                    <td style={{
                      ...tdStyle, fontWeight: isBest ? 700 : 400,
                      color: isBest ? '#1d4ed8' : '#374151',
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