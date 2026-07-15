import React, { useMemo } from "react";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import { interpolateCurveDb, simulateBassAtSeats } from "@/components/bass/bassSimulationEngine";

const MODELS = ["sub2-12", "sub3-12", "sub4-12"];
const FREQUENCIES = [15, 16, 18, 20, 22, 25, 31.5, 40, 60, 80];
const TEST_ROOM = { widthM: 5, lengthM: 5, heightM: 2.4 };
const format = (value) => Number.isFinite(value) ? value.toFixed(1) : "—";

export default function ManufacturerCurveValidationTest06({ seatingPositions = [], subs = [] }) {
  const results = useMemo(() => {
    const rsp = seatingPositions.find((seat) => seat?.isPrimary) || seatingPositions[0];
    const referenceSub = subs[0];
    if (!rsp || !referenceSub) return null;

    const seat = { id: "test-06-rsp", x: rsp.x, y: rsp.y, z: Number.isFinite(Number(rsp.z)) ? Number(rsp.z) : 1.2, isPrimary: true };
    const distanceM = Math.max(0.5, Math.hypot(referenceSub.x - seat.x, referenceSub.y - seat.y, referenceSub.z - seat.z));
    const gainDb = Number(referenceSub.tuning?.gainDb) || 0;
    const distanceLossDb = -20 * Math.log10(distanceM);

    return Object.fromEntries(MODELS.map((modelKey) => {
      const curve = getSubwooferCurve(modelKey);
      const run = simulateBassAtSeats({
        roomDims: TEST_ROOM,
        seats: [seat],
        subs: [{ ...referenceSub, id: "test-06-sub", modelKey }],
        splConfig: { globalPowerW: 100, globalEqHeadroomDb: 0, radiationMode: "half-space", modesEnabled: true, roomDamping: 20, sbirEnabled: true },
      });
      return [modelKey, { curve, response: run.seatResponses[seat.id], distanceLossDb, gainDb }];
    }));
  }, [seatingPositions, subs]);

  const closestIndex = (response, frequency) => response.freqsHz.reduce(
    (best, hz, index) => Math.abs(hz - frequency) < Math.abs(response.freqsHz[best] - frequency) ? index : best,
    0,
  );
  const nearestRawValue = (curve, frequency) => curve.reduce(
    (best, point) => Math.abs(point.hz - frequency) < Math.abs(best.hz - frequency) ? point : best,
    curve[0],
  );

  if (!results) return null;

  return (
    <details style={{ border: "2px solid #a16207", borderRadius: 6, background: "#fffbeb", padding: "8px 10px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <summary style={{ color: "#854d0e", cursor: "pointer", fontWeight: 700 }}>TEST 06 — MANUFACTURER CURVE VALIDATION</summary>
      <div style={{ color: "#713f12", margin: "7px 0" }}>Fixed room: 5.0 × 5.0 × 2.4 m. Manufacturer shows nearest raw FRD point. Delta compares directOnlySplDb to the engine’s existing interpolated FRD + copied distance loss + gain.</div>
      <div style={{ color: "#713f12", marginBottom: 7 }}>The direct stage uses one copied active sub, so delay and polarity alter phase only, not its magnitude. 31.5 Hz uses the nearest 32 Hz direct buffer.</div>
      {MODELS.map((modelKey) => {
        const { curve, response, distanceLossDb, gainDb } = results[modelKey];
        return <div key={modelKey} style={{ marginTop: 8, overflowX: "auto" }}>
          <div style={{ color: "#854d0e", fontWeight: 700, marginBottom: 3 }}>{modelKey.toUpperCase()} | copied distance loss: {format(distanceLossDb)} dB | gain: {format(gainDb)} dB</div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr style={{ borderBottom: "1px solid #fde68a", color: "#854d0e" }}>{["Hz", "Manufacturer", "Direct", "Delta"].map((label) => <th key={label} style={{ textAlign: "right", padding: "2px 5px" }}>{label}</th>)}</tr></thead>
            <tbody>{FREQUENCIES.map((frequency) => {
              const index = closestIndex(response, frequency);
              const direct = response.debugPhysics.directOnlySplDb[index];
              const expectedAtSeat = interpolateCurveDb(curve, response.freqsHz[index]) + distanceLossDb + gainDb;
              const raw = nearestRawValue(curve, frequency);
              return <tr key={frequency} style={{ borderBottom: "1px solid #fef3c7" }}>
                <td style={{ textAlign: "right", padding: "2px 5px", fontWeight: 700 }}>{frequency}</td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(raw.db)} <span style={{ color: "#a8a29e" }}>@{format(raw.hz)}</span></td>
                <td style={{ textAlign: "right", padding: "2px 5px" }}>{format(direct)}</td>
                <td style={{ textAlign: "right", padding: "2px 5px", fontWeight: 700 }}>{format(direct - expectedAtSeat)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>;
      })}
    </details>
  );
}