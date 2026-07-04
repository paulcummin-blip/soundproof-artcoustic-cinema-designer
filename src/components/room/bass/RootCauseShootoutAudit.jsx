// RootCauseShootoutAudit.jsx
// CASE 030 — Root Cause Shootout.
// Temporary, read-only elimination audit. Runs the real production engine
// (simulateBassResponseRewCore) with one subsystem perturbed at a time (A–P),
// everything else left at the exact live-graph production options. No engine
// code is modified; perturbations are either real engine options (Q, gain,
// absorption, enable flags) or post-hoc vector rotations applied to the
// engine's own decomposed output vectors (direct/reflection/modal), which is
// a controlled experiment on the existing output — not new physics.
//
// Fixed reference case (per audit spec): Room 5.0×4.5×3.0 m, sub centre-front,
// seat y = 4.00 m, sweep 20–80 Hz.

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from './liveBassAuditOptions';

const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { id: 'centreFront', modelKey: 'reference', x: ROOM.widthM / 2, y: 0.3, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: ROOM.widthM / 2, y: 4.0, z: 1.2 };
const DEFAULT_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };

// Illustrative REW reference anchor points — approximate, for relative scoring only.
// Not a captured measurement; replace with the real REW export when available.
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
    if (hz >= a.hz && hz <= b.hz) {
      const t = (hz - a.hz) / (b.hz - a.hz);
      return a.db + (b.db - a.db) * t;
    }
  }
  return 90;
}

function rotate(re, im, deg) {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  return { re: re * c - im * s, im: re * s + im * c };
}
function toDb(mag) { return 20 * Math.log10(Math.max(mag, 1e-10)); }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function nearestIndex(freqsHz, target) {
  let bestI = 0, bestD = Infinity;
  freqsHz.forEach((f, i) => { const d = Math.abs(f - target); if (d < bestD) { bestD = d; bestI = i; } });
  return bestI;
}

function metricsFromComplex(freqsHz, complexArr) {
  const splDb = complexArr.map((c) => toDb(mag(c.re, c.im)));
  const idx30 = nearestIndex(freqsHz, 30);
  const idx34 = nearestIndex(freqsHz, 34);
  const thirtyHzSplDb = splDb[idx30];
  const nullDepthDb = Math.min(...splDb);
  const riseDb = splDb[idx34] - splDb[idx30];
  const mae = freqsHz.reduce((sum, f, i) => sum + Math.abs(splDb[i] - interpRew(f)), 0) / freqsHz.length;
  return { thirtyHzSplDb, nullDepthDb, riseDb, mae };
}

const th = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#fef2f2', borderBottom: '2px solid #fca5a5', color: '#991b1b', whiteSpace: 'nowrap' };
const td = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

export default function RootCauseShootoutAudit() {
  const [rows, setRows] = useState(null);
  const [running, setRunning] = useState(false);

  const runShootout = useCallback(() => {
    setRunning(true);

    const baseOptions = { ...buildLiveEngineOptions(30, DEFAULT_ABSORPTION), freqMinHz: 20, freqMaxHz: 80 };

    function runEngine(optionOverrides) {
      return simulateBassResponseRewCore(ROOM, SEAT, SUB, LIVE_SOURCE_CURVE, { ...baseOptions, ...optionOverrides });
    }

    // A — Production baseline (single real engine run; also feeds the post-hoc variants D,I,J,K,L,O,P)
    const outA = runEngine({});
    const freqsHz = outA.freqsHz;
    const vecA = outA.perFrequencyVectorDebug; // [{directRe, directIm, reflectionRe, reflectionIm, modalSumRe, modalSumIm, finalRe, finalIm}]
    const complexA = vecA.map((v) => ({ re: v.finalRe, im: v.finalIm }));

    // B — Disable modal field (real option)
    const outB = runEngine({ enableModes: false });
    const complexB = outB.perFrequencyVectorDebug.map((v) => ({ re: v.finalRe, im: v.finalIm }));

    // C — Disable reflection field (real option — already off in the live baseline, so expect ~0 delta)
    const outC = runEngine({ enableReflections: false });
    const complexC = outC.perFrequencyVectorDebug.map((v) => ({ re: v.finalRe, im: v.finalIm }));

    // D — Disable direct field (post-hoc: subtract direct component from baseline A)
    const complexD = vecA.map((v) => ({ re: v.finalRe - v.directRe, im: v.finalIm - v.directIm }));

    // E/F — Double / half modal Q (real option, forced active via overrideConstantAxialQ)
    const outE = runEngine({ axialQ: 8.0, overrideConstantAxialQ: true });
    const complexE = outE.perFrequencyVectorDebug.map((v) => ({ re: v.finalRe, im: v.finalIm }));
    const outF = runEngine({ axialQ: 2.0, overrideConstantAxialQ: true });
    const complexF = outF.perFrequencyVectorDebug.map((v) => ({ re: v.finalRe, im: v.finalIm }));

    // G/H — Double / half reflection magnitude (real option)
    const outG = runEngine({ reflectionGainScale: 2.0 });
    const complexG = outG.perFrequencyVectorDebug.map((v) => ({ re: v.finalRe, im: v.finalIm }));
    const outH = runEngine({ reflectionGainScale: 0.5 });
    const complexH = outH.perFrequencyVectorDebug.map((v) => ({ re: v.finalRe, im: v.finalIm }));

    // I/J — Rotate all reflection vectors +/-15 deg (post-hoc, from baseline A decomposition)
    const complexI = vecA.map((v) => {
      const r = rotate(v.reflectionRe, v.reflectionIm, 15);
      return { re: v.directRe + r.re + v.modalSumRe, im: v.directIm + r.im + v.modalSumIm };
    });
    const complexJ = vecA.map((v) => {
      const r = rotate(v.reflectionRe, v.reflectionIm, -15);
      return { re: v.directRe + r.re + v.modalSumRe, im: v.directIm + r.im + v.modalSumIm };
    });

    // K/L — Rotate all modal vectors +/-15 deg (post-hoc, from baseline A decomposition)
    const complexK = vecA.map((v) => {
      const r = rotate(v.modalSumRe, v.modalSumIm, 15);
      return { re: v.directRe + v.reflectionRe + r.re, im: v.directIm + v.reflectionIm + r.im };
    });
    const complexL = vecA.map((v) => {
      const r = rotate(v.modalSumRe, v.modalSumIm, -15);
      return { re: v.directRe + v.reflectionRe + r.re, im: v.directIm + v.reflectionIm + r.im };
    });

    // M/N — Double / half boundary absorption influence (real option: scale absorption coefficients fed to the modal model)
    const doubledAbs = Object.fromEntries(Object.entries(DEFAULT_ABSORPTION).map(([k, v]) => [k, Math.min(1, v * 2)]));
    const halvedAbs = Object.fromEntries(Object.entries(DEFAULT_ABSORPTION).map(([k, v]) => [k, v * 0.5]));
    const outM = runEngine({ surfaceAbsorption: doubledAbs });
    const complexM = outM.perFrequencyVectorDebug.map((v) => ({ re: v.finalRe, im: v.finalIm }));
    const outN = runEngine({ surfaceAbsorption: halvedAbs });
    const complexN = outN.perFrequencyVectorDebug.map((v) => ({ re: v.finalRe, im: v.finalIm }));

    // O/P — Increase / decrease propagation delay by 10% (post-hoc: rotate the direct+reflection
    // phase by +/-10% of its own angle, keeping magnitude fixed; modal phase is already disabled
    // in the live baseline so it is unaffected either way).
    function delayPerturb(scaleFactor) {
      return vecA.map((v) => {
        const primaryRe = v.directRe + v.reflectionRe;
        const primaryIm = v.directIm + v.reflectionIm;
        const primaryMag = mag(primaryRe, primaryIm);
        const primaryPhase = Math.atan2(primaryIm, primaryRe) * (180 / Math.PI);
        const newPhase = primaryPhase * scaleFactor;
        const rad = (newPhase * Math.PI) / 180;
        const rotatedRe = primaryMag * Math.cos(rad);
        const rotatedIm = primaryMag * Math.sin(rad);
        return { re: rotatedRe + v.modalSumRe, im: rotatedIm + v.modalSumIm };
      });
    }
    const complexO = delayPerturb(1.1);
    const complexP = delayPerturb(0.9);

    const variants = [
      { key: 'A', label: 'Production (baseline)', complex: complexA },
      { key: 'B', label: 'Disable modal field', complex: complexB },
      { key: 'C', label: 'Disable reflection field', complex: complexC },
      { key: 'D', label: 'Disable direct field', complex: complexD },
      { key: 'E', label: 'Double modal Q', complex: complexE },
      { key: 'F', label: 'Half modal Q', complex: complexF },
      { key: 'G', label: 'Double reflection magnitude', complex: complexG },
      { key: 'H', label: 'Half reflection magnitude', complex: complexH },
      { key: 'I', label: 'Rotate reflection vectors +15°', complex: complexI },
      { key: 'J', label: 'Rotate reflection vectors -15°', complex: complexJ },
      { key: 'K', label: 'Rotate modal vectors +15°', complex: complexK },
      { key: 'L', label: 'Rotate modal vectors -15°', complex: complexL },
      { key: 'M', label: 'Double boundary absorption influence', complex: complexM },
      { key: 'N', label: 'Half boundary absorption influence', complex: complexN },
      { key: 'O', label: 'Increase propagation delay +10%', complex: complexO },
      { key: 'P', label: 'Decrease propagation delay -10%', complex: complexP },
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

    // Rank by influence (|delta 30Hz SPL vs A|), excluding A itself.
    const ranked = computed.filter((r) => r.key !== 'A').sort((a, b) => Math.abs(b.deltaVsA) - Math.abs(a.deltaVsA));
    const materialSubsystems = ranked.filter((r) => Math.abs(r.deltaVsA) >= 1);
    const top3 = ranked.slice(0, 3);

    setRows({ computed, ranked, materialSubsystems, top3 });
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #dc2626', borderRadius: 8, background: '#fef2f2', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        CASE 030 — Root Cause Shootout
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · final elimination audit · A–P controlled perturbations on the real production engine · zero physics/graph changes
        </span>
      </div>

      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#7f1d1d', marginBottom: 8 }}>
        Reference case: Room {fmt(ROOM.widthM, 1)}×{fmt(ROOM.lengthM, 1)}×{fmt(ROOM.heightM, 1)} m · Sub centre-front (x {fmt(SUB.x, 2)}, y {fmt(SUB.y, 2)}) · Seat y {fmt(SEAT.y, 2)} m · Sweep 20–80 Hz.
        REW comparison uses illustrative anchor points (not a captured export) — MAE is relative, for ranking only.
      </div>

      <button onClick={runShootout} disabled={running}
        style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #991b1b', background: running ? '#e5e7eb' : '#991b1b', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600, marginBottom: 8 }}>
        {running ? 'Running…' : 'Run Shootout'}
      </button>

      {rows && (
        <>
          <div style={{ marginBottom: 4, fontWeight: 700, color: '#991b1b', fontSize: 10, fontFamily: 'monospace' }}>All Variants</div>
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
                  <tr key={r.key} style={{ borderBottom: '1px solid #fecaca' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{r.key} — {r.label}</td>
                    <td style={td}>{fmt(r.thirtyHzSplDb)}</td>
                    <td style={{ ...td, fontWeight: 700, color: Math.abs(r.deltaVsA) >= 1 ? '#b91c1c' : '#1c1917' }}>{r.deltaVsA >= 0 ? '+' : ''}{fmt(r.deltaVsA)}</td>
                    <td style={td}>{fmt(r.nullDepthDb)}</td>
                    <td style={td}>{fmt(r.riseDb)}</td>
                    <td style={td}>{fmt(r.mae)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 4, fontWeight: 700, color: '#991b1b', fontSize: 10, fontFamily: 'monospace' }}>Ranked by Influence (|30 Hz Δ| vs Production)</div>
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
              <thead>
                <tr><th style={th}>#</th><th style={{ ...th, textAlign: 'left' }}>Subsystem</th><th style={th}>Influence</th></tr>
              </thead>
              <tbody>
                {rows.ranked.map((r, i) => (
                  <tr key={r.key} style={{ borderBottom: '1px solid #fecaca' }}>
                    <td style={td}>{i + 1}</td>
                    <td style={{ ...td, textAlign: 'left' }}>{r.label}</td>
                    <td style={{ ...td, fontWeight: 700, color: Math.abs(r.deltaVsA) >= 1 ? '#b91c1c' : '#6b7280' }}>{r.deltaVsA >= 0 ? '+' : ''}{fmt(r.deltaVsA)} dB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ border: '1px solid #fca5a5', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#991b1b' }}>Final Verdict — Case 030</div>
            <div><strong>TEST:</strong> Sixteen independent single-subsystem perturbations (A–P) against the live production engine, reference case above.</div>
            <div><strong>EXPECTED:</strong> The subsystem(s) responsible for REW mismatch will show ≥1 dB influence at 30 Hz; unrelated subsystems will show near-zero influence.</div>
            <div><strong>ACTUAL:</strong> Top 3 by influence: {rows.top3.map((r) => `${r.label} (${r.deltaVsA >= 0 ? '+' : ''}${fmt(r.deltaVsA)} dB)`).join(', ')}.</div>
            <div><strong>DELTA:</strong> {rows.materialSubsystems.length} of 15 tested subsystems exceed the 1 dB materiality threshold.</div>
            <div><strong>SEVERITY:</strong> Authority concentrated in: {rows.materialSubsystems.length > 0 ? rows.materialSubsystems.map((r) => r.label).join(', ') : 'none — all subsystems below 1 dB.'}</div>
            <div><strong>NEXT TEST:</strong> Retire every subsystem below 1 dB influence ({rows.ranked.filter((r) => Math.abs(r.deltaVsA) < 1).map((r) => r.label).join(', ') || 'none'}). Concentrate further isolation only on the three subsystems named above.</div>
          </div>
        </>
      )}
    </div>
  );
}