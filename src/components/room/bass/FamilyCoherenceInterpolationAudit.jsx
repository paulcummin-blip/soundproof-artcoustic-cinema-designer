/**
 * FamilyCoherenceInterpolationAudit — Diagnostic only. Does not affect the live graph.
 *
 * Fixed: distance blend = 0.75, Direct + Modes, Reflections OFF, current parity settings.
 *
 * Sweeps family coherence factor from 1.0 (fully coherent) to 0.0 (pure RSS) in 5 steps.
 * Interpolation formula: SPL = coherentDb * alpha + rssDb * (1 - alpha)
 *   where coherentDb and rssDb are the two extremes per frequency.
 *
 * Goal: determine whether REW behaviour sits between coherent and RSS summation,
 * and estimate the effective coherence factor.
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
const DISTANCE_BLEND = 0.75;

const REW_BENCHMARK = [
  { hz: 20,  db: 93.1 }, { hz: 25,  db: 96.6 }, { hz: 30,  db: 95.8 },
  { hz: 34,  db: 94.1 }, { hz: 40,  db: 100.3 }, { hz: 45, db: 98.6 },
  { hz: 50,  db: 97.5 }, { hz: 55,  db: 95.7 }, { hz: 60,  db: 91.2 },
  { hz: 63,  db: 89.8 }, { hz: 68,  db: 85.2 }, { hz: 70,  db: 83.1 },
  { hz: 75,  db: 84.4 }, { hz: 80,  db: 86.2 }, { hz: 85,  db: 88.4 },
  { hz: 90,  db: 89.1 }, { hz: 100, db: 87.3 }, { hz: 120, db: 83.6 },
  { hz: 150, db: 79.2 }, { hz: 200, db: 74.1 },
];

const COHERENCE_STEPS = [
  { alpha: 1.00, label: '100% coherent' },
  { alpha: 0.75, label: '75% coherent'  },
  { alpha: 0.50, label: '50% coherent'  },
  { alpha: 0.25, label: '25% coherent'  },
  { alpha: 0.00, label: '0% — pure RSS' },
];

// Dense frequency grid for accurate MAE
const FREQ_GRID = [];
for (let f = 20; f <= 200; f += (f < 100 ? 2 : 5)) FREQ_GRID.push(f);

// ── Helpers ───────────────────────────────────────────────────────────────────
function mag2db(mag)   { return 20 * Math.log10(Math.max(mag, 1e-10)); }
function db2mag(db)    { return Math.pow(10, db / 20); }

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
  if (!series || series.length === 0) return null;
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

function buildModes(roomDims, surfaceAbsorption) {
  const raw = computeRoomModesLocal({
    widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM,
    fMax: 220, c: SPEED_OF_SOUND,
  });
  return raw.map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? 4.0 : activeAxes === 2 ? 3.9 : 2.5;
    const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption: surfaceAbsorption ?? {}, f0: mode.freq });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
  });
}

/**
 * Compute at a single frequency:
 * - directRe/Im (coherent)
 * - per-family coherent complex sums and RSS energy
 * Returns { directRe, directIm, families: { axial, tangential, oblique } }
 *   where each family has { re, im, energySum }
 */
function computeFieldAtHz(hz, modes, subPos, seatPos, roomDims) {
  // Direct
  const dx = subPos.x - seatPos.x;
  const dy = subPos.y - seatPos.y;
  const dz = subPos.z - seatPos.z;
  const distM = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
  const directAmp = db2mag(94 - 20 * Math.log10(distM));
  const directPhase = -2 * Math.PI * hz * (distM / SPEED_OF_SOUND);
  const directRe = directAmp * Math.cos(directPhase);
  const directIm = directAmp * Math.sin(directPhase);

  // Modal gain scalar from distance blend
  const blendedLossDb = -20 * Math.log10(distM) * DISTANCE_BLEND;
  const modalGainScalar = db2mag(blendedLossDb);

  const families = {
    axial:      { re: 0, im: 0, energySum: 0 },
    tangential: { re: 0, im: 0, energySum: 0 },
    oblique:    { re: 0, im: 0, energySum: 0 },
  };

  for (const mode of modes) {
    const srcPsi = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z, roomDims);
    const rcvPsi = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, roomDims);
    const coupling = srcPsi * rcvPsi;
    const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const orderWeight  = modeOrder >= 2 ? 0.50 : 1.0;
    const axialScale   = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
    const gain = db2mag(94) * modalGainScalar * coupling * orderWeight * axialScale;
    const { re: tr, im: ti } = resonantTransfer(hz, mode.freq, mode.qValue);
    const re = gain * tr;
    const im = gain * ti;
    const fam = families[mode.type] ?? families.oblique;
    fam.re += re; fam.im += im;
    fam.energySum += re*re + im*im;
  }

  return { directRe, directIm, families };
}

/**
 * Interpolate between coherent and RSS family summation.
 * alpha=1 → fully coherent (direct + sum of all modal Re/Im)
 * alpha=0 → pure RSS      (direct energy + all modal energy RSS)
 *
 * Intermediate: magnitude at each frequency is linearly interpolated
 * between coherentMag and rssMag before converting to dB.
 */
function splAtAlpha(field, alpha) {
  const { directRe, directIm, families } = field;
  const dMagSq = directRe*directRe + directIm*directIm;

  // Coherent: direct + all modal coherently
  const allRe = directRe + families.axial.re + families.tangential.re + families.oblique.re;
  const allIm = directIm + families.axial.im + families.tangential.im + families.oblique.im;
  const coherentMag = Math.sqrt(allRe*allRe + allIm*allIm);

  // RSS: direct energy + all modal energy
  const allEnergy = dMagSq + families.axial.energySum + families.tangential.energySum + families.oblique.energySum;
  const rssMag = Math.sqrt(allEnergy);

  // Linear interpolation in magnitude domain
  const interpMag = coherentMag * alpha + rssMag * (1 - alpha);
  return mag2db(interpMag);
}

function buildSeries(modes, subPos, seatPos, roomDims, alpha) {
  return FREQ_GRID.map(hz => {
    const field = computeFieldAtHz(hz, modes, subPos, seatPos, roomDims);
    return { hz, db: splAtAlpha(field, alpha) };
  });
}

function scoreVsBenchmark(series) {
  let sumErr = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db: ref } of REW_BENCHMARK) {
    const sim = interpSeries(series, hz);
    if (sim === null || !Number.isFinite(sim)) continue;
    const err = Math.abs(sim - ref);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  return count > 0 ? { mae: sumErr / count, worstErr, worstHz } : null;
}

function errAt(series, hz) {
  const sim = interpSeries(series, hz);
  const ref = interpBenchmark(hz);
  return (sim !== null && Number.isFinite(sim)) ? sim - ref : null;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH = {
  padding: '3px 10px', fontSize: 8, fontWeight: 700, ...MONO,
  background: '#1c1917', color: '#d6d3d1', textAlign: 'right',
  borderBottom: '2px solid #292524', whiteSpace: 'nowrap',
};
const TD = { padding: '3px 10px', fontSize: 8, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };

function errColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a <= 1) return '#4ade80';
  if (a <= 3) return '#fbbf24';
  if (a <= 6) return '#fb923c';
  return '#f87171';
}
function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function fmtΔ(v)       { if (!Number.isFinite(v)) return '—'; return (v >= 0 ? '+' : '') + v.toFixed(2); }

// ── Component ─────────────────────────────────────────────────────────────────
export default function FamilyCoherenceInterpolationAudit({ roomDims, subs, seat, surfaceAbsorption }) {
  const [running, setRunning] = useState(false);
  const [rows, setRows]       = useState(null);

  const currentSub = subs?.[0] ?? null;
  const hasRoom    = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const canRun     = hasRoom && seat?.x != null && currentSub?.x != null;

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setRows(null);
    setTimeout(() => {
      try {
        const subPos  = { x: currentSub.x, y: currentSub.y, z: currentSub.z ?? 0.35 };
        const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
        const modes   = buildModes(roomDims, surfaceAbsorption);

        const computed = COHERENCE_STEPS.map(({ alpha, label }) => {
          const series  = buildSeries(modes, subPos, seatPos, roomDims, alpha);
          const metrics = scoreVsBenchmark(series);
          return {
            alpha, label,
            mae:      metrics?.mae      ?? null,
            worstErr: metrics?.worstErr ?? null,
            worstHz:  metrics?.worstHz  ?? null,
            e70: errAt(series, 70),
            e80: errAt(series, 80),
            e85: errAt(series, 85),
          };
        });

        // Mark best MAE
        let bestMae = Infinity, bestIdx = -1;
        computed.forEach((r, i) => { if ((r.mae ?? Infinity) < bestMae) { bestMae = r.mae; bestIdx = i; } });
        computed.forEach((r, i) => { r.isBest = i === bestIdx; });

        setRows(computed);
      } catch (e) {
        console.error('[FamilyCoherenceInterpolationAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [roomDims, seat, currentSub, surfaceAbsorption, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Family Coherence Interpolation Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.7 }}>
        Fixed: blend=0.75 · Direct+Modes · Reflections OFF · Current parity settings.<br />
        Interpolates family summation from 100% coherent → 0% coherent (pure RSS) in 5 steps.<br />
        Goal: estimate whether REW behaviour falls between these extremes, and at what coherence factor.
      </div>

      {!hasRoom    && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires room dimensions.</div>}
      {hasRoom && !seat       && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a seat/MLP.</div>}
      {hasRoom && !currentSub && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a subwoofer.</div>}

      {canRun && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 9, ...MONO, color: '#78716c', background: '#1c1917', borderRadius: 4, padding: '5px 10px', marginBottom: 8 }}>
          <span>Room: <strong style={{ color: '#d6d3d1' }}>{roomDims.widthM.toFixed(2)}W × {roomDims.lengthM.toFixed(2)}L × {roomDims.heightM.toFixed(2)}H m</strong></span>
          <span>MLP: <strong style={{ color: '#86efac' }}>({seat.x?.toFixed(3)}, {seat.y?.toFixed(3)}, {(seat.z ?? 1.2).toFixed(3)}) m</strong></span>
          <span>Sub: <strong style={{ color: '#93c5fd' }}>({currentSub.x?.toFixed(3)}, {currentSub.y?.toFixed(3)}, {(currentSub.z ?? 0.35).toFixed(3)}) m</strong></span>
          <span style={{ color: '#44403c' }}>blend={DISTANCE_BLEND}</span>
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
        {running ? `Running ${COHERENCE_STEPS.length} coherence steps…` : rows ? 'Re-run' : `Run Coherence Interpolation (${COHERENCE_STEPS.length} steps)`}
      </button>

      {rows && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', width: 160 }}>Coherence</th>
                  <th style={{ ...TH, color: '#fbbf24' }}>MAE</th>
                  <th style={{ ...TH, color: '#fb923c' }}>Worst err</th>
                  <th style={TH}>Worst Hz</th>
                  <th style={{ ...TH, color: '#93c5fd' }}>70 Hz Δ</th>
                  <th style={{ ...TH, color: '#6ee7b7' }}>80 Hz Δ</th>
                  <th style={TH}>85 Hz Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.alpha}
                    style={{ background: row.isBest ? '#172554' : undefined }}
                  >
                    <td style={{
                      ...TD, textAlign: 'left',
                      color: row.isBest ? '#93c5fd' : '#a8a29e',
                      fontWeight: row.isBest ? 700 : 400,
                    }}>
                      {row.isBest && <span style={{ color: '#60a5fa', marginRight: 5 }}>★</span>}
                      {row.label}
                    </td>
                    <td style={{ ...TD, fontWeight: 700, color: row.isBest ? '#60a5fa' : errColor(row.mae) }}>
                      {fmt(row.mae)}
                    </td>
                    <td style={{ ...TD, color: errColor(row.worstErr) }}>{fmt(row.worstErr)}</td>
                    <td style={{ ...TD, color: '#6b7280' }}>{row.worstHz ?? '—'}</td>
                    <td style={{ ...TD, color: errColor(row.e70) }}>{fmtΔ(row.e70)}</td>
                    <td style={{ ...TD, color: errColor(row.e80) }}>{fmtΔ(row.e80)}</td>
                    <td style={{ ...TD, color: errColor(row.e85) }}>{fmtΔ(row.e85)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Interpretation hint */}
          {(() => {
            const bestRow = rows.find(r => r.isBest);
            const coherentMae = rows.find(r => r.alpha === 1.0)?.mae;
            const rssMae      = rows.find(r => r.alpha === 0.0)?.mae;
            const gap = coherentMae != null && rssMae != null ? Math.abs(coherentMae - rssMae) : null;
            return (
              <div style={{ marginTop: 8, fontSize: 9, ...MONO, color: '#44403c', lineHeight: 1.9, borderTop: '1px solid #1c1917', paddingTop: 6 }}>
                <span style={{ color: '#60a5fa' }}>★</span> best MAE &nbsp;&nbsp;
                {gap != null && gap < 0.3 && (
                  <span style={{ color: '#fbbf24' }}>⚠ MAE span coherent↔RSS is {gap.toFixed(3)} dB — summation architecture has minimal impact.</span>
                )}
                {gap != null && gap >= 0.3 && (
                  <span style={{ color: '#4ade80' }}>Coherent↔RSS MAE span: {gap.toFixed(3)} dB — summation architecture is a meaningful driver.</span>
                )}
                <br />
                {bestRow && (
                  <span>
                    Best fit at <strong style={{ color: '#d6d3d1' }}>{bestRow.label}</strong>
                    {bestRow.alpha > 0.6 && ' — REW behaviour is closer to fully coherent.'}
                    {bestRow.alpha >= 0.3 && bestRow.alpha <= 0.6 && ' — REW behaviour is roughly mid-way between coherent and RSS.'}
                    {bestRow.alpha < 0.3 && ' — REW behaviour is closer to incoherent RSS.'}
                  </span>
                )}
                <br />
                Δ colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}