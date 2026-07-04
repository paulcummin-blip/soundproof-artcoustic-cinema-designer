// LazyInvestigationRow.jsx
// Single collapsed investigation row shared by "Recent" and "Retired" sections.
// Shows title, creation date/time, and status; content (including all calculations
// inside the wrapped audit panel) is not rendered until the row is expanded.

import React, { useState } from "react";
import StatusBadge from "@/components/room/bass/investigations/StatusBadge";

export default function LazyInvestigationRow({ item, compact = false }) {
  const [open, setOpen] = useState(false);
  const date = new Date(item.timestamp);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", marginBottom: 6 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: compact ? "6px 10px" : "8px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: "monospace", color: "#9ca3af", fontSize: 12 }}>{open ? "▼" : "▶"}</span>
          <span style={{ fontFamily: "monospace", fontSize: compact ? 11 : 12, color: "#111827", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.title}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {!compact && (
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#9ca3af" }}>{date.toLocaleString()}</span>
          )}
          <StatusBadge status={item.status} size="sm" />
        </div>
      </button>
      {open && (
        <div style={{ padding: "0 10px 10px 10px" }}>
          {item.render()}
        </div>
      )}
    </div>
  );
}