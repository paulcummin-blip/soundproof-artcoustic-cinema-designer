/**
 * ModalGainProvenanceAudit — Diagnostic only.
 * No production changes. Does not affect the live graph.
 *
 * Traces every gain and normalisation stage that contributes to modal-field
 * amplitude for the dominant mode at each target frequency.
 *
 * The 10 stages follow the exact order in rewBassEngine.js / legacyModalTransferLocal:
 *   1.  ψ_source × ψ_receiver          (modeShapeValueLocal × modeShapeValueLocal)
 *   2.  modalSourceWeighting            (curveDb + gainDb → amplitude at 1 m)
 *   3.  distanceBlendWeighting          (modalSourceReferenceMode normalisation)
 *   4.  modalQGain                      (effectiveQ → resonance peak height)
 *   5.  resonanceTransferGain           |H(f, f0, Q)|
 *   6.  modalFamilyScaling              orderWeight (0.5 for order≥2, else 1.0)
 *   7.  modalNormalisation              storageFactor (none→1.0)
 *   8.  modalGainScalar                 user-applied modal gain scalar
 *   9.  finalModalPressure              total pressure contribution (magnitude)
 *  10.  finalModalSPL                   20·log10(magnitude)
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const FLAT_CURVE_DB   = 94;
const SPEED_OF_SOUND  = 343;
const MIN_DIST        = 0.01;
const TARGET_HZ       = [40, 57, 70, 80, 85, 90];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt4 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(4) : '—';
const fmt2 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—';
const fmt1 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—';
const fmtx = (v) => Number.isFinite(Number(v)) ? '×' + Number(v).toFixed(3) : '—';
const toDb = (v) => (Number.isFinite(v) && v > 0) ? (20 * Math.log10(v)).toFixed(2) + ' dB' : '—';
const MONO = { fontFamily: 'monospace' };

function estimateModeQByType(mode, axialQ) {
  const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (activeAxes === 1) return axialQ;
  if (activeAxes === 2) return 3.9;
  return 2.5;
}

function normalizeSurfaceAbsorption(sa) {
  const c = (v) => Math.max(0, Math.min(1.0, Number.isFinite(Number(v)) ? Number(v) : 0.3));
  return {
    front: c(sa?.front), back: c(sa?.back), left: c(sa?.left),
    right: c(sa?.right), floor: c(sa?.floor), ceiling: c(sa?.ceiling),
  };
}

/**
 * For a given frequency, find the dominant mode (highest |H(f,f0,Q)| × |coupling|)
 * and compute all 10 gain stages.
 */
function computeStagesForHz(hz, roomDims, seat, sub, surfaceAbsorption, axialQ, modalGainScalar, modalSourceReferenceMode) {
  const { widthM, lengthM, heightM } = roomDims;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;

  const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
  const subPos  = { x: Number(sub.x),  y: Number(sub.y),  z: subZ  };

  // Build modes
  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: SPEED_OF_SOUND });
  const normSA   = normalizeSurfaceAbsorption(surfaceAbsorption);

  const modes = rawModes.map(mode => {
    const baseQ       = estimateModeQByType(mode, axialQ);
    const absorptionQ = estimateModeQLocal({ roomDims: { widthM, lengthM, heightM }, surfaceAbsorption: normSA, f0: mode.freq });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
  });

  // Find dominant mode = highest |coupling × H(f, f0, Q)|
  let bestMode = null, bestScore = -1;
  for (const mode of modes) {
    const sc = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z, { widthM, lengthM, heightM });
    const rc = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, { widthM, lengthM, heightM });
    const coupling = sc * rc;
    const { transferMag } = resonantTransfer(hz, mode.freq, mode.qValue);
    const score = Math.abs(coupling) * transferMag;
    if (score > bestScore) { bestScore = score; bestMode = { ...mode, sc, rc, coupling }; }
  }
  if (!bestMode) return null;

  // ─── Stage 1: Mode-shape coupling ───────────────────────────────────────────
  const psiSource   = bestMode.sc;
  const psiReceiver = bestMode.rc;
  const combinedCoupling = bestMode.coupling;

  // ─── Stage 2: Modal source weighting ────────────────────────────────────────
  // Engine: modalSourceAmplitudeBase = 10^((curveDb + gainDb) / 20) × modalGainScalar
  // gainDb from sub tuning — 0 for flat curve audit
  const gainDb = Number.isFinite(Number(sub?.tuning?.gainDb)) ? Number(sub.tuning.gainDb) : 0;
  const modalSourceAmplitudeBase = Math.pow(10, (FLAT_CURVE_DB + gainDb) / 20);

  // ─── Stage 3: Distance-blend / modalSourceReferenceMode weighting ──────────
  const dx = subPos.x - seatPos.x;
  const dy = subPos.y - seatPos.y;
  const dz = subPos.z - seatPos.z;
  const distM = Math.max(MIN_DIST, Math.sqrt(dx*dx + dy*dy + dz*dz));
  const distLossLinear = Math.pow(10, (-20 * Math.log10(distM)) / 20); // = 1/distM

  const roomVolumeM3 = widthM * lengthM * heightM;
  let normWeighting = 1.0;
  let normLabel = 'none (existing 1 m ref)';
  if (modalSourceReferenceMode === 'distance_normalized') {
    normWeighting = distLossLinear;
    normLabel = `distance_normalized: ×${fmt4(normWeighting)} (1/${fmt4(distM)} m)`;
  } else if (modalSourceReferenceMode === 'room_volume' || modalSourceReferenceMode === 'room_normalized') {
    normWeighting = 1 / Math.sqrt(Math.max(roomVolumeM3, 1e-6));
    normLabel = `room_volume: ÷√(${fmt4(roomVolumeM3)} m³) = ×${fmt4(normWeighting)}`;
  } else {
    normLabel = 'existing (no normalisation)';
  }
  const modalSourceAmplitude = modalSourceAmplitudeBase * normWeighting * modalGainScalar;

  // ─── Stage 4: Modal Q gain ───────────────────────────────────────────────────
  // The Q determines how high the resonance peak rises.
  // At resonance: |H| ≈ Q. Off-resonance: |H| < Q.
  const effectiveQ = bestMode.qValue;
  // Q gain = effectiveQ is the theoretical on-resonance peak — report actual |H|
  const { re: tfRe, im: tfIm, transferMag } = resonantTransfer(hz, bestMode.freq, effectiveQ);

  // ─── Stage 5: Resonance transfer-function gain ───────────────────────────────
  // |H(f, f0, Q)| — already computed above as transferMag

  // ─── Stage 6: Modal family scaling (orderWeight) ─────────────────────────────
  const modeOrder = Math.abs(bestMode.nx) + Math.abs(bestMode.ny) + Math.abs(bestMode.nz);
  const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
  // Production highOrderAxialScale is 1.0 by default (from activeSettings)
  // Additional axial correction for order≥2 axial modes (production: 0.50 × 0.50 = 0.25 net)
  const highOrderAxialCorrectionScale = (bestMode.type === 'axial' && modeOrder >= 2) ? 1.0 : 1.0;
  // family scale is always 1.0 in production
  const familyScale = 1.0;

  // ─── Stage 7: Storage / normalisation factor ─────────────────────────────────
  // Production default: storageFactor = 1.0 (modalStorageMode = 'none')
  const storageFactor = 1.0;

  // ─── Stage 8: Modal gain scalar ──────────────────────────────────────────────
  // Already folded into modalSourceAmplitude at stage 3 — report it separately
  // modalGainScalar prop

  // ─── Final modal pressure contribution for dominant mode ─────────────────────
  // modalGain = modalSourceAmplitude × combinedCoupling × orderWeight
  // pressure  = modalGain × |H(f, f0, Q)| × storageFactor × familyScale × highOrderAxialScale
  const modalGain = modalSourceAmplitude * combinedCoupling * orderWeight;
  const finalModalPressure = Math.abs(modalGain * transferMag * storageFactor * familyScale * highOrderAxialCorrectionScale);
  const finalModalSPL = finalModalPressure > 0 ? 20 * Math.log10(finalModalPressure) : null;

  // ─── Stage gain contributions (multiplicative) ────────────────────────────────
  // Each stage's "gain" is its multiplicative factor applied to the running total.
  // We decompose as: P_final = base × ψ_coupling × norm × orderWeight × storageFactor × |H|
  // where base = modalSourceAmplitudeBase × modalGainScalar
  const stages = [
    {
      idx: 1, name: 'Mode-shape coupling ψs × ψr',
      input: `ψs=${fmt4(psiSource)}, ψr=${fmt4(psiReceiver)}`,
      multiplier: combinedCoupling,
      output: combinedCoupling,
      outputLabel: fmt4(combinedCoupling),
      note: 'cosine product at source & seat; dimensionless',
    },
    {
      idx: 2, name: 'Modal source weighting',
      input: `${FLAT_CURVE_DB} dB + gain(${gainDb} dB)`,
      multiplier: modalSourceAmplitudeBase,
      output: modalSourceAmplitudeBase,
      outputLabel: fmt4(modalSourceAmplitudeBase) + ' Pa',
      note: `10^((curveDb+gainDb)/20) — source amplitude at 1 m reference`,
    },
    {
      idx: 3, name: 'Distance-blend / normalisation',
      input: normLabel,
      multiplier: normWeighting * modalGainScalar,
      output: modalSourceAmplitude,
      outputLabel: fmt4(modalSourceAmplitude) + ' Pa',
      note: `modalSourceReferenceMode="${modalSourceReferenceMode}", modalGainScalar=${modalGainScalar}`,
    },
    {
      idx: 4, name: 'Modal Q gain (effective Q)',
      input: `Q=${fmt2(effectiveQ)}, f=${hz} Hz, f0=${fmt2(bestMode.freq)} Hz`,
      multiplier: effectiveQ,
      output: effectiveQ,
      outputLabel: fmt2(effectiveQ),
      note: 'on-resonance peak height ≈ Q; actual gain via |H(f,f0,Q)|',
    },
    {
      idx: 5, name: 'Resonance transfer-function |H(f,f0,Q)|',
      input: `f=${hz} Hz, f0=${fmt2(bestMode.freq)} Hz, Q=${fmt2(effectiveQ)}`,
      multiplier: transferMag,
      output: transferMag,
      outputLabel: fmt4(transferMag) + ` (${toDb(transferMag)})`,
      note: `β = f/f0 = ${fmt4(hz / bestMode.freq)}; |H| = 1/√((1−β²)² + (β/Q)²)`,
    },
    {
      idx: 6, name: 'Modal family / order scaling',
      input: `type=${bestMode.type}, order=${modeOrder}`,
      multiplier: orderWeight,
      output: orderWeight,
      outputLabel: fmt2(orderWeight),
      note: modeOrder >= 2 ? 'order ≥ 2 → orderWeight = 0.50' : 'order = 1 → orderWeight = 1.00',
    },
    {
      idx: 7, name: 'Modal normalisation (storage factor)',
      input: `modalStorageMode=none`,
      multiplier: storageFactor,
      output: storageFactor,
      outputLabel: fmt2(storageFactor),
      note: 'production default: storageFactor = 1.0 (no storage compression)',
    },
    {
      idx: 8, name: 'Modal gain scalar',
      input: `modalGainScalar=${modalGainScalar}`,
      multiplier: modalGainScalar,
      output: modalGainScalar,
      outputLabel: fmt2(modalGainScalar),
      note: 'folded into stage 3; shown separately for traceability',
    },
    {
      idx: 9, name: 'Final modal pressure (dominant mode)',
      input: 'modalSourceAmplitude × coupling × orderWeight × storageFactor × |H|',
      multiplier: finalModalPressure,
      output: finalModalPressure,
      outputLabel: fmt4(finalModalPressure) + ' Pa',
      note: 'coherent complex magnitude of dominant mode contribution',
    },
    {
      idx: 10, name: 'Final modal SPL (dominant mode)',
      input: `20 × log10(${fmt4(finalModalPressure)})`,
      multiplier: null,
      output: finalModalSPL,
      outputLabel: Number.isFinite(finalModalSPL) ? fmt1(finalModalSPL) + ' dB' : '—',
      note: 'dominant-mode contribution to total modal pressure sum',
    },
  ];

  // ─── Contribution ranking ─────────────────────────────────────────────────────
  // Rank by the absolute multiplicative effect each stage has on the final pressure.
  // We compute: holding everything else at 1.0, what is the % contribution of each stage?
  // Simpler: rank by the absolute value of log(multiplier) — larger = more gain injected.
  const rankable = [
    { name: 'Mode-shape coupling',          gain: Math.abs(combinedCoupling) },
    { name: 'Modal source amplitude',        gain: Math.abs(modalSourceAmplitudeBase) },
    { name: 'Normalisation × modalGainScal', gain: Math.abs(normWeighting * modalGainScalar) },
    { name: 'Transfer-function |H(f,f0,Q)|', gain: Math.abs(transferMag) },
    { name: 'Order weight',                  gain: Math.abs(orderWeight) },
    { name: 'Storage factor',                gain: Math.abs(storageFactor) },
  ].sort((a, b) => b.gain - a.gain);

  const totalGainProduct = rankable.reduce((acc, r) => acc * r.gain, 1);
  const ranked = rankable.map(r => ({
    ...r,
    pct: totalGainProduct > 0 ? (r.gain / totalGainProduct) * 100 : null,
  }));

  // Verdict
  let verdict = '';
  const top1Pct = ranked[0]?.pct ?? 0;
  const top2Pct = (ranked[0]?.pct ?? 0) + (ranked[1]?.pct ?? 0);
  if (top1Pct > 50) {
    verdict = `"Primary modal amplitude driver: ${ranked[0].name}"`;
  } else if (top2Pct > 80) {
    verdict = `"Modal level dominated by: ${ranked[0].name} + ${ranked[1].name}"`;
  } else {
    verdict = '"Modal gain distributed across architecture."';
  }

  return {
    hz, stages, ranked, verdict,
    dominantMode: bestMode,
    finalModalPressure, finalModalSPL,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ModalGainProvenanceAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [result, setResult]   = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);
  const [activeHz, setActiveHz] = useState(40);

  const axialQ          = activeSettings?.axialQ          ?? 4.0;
  const modalGainScalar = activeSettings?.modalGainScalar ?? 1.0;
  const modalSourceRef  = activeSettings?.modalSourceReferenceMode ?? 'existing';

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null && sub?.x != null && sub?.y != null
  );

  const runAudit = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    setResult(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      const byHz = {};
      for (const hz of TARGET_HZ) {
        await new Promise(r => setTimeout(r, 0));
        byHz[hz] = computeStagesForHz(hz, roomDims, seat, sub, surfaceAbsorption, axialQ, modalGainScalar, modalSourceRef);
      }
      setResult({ byHz });
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ, modalGainScalar, modalSourceRef, canRun]);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const TH  = { padding: '3px 6px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right' };
  const THL = { ...TH, textAlign: 'left' };
  const TD  = { padding: '2px 6px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
  const TDL = { ...TD, textAlign: 'left' };

  const active = result?.byHz?.[activeHz];

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Modal Gain Provenance Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Traces all 10 gain stages for the dominant mode at 40/57/70/80/85/90 Hz.
        Flat 94 dB source · Reflections OFF · Current Q={fmt2(axialQ)} · modalGainScalar={fmt2(modalGainScalar)}
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Need room, seat, and sub.</div>
      )}

      <button
        onClick={runAudit}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #57534e', background: running ? '#1c1917' : '#292524',
          color: running ? '#57534e' : '#d6d3d1', fontSize: 11, ...MONO,
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 10,
        }}
      >
        {running ? 'Computing…' : result ? 'Re-run Audit' : 'Run Modal Gain Provenance Audit'}
      </button>

      {error && <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ {error}</div>}

      {result && (
        <>
          {/* ── Frequency selector tabs ── */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {TARGET_HZ.map(hz => {
              const d = result.byHz[hz];
              const isActive = hz === activeHz;
              return (
                <button
                  key={hz}
                  onClick={() => setActiveHz(hz)}
                  style={{
                    padding: '3px 10px', borderRadius: 4, fontSize: 9, ...MONO, cursor: 'pointer',
                    border: isActive ? '1px solid #60a5fa' : '1px solid #292524',
                    background: isActive ? '#1e3a5f' : '#1c1917',
                    color: isActive ? '#93c5fd' : '#78716c', fontWeight: isActive ? 700 : 400,
                  }}
                >
                  {hz} Hz
                  {d && <span style={{ marginLeft: 5, color: '#57534e' }}>{fmt1(d.finalModalSPL)} dB</span>}
                </button>
              );
            })}
          </div>

          {active && (() => {
            const mode = active.dominantMode;
            return (
              <>
                {/* Dominant mode summary */}
                <div style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 5, borderLeft: '3px solid #a78bfa', fontSize: 9, ...MONO, color: '#d6d3d1', marginBottom: 10, lineHeight: 1.9 }}>
                  <span style={{ color: '#a78bfa', fontWeight: 700 }}>Dominant mode @ {active.hz} Hz: </span>
                  ({mode.nx},{mode.ny},{mode.nz}) {mode.type} · f₀ = {fmt2(mode.freq)} Hz · Q = {fmt2(mode.qValue)}
                  &nbsp;·&nbsp;
                  coupling = {fmt4(mode.coupling)}
                  &nbsp;·&nbsp;
                  Final contribution: <span style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt1(active.finalModalSPL)} dB</span>
                </div>

                {/* ── 10-stage provenance table ── */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
                  10-Stage Gain Provenance
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                    <thead>
                      <tr>
                        <th style={{ ...THL, minWidth: 22 }}>#</th>
                        <th style={{ ...THL, minWidth: 220 }}>Stage</th>
                        <th style={{ ...THL, minWidth: 180 }}>Input</th>
                        <th style={{ ...TH, minWidth: 90 }}>Multiplier</th>
                        <th style={{ ...TH, minWidth: 110 }}>Output</th>
                        <th style={{ ...THL, minWidth: 180 }}>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.stages.map((s) => (
                        <tr key={s.idx} style={{ borderBottom: '1px solid #1c1917', background: s.idx % 2 === 0 ? '#0f0e0d' : 'transparent' }}>
                          <td style={{ ...TDL, color: '#57534e', fontWeight: 700 }}>{s.idx}</td>
                          <td style={{ ...TDL, color: '#d6d3d1', fontWeight: s.idx >= 9 ? 700 : 400 }}>{s.name}</td>
                          <td style={{ ...TDL, color: '#78716c', fontSize: 8 }}>{s.input}</td>
                          <td style={{ ...TD, color: s.multiplier != null && Math.abs(s.multiplier) > 1 ? '#fb923c' : '#86efac' }}>
                            {s.multiplier != null ? fmtx(s.multiplier) : '—'}
                          </td>
                          <td style={{ ...TD, color: s.idx >= 9 ? '#fbbf24' : '#d6d3d1', fontWeight: s.idx >= 9 ? 700 : 400 }}>
                            {s.outputLabel}
                          </td>
                          <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>{s.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Contribution ranking ── */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', ...MONO, marginBottom: 4 }}>
                  Gain Stage Contribution Ranking (largest → smallest)
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
                    <thead>
                      <tr>
                        <th style={{ ...THL, minWidth: 22 }}>#</th>
                        <th style={{ ...THL, minWidth: 220 }}>Stage</th>
                        <th style={{ ...TH, minWidth: 80 }}>Gain</th>
                        <th style={{ ...TH, minWidth: 70 }}>% of product</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.ranked.map((r, idx) => (
                        <tr key={r.name} style={{ borderBottom: '1px solid #1c1917', background: idx === 0 ? '#1a1a0d' : 'transparent' }}>
                          <td style={{ ...TDL, color: idx === 0 ? '#fbbf24' : '#57534e', fontWeight: idx === 0 ? 700 : 400 }}>
                            {idx === 0 ? '★' : idx + 1}
                          </td>
                          <td style={{ ...TDL, color: '#d6d3d1' }}>{r.name}</td>
                          <td style={{ ...TD, color: r.gain > 1 ? '#fb923c' : '#86efac', fontWeight: 700 }}>
                            {fmt4(r.gain)}
                          </td>
                          <td style={{ ...TD, color: (r.pct ?? 0) > 50 ? '#f87171' : (r.pct ?? 0) > 30 ? '#fbbf24' : '#a8a29e', fontWeight: (r.pct ?? 0) > 50 ? 700 : 400 }}>
                            {Number.isFinite(r.pct) ? r.pct.toFixed(1) + '%' : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Verdict ── */}
                <div style={{ padding: '8px 12px', background: '#1c1917', borderRadius: 6, border: '1px solid #292524', fontSize: 10, ...MONO, color: '#86efac', fontStyle: 'italic', lineHeight: 1.9 }}>
                  <span style={{ color: '#4ade80', fontWeight: 700 }}>Verdict @ {active.hz} Hz: </span>
                  {active.verdict}
                </div>
              </>
            );
          })()}

          {/* ── Summary across all frequencies ── */}
          <div style={{ marginTop: 10, fontSize: 10, fontWeight: 700, color: '#a78bfa', ...MONO, marginBottom: 4 }}>
            Summary — Dominant Mode Modal SPL across Target Frequencies
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr>
                  {TARGET_HZ.map(hz => <th key={hz} style={{ ...TH, minWidth: 70, color: '#fbbf24' }}>{hz} Hz</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {TARGET_HZ.map(hz => {
                    const d = result.byHz[hz];
                    return (
                      <td key={hz} style={{ ...TD, color: '#d6d3d1', fontWeight: 700 }}>
                        {d ? fmt1(d.finalModalSPL) + ' dB' : '—'}
                        {d?.dominantMode && (
                          <div style={{ fontSize: 7, color: '#57534e', fontWeight: 400 }}>
                            ({d.dominantMode.nx},{d.dominantMode.ny},{d.dominantMode.nz})
                            @ {fmt1(d.dominantMode.freq)} Hz
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}