/**
 * SourceCoherenceMatrixAudit — Diagnostic only. Does not affect the live graph.
 *
 * Rows:    distance blend 0.25 / 0.55 (current) / 0.75 / 1.00
 * Columns: A) Fully coherent  B) Family-coherent + families RSS  C) All families RSS
 *
 * For every cell reports: MAE, Worst error, Worst Hz, 70/80/85 Hz signed error.
 * Highlights: best overall MAE cell, best 80 Hz error cell.
 *
 * Goal: isolate whether the parity gap is driven by source coupling model,
 * modal summation architecture, or both.
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
const FLAT_REF = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const REW_BENCHMARK = [
  { hz: 20,  db: 93.1 }, { hz: 25,  db: 96.6 }, { hz: 30,  db: 95.8 },
  { hz: 34,  db: 94.1 }, { hz: 40,  db: 100.3 }, { hz: 45, db: 98.6 },
  { hz: 50,  db: 97.5 }, { hz: 55,  db: 95.7 }, { hz: 60,  db: 91.2 },
  { hz: 63,  db: 89.8 }, { hz: 68,  db: 85.2 }, { hz: 70,  db: 83.1 },
  { hz: 75,  db: 84.4 }, { hz: 80,  db: 86.2 }, { hz: 85,  db: 88.4 },
  { hz: 90,  db: 89.1 }, { hz: 100, db: 87.3 }, { hz: 120, db: 83.6 },
  { hz: 150, db: 79.2 }, { hz: 200, db: 74.1 },
];

const BLEND_ROWS = [
  { blend: 0.25, label: '0.25' },
  { blend: 0.55, label: '0.55 ▶ current' },
  { blend: 0.75, label: '0.75' },
  { blend: 1.00, label: '1.00' },
];

const COHERENCE_COLS = [
  { key: 'coherent',   label: 'A) All coherent' },
  { key: 'familyRss',  label: 'B) Family coh + RSS' },
  { key: 'allRss',     label: 'C) All RSS' },
];

const FREQ_RANGE = [];
for (let f = 20; f <= 200; f += (f < 50 ? 2 : f < 100 ? 2 : 5)) FREQ_RANGE.push(f);

// ── Pure helpers ──────────────────────────────────────────────────────────────
function interpRef(hz) {
  // flat 94 dB
  return 94;
}

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

function mag2db(mag) { return 20 * Math.log10(Math.max(mag, 1e-10)); }

function buildModes(roomDims, surfaceAbsorption) {
  const raw = computeRoomModesLocal({
    widthM: roomDims.widthM,
    lengthM: roomDims.lengthM,
    heightM: roomDims.heightM,
    fMax: 220,
    c: SPEED_OF_SOUND,
  });
  return raw.map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? 4.0 : activeAxes === 2 ? 3.9 : 2.5;
    const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption: surfaceAbsorption ?? {}, f0: mode.freq });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
  });
}

/**
 * Compute direct + modal SPL at a single frequency using a given distance blend.
 * Returns { coherent, familyRss, allRss } in dB.
 */
function computeAtHz(hz, modes, subPos, seatPos, roomDims, distBlend) {
  // ── Direct sound ──
  const dx = subPos.x - seatPos.x;
  const dy = subPos.y - seatPos.y;
  const dz = subPos.z - seatPos.z;
  const distM = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
  const directAmp = Math.pow(10, (interpRef(hz) - 20 * Math.log10(distM)) / 20);
  const directPhase = -2 * Math.PI * hz * (distM / SPEED_OF_SOUND);
  const dRe = directAmp * Math.cos(directPhase);
  const dIm = directAmp * Math.sin(directPhase);

  // ── Modal gain scalar from distance blend ──
  // blend=0 → existing 1m ref, blend=1 → full distance-normalized
  const fullLossDb = -20 * Math.log10(distM);
  const blendedLossDb = fullLossDb * Math.max(0, Math.min(1, distBlend));
  const modalGainScalar = Math.pow(10, blendedLossDb / 20);
  const curveDb = interpRef(hz);

  // ── Modal contributions per family ──
  const families = {
    axial:      { re: 0, im: 0, energySum: 0 },
    tangential: { re: 0, im: 0, energySum: 0 },
    oblique:    { re: 0, im: 0, energySum: 0 },
  };

  for (const mode of modes) {
    const srcPsi = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z, roomDims);
    const rcvPsi = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, roomDims);
    const coupling = srcPsi * rcvPsi;
    const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
    const axialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
    const baseAmp = Math.pow(10, curveDb / 20) * modalGainScalar;
    const gain = baseAmp * coupling * orderWeight * axialScale;
    const { re: tr, im: ti } = resonantTransfer(hz, mode.freq, mode.qValue);
    const re = gain * tr;
    const im = gain * ti;
    const fam = families[mode.type] ?? families.oblique;
    fam.re += re;
    fam.im += im;
    fam.energySum += re*re + im*im;
  }

  // ── A) All coherent ──
  const allRe = dRe + families.axial.re + families.tangential.re + families.oblique.re;
  const allIm = dIm + families.axial.im + families.tangential.im + families.oblique.im;
  const coherentDb = mag2db(Math.sqrt(allRe*allRe + allIm*allIm));

  // ── B) Family-coherent + families RSS ──
  const dMagSq = dRe*dRe + dIm*dIm;
  const axMagSq = families.axial.re**2 + families.axial.im**2;
  const tgMagSq = families.tangential.re**2 + families.tangential.im**2;
  const obMagSq = families.oblique.re**2 + families.oblique.im**2;
  const familyRssDb = mag2db(Math.sqrt(dMagSq + axMagSq + tgMagSq + obMagSq));

  // ── C) All RSS ──
  const allEnergyRss = dMagSq + families.axial.energySum + families.tangential.energySum + families.oblique.energySum;
  const allRssDb = mag2db(Math.sqrt(allEnergyRss));

  return { coherentDb, familyRssDb, allRssDb };
}

/**
 * Build a full frequency series for a given blend × coherence combo,
 * then compute MAE + per-Hz errors against benchmark.
 */
function runCombo(modes, subPos, seatPos, roomDims, blend, coherenceKey) {
  const series = FREQ_RANGE.map(hz => {
    const cell = computeAtHz(hz, modes, subPos, seatPos, roomDims, blend);
    return { hz, db: cell[coherenceKey === 'coherent' ? 'coherentDb' : coherenceKey === 'familyRss' ? 'familyRssDb' : 'allRssDb'] };
  });

  // MAE vs benchmark
  let sumErr = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db: ref } of REW_BENCHMARK) {
    const sim = interpSeries(series, hz);
    if (sim === null || !Number.isFinite(sim)) continue;
    const err = Math.abs(sim - ref);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  const mae = count > 0 ? sumErr / count : null;

  // Signed errors at specific frequencies
  const errAt = (hz) => {
    const sim = interpSeries(series, hz);
    const ref = interpBenchmark(hz);
    return (sim !== null && Number.isFinite(sim)) ? sim - ref : null;
  };

  return { mae, worstErr, worstHz, e70: errAt(70), e80: errAt(80), e85: errAt(85) };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };

function errColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a <= 1)  return '#4ade80';
  if (a <= 3)  return '#fbbf24';
  if (a <= 6)  return '#fb923c';
  return '#f87171';
}
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function fmtΔ(v) { if (!Number.isFinite(v)) return '—'; return (v >= 0 ? '+' : '') + v.toFixed(2); }

const TH = {
  padding: '3px 8px', fontSize: 8, fontWeight: 700, ...MONO,
  background: '#1c1917', color: '#d6d3d1', textAlign: 'right',
  borderBottom: '2px solid #292524', whiteSpace: 'nowrap',
};
const TD = { padding: '3px 8px', fontSize: 8, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };

// ── Component ─────────────────────────────────────────────────────────────────
export default function SourceCoherenceMatrixAudit({ roomDims, subs, seat, surfaceAbsorption }) {
  const [running, setRunning]   = useState(false);
  const [matrix, setMatrix]     = useState(null); // [blendIdx][cohIdx] = { mae, worstErr, worstHz, e70, e80, e85 }

  const currentSub = subs?.[0] ?? null;
  const hasRoom    = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const canRun     = hasRoom && seat?.x != null && currentSub?.x != null;

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setMatrix(null);
    setTimeout(() => {
      try {
        const subPos  = { x: currentSub.x, y: currentSub.y, z: currentSub.z ?? 0.35 };
        const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
        const modes   = buildModes(roomDims, surfaceAbsorption);

        const result = BLEND_ROWS.map(({ blend }) =>
          COHERENCE_COLS.map(({ key }) => runCombo(modes, subPos, seatPos, roomDims, blend, key))
        );
        setMatrix(result);
      } catch (e) {
        console.error('[SourceCoherenceMatrixAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [roomDims, seat, currentSub, surfaceAbsorption, canRun]);

  // Find best MAE cell and best 80 Hz cell
  let bestMaeVal = Infinity, bestMaePos = null;
  let best80Val  = Infinity, best80Pos  = null;
  if (matrix) {
    matrix.forEach((row, ri) => row.forEach((cell, ci) => {
      if ((cell.mae ?? Infinity) < bestMaeVal)         { bestMaeVal = cell.mae; bestMaePos = `${ri}-${ci}`; }
      if (Math.abs(cell.e80 ?? Infinity) < best80Val)  { best80Val = Math.abs(cell.e80); best80Pos = `${ri}-${ci}`; }
    }));
  }

  const isBestMae = (ri, ci) => bestMaePos === `${ri}-${ci}`;
  const isBest80  = (ri, ci) => best80Pos  === `${ri}-${ci}`;

  const TOTAL_CELLS = BLEND_ROWS.length * COHERENCE_COLS.length;

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Source Model × Coherence Matrix Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.7 }}>
        Rows: distance blend 0.25 / 0.55 / 0.75 / 1.00 &nbsp;|&nbsp;
        Cols: A) All coherent · B) Family-coherent + RSS · C) All RSS<br />
        Isolates whether the parity gap is source coupling, summation architecture, or both.
      </div>

      {!hasRoom && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires room dimensions.</div>}
      {hasRoom && !seat && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a seat/MLP.</div>}
      {hasRoom && !currentSub && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a subwoofer.</div>}

      {canRun && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 9, ...MONO, color: '#78716c', background: '#1c1917', borderRadius: 4, padding: '5px 10px', marginBottom: 8 }}>
          <span>Room: <strong style={{ color: '#d6d3d1' }}>{roomDims.widthM.toFixed(2)}W × {roomDims.lengthM.toFixed(2)}L × {roomDims.heightM.toFixed(2)}H m</strong></span>
          <span>MLP: <strong style={{ color: '#86efac' }}>({seat.x?.toFixed(3)}, {seat.y?.toFixed(3)}, {(seat.z ?? 1.2).toFixed(3)}) m</strong></span>
          <span>Sub: <strong style={{ color: '#93c5fd' }}>({currentSub.x?.toFixed(3)}, {currentSub.y?.toFixed(3)}, {(currentSub.z ?? 0.35).toFixed(3)}) m</strong></span>
          <span style={{ color: '#57534e' }}>{TOTAL_CELLS} cells</span>
        </div>
      )}

      <button
        onClick={runAudit}
        disabled={running || !canRun}
        style={{
          padding: '5px 14px', borderRadius: 5, border: '1px solid #57534e',
          background: running ? '#1c1917' : '#292524',
          color: running ? '#57534e' : '#d6d3d1',
          fontSize: 10, ...MONO, cursor: running || !canRun ? 'default' : 'pointer',
          marginBottom: 10, fontWeight: 700,
        }}
      >
        {running ? `Running ${TOTAL_CELLS} combinations…` : matrix ? 'Re-run Matrix' : `Run Source × Coherence Matrix (${TOTAL_CELLS} cells)`}
      </button>

      {matrix && (
        <>
          {/* ── One sub-table per coherence column ── */}
          {COHERENCE_COLS.map(({ key, label }, ci) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, ...MONO, color: ci === 0 ? '#93c5fd' : ci === 1 ? '#c4b5fd' : '#6ee7b7', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, textAlign: 'left', width: 120 }}>Dist blend</th>
                      <th style={{ ...TH, color: '#fbbf24' }}>MAE</th>
                      <th style={{ ...TH, color: '#fb923c' }}>Worst err</th>
                      <th style={TH}>Worst Hz</th>
                      <th style={{ ...TH, color: '#93c5fd' }}>70 Hz</th>
                      <th style={{ ...TH, color: '#6ee7b7' }}>80 Hz</th>
                      <th style={TH}>85 Hz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BLEND_ROWS.map(({ blend, label: rowLabel }, ri) => {
                      const cell     = matrix[ri][ci];
                      const bestMae  = isBestMae(ri, ci);
                      const best80   = isBest80(ri, ci);
                      const isCurrent = blend === 0.55 && key === 'coherent'; // production baseline
                      return (
                        <tr
                          key={blend}
                          style={{
                            background: bestMae ? '#172554'
                              : best80  ? '#14301f'
                              : isCurrent ? '#1a1a10'
                              : undefined,
                          }}
                        >
                          <td style={{ ...TD, textAlign: 'left', color: bestMae ? '#93c5fd' : best80 ? '#4ade80' : isCurrent ? '#fcd34d' : '#a8a29e', fontWeight: (bestMae || best80 || isCurrent) ? 700 : 400 }}>
                            {bestMae && <span style={{ color: '#60a5fa', marginRight: 4 }}>★</span>}
                            {best80  && !bestMae && <span style={{ color: '#4ade80', marginRight: 4 }}>◆</span>}
                            {isCurrent && !bestMae && !best80 && <span style={{ color: '#fcd34d', marginRight: 4 }}>▶</span>}
                            {rowLabel}
                          </td>
                          <td style={{ ...TD, fontWeight: 700, color: bestMae ? '#60a5fa' : errColor(cell.mae) }}>{fmt(cell.mae, 3)}</td>
                          <td style={{ ...TD, color: errColor(cell.worstErr) }}>{fmt(cell.worstErr, 3)}</td>
                          <td style={{ ...TD, color: '#6b7280' }}>{cell.worstHz ?? '—'}</td>
                          <td style={{ ...TD, color: errColor(cell.e70) }}>{fmtΔ(cell.e70)}</td>
                          <td style={{ ...TD, fontWeight: best80 ? 700 : 400, color: best80 ? '#4ade80' : errColor(cell.e80) }}>{fmtΔ(cell.e80)}</td>
                          <td style={{ ...TD, color: errColor(cell.e85) }}>{fmtΔ(cell.e85)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* ── Summary matrix (MAE only) ── */}
          <div style={{ marginTop: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 700, ...MONO, color: '#e7e5e4', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              MAE Summary Matrix
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: 'left' }}>Blend</th>
                    {COHERENCE_COLS.map(({ label }, ci) => (
                      <th key={ci} style={{ ...TH, color: ci === 0 ? '#93c5fd' : ci === 1 ? '#c4b5fd' : '#6ee7b7' }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BLEND_ROWS.map(({ blend, label: rowLabel }, ri) => (
                    <tr key={blend} style={{ borderBottom: '1px solid #1c1917' }}>
                      <td style={{ ...TD, textAlign: 'left', color: '#a8a29e' }}>{rowLabel}</td>
                      {COHERENCE_COLS.map((_, ci) => {
                        const cell    = matrix[ri][ci];
                        const bestMae = isBestMae(ri, ci);
                        return (
                          <td key={ci} style={{ ...TD, background: bestMae ? '#172554' : undefined, fontWeight: bestMae ? 700 : 400, color: bestMae ? '#60a5fa' : errColor(cell.mae) }}>
                            {bestMae && '★ '}{fmt(cell.mae, 3)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div style={{ marginTop: 8, fontSize: 9, ...MONO, color: '#44403c', lineHeight: 1.9, borderTop: '1px solid #1c1917', paddingTop: 6 }}>
            <span style={{ color: '#60a5fa' }}>★</span> best overall MAE &nbsp;
            <span style={{ color: '#4ade80' }}>◆</span> best 80 Hz error &nbsp;
            <span style={{ color: '#fcd34d' }}>▶</span> current production (blend=0.55, all coherent)<br />
            If MAE improves most moving <strong>across rows</strong> → source coupling is dominant.<br />
            If MAE improves most moving <strong>across columns</strong> → summation architecture is dominant.<br />
            If neither axis dominates → both contribute equally.<br />
            Δ colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span>
          </div>
        </>
      )}
    </div>
  );
}