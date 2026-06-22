/**
 * ParityRootCauseMatrixAudit — Diagnostic only.
 * Does NOT affect live graph or production defaults.
 *
 * Sweeps 3 axes simultaneously:
 *   A) Modal Q scale (×current Q values)
 *   B) Direct-field amplitude scale
 *   C) Modal-field amplitude scale
 *
 * Fixed: Direct+Modes, Reflections OFF, Flat REW reference,
 *        current coherence model, current modal order handling.
 *
 * 6 × 5 × 5 = 150 combinations total.
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  modeShapeValueLocal,
  resonantTransfer,
  estimateModeQLocal,
} from '@/components/room/bass/core/modalCalculations';

// ── Sweep axes ────────────────────────────────────────────────────────────────
const Q_SCALES      = [0.50, 0.75, 1.00, 1.25, 1.50, 2.00];
const DIRECT_SCALES = [0.50, 0.75, 1.00, 1.25, 1.50];
const MODAL_SCALES  = [0.50, 0.75, 1.00, 1.25, 1.50];

// ── REW benchmark ─────────────────────────────────────────────────────────────
const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 }, { hz: 25,  db: 93.6 }, { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 }, { hz: 50,  db: 91.8 }, { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 }, { hz: 70,  db: 86.8 }, { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 }, { hz: 100, db: 98.3 }, { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 }, { hz: 180, db: 99.3 }, { hz: 200, db: 99.5 },
];

const SPEED_OF_SOUND = 343;

const FREQ_GRID = [];
for (let f = 20; f <= 200; f += (f < 100 ? 2 : 5)) FREQ_GRID.push(f);

// ── Math helpers ──────────────────────────────────────────────────────────────
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

// ── Mode builder ──────────────────────────────────────────────────────────────
function buildModes(roomDims, surfaceAbsorption, axialQ, qScale) {
  const raw = computeRoomModesLocal({
    widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM,
    fMax: 220, c: SPEED_OF_SOUND,
  });
  return raw.map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? axialQ * 0.85 : axialQ * 0.65;
    const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption: surfaceAbsorption ?? {}, f0: mode.freq });
    const rawQ = Math.max(1, Math.min(baseQ, absorptionQ));
    const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const family = activeAxes === 1 ? 'axial' : activeAxes === 2 ? 'tangential' : 'oblique';
    return { ...mode, order, family, qValue: Math.max(0.5, rawQ * qScale) };
  });
}

// ── Single simulation ─────────────────────────────────────────────────────────
function runSim(modes, subPos, seatPos, roomDims, distanceBlend, directScale, modalScale) {
  const distM = Math.max(0.01, Math.sqrt(
    Math.pow(subPos.x - seatPos.x, 2) +
    Math.pow(subPos.y - seatPos.y, 2) +
    Math.pow(subPos.z - seatPos.z, 2)
  ));

  const directAmpBase = db2mag(94 - 20 * Math.log10(distM)) * directScale;
  const fullLossDb = -20 * Math.log10(distM / 1);
  const blendedLossDb = fullLossDb * distanceBlend;
  const modalGainScalar = db2mag(blendedLossDb - 20 * Math.log10(distM)) * modalScale;

  // Pre-compute per-mode gain
  const modeData = modes.map(mode => {
    const srcPsi = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z, roomDims);
    const rcvPsi = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, roomDims);
    const coupling = srcPsi * rcvPsi;
    const axialCorr = (mode.family === 'axial' && mode.order >= 2) ? 0.50 : 1.0;
    const orderWeight = mode.order >= 2 ? 0.50 : 1.0;
    const gain = db2mag(94) * modalGainScalar * coupling * orderWeight * axialCorr;
    return { mode, gain };
  });

  return FREQ_GRID.map(hz => {
    const phase = -2 * Math.PI * hz * (distM / SPEED_OF_SOUND);
    let sumRe = directAmpBase * Math.cos(phase);
    let sumIm = directAmpBase * Math.sin(phase);
    for (const { mode, gain } of modeData) {
      const { re: tr, im: ti } = resonantTransfer(hz, mode.freq, mode.qValue);
      sumRe += gain * tr;
      sumIm += gain * ti;
    }
    return { hz, db: mag2db(Math.sqrt(sumRe * sumRe + sumIm * sumIm)) };
  });
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function scoreSeries(series) {
  let sumErr = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db: ref } of REW_BENCHMARK) {
    const sim = interpSeries(series, hz);
    if (sim === null || !Number.isFinite(sim)) continue;
    const err = Math.abs(sim - ref);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  const signedAt = (hz) => {
    const s = interpSeries(series, hz);
    return s !== null ? s - interpBenchmark(hz) : null;
  };
  return {
    mae: count > 0 ? sumErr / count : null,
    worstErr, worstHz,
    e70: signedAt(70), e80: signedAt(80), e85: signedAt(85), e90: signedAt(90),
  };
}

// ── Heatmap helpers ───────────────────────────────────────────────────────────
// For each value of an axis, compute the mean MAE across all combos with that value
function buildHeatmapAxis(allRows, axisKey, axisValues) {
  return axisValues.map(val => {
    const subset = allRows.filter(r => r[axisKey] === val);
    const avg = subset.length > 0
      ? subset.reduce((s, r) => s + r.mae, 0) / subset.length
      : null;
    const best = subset.length > 0 ? Math.min(...subset.map(r => r.mae)) : null;
    return { value: val, avgMae: avg, bestMae: best };
  });
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH = {
  padding: '3px 8px', fontSize: 9, fontWeight: 700, ...MONO,
  background: '#0c0a09', color: '#d6d3d1',
  borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right',
};
const TD = { padding: '3px 8px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };

const fmt  = (v, d = 3) => Number.isFinite(v) ? v.toFixed(d) : '—';
const fmtΔ = (v) => !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2);

function errColor(v) {
  const a = Math.abs(v ?? 0);
  if (!Number.isFinite(v)) return '#6b7280';
  if (a <= 1)  return '#4ade80';
  if (a <= 3)  return '#fbbf24';
  if (a <= 6)  return '#fb923c';
  return '#f87171';
}

// Map MAE to a heat colour: low=green, mid=yellow, high=red
function maeHeatColor(mae, minMae, maxMae) {
  if (!Number.isFinite(mae) || !Number.isFinite(minMae) || !Number.isFinite(maxMae) || maxMae === minMae) return '#292524';
  const t = Math.max(0, Math.min(1, (mae - minMae) / (maxMae - minMae)));
  if (t < 0.5) {
    const r = Math.round(74  + (251 - 74)  * (t * 2));
    const g = Math.round(222 + (191 - 222) * (t * 2));
    const b = Math.round(128 + (36  - 128) * (t * 2));
    return `rgb(${r},${g},${b})`;
  } else {
    const tt = (t - 0.5) * 2;
    const r = Math.round(251 + (248 - 251) * tt);
    const g = Math.round(191 + (113 - 191) * tt);
    const b = Math.round(36  + (113 - 36)  * tt);
    return `rgb(${r},${g},${b})`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ParityRootCauseMatrixAudit({
  roomDims, subs, seat, surfaceAbsorption,
  axialQ = 4.0,
  distanceBlend = 0.55,  // current production default
}) {
  const [running, setRunning]   = useState(false);
  const [allRows, setAllRows]   = useState(null);
  const [progress, setProgress] = useState(0);

  const currentSub = subs?.[0] ?? null;
  const hasRoom    = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const canRun     = hasRoom && seat?.x != null && currentSub?.x != null;

  const totalCombos = Q_SCALES.length * DIRECT_SCALES.length * MODAL_SCALES.length;

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setAllRows(null);
    setProgress(0);

    setTimeout(() => {
      try {
        const subPos  = { x: currentSub.x, y: currentSub.y, z: currentSub.z ?? 0.35 };
        const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };

        const rows = [];
        let done = 0;

        for (const qScale of Q_SCALES) {
          const modes = buildModes(roomDims, surfaceAbsorption, axialQ, qScale);
          for (const dScale of DIRECT_SCALES) {
            for (const mScale of MODAL_SCALES) {
              const series = runSim(modes, subPos, seatPos, roomDims, distanceBlend, dScale, mScale);
              const score  = scoreSeries(series);
              if (Number.isFinite(score.mae)) {
                rows.push({ qScale, dScale, mScale, ...score });
              }
              done++;
            }
          }
        }

        rows.sort((a, b) => a.mae - b.mae);
        setAllRows(rows);
        setProgress(done);
      } catch (e) {
        console.error('[ParityRootCauseMatrixAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [roomDims, seat, currentSub, surfaceAbsorption, axialQ, distanceBlend, canRun]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const top10 = allRows?.slice(0, 10) ?? [];

  const productionRow = allRows?.find(r => r.qScale === 1.00 && r.dScale === 1.00 && r.mScale === 1.00);
  const productionRank = allRows?.findIndex(r => r.qScale === 1.00 && r.dScale === 1.00 && r.mScale === 1.00) + 1;

  const minMae = allRows ? allRows[allRows.length - 1]?.mae : null;  // sorted asc, last = worst
  const maxMae = allRows ? allRows[0]?.mae : null;                   // first = best
  // Flip for heat: best (lowest MAE) should be green
  const globalMin = allRows ? Math.min(...allRows.map(r => r.mae)) : null;
  const globalMax = allRows ? Math.max(...allRows.map(r => r.mae)) : null;

  const qHeatmap      = allRows ? buildHeatmapAxis(allRows, 'qScale', Q_SCALES) : null;
  const directHeatmap = allRows ? buildHeatmapAxis(allRows, 'dScale', DIRECT_SCALES) : null;
  const modalHeatmap  = allRows ? buildHeatmapAxis(allRows, 'mScale', MODAL_SCALES) : null;

  // Interpretation
  const interpretation = (() => {
    if (!qHeatmap || !directHeatmap || !modalHeatmap) return null;

    const spread = (hm) => {
      const avgs = hm.map(r => r.avgMae).filter(Number.isFinite);
      return avgs.length > 1 ? Math.max(...avgs) - Math.min(...avgs) : 0;
    };
    const qSpread = spread(qHeatmap);
    const dSpread = spread(directHeatmap);
    const mSpread = spread(modalHeatmap);
    const total   = qSpread + dSpread + mSpread;

    if (total < 0.01) return { text: 'All axes have negligible influence — parity gap is structural (engine architecture or benchmark mismatch).', color: '#6b7280', dominant: null };

    const qPct = (qSpread / total * 100).toFixed(0);
    const dPct = (dSpread / total * 100).toFixed(0);
    const mPct = (mSpread / total * 100).toFixed(0);

    const maxSpread = Math.max(qSpread, dSpread, mSpread);
    const dominant = maxSpread === qSpread ? 'Q' : maxSpread === dSpread ? 'Direct' : 'Modal';
    const dominantPct = dominant === 'Q' ? qPct : dominant === 'Direct' ? dPct : mPct;

    let text, color;
    if (Number(dominantPct) >= 60) {
      if (dominant === 'Q')      { text = `Bandwidth / damping calibration is the primary parity driver (Q spread = ${qSpread.toFixed(3)} dB, ${qPct}% of total influence).`; color = '#f87171'; }
      if (dominant === 'Direct') { text = `Direct-field amplitude calibration is the primary parity driver (direct spread = ${dSpread.toFixed(3)} dB, ${dPct}% of total influence).`; color = '#fb923c'; }
      if (dominant === 'Modal')  { text = `Modal amplitude calibration is the primary parity driver (modal spread = ${mSpread.toFixed(3)} dB, ${mPct}% of total influence).`; color = '#fbbf24'; }
    } else {
      text = `Parity gap is multi-factor and cannot be solved by a single parameter. Q: ${qPct}%, Direct: ${dPct}%, Modal: ${mPct}% of total MAE influence.`;
      color = '#86efac';
    }

    return { text, color, dominant, qSpread, dSpread, mSpread, qPct, dPct, mPct };
  })();

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* ── Header ── */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Parity Root Cause Matrix Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Fixed: Direct+Modes · Reflections OFF · Flat REW ref · blend={distanceBlend.toFixed(2)} · Q base={axialQ.toFixed(1)}<br />
        Axes: Q scale ({Q_SCALES.join(', ')}) × Direct scale ({DIRECT_SCALES.join(', ')}) × Modal scale ({MODAL_SCALES.join(', ')}) = {totalCombos} combinations
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
        onClick={runAudit}
        disabled={running || !canRun}
        style={{
          padding: '5px 14px', borderRadius: 5, border: '1px solid #57534e',
          background: running ? '#1c1917' : '#292524',
          color: running || !canRun ? '#57534e' : '#d6d3d1',
          fontSize: 10, ...MONO, cursor: running || !canRun ? 'default' : 'pointer',
          marginBottom: 10, fontWeight: 700,
        }}
      >
        {running ? `Running ${totalCombos} combinations…` : allRows ? 'Re-run' : `Run Parity Root Cause Matrix (${totalCombos} combos)`}
      </button>

      {allRows && (
        <>
          {/* ── Interpretation banner ── */}
          {interpretation && (
            <div style={{ marginBottom: 12, fontSize: 9, ...MONO, padding: '8px 10px', background: '#1c1917', borderRadius: 4, borderLeft: `3px solid ${interpretation.color}`, color: interpretation.color, lineHeight: 2.0 }}>
              <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 3 }}>▶ Root Cause Interpretation</div>
              {interpretation.text}
              {interpretation.qSpread != null && (
                <div style={{ marginTop: 4, color: '#78716c' }}>
                  Q spread: {fmt(interpretation.qSpread)} dB ({interpretation.qPct}%) &nbsp;|&nbsp;
                  Direct spread: {fmt(interpretation.dSpread)} dB ({interpretation.dPct}%) &nbsp;|&nbsp;
                  Modal spread: {fmt(interpretation.mSpread)} dB ({interpretation.mPct}%)
                </div>
              )}
            </div>
          )}

          {/* ── Current production rank ── */}
          {productionRow && (
            <div style={{ marginBottom: 10, fontSize: 9, ...MONO, padding: '6px 10px', background: '#1c1917', borderRadius: 4, borderLeft: '3px solid #78716c', color: '#a8a29e', lineHeight: 1.8 }}>
              <strong style={{ color: '#d6d3d1' }}>Current production (Q×1.0, Direct×1.0, Modal×1.0)</strong><br />
              Rank: <strong style={{ color: productionRank <= 10 ? '#4ade80' : productionRank <= 30 ? '#fbbf24' : '#f87171' }}>#{productionRank}</strong> of {allRows.length} &nbsp;|&nbsp;
              MAE: <strong>{fmt(productionRow.mae)}</strong> dB &nbsp;|&nbsp;
              Worst: {fmt(productionRow.worstErr)} dB @ {productionRow.worstHz} Hz &nbsp;|&nbsp;
              Best possible MAE: <strong style={{ color: '#4ade80' }}>{fmt(allRows[0]?.mae)}</strong> dB &nbsp;|&nbsp;
              Headroom: <strong style={{ color: '#fbbf24' }}>{fmt(productionRow.mae - (allRows[0]?.mae ?? 0))} dB</strong>
            </div>
          )}

          {/* ── Top 10 table ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', ...MONO, marginBottom: 4 }}>
            Top 10 combinations — ranked best → worst by MAE
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 740 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>Rank</th>
                  <th style={{ ...TH, color: '#f87171'  }}>Q scale</th>
                  <th style={{ ...TH, color: '#93c5fd'  }}>Direct ×</th>
                  <th style={{ ...TH, color: '#86efac'  }}>Modal ×</th>
                  <th style={{ ...TH, color: '#fbbf24'  }}>MAE</th>
                  <th style={{ ...TH, color: '#60a5fa'  }}>vs prod</th>
                  <th style={{ ...TH, color: '#fb923c'  }}>Worst</th>
                  <th style={TH}>Worst Hz</th>
                  <th style={{ ...TH, color: '#93c5fd'  }}>70 Hz Δ</th>
                  <th style={{ ...TH, color: '#6ee7b7'  }}>80 Hz Δ</th>
                  <th style={{ ...TH, color: '#a78bfa'  }}>85 Hz Δ</th>
                  <th style={{ ...TH, color: '#fda4af'  }}>90 Hz Δ</th>
                </tr>
              </thead>
              <tbody>
                {/* Production row first if not in top 10 */}
                {productionRow && productionRank > 10 && (() => {
                  const imp = (productionRow.mae - (allRows[0]?.mae ?? 0));
                  return (
                    <tr style={{ background: '#1c1917', borderBottom: '2px solid #44403c' }}>
                      <td style={{ ...TD, textAlign: 'left', color: '#78716c' }}>★ prod (#{productionRank})</td>
                      <td style={{ ...TD, color: '#a8a29e' }}>1.00</td>
                      <td style={{ ...TD, color: '#a8a29e' }}>1.00</td>
                      <td style={{ ...TD, color: '#a8a29e' }}>1.00</td>
                      <td style={{ ...TD, color: '#a8a29e' }}>{fmt(productionRow.mae)}</td>
                      <td style={{ ...TD, color: '#f87171' }}>▲ {fmt(imp)}</td>
                      <td style={{ ...TD, color: errColor(productionRow.worstErr) }}>{fmt(productionRow.worstErr)}</td>
                      <td style={{ ...TD, color: '#6b7280' }}>{productionRow.worstHz ?? '—'}</td>
                      <td style={{ ...TD, color: errColor(productionRow.e70) }}>{fmtΔ(productionRow.e70)}</td>
                      <td style={{ ...TD, color: errColor(productionRow.e80) }}>{fmtΔ(productionRow.e80)}</td>
                      <td style={{ ...TD, color: errColor(productionRow.e85) }}>{fmtΔ(productionRow.e85)}</td>
                      <td style={{ ...TD, color: errColor(productionRow.e90) }}>{fmtΔ(productionRow.e90)}</td>
                    </tr>
                  );
                })()}

                {top10.map((row, i) => {
                  const isProd = row.qScale === 1.00 && row.dScale === 1.00 && row.mScale === 1.00;
                  const isBest = i === 0;
                  const impVsProd = productionRow ? productionRow.mae - row.mae : null;
                  const bg = isBest ? '#172554' : isProd ? '#1c2a1c' : undefined;
                  return (
                    <tr key={i} style={{ background: bg, borderBottom: '1px solid #1c1917' }}>
                      <td style={{ ...TD, textAlign: 'left', color: isBest ? '#60a5fa' : isProd ? '#4ade80' : '#78716c', fontWeight: isBest || isProd ? 700 : 400 }}>
                        {isBest ? '★ 1' : isProd ? `✓ ${i + 1}` : `#${i + 1}`}
                        {isProd && <span style={{ color: '#4ade80', fontSize: 8, marginLeft: 4 }}>prod</span>}
                      </td>
                      <td style={{ ...TD, color: row.qScale !== 1.00 ? '#f87171' : '#78716c', fontWeight: row.qScale !== 1.00 ? 700 : 400 }}>{row.qScale.toFixed(2)}</td>
                      <td style={{ ...TD, color: row.dScale !== 1.00 ? '#93c5fd' : '#78716c', fontWeight: row.dScale !== 1.00 ? 700 : 400 }}>{row.dScale.toFixed(2)}</td>
                      <td style={{ ...TD, color: row.mScale !== 1.00 ? '#86efac' : '#78716c', fontWeight: row.mScale !== 1.00 ? 700 : 400 }}>{row.mScale.toFixed(2)}</td>
                      <td style={{ ...TD, fontWeight: isBest ? 700 : 400, color: isBest ? '#60a5fa' : errColor(row.mae) }}>{fmt(row.mae)}</td>
                      <td style={{ ...TD, color: (impVsProd ?? 0) > 0.01 ? '#4ade80' : (impVsProd ?? 0) < -0.01 ? '#f87171' : '#78716c', fontWeight: (impVsProd ?? 0) > 0.01 ? 700 : 400 }}>
                        {impVsProd != null ? ((impVsProd >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(impVsProd))) : '—'}
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

          {/* ── Sensitivity heatmaps ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', ...MONO, marginBottom: 6 }}>
            MAE Sensitivity Heatmaps — avg MAE across all combos for each axis value
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>

            {/* Q scale heatmap */}
            {qHeatmap && (() => {
              const avgs = qHeatmap.map(r => r.avgMae).filter(Number.isFinite);
              const lo = Math.min(...avgs), hi = Math.max(...avgs);
              return (
                <div>
                  <div style={{ fontSize: 9, color: '#f87171', ...MONO, fontWeight: 700, marginBottom: 4 }}>Modal Q Scale</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {qHeatmap.map(({ value, avgMae, bestMae }) => (
                      <div key={value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 34, fontSize: 9, ...MONO, color: '#a8a29e', textAlign: 'right' }}>×{value.toFixed(2)}</div>
                        <div style={{
                          width: Math.round(80 * (Number.isFinite(avgMae) ? 1 : 0.5)),
                          height: 14,
                          background: maeHeatColor(avgMae, lo, hi),
                          borderRadius: 2,
                          minWidth: 40,
                        }} />
                        <div style={{ fontSize: 9, ...MONO, color: '#78716c' }}>
                          avg {fmt(avgMae)} / best {fmt(bestMae)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 8, color: '#44403c', ...MONO }}>spread: {fmt(hi - lo)} dB</div>
                </div>
              );
            })()}

            {/* Direct scale heatmap */}
            {directHeatmap && (() => {
              const avgs = directHeatmap.map(r => r.avgMae).filter(Number.isFinite);
              const lo = Math.min(...avgs), hi = Math.max(...avgs);
              return (
                <div>
                  <div style={{ fontSize: 9, color: '#93c5fd', ...MONO, fontWeight: 700, marginBottom: 4 }}>Direct-Field Scale</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {directHeatmap.map(({ value, avgMae, bestMae }) => (
                      <div key={value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 34, fontSize: 9, ...MONO, color: '#a8a29e', textAlign: 'right' }}>×{value.toFixed(2)}</div>
                        <div style={{
                          width: Math.round(80 * (Number.isFinite(avgMae) ? 1 : 0.5)),
                          height: 14,
                          background: maeHeatColor(avgMae, lo, hi),
                          borderRadius: 2,
                          minWidth: 40,
                        }} />
                        <div style={{ fontSize: 9, ...MONO, color: '#78716c' }}>
                          avg {fmt(avgMae)} / best {fmt(bestMae)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 8, color: '#44403c', ...MONO }}>spread: {fmt(hi - lo)} dB</div>
                </div>
              );
            })()}

            {/* Modal scale heatmap */}
            {modalHeatmap && (() => {
              const avgs = modalHeatmap.map(r => r.avgMae).filter(Number.isFinite);
              const lo = Math.min(...avgs), hi = Math.max(...avgs);
              return (
                <div>
                  <div style={{ fontSize: 9, color: '#86efac', ...MONO, fontWeight: 700, marginBottom: 4 }}>Modal-Field Scale</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {modalHeatmap.map(({ value, avgMae, bestMae }) => (
                      <div key={value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 34, fontSize: 9, ...MONO, color: '#a8a29e', textAlign: 'right' }}>×{value.toFixed(2)}</div>
                        <div style={{
                          width: Math.round(80 * (Number.isFinite(avgMae) ? 1 : 0.5)),
                          height: 14,
                          background: maeHeatColor(avgMae, lo, hi),
                          borderRadius: 2,
                          minWidth: 40,
                        }} />
                        <div style={{ fontSize: 9, ...MONO, color: '#78716c' }}>
                          avg {fmt(avgMae)} / best {fmt(bestMae)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 8, color: '#44403c', ...MONO }}>spread: {fmt(hi - lo)} dB</div>
                </div>
              );
            })()}
          </div>

          {/* ── Legend ── */}
          <div style={{ fontSize: 8, color: '#44403c', ...MONO, lineHeight: 1.9 }}>
            ★ best · ✓ production baseline · ▼ improvement · ▲ worse<br />
            Δ colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span><br />
            Heatmap: <span style={{ color: 'rgb(74,222,128)' }}>green = low MAE</span> · <span style={{ color: 'rgb(248,113,113)' }}>red = high MAE</span> · bar width is fixed; bar colour encodes MAE within each axis independently.
          </div>
        </>
      )}
    </div>
  );
}