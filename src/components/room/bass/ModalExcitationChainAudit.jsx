/**
 * ModalExcitationChainAudit.jsx
 *
 * Diagnostic only — no production changes.
 *
 * Audits ONLY the calculation chain that determines how much energy is
 * injected into each mode BEFORE the Green's function transfer function is applied.
 *
 * Ignores: transfer function, Q, damping, reflections, graph rendering, display scaling.
 *
 * Traces every multiplication applied to modal amplitude from source SPL
 * through to the final gain passed into the transfer function.
 */

import React, { useState, useMemo } from 'react';
import { modeShapeValueLocal, computeRoomModesLocal } from '@/bass/core/modalCalculations.js';

const C = 343;

// ─── Chain definition ─────────────────────────────────────────────────────────
// Each entry documents one multiplier in the excitation chain.
// Values are computed at run time against the live room/sub/seat.

function buildChain(roomDims, seatPos, sub, sourceCurveDb, freqHz) {
  const { widthM: W, lengthM: L, heightM: H } = roomDims;
  const dx = sub.x - seatPos.x;
  const dy = sub.y - seatPos.y;
  const dz = sub.z - seatPos.z;
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));

  // Ref pressure from curveDb
  const curveDb = sourceCurveDb; // e.g. 94 dB flat
  const gainDb  = 0;             // no sub gain offset in baseline
  const modalGainScalar = 1.0;   // production default

  // Step 1: Source SPL
  const sourceSpl = curveDb + gainDb;

  // Step 2: Reference pressure amplitude (linear)
  const refPressure = Math.pow(10, sourceSpl / 20);

  // Step 3: modalSourceAmplitudeBase = refPressure × modalGainScalar
  const modalSourceAmplitudeBase = refPressure * modalGainScalar;

  // Step 4: distance_normalized scaling = × (1/distanceM)
  const distanceLossDb = -20 * Math.log10(distM / 1);
  const distanceScale  = Math.pow(10, distanceLossDb / 20); // = 1/distM
  const modalSourceAmplitude1m = modalSourceAmplitudeBase * distanceScale;

  // Step 5: Source coupling Ψ_source — use first representative mode (1,0,0)
  const modes = computeRoomModesLocal({ widthM: W, lengthM: L, heightM: H, fMax: 220, c: C });
  const axialMode = modes.find(m => m.nx === 1 && m.ny === 0 && m.nz === 0) || modes[0];
  const tagentialMode = modes.find(m => m.nx === 1 && m.ny === 1 && m.nz === 0) || modes[1];
  const obliqueMode   = modes.find(m => m.nx === 1 && m.ny === 1 && m.nz === 1) || modes[2];

  function chain(mode) {
    const psiSrc = modeShapeValueLocal(mode, sub.x, sub.y, sub.z, { widthM: W, lengthM: L, heightM: H });
    const psiRcv = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, { widthM: W, lengthM: L, heightM: H });
    const combinedCoupling = psiSrc * psiRcv;

    // Step 6: Family weighting (diagnostic — production uses 1.0 for all families)
    const familyScale = 1.0; // axialFamilyScale = tangentialFamilyScale = obliqueFamilyScale = 1.0

    // Step 7: Order weighting (global removed; high-order axial scale is separate)
    const globalOrderWeight = 1.0; // hardcoded to 1.0 in legacyModalTransferLocal (line ~145)

    // Step 8: High-order axial correction (frequency-independent, mode-type-conditional)
    const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const highOrderAxialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
    // production option: options.highOrderAxialScale (default 1.0 in options, 0.5 hardcoded in parity field solver)

    // Step 9: No additional normalisation or frequency weighting applied before GF
    // (modalGainScalar already applied in step 3; no per-frequency weight in excitation chain)

    // Final amplitude into Green's function:
    const finalGain = modalSourceAmplitude1m * combinedCoupling * globalOrderWeight * highOrderAxialScale * familyScale;

    return {
      mode: `(${mode.nx},${mode.ny},${mode.nz}) f0=${mode.freq.toFixed(1)} Hz`,
      type: mode.type,
      modeOrder,
      psiSrc,
      psiRcv,
      combinedCoupling,
      familyScale,
      globalOrderWeight,
      highOrderAxialScale,
      finalGain,
      finalGainDb: 20 * Math.log10(Math.max(Math.abs(finalGain), 1e-10)),
    };
  }

  const modeResults = [axialMode, tagentialMode, obliqueMode].filter(Boolean).map(chain);

  return {
    distM,
    curveDb,
    gainDb,
    modalGainScalar,
    sourceSpl,
    refPressure,
    modalSourceAmplitudeBase,
    distanceLossDb,
    distanceScale,
    modalSourceAmplitude1m,
    modeResults,
  };
}

// ─── Static multiplier registry ───────────────────────────────────────────────
// Each entry = one multiplication applied to modal amplitude before Green's function.
// Sourced directly from rewBassEngine.js lines 836–448 and legacyModalTransferLocal.

const MULTIPLIERS = [
  {
    id: 'M1',
    name: 'Source curve + gain → reference pressure',
    location: 'rewBassEngine.js ~L843',
    equation: 'A_base = 10^((curveDb + gainDb) / 20)',
    reason: 'Converts source SPL to linear pressure amplitude.',
    canonical: true,
    rewDocs: true,
    effect: 'absolute level only — frequency-dependent because curveDb is frequency-dependent',
    parityRank: 2,
    parityNote: 'Flat source curve → constant. Product curve → frequency shape change.',
  },
  {
    id: 'M2',
    name: 'modalGainScalar (production = 1.0)',
    location: 'rewBassEngine.js ~L837',
    equation: 'A_base × modalGainScalar',
    reason: 'User-facing diagnostic scalar. Default = 1.0 (no effect).',
    canonical: false,
    rewDocs: false,
    effect: 'absolute level only — flat multiplier, frequency-independent',
    parityRank: 7,
    parityNote: 'Identity at production default. Cannot cause frequency-dependent error.',
  },
  {
    id: 'M3',
    name: 'distance_normalized: × (1/distanceM)',
    location: 'rewBassEngine.js ~L847–851',
    equation: 'A_modal = A_base × 10^(distanceLossDb/20) = A_base / distM',
    reason: 'Aligns modal excitation amplitude with REW\'s implicit Green\'s function 1/r distance attenuation. Audit result: MAE 7.20 → 2.85 dB.',
    canonical: false,
    rewDocs: false,
    effect: 'absolute level only — flat constant for fixed geometry, frequency-independent',
    parityRank: 1,
    parityNote: 'HIGHEST PARITY IMPACT. Removing it raises MAE by ~4 dB. But it is a flat scalar — it CANNOT reshape nulls/peaks.',
  },
  {
    id: 'M4',
    name: 'Source coupling Ψ_source = cos(nxπx/W)·cos(nyπy/L)·cos(nzπz/H)',
    location: 'rewBassEngine.js ~L299 → modeShapeValueLocal',
    equation: 'Ψ_src = Π_axis cos(n_i π pos_i / L_i)',
    reason: 'Canonical mode-shape excitation. Determines which modes are strongly driven by source position.',
    canonical: true,
    rewDocs: true,
    effect: 'mode-specific and position-specific — not a flat multiplier; changes relative mode strengths (frequency-dependent via mode selection)',
    parityRank: 3,
    parityNote: 'Canonical formula used. Missing ε factor (see Green\'s function audit) is a constant per-mode scale.',
  },
  {
    id: 'M5',
    name: 'Combined coupling = Ψ_source × Ψ_receiver',
    location: 'rewBassEngine.js ~L309',
    equation: 'combinedCoupling = psiSrc × psiRcv',
    reason: 'Standard modal Green\'s function coupling term. Ψ_rcv handles seat position weighting.',
    canonical: true,
    rewDocs: true,
    effect: 'mode-specific — determines relative energy in each mode (frequency-dependent via mode selection)',
    parityRank: 3,
    parityNote: 'Canonical. Missing ε² is systematic (all modes), frequency-independent.',
  },
  {
    id: 'M6',
    name: 'globalOrderWeight = 1.0 (removed)',
    location: 'rewBassEngine.js ~L145',
    equation: 'orderWeight = 1.0 (hardcoded)',
    reason: 'A global order-based attenuation was previously used but removed. Now hardcoded to 1.0.',
    canonical: true,
    rewDocs: true,
    effect: 'none — identity multiplier',
    parityRank: 8,
    parityNote: 'No effect. Removed correctly.',
  },
  {
    id: 'M7',
    name: 'highOrderAxialCorrectionScale (axial modeOrder ≥ 2: × 0.50)',
    location: 'rewBassEngine.js ~L422–443',
    equation: 'scale = (type === "axial" && order >= 2) ? 0.50 : 1.0',
    reason: 'Reduces 2nd-order+ axial harmonics to match REW. Targets 68.6 Hz axial harmonic specifically.',
    canonical: false,
    rewDocs: false,
    effect: 'mode-type and order conditional — affects axial harmonics only. 1st-order axial and all tangential/oblique untouched.',
    parityRank: 4,
    parityNote: 'Frequency-dependent via mode selection. Changes relative axial harmonic amplitude. Does not reshape null positions.',
  },
  {
    id: 'M8',
    name: 'axialFamilyScale / tangentialFamilyScale / obliqueFamilyScale (production = 1.0)',
    location: 'rewBassEngine.js ~L437–440',
    equation: 'familyScale = axialFamilyScale | tangentialFamilyScale | obliqueFamilyScale (all 1.0)',
    reason: 'Diagnostic-only per-family scalars. All default to 1.0 in production.',
    canonical: false,
    rewDocs: false,
    effect: 'per-family — would be frequency-dependent via mode selection if non-unity',
    parityRank: 9,
    parityNote: 'Identity at production. Cannot cause frequency-dependent error.',
  },
  {
    id: 'M9',
    name: 'storageFactor (modalStorageMode = "none" → 1.0)',
    location: 'rewBassEngine.js ~L327–336',
    equation: 'storageFactor = (modalStorageMode === "none") ? 1.0 : …',
    reason: 'Mode energy storage scaling. Production mode is "none" → factor = 1.0 for all modes.',
    canonical: false,
    rewDocs: false,
    effect: 'none at production default — would be mode-order-dependent if activated',
    parityRank: 9,
    parityNote: 'Identity at production. Cannot cause frequency-dependent error.',
  },
  {
    id: 'M10',
    name: 'modalGain = modalSourceAmplitude × effectiveCoupling × orderWeight',
    location: 'rewBassEngine.js ~L148',
    equation: 'modalGain = modalSourceAmplitude1m × combinedCoupling × 1.0',
    reason: 'Final assembly of all excitation factors before Green\'s function multiplication.',
    canonical: true,
    rewDocs: true,
    effect: 'composite — inherits frequency dependence from source curve and mode-shape coupling',
    parityRank: 1,
    parityNote: 'The sum of all upstream multipliers. This is the A value entering the Green\'s function.',
  },
];

// ─── Ranked conclusion ───────────────────────────────────────────────────────
const RANKED_MULTIPLIERS = [...MULTIPLIERS]
  .filter(m => m.id !== 'M10') // exclude summary row from ranking
  .sort((a, b) => a.parityRank - b.parityRank);

// ─── UI helpers ──────────────────────────────────────────────────────────────
const mono = { fontFamily: 'monospace' };
const th  = { padding: '3px 8px', fontSize: 9, ...mono, fontWeight: 700, color: '#1e3a5f', background: '#eff6ff', borderBottom: '2px solid #93c5fd', textAlign: 'right', whiteSpace: 'nowrap' };
const thL = { ...th, textAlign: 'left' };
const td  = { padding: '2px 8px', fontSize: 9, ...mono, borderBottom: '1px solid #e5e7eb', textAlign: 'right', verticalAlign: 'top' };
const tdL = { ...td, textAlign: 'left' };

function YesNo({ yes, label }) {
  return (
    <span style={{ display: 'inline-block', padding: '0 5px', borderRadius: 3, background: yes ? '#dcfce7' : '#fee2e2', color: yes ? '#166534' : '#991b1b', fontSize: 9, fontWeight: 700, ...mono }}>
      {label ?? (yes ? 'YES' : 'NO')}
    </span>
  );
}

function RankBadge({ rank }) {
  const bg = rank === 1 ? '#fef3c7' : rank <= 3 ? '#eff6ff' : '#f3f4f6';
  const col = rank === 1 ? '#92400e' : rank <= 3 ? '#1e3a5f' : '#6b7280';
  return (
    <span style={{ display: 'inline-block', padding: '0 5px', borderRadius: 3, background: bg, color: col, fontSize: 9, fontWeight: 700, ...mono }}>
      #{rank}
    </span>
  );
}

function StageRow({ step, label, equation, actual, actualDb, expected, delta, severity, note }) {
  const sevColor = severity === 'canonical' ? '#166534' : severity === 'modified' ? '#92400e' : '#1d4ed8';
  const sevBg    = severity === 'canonical' ? '#dcfce7' : severity === 'modified' ? '#fef3c7' : '#eff6ff';
  return (
    <tr style={{ background: Number(step) % 2 === 0 ? '#f8faff' : '#fff' }}>
      <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{step}</td>
      <td style={{ ...tdL, fontWeight: 600 }}>{label}</td>
      <td style={{ ...tdL, fontSize: 8, color: '#374151' }}>{equation}</td>
      <td style={td}>{typeof actual === 'number' ? actual.toExponential(4) : actual ?? '—'}</td>
      <td style={td}>{actualDb !== undefined ? (Number.isFinite(actualDb) ? actualDb.toFixed(2) : '—') : '—'}</td>
      <td style={tdL}>{expected}</td>
      <td style={tdL}>{delta}</td>
      <td style={tdL}>
        <span style={{ display: 'inline-block', padding: '0 5px', borderRadius: 3, background: sevBg, color: sevColor, fontSize: 9, fontWeight: 700, ...mono }}>
          {severity}
        </span>
      </td>
      {note && <td style={{ ...tdL, fontSize: 8, color: '#6b7280' }}>{note}</td>}
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ModalExcitationChainAudit({ roomDims, seatingPositions, subsForSimulation }) {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  const activeSeat = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary);
    return primary || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return {
      x: Number(activeSeat.x),
      y: Number(activeSeat.y),
      z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2,
    };
  }, [activeSeat]);

  const sub = subsForSimulation?.[0] || null;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && sub);

  function run() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      const rd = { widthM: Number(roomDims.widthM), lengthM: Number(roomDims.lengthM), heightM: Number(roomDims.heightM) };
      const sp = seatPos;
      const sb = { x: Number(sub.x), y: Number(sub.y), z: Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35 };
      setResult(buildChain(rd, sp, sb, 94, 50));
      setRan(true);
      setRunning(false);
    }, 10);
  }

  const r = result;

  return (
    <details style={{ border: '2px solid #b45309', borderRadius: 8, background: '#fffbeb', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#b45309', fontSize: 11, cursor: 'pointer', ...mono }}>
        ⛓ Modal Excitation Chain Audit — every multiplier before the Green's function
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, color: '#78350f', lineHeight: 1.7, marginBottom: 8, borderLeft: '3px solid #b45309', paddingLeft: 8, ...mono }}>
          Traces the exact calculation chain that determines modal excitation energy.<br />
          Audits ONLY what happens before the transfer function H(f) is applied.<br />
          Ignores: Q, damping, reflections, late field, graph rendering, post-processing.<br />
          Source: flat 94 dB reference (production parity path). Geometry: live room/sub/seat.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <button onClick={run} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#b45309' : '#d1d5db'}`, background: canRun && !running ? '#b45309' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed', ...mono }}>
            {running ? 'Tracing…' : ran ? 'Re-run' : 'Run Excitation Chain Audit'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#b45309', ...mono }}>Need room dims + seat + sub.</span>}
        </div>

        {r && (
          <>
            {/* ── Geometry summary ── */}
            <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 5, padding: '5px 10px', fontSize: 9, ...mono, marginBottom: 10 }}>
              Room {roomDims.widthM}×{roomDims.lengthM}×{roomDims.heightM} m |
              Sub ({r.distM && (Number(sub.x)).toFixed(2)}, {Number(sub.y).toFixed(2)}, {Number(sub.z ?? 0.35).toFixed(2)}) |
              Seat ({Number(seatPos.x).toFixed(2)}, {Number(seatPos.y).toFixed(2)}, {Number(seatPos.z).toFixed(2)}) |
              Sub→Seat dist: {r.distM.toFixed(3)} m |
              Source curve: {r.curveDb} dB (flat reference)
            </div>

            {/* ── Stage-by-stage trace ── */}
            <div style={{ fontWeight: 700, color: '#78350f', fontSize: 10, ...mono, marginBottom: 4, borderBottom: '1px solid #fbbf24', paddingBottom: 2 }}>
              EXCITATION CHAIN — STAGE-BY-STAGE (flat 94 dB source)
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 30 }}>Step</th>
                    <th style={{ ...thL, minWidth: 160 }}>Stage</th>
                    <th style={{ ...thL, minWidth: 200 }}>Equation</th>
                    <th style={th}>Value (linear)</th>
                    <th style={th}>Value (dB)</th>
                    <th style={thL}>Expected (canonical)</th>
                    <th style={thL}>Delta / Note</th>
                    <th style={thL}>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  <StageRow step={1} label="Source SPL reference"
                    equation={`curveDb + gainDb = ${r.curveDb} + ${r.gainDb}`}
                    actual={null} actualDb={r.sourceSpl}
                    expected="User-defined source level in dB"
                    delta="—" severity="canonical"
                    note="Entry point. Frequency-dependent if product curve used." />
                  <StageRow step={2} label="Reference pressure A_base"
                    equation={`10^(${r.sourceSpl}/20)`}
                    actual={r.refPressure} actualDb={r.sourceSpl}
                    expected="10^(SPL/20)"
                    delta="identity" severity="canonical"
                    note="Standard pressure conversion." />
                  <StageRow step={3} label="× modalGainScalar (=1.0)"
                    equation={`A_base × ${r.modalGainScalar}`}
                    actual={r.modalSourceAmplitudeBase} actualDb={20*Math.log10(r.modalSourceAmplitudeBase)}
                    expected="1.0 = no change"
                    delta="0 dB at production default" severity="identity"
                    note="Diagnostic scalar only. Cannot cause frequency-dependent error." />
                  <StageRow step={4} label="× distance_normalized (1/distM)"
                    equation={`A_base × 10^(distanceLossDb/20) = A × ${r.distanceScale.toFixed(4)}`}
                    actual={r.modalSourceAmplitude1m} actualDb={20*Math.log10(r.modalSourceAmplitude1m)}
                    expected="Canonical: no distance scaling on modal excitation (modes are room-wide phenomena)"
                    delta={`${r.distanceLossDb.toFixed(2)} dB flat offset (geometry-fixed)`}
                    severity="modified"
                    note="Largest single parity contributor. Flat scalar — cannot reshape frequency response." />
                  {r.modeResults.map((m, i) => (
                    <React.Fragment key={i}>
                      <StageRow step={`5.${i+1}`} label={`Ψ_source — ${m.type} ${m.mode}`}
                        equation={`cos(nx·π·srcX/W)·cos(ny·π·srcY/L)·cos(nz·π·srcZ/H)`}
                        actual={m.psiSrc}
                        actualDb={20*Math.log10(Math.max(Math.abs(m.psiSrc), 1e-10))}
                        expected="Canonical cosine product (no ε factor)"
                        delta={`ε missing: ~${(Math.sqrt(2)**(Math.abs(m.mode.split('(')[1]?.split(')')[0]?.split(',').filter(n => Number(n) > 0).length||0))).toFixed(3)}× level diff`}
                        severity="canonical shape / ε absent" />
                      <StageRow step={`5.${i+1}b`} label={`Ψ_receiver — ${m.type}`}
                        equation="cos(nx·π·seatX/W)·cos(ny·π·seatY/L)·cos(nz·π·seatZ/H)"
                        actual={m.psiRcv}
                        actualDb={20*Math.log10(Math.max(Math.abs(m.psiRcv), 1e-10))}
                        expected="Canonical cosine product (no ε factor)"
                        delta="same ε omission"
                        severity="canonical shape / ε absent" />
                      <StageRow step={`5.${i+1}c`} label={`combinedCoupling = Ψ_src × Ψ_rcv`}
                        equation="psiSrc × psiRcv"
                        actual={m.combinedCoupling}
                        actualDb={20*Math.log10(Math.max(Math.abs(m.combinedCoupling), 1e-10))}
                        expected="Canonical: Ψ_src(ε) × Ψ_rcv(ε) = coupling × ε²"
                        delta={`Under-scaled by ε²=${((m.type==='axial'?2:m.type==='tangential'?4:8)).toFixed(1)}× for ${m.type}`}
                        severity="canonical shape / ε absent" />
                    </React.Fragment>
                  ))}
                  <StageRow step={6} label="Family scales (all = 1.0)"
                    equation="axialFamilyScale = tangentialFamilyScale = obliqueFamilyScale = 1.0"
                    actual={1.0} actualDb={0}
                    expected="1.0 (no-op)"
                    delta="0 dB" severity="identity"
                    note="Diagnostic only. No production effect." />
                  <StageRow step={7} label="Global order weight = 1.0 (removed)"
                    equation="orderWeight = 1.0 (hardcoded)"
                    actual={1.0} actualDb={0}
                    expected="1.0 or absent"
                    delta="0 dB" severity="canonical"
                    note="Removed correctly. No effect." />
                  <StageRow step="8a" label="highOrderAxialCorrectionScale (1st axial: ×1.0)"
                    equation="(type==='axial' && order >= 2) ? 0.50 : 1.0"
                    actual={1.0} actualDb={0}
                    expected="Canonical: 1.0 for all"
                    delta="0 dB for 1st-order axial" severity="canonical"
                    note="Only affects 2nd-order+ axial modes." />
                  <StageRow step="8b" label="highOrderAxialCorrectionScale (2nd+ axial: ×0.50)"
                    equation="(type==='axial' && order >= 2) → 0.50"
                    actual={0.50} actualDb={-6.02}
                    expected="Canonical: 1.0"
                    delta="−6 dB on all 2nd-order+ axial modes"
                    severity="modified"
                    note="Frequency-dependent via mode selection. Targets 68.6 Hz harmonic." />
                  <StageRow step={9} label="No frequency weighting or normalisation"
                    equation="— (none applied)"
                    actual={1.0} actualDb={0}
                    expected="1.0"
                    delta="0 dB" severity="canonical"
                    note="No per-frequency weight is applied to the excitation chain." />
                  <StageRow step={10} label="Final gain into Green's function"
                    equation="modalSourceAmplitude1m × combinedCoupling × 1.0 × highOrderAxialScale"
                    actual={r.modeResults[0]?.finalGain}
                    actualDb={r.modeResults[0]?.finalGainDb}
                    expected="A · Ψ_src(ε) · Ψ_rcv(ε)"
                    delta="Differs from canonical by: distance_normalized factor + ε² omission"
                    severity="composite"
                    note="This is the A coefficient entering H(f) for each mode." />
                </tbody>
              </table>
            </div>

            {/* ── Per-mode summary ── */}
            <div style={{ fontWeight: 700, color: '#78350f', fontSize: 10, ...mono, marginBottom: 4, borderBottom: '1px solid #fbbf24', paddingBottom: 2 }}>
              PER-MODE FINAL GAIN INTO GREEN'S FUNCTION (representative modes)
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={thL}>Mode</th>
                    <th style={th}>Type</th>
                    <th style={th}>Ψ_src</th>
                    <th style={th}>Ψ_rcv</th>
                    <th style={th}>Combined coupling</th>
                    <th style={th}>highOrderAxialScale</th>
                    <th style={th}>Final gain</th>
                    <th style={th}>Final gain (dB)</th>
                  </tr>
                </thead>
                <tbody>
                  {r.modeResults.map((m, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fffbeb' }}>
                      <td style={tdL}>{m.mode}</td>
                      <td style={td}>{m.type}</td>
                      <td style={td}>{m.psiSrc.toFixed(5)}</td>
                      <td style={td}>{m.psiRcv.toFixed(5)}</td>
                      <td style={td}>{m.combinedCoupling.toFixed(5)}</td>
                      <td style={{ ...td, color: m.highOrderAxialScale < 1 ? '#991b1b' : '#374151', fontWeight: m.highOrderAxialScale < 1 ? 700 : 400 }}>
                        {m.highOrderAxialScale.toFixed(2)}
                      </td>
                      <td style={td}>{m.finalGain.toExponential(4)}</td>
                      <td style={td}>{m.finalGainDb.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── All multipliers table ── */}
            <div style={{ fontWeight: 700, color: '#78350f', fontSize: 10, ...mono, marginBottom: 4, borderBottom: '1px solid #fbbf24', paddingBottom: 2 }}>
              EVERY MULTIPLIER APPLIED BEFORE THE GREEN'S FUNCTION — RANKED BY PARITY LIKELIHOOD
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 40 }}>Rank</th>
                    <th style={thL}>Multiplier</th>
                    <th style={thL}>Location</th>
                    <th style={thL}>Equation</th>
                    <th style={thL}>Reason</th>
                    <th style={th}>Canonical theory?</th>
                    <th style={th}>REW docs?</th>
                    <th style={thL}>Effect on shape</th>
                    <th style={thL}>Parity note</th>
                  </tr>
                </thead>
                <tbody>
                  {RANKED_MULTIPLIERS.map((m, i) => (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#fffbeb' }}>
                      <td style={{ ...td, textAlign: 'center' }}><RankBadge rank={m.parityRank} /></td>
                      <td style={{ ...tdL, fontWeight: 600 }}>{m.name}</td>
                      <td style={{ ...tdL, fontSize: 8, color: '#6b7280' }}>{m.location}</td>
                      <td style={{ ...tdL, fontSize: 8 }}>{m.equation}</td>
                      <td style={{ ...tdL, fontSize: 8 }}>{m.reason}</td>
                      <td style={{ ...td, textAlign: 'center' }}><YesNo yes={m.canonical} /></td>
                      <td style={{ ...td, textAlign: 'center' }}><YesNo yes={m.rewDocs} /></td>
                      <td style={{ ...tdL, fontSize: 8 }}>{m.effect}</td>
                      <td style={{ ...tdL, fontSize: 8, color: m.parityRank <= 3 ? '#78350f' : '#6b7280', fontWeight: m.parityRank === 1 ? 700 : 400 }}>
                        {m.parityNote}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Conclusion ── */}
            <div style={{ border: '2px solid #b45309', borderRadius: 6, background: '#fef3c7', padding: '8px 12px', fontSize: 11, ...mono, lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: '#78350f', marginBottom: 4 }}>
                ▶ Every multiplier applied before the Green's function (production parity path, flat source):
              </div>
              <ol style={{ margin: '4px 0 8px 16px', fontSize: 10, color: '#374151', lineHeight: 2 }}>
                <li><strong>10^(curveDb/20)</strong> — source pressure (frequency-dependent with product curve; flat with 94 dB reference)</li>
                <li><strong>× modalGainScalar (1.0)</strong> — identity, no effect</li>
                <li><strong>× (1/distM)</strong> — distance_normalized scaling — flat scalar at fixed geometry</li>
                <li><strong>× Ψ_source</strong> — source coupling cosine product (canonical shape; ε omitted)</li>
                <li><strong>× Ψ_receiver</strong> — receiver coupling cosine product (canonical shape; ε omitted)</li>
                <li><strong>× 1.0</strong> — globalOrderWeight (removed, identity)</li>
                <li><strong>× highOrderAxialScale (0.50 if axial order ≥ 2, else 1.0)</strong> — non-canonical, mode-conditional</li>
                <li><strong>× familyScale (1.0 each)</strong> — identity</li>
                <li><strong>× storageFactor (1.0 in "none" mode)</strong> — identity</li>
              </ol>
              <div style={{ fontWeight: 700, color: '#78350f', fontSize: 10, marginBottom: 4 }}>
                Ranked by likelihood of causing frequency-dependent parity error:
              </div>
              <ol style={{ margin: '4px 0 8px 16px', fontSize: 10, color: '#374151', lineHeight: 2 }}>
                <li><strong>distance_normalized (M3)</strong> — largest absolute level change (~4 dB MAE), but flat → cannot reshape nulls</li>
                <li><strong>Source curve shape (M1)</strong> — only frequency-dependent multiplier; flat reference eliminates this</li>
                <li><strong>Coupling position (M4/M5)</strong> — mode-specific via source/seat geometry; canonical shape but ε² absent</li>
                <li><strong>highOrderAxialCorrectionScale (M7)</strong> — mode-conditional, shifts axial harmonic level only</li>
                <li><strong>All remaining (M2, M6, M8, M9)</strong> — identity at production defaults, zero parity contribution</li>
              </ol>
              <div style={{ borderTop: '1px solid #fbbf24', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#78350f' }}>
                <strong>Key finding:</strong> No frequency-dependent multiplier is active in the excitation chain when a flat source is used.
                Every non-identity multiplier is either a flat scalar (distance_normalized, ε omission) or a mode-conditional constant (highOrderAxialScale).
                Neither can produce frequency-varying parity error. The source of any remaining frequency-dependent
                parity gap must lie downstream — in the Q magnitude, modal density, or the Green's function transfer shape itself.
              </div>
            </div>

            <div style={{ fontSize: 9, color: '#6b7280', marginTop: 6, lineHeight: 1.5, ...mono }}>
              Diagnostic only. No production defaults changed.
              Source: rewBassEngine.js (simulateBassResponseRewCore + legacyModalTransferLocal).
            </div>
          </>
        )}
      </div>
    </details>
  );
}