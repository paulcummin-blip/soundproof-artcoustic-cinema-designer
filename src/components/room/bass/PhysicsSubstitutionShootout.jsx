/**
 * PhysicsSubstitutionShootout.jsx
 * Diagnostic only — no production defaults changed.
 *
 * Runs 6 variants (A–F) of the modal-only bass simulation, each swapping
 * exactly one physical parameter at a time, to isolate which substitution
 * best explains the remaining REW discrepancy.
 *
 * Variants:
 *   A — Current B44 production modal path (baseline)
 *   B — Classical Sabine Q only (no baseQ ceiling)
 *   C — Classical Green's modal amplitude (room-volume normalised)
 *   D — Classical modal normalisation factors (ε: axial=2, tangential=4, oblique=8)
 *   E — Full classical modal reference (Q + amplitude + normalisation)
 *   F — REW estimated reference overlay (hardcoded approximate data)
 */

import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';
import { REW_ESTIMATE, fmt1, computeEstimateMetrics, computeMAE } from './shootoutHelpers';

// ─── Constants ───────────────────────────────────────────────────────────────
const C = 343;
const FLAT_94 = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];

const VARIANT_CONFIG = [
  {
    id: 'A',
    label: 'A — B44 production',
    color: '#213428',
    description: 'Existing engine: baseQ ceiling + distance_normalised amplitude. Baseline.',
  },
  {
    id: 'B',
    label: 'B — Classical Q only',
    color: '#0891b2',
    description: 'Sabine Q direct — no baseQ ceiling. All else unchanged.',
  },
  {
    id: 'C',
    label: 'C — Classical amplitude',
    color: '#7c3aed',
    description: 'Room-volume Green\'s amplitude (÷√V). Current Q unchanged.',
  },
  {
    id: 'D',
    label: 'D — Classical ε normalisation',
    color: '#d97706',
    description: 'Modal normalisation: axial ε=2, tangential ε=4, oblique ε=8. Current Q+amplitude.',
  },
  {
    id: 'E',
    label: 'E — Full classical reference',
    color: '#dc2626',
    description: 'Classical Q + Green\'s amplitude + ε normalisation. No reflections, no smoothing.',
  },
  {
    id: 'F',
    label: 'F — REW estimate overlay',
    color: '#f97316',
    description: 'Approximate REW screenshot-derived reference (hardcoded, not a measurement).',
  },
];

// ─── Frequency axis ───────────────────────────────────────────────────────────
function buildFreqAxis(minHz = 20, maxHz = 220, ppo = 96) {
  const freqs = [];
  const octaves = Math.log2(maxHz / minHz);
  const n = Math.ceil(octaves * ppo);
  for (let i = 0; i <= n; i++) {
    const f = minHz * Math.pow(2, i / ppo);
    if (f > maxHz + 0.001) break;
    freqs.push(f);
  }
  if (freqs[freqs.length - 1] < maxHz) freqs.push(maxHz);
  return freqs;
}

// ─── Q helpers ───────────────────────────────────────────────────────────────
function productionBaseQ(mode) {
  const ax = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (ax === 1) return 4.0;
  if (ax === 2) return 3.9;
  return 2.5;
}

// Q used by variant A/C/D: clamp(Sabine, 1, baseQ)
function productionQ(mode, roomDims, surfaceAbsorption) {
  const baseQ = productionBaseQ(mode);
  const sabineQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq });
  return Math.max(1, Math.min(baseQ, sabineQ));
}

// Q used by variant B/E: raw Sabine Q, no ceiling (still floored at 1)
function classicalSabineQ(mode, roomDims, surfaceAbsorption) {
  return Math.max(1, estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq }));
}

// ─── Modal normalisation ε ────────────────────────────────────────────────────
function epsilonFor(mode) {
  const ax = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (ax === 1) return 2;
  if (ax === 2) return 4;
  return 8;
}

// ─── Modal source amplitude helpers ──────────────────────────────────────────
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

// ─── Core simulation engine ───────────────────────────────────────────────────
/**
 * Runs a modal-only simulation for one sub against one seat.
 * qFn(mode)       → Q value to use for this mode
 * ampFn(hz,dist)  → modal source amplitude scalar at this frequency
 * normFn(mode)    → additional normalisation factor per mode (1.0 = none)
 */
function runModalOnly(roomDims, seatPos, sub, freqsHz, qFn, ampFn, normFn) {
  const { widthM, lengthM, heightM } = roomDims;
  const modes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 220, c: C });

  const src = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z ?? 0.35) };
  const seat = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z ?? 1.2) };

  // Axial harmonic correction (mirrors production engine, applied to all variants for comparability)
  const highOrderAxialScale = 0.50; // matches engine default

  return freqsHz.map(hz => {
    const curveDb = interpCurveDb(FLAT_94, hz);

    let re = 0;
    let im = 0;

    for (const mode of modes) {
      const sc = modeShapeValueLocal(mode, src.x, src.y, src.z, { widthM, lengthM, heightM });
      const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
      const coupling = sc * rc;

      const q = qFn(mode);
      const { re: tfRe, im: tfIm } = resonantTransfer(hz, mode.freq, q);

      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const axialScale = (mode.type === 'axial' && modeOrder >= 2) ? highOrderAxialScale : 1.0;
      const norm = normFn(mode);
      const amp = ampFn(hz, curveDb);

      const gain = amp * coupling * axialScale * norm;
      re += gain * tfRe;
      im += gain * tfIm;
    }

    return { re, im };
  });
}

// Amplitude for variant A (production: distance-normalised)
function makeProductionAmpFn(sub, seatPos) {
  const dx = sub.x - seatPos.x;
  const dy = sub.y - seatPos.y;
  const dz = (sub.z ?? 0.35) - (seatPos.z ?? 1.2);
  const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distLossDb = -20 * Math.log10(dist);
  return (hz, curveDb) => Math.pow(10, (curveDb + distLossDb) / 20);
}

// Amplitude for variants B/D: same production distance-normalised (only Q or norm differs)
// Amplitude for variant C/E: Green's function room-volume normalised (÷√V)
function makeGreenAmpFn(roomDims) {
  const V = roomDims.widthM * roomDims.lengthM * roomDims.heightM;
  return (hz, curveDb) => Math.pow(10, curveDb / 20) / Math.sqrt(Math.max(V, 1e-6));
}

// ─── Variant runners ──────────────────────────────────────────────────────────
function computeVariant(id, roomDims, seatPos, sub, surfaceAbsorption, freqsHz) {
  const noNorm = () => 1.0;
  const prodAmp = makeProductionAmpFn(sub, seatPos);
  const greenAmp = makeGreenAmpFn(roomDims);
  const prodQ = mode => productionQ(mode, roomDims, surfaceAbsorption);
  const classQ = mode => classicalSabineQ(mode, roomDims, surfaceAbsorption);

  let cpx;
  switch (id) {
    case 'A': // production
      cpx = runModalOnly(roomDims, seatPos, sub, freqsHz, prodQ, prodAmp, noNorm);
      break;
    case 'B': // classical Q, production amplitude + no norm
      cpx = runModalOnly(roomDims, seatPos, sub, freqsHz, classQ, prodAmp, noNorm);
      break;
    case 'C': // classical Green's amplitude, production Q + no norm
      cpx = runModalOnly(roomDims, seatPos, sub, freqsHz, prodQ, greenAmp, noNorm);
      break;
    case 'D': // classical ε normalisation, production Q + amplitude
      cpx = runModalOnly(roomDims, seatPos, sub, freqsHz, prodQ, prodAmp, mode => 1 / epsilonFor(mode));
      break;
    case 'E': // full classical: Sabine Q + Green's amp + ε normalisation
      cpx = runModalOnly(roomDims, seatPos, sub, freqsHz, classQ, greenAmp, mode => 1 / epsilonFor(mode));
      break;
    default:
      return null;
  }

  const spl = cpx.map(({ re, im }) => 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10)));
  return { freqsHz, spl };
}

// Aggregate multi-sub result (coherent sum across subs)
function runVariantAllSubs(id, roomDims, seatPos, subs, surfaceAbsorption) {
  const freqsHz = buildFreqAxis(20, 220);
  let sumRe = null;
  let sumIm = null;

  for (const sub of subs) {
    const cpx = (() => {
      const noNorm = () => 1.0;
      const prodAmp = makeProductionAmpFn(sub, seatPos);
      const greenAmp = makeGreenAmpFn(roomDims);
      const prodQ = mode => productionQ(mode, roomDims, surfaceAbsorption);
      const classQ = mode => classicalSabineQ(mode, roomDims, surfaceAbsorption);
      switch (id) {
        case 'A': return runModalOnly(roomDims, seatPos, sub, freqsHz, prodQ, prodAmp, noNorm);
        case 'B': return runModalOnly(roomDims, seatPos, sub, freqsHz, classQ, prodAmp, noNorm);
        case 'C': return runModalOnly(roomDims, seatPos, sub, freqsHz, prodQ, greenAmp, noNorm);
        case 'D': return runModalOnly(roomDims, seatPos, sub, freqsHz, prodQ, prodAmp, mode => 1 / epsilonFor(mode));
        case 'E': return runModalOnly(roomDims, seatPos, sub, freqsHz, classQ, greenAmp, mode => 1 / epsilonFor(mode));
        default: return null;
      }
    })();
    if (!cpx) continue;
    if (!sumRe) {
      sumRe = cpx.map(p => p.re);
      sumIm = cpx.map(p => p.im);
    } else {
      cpx.forEach((p, i) => { sumRe[i] += p.re; sumIm[i] += p.im; });
    }
  }

  if (!sumRe) return null;
  const spl = sumRe.map((re, i) => 20 * Math.log10(Math.max(Math.sqrt(re * re + sumIm[i] * sumIm[i]), 1e-10)));
  return { freqsHz, spl };
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────
function analyseResult(freqsHz, spl) {
  // Null/peak in 20–120 Hz band
  const band = freqsHz.map((f, i) => ({ f, db: spl[i] })).filter(p => p.f >= 20 && p.f <= 120 && Number.isFinite(p.db));
  if (band.length < 3) return { nullHz: null, nullDb: null, peakHz: null, peakDb: null, swing: null, deepDips: 0, peaks: 0 };
  let nullPt = band[0], peakPt = band[0];
  for (const p of band) {
    if (p.db < nullPt.db) nullPt = p;
    if (p.db > peakPt.db) peakPt = p;
  }
  // Deep dips: local minima >8 dB below neighbours in 20–220 Hz
  const all = freqsHz.map((f, i) => ({ f, db: spl[i] })).filter(p => p.f >= 20 && p.f <= 220 && Number.isFinite(p.db));
  let deepDips = 0, peaks = 0;
  for (let i = 2; i < all.length - 2; i++) {
    const nbAvg = (all[i - 2].db + all[i - 1].db + all[i + 1].db + all[i + 2].db) / 4;
    if (nbAvg - all[i].db > 8) deepDips++;
    if (all[i].db - nbAvg > 6) peaks++;
  }
  return {
    nullHz: nullPt.f, nullDb: nullPt.db,
    peakHz: peakPt.f, peakDb: peakPt.db,
    swing: peakPt.db - nullPt.db,
    deepDips, peaks,
  };
}

function interpEstimate(f) {
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

function maeVsEstimate(freqsHz, spl) {
  let sum = 0, n = 0;
  freqsHz.forEach((f, i) => {
    if (f < 20 || f > 220) return;
    const ref = interpEstimate(f);
    if (ref !== null && Number.isFinite(spl[i])) { sum += Math.abs(spl[i] - ref); n++; }
  });
  return n > 0 ? sum / n : null;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 10, fontFamily: 'monospace' }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{Number.isFinite(Number(label)) ? `${Number(label).toFixed(1)} Hz` : label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.stroke ?? p.color }}>
          {VARIANT_CONFIG.find(v => `spl_${v.id}` === p.dataKey)?.label ?? p.dataKey}:{' '}
          {Number.isFinite(p.value) ? `${Number(p.value).toFixed(1)} dB` : '—'}
        </div>
      ))}
    </div>
  );
}

// ─── Verdict badge ────────────────────────────────────────────────────────────
function Badge({ text, green, red, blue }) {
  if (!text) return <span style={{ color: '#9ca3af', fontSize: 10, fontFamily: 'monospace' }}>—</span>;
  const bg = green ? '#dcfce7' : red ? '#fee2e2' : blue ? '#dbeafe' : '#f3f4f6';
  const col = green ? '#166534' : red ? '#991b1b' : blue ? '#1e40af' : '#374151';
  return (
    <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, background: bg, color: col, fontSize: 10, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PhysicsSubstitutionShootout({
  roomDims, seatingPositions, subsForSimulation, surfaceAbsorption, rewOverlaySeries,
}) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [visibleIds, setVisibleIds] = useState(() => Object.fromEntries(VARIANT_CONFIG.map(v => [v.id, true])));

  const toggleId = id => setVisibleIds(prev => ({ ...prev, [id]: !prev[id] }));

  const seatPos = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary) || seatingPositions?.[0];
    if (!primary) return null;
    return { x: Number(primary.x), y: Number(primary.y), z: Number.isFinite(Number(primary.z)) ? Number(primary.z) : 1.2 };
  }, [seatingPositions]);

  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && subsForSimulation?.length > 0);
  const absorption = surfaceAbsorption || { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };

  function run() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      const rd = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
      const rows = [];
      const rewData = rewOverlaySeries?.data || null;

      for (const vc of VARIANT_CONFIG) {
        if (vc.id === 'F') continue; // overlay only
        try {
          const res = runVariantAllSubs(vc.id, rd, seatPos, subsForSimulation, absorption);
          if (!res) { rows.push({ ...vc, error: 'engine returned null' }); continue; }
          const analysis = analyseResult(res.freqsHz, res.spl);
          const maeEst = maeVsEstimate(res.freqsHz, res.spl);
          const maeRew = rewData ? computeMAE(res.freqsHz, res.spl, rewData) : null;
          rows.push({ ...vc, ...analysis, maeEst, maeRew, freqsHz: res.freqsHz, spl: res.spl, error: null });
        } catch (e) {
          rows.push({ ...vc, error: e.message });
        }
      }

      // Compute verdict strings
      const baseline = rows.find(r => r.id === 'A');
      const maeBaseline = baseline?.maeEst;

      const rowsWithMae = rows.filter(r => r.maeEst !== null && r.maeEst !== undefined);
      const best = rowsWithMae.reduce((b, r) => (!b || r.maeEst < b.maeEst) ? r : b, null);

      // Final verdict answers
      const verdicts = {};

      // Q substitution
      const rowB = rows.find(r => r.id === 'B');
      const qGain = (maeBaseline !== null && rowB?.maeEst !== null) ? maeBaseline - rowB.maeEst : null;
      verdicts.q = qGain !== null ? (qGain > 1.5 ? `YES — classical Sabine Q reduces MAE by ${fmt1(qGain)} dB` : qGain < -1 ? `NO — Q substitution makes it worse (+${fmt1(-qGain)} dB MAE)` : `MARGINAL — Δ~${fmt1(qGain)} dB`) : '—';

      // Amplitude substitution
      const rowC = rows.find(r => r.id === 'C');
      const ampGain = (maeBaseline !== null && rowC?.maeEst !== null) ? maeBaseline - rowC.maeEst : null;
      verdicts.amp = ampGain !== null ? (ampGain > 1.5 ? `YES — Green's amplitude reduces MAE by ${fmt1(ampGain)} dB` : ampGain < -1 ? `NO — amplitude substitution makes it worse (+${fmt1(-ampGain)} dB)` : `MARGINAL — Δ~${fmt1(ampGain)} dB`) : '—';

      // Normalisation substitution
      const rowD = rows.find(r => r.id === 'D');
      const normGain = (maeBaseline !== null && rowD?.maeEst !== null) ? maeBaseline - rowD.maeEst : null;
      verdicts.norm = normGain !== null ? (normGain > 1.5 ? `YES — ε normalisation reduces MAE by ${fmt1(normGain)} dB` : normGain < -1 ? `NO — normalisation makes it worse (+${fmt1(-normGain)} dB)` : `MARGINAL — Δ~${fmt1(normGain)} dB`) : '—';

      // Full classical
      const rowE = rows.find(r => r.id === 'E');
      const fullGain = (maeBaseline !== null && rowE?.maeEst !== null) ? maeBaseline - rowE.maeEst : null;
      verdicts.full = fullGain !== null ? (fullGain > 2 ? `YES — full classical gets ${fmt1(fullGain)} dB closer to REW` : fullGain < -1 ? `NO — full classical is further (+${fmt1(-fullGain)} dB)` : `MARGINAL — Δ~${fmt1(fullGain)} dB`) : '—';

      // Next investigation
      const gains = [
        { label: 'Q (Variant B)', gain: qGain },
        { label: 'Amplitude/Green\'s (Variant C)', gain: ampGain },
        { label: 'Normalisation ε (Variant D)', gain: normGain },
        { label: 'Full classical (Variant E)', gain: fullGain },
      ].filter(x => x.gain !== null).sort((a, b) => b.gain - a.gain);

      verdicts.next = gains.length > 0 && gains[0].gain > 0.5
        ? `${gains[0].label} — contributed ${fmt1(gains[0].gain)} dB MAE improvement (largest single gain)`
        : 'No single substitution produced a meaningful improvement — summation loop itself may be correct';

      setResults({ rows, verdicts, best, maeBaseline });
      setRunning(false);
    }, 20);
  }

  // ─── Chart data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!results) return [];
    const freqSet = new Set();
    results.rows.forEach(r => { if (r.freqsHz) r.freqsHz.forEach(f => freqSet.add(Math.round(f * 10) / 10)); });
    REW_ESTIMATE.forEach(p => freqSet.add(p.frequency));
    const sorted = Array.from(freqSet).sort((a, b) => a - b).filter(f => f >= 20 && f <= 220);

    const interp = (freqsHz, spl, f) => {
      if (!freqsHz || !spl) return null;
      let best = null, bestD = Infinity;
      for (let i = 0; i < freqsHz.length; i++) {
        const d = Math.abs(freqsHz[i] - f);
        if (d < bestD) { bestD = d; best = i; }
      }
      return (best !== null && bestD < 1.5 && Number.isFinite(spl[best])) ? spl[best] : null;
    };

    return sorted.map(f => {
      const pt = { frequency: f };
      results.rows.forEach(r => {
        pt[`spl_${r.id}`] = r.freqsHz ? interp(r.freqsHz, r.spl, f) : null;
      });
      pt['spl_F'] = interpEstimate(f);
      return pt;
    });
  }, [results]);

  // ─── Styles ──────────────────────────────────────────────────────────────────
  const cell  = { padding: '3px 7px', textAlign: 'right', fontSize: 10, fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle' };
  const cellL = { ...cell, textAlign: 'left' };
  const th    = { ...cell, fontWeight: 700, color: '#1e3a8a', background: '#eff6ff', borderBottom: '2px solid #93c5fd' };
  const thL   = { ...th, textAlign: 'left' };

  const rewData = rewOverlaySeries?.data || null;
  const hasRew = rewData?.length > 1;

  return (
    <details style={{ border: '2px solid #1d4ed8', borderRadius: 8, background: '#eff6ff', padding: '8px 10px', marginBottom: 8 }}>
      <summary style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🧪 Physics Substitution Shootout — which physical term explains REW-like null depth?
      </summary>

      <div style={{ marginTop: 8 }}>
        {/* Description */}
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#1e3a8a', lineHeight: 1.6, marginBottom: 8, background: '#dbeafe', borderRadius: 4, padding: '6px 8px' }}>
          Swaps one physical parameter at a time (Q, modal amplitude, normalisation) to isolate which substitution
          brings the curve closest to the estimated REW reference. Flat 94 dB source, modal-only, live geometry.
          No production defaults are changed. MAE columns compare against the approximate screenshot-derived REW estimate (⚠ not a calibrated measurement).
        </div>

        {/* Run button */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <button
            onClick={run} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#1d4ed8' : '#d1d5db'}`, background: canRun && !running ? '#1d4ed8' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed' }}>
            {running ? 'Running…' : results ? 'Re-run' : 'Run Substitution Shootout'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>Need room dims + seat + at least one sub.</span>}
          {results && !running && seatPos && (
            <span style={{ fontSize: 10, color: '#1e40af', fontFamily: 'monospace' }}>
              Room: {roomDims.widthM?.toFixed(1)}×{roomDims.lengthM?.toFixed(1)}×{roomDims.heightM?.toFixed(1)} m
              {' '}· Subs: {subsForSimulation?.length} · Seat: ({seatPos.x?.toFixed(2)}, {seatPos.y?.toFixed(2)})
            </span>
          )}
        </div>

        {results && (
          <>
            {/* Results table */}
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: 200 }}>Variant</th>
                    <th style={th}>Null Hz</th>
                    <th style={th}>Null dB</th>
                    <th style={th}>Peak Hz</th>
                    <th style={th}>Peak dB</th>
                    <th style={th}>Swing dB</th>
                    <th style={th}>Deep dips</th>
                    <th style={th}>Peaks</th>
                    <th style={th}>~MAE est.</th>
                    <th style={{ ...th, color: hasRew ? '#1e3a8a' : '#9ca3af' }}>MAE REW</th>
                    <th style={{ ...thL, minWidth: 130 }}>vs baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map((row, idx) => {
                    const isBaseline = row.id === 'A';
                    const isBest = results.best?.id === row.id;
                    const maeChange = (!isBaseline && results.maeBaseline !== null && row.maeEst !== null)
                      ? results.maeBaseline - row.maeEst : null;
                    const improved = maeChange !== null && maeChange > 1;
                    const worse = maeChange !== null && maeChange < -1;
                    const bg = isBaseline ? '#dbeafe' : isBest ? '#dcfce7' : idx % 2 === 0 ? '#fff' : '#f9fafb';
                    return (
                      <tr key={row.id} style={{ background: bg }}>
                        <td style={{ ...cellL, minWidth: 200 }}>
                          <div style={{ fontWeight: isBaseline ? 700 : 500, fontSize: 10 }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: VARIANT_CONFIG.find(v => v.id === row.id)?.color, marginRight: 5, verticalAlign: 'middle' }} />
                            {row.label}
                            {isBaseline && <span style={{ marginLeft: 5, fontSize: 9, color: '#1e40af' }}>(baseline)</span>}
                            {isBest && !isBaseline && <span style={{ marginLeft: 5, fontSize: 9, color: '#166534' }}>★ best</span>}
                          </div>
                          <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1, lineHeight: 1.4 }}>{row.description}</div>
                          {row.error && <div style={{ color: '#dc2626', fontSize: 9 }}>⚠ {row.error}</div>}
                        </td>
                        <td style={cell}>{fmt1(row.nullHz)}</td>
                        <td style={{ ...cell, color: row.nullDb !== null && row.nullDb < 75 ? '#dc2626' : '#374151', fontWeight: row.nullDb !== null && row.nullDb < 75 ? 700 : 400 }}>
                          {fmt1(row.nullDb)}
                        </td>
                        <td style={cell}>{fmt1(row.peakHz)}</td>
                        <td style={cell}>{fmt1(row.peakDb)}</td>
                        <td style={{ ...cell, fontWeight: 600 }}>{fmt1(row.swing)}</td>
                        <td style={cell}>{row.deepDips ?? '—'}</td>
                        <td style={cell}>{row.peaks ?? '—'}</td>
                        <td style={{ ...cell, color: isBest ? '#166534' : '#374151', fontWeight: isBest ? 700 : 400 }}>
                          {row.maeEst !== null && row.maeEst !== undefined ? `~${fmt1(row.maeEst)}` : '—'}
                        </td>
                        <td style={{ ...cell, color: hasRew ? (improved ? '#166534' : worse ? '#dc2626' : '#374151') : '#9ca3af', fontWeight: improved || worse ? 700 : 400 }}>
                          {hasRew && row.maeRew !== null ? fmt1(row.maeRew) : '—'}
                        </td>
                        <td style={cellL}>
                          {isBaseline ? <Badge text="baseline" blue /> :
                           improved ? <Badge text={`${fmt1(maeChange)} dB better`} green /> :
                           worse ? <Badge text={`${fmt1(-maeChange)} dB worse`} red /> :
                           maeChange !== null ? <Badge text={`Δ~${fmt1(maeChange)} dB`} /> : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Final verdict panel */}
            <div style={{ border: '2px solid #1d4ed8', borderRadius: 6, background: '#dbeafe', padding: '10px 14px', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.8, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 11, marginBottom: 6 }}>▶ Final Verdict — Physics Substitution Results</div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {[
                    { q: '1. Does replacing Q alone explain the gap?', a: results.verdicts.q },
                    { q: '2. Does replacing modal amplitude explain the gap?', a: results.verdicts.amp },
                    { q: '3. Does replacing modal normalisation explain the gap?', a: results.verdicts.norm },
                    { q: '4. Does the full classical modal reference get closer to REW?', a: results.verdicts.full },
                    { q: '5. Which physical term should be investigated next?', a: results.verdicts.next },
                  ].map(({ q, a }, i) => (
                    <tr key={i}>
                      <td style={{ padding: '3px 6px', verticalAlign: 'top', color: '#1e3a8a', width: '45%', fontWeight: 600 }}>{q}</td>
                      <td style={{ padding: '3px 6px', verticalAlign: 'top', color: '#1f2937' }}>{a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* REW estimate warning */}
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#b45309', marginBottom: 10, lineHeight: 1.5 }}>
              ⚠ ~MAE est. is computed against an approximate, screenshot-derived REW reference — not a calibrated measurement.
              Treat all MAE comparisons as indicative only. Diagnostic only. No production code changed.
            </div>

            {/* Legend + chart */}
            <div style={{ border: '1px solid #bfdbfe', borderRadius: 8, background: '#fff', padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#1d4ed8', marginBottom: 8 }}>
                Visual Comparison — log Hz · 20–220 Hz · no smoothing
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {VARIANT_CONFIG.map(vc => {
                  const active = visibleIds[vc.id];
                  return (
                    <button key={vc.id} onClick={() => toggleId(vc.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 99, border: `2px solid ${active ? vc.color : '#d1d5db'}`, background: active ? `${vc.color}18` : '#f9fafb', color: active ? vc.color : '#9ca3af', fontSize: 10, fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s' }}>
                      <span style={{ display: 'inline-block', width: 18, height: 2, background: active ? vc.color : '#d1d5db', borderRadius: 1 }} />
                      {vc.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ width: '100%', height: 360 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 10, right: 50, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="frequency" type="number" scale="log" domain={[20, 220]}
                      ticks={[20, 30, 40, 50, 60, 70, 80, 100, 120, 150, 200, 220]}
                      tickFormatter={v => String(Math.round(v))}
                      label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -10, fill: '#374151', fontSize: 11 }}
                      tick={{ fill: '#374151', fontSize: 10 }} />
                    <YAxis domain={[60, 120]} ticks={[60, 70, 80, 90, 100, 110, 120]}
                      label={{ value: 'SPL (dB)', angle: -90, position: 'insideLeft', fill: '#374151', fontSize: 11 }}
                      tick={{ fill: '#374151', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#e5e7eb', strokeWidth: 1 }} />
                    <ReferenceLine y={94} stroke="#6b7280" strokeDasharray="2 4" strokeWidth={1} label={{ value: '94 dB', position: 'right', fontSize: 9, fill: '#6b7280' }} />
                    {VARIANT_CONFIG.map(vc => {
                      if (!visibleIds[vc.id]) return null;
                      const isFRow = vc.id === 'F';
                      return (
                        <Line key={vc.id}
                          type="linear"
                          dataKey={`spl_${vc.id}`}
                          stroke={vc.color}
                          strokeWidth={vc.id === 'A' ? 2.5 : 1.5}
                          strokeDasharray={isFRow ? '6 3' : vc.id === 'E' ? '4 2' : undefined}
                          dot={false}
                          activeDot={{ r: 3, fill: vc.color }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </details>
  );
}