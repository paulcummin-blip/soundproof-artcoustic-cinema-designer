/**
 * Editable presentation for the P15/P21 design assumptions.
 *
 * Both parameters are design-stage assumptions, not measured results. The
 * designer selects an L1–L4 level; selecting a level immediately calls
 * onChange(level) and the authority updates every downstream consumer.
 *
 * The level colours and pill styling are the existing RP22GradingPill styling.
 * The "Assumed" label is always shown — these are never labelled as a
 * measurement.
 */
import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import {
  DEFAULT_ASSUMED_LEVEL,
  normalizeAssumedLevel,
  ASSUMED_P15_OPTIONS,
  ASSUMED_P21_OPTIONS,
  P15_LEVEL_TO_NCB,
  P21_LEVEL_TO_DB,
} from "@/components/utils/assumedParameterAuthority";

const LABEL_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function P15P21AssumptionControl({
  paramId,
  value = null,
  onChange = null,
  variant = "screen",
}) {
  const isP15 = Number(paramId) === 15;
  const currentLevel = normalizeAssumedLevel(value) || DEFAULT_ASSUMED_LEVEL;
  const options = isP15 ? ASSUMED_P15_OPTIONS : ASSUMED_P21_OPTIONS;
  const editable = typeof onChange === "function";

  const detail = isP15
    ? `Design target: NCB ${P15_LEVEL_TO_NCB[currentLevel]}`
    : currentLevel === "L1"
      ? "Early reflections control is not applicable at this level."
      : "Early reflections have not been measured. This level is used as the design assumption.";

  if (variant === "print") {
    return (
      <div
        className="p15-p21-assumption-note"
        style={{
          marginTop: "1.2mm",
          padding: "1.3mm 2mm",
          background: "#F8F7F5",
          borderRadius: 3,
          border: "1px solid #EFEEEA",
          fontSize: "7.4pt",
          color: "#625143",
          fontFamily: LABEL_FONT,
          lineHeight: 1.3,
          breakInside: "avoid",
          pageBreakInside: "avoid",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
          <strong style={{ color: "#1B1A1A" }}>Assumed</strong>
          <strong style={{ color: "#213428" }}>{currentLevel}</strong>
        </div>
        <div style={{ marginTop: "0.6mm" }}>{detail}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: "9px 10px",
        background: "#F8F7F5",
        borderRadius: 6,
        border: "1px solid #EFEEEA",
        fontFamily: LABEL_FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#1B1A1A", letterSpacing: "0.02em" }}>
          Assumed
        </span>
        <span style={{ fontSize: 10, color: "#9B8E82", fontStyle: "italic" }}>
          {detail}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const selected = opt.level === currentLevel;
          return (
            <button
              key={opt.level}
              type="button"
              disabled={!editable}
              onClick={() => editable && onChange(opt.level)}
              title={opt.sublabel}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px 3px 4px",
                borderRadius: 9999,
                border: selected
                  ? "1.5px solid #213428"
                  : "1px solid #DCDBD6",
                background: selected ? "rgba(33,52,40,0.06)" : "transparent",
                cursor: editable ? "pointer" : "default",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <RP22GradingPill level={opt.level} />
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: selected ? "#213428" : "#9B8E82",
                whiteSpace: "nowrap",
              }}>
                {opt.sublabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}