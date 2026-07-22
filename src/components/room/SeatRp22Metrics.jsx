import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { buildSeatHudParameterRows } from "@/components/room/seatHudPresentation";

export default function SeatRp22Metrics({ snapshot, isPinned, onHoverParameter }) {
  const rows = buildSeatHudParameterRows(snapshot);
  return (
    <div style={{ borderTop: "1px solid #E6E4DD", paddingTop: 6, marginTop: 4 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "#1B1A1A" }}>RP22 Per-Seat Metrics</div>
      {rows.map(({ parameter, key, valueText, level }) => (
        <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 12 }}>
          <span
            style={{ cursor: isPinned ? "help" : "default" }}
            onMouseEnter={() => isPinned && onHoverParameter?.({ key: key.toUpperCase(), level })}
            onMouseLeave={() => isPinned && onHoverParameter?.(null)}
          >
            {key.toUpperCase()}: {valueText}
          </span>
          <RP22GradingPill level={level} />
        </div>
      ))}
    </div>
  );
}