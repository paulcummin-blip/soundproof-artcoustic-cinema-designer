import React, { useMemo } from "react";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import { interpolateCurveDb, simulateBassAtSeats } from "@/components/bass/bassSimulationEngine";

const MODELS = ["sub2-12", "sub3-12", "sub4-12"];
const FREQUENCIES = [15, 16, 18, 20, 22, 25, 31.5, 40, 60, 80];
const TEST_ROOM = { widthM: 5, lengthM: 5, heightM: 2.4 };
const OFFSET_DB = -6;
const format = (value) => Number.isFinite(value) ? value.toFixed(1) : "—";

const nearestIndex = (freqs, frequency) => freqs.reduce((best, hz, index) => (
  Math.abs(hz - frequency) < Math.abs(freqs[best] - frequency) ? index : best
), 0);

function summarize(freqs, values) {
  const rows = freqs.map((frequency, index) => ({ frequency, value: values[index] })).filter((row) => row.frequency >= 20 && row.frequency <= 80);
  const minimum = rows.reduce((best, row) => row.value < best.value ? row : best, rows[0]);
  const maximum = rows.reduce((best, row) => row.value > best.value ? row : best, rows[0]);
  const threshold = minimum.value + 3;
  const centre = rows.findIndex((row) => row.frequency === minimum.frequency);
  let left = centre;
  let right = centre;
  while (left > 0 && rows[left - 1].value <= threshold) left -= 1;
  while (right < rows.length - 1 && rows[right + 1].value <= threshold) right += 1;
  const octaveEnd = rows.find((row) => row.frequency >= minimum.frequency * 2);
  const recoverySlope = octaveEnd ? (octaveEnd.value - minimum.value) / Math.log2(octaveEnd.frequency / minimum.frequency) : null;
  return { minimum, maximum, nullWidth: rows[right].frequency - rows[left].frequency, recoverySlope };
}

export default function MeasurementSpaceValidationTest07({ seatingPositions = [], subs = [] }) {
  const results = useMemo(() => {
    const rsp = seatingPositions.find((seat) => seat?.isPrimary) || seatingPositions[0];
    const referenceSub = subs[0];
    if (!rsp || !referenceSub) return null;
    const seat = { id: "test-07-rsp", x: rsp.x, y: rsp.y, z: Number.isFinite(Number(rsp.z)) ? Number(rsp.z) : 1.2, isPrimary: true };

    return Object.fromEntries(MODELS.map((modelKey) => {
      const curve = getSubwooferCurve(modelKey);
      const run = simulateBassAtSeats({
        roomDims: TEST_ROOM,
        seats: [seat],
        subs: [{ ...referenceSub, id: "test-07-sub", modelKey }],
        splConfig: { globalPowerW: 100, globalEqHeadroomDb: 0, radiationMode: "half-space", modesEnabled: true, roomDamping: 20, sbirEnabled: true },
      });
      const response = run.seatResponses[seat.id];
      return [modelKey, { curve, response, summary: summarize(response.freqsHz, response.debugPhysics.finalRoomSplDb) }];
    }));
  }, [seatingPositions, subs]);

  if (!results) return null;

  return (
    <details style={{ border: "2px solid #be123c", borderRadius: 6, background: "#fff1f2", padding: "8px 10px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <summary style={{ color: "#9f1239", cursor: "pointer", fontWeight: 700 }}>TEST 07 — MEASUREMENT SPACE VALIDATION</summary>
      <div style={{ color: "#881337", margin: "7px 0" }}>Read-only diagnostic: Artcoustic-confirmed simulated 1 W/1 m half-space source data is observed as −6.0 dB after the existing FRD interpolation. No engine output or production calculation is changed.</div>
      <div style={{ color: "#881337", marginBottom: 7 }}>A uniform source offset propagates identically through the existing linear single-sub direct, image-source, and modal path; corrected readings therefore equal the existing buffer −6.0 dB.</div>
      {MODELS.map((modelKey) => {
        const { curve, response, summary } = results[modelKey];
        const { freqsHz, debugPhysics } = response;
        return <div key={modelKey} style={{ marginTop: 10, overflowX: "auto" }}>
          <div style={{ color: "#9f1239", fontWeight: 700, marginBottom: 3 }}>{modelKey.toUpperCase()} — fixed 5.0 × 5.0 × 2.4 m diagnostic room</div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr style={{ borderBottom: "1px solid #fecdd3", color: "#9f1239" }}>{["Hz", "Direct SPL", "Net modal", "Room SPL", "Room gain", "Boundary gain", "Raw FRD", "FRD −6", "Current", "Corrected", "Delta"].map((label) => <th key={label} style={{ textAlign: "right", padding: "2px 5px", whiteSpace: "nowrap" }}>{label}</th>)}</tr></thead>
            <tbody>{FREQUENCIES.map((frequency) => {
              const index = nearestIndex(freqsHz, frequency);
              const direct = debugPhysics.directOnlySplDb[index];
              const preModal = debugPhysics.directPlusSbirSplDb[index];
              const room = debugPhysics.finalRoomSplDb[index];
              const rawFrd = interpolateCurveDb(curve, freqsHz[index]);
              return <tr key={frequency} style={{ borderBottom: "1px solid #ffe4e6" }}>
                <td style={{ textAlign: "right", padding: "2px 5px", fontWeight: 700 }}>{frequency}</td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(direct)}</td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(room - preModal)}</td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(room)}</td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(room - direct)}</td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(preModal - direct)}</td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(rawFrd)}</td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(rawFrd + OFFSET_DB)}</td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(room)}</td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(room + OFFSET_DB)}</td>
                <td style={{ textAlign: "right", padding: "2px 5px", fontWeight: 700 }}>{format(OFFSET_DB)}</td>
              </tr>;
            })}</tbody>
          </table>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", color: "#881337", marginTop: 4 }}>
            <span>Min SPL: {format(summary.minimum.value)} dB</span><span>Max SPL: {format(summary.maximum.value)} dB</span><span>Null centre: {format(summary.minimum.frequency)} Hz</span><span>Null width: {format(summary.nullWidth)} Hz</span><span>Recovery slope: {format(summary.recoverySlope)} dB/oct</span>
          </div>
        </div>;
      })}
      <div style={{ color: "#9f1239", marginTop: 6 }}>Net modal = final room − direct-plus-SBIR. Boundary gain = direct-plus-SBIR − direct. Both are read from existing diagnostic buffers.</div>
    </details>
  );
}