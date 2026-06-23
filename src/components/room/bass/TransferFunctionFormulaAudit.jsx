/**
 * TransferFunctionFormulaAudit — Diagnostic only. No production changes.
 * Does not affect live graph.
 *
 * Compares production H(f,f₀,Q) vs Classical 2nd-order term-by-term at
 * 7 evaluation points: f₀ ± {20, 10, 5, 0} Hz.
 *
 * Production (from resonantTransfer in modalCalculations.js):
 *   realDen = 1 − (f/f₀)²
 *   imagDen = (f/f₀) / Q       [NOTE: imagDen = ω/(Q·ω₀) = ratio/Q]
 *   |H_prod| = 1 / √(realDen² + imagDen²)
 *
 * Classical 2nd-order mechanical resonator:
 *   |H_class| = (f₀²) / √((f₀²−f²)² + (f·f₀/Q)²)
 *             = 1 / √((1−(f/f₀)²)² + (f/(f₀·Q))²)
 *   This is identical to production when f₀·Q = f₀·Q — they ARE the same form.
 *   The meaningful difference is the damping term: production uses ratio/Q = f/(f₀·Q),
 *   classical uses f/(f₀·Q). Both resolve to the same: imagDen = ratio/Q.
 *
 * The real difference identified in REW parity analysis is the NUMERATOR structure:
 *   Production: H = (realDen − j·imagDen) / (realDen² + imagDen²)  [full complex]
 *   |H_prod| takes magnitude of the full complex transfer
 *
 *   Classical (magnitude-only form, no phase):
 *   |H_class| = 1 / √((1−r²)² + (r/Q)²)  where r = f/f₀
 *
 * Because production uses Re/Im components from complex division
 *   (re = realDen/den², im = −imagDen/den²)
 * and then transferMag = √(re²+im²) = √(1/den²) = 1/|den|
 * both forms are MATHEMATICALLY IDENTICAL in magnitude.
 *
 * This audit makes that explicit — it shows the term-by-term breakdown so we
 * can confirm whether any numerical difference arises in practice, and then
 * builds the summary statistics the user requested.
 *
 * Targets: 57, 70, 80, 85, 90 Hz (dominant mode at each).
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
} from '@/bass/core/modalCalculations.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const C        = 343;
const MONO     = { fontFamily: 'monospace' };
const TARGET_HZ = [57, 70, 80, 85, 90];
const OFFSETS   = [-20, -10, -5, 0, 5, 10, 20];

// REW benchmark for MAE
const REW_BENCHMARK = [
  { hz: 20, db: 92.5 }, { hz: 25, db: 94.1 }, { hz: 30, db: 95.2 }, { hz: 35, db: 95.8 },
  { hz: 40, db: 96.2 }, { hz: 45, db: 96.5 }, { hz: 50, db: 96.6 }, { hz: 55, db: 96.4 },
  { hz: 60, db: 95.8 }, { hz: 65, db: 94.7 }, { hz: 70, db: 93.2 }, { hz: 75, db: 91.8 },
  { hz: 80, db: 90.5 }, { hz: 85, db: 89.6 }, { hz: 90, db: 89.2 }, { hz: 95, db: 89.4 },
  { hz: 100, db: 90.1 },
];
const FLAT_DB  = 94;
const REF_P    = 20e-6;
const FREQ_STEP = 0.5;

// ── Transfer functions ────────────────────────────────────────────────────────

/**
 * Production — exact mirror of resonantTransfer() in modalCalculations.js
 * Returns { re, im, transferMag, realDen, imagDen, denominatorSq }
 */
function tfProductionFull(f, f0, q) {
  const ratio       = f / Math.max(f0, 1e-6);
  const realDen     = 1 - ratio * ratio;
  const imagDen     = ratio / Math.max(q, 1e-6);
  const denomSq     = realDen * realDen + imagDen * imagDen;
  const re          = realDen  / Math.max(denomSq, 1e-60);
  const im          = -imagDen / Math.max(denomSq, 1e-60);
  const transferMag = Math.sqrt(re * re + im * im);
  return { re, im, transferMag, realDen, imagDen, denomSq, ratio };
}

/**
 * Classical 2nd-order — magnitude-only Lorentzian.
 * |H| = 1 / √((1−r²)² + (r/Q)²)  where r = f/f₀
 *
 * Note: mathematically identical to |H_prod| when both are evaluated correctly.
 * This audit exposes the term-by-term breakdown to confirm numerical parity
 * and shows where any real-world difference could arise from coding choices.
 */
function tfClassicalFull(f, f0, q) {
  const ratio   = f / Math.max(f0, 1e-6);
  const term1   = 1 - ratio * ratio;           // (1 − r²)
  const term2   = ratio / Math.max(q, 1e-6);  // r/Q  (= imagDen in production)
  const denomSq = term1 * term1 + term2 * term2;
  const mag     = 1 / Math.sqrt(Math.max(denomSq, 1e-60));
  return { mag, term1, term2, denomSq, ratio };
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function normSA(sa) {
  const c = k => Math.max(0, Math.min(1, Number.isFinite(Number(sa?.[k])) ? Number(sa[k]) : 0.3));
  return { front: c('front'), back: c('back'), left: c('left'), right: c('right'), floor: c('floor'), ceiling: c('ceiling') };
}

function qForType(type, axialQ) {
  if (type === 'axial')      return axialQ;
  if (type === 'tangential') return 3.9;
  return 2.5;
}

function linspace(lo, hi, step) {
  const out = [];
  for (let f = lo; f <= hi + 1e-9; f += step) out.push(f);
  return out;
}

function computeMAEWithFn(tfFn, roomDims, seat, sub, sa, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const nSA   = normSA(sa);
  const sourceP = Math.pow(10, FLAT_DB / 20);
  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: C });
  const freqs = linspace(20, 200, FREQ_STEP);

  const series = freqs.map(hz => {
    let sumP = 0;
    for (const m of rawModes) {
      const baseQ = qForType(m.type, axialQ);
      const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: nSA, f0: m.freq });
      const q     = Math.max(1, Math.min(baseQ, absQ));
      const ψs    = modeShapeValueLocal(m, Number(sub.x),  Number(sub.y),  subZ,  { widthM, lengthM, heightM });
      const ψr    = modeShapeValueLocal(m, Number(seat.x), Number(seat.y), seatZ, { widthM, lengthM, heightM });
      sumP += Math.abs(ψs * ψr) * sourceP * tfFn(hz, m.freq, q);
    }
    return { hz, db: sumP > 0 ? 20 * Math.log10(sumP / REF_P) : null };
  });

  const errors = REW_BENCHMARK.map(pt => {
    const s = series.find(d => Math.abs(d.hz - pt.hz) < 1);
    return (s && s.db != null) ? Math.abs(s.db - pt.db) : null;
  }).filter(v => v != null);

  return errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
}

function findDominantMode(targetHz, roomDims, seat, sub, sa, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const nSA   = normSA(sa);
  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: C });

  let best = null, bestScore = -1;
  for (const m of rawModes) {
    const baseQ = qForType(m.type, axialQ);
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: nSA, f0: m.freq });
    const q     = Math.max(1, Math.min(baseQ, absQ));
    const ψs    = modeShapeValueLocal(m, Number(sub.x),  Number(sub.y),  subZ,  { widthM, lengthM, heightM });
    const ψr    = modeShapeValueLocal(m, Number(seat.x), Number(seat.y), seatZ, { widthM, lengthM, heightM });
    const score = Math.abs(ψs * ψr) * tfProductionFull(targetHz, m.freq, q).transferMag;
    if (score > bestScore) { bestScore = score; best = { ...m, q, ψs, ψr, coupling: ψs * ψr }; }
  }
  return best;
}

function runForHz(targetHz, roomDims, seat, sub, sa, axialQ) {
  const dom = findDominantMode(targetHz, roomDims, seat, sub, sa, axialQ);
  if (!dom) return null;

  const f0 = dom.freq;
  const q  = dom.q;

  // 7 evaluation points
  const evalPoints = OFFSETS.map(offset => {
    const f = Math.max(0.1, f0 + offset);
    const prod = tfProductionFull(f, f0, q);
    const clas = tfClassicalFull(f, f0, q);
    const prodMag = prod.transferMag;
    const clasMag = clas.mag;
    const ratio   = clasMag > 1e-30 ? prodMag / clasMag : null;
    const diffDb  = (prodMag > 1e-30 && clasMag > 1e-30)
      ? 20 * Math.log10(prodMag / clasMag)
      : null;
    return { offset, f, prod, clas, prodMag, clasMag, ratio, diffDb };
  });

  // Summary stats
  const ratios  = evalPoints.map(p => p.ratio).filter(Number.isFinite);
  const avgRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
  const peakRatio = ratios.length ? Math.max(...ratios) : null;
  const diffs   = evalPoints.map(p => p.diffDb).filter(Number.isFinite);

  // At-resonance vs off-resonance excess
  const atRes   = evalPoints.find(p => p.offset === 0);
  const offRes  = evalPoints.filter(p => p.offset !== 0);
  const atResDiffDb  = atRes?.diffDb ?? null;
  const maxOffResDiffDb = offRes.length ? Math.max(...offRes.map(p => p.diffDb ?? -Infinity)) : null;

  // Consistent direction
  const allHigher  = diffs.every(d => d > 0);
  const allLower   = diffs.every(d => d < 0);
  const direction  = allHigher ? 'consistently_higher' : allLower ? 'consistently_lower' : 'frequency_dependent';

  // MAE comparison
  const maeProduction = computeMAEWithFn((f, f0, q) => tfProductionFull(f, f0, q).transferMag, roomDims, seat, sub, sa, axialQ);
  const maeClassical  = computeMAEWithFn((f, f0, q) => tfClassicalFull(f, f0, q).mag,          roomDims, seat, sub, sa, axialQ);

  return { dom, f0, q, evalPoints, avgRatio, peakRatio, direction, atResDiffDb, maxOffResDiffDb, maeProduction, maeClassical };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const TH  = { padding: '3px 6px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', textAlign: 'right', whiteSpace: 'nowrap' };
const THL = { ...TH, textAlign: 'left' };
const TD  = { padding: '2px 6px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
const TDL = { ...TD, textAlign: 'left' };

const fmt6 = v => Number.isFinite(Number(v)) ? Number(v).toFixed(6) : '—';
const fmt4 = v => Number.isFinite(Number(v)) ? Number(v).toFixed(4) : '—';
const fmt3 = v => Number.isFinite(Number(v)) ? Number(v).toFixed(3) : '—';
const fmt2 = v => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—';
const fmtDb = v => Number.isFinite(Number(v)) ? (Number(v) >= 0 ? '+' : '') + Number(v).toFixed(3) + ' dB' : '—';

// ── Sub-components ────────────────────────────────────────────────────────────

function ModeHeader({ targetHz, result }) {
  const { dom, f0, q } = result;
  return (
    <div style={{ padding: '5px 10px', background: '#1c1917', borderLeft: '3px solid #a78bfa', borderRadius: 4, fontSize: 9, ...MONO, color: '#d6d3d1', marginBottom: 8, lineHeight: 1.9 }}>
      <span style={{ color: '#a78bfa', fontWeight: 700 }}>Dominant mode @ {targetHz} Hz: </span>
      ({dom.nx},{dom.ny},{dom.nz}) {dom.type}
      &nbsp;· f₀ = {fmt2(f0)} Hz · Q = {fmt2(q)}
      &nbsp;· ψ coupling = {fmt6(dom.coupling)}
    </div>
  );
}

function FormulaBox() {
  return (
    <div style={{ padding: '6px 10px', background: '#110f0e', borderRadius: 4, fontSize: 8, ...MONO, color: '#78716c', marginBottom: 10, lineHeight: 2.0 }}>
      <div style={{ color: '#60a5fa', fontWeight: 700, marginBottom: 2 }}>Formula definitions:</div>
      <div><span style={{ color: '#60a5fa' }}>Production:</span> r = f/f₀ · realDen = 1−r² · imagDen = r/Q · den² = realDen²+imagDen² · re = realDen/den² · im = −imagDen/den² · |H| = √(re²+im²) = 1/√(den²)</div>
      <div><span style={{ color: '#fb923c' }}>Classical:</span>  r = f/f₀ · term1 = 1−r² · term2 = r/Q · |H| = 1/√(term1²+term2²)</div>
      <div style={{ color: '#fbbf24', marginTop: 2 }}>⚠ These are mathematically identical in magnitude. This audit exposes any numerical divergence and categorises where it occurs.</div>
    </div>
  );
}

function EvalTable({ evalPoints, f0 }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 820 }}>
        <thead>
          <tr>
            <th style={{ ...THL, minWidth: 58 }}>Offset</th>
            <th style={{ ...TH,  minWidth: 52 }}>f (Hz)</th>
            <th style={{ ...TH,  minWidth: 58 }}>r = f/f₀</th>
            <th style={{ ...TH,  minWidth: 68 }}>realDen</th>
            <th style={{ ...TH,  minWidth: 68 }}>imagDen</th>
            <th style={{ ...TH,  minWidth: 68 }}>den²</th>
            <th style={{ ...TH,  minWidth: 68, color: '#93c5fd' }}>|H| prod</th>
            <th style={{ ...TH,  minWidth: 68, color: '#fdba74' }}>|H| class</th>
            <th style={{ ...TH,  minWidth: 72 }}>Ratio P/C</th>
            <th style={{ ...TH,  minWidth: 80 }}>Diff (dB)</th>
            <th style={{ ...THL, minWidth: 80 }}>Region</th>
          </tr>
        </thead>
        <tbody>
          {evalPoints.map(pt => {
            const isRes = pt.offset === 0;
            const diffColor = pt.diffDb == null ? '#57534e'
              : Math.abs(pt.diffDb) < 0.001 ? '#4ade80'
              : Math.abs(pt.diffDb) > 3 ? '#f87171'
              : '#fbbf24';
            const ratioColor = pt.ratio == null ? '#57534e'
              : Math.abs(pt.ratio - 1) < 0.001 ? '#4ade80'
              : Math.abs(pt.ratio - 1) > 0.1 ? '#f87171'
              : '#fbbf24';
            return (
              <tr key={pt.offset} style={{ background: isRes ? '#1a1205' : 'transparent', borderBottom: '1px solid #1c1917' }}>
                <td style={{ ...TDL, color: isRes ? '#fbbf24' : '#78716c', fontWeight: isRes ? 700 : 400 }}>
                  {pt.offset === 0 ? 'f₀ (resonance)' : `f₀ ${pt.offset > 0 ? '+' : ''}${pt.offset} Hz`}
                </td>
                <td style={{ ...TD, color: '#d6d3d1' }}>{fmt2(pt.f)}</td>
                <td style={{ ...TD, color: '#78716c' }}>{fmt6(pt.prod.ratio)}</td>
                <td style={{ ...TD, color: '#78716c' }}>{fmt6(pt.prod.realDen)}</td>
                <td style={{ ...TD, color: '#78716c' }}>{fmt6(pt.prod.imagDen)}</td>
                <td style={{ ...TD, color: '#57534e' }}>{fmt6(pt.prod.denomSq)}</td>
                <td style={{ ...TD, color: '#93c5fd', fontWeight: isRes ? 700 : 400 }}>{fmt6(pt.prodMag)}</td>
                <td style={{ ...TD, color: '#fdba74', fontWeight: isRes ? 700 : 400 }}>{fmt6(pt.clasMag)}</td>
                <td style={{ ...TD, color: ratioColor, fontWeight: isRes ? 700 : 400 }}>{fmt6(pt.ratio)}</td>
                <td style={{ ...TD, color: diffColor, fontWeight: isRes ? 700 : 400 }}>{fmtDb(pt.diffDb)}</td>
                <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>{isRes ? '★ resonance' : Math.abs(pt.offset) >= 10 ? 'off-res tail' : 'near-res'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryPanel({ result }) {
  const { avgRatio, peakRatio, direction, atResDiffDb, maxOffResDiffDb, maeProduction, maeClassical } = result;
  const maeImprovement = (maeProduction != null && maeClassical != null) ? maeProduction - maeClassical : null;

  const isPeakOverAmp  = atResDiffDb != null && atResDiffDb > 3;
  const isTailOverAmp  = maxOffResDiffDb != null && maxOffResDiffDb > 3;
  const isPrimaryDriver = maeImprovement != null && maeImprovement > 1 && (avgRatio ?? 0) > 1;

  const dirLabel = {
    consistently_higher: 'Production consistently HIGHER than classical',
    consistently_lower:  'Production consistently LOWER than classical',
    frequency_dependent: 'Direction varies by frequency',
  }[direction] ?? direction;

  return (
    <div style={{ padding: '8px 12px', background: '#1c1917', borderRadius: 6, fontSize: 9, ...MONO, lineHeight: 1.9 }}>
      <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 6, fontSize: 10 }}>Summary</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 20px', marginBottom: 8 }}>
        <div><span style={{ color: '#57534e' }}>Avg ratio (prod/class): </span>
          <span style={{ color: avgRatio != null && Math.abs(avgRatio - 1) > 0.01 ? '#fbbf24' : '#4ade80', fontWeight: 700 }}>
            {avgRatio != null ? avgRatio.toFixed(6) : '—'}
          </span>
        </div>
        <div><span style={{ color: '#57534e' }}>Peak ratio (prod/class): </span>
          <span style={{ color: peakRatio != null && peakRatio > 1.01 ? '#f87171' : '#4ade80', fontWeight: 700 }}>
            {peakRatio != null ? peakRatio.toFixed(6) : '—'}
          </span>
        </div>
        <div><span style={{ color: '#57534e' }}>Direction: </span>
          <span style={{ color: '#d6d3d1', fontWeight: 700 }}>{dirLabel}</span>
        </div>
        <div><span style={{ color: '#57534e' }}>At-resonance excess: </span>
          <span style={{ color: isPeakOverAmp ? '#f87171' : '#4ade80', fontWeight: 700 }}>{fmtDb(atResDiffDb)}</span>
        </div>
        <div><span style={{ color: '#57534e' }}>Max off-resonance excess: </span>
          <span style={{ color: isTailOverAmp ? '#f87171' : '#4ade80', fontWeight: 700 }}>{fmtDb(maxOffResDiffDb)}</span>
        </div>
        <div style={{ borderTop: '1px solid #292524', paddingTop: 4, gridColumn: '1 / -1' }} />
        <div><span style={{ color: '#57534e' }}>MAE production: </span>
          <span style={{ color: '#93c5fd', fontWeight: 700 }}>{maeProduction != null ? maeProduction.toFixed(3) + ' dB' : '—'}</span>
        </div>
        <div><span style={{ color: '#57534e' }}>MAE classical: </span>
          <span style={{ color: '#fdba74', fontWeight: 700 }}>{maeClassical != null ? maeClassical.toFixed(3) + ' dB' : '—'}</span>
        </div>
        <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#57534e' }}>MAE improvement (prod→class): </span>
          <span style={{ color: maeImprovement != null && maeImprovement > 1 ? '#4ade80' : maeImprovement != null && maeImprovement < 0 ? '#f87171' : '#78716c', fontWeight: 700 }}>
            {maeImprovement != null ? (maeImprovement >= 0 ? '+' : '') + maeImprovement.toFixed(3) + ' dB' : '—'}
          </span>
        </div>
      </div>

      {/* Verdicts */}
      <div style={{ borderTop: '1px solid #292524', paddingTop: 6 }}>
        <div style={{ fontWeight: 700, color: '#d6d3d1', marginBottom: 4 }}>Interpretation:</div>

        {isPeakOverAmp && (
          <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 2 }}>
            ⚠ "Production transfer function peak is over-amplified."
            <span style={{ fontWeight: 400, color: '#78716c' }}> At-resonance excess = {fmtDb(atResDiffDb)} (&gt;3 dB threshold).</span>
          </div>
        )}
        {isTailOverAmp && (
          <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 2 }}>
            ⚠ "Production transfer function bandwidth/tail is over-amplified."
            <span style={{ fontWeight: 400, color: '#78716c' }}> Max off-resonance excess = {fmtDb(maxOffResDiffDb)} (&gt;3 dB threshold).</span>
          </div>
        )}
        {isPrimaryDriver && (
          <div style={{ color: '#4ade80', fontWeight: 700, marginBottom: 2 }}>
            ✓ "Transfer-function implementation is a primary REW parity driver."
            <span style={{ fontWeight: 400, color: '#78716c' }}> Classical reduces MAE by {maeImprovement?.toFixed(2)} dB and production is consistently higher.</span>
          </div>
        )}
        {!isPeakOverAmp && !isTailOverAmp && !isPrimaryDriver && (
          <div style={{ color: '#d6d3d1' }}>
            Transfer-function shape difference is numerically negligible (&lt;3 dB).
            Parity gap originates elsewhere (source amplitude, coupling, or geometry).
          </div>
        )}
        <div style={{ color: '#44403c', fontSize: 8, marginTop: 4 }}>
          Thresholds: at-resonance / tail excess &gt;3 dB → over-amplified · MAE improvement &gt;1 dB + prod consistently higher → primary driver
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TransferFunctionFormulaAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState(null);
  const [activeHz, setActiveHz] = useState(57);

  const axialQ = Number.isFinite(activeSettings?.axialQ) ? activeSettings.axialQ : 4.0;

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null && sub?.x != null && sub?.y != null
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true); setError(null); setResults(null);
    await new Promise(r => setTimeout(r, 0));
    try {
      const byHz = {};
      for (const hz of TARGET_HZ) {
        await new Promise(r => setTimeout(r, 0));
        byHz[hz] = runForHz(hz, roomDims, seat, sub, surfaceAbsorption, axialQ);
      }
      setResults(byHz);
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ, canRun]);

  const active = results?.[activeHz];

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Transfer Function Formula Comparison Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Term-by-term comparison of production H(f,f₀,Q) vs classical 2nd-order at 7 evaluation points per dominant mode.
        Identifies whether differences are at-resonance, off-resonance, and whether they drive the REW parity gap.
      </div>

      {!canRun && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Need room, seat, and sub configured.</div>}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #57534e', background: running ? '#1c1917' : '#292524',
          color: running || !canRun ? '#57534e' : '#d6d3d1', fontSize: 11, ...MONO,
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 10,
        }}
      >
        {running ? 'Computing…' : results ? 'Re-run Formula Audit' : 'Run Transfer Function Formula Comparison Audit'}
      </button>

      {error && <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ {error}</div>}

      {results && (
        <>
          {/* Frequency tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {TARGET_HZ.map(hz => {
              const d = results[hz];
              const isActive = hz === activeHz;
              const hasData = d != null;
              return (
                <button key={hz} onClick={() => setActiveHz(hz)} style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 9, ...MONO, cursor: 'pointer',
                  border: isActive ? '1px solid #60a5fa' : '1px solid #292524',
                  background: isActive ? '#1e3a5f' : '#1c1917',
                  color: isActive ? '#93c5fd' : '#78716c', fontWeight: isActive ? 700 : 400,
                }}>
                  {hz} Hz
                  {hasData && <span style={{ marginLeft: 4, color: '#57534e' }}>f₀={d.f0.toFixed(1)}</span>}
                </button>
              );
            })}
          </div>

          {active && (
            <>
              <ModeHeader targetHz={activeHz} result={active} />
              <FormulaBox />

              <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
                Term-by-term evaluation at f₀ = {active.f0.toFixed(2)} Hz, Q = {active.q.toFixed(2)}
              </div>
              <EvalTable evalPoints={active.evalPoints} f0={active.f0} />
              <SummaryPanel result={active} />
            </>
          )}
        </>
      )}
    </div>
  );
}