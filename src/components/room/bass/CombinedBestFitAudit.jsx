/**
 * CombinedBestFitAudit — Diagnostic only. Does not affect live graph or production defaults.
 *
 * Tests 5 specific combinations to determine the smallest set of changes
 * that produces the largest REW parity improvement.
 *
 * All combos: Direct + Modes, Reflections OFF, Flat REW reference, current Q settings.
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  modeShapeValueLocal,
  resonantTransfer,
  estimateModeQLocal,
} from '@/components/room/bass/core/modalCalculations';

// ── REW benchmark (matches RewBenchmarkComparisonTable exactly) ───────────────
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

// ── Combination definitions ───────────────────────────────────────────────────
const COMBOS = [
  {
    id: 'A',
    label: 'A — Current production',
    distanceBlend: 0.55,
    coherenceStrategy: 'all_coherent',
    highOrderSuppressionK: 0,
    color: '#78716c',
  },
  {
    id: 'B',
    label: 'B — Source improved only',
    distanceBlend: 0.75,
    coherenceStrategy: 'all_coherent',
    highOrderSuppressionK: 0,
    color: '#3b82f6',
  },
  {
    id: 'C',
    label: 'C — Coherence improved only',
    distanceBlend: 0.55,
    coherenceStrategy: 'family_coherent_rss',
    highOrderSuppressionK: 0,
    color: '#8b5cf6',
  },
  {
    id: 'D',
    label: 'D — Source + coherence',
    distanceBlend: 0.75,
    coherenceStrategy: 'family_coherent_rss',
    highOrderSuppressionK: 0,
    color: '#f59e0b',
  },
  {
    id: 'E',
    label: 'E — Source + coherence + HO suppression',
    distanceBlend: 0.75,
    coherenceStrategy: 'family_coherent_rss',
    highOrderSuppressionK: 0.5,
    color: '#10b981',
  },
];

// ── Pure helpers ──────────────────────────────────────────────────────────────
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
function buildModes(roomDims, surfaceAbsorption, axialQ) {
  const raw = computeRoomModesLocal({
    widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM,
    fMax: 220, c: SPEED_OF_SOUND,
  });
  return raw.map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    // Use axialQ for axial modes, slightly lower for tangential/oblique
    const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? (axialQ * 0.85) : (axialQ * 0.65);
    const absorptionQ = estimateModeQLocal({
      roomDims, surfaceAbsorption: surfaceAbsorption ?? {}, f0: mode.freq,
    });
    const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const family = activeAxes === 1 ? 'axial' : activeAxes === 2 ? 'tangential' : 'oblique';
    return { ...mode, order, family, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
  });
}

/**
 * Run one combination.
 *
 * coherenceStrategy:
 *   'all_coherent'       — coherent complex sum across ALL modes
 *   'family_coherent_rss' — coherent within each family (axial/tangential/oblique), then RSS across families
 *
 * highOrderSuppressionK:
 *   0 = no suppression (weight=1 for all orders)
 *   >0 = weight = 1 / (effectiveOrder ^ k)
 */
function runCombo(combo, modes, subPos, seatPos, roomDims, axialQ) {
  const { distanceBlend, coherenceStrategy, highOrderSuppressionK } = combo;

  const distM = Math.max(0.01, Math.sqrt(
    Math.pow(subPos.x - seatPos.x, 2) +
    Math.pow(subPos.y - seatPos.y, 2) +
    Math.pow(subPos.z - seatPos.z, 2)
  ));

  const directAmpBase = db2mag(94 - 20 * Math.log10(distM));
  // Distance-blended modal gain: blend=0 → existing 1m ref; blend=1 → full distance loss
  const fullLossDb = -20 * Math.log10(distM / 1);
  const blendedLossDb = fullLossDb * distanceBlend;
  const modalGainScalar = db2mag(blendedLossDb - 20 * Math.log10(distM));

  // Pre-compute per-mode coupling and gain
  const modeData = modes.map(mode => {
    const srcPsi = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z, roomDims);
    const rcvPsi = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, roomDims);
    const coupling = srcPsi * rcvPsi;
    const effectiveOrder = Math.max(1, mode.order);
    const kWeight = highOrderSuppressionK > 0 ? 1 / Math.pow(effectiveOrder, highOrderSuppressionK) : 1.0;
    // Production axial correction for order >= 2
    const axialScale = (mode.family === 'axial' && mode.order >= 2) ? 0.50 : 1.0;
    const orderWeight = mode.order >= 2 ? 0.50 : 1.0;
    const gain = db2mag(94) * modalGainScalar * coupling * orderWeight * axialScale * kWeight;
    return { mode, gain };
  });

  return FREQ_GRID.map(hz => {
    const phase = -2 * Math.PI * hz * (distM / SPEED_OF_SOUND);
    const dRe = directAmpBase * Math.cos(phase);
    const dIm = directAmpBase * Math.sin(phase);

    let totalRe, totalIm;

    if (coherenceStrategy === 'all_coherent') {
      // All modes sum coherently
      let sumRe = dRe, sumIm = dIm;
      for (const { mode, gain } of modeData) {
        const { re: tr, im: ti } = resonantTransfer(hz, mode.freq, mode.qValue);
        sumRe += gain * tr;
        sumIm += gain * ti;
      }
      totalRe = sumRe;
      totalIm = sumIm;

    } else if (coherenceStrategy === 'family_coherent_rss') {
      // Coherent within each family, then RSS across families + direct
      const families = ['axial', 'tangential', 'oblique'];
      let rssEnergy = dRe * dRe + dIm * dIm; // direct as its own coherent group
      for (const fam of families) {
        let famRe = 0, famIm = 0;
        for (const { mode, gain } of modeData) {
          if (mode.family !== fam) continue;
          const { re: tr, im: ti } = resonantTransfer(hz, mode.freq, mode.qValue);
          famRe += gain * tr;
          famIm += gain * ti;
        }
        rssEnergy += famRe * famRe + famIm * famIm;
      }
      // Return as magnitude only (RSS doesn't preserve complex phase)
      return { hz, db: mag2db(Math.sqrt(rssEnergy)) };
    }

    return { hz, db: mag2db(Math.sqrt(totalRe * totalRe + totalIm * totalIm)) };
  });
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function scoreCombo(series) {
  let sumErr = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db: ref } of REW_BENCHMARK) {
    const sim = interpSeries(series, hz);
    if (sim === null || !Number.isFinite(sim)) continue;
    const err = Math.abs(sim - ref);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  const signedErrAt = (hz) => {
    const sim = interpSeries(series, hz);
    const ref = interpBenchmark(hz);
    return sim !== null ? sim - ref : null;
  };
  return {
    mae: count > 0 ? sumErr / count : null,
    worstErr: worstErr,
    worstHz,
    e70: signedErrAt(70),
    e80: signedErrAt(80),
    e85: signedErrAt(85),
    e90: signedErrAt(90),
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH = {
  padding: '3px 8px', fontSize: 9, fontWeight: 700, ...MONO,
  background: '#0c0a09', color: '#d6d3d1',
  borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right',
};
const TD = {
  padding: '3px 8px', fontSize: 9, ...MONO, textAlign: 'right',
  borderBottom: '1px solid #1c1917',
};

function errColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a <= 1)  return '#4ade80';
  if (a <= 3)  return '#fbbf24';
  if (a <= 6)  return '#fb923c';
  return '#f87171';
}

const fmt  = (v, d = 3) => Number.isFinite(v) ? v.toFixed(d) : '—';
const fmtΔ = (v) => !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2);
const fmtImp = (v) => {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) < 0.005) return '—';
  return (v > 0 ? '▼ ' : '▲ ') + Math.abs(v).toFixed(3);
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function CombinedBestFitAudit({ roomDims, subs, seat, surfaceAbsorption, axialQ = 4.0 }) {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState(null); // [{combo, score, rank}]

  const currentSub = subs?.[0] ?? null;
  const hasRoom    = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const canRun     = hasRoom && seat?.x != null && currentSub?.x != null;

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);
    setTimeout(() => {
      try {
        const subPos  = { x: currentSub.x, y: currentSub.y, z: currentSub.z ?? 0.35 };
        const seatPos = { x: seat.x,        y: seat.y,        z: seat.z         ?? 1.2  };
        const allModes = buildModes(roomDims, surfaceAbsorption, axialQ);

        const scored = COMBOS.map(combo => {
          const series = runCombo(combo, allModes, subPos, seatPos, roomDims, axialQ);
          const score  = scoreCombo(series);
          return { combo, score };
        });

        // Rank by MAE ascending (best first)
        const ranked = [...scored].sort((a, b) => (a.score.mae ?? Infinity) - (b.score.mae ?? Infinity));
        ranked.forEach((r, i) => { r.rank = i + 1; });

        // Attach MAE improvement vs A for each row
        const baselineA = scored.find(r => r.combo.id === 'A');
        const baseMae = baselineA?.score?.mae ?? null;
        scored.forEach(r => {
          r.maeImpVsA = (baseMae != null && r.score.mae != null) ? baseMae - r.score.mae : null;
        });

        setResults(scored);
      } catch (e) {
        console.error('[CombinedBestFitAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [roomDims, seat, currentSub, surfaceAbsorption, axialQ, canRun]);

  // Derived: ranked order for display
  const rankedResults = results
    ? [...results].sort((a, b) => (a.score.mae ?? Infinity) - (b.score.mae ?? Infinity))
    : null;

  const rankOf = (id) => rankedResults?.findIndex(r => r.combo.id === id) + 1;

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Combined Best-Fit Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Fixed: Direct+Modes · Reflections OFF · Flat REW reference · Q={axialQ.toFixed(1)}<br />
        Tests 5 targeted combinations to isolate the highest-value parity improvements.
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
        {running ? 'Running 5 combinations…' : results ? 'Re-run audit' : 'Run Combined Best-Fit Audit'}
      </button>

      {/* ── Combination legend ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {COMBOS.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, ...MONO }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: c.color }} />
            <span style={{ color: '#a8a29e' }}>{c.label}</span>
          </div>
        ))}
      </div>

      {rankedResults && (
        <>
          {/* ── Main ranked results table ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', ...MONO, marginBottom: 4 }}>
            Results — ranked best → worst by MAE
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>Rank</th>
                  <th style={{ ...TH, textAlign: 'left' }}>Combination</th>
                  <th style={{ ...TH, color: '#fbbf24' }}>MAE</th>
                  <th style={{ ...TH, color: '#86efac' }}>vs A</th>
                  <th style={{ ...TH, color: '#fb923c' }}>Worst err</th>
                  <th style={TH}>Worst Hz</th>
                  <th style={{ ...TH, color: '#93c5fd' }}>70 Hz Δ</th>
                  <th style={{ ...TH, color: '#6ee7b7' }}>80 Hz Δ</th>
                  <th style={{ ...TH, color: '#a78bfa' }}>85 Hz Δ</th>
                  <th style={{ ...TH, color: '#fda4af' }}>90 Hz Δ</th>
                </tr>
              </thead>
              <tbody>
                {rankedResults.map((r, i) => {
                  const isA    = r.combo.id === 'A';
                  const isBest = i === 0;
                  const bg = isBest ? '#172554' : isA ? '#1c1917' : undefined;
                  const impColor = (r.maeImpVsA ?? 0) > 0.05 ? '#4ade80'
                    : (r.maeImpVsA ?? 0) < -0.05 ? '#f87171'
                    : '#78716c';
                  return (
                    <tr key={r.combo.id} style={{ background: bg }}>
                      <td style={{ ...TD, textAlign: 'left', color: isBest ? '#60a5fa' : '#78716c', fontWeight: isBest ? 700 : 400 }}>
                        {isBest ? '★ 1' : `#${i + 1}`}
                      </td>
                      <td style={{ ...TD, textAlign: 'left' }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 1, background: r.combo.color, marginRight: 5, verticalAlign: 'middle' }} />
                        <span style={{ color: isBest ? '#d6d3d1' : '#a8a29e', fontWeight: isBest ? 700 : 400 }}>
                          {r.combo.label}
                        </span>
                        {isA && <span style={{ color: '#44403c', fontSize: 8, marginLeft: 6 }}>baseline</span>}
                      </td>
                      <td style={{ ...TD, fontWeight: isBest ? 700 : 400, color: isBest ? '#60a5fa' : errColor(r.score.mae) }}>
                        {fmt(r.score.mae)}
                      </td>
                      <td style={{ ...TD, color: isA ? '#44403c' : impColor, fontWeight: !isA && (r.maeImpVsA ?? 0) > 0.05 ? 700 : 400 }}>
                        {isA ? '—' : fmtImp(r.maeImpVsA)}
                      </td>
                      <td style={{ ...TD, color: errColor(r.score.worstErr) }}>{fmt(r.score.worstErr)}</td>
                      <td style={{ ...TD, color: '#6b7280' }}>{r.score.worstHz ?? '—'}</td>
                      <td style={{ ...TD, color: errColor(r.score.e70) }}>{fmtΔ(r.score.e70)}</td>
                      <td style={{ ...TD, color: errColor(r.score.e80) }}>{fmtΔ(r.score.e80)}</td>
                      <td style={{ ...TD, color: errColor(r.score.e85) }}>{fmtΔ(r.score.e85)}</td>
                      <td style={{ ...TD, color: errColor(r.score.e90) }}>{fmtΔ(r.score.e90)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Improvement summary ── */}
          {(() => {
            const baselineA = results.find(r => r.combo.id === 'A');
            const best = rankedResults[0];
            if (!baselineA || !best || best.combo.id === 'A') return null;
            const improvement = (baselineA.score.mae ?? 0) - (best.score.mae ?? 0);
            return (
              <div style={{ fontSize: 9, ...MONO, padding: '7px 10px', background: '#1c1917', borderRadius: 4, borderLeft: '3px solid #60a5fa', color: '#93c5fd', lineHeight: 1.9, marginBottom: 8 }}>
                ▶ Best combination: <strong style={{ color: '#d6d3d1' }}>{best.combo.label}</strong><br />
                ▶ MAE improvement vs A: <strong style={{ color: '#4ade80' }}>{improvement.toFixed(3)} dB</strong><br />
                ▶ Conclusion: {
                  improvement < 0.1
                    ? 'Minimal improvement across all combinations — parity driver is elsewhere (modal Q, direct path, or engine architecture).'
                    : improvement < 0.5
                    ? 'Small improvement. Primary parity driver is partially addressed but not dominant.'
                    : `Meaningful improvement (${improvement.toFixed(3)} dB). The changes in ${best.combo.label} directly address a primary parity driver.`
                }
              </div>
            );
          })()}

          {/* ── Combination parameter reference ── */}
          <div style={{ fontSize: 9, color: '#44403c', ...MONO, marginTop: 4, lineHeight: 1.8 }}>
            A: blend=0.55 · all coherent · k=0 &nbsp;|&nbsp;
            B: blend=0.75 · all coherent · k=0 &nbsp;|&nbsp;
            C: blend=0.55 · family RSS · k=0 &nbsp;|&nbsp;
            D: blend=0.75 · family RSS · k=0 &nbsp;|&nbsp;
            E: blend=0.75 · family RSS · k=0.5
            <br />
            Δ colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span>
          </div>
        </>
      )}
    </div>
  );
}