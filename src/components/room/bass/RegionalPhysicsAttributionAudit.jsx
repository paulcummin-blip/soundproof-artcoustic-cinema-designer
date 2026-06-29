/**
 * RegionalPhysicsAttributionAudit.jsx
 * Diagnostic only — no production defaults changed.
 *
 * For each physics substitution variant (A–E), computes error metrics
 * (MAE, RMS, peak error, null-depth error, peak-height error) separately
 * for four frequency bands:
 *   20–45 Hz · 45–80 Hz · 80–130 Hz · 130–220 Hz
 *
 * Then produces a winner table and answers whether one physics model
 * dominates all bands or different substitutions win in different regions.
 */

import React, { useState, useMemo } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';
import { REW_ESTIMATE, fmt1 } from './shootoutHelpers';

// ─── Shared physics (mirrors PhysicsSubstitutionShootout — diagnostic only) ──
const C_SND = 343;
const FLAT_94 = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];

const VARIANT_META = [
  { id: 'A', label: 'A — B44 production',          color: '#213428' },
  { id: 'B', label: 'B — Classical Q',              color: '#0891b2' },
  { id: 'C', label: 'C — Classical amplitude',      color: '#7c3aed' },
  { id: 'D', label: 'D — Classical ε normalisation',color: '#d97706' },
  { id: 'E', label: 'E — Full classical',           color: '#dc2626' },
];

const BANDS = [
  { label: '20–45 Hz',   fMin: 20,  fMax: 45  },
  { label: '45–80 Hz',   fMin: 45,  fMax: 80  },
  { label: '80–130 Hz',  fMin: 80,  fMax: 130 },
  { label: '130–220 Hz', fMin: 130, fMax: 220 },
];

function buildFreqAxis(minHz = 20, maxHz = 220, ppo = 96) {
  const freqs = [];
  const n = Math.ceil(Math.log2(maxHz / minHz) * ppo);
  for (let i = 0; i <= n; i++) {
    const f = minHz * Math.pow(2, i / ppo);
    if (f > maxHz + 0.001) break;
    freqs.push(f);
  }
  if (freqs[freqs.length - 1] < maxHz) freqs.push(maxHz);
  return freqs;
}

function interpCurveDb(curve, hz) {
  const pts = [...curve].sort((a, b) => (a.hz ?? a.frequency) - (b.hz ?? b.frequency));
  const getHz = p => p.hz ?? p.frequency;
  const getDb = p => p.db ?? p.spl;
  if (hz <= getHz(pts[0])) return getDb(pts[0]);
  if (hz >= getHz(pts[pts.length - 1])) return getDb(pts[pts.length - 1]);
  for (let i = 0; i < pts.length - 1; i++) {
    if (hz >= getHz(pts[i]) && hz <= getHz(pts[i + 1])) {
      const t = (hz - getHz(pts[i])) / (getHz(pts[i + 1]) - getHz(pts[i]));
      return getDb(pts[i]) + t * (getDb(pts[i + 1]) - getDb(pts[i]));
    }
  }
  return getDb(pts[0]);
}

function productionBaseQ(mode) {
  const ax = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (ax === 1) return 4.0;
  if (ax === 2) return 3.9;
  return 2.5;
}

function productionQ(mode, roomDims, sa) {
  return Math.max(1, Math.min(productionBaseQ(mode), estimateModeQLocal({ roomDims, surfaceAbsorption: sa, f0: mode.freq })));
}

function classicalQ(mode, roomDims, sa) {
  return Math.max(1, estimateModeQLocal({ roomDims, surfaceAbsorption: sa, f0: mode.freq }));
}

function epsilonFor(mode) {
  const ax = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (ax === 1) return 2;
  if (ax === 2) return 4;
  return 8;
}

function makeProductionAmpFn(sub, seatPos) {
  const dx = sub.x - seatPos.x, dy = sub.y - seatPos.y;
  const dz = (sub.z ?? 0.35) - (seatPos.z ?? 1.2);
  const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const dloss = -20 * Math.log10(dist);
  return (hz, curveDb) => Math.pow(10, (curveDb + dloss) / 20);
}

function makeGreenAmpFn(roomDims) {
  const V = roomDims.widthM * roomDims.lengthM * roomDims.heightM;
  return (hz, curveDb) => Math.pow(10, curveDb / 20) / Math.sqrt(Math.max(V, 1e-6));
}

function runModalOnly(roomDims, seatPos, sub, freqsHz, qFn, ampFn, normFn) {
  const { widthM, lengthM, heightM } = roomDims;
  const modes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 220, c: C_SND });
  const src  = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z ?? 0.35) };
  const seat = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z ?? 1.2) };
  const HO_SCALE = 0.50;

  return freqsHz.map(hz => {
    const curveDb = interpCurveDb(FLAT_94, hz);
    let re = 0, im = 0;
    for (const mode of modes) {
      const coupling = modeShapeValueLocal(mode, src.x,  src.y,  src.z,  { widthM, lengthM, heightM })
                     * modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
      const q = qFn(mode);
      const { re: tfRe, im: tfIm } = resonantTransfer(hz, mode.freq, q);
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const axialSc = (mode.type === 'axial' && modeOrder >= 2) ? HO_SCALE : 1.0;
      const gain = ampFn(hz, curveDb) * coupling * axialSc * normFn(mode);
      re += gain * tfRe;
      im += gain * tfIm;
    }
    return { re, im };
  });
}

function runVariantAllSubs(variantId, roomDims, seatPos, subs, sa) {
  const freqsHz = buildFreqAxis(20, 220);
  let sumRe = null, sumIm = null;
  for (const sub of subs) {
    const pQ = mode => productionQ(mode, roomDims, sa);
    const cQ = mode => classicalQ(mode, roomDims, sa);
    const pA = makeProductionAmpFn(sub, seatPos);
    const gA = makeGreenAmpFn(roomDims);
    const no = () => 1.0;
    const ep = mode => 1 / epsilonFor(mode);

    let cpx;
    switch (variantId) {
      case 'A': cpx = runModalOnly(roomDims, seatPos, sub, freqsHz, pQ, pA, no); break;
      case 'B': cpx = runModalOnly(roomDims, seatPos, sub, freqsHz, cQ, pA, no); break;
      case 'C': cpx = runModalOnly(roomDims, seatPos, sub, freqsHz, pQ, gA, no); break;
      case 'D': cpx = runModalOnly(roomDims, seatPos, sub, freqsHz, pQ, pA, ep); break;
      case 'E': cpx = runModalOnly(roomDims, seatPos, sub, freqsHz, cQ, gA, ep); break;
      default:  cpx = null;
    }
    if (!cpx) continue;
    if (!sumRe) { sumRe = cpx.map(p => p.re); sumIm = cpx.map(p => p.im); }
    else cpx.forEach((p, i) => { sumRe[i] += p.re; sumIm[i] += p.im; });
  }
  if (!sumRe) return null;
  const spl = sumRe.map((re, i) => 20 * Math.log10(Math.max(Math.sqrt(re * re + sumIm[i] * sumIm[i]), 1e-10)));
  return { freqsHz, spl };
}

// ─── Reference interpolation ─────────────────────────────────────────────────
function interpRef(f) {
  const pts = [...REW_ESTIMATE].sort((a, b) => a.frequency - b.frequency);
  if (f <= pts[0].frequency) return pts[0].spl;
  if (f >= pts[pts.length - 1].frequency) return pts[pts.length - 1].spl;
  for (let i = 0; i < pts.length - 1; i++) {
    if (f >= pts[i].frequency && f <= pts[i + 1].frequency) {
      const t = (f - pts[i].frequency) / (pts[i + 1].frequency - pts[i].frequency);
      return pts[i].spl + t * (pts[i + 1].spl - pts[i].spl);
    }
  }
  return null;
}

// ─── Band error metrics ───────────────────────────────────────────────────────
function bandMetrics(freqsHz, spl, fMin, fMax) {
  const pts = freqsHz
    .map((f, i) => ({ f, sim: spl[i], ref: interpRef(f) }))
    .filter(p => p.f >= fMin && p.f <= fMax && Number.isFinite(p.sim) && p.ref !== null);

  if (pts.length < 2) return null;

  const errs = pts.map(p => p.sim - p.ref);        // signed
  const absErrs = errs.map(Math.abs);

  const mae = absErrs.reduce((s, e) => s + e, 0) / absErrs.length;
  const rms = Math.sqrt(absErrs.reduce((s, e) => s + e * e, 0) / absErrs.length);
  const peakErr = Math.max(...absErrs);

  const simMin = Math.min(...pts.map(p => p.sim));
  const refMin = Math.min(...pts.map(p => p.ref));
  const nullDepthErr = Math.abs(simMin - refMin);

  const simMax = Math.max(...pts.map(p => p.sim));
  const refMax = Math.max(...pts.map(p => p.ref));
  const peakHeightErr = Math.abs(simMax - refMax);

  return { mae, rms, peakErr, nullDepthErr, peakHeightErr, n: pts.length };
}

// ─── Candidate mechanism ranking ─────────────────────────────────────────────
const MECHANISMS = [
  { rank: 1, label: 'Modal source amplitude calibration', detail: 'Green\'s function A_n constant differs from production distance-normalised amplitude. Most likely to cause a broadband level offset affecting all bands.' },
  { rank: 2, label: 'Q formulation (Sabine ceiling)', detail: 'baseQ ceiling broadens resonance bandwidths uniformly. Primarily affects null depth in the axial-dominant 20–80 Hz region.' },
  { rank: 3, label: 'Modal normalisation ε', detail: 'Missing or incorrect ε weighting (axial=2, tangential=4, oblique=8) distorts relative energy per mode family. Effect grows as mode density increases (80–220 Hz).' },
  { rank: 4, label: 'Coherent summation phase origin', detail: 'If modal phase vectors share a different reference origin than REW, cancellation depth degrades. Disproportionate effect at nulls across all bands.' },
  { rank: 5, label: 'Mode density / degeneracy handling', detail: 'Degenerate modes summed independently vs. grouped differently affect mid-high band (80–220 Hz) more than the sparse low band (20–45 Hz).' },
];

// ─── Badge ────────────────────────────────────────────────────────────────────
function Chip({ label, color, bold }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 4,
      background: `${color}22`, color, fontSize: 10,
      fontWeight: bold ? 700 : 500, fontFamily: 'monospace', whiteSpace: 'nowrap',
      border: `1px solid ${color}55`,
    }}>
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RegionalPhysicsAttributionAudit({
  roomDims, seatingPositions, subsForSimulation, surfaceAbsorption,
}) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const seatPos = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary) || seatingPositions?.[0];
    if (!primary) return null;
    return { x: Number(primary.x), y: Number(primary.y), z: Number.isFinite(Number(primary.z)) ? Number(primary.z) : 1.2 };
  }, [seatingPositions]);

  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && subsForSimulation?.length > 0);
  const sa = surfaceAbsorption || { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };

  function run() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      const rd = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };

      // Run all five variants
      const variantData = {};
      for (const vm of VARIANT_META) {
        try {
          const res = runVariantAllSubs(vm.id, rd, seatPos, subsForSimulation, sa);
          variantData[vm.id] = res;
        } catch (e) {
          variantData[vm.id] = { error: e.message };
        }
      }

      // Compute band metrics for each variant
      // bandTable[bandIdx][variantId] = metrics object
      const bandTable = BANDS.map(band => {
        const row = {};
        for (const vm of VARIANT_META) {
          const vd = variantData[vm.id];
          if (!vd || vd.error || !vd.freqsHz) { row[vm.id] = null; continue; }
          row[vm.id] = bandMetrics(vd.freqsHz, vd.spl, band.fMin, band.fMax);
        }
        return row;
      });

      // Winner per band (lowest MAE)
      const bandWinners = BANDS.map((band, bi) => {
        const row = bandTable[bi];
        let bestId = null, bestMae = Infinity;
        for (const vm of VARIANT_META) {
          const m = row[vm.id];
          if (m && m.mae < bestMae) { bestMae = m.mae; bestId = vm.id; }
        }
        return { bandLabel: band.label, winnerId: bestId, winnerMae: bestMae };
      });

      // Consistency check: does one variant win all bands?
      const winnerIds = bandWinners.map(bw => bw.winnerId).filter(Boolean);
      const uniqueWinners = [...new Set(winnerIds)];
      const singleDominant = uniqueWinners.length === 1 ? uniqueWinners[0] : null;

      // Build the 3-question verdict
      const q1 = singleDominant
        ? `YES — ${VARIANT_META.find(v => v.id === singleDominant)?.label} wins all four bands (MAE: ${bandWinners.map(bw => fmt1(bw.winnerMae)).join(' / ')} dB).`
        : `NO — Different physics models win in different bands: ${bandWinners.map(bw => `${bw.bandLabel} → ${VARIANT_META.find(v => v.id === bw.winnerId)?.label ?? '—'}`).join('; ')}.`;

      const q2 = singleDominant ? 'n/a — one model dominates all bands; no regional variation detected.'
        : `Yes. Bands split across variants: ${uniqueWinners.map(id => VARIANT_META.find(v => v.id === id)?.label).join(', ')}. This means the physics mismatch is not uniform — different mechanisms dominate at different frequency ranges.`;

      // Rank mechanisms relevant to a split result
      const q3 = singleDominant
        ? `The dominant mechanism is captured by ${VARIANT_META.find(v => v.id === singleDominant)?.label}. No further band-specific attribution is needed.`
        : `Ranked candidate mechanisms for band-specific divergence:\n${MECHANISMS.map(m => `  ${m.rank}. ${m.label} — ${m.detail}`).join('\n')}`;

      setResults({ bandTable, bandWinners, uniqueWinners, singleDominant, q1, q2, q3 });
      setRunning(false);
    }, 20);
  }

  // ─── Styles ───────────────────────────────────────────────────────────────
  const th  = { padding: '4px 8px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#1e3a8a', background: '#eff6ff', borderBottom: '2px solid #93c5fd', textAlign: 'right', whiteSpace: 'nowrap' };
  const thL = { ...th, textAlign: 'left' };
  const td  = { padding: '3px 8px', fontSize: 10, fontFamily: 'monospace', textAlign: 'right', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
  const tdL = { ...td, textAlign: 'left' };

  function metricCell(val, isBest) {
    return (
      <td style={{ ...td, color: isBest ? '#166534' : '#374151', fontWeight: isBest ? 700 : 400, background: isBest ? '#f0fdf4' : undefined }}>
        {val !== null && val !== undefined && Number.isFinite(val) ? fmt1(val) : '—'}
        {isBest && <span style={{ marginLeft: 3, fontSize: 9 }}>★</span>}
      </td>
    );
  }

  return (
    <details style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '8px 10px', marginBottom: 8 }}>
      <summary style={{ fontWeight: 700, color: '#7c3aed', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🗺️ Regional Physics Attribution Audit — per-band error attribution (20–45 · 45–80 · 80–130 · 130–220 Hz)
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#4c1d95', lineHeight: 1.6, marginBottom: 8, background: '#ede9fe', borderRadius: 4, padding: '6px 8px' }}>
          Runs variants A–E against the approximate REW estimate and computes MAE, RMS error, peak error,
          null-depth error and peak-height error separately for each of four frequency bands.
          Diagnostic only. No production defaults changed. Reference is screenshot-derived (⚠ approximate).
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <button
            onClick={run} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#7c3aed' : '#d1d5db'}`, background: canRun && !running ? '#7c3aed' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed' }}>
            {running ? 'Running…' : results ? 'Re-run' : 'Run Regional Attribution'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>Need room dims + seat + at least one sub.</span>}
          {results && !running && (
            <span style={{ fontSize: 10, color: '#4c1d95', fontFamily: 'monospace' }}>
              Room: {roomDims.widthM?.toFixed(1)}×{roomDims.lengthM?.toFixed(1)}×{roomDims.heightM?.toFixed(1)} m · Subs: {subsForSimulation?.length}
            </span>
          )}
        </div>

        {results && (
          <>
            {/* Per-band per-variant tables */}
            {BANDS.map((band, bi) => {
              const row = results.bandTable[bi];
              const winner = results.bandWinners[bi];

              // Find best value per metric column
              const bestMae        = Math.min(...VARIANT_META.map(vm => row[vm.id]?.mae        ?? Infinity));
              const bestRms        = Math.min(...VARIANT_META.map(vm => row[vm.id]?.rms        ?? Infinity));
              const bestPeakErr    = Math.min(...VARIANT_META.map(vm => row[vm.id]?.peakErr    ?? Infinity));
              const bestNullDepth  = Math.min(...VARIANT_META.map(vm => row[vm.id]?.nullDepthErr ?? Infinity));
              const bestPeakHeight = Math.min(...VARIANT_META.map(vm => row[vm.id]?.peakHeightErr ?? Infinity));

              return (
                <div key={band.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#4c1d95' }}>{band.label}</span>
                    {winner.winnerId && (
                      <Chip label={`Best: ${VARIANT_META.find(v => v.id === winner.winnerId)?.label} (~MAE ${fmt1(winner.winnerMae)} dB)`}
                        color={VARIANT_META.find(v => v.id === winner.winnerId)?.color ?? '#374151'} bold />
                    )}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
                      <thead>
                        <tr>
                          <th style={{ ...thL, minWidth: 160 }}>Variant</th>
                          <th style={th}>MAE (dB)</th>
                          <th style={th}>RMS (dB)</th>
                          <th style={th}>Peak err (dB)</th>
                          <th style={th}>Null depth Δ (dB)</th>
                          <th style={th}>Peak height Δ (dB)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {VARIANT_META.map((vm, idx) => {
                          const m = row[vm.id];
                          const isWinner = winner.winnerId === vm.id;
                          const bg = isWinner ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#faf5ff';
                          return (
                            <tr key={vm.id} style={{ background: bg }}>
                              <td style={{ ...tdL }}>
                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: vm.color, marginRight: 5, verticalAlign: 'middle' }} />
                                <span style={{ fontWeight: isWinner ? 700 : 400 }}>{vm.label}</span>
                                {isWinner && <span style={{ marginLeft: 5, fontSize: 9, color: '#166534' }}>★ best</span>}
                              </td>
                              {m ? (
                                <>
                                  {metricCell(m.mae,          m.mae          === bestMae)}
                                  {metricCell(m.rms,          m.rms          === bestRms)}
                                  {metricCell(m.peakErr,      m.peakErr      === bestPeakErr)}
                                  {metricCell(m.nullDepthErr, m.nullDepthErr === bestNullDepth)}
                                  {metricCell(m.peakHeightErr,m.peakHeightErr=== bestPeakHeight)}
                                </>
                              ) : (
                                <td style={td} colSpan={5}>—</td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Winner summary table */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#4c1d95', marginBottom: 6 }}>
                ▶ Winner Summary Table
              </div>
              <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 500 }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: 120 }}>Band</th>
                    <th style={{ ...thL }}>Best variant (lowest MAE)</th>
                    <th style={th}>~MAE (dB)</th>
                  </tr>
                </thead>
                <tbody>
                  {results.bandWinners.map((bw, i) => {
                    const vm = VARIANT_META.find(v => v.id === bw.winnerId);
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#faf5ff' }}>
                        <td style={{ ...tdL, fontWeight: 700 }}>{bw.bandLabel}</td>
                        <td style={tdL}>
                          {vm ? (
                            <Chip label={vm.label} color={vm.color} bold={results.singleDominant === vm.id} />
                          ) : '—'}
                        </td>
                        <td style={td}>{fmt1(bw.winnerMae)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Final verdict */}
            <div style={{ border: '2px solid #7c3aed', borderRadius: 6, background: '#ede9fe', padding: '10px 14px', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.8, marginBottom: 8 }}>
              <div style={{ fontWeight: 700, color: '#7c3aed', fontSize: 11, marginBottom: 6 }}>▶ Final Verdict — Regional Physics Attribution</div>
              {[
                { q: '1. Is one physics model best across all bands?', a: results.q1 },
                { q: '2. Or does a different substitution improve different regions?', a: results.q2 },
                { q: '3. Ranked remaining candidate mechanisms (if bands split):', a: results.q3 },
              ].map(({ q, a }, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: '#4c1d95', marginBottom: 2 }}>{q}</div>
                  <div style={{ color: '#1f2937', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{a}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#b45309', lineHeight: 1.5 }}>
              ⚠ All error metrics computed against an approximate, screenshot-derived REW reference — not a calibrated measurement.
              Diagnostic only. No production code changed.
            </div>
          </>
        )}
      </div>
    </details>
  );
}