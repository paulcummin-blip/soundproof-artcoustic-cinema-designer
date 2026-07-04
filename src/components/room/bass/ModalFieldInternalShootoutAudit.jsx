// ModalFieldInternalShootoutAudit.jsx
// CASE 031 — Modal Field Internal Shootout.
// Temporary, read-only elimination audit. Treats the modal field as a black box:
// runs ONE real production engine call (simulateBassResponseRewCore), then applies
// controlled post-hoc perturbations (A–L) to the engine's OWN per-mode contributor
// breakdown (returned by the engine for diagnostic use) to isolate which internal
// modal subsystem — receiver coupling, source coupling, phase, Green's-function
// magnitude, or mode family — has authority. No engine code or physics is modified;
// every perturbation operates on vectors the production engine itself already computed.
//
// Same reference case as Case 030: Room 5.0×4.5×3.0 m, sub centre-front, seat y=4.00 m,
// sweep 20–80 Hz.

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from './liveBassAuditOptions';

const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { id: 'centreFront', modelKey: 'reference', x: ROOM.widthM / 2, y: 0.3, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: ROOM.widthM / 2, y: 4.0, z: 1.2 };
const DEFAULT_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const COUPLING_FLOOR = 0.15; // numerical-stability clamp when dividing out a coupling term

// Illustrative REW reference anchor points — approximate, for relative scoring only.
const REW_ANCHORS = [
  { hz: 20, db: 98 }, { hz: 25, db: 95 }, { hz: 30, db: 94 }, { hz: 34, db: 96 },
  { hz: 40, db: 78 }, { hz: 45, db: 85 }, { hz: 50, db: 90 }, { hz: 55, db: 87 },
  { hz: 60, db: 89 }, { hz: 68.6, db: 92.4 }, { hz: 75, db: 88 }, { hz: 80, db: 85 },
];
function interpRew(hz) {
  if (hz <= REW_ANCHORS[0].hz) return REW_ANCHORS[0].db;
  if (hz >= REW_ANCHORS[REW_ANCHORS.length - 1].hz) return REW_ANCHORS[REW_ANCHORS.length - 1].db;
  for (let i = 0; i < REW_ANCHORS.length - 1; i++) {
    const a = REW_ANCHORS[i], b = REW_ANCHORS[i + 1];
    if (hz >= a.hz && hz <= b.hz) { const t = (hz - a.hz) / (b.hz - a.hz); return a.db + (b.db - a.db) * t; }
  }
  return 90;
}
function toDb(mag) { return 20 * Math.log10(Math.max(mag, 1e-10)); }
function mag2(re, im) { return Math.sqrt(re * re + im * im); }
function nearestIndex(freqsHz, target) {
  let bestI = 0, bestD = Infinity;
  freqsHz.forEach((f, i) => { const d = Math.abs(f - target); if (d < bestD) { bestD = d; bestI = i; } });
  return bestI;
}
function metricsFromComplex(freqsHz, complexArr) {
  const splDb = complexArr.map((c) => toDb(mag2(c.re, c.im)));
  const idx30 = nearestIndex(freqsHz, 30);
  const idx34 = nearestIndex(freqsHz, 34);
  const thirtyHzSplDb = splDb[idx30];
  const nullDepthDb = Math.min(...splDb);
  const riseDb = splDb[idx34] - splDb[idx30];
  const mae = freqsHz.reduce((sum, f, i) => sum + Math.abs(splDb[i] - interpRew(f)), 0) / freqsHz.length;
  return { thirtyHzSplDb, nullDepthDb, riseDb, mae };
}

// Deterministic fixed-seed pseudo-random phase per mode (for variant E).
function fixedSeedRandomPhaseRad(nx, ny, nz) {
  const seed = (nx + 1) * 12.9898 + (ny + 1) * 78.233 + (nz + 1) * 37.719;
  const frac = Math.sin(seed * 43758.5453) * 0.5 + 0.5; // 0..1
  return frac * 2 * Math.PI;
}

// Sum a (possibly transformed) contributors list into a single {re, im} modal vector.
function sumContributors(contributors) {
  return contributors.reduce((acc, c) => ({ re: acc.re + c.re, im: acc.im + c.im }), { re: 0, im: 0 });
}

// Transform functions — each takes the engine's own per-mode contributor rows for one
// frequency and returns a new list of {re, im} pairs representing the perturbed modal field.
const TRANSFORMS = {
  B_disableReceiverCoupling: (rows) => rows.map((r) => {
    const divisor = Math.sign(r.receiverCoupling || 1) * Math.max(COUPLING_FLOOR, Math.abs(r.receiverCoupling));
    return { re: r.activeReal / divisor, im: r.activeImag / divisor };
  }),
  C_disableSourceCoupling: (rows) => rows.map((r) => {
    const divisor = Math.sign(r.sourceCoupling || 1) * Math.max(COUPLING_FLOOR, Math.abs(r.sourceCoupling));
    return { re: r.activeReal / divisor, im: r.activeImag / divisor };
  }),
  D_zeroPhase: (rows) => rows.map((r) => ({ re: r.activeMagnitude, im: 0 })),
  E_randomPhase: (rows) => rows.map((r) => {
    const phase = fixedSeedRandomPhaseRad(r.nx, r.ny, r.nz);
    return { re: r.activeMagnitude * Math.cos(phase), im: r.activeMagnitude * Math.sin(phase) };
  }),
  F_equalExcitation: (rows) => {
    const meanMag = rows.reduce((s, r) => s + r.activeMagnitude, 0) / Math.max(1, rows.length);
    return rows.map((r) => {
      const phase = Math.atan2(r.activeImag, r.activeReal);
      return { re: meanMag * Math.cos(phase), im: meanMag * Math.sin(phase) };
    });
  },
  G_doubleGreens: (rows) => rows.map((r) => ({ re: r.activeReal * 2, im: r.activeImag * 2 })),
  H_halfGreens: (rows) => rows.map((r) => ({ re: r.activeReal * 0.5, im: r.activeImag * 0.5 })),
  I_axialOnly: (rows) => rows.filter((r) => r.modeType === 'axial').map((r) => ({ re: r.activeReal, im: r.activeImag })),
  J_axialTangential: (rows) => rows.filter((r) => r.modeType === 'axial' || r.modeType === 'tangential').map((r) => ({ re: r.activeReal, im: r.activeImag })),
  K_obliqueOnly: (rows) => rows.filter((r) => r.modeType === 'oblique').map((r) => ({ re: r.activeReal, im: r.activeImag })),
  L_dominantOnly: (rows) => {
    if (rows.length === 0) return [];
    const dominant = rows.reduce((best, r) => (r.activeMagnitude > best.activeMagnitude ? r : best), rows[0]);
    return [{ re: dominant.activeReal, im: dominant.activeImag }];
  },
};

const th = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#eff6ff', borderBottom: '2px solid #93c5fd', color: '#1e3a8a', whiteSpace: 'nowrap' };
const td = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

export default function ModalFieldInternalShootoutAudit() {
  const [rows, setRows] = useState(null);
  const [running, setRunning] = useState(false);

  const runShootout = useCallback(() => {
    setRunning(true);

    const baseOptions = { ...buildLiveEngineOptions(30, DEFAULT_ABSORPTION), freqMinHz: 20, freqMaxHz: 80 };
    const outA = simulateBassResponseRewCore(ROOM, SEAT, SUB, LIVE_SOURCE_CURVE, baseOptions);
    const freqsHz = outA.freqsHz;
    const vecA = outA.perFrequencyVectorDebug;
    const contributorSeries = outA.activeModalContributorDebugSeries; // index-aligned with freqsHz when enableModes

    const complexA = vecA.map((v) => ({ re: v.finalRe, im: v.finalIm }));

    function complexForTransform(transformKey) {
      return vecA.map((v, i) => {
        const rowSet = contributorSeries[i];
        const rows_ = rowSet?.contributorsInEngineOrder || [];
        const newContribs = TRANSFORMS[transformKey](rows_);
        const newModal = sumContributors(newContribs);
        return { re: v.directRe + v.reflectionRe + newModal.re, im: v.directIm + v.reflectionIm + newModal.im };
      });
    }

    const variants = [
      { key: 'A', label: 'Production (baseline)', complex: complexA },
      { key: 'B', label: 'Disable receiver coupling', complex: complexForTransform('B_disableReceiverCoupling') },
      { key: 'C', label: 'Disable source coupling', complex: complexForTransform('C_disableSourceCoupling') },
      { key: 'D', label: 'Force all modal phases to zero', complex: complexForTransform('D_zeroPhase') },
      { key: 'E', label: 'Randomise modal phase (fixed seed)', complex: complexForTransform('E_randomPhase') },
      { key: 'F', label: 'Force equal modal excitation', complex: complexForTransform('F_equalExcitation') },
      { key: 'G', label: "Double Green's-function magnitude", complex: complexForTransform('G_doubleGreens') },
      { key: 'H', label: "Half Green's-function magnitude", complex: complexForTransform('H_halfGreens') },
      { key: 'I', label: 'Use only axial modes', complex: complexForTransform('I_axialOnly') },
      { key: 'J', label: 'Axial + tangential', complex: complexForTransform('J_axialTangential') },
      { key: 'K', label: 'Oblique only', complex: complexForTransform('K_obliqueOnly') },
      { key: 'L', label: 'Dominant mode only', complex: complexForTransform('L_dominantOnly') },
    ];

    const baselineMetrics = metricsFromComplex(freqsHz, complexA);
    const computed = variants.map((v) => {
      const m = metricsFromComplex(freqsHz, v.complex);
      return {
        key: v.key, label: v.label,
        thirtyHzSplDb: m.thirtyHzSplDb,
        deltaVsA: v.key === 'A' ? 0 : m.thirtyHzSplDb - baselineMetrics.thirtyHzSplDb,
        nullDepthDb: m.nullDepthDb,
        riseDb: m.riseDb,
        mae: m.mae,
      };
    });

    const ranked = computed.filter((r) => r.key !== 'A').sort((a, b) => Math.abs(b.deltaVsA) - Math.abs(a.deltaVsA));
    const materialSubsystems = ranked.filter((r) => Math.abs(r.deltaVsA) >= 1);
    const top3 = ranked.slice(0, 3);

    setRows({ computed, ranked, materialSubsystems, top3 });
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #1d4ed8', borderRadius: 8, background: '#eff6ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        CASE 031 — Modal Field Internal Shootout
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · modal field treated as a black box · A–L post-hoc perturbations on the engine's own per-mode output · zero physics/graph changes
        </span>
      </div>

      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#1e3a8a', marginBottom: 8 }}>
        Reference case (same as Case 030): Room {fmt(ROOM.widthM, 1)}×{fmt(ROOM.lengthM, 1)}×{fmt(ROOM.heightM, 1)} m · Sub centre-front (x {fmt(SUB.x, 2)}, y {fmt(SUB.y, 2)}) · Seat y {fmt(SEAT.y, 2)} m · Sweep 20–80 Hz.
        REW comparison uses illustrative anchor points — MAE is relative, for ranking only.
      </div>

      <button onClick={runShootout} disabled={running}
        style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #1d4ed8', background: running ? '#e5e7eb' : '#1d4ed8', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600, marginBottom: 8 }}>
        {running ? 'Running…' : 'Run Shootout'}
      </button>

      {rows && (
        <>
          <div style={{ marginBottom: 4, fontWeight: 700, color: '#1e3a8a', fontSize: 10, fontFamily: 'monospace' }}>All Variants</div>
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Variant</th>
                  <th style={th}>30 Hz SPL</th><th style={th}>30 Hz Δ</th>
                  <th style={th}>Null Depth</th><th style={th}>30→34 Rise</th><th style={th}>REW MAE</th>
                </tr>
              </thead>
              <tbody>
                {rows.computed.map((r) => (
                  <tr key={r.key} style={{ borderBottom: '1px solid #bfdbfe' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{r.key} — {r.label}</td>
                    <td style={td}>{fmt(r.thirtyHzSplDb)}</td>
                    <td style={{ ...td, fontWeight: 700, color: Math.abs(r.deltaVsA) >= 1 ? '#1d4ed8' : '#1c1917' }}>{r.deltaVsA >= 0 ? '+' : ''}{fmt(r.deltaVsA)}</td>
                    <td style={td}>{fmt(r.nullDepthDb)}</td>
                    <td style={td}>{fmt(r.riseDb)}</td>
                    <td style={td}>{fmt(r.mae)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 4, fontWeight: 700, color: '#1e3a8a', fontSize: 10, fontFamily: 'monospace' }}>Ranked by Influence (|30 Hz Δ| vs Production)</div>
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
              <thead>
                <tr><th style={th}>#</th><th style={{ ...th, textAlign: 'left' }}>Modal Subsystem</th><th style={th}>Influence</th></tr>
              </thead>
              <tbody>
                {rows.ranked.map((r, i) => (
                  <tr key={r.key} style={{ borderBottom: '1px solid #bfdbfe' }}>
                    <td style={td}>{i + 1}</td>
                    <td style={{ ...td, textAlign: 'left' }}>{r.label}</td>
                    <td style={{ ...td, fontWeight: 700, color: Math.abs(r.deltaVsA) >= 1 ? '#1d4ed8' : '#6b7280' }}>{r.deltaVsA >= 0 ? '+' : ''}{fmt(r.deltaVsA)} dB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ border: '1px solid #93c5fd', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#1e3a8a' }}>Final Verdict — Case 031</div>
            <div><strong>TEST:</strong> Twelve independent internal-modal-subsystem perturbations (A–L), applied post-hoc to the production engine's own per-mode output, reference case above.</div>
            <div><strong>EXPECTED:</strong> The internal modal subsystem(s) with real authority over the REW mismatch will show ≥1 dB influence at 30 Hz; unrelated subsystems will show near-zero influence.</div>
            <div><strong>ACTUAL:</strong> Top 3 by influence: {rows.top3.map((r) => `${r.label} (${r.deltaVsA >= 0 ? '+' : ''}${fmt(r.deltaVsA)} dB)`).join(', ')}.</div>
            <div><strong>DELTA:</strong> {rows.materialSubsystems.length} of 11 tested internal subsystems exceed the 1 dB materiality threshold.</div>
            <div><strong>SEVERITY:</strong> Authority concentrated in: {rows.materialSubsystems.length > 0 ? rows.materialSubsystems.map((r) => r.label).join(', ') : 'none — all subsystems below 1 dB.'}</div>
            <div><strong>NEXT TEST:</strong> Retire every subsystem below 1 dB influence ({rows.ranked.filter((r) => Math.abs(r.deltaVsA) < 1).map((r) => r.label).join(', ') || 'none'}). Concentrate further isolation only on the subsystems named above.</div>
          </div>
        </>
      )}
    </div>
  );
}