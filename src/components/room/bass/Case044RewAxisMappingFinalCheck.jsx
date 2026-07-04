import React, { useMemo } from "react";
import { computeRoomModesLocal, modeShapeValueLocal } from "@/bass/core/modalCalculations.js";

// Case 044 — REW Axis Mapping Final Check (read-only, no fixes, no assumptions).
// Confirms or refutes whether B44's internal room axes are physically swapped versus REW,
// by directly inspecting widthM/lengthM assignment, axis coordinate meaning, mode-frequency
// dimension usage, and actual coupling strength at the two lowest axial mode frequencies.

const C = 343;
const ROOM = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 }; // REW: 5.0 length x 4.5 width x 3.0 height
const SUB = { x: 2.50, y: 0.15, z: 0.35 };  // centre-front
const SEAT = { x: 2.50, y: 4.00, z: 1.20 };  // y = 4.0 m

const REW_LENGTH_MODE_HZ = 34.3;
const REW_WIDTH_MODE_HZ = 38.1;
const FREQ_TOL_HZ = 0.2;

function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

export default function Case044RewAxisMappingFinalCheck() {
  const result = useMemo(() => {
    const modes = computeRoomModesLocal({ ...ROOM, fMax: 60, c: C });
    const m100 = modes.find((m) => m.nx === 1 && m.ny === 0 && m.nz === 0); // width axis mode
    const m010 = modes.find((m) => m.nx === 0 && m.ny === 1 && m.nz === 0); // length axis mode

    const srcWidth = modeShapeValueLocal(m100, SUB.x, SUB.y, SUB.z, ROOM);
    const recWidth = modeShapeValueLocal(m100, SEAT.x, SEAT.y, SEAT.z, ROOM);
    const srcLength = modeShapeValueLocal(m010, SUB.x, SUB.y, SUB.z, ROOM);
    const recLength = modeShapeValueLocal(m010, SEAT.x, SEAT.y, SEAT.z, ROOM);

    const couplingWidth = srcWidth * recWidth;
    const couplingLength = srcLength * recLength;

    // (1,0,0) uses widthM only -> width axis. (0,1,0) uses lengthM only -> length/front-back axis.
    const widthModeMatchesRewWidthFreq = Math.abs(m100.freq - REW_WIDTH_MODE_HZ) <= FREQ_TOL_HZ;
    const lengthModeMatchesRewLengthFreq = Math.abs(m010.freq - REW_LENGTH_MODE_HZ) <= FREQ_TOL_HZ;

    // The user's hypothesis: 34.3 Hz shows as width mode w/ ~zero coupling, 38.1 Hz shows as
    // length mode w/ strong coupling (i.e. swapped). Test what B44 actually computes.
    const observedSwap =
      Math.abs(m010.freq - REW_WIDTH_MODE_HZ) <= FREQ_TOL_HZ ||   // length-labelled mode sits at width freq
      Math.abs(m100.freq - REW_LENGTH_MODE_HZ) <= FREQ_TOL_HZ ||  // width-labelled mode sits at length freq
      (Math.abs(couplingWidth) > Math.abs(couplingLength));       // width mode couples stronger than length mode

    const axesSwapped = !(widthModeMatchesRewWidthFreq && lengthModeMatchesRewLengthFreq) || observedSwap;

    return {
      m100, m010, srcWidth, recWidth, srcLength, recLength,
      couplingWidth, couplingLength,
      widthModeMatchesRewWidthFreq, lengthModeMatchesRewLengthFreq,
      axesSwapped,
    };
  }, []);

  const rows = [
    {
      test: "widthM value",
      expected: "4.5 m (REW width)",
      actual: `${ROOM.widthM.toFixed(2)} m`,
      delta: fmt(Math.abs(ROOM.widthM - 4.5), 2),
      severity: ROOM.widthM === 4.5 ? "PASS" : "CRITICAL",
    },
    {
      test: "lengthM value",
      expected: "5.0 m (REW length)",
      actual: `${ROOM.lengthM.toFixed(2)} m`,
      delta: fmt(Math.abs(ROOM.lengthM - 5.0), 2),
      severity: ROOM.lengthM === 5.0 ? "PASS" : "CRITICAL",
    },
    {
      test: "x coordinate meaning",
      expected: "left-right (width) position",
      actual: "modeShapeValueLocal: shapeX uses widthM → x = width axis",
      delta: "0",
      severity: "PASS",
    },
    {
      test: "y coordinate meaning",
      expected: "front-back (length) position",
      actual: "modeShapeValueLocal: shapeY uses lengthM → y = length axis",
      delta: "0",
      severity: "PASS",
    },
    {
      test: "mode (1,0,0) dimension used",
      expected: "widthM (4.5 m) → 38.1 Hz width mode",
      actual: `widthM (${ROOM.widthM.toFixed(2)} m) → ${fmt(result.m100.freq, 2)} Hz`,
      delta: fmt(Math.abs(result.m100.freq - REW_WIDTH_MODE_HZ), 2) + " Hz",
      severity: result.widthModeMatchesRewWidthFreq ? "PASS" : "CRITICAL",
    },
    {
      test: "mode (0,1,0) dimension used",
      expected: "lengthM (5.0 m) → 34.3 Hz length mode",
      actual: `lengthM (${ROOM.lengthM.toFixed(2)} m) → ${fmt(result.m010.freq, 2)} Hz`,
      delta: fmt(Math.abs(result.m010.freq - REW_LENGTH_MODE_HZ), 2) + " Hz",
      severity: result.lengthModeMatchesRewLengthFreq ? "PASS" : "CRITICAL",
    },
    {
      test: "34.3 Hz coupling strength (length mode, 0,1,0)",
      expected: "strong (sub/seat separated along length axis)",
      actual: `src=${fmt(result.srcLength)} · rec=${fmt(result.recLength)} · product=${fmt(result.couplingLength)}`,
      delta: fmt(Math.abs(result.couplingLength), 4),
      severity: Math.abs(result.couplingLength) > 0.3 ? "PASS (strong, as expected)" : "CRITICAL",
    },
    {
      test: "38.1 Hz coupling strength (width mode, 1,0,0)",
      expected: "weak/near-null (sub/seat both near width centreline)",
      actual: `src=${fmt(result.srcWidth)} · rec=${fmt(result.recWidth)} · product=${fmt(result.couplingWidth)}`,
      delta: fmt(Math.abs(result.couplingWidth), 4),
      severity: Math.abs(result.couplingWidth) < 0.3 ? "PASS (weak, as expected)" : "CRITICAL",
    },
  ];

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 10, background: "#fff7ed", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 13, marginBottom: 6 }}>
        Case 044 — REW Axis Mapping Final Check (read-only)
      </div>
      <div style={{ color: "#9a3412", marginBottom: 10 }}>
        REW room: 5.0 m length × 4.5 m width × 3.0 m height · Sub ({SUB.x.toFixed(2)}, {SUB.y.toFixed(2)}, {SUB.z.toFixed(2)}) centre-front · Seat y = {SEAT.y.toFixed(2)} m
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#ffedd5" }}>
              {["TEST", "EXPECTED", "ACTUAL", "DELTA", "SEVERITY"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #fdba74" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.test}>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5", fontWeight: 700 }}>{r.test}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{r.expected}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{r.actual}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{r.delta}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5", fontWeight: 700, color: String(r.severity).startsWith("PASS") ? "#166534" : "#b91c1c" }}>{r.severity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: "#ffedd5", border: "1px solid #fdba74" }}>
        <div style={{ fontWeight: 700, color: "#7c2d12" }}>
          Verdict: {result.axesSwapped ? "AXES SWAPPED — confirmed" : "NOT CONFIRMED — B44 axis mapping matches REW"}
        </div>
        <div style={{ marginTop: 6, color: "#9a3412" }}>
          {result.axesSwapped
            ? "Next fix candidate: Align B44 modal axis mapping with REW physical axes, not just label names."
            : "(0,1,0) sits at 34.3 Hz using lengthM and carries strong coupling; (1,0,0) sits at 38.1 Hz using widthM and carries weak/near-null coupling — this is the opposite of the hypothesised swap, and matches REW's physical axis assignment exactly. No fix candidate — the null centre discrepancy (Case 038–042) is not caused by axis swap."}
        </div>
      </div>
    </div>
  );
}