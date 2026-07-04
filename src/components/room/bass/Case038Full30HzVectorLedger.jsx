import React, { useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

// Case 038 — Full 30 Hz Vector Ledger.
// Read-only forensic audit. Does not touch production engine, graph, or state.
// Raw data only — no verdicts, no interpretation.

const C = 343;
const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SEAT = { x: 2.5, y: 4.00, z: 1.2 };
const SUB = { x: 2.5, y: 0.15, z: 0.35 };
const ABSORPTION = { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const CURVE_DB = 94;
const TARGET_HZ = 30.40;
const CONTRIBUTION_THRESHOLD_PCT = 0.1;

function mag(re, im) { return Math.sqrt(re * re + im * im); }
function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

function directVector(freqHz) {
  const dx = SUB.x - SEAT.x, dy = SUB.y - SEAT.y, dz = SUB.z - SEAT.z;
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM);
  const amp = Math.pow(10, (CURVE_DB + distanceLossDb) / 20);
  const phase = -2 * Math.PI * freqHz * (distanceM / C);
  return { re: amp * Math.cos(phase), im: amp * Math.sin(phase) };
}

function reflectionVector(freqHz) {
  const W = ROOM.widthM, L = ROOM.lengthM, H = ROOM.heightM;
  const walls = [
    { imgX: 2 * W - SUB.x, imgY: SUB.y, imgZ: SUB.z, alpha: ABSORPTION.right },
    { imgX: -SUB.x, imgY: SUB.y, imgZ: SUB.z, alpha: ABSORPTION.left },
    { imgX: SUB.x, imgY: 2 * L - SUB.y, imgZ: SUB.z, alpha: ABSORPTION.back },
    { imgX: SUB.x, imgY: -SUB.y, imgZ: SUB.z, alpha: ABSORPTION.front },
    { imgX: SUB.x, imgY: SUB.y, imgZ: 2 * H - SUB.z, alpha: ABSORPTION.ceiling },
    { imgX: SUB.x, imgY: SUB.y, imgZ: -SUB.z, alpha: ABSORPTION.floor },
  ];
  const coherenceWeight = Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (freqHz - 20) / 140))));
  let sumRe = 0, sumIm = 0;
  walls.forEach((w) => {
    const dx = w.imgX - SEAT.x, dy = w.imgY - SEAT.y, dz = w.imgZ - SEAT.z;
    const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const distanceLossDb = -20 * Math.log10(distanceM);
    const rc = Math.sqrt(Math.max(0, 1 - w.alpha));
    const amp = Math.pow(10, (CURVE_DB + distanceLossDb) / 20) * rc;
    const phase = -2 * Math.PI * freqHz * (distanceM / C);
    sumRe += coherenceWeight * amp * Math.cos(phase);
    sumIm += coherenceWeight * amp * Math.sin(phase);
  });
  return { re: sumRe, im: sumIm };
}

function buildModes() {
  return computeRoomModesLocal({ ...ROOM, fMax: 200, c: C }).map((m) => ({
    ...m,
    qValue: estimateModeQLocal({ roomDims: ROOM, surfaceAbsorption: ABSORPTION, f0: m.freq, mode: m }),
  }));
}

function familyLabel(mode) {
  const order = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (order === 1) {
    if (mode.ny > 0) return "axial length";
    if (mode.nx > 0) return "axial width";
    return "axial height";
  }
  if (order === 2) {
    if (mode.nx > 0 && mode.ny > 0) return "tangential L/W";
    if (mode.nx > 0 && mode.nz > 0) return "tangential W/H";
    return "tangential L/H";
  }
  return "oblique";
}

function modeContribution(mode, freqHz) {
  const modalSourceAmplitude = Math.pow(10, CURVE_DB / 20);
  const sc = modeShapeValueLocal(mode, SUB.x, SUB.y, SUB.z, ROOM);
  const rc = modeShapeValueLocal(mode, SEAT.x, SEAT.y, SEAT.z, ROOM);
  const coupling = sc * rc;
  const { re, im } = resonantTransfer(freqHz, mode.freq, mode.qValue);
  return { re: modalSourceAmplitude * coupling * re, im: modalSourceAmplitude * coupling * im };
}

export default function Case038Full30HzVectorLedger() {
  const result = useMemo(() => {
    const modes = buildModes();

    const allContributions = modes.map((m) => {
      const c = modeContribution(m, TARGET_HZ);
      return { mode: m, re: c.re, im: c.im, magnitude: mag(c.re, c.im) };
    });

    const totalModalRe = allContributions.reduce((s, c) => s + c.re, 0);
    const totalModalIm = allContributions.reduce((s, c) => s + c.im, 0);
    const totalModalMag = mag(totalModalRe, totalModalIm);

    const activeContributions = allContributions
      .filter((c) => totalModalMag > 0 && (c.magnitude / totalModalMag) * 100 >= CONTRIBUTION_THRESHOLD_PCT)
      .sort((a, b) => b.magnitude - a.magnitude);

    let runningRe = 0, runningIm = 0;
    const ledgerRows = activeContributions.map((c) => {
      runningRe += c.re;
      runningIm += c.im;
      const contributionPct = totalModalMag > 0 ? (c.magnitude / totalModalMag) * 100 : 0;
      return {
        key: `${c.mode.nx},${c.mode.ny},${c.mode.nz}`,
        mode: `(${c.mode.nx},${c.mode.ny},${c.mode.nz})`,
        freq: c.mode.freq,
        type: familyLabel(c.mode),
        re: c.re,
        im: c.im,
        magnitude: c.magnitude,
        phase: phaseDeg(c.re, c.im),
        contributionPct,
        runningRe,
        runningIm,
        runningMag: mag(runningRe, runningIm),
        runningPhase: phaseDeg(runningRe, runningIm),
      };
    });

    // Sum of every listed (active) mode.
    const listedSumRe = ledgerRows.reduce((s, r) => s + r.re, 0);
    const listedSumIm = ledgerRows.reduce((s, r) => s + r.im, 0);

    const totalModalVector = { re: totalModalRe, im: totalModalIm, magnitude: totalModalMag, phase: phaseDeg(totalModalRe, totalModalIm) };

    const direct = directVector(TARGET_HZ);
    const reflection = reflectionVector(TARGET_HZ);
    const directVec = { re: direct.re, im: direct.im, magnitude: mag(direct.re, direct.im), phase: phaseDeg(direct.re, direct.im) };
    const reflectionVec = { re: reflection.re, im: reflection.im, magnitude: mag(reflection.re, reflection.im), phase: phaseDeg(reflection.re, reflection.im) };

    const finalRe = totalModalRe + direct.re + reflection.re;
    const finalIm = totalModalIm + direct.im + reflection.im;
    const finalVector = { re: finalRe, im: finalIm, magnitude: mag(finalRe, finalIm), phase: phaseDeg(finalRe, finalIm) };

    // Acceptance-criteria arithmetic checks.
    const listedVsModalErrorRe = listedSumRe - totalModalRe;
    const listedVsModalErrorIm = listedSumIm - totalModalIm;
    const modalPlusDirectPlusReflectionRe = totalModalRe + direct.re + reflection.re;
    const modalPlusDirectPlusReflectionIm = totalModalIm + direct.im + reflection.im;
    const finalCheckErrorRe = finalRe - modalPlusDirectPlusReflectionRe;
    const finalCheckErrorIm = finalIm - modalPlusDirectPlusReflectionIm;

    // Balance table — over ALL modes (not just those listed above threshold), per Re/Im sign.
    let positiveReSum = 0, negativeReSum = 0, positiveImSum = 0, negativeImSum = 0;
    allContributions.forEach((c) => {
      if (c.re >= 0) positiveReSum += c.re; else negativeReSum += c.re;
      if (c.im >= 0) positiveImSum += c.im; else negativeImSum += c.im;
    });

    return {
      ledgerRows,
      totalModalVector,
      directVec,
      reflectionVec,
      finalVector,
      listedSumRe,
      listedSumIm,
      listedVsModalErrorRe,
      listedVsModalErrorIm,
      finalCheckErrorRe,
      finalCheckErrorIm,
      positiveReSum,
      negativeReSum,
      positiveImSum,
      negativeImSum,
    };
  }, []);

  return (
    <div style={{ border: "2px solid #374151", borderRadius: 10, background: "#f9fafb", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#111827", fontSize: 13, marginBottom: 6 }}>
        Case 038 — Full 30 Hz Vector Ledger (read-only, raw data only)
      </div>
      <div style={{ color: "#374151", marginBottom: 10 }}>
        Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m · Sub centre-front ({SUB.x.toFixed(2)}, {SUB.y.toFixed(2)}, {SUB.z.toFixed(2)}) ·
        Seat ({SEAT.x.toFixed(2)}, {SEAT.y.toFixed(2)}, {SEAT.z.toFixed(2)}) · Absorption 0.30 all surfaces · Frequency {TARGET_HZ.toFixed(2)} Hz · Threshold ≥{CONTRIBUTION_THRESHOLD_PCT}%
      </div>

      {/* Mode ledger */}
      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#e5e7eb" }}>
              {["Mode", "Freq", "Type", "Re", "Im", "Magnitude", "Phase (°)", "Contrib %", "Running Re", "Running Im", "Running Mag", "Running Phase (°)"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #d1d5db" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.ledgerRows.map((r) => (
              <tr key={r.key}>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>{r.mode}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(r.freq, 2)} Hz</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{r.type}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(r.re)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(r.im)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(r.magnitude)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(r.phase, 2)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(r.contributionPct, 3)}%</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(r.runningRe)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(r.runningIm)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(r.runningMag)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(r.runningPhase, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vector summary */}
      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#e5e7eb" }}>
              {["Vector", "Re", "Im", "Magnitude", "Phase (°)"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #d1d5db" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Total modal vector", v: result.totalModalVector },
              { label: "Direct vector", v: result.directVec },
              { label: "Reflection vector", v: result.reflectionVec },
              { label: "Final summed vector", v: result.finalVector },
            ].map((row) => (
              <tr key={row.label}>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>{row.label}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(row.v.re)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(row.v.im)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(row.v.magnitude)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(row.v.phase, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Balance table */}
      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}>Balance table (all modes, no threshold)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#e5e7eb" }}>
              {["Component", "Value"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #d1d5db" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>Positive Re contribution</td><td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(result.positiveReSum)}</td></tr>
            <tr><td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>Negative Re contribution</td><td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(result.negativeReSum)}</td></tr>
            <tr><td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>Positive Im contribution</td><td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(result.positiveImSum)}</td></tr>
            <tr><td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>Negative Im contribution</td><td style={{ padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>{fmt(result.negativeImSum)}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Acceptance criteria checks */}
      <div style={{ padding: 10, borderRadius: 6, background: "#e5e7eb", border: "1px solid #d1d5db" }}>
        <div>Listed-modes sum Re: {fmt(result.listedSumRe)} · Im: {fmt(result.listedSumIm)}</div>
        <div>Total modal vector Re: {fmt(result.totalModalVector.re)} · Im: {fmt(result.totalModalVector.im)}</div>
        <div style={{ fontWeight: 700, color: (Math.abs(result.listedVsModalErrorRe) < 1e-9 && Math.abs(result.listedVsModalErrorIm) < 1e-9) ? "#166534" : "#b91c1c" }}>
          Listed-vs-modal arithmetic error — Re: {fmt(result.listedVsModalErrorRe, 8)} · Im: {fmt(result.listedVsModalErrorIm, 8)}
        </div>
        <div style={{ marginTop: 6, fontWeight: 700, color: (Math.abs(result.finalCheckErrorRe) < 1e-9 && Math.abs(result.finalCheckErrorIm) < 1e-9) ? "#166534" : "#b91c1c" }}>
          Modal+Direct+Reflection-vs-Final arithmetic error — Re: {fmt(result.finalCheckErrorRe, 8)} · Im: {fmt(result.finalCheckErrorIm, 8)}
        </div>
      </div>
    </div>
  );
}