// ActiveInvestigationCard.jsx
// Large, visually dominant card for the current (active) investigation.
// Expanded by default — the newest audit, or whichever is explicitly marked Active.
// No audit logic/props changed; this only wraps the rendered panel.

import React from "react";
import StatusBadge from "@/components/room/bass/investigations/StatusBadge";

export default function ActiveInvestigationCard({ item }) {
  if (!item) return null;
  const date = new Date(item.timestamp);

  return (
    <div
      style={{
        marginBottom: 16,
        border: "3px solid #1d4ed8",
        borderRadius: 12,
        background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
        boxShadow: "0 2px 10px rgba(29,78,216,0.15)",
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 18, color: "#1e3a8a" }}>
            {item.title}
          </span>
          <StatusBadge status={item.status} />
        </div>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#3b82f6", marginBottom: 10 }}>
        ACTIVE INVESTIGATION · started {date.toLocaleString()}
      </div>
      <div>{item.render()}</div>
    </div>
  );
}