/**
 * GlobalEnergyCalibrationAudit — Diagnostic only.
 * Does NOT affect live graph or production defaults.
 *
 * Determines whether parity improvement is caused by:
 *   A) Global energy calibration error
 *   B) Direct-path under-scaling
 *   C) Modal-path under-scaling
 *   D) Reference-pressure / SPL conversion offset
 *
 * Fixed: Direct+Modes, Reflections OFF, Flat REW reference, current production settings.
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
const GAIN_STEPS = [0.50, 0.75, 1.00, 1.25, 1.50, 2.00];

const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 }, { hz: 25,  db: 93.6 }, { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 }, { hz: 50,  db: 91.8 }, { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 }, { hz: 70,  db: 86.8 }, { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 }, { hz: 100, db: 98.3 }, { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 }, { hz: 180, db: 99.3 }, { hz: 200, db: 99.5 },
];

const FREQ_GRID = [];
for (let f = 20; f <= 200; f += (f < 100 ? 2 : 5)) FREQ_GRID.push(f);

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
    const rawQ = Math.max(1, Math.min(baseQ, absorptionQ));
    const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const family = activeAxes === 1 ? 'axial' : activeAxes === 2 ? 'tangential' : 'oblique';
    return { ...mode, order, family, qValue: Math.max(0.5, rawQ) };
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
  return { mae: count > 0 ? sumErr / count : null, worstErr, worstHz };
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH = {
  padding: '3px 8px', fontSize: 9, fontWeight: 700, ...MONO,
  background: '#0c0a09', color: '#d6d3d1',
  borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right',
};
const TD = { padding: '3px 8px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
const fmt = (v, d = 3) => Number.isFinite(v) ? v.toFixed(d) : '—';

function maeColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  if (v <= 2) return '#4ade80';
  if (v <= 4) return '#fbbf24';
  if (v <= 7) return '#fb923c';
  return '#f87171';
}

function improvColor(imp) {
  if (!Number.isFinite(imp)) return '#6b7280';
  if (imp > 1) return '#4ade80';
  if (imp > 0.1) return '#86efac';
  if (imp < -0.1) return '#f87171';
  return '#78716c';
}

// ── Sweep table sub-component ─────────────────────────────────────────────────
function SweepTable({ label, color, rows, prodMae }) {
  const best = rows.reduce((a, b) => (a.mae < b.mae ? a : b), rows[0]);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, ...MONO, marginBottom: 4 }}>
        {label}
        <span style={{ fontWeight: 400, color: '#78716c', marginLeft: 10, fontSize: 9 }}>
          best ×{best.scale.toFixed(2)} → MAE {fmt(best.mae)} dB
          {Number.isFinite(prodMae) && ` (Δ ${(prodMae - best.mae) >= 0 ? '▼' : '▲'}${Math.abs(prodMae - best.mae).toFixed(3)} dB vs prod)`}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: 'left' }}>Scale</th>
              <th style={{ ...TH, color: '#fbbf24' }}>MAE (dB)</th>
              <th style={{ ...TH, color: '#60a5fa' }}>vs prod (dB)</th>
              <th style={{ ...TH, color: '#fb923c' }}>Worst err</th>
              <th style={TH}>Worst Hz</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const imp = Number.isFinite(prodMae) ? prodMae - row.mae : null;
              const isBest = row.scale === best.scale;
              const isProd = row.scale === 1.00;
              return (
                <tr key={i} style={{
                  background: isBest ? '#172554' : isProd ? '#1c2a1c' : undefined,
                  borderBottom: '1px solid #1c1917',
                }}>
                  <td style={{ ...TD, textAlign: 'left', color: isBest ? '#60a5fa' : isProd ? '#4ade80' : '#78716c', fontWeight: isBest || isProd ? 700 : 400 }}>
                    ×{row.scale.toFixed(2)}{isBest ? ' ★' : ''}{isProd ? ' (prod)' : ''}
                  </td>
                  <td style={{ ...TD, color: maeColor(row.mae), fontWeight: isBest ? 700 : 400 }}>{fmt(row.mae)}</td>
                  <td style={{ ...TD, color: improvColor(imp), fontWeight: isBest ? 700 : 400 }}>
                    {imp != null ? ((imp >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(imp))) : '—'}
                  </td>
                  <td style={{ ...TD, color: maeColor(row.worstErr) }}>{fmt(row.worstErr)}</td>
                  <td style={{ ...TD, color: '#6b7280' }}>{row.worstHz ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GlobalEnergyCalibrationAudit({
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
        const subPos  = { x: currentSub.x, y: currentSub.y, z: currentSub.z ?? 0.35 };
        const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
        const modes   = buildModes(roomDims, surfaceAbsorption, axialQ);

        // ── Sweep all three cases ─────────────────────────────────────────────
        const globalRows = GAIN_STEPS.map(scale => {
          const series = runSim(modes, subPos, seatPos, roomDims, distanceBlend, scale, scale);
          return { scale, ...scoreSeries(series) };
        });

        const directRows = GAIN_STEPS.map(scale => {
          const series = runSim(modes, subPos, seatPos, roomDims, distanceBlend, scale, 1.00);
          return { scale, ...scoreSeries(series) };
        });

        const modalRows = GAIN_STEPS.map(scale => {
          const series = runSim(modes, subPos, seatPos, roomDims, distanceBlend, 1.00, scale);
          return { scale, ...scoreSeries(series) };
        });

        // Production baseline (scale = 1.0 in all)
        const prodRow = globalRows.find(r => r.scale === 1.00);
        const prodMae = prodRow?.mae ?? null;

        const bestGlobal = globalRows.reduce((a, b) => (a.mae < b.mae ? a : b), globalRows[0]);
        const bestDirect = directRows.reduce((a, b) => (a.mae < b.mae ? a : b), directRows[0]);
        const bestModal  = modalRows.reduce((a, b) => (a.mae < b.mae ? a : b), modalRows[0]);

        const impGlobal = Number.isFinite(prodMae) ? prodMae - bestGlobal.mae : null;
        const impDirect = Number.isFinite(prodMae) ? prodMae - bestDirect.mae : null;
        const impModal  = Number.isFinite(prodMae) ? prodMae - bestModal.mae  : null;

        // ── Interpretation ────────────────────────────────────────────────────
        const interpretation = (() => {
          if (!Number.isFinite(impGlobal) || !Number.isFinite(impDirect) || !Number.isFinite(impModal)) return null;
          const sumIndividual = impDirect + impModal;
          const globalDom = impGlobal > Math.max(impDirect, impModal) * 1.5;
          const directDom = impDirect > impModal * 1.8 && impDirect > impGlobal * 0.7;
          const modalDom  = impModal  > impDirect * 1.8 && impModal  > impGlobal * 0.7;
          const interactionOnly = impGlobal > (impDirect + impModal) * 1.3 && !globalDom;

          if (globalDom || Math.abs(impGlobal - sumIndividual) < 0.3 * impGlobal) {
            return { text: 'Likely overall energy calibration issue — global gain adjustment explains the parity gap without needing independent path tuning.', color: '#f87171', type: 'global' };
          }
          if (directDom) {
            return { text: 'Direct-field implementation is the primary parity driver — direct-path amplitude is under-scaled relative to REW.', color: '#93c5fd', type: 'direct' };
          }
          if (modalDom) {
            return { text: 'Modal amplitude implementation is the primary parity driver — modal-path amplitude is under-scaled relative to REW.', color: '#86efac', type: 'modal' };
          }
          if (interactionOnly) {
            return { text: 'Interaction between direct and modal fields is the primary parity driver — neither path alone closes the gap; the phase relationship between them is the root cause.', color: '#fbbf24', type: 'interaction' };
          }
          return { text: 'Mixed influence — no single path dominates. Parity gap is multi-factor.', color: '#a78bfa', type: 'mixed' };
        })();

        // ── Rank by improvement ───────────────────────────────────────────────
        const ranked = [
          { label: 'Global gain', imp: impGlobal, bestMae: bestGlobal.mae, bestScale: bestGlobal.scale, color: '#fbbf24' },
          { label: 'Direct gain', imp: impDirect, bestMae: bestDirect.mae, bestScale: bestDirect.scale, color: '#93c5fd' },
          { label: 'Modal gain',  imp: impModal,  bestMae: bestModal.mae,  bestScale: bestModal.scale,  color: '#86efac' },
        ].sort((a, b) => (b.imp ?? 0) - (a.imp ?? 0));

        setResult({ globalRows, directRows, modalRows, prodMae, interpretation, ranked, impGlobal, impDirect, impModal });
      } catch (e) {
        console.error('[GlobalEnergyCalibrationAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [roomDims, seat, currentSub, surfaceAbsorption, axialQ, distanceBlend, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* ── Header ── */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Global Energy Calibration Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Fixed: Direct+Modes · Reflections OFF · Flat REW ref · blend={distanceBlend.toFixed(2)} · Q base={axialQ.toFixed(1)}<br />
        Cases: Global gain sweep (×both) · Direct-only gain sweep · Modal-only gain sweep — steps: {GAIN_STEPS.join(', ')}
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
        {running ? 'Running…' : result ? 'Re-run' : 'Run Global Energy Calibration Audit'}
      </button>

      {result && (
        <>
          {/* ── Production baseline ── */}
          <div style={{ fontSize: 9, ...MONO, padding: '6px 10px', background: '#1c1917', borderRadius: 4, borderLeft: '3px solid #78716c', color: '#a8a29e', marginBottom: 10, lineHeight: 1.8 }}>
            <strong style={{ color: '#d6d3d1' }}>Production baseline (all scales ×1.0)</strong><br />
            MAE: <strong style={{ color: maeColor(result.prodMae) }}>{fmt(result.prodMae)}</strong> dB
          </div>

          {/* ── Interpretation ── */}
          {result.interpretation && (
            <div style={{ marginBottom: 12, fontSize: 9, ...MONO, padding: '8px 10px', background: '#1c1917', borderRadius: 4, borderLeft: `3px solid ${result.interpretation.color}`, color: result.interpretation.color, lineHeight: 2.0 }}>
              <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 3 }}>▶ Interpretation</div>
              {result.interpretation.text}
            </div>
          )}

          {/* ── Ranked summary ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', ...MONO, marginBottom: 6 }}>
            Ranked by MAE improvement vs production
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {result.ranked.map((r, i) => (
              <div key={r.label} style={{
                padding: '6px 12px', background: '#1c1917', borderRadius: 4,
                border: `1px solid ${i === 0 ? r.color : '#292524'}`,
                minWidth: 160,
              }}>
                <div style={{ fontSize: 9, color: '#78716c', ...MONO }}>#{i + 1}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: r.color, ...MONO }}>{r.label}</div>
                <div style={{ fontSize: 9, ...MONO, color: '#a8a29e', lineHeight: 1.8, marginTop: 2 }}>
                  Best: ×{r.bestScale.toFixed(2)} → {fmt(r.bestMae)} dB<br />
                  Improvement: <span style={{ color: improvColor(r.imp), fontWeight: 700 }}>{Number.isFinite(r.imp) ? `▼ ${fmt(r.imp)} dB` : '—'}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Influence comparison ── */}
          {(() => {
            const vals = [
              { label: 'Global ×both', imp: result.impGlobal, color: '#fbbf24' },
              { label: 'Direct only',  imp: result.impDirect, color: '#93c5fd' },
              { label: 'Modal only',   imp: result.impModal,  color: '#86efac' },
            ];
            const maxImp = Math.max(...vals.map(v => v.imp ?? 0));
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', ...MONO, marginBottom: 6 }}>
                  MAE Improvement Magnitude
                </div>
                {vals.map(({ label, imp, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ width: 90, fontSize: 9, color, ...MONO, textAlign: 'right', fontWeight: 600 }}>{label}</div>
                    <div style={{
                      height: 12, borderRadius: 2, background: color,
                      width: maxImp > 0 ? `${Math.max(4, Math.round(160 * (imp ?? 0) / maxImp))}px` : '4px',
                      minWidth: 4, opacity: 0.85,
                    }} />
                    <div style={{ fontSize: 9, ...MONO, color: '#a8a29e' }}>
                      {Number.isFinite(imp) ? `▼ ${fmt(imp)} dB` : '—'}
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 8, color: '#44403c', ...MONO, marginTop: 4 }}>
                  If global ≈ direct+modal → calibration offset. If one path dominates → physics model issue.
                </div>
              </div>
            );
          })()}

          {/* ── Sweep tables ── */}
          <SweepTable label="Case 2 — Global gain (direct × modal ×)" color="#fbbf24" rows={result.globalRows} prodMae={result.prodMae} />
          <SweepTable label="Case 3 — Direct-only gain"               color="#93c5fd" rows={result.directRows} prodMae={result.prodMae} />
          <SweepTable label="Case 4 — Modal-only gain"                color="#86efac" rows={result.modalRows}  prodMae={result.prodMae} />

          {/* ── Legend ── */}
          <div style={{ fontSize: 8, color: '#44403c', ...MONO, lineHeight: 1.9 }}>
            ★ best in sweep · (prod) = production ×1.0 · ▼ improvement · ▲ worse<br />
            MAE: <span style={{ color: '#4ade80' }}>≤2</span> · <span style={{ color: '#fbbf24' }}>≤4</span> · <span style={{ color: '#fb923c' }}>≤7</span> · <span style={{ color: '#f87171' }}>&gt;7 dB</span>
          </div>
        </>
      )}
    </div>
  );
}