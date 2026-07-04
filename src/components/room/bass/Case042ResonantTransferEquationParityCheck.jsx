import React, { useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

// Case 042 — Resonant Transfer Equation Parity Check.
// Read-only forensic audit. Does not touch production engine, graph, or state.
// Verifies B44's resonantTransfer() magnitude/phase against the textbook damped-resonator equation.

const C = 343;
const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SEAT = { x: 2.5, y: 4.00, z: 1.2 };
const ABSORPTION = { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const TEST_FREQS = [28, 30.4, 34.4, 38.1, 42, 45];
const MAG_TOLERANCE_PCT = 2;
const PHASE_TOLERANCE_DEG = 2;

function mag(re, im) { return Math.sqrt(re * re + im * im); }
function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

function textbookMagnitude(r, q) {
  const term1 = Math.pow(1 - r * r, 2);
  const term2 = Math.pow(r / q, 2);
  return 1 / Math.sqrt(term1 + term2);
}

// Textbook phase for a standard damped resonator (mass-spring-damper driven displacement):
// phase = atan2(-(r/Q), (1 - r^2)) — lag increasing through resonance toward 180°.
function textbookPhaseDeg(r, q) {
  return (Math.atan2(-(r / q), 1 - r * r) * 180) / Math.PI;
}

function findMode010() {
  const modes = computeRoomModesLocal({ ...ROOM, fMax: 60, c: C });
  return modes.find((m) => m.nx === 0 && m.ny === 1 && m.nz === 0) || null;
}

export default function Case042ResonantTransferEquationParityCheck() {
  const result = useMemo(() => {
    const mode = findMode010();
    if (!mode) {
      return { mode: null, rows: [], verdict: "resonantTransfer() magnitude and phase are wrong", nextStep: "Fix resonantTransfer() only.", magOk: false, phaseOk: false };
    }
    const q = estimateModeQLocal({ roomDims: ROOM, surfaceAbsorption: ABSORPTION, f0: mode.freq, mode });

    const rows = TEST_FREQS.map((f) => {
      const r = f / mode.freq;
      const t = resonantTransfer(f, mode.freq, q);
      const b44Mag = mag(t.re, t.im);
      const b44Phase = phaseDeg(t.re, t.im);
      const textbookMag = textbookMagnitude(r, q);
      const textbookPhase = textbookPhaseDeg(r, q);
      const diffPct = textbookMag !== 0 ? (Math.abs(b44Mag - textbookMag) / textbookMag) * 100 : 0;
      const phaseDiff = Math.abs(b44Phase - textbookPhase);
      const phaseDiffWrapped = Math.min(phaseDiff, 360 - phaseDiff);
      return {
        freq: f,
        f0: mode.freq,
        r,
        q,
        b44Re: t.re,
        b44Im: t.im,
        b44Mag,
        textbookMag,
        diffPct,
        b44Phase,
        textbookPhase,
        phaseDiff: phaseDiffWrapped,
      };
    });

    const magOk = rows.every((row) => row.diffPct <= MAG_TOLERANCE_PCT);
    const phaseOk = rows.every((row) => row.phaseDiff <= PHASE_TOLERANCE_DEG);

    let verdict;
    if (magOk && phaseOk) verdict = "resonantTransfer() matches textbook equation";
    else if (!magOk && phaseOk) verdict = "resonantTransfer() magnitude is wrong";
    else if (magOk && !phaseOk) verdict = "resonantTransfer() phase is wrong";
    else verdict = "resonantTransfer() magnitude and phase are wrong";

    const nextStep = verdict === "resonantTransfer() matches textbook equation"
      ? "Investigate source/receiver coupling equation parity."
      : "Fix resonantTransfer() only.";

    return { mode, q, rows, verdict, nextStep, magOk, phaseOk };
  }, []);

  const severity = (row) => {
    const magBad = row.diffPct > MAG_TOLERANCE_PCT;
    const phaseBad = row.phaseDiff > PHASE_TOLERANCE_DEG;
    if (magBad && phaseBad) return "CRITICAL";
    if (magBad || phaseBad) return "MODERATE";
    return "PASS";
  };

  return (
    <div style={{ border: "2px solid #7f1d1d", borderRadius: 10, background: "#fef2f2", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#7f1d1d", fontSize: 13, marginBottom: 6 }}>
        Case 042 — Resonant Transfer Equation Parity Check (read-only)
      </div>
      <div style={{ color: "#991b1b", marginBottom: 10 }}>
        Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m · Seat ({SEAT.x.toFixed(2)}, {SEAT.y.toFixed(2)}, {SEAT.z.toFixed(2)}) · Absorption 0.30 all surfaces ·
        Mode (0,1,0) axial length {result.mode ? `f0=${fmt(result.mode.freq, 2)} Hz` : "(not found)"} · Q = {fmt(result.q, 3)}
      </div>

      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#fee2e2" }}>
              {["TEST", "EXPECTED (textbook)", "ACTUAL (B44)", "DELTA", "SEVERITY", "NEXT TEST"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #fecaca" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => {
              const sev = severity(r);
              return (
                <tr key={r.freq}>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fee2e2", fontWeight: 700 }}>
                    f={r.freq} Hz (r={fmt(r.r, 3)}, Q={fmt(r.q, 2)})
                  </td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fee2e2" }}>
                    |H|={fmt(r.textbookMag)} · phase={fmt(r.textbookPhase, 2)}°
                  </td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fee2e2" }}>
                    Re={fmt(r.b44Re)} Im={fmt(r.b44Im)} |H|={fmt(r.b44Mag)} · phase={fmt(r.b44Phase, 2)}°
                  </td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fee2e2" }}>
                    mag {fmt(r.diffPct, 2)}% · phase {fmt(r.phaseDiff, 2)}°
                  </td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fee2e2", fontWeight: 700, color: sev === "PASS" ? "#166534" : sev === "MODERATE" ? "#b45309" : "#b91c1c" }}>
                    {sev}
                  </td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fee2e2" }}>
                    {sev === "PASS" ? "none" : "resonantTransfer() denominator terms"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#fee2e2", border: "1px solid #fecaca" }}>
        <div style={{ fontWeight: 700, color: "#7f1d1d" }}>Verdict: {result.verdict}</div>
        <div style={{ marginTop: 6, color: "#991b1b" }}>Next step: {result.nextStep}</div>
      </div>
    </div>
  );
}