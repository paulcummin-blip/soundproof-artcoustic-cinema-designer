import React from "react";

const FREQUENCIES = [15, 16, 18, 20, 22, 25, 31.5, 40];

export default function DirectStagePhysicsTable({ response, subs = [] }) {
  const physics = response?.debugPhysics;
  const enabledSubs = Array.isArray(subs) ? subs.filter((sub) => sub?.enabled !== false) : [];
  if (!physics?.directOnlySplDb || !physics?.directPlusSbirSplDb || !physics?.finalRoomSplDb) return null;

  const closestIndex = (targetHz) => response.freqsHz.reduce(
    (best, hz, index) => Math.abs(hz - targetHz) < Math.abs(response.freqsHz[best] - targetHz) ? index : best,
    0,
  );

  return (
    <div style={{ border: "1px solid #CBD5E1", borderRadius: 6, background: "#FFFFFF", padding: "8px 10px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#334155", marginBottom: 6 }}>TEMPORARY Live Physics Buffer Table</div>
      <div style={{ marginBottom: 6 }}>Enabled subs: {enabledSubs.length || "—"} | IDs: {enabledSubs.map((sub) => sub.id || "—").join(", ") || "—"} | Models: {enabledSubs.map((sub) => sub.modelKey || "—").join(", ") || "—"}</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr style={{ borderBottom: "1px solid #CBD5E1" }}>
          {["Frequency", "Direct Only", "Direct + SBIR", "Final Room", "SBIR Delta", "Modal Delta", "Total Room Delta"].map(label => <th key={label} style={{ textAlign: "right", padding: "2px 5px" }}>{label}</th>)}
        </tr></thead>
        <tbody>{FREQUENCIES.map((frequency) => {
          const index = closestIndex(frequency);
          const direct = physics.directOnlySplDb[index];
          const directPlusSbir = physics.directPlusSbirSplDb[index];
          const finalRoom = physics.finalRoomSplDb[index];
          return <tr key={frequency} style={{ borderBottom: "1px solid #E2E8F0" }}>
            <td style={{ textAlign: "right", padding: "2px 5px" }}>{response.freqsHz[index].toFixed(1)}</td>
            <td style={{ textAlign: "right", padding: "2px 5px" }}>{direct.toFixed(1)}</td>
            <td style={{ textAlign: "right", padding: "2px 5px" }}>{directPlusSbir.toFixed(1)}</td>
            <td style={{ textAlign: "right", padding: "2px 5px" }}>{finalRoom.toFixed(1)}</td>
            <td style={{ textAlign: "right", padding: "2px 5px" }}>{(directPlusSbir - direct).toFixed(1)}</td>
            <td style={{ textAlign: "right", padding: "2px 5px" }}>{(finalRoom - directPlusSbir).toFixed(1)}</td>
            <td style={{ textAlign: "right", padding: "2px 5px" }}>{(finalRoom - direct).toFixed(1)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}