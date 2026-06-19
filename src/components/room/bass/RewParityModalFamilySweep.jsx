// RewParityModalFamilySweep.jsx
// Diagnostic-only: sweeps per-family (axial/tangential/oblique) gain multipliers and ranks by MAE.
// Pure self-contained maths — does NOT call or modify the production engine.

import React, { useState, useCallback, useMemo } from 'react';

// ── REW benchmark ─────────────────────────────────────────────────────────────
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

// ── Sweep grid ────────────────────────────────────────────────────────────────
const AXIAL_SCALES      = [0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.30];
const TANGENTIAL_SCALES = [0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.30];
const OBLIQUE_SCALES    = [0.50, 0.75, 1.00, 1.25, 1.50];
const TOTAL_COMBOS      = AXIAL_SCALES.length * TANGENTIAL_SCALES.length * OBLIQUE_SCALES.length;

const FLAT_SOURCE_DB = 94;
const C = 343;

// ── Pure acoustic helpers ─────────────────────────────────────────────────────

function buildFreqAxis(minHz = 20, maxHz = 200) {
  const freqs = [];
  const octaves = Math.log2(maxHz / minHz);
  const ppo = 96;
  const total = Math.ceil(octaves * ppo);
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
        const freq = (C / 2) * Math.sqrt((nx/W)**2 + (ny/L)**2 + (nz/H)**2);
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
    (L * W)  * ((sa?.floor   ?? 0.3) + (sa?.ceiling ?? 0.3)) +
    (W * H)  * ((sa?.front   ?? 0.3) + (sa?.back    ?? 0.3)) +
    (L * H)  * ((sa?.left    ?? 0.3) + (sa?.right   ?? 0.3));
  const rt60 = 0.161 * V / Math.max(A, 1e-6);
  return Math.max(1, Math.min(80, 2 * Math.PI * f0 * rt60 / 13.815));
}

function typeQ(type, axialQOverride) {
  if (type === 'axial') return Number.isFinite(axialQOverride) ? axialQOverride : 8.0;
  if (type === 'tangential') return 6.0;
  return 4.5;
}

function cosShape(n, pos, dim) { return n > 0 ? Math.cos(n * Math.PI * pos / Math.max(dim, 1e-6)) : 1; }

// Run a single simulation over the full frequency axis with per-family scale overrides.
// Returns { freqsHz, splDbRaw } — no engine dependency.
function runFamilySim(W, L, H, sx, sy, sz, rx, ry, rz, sa, axialQ, familyScales, freqsHz, modesWithQ) {
  const srcAmp = Math.pow(10, FLAT_SOURCE_DB / 20);
  const { axial: axScale, tangential: tanScale, oblique: oblScale } = familyScales;

  const splDbRaw = freqsHz.map(f => {
    // Direct path
    const ddx = sx - rx, ddy = sy - ry, ddz = sz - rz;
    const dist = Math.max(0.01, Math.sqrt(ddx*ddx + ddy*ddy + ddz*ddz));
    const distLossDb = -20 * Math.log10(dist);
    const directAmp = Math.pow(10, (FLAT_SOURCE_DB + distLossDb) / 20);
    const tof = -2 * Math.PI * f * dist / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    // Modal contributions
    let modalRe = 0, modalIm = 0;
    for (const mode of modesWithQ) {
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

      // Per-family diagnostic scale multiplier (diagnostic only — not in production engine)
      const familyScale = mode.type === 'axial' ? axScale
        : mode.type === 'tangential' ? tanScale
        : oblScale;

      const gain = srcAmp * coupling * orderWeight * hoAxialScale * familyScale;
      modalRe += gain * tRe;
      modalIm += gain * tIm;
    }

    sumRe += modalRe;
    sumIm += modalIm;
    const mag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
    return 20 * Math.log10(Math.max(mag, 1e-10));
  });

  return splDbRaw;
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
    sumErr += err; if (err > worstErr) worstErr = err; count++;
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
  background: '#fdf4ff', borderBottom: '2px solid #d8b4fe', color: '#6b21a8', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

// ── Component ─────────────────────────────────────────────────────────────────
export default function RewParityModalFamilySweep({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
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

    const W = Number(roomDims.widthM), L = Number(roomDims.lengthM), H = Number(roomDims.heightM);
    const sx = Number(sub.x), sy = Number(sub.y), sz = Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35;
    const rx = Number(seat.x), ry = Number(seat.y), rz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
    const axialQOverride = activeSettings?.axialQ ?? 8;
    const sa = surfaceAbsorption ?? {};

    // Pre-build modes with Q values
    const rawModes = buildModes(W, L, H, 210);
    const modesWithQ = rawModes.map(m => {
      const baseQ = typeQ(m.type, axialQOverride);
      const absQ  = sabineQ(m.freq, W, L, H, sa);
      return { ...m, q: Math.max(1, Math.min(baseQ, absQ)) };
    });

    const freqsHz = buildFreqAxis(20, 200);

    // ── Baseline: current settings (all family scales = 1.0) ──
    const baseRaw = runFamilySim(W, L, H, sx, sy, sz, rx, ry, rz, sa, axialQOverride,
      { axial: 1.0, tangential: 1.0, oblique: 1.0 }, freqsHz, modesWithQ);
    const baseScore = scoreResponse(freqsHz, baseRaw);
    if (baseScore) {
      setCurrentRow({ axial: 1.0, tangential: 1.0, oblique: 1.0, ...baseScore });
    }

    // ── Sweep grid ──
    const scored = [];
    let done = 0;
    const CHUNK = 10;
    const combos = [];
    for (const ax of AXIAL_SCALES)
      for (const tan of TANGENTIAL_SCALES)
        for (const obl of OBLIQUE_SCALES)
          combos.push({ axial: ax, tangential: tan, oblique: obl });

    for (let i = 0; i < combos.length; i += CHUNK) {
      const chunk = combos.slice(i, i + CHUNK);
      for (const { axial, tangential, oblique } of chunk) {
        const raw = runFamilySim(W, L, H, sx, sy, sz, rx, ry, rz, sa, axialQOverride,
          { axial, tangential, oblique }, freqsHz, modesWithQ);
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

  // ── Parameter sensitivity (from full top-20 for each parameter) ──
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

    const ax  = analyseParam('axial',       AXIAL_SCALES);
    const tan = analyseParam('tangential',  TANGENTIAL_SCALES);
    const obl = analyseParam('oblique',     OBLIQUE_SCALES);

    // Rank families by spread (spread = influence)
    const ranked = [
      { family: 'axial',       ...ax  },
      { family: 'tangential',  ...tan },
      { family: 'oblique',     ...obl },
    ].sort((a, b) => b.spread - a.spread);

    return ranked;
  }, [results, currentRow]);

  const best = results?.[0] ?? null;
  const maeDelta   = (currentRow?.mae != null && best?.mae != null) ? currentRow.mae - best.mae : null;
  const worstDelta = (currentRow?.worst != null && best?.worst != null) ? currentRow.worst - best.worst : null;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #d8b4fe', paddingTop: 10 }}>
      <div style={{ fontWeight: 700, color: '#6b21a8', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Modal Family Sweep
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {AXIAL_SCALES.length}×{TANGENTIAL_SCALES.length}×{OBLIQUE_SCALES.length} = {TOTAL_COMBOS} combinations · diagnostic only · does not modify simulation
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>
        Sweeps axial / tangential / oblique gain multipliers independently. All other engine settings held constant.
        Self-contained acoustic maths — production engine is unmodified.
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
            border: '1px solid #7e22ce', background: running ? '#e5e7eb' : '#7e22ce',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {running
            ? `Running… ${progress} / ${TOTAL_COMBOS} (${Math.round(progress / TOTAL_COMBOS * 100)}%)`
            : results ? 'Re-run family sweep' : 'Run modal family sweep'}
        </button>
      </div>

      {/* Progress bar */}
      {running && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ background: '#ede9fe', borderRadius: 4, height: 5, overflow: 'hidden' }}>
            <div style={{
              background: '#7e22ce', height: '100%',
              width: `${(progress / TOTAL_COMBOS) * 100}%`, transition: 'width 0.1s',
            }} />
          </div>
        </div>
      )}

      {/* ── Results table ── */}
      {(currentRow || results) && (
        <div style={{ overflowX: 'auto', marginTop: 4 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ ...thS, textAlign: 'left' }}>Rank</th>
                <th style={thS}>Axial ×</th>
                <th style={thS}>Tang ×</th>
                <th style={thS}>Obliq ×</th>
                <th style={thS}>Overall MAE</th>
                <th style={thS}>Worst Err</th>
                {BANDS.map(b => <th key={b.label} style={thS}>{b.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {/* ★ CURRENT (all scales = 1.0) */}
              {currentRow && (
                <tr style={{ borderBottom: '2px solid #d8b4fe', background: '#fff7ed' }}>
                  <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#b45309', fontSize: 9 }}>★ CURRENT</td>
                  <td style={{ ...tdS, color: '#92400e' }}>{fmt(currentRow.axial, 2)}</td>
                  <td style={{ ...tdS, color: '#92400e' }}>{fmt(currentRow.tangential, 2)}</td>
                  <td style={{ ...tdS, color: '#92400e' }}>{fmt(currentRow.oblique, 2)}</td>
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
              {/* Top-20 rows */}
              {results && results.map((row, i) => {
                const isBest = i === 0;
                return (
                  <tr key={`${row.axial}-${row.tangential}-${row.oblique}`} style={{
                    borderBottom: '1px solid #ede9fe',
                    background: isBest ? '#f3e8ff' : i < 3 ? '#fdf4ff' : undefined,
                  }}>
                    <td style={{ ...tdS, textAlign: 'left', fontWeight: isBest ? 700 : 400, color: isBest ? '#6b21a8' : '#374151' }}>
                      {isBest ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `#${i + 1}`}
                    </td>
                    <td style={{ ...tdS, fontWeight: row.axial !== 1.0 ? 700 : 400, color: row.axial !== 1.0 ? '#6b21a8' : '#374151' }}>
                      {fmt(row.axial, 2)}
                    </td>
                    <td style={{ ...tdS, fontWeight: row.tangential !== 1.0 ? 700 : 400, color: row.tangential !== 1.0 ? '#6b21a8' : '#374151' }}>
                      {fmt(row.tangential, 2)}
                    </td>
                    <td style={{ ...tdS, fontWeight: row.oblique !== 1.0 ? 700 : 400, color: row.oblique !== 1.0 ? '#6b21a8' : '#374151' }}>
                      {fmt(row.oblique, 2)}
                    </td>
                    <td style={{ ...tdS, fontWeight: isBest ? 700 : 400, color: isBest ? '#6b21a8' : '#374151' }}>
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
            ▼ = improved vs current · ▲ = worse vs current · bold scale = differs from 1.00 baseline
          </div>
        </div>
      )}

      {/* ── Sensitivity Summary ── */}
      {sensitivity && best && (
        <div style={{ marginTop: 12, borderTop: '1px dashed #d8b4fe', paddingTop: 8 }}>
          <div style={{ fontWeight: 700, color: '#6b21a8', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
            Modal Family Sensitivity Report
            <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>diagnostic summary</span>
          </div>

          {/* Parameter influence table */}
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 420 }}>
              <thead>
                <tr>
                  {[['left','Family'], ['right','Best scale'], ['right','Best avg MAE'], ['right','MAE spread'], ['left','Influence']].map(([a, l]) => (
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
                  return (
                    <tr key={row.family} style={{
                      borderBottom: '1px solid #ede9fe',
                      background: i === 0 ? '#fdf4ff' : undefined,
                    }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#6b21a8' }}>{row.family}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: '#374151' }}>{fmt(row.bestValue, 2)}</td>
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

          {/* Key metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Current MAE',          value: fmt(currentRow?.mae, 3) + ' dB',  note: 'all scales = 1.00' },
              { label: 'Best MAE',             value: fmt(best.mae, 3) + ' dB',          note: `ax=${fmt(best.axial,2)} tan=${fmt(best.tangential,2)} obl=${fmt(best.oblique,2)}` },
              { label: 'MAE Improvement',
                value: maeDelta !== null ? (maeDelta >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(maeDelta), 3) + ' dB' : '—',
                note: maeDelta != null && maeDelta > 1.5 ? 'family weighting is primary error driver'
                    : maeDelta != null && maeDelta > 0.5 ? 'moderate family weighting sensitivity'
                    : 'low — family weighting not the primary gap' },
              { label: 'Worst Error Δ',
                value: worstDelta !== null ? (worstDelta >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(worstDelta), 3) + ' dB' : '—',
                note: '' },
              { label: 'Primary driver',
                value: sensitivity[0]?.family ?? '—',
                note: `spread = ${fmt(sensitivity[0]?.spread, 3)} dB` },
              { label: 'Best axial / tan / obl',
                value: `${fmt(sensitivity.find(s => s.family === 'axial')?.bestValue, 2)} / ${fmt(sensitivity.find(s => s.family === 'tangential')?.bestValue, 2)} / ${fmt(sensitivity.find(s => s.family === 'oblique')?.bestValue, 2)}`,
                note: 'average-optimal per family' },
            ].map(({ label, value, note }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #e9d5ff', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b21a8', fontFamily: 'monospace', wordBreak: 'break-word' }}>{value}</div>
                {note && <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 }}>{note}</div>}
              </div>
            ))}
          </div>

          {/* Diagnostic conclusion */}
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: (maeDelta ?? 0) > 1.5 ? '#fef3c7' : (maeDelta ?? 0) > 0.5 ? '#fdf4ff' : '#f0fdf4',
            border: `1px solid ${(maeDelta ?? 0) > 1.5 ? '#fbbf24' : (maeDelta ?? 0) > 0.5 ? '#d8b4fe' : '#86efac'}`,
            fontSize: 10, fontFamily: 'monospace',
            color: (maeDelta ?? 0) > 1.5 ? '#92400e' : (maeDelta ?? 0) > 0.5 ? '#6b21a8' : '#166534',
          }}>
            {(maeDelta ?? 0) > 1.5 ? (
              <>
                <strong>⚠ Modal family weighting is a primary parity error driver.</strong> Rescaling families
                reduces MAE by {fmt(maeDelta, 2)} dB. <strong>{sensitivity[0]?.family}</strong> weighting has the
                highest influence (spread = {fmt(sensitivity[0]?.spread, 2)} dB). The {sensitivity[0]?.family} scale
                of {fmt(sensitivity.find(s => s.family === sensitivity[0]?.family)?.bestValue, 2)}× gives best average performance.
              </>
            ) : (maeDelta ?? 0) > 0.5 ? (
              <>
                <strong>Moderate family weighting sensitivity ({fmt(maeDelta, 2)} dB improvement possible).</strong>{' '}
                <strong>{sensitivity[0]?.family}</strong> is the most sensitive parameter.
                Family weighting is a secondary contributor; other factors (Q, geometry, source model) likely dominate.
              </>
            ) : (
              <>
                <strong>✓ Low family weighting sensitivity.</strong> Best family scaling reduces MAE by only {fmt(maeDelta ?? 0, 2)} dB.
                The remaining parity error is <strong>not primarily caused by incorrect modal-family weighting</strong> —
                investigate Q values, source model, or geometry instead.
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}