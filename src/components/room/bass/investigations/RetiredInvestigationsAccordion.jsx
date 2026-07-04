// RetiredInvestigationsAccordion.jsx
// Everything except Active + Recent, collapsed into a single accordion showing only
// a compact list (title + status). Nothing inside loads until the accordion itself,
// and then each individual row, is expanded. Keeps the page clean even after
// hundreds of investigations — no information is deleted, only reorganised.

import React, { useState } from "react";
import LazyInvestigationRow from "@/components/room/bass/investigations/LazyInvestigationRow";

export default function RetiredInvestigationsAccordion({ items }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;

  return (
    <div style={{ border: "1px solid #d1d5db", borderRadius: 8, background: "#f9fafb" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "#f3f4f6",
          border: "none",
          borderBottom: open ? "1px solid #d1d5db" : "none",
          borderRadius: open ? "8px 8px 0 0" : 8,
          cursor: "pointer",
          fontFamily: "monospace",
          fontWeight: 700,
          fontSize: 13,
          color: "#111827",
          textAlign: "left",
        }}
      >
        <span>{open ? "▼" : "▶"}</span>
        <span>RETIRED INVESTIGATIONS ({items.length})</span>
      </button>
      {open && (
        <div style={{ padding: "10px 10px 4px 10px" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#9ca3af", marginBottom: 6 }}>
            Compact list — click any investigation to open its full audit panel.
          </div>
          {items.map((item) => (
            <LazyInvestigationRow key={item.key} item={item} compact />
          ))}
        </div>
      )}
    </div>
  );
}