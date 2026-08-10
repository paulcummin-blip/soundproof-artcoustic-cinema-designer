/**
 * TechnicalParameterCard.jsx
 * ---------------------------
 * Redesigned RP22 parameter card for the Technical Report print variant.
 *
 * Hierarchy:
 *   1. Parameter header  — "RP22 PARAMETER N" + human-readable title
 *   2. Result area       — rectangular level badge (left) + prominent value (right)
 *   3. Technical explanation — 2-3 lines, visually subordinate
 *   4. Technical metadata  — SCOPE, TARGET BASIS, RSP (small, secondary)
 *   5. Seat grid           — compact per-seat grid for seat-scope parameters
 *   6. Threshold strip     — horizontal footer (L4 ≤50° | L3 ≤60° | …)
 *
 * Design tokens:
 *   Card background:  #FFFFFF
 *   Primary heading:  #213428
 *   Body:             #3E4349
 *   Secondary/metadata: #625143
 *   Accent:           #4A230F
 *   Headings font:    Futura PT Light
 *   Body font:        Didact Gothic, Century Gothic fallback
 */

import React from "react";
import TechnicalLevelBadge from "./TechnicalLevelBadge";
import TechnicalSeatGrid from "./TechnicalSeatGrid";

const HEADING_FONT = "'Futura PT Light', 'Century Gothic', sans-serif";
const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

const fmtIneq = (dir) => {
  if (dir === ">=") return "≥";
  if (dir === "<=") return "≤";
  if (dir === ">") return ">";
  if (dir === "<") return "<";
  if (dir === "=") return "=";
  if (dir === "±max") return "±";
  return String(dir || "");
};

const formatThresholdValue = (value, unit, direction) => {
  if (value == null) return "N/A";
  const isEq = direction === "=";
  const ineq = fmtIneq(direction);
  const unitStr =
    unit === "°"
      ? "°"
      : unit === "Hz"
      ? " Hz"
      : unit === "± dB" || unit === "dB" || unit === "dB (min)"
      ? " dB"
      : unit === "m"
      ? " m"
      : "";
  return isEq ? `${value}${unitStr}` : `${ineq} ${value}${unitStr}`;
};

function ThresholdStrip({ thresholds, unit }) {
  const levels = ["L4", "L3", "L2", "L1"];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        fontSize: "8pt",
        color: "#625143",
        fontFamily: BODY_FONT,
        flexWrap: "wrap",
      }}
    >
      {levels.map((k, i) => {
        const value = thresholds[k];
        const formatted = formatThresholdValue(value, unit, thresholds.direction);
        return (
          <span key={k} style={{ display: "contents" }}>
            {i > 0 && (
              <span
                style={{
                  margin: "0 6px",
                  color: "#C1B6AD",
                  fontWeight: 400,
                }}
              >
                |
              </span>
            )}
            <span style={{ whiteSpace: "nowrap" }}>
              <strong style={{ color: "#3E4349", fontWeight: 700 }}>{k}</strong>{" "}
              {formatted}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export default function TechnicalParameterCard({
  param,
  achievedValue,
  lvl,
  category,
  humanTitle,
  seatGridData,
  targetBasisNote,
  rspLabel,
  asdrFooter = null,
}) {
  const isSeatScope = String(param?.scope || "").toLowerCase() === "seat";

  return (
    <div
      className="tech-param-card"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E6E4DD",
        borderRadius: 6,
        padding: "5mm 6mm",
        display: "flex",
        flexDirection: "column",
        gap: "2.5mm",
        breakInside: "avoid",
        pageBreakInside: "avoid",
        boxSizing: "border-box",
      }}
    >
      {/* 1. PARAMETER HEADER */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: "7.5pt",
              fontWeight: 600,
              color: "#625143",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: BODY_FONT,
            }}
          >
            RP22 Parameter {param.id}
          </span>
          <span
            style={{
              fontSize: "7pt",
              color: "#9B8E82",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: BODY_FONT,
            }}
          >
            {category}
          </span>
        </div>
        <div
          style={{
            fontSize: "12.5pt",
            fontWeight: 400,
            color: "#213428",
            fontFamily: HEADING_FONT,
            lineHeight: 1.2,
            marginTop: "1mm",
            letterSpacing: "0.005em",
          }}
        >
          {humanTitle}
        </div>
      </div>

      {/* 2. RESULT AREA */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "3mm 4mm",
          background: "#F8F7F5",
          borderRadius: 4,
          border: "1px solid #EFEEEA",
        }}
      >
        <TechnicalLevelBadge level={lvl} />
        <div
          style={{
            fontSize: "18pt",
            fontWeight: 700,
            color: "#213428",
            fontFamily: HEADING_FONT,
            lineHeight: 1.1,
            flex: 1,
          }}
        >
          {achievedValue || "—"}
        </div>
      </div>

      {/* 3. SHORT TECHNICAL EXPLANATION */}
      <div
        style={{
          fontSize: "8.5pt",
          color: "#3E4349",
          lineHeight: 1.45,
          fontFamily: BODY_FONT,
        }}
      >
        {param.short}
      </div>

      {/* 4. TECHNICAL METADATA */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "2mm 4mm",
          fontSize: "7.5pt",
          color: "#625143",
          fontFamily: BODY_FONT,
          lineHeight: 1.3,
        }}
      >
        <span>
          <strong style={{ fontWeight: 600 }}>SCOPE:</strong>{" "}
          {String(param.scope || "").toUpperCase()}
        </span>
        {targetBasisNote && (
          <span>
            <strong style={{ fontWeight: 600 }}>TARGET BASIS:</strong>{" "}
            {targetBasisNote}
          </span>
        )}
        {isSeatScope && rspLabel && (
          <span>
            <strong style={{ fontWeight: 600 }}>RSP:</strong> {rspLabel}
          </span>
        )}
      </div>

      {/* 5. SEAT PARAMETERS */}
      {isSeatScope && seatGridData && (
        <div style={{ paddingTop: "1mm" }}>
          <TechnicalSeatGrid data={seatGridData} />
        </div>
      )}

      {/* 6. THRESHOLD STRIP */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: "2.5mm",
          borderTop: "1px solid #EFEEEA",
        }}
      >
        <ThresholdStrip thresholds={param.thresholds} unit={param.unit} />
      </div>

      {/* 7. ASDR FOOTER — subtle engineering annotation (only when participating) */}
      {asdrFooter && (
        <div
          style={{
            marginTop: "1.5mm",
            paddingTop: "1.5mm",
            borderTop: "1px solid #EFEEEA",
            fontSize: "7pt",
            color: "#625143",
            fontFamily: BODY_FONT,
            letterSpacing: "0.04em",
          }}
        >
          {asdrFooter}
        </div>
      )}
    </div>
  );
}