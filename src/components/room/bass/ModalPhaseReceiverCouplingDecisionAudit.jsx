// ModalPhaseReceiverCouplingDecisionAudit.jsx
// CASE 032 — Modal Phase / Receiver Coupling Decision Test.
// Temporary, read-only elimination audit. Runs ONE real production engine call
// (simulateBassResponseRewCore), then applies exactly six controlled post-hoc
// perturbations (A–F) to the engine's OWN per-mode contributor breakdown to decide
// whether the remaining REW mismatch in the 28–35 Hz band is caused by (1) modal
// phase assignment, (2) receiver coupling sign / mode-shape at the listener, (3) both,
// or (4) neither. No engine code or physics is modified; every perturbation operates on
// vectors the production engine itself already computed.
//
// Reference case: Room 5.0×4.5×3.0 m, sub centre-front, seat y=4.00 m, sweep 28–35 Hz.

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from './liveBassAuditOptions';

const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { id: 'centreFront', modelKey: 'reference', x: ROOM.widthM / 2, y: 0.3, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: ROOM.widthM / 2, y: 4.0, z: 1.2 };
const DEFAULT_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const MATERIALITY_DB = 1;

function toDb(mag) { return 20 * Math.log10(Math.max(mag, 1e-10)); }
function mag2(re, im) { return Math.sqrt(re * re + im * im); }
function nearestIndex(freqsHz, target) {
  let bestI = 0, bestD = Infinity;
  freqsHz.forEach((f, i) => { const d = Math.abs(f - target); if (d < bestD) { bestD = d; bestI = i; } });
  return bestI;
}
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

// Metrics required by Case 032: 30 Hz SPL, 29–31 Hz null depth, 30→34 Hz rise.
function metricsFromComplex(freqsHz, complexArr) {
  const splDb = complexArr.map((c) => toDb(mag2(c.re, c.im)));
  const idx30 = nearestIndex(freqsHz, 30);
  const idx34 = nearestIndex(freqsHz, 34);
  const bandIndices = freqsHz.map((f, i) => ({ f, i })).filter((p) => p.f >= 29 && p.f <= 31).map((p) => p.i);
  const nullDepthDb = bandIndices.length > 0 ? Math.min(...bandIndices.map((i) => splDb[i])) : splDb[idx30];
  return {
    thirtyHzSplDb: splDb[idx30],
    nullDepthDb,
    riseDb: splDb[idx34] - splDb[idx30],
  };
}

// Sum a (possibly transformed) contributors list into a single {re, im} modal vector.
function sumContributors(contributors) {
  return contributors.reduce((acc, c) => ({ re: acc.re + c.re, im: acc.im + c.im }), { re: 0, im: 0 });
}

// Standard phase-unwrap along an ordered array of raw phase angles (radians).
function unwrapPhaseSeries(rawPhases) {
  const out = [rawPhases[0]];
  for (let i = 1; i < rawPhases.length; i++) {
    let diff = rawPhases[i] - rawPhases[i - 1];
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    out.push(out[i - 1] + diff);
  }
  return out;
}

// Per-frequency perturbation transforms — each takes one frequency's engine contributor
// rows and returns a new list of {re, im} pairs representing the perturbed modal field.
const TRANSFORMS = {
  // B — keep production receiver coupling, force modal phases to zero (magnitude only).
  B_zeroPhase: (rows) => rows.map((r) => ({ re: r.activeMagnitude, im: 0 })),
  // C — keep production modal phases, force receiver coupling to absolute magnitude only.
  // Contribution scales linearly with receiverCoupling, so forcing |receiverCoupling|
  // is equivalent to multiplying the existing contribution by sign(receiverCoupling).
  C_absReceiverCoupling: (rows) => rows.map((r) => {
    const sign = Math.sign(r.receiverCoupling) || 1;
    return { re: r.activeReal * sign, im: r.activeImag * sign };
  }),
  // D — keep production modal phases, but invert receiver coupling sign entirely.
  D_invertReceiverCoupling: (rows) => rows.map((r) => ({ re: -r.activeReal, im: -r.activeImag })),
  // F — modal magnitude only, no phase, no receiver sign (magnitude is already sign-free).
  F_magnitudeOnlyNoSign: (rows) => rows.map((r) => ({ re: r.activeMagnitude, im: 0 })),
};

const th = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#fdf2f8', borderBottom: '2px solid #f9a8d4', color: '#831843', whiteSpace: 'nowrap' };
const td = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

export default function ModalPhaseReceiverCouplingDecisionAudit() {
  const [rows, setRows] = useState(null);
  const [running, setRunning] = useState(false);

  const runTest = useCallback(() => {
    setRunning(true);

    const baseOptions = { ...buildLiveEngineOptions(30, DEFAULT_ABSORPTION), freqMinHz: 28, freqMaxHz: 35, modeGenerationFMaxHz: 220 };
    const outA = simulateBassResponseRewCore(ROOM, SEAT, SUB, LIVE_SOURCE_CURVE, baseOptions);
    const freqsHz = outA.freqsHz;
    const vecA = outA.perFrequencyVectorDebug;
    const contributorSeries = outA.activeModalContributorDebugSeries; // index-aligned with freqsHz

    const complexA = vecA.map((v) => ({ re: v.finalRe, im: v.finalIm }));

    function complexForPerFrequencyTransform(transformKey) {
      return vecA.map((v, i) => {
        const rowSet = contributorSeries[i];
        const rows_ = rowSet?.contributorsInEngineOrder || [];
        const newContribs = TRANSFORMS[transformKey](rows_);
        const newModal = sumContributors(newContribs);
        return { re: v.directRe + v.reflectionRe + newModal.re, im: v.directIm + v.reflectionIm + newModal.im };
      });
    }

    // E — keep production receiver coupling, but unwrap modal phase continuously across
    // frequency. Requires per-mode phase tracked across the whole sweep, unwrapped, then
    // re-summed per frequency (magnitude preserved from the engine's own output).
    function complexForContinuousPhaseUnwrap() {
      // Group per-mode series across all frequency bins, in engine order (stable per bin).
      const modeSeriesMap = new Map(); // key "nx,ny,nz" -> { re[], im[], mag[] } aligned to freqsHz
      contributorSeries.forEach((rowSet, fi) => {
        const rows_ = rowSet?.contributorsInEngineOrder || [];
        rows_.forEach((r) => {
          const key = `${r.nx},${r.ny},${r.nz}`;
          if (!modeSeriesMap.has(key)) {
            modeSeriesMap.set(key, { re: new Array(freqsHz.length).fill(0), im: new Array(freqsHz.length).fill(0), mag: new Array(freqsHz.length).fill(0), present: new Array(freqsHz.length).fill(false) });
          }
          const s = modeSeriesMap.get(key);
          s.re[fi] = r.activeReal;
          s.im[fi] = r.activeImag;
          s.mag[fi] = r.activeMagnitude;
          s.present[fi] = true;
        });
      });

      // Per mode: unwrap phase across the sweep, then rebuild re/im preserving magnitude.
      const unwrappedModeSeries = new Map();
      modeSeriesMap.forEach((s, key) => {
        const rawPhases = s.re.map((re, i) => Math.atan2(s.im[i], re));
        const unwrapped = unwrapPhaseSeries(rawPhases);
        const newRe = unwrapped.map((ph, i) => s.mag[i] * Math.cos(ph));
        const newIm = unwrapped.map((ph, i) => s.mag[i] * Math.sin(ph));
        unwrappedModeSeries.set(key, { re: newRe, im: newIm, present: s.present });
      });

      // Re-sum per frequency across all modes present at that bin.
      return vecA.map((v, fi) => {
        let modalRe = 0, modalIm = 0;
        unwrappedModeSeries.forEach((s) => {
          if (s.present[fi]) { modalRe += s.re[fi]; modalIm += s.im[fi]; }
        });
        return { re: v.directRe + v.reflectionRe + modalRe, im: v.directIm + v.reflectionIm + modalIm };
      });
    }

    const variants = [
      { key: 'A', label: 'Production', complex: complexA },
      { key: 'B', label: 'Production receiver coupling · modal phase forced to zero', complex: complexForPerFrequencyTransform('B_zeroPhase') },
      { key: 'C', label: 'Production modal phase · receiver coupling forced to |magnitude|', complex: complexForPerFrequencyTransform('C_absReceiverCoupling') },
      { key: 'D', label: 'Production modal phase · receiver coupling sign inverted', complex: complexForPerFrequencyTransform('D_invertReceiverCoupling') },
      { key: 'E', label: 'Production receiver coupling · modal phase unwrapped continuously', complex: complexForContinuousPhaseUnwrap() },
      { key: 'F', label: 'Modal magnitude only — no phase, no receiver sign', complex: complexForPerFrequencyTransform('F_magnitudeOnlyNoSign') },
    ];

    const baselineMetrics = metricsFromComplex(freqsHz, complexA);
    const computed = variants.map((v) => {
      const m = metricsFromComplex(freqsHz, v.complex);
      const deltaSpl = v.key === 'A' ? 0 : m.thirtyHzSplDb - baselineMetrics.thirtyHzSplDb;
      const deltaNull = v.key === 'A' ? 0 : m.nullDepthDb - baselineMetrics.nullDepthDb;
      const deltaRise = v.key === 'A' ? 0 : m.riseDb - baselineMetrics.riseDb;
      const maxAbsDelta = Math.max(Math.abs(deltaSpl), Math.abs(deltaNull), Math.abs(deltaRise));
      const matchesRewStory = v.key === 'A' ? true : maxAbsDelta < MATERIALITY_DB;
      return {
        key: v.key, label: v.label,
        thirtyHzSplDb: m.thirtyHzSplDb, nullDepthDb: m.nullDepthDb, riseDb: m.riseDb,
        deltaSpl, deltaNull, deltaRise, maxAbsDelta, matchesRewStory,
      };
    });

    const byKey = Object.fromEntries(computed.map((c) => [c.key, c]));
    const phaseGroupMax = Math.max(byKey.B.maxAbsDelta, byKey.E.maxAbsDelta, byKey.F.maxAbsDelta);
    const couplingGroupMax = Math.max(byKey.C.maxAbsDelta, byKey.D.maxAbsDelta);
    const phaseMaterial = phaseGroupMax >= MATERIALITY_DB;
    const couplingMaterial = couplingGroupMax >= MATERIALITY_DB;

    let verdict, verdictLabel, nextFix;
    if (phaseMaterial && !couplingMaterial) {
      verdict = 1; verdictLabel = 'MODAL PHASE IS THE ROOT CAUSE';
      nextFix = 'Correct the per-mode modal phase assignment/rotation convention (the same convention driving variants B, E, F) in legacyModalTransferLocal — this is the exact next production fix candidate.';
    } else if (couplingMaterial && !phaseMaterial) {
      verdict = 2; verdictLabel = 'RECEIVER COUPLING SIGN / MODE SHAPE IS THE ROOT CAUSE';
      nextFix = 'Correct the receiver-side mode-shape coupling sign convention (modeShapeValueLocal at the listener position) — this is the exact next production fix candidate.';
    } else if (phaseMaterial && couplingMaterial) {
      verdict = 3; verdictLabel = 'BOTH ARE REQUIRED';
      nextFix = 'Apply a combined fix: correct the receiver-side mode-shape coupling sign convention AND the per-mode modal phase assignment/rotation convention together — neither alone reconstructs the reference behaviour.';
    } else {
      verdict = 4; verdictLabel = 'NEITHER — STOP MODAL INVESTIGATION';
      nextFix = null;
    }

    setRows({ computed, phaseGroupMax, couplingGroupMax, verdict, verdictLabel, nextFix });
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #be185d', borderRadius: 8, background: '#fdf2f8', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#831843', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        CASE 032 — Modal Phase / Receiver Coupling Decision Test
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · exactly six post-hoc perturbations (A–F) on the engine's own per-mode output · zero physics/graph changes
        </span>
      </div>

      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#831843', marginBottom: 8 }}>
        Reference case: Room {fmt(ROOM.widthM, 1)}×{fmt(ROOM.lengthM, 1)}×{fmt(ROOM.heightM, 1)} m · Sub centre-front (x {fmt(SUB.x, 2)}, y {fmt(SUB.y, 2)}) · Seat y {fmt(SEAT.y, 2)} m · Sweep 28–35 Hz · Production engine.
      </div>

      <button onClick={runTest} disabled={running}
        style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #be185d', background: running ? '#e5e7eb' : '#be185d', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600, marginBottom: 8 }}>
        {running ? 'Running…' : 'Run Decision Test'}
      </button>

      {rows && (
        <>
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Variant</th>
                  <th style={th}>30 Hz SPL</th>
                  <th style={th}>29–31 Hz Null Depth</th>
                  <th style={th}>30→34 Hz Rise</th>
                  <th style={th}>Matches REW story</th>
                </tr>
              </thead>
              <tbody>
                {rows.computed.map((r) => (
                  <tr key={r.key} style={{ borderBottom: '1px solid #fbcfe8' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{r.key} — {r.label}</td>
                    <td style={td}>{fmt(r.thirtyHzSplDb)}</td>
                    <td style={td}>{fmt(r.nullDepthDb)}</td>
                    <td style={td}>{fmt(r.riseDb)}</td>
                    <td style={{ ...td, fontWeight: 700, color: r.matchesRewStory ? '#15803d' : '#be123c' }}>{r.matchesRewStory ? 'YES' : 'NO'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ border: '1px solid #f9a8d4', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#831843' }}>Final Verdict — Case 032</div>
            <div><strong>Phase group (B, E, F) max |Δ| vs Production:</strong> {fmt(rows.phaseGroupMax)} dB {rows.phaseGroupMax >= MATERIALITY_DB ? '(material)' : '(not material)'}</div>
            <div><strong>Receiver coupling group (C, D) max |Δ| vs Production:</strong> {fmt(rows.couplingGroupMax)} dB {rows.couplingGroupMax >= MATERIALITY_DB ? '(material)' : '(not material)'}</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{rows.verdict}. {rows.verdictLabel}</div>
            {rows.nextFix && <div style={{ marginTop: 4 }}><strong>NEXT PRODUCTION FIX CANDIDATE:</strong> {rows.nextFix}</div>}
            {!rows.nextFix && <div style={{ marginTop: 4 }}>No further modal audit is suggested — neither subsystem is material at the 1 dB threshold.</div>}
          </div>
        </>
      )}
    </div>
  );
}