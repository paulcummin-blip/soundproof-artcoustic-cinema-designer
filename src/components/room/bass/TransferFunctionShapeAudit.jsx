/**
 * TransferFunctionShapeAudit — Diagnostic only. No production changes.
 *
 * Compares the modal transfer-function shape used by rewBassEngine.js against
 * 4 alternative physically-plausible formulations at ±30 Hz around f₀.
 *
 * Variants:
 *   A) Production H(f,f0,Q) — exactly from resonantTransfer() in modalCalculations.js
 *   B) Magnitude-only Lorentzian  — |1 / (1 - (f/f0)² + j·f/(f0·Q))|
 *   C) Classical 2nd-order resonator — same denominator, magnitude only, no (1-ratio²) sign flip
 *   D) Energy-normalised resonator — scaled so ∫|H|² df = ∫|H_prod|² df
 *   E) Constant-area resonator — scaled so ∫|H| df = ∫|H_prod| df
 *
 * For each variant: peak gain, -3 dB bandwidth, integrated area, modal SPL, MAE vs REW benchmark.
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
} from '@/bass/core/modalCalculations.js';

// ── REW benchmark (same data used across all audits) ─────────────────────────
const REW_BENCHMARK = [
  { hz: 20, db: 92.5 }, { hz: 25, db: 94.1 }, { hz: 30, db: 95.2 }, { hz: 35, db: 95.8 },
  { hz: 40, db: 96.2 }, { hz: 45, db: 96.5 }, { hz: 50, db: 96.6 }, { hz: 55, db: 96.4 },
  { hz: 60, db: 95.8 }, { hz: 65, db: 94.7 }, { hz: 70, db: 93.2 }, { hz: 75, db: 91.8 },
  { hz: 80, db: 90.5 }, { hz: 85, db: 89.6 }, { hz: 90, db: 89.2 }, { hz: 95, db: 89.4 },
  { hz: 100, db: 90.1 },
];

const FREQ_STEP   = 0.5;   // Hz resolution for curves
const TARGET_HZ   = [40, 57, 70, 80, 85, 90];
const FLAT_DB     = 94;
const C           = 343;
const MONO        = { fontFamily: 'monospace' };
const REF_P       = 20e-6; // 20 µPa

// ── Transfer-function variants ────────────────────────────────────────────────

/** A) Production — exactly mirrors resonantTransfer() in modalCalculations.js */
function tfProduction(f, f0, q) {
  const ratio    = f / Math.max(f0, 1e-6);
  const realDen  = 1 - ratio * ratio;
  const imagDen  = ratio / Math.max(q, 1e-6);
  const den2     = realDen * realDen + imagDen * imagDen;
  return Math.sqrt(1 / Math.max(den2, 1e-30));  // |H| = 1/√(den²)
}

/** B) Magnitude-only Lorentzian — classical half-power form |1/(1-(f/f0)²+j·f/(f0·Q))| */
function tfLorentzian(f, f0, q) {
  const r    = f / Math.max(f0, 1e-6);
  const real = 1 - r * r;
  const imag = r / Math.max(q, 1e-6);
  return Math.sqrt(1 / Math.max(real * real + imag * imag, 1e-30));
}

/** C) Classical 2nd-order — no sign on imaginary, uses +j damping term */
function tfClassical2ndOrder(f, f0, q) {
  const r    = f / Math.max(f0, 1e-6);
  const real = 1 - r * r;
  const imag = r / Math.max(q, 1e-6);
  // identical to Lorentzian but with numerator = 1/(q·r) — peaks at damping null
  const num  = 1 / Math.max(q * r, 1e-9);
  return num / Math.sqrt(Math.max(real * real + imag * imag, 1e-30));
}

/** D) Energy-normalised — same shape as production, rescaled so ∫|H|² = 1 over range */
function buildEnergyNorm(freqs, f0, q) {
  const raw   = freqs.map(f => tfProduction(f, f0, q));
  const energy = raw.reduce((s, v) => s + v * v * FREQ_STEP, 0);
  const norm   = Math.sqrt(Math.max(energy, 1e-30));
  return freqs.map((_, i) => raw[i] / norm);
}

/** E) Constant-area — same shape as production, rescaled so ∫|H| = 1 over range */
function buildAreaNorm(freqs, f0, q) {
  const raw  = freqs.map(f => tfProduction(f, f0, q));
  const area = raw.reduce((s, v) => s + v * FREQ_STEP, 0);
  const norm = Math.max(area, 1e-30);
  return freqs.map((_, i) => raw[i] / norm);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function linspace(lo, hi, step) {
  const out = [];
  for (let f = lo; f <= hi + 1e-9; f += step) out.push(f);
  return out;
}

function peakGain(vals) { return Math.max(...vals); }

function bandwidth3dB(freqs, vals) {
  const pk = peakGain(vals);
  const thresh = pk / Math.sqrt(2);
  let lo = null, hi = null;
  for (let i = 0; i < freqs.length; i++) {
    if (vals[i] >= thresh) { if (lo === null) lo = freqs[i]; hi = freqs[i]; }
  }
  return lo === null ? null : hi - lo;
}

function integratedArea(vals) {
  return vals.reduce((s, v) => s + v * FREQ_STEP, 0);
}

function modalSplDb(transferMag, coupling, sourceP) {
  const pressure = Math.abs(coupling) * sourceP * Math.abs(transferMag);
  return pressure > 0 ? 20 * Math.log10(pressure / REF_P) : null;
}

function interpolateDb(benchmark, hz) {
  let lo = null, hi = null;
  for (const pt of benchmark) {
    if (pt.hz <= hz) lo = pt;
    if (pt.hz >= hz && !hi) hi = pt;
  }
  if (!lo && hi) return hi.db;
  if (lo && !hi) return lo.db;
  if (!lo && !hi) return null;
  if (lo.hz === hi.hz) return lo.db;
  const t = (hz - lo.hz) / (hi.hz - lo.hz);
  return lo.db + t * (hi.db - lo.db);
}

function computeMAE(splSeries, benchmark) {
  const errors = [];
  for (const pt of benchmark) {
    const s = splSeries.find(d => Math.abs(d.hz - pt.hz) < 1);
    if (s && s.db != null) errors.push(Math.abs(s.db - pt.db));
  }
  return errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
}

function normSA(sa) {
  const c = k => Math.max(0, Math.min(1, Number.isFinite(Number(sa?.[k])) ? Number(sa[k]) : 0.3));
  return { front: c('front'), back: c('back'), left: c('left'), right: c('right'), floor: c('floor'), ceiling: c('ceiling') };
}

function qForType(type, axialQ) {
  if (type === 'axial') return axialQ;
  if (type === 'tangential') return 3.9;
  return 2.5;
}

// ── Find dominant mode at a target Hz ─────────────────────────────────────────
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
    const score = Math.abs(ψs * ψr) * tfProduction(targetHz, m.freq, q);
    if (score > bestScore) { bestScore = score; best = { ...m, q, ψs, ψr, coupling: ψs * ψr }; }
  }
  return best;
}

// ── Build frequency-response series for one variant over 20–200 Hz ───────────
function buildFullSeries(variantFn, variantVals, roomDims, seat, sub, sa, axialQ, sourceP) {
  const { widthM, lengthM, heightM } = roomDims;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const nSA   = normSA(sa);
  const freqs = linspace(20, 200, FREQ_STEP);
  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: C });

  return freqs.map(hz => {
    let sumP = 0;
    for (const m of rawModes) {
      const baseQ = qForType(m.type, axialQ);
      const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: nSA, f0: m.freq });
      const q     = Math.max(1, Math.min(baseQ, absQ));
      const ψs    = modeShapeValueLocal(m, Number(sub.x),  Number(sub.y),  subZ,  { widthM, lengthM, heightM });
      const ψr    = modeShapeValueLocal(m, Number(seat.x), Number(seat.y), seatZ, { widthM, lengthM, heightM });
      const tf    = variantFn ? variantFn(hz, m.freq, q) : 0;
      sumP += Math.abs(ψs * ψr) * sourceP * tf;
    }
    const db = sumP > 0 ? 20 * Math.log10(sumP / REF_P) : null;
    return { hz, db };
  });
}

// ── Main computation ──────────────────────────────────────────────────────────
function runAudit(targetHz, roomDims, seat, sub, sa, axialQ) {
  const dom = findDominantMode(targetHz, roomDims, seat, sub, sa, axialQ);
  if (!dom) return null;

  const f0 = dom.freq;
  const q  = dom.q;
  const fLo = Math.max(1, f0 - 30);
  const fHi = f0 + 30;
  const freqs = linspace(fLo, fHi, FREQ_STEP);

  const sourceP = Math.pow(10, FLAT_DB / 20);

  // ── Variant curves over ±30 Hz ─────────────────────────────────────────────
  const curveA = freqs.map(f => tfProduction(f, f0, q));
  const curveB = freqs.map(f => tfLorentzian(f, f0, q));
  const curveC = freqs.map(f => tfClassical2ndOrder(f, f0, q));
  const curveD = buildEnergyNorm(freqs, f0, q);
  const curveE = buildAreaNorm(freqs, f0, q);

  const variants = [
    { id: 'A', label: 'Production H(f,f0,Q)', color: '#60a5fa', vals: curveA, fn: (f, f0, q) => tfProduction(f, f0, q) },
    { id: 'B', label: 'Magnitude-only Lorentzian', color: '#4ade80', vals: curveB, fn: (f, f0, q) => tfLorentzian(f, f0, q) },
    { id: 'C', label: 'Classical 2nd-order', color: '#fb923c', vals: curveC, fn: (f, f0, q) => tfClassical2ndOrder(f, f0, q) },
    { id: 'D', label: 'Energy-normalised', color: '#a78bfa', vals: curveD, fn: null },
    { id: 'E', label: 'Constant-area', color: '#f472b6', vals: curveE, fn: null },
  ];

  // Metrics per variant (over ±30 Hz window)
  const metrics = variants.map(v => ({
    ...v,
    peakGain:  peakGain(v.vals),
    bw3dB:     bandwidth3dB(freqs, v.vals),
    area:      integratedArea(v.vals),
    modalSpl:  modalSplDb(v.vals[Math.round(v.vals.length / 2)], dom.coupling, sourceP),
  }));

  // ── Full-range 20–200 Hz series + MAE (only for variants with a fn) ─────────
  const maes = {};
  for (const v of variants) {
    if (!v.fn) { maes[v.id] = null; continue; }
    const series = buildFullSeries(v.fn, null, roomDims, seat, sub, sa, axialQ, sourceP);
    maes[v.id] = computeMAE(series, REW_BENCHMARK);
  }

  return { dom, f0, q, freqs, metrics, maes, sourceP };
}

// ── Micro chart (SVG) ─────────────────────────────────────────────────────────
function OverlayChart({ freqs, metrics }) {
  const W = 480, H = 140, PL = 40, PR = 10, PT = 10, PB = 28;
  const cW = W - PL - PR, cH = H - PT - PB;

  const allVals = metrics.flatMap(m => m.vals);
  const maxV    = Math.max(...allVals.filter(Number.isFinite));
  const minV    = 0;
  const rangeV  = Math.max(maxV - minV, 1e-6);
  const fLo     = freqs[0], fRange = freqs[freqs.length - 1] - fLo;

  const toX = (f) => PL + ((f - fLo) / fRange) * cW;
  const toY = (v) => PT + (1 - (v - minV) / rangeV) * cH;

  const ticks = [0, 0.25, 0.5, 0.75, 1.0].map(t => ({
    v: minV + t * rangeV, y: PT + (1 - t) * cH,
  }));
  const fTicks = [freqs[0], freqs[Math.round(freqs.length / 2)], freqs[freqs.length - 1]];

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {/* Grid */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PL} y1={t.y} x2={PL + cW} y2={t.y} stroke="#292524" strokeWidth={0.5} />
          <text x={PL - 4} y={t.y + 3} textAnchor="end" fill="#57534e" fontSize={7} fontFamily="monospace">{t.v.toFixed(1)}</text>
        </g>
      ))}
      {fTicks.map((f, i) => (
        <text key={i} x={toX(f)} y={H - PB + 14} textAnchor="middle" fill="#57534e" fontSize={7} fontFamily="monospace">{f.toFixed(0)} Hz</text>
      ))}

      {/* Variant curves */}
      {metrics.map(v => {
        const pts = freqs.map((f, i) => `${toX(f)},${toY(v.vals[i])}`).join(' ');
        return <polyline key={v.id} points={pts} fill="none" stroke={v.color} strokeWidth={v.id === 'A' ? 2 : 1.2} strokeDasharray={v.id === 'A' ? undefined : '3,2'} />;
      })}

      {/* Legend */}
      {metrics.map((v, i) => (
        <g key={v.id} transform={`translate(${PL + i * 90}, ${H - 6})`}>
          <line x1={0} y1={0} x2={12} y2={0} stroke={v.color} strokeWidth={v.id === 'A' ? 2 : 1.2} strokeDasharray={v.id === 'A' ? undefined : '3,2'} />
          <text x={15} y={3} fill={v.color} fontSize={7} fontFamily="monospace">{v.id}) {v.label.split(' ').slice(0, 2).join(' ')}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const TH  = { padding: '3px 7px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', textAlign: 'right', whiteSpace: 'nowrap' };
const THL = { ...TH, textAlign: 'left' };
const TD  = { padding: '2px 7px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
const TDL = { ...TD, textAlign: 'left' };

const VARIANT_COLORS = { A: '#60a5fa', B: '#4ade80', C: '#fb923c', D: '#a78bfa', E: '#f472b6' };

// ── Component ─────────────────────────────────────────────────────────────────
export default function TransferFunctionShapeAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results, setResults]   = useState(null);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState(null);
  const [activeHz, setActiveHz] = useState(40);

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
        byHz[hz] = runAudit(hz, roomDims, seat, sub, surfaceAbsorption, axialQ);
      }
      setResults(byHz);
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ, canRun]);

  const active = results?.[activeHz];
  const prodMAE = active?.maes?.A;

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Transfer Function Shape Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Compares 5 transfer-function shapes over ±30 Hz around the dominant mode f₀.
        MAE vs REW benchmark computed over 20–200 Hz for variants A–C.
        Variants D–E are window-only (rescaled globally — MAE not computed).
      </div>

      {!canRun && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Need room, seat, and sub.</div>}

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
        {running ? 'Computing…' : results ? 'Re-run' : 'Run Transfer Function Shape Audit'}
      </button>

      {error && <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ {error}</div>}

      {results && (
        <>
          {/* Frequency tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {TARGET_HZ.map(hz => {
              const d = results[hz];
              const bestMAE = d ? Math.min(...Object.values(d.maes).filter(Number.isFinite)) : null;
              const isActive = hz === activeHz;
              return (
                <button key={hz} onClick={() => setActiveHz(hz)} style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 9, ...MONO, cursor: 'pointer',
                  border: isActive ? '1px solid #60a5fa' : '1px solid #292524',
                  background: isActive ? '#1e3a5f' : '#1c1917',
                  color: isActive ? '#93c5fd' : '#78716c', fontWeight: isActive ? 700 : 400,
                }}>
                  {hz} Hz
                  {d?.dom && <span style={{ marginLeft: 5, color: '#57534e' }}>f₀={d.f0.toFixed(1)}</span>}
                </button>
              );
            })}
          </div>

          {active && (() => {
            const { dom, f0, q, freqs, metrics, maes } = active;

            // Rank by MAE (A/B/C only)
            const rankedByMAE = metrics
              .filter(v => maes[v.id] != null)
              .sort((a, b) => maes[a.id] - maes[b.id]);

            const bestMAE = rankedByMAE[0] ? maes[rankedByMAE[0].id] : null;
            const prodIsNotBest = rankedByMAE[0]?.id !== 'A';
            const improvement = (prodMAE != null && bestMAE != null) ? prodMAE - bestMAE : null;
            const isPrimaryDriver = improvement != null && improvement > 1;

            return (
              <>
                {/* Mode info */}
                <div style={{ padding: '5px 10px', background: '#1c1917', borderLeft: '3px solid #a78bfa', borderRadius: 4, fontSize: 9, ...MONO, color: '#d6d3d1', marginBottom: 10, lineHeight: 1.9 }}>
                  <span style={{ color: '#a78bfa', fontWeight: 700 }}>Dominant mode @ {activeHz} Hz: </span>
                  ({dom.nx},{dom.ny},{dom.nz}) {dom.type} · f₀ = {f0.toFixed(2)} Hz · Q = {q.toFixed(2)}
                  · ψ coupling = {dom.coupling.toFixed(6)} · window: {freqs[0].toFixed(1)}–{freqs[freqs.length - 1].toFixed(1)} Hz
                </div>

                {/* Overlay chart */}
                <div style={{ marginBottom: 10, background: '#110f0e', borderRadius: 6, padding: '6px 4px', overflow: 'hidden' }}>
                  <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 4, paddingLeft: 8 }}>
                    Transfer magnitude |H(f)| — ±30 Hz around f₀ = {f0.toFixed(1)} Hz
                  </div>
                  <OverlayChart freqs={freqs} metrics={metrics} />
                </div>

                {/* MAE table (A/B/C) */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
                  Ranked MAE vs REW benchmark (20–200 Hz)
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: 480 }}>
                    <thead>
                      <tr>
                        <th style={{ ...THL, minWidth: 20 }}>Rank</th>
                        <th style={{ ...THL, minWidth: 22 }}>ID</th>
                        <th style={{ ...THL, minWidth: 200 }}>Variant</th>
                        <th style={{ ...TH, minWidth: 70 }}>MAE (dB)</th>
                        <th style={{ ...TH, minWidth: 80 }}>ΔvsProd (dB)</th>
                        <th style={{ ...THL, minWidth: 80 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedByMAE.map((v, i) => {
                        const mae = maes[v.id];
                        const delta = mae != null && prodMAE != null ? prodMAE - mae : null;
                        const isProd = v.id === 'A';
                        const isBest = i === 0;
                        const col = VARIANT_COLORS[v.id];
                        return (
                          <tr key={v.id} style={{ background: isBest && !isProd ? '#1a1205' : 'transparent', borderBottom: '1px solid #1c1917' }}>
                            <td style={{ ...TDL, color: isBest ? '#fbbf24' : '#57534e', fontWeight: isBest ? 700 : 400 }}>{i + 1}</td>
                            <td style={{ ...TDL, color: col, fontWeight: 700 }}>{v.id}</td>
                            <td style={{ ...TDL, color: '#d6d3d1' }}>{v.label}</td>
                            <td style={{ ...TD, color: isBest ? '#4ade80' : '#d6d3d1', fontWeight: isBest ? 700 : 400 }}>
                              {mae != null ? mae.toFixed(3) : '—'}
                            </td>
                            <td style={{ ...TD, color: delta != null && delta > 1 ? '#4ade80' : delta != null && delta < 0 ? '#f87171' : '#78716c' }}>
                              {delta != null ? (delta > 0 ? '+' : '') + delta.toFixed(3) : '—'}
                            </td>
                            <td style={{ ...TDL, color: isProd ? '#60a5fa' : isBest ? '#fbbf24' : '#57534e', fontSize: 8, fontWeight: isBest || isProd ? 700 : 400 }}>
                              {isProd ? 'production' : isBest ? '★ best' : ''}
                            </td>
                          </tr>
                        );
                      })}
                      {metrics.filter(v => maes[v.id] == null).map(v => (
                        <tr key={v.id} style={{ borderBottom: '1px solid #1c1917' }}>
                          <td style={{ ...TDL, color: '#292524' }}>—</td>
                          <td style={{ ...TDL, color: VARIANT_COLORS[v.id] }}>{v.id}</td>
                          <td style={{ ...TDL, color: '#44403c' }}>{v.label}</td>
                          <td colSpan={3} style={{ ...TDL, color: '#44403c', fontSize: 8 }}>MAE not computed — window-rescaled variant</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bandwidth comparison */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
                  Bandwidth &amp; Peak comparison
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: 480 }}>
                    <thead>
                      <tr>
                        <th style={{ ...THL, minWidth: 22 }}>ID</th>
                        <th style={{ ...THL, minWidth: 200 }}>Variant</th>
                        <th style={{ ...TH, minWidth: 80 }}>Peak |H|</th>
                        <th style={{ ...TH, minWidth: 80 }}>−3 dB BW (Hz)</th>
                        <th style={{ ...TH, minWidth: 80 }}>BW ratio vs A</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map(v => {
                        const bwA = metrics[0].bw3dB;
                        const bwRatio = (v.bw3dB != null && bwA != null && bwA > 0) ? v.bw3dB / bwA : null;
                        const col = VARIANT_COLORS[v.id];
                        return (
                          <tr key={v.id} style={{ borderBottom: '1px solid #1c1917' }}>
                            <td style={{ ...TDL, color: col, fontWeight: 700 }}>{v.id}</td>
                            <td style={{ ...TDL, color: '#d6d3d1' }}>{v.label}</td>
                            <td style={{ ...TD, color: '#d6d3d1' }}>{Number.isFinite(v.peakGain) ? v.peakGain.toFixed(4) : '—'}</td>
                            <td style={{ ...TD, color: '#d6d3d1' }}>{v.bw3dB != null ? v.bw3dB.toFixed(2) : '—'}</td>
                            <td style={{ ...TD, color: bwRatio != null && Math.abs(bwRatio - 1) > 0.05 ? '#fbbf24' : '#57534e' }}>
                              {bwRatio != null ? bwRatio.toFixed(3) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Area comparison */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
                  Integrated Area comparison (∫|H| df over window)
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: 400 }}>
                    <thead>
                      <tr>
                        <th style={{ ...THL, minWidth: 22 }}>ID</th>
                        <th style={{ ...THL, minWidth: 200 }}>Variant</th>
                        <th style={{ ...TH, minWidth: 90 }}>∫|H| df</th>
                        <th style={{ ...TH, minWidth: 80 }}>Area ratio vs A</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map(v => {
                        const areaA = metrics[0].area;
                        const ratio = (Number.isFinite(v.area) && Number.isFinite(areaA) && areaA > 0) ? v.area / areaA : null;
                        const col = VARIANT_COLORS[v.id];
                        return (
                          <tr key={v.id} style={{ borderBottom: '1px solid #1c1917' }}>
                            <td style={{ ...TDL, color: col, fontWeight: 700 }}>{v.id}</td>
                            <td style={{ ...TDL, color: '#d6d3d1' }}>{v.label}</td>
                            <td style={{ ...TD, color: '#d6d3d1' }}>{Number.isFinite(v.area) ? v.area.toFixed(4) : '—'}</td>
                            <td style={{ ...TD, color: ratio != null && Math.abs(ratio - 1) > 0.05 ? '#fbbf24' : '#57534e' }}>
                              {ratio != null ? ratio.toFixed(4) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Interpretation verdict */}
                <div style={{ padding: '8px 12px', background: '#1c1917', borderRadius: 6, border: `1px solid ${isPrimaryDriver ? '#4ade80' : '#292524'}`, fontSize: 10, ...MONO, lineHeight: 1.9 }}>
                  <div style={{ color: isPrimaryDriver ? '#4ade80' : '#60a5fa', fontWeight: 700, marginBottom: 3 }}>
                    Interpretation @ {activeHz} Hz:
                  </div>
                  {improvement == null ? (
                    <span style={{ color: '#57534e' }}>MAE comparison unavailable — check that a valid seat, sub, and room are configured.</span>
                  ) : isPrimaryDriver ? (
                    <span style={{ color: '#4ade80' }}>
                      "Transfer-function implementation is a primary parity driver."
                      Best alternative ({rankedByMAE[0]?.id}: {rankedByMAE[0]?.label}) reduces MAE by {improvement.toFixed(2)} dB
                      ({maes['A']?.toFixed(2)} → {bestMAE?.toFixed(2)} dB).
                    </span>
                  ) : (
                    <span style={{ color: '#d6d3d1' }}>
                      "Transfer-function shape is not the primary cause."
                      Best alternative ({rankedByMAE[0]?.id}: {rankedByMAE[0]?.label}) changes MAE by only {improvement.toFixed(2)} dB.
                      Parity gap originates elsewhere (source amplitude, coupling, or geometry).
                    </span>
                  )}
                  {improvement != null && (
                    <div style={{ color: '#57534e', marginTop: 3, fontSize: 8 }}>
                      Production MAE: {prodMAE?.toFixed(3)} dB · Best variant MAE: {bestMAE?.toFixed(3)} dB · Threshold: 1.0 dB
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}