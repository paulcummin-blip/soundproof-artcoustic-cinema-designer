// RewParityFamilyQSweep.jsx
// Diagnostic-only: sweeps independent Q scale multipliers for axial, tangential, oblique modal families.
// Pure self-contained maths — does NOT call or modify the production engine.

import React, { useState, useCallback, useMemo } from 'react';

// ── REW benchmark (same as RewParityAutoSweep) ────────────────────────────────
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

const BANDS = [
  { label: '20–40',   lo: 20,  hi: 40  },
  { label: '40–80',   lo: 40,  hi: 80  },
  { label: '80–120',  lo: 80,  hi: 120 },
  { label: '120–200', lo: 120, hi: 200 },
];

// ── Q scale grids ─────────────────────────────────────────────────────────────
// Tested as multipliers on top of the base Q for each family.
// Production base Q values: axial = 8.0, tangential = 6.0, oblique = 4.5
const AXIAL_Q_SCALES      = [0.50, 0.65, 0.80, 1.00, 1.20, 1.40, 1.60];
const TANGENTIAL_Q_SCALES = [0.50, 0.65, 0.80, 1.00, 1.20, 1.40, 1.60];
const OBLIQUE_Q_SCALES    = [0.50, 0.75, 1.00, 1.25, 1.50];

const TOTAL_COMBOS = AXIAL_Q_SCALES.length * TANGENTIAL_Q_SCALES.length * OBLIQUE_Q_SCALES.length;

// Base Q values matching the production engine defaults
const BASE_Q = { axial: 8.0, tangential: 6.0, oblique: 4.5 };
const FLAT_SOURCE_DB = 94;
const C = 343;

// ── Pure acoustic helpers (self-contained, no engine import) ──────────────────

function buildFreqAxis(minHz = 20, maxHz = 200) {
  const freqs = [];
  const ppo = 96;
  const total = Math.ceil(Math.log2(maxHz / minHz) * ppo);
  for (let i = 0; i <= total; i++) {
    const hz = minHz * Math.pow(2, i / ppo);
    if (hz > maxHz) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== maxHz) freqs.push(maxHz);
  return freqs;
}

function modeTypeOf(nx, ny, nz) {
  const axes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
  return axes === 1 ? 'axial' : axes === 2 ? 'tangential' : 'oblique';
}

function buildModes(W, L, H, fMax) {
  const modes = [];
  const nMax = Math.ceil((fMax / C) * 2 * Math.max(W, L, H)) + 5;
  for (let nx = 0; nx <= nMax; nx++) {
    for (let ny = 0; ny <= nMax; ny++) {
      for (let nz = 0; nz <= nMax; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const freq = (C / 2) * Math.sqrt((nx / W) ** 2 + (ny / L) ** 2 + (nz / H) ** 2);
        if (!Number.isFinite(freq) || freq <= 0 || freq > fMax) continue;
        modes.push({ nx, ny, nz, freq, type: modeTypeOf(nx, ny, nz) });
      }
    }
  }
  return modes.sort((a, b) => a.freq - b.freq);
}

function sabineQ(f0, W, L, H, sa) {
  const V = W * L * H;
  const A =
    (L * W)  * ((sa?.floor ?? 0.3)   + (sa?.ceiling ?? 0.3)) +
    (W * H)  * ((sa?.front ?? 0.3)   + (sa?.back    ?? 0.3)) +
    (L * H)  * ((sa?.left  ?? 0.3)   + (sa?.right   ?? 0.3));
  const rt60 = 0.161 * V / Math.max(A, 1e-6);
  return Math.max(1, Math.min(80, (2 * Math.PI * f0 * rt60) / 13.815));
}

function cosShape(n, pos, dim) {
  return n > 0 ? Math.cos(n * Math.PI * pos / Math.max(dim, 1e-6)) : 1;
}

// Run simulation with per-family Q scale overrides. Returns splDbRaw[].
function runQScaleSim(W, L, H, sx, sy, sz, rx, ry, rz, sa, axialQOverride, qScales, freqsHz, modesBase) {
  const srcAmp = Math.pow(10, FLAT_SOURCE_DB / 20);
  const { axial: axQScale, tangential: tanQScale, oblique: oblQScale } = qScales;

  // Apply Q scales to pre-built modes
  const modes = modesBase.map(m => {
    const baseQ = BASE_Q[m.type] ?? 4.5;
    const absQ  = sabineQ(m.freq, W, L, H, sa);
    const effectiveBaseQ = m.type === 'axial' ? (axialQOverride ?? BASE_Q.axial) : baseQ;
    const clampedQ = Math.max(1, Math.min(effectiveBaseQ, absQ));

    // Apply diagnostic family Q scale
    const familyScale = m.type === 'axial' ? axQScale
      : m.type === 'tangential' ? tanQScale
      : oblQScale;

    return { ...m, q: Math.max(0.5, clampedQ * familyScale) };
  });

  return freqsHz.map(f => {
    // Direct path
    const ddx = sx - rx, ddy = sy - ry, ddz = sz - rz;
    const dist = Math.max(0.01, Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz));
    const distLossDb = -20 * Math.log10(dist);
    const directAmp = Math.pow(10, (FLAT_SOURCE_DB + distLossDb) / 20);
    const tof = -2 * Math.PI * f * dist / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    for (const mode of modes) {
      const srcCos = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rcvCos = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      const coupling = srcCos * rcvCos;

      const ratio = f / Math.max(mode.freq, 1e-6);
      const rr = 1 - ratio * ratio;
      const ri = f / (mode.q * Math.max(mode.freq, 1e-6));
      const denom = rr * rr + ri * ri;
      const tRe = rr / denom;
      const tIm = -ri / denom;

      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const hoAxialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;

      const gain = srcAmp * coupling * orderWeight * hoAxialScale;
      sumRe += gain * tRe;
      sumIm += gain * tIm;
    }

    return 20 * Math.log10(Math.max(Math.sqrt(sumRe * sumRe + sumIm * sumIm), 1e-10));
  });
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function interpolate(freqsHz, splDbRaw, targetHz) {
  if (!freqsHz || !splDbRaw || freqsHz.length === 0) return null;
  if (targetHz <= freqsHz[0]) return splDbRaw[0];
  if (targetHz >= freqsHz[freqsHz.length - 1]) return splDbRaw[splDbRaw.length - 1];
  for (let i = 0; i < freqsHz.length - 1; i++) {
    if (targetHz >= freqsHz[i] && targetHz <= freqsHz[i + 1]) {
      const t = (targetHz - freqsHz[i]) / (freqsHz[i + 1] - freqsHz[i]);
      return splDbRaw[i] + (splDbRaw[i + 1] - splDbRaw[i]) * t;
    }
  }
  return null;
}

function scoreResponse(freqsHz, splDbRaw) {
  let sumErr = 0, worstErr = 0, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const v = interpolate(freqsHz, splDbRaw, hz);
    if (!Number.isFinite(v)) continue;
    const err = Math.abs(v - db);
    sumErr += err;
    if (err > worstErr) worstErr = err;
    count++;
  }
  if (count === 0) return null;
  const bands = BANDS.map(({ lo, hi }) => {
    const pts = REW_BENCHMARK.filter(p => p.hz >= lo && p.hz <= hi);
    let s = 0, c = 0;
    for (const { hz, db } of pts) {
      const v = interpolate(freqsHz, splDbRaw, hz);
      if (!Number.isFinite(v)) continue;
      s += Math.abs(v - db); c++;
    }
    return c > 0 ? s / c : null;
  });
  return { mae: sumErr / count, worst: worstErr, bands };
}

function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

// ── Styles ────────────────────────────────────────────────────────────────────
const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#f0fdf4', borderBottom: '2px solid #86efac', color: '#14532d', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

// ── Component ─────────────────────────────────────────────────────────────────
export default function RewParityFamilyQSweep({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results,    setResults]    = useState(null);
  const [currentRow, setCurrentRow] = useState(null);
  const [running,    setRunning]    = useState(false);
  const [progress,   setProgress]   = useState(0);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  const runSweep = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);
    setCurrentRow(null);
    setProgress(0);

    const W  = Number(roomDims.widthM);
    const L  = Number(roomDims.lengthM);
    const H  = Number(roomDims.heightM);
    const sx = Number(sub.x);
    const sy = Number(sub.y);
    const sz = Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35;
    const rx = Number(seat.x);
    const ry = Number(seat.y);
    const rz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
    const axialQOverride = activeSettings?.axialQ ?? BASE_Q.axial;
    const sa = surfaceAbsorption ?? {};

    const modesBase = buildModes(W, L, H, 210);
    const freqsHz = buildFreqAxis(20, 200);

    // Baseline: all Q scales = 1.0
    const baseRaw = runQScaleSim(W, L, H, sx, sy, sz, rx, ry, rz, sa, axialQOverride,
      { axial: 1.0, tangential: 1.0, oblique: 1.0 }, freqsHz, modesBase);
    const baseScore = scoreResponse(freqsHz, baseRaw);
    if (baseScore) setCurrentRow({ axial: 1.0, tangential: 1.0, oblique: 1.0, ...baseScore });

    // Sweep
    const scored = [];
    let done = 0;
    const CHUNK = 10;
    const combos = [];
    for (const ax of AXIAL_Q_SCALES)
      for (const tan of TANGENTIAL_Q_SCALES)
        for (const obl of OBLIQUE_Q_SCALES)
          combos.push({ axial: ax, tangential: tan, oblique: obl });

    for (let i = 0; i < combos.length; i += CHUNK) {
      const chunk = combos.slice(i, i + CHUNK);
      for (const { axial, tangential, oblique } of chunk) {
        const raw = runQScaleSim(W, L, H, sx, sy, sz, rx, ry, rz, sa, axialQOverride,
          { axial, tangential, oblique }, freqsHz, modesBase);
        const score = scoreResponse(freqsHz, raw);
        if (score) scored.push({ axial, tangential, oblique, ...score });
        done++;
      }
      setProgress(done);
      await new Promise(r => setTimeout(r, 0));
    }

    scored.sort((a, b) => a.mae - b.mae);
    setResults(scored.slice(0, 20));
    setRunning(false);
    setProgress(TOTAL_COMBOS);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  // Sensitivity analysis
  const sensitivity = useMemo(() => {
    if (!results || results.length === 0 || !currentRow) return null;

    const analyseParam = (key, values) => {
      const byValue = {};
      for (const r of results) {
        const v = r[key];
        if (!byValue[v]) byValue[v] = [];
        byValue[v].push(r.mae);
      }
      const summaries = values
        .map(v => {
          const maes = byValue[v] ?? [];
          const avg = maes.length > 0 ? maes.reduce((s, m) => s + m, 0) / maes.length : null;
          return { value: v, avgMae: avg };
        })
        .filter(s => s.avgMae !== null)
        .sort((a, b) => a.avgMae - b.avgMae);
      const best = summaries[0];
      const worst = summaries[summaries.length - 1];
      const spread = (best && worst) ? worst.avgMae - best.avgMae : 0;
      return { bestValue: best?.value, bestAvgMae: best?.avgMae, spread };
    };

    return [
      { family: 'axial',      baseQ: BASE_Q.axial,      ...analyseParam('axial',      AXIAL_Q_SCALES)      },
      { family: 'tangential', baseQ: BASE_Q.tangential,  ...analyseParam('tangential', TANGENTIAL_Q_SCALES) },
      { family: 'oblique',    baseQ: BASE_Q.oblique,     ...analyseParam('oblique',    OBLIQUE_Q_SCALES)    },
    ].sort((a, b) => b.spread - a.spread);
  }, [results, currentRow]);

  const best = results?.[0] ?? null;
  const maeDelta = (currentRow?.mae != null && best?.mae != null) ? currentRow.mae - best.mae : null;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #86efac', paddingTop: 10 }}>
      <div style={{ fontWeight: 700, color: '#14532d', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Family-Q Sweep
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {AXIAL_Q_SCALES.length}×{TANGENTIAL_Q_SCALES.length}×{OBLIQUE_Q_SCALES.length} = {TOTAL_COMBOS} combos · diagnostic only · engine untouched
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>
        Scales Q independently per modal family (axial / tangential / oblique).
        Base Q: axial {BASE_Q.axial}, tangential {BASE_Q.tangential}, oblique {BASE_Q.oblique}.
        Production engine is not modified.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, and valid sub to run sweep.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button
          onClick={runSweep}
          disabled={running || !canRun}
          style={{
            height: 28, padding: '0 14px', borderRadius: 6,
            border: '1px solid #15803d', background: running ? '#e5e7eb' : '#15803d',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {running
            ? `Running… ${progress} / ${TOTAL_COMBOS} (${Math.round(progress / TOTAL_COMBOS * 100)}%)`
            : results ? 'Re-run Q sweep' : 'Run Family-Q sweep'}
        </button>
      </div>

      {running && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ background: '#dcfce7', borderRadius: 4, height: 5, overflow: 'hidden' }}>
            <div style={{
              background: '#15803d', height: '100%',
              width: `${(progress / TOTAL_COMBOS) * 100}%`, transition: 'width 0.1s',
            }} />
          </div>
        </div>
      )}

      {/* Results table */}
      {(currentRow || results) && (
        <div style={{ overflowX: 'auto', marginTop: 4 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ ...thS, textAlign: 'left' }}>Rank</th>
                <th style={thS}>Ax-Q ×</th>
                <th style={thS}>Tan-Q ×</th>
                <th style={thS}>Obl-Q ×</th>
                <th style={thS}>Ax-Q eff</th>
                <th style={thS}>Tan-Q eff</th>
                <th style={thS}>Obl-Q eff</th>
                <th style={thS}>Overall MAE</th>
                <th style={thS}>Worst Err</th>
                {BANDS.map(b => <th key={b.label} style={thS}>{b.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {/* ★ CURRENT */}
              {currentRow && (
                <tr style={{ borderBottom: '2px solid #86efac', background: '#fff7ed' }}>
                  <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#b45309', fontSize: 9 }}>★ CURRENT</td>
                  <td style={{ ...tdS, color: '#92400e' }}>{fmt(currentRow.axial, 2)}</td>
                  <td style={{ ...tdS, color: '#92400e' }}>{fmt(currentRow.tangential, 2)}</td>
                  <td style={{ ...tdS, color: '#92400e' }}>{fmt(currentRow.oblique, 2)}</td>
                  <td style={{ ...tdS, color: '#6b7280' }}>{fmt(BASE_Q.axial * currentRow.axial, 1)}</td>
                  <td style={{ ...tdS, color: '#6b7280' }}>{fmt(BASE_Q.tangential * currentRow.tangential, 1)}</td>
                  <td style={{ ...tdS, color: '#6b7280' }}>{fmt(BASE_Q.oblique * currentRow.oblique, 1)}</td>
                  <td style={{ ...tdS, fontWeight: 700, color: '#b45309' }}>{fmt(currentRow.mae, 3)}</td>
                  <td style={{ ...tdS, color: (currentRow.worst ?? 0) > 5 ? '#dc2626' : '#b45309', fontWeight: 600 }}>
                    {fmt(currentRow.worst, 3)}
                  </td>
                  {currentRow.bands.map((v, bi) => (
                    <td key={bi} style={{ ...tdS, color: (v ?? 0) > 5 ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151', fontWeight: 600 }}>
                      {fmt(v, 2)}
                    </td>
                  ))}
                </tr>
              )}
              {/* Top-20 */}
              {results && results.map((row, i) => {
                const isBest = i === 0;
                return (
                  <tr key={`${row.axial}-${row.tangential}-${row.oblique}`} style={{
                    borderBottom: '1px solid #dcfce7',
                    background: isBest ? '#f0fdf4' : i < 3 ? '#f7fef9' : undefined,
                  }}>
                    <td style={{ ...tdS, textAlign: 'left', fontWeight: isBest ? 700 : 400, color: isBest ? '#14532d' : '#374151' }}>
                      {isBest ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `#${i + 1}`}
                    </td>
                    <td style={{ ...tdS, fontWeight: row.axial !== 1.0 ? 700 : 400, color: row.axial !== 1.0 ? '#14532d' : '#374151' }}>
                      {fmt(row.axial, 2)}
                    </td>
                    <td style={{ ...tdS, fontWeight: row.tangential !== 1.0 ? 700 : 400, color: row.tangential !== 1.0 ? '#14532d' : '#374151' }}>
                      {fmt(row.tangential, 2)}
                    </td>
                    <td style={{ ...tdS, fontWeight: row.oblique !== 1.0 ? 700 : 400, color: row.oblique !== 1.0 ? '#14532d' : '#374151' }}>
                      {fmt(row.oblique, 2)}
                    </td>
                    <td style={{ ...tdS, color: '#6b7280', fontSize: 8 }}>{fmt(BASE_Q.axial * row.axial, 1)}</td>
                    <td style={{ ...tdS, color: '#6b7280', fontSize: 8 }}>{fmt(BASE_Q.tangential * row.tangential, 1)}</td>
                    <td style={{ ...tdS, color: '#6b7280', fontSize: 8 }}>{fmt(BASE_Q.oblique * row.oblique, 1)}</td>
                    <td style={{ ...tdS, fontWeight: isBest ? 700 : 400, color: isBest ? '#14532d' : '#374151' }}>
                      {fmt(row.mae, 3)}
                    </td>
                    <td style={{ ...tdS, color: (row.worst ?? 0) > 5 ? '#dc2626' : (row.worst ?? 0) > 3 ? '#b45309' : '#374151' }}>
                      {fmt(row.worst, 3)}
                    </td>
                    {row.bands.map((v, bi) => {
                      const curBand = currentRow?.bands[bi];
                      const improved = v !== null && curBand !== null && v < curBand - 0.01;
                      const worse    = v !== null && curBand !== null && v > curBand + 0.01;
                      return (
                        <td key={bi} style={{
                          ...tdS,
                          fontWeight: isBest ? 700 : 400,
                          color: improved ? '#15803d' : worse ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151',
                        }}>
                          {fmt(v, 2)}{improved ? ' ▼' : worse ? ' ▲' : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 4, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
            Eff Q = scale × base Q. ▼ = improved vs current · ▲ = worse vs current
          </div>
        </div>
      )}

      {/* Sensitivity summary */}
      {sensitivity && best && (
        <div style={{ marginTop: 12, borderTop: '1px dashed #86efac', paddingTop: 8 }}>
          <div style={{ fontWeight: 700, color: '#14532d', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
            Family-Q Sensitivity Report
            <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>which family's Q has the biggest parity influence</span>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr>
                  {[['left','Family'], ['right','Base Q'], ['right','Best Q×'], ['right','Eff Q'], ['right','Best avg MAE'], ['right','MAE spread'], ['left','Influence']].map(([a, l]) => (
                    <th key={l} style={{ ...thS, textAlign: a }}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensitivity.map((row, i) => {
                  const influenceColor = row.spread >= 1.5 ? '#dc2626'
                    : row.spread >= 0.5 ? '#b45309'
                    : row.spread >= 0.15 ? '#0369a1'
                    : '#6b7280';
                  const influenceLabel = row.spread >= 1.5 ? '⚑ HIGH'
                    : row.spread >= 0.5 ? 'Medium'
                    : row.spread >= 0.15 ? 'Low'
                    : 'Inert';
                  const effQ = row.baseQ * (row.bestValue ?? 1.0);
                  return (
                    <tr key={row.family} style={{
                      borderBottom: '1px solid #dcfce7',
                      background: i === 0 ? '#f0fdf4' : undefined,
                    }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#14532d' }}>{row.family}</td>
                      <td style={{ ...tdS, color: '#374151' }}>{fmt(row.baseQ, 1)}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: '#374151' }}>{fmt(row.bestValue, 2)}</td>
                      <td style={{ ...tdS, color: '#374151' }}>{fmt(effQ, 2)}</td>
                      <td style={{ ...tdS, color: '#15803d', fontWeight: 700 }}>{fmt(row.bestAvgMae, 3)}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: influenceColor }}>{fmt(row.spread, 3)}</td>
                      <td style={{ textAlign: 'left', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace', color: influenceColor, fontWeight: 700 }}>
                        {i === 0 && '★ '}{influenceLabel}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Current MAE',     value: fmt(currentRow?.mae, 3) + ' dB',  note: 'all Q scales = 1.00' },
              { label: 'Best MAE',        value: fmt(best.mae, 3) + ' dB',
                note: `ax×${fmt(best.axial,2)} tan×${fmt(best.tangential,2)} obl×${fmt(best.oblique,2)}` },
              { label: 'MAE Δ',
                value: maeDelta !== null ? (maeDelta >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(maeDelta), 3) + ' dB' : '—',
                note: maeDelta != null && maeDelta > 1.5 ? 'Q scaling is primary driver'
                    : maeDelta != null && maeDelta > 0.5 ? 'moderate Q sensitivity'
                    : 'Q not primary error driver' },
              { label: 'Best axial Q',       value: fmt(BASE_Q.axial * (best.axial ?? 1), 2),
                note: `scale × ${fmt(best.axial, 2)}` },
              { label: 'Best tangential Q',  value: fmt(BASE_Q.tangential * (best.tangential ?? 1), 2),
                note: `scale × ${fmt(best.tangential, 2)}` },
              { label: 'Best oblique Q',     value: fmt(BASE_Q.oblique * (best.oblique ?? 1), 2),
                note: `scale × ${fmt(best.oblique, 2)}` },
            ].map(({ label, value, note }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#14532d', fontFamily: 'monospace', wordBreak: 'break-word' }}>{value}</div>
                {note && <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 }}>{note}</div>}
              </div>
            ))}
          </div>

          {/* Diagnostic conclusion */}
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: (maeDelta ?? 0) > 1.5 ? '#fef3c7' : (maeDelta ?? 0) > 0.5 ? '#f0fdf4' : '#f0fdf4',
            border: `1px solid ${(maeDelta ?? 0) > 1.5 ? '#fbbf24' : '#86efac'}`,
            fontSize: 10, fontFamily: 'monospace',
            color: (maeDelta ?? 0) > 1.5 ? '#92400e' : '#166534',
          }}>
            {(maeDelta ?? 0) > 1.5 ? (
              <>
                <strong>⚠ Modal family Q is a primary parity error driver.</strong> Rescaling Q values reduces MAE by {fmt(maeDelta, 2)} dB.
                <strong> {sensitivity[0]?.family}</strong> Q has the highest influence (spread = {fmt(sensitivity[0]?.spread, 2)} dB).
                Best effective Q values: axial {fmt(BASE_Q.axial * (best.axial ?? 1), 2)}, tangential {fmt(BASE_Q.tangential * (best.tangential ?? 1), 2)}, oblique {fmt(BASE_Q.oblique * (best.oblique ?? 1), 2)}.
              </>
            ) : (maeDelta ?? 0) > 0.5 ? (
              <>
                <strong>Moderate family-Q sensitivity ({fmt(maeDelta, 2)} dB improvement possible).</strong>{' '}
                <strong>{sensitivity[0]?.family}</strong> Q is most sensitive (spread = {fmt(sensitivity[0]?.spread, 2)} dB).
                Q scaling is a secondary contributor; investigate source model or geometry for remaining error.
              </>
            ) : (
              <>
                <strong>✓ Low family-Q sensitivity.</strong> Best Q scaling reduces MAE by only {fmt(maeDelta ?? 0, 2)} dB.
                The remaining parity error is <strong>not primarily caused by incorrect per-family Q values</strong>.
                Investigate source model, room geometry, or direct-path calibration instead.
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}