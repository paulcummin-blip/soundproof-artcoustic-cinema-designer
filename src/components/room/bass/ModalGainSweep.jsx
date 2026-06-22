/**
 * ModalGainSweep — Diagnostic only. Does not affect the live graph.
 *
 * Sweeps modalGainScalar across fixed values to determine whether the
 * remaining REW mismatch is a modal field level issue or a modal shape issue.
 *
 * Fixed parity settings for every run:
 *   - axialQ scale  → 0.8 (applied as axialQ = 4.0 * 0.8 = 3.2)
 *   - tangential    → 0.8 (tangentialFamilyScale = 0.8)
 *   - reflections   → OFF
 *   - disableLateField → true
 *   - path          → direct + modes
 *   - source curve  → flat 94 dB REW reference
 *
 * Gain values tested: 1.00, 0.75, 0.50, 0.35, 0.25, 0.15, 0.10
 *
 * Per frequency (70, 80, 85, 90 Hz): simulated SPL, REW target, error
 * Per row: MAE, worst error, worst frequency
 * Best MAE row is highlighted.
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// ── REW benchmark — must match RewParityAutoSweep / RewBenchmarkComparisonTable exactly ──
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

const REW_TARGETS = { 70: 86.8, 80: 79.7, 85: 90.8, 90: null }; // 90 Hz not in benchmark → null
const DISPLAY_FREQS = [70, 80, 85, 90];
const GAIN_VALUES = [1.00, 0.75, 0.50, 0.35, 0.25, 0.15, 0.10];

const FLAT_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 },
  { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

// Fixed parity settings applied to every run
const FIXED_AXIAL_Q = 4.0 * 0.8;            // 3.2 — Q scale 0.8
const FIXED_TANG_SCALE = 0.8;

// ── helpers ──────────────────────────────────────────────────────────────────

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
  let sum = 0, count = 0, worstErr = 0, worstHz = null;
  for (const { hz, db } of REW_BENCHMARK) {
    const b44 = interpolateSpl(series, hz);
    if (!Number.isFinite(b44)) continue;
    const absErr = Math.abs(b44 - db);
    sum += absErr;
    count++;
    if (absErr > worstErr) { worstErr = absErr; worstHz = hz; }
  }
  return count > 0 ? { mae: sum / count, worst: worstErr, worstHz } : { mae: null, worst: null, worstHz: null };
}

function runOneSim(roomDims, seat, sub, surfaceAbsorption, gainScalar) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  try {
    const result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      FLAT_CURVE,
      {
        enableReflections:            false,
        enableModes:                  true,
        disableLateField:             true,
        surfaceAbsorption,
        freqMinHz:                    20,
        freqMaxHz:                    200,
        smoothing:                    'none',
        modalSourceReferenceMode:     'existing',
        modalGainScalar:              gainScalar,
        axialQ:                       FIXED_AXIAL_Q,
        tangentialFamilyScale:        FIXED_TANG_SCALE,
        axialFamilyScale:             1.0,
        obliqueFamilyScale:           1.0,
        modalStorageMode:             'none',
        propagationPhaseScale:        0,
        pureDeterministicModalSum:    true,
        disableModalPropagationPhase: true,
        modalCoherenceMode:           'coherent',
        highOrderAxialScale:          1.0,
        debugReflectionOrder:         1,
      }
    );
    if (!result?.freqsHz || !result?.splDbRaw) return null;
    return result.freqsHz.map((hz, i) => ({ frequency: hz, spl: result.splDbRaw[i] }));
  } catch {
    return null;
  }
}

function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

function errColor(err) {
  if (!Number.isFinite(err)) return '#6b7280';
  const abs = Math.abs(err);
  if (abs >= 6) return '#dc2626';
  if (abs >= 3) return '#b45309';
  if (abs >= 1) return '#854d0e';
  return '#15803d';
}

// ── styles ────────────────────────────────────────────────────────────────────

const TH = {
  padding: '4px 7px', fontSize: 9, fontWeight: 700,
  background: '#1e1b4b', color: '#a5b4fc',
  textAlign: 'right', borderBottom: '2px solid #312e81',
  whiteSpace: 'nowrap', fontFamily: 'monospace',
};
const TD = { padding: '3px 7px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right' };

// ── component ─────────────────────────────────────────────────────────────────

/**
 * @param {object} roomDims        – { widthM, lengthM, heightM }
 * @param {object} seat            – { x, y, z }
 * @param {object} sub             – single sub object (first sub)
 * @param {object} surfaceAbsorption
 */
export default function ModalGainSweep({ roomDims, seat, sub, surfaceAbsorption }) {
  const [rows, setRows]       = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x  != null && sub?.y  != null
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setRows(null);
    setError(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      const computed = [];
      for (const gain of GAIN_VALUES) {
        const series = runOneSim(roomDims, seat, sub, surfaceAbsorption, gain);
        if (!series) { computed.push({ gain, series: null, freqData: {}, mae: null, worst: null, worstHz: null }); continue; }

        const { mae, worst, worstHz } = computeMAE(series);

        const freqData = {};
        for (const hz of DISPLAY_FREQS) {
          const simSpl   = interpolateSpl(series, hz);
          const rewTarget = REW_TARGETS[hz] ?? null;
          const err = (Number.isFinite(simSpl) && rewTarget != null) ? simSpl - rewTarget : null;
          freqData[hz] = { simSpl, rewTarget, err };
        }

        computed.push({ gain, series, freqData, mae, worst, worstHz });
        await new Promise(r => setTimeout(r, 0));
      }

      setRows(computed);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, [roomDims, seat, sub, surfaceAbsorption, canRun]);

  // Find best MAE row index
  const bestIdx = rows
    ? rows.reduce((best, r, i) => {
        if (!Number.isFinite(r.mae)) return best;
        return best === -1 || r.mae < rows[best].mae ? i : best;
      }, -1)
    : -1;

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid #312e81',
      borderRadius: 8,
      background: '#0f0e2a',
      padding: '10px 12px',
    }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#c7d2fe', fontSize: 11, fontFamily: 'monospace', marginBottom: 3 }}>
        Modal Gain Sweep
        <span style={{ fontWeight: 400, color: '#4338ca', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>

      {/* Fixed settings badge */}
      <div style={{
        display: 'inline-flex', gap: 10, flexWrap: 'wrap',
        padding: '4px 10px', borderRadius: 5,
        background: '#1e1b4b', marginBottom: 8,
        fontSize: 9, fontFamily: 'monospace', color: '#818cf8',
      }}>
        <span>Q scale: <strong style={{ color: '#a5b4fc' }}>0.8 → axialQ={FIXED_AXIAL_Q.toFixed(2)}</strong></span>
        <span>Tangential scale: <strong style={{ color: '#a5b4fc' }}>0.8</strong></span>
        <span>Reflections: <strong style={{ color: '#a5b4fc' }}>OFF</strong></span>
        <span>Path: <strong style={{ color: '#a5b4fc' }}>direct + modes</strong></span>
        <span>Source: <strong style={{ color: '#a5b4fc' }}>flat 94 dB</strong></span>
      </div>

      <div style={{ fontSize: 9, color: '#6366f1', fontFamily: 'monospace', marginBottom: 8, lineHeight: 1.6 }}>
        Goal: determine if the remaining REW mismatch is <em>modal field level too high</em> (gain → reduce MAE) or <em>modal shape wrong</em> (gain has little effect on MAE curve shape).
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Requires room dimensions, a seat position, and a sub position.
        </div>
      )}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: `1px solid ${running || !canRun ? '#312e81' : '#4f46e5'}`,
          background: running || !canRun ? '#1e1b4b' : '#4f46e5',
          color: running || !canRun ? '#4338ca' : '#fff',
          fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
          cursor: running || !canRun ? 'not-allowed' : 'pointer',
          marginBottom: 10,
        }}
      >
        {running ? 'Running…' : rows ? 'Re-run sweep' : 'Run Modal Gain Sweep'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#f87171', fontFamily: 'monospace', marginBottom: 6 }}>
          Error: {error}
        </div>
      )}

      {rows && (
        <>
          {/* Best result banner */}
          {bestIdx >= 0 && (
            <div style={{
              padding: '5px 10px', borderRadius: 5, marginBottom: 10,
              background: '#14532d', color: '#86efac',
              fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
            }}>
              🥇 Best MAE: gain = {fmt(rows[bestIdx].gain, 2)} → MAE = {fmt(rows[bestIdx].mae, 3)} dB · worst = {fmt(rows[bestIdx].worst, 3)} dB @ {rows[bestIdx].worstHz ?? '—'} Hz
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
              <thead>
                <tr>
                  {/* Gain */}
                  <th style={{ ...TH, textAlign: 'left', borderLeft: 'none' }}>Gain</th>

                  {/* Per-frequency columns */}
                  {DISPLAY_FREQS.map(hz => (
                    <React.Fragment key={hz}>
                      <th style={{ ...TH, borderLeft: '1px solid #312e81', color: '#818cf8' }}>{hz} Hz sim</th>
                      <th style={{ ...TH, color: '#6b7280' }}>{hz} Hz REW</th>
                      <th style={{ ...TH, color: '#c084fc' }}>{hz} Hz err</th>
                    </React.Fragment>
                  ))}

                  {/* Summary */}
                  <th style={{ ...TH, borderLeft: '1px solid #312e81', color: '#34d399' }}>MAE</th>
                  <th style={{ ...TH, color: '#f87171' }}>Worst err</th>
                  <th style={{ ...TH, color: '#f87171' }}>Worst Hz</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isBest = i === bestIdx;
                  const rowBg  = isBest ? '#052e16' : undefined;
                  const rowColor = isBest ? '#86efac' : '#e0e7ff';

                  return (
                    <tr key={row.gain} style={{ borderBottom: '1px solid #1e1b4b', background: rowBg }}>
                      {/* Gain */}
                      <td style={{ ...TD, textAlign: 'left', fontWeight: 700, color: isBest ? '#86efac' : '#a5b4fc' }}>
                        {isBest ? '★ ' : ''}{fmt(row.gain, 2)}
                      </td>

                      {/* Per-frequency data */}
                      {DISPLAY_FREQS.map(hz => {
                        const fd = row.freqData[hz] ?? {};
                        return (
                          <React.Fragment key={hz}>
                            <td style={{ ...TD, borderLeft: '1px solid #1e1b4b', color: rowColor }}>
                              {fmt(fd.simSpl, 2)}
                            </td>
                            <td style={{ ...TD, color: '#4b5563' }}>
                              {fd.rewTarget != null ? fmt(fd.rewTarget, 1) : '—'}
                            </td>
                            <td style={{ ...TD, fontWeight: 700, color: fd.err != null ? errColor(fd.err) : '#6b7280' }}>
                              {fd.err != null ? (fd.err >= 0 ? '+' : '') + fmt(fd.err, 2) : '—'}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      {/* Summary */}
                      <td style={{ ...TD, borderLeft: '1px solid #1e1b4b', fontWeight: 700, color: isBest ? '#34d399' : '#a7f3d0' }}>
                        {fmt(row.mae, 3)}
                      </td>
                      <td style={{ ...TD, color: row.worst != null ? errColor(row.worst) : '#6b7280', fontWeight: 700 }}>
                        {fmt(row.worst, 3)}
                      </td>
                      <td style={{ ...TD, color: '#9ca3af' }}>
                        {row.worstHz ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Interpretation note */}
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: '#4338ca', lineHeight: 1.8, borderTop: '1px solid #1e1b4b', paddingTop: 6 }}>
            <strong style={{ color: '#818cf8' }}>Interpretation:</strong><br/>
            If MAE reduces significantly as gain decreases → modal field level is too high (amplitude calibration issue).<br/>
            If MAE changes little regardless of gain → modal shape is wrong (coupling, Q, or mode structure issue).<br/>
            If the best gain ≈ 1.00 → current level is already optimal; investigate shape/phase instead.<br/>
            <span style={{ color: '#312e81' }}>
              90 Hz REW target not in benchmark — sim SPL and error shown but excluded from MAE.
            </span>
          </div>
        </>
      )}
    </div>
  );
}