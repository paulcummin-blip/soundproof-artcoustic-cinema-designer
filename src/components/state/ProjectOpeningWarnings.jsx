// ProjectOpeningWarnings.jsx
// --------------------------
// The visible warning a project opens with when a restore stage could not be
// confirmed, is out of date, or failed.
//
// The project is never held back by a non-critical stage — but it is never
// opened silently either. This strip is that voice: it names exactly which steps
// did not resolve cleanly, in the words of the opening panel, so a designer can
// tell "nothing saved for this yet" apart from "that did not come back".
//
// Presentation only: it reads the warnings the opening authority already
// recorded and reports them. Dismissing it hides the strip, never the fact.

import React from "react";

const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function ProjectOpeningWarnings({ warnings = [], onDismiss = null }) {
  if (!Array.isArray(warnings) || warnings.length === 0) return null;

  const heading = warnings.length === 1
    ? "This project opened with one step unresolved"
    : `This project opened with ${warnings.length} steps unresolved`;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        borderBottom: "1px solid #E2D9C6",
        background: "#FBF7EF",
        padding: "12px 20px",
        fontFamily: FONT_BODY,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#8A4B12" }}>{heading}</div>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {warnings.map((warning) => (
              <div key={warning.key} style={{ fontSize: 12, color: "#625143", lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: "#3E4349" }}>{warning.label}</span>
                {warning.detail ? ` — ${warning.detail}` : ""}
              </div>
            ))}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              border: "1px solid #DCDBD6",
              background: "#FFFFFF",
              color: "#3E4349",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: FONT_BODY,
              flexShrink: 0,
            }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}