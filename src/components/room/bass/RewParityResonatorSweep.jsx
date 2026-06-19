// RewParityResonatorSweep.jsx
// Diagnostic-only: tests multiple modal transfer-function (resonator) formulations
// against the REW benchmark while keeping room geometry, modal frequencies, source
// model, seat position, and Q values identical across all candidates.
// Does NOT modify the production engine or any defaults.

import React, { useState, useCallback } from 'react';

// ── REW benchmark (shared with other sweep components) ─────────────────────────
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

const FLAT_SOURCE_DB = 94;
const C = 343;
const BASE_Q = { axial: 8.0, tangential: 6.0, oblique: 4.5 };

// ── Resonator formulations ─────────────────────────────────────────────────────
// Each returns { re, im } complex transfer-function value at frequencyHz given f0 and Q.
// All formulations are normalised versions of a 2nd-order resonator.

const RESONATORS = [
  {
    id: 'production',
    label: '1. Production (current)',
    desc: 'Existing 2nd-order resonator: H = 1/(1 - r² - j·r/Q)',
    fn: (f, f0, Q) => {
      const r = f / Math.max(f0, 1e-6);
      const rr = 1 - r * r;
      const ri = r / Math.max(Q, 1e-6);
      const d = rr * rr + ri * ri;
      return { re: rr / d, im: -ri / d };
    },
  },
  {
    id: 'rew_damped',
    label: '2. REW-style Damped',
    desc: 'Damping-ratio form: zeta = 1/(2Q), H = 1/(1 - r² + j·2·zeta·r)',
    fn: (f, f0, Q) => {
      const r = f / Math.max(f0, 1e-6);
      const zeta = 1 / (2 * Math.max(Q, 1e-6));
      const rr = 1 - r * r;
      const ri = 2 * zeta * r;
      const d = rr * rr + ri * ri;
      return { re: rr / d, im: -ri / d };
    },
  },
  {
    id: 'bandwidth',
    label: '3. Bandwidth (Δf)',
    desc: 'Bandwidth form: H = 1/(1 - (f²-f0²)/(j·f·Δf)), Δf = f0/Q',
    fn: (f, f0, Q) => {
      const bw = f0 / Math.max(Q, 1e-6);
      const num_re = 0;
      const num_im = f * bw;
      const den_re = f0 * f0 - f * f;
      const den_im = f * bw;
      const d = den_re * den_re + den_im * den_im;
      // H = j·f·Δf / (f0²-f²+j·f·Δf) — classic band-pass denominator form
      const re = (num_re * den_re + num_im * den_im) / d;
      const im = (num_im * den_re - num_re * den_im) / d;
      return { re, im };
    },
  },
  {
    id: 'energy_norm',
    label: '4. Energy-Normalised',
    desc: 'Modal energy preserved across Q: H scaled by √(1/Q) so ∫|H|² df is constant',
    fn: (f, f0, Q) => {
      const r = f / Math.max(f0, 1e-6);
      const rr = 1 - r * r;
      const ri = r / Math.max(Q, 1e-6);
      const d = rr * rr + ri * ri;
      // Energy normalisation: multiply by 1/√Q (narrower Q → sharper but shorter peak)
      const scale = 1 / Math.sqrt(Math.max(Q, 1e-6));
      return { re: scale * rr / d, im: scale * -ri / d };
    },
  },
  {
    id: 'peak_norm',
    label: '5. Peak-Normalised',
    desc: 'Equal peak height: H(f0) = 1 always, regardless of Q',
    fn: (f, f0, Q) => {
      const r = f / Math.max(f0, 1e-6);
      const rr = 1 - r * r;
      const ri = r / Math.max(Q, 1e-6);
      const d = rr * rr + ri * ri;
      // At resonance (r→1) the production transfer function peaks at Q.
      // Divide by Q to normalise peak to unity.
      return { re: (rr / d) / Math.max(Q, 1e-6), im: (-ri / d) / Math.max(Q, 1e-6) };
    },
  },
  {
    id: 'area_norm',
    label: '6. Area-Normalised',
    desc: 'Equal integrated energy under curve: H scaled by 1/Q so ∫|H| df ≈ constant',
    fn: (f, f0, Q) => {
      const r = f / Math.max(f0, 1e-6);
      const rr = 1 - r * r;
      const ri = r / Math.max(Q, 1e-6);
      const d = rr * rr + ri * ri;
      // ∫|H(f)|df ∝ Q for the production resonator, so divide by Q to equalise area.
      return { re: (rr / d) / Math.max(Q, 1e-6), im: (-ri / d) / Math.max(Q, 1e-6) };
    },
  },
  {
    id: 'const_gain',
    label: '7. Constant-Gain',
    desc: 'Shape changes with Q but gain is held constant at 1 at all frequencies',
    fn: (f, f0, Q) => {
      const r = f / Math.max(f0, 1e-6);
      const rr = 1 - r * r;
      const ri = r / Math.max(Q, 1e-6);
      const d = rr * rr + ri * ri;
      const mag = Math.sqrt((rr * rr + ri * ri) / (d * d));
      const base_re = rr / d;
      const base_im = -ri / d;
      // Normalise so |H| = 1 everywhere (pure phase filter — tests phase shape only)
      const m = Math.sqrt(base_re * base_re + base_im * base_im) || 1e-10;
      return { re: base_re / m, im: base_im / m };
    },
  },
  {
    id: 'symmetric',
    label: '8. Symmetric (REW-closest)',
    desc: 'Symmetric 2nd-order: uses |1-r²| instead of signed (1-r²) to remove sign flip',
    fn: (f, f0, Q) => {
      const r = f / Math.max(f0, 1e-6);
      // Use unsigned real part — REW Green's function uses magnitude-based coupling
      const rr = Math.abs(1 - r * r);
      const ri = r / Math.max(Q, 1e-6);
      const d = rr * rr + ri * ri;
      return { re: rr / d, im: -ri / d };
    },
  },
];

// ── Pure acoustic helpers ──────────────────────────────────────────────────────

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
    (L * W) * ((sa?.floor ?? 0.3) + (sa?.ceiling ?? 0.3)) +
    (W * H) * ((sa?.front ?? 0.3) + (sa?.back ?? 0.3)) +
    (L * H) * ((sa?.left ?? 0.3) + (sa?.right ?? 0.3));
  const rt60 = 0.161 * V / Math.max(A, 1e-6);
  return Math.max(1, Math.min(80, (2 * Math.PI * f0 * rt60) / 13.815));
}

function cosShape(n, pos, dim) {
  return n > 0 ? Math.cos(n * Math.PI * pos / Math.max(dim, 1e-6)) : 1;
}

// Build modes with Q values (shared across all resonator candidates)
function buildModesWithQ(W, L, H, axialQOverride, sa) {
  return buildModes(W, L, H, 210).map(m => {
    const baseQ = m.type === 'axial' ? (axialQOverride ?? BASE_Q.axial)
      : m.type === 'tangential' ? BASE_Q.tangential
      : BASE_Q.oblique;
    const absQ = sabineQ(m.freq, W, L, H, sa);
    return { ...m, q: Math.max(1, Math.min(baseQ, absQ)) };
  });
}

// Run simulation for a single resonator formulation
function runResonatorSim(W, L, H, sx, sy, sz, rx, ry, rz, resonatorFn, freqsHz, modesWithQ) {
  const srcAmp = Math.pow(10, FLAT_SOURCE_DB / 20);

  return freqsHz.map(f => {
    // Direct path
    const ddx = sx - rx, ddy = sy - ry, ddz = sz - rz;
    const dist = Math.max(0.01, Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz));
    const distLossDb = -20 * Math.log10(dist);
    const directAmp = Math.pow(10, (FLAT_SOURCE_DB + distLossDb) / 20);
    const tof = -2 * Math.PI * f * dist / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    for (const mode of modesWithQ) {
      const srcCos = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rcvCos = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      const coupling = srcCos * rcvCos;

      const { re: tRe, im: tIm } = resonatorFn(f, mode.freq, mode.q);

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

// ── Scoring ────────────────────────────────────────────────────────────────────

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

// ── Styles ─────────────────────────────────────────────────────────────────────
const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#fef9c3', borderBottom: '2px solid #fde047', color: '#713f12', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

// ── Component ──────────────────────────────────────────────────────────────────
export default function RewParityResonatorSweep({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results,  setResults]  = useState(null);
  const [running,  setRunning]  = useState(false);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  const runSweep = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);

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

    const modesWithQ = buildModesWithQ(W, L, H, axialQOverride, sa);
    const freqsHz = buildFreqAxis(20, 200);

    const scored = [];
    for (const resonator of RESONATORS) {
      await new Promise(r => setTimeout(r, 0)); // yield to UI
      const raw = runResonatorSim(W, L, H, sx, sy, sz, rx, ry, rz, resonator.fn, freqsHz, modesWithQ);
      const score = scoreResponse(freqsHz, raw);
      if (score) scored.push({ ...resonator, ...score });
    }

    // Production is always first; sort the rest by MAE
    const prod = scored.find(r => r.id === 'production');
    const others = scored.filter(r => r.id !== 'production').sort((a, b) => a.mae - b.mae);
    setResults({ production: prod, ranked: [prod, ...others].filter(Boolean) });
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  const rankedRows = Array.isArray(results?.ranked) ? results.ranked : [];
  const prodRow = results?.production ?? null;
  const bestRow = rankedRows.filter(r => r.id !== 'production')[0] ?? null;
  const bestAlt = rankedRows[0]?.id !== 'production'
    ? rankedRows[0]
    : rankedRows[1] ?? null;
  // Best across ALL including production
  const overallBest = rankedRows[0] ?? null;
  const maeDelta = (prodRow && overallBest) ? prodRow.mae - overallBest.mae : null;
  const worstDelta = (prodRow && overallBest) ? prodRow.worst - overallBest.worst : null;

  const isSignificant = (maeDelta ?? 0) >= 1.0;
  const isLow        = (maeDelta ?? 0) < 0.5;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #fde047', paddingTop: 10 }}>
      <div style={{ fontWeight: 700, color: '#713f12', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Resonator Shape Sweep
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {RESONATORS.length} formulations · diagnostic only · engine untouched
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>
        Tests {RESONATORS.length} modal transfer-function shapes with identical room geometry, Q values, and benchmark.
        Determines whether resonator shape or Q magnitude is the dominant parity driver.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, and valid sub to run.
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <button
          onClick={runSweep}
          disabled={running || !canRun}
          style={{
            height: 28, padding: '0 14px', borderRadius: 6,
            border: '1px solid #a16207', background: running ? '#e5e7eb' : '#a16207',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {running ? 'Running…' : results ? 'Re-run resonator sweep' : 'Run Resonator Shape sweep'}
        </button>
      </div>

      {/* Results table */}
      {results && (
        <>
          <div style={{ overflowX: 'auto', marginTop: 4 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Rank</th>
                  <th style={{ ...thS, textAlign: 'left' }}>Formulation</th>
                  <th style={thS}>Overall MAE</th>
                  <th style={thS}>Worst Err</th>
                  {BANDS.map(b => <th key={b.label} style={thS}>{b.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((row, i) => {
                  const isProd = row.id === 'production';
                  const isBest = i === 0 && !isProd || (i === 0 && results.ranked.length === 1);
                  const isOverallBest = overallBest?.id === row.id;
                  const maeVsProd = isProd ? 0 : (prodRow ? row.mae - prodRow.mae : null);
                  const improved = maeVsProd !== null && maeVsProd < -0.01;
                  const worse    = maeVsProd !== null && maeVsProd > 0.01;
                  const bg = isProd ? '#fff7ed'
                    : isOverallBest ? '#fef9c3'
                    : i < 3 ? '#fffbeb'
                    : undefined;

                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #fef08a', background: bg }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: isProd || isOverallBest ? 700 : 400,
                        color: isProd ? '#b45309' : isOverallBest ? '#713f12' : '#374151' }}>
                        {isProd ? '★ PROD' : i === 0 ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `#${i + 1}`}
                      </td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 9, maxWidth: 240,
                        color: isProd ? '#92400e' : isOverallBest ? '#713f12' : '#374151',
                        fontWeight: isOverallBest ? 700 : 400 }}>
                        {row.label}
                      </td>
                      <td style={{ ...tdS, fontWeight: isProd || isOverallBest ? 700 : 400,
                        color: isProd ? '#b45309' : improved ? '#15803d' : '#374151' }}>
                        {fmt(row.mae, 3)}
                        {!isProd && maeVsProd !== null && (
                          <span style={{ fontSize: 8, color: improved ? '#15803d' : worse ? '#dc2626' : '#6b7280', marginLeft: 2 }}>
                            ({improved ? '▼' : worse ? '▲' : '~'}{fmt(Math.abs(maeVsProd), 2)})
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdS, color: (row.worst ?? 0) > 5 ? '#dc2626' : (row.worst ?? 0) > 3 ? '#b45309' : '#374151' }}>
                        {fmt(row.worst, 3)}
                      </td>
                      {row.bands.map((v, bi) => {
                        const prodBand = prodRow?.bands[bi];
                        const bandImproved = !isProd && v !== null && prodBand !== null && v < prodBand - 0.01;
                        const bandWorse    = !isProd && v !== null && prodBand !== null && v > prodBand + 0.01;
                        return (
                          <td key={bi} style={{
                            ...tdS,
                            color: bandImproved ? '#15803d' : bandWorse ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151',
                            fontWeight: isOverallBest ? 700 : 400,
                          }}>
                            {fmt(v, 2)}{bandImproved ? ' ▼' : bandWorse ? ' ▲' : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 4, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
              ▼ = improved vs production · ▲ = worse · delta shown in parentheses
            </div>
          </div>

          {/* Formulation descriptions */}
          <div style={{ marginTop: 10, borderTop: '1px dashed #fde047', paddingTop: 6 }}>
            <div style={{ fontWeight: 700, color: '#713f12', fontSize: 9, fontFamily: 'monospace', marginBottom: 4 }}>
              Formulation descriptions:
            </div>
            {RESONATORS.map(r => (
              <div key={r.id} style={{ fontSize: 9, fontFamily: 'monospace', color: '#92400e', marginBottom: 2 }}>
                <span style={{ fontWeight: 700 }}>{r.label}:</span> {r.desc}
              </div>
            ))}
          </div>

          {/* Summary cards */}
          <div style={{ marginTop: 12, borderTop: '1px dashed #fde047', paddingTop: 8 }}>
            <div style={{ fontWeight: 700, color: '#713f12', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
              Resonator Shape Summary
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Current MAE',         value: fmt(prodRow?.mae, 3) + ' dB',         note: 'Production formulation' },
                { label: 'Best MAE',             value: fmt(overallBest?.mae, 3) + ' dB',     note: overallBest?.label ?? '—' },
                { label: 'MAE improvement',
                  value: maeDelta !== null ? (maeDelta >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(maeDelta), 3) + ' dB' : '—',
                  note: maeDelta != null && maeDelta >= 1.0 ? '⚠ significant' : maeDelta != null && maeDelta >= 0.5 ? 'moderate' : 'low' },
                { label: 'Worst-error Δ',
                  value: worstDelta !== null ? (worstDelta >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(worstDelta), 3) + ' dB' : '—',
                  note: '' },
                { label: 'Best resonator',       value: overallBest?.id === 'production' ? 'Production' : (overallBest?.label?.replace(/^\d+\.\s*/, '') ?? '—'),
                  note: overallBest?.id === 'production' ? 'no alternative beats it' : '' },
                { label: 'Production rank',
                  value: `#${(rankedRows.findIndex(r => r.id === 'production') + 1)} of ${rankedRows.length}`,
                  note: '' },
              ].map(({ label, value, note }) => (
                <div key={label} style={{ background: '#fff', border: '1px solid #fde047', borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#713f12', fontFamily: 'monospace', wordBreak: 'break-word' }}>{value}</div>
                  {note && <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 }}>{note}</div>}
                </div>
              ))}
            </div>

            {/* Diagnostic conclusion */}
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: isSignificant ? '#fef3c7' : isLow ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${isSignificant ? '#fbbf24' : isLow ? '#86efac' : '#fde047'}`,
              fontSize: 10, fontFamily: 'monospace',
              color: isSignificant ? '#92400e' : isLow ? '#166534' : '#713f12',
              fontWeight: 600,
            }}>
              {isSignificant ? (
                <>
                  ⚠ <strong>Transfer-function sensitivity is significant.</strong> Best resonator ({overallBest?.label}) reduces MAE by {fmt(maeDelta, 2)} dB vs production.
                  Current Q optimisation may be compensating for resonator-shape error.
                  Recommend verifying Q values against the {overallBest?.label} formulation baseline.
                </>
              ) : isLow ? (
                <>
                  ✓ <strong>Transfer-function sensitivity is low ({fmt(maeDelta ?? 0, 2)} dB improvement).</strong>{' '}
                  Q values remain the dominant parity driver. Resonator shape is not a material source of error.
                </>
              ) : (
                <>
                  ~ Moderate resonator sensitivity ({fmt(maeDelta, 2)} dB). Best formulation: <strong>{overallBest?.label}</strong>.
                  Q values are the primary driver but resonator shape contributes marginally.
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}