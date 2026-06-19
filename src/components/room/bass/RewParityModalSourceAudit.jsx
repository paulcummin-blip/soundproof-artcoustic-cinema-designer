// RewParityModalSourceAudit.jsx
// Diagnostic-only: tests 10 modal source excitation/coupling approaches against REW benchmark.
// Self-contained — does NOT call rewBassEngine.js or modify any production state.
// Structure mirrors RewParityResonatorSweep.jsx and RewParityTangentialDominanceAudit.jsx.

import React, { useState, useCallback } from 'react';

// ── REW benchmark (same across all diagnostic panels) ─────────────────────────
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

// ── Scenario definitions ───────────────────────────────────────────────────────
// Each defines a couplingFn(mode, sx,sy,sz,rx,ry,rz,W,L,H) → scalar that replaces
// the standard (srcCos * rcvCos) coupling term in the modal sum.
// All other maths (resonator, Q, direct path, orderWeight) are held constant.
const SCENARIOS = [
  {
    id: 1,
    label: '1. Current — cos(src) × cos(rcv)',
    desc: 'Standard: product of source and receiver modal shape functions (current production path).',
    couplingFn: (mode, sx, sy, sz, rx, ry, rz, W, L, H) => {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      return sc * rc;
    },
  },
  {
    id: 2,
    label: '2. Listener-normalised — coupling / distToListener',
    desc: 'Divides coupling by the straight-line sub→seat distance, softening far-field modes.',
    couplingFn: (mode, sx, sy, sz, rx, ry, rz, W, L, H) => {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      const dist = Math.max(0.3, Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2));
      return (sc * rc) / dist;
    },
  },
  {
    id: 3,
    label: '3. Sub-position-only — cos(src)²',
    desc: 'Uses only the source-side modal shape squared — ignores seat coupling entirely.',
    couplingFn: (mode, sx, sy, sz, rx, ry, rz, W, L, H) => {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      return sc * sc;
    },
  },
  {
    id: 4,
    label: '4. Seat-position-only — cos(rcv)²',
    desc: 'Uses only the receiver-side modal shape squared — ignores sub excitation geometry.',
    couplingFn: (mode, sx, sy, sz, rx, ry, rz, W, L, H) => {
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      return rc * rc;
    },
  },
  {
    id: 5,
    label: '5. Absolute distance — 1/|sub→seat|',
    desc: 'Replaces coupling with inverse straight-line sub→seat distance only. No shape weighting.',
    couplingFn: (mode, sx, sy, sz, rx, ry, rz, W, L, H) => {
      const dist = Math.max(0.01, Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2));
      return 1 / dist;
    },
  },
  {
    id: 6,
    label: '6. Softened inverse-distance — 1/max(1,dist)',
    desc: 'Inverse-distance clamped so coupling ≤ 1 for sources closer than 1 m.',
    couplingFn: (mode, sx, sy, sz, rx, ry, rz, W, L, H) => {
      const dist = Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2);
      return 1 / Math.max(1, dist);
    },
  },
  {
    id: 7,
    label: '7. Shape-only — |cos(src) × cos(rcv)| (no dist)',
    desc: 'Absolute value of mode-shape product only. Removes sign; tests if coupling sign causes error.',
    couplingFn: (mode, sx, sy, sz, rx, ry, rz, W, L, H) => {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      return Math.abs(sc * rc);
    },
  },
  // Scenarios 8–10 use nearest-mode / bandwidth filtering — implemented via a wrapper flag.
  {
    id: 8,
    label: '8. Nearest-mode-only per benchmark frequency',
    desc: 'At each frequency, only the single nearest mode (by |f - f_mode|) contributes. Tests whether energy concentration in one mode per band matches REW.',
    nearestOnly: true,
    couplingFn: (mode, sx, sy, sz, rx, ry, rz, W, L, H) => {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      return sc * rc;
    },
  },
  {
    id: 9,
    label: '9. Bandwidth ×1 — exclude modes >1 BW from f',
    desc: 'At each frequency f, only include modes where |f - f_mode| ≤ f_mode/Q (one full bandwidth).',
    bwFactor: 1,
    couplingFn: (mode, sx, sy, sz, rx, ry, rz, W, L, H) => {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      return sc * rc;
    },
  },
  {
    id: 10,
    label: '10. Bandwidth ×2 — exclude modes >2 BW from f',
    desc: 'At each frequency f, only include modes where |f - f_mode| ≤ 2 × f_mode/Q (two bandwidths).',
    bwFactor: 2,
    couplingFn: (mode, sx, sy, sz, rx, ry, rz, W, L, H) => {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      return sc * rc;
    },
  },
];

// ── Acoustic helpers ───────────────────────────────────────────────────────────

function cosShape(n, pos, dim) {
  return n > 0 ? Math.cos(n * Math.PI * pos / Math.max(dim, 1e-6)) : 1;
}

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

// Resonator: current production form H = (rr - j·ri) / denom
function resonator(f, f0, Q) {
  const r = f / Math.max(f0, 1e-6);
  const rr = 1 - r * r;
  const ri = r / Math.max(Q, 1e-6);
  const d = rr * rr + ri * ri;
  return { re: rr / d, im: -ri / d };
}

// ── Scenario runner ────────────────────────────────────────────────────────────

function runScenario(W, L, H, sx, sy, sz, rx, ry, rz, modesWithQ, freqsHz, scenario) {
  const srcAmp = Math.pow(10, FLAT_SOURCE_DB / 20);

  const splDb = freqsHz.map(f => {
    // Direct path (constant across all scenarios)
    const dist = Math.max(0.01, Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2));
    const directAmp = Math.pow(10, (FLAT_SOURCE_DB - 20 * Math.log10(dist)) / 20);
    const tof = -2 * Math.PI * f * dist / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    // Determine which modes to include for this frequency + scenario
    let eligibleModes = modesWithQ;

    if (scenario.nearestOnly) {
      // Scenario 8: only the mode nearest in frequency to current f
      let nearest = null, nearestDist = Infinity;
      for (const mode of modesWithQ) {
        const d2 = Math.abs(mode.freq - f);
        if (d2 < nearestDist) { nearestDist = d2; nearest = mode; }
      }
      eligibleModes = nearest ? [nearest] : [];
    } else if (scenario.bwFactor != null) {
      // Scenarios 9 & 10: only modes within bwFactor × bandwidth of current f
      eligibleModes = modesWithQ.filter(mode => {
        const bw = mode.freq / Math.max(mode.q, 1e-6);
        return Math.abs(mode.freq - f) <= scenario.bwFactor * bw;
      });
    }

    for (const mode of eligibleModes) {
      const coupling = scenario.couplingFn(mode, sx, sy, sz, rx, ry, rz, W, L, H);
      if (!Number.isFinite(coupling) || coupling === 0) continue;

      const { re: tRe, im: tIm } = resonator(f, mode.freq, mode.q);

      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const hoAxialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;

      const gain = srcAmp * coupling * orderWeight * hoAxialScale;
      sumRe += gain * tRe;
      sumIm += gain * tIm;
    }

    return 20 * Math.log10(Math.max(Math.sqrt(sumRe * sumRe + sumIm * sumIm), 1e-10));
  });

  return splDb;
}

// ── Scoring ────────────────────────────────────────────────────────────────────

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

// ── Conclusion generator ───────────────────────────────────────────────────────

function buildConclusion(current, ranked) {
  if (!ranked?.length || !current) return null;
  const best = ranked[0];
  const delta = current.score.mae - best.score.mae;
  const isCurrentBest = best.scenario.id === 1;

  if (isCurrentBest) {
    return '✓ Current source coupling is already optimal across all tested approaches. Modal excitation is not the primary remaining parity driver — look to Q values, room geometry, or boundary reflections.';
  }
  if (delta >= 3.0) {
    return `⚠ STRONG signal: "${best.scenario.label}" reduces MAE by ${delta.toFixed(2)} dB. Modal source excitation coupling is a primary remaining parity driver. The current coupling formulation materially over/under-excites modes at the seat position.`;
  }
  if (delta >= 1.0) {
    return `~ Moderate coupling sensitivity (▼${delta.toFixed(2)} dB with "${best.scenario.label}"). Source coupling partially explains the remaining error but is not the sole cause. Investigate alongside Q and modal phase.`;
  }
  return `Low coupling sensitivity (▼${delta.toFixed(2)} dB). Modal source coupling is unlikely to be the primary remaining parity driver at the current room/seat/sub geometry.`;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#eff6ff', borderBottom: '2px solid #93c5fd', color: '#1e3a8a', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

// ── Component ──────────────────────────────────────────────────────────────────

export default function RewParityModalSourceAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
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

    const W = Number(roomDims.widthM);
    const L = Number(roomDims.lengthM);
    const H = Number(roomDims.heightM);
    const sx = Number(sub.x);
    const sy = Number(sub.y);
    const sz = Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35;
    const rx = Number(seat.x);
    const ry = Number(seat.y);
    const rz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
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
      await new Promise(r => setTimeout(r, 0)); // yield to UI per scenario
    }

    const current = scored.find(r => r.scenario.id === 1);
    const ranked = [...scored].sort((a, b) => a.score.mae - b.score.mae);

    setResults({ current, ranked });
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  const conclusion = results ? buildConclusion(results.current, results.ranked) : null;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #93c5fd', paddingTop: 10 }}>
      {/* ── Header ── */}
      <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Modal Source Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          10 coupling scenarios · diagnostic only · engine untouched
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>
        Tests whether the remaining REW parity error is caused by modal source excitation/coupling formulation.
        All scenarios use identical room modes, Q values, resonator shape, and direct path. Only the coupling
        term (how sub position and seat position weight each mode's contribution) varies.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, and valid sub position to run audit.
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{
            height: 28, padding: '0 14px', borderRadius: 6,
            border: '1px solid #1d4ed8', background: running ? '#e5e7eb' : '#1d4ed8',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {running ? `Running… (${SCENARIOS.length} scenarios)` : results ? 'Re-run audit' : 'Run Modal Source Audit'}
        </button>
      </div>

      {running && (
        <div style={{ fontSize: 10, color: '#1e3a8a', fontFamily: 'monospace', marginBottom: 6 }}>
          Running {SCENARIOS.length} source coupling scenarios…
        </div>
      )}

      {results && (
        <>
          {/* ── Results table ── */}
          <div style={{ overflowX: 'auto', marginTop: 4 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Rank</th>
                  <th style={{ ...thS, textAlign: 'left', minWidth: 220 }}>Scenario</th>
                  <th style={thS}>Overall MAE</th>
                  <th style={thS}>Worst Err</th>
                  {BANDS.map(b => <th key={b.label} style={thS}>{b.label} MAE</th>)}
                </tr>
              </thead>
              <tbody>
                {results.ranked.map((row, i) => {
                  const { scenario, score } = row;
                  const isCurrent = scenario.id === 1;
                  const isOverallBest = i === 0;
                  const currentMae = results.current?.score?.mae;
                  const maeVsCurrent = currentMae != null ? score.mae - currentMae : null;
                  const improved = maeVsCurrent != null && maeVsCurrent < -0.01;
                  const worse    = maeVsCurrent != null && maeVsCurrent > 0.01;

                  const bg = isCurrent ? '#fff1f5'
                    : isOverallBest ? '#eff6ff'
                    : i < 3 ? '#f0f9ff'
                    : undefined;

                  const rankLabel = isCurrent ? '★ CURRENT'
                    : i === 0 ? '🥇 1'
                    : i === 1 ? '🥈 2'
                    : i === 2 ? '🥉 3'
                    : `#${i + 1}`;

                  return (
                    <tr key={scenario.id} style={{ borderBottom: '1px solid #bfdbfe', background: bg }}>
                      <td style={{
                        ...tdS, textAlign: 'left',
                        fontWeight: isCurrent || isOverallBest ? 700 : 400,
                        color: isCurrent ? '#9d174d' : isOverallBest ? '#1e3a8a' : '#374151',
                        fontSize: 9,
                      }}>
                        {rankLabel}
                      </td>
                      <td style={{
                        ...tdS, textAlign: 'left', fontSize: 9,
                        maxWidth: 240, whiteSpace: 'normal',
                        color: isCurrent ? '#9d174d' : '#374151',
                        fontWeight: isCurrent || isOverallBest ? 700 : 400,
                      }}>
                        {scenario.label}
                      </td>
                      <td style={{
                        ...tdS,
                        fontWeight: isCurrent || isOverallBest ? 700 : 400,
                        color: isCurrent ? '#9d174d' : improved ? '#15803d' : '#374151',
                      }}>
                        {fmt(score.mae, 3)}
                        {!isCurrent && maeVsCurrent != null && (
                          <span style={{
                            marginLeft: 3, fontSize: 8,
                            color: improved ? '#15803d' : worse ? '#dc2626' : '#6b7280',
                          }}>
                            {improved ? `▼${fmt(Math.abs(maeVsCurrent), 2)}`
                              : worse ? `▲${fmt(maeVsCurrent, 2)}`
                              : '–'}
                          </span>
                        )}
                      </td>
                      <td style={{
                        ...tdS,
                        color: (score.worst ?? 0) > 5 ? '#dc2626' : (score.worst ?? 0) > 3 ? '#b45309' : '#374151',
                        fontWeight: isCurrent ? 700 : 400,
                      }}>
                        {fmt(score.worst, 3)}
                      </td>
                      {score.bands.map((v, bi) => {
                        const curBand = results.current?.score?.bands[bi];
                        const bandImproved = !isCurrent && v != null && curBand != null && v < curBand - 0.01;
                        const bandWorse    = !isCurrent && v != null && curBand != null && v > curBand + 0.01;
                        return (
                          <td key={bi} style={{
                            ...tdS,
                            color: bandImproved ? '#15803d' : bandWorse ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151',
                            fontWeight: isCurrent || bandImproved || bandWorse ? 700 : 400,
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
              ▼ = improved vs ★ CURRENT · ▲ = worse · ★ = current production coupling (scenario 1)
            </div>
          </div>

          {/* ── Scenario descriptions ── */}
          <div style={{ marginTop: 10, borderTop: '1px dashed #93c5fd', paddingTop: 6 }}>
            <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 9, fontFamily: 'monospace', marginBottom: 4 }}>
              Scenario descriptions:
            </div>
            {SCENARIOS.map(s => (
              <div key={s.id} style={{ fontSize: 9, fontFamily: 'monospace', color: '#334155', marginBottom: 2 }}>
                <span style={{ fontWeight: 700 }}>{s.label}:</span> {s.desc}
              </div>
            ))}
          </div>

          {/* ── Conclusion ── */}
          {conclusion && (() => {
            const bestDelta = results.current?.score?.mae - results.ranked[0]?.score?.mae;
            const bg = bestDelta >= 3.0 ? '#fef3c7'
              : bestDelta >= 1.0 ? '#eff6ff'
              : '#f0fdf4';
            const border = bestDelta >= 3.0 ? '#fbbf24'
              : bestDelta >= 1.0 ? '#93c5fd'
              : '#86efac';
            const color = bestDelta >= 3.0 ? '#92400e'
              : bestDelta >= 1.0 ? '#1e3a8a'
              : '#166534';
            return (
              <div style={{
                marginTop: 12, padding: '8px 12px', borderRadius: 6,
                background: bg, border: `1px solid ${border}`,
                fontSize: 10, fontFamily: 'monospace', color,
              }}>
                {conclusion}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}