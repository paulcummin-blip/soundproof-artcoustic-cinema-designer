/**
 * GreenFunctionEquationShootoutAudit
 * Diagnostic only — no production changes, does not affect the live graph.
 *
 * Goal: Compare 8 complete modal Green's function formulations side-by-side to
 * identify whether remaining REW parity gap originates from the underlying modal
 * equation rather than scalar tuning.
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { computeRoomModesLocal, estimateModeQLocal } from '@/bass/core/modalCalculations';

// ── Constants ──────────────────────────────────────────────────────────────────

const TEST_FREQUENCIES = [40, 57, 70, 80, 85, 90, 100];
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const SPEED_OF_SOUND = 343;

// Current REW benchmark targets
const REW_REF = {
  40: 88.2, 57: 84.1, 70: 91.3, 80: 92.8, 85: 88.5, 90: 86.2, 100: 90.1,
};

// ── Formulation definitions ────────────────────────────────────────────────────

const FORMULATIONS = [
  {
    key: 'A',
    label: 'Production',
    desc: 'Current B44 modal solver — distance_normalized, production TF, Q, coupling, weighting.',
    formula: 'P = A·Ψ_src·Ψ_rcv·orderWeight(0.5)·H_prod(f,f₀,Q)',
  },
  {
    key: 'B',
    label: 'Normalised eigenfunction',
    desc: 'Eigenfunction normalisation: each mode scaled by V / ||ψₙ||². Modal norm = ∫Ψ²dV ≈ V/8 for axial.',
    formula: 'P = A·(Ψ_src·Ψ_rcv)·(V/modalNorm)·H(f,f₀,Q)',
  },
  {
    key: 'C',
    label: 'Unnormalised eigenfunction',
    desc: 'Raw ψ_source × ψ_receiver — no order weighting, no volume norm, no modal norm.',
    formula: 'P = A·Ψ_src·Ψ_rcv·H(f,f₀,Q)  [no weights]',
  },
  {
    key: 'D',
    label: 'Volume-normalised Green\'s function',
    desc: 'Apply 1/V to each modal pressure contribution — classical room Green\'s function scaling.',
    formula: 'P = (A/V)·Ψ_src·Ψ_rcv·H(f,f₀,Q)',
  },
  {
    key: 'E',
    label: 'Sqrt-volume normalised',
    desc: 'Apply 1/√V to modal pressure — intermediate between unnormalised and volume-normalised.',
    formula: 'P = (A/√V)·Ψ_src·Ψ_rcv·H(f,f₀,Q)',
  },
  {
    key: 'F',
    label: 'Classical ω-domain denominator',
    desc: 'Use ωₙ²−ω²+j·2ζωₙω denominator (classical form) instead of ratio-based.',
    formula: 'H = 1/(ωₙ²−ω²+j·2·ζ·ωₙ·ω)',
  },
  {
    key: 'G',
    label: 'Frequency-normalised denominator',
    desc: 'Classical denominator normalised by ωₙ² — dimensionless form.',
    formula: 'H = 1/(1−(ω/ωₙ)²+j·2ζ·(ω/ωₙ)) · (1/ωₙ²)',
  },
  {
    key: 'H',
    label: 'REW-like candidate',
    desc: 'Best known parity config: distance_normalized + production TF + current coupling + current Q.',
    formula: 'Same as A but modalSourceReferenceMode=distance_normalized forced, propPhase=0',
  },
];

// ── Simulation helpers ─────────────────────────────────────────────────────────

function sampleAtHz(freqsHz, splDbRaw, targetHz) {
  let best = null, bestDist = Infinity;
  freqsHz.forEach((f, i) => {
    const d = Math.abs(f - targetHz);
    if (d < bestDist) { bestDist = d; best = splDbRaw[i]; }
  });
  return best;
}

function computeMAE(sampled) {
  const errs = TEST_FREQUENCIES.map(hz => {
    const v = sampled[hz], r = REW_REF[hz];
    return (v !== null && v !== undefined && Number.isFinite(v) && r !== null) ? Math.abs(v - r) : null;
  }).filter(v => v !== null);
  return errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : null;
}

function computeWorstError(sampled) {
  let worstErr = null, worstHz = null;
  TEST_FREQUENCIES.forEach(hz => {
    const e = (sampled[hz] !== null && Number.isFinite(sampled[hz]) && REW_REF[hz] !== null)
      ? Math.abs(sampled[hz] - REW_REF[hz]) : null;
    if (e !== null && (worstErr === null || e > worstErr)) { worstErr = e; worstHz = hz; }
  });
  return { worstErr, worstHz };
}

function peakAndNull(freqsHz, splDbRaw) {
  let peakHz = null, peakSpl = -Infinity, nullHz = null, nullSpl = Infinity;
  freqsHz.forEach((f, i) => {
    if (f < 20 || f > 150) return;
    const s = splDbRaw[i];
    if (!Number.isFinite(s)) return;
    if (s > peakSpl) { peakSpl = s; peakHz = f; }
    if (s < nullSpl) { nullSpl = s; nullHz = f; }
  });
  return { peakHz, peakSpl: peakSpl === -Infinity ? null : peakSpl, nullHz, nullSpl: nullSpl === Infinity ? null : nullSpl };
}

// Base production options
function baseOpts(surfaceAbsorption, axialQ) {
  return {
    enableModes: true,
    enableReflections: false,
    disableLateField: true,
    modalSourceReferenceMode: 'distance_normalized',
    pureDeterministicModalSum: true,
    disableModalPropagationPhase: true,
    propagationPhaseScale: 0,
    axialQ: axialQ ?? 4.0,
    surfaceAbsorption,
    freqMinHz: 20,
    freqMaxHz: 200,
    modalGainScalar: 1.0,
  };
}

// ── Custom formulation runners ─────────────────────────────────────────────────
// Formulations that can't be expressed via existing engine options
// are computed inline using the same modal physics.

function modeShapeVal(mode, x, y, z, W, L, H) {
  const cosX = Math.cos((mode.nx * Math.PI * x) / W);
  const cosY = Math.cos((mode.ny * Math.PI * y) / L);
  const cosZ = Math.cos((mode.nz * Math.PI * z) / H);
  return cosX * cosY * cosZ;
}

function runInlineFormulation(key, roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const { widthM: W, lengthM: L, heightM: H } = roomDims;
  const V = W * L * H;
  const freqsHz = [];
  for (let i = 0; i <= 200; i++) {
    const hz = 15 * Math.pow(2, i / 48);
    if (hz > 202) break;
    freqsHz.push(hz);
  }
  freqsHz.push(200);

  const allModes = computeRoomModesLocal({ widthM: W, lengthM: L, heightM: H, fMax: 200, c: SPEED_OF_SOUND });
  const modes = allModes.map(m => {
    const baseQ = m.type === 'axial' ? (axialQ ?? 4.0) : m.type === 'tangential' ? 3.9 : 2.5;
    const absQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: m.freq });
    return { ...m, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });

  const dx = sub.x - seat.x, dy = sub.y - seat.y, dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const srcDb = 94; // flat REW reference
  const ampBase = Math.pow(10, srcDb / 20);
  // distance_normalized modal source amplitude
  const modalSrcAmp = ampBase * (1 / distM);
  const directAmp = ampBase * (1 / distM);
  const timeOfFlightPhase = -2 * Math.PI * (distM / SPEED_OF_SOUND);

  const splDbRaw = freqsHz.map(fHz => {
    const omega = 2 * Math.PI * fHz;

    // Direct path
    const dirPhase = timeOfFlightPhase * fHz;
    let sumRe = directAmp * Math.cos(dirPhase);
    let sumIm = directAmp * Math.sin(dirPhase);

    modes.forEach(m => {
      const psiSrc = modeShapeVal(m, sub.x, sub.y, sub.z ?? 0.35, W, L, H);
      const psiRcv = modeShapeVal(m, seat.x, seat.y, seat.z ?? 1.2, W, L, H);
      const coupling = psiSrc * psiRcv;
      const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
      const orderWt = modeOrder >= 2 ? 0.5 : 1.0;
      const omega0 = 2 * Math.PI * m.freq;
      const ratio = omega / omega0;
      const zeta = 1 / (2 * m.qValue); // damping ratio

      let tfRe, tfIm;

      if (key === 'F') {
        // Classical ωₙ²−ω²+j·2ζωₙω
        const realDen = omega0 * omega0 - omega * omega;
        const imagDen = 2 * zeta * omega0 * omega;
        const dSq = realDen * realDen + imagDen * imagDen;
        tfRe = realDen / dSq;
        tfIm = -imagDen / dSq;
      } else if (key === 'G') {
        // Frequency-normalised: (1/(ωₙ²)) / (1−β²+j·2ζβ)
        const beta = omega / omega0;
        const realDen = 1 - beta * beta;
        const imagDen = 2 * zeta * beta;
        const dSq = realDen * realDen + imagDen * imagDen;
        tfRe = (1 / (omega0 * omega0)) * realDen / dSq;
        tfIm = -(1 / (omega0 * omega0)) * imagDen / dSq;
      } else {
        // Standard ratio-based TF (used for B, C, D, E)
        const realDen = 1 - ratio * ratio;
        const imagDen = ratio / m.qValue;
        const dSq = realDen * realDen + imagDen * imagDen;
        tfRe = realDen / dSq;
        tfIm = -imagDen / dSq;
      }

      let gain;
      if (key === 'B') {
        // Normalised eigenfunction: scale by V / modalNorm
        // modalNorm ≈ V * (½ if nx>0 else 1) × (½ if ny>0 else 1) × (½ if nz>0 else 1)
        const fx = m.nx > 0 ? 0.5 : 1.0, fy = m.ny > 0 ? 0.5 : 1.0, fz = m.nz > 0 ? 0.5 : 1.0;
        const modalNorm = V * fx * fy * fz;
        gain = modalSrcAmp * coupling * (V / modalNorm) * orderWt;
      } else if (key === 'C') {
        // Unnormalised: raw coupling, no order weight, no norm
        gain = modalSrcAmp * coupling;
      } else if (key === 'D') {
        // Volume-normalised: 1/V
        gain = (modalSrcAmp / V) * coupling * orderWt;
      } else if (key === 'E') {
        // Sqrt-volume normalised: 1/√V
        gain = (modalSrcAmp / Math.sqrt(V)) * coupling * orderWt;
      } else {
        // F, G: use same distance_normalized gain + production coupling
        const axialHOscale = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
        gain = modalSrcAmp * coupling * orderWt * axialHOscale;
      }

      sumRe += gain * tfRe;
      sumIm += gain * tfIm;
    });

    const mag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
    return 20 * Math.log10(Math.max(mag, 1e-10));
  });

  return { freqsHz, splDbRaw };
}

// ── Main audit runner ──────────────────────────────────────────────────────────

function runShootout(roomDims, sub, seatingPositions, surfaceAbsorption, axialQ) {
  const seats = (seatingPositions || []).slice(0, 6);
  const primarySeat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
  if (!primarySeat || !sub) return null;

  const formResults = {};

  FORMULATIONS.forEach(({ key }) => {
    const t0 = performance.now();
    try {
      let freqsHz, splDbRaw;

      if (['A', 'H'].includes(key)) {
        // Route through production engine
        const extraOpts = key === 'H'
          ? { modalSourceReferenceMode: 'distance_normalized', propagationPhaseScale: 0 }
          : {};
        const opts = { ...baseOpts(surfaceAbsorption, axialQ), ...extraOpts };
        const r = simulateBassResponseRewCore(roomDims, primarySeat, sub, FLAT_CURVE, opts);
        freqsHz = r.freqsHz;
        splDbRaw = r.splDbRaw;
      } else {
        // Custom inline formulation
        const r = runInlineFormulation(key, roomDims, primarySeat, sub, surfaceAbsorption, axialQ);
        freqsHz = r.freqsHz;
        splDbRaw = r.splDbRaw;
      }

      const sampled = {};
      TEST_FREQUENCIES.forEach(hz => { sampled[hz] = sampleAtHz(freqsHz, splDbRaw, hz); });
      const mae = computeMAE(sampled);
      const { worstErr, worstHz } = computeWorstError(sampled);
      const { peakHz, peakSpl, nullHz, nullSpl } = peakAndNull(freqsHz, splDbRaw);
      const runtimeMs = performance.now() - t0;

      // Modal/direct ratio at 70 Hz (approximate)
      const spl70 = sampled[70];
      // Rough modal ratio proxy: difference from 20 Hz baseline
      const modalDirectRatio = null; // would need separate solver pass; omit for now

      formResults[key] = { sampled, mae, worstErr, worstHz, peakHz, peakSpl, nullHz, nullSpl, runtimeMs, modalDirectRatio };
    } catch (e) {
      formResults[key] = { sampled: {}, mae: null, worstErr: null, worstHz: null, runtimeMs: performance.now() - t0, error: e.message };
    }
  });

  // Per-seat MAE (all formulations)
  const seatResults = seats.map((s, si) => {
    const rowNum = Number(s?.row || s?.rowNumber) || (si + 1);
    const label = s.isPrimary ? 'MLP' : `R${rowNum}S${si + 1}`;
    const perForm = {};
    FORMULATIONS.forEach(({ key }) => {
      try {
        let freqsHz, splDbRaw;
        if (['A', 'H'].includes(key)) {
          const opts = { ...baseOpts(surfaceAbsorption, axialQ) };
          const r = simulateBassResponseRewCore(roomDims, s, sub, FLAT_CURVE, opts);
          freqsHz = r.freqsHz; splDbRaw = r.splDbRaw;
        } else {
          const r = runInlineFormulation(key, roomDims, s, sub, surfaceAbsorption, axialQ);
          freqsHz = r.freqsHz; splDbRaw = r.splDbRaw;
        }
        const sampled = {};
        TEST_FREQUENCIES.forEach(hz => { sampled[hz] = sampleAtHz(freqsHz, splDbRaw, hz); });
        perForm[key] = computeMAE(sampled);
      } catch { perForm[key] = null; }
    });
    return { seat: s, label, perForm };
  });

  return { formResults, seatResults };
}

// ── Verdict ────────────────────────────────────────────────────────────────────

function buildVerdict(formResults) {
  const prodMae = formResults.A?.mae;
  if (!Number.isFinite(prodMae)) return { text: 'Insufficient data.', pass: null };

  const improvements = FORMULATIONS.filter(f => f.key !== 'A').map(f => {
    const m = formResults[f.key]?.mae;
    return { key: f.key, label: f.label, delta: Number.isFinite(m) ? prodMae - m : 0 };
  });

  const best = improvements.sort((a, b) => b.delta - a.delta)[0];
  const maxImprovement = best?.delta ?? 0;

  // Spatial robustness check will be performed if seat results available
  if (maxImprovement > 1) {
    return {
      text: `Underlying Green's function formulation is a remaining REW parity driver. Best: ${best.label} (Δ${best.delta.toFixed(2)} dB).`,
      pass: false,
    };
  }
  return {
    text: "Green's function formulation is effectively validated; remaining gap likely comes from REW benchmark extraction, boundary model, or smoothing.",
    pass: true,
  };
}

function checkSpatialRobustness(seatResults, key) {
  const maes = seatResults.map(r => r.perForm[key]);
  const valid = maes.filter(v => Number.isFinite(v));
  if (valid.length < 2) return null;
  const prodMaes = seatResults.map(r => r.perForm['A']);
  const improves = valid.map((m, i) => Number.isFinite(prodMaes[i]) ? prodMaes[i] - m : 0);
  const allImprove = improves.every(d => d >= -0.5);
  const someWorsen = improves.some(d => d < -1.0);
  if (someWorsen) return 'Not spatially robust — do not promote.';
  if (allImprove) return 'Spatially robust ✓';
  return 'Partially robust';
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

const mono = { fontFamily: 'monospace', fontSize: 10 };

function TH({ children, left = false, width }) {
  return (
    <th style={{ ...mono, padding: '3px 6px', color: '#6b7280', fontSize: 9, borderBottom: '1px solid #e5e7eb',
      textAlign: left ? 'left' : 'right', background: '#f9fafb', fontWeight: 700, width }}>
      {children}
    </th>
  );
}

function TD({ v, unit = '', digits = 2, highlight, muted }) {
  if (v === null || v === undefined || !Number.isFinite(Number(v)))
    return <td style={{ ...mono, padding: '2px 6px', textAlign: 'right', color: '#9ca3af' }}>—</td>;
  const n = Number(v);
  return (
    <td style={{ ...mono, padding: '2px 6px', textAlign: 'right',
      color: highlight === 'good' ? '#166534' : highlight === 'bad' ? '#991b1b' : muted ? '#6b7280' : '#1c1917',
      fontWeight: highlight ? 700 : 400 }}>
      {n.toFixed(digits)}{unit}
    </td>
  );
}

function DeltaCell({ prodMae, mae }) {
  if (!Number.isFinite(prodMae) || !Number.isFinite(mae))
    return <td style={{ ...mono, padding: '2px 6px', textAlign: 'right', color: '#9ca3af' }}>—</td>;
  const d = prodMae - mae;
  return (
    <td style={{ ...mono, padding: '2px 6px', textAlign: 'right', fontWeight: Math.abs(d) > 0.5 ? 700 : 400,
      color: d > 1 ? '#166534' : d > 0 ? '#374151' : '#991b1b' }}>
      {d > 0 ? '+' : ''}{d.toFixed(2)} dB
    </td>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function GreenFunctionEquationShootoutAudit({ roomDims, sub, seatingPositions, surfaceAbsorption, axialQ }) {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);

  const handleRun = useCallback(() => {
    if (!roomDims || !sub || !seatingPositions?.length) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const result = runShootout(roomDims, sub, seatingPositions, surfaceAbsorption, axialQ ?? 4.0);
        if (result) {
          const verdict = buildVerdict(result.formResults);
          setData({ ...result, verdict });
        } else {
          setData({ error: 'No primary seat or sub available.' });
        }
      } catch (e) {
        setData({ error: e.message });
      }
      setRunning(false);
    }, 20);
  }, [roomDims, sub, seatingPositions, surfaceAbsorption, axialQ]);

  const prodMae = data?.formResults?.A?.mae ?? null;

  const ranked = data?.formResults
    ? FORMULATIONS
        .map(f => ({ ...f, ...data.formResults[f.key] }))
        .filter(r => Number.isFinite(r.mae))
        .sort((a, b) => a.mae - b.mae)
    : [];

  return (
    <div style={{ border: '1px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '10px 12px', marginBottom: 8 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: '#4c1d95', fontSize: 11, fontFamily: 'monospace' }}>
            Green's Function Equation Shootout
          </div>
          <div style={{ color: '#6d28d9', fontSize: 9, fontFamily: 'monospace', marginTop: 1 }}>
            Diagnostic only · 8 formulations · {TEST_FREQUENCIES.join(', ')} Hz · no production changes
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={running || !roomDims || !sub}
          style={{
            padding: '5px 14px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
            background: running ? '#e5e7eb' : '#4c1d95', color: running ? '#6b7280' : '#fff',
            border: 'none', cursor: running ? 'not-allowed' : 'pointer',
          }}
        >
          {running ? 'Running…' : data ? 'Re-run' : 'Run Shootout'}
        </button>
      </div>

      {!sub && <div style={{ color: '#6d28d9', fontSize: 10, fontFamily: 'monospace' }}>⚠ No sub available.</div>}
      {!seatingPositions?.length && <div style={{ color: '#6d28d9', fontSize: 10, fontFamily: 'monospace' }}>⚠ No seating positions.</div>}

      {data?.error && (
        <div style={{ color: '#991b1b', fontSize: 10, fontFamily: 'monospace', padding: 6, background: '#fef2f2', borderRadius: 4 }}>
          Error: {data.error}
        </div>
      )}

      {data && !data.error && (() => {
        const { formResults, seatResults, verdict } = data;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* ── 1. Verdict ── */}
            <div style={{ border: `2px solid ${verdict.pass ? '#166534' : '#7c3aed'}`, borderRadius: 6, padding: '8px 12px',
              background: verdict.pass ? '#f0fdf4' : '#ede9fe' }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: verdict.pass ? '#166534' : '#4c1d95', marginBottom: 2 }}>
                Final Verdict
              </div>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#1c1917', lineHeight: 1.5 }}>{verdict.text}</div>
              {prodMae !== null && (
                <div style={{ fontSize: 9, color: '#6b7280', marginTop: 4, fontFamily: 'monospace' }}>
                  Production MAE: {prodMae.toFixed(2)} dB · Formulations: {FORMULATIONS.length}
                </div>
              )}
            </div>

            {/* ── 2. Ranked formulation table ── */}
            <div>
              <div style={{ fontWeight: 700, color: '#374151', fontSize: 10, marginBottom: 4 }}>Ranked by MAE</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                  <thead>
                    <tr>
                      <TH left width={28}>#</TH>
                      <TH left width={160}>Formulation</TH>
                      <TH>MAE</TH>
                      <TH>Δ MAE</TH>
                      <TH>Worst err</TH>
                      <TH>Worst Hz</TH>
                      <TH>Peak Hz</TH>
                      <TH>Peak dB</TH>
                      <TH>Null Hz</TH>
                      <TH>Null dB</TH>
                      <TH>Runtime</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((row, i) => {
                      const isA = row.key === 'A';
                      const isBest = i === 0 && !isA;
                      const robustness = seatResults?.length > 1 ? checkSpatialRobustness(seatResults, row.key) : null;
                      return (
                        <tr key={row.key} style={{ background: isBest ? '#f0fdf4' : isA ? '#ede9fe' : 'transparent', borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ ...mono, padding: '2px 6px', color: '#9ca3af' }}>#{i + 1}</td>
                          <td style={{ ...mono, padding: '2px 6px', fontWeight: isA ? 700 : 400 }}>
                            <span style={{ color: '#7c3aed', marginRight: 4 }}>{row.key}</span>{row.label}
                            {robustness && <div style={{ fontSize: 8, color: robustness.includes('robust ✓') ? '#166534' : '#b45309', marginTop: 1 }}>{robustness}</div>}
                          </td>
                          <TD v={row.mae} unit=" dB" highlight={isBest ? 'good' : isA ? undefined : undefined} />
                          <DeltaCell prodMae={prodMae} mae={row.mae} />
                          <TD v={row.worstErr} unit=" dB" />
                          <TD v={row.worstHz} unit=" Hz" digits={0} />
                          <TD v={row.peakHz} unit=" Hz" digits={1} muted />
                          <TD v={row.peakSpl} unit=" dB" digits={1} muted />
                          <TD v={row.nullHz} unit=" Hz" digits={1} muted />
                          <TD v={row.nullSpl} unit=" dB" digits={1} muted />
                          <TD v={row.runtimeMs} unit=" ms" digits={1} muted />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── 3. Per-seat robustness table ── */}
            {seatResults?.length > 0 && (
              <details>
                <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                  Per-seat MAE — {seatResults.length} seats
                </summary>
                <div style={{ overflowX: 'auto', marginTop: 4 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <TH left>Seat</TH>
                        {FORMULATIONS.map(f => <TH key={f.key}>{f.key}</TH>)}
                      </tr>
                    </thead>
                    <tbody>
                      {seatResults.map((sr, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: sr.seat.isPrimary ? '#ede9fe' : 'transparent' }}>
                          <td style={{ ...mono, padding: '2px 6px', fontWeight: sr.seat.isPrimary ? 700 : 400 }}>
                            {sr.label}{sr.seat.isPrimary ? ' ★' : ''}
                          </td>
                          {FORMULATIONS.map(f => {
                            const m = sr.perForm[f.key];
                            const prodM = sr.perForm['A'];
                            const delta = Number.isFinite(m) && Number.isFinite(prodM) ? prodM - m : null;
                            return (
                              <td key={f.key} style={{ ...mono, padding: '2px 6px', textAlign: 'right',
                                color: delta !== null && delta > 1 ? '#166534' : delta !== null && delta < -1 ? '#991b1b' : '#374151',
                                fontWeight: delta !== null && Math.abs(delta) > 1 ? 700 : 400 }}>
                                {Number.isFinite(m) ? m.toFixed(2) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {/* ── 4. Per-frequency error table ── */}
            <details>
              <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                Per-frequency Error Table
              </summary>
              <div style={{ overflowX: 'auto', marginTop: 4 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580 }}>
                  <thead>
                    <tr>
                      <TH left>Formulation</TH>
                      {TEST_FREQUENCIES.map(hz => <TH key={hz}>{hz} Hz</TH>)}
                      <TH>MAE</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {FORMULATIONS.map(f => {
                      const row = formResults[f.key] || {};
                      const isA = f.key === 'A';
                      return (
                        <tr key={f.key} style={{ borderBottom: '1px solid #f3f4f6', background: isA ? '#ede9fe' : 'transparent' }}>
                          <td style={{ ...mono, padding: '2px 6px', fontWeight: isA ? 700 : 400 }}>
                            <span style={{ color: '#7c3aed' }}>{f.key}</span> {f.label}
                          </td>
                          {TEST_FREQUENCIES.map(hz => {
                            const spl = row.sampled?.[hz];
                            const err = (spl !== null && spl !== undefined && Number.isFinite(spl)) ? Math.abs(spl - REW_REF[hz]) : null;
                            return (
                              <td key={hz} style={{ ...mono, padding: '2px 6px', textAlign: 'right',
                                color: err !== null && err > 4 ? '#991b1b' : err !== null && err < 2 ? '#166534' : '#374151',
                                fontWeight: err !== null && err > 4 ? 700 : 400 }}>
                                {err !== null ? err.toFixed(2) : '—'}
                              </td>
                            );
                          })}
                          <TD v={row.mae} unit=" dB" />
                        </tr>
                      );
                    })}
                    {/* REW benchmark row */}
                    <tr style={{ borderTop: '2px solid #e5e7eb', background: '#fef9c3' }}>
                      <td style={{ ...mono, padding: '2px 6px', fontWeight: 700, color: '#92400e' }}>REW benchmark</td>
                      {TEST_FREQUENCIES.map(hz => (
                        <td key={hz} style={{ ...mono, padding: '2px 6px', textAlign: 'right', color: '#92400e', fontWeight: 600 }}>
                          {REW_REF[hz].toFixed(1)}
                        </td>
                      ))}
                      <td style={{ ...mono, padding: '2px 6px', textAlign: 'right', color: '#9ca3af' }}>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>

            {/* ── 5. Technical formula notes ── */}
            <details>
              <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                Technical formula notes (all formulations)
              </summary>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {FORMULATIONS.map(f => (
                  <div key={f.key} style={{ padding: '5px 8px', borderRadius: 4, background: '#f8f5ff', border: '1px solid #ddd6fe', fontSize: 9, fontFamily: 'monospace' }}>
                    <span style={{ fontWeight: 700, color: '#7c3aed', marginRight: 8 }}>{f.key} — {f.label}</span>
                    <span style={{ color: '#374151' }}>{f.formula}</span>
                    <div style={{ color: '#6b7280', marginTop: 2 }}>{f.desc}</div>
                  </div>
                ))}
              </div>
            </details>

          </div>
        );
      })()}
    </div>
  );
}