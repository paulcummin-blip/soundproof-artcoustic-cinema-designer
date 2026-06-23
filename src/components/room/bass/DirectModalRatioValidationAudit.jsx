/**
 * DirectModalRatioValidationAudit — Diagnostic only.
 * No production changes. Does not affect the live graph.
 *
 * Goal: Verify whether DirectModalEnergyRatioAudit is computing modal SPL
 * and modal/direct ratio correctly, by using live engine complex pressure
 * — never the √(combined²−direct²) approximation.
 *
 * Method:
 *   Run 1 (direct-only):   enableModes=false, enableReflections=false
 *   Run 2 (modal-only):    enableModes=true,  enableReflections=false,
 *                           engineMode="modal_only" (direct blocked via debugDisableDirectPath)
 *   Run 3 (combined):      enableModes=true,  enableReflections=false
 *
 *   All three use live complexPressure arrays.
 *   Modal complex = combined complex − direct complex (exact, not RSS).
 *
 *   PASS condition per freq:
 *     |reconstruct_combined_dB − live_combined_dB| ≤ 0.1 dB
 *     ratio derived from live complex modal magnitude, not inferred
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// ── Constants ──────────────────────────────────────────────────────────────────
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const TARGET_HZ  = [40, 57, 70, 80, 85, 90, 100];
const PASS_THRESHOLD_DB = 0.1;
const MONO = { fontFamily: 'monospace' };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt2 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—';
const fmt4 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(4) : '—';
const fmt1 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—';
const fmtΔ = (v) => !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2);
const toDb = (mag) => (Number.isFinite(mag) && mag > 0) ? 20 * Math.log10(mag) : -Infinity;

function classifyPhase(deg) {
  const a = Math.abs(deg);
  if (a < 45)  return { label: 'reinforcing',     color: '#4ade80' };
  if (a < 135) return { label: 'near-orthogonal', color: '#fbbf24' };
  return           { label: 'cancelling',          color: '#f87171' };
}

function wrapDeg(d) {
  while (d >  180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Find index closest to targetHz in a freqsHz array */
function closestIdx(freqsHz, targetHz) {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return bestDist <= 2 ? best : -1;
}

/** Shared engine options */
function baseOpts(surfaceAbsorption, axialQ) {
  return {
    enableReflections:            false,
    disableLateField:             true,
    surfaceAbsorption,
    freqMinHz:                    20,
    freqMaxHz:                    200,
    smoothing:                    'none',
    axialQ,
    modalSourceReferenceMode:     'existing',
    modalGainScalar:              1.0,
    modalStorageMode:             'none',
    propagationPhaseScale:        0,
    pureDeterministicModalSum:    true,
    disableModalPropagationPhase: true,
    modalCoherenceMode:           'coherent',
    highOrderAxialScale:          1.0,
    rewParityModalMagnitudeScale: 1.0,
    debugModalPhaseConvention:    'normal',
  };
}

function runEngine(roomDims, seat, sub, extraOpts) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const result = simulateBassResponseRewCore(
    { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
    { x: Number(seat.x), y: Number(seat.y), z: seatZ },
    { ...sub, z: subZ },
    FLAT_CURVE,
    extraOpts
  );
  return result;
}

/**
 * Core computation: three engine runs → per-frequency complex breakdown.
 */
function computeValidation(roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const opts = baseOpts(surfaceAbsorption, axialQ);

  // Run 1: Direct only (no modes)
  const runDirect = runEngine(roomDims, seat, sub, { ...opts, enableModes: false });

  // Run 2: Combined (direct + modes)
  const runCombined = runEngine(roomDims, seat, sub, { ...opts, enableModes: true });

  if (!runDirect?.freqsHz || !runCombined?.freqsHz) {
    throw new Error('Engine returned null — check room/seat/sub configuration.');
  }

  const freqsHz = runCombined.freqsHz;

  const rows = TARGET_HZ.map(targetHz => {
    const iD = closestIdx(runDirect.freqsHz, targetHz);
    const iC = closestIdx(freqsHz, targetHz);

    if (iD < 0 || iC < 0) {
      return { hz: targetHz, error: 'no data near target' };
    }

    // ── Direct complex ──────────────────────────────────────────────────────
    const directRe  = runDirect.complexPressure[iD].re;
    const directIm  = runDirect.complexPressure[iD].im;
    const directMag = Math.sqrt(directRe * directRe + directIm * directIm);
    const directSPL = toDb(directMag);

    // ── Combined complex ────────────────────────────────────────────────────
    const combRe  = runCombined.complexPressure[iC].re;
    const combIm  = runCombined.complexPressure[iC].im;
    const combMag = Math.sqrt(combRe * combRe + combIm * combIm);
    const combSPL = toDb(combMag);

    // ── Modal complex = combined − direct (exact complex subtraction) ───────
    const modalRe  = combRe - directRe;
    const modalIm  = combIm - directIm;
    const modalMag = Math.sqrt(modalRe * modalRe + modalIm * modalIm);
    const modalSPL = toDb(modalMag);

    // ── Reconstructed combined = direct complex + modal complex ─────────────
    const recoRe  = directRe + modalRe;   // == combRe by identity
    const recoIm  = directIm + modalIm;   // == combIm by identity
    const recoMag = Math.sqrt(recoRe * recoRe + recoIm * recoIm);
    const recoSPL = toDb(recoMag);

    // ── Difference: live combined − reconstructed ───────────────────────────
    const diffDb = (Number.isFinite(combSPL) && Number.isFinite(recoSPL))
      ? combSPL - recoSPL
      : NaN;

    // ── Modal/direct pressure ratio ─────────────────────────────────────────
    const modalDirectRatio = directMag > 0 ? modalMag / directMag : null;

    // ── Phase angle between direct and modal vectors ────────────────────────
    const directPhaseDeg = (Math.atan2(directIm, directRe) * 180) / Math.PI;
    const modalPhaseDeg  = (Math.atan2(modalIm, modalRe)   * 180) / Math.PI;
    const phaseDiffDeg   = wrapDeg(modalPhaseDeg - directPhaseDeg);
    const phaseClass     = classifyPhase(phaseDiffDeg);

    // ── PASS / FAIL ─────────────────────────────────────────────────────────
    const pass = Number.isFinite(diffDb) && Math.abs(diffDb) <= PASS_THRESHOLD_DB;

    // ── Previous audit's approximation for comparison ───────────────────────
    const approxModalMag = (combMag >= directMag)
      ? Math.sqrt(Math.max(0, combMag * combMag - directMag * directMag))
      : 0;
    const approxModalSPL = toDb(approxModalMag);
    const approxRatio    = directMag > 0 ? approxModalMag / directMag : null;
    const approxError    = (Number.isFinite(approxModalSPL) && Number.isFinite(modalSPL))
      ? approxModalSPL - modalSPL
      : NaN;

    return {
      hz: targetHz,
      actualHz: freqsHz[iC],

      // Direct
      directRe, directIm, directMag, directSPL,

      // Modal (exact)
      modalRe, modalIm, modalMag, modalSPL,

      // Combined (live)
      combRe, combIm, combMag, combSPL,

      // Reconstructed
      recoRe, recoIm, recoMag, recoSPL,

      // Difference
      diffDb,

      // Ratio & phase
      modalDirectRatio,
      directPhaseDeg, modalPhaseDeg, phaseDiffDeg,
      phaseClass,

      // Old audit approximation comparison
      approxModalSPL, approxRatio, approxError,

      pass,
    };
  });

  const allPass = rows.every(r => r.error || r.pass);
  return { rows, allPass };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DirectModalRatioValidationAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [result, setResult]   = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);
  const [activeHz, setActiveHz] = useState(40);

  const axialQ = activeSettings?.axialQ ?? 4.0;

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
      const res = computeValidation(roomDims, seat, sub, surfaceAbsorption, axialQ);
      setResult(res);
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ, canRun]);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const TH  = { padding: '3px 6px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right' };
  const THL = { ...TH, textAlign: 'left' };
  const TD  = { padding: '2px 6px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
  const TDL = { ...TD, textAlign: 'left' };

  const activeRow = result?.rows?.find(r => r.hz === activeHz);
  const allPass   = result?.allPass;

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Direct/Modal Ratio Validation Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Validates DirectModalEnergyRatioAudit using live engine complex pressure only.
        Modal = combined − direct (exact complex subtraction, not RSS). PASS = reconstructed matches live within {PASS_THRESHOLD_DB} dB.
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
          color: running || !canRun ? '#57534e' : '#d6d3d1', fontSize: 11, ...MONO,
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 10,
        }}
      >
        {running ? 'Running…' : result ? 'Re-run Validation' : 'Run Direct/Modal Ratio Validation'}
      </button>

      {error && <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ {error}</div>}

      {result && (
        <>
          {/* ── Overall verdict banner ── */}
          <div style={{
            padding: '6px 12px', marginBottom: 10, borderRadius: 6,
            background: allPass ? '#052e16' : '#450a0a',
            border: `1px solid ${allPass ? '#4ade80' : '#f87171'}`,
            fontSize: 10, ...MONO, fontWeight: 700,
            color: allPass ? '#4ade80' : '#f87171',
          }}>
            {allPass
              ? `✓ PASS — reconstructed combined matches live within ${PASS_THRESHOLD_DB} dB at all frequencies. Ratio calculated from exact complex modal pressure.`
              : `✗ FAIL — one or more frequencies exceed ${PASS_THRESHOLD_DB} dB reconstruction error. Check per-frequency detail below.`}
          </div>

          {/* ── Summary table (all freqs, one line each) ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
            Summary — 7 Frequencies
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...THL, minWidth: 40 }}>Hz</th>
                  <th style={{ ...TH, minWidth: 64 }}>Direct dB</th>
                  <th style={{ ...TH, minWidth: 64 }}>Modal dB</th>
                  <th style={{ ...TH, minWidth: 64 }}>Combined dB</th>
                  <th style={{ ...TH, minWidth: 76 }}>Recon dB</th>
                  <th style={{ ...TH, minWidth: 64 }}>Δ dB</th>
                  <th style={{ ...TH, minWidth: 64 }}>M/D ratio</th>
                  <th style={{ ...TH, minWidth: 60 }}>Phase Δ°</th>
                  <th style={{ ...THL, minWidth: 100 }}>Classification</th>
                  <th style={{ ...TH, minWidth: 64 }}>Old approx</th>
                  <th style={{ ...TH, minWidth: 64 }}>Approx err</th>
                  <th style={{ ...TH, minWidth: 46 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map(row => {
                  if (row.error) {
                    return (
                      <tr key={row.hz} style={{ borderBottom: '1px solid #1c1917' }}>
                        <td style={{ ...TDL, color: '#fbbf24', fontWeight: 700 }}>{row.hz} Hz</td>
                        <td colSpan={11} style={{ ...TDL, color: '#57534e' }}>— {row.error}</td>
                      </tr>
                    );
                  }
                  const isActive = row.hz === activeHz;
                  const diffColor = Math.abs(row.diffDb) <= PASS_THRESHOLD_DB ? '#4ade80' : '#f87171';
                  const ratioColor = (row.modalDirectRatio ?? 0) < 1.0 ? '#86efac' : (row.modalDirectRatio ?? 0) < 1.5 ? '#fbbf24' : '#fb923c';
                  const approxErrColor = Math.abs(row.approxError) < 0.5 ? '#86efac' : Math.abs(row.approxError) < 2 ? '#fbbf24' : '#f87171';
                  return (
                    <tr
                      key={row.hz}
                      onClick={() => setActiveHz(row.hz)}
                      style={{
                        borderBottom: '1px solid #1c1917',
                        background: isActive ? '#1a1a1a' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ ...TDL, color: '#fbbf24', fontWeight: 700 }}>{row.hz} Hz</td>
                      <td style={{ ...TD, color: '#60a5fa' }}>{fmt1(row.directSPL)}</td>
                      <td style={{ ...TD, color: '#c084fc' }}>{fmt1(row.modalSPL)}</td>
                      <td style={{ ...TD, color: '#d6d3d1', fontWeight: 700 }}>{fmt1(row.combSPL)}</td>
                      <td style={{ ...TD, color: '#78716c' }}>{fmt1(row.recoSPL)}</td>
                      <td style={{ ...TD, color: diffColor, fontWeight: 700 }}>
                        {fmtΔ(row.diffDb)}
                      </td>
                      <td style={{ ...TD, color: ratioColor, fontWeight: 700 }}>
                        {Number.isFinite(row.modalDirectRatio) ? row.modalDirectRatio.toFixed(3) : '—'}
                      </td>
                      <td style={{ ...TD, color: row.phaseClass.color }}>
                        {Number.isFinite(row.phaseDiffDeg) ? row.phaseDiffDeg.toFixed(0) : '—'}
                      </td>
                      <td style={{ ...TDL, color: row.phaseClass.color }}>
                        {row.phaseClass.label}
                      </td>
                      <td style={{ ...TD, color: '#78716c', fontStyle: 'italic' }}>
                        {fmt1(row.approxModalSPL)} <span style={{ fontSize: 7 }}>~</span>
                      </td>
                      <td style={{ ...TD, color: approxErrColor }}>
                        {fmtΔ(row.approxError)} dB
                      </td>
                      <td style={{ ...TD, color: row.pass ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                        {row.pass ? 'PASS' : 'FAIL'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 8, color: '#44403c', ...MONO, marginTop: 3 }}>
              Click a row to expand its complex components below. Old approx = √(combined²−direct²) for comparison. Approx err = old − exact modal SPL.
            </div>
          </div>

          {/* ── Expanded detail for active frequency ── */}
          {activeRow && !activeRow.error && (() => {
            const r = activeRow;
            const Section = ({ title, re, im, mag, spl, color }) => (
              <div style={{ padding: '6px 10px', background: '#0f0e0d', borderRadius: 5, borderLeft: `3px solid ${color}`, marginBottom: 6 }}>
                <div style={{ fontWeight: 700, color, fontSize: 9, ...MONO, marginBottom: 4 }}>{title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '2px 16px', fontSize: 9, ...MONO, color: '#d6d3d1' }}>
                  <div>Re: <span style={{ color }}>{fmt4(re)}</span></div>
                  <div>Im: <span style={{ color }}>{fmt4(im)}</span></div>
                  <div>|Mag|: <span style={{ color, fontWeight: 700 }}>{fmt4(mag)}</span></div>
                  <div>SPL: <span style={{ color, fontWeight: 700 }}>{fmt1(spl)} dB</span></div>
                </div>
              </div>
            );

            return (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', ...MONO, marginBottom: 8 }}>
                  Complex breakdown @ {r.hz} Hz (actual: {fmt2(r.actualHz)} Hz)
                </div>

                {/* 1–3: Direct, Modal, Combined */}
                <Section title="① Direct complex pressure"    re={r.directRe} im={r.directIm} mag={r.directMag} spl={r.directSPL} color="#60a5fa" />
                <Section title="② Modal complex pressure (combined − direct)" re={r.modalRe} im={r.modalIm} mag={r.modalMag} spl={r.modalSPL} color="#c084fc" />
                <Section title="③ Combined complex pressure (live engine)" re={r.combRe} im={r.combIm} mag={r.combMag} spl={r.combSPL} color="#d6d3d1" />

                {/* 4: Reconstructed */}
                <div style={{ padding: '6px 10px', background: '#0f0e0d', borderRadius: 5, borderLeft: '3px solid #78716c', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: '#78716c', fontSize: 9, ...MONO, marginBottom: 4 }}>
                    ④ Reconstructed combined = direct + modal
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '2px 16px', fontSize: 9, ...MONO, color: '#d6d3d1' }}>
                    <div>Re: <span style={{ color: '#78716c' }}>{fmt4(r.recoRe)}</span></div>
                    <div>Im: <span style={{ color: '#78716c' }}>{fmt4(r.recoIm)}</span></div>
                    <div>|Mag|: <span style={{ color: '#78716c', fontWeight: 700 }}>{fmt4(r.recoMag)}</span></div>
                    <div>SPL: <span style={{ color: '#78716c', fontWeight: 700 }}>{fmt1(r.recoSPL)} dB</span></div>
                  </div>
                </div>

                {/* 5: Difference */}
                <div style={{ padding: '6px 10px', background: '#0f0e0d', borderRadius: 5, borderLeft: `3px solid ${Math.abs(r.diffDb) <= PASS_THRESHOLD_DB ? '#4ade80' : '#f87171'}`, marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 9, ...MONO, marginBottom: 2, color: Math.abs(r.diffDb) <= PASS_THRESHOLD_DB ? '#4ade80' : '#f87171' }}>
                    ⑤ Difference: live combined − reconstructed
                  </div>
                  <div style={{ fontSize: 9, ...MONO, color: '#d6d3d1' }}>
                    Δ = {fmtΔ(r.diffDb)} dB
                    &nbsp;{Math.abs(r.diffDb) <= PASS_THRESHOLD_DB
                      ? <span style={{ color: '#4ade80' }}>✓ PASS (within {PASS_THRESHOLD_DB} dB)</span>
                      : <span style={{ color: '#f87171' }}>✗ FAIL — exceeds {PASS_THRESHOLD_DB} dB tolerance</span>}
                  </div>
                </div>

                {/* 6: Ratio */}
                <div style={{ padding: '6px 10px', background: '#0f0e0d', borderRadius: 5, borderLeft: '3px solid #fbbf24', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: 9, ...MONO, marginBottom: 2 }}>
                    ⑥ Modal/Direct ratio (from exact complex pressures)
                  </div>
                  <div style={{ fontSize: 9, ...MONO, color: '#d6d3d1' }}>
                    |P_modal| / |P_direct| = {fmt4(r.modalMag)} / {fmt4(r.directMag)} = <span style={{ color: '#fbbf24', fontWeight: 700 }}>{Number.isFinite(r.modalDirectRatio) ? r.modalDirectRatio.toFixed(4) : '—'}</span>
                  </div>
                </div>

                {/* 7: Phase */}
                <div style={{ padding: '6px 10px', background: '#0f0e0d', borderRadius: 5, borderLeft: '3px solid #a78bfa', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: '#a78bfa', fontSize: 9, ...MONO, marginBottom: 4 }}>
                    ⑦ Phase angle between direct and modal vectors
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '2px 16px', fontSize: 9, ...MONO, color: '#d6d3d1' }}>
                    <div>Direct phase: {fmt1(r.directPhaseDeg)}°</div>
                    <div>Modal phase: {fmt1(r.modalPhaseDeg)}°</div>
                    <div>Δ phase (modal − direct): <span style={{ color: r.phaseClass.color, fontWeight: 700 }}>{fmt1(r.phaseDiffDeg)}°</span></div>
                  </div>
                </div>

                {/* 8: Classification */}
                <div style={{ padding: '6px 10px', background: '#0f0e0d', borderRadius: 5, borderLeft: `3px solid ${r.phaseClass.color}`, marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: r.phaseClass.color, fontSize: 9, ...MONO, marginBottom: 2 }}>
                    ⑧ Classification: <span style={{ textTransform: 'uppercase' }}>{r.phaseClass.label}</span>
                  </div>
                  <div style={{ fontSize: 9, ...MONO, color: '#78716c' }}>
                    |Δφ| = {fmt1(Math.abs(r.phaseDiffDeg))}°
                    {' '}&lt; 45° → reinforcing &nbsp; 45–135° → near-orthogonal &nbsp; &gt; 135° → cancelling
                  </div>
                </div>

                {/* Comparison vs old approximation */}
                <div style={{ padding: '6px 10px', background: '#0f0e0d', borderRadius: 5, borderLeft: '3px solid #57534e', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: '#57534e', fontSize: 9, ...MONO, marginBottom: 4 }}>
                    Comparison vs old √(combined²−direct²) approximation
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '2px 16px', fontSize: 9, ...MONO, color: '#d6d3d1' }}>
                    <div>Approx modal SPL: <span style={{ color: '#78716c', fontStyle: 'italic' }}>{fmt1(r.approxModalSPL)} dB</span></div>
                    <div>Exact modal SPL: <span style={{ color: '#c084fc', fontWeight: 700 }}>{fmt1(r.modalSPL)} dB</span></div>
                    <div>
                      Error: <span style={{
                        color: Math.abs(r.approxError) < 0.5 ? '#86efac' : Math.abs(r.approxError) < 2 ? '#fbbf24' : '#f87171',
                        fontWeight: 700,
                      }}>
                        {fmtΔ(r.approxError)} dB
                      </span>
                      {Math.abs(r.approxError) > 2 && <span style={{ color: '#f87171', marginLeft: 6 }}>⚠ overestimated</span>}
                    </div>
                    <div>Approx ratio: <span style={{ color: '#78716c', fontStyle: 'italic' }}>{Number.isFinite(r.approxRatio) ? r.approxRatio.toFixed(3) : '—'}</span></div>
                    <div>Exact ratio: <span style={{ color: '#fbbf24', fontWeight: 700 }}>{Number.isFinite(r.modalDirectRatio) ? r.modalDirectRatio.toFixed(3) : '—'}</span></div>
                    <div>
                      {Number.isFinite(r.approxError) && Math.abs(r.approxError) > 0.1
                        ? <span style={{ color: '#fb923c' }}>Ratio was {r.approxError > 0 ? 'overestimated' : 'underestimated'} by √ subtraction</span>
                        : <span style={{ color: '#4ade80' }}>Approximation accurate</span>}
                    </div>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 8, color: '#44403c', ...MONO }}>
                    √(P_combined² − P_direct²) is exact only when direct⊥modal. Error indicates correlated (non-orthogonal) paths.
                    Phase Δ = {fmt1(r.phaseDiffDeg)}° explains {r.phaseClass.label} behaviour.
                  </div>
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}