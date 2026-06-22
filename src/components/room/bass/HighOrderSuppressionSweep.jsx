/**
 * HighOrderSuppressionSweep — Diagnostic only. Does not affect the live graph.
 *
 * Fixed: Direct+Modes, Reflections OFF, Distance blend=0.75, RSS, Flat REW reference.
 *
 * Applies weight = 1 / (order ^ k) to each mode and sweeps k from 0.00 to 2.00.
 * Reports MAE, worst error, worst Hz, and signed errors at 70/80/85/90 Hz per k.
 *
 * Interpretation:
 *  - MAE improves steadily → high-order energy is the primary parity driver
 *  - MAE barely changes  → high-order modes are NOT the primary driver
 *  - Clear optimum       → REW behaviour matches progressive suppression, not hard cutoff
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  modeShapeValueLocal,
  resonantTransfer,
  estimateModeQLocal,
} from '@/components/room/bass/core/modalCalculations';

// ── Constants ─────────────────────────────────────────────────────────────────
const SPEED_OF_SOUND = 343;
const DISTANCE_BLEND = 0.75;

const REW_BENCHMARK = [
  { hz: 20,  db: 93.1 }, { hz: 25,  db: 96.6 }, { hz: 30,  db: 95.8 },
  { hz: 34,  db: 94.1 }, { hz: 40,  db: 100.3 }, { hz: 45, db: 98.6 },
  { hz: 50,  db: 97.5 }, { hz: 55,  db: 95.7 }, { hz: 60,  db: 91.2 },
  { hz: 63,  db: 89.8 }, { hz: 68,  db: 85.2 }, { hz: 70,  db: 83.1 },
  { hz: 75,  db: 84.4 }, { hz: 80,  db: 86.2 }, { hz: 85,  db: 88.4 },
  { hz: 90,  db: 89.1 }, { hz: 100, db: 87.3 }, { hz: 120, db: 83.6 },
  { hz: 150, db: 79.2 }, { hz: 200, db: 74.1 },
];

// k=0 is the "no suppression" baseline (weight=1 for all orders)
const K_VALUES = [0.00, 0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 2.00];

// Dense grid for accurate MAE
const FREQ_GRID = [];
for (let f = 20; f <= 200; f += (f < 100 ? 2 : 5)) FREQ_GRID.push(f);

// ── Pure helpers ──────────────────────────────────────────────────────────────
const mag2db = (m) => 20 * Math.log10(Math.max(m, 1e-10));
const db2mag = (d) => Math.pow(10, d / 20);

function interpBenchmark(hz) {
  const pts = REW_BENCHMARK;
  if (hz <= pts[0].hz) return pts[0].db;
  if (hz >= pts[pts.length - 1].hz) return pts[pts.length - 1].db;
  for (let i = 0; i < pts.length - 1; i++) {
    if (hz >= pts[i].hz && hz <= pts[i + 1].hz) {
      const t = (hz - pts[i].hz) / (pts[i + 1].hz - pts[i].hz);
      return pts[i].db + t * (pts[i + 1].db - pts[i].db);
    }
  }
  return pts[0].db;
}

function interpSeries(series, hz) {
  if (!series?.length) return null;
  if (hz <= series[0].hz) return series[0].db;
  if (hz >= series[series.length - 1].hz) return series[series.length - 1].db;
  for (let i = 0; i < series.length - 1; i++) {
    if (hz >= series[i].hz && hz <= series[i + 1].hz) {
      const t = (hz - series[i].hz) / (series[i + 1].hz - series[i].hz);
      return series[i].db + t * (series[i + 1].db - series[i].db);
    }
  }
  return null;
}

function buildModes(roomDims, surfaceAbsorption) {
  const raw = computeRoomModesLocal({
    widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM,
    fMax: 220, c: SPEED_OF_SOUND,
  });
  return raw.map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? 4.0 : activeAxes === 2 ? 3.9 : 2.5;
    const absorptionQ = estimateModeQLocal({
      roomDims, surfaceAbsorption: surfaceAbsorption ?? {}, f0: mode.freq,
    });
    const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    return { ...mode, order, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
  });
}

/**
 * Compute full-grid SPL series for a given k.
 * weight(mode) = 1 / (order ^ k)   [order=0 modes treated as order=1 to avoid /0]
 */
function buildSeriesForK(k, modes, subPos, seatPos, roomDims) {
  const distM = Math.max(0.01, Math.sqrt(
    Math.pow(subPos.x - seatPos.x, 2) +
    Math.pow(subPos.y - seatPos.y, 2) +
    Math.pow(subPos.z - seatPos.z, 2)
  ));
  const directAmpBase   = db2mag(94 - 20 * Math.log10(distM));
  const modalGainScalar = db2mag(-20 * Math.log10(distM) * DISTANCE_BLEND);

  // Pre-compute per-mode coupling & gain — shared across all frequencies
  const modeData = modes.map(mode => {
    const srcPsi = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z, roomDims);
    const rcvPsi = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, roomDims);
    const coupling = srcPsi * rcvPsi;
    const effectiveOrder = Math.max(1, mode.order);           // guard order=0
    const kWeight    = 1 / Math.pow(effectiveOrder, k);       // ← sweep variable
    const orderWeight = mode.order >= 2 ? 0.50 : 1.0;         // production weights kept
    const axialScale  = (mode.type === 'axial' && mode.order >= 2) ? 0.50 : 1.0;
    const gain = db2mag(94) * modalGainScalar * coupling * orderWeight * axialScale * kWeight;
    return { mode, gain };
  });

  return FREQ_GRID.map(hz => {
    const phase = -2 * Math.PI * hz * (distM / SPEED_OF_SOUND);
    const dRe = directAmpBase * Math.cos(phase);
    const dIm = directAmpBase * Math.sin(phase);
    let energy = dRe * dRe + dIm * dIm;  // direct energy (RSS)

    for (const { mode, gain } of modeData) {
      const { re: tr, im: ti } = resonantTransfer(hz, mode.freq, mode.qValue);
      const re = gain * tr;
      const im = gain * ti;
      energy += re * re + im * im;        // RSS modal accumulation
    }

    return { hz, db: mag2db(Math.sqrt(energy)) };
  });
}

function scoreVsBenchmark(series) {
  let sumErr = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db: ref } of REW_BENCHMARK) {
    const sim = interpSeries(series, hz);
    if (sim === null || !Number.isFinite(sim)) continue;
    const err = Math.abs(sim - ref);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  return count > 0 ? { mae: sumErr / count, worstErr, worstHz } : null;
}

function errAt(series, hz) {
  const sim = interpSeries(series, hz);
  const ref = interpBenchmark(hz);
  return sim !== null ? sim - ref : null;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH = {
  padding: '3px 10px', fontSize: 8, fontWeight: 700, ...MONO,
  background: '#1c1917', color: '#d6d3d1', textAlign: 'right',
  borderBottom: '2px solid #292524', whiteSpace: 'nowrap',
};
const TD = { padding: '3px 10px', fontSize: 8, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };

function errColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a <= 1)  return '#4ade80';
  if (a <= 3)  return '#fbbf24';
  if (a <= 6)  return '#fb923c';
  return '#f87171';
}
const fmt  = (v, d = 3) => Number.isFinite(v) ? v.toFixed(d) : '—';
const fmtΔ = (v) => !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2);

// ── Component ─────────────────────────────────────────────────────────────────
export default function HighOrderSuppressionSweep({ roomDims, subs, seat, surfaceAbsorption }) {
  const [running, setRunning] = useState(false);
  const [rows, setRows]       = useState(null);

  const currentSub = subs?.[0] ?? null;
  const hasRoom    = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const canRun     = hasRoom && seat?.x != null && currentSub?.x != null;

  const runSweep = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setRows(null);
    setTimeout(() => {
      try {
        const subPos  = { x: currentSub.x, y: currentSub.y, z: currentSub.z ?? 0.35 };
        const seatPos = { x: seat.x,        y: seat.y,        z: seat.z         ?? 1.2  };
        const allModes = buildModes(roomDims, surfaceAbsorption);

        const computed = K_VALUES.map(k => {
          const series  = buildSeriesForK(k, allModes, subPos, seatPos, roomDims);
          const metrics = scoreVsBenchmark(series);
          return {
            k,
            mae:      metrics?.mae      ?? null,
            worstErr: metrics?.worstErr ?? null,
            worstHz:  metrics?.worstHz  ?? null,
            e70: errAt(series, 70),
            e80: errAt(series, 80),
            e85: errAt(series, 85),
            e90: errAt(series, 90),
          };
        });

        // Mark best MAE
        let bestMae = Infinity, bestIdx = -1;
        computed.forEach((r, i) => { if ((r.mae ?? Infinity) < bestMae) { bestMae = r.mae; bestIdx = i; } });
        computed.forEach((r, i) => { r.isBest = i === bestIdx; });

        // k=0 is the production baseline (weight=1 everywhere)
        const baseMae = computed[0]?.mae ?? null;
        computed.forEach(r => {
          r.isBaseline     = r.k === 0;
          r.maeImprovement = (baseMae != null && r.mae != null) ? baseMae - r.mae : null;
        });

        setRows(computed);
      } catch (e) {
        console.error('[HighOrderSuppressionSweep]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [roomDims, seat, currentSub, surfaceAbsorption, canRun]);

  // Derive interpretation from results
  const interpretation = (() => {
    if (!rows) return null;
    const baseMae = rows[0]?.mae;
    const bestRow = rows.find(r => r.isBest);
    const lastMae = rows[rows.length - 1]?.mae;
    if (baseMae == null || bestRow == null || lastMae == null) return null;

    const totalSpan  = baseMae - lastMae;
    const improvement = baseMae - bestRow.mae;
    const isSteady   = totalSpan >= 0.5 && bestRow.k === 2.00;
    const isFlat     = Math.abs(totalSpan) < 0.2;
    const hasClearOpt = improvement >= 0.3 && bestRow.k > 0 && bestRow.k < 2.00;

    if (isFlat) return {
      text: 'High-order modes are not the primary parity driver. MAE is flat across all k values — the parity gap originates elsewhere (direct path, modal Q, or low-order modes).',
      color: '#fbbf24',
    };
    if (isSteady) return {
      text: 'High-order modal energy is a primary parity driver. MAE improves steadily as k increases — the engine carries excess energy from higher-order mode families that REW is effectively suppressing.',
      color: '#f87171',
    };
    if (hasClearOpt) return {
      text: `REW behaviour is consistent with progressive high-order suppression rather than a hard modal cutoff. Best MAE at k=${bestRow.k.toFixed(2)} (improvement: ${improvement.toFixed(3)} dB over k=0). A soft rolloff — not an abrupt order cap — best explains the parity behaviour.`,
      color: '#4ade80',
    };
    return {
      text: `Partial improvement with k sweep (span ${totalSpan.toFixed(3)} dB, best at k=${bestRow.k.toFixed(2)}). Some high-order contribution to parity gap, but not the dominant driver.`,
      color: '#86efac',
    };
  })();

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        High-Order Suppression Sweep
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.7 }}>
        Fixed: blend=0.75 · RSS · Direct+Modes · Reflections OFF · Flat REW reference.<br />
        Applies weight = 1 / (order ^ k) to each mode and sweeps k from 0 → 2.<br />
        k=0 = no suppression (production baseline). k=2 = strong high-order attenuation.
      </div>

      {!hasRoom    && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires room dimensions.</div>}
      {hasRoom && !seat       && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a seat/MLP.</div>}
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
        style={{
          padding: '5px 14px', borderRadius: 5, border: '1px solid #57534e',
          background: running ? '#1c1917' : '#292524',
          color: running || !canRun ? '#57534e' : '#d6d3d1',
          fontSize: 10, ...MONO, cursor: running || !canRun ? 'default' : 'pointer',
          marginBottom: 10, fontWeight: 700,
        }}
      >
        {running ? `Running ${K_VALUES.length} k values…` : rows ? 'Re-run' : `Run High-Order Suppression Sweep (${K_VALUES.length} steps)`}
      </button>

      {rows && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>k</th>
                  <th style={{ ...TH, color: '#fbbf24' }}>MAE</th>
                  <th style={{ ...TH, color: '#86efac' }}>MAE Δ vs k=0</th>
                  <th style={{ ...TH, color: '#fb923c' }}>Worst err</th>
                  <th style={TH}>Worst Hz</th>
                  <th style={{ ...TH, color: '#93c5fd' }}>70 Hz Δ</th>
                  <th style={{ ...TH, color: '#6ee7b7' }}>80 Hz Δ</th>
                  <th style={{ ...TH, color: '#a78bfa' }}>85 Hz Δ</th>
                  <th style={{ ...TH, color: '#fda4af' }}>90 Hz Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isHighlight = row.isBest || row.isBaseline;
                  const bg = row.isBest ? '#172554' : row.isBaseline ? '#1c1917' : undefined;
                  return (
                    <tr key={row.k} style={{ background: bg }}>
                      <td style={{ ...TD, textAlign: 'left', color: row.isBest ? '#93c5fd' : row.isBaseline ? '#78716c' : '#a8a29e', fontWeight: isHighlight ? 700 : 400 }}>
                        {row.isBest     && <span style={{ color: '#60a5fa', marginRight: 5 }}>★</span>}
                        {row.isBaseline && !row.isBest && <span style={{ color: '#44403c', marginRight: 5 }}>○</span>}
                        k = {row.k.toFixed(2)}
                        {row.isBaseline && <span style={{ color: '#44403c', fontSize: 7, marginLeft: 6 }}>baseline</span>}
                      </td>
                      <td style={{ ...TD, fontWeight: row.isBest ? 700 : 400, color: row.isBest ? '#60a5fa' : errColor(row.mae) }}>
                        {fmt(row.mae)}
                      </td>
                      <td style={{ ...TD, color: row.isBaseline ? '#44403c' : (row.maeImprovement > 0 ? '#4ade80' : '#f87171') }}>
                        {row.isBaseline ? '—' : (row.maeImprovement >= 0 ? '−' : '+') + Math.abs(row.maeImprovement ?? 0).toFixed(3)}
                      </td>
                      <td style={{ ...TD, color: errColor(row.worstErr) }}>{fmt(row.worstErr)}</td>
                      <td style={{ ...TD, color: '#6b7280' }}>{row.worstHz ?? '—'}</td>
                      <td style={{ ...TD, color: errColor(row.e70) }}>{fmtΔ(row.e70)}</td>
                      <td style={{ ...TD, color: errColor(row.e80) }}>{fmtΔ(row.e80)}</td>
                      <td style={{ ...TD, color: errColor(row.e85) }}>{fmtΔ(row.e85)}</td>
                      <td style={{ ...TD, color: errColor(row.e90) }}>{fmtΔ(row.e90)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {interpretation && (
            <div style={{ marginTop: 8, fontSize: 9, ...MONO, padding: '7px 10px', background: '#1c1917', borderRadius: 4, borderLeft: `3px solid ${interpretation.color}`, color: interpretation.color, lineHeight: 1.9 }}>
              ▶ {interpretation.text}
            </div>
          )}

          <div style={{ marginTop: 5, fontSize: 8, color: '#44403c', ...MONO }}>
            ★ best MAE · ○ k=0 production baseline · MAE Δ: negative = improvement over baseline
            <br />
            Δ colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span>
          </div>
        </>
      )}
    </div>
  );
}