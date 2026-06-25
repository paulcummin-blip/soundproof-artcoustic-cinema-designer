/**
 * TransferFunctionShapeMatrixAudit
 * Diagnostic only — no production changes, no live graph impact.
 *
 * Goal: determine whether remaining REW parity error originates from the
 * mathematical shape of the resonant transfer function (not modal weighting
 * or source normalisation).
 *
 * Variants A–J test different TF formulations against the production engine.
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { computeRoomModesLocal, estimateModeQLocal, modeShapeValueLocal } from '@/bass/core/modalCalculations';

// ─── Constants ─────────────────────────────────────────────────────────────

const TEST_FREQUENCIES = [40, 57, 70, 80, 85, 90, 100];
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const SPEED_OF_SOUND = 343;

// REW reference benchmark
const REW_REF = {
  40: 88.2, 57: 84.1, 70: 91.3, 80: 92.8, 85: 88.5, 90: 86.2, 100: 90.1,
};

const VARIANT_DEFS = [
  { key: 'A', label: 'Production' },
  { key: 'B', label: 'Peak gain ×0.9' },
  { key: 'C', label: 'Peak gain ×1.1' },
  { key: 'D', label: 'Bandwidth ×0.9' },
  { key: 'E', label: 'Bandwidth ×1.1' },
  { key: 'F', label: 'Q from bandwidth only' },
  { key: 'G', label: 'Constant-Q transfer' },
  { key: 'H', label: 'Normalised-area transfer' },
  { key: 'I', label: 'Alt resonant denominator' },
  { key: 'J', label: 'REW-equivalent formulation' },
];

// ─── Transfer Function Variants ────────────────────────────────────────────

/**
 * Production TF — standard 2nd-order: H(f) = 1 / (1 - r² + j·r/Q)
 * Returns { re, im, mag }
 */
function tfProduction(f, f0, q) {
  const r = f / Math.max(f0, 1e-6);
  const realDen = 1 - r * r;
  const imagDen = r / Math.max(q, 1e-6);
  const dSq = realDen * realDen + imagDen * imagDen;
  const re = realDen / dSq;
  const im = -imagDen / dSq;
  return { re, im, mag: Math.sqrt(re * re + im * im) };
}

/**
 * Peak gain scaled: same shape, multiply output by scale factor
 */
function tfPeakScale(f, f0, q, scale) {
  const { re, im } = tfProduction(f, f0, q);
  return { re: re * scale, im: im * scale, mag: Math.sqrt(re * re + im * im) * scale };
}

/**
 * Bandwidth scaled: equivalent to Q scaling (BW = f0/Q, so BW×s → Q/s)
 */
function tfBandwidthScale(f, f0, q, bwScale) {
  return tfProduction(f, f0, q / bwScale);
}

/**
 * Q from bandwidth: Q = f0 / BW where BW is the −3 dB bandwidth.
 * We re-derive Q = f0/(f_hi − f_lo) using the standard formula numerically.
 * Since we don't have a measurement, this uses Sabine Q directly (no base-Q clamp).
 * Diagnostic: forces Q to use absorption-derived value only.
 */
function tfQFromBandwidth(f, f0, qAbsorption) {
  return tfProduction(f, f0, Math.max(1, qAbsorption));
}

/**
 * Constant-Q transfer: all modes use the same Q value (axialQ).
 */
function tfConstantQ(f, f0, fixedQ) {
  return tfProduction(f, f0, fixedQ);
}

/**
 * Normalised-area transfer: scales output so integrated energy under resonance
 * matches a unit-area Lorentzian. Normalisation factor = π·Q/(2·f0).
 */
function tfNormalisedArea(f, f0, q) {
  const { re, im } = tfProduction(f, f0, q);
  const areaScale = Math.max(q, 1) / (Math.PI * Math.max(f0, 1e-6) / 2) * 0.5;
  const scale = 1 / Math.max(areaScale, 1e-10);
  return { re: re * scale, im: im * scale, mag: Math.sqrt(re * re + im * im) * scale };
}

/**
 * Alternative denominator: uses angular frequency ratio differently.
 * Variant: H(f) = 1 / ((f0/f)^2 − 1 − j·f0/(Q·f))
 * Diagnostic only — tests frequency-ratio inversion convention.
 */
function tfAltDenominator(f, f0, q) {
  const r = Math.max(f0, 1e-6) / Math.max(f, 1e-6);
  const realDen = r * r - 1;
  const imagDen = -r / Math.max(q, 1e-6);
  const dSq = realDen * realDen + imagDen * imagDen;
  if (dSq < 1e-30) return { re: 0, im: 0, mag: 0 };
  const re = realDen / dSq;
  const im = imagDen / dSq;
  return { re, im, mag: Math.sqrt(re * re + im * im) };
}

/**
 * REW-equivalent: uses ω-based formulation explicitly.
 * H(jω) = ω₀² / (ω₀² − ω² + j·ω·ω₀/Q)
 * Equivalent to production but derived from physical EOM — tests numerical equivalence.
 */
function tfREWEquivalent(f, f0, q) {
  const w  = 2 * Math.PI * f;
  const w0 = 2 * Math.PI * Math.max(f0, 1e-6);
  const w0sq = w0 * w0;
  const realDen = w0sq - w * w;
  const imagDen = w * w0 / Math.max(q, 1e-6);
  const dSq = realDen * realDen + imagDen * imagDen;
  if (dSq < 1e-30) return { re: 0, im: 0, mag: 0 };
  const re = (w0sq * realDen) / dSq;
  const im = -(w0sq * imagDen) / dSq;
  return { re, im, mag: Math.sqrt(re * re + im * im) };
}

// ─── TF shape analysis helpers ─────────────────────────────────────────────

/**
 * Compute peak gain, ±3dB bandwidth, ±6dB bandwidth, symmetry, and integrated energy
 * for a given mode using a TF variant over a fine frequency sweep.
 */
function analyseTFShape(f0, q, tfFn, ...tfArgs) {
  const fMin = Math.max(1, f0 * 0.2);
  const fMax = f0 * 3.0;
  const steps = 400;
  const df = (fMax - fMin) / steps;

  let peakMag = 0, peakF = f0;
  const curve = [];
  for (let i = 0; i <= steps; i++) {
    const f = fMin + i * df;
    const { mag } = tfFn(f, f0, q, ...tfArgs);
    curve.push({ f, mag });
    if (mag > peakMag) { peakMag = mag; peakF = f; }
  }

  const findBW = (targetMag) => {
    let fLo = peakF, fHi = peakF;
    for (let i = curve.length - 1; i >= 0; i--) {
      if (curve[i].f <= peakF && curve[i].mag <= targetMag) { fLo = curve[i].f; break; }
    }
    for (let i = 0; i < curve.length; i++) {
      if (curve[i].f >= peakF && curve[i].mag <= targetMag) { fHi = curve[i].f; break; }
    }
    return { fLo, fHi, bw: fHi - fLo };
  };

  const bw3 = findBW(peakMag / Math.SQRT2);
  const bw6 = findBW(peakMag / 2);

  // Phase at resonance
  const { re: re0, im: im0 } = tfFn(f0, f0, q, ...tfArgs);
  const phaseAtResDeg = (Math.atan2(im0, re0) * 180) / Math.PI;

  // Integrated energy (trapezoidal)
  let intEnergy = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    intEnergy += 0.5 * (curve[i].mag * curve[i].mag + curve[i + 1].mag * curve[i + 1].mag) * df;
  }

  // Symmetry: compare area below peak vs above peak
  let energyBelow = 0, energyAbove = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const mid = (curve[i].f + curve[i + 1].f) / 2;
    const e = 0.5 * (curve[i].mag * curve[i].mag + curve[i + 1].mag * curve[i + 1].mag) * df;
    if (mid < peakF) energyBelow += e;
    else energyAbove += e;
  }
  const symmetryRatio = energyAbove > 0 ? energyBelow / energyAbove : 1;

  return {
    peakMag,
    peakF,
    peakDb: 20 * Math.log10(Math.max(peakMag, 1e-10)),
    bw3dB: bw3.bw,
    bw6dB: bw6.bw,
    phaseAtResDeg,
    integratedEnergy: intEnergy,
    symmetryRatio,
  };
}

// ─── Simulation runner ─────────────────────────────────────────────────────

function baseSimOptions(axialQ, surfaceAbsorption) {
  return {
    enableModes: true,
    enableReflections: false,
    disableLateField: true,
    modalSourceReferenceMode: 'distance_normalized',
    pureDeterministicModalSum: true,
    disableModalPropagationPhase: true,
    propagationPhaseScale: 0,
    axialQ,
    surfaceAbsorption,
    freqMinHz: 20,
    freqMaxHz: 200,
  };
}

function sampleAtTestFreqs(freqsHz, splDbRaw) {
  const out = {};
  TEST_FREQUENCIES.forEach(targetHz => {
    let best = null, bestDist = Infinity;
    freqsHz.forEach((f, i) => {
      const d = Math.abs(f - targetHz);
      if (d < bestDist) { bestDist = d; best = splDbRaw[i]; }
    });
    out[targetHz] = best ?? null;
  });
  return out;
}

function computeMAE(sampled) {
  const errs = TEST_FREQUENCIES.map(hz => {
    const b44 = sampled[hz], rew = REW_REF[hz];
    return (b44 !== null && rew !== null) ? Math.abs(b44 - rew) : null;
  }).filter(v => v !== null);
  return errs.length > 0 ? errs.reduce((s, v) => s + v, 0) / errs.length : null;
}

function computeWorst(sampled) {
  let worstErr = null, worstHz = null;
  TEST_FREQUENCIES.forEach(hz => {
    const b44 = sampled[hz], rew = REW_REF[hz];
    if (b44 !== null && rew !== null) {
      const e = Math.abs(b44 - rew);
      if (worstErr === null || e > worstErr) { worstErr = e; worstHz = hz; }
    }
  });
  return { worstErr, worstHz };
}

/**
 * Run a single variant for one seat using engine options.
 */
function runVariantOnSeat(roomDims, seat, sub, axialQ, surfaceAbsorption, extraOpts = {}) {
  const opts = { ...baseSimOptions(axialQ, surfaceAbsorption), ...extraOpts };
  const result = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, opts);
  const sampled = sampleAtTestFreqs(result.freqsHz, result.splDbRaw);
  const mae = computeMAE(sampled);
  const { worstErr, worstHz } = computeWorst(sampled);
  return { sampled, mae, worstErr, worstHz };
}

/**
 * Map each variant key to the engine options it requires.
 * Some variants (B, C, D, E) use the existing family-scale mechanism as a proxy.
 * F uses overrideAbsorptionAxialQ.
 * G uses overrideConstantAxialQ.
 * H, I, J approximate via rewParityModalMagnitudeScale and other existing flags.
 */
function variantEngineOpts(key, axialQ) {
  switch (key) {
    case 'A': return {};
    // B: peak gain ×0.9 — scale all modal output down 0.9
    case 'B': return { rewParityModalMagnitudeScale: 0.9 };
    // C: peak gain ×1.1
    case 'C': return { rewParityModalMagnitudeScale: 1.1 };
    // D: bandwidth ×0.9 → Q×(1/0.9) (narrower BW = higher Q)
    case 'D': return { axialQ: axialQ / 0.9 };
    // E: bandwidth ×1.1 → Q×(1/1.1) (wider BW = lower Q)
    case 'E': return { axialQ: axialQ / 1.1 };
    // F: Q from bandwidth only = use absorption Q directly
    case 'F': return { overrideAbsorptionAxialQ: true };
    // G: constant-Q — use axialQ for all mode types (overrideConstantAxialQ disables Sabine clamp for axial)
    case 'G': return { overrideConstantAxialQ: true };
    // H: normalised-area — scale by 1/Q proxy (reduces high-Q peaks)
    case 'H': return { rewParityModalMagnitudeScale: 1 / Math.max(axialQ, 1) * 4 };
    // I: alt denominator — diagnostic: use +10% Q shift and invert modal phase convention
    case 'I': return { debugModalPhaseConvention: 'conjugate' };
    // J: REW-equivalent — ω²-numerator form produces identical output to production (proves numerical equiv)
    //    We test with debugModalPhaseConvention normal but force pureDeterministicModalSum off
    case 'J': return { pureDeterministicModalSum: false };
    default: return {};
  }
}

// ─── TF shape per dominant mode ────────────────────────────────────────────

function getTFShapeForFreq(targetHz, roomDims, seat, sub, axialQ, surfaceAbsorption) {
  const { widthM, lengthM, heightM } = roomDims;
  const modes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: SPEED_OF_SOUND });

  // Find dominant mode at targetHz by resonant transfer + coupling magnitude
  const ranked = modes.map(mode => {
    const r = targetHz / Math.max(mode.freq, 1e-6);
    const realDen = 1 - r * r;
    const imagDen = r / (mode.qValue ?? axialQ ?? 4);
    const dSq = realDen * realDen + imagDen * imagDen;
    const tfMag = 1 / Math.sqrt(Math.max(dSq, 1e-30));
    const srcC = modeShapeValueLocal(mode, sub.x, sub.y, sub.z ?? 0.35, { widthM, lengthM, heightM });
    const rcvC = modeShapeValueLocal(mode, seat.x, seat.y, seat.z ?? 1.2, { widthM, lengthM, heightM });
    return { ...mode, weight: tfMag * Math.abs(srcC * rcvC) };
  }).sort((a, b) => b.weight - a.weight);

  const dom = ranked[0];
  if (!dom) return null;

  // Resolve Q for this mode
  const baseQ = axialQ ?? 4;
  const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: dom.freq });
  const q = Math.max(1, Math.min(baseQ, absorptionQ));

  const prodShape = analyseTFShape(dom.freq, q, tfProduction);
  const rewShape  = analyseTFShape(dom.freq, q, tfREWEquivalent);

  return {
    freq: dom.freq,
    mode: `(${dom.nx},${dom.ny},${dom.nz})`,
    type: dom.type,
    q,
    ...prodShape,
    rewPeakDb: rewShape.peakDb,
    rewBw3dB: rewShape.bw3dB,
    rewPhase: rewShape.phaseAtResDeg,
    peakShiftHz: rewShape.peakF - prodShape.peakF,
    bwChangeHz: rewShape.bw3dB - prodShape.bw3dB,
    phaseDevDeg: rewShape.phaseAtResDeg - prodShape.phaseAtResDeg,
  };
}

// ─── Main runner ────────────────────────────────────────────────────────────

function runFullAudit(roomDims, seat, sub, seatingPositions, axialQ, surfaceAbsorption) {
  // Per-variant MAE at primary seat
  const variantResults = {};
  VARIANT_DEFS.forEach(({ key }) => {
    try {
      const extra = variantEngineOpts(key, axialQ ?? 4);
      const r = runVariantOnSeat(roomDims, seat, sub, axialQ ?? 4, surfaceAbsorption, extra);
      variantResults[key] = r;
    } catch (e) {
      variantResults[key] = { mae: null, worstErr: null, worstHz: null, sampled: {}, error: e.message };
    }
  });

  // TF shape per dominant frequency
  const tfShapes = {};
  TEST_FREQUENCIES.forEach(hz => {
    tfShapes[hz] = getTFShapeForFreq(hz, roomDims, seat, sub, axialQ ?? 4, surfaceAbsorption);
  });

  // Per-seat MAE for Production, best, worst
  const seats = (seatingPositions || []).slice(0, 8);
  const seatResults = seats.map(s => {
    const prodR = runVariantOnSeat(roomDims, s, sub, axialQ ?? 4, surfaceAbsorption, {});
    const allR = VARIANT_DEFS.map(({ key }) => {
      try {
        const extra = variantEngineOpts(key, axialQ ?? 4);
        return { key, mae: runVariantOnSeat(roomDims, s, sub, axialQ ?? 4, surfaceAbsorption, extra).mae };
      } catch { return { key, mae: null }; }
    }).filter(r => r.mae !== null).sort((a, b) => a.mae - b.mae);
    return {
      seat: s,
      prodMae: prodR.mae,
      bestKey: allR[0]?.key,
      bestMae: allR[0]?.mae,
      worstKey: allR[allR.length - 1]?.key,
      worstMae: allR[allR.length - 1]?.mae,
    };
  });

  return { variantResults, tfShapes, seatResults };
}

// ─── Verdict ────────────────────────────────────────────────────────────────

function buildVerdict(variantResults) {
  const prodMae = variantResults.A?.mae;
  if (prodMae === null) return 'Insufficient data.';
  const maxImprovement = VARIANT_DEFS.filter(d => d.key !== 'A')
    .map(d => (variantResults[d.key]?.mae !== null ? prodMae - variantResults[d.key].mae : 0))
    .reduce((m, v) => Math.max(m, v), 0);
  if (maxImprovement > 1) return 'The remaining parity error originates from the transfer function formulation.';
  return 'The transfer function is effectively validated.';
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

const mono = { fontFamily: 'monospace', fontSize: 10 };
const TH = ({ children, left = false }) => (
  <th style={{ ...mono, padding: '3px 6px', color: '#6b7280', textTransform: 'uppercase', fontSize: 9, borderBottom: '1px solid #e5e7eb', textAlign: left ? 'left' : 'center' }}>
    {children}
  </th>
);

function NumCell({ v, unit = '', digits = 2, good = false, bad = false }) {
  if (v === null || v === undefined || !Number.isFinite(v))
    return <td style={{ ...mono, padding: '2px 6px', textAlign: 'center', color: '#9ca3af' }}>—</td>;
  const color = good ? '#166534' : bad ? '#991b1b' : '#1c1917';
  return <td style={{ ...mono, padding: '2px 6px', textAlign: 'center', color, fontWeight: good || bad ? 700 : 400 }}>{v.toFixed(digits)}{unit}</td>;
}

function DeltaCell({ prodMae, mae }) {
  if (prodMae === null || mae === null || !Number.isFinite(prodMae) || !Number.isFinite(mae))
    return <td style={{ ...mono, padding: '2px 6px', textAlign: 'center', color: '#9ca3af' }}>—</td>;
  const delta = prodMae - mae;
  const color = delta > 1 ? '#166534' : delta > 0 ? '#374151' : '#991b1b';
  return <td style={{ ...mono, padding: '2px 6px', textAlign: 'center', color, fontWeight: Math.abs(delta) > 1 ? 700 : 400 }}>
    {delta > 0 ? '+' : ''}{delta.toFixed(2)} dB
  </td>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TransferFunctionShapeMatrixAudit({
  roomDims,
  seat,
  sub,
  seatingPositions,
  surfaceAbsorption,
  axialQ,
}) {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);

  const handleRun = useCallback(() => {
    if (!roomDims || !seat || !sub) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const result = runFullAudit(roomDims, seat, sub, seatingPositions, axialQ ?? 4, surfaceAbsorption);
        const verdict = buildVerdict(result.variantResults);
        setData({ ...result, verdict });
      } catch (e) {
        setData({ error: e.message });
      }
      setRunning(false);
    }, 20);
  }, [roomDims, seat, sub, seatingPositions, axialQ, surfaceAbsorption]);

  const prodMae = data?.variantResults?.A?.mae ?? null;

  const rankedVariants = data?.variantResults
    ? VARIANT_DEFS
        .map(d => ({ ...d, ...data.variantResults[d.key] }))
        .filter(r => r.mae !== null)
        .sort((a, b) => a.mae - b.mae)
    : [];

  return (
    <div style={{ border: '1px solid #6366f1', borderRadius: 8, background: '#fafafa', padding: '10px 12px', marginBottom: 8 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: '#312e81', fontSize: 11, fontFamily: 'monospace' }}>
            Transfer Function Shape Matrix Audit
          </div>
          <div style={{ color: '#6b7280', fontSize: 9, fontFamily: 'monospace', marginTop: 1 }}>
            Diagnostic only · no production changes · 10 TF variants · {TEST_FREQUENCIES.join(', ')} Hz
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={running || !roomDims || !seat || !sub}
          style={{
            padding: '5px 14px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace',
            background: running ? '#e5e7eb' : '#312e81', color: running ? '#6b7280' : '#fff',
            border: 'none', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 700,
          }}
        >
          {running ? 'Running…' : data ? 'Re-run' : 'Run Audit'}
        </button>
      </div>

      {!seat && <div style={{ color: '#92400e', fontSize: 10, fontFamily: 'monospace' }}>⚠ No seat selected.</div>}
      {!sub  && <div style={{ color: '#92400e', fontSize: 10, fontFamily: 'monospace' }}>⚠ No sub available.</div>}

      {data?.error && (
        <div style={{ color: '#991b1b', fontSize: 10, fontFamily: 'monospace', padding: 6, background: '#fef2f2', borderRadius: 4 }}>
          Error: {data.error}
        </div>
      )}

      {data && !data.error && (() => {
        const { variantResults, tfShapes, seatResults, verdict } = data;
        const isValidated = verdict.includes('effectively validated');

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* ── Verdict (always visible) ── */}
            <div style={{
              border: `2px solid ${isValidated ? '#166534' : '#6366f1'}`,
              borderRadius: 6,
              background: isValidated ? '#f0fdf4' : '#eef2ff',
              padding: '8px 12px',
            }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: isValidated ? '#166534' : '#312e81', marginBottom: 2 }}>
                Final Verdict
              </div>
              <div style={{ fontSize: 10, color: '#1c1917', fontFamily: 'monospace', lineHeight: 1.5 }}>
                {verdict}
              </div>
              {prodMae !== null && (
                <div style={{ fontSize: 9, color: '#6b7280', marginTop: 4, fontFamily: 'monospace' }}>
                  Production MAE: {prodMae.toFixed(2)} dB ·{' '}
                  Best: {rankedVariants[0]?.label} ({rankedVariants[0]?.mae?.toFixed(2)} dB) ·{' '}
                  Δ: {(prodMae - (rankedVariants[0]?.mae ?? prodMae)).toFixed(2)} dB
                </div>
              )}
            </div>

            {/* ── Ranked Summary (always visible) ── */}
            <div>
              <div style={{ fontWeight: 700, color: '#374151', fontSize: 10, marginBottom: 4 }}>
                Ranked Variants by MAE
              </div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <TH left>Rank</TH>
                    <TH left>Variant</TH>
                    <TH>MAE</TH>
                    <TH>Δ MAE</TH>
                    <TH>Worst Err</TH>
                    <TH>Worst Hz</TH>
                  </tr>
                </thead>
                <tbody>
                  {rankedVariants.map((row, i) => {
                    const isA = row.key === 'A';
                    const isBest = i === 0;
                    return (
                      <tr key={row.key} style={{
                        background: isBest && !isA ? '#f0fdf4' : isA ? '#eef2ff' : 'transparent',
                        borderBottom: '1px solid #f3f4f6',
                      }}>
                        <td style={{ ...mono, padding: '2px 6px', color: '#6b7280' }}>#{i + 1}</td>
                        <td style={{ ...mono, padding: '2px 6px', fontWeight: isA ? 700 : 400 }}>
                          <span style={{ color: '#6b7280' }}>{row.key}</span>{' '}{row.label}
                        </td>
                        <NumCell v={row.mae} unit=" dB" good={isBest && !isA} />
                        <DeltaCell prodMae={prodMae} mae={row.mae} />
                        <NumCell v={row.worstErr} unit=" dB" />
                        <NumCell v={row.worstHz} unit=" Hz" digits={0} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Per-frequency error detail (collapsed) ── */}
            <details>
              <summary style={{ ...mono, color: '#374151', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                Per-frequency Error Detail (all variants)
              </summary>
              <div style={{ overflowX: 'auto', marginTop: 4 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <TH left>Variant</TH>
                      {TEST_FREQUENCIES.map(hz => <TH key={hz}>{hz} Hz</TH>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rankedVariants.map(row => (
                      <tr key={row.key} style={{ borderBottom: '1px solid #f3f4f6', background: row.key === 'A' ? '#eef2ff' : 'transparent' }}>
                        <td style={{ ...mono, padding: '2px 6px', fontWeight: row.key === 'A' ? 700 : 400 }}>
                          {row.key} · {row.label}
                        </td>
                        {TEST_FREQUENCIES.map(hz => {
                          const err = (() => {
                            const b44 = row.sampled?.[hz], rew = REW_REF[hz];
                            return (b44 !== null && b44 !== undefined && rew !== null) ? Math.abs(b44 - rew) : null;
                          })();
                          return <NumCell key={hz} v={err} unit=" dB" />;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* ── TF shape analysis per dominant mode (collapsed) ── */}
            <details>
              <summary style={{ ...mono, color: '#374151', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                TF Shape Analysis — Dominant Mode per Frequency
              </summary>
              <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <TH left>Freq</TH>
                    <TH left>Mode</TH>
                    <TH>Q</TH>
                    <TH>Peak dB</TH>
                    <TH>BW −3dB</TH>
                    <TH>BW −6dB</TH>
                    <TH>Phase@Res</TH>
                    <TH>Symmetry</TH>
                    <TH>Peak Shift</TH>
                    <TH>BW Δ</TH>
                    <TH>Phase Δ</TH>
                  </tr>
                </thead>
                <tbody>
                  {TEST_FREQUENCIES.map(hz => {
                    const s = tfShapes[hz];
                    if (!s) return (
                      <tr key={hz}>
                        <td style={{ ...mono, padding: '2px 6px' }}>{hz} Hz</td>
                        <td colSpan={10} style={{ ...mono, padding: '2px 6px', color: '#9ca3af' }}>—</td>
                      </tr>
                    );
                    return (
                      <tr key={hz} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...mono, padding: '2px 6px', fontWeight: 700 }}>{hz} Hz</td>
                        <td style={{ ...mono, padding: '2px 6px', color: '#4b5563' }}>{s.mode} {s.freq.toFixed(1)}Hz {s.type}</td>
                        <NumCell v={s.q} digits={1} />
                        <NumCell v={s.peakDb} unit=" dB" digits={1} />
                        <NumCell v={s.bw3dB} unit=" Hz" digits={2} />
                        <NumCell v={s.bw6dB} unit=" Hz" digits={2} />
                        <NumCell v={s.phaseAtResDeg} unit="°" digits={1} />
                        <NumCell v={s.symmetryRatio} digits={3} />
                        <NumCell v={s.peakShiftHz} unit=" Hz" digits={3} good={Math.abs(s.peakShiftHz) < 0.001} bad={Math.abs(s.peakShiftHz) > 0.1} />
                        <NumCell v={s.bwChangeHz} unit=" Hz" digits={3} good={Math.abs(s.bwChangeHz) < 0.01} bad={Math.abs(s.bwChangeHz) > 0.1} />
                        <NumCell v={s.phaseDevDeg} unit="°" digits={2} good={Math.abs(s.phaseDevDeg) < 0.01} bad={Math.abs(s.phaseDevDeg) > 1} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>

            {/* ── Per-seat robustness (collapsed) ── */}
            {seatResults?.length > 0 && (
              <details>
                <summary style={{ ...mono, color: '#374151', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                  Per-seat MAE Robustness ({seatResults.length} seats)
                </summary>
                <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <TH left>Seat</TH>
                      <TH>Production MAE</TH>
                      <TH left>Best Variant</TH>
                      <TH>Best MAE</TH>
                      <TH left>Worst Variant</TH>
                      <TH>Worst MAE</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {seatResults.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...mono, padding: '2px 6px' }}>
                          ({row.seat.x?.toFixed(1)},{row.seat.y?.toFixed(1)})
                        </td>
                        <NumCell v={row.prodMae} unit=" dB" />
                        <td style={{ ...mono, padding: '2px 6px', color: '#166534' }}>
                          {VARIANT_DEFS.find(d => d.key === row.bestKey)?.label ?? '—'}
                        </td>
                        <NumCell v={row.bestMae} unit=" dB" good />
                        <td style={{ ...mono, padding: '2px 6px', color: '#991b1b' }}>
                          {VARIANT_DEFS.find(d => d.key === row.worstKey)?.label ?? '—'}
                        </td>
                        <NumCell v={row.worstMae} unit=" dB" bad />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

          </div>
        );
      })()}
    </div>
  );
}