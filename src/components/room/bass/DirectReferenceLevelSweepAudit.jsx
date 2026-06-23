/**
 * DirectReferenceLevelSweepAudit — Diagnostic only.
 * Does NOT affect the live graph or production engine.
 *
 * Goal: determine whether the direct-path parity gap is caused by the assumed
 *       94 dB @ 1 m flat source reference level.
 *
 * Fixed: Direct + Modes · Reflections OFF · Current parity & modal settings · Distance law unchanged.
 * Sweep: source reference SPL from 88 → 100 dB in 2 dB steps.
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
const PROD_SOURCE_SPL = 94;   // production flat REW reference dB @ 1 m
const SWEEP_REFS = [88, 90, 92, 94, 96, 98, 100];
const TARGET_FREQS = [70, 80, 85, 90];

// Frequency grid: 2 Hz steps 20–100, 5 Hz steps 100–200
const FREQ_GRID = [];
for (let f = 20; f <= 200; f += (f < 100 ? 2 : 5)) FREQ_GRID.push(f);

// REW benchmark — same as sibling audits
const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 }, { hz: 25,  db: 93.6 }, { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 }, { hz: 50,  db: 91.8 }, { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 }, { hz: 70,  db: 86.8 }, { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 }, { hz: 100, db: 98.3 }, { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 }, { hz: 180, db: 99.3 }, { hz: 200, db: 99.5 },
];

// ── Math helpers ──────────────────────────────────────────────────────────────
const db2mag = (d) => Math.pow(10, d / 20);
const mag2db = (m) => 20 * Math.log10(Math.max(m, 1e-10));

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

function getSubDist(sub, seat) {
  const dx = sub.x - seat.x;
  const dy = sub.y - seat.y;
  const dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  return Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
}

// ── Mode builder ──────────────────────────────────────────────────────────────
function buildModes(roomDims, surfaceAbsorption, axialQ) {
  const raw = computeRoomModesLocal({
    widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM,
    fMax: 220, c: SPEED_OF_SOUND,
  });
  return raw.map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? axialQ * 0.85 : axialQ * 0.65;
    const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption: surfaceAbsorption ?? {}, f0: mode.freq });
    const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const family = activeAxes === 1 ? 'axial' : activeAxes === 2 ? 'tangential' : 'oblique';
    return { ...mode, order, family, qValue: Math.max(0.5, Math.max(1, Math.min(baseQ, absorptionQ))) };
  });
}

// ── Core simulation — source reference level is parameterised ─────────────────
// Both direct and modal are anchored to the same sourceSplRef so that changing
// the reference shifts the entire field uniformly (tests static calibration offset).
function runSimWithRef(modes, subPos, seatPos, distM, distanceBlend, sourceSplRef) {
  // Direct amplitude at seat
  const directAmp = db2mag(sourceSplRef - 20 * Math.log10(distM));

  // Modal gain scalar (same blend logic as production)
  const fullLossDb    = -20 * Math.log10(distM / 1);
  const blendedLossDb = fullLossDb * distanceBlend;
  const modalGainScalar = db2mag(blendedLossDb - 20 * Math.log10(distM));

  const modeData = modes.map(mode => {
    const srcPsi = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z, { widthM: subPos.rW, lengthM: subPos.rL, heightM: subPos.rH });
    const rcvPsi = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, { widthM: subPos.rW, lengthM: subPos.rL, heightM: subPos.rH });
    const coupling    = srcPsi * rcvPsi;
    const axialCorr   = (mode.family === 'axial' && mode.order >= 2) ? 0.50 : 1.0;
    const orderWeight = mode.order >= 2 ? 0.50 : 1.0;
    // Modal gain anchored to the same sourceSplRef
    const gain = db2mag(sourceSplRef) * modalGainScalar * coupling * orderWeight * axialCorr;
    return { mode, gain };
  });

  return FREQ_GRID.map(hz => {
    const phase = -2 * Math.PI * hz * (distM / SPEED_OF_SOUND);
    let sumRe = directAmp * Math.cos(phase);
    let sumIm = directAmp * Math.sin(phase);
    for (const { mode, gain } of modeData) {
      const { re: tr, im: ti } = resonantTransfer(hz, mode.freq, mode.qValue);
      sumRe += gain * tr;
      sumIm += gain * ti;
    }
    const combined = mag2db(Math.sqrt(sumRe * sumRe + sumIm * sumIm));
    // Direct-only SPL (free-field, no phase)
    const directSpl = sourceSplRef - 20 * Math.log10(distM);
    return { hz, db: combined, directSpl };
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

// ── Shape-shift detector ──────────────────────────────────────────────────────
// Compare signed-error spread across target freqs between production (94 dB) and
// the best candidate. If the signed errors all shift by the same offset, the curve
// is only level-shifted (uniform offset). If the spread changes, the shape changed.
function detectShapeChange(prodRow, bestRow) {
  const keys = ['e70', 'e80', 'e85', 'e90'];
  const prodErrors = keys.map(k => prodRow?.[k]).filter(v => Number.isFinite(v));
  const bestErrors = keys.map(k => bestRow?.[k]).filter(v => Number.isFinite(v));
  if (prodErrors.length < 2 || bestErrors.length < 2) return { verdict: 'insufficient data', uniform: false };

  // Spread (max–min of signed errors) tells us if the relative shape changed
  const spreadProd = Math.max(...prodErrors) - Math.min(...prodErrors);
  const spreadBest = Math.max(...bestErrors) - Math.min(...bestErrors);
  const spreadDelta = Math.abs(spreadBest - spreadProd);

  // Mean shift: average signed error at best vs prod
  const meanProd = prodErrors.reduce((a, b) => a + b, 0) / prodErrors.length;
  const meanBest = bestErrors.reduce((a, b) => a + b, 0) / bestErrors.length;
  const levelShift = meanBest - meanProd;

  const uniform = spreadDelta < 0.5; // < 0.5 dB spread change = uniform lift
  return { spreadProd, spreadBest, spreadDelta, levelShift, uniform };
}

// ── Interpretation ────────────────────────────────────────────────────────────
function buildInterpretation(sweepRows, prodMae) {
  if (!sweepRows?.length || !Number.isFinite(prodMae)) return [];

  const best    = sweepRows.reduce((a, b) => ((a.mae ?? Infinity) < (b.mae ?? Infinity) ? a : b), sweepRows[0]);
  const prodRow = sweepRows.find(r => r.ref === PROD_SOURCE_SPL);
  const impMae  = prodMae - (best.mae ?? prodMae);
  const pct     = prodMae > 0 ? (impMae / prodMae * 100) : 0;
  const shape   = detectShapeChange(prodRow, best);

  const lines = [];

  // Is this equivalent to ×2 direct gain? ×2 gain = +6 dB. Check if best ref ≥ 94+5.
  const refDeltaDb = best.ref - PROD_SOURCE_SPL;
  if (refDeltaDb >= 4 && shape.uniform) {
    lines.push({
      color: '#f87171',
      text: 'Root cause is likely source reference calibration. A higher reference gives uniform improvement equivalent to direct gain scaling.',
    });
  } else if (!shape.uniform) {
    lines.push({
      color: '#86efac',
      text: 'Root cause is frequency-dependent direct/modal balance, not static source level. Changing source reference only shifts the curve uniformly — it does not fix the shape error.',
    });
  }

  if (shape.uniform && refDeltaDb >= 2) {
    lines.push({
      color: '#fbbf24',
      text: `Curve shifts uniformly by ~${Math.abs(shape.levelShift ?? 0).toFixed(1)} dB with a +${refDeltaDb} dB reference boost — consistent with a static reference calibration offset.`,
    });
  } else if (!shape.uniform) {
    lines.push({
      color: '#a78bfa',
      text: `Frequency spread changes by ${(shape.spreadDelta ?? 0).toFixed(2)} dB across the sweep — the parity gap is spectrally uneven and cannot be corrected by source level alone.`,
    });
  }

  if (pct >= 75) {
    lines.push({ color: '#fb923c', text: `Best reference (${best.ref} dB) reduces MAE by ${pct.toFixed(0)}% — strong global improvement.` });
  } else if (pct < 25) {
    lines.push({ color: '#78716c', text: `Best reference only reduces MAE by ${pct.toFixed(0)}% — source level is a minor contributor to the parity gap.` });
  } else {
    lines.push({ color: '#a8a29e', text: `Best reference (${best.ref} dB) reduces MAE by ${pct.toFixed(0)}% — moderate improvement.` });
  }

  return lines;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH = { padding: '3px 8px', fontSize: 9, fontWeight: 700, ...MONO, background: '#0c0a09', color: '#d6d3d1', borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right' };
const TD = { padding: '3px 8px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
const fmt  = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—');
const fmtΔ = (v) => (!Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + Number(v).toFixed(2));

function errColor(v) {
  const a = Math.abs(v ?? 0);
  if (!Number.isFinite(v)) return '#6b7280';
  if (a <= 1) return '#4ade80';
  if (a <= 3) return '#fbbf24';
  if (a <= 6) return '#fb923c';
  return '#f87171';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DirectReferenceLevelSweepAudit({
  roomDims,
  subs,
  seat,
  surfaceAbsorption,
  axialQ = 4.0,
  distanceBlend = 0.55,
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState(null);

  const currentSub = subs?.[0] ?? null;
  const hasRoom    = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const canRun     = hasRoom && seat?.x != null && currentSub?.x != null;

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setResult(null);

    setTimeout(() => {
      try {
        const subPos  = {
          x: currentSub.x, y: currentSub.y, z: currentSub.z ?? 0.35,
          rW: roomDims.widthM, rL: roomDims.lengthM, rH: roomDims.heightM,
        };
        const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
        const distM   = getSubDist({ ...subPos }, seatPos);
        const modes   = buildModes(roomDims, surfaceAbsorption, axialQ);

        // Run one simulation per source reference level
        const sweepRows = SWEEP_REFS.map(ref => {
          const series   = runSimWithRef(modes, subPos, seatPos, distM, distanceBlend, ref);
          const scores   = scoreSeries(series);
          // Direct SPL at seat for this ref (constant across freqs)
          const directSpl = ref - 20 * Math.log10(distM);
          // Combined SPL at each target freq
          const combined  = {};
          TARGET_FREQS.forEach(hz => {
            combined[hz] = interpSeries(series, hz);
          });
          return { ref, directSpl, combined, ...scores };
        });

        const prodRow   = sweepRows.find(r => r.ref === PROD_SOURCE_SPL);
        const prodMae   = prodRow?.mae ?? null;
        const bestRow   = sweepRows.reduce((a, b) => ((a.mae ?? Infinity) < (b.mae ?? Infinity) ? a : b), sweepRows[0]);
        const impMae    = Number.isFinite(prodMae) ? prodMae - (bestRow.mae ?? prodMae) : null;
        const shape     = detectShapeChange(prodRow, bestRow);
        const interp    = buildInterpretation(sweepRows, prodMae);

        setResult({ sweepRows, prodMae, bestRow, impMae, shape, interp, distM });
      } catch (e) {
        console.error('[DirectReferenceLevelSweepAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [roomDims, seat, currentSub, surfaceAbsorption, axialQ, distanceBlend, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* ── Header ── */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Direct Reference Level Sweep Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Goal: determine whether the direct-path parity gap is caused by the assumed {PROD_SOURCE_SPL} dB @ 1 m source reference.<br />
        Fixed: Direct+Modes · Reflections OFF · Distance law unchanged · blend={distanceBlend.toFixed(2)} · Q={axialQ.toFixed(1)}<br />
        Sweep: source reference SPL {SWEEP_REFS[0]}–{SWEEP_REFS[SWEEP_REFS.length - 1]} dB (both direct and modal anchored to same ref).
      </div>

      {!hasRoom    && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires room dimensions.</div>}
      {hasRoom && !seat       && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a seat/MLP.</div>}
      {hasRoom && !currentSub && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a subwoofer.</div>}

      {canRun && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 9, ...MONO, color: '#78716c', background: '#1c1917', borderRadius: 4, padding: '5px 10px', marginBottom: 8 }}>
          <span>Room: <strong style={{ color: '#d6d3d1' }}>{roomDims.widthM.toFixed(2)}W × {roomDims.lengthM.toFixed(2)}L × {roomDims.heightM.toFixed(2)}H m</strong></span>
          <span>MLP: <strong style={{ color: '#86efac' }}>({seat.x?.toFixed(3)}, {seat.y?.toFixed(3)}, {(seat.z ?? 1.2).toFixed(3)}) m</strong></span>
          <span>Sub: <strong style={{ color: '#93c5fd' }}>({currentSub.x?.toFixed(3)}, {currentSub.y?.toFixed(3)}, {(currentSub.z ?? 0.35).toFixed(3)}) m</strong></span>
          <span>Dist: <strong style={{ color: '#fbbf24' }}>computing…</strong></span>
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
        {running ? 'Running…' : result ? 'Re-run Sweep' : 'Run Direct Reference Level Sweep'}
      </button>

      {result && (
        <>
          {/* ── Summary banner ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10, fontSize: 9, ...MONO }}>
            <div style={{ padding: '5px 10px', background: '#172554', borderRadius: 5, color: '#93c5fd' }}>
              Sub→seat: <strong>{fmt(result.distM, 3)} m</strong>
            </div>
            <div style={{ padding: '5px 10px', background: '#172554', borderRadius: 5, color: '#60a5fa' }}>
              Best ref: <strong>{result.bestRow.ref} dB</strong>
            </div>
            <div style={{ padding: '5px 10px', background: '#172554', borderRadius: 5, color: '#4ade80' }}>
              MAE improvement vs 94 dB: <strong>▼{fmt(result.impMae, 3)} dB</strong>
            </div>
            <div style={{ padding: '5px 10px', background: result.shape.uniform ? '#172554' : '#2d1c1c', borderRadius: 5, color: result.shape.uniform ? '#86efac' : '#f87171' }}>
              Shape shift: <strong>{result.shape.uniform ? 'uniform (level only)' : `non-uniform (Δspread=${fmt(result.shape.spreadDelta, 2)} dB)`}</strong>
            </div>
          </div>

          {/* ── Interpretation ── */}
          {result.interp.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {result.interp.map((line, i) => (
                <div key={i} style={{ marginBottom: 4, fontSize: 9, ...MONO, padding: '6px 10px', background: '#1c1917', borderRadius: 4, borderLeft: `3px solid ${line.color}`, color: line.color, lineHeight: 1.8 }}>
                  {line.text}
                </div>
              ))}
            </div>
          )}

          {/* ── Main sweep table ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
            Source Reference Sweep Results
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', minWidth: 90 }}>Source ref</th>
                  <th style={{ ...TH, color: '#93c5fd' }}>Direct SPL (dB)</th>
                  <th style={{ ...TH, color: '#4ade80' }}>Combined 70 Hz</th>
                  <th style={{ ...TH, color: '#4ade80' }}>Combined 80 Hz</th>
                  <th style={{ ...TH, color: '#4ade80' }}>Combined 85 Hz</th>
                  <th style={{ ...TH, color: '#4ade80' }}>Combined 90 Hz</th>
                  <th style={{ ...TH, color: '#fbbf24' }}>MAE (dB)</th>
                  <th style={{ ...TH, color: '#fb923c' }}>Worst (dB)</th>
                  <th style={TH}>Worst Hz</th>
                  <th style={{ ...TH, color: '#93c5fd' }}>70 Hz Δ</th>
                  <th style={{ ...TH, color: '#6ee7b7' }}>80 Hz Δ</th>
                  <th style={{ ...TH, color: '#a78bfa' }}>85 Hz Δ</th>
                  <th style={{ ...TH, color: '#fda4af' }}>90 Hz Δ</th>
                </tr>
              </thead>
              <tbody>
                {result.sweepRows.map((row, i) => {
                  const isProd = row.ref === PROD_SOURCE_SPL;
                  const isBest = row.ref === result.bestRow.ref;
                  const impVsProd = Number.isFinite(result.prodMae) ? result.prodMae - row.mae : null;
                  return (
                    <tr key={i} style={{ background: isBest ? '#172554' : isProd ? '#1c2a1c' : undefined, borderBottom: '1px solid #1c1917' }}>
                      <td style={{ ...TD, textAlign: 'left', color: isBest ? '#60a5fa' : isProd ? '#4ade80' : '#a8a29e', fontWeight: isBest || isProd ? 700 : 400 }}>
                        {row.ref} dB{isBest ? ' ★' : ''}{isProd ? ' (prod)' : ''}
                      </td>
                      <td style={{ ...TD, color: '#93c5fd' }}>{fmt(row.directSpl)}</td>
                      {TARGET_FREQS.map(hz => (
                        <td key={hz} style={{ ...TD, color: '#a8a29e' }}>
                          {Number.isFinite(row.combined[hz]) ? fmt(row.combined[hz]) : '—'}
                        </td>
                      ))}
                      <td style={{ ...TD, color: errColor(row.mae), fontWeight: isBest ? 700 : 400 }}>{fmt(row.mae, 3)}</td>
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

          {/* ── Shape analysis detail ── */}
          <div style={{ fontSize: 9, ...MONO, color: '#57534e', background: '#1c1917', borderRadius: 4, padding: '6px 10px', marginBottom: 8 }}>
            <span style={{ color: '#78716c', fontWeight: 700 }}>Shape analysis: </span>
            prod spread={fmt(result.shape.spreadProd, 2)} dB ·
            best spread={fmt(result.shape.spreadBest, 2)} dB ·
            Δspread={fmt(result.shape.spreadDelta, 2)} dB ·
            level shift={fmtΔ(result.shape.levelShift)} dB ·
            verdict: <span style={{ color: result.shape.uniform ? '#4ade80' : '#f87171', fontWeight: 700 }}>{result.shape.uniform ? 'uniform lift — shape preserved' : 'non-uniform — shape changed'}</span>
          </div>

          {/* ── Legend ── */}
          <div style={{ fontSize: 8, color: '#44403c', ...MONO, lineHeight: 1.9 }}>
            ★ best · (prod) = 94 dB production · Δ = signed error vs REW benchmark<br />
            Δ colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span>
          </div>
        </>
      )}
    </div>
  );
}