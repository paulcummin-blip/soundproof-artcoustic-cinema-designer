/**
 * P15P21AssumptionControl.jsx
 * ---------------------------
 * Shared L1–L4 pill selector for the designer-assumed RP22 parameters P15
 * (background noise floor) and P21 (early reflections).
 *
 * Both the Compliance Report and the Technical Report render this same
 * control. The value is owned by AppState (assumedP15Level / assumedP21Level)
 * and persisted via the normal autosave path. A change immediately updates
 * the single shared project assumption — last change wins everywhere.
 *
 * null = NOT CALCULATED (no silent default). Once the designer selects a
 * level, the status becomes "Assumed" and the derived display value (NCB / dB)
 * is shown.
 *
 * No local state — pure presentation of the shared authority.
 */
import React from "react";
import {
  ASSUMED_P15_OPTIONS,
  ASSUMED_P21_OPTIONS,
  getAssumedP15DisplayValue,
  getAssumedP21DisplayValue,
  isAssumedLevelSet,
} from "@/components/utils/assumedParameterAuthority";

const LABEL_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function P15P21AssumptionControl({
  paramId,
  value,
  onChange,
  variant = "screen",
}) {
  const isP15 = Number(paramId) === 15;
  const options = isP15 ? ASSUMED_P15_OPTIONS : ASSUMED_P21_OPTIONS;
  const currentLevel = isAssumedLevelSet(value) ? String(value).toUpperCase() : null;
  const displayValue = isP15
    ? getAssumedP15DisplayValue(value)
    : getAssumedP21DisplayValue(value);

  // ── Print mode: read-only descriptive text ──
  if (variant === "print") {
    return (
      <div
        style={{
          marginTop: "1.5mm",
          padding: "1.5mm 2mm",
          background: "#F8F7F5",
          borderRadius: 3,
          border: "1px solid #EFEEEA",
          fontSize: "8pt",
          color: "#625143",
          fontFamily: LABEL_FONT,
          lineHeight: 1.3,
        }}
      >
        <strong style={{ fontWeight: 600, color: "#1B1A1A" }}>Assumed: </strong>
        {currentLevel ? `${currentLevel} · ${displayValue}` : "Not Calculated"}
      </div>
    );
  }

  // ── Screen mode: interactive L1–L4 pill selector ──
  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        background: "#F8F7F5",
        borderRadius: 6,
        border: "1px solid #EFEEEA",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#1B1A1A",
            fontFamily: LABEL_FONT,
            letterSpacing: "0.02em",
          }}
        >
          Assumed Performance Level
        </span>
        {currentLevel ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#213428" }}>
            {currentLevel} · {displayValue}
          </span>
        ) : (
          <span style={{ fontSize: 10, fontWeight: 600, color: "#8B7F76", fontStyle: "italic" }}>
            Not Calculated
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {options.map((opt) => {
          const selected = currentLevel === opt.level;
          return (
            <button
              key={opt.level}
              type="button"
              onClick={() => onChange?.(opt.level)}
              style={{
                flex: "1 1 0",
                padding: "6px 4px",
                borderRadius: 5,
                border: selected
                  ? "2px solid #213428"
                  : "1px solid #DCDBD6",
                background: selected ? "#213428" : "#FFFFFF",
                color: selected ? "#FFFFFF" : "#1B1A1A",
                cursor: "pointer",
                fontFamily: LABEL_FONT,
                fontWeight: 600,
                fontSize: 12,
                lineHeight: 1.2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                transition: "all 150ms ease",
              }}
            >
              <span>{opt.level}</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 500,
                  color: selected ? "rgba(255,255,255,0.8)" : "#625143",
                }}
              >
                {opt.sublabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}