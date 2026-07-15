import React, { useMemo } from "react";
import { simulateBassAtSeats } from "@/components/bass/bassSimulationEngine";

const MODELS = ["sub2-12", "sub3-12", "sub4-12"];
const FREQUENCIES = [15, 16, 18, 20, 22, 25, 31.5, 40];
const TEST_ROOM = { widthM: 5, lengthM: 5, heightM: 2.4 };

const format = (value) => Number.isFinite(value) ? value.toFixed(1) : "—";

export default function RoomTransferInvarianceTest05({ seatingPositions = [], subs = [] }) {
  const results = useMemo(() => {
    const rsp = seatingPositions.find((seat) => seat?.isPrimary) || seatingPositions[0];
    const referenceSub = subs[0];
    if (!rsp || !referenceSub) return null;

    const seat = {
      id: "test-05-rsp",
      x: rsp.x,
      y: rsp.y,
      z: Number.isFinite(Number(rsp.z)) ? Number(rsp.z) : 1.2,
      isPrimary: true,
    };

    return Object.fromEntries(MODELS.map((modelKey) => {
      const run = simulateBassAtSeats({
        roomDims: TEST_ROOM,
        seats: [seat],
        subs: [{ ...referenceSub, id: "test-05-sub", modelKey }],
        splConfig: {
          globalPowerW: 100,
          globalEqHeadroomDb: 0,
          radiationMode: "half-space",
          modesEnabled: true,
          roomDamping: 20,
          sbirEnabled: true,
        },
      });
      return [modelKey, run.seatResponses[seat.id]];
    }));
  }, [seatingPositions, subs]);

  const closestIndex = (response, frequency) => response.freqsHz.reduce(
    (best, hz, index) => Math.abs(hz - frequency) < Math.abs(response.freqsHz[best] - frequency) ? index : best,
    0,
  );

  if (!results) return null;

  return (
    <details style={{ border: "2px solid #0f766e", borderRadius: 6, background: "#f0fdfa", padding: "8px 10px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <summary style={{ color: "#115e59", cursor: "pointer", fontWeight: 700 }}>TEST 05 — ROOM TRANSFER INVARIANCE</summary>
      <div style={{ color: "#134e4a", margin: "7px 0" }}>Fixed room: 5.0 × 5.0 × 2.4 m. RSP and source position/tuning are copied from the active design. Transfer = finalRoomSplDb − directOnlySplDb.</div>
      <div style={{ color: "#134e4a", marginBottom: 7 }}>The engine uses 1 Hz bins; 31.5 Hz displays the nearest 32 Hz buffer values.</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr style={{ borderBottom: "1px solid #99f6e4", color: "#115e59" }}>
            {["Hz", "SUB2 Direct", "SUB2 Room", "SUB2 Transfer", "SUB3 Direct", "SUB3 Room", "SUB3 Transfer", "SUB4 Direct", "SUB4 Room", "SUB4 Transfer"].map((label) => <th key={label} style={{ textAlign: "right", padding: "2px 5px", whiteSpace: "nowrap" }}>{label}</th>)}
          </tr></thead>
          <tbody>{FREQUENCIES.map((frequency) => {
            const values = MODELS.map((modelKey) => {
              const response = results[modelKey];
              const index = closestIndex(response, frequency);
              const direct = response.debugPhysics.directOnlySplDb[index];
              const room = response.debugPhysics.finalRoomSplDb[index];
              return { direct, room, transfer: room - direct };
            });
            return <tr key={frequency} style={{ borderBottom: "1px solid #ccfbf1" }}>
              <td style={{ textAlign: "right", padding: "2px 5px", fontWeight: 700 }}>{frequency}</td>
              {values.flatMap((value, index) => [
                <td key={`${index}-direct`} style={{ textAlign: "right", padding: "2px 5px" }}>{format(value.direct)}</td>,
                <td key={`${index}-room`} style={{ textAlign: "right", padding: "2px 5px" }}>{format(value.room)}</td>,
                <td key={`${index}-transfer`} style={{ textAlign: "right", padding: "2px 5px", fontWeight: 700 }}>{format(value.transfer)}</td>,
              ])}
            </tr>;
          })}</tbody>
        </table>
      </div>
    </details>
  );
}