import React from "react";

// Curve comparison only: "which response curves am I comparing?".
// Independent of seat scope (which listening position) and of graph focus
// (which RP22 parameter). Turning a curve on or off is presentation only —
// it never recalculates, transforms or saves anything.
export const DEFAULT_BASS_CURVE_VISIBILITY = Object.freeze({
  raw: false,
  room: false,
  product: false,
  combined: true,
  house: true,
  finalEq: true,
});

const CURVES = Object.freeze([
  // Raw / before EQ is the physical response as built by the engine, before any
  // correction is applied. It is an expert validation layer, off by default.
  { key: "raw", label: "Raw / before EQ", color: "#64748B", dash: "6 4" },
  { key: "room", label: "Room / layout response", color: "#7C3AED", dash: "5 4" },
  { key: "product", label: "Subwoofer maximum", color: "#2563EB", dash: "8 4" },
  { key: "combined", label: "Product + room maximum", color: "#B45309", dash: "2 4" },
  { key: "house", label: "House target", color: "#625143", dash: "10 5" },
  { key: "finalEq", label: "Predicted / post-EQ response", color: "#16A34A", dash: null },
]);

export default function BassCurveVisibilityControls({ visibility, availability, onChange }) {
  const setVisible = (key, nextValue) => {
    onChange?.({ ...DEFAULT_BASS_CURVE_VISIBILITY, ...(visibility || {}), [key]: nextValue });
  };

  // Only offer layers backed by current valid calculated evidence. A layer with
  // no matching series in the built graph is simply not shown — no disabled grid.
  const availableCurves = CURVES.filter((curve) => availability?.[curve.key] === true);
  if (availableCurves.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
      {availableCurves.map((curve) => {
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
              padding: "0 11px",
              borderRadius: 999,
              border: checked ? "1px solid #213428" : "1px solid #DCDBD6",
              background: checked ? "#FFFFFF" : "#F8F8F7",
              color: checked ? "#1B1A1A" : "#625143",
              fontSize: 11,
              fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
              fontWeight: checked ? 600 : 500,
              cursor: "pointer",
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
          >
            <svg width="22" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="22"
                y2="4"
                stroke={checked ? curve.color : "#A8A39C"}
                strokeWidth="2"
                strokeDasharray={curve.dash || undefined}
              />
            </svg>
            <span>{curve.label}</span>
          </button>
        );
      })}
    </div>
  );
}