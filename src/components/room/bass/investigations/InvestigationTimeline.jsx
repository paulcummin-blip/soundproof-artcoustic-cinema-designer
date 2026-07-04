// InvestigationTimeline.jsx
// Compact vertical chain showing what's already been eliminated, ending at the
// current active investigation. Read-only, purely presentational — derived
// automatically from the investigation manifest, no manual upkeep required.

import React from "react";
import StatusBadge from "@/components/room/bass/investigations/StatusBadge";

export default function InvestigationTimeline({ items }) {
  if (!items.length) return null;

  return (
    <div style={{ marginBottom: 14, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fafafa" }}>
      <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 11, color: "#6b7280", marginBottom: 8, letterSpacing: "0.04em" }}>
        INVESTIGATION TIMELINE
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((item, i) => (
          <div key={item.key} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#374151" }}>{item.title}</span>
              <StatusBadge status={item.status} size="sm" />
            </div>
            {i < items.length - 1 && (
              <div style={{ marginLeft: 6, color: "#9ca3af", fontFamily: "monospace", fontSize: 12, lineHeight: 1.4 }}>↓</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}