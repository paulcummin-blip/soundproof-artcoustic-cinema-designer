// RewParityTangentialDominanceAudit.jsx
// Diagnostic-only: compares MAE and worst error across 10 tangential-focused scenarios.
// Self-contained — does NOT call or modify the production engine.
// Reuses the same acoustic maths and REW benchmark as RewParityModalFamilySweep.

import React, { useState, useCallback } from 'react';

// ── REW benchmark (same as RewParityModalFamilySweep) ─────────────────────────
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

// ── Scenario definitions ───────────────────────────────────────────────────────
const SCENARIOS = [
  { id: 1,  label: 'Current (all modes × 1.0)',              axial: 1.0, tangential: 1.0,  oblique: 1.0,  excludeOblique: false, excludeTangential: false, excludeAxial: false },
  { id: 2,  label: 'Axial modes only',                       axial: 1.0, tangential: 0.0,  oblique: 0.0,  excludeOblique: false, excludeTangential: false, excludeAxial: false },
  { id: 3,  label: 'Tangential modes only',                  axial: 0.0, tangential: 1.0,  oblique: 0.0,  excludeOblique: false, excludeTangential: false, excludeAxial: false },
  { id: 4,  label: 'Axial + tangential only',                axial: 1.0, tangential: 1.0,  oblique: 0.0,  excludeOblique: false, excludeTangential: false, excludeAxial: false },
  { id: 5,  label: 'Axial + tangential × 0.25',              axial: 1.0, tangential: 0.25, oblique: 0.0,  excludeOblique: false, excludeTangential: false, excludeAxial: false },
  { id: 6,  label: 'Axial + tangential × 0.50',              axial: 1.0, tangential: 0.50, oblique: 0.0,  excludeOblique: false, excludeTangential: false, excludeAxial: false },
  { id: 7,  label: 'Axial + tangential × 0.75',              axial: 1.0, tangential: 0.75, oblique: 0.0,  excludeOblique: false, excludeTangential: false, excludeAxial: false },
  { id: 8,  label: 'All modes, tangential × 0.25',           axial: 1.0, tangential: 0.25, oblique: 1.0,  excludeOblique: false, excludeTangential: false, excludeAxial: false },
  { id: 9,  label: 'All modes, tangential × 0.50',           axial: 1.0, tangential: 0.50, oblique: 1.0,  excludeOblique: false, excludeTangential: false, excludeAxial: false },
  { id: 10, label: 'All modes, tangential × 0.75',           axial: 1.0, tangential: 0.75, oblique: 1.0,  excludeOblique: false, excludeTangential: false, excludeAxial: false },
];

const FLAT_SOURCE_DB = 94;
const C = 343;

// ── Acoustic helpers (self-contained, mirrors RewParityModalFamilySweep) ──────

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
  return Math.max(1, Math.min(80, 2 * Math.PI * f0 * rt60 / 13.815));
}

function typeBaseQ(type, axialQOverride) {
  if (type === 'axial') return Number.isFinite(axialQOverride) ? axialQOverride : 4.0;
  if (type === 'tangential') return 3.9;
  return 2.5;
}

function cosShape(n, pos, dim) {
  return n > 0 ? Math.cos(n * Math.PI * pos / Math.max(dim, 1e-6)) : 1;
}

function runScenario(W, L, H, sx, sy, sz, rx, ry, rz, modesWithQ, freqsHz, scenario) {
  const srcAmp = Math.pow(10, FLAT_SOURCE_DB / 20);
  const { axial: axScale, tangential: tanScale, oblique: oblScale } = scenario;

  const splDb = freqsHz.map(f => {
    // Direct path
    const dist = Math.max(0.01, Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2));
    const distLossDb = -20 * Math.log10(dist);
    const directAmp = Math.pow(10, (FLAT_SOURCE_DB + distLossDb) / 20);
    const tof = -2 * Math.PI * f * dist / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    // Modal contributions with per-family scale
    for (const mode of modesWithQ) {
      const familyScale = mode.type === 'axial' ? axScale
        : mode.type === 'tangential' ? tanScale
        : oblScale;
      if (familyScale === 0) continue;

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

      const gain = srcAmp * coupling * orderWeight * hoAxialScale * familyScale;
      sumRe += gain * tRe;
      sumIm += gain * tIm;
    }

    const mag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
    return 20 * Math.log10(Math.max(mag, 1e-10));
  });

  return splDb;
}

function interpolate(freqsHz, splDb, targetHz) {
  if (!freqsHz?.length) return null;
  if (targetHz <= freqsHz[0]) return splDb[0];
  if (targetHz >= freqsHz[freqsHz.length - 1]) return splDb[splDb.length - 1];
  for (let i = 0; i < freqsHz.length - 1; i++) {
    if (targetHz >= freqsHz[i] && targetHz <= freqsHz[i + 1]) {
      const t = (targetHz - freqsHz[i]) / (freqsHz[i + 1] - freqsHz[i]);
      return splDb[i] + (splDb[i + 1] - splDb[i]) * t;
    }
  }
  return null;
}

function scoreResponse(freqsHz, splDb) {
  let sumErr = 0, worstErr = 0, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const v = interpolate(freqsHz, splDb, hz);
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
      const v = interpolate(freqsHz, splDb, hz);
      if (!Number.isFinite(v)) continue;
      s += Math.abs(v - db); c++;
    }
    return c > 0 ? s / c : null;
  });
  return { mae: sumErr / count, worst: worstErr, bands };
}

function conclusionFor(ranked, currentMae) {
  if (!ranked?.length) return null;
  const best = ranked[0];
  const delta = currentMae - best.score.mae;

  if (best.scenario.id === 1) {
    return '✓ Current settings already achieve best parity. Tangential attenuation does not improve the result — tangential energy is either well-matched or required by the benchmark shape.';
  }
  if (best.scenario.tangential < 1.0 && delta > 2.0) {
    return `⚠ Excessive tangential energy is a primary parity error driver. Scenario "${best.scenario.label}" reduces MAE by ${delta.toFixed(2)} dB. Tangential modes at ×${best.scenario.tangential.toFixed(2)} give best benchmark alignment.`;
  }
  if (best.scenario.tangential < 1.0 && delta > 0.5) {
    return `Tangential attenuation provides moderate improvement (▼${delta.toFixed(2)} dB MAE). The remaining gap is likely caused by incorrect tangential phasing or Q values, not purely amplitude.`;
  }
  if (best.scenario.tangential === 0.0) {
    return `Tangential modes set to zero gives best MAE — tangential contribution is entirely counterproductive at current Q/phase settings. Q or phase of tangential modes is the likely root cause.`;
  }
  return `Tangential weighting has minor influence on parity (▼${delta.toFixed(2)} dB). The remaining error is driven by other factors (axial Q, geometry, source model).`;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#fdf2f8', borderBottom: '2px solid #f9a8d4', color: '#9d174d', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

// ── Component ──────────────────────────────────────────────────────────────────
export default function RewParityTangentialDominanceAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  const runAudit = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);

    const W = Number(roomDims.widthM), L = Number(roomDims.lengthM), H = Number(roomDims.heightM);
    const sx = Number(sub.x), sy = Number(sub.y), sz = Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35;
    const rx = Number(seat.x), ry = Number(seat.y), rz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
    const axialQOverride = activeSettings?.axialQ ?? 4.0;
    const sa = surfaceAbsorption ?? {};

    const rawModes = buildModes(W, L, H, 210);
    const modesWithQ = rawModes.map(m => {
      const baseQ = typeBaseQ(m.type, axialQOverride);
      const absQ = sabineQ(m.freq, W, L, H, sa);
      return { ...m, q: Math.max(1, Math.min(baseQ, absQ)) };
    });

    const freqsHz = buildFreqAxis(20, 200);
    const scored = [];

    for (const scenario of SCENARIOS) {
      const splDb = runScenario(W, L, H, sx, sy, sz, rx, ry, rz, modesWithQ, freqsHz, scenario);
      const score = scoreResponse(freqsHz, splDb);
      if (score) scored.push({ scenario, score });
      // Yield to keep UI responsive
      await new Promise(r => setTimeout(r, 0));
    }

    // Sort by MAE, but keep scenario #1 (current) pinned — we surface it separately
    const current = scored.find(r => r.scenario.id === 1);
    const ranked = scored
      .filter(r => r.scenario.id !== 1)
      .sort((a, b) => a.score.mae - b.score.mae);

    setResults({ current, ranked, all: scored });
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  const conclusion = results ? conclusionFor(results.ranked, results.current?.score?.mae) : null;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #f9a8d4', paddingTop: 10 }}>
      <div style={{ fontWeight: 700, color: '#9d174d', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Tangential Dominance Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          10 scenarios · diagnostic only · does not modify simulation
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>
        Isolates the impact of tangential modes on REW parity — compares axial-only, tangential-only,
        combined, and reduced-tangential scenarios. Production engine unmodified.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, and valid sub position to run audit.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{
            height: 28, padding: '0 14px', borderRadius: 6,
            border: '1px solid #be185d', background: running ? '#e5e7eb' : '#be185d',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {running ? 'Running…' : results ? 'Re-run audit' : 'Run tangential dominance audit'}
        </button>
      </div>

      {running && (
        <div style={{ fontSize: 10, color: '#9d174d', fontFamily: 'monospace', marginBottom: 6 }}>
          Running 10 scenarios…
        </div>
      )}

      {results && (
        <>
          {/* ── Results table ── */}
          <div style={{ overflowX: 'auto', marginTop: 4 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 740 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Rank</th>
                  <th style={{ ...thS, textAlign: 'left', minWidth: 200 }}>Scenario</th>
                  <th style={thS}>Overall MAE</th>
                  <th style={thS}>Worst Err</th>
                  {BANDS.map(b => <th key={b.label} style={thS}>{b.label} MAE</th>)}
                </tr>
              </thead>
              <tbody>
                {/* ★ CURRENT row always first */}
                {results.current && (() => {
                  const { score } = results.current;
                  return (
                    <tr style={{ borderBottom: '2px solid #f9a8d4', background: '#fff1f5' }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#9d174d', fontSize: 9 }}>★ CURRENT</td>
                      <td style={{ ...tdS, textAlign: 'left', color: '#9d174d', fontWeight: 700, fontSize: 9 }}>Current (all modes × 1.0)</td>
                      <td style={{ ...tdS, fontWeight: 700, color: '#9d174d' }}>{fmt(score.mae, 3)}</td>
                      <td style={{ ...tdS, color: (score.worst ?? 0) > 5 ? '#dc2626' : '#9d174d', fontWeight: 600 }}>
                        {fmt(score.worst, 3)}
                      </td>
                      {score.bands.map((v, bi) => (
                        <td key={bi} style={{ ...tdS, color: (v ?? 0) > 5 ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151', fontWeight: 600 }}>
                          {fmt(v, 2)}
                        </td>
                      ))}
                    </tr>
                  );
                })()}

                {/* Ranked scenarios */}
                {results.ranked.map((row, i) => {
                  const { scenario, score } = row;
                  const isBest = i === 0;
                  const currentMae = results.current?.score?.mae;
                  const maeVsCurrent = currentMae != null ? score.mae - currentMae : null;
                  return (
                    <tr
                      key={scenario.id}
                      style={{
                        borderBottom: '1px solid #fce7f3',
                        background: isBest ? '#fdf2f8' : undefined,
                      }}
                    >
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: isBest ? 700 : 400, color: isBest ? '#9d174d' : '#374151' }}>
                        {isBest ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `#${i + 1}`}
                      </td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 9, color: '#374151', maxWidth: 220, whiteSpace: 'normal' }}>
                        {scenario.label}
                      </td>
                      <td style={{ ...tdS, fontWeight: isBest ? 700 : 400, color: isBest ? '#9d174d' : '#374151' }}>
                        {fmt(score.mae, 3)}
                        {maeVsCurrent != null && (
                          <span style={{ marginLeft: 3, fontSize: 8, color: maeVsCurrent < -0.01 ? '#15803d' : maeVsCurrent > 0.01 ? '#dc2626' : '#6b7280' }}>
                            {maeVsCurrent < -0.01 ? `▼${fmt(Math.abs(maeVsCurrent), 2)}` : maeVsCurrent > 0.01 ? `▲${fmt(maeVsCurrent, 2)}` : '–'}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdS, color: (score.worst ?? 0) > 5 ? '#dc2626' : (score.worst ?? 0) > 3 ? '#b45309' : '#374151' }}>
                        {fmt(score.worst, 3)}
                      </td>
                      {score.bands.map((v, bi) => {
                        const curBand = results.current?.score?.bands[bi];
                        const improved = v != null && curBand != null && v < curBand - 0.01;
                        const worse = v != null && curBand != null && v > curBand + 0.01;
                        return (
                          <td key={bi} style={{
                            ...tdS,
                            color: improved ? '#15803d' : worse ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151',
                            fontWeight: improved || worse ? 700 : 400,
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
              ▼ = improved vs current · ▲ = worse vs current · ★ = current production settings (all family scales = 1.00)
            </div>
          </div>

          {/* ── Conclusion ── */}
          {conclusion && (
            <div style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 6,
              background: results.ranked[0]?.score.mae < (results.current?.score?.mae ?? 0) - 2.0 ? '#fef3c7'
                : results.ranked[0]?.score.mae < (results.current?.score?.mae ?? 0) - 0.5 ? '#fdf2f8'
                : '#f0fdf4',
              border: `1px solid ${results.ranked[0]?.score.mae < (results.current?.score?.mae ?? 0) - 2.0 ? '#fbbf24'
                : results.ranked[0]?.score.mae < (results.current?.score?.mae ?? 0) - 0.5 ? '#f9a8d4'
                : '#86efac'}`,
              fontSize: 10,
              fontFamily: 'monospace',
              color: results.ranked[0]?.score.mae < (results.current?.score?.mae ?? 0) - 2.0 ? '#92400e'
                : results.ranked[0]?.score.mae < (results.current?.score?.mae ?? 0) - 0.5 ? '#9d174d'
                : '#166534',
            }}>
              {conclusion}
            </div>
          )}
        </>
      )}
    </div>
  );
}