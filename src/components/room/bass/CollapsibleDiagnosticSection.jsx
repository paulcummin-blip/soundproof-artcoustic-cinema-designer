// CollapsibleDiagnosticSection.jsx
// Reusable collapsible wrapper for grouping diagnostic audit panels on the
// Developer Diagnostics / Bass Response page. Purely organisational — renders
// its children unchanged, just shows/hides them. Count is derived automatically
// from the rendered children, never hardcoded.

import React, { useState } from "react";

export default function CollapsibleDiagnosticSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const count = React.Children.count(React.Children.toArray(children).filter(Boolean));

  return (
    <div style={{ marginBottom: 14, border: "1px solid #d1d5db", borderRadius: 8, background: "#f9fafb" }}>
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
        <span>{title} ({count})</span>
      </button>
      {open && (
        <div style={{ padding: "10px 10px 4px 10px" }}>
          {children}
        </div>
      )}
    </div>
  );
}