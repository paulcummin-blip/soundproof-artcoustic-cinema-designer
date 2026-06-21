// RewParityModalParticipationAudit.jsx
// Diagnostic-only: tests whether limiting which modes contribute to each SPL point
// (by count rank, bandwidth proximity, or frequency position) improves REW parity.
// Self-contained — no production engine changes, no project state writes.

import React, { useState, useCallback } from 'react';

// ── REW benchmark (shared definition, same values as all other panels) ─────────
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
// filter: (modesWithQ, f) → subset of modesWithQ to include for frequency f
const SCENARIOS = [
  {
    id: 1,
    label: '1. All modes (current)',
    desc: 'No filtering — all modes contribute at every frequency.',
    filter: (modes) => modes,
  },
  {
    id: 2,
    label: '2. Top 1 mode only (by coupling magnitude)',
    desc: 'At each frequency, include only the single mode with the highest |coupling × transfer|.',
    topN: 1,
  },
  {
    id: 3,
    label: '3. Top 3 modes only',
    desc: 'At each frequency, include only the 3 modes with highest |coupling × transfer|.',
    topN: 3,
  },
  {
    id: 4,
    label: '4. Top 5 modes only',
    desc: 'At each frequency, include only the 5 modes with highest |coupling × transfer|.',
    topN: 5,
  },
  {
    id: 5,
    label: '5. Within ±0.5 bandwidth',
    desc: 'Only modes where |f − f_mode| ≤ 0.5 × (f_mode / Q).',
    bwFactor: 0.5,
  },
  {
    id: 6,
    label: '6. Within ±1 bandwidth',
    desc: 'Only modes where |f − f_mode| ≤ 1 × (f_mode / Q).',
    bwFactor: 1.0,
  },
  {
    id: 7,
    label: '7. Within ±2 bandwidths',
    desc: 'Only modes where |f − f_mode| ≤ 2 × (f_mode / Q).',
    bwFactor: 2.0,
  },
  {
    id: 8,
    label: '8. Within ±3 bandwidths',
    desc: 'Only modes where |f − f_mode| ≤ 3 × (f_mode / Q).',
    bwFactor: 3.0,
  },
  {
    id: 9,
    label: '9. Only modes below eval frequency',
    desc: 'Only modes where f_mode < f (below the current evaluation frequency).',
    filter: (modes, f) => modes.filter(m => m.freq < f),
  },
  {
    id: 10,
    label: '10. Only modes above eval frequency',
    desc: 'Only modes where f_mode > f (above the current evaluation frequency).',
    filter: (modes, f) => modes.filter(m => m.freq > f),
  },
];

// ── Acoustic helpers (self-contained, mirrors existing sweep panels) ───────────

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

// Production resonator form: H = (rr − j·ri) / denom
function resonator(f, f0, q) {
  const r = f / Math.max(f0, 1e-6);
  const rr = 1 - r * r;
  const ri = r / Math.max(q, 1e-6);
  const d = rr * rr + ri * ri;
  return { re: rr / d, im: -ri / d };
}

// Compute coupling + transfer product magnitude — used for top-N ranking
function modeContribution(mode, f, sx, sy, sz, rx, ry, rz, W, L, H) {
  const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
  const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
  const coupling = sc * rc;
  const { re, im } = resonator(f, mode.freq, mode.q);
  const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
  const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
  const hoScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
  const gain = Math.abs(coupling) * orderWeight * hoScale;
  return { coupling, re, im, gain, magnitude: gain * Math.sqrt(re * re + im * im) };
}

// Run one scenario for the full frequency axis
function runScenario(scenario, W, L, H, sx, sy, sz, rx, ry, rz, modesWithQ, freqsHz) {
  const srcAmp = Math.pow(10, FLAT_SOURCE_DB / 20);

  return freqsHz.map(f => {
    // Direct path — constant across all scenarios
    const dist = Math.max(0.01, Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2));
    const directAmp = Math.pow(10, (FLAT_SOURCE_DB - 20 * Math.log10(dist)) / 20);
    const tof = -2 * Math.PI * f * dist / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    // Determine eligible modes for this frequency and scenario
    let eligible;

    if (scenario.topN != null) {
      // Rank all modes by contribution magnitude at this f, take top N
      const ranked = modesWithQ
        .map(m => ({ m, mag: modeContribution(m, f, sx, sy, sz, rx, ry, rz, W, L, H).magnitude }))
        .sort((a, b) => b.mag - a.mag)
        .slice(0, scenario.topN)
        .map(r => r.m);
      eligible = ranked;
    } else if (scenario.bwFactor != null) {
      eligible = modesWithQ.filter(m => {
        const bw = m.freq / Math.max(m.q, 1e-6);
        return Math.abs(m.freq - f) <= scenario.bwFactor * bw;
      });
    } else {
      eligible = scenario.filter(modesWithQ, f);
    }

    for (const mode of eligible) {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      const coupling = sc * rc;
      if (!Number.isFinite(coupling) || coupling === 0) continue;

      const { re: tRe, im: tIm } = resonator(f, mode.freq, mode.q);
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const hoScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;

      const gain = srcAmp * coupling * orderWeight * hoScale;
      sumRe += gain * tRe;
      sumIm += gain * tIm;
    }

    return 20 * Math.log10(Math.max(Math.sqrt(sumRe * sumRe + sumIm * sumIm), 1e-10));
  });
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
  let sumErr = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const v = interpolate(freqsHz, splDb, hz);
    if (!Number.isFinite(v)) continue;
    const err = Math.abs(v - db);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
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
  return { mae: sumErr / count, worstErr, worstHz, bands };
}

// ── Conclusion generator ───────────────────────────────────────────────────────

function buildConclusion(currentScore, ranked) {
  if (!ranked?.length || !currentScore) return null;
  const best = ranked[0];
  const delta = currentScore.mae - best.score.mae;
  const isCurrentBest = best.scenario.id === 1;

  if (isCurrentBest) {
    return 'Low modal participation sensitivity. The remaining parity error is not caused by distant or excess modal contributions at each SPL point. All modes participating is already optimal — look elsewhere (Q values, coupling geometry, resonator shape).';
  }
  if (delta >= 3.0) {
    return `Strong modal participation sensitivity detected. "${best.scenario.label}" improves MAE by ${delta.toFixed(2)} dB. The next likely production change is to limit how far off-frequency modal contributions are allowed at each SPL point — specifically restricting to ${best.scenario.bwFactor != null ? `within ±${best.scenario.bwFactor} modal bandwidths` : best.scenario.label.toLowerCase()}.`;
  }
  if (delta >= 1.0) {
    return `Moderate modal participation sensitivity (▼${delta.toFixed(2)} dB with "${best.scenario.label}"). Participation filtering partially explains the remaining error but is not the sole cause. Investigate alongside Q values and modal family scaling.`;
  }
  return `Low modal participation sensitivity (best improvement only ▼${delta.toFixed(2)} dB). Filtering modes by count or bandwidth proximity does not materially improve parity. The remaining error is driven by other factors.`;
}

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }

const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#f0fdf4', borderBottom: '2px solid #6ee7b7', color: '#065f46', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

// ── Component ──────────────────────────────────────────────────────────────────

export default function RewParityModalParticipationAudit({
  roomDims, seat, sub, surfaceAbsorption, activeSettings, onResult,
}) {
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

    // Build modes with Q — shared across all scenarios
    const rawModes = buildModes(W, L, H, 210);
    const modesWithQ = rawModes.map(m => {
      const baseQ = typeBaseQ(m.type, axialQOverride);
      const absQ = sabineQ(m.freq, W, L, H, sa);
      return { ...m, q: Math.max(1, Math.min(baseQ, absQ)) };
    });

    const freqsHz = buildFreqAxis(20, 200);
    const scored = [];

    for (const scenario of SCENARIOS) {
      const splDb = runScenario(scenario, W, L, H, sx, sy, sz, rx, ry, rz, modesWithQ, freqsHz);
      const score = scoreResponse(freqsHz, splDb);
      if (score) scored.push({ scenario, score });
      await new Promise(r => setTimeout(r, 0)); // yield per scenario
    }

    const current = scored.find(r => r.scenario.id === 1);
    const ranked = [...scored].sort((a, b) => a.score.mae - b.score.mae);
    const conclusion = buildConclusion(current?.score, ranked);

    const resultData = { current, ranked, conclusion };
    setResults(resultData);
    setRunning(false);

    // Notify Investigation Runner if callback provided
    if (onResult && current && ranked[0]) {
      const bestMae = ranked[0].score.mae;
      const improvement = current.score.mae - bestMae;
      onResult({
        bestMae,
        improvement,
        conclusion: conclusion || '—',
      });
    }
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun, onResult]);

  const current = results?.current;
  const ranked = results?.ranked ?? [];
  const conclusion = results?.conclusion ?? null;
  const best = ranked[0];
  const bestDelta = (current && best) ? current.score.mae - best.score.mae : null;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #6ee7b7', paddingTop: 10 }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#065f46', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Modal Participation Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {SCENARIOS.length} scenarios · diagnostic only · engine untouched
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>
        Tests whether limiting which modes contribute at each benchmark frequency improves parity.
        Scenarios include: top-N mode ranking, bandwidth proximity filtering, and below/above frequency filtering.
        All scenarios use identical room geometry, Q values, and resonator.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, and valid sub position to run.
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{
            height: 28, padding: '0 14px', borderRadius: 6,
            border: '1px solid #059669', background: running ? '#e5e7eb' : '#059669',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {running ? `Running… (${SCENARIOS.length} scenarios)` : results ? 'Re-run audit' : 'Run Modal Participation Audit'}
        </button>
      </div>

      {results && (
        <>
          {/* ── Compact summary strip ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              {
                label: 'Current MAE',
                value: fmt(current?.score?.mae, 3) + ' dB',
                color: '#065f46',
              },
              {
                label: 'Best MAE',
                value: fmt(best?.score?.mae, 3) + ' dB',
                note: best?.scenario?.label ?? '—',
                color: (bestDelta ?? 0) >= 1 ? '#15803d' : '#6b7280',
              },
              {
                label: 'Best improvement',
                value: bestDelta !== null ? (bestDelta > 0 ? `▼ ${fmt(bestDelta, 3)} dB` : `▲ ${fmt(Math.abs(bestDelta), 3)} dB`) : '—',
                color: (bestDelta ?? 0) >= 3 ? '#dc2626' : (bestDelta ?? 0) >= 1 ? '#b45309' : '#6b7280',
                note: (bestDelta ?? 0) >= 3 ? '⚠ significant' : (bestDelta ?? 0) >= 1 ? 'moderate' : 'low',
              },
            ].map(({ label, value, note, color }) => (
              <div key={label} style={{ background: '#f0fdf4', border: '1px solid #6ee7b7', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
                {note && <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace', marginTop: 1 }}>{note}</div>}
              </div>
            ))}
          </div>

          {/* ── Conclusion ── */}
          {conclusion && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 10,
              background: (bestDelta ?? 0) >= 3 ? '#fef3c7' : (bestDelta ?? 0) >= 1 ? '#f0fdf4' : '#f0fdf4',
              border: `1px solid ${(bestDelta ?? 0) >= 3 ? '#fbbf24' : '#6ee7b7'}`,
              fontSize: 10, fontFamily: 'monospace',
              color: (bestDelta ?? 0) >= 3 ? '#92400e' : '#065f46',
            }}>
              {conclusion}
            </div>
          )}

          {/* ── Results table ── */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Rank</th>
                  <th style={{ ...thS, textAlign: 'left', minWidth: 240 }}>Scenario</th>
                  <th style={thS}>Overall MAE</th>
                  <th style={thS}>Δ vs current</th>
                  <th style={thS}>Worst Err</th>
                  <th style={thS}>Worst Hz</th>
                  {BANDS.map(b => <th key={b.label} style={thS}>{b.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {ranked.map((row, i) => {
                  const { scenario, score } = row;
                  const isCurrent = scenario.id === 1;
                  const isOverallBest = i === 0;
                  const maeVsCurrent = current ? score.mae - current.score.mae : null;
                  const improved = maeVsCurrent !== null && maeVsCurrent < -0.01;
                  const worse    = maeVsCurrent !== null && maeVsCurrent > 0.01;

                  const bg = isCurrent ? '#fff7ed'
                    : isOverallBest && !isCurrent ? '#f0fdf4'
                    : i < 3 ? '#f9fffe'
                    : undefined;

                  const rankLabel = isCurrent ? '★ CURRENT'
                    : i === 0 ? '🥇 1'
                    : i === 1 ? '🥈 2'
                    : i === 2 ? '🥉 3'
                    : `#${i + 1}`;

                  return (
                    <tr key={scenario.id} style={{ borderBottom: '1px solid #a7f3d0', background: bg }}>
                      <td style={{
                        ...tdS, textAlign: 'left', fontWeight: isCurrent || isOverallBest ? 700 : 400,
                        color: isCurrent ? '#b45309' : isOverallBest ? '#065f46' : '#374151', fontSize: 9,
                      }}>{rankLabel}</td>
                      <td style={{
                        ...tdS, textAlign: 'left', fontSize: 9, maxWidth: 260, whiteSpace: 'normal',
                        color: isCurrent ? '#b45309' : '#374151',
                        fontWeight: isCurrent || isOverallBest ? 700 : 400,
                      }}>{scenario.label}</td>
                      <td style={{
                        ...tdS, fontWeight: isCurrent || isOverallBest ? 700 : 400,
                        color: isCurrent ? '#b45309' : improved ? '#15803d' : '#374151',
                      }}>
                        {fmt(score.mae, 3)}
                      </td>
                      <td style={{
                        ...tdS, fontWeight: 700,
                        color: isCurrent ? '#6b7280'
                          : improved ? '#15803d'
                          : worse ? '#dc2626'
                          : '#6b7280',
                      }}>
                        {isCurrent ? '—'
                          : maeVsCurrent !== null
                            ? (improved ? `▼${fmt(Math.abs(maeVsCurrent), 2)}` : worse ? `▲${fmt(maeVsCurrent, 2)}` : '~')
                            : '—'}
                      </td>
                      <td style={{ ...tdS, color: (score.worstErr ?? 0) > 5 ? '#dc2626' : (score.worstErr ?? 0) > 3 ? '#b45309' : '#374151' }}>
                        {fmt(score.worstErr, 3)}
                      </td>
                      <td style={{ ...tdS, color: '#374151' }}>
                        {score.worstHz != null ? `${score.worstHz} Hz` : '—'}
                      </td>
                      {score.bands.map((v, bi) => {
                        const curBand = current?.score?.bands[bi];
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
              ▼ = improved vs ★ CURRENT · ▲ = worse · ★ = all modes, current production behaviour
            </div>
          </div>

          {/* Scenario descriptions */}
          <div style={{ marginTop: 10, borderTop: '1px dashed #6ee7b7', paddingTop: 6 }}>
            <div style={{ fontWeight: 700, color: '#065f46', fontSize: 9, fontFamily: 'monospace', marginBottom: 4 }}>
              Scenario descriptions:
            </div>
            {SCENARIOS.map(s => (
              <div key={s.id} style={{ fontSize: 9, fontFamily: 'monospace', color: '#134e4a', marginBottom: 2 }}>
                <span style={{ fontWeight: 700 }}>{s.label}:</span> {s.desc}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}