/**
 * DirectFieldDecompositionAudit — Diagnostic only.
 * Does NOT affect the live graph or production engine.
 *
 * Goal: determine exactly why the direct field appears to need ~+4 dB for REW parity.
 *
 * Section 1 — Direct-path chain breakdown at 70, 80, 85, 90 Hz.
 * Section 2 — Direct-gain sensitivity sweep (0.50 → 2.00×).
 * Section 3 — Ranked influence table.
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  modeShapeValueLocal,
  resonantTransfer,
  estimateModeQLocal,
} from '@/components/room/bass/core/modalCalculations';

// ── Constants ─────────────────────────────────────────────────────────────────
const SPEED_OF_SOUND   = 343;
const REF_PRESSURE_PA  = 2e-5;
const SOURCE_SPL_REF   = 94;   // flat REW reference dB @ 1 m
const TARGET_FREQS     = [70, 80, 85, 90];
const SWEEP_STEPS      = [0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00];

const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 }, { hz: 25,  db: 93.6 }, { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 }, { hz: 50,  db: 91.8 }, { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 }, { hz: 70,  db: 86.8 }, { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 }, { hz: 100, db: 98.3 }, { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 }, { hz: 180, db: 99.3 }, { hz: 200, db: 99.5 },
];

const FREQ_GRID = [];
for (let f = 20; f <= 200; f += (f < 100 ? 2 : 5)) FREQ_GRID.push(f);

// ── Math ──────────────────────────────────────────────────────────────────────
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

// ── Mode builder (mirrors GlobalEnergyCalibrationAudit) ──────────────────────
function buildModes(roomDims, surfaceAbsorption, axialQ) {
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
    return { ...mode, order, family, qValue: Math.max(0.5, rawQ) };
  });
}

// ── Simulation (direct + modal) ───────────────────────────────────────────────
function runSim(modes, subPos, seatPos, distM, distanceBlend, directScale, modalScale) {
  const directAmpBase = db2mag(SOURCE_SPL_REF - 20 * Math.log10(distM)) * directScale;
  const fullLossDb    = -20 * Math.log10(distM / 1);
  const blendedLossDb = fullLossDb * distanceBlend;
  const modalGainScalar = db2mag(blendedLossDb - 20 * Math.log10(distM)) * modalScale;

  const modeData = modes.map(mode => {
    const srcPsi = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z, { widthM: subPos.rW, lengthM: subPos.rL, heightM: subPos.rH });
    const rcvPsi = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, { widthM: subPos.rW, lengthM: subPos.rL, heightM: subPos.rH });
    const coupling  = srcPsi * rcvPsi;
    const axialCorr = (mode.family === 'axial' && mode.order >= 2) ? 0.50 : 1.0;
    const orderWeight = mode.order >= 2 ? 0.50 : 1.0;
    const gain = db2mag(SOURCE_SPL_REF) * modalGainScalar * coupling * orderWeight * axialCorr;
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

// ── Direct-path decomposition at a single frequency ──────────────────────────
function decomposeDirect(hz, sub, seat, distM, distanceBlend) {
  // 1. Source SPL reference
  const sourceSplRef = SOURCE_SPL_REF;

  // 2. Distance
  const distance = distM;

  // 3. Geometric spreading term (1/r law)
  const spreadingTerm = -20 * Math.log10(distM); // relative to 1 m

  // 4. Distance attenuation contribution
  const distAttenuationDb = 20 * Math.log10(1 / distM);  // = -20*log10(d)

  // 5. Boundary gain on direct field — none in this engine (direct path is free-field)
  const boundaryGainDb = 0;

  // 6. Source normalisation — flat 94 dB reference; no normalisation factor applied
  const sourceNormFactor = 1.0;
  const sourceNormDb = 0;

  // 7. Direct-field scaling factor (the production value = 1.0)
  const directScaleFactor = 1.0;
  const directScaleDb = 0;

  // 8. SPL conversion — 20*log10(pressure / REF_PRESSURE_PA)
  //    The engine uses pressure amplitude directly; reference is db2mag(94) at 1 m
  //    which equals ~0.0502 Pa. SPL = 20*log10(p / 2e-5). The reference anchor is baked into SOURCE_SPL_REF.
  const splConversionNote = `anchor=${SOURCE_SPL_REF} dB at 1 m = ${(db2mag(SOURCE_SPL_REF) * REF_PRESSURE_PA).toExponential(2)} Pa`;

  // 9. Final direct-field SPL
  const finalDirectSpl = SOURCE_SPL_REF + distAttenuationDb;

  // 10. Modal-field SPL at this frequency — run production sim without direct
  const fullLossDb    = -20 * Math.log10(distM / 1);
  const blendedLossDb = fullLossDb * distanceBlend;
  const modalGainScalar = db2mag(blendedLossDb - 20 * Math.log10(distM));
  const REF_PRESSURE = db2mag(SOURCE_SPL_REF);

  return {
    hz,
    sourceSplRef,
    distance: distance.toFixed(4),
    spreadingTermDb: spreadingTerm.toFixed(2),
    distAttenuationDb: distAttenuationDb.toFixed(2),
    boundaryGainDb: boundaryGainDb.toFixed(2),
    sourceNormFactor: sourceNormFactor.toFixed(4),
    sourceNormDb: sourceNormDb.toFixed(2),
    directScaleFactor: directScaleFactor.toFixed(2),
    directScaleDb: directScaleDb.toFixed(2),
    splConversionNote,
    finalDirectSpl: finalDirectSpl.toFixed(2),
    benchmarkDb: interpBenchmark(hz).toFixed(2),
    gapVsBenchmark: (finalDirectSpl - interpBenchmark(hz)).toFixed(2),
    modalGainScalarDb: mag2db(modalGainScalar).toFixed(2),
  };
}

// ── Interpretation ────────────────────────────────────────────────────────────
function buildInterpretation(sweepRows, prodMae) {
  if (!sweepRows?.length || !Number.isFinite(prodMae)) return null;
  const best = sweepRows.reduce((a, b) => (a.mae < b.mae ? a : b), sweepRows[0]);
  const impDirect = prodMae - best.mae;
  const bestScale = best.scale;

  const lines = [];
  const pct = Number.isFinite(prodMae) && prodMae > 0 ? (impDirect / prodMae * 100) : 0;

  if (pct >= 75) {
    lines.push({ text: 'Direct-field calibration dominates parity error.', color: '#f87171', key: 'dom' });
  }
  if (bestScale > 1.1) {
    lines.push({ text: 'Investigate direct-path attenuation, SPL normalisation, distance law, or source reference level.', color: '#fbbf24', key: 'inv' });
  }
  if (pct < 25) {
    lines.push({ text: 'Modal-field calibration is a secondary contributor — direct path alone cannot explain the parity gap.', color: '#86efac', key: 'sec' });
  }
  if (!lines.length) {
    lines.push({ text: `Direct gain explains ${pct.toFixed(0)}% of total MAE vs production. Moderate influence.`, color: '#a78bfa', key: 'mod' });
  }

  return { lines, bestScale, impDirect, pct: pct.toFixed(0) };
}

// ── Ranked influence table data (static, based on accumulated diagnostic evidence) ──
// Rankings represent relative influence on the ~4.4 dB parity gap based on all audits.
const INFLUENCE_RANKS = [
  { factor: 'Direct field',            note: 'Primary suspect: +4 dB gain closes gap across 70–90 Hz' },
  { factor: 'Modal amplitude',         note: 'Secondary: modal gain ×1.25 improves MAE alongside direct' },
  { factor: 'Source coupling',         note: 'Moderate: distance blend 0.55 is production value; 0.40–0.60 spans ~2 dB' },
  { factor: 'Coherence architecture',  note: 'Low–moderate: coherent vs incoherent changes 80–150 Hz shape but not overall level' },
  { factor: 'High-order mode density', note: 'Low: ×0.50 axial order≥2 correction already applied; residual ~0.5 dB influence' },
];

// ── Styles ────────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH = { padding: '3px 8px', fontSize: 9, fontWeight: 700, ...MONO, background: '#0c0a09', color: '#d6d3d1', borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right' };
const TD = { padding: '3px 8px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
const fmt  = (v, d = 3) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—');
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
export default function DirectFieldDecompositionAudit({
  roomDims, subs, seat, surfaceAbsorption,
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
        const subPos  = { x: currentSub.x, y: currentSub.y, z: currentSub.z ?? 0.35, rW: roomDims.widthM, rL: roomDims.lengthM, rH: roomDims.heightM };
        const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
        const distM   = getSubDist({ ...subPos }, seatPos);
        const modes   = buildModes(roomDims, surfaceAbsorption, axialQ);

        // Section 1: decomposition rows at TARGET_FREQS
        const decompRows = TARGET_FREQS.map(hz => decomposeDirect(hz, currentSub, seat, distM, distanceBlend));

        // Compute modal-only SPL at target freqs using production settings (d=1, m=1)
        const prodSeries = runSim(modes, subPos, seatPos, distM, distanceBlend, 1.0, 1.0);
        decompRows.forEach(row => {
          const combined = interpSeries(prodSeries, row.hz);
          row.combinedSpl = Number.isFinite(combined) ? combined.toFixed(2) : '—';
          // Modal contribution = combined minus direct amplitude (approximate: RSS)
          const directMag = db2mag(row.finalDirectSpl);
          const combinedMag = db2mag(combined ?? 0);
          const modalMagEst = Math.sqrt(Math.max(0, combinedMag * combinedMag - directMag * directMag));
          row.modalSplEst = modalMagEst > 1e-10 ? mag2db(modalMagEst).toFixed(2) : '—';
        });

        // Section 2: direct-gain sweep (modal stays ×1.0)
        const sweepRows = SWEEP_STEPS.map(scale => {
          const series = runSim(modes, subPos, seatPos, distM, distanceBlend, scale, 1.0);
          return { scale, ...scoreSeries(series) };
        });

        const prodRow  = sweepRows.find(r => r.scale === 1.00);
        const prodMae  = prodRow?.mae ?? null;
        const interp   = buildInterpretation(sweepRows, prodMae);

        setResult({ decompRows, sweepRows, prodMae, interp, distM });
      } catch (e) {
        console.error('[DirectFieldDecompositionAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [roomDims, seat, currentSub, surfaceAbsorption, axialQ, distanceBlend, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* ── Header ── */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Direct Field Decomposition Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Goal: identify exactly where missing direct-field energy originates in the calculation chain.<br />
        Fixed: Direct+Modes · Reflections OFF · Flat REW ref · blend={distanceBlend.toFixed(2)} · Q={axialQ.toFixed(1)}
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
        {running ? 'Running…' : result ? 'Re-run' : 'Run Direct Field Decomposition Audit'}
      </button>

      {result && (
        <>
          {/* ── Section 1: Chain Breakdown ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', ...MONO, marginBottom: 6 }}>
            Section 1 — Direct-Path Chain Breakdown
            <span style={{ fontWeight: 400, color: '#57534e', marginLeft: 8, fontSize: 9 }}>
              sub→seat dist: {fmt(result.distM, 4)} m
            </span>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>Step</th>
                  {TARGET_FREQS.map(hz => (
                    <th key={hz} style={{ ...TH, color: '#fbbf24' }}>{hz} Hz</th>
                  ))}
                  <th style={{ ...TH, color: '#78716c' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'sourceSplRef',    label: '1. Source SPL ref (dB @ 1m)', color: '#d6d3d1' },
                  { key: 'distance',        label: '2. Distance (m)',              color: '#a8a29e' },
                  { key: 'spreadingTermDb', label: '3. Spreading term (dB)',       color: '#a8a29e' },
                  { key: 'distAttenuationDb', label: '4. Distance attenuation (dB)', color: '#93c5fd' },
                  { key: 'boundaryGainDb',  label: '5. Boundary gain (dB)',        color: '#78716c' },
                  { key: 'sourceNormDb',    label: '6. Source normalisation (dB)', color: '#78716c' },
                  { key: 'directScaleDb',   label: '7. Direct-field scale (dB)',   color: '#78716c' },
                  { key: null,              label: '8. SPL conversion', special: 'splConversionNote', color: '#78716c' },
                  { key: 'finalDirectSpl',  label: '9. Final direct SPL (dB)',     color: '#4ade80' },
                  { key: 'modalSplEst',     label: '10. Modal SPL estimate (dB)',  color: '#86efac' },
                  { key: 'combinedSpl',     label: '11. Combined SPL (dB)',        color: '#fbbf24' },
                  { key: 'benchmarkDb',     label: 'REW benchmark (dB)',           color: '#f97316' },
                  { key: 'gapVsBenchmark',  label: 'Gap vs REW (dB)',              color: '#f87171' },
                  { key: 'modalGainScalarDb', label: 'Modal gain scalar (dB)',      color: '#a78bfa' },
                ].map(({ key, label, color, special }) => (
                  <tr key={label} style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={{ ...TD, textAlign: 'left', color, fontWeight: 600, minWidth: 220 }}>{label}</td>
                    {TARGET_FREQS.map(hz => {
                      const row = result.decompRows.find(r => r.hz === hz);
                      const val = special ? row?.[special] : row?.[key];
                      const numVal = val !== undefined && val !== null ? Number(val) : null;
                      return (
                        <td key={hz} style={{ ...TD, color: key === 'gapVsBenchmark' ? errColor(numVal) : color }}>
                          {val ?? '—'}
                        </td>
                      );
                    })}
                    <td style={{ ...TD, textAlign: 'left', color: '#44403c', fontSize: 8, maxWidth: 160 }}>
                      {special === 'splConversionNote' ? result.decompRows[0]?.splConversionNote : ''}
                      {key === 'boundaryGainDb' ? 'none: free-field direct path' : ''}
                      {key === 'sourceNormDb' ? 'none: flat 94 dB reference' : ''}
                      {key === 'directScaleDb' ? 'production ×1.0' : ''}
                      {key === 'gapVsBenchmark' ? '+gap = B44 above REW' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Section 2: Sweep ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
            Section 2 — Direct Gain Sensitivity Sweep
            <span style={{ fontWeight: 400, color: '#57534e', marginLeft: 8, fontSize: 9 }}>modal stays ×1.0</span>
          </div>

          {/* Interpretation */}
          {result.interp && (
            <div style={{ marginBottom: 10 }}>
              {result.interp.lines.map((line, i) => (
                <div key={i} style={{ marginBottom: 4, fontSize: 9, ...MONO, padding: '6px 10px', background: '#1c1917', borderRadius: 4, borderLeft: `3px solid ${line.color}`, color: line.color, lineHeight: 1.8 }}>
                  {line.text}
                </div>
              ))}
              <div style={{ fontSize: 9, ...MONO, color: '#78716c', padding: '4px 10px', background: '#1c1917', borderRadius: 4, marginTop: 4 }}>
                Best direct scale: ×{result.interp.bestScale?.toFixed(2)} | MAE improvement: ▼{fmt(result.interp.impDirect)} dB ({result.interp.pct}% of production MAE)
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>Direct ×</th>
                  <th style={{ ...TH, color: '#fbbf24' }}>MAE (dB)</th>
                  <th style={{ ...TH, color: '#60a5fa' }}>vs prod</th>
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
                  const bestRow = result.sweepRows.reduce((a, b) => (a.mae < b.mae ? a : b), result.sweepRows[0]);
                  const isBest = row.scale === bestRow.scale;
                  const isProd = row.scale === 1.00;
                  const imp    = Number.isFinite(result.prodMae) ? result.prodMae - row.mae : null;
                  return (
                    <tr key={i} style={{ background: isBest ? '#172554' : isProd ? '#1c2a1c' : undefined, borderBottom: '1px solid #1c1917' }}>
                      <td style={{ ...TD, textAlign: 'left', color: isBest ? '#60a5fa' : isProd ? '#4ade80' : '#78716c', fontWeight: isBest || isProd ? 700 : 400 }}>
                        ×{row.scale.toFixed(2)}{isBest ? ' ★' : ''}{isProd ? ' (prod)' : ''}
                      </td>
                      <td style={{ ...TD, color: errColor(row.mae), fontWeight: isBest ? 700 : 400 }}>{fmt(row.mae)}</td>
                      <td style={{ ...TD, color: (imp ?? 0) > 0.01 ? '#4ade80' : (imp ?? 0) < -0.01 ? '#f87171' : '#78716c' }}>
                        {imp != null ? ((imp >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(imp))) : '—'}
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

          {/* ── Section 3: Ranked influence ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', ...MONO, marginBottom: 6 }}>
            Section 3 — Ranked Influence Table (strongest → weakest)
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>Rank</th>
                  <th style={{ ...TH, textAlign: 'left' }}>Factor</th>
                  <th style={{ ...TH, textAlign: 'left', minWidth: 300 }}>Evidence from diagnostics</th>
                </tr>
              </thead>
              <tbody>
                {INFLUENCE_RANKS.map((r, i) => (
                  <tr key={r.factor} style={{ borderBottom: '1px solid #1c1917', background: i === 0 ? '#1a1a2e' : undefined }}>
                    <td style={{ ...TD, textAlign: 'left', color: i === 0 ? '#60a5fa' : i === 1 ? '#86efac' : '#57534e', fontWeight: i < 2 ? 700 : 400 }}>#{i + 1}</td>
                    <td style={{ ...TD, textAlign: 'left', color: i === 0 ? '#60a5fa' : i === 1 ? '#86efac' : '#a8a29e', fontWeight: i < 2 ? 700 : 400 }}>{r.factor}</td>
                    <td style={{ ...TD, textAlign: 'left', color: '#57534e', fontSize: 8 }}>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Legend ── */}
          <div style={{ fontSize: 8, color: '#44403c', ...MONO, lineHeight: 1.9 }}>
            ★ best · (prod) = ×1.0 production · ▼ improvement · ▲ worse<br />
            Δ colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span>
          </div>
        </>
      )}
    </div>
  );
}