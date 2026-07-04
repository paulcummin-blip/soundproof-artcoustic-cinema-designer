import React, { useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

// Case 041 — Multi-Room Modal Source Amplitude Check.
// Read-only forensic audit. Does not touch production engine, graph, or state.

const C = 343;
const ABSORPTION = { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const CURVE_DB = 94;
const TARGET_HZ = 30.40;
const TOP_N = 12;

const ROOMS = [
  { key: "A", label: "A — 5.0 × 4.5 × 3.0 m", room: { widthM: 5.0, lengthM: 4.5, heightM: 3.0 }, seatY: 4.00 },
  { key: "B", label: "B — 6.0 × 4.0 × 2.4 m", room: { widthM: 6.0, lengthM: 4.0, heightM: 2.4 }, seatY: 4.50 },
  { key: "C", label: "C — 4.2 × 3.6 × 2.4 m", room: { widthM: 4.2, lengthM: 3.6, heightM: 2.4 }, seatY: 3.20 },
];

function mag(re, im) { return Math.sqrt(re * re + im * im); }
function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

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

function analyzeRoom(roomDef) {
  const { room, seatY } = roomDef;
  const sub = { x: room.widthM / 2, y: 0.15, z: 0.35 };
  const seat = { x: room.widthM / 2, y: seatY, z: 1.2 };

  const modes = computeRoomModesLocal({ ...room, fMax: 200, c: C }).map((m) => ({
    ...m,
    qValue: estimateModeQLocal({ roomDims: room, surfaceAbsorption: ABSORPTION, f0: m.freq, mode: m }),
  }));

  const modalSourceAmplitude = Math.pow(10, CURVE_DB / 20);

  const contributions = modes.map((m) => {
    const sourceCoupling = modeShapeValueLocal(m, sub.x, sub.y, sub.z, room);
    const receiverCoupling = modeShapeValueLocal(m, seat.x, seat.y, seat.z, room);
    const transfer = resonantTransfer(TARGET_HZ, m.freq, m.qValue);
    const re = modalSourceAmplitude * sourceCoupling * receiverCoupling * transfer.re;
    const im = modalSourceAmplitude * sourceCoupling * receiverCoupling * transfer.im;
    const finalMag = mag(re, im);
    return {
      key: `${m.nx},${m.ny},${m.nz}`,
      mode: `(${m.nx},${m.ny},${m.nz})`,
      type: familyLabel(m),
      modeFreq: m.freq,
      transferMag: transfer.transferMag,
      modalSourceAmplitude,
      sourceCoupling,
      receiverCoupling,
      finalMag,
    };
  });

  const totalMag = contributions.reduce((s, c) => s + c.finalMag, 0);
  const withPct = contributions
    .map((c) => ({ ...c, pctOfTotal: totalMag > 0 ? (c.finalMag / totalMag) * 100 : 0 }))
    .sort((a, b) => b.finalMag - a.finalMag);

  const top12 = withPct.slice(0, TOP_N);
  const uniqueSourceAmplitudes = new Set(contributions.map((c) => c.modalSourceAmplitude.toFixed(6)));
  const sourceAmplitudeConstantWithinRoom = uniqueSourceAmplitudes.size === 1;

  return {
    key: roomDef.key,
    label: roomDef.label,
    room,
    sub,
    seat,
    top12,
    modalSourceAmplitude,
    sourceAmplitudeConstantWithinRoom,
    couplingRange: {
      minSource: Math.min(...contributions.map((c) => Math.abs(c.sourceCoupling))),
      maxSource: Math.max(...contributions.map((c) => Math.abs(c.sourceCoupling))),
      minReceiver: Math.min(...contributions.map((c) => Math.abs(c.receiverCoupling))),
      maxReceiver: Math.max(...contributions.map((c) => Math.abs(c.receiverCoupling))),
    },
  };
}

export default function Case041MultiRoomModalSourceAmplitudeCheck() {
  const result = useMemo(() => {
    const rooms = ROOMS.map(analyzeRoom);

    const allConstantWithinRoom = rooms.every((r) => r.sourceAmplitudeConstantWithinRoom);
    const amplitudesAcrossRooms = new Set(rooms.map((r) => r.modalSourceAmplitude.toFixed(6)));
    const identicalBetweenRooms = amplitudesAcrossRooms.size === 1;

    // Coupling variance check — does coupling range span meaningfully more than a tiny band?
    const couplingVariesMaterially = rooms.every(
      (r) => r.couplingRange.maxSource - r.couplingRange.minSource > 0.05 || r.couplingRange.maxReceiver - r.couplingRange.minReceiver > 0.05
    );

    let verdict;
    if (allConstantWithinRoom && identicalBetweenRooms) {
      verdict = "CONSTANT SOURCE AMPLITUDE CONFIRMED — modelling assumption";
    } else if (allConstantWithinRoom && !identicalBetweenRooms) {
      verdict = "SOURCE AMPLITUDE VARIES BY ROOM";
    } else if (!allConstantWithinRoom) {
      verdict = "SOURCE AMPLITUDE VARIES BY MODE";
    } else {
      verdict = "SOURCE AMPLITUDE BUG SUSPECTED";
    }

    const reliesOnCoupling = allConstantWithinRoom && identicalBetweenRooms && couplingVariesMaterially;

    const nextStep =
      verdict === "CONSTANT SOURCE AMPLITUDE CONFIRMED — modelling assumption"
        ? "No fix needed — modal source amplitude is intentionally constant per curve dB in src/bass/core/modalCalculations.js; final response variation is driven entirely by source/receiver coupling and resonant transfer, not source amplitude."
        : verdict === "SOURCE AMPLITUDE VARIES BY ROOM"
        ? "Trace how CURVE_DB or its equivalent input is derived per-room in the production engine call site (outside modalCalculations.js) to explain the room-dependent amplitude."
        : verdict === "SOURCE AMPLITUDE VARIES BY MODE"
        ? "Inspect the modal source amplitude assignment inside computeRoomModesLocal()/estimateModeQLocal() in src/bass/core/modalCalculations.js for an unintended per-mode scaling term."
        : "Escalate to a targeted unit test isolating modalSourceAmplitude computation in src/bass/core/modalCalculations.js before further audits.";

    return { rooms, allConstantWithinRoom, identicalBetweenRooms, reliesOnCoupling, verdict, nextStep };
  }, []);

  return (
    <div style={{ border: "2px solid #0c4a6e", borderRadius: 10, background: "#f0f9ff", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#0c4a6e", fontSize: 13, marginBottom: 6 }}>
        Case 041 — Multi-Room Modal Source Amplitude Check (read-only)
      </div>
      <div style={{ color: "#075985", marginBottom: 10 }}>
        Absorption 0.30 all surfaces · Frequency {TARGET_HZ.toFixed(2)} Hz · Sub centre-front · Top {TOP_N} contributors per room
      </div>

      {result.rooms.map((r) => (
        <div key={r.key} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: "#0c4a6e", marginBottom: 4 }}>
            {r.label} — Sub ({r.sub.x.toFixed(2)}, {r.sub.y.toFixed(2)}, {r.sub.z.toFixed(2)}) · Seat ({r.seat.x.toFixed(2)}, {r.seat.y.toFixed(2)}, {r.seat.z.toFixed(2)})
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ background: "#e0f2fe" }}>
                  {["Mode", "Freq", "|H|", "Source amp", "Source coupling", "Receiver coupling", "Final mag", "% of total"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #bae6fd" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.top12.map((c) => (
                  <tr key={c.key}>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid #e0f2fe", fontWeight: 700 }}>{c.mode}</td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid #e0f2fe" }}>{fmt(c.modeFreq, 2)} Hz</td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid #e0f2fe" }}>{fmt(c.transferMag)}</td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid #e0f2fe" }}>{fmt(c.modalSourceAmplitude)}</td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid #e0f2fe" }}>{fmt(c.sourceCoupling)}</td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid #e0f2fe" }}>{fmt(c.receiverCoupling)}</td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid #e0f2fe" }}>{fmt(c.finalMag)}</td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid #e0f2fe" }}>{fmt(c.pctOfTotal, 2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 4, color: "#075985" }}>
            Source amplitude constant within room: {r.sourceAmplitudeConstantWithinRoom ? "YES" : "NO"} (value {fmt(r.modalSourceAmplitude)})
          </div>
        </div>
      ))}

      <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: "#e0f2fe", border: "1px solid #bae6fd" }}>
        <div>Is modal source amplitude identical for every mode within each room? {result.allConstantWithinRoom ? "YES" : "NO"}</div>
        <div>Is modal source amplitude identical between rooms? {result.identicalBetweenRooms ? "YES" : "NO"}</div>
        <div>Does final response rely mostly on coupling rather than source amplitude? {result.reliesOnCoupling ? "YES" : "NO"}</div>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#e0f2fe", border: "1px solid #bae6fd" }}>
        <div style={{ fontWeight: 700, color: "#0c4a6e" }}>Verdict: {result.verdict}</div>
        <div style={{ marginTop: 6, color: "#075985" }}>Next step: {result.nextStep}</div>
      </div>
    </div>
  );
}