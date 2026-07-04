// AbsorptionAuthorityRootCauseAudit.jsx
// CASE 033 — Absorption Authority Root Cause Audit.
// Temporary, read-only diagnostic. Runs the real production engine
// (simulateBassResponseRewCore) three times at fixed absorption values, then traces
// the absorption path in parallel using the engine's own primitives (estimateModeQLocal,
// computeRoomModesLocal, resonantTransfer) plus a like-for-like copy of the production
// smoothSoftQCap formula (private to rewBassEngine.js) to decide exactly where — if
// anywhere — absorption's authority over final SPL is being lost.
// No engine code or physics is modified.
//
// Reference case: Room 5.0×4.5×3.0 m, sub centre-front, seat y=4.00 m, sweep 20–200 Hz.

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { computeRoomModesLocal, estimateModeQLocal, resonantTransfer } from '@/bass/core/modalCalculations';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from './liveBassAuditOptions';

const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { id: 'centreFront', modelKey: 'reference', x: ROOM.widthM / 2, y: 0.3, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: ROOM.widthM / 2, y: 4.0, z: 1.2 };
const DOMINANT_MODE_FMAX = 90; // low-order modes that dominate the 20-120 Hz region

// Exact copy of the private production cap in rewBassEngine.js (__PRODUCTION_SOFT_Q_CAP__).
// Kept here read-only, for tracing only — production formula is not touched.
function smoothSoftQCap(freqHz) {
  const A = 200;
  const n = 0.52;
  const cap = A / Math.pow(Math.max(freqHz, 1), n);
  return Math.max(8, Math.min(45, cap));
}

function absAbsorption(value) { return { front: value, back: value, left: value, right: value, floor: value, ceiling: value }; }
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function nearestIndex(freqsHz, target) {
  let bestI = 0, bestD = Infinity;
  freqsHz.forEach((f, i) => { const d = Math.abs(f - target); if (d < bestD) { bestD = d; bestI = i; } });
  return bestI;
}

const VARIANTS = [
  { key: 'A', label: 'A — absorption 0.00', value: 0.0 },
  { key: 'B', label: 'B — absorption 0.30', value: 0.3 },
  { key: 'C', label: 'C — absorption 1.00', value: 1.0 },
];

const th = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#fff7ed', borderBottom: '2px solid #fdba74', color: '#7c2d12', whiteSpace: 'nowrap' };
const td = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
const section = { fontWeight: 700, color: '#7c2d12', fontSize: 10, fontFamily: 'monospace', marginBottom: 4, marginTop: 10 };

export default function AbsorptionAuthorityRootCauseAudit() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(() => {
    setRunning(true);

    // ── Dominant low-order modes, generated once (mode geometry doesn't depend on absorption). ──
    const rawModes = computeRoomModesLocal({ widthM: ROOM.widthM, lengthM: ROOM.lengthM, heightM: ROOM.heightM, fMax: DOMINANT_MODE_FMAX, c: 343 });
    const dominantModes = rawModes.slice(0, 6); // lowest-frequency modes dominate the bass region

    const perVariant = VARIANTS.map((variant) => {
      const surfaceAbsorption = absAbsorption(variant.value);

      // ── 1. Real production engine run — full 20-200 Hz sweep. ──
      const engineOptions = { ...buildLiveEngineOptions(30, surfaceAbsorption), freqMinHz: 20, freqMaxHz: 200 };
      const out = simulateBassResponseRewCore(ROOM, SEAT, SUB, LIVE_SOURCE_CURVE, engineOptions);
      const { freqsHz, splDbRaw, modalOnlySeries } = out;

      const idx30 = nearestIndex(freqsHz, 30);
      const idx34 = nearestIndex(freqsHz, 34);
      const thirtyHzSplDb = splDbRaw[idx30];
      const thirtyFourHzSplDb = splDbRaw[idx34];
      const modalMagnitudeAt30 = modalOnlySeries[idx30]?.magnitude ?? null;

      const nullDepthDb = Math.min(...splDbRaw);
      const peakHeightDb = Math.max(...splDbRaw);

      const rippleIndices = freqsHz.map((f, i) => ({ f, i })).filter((p) => p.f >= 60 && p.f <= 120).map((p) => p.i);
      const rippleBandDb = rippleIndices.map((i) => splDbRaw[i]);
      const rippleAvgDb = rippleBandDb.length > 0 ? (Math.max(...rippleBandDb) - Math.min(...rippleBandDb)) : null;

      // ── 2. Parallel absorption-path trace using the engine's own primitives. ──
      const modeTrace = dominantModes.map((mode) => {
        const rawAbsorptionQ = estimateModeQLocal({ roomDims: ROOM, surfaceAbsorption, f0: mode.freq, mode });
        const cap = smoothSoftQCap(mode.freq);
        const finalQ = Math.max(1, Math.min(rawAbsorptionQ, cap));
        const pctLostAtCap = rawAbsorptionQ > 0 ? Math.max(0, ((rawAbsorptionQ - finalQ) / rawAbsorptionQ) * 100) : 0;
        const transferAtResonance = resonantTransfer(mode.freq, mode.freq, finalQ);
        return {
          key: `${mode.nx},${mode.ny},${mode.nz}`,
          freq: mode.freq, type: mode.type,
          rawAbsorptionQ, cap, finalQ, pctLostAtCap,
          transferMagAtResonance: transferAtResonance.transferMag,
        };
      });

      return {
        key: variant.key, label: variant.label, value: variant.value,
        thirtyHzSplDb, thirtyFourHzSplDb, modalMagnitudeAt30, nullDepthDb, peakHeightDb, rippleAvgDb,
        modeTrace,
      };
    });

    const A = perVariant[0], C = perVariant[2];

    // ── Aggregate swings across dominant modes (A → C, absorption 0.00 → 1.00). ──
    const modeSwings = A.modeTrace.map((mA, i) => {
      const mC = C.modeTrace[i];
      const rawQSwingRel = mA.rawAbsorptionQ > 0 ? Math.abs(mC.rawAbsorptionQ - mA.rawAbsorptionQ) / mA.rawAbsorptionQ : 0;
      const finalQSwingRel = mA.finalQ > 0 ? Math.abs(mC.finalQ - mA.finalQ) / mA.finalQ : 0;
      return { key: mA.key, freq: mA.freq, rawQSwingRel, finalQSwingRel, avgPctLostAtCap: (mA.pctLostAtCap + mC.pctLostAtCap) / 2 };
    });
    const avgRawQSwingRel = modeSwings.reduce((s, m) => s + m.rawQSwingRel, 0) / modeSwings.length;
    const avgFinalQSwingRel = modeSwings.reduce((s, m) => s + m.finalQSwingRel, 0) / modeSwings.length;
    const avgPctLostAtCap = modeSwings.reduce((s, m) => s + m.avgPctLostAtCap, 0) / modeSwings.length;

    const finalSplSwingDb = Math.abs(C.thirtyHzSplDb - A.thirtyHzSplDb);
    const modalMagSwing = A.modalMagnitudeAt30 > 0 ? Math.abs(C.modalMagnitudeAt30 - A.modalMagnitudeAt30) / A.modalMagnitudeAt30 : 0;

    const RAW_Q_SWING_THRESHOLD = 0.15;
    const FINAL_Q_SWING_THRESHOLD = 0.15;
    const SPL_SWING_THRESHOLD_DB = 1.0;

    let verdict, verdictLabel, nextFix;
    if (avgRawQSwingRel < RAW_Q_SWING_THRESHOLD) {
      verdict = 1; verdictLabel = 'ABSORPTION INPUT HAS LOW AUTHORITY BEFORE Q';
      nextFix = 'Increase the effective absorption weighting inside estimateModeQLocal (weightedAbsorption / RT60 term) — the raw Sabine-derived Q barely moves between absorption 0.00 and 1.00, so the input never reaches the cap with enough range.';
    } else if (avgFinalQSwingRel < FINAL_Q_SWING_THRESHOLD) {
      verdict = 2; verdictLabel = 'ABSORPTION Q IS BEING SUPPRESSED BY smoothSoftQCap';
      nextFix = 'Widen or remove the smoothSoftQCap ceiling (A=200, n=0.52, clamp [8,45]) for the dominant low-frequency modes — raw absorption-derived Q swings materially across the tested range, but the cap collapses nearly all of that swing before it reaches finalQ.';
    } else if (finalSplSwingDb < SPL_SWING_THRESHOLD_DB) {
      verdict = 3; verdictLabel = 'Q CHANGES CORRECTLY BUT resonantTransfer UNDER-RESPONDS';
      nextFix = 'Review resonantTransfer\'s Q sensitivity (imagDen = omega/(Q*omega0)) and the modal gain multiplication path in legacyModalTransferLocal — finalQ swings materially across the tested absorption range but the resulting 30 Hz SPL barely changes.';
    } else {
      verdict = 4; verdictLabel = 'ABSORPTION IS WORKING AS DESIGNED';
      nextFix = null;
    }

    setResult({ perVariant, modeSwings, avgRawQSwingRel, avgFinalQSwingRel, avgPctLostAtCap, finalSplSwingDb, modalMagSwing, verdict, verdictLabel, nextFix });
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #c2410c', borderRadius: 8, background: '#fff7ed', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#7c2d12', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        CASE 033 — Absorption Authority Root Cause Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · production engine run at 3 fixed absorption values · parallel trace via the engine's own Q/transfer primitives · zero physics/graph changes
        </span>
      </div>

      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#7c2d12', marginBottom: 8 }}>
        Reference case: Room {fmt(ROOM.widthM, 1)}×{fmt(ROOM.lengthM, 1)}×{fmt(ROOM.heightM, 1)} m · Sub centre-front (x {fmt(SUB.x, 2)}, y {fmt(SUB.y, 2)}) · Seat y {fmt(SEAT.y, 2)} m · Sweep 20–200 Hz.
      </div>

      <button onClick={runAudit} disabled={running}
        style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #c2410c', background: running ? '#e5e7eb' : '#c2410c', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600, marginBottom: 4 }}>
        {running ? 'Running…' : 'Run Root Cause Audit'}
      </button>

      {result && (
        <>
          <div style={section}>Per-Variant Response Metrics</div>
          <div style={{ overflowX: 'auto', marginBottom: 6 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Variant</th>
                  <th style={th}>30 Hz SPL</th><th style={th}>34 Hz SPL</th>
                  <th style={th}>Modal Mag @30Hz</th><th style={th}>Null Depth</th>
                  <th style={th}>Peak Height</th><th style={th}>60–120 Hz Ripple</th>
                </tr>
              </thead>
              <tbody>
                {result.perVariant.map((v) => (
                  <tr key={v.key} style={{ borderBottom: '1px solid #fed7aa' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{v.label}</td>
                    <td style={td}>{fmt(v.thirtyHzSplDb)}</td>
                    <td style={td}>{fmt(v.thirtyFourHzSplDb)}</td>
                    <td style={td}>{fmt(v.modalMagnitudeAt30, 4)}</td>
                    <td style={td}>{fmt(v.nullDepthDb)}</td>
                    <td style={td}>{fmt(v.peakHeightDb)}</td>
                    <td style={td}>{fmt(v.rippleAvgDb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={section}>Absorption Path Trace — Dominant Modes (Q for each dominant mode)</div>
          <div style={{ overflowX: 'auto', marginBottom: 6 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Mode (nx,ny,nz) @ f0</th>
                  <th style={th}>Variant</th>
                  <th style={th}>Raw Absorption Q</th>
                  <th style={th}>smoothSoftQCap</th>
                  <th style={th}>Final Q Used</th>
                  <th style={th}>% Lost at Cap</th>
                  <th style={th}>resonantTransfer Mag</th>
                </tr>
              </thead>
              <tbody>
                {result.perVariant.flatMap((v) => v.modeTrace.map((m) => (
                  <tr key={`${v.key}-${m.key}`} style={{ borderBottom: '1px solid #fed7aa' }}>
                    <td style={{ ...td, textAlign: 'left' }}>({m.key}) @ {fmt(m.freq, 1)} Hz {m.type}</td>
                    <td style={{ ...td, textAlign: 'left' }}>{v.label}</td>
                    <td style={td}>{fmt(m.rawAbsorptionQ)}</td>
                    <td style={td}>{fmt(m.cap)}</td>
                    <td style={td}>{fmt(m.finalQ)}</td>
                    <td style={{ ...td, fontWeight: m.pctLostAtCap >= 30 ? 700 : 400, color: m.pctLostAtCap >= 30 ? '#c2410c' : '#1c1917' }}>{fmt(m.pctLostAtCap, 1)}%</td>
                    <td style={td}>{fmt(m.transferMagAtResonance, 4)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>

          <div style={{ border: '1px solid #fdba74', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#7c2d12' }}>Final Verdict — Case 033</div>
            <div><strong>TEST:</strong> Production engine run at absorption 0.00 / 0.30 / 1.00 (A/B/C), reference case above, with a parallel trace of surface absorption → estimateModeQLocal → smoothSoftQCap → resonantTransfer → final SPL for the 6 dominant low-order modes.</div>
            <div><strong>EXPECTED:</strong> Raw absorption-derived Q, capped final Q, and final 30 Hz SPL should all swing materially (≥15% relative Q swing, ≥1 dB SPL swing) between absorption 0.00 and 1.00 if absorption has real authority end-to-end.</div>
            <div><strong>ACTUAL:</strong> Avg raw absorption Q swing {fmt(result.avgRawQSwingRel * 100, 1)}% · Avg final Q (post-cap) swing {fmt(result.avgFinalQSwingRel * 100, 1)}% · Avg % of Q lost at the cap {fmt(result.avgPctLostAtCap, 1)}% · 30 Hz SPL swing {fmt(result.finalSplSwingDb)} dB · Modal magnitude @30Hz swing {fmt(result.modalMagSwing * 100, 1)}%.</div>
            <div><strong>DELTA:</strong> Raw-Q swing vs final-Q swing gap of {fmt(Math.max(0, (result.avgRawQSwingRel - result.avgFinalQSwingRel) * 100), 1)} percentage points is attributable to the cap stage.</div>
            <div><strong>SEVERITY:</strong> {result.verdict === 4 ? 'Low — absorption authority is intact end-to-end.' : 'High — a specific stage in the absorption path is confirmed to be suppressing authority.'}</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{result.verdict}. {result.verdictLabel}</div>
            <div style={{ marginTop: 4 }}><strong>NEXT FIX CANDIDATE:</strong> {result.nextFix || 'None — absorption is working as designed, do not pursue further absorption-path fixes.'}</div>
          </div>
        </>
      )}
    </div>
  );
}