import React from "react";

export const DEFAULT_BASS_CURVE_VISIBILITY = Object.freeze({
  room: true,
  product: true,
  combined: true,
  house: true,
  finalEq: true,
});

const CURVES = Object.freeze([
  { key: "room", label: "Room response", color: "#7C3AED", dash: "5 4" },
  { key: "product", label: "Subwoofer maximum", color: "#2563EB", dash: "8 4" },
  { key: "combined", label: "Product + room maximum", color: "#B45309", dash: "2 4" },
  { key: "house", label: "House target", color: "#625143", dash: "10 5" },
  { key: "finalEq", label: "Final EQ response", color: "#16A34A", dash: null },
]);

export default function BassCurveVisibilityControls({ visibility, onChange }) {
  const setVisible = (key, nextValue) => {
    onChange?.({ ...DEFAULT_BASS_CURVE_VISIBILITY, ...(visibility || {}), [key]: nextValue });
  };

  return (
    <fieldset
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 10,
        padding: "8px 10px",
        background: "#F8F8F7",
        border: "1px solid #DCDBD6",
        borderRadius: 8,
      }}
    >
      <legend style={{ padding: "0 6px", fontSize: 10, fontWeight: 700, color: "#625143" }}>
        Graph layers
      </legend>
      {CURVES.map((curve) => {
        const checked = visibility?.[curve.key] !== false;
        return (
          <button
            key={curve.key}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => setVisible(curve.key, !checked)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              height: 28,
              padding: "0 10px",
              borderRadius: 999,
              border: checked ? "1px solid #A8A39C" : "1px solid #DCDBD6",
              background: checked ? "#FFFFFF" : "#F1F0EE",
              color: checked ? "#1B1A1A" : "#8B7F76",
              fontSize: 10,
              fontFamily: "monospace",
              fontWeight: checked ? 700 : 400,
              cursor: "pointer",
              opacity: checked ? 1 : 0.7,
            }}
          >
            <svg width="26" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="26"
                y2="4"
                stroke={checked ? curve.color : "#A8A39C"}
                strokeWidth="2"
                strokeDasharray={curve.dash || undefined}
              />
            </svg>
            <span>{curve.label}</span>
            <span aria-hidden="true" style={{ fontSize: 11 }}>{checked ? "✓" : "○"}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
