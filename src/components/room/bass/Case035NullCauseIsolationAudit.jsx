import React, { useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

// Case 035 — 30 Hz Null Cause Isolation.
// Read-only forensic audit. Does not touch production engine, graph, or state.
// Fixed reference config only (per investigation brief) — no live room/seat wiring.

const C = 343;
const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SEAT = { x: 2.5, y: 4.00, z: 1.2 };
const SUB = { x: 2.5, y: 0.15, z: 0.35 };
const ABSORPTION = { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const CURVE_DB = 94; // flat REW-parity reference source
const TARGET_LO_HZ = 30.4;
const TARGET_HI_HZ = 34.4;
const NULL_THRESHOLD_DB = -6; // 30.4 Hz counted as "null" if it's this much quieter than 34.4 Hz

function directVector(freqHz) {
  const dx = SUB.x - SEAT.x, dy = SUB.y - SEAT.y, dz = SUB.z - SEAT.z;
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM);
  const amp = Math.pow(10, (CURVE_DB + distanceLossDb) / 20);
  const phase = -2 * Math.PI * freqHz * (distanceM / C);
  return { re: amp * Math.cos(phase), im: amp * Math.sin(phase), distanceM };
}

function buildModes() {
  return computeRoomModesLocal({ ...ROOM, fMax: 60, c: C }).map((m) => ({
    ...m,
    qValue: estimateModeQLocal({ roomDims: ROOM, surfaceAbsorption: ABSORPTION, f0: m.freq, mode: m }),
  }));
}

// mode: single mode object or null (all modes). variant controls sign/phase handling.
function modalVector(freqHz, modes, variant) {
  const modalSourceAmplitude = Math.pow(10, CURVE_DB / 20);
  let sumRe = 0, sumIm = 0;
  let strongest = null, strongestMag = -1;

  modes.forEach((mode) => {
    const sc = modeShapeValueLocal(mode, SUB.x, SUB.y, SUB.z, ROOM);
    let rc = modeShapeValueLocal(mode, SEAT.x, SEAT.y, SEAT.z, ROOM);
    let coupling;
    if (variant === "receiverForcedPositive") {
      coupling = sc * Math.abs(rc);
    } else if (variant === "signDisabled") {
      coupling = Math.abs(sc * rc);
    } else {
      coupling = sc * rc;
    }

    const { re, im } = resonantTransfer(freqHz, mode.freq, mode.qValue);
    let transferRe = re, transferIm = im;
    if (variant === "phaseForced") {
      const mag = Math.sqrt(re * re + im * im);
      transferRe = mag; // rotated to pure-real (pressure-maximum) convention
      transferIm = 0;
    }

    const contribRe = modalSourceAmplitude * coupling * transferRe;
    const contribIm = modalSourceAmplitude * coupling * transferIm;
    sumRe += contribRe;
    sumIm += contribIm;

    const mag = Math.sqrt(contribRe * contribRe + contribIm * contribIm);
    if (mag > strongestMag) {
      strongestMag = mag;
      strongest = mode;
    }
  });

  return { re: sumRe, im: sumIm, strongest };
}

function splDb(re, im) {
  return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
}

function modeLabel(mode) {
  if (!mode) return "—";
  return `(${mode.nx},${mode.ny},${mode.nz}) ${mode.type} @ ${mode.freq.toFixed(1)} Hz`;
}

export default function Case035NullCauseIsolationAudit() {
  const result = useMemo(() => {
    const modes = buildModes();

    // Dominant single modes per axis family (fundamental of each axis).
    const lengthMode = modes.filter(m => m.nx === 0 && m.ny > 0 && m.nz === 0).sort((a, b) => a.freq - b.freq)[0] || null;
    const widthMode  = modes.filter(m => m.nx > 0 && m.ny === 0 && m.nz === 0).sort((a, b) => a.freq - b.freq)[0] || null;
    const heightMode = modes.filter(m => m.nx === 0 && m.ny === 0 && m.nz > 0).sort((a, b) => a.freq - b.freq)[0] || null;

    const buildRow = (label, key, computeAt) => {
      const lo = computeAt(TARGET_LO_HZ);
      const hi = computeAt(TARGET_HI_HZ);
      const loDb = splDb(lo.re, lo.im);
      const hiDb = splDb(hi.re, hi.im);
      const delta = hiDb - loDb;
      const nullRemains = delta > -NULL_THRESHOLD_DB ? false : true; // lo quieter than hi by threshold
      return {
        key, label,
        loDb, hiDb, delta,
        finalRe: lo.re, finalIm: lo.im,
        dominantMode: modeLabel(lo.strongest ?? hi.strongest),
        nullRemains,
      };
    };

    const direct = (f) => ({ ...directVector(f), strongest: null });
    const modalAll = (variant) => (f) => modalVector(f, modes, variant);
    const combined = (variant) => (f) => {
      const d = directVector(f);
      const m = modalVector(f, modes, variant);
      return { re: d.re + m.re, im: d.im + m.im, strongest: m.strongest };
    };
    const singleMode = (mode) => (f) => (mode ? modalVector(f, [mode], "normal") : { re: 0, im: 0, strongest: null });

    const rows = [
      buildRow("A — Direct only", "A", direct),
      buildRow("B — Modal only", "B", modalAll("normal")),
      buildRow("C — Direct + modal", "C", combined("normal")),
      buildRow("D — Modal, receiver coupling forced positive", "D", modalAll("receiverForcedPositive")),
      buildRow("E — Modal, receiver coupling sign disabled", "E", modalAll("signDisabled")),
      buildRow("F — Modal, phase forced to pressure max @ 34.4 Hz", "F", modalAll("phaseForced")),
      buildRow("G — Dominant length mode only", "G", singleMode(lengthMode)),
      buildRow("H — Dominant width mode only", "H", singleMode(widthMode)),
      buildRow("I — Dominant height mode only", "I", singleMode(heightMode)),
    ];

    // First condition where the null disappears (in the A..I order given).
    const firstFixed = rows.find(r => !r.nullRemains) || null;

    // Combined D+F test — used only to detect the "combination" verdict, not shown as its own row.
    const combinedDF = (f) => {
      const d = directVector(f);
      const modalSourceAmplitude = Math.pow(10, CURVE_DB / 20);
      let sumRe = 0, sumIm = 0;
      modes.forEach((mode) => {
        const sc = modeShapeValueLocal(mode, SUB.x, SUB.y, SUB.z, ROOM);
        const rc = Math.abs(modeShapeValueLocal(mode, SEAT.x, SEAT.y, SEAT.z, ROOM));
        const { re, im } = resonantTransfer(f, mode.freq, mode.qValue);
        const mag = Math.sqrt(re * re + im * im);
        sumRe += modalSourceAmplitude * sc * rc * mag;
        sumIm += 0;
      });
      return { re: d.re + sumRe, im: d.im + sumIm };
    };
    const dfLo = combinedDF(TARGET_LO_HZ), dfHi = combinedDF(TARGET_HI_HZ);
    const dfDelta = splDb(dfHi.re, dfHi.im) - splDb(dfLo.re, dfLo.im);
    const combinedFixesIt = dfDelta <= -NULL_THRESHOLD_DB ? false : true; // null gone if delta not deeply negative
    const combinedResolves = !combinedFixesIt;

    let verdict;
    if (!rows[2].nullRemains && rows[0].nullRemains && rows[1].nullRemains) {
      verdict = { code: 1, text: "Direct/modal cancellation" };
    } else if (!rows[3].nullRemains) {
      verdict = { code: 2, text: "Receiver coupling sign convention (forced-positive receiver coupling removes the null)" };
    } else if (!rows[4].nullRemains) {
      verdict = { code: 2, text: "Receiver coupling sign convention (sign-disabled coupling removes the null)" };
    } else if (!rows[5].nullRemains) {
      verdict = { code: 3, text: "Modal phase convention" };
    } else if (!rows[6].nullRemains || !rows[7].nullRemains || !rows[8].nullRemains) {
      verdict = { code: 4, text: "Wrong dominant mode family" };
    } else if (combinedResolves) {
      verdict = { code: 5, text: "Combination of phase + receiver sign" };
    } else {
      verdict = { code: 6, text: "Unknown — none of the isolated variants remove the 30.4 Hz null" };
    }

    return { rows, firstFixed, verdict };
  }, []);

  return (
    <div style={{ border: "2px solid #7c3aed", borderRadius: 10, background: "#faf5ff", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#5b21b6", fontSize: 13, marginBottom: 6 }}>
        Case 035 — 30 Hz Null Cause Isolation (read-only)
      </div>
      <div style={{ color: "#6d28d9", marginBottom: 10 }}>
        Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m · Sub centre-front ({SUB.x.toFixed(2)}, {SUB.y.toFixed(2)}, {SUB.z.toFixed(2)}) ·
        Seat ({SEAT.x.toFixed(2)}, {SEAT.y.toFixed(2)}, {SEAT.z.toFixed(2)}) · Absorption 0.30 all surfaces · Null-test threshold {NULL_THRESHOLD_DB} dB
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#ede9fe" }}>
              {["Variant", "SPL @30.4Hz", "SPL @34.4Hz", "Δ(34.4-30.4)", "Final Re", "Final Im", "Dominant mode", "Null remains?"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #c4b5fd" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.key} style={{ background: result.firstFixed?.key === r.key ? "#dcfce7" : "transparent" }}>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{r.label}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{r.loDb.toFixed(1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{r.hiDb.toFixed(1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{r.delta.toFixed(1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{r.finalRe.toFixed(1)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{r.finalIm.toFixed(1)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{r.dominantMode}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", fontWeight: 700, color: r.nullRemains ? "#b91c1c" : "#166534" }}>
                  {r.nullRemains ? "YES" : "NO"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: "#ede9fe", border: "1px solid #c4b5fd" }}>
        <div style={{ fontWeight: 700, color: "#5b21b6" }}>
          First condition where the 30.4 Hz null disappears: {result.firstFixed ? result.firstFixed.label : "None of variants A–I"}
        </div>
        <div style={{ marginTop: 6, fontWeight: 700, color: "#166534" }}>
          Verdict ({result.verdict.code}): {result.verdict.text}
        </div>
      </div>
    </div>
  );
}