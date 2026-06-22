/**
 * ModalBandwidthDiagnostic
 *
 * Diagnostic-only. Sweeps axial Q scale (0.4–0.9) with fixed:
 *   tangential = 0.8, axial = 1.0, oblique = 1.0
 *
 * Reports per-sweep:
 *   MAE, worst error, band MAEs (50–60, 70–80, 90–110 Hz), 80 Hz error
 *   SPL contribution of modes (2,0,0), (0,3,0), (2,2,0) at 80 Hz
 *
 * Does NOT alter the live graph or production defaults.
 */
import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

const Q_SCALES = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

const TANG_SCALE    = 0.8;
const AXIAL_SCALE   = 1.0;
const OBLIQUE_SCALE = 1.0;

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

const BAND_DEFS = [
  { label: '50–60 Hz',  lo: 50,  hi: 60  },
  { label: '70–80 Hz',  lo: 70,  hi: 80  },
  { label: '90–110 Hz', lo: 90,  hi: 110 },
];

// Modes of interest for SPL contribution reporting
const MODES_OF_INTEREST = [
  { nx: 2, ny: 0, nz: 0, label: '(2,0,0)' },
  { nx: 0, ny: 3, nz: 0, label: '(0,3,0)' },
  { nx: 2, ny: 2, nz: 0, label: '(2,2,0)' },
];

const FLAT_SOURCE_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function interpolateSpl(freqsHz, splDbRaw, targetHz) {
  if (!freqsHz || !splDbRaw) return null;
  let best = null, bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = splDbRaw[i]; }
  }
  return bestDist <= 3 ? best : null;
}

function computeMetrics(freqsHz, splDbRaw) {
  let sumAbs = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const b44 = interpolateSpl(freqsHz, splDbRaw, hz);
    if (b44 === null || !Number.isFinite(b44)) continue;
    const abs = Math.abs(b44 - db);
    sumAbs += abs;
    count++;
    if (abs > worstErr) { worstErr = abs; worstHz = hz; }
  }
  return count > 0 ? { mae: sumAbs / count, worst: worstErr, worstHz } : null;
}

function computeBandMAE(freqsHz, splDbRaw, lo, hi) {
  const pts = REW_BENCHMARK.filter(p => p.hz >= lo && p.hz <= hi);
  if (pts.length === 0) return null;
  let sum = 0, count = 0;
  for (const { hz, db } of pts) {
    const b44 = interpolateSpl(freqsHz, splDbRaw, hz);
    if (!Number.isFinite(b44)) continue;
    sum += Math.abs(b44 - db);
    count++;
  }
  return count > 0 ? sum / count : null;
}

/**
 * From activeModalContributorDebugSeries, find the bin closest to targetHz,
 * then find the specific mode (nx,ny,nz) in its contributors and return its
 * SPL contribution: 20*log10(activeMagnitude).
 */
function extractModeContribSpl(activeModalContributorDebugSeries, targetHz, nx, ny, nz) {
  if (!Array.isArray(activeModalContributorDebugSeries)) return null;

  // Find the bin closest to targetHz
  let bestBin = null, bestDist = Infinity;
  for (const bin of activeModalContributorDebugSeries) {
    const d = Math.abs(bin.frequencyHz - targetHz);
    if (d < bestDist) { bestDist = d; bestBin = bin; }
  }
  if (!bestBin || bestDist > 3) return null;

  // Find the specific mode in contributors
  const contributor = (bestBin.contributors ?? []).find(
    c => c.nx === nx && c.ny === ny && c.nz === nz
  );
  if (!contributor) return null;

  const mag = contributor.activeMagnitude ?? 0;
  if (mag <= 0) return null;
  return 20 * Math.log10(mag);
}

function runSim(roomDims, seat, sub, surfaceAbsorption, activeSettings, qScale) {
  const seatZ      = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const baseAxialQ = activeSettings?.axialQ ?? 8;

  try {
    return simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      FLAT_SOURCE_CURVE,
      {
        enableReflections:            false,
        enableModes:                  true,
        surfaceAbsorption,
        freqMinHz:                    20,
        freqMaxHz:                    200,
        smoothing:                    'none',
        modalSourceReferenceMode:     activeSettings?.modalSourceReferenceMode   ?? 'existing',
        modalGainScalar:              activeSettings?.modalGainScalar            ?? 1.0,
        axialQ:                       baseAxialQ * qScale,
        modalStorageMode:             'none',
        propagationPhaseScale:        0,
        pureDeterministicModalSum:    true,
        disableModalPropagationPhase: true,
        modalCoherenceMode:           'coherent',
        highOrderAxialScale:          activeSettings?.highOrderAxialScale          ?? 1.0,
        rewParityModalMagnitudeScale: activeSettings?.rewParityModalMagnitudeScale ?? 1.0,
        debugReflectionOrder:         1,
        disableLateField:             true,
        tangentialFamilyScale:        TANG_SCALE,
        axialFamilyScale:             AXIAL_SCALE,
        obliqueFamilyScale:           OBLIQUE_SCALE,
      }
    );
  } catch {
    return null;
  }
}

// ─── styles ───────────────────────────────────────────────────────────────────

const TH = {
  textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700,
  background: '#f0fdf4', borderBottom: '2px solid #86efac', color: '#166534',
  whiteSpace: 'nowrap',
};
const TD = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };

function errColor(v) {
  if (!Number.isFinite(v)) return '#374151';
  return Math.abs(v) > 6 ? '#dc2626' : Math.abs(v) > 3 ? '#b45309' : '#166534';
}

function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ModalBandwidthDiagnostic({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [rows,    setRows]    = useState(null);
  const [running, setRunning] = useState(false);
  const [err,     setErr]     = useState(null);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x  != null && sub?.y  != null
  );

  const runSweep = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setRows(null);
    setErr(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      const computed = Q_SCALES.map(qScale => {
        const result = runSim(roomDims, seat, sub, surfaceAbsorption, activeSettings, qScale);
        if (!result) return { qScale, metrics: null, bands: BAND_DEFS.map(() => null), err80: null, modeSpl: MODES_OF_INTEREST.map(() => null) };

        const { freqsHz, splDbRaw, activeModalContributorDebugSeries } = result;

        const metrics = computeMetrics(freqsHz, splDbRaw);
        const bands   = BAND_DEFS.map(({ lo, hi }) => computeBandMAE(freqsHz, splDbRaw, lo, hi));

        const sim80   = interpolateSpl(freqsHz, splDbRaw, 80);
        const rew80   = 79.7;
        const err80   = sim80 != null ? sim80 - rew80 : null;

        const modeSpl = MODES_OF_INTEREST.map(({ nx, ny, nz }) =>
          extractModeContribSpl(activeModalContributorDebugSeries, 80, nx, ny, nz)
        );

        return { qScale, metrics, bands, err80, modeSpl };
      });

      // Mark best MAE
      let bestIdx = 0, bestMae = Infinity;
      computed.forEach((r, i) => {
        if (r.metrics?.mae != null && r.metrics.mae < bestMae) { bestMae = r.metrics.mae; bestIdx = i; }
      });
      computed.forEach((r, i) => { r.isBest = i === bestIdx; });

      setRows(computed);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #86efac', borderRadius: 8, background: '#f0fdf4', padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Bandwidth Diagnostic — Q Scale Sweep
        <span style={{ fontWeight: 400, color: '#4ade80', marginLeft: 8, fontSize: 10 }}>
          Tang={TANG_SCALE} · Axial={AXIAL_SCALE} · Oblique={OBLIQUE_SCALE} · diagnostic only · does not affect live graph
        </span>
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Requires room dimensions, a valid seat, and a valid sub.
        </div>
      )}

      <button
        onClick={runSweep}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #16a34a', fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
          background: (running || !canRun) ? '#e5e7eb' : '#16a34a',
          color: (running || !canRun) ? '#6b7280' : '#fff',
          cursor: (running || !canRun) ? 'not-allowed' : 'pointer',
          marginBottom: 10,
        }}
      >
        {running ? 'Running…' : rows ? 'Re-run sweep' : 'Run modal bandwidth sweep'}
      </button>

      {err && (
        <div style={{ fontSize: 10, color: '#dc2626', fontFamily: 'monospace', marginBottom: 6 }}>
          Error: {err}
        </div>
      )}

      {rows && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...TH, textAlign: 'center' }}>Q scale</th>
                <th style={TH}>MAE (dB)</th>
                <th style={TH}>Worst err</th>
                <th style={TH}>Worst Hz</th>
                {BAND_DEFS.map(b => <th key={b.label} style={TH}>{b.label}</th>)}
                <th style={{ ...TH, color: '#dc2626' }}>80 Hz err</th>
                {MODES_OF_INTEREST.map(m => (
                  <th key={m.label} style={{ ...TH, color: '#7e22ce' }}>
                    {m.label} SPL@80
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const { qScale, metrics, bands, err80, modeSpl, isBest } = row;
                const rowBg = isBest ? '#dcfce7' : i % 2 === 0 ? '#f0fdf4' : undefined;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #bbf7d0', background: rowBg }}>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: isBest ? 700 : 400, color: isBest ? '#166534' : '#374151' }}>
                      {isBest ? `⭐ ×${fmt(qScale, 1)}` : `×${fmt(qScale, 1)}`}
                    </td>
                    <td style={{ ...TD, fontWeight: isBest ? 700 : 400, color: isBest ? '#166534' : '#374151' }}>
                      {fmt(metrics?.mae, 3)}
                    </td>
                    <td style={{ ...TD, color: errColor(metrics?.worst) }}>
                      {fmt(metrics?.worst, 3)}
                    </td>
                    <td style={{ ...TD, color: '#374151' }}>
                      {metrics?.worstHz ?? '—'}
                    </td>
                    {bands.map((v, bi) => (
                      <td key={bi} style={{ ...TD, color: errColor(v), fontWeight: isBest ? 700 : 400 }}>
                        {fmt(v, 2)}
                      </td>
                    ))}
                    <td style={{ ...TD, fontWeight: 700, color: errColor(err80) }}>
                      {err80 != null ? (err80 > 0 ? '+' : '') + fmt(err80, 2) : '—'}
                    </td>
                    {modeSpl.map((spl, mi) => (
                      <td key={mi} style={{ ...TD, color: '#7e22ce' }}>
                        {spl != null ? fmt(spl, 1) + ' dB' : '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Legend */}
          <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#374151', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>⭐ = lowest MAE</span>
            <span style={{ color: '#166534' }}>green = error ≤ 3 dB</span>
            <span style={{ color: '#b45309' }}>amber = 3–6 dB</span>
            <span style={{ color: '#dc2626' }}>red = &gt;6 dB</span>
            <span style={{ color: '#7e22ce' }}>purple = mode contribution at 80 Hz (SPL)</span>
          </div>
        </div>
      )}
    </div>
  );
}