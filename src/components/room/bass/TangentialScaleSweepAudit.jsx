/**
 * TangentialScaleSweepAudit — Diagnostic only. Does not affect the live graph.
 *
 * Sweeps tangentialFamilyScale 0.10–1.00 while keeping all other settings locked:
 *   Direct + Modes · Reflections OFF · Current parity settings · Current Q · Current source model.
 *
 * Reports MAE, worst error, worst frequency, and signed errors at 70/80/85 Hz.
 * Goal: determine whether the remaining parity gap is primarily a tangential amplitude calibration issue.
 */
import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// ── REW benchmark (current parity reference) ──────────────────────────────────
const REW_BENCHMARK = [
  { hz: 20,  db: 93.1 }, { hz: 25,  db: 96.6 }, { hz: 30,  db: 95.8 },
  { hz: 34,  db: 94.1 }, { hz: 40,  db: 100.3 },{ hz: 45,  db: 98.6 },
  { hz: 50,  db: 97.5 }, { hz: 55,  db: 95.7 }, { hz: 60,  db: 91.2 },
  { hz: 63,  db: 89.8 }, { hz: 68,  db: 85.2 }, { hz: 70,  db: 83.1 },
  { hz: 75,  db: 84.4 }, { hz: 80,  db: 86.2 }, { hz: 85,  db: 88.4 },
  { hz: 90,  db: 89.1 }, { hz: 100, db: 87.3 }, { hz: 120, db: 83.6 },
  { hz: 150, db: 79.2 }, { hz: 200, db: 74.1 },
];

const FLAT_REF = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const TANG_SCALES = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00];
const CURRENT_SCALE = 0.80;
const TARGET_HZ = [70, 80, 85];

// ── Helpers ───────────────────────────────────────────────────────────────────
function interp(series, hz) {
  if (!series || series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.hz - b.hz);
  if (hz <= sorted[0].hz) return sorted[0].db;
  if (hz >= sorted[sorted.length - 1].hz) return sorted[sorted.length - 1].db;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (hz >= sorted[i].hz && hz <= sorted[i + 1].hz) {
      const t = (hz - sorted[i].hz) / (sorted[i + 1].hz - sorted[i].hz);
      return sorted[i].db + t * (sorted[i + 1].db - sorted[i].db);
    }
  }
  return null;
}

function scoreVsBenchmark(series) {
  let sumErr = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db: ref } of REW_BENCHMARK) {
    const sim = interp(series, hz);
    if (sim === null || !Number.isFinite(sim)) continue;
    const err = Math.abs(sim - ref);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  return count > 0 ? { mae: sumErr / count, worstErr, worstHz } : null;
}

function errAtHz(series, hz) {
  const sim = interp(series, hz);
  const ref = interp(REW_BENCHMARK, hz);
  if (sim === null || ref === null) return null;
  return sim - ref;
}

function runSim(roomDims, seat, sub, surfaceAbsorption, activeSettings, tangScale) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  try {
    const result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      FLAT_REF,
      {
        enableReflections:            false,
        enableModes:                  true,
        disableLateField:             true,
        surfaceAbsorption,
        freqMinHz:                    20,
        freqMaxHz:                    200,
        propagationPhaseScale:        activeSettings?.propagationPhaseScale        ?? 0,
        pureDeterministicModalSum:    activeSettings?.pureDeterministicModalSum    ?? true,
        disableModalPropagationPhase: activeSettings?.disableModalPropagationPhase ?? true,
        modalGainScalar:              activeSettings?.modalGainScalar              ?? 1.0,
        modalCoherenceMode:           activeSettings?.modalCoherenceMode           ?? 'coherent',
        highOrderAxialScale:          activeSettings?.highOrderAxialScale          ?? 1.0,
        rewParityModalMagnitudeScale: activeSettings?.rewParityModalMagnitudeScale ?? 1.0,
        // Sweep this; lock all others at production defaults
        tangentialFamilyScale: tangScale,
        axialFamilyScale:      1.0,
        obliqueFamilyScale:    1.0,
      }
    );
    if (!result?.freqsHz) return null;
    const raw = result.freqsHz.map((hz, i) => {
      const re = result.complexPressure?.[i]?.re ?? 0;
      const im = result.complexPressure?.[i]?.im ?? 0;
      const mag = Math.sqrt(re*re + im*im);
      return { hz, db: 20 * Math.log10(Math.max(mag, 1e-10)) };
    }).filter(p => Number.isFinite(p.hz) && p.hz > 0);
    raw.sort((a, b) => a.hz - b.hz);
    // Dedupe
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i+1] && Math.abs(raw[i].hz - raw[i+1].hz) < 1e-9) continue;
      out.push(raw[i]);
    }
    return out;
  } catch {
    return null;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH = { padding: '3px 8px', fontSize: 8, fontWeight: 700, ...MONO, background: '#1c1917', color: '#d6d3d1', textAlign: 'right', borderBottom: '2px solid #292524', whiteSpace: 'nowrap' };
const TD = { padding: '3px 8px', fontSize: 8, ...MONO, textAlign: 'right' };
const TDL = { ...TD, textAlign: 'left' };

function errColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a <= 1) return '#4ade80';
  if (a <= 3) return '#fbbf24';
  if (a <= 6) return '#fb923c';
  return '#f87171';
}
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function fmtΔ(v) { if (!Number.isFinite(v)) return '—'; return (v >= 0 ? '+' : '') + v.toFixed(2); }

// ── Component ─────────────────────────────────────────────────────────────────
export default function TangentialScaleSweepAudit({ roomDims, subs, seat, surfaceAbsorption, activeSettings }) {
  const [rows, setRows] = useState(null);
  const [running, setRunning] = useState(false);

  const currentSub = subs?.[0] ?? null;
  const hasRoom = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const canRun = hasRoom && seat?.x != null && seat?.y != null && currentSub?.x != null;

  const runSweep = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setRows(null);
    setTimeout(() => {
      try {
        const computed = TANG_SCALES.map(scale => {
          const series = runSim(roomDims, seat, currentSub, surfaceAbsorption, activeSettings, scale);
          const metrics = series ? scoreVsBenchmark(series) : null;
          const errors = {};
          for (const hz of TARGET_HZ) errors[hz] = series ? errAtHz(series, hz) : null;
          return { scale, metrics, errors, isCurrent: scale === CURRENT_SCALE };
        });
        // Mark best MAE
        let bestMae = Infinity, bestIdx = -1;
        computed.forEach((r, i) => { if ((r.metrics?.mae ?? Infinity) < bestMae) { bestMae = r.metrics.mae; bestIdx = i; } });
        computed.forEach((r, i) => { r.isBest = i === bestIdx; });
        setRows(computed);
      } catch (e) {
        console.error('[TangentialScaleSweepAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [roomDims, seat, currentSub, surfaceAbsorption, activeSettings, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Tangential Scale Sweep Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.7 }}>
        Direct+Modes · Reflections OFF · Current parity settings · Current Q + source model.<br />
        Sweeps tangentialFamilyScale 0.10→1.00. Axial and oblique locked at 1.0.<br />
        Goal: determine whether the parity gap is driven by tangential amplitude calibration.
      </div>

      {!hasRoom && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires room dimensions.</div>}
      {hasRoom && !seat && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a seat/MLP position.</div>}
      {hasRoom && !currentSub && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a subwoofer.</div>}

      {canRun && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 9, ...MONO, color: '#78716c', background: '#1c1917', borderRadius: 4, padding: '5px 10px', marginBottom: 8 }}>
          <span>Room: <strong style={{ color: '#d6d3d1' }}>{roomDims.widthM.toFixed(2)}W × {roomDims.lengthM.toFixed(2)}L × {roomDims.heightM.toFixed(2)}H m</strong></span>
          <span>MLP: <strong style={{ color: '#86efac' }}>({seat.x?.toFixed(3)}, {seat.y?.toFixed(3)}, {(seat.z ?? 1.2).toFixed(3)}) m</strong></span>
          <span>Sub: <strong style={{ color: '#93c5fd' }}>({currentSub.x?.toFixed(3)}, {currentSub.y?.toFixed(3)}, {(currentSub.z ?? 0.35).toFixed(3)}) m</strong></span>
        </div>
      )}

      <button
        onClick={runSweep}
        disabled={running || !canRun}
        style={{ padding: '5px 14px', borderRadius: 5, border: '1px solid #57534e', background: running ? '#1c1917' : '#292524', color: running ? '#57534e' : '#d6d3d1', fontSize: 10, ...MONO, cursor: running || !canRun ? 'default' : 'pointer', marginBottom: 10, fontWeight: 700 }}
      >
        {running ? `Running ${TANG_SCALES.length} tangential scales…` : rows ? 'Re-run' : `Run Tangential Scale Sweep (${TANG_SCALES.length} steps)`}
      </button>

      {rows && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>Tang. scale</th>
                  <th style={{ ...TH, color: '#fbbf24' }}>MAE</th>
                  <th style={{ ...TH, color: '#fb923c' }}>Worst err</th>
                  <th style={TH}>Worst Hz</th>
                  <th style={{ ...TH, color: '#93c5fd' }}>70 Hz err</th>
                  <th style={{ ...TH, color: '#6ee7b7' }}>80 Hz err</th>
                  <th style={TH}>85 Hz err</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1c1917', background: row.isBest ? '#172554' : row.isCurrent ? '#1a1a10' : undefined }}>
                    <td style={{ ...TDL, color: row.isBest ? '#93c5fd' : row.isCurrent ? '#fcd34d' : '#a8a29e', fontWeight: (row.isBest || row.isCurrent) ? 700 : 400 }}>
                      {row.isBest && <span style={{ color: '#60a5fa', marginRight: 4 }}>★</span>}
                      {row.isCurrent && !row.isBest && <span style={{ color: '#fcd34d', marginRight: 4 }}>▶</span>}
                      {fmt(row.scale, 2)}
                      {row.isCurrent && <span style={{ color: '#57534e', marginLeft: 6, fontSize: 7 }}>current</span>}
                    </td>
                    <td style={{ ...TD, fontWeight: 700, color: row.isBest ? '#60a5fa' : errColor(row.metrics?.mae) }}>
                      {fmt(row.metrics?.mae, 3)}
                    </td>
                    <td style={{ ...TD, color: errColor(row.metrics?.worstErr) }}>
                      {fmt(row.metrics?.worstErr, 3)}
                    </td>
                    <td style={{ ...TD, color: '#6b7280' }}>{row.metrics?.worstHz ?? '—'}</td>
                    {TARGET_HZ.map(hz => (
                      <td key={hz} style={{ ...TD, color: errColor(row.errors[hz]) }}>
                        {fmtΔ(row.errors[hz])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, fontSize: 9, ...MONO, color: '#44403c', lineHeight: 1.8, borderTop: '1px solid #1c1917', paddingTop: 6 }}>
            <span style={{ color: '#60a5fa' }}>★</span> best MAE &nbsp;
            <span style={{ color: '#fcd34d' }}>▶</span> current production (0.80) &nbsp;&nbsp;
            Δ colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span><br />
            If ★ lands well below 0.80, tangential amplitude is a primary driver of the parity gap.
            If MAE is flat across the sweep, tangential scaling is not the root cause.
          </div>
        </>
      )}
    </div>
  );
}