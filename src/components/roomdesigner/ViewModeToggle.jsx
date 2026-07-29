import React from "react";

// ViewModeToggle — three workspace view modes for the Cinema Designer.
// Split (default) | Plan (room design full page) | Technical (analysis full page).
// Pure presentation switch; does not affect calculations, placement, or scoring.
const MODES = [
  { key: "split", label: "Split View" },
  { key: "plan", label: "Plan View" },
  { key: "technical", label: "Technical" },
];

export default function ViewModeToggle({ viewMode = "split", onViewModeChange }) {
  const active = (viewMode && MODES.some((m) => m.key === viewMode)) ? viewMode : "split";
  return (
    <div
      role="group"
      aria-label="Workspace view mode"
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 2,
        borderRadius: 8,
        background: "#F1EFEA",
        border: "1px solid #DCDBD6",
      }}
    >
      {MODES.map((m) => {
        const isActive = active === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onViewModeChange?.(m.key)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              padding: "5px 12px",
              borderRadius: 6,
              border: isActive ? "1px solid #213428" : "1px solid transparent",
              background: isActive ? "#213428" : "transparent",
              color: isActive ? "#fff" : "#625143",
              cursor: "pointer",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}