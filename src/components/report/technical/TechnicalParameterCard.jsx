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
import SeatScopeBadge from "../SeatScopeBadge";

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
      : unit === "dB SPL (C)"
      ? " dBC"
      : unit === "m"
      ? " m"
      : "";
  return isEq ? `${value}${unitStr}` : `${ineq} ${value}${unitStr}`;
};

function ThresholdStrip({ thresholds, unit, fontSize = "8pt" }) {
  const levels = ["L4", "L3", "L2", "L1"];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        fontSize: fontSize,
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
  variant = "print",
}) {
  const isSeatScope = String(param?.scope || "").toLowerCase() === "seat";
  const isScreen = variant === "screen";

  // Screen variant: px/rem units, no print-only styles, responsive width.
  // Print variant: mm units, print pagination (unchanged).
  const u = isScreen
    ? {
        pad: "16px 20px", gap: "10px", brk: false,
        mt1: "4px", mt2: "6px", ptTop: "10px", ptTop2: "6px",
        resultPad: "10px 14px", metaGap: "6px 14px",
        fsLabel: "11px", fsCategory: "10px", fsTitle: "18px",
        fsValue: "22px", fsBody: "13px", fsThreshold: "11px",
      }
    : {
        pad: "5mm 6mm", gap: "2.5mm", brk: true,
        mt1: "1mm", mt2: "1.5mm", ptTop: "2.5mm", ptTop2: "1.5mm",
        resultPad: "3mm 4mm", metaGap: "2mm 4mm",
        fsLabel: "7.5pt", fsCategory: "7pt", fsTitle: "12.5pt",
        fsValue: "18pt", fsBody: "8.5pt", fsThreshold: "8pt",
      };

  return (
    <div
      className="tech-param-card"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E6E4DD",
        borderRadius: 6,
        padding: u.pad,
        display: "flex",
        flexDirection: "column",
        gap: u.gap,
        ...(u.brk ? { breakInside: "avoid", pageBreakInside: "avoid" } : {}),
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
              fontSize: u.fsLabel,
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
              fontSize: u.fsCategory,
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
            fontSize: u.fsTitle,
            fontWeight: 400,
            color: "#213428",
            fontFamily: HEADING_FONT,
            lineHeight: 1.2,
            marginTop: u.mt1,
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
          padding: u.resultPad,
          background: "#F8F7F5",
          borderRadius: 4,
          border: "1px solid #EFEEEA",
        }}
      >
        {isSeatScope ? <SeatScopeBadge variant="print" /> : <TechnicalLevelBadge level={lvl} />}
        <div
          style={{
            fontSize: u.fsValue,
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
          fontSize: u.fsBody,
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
          gap: u.metaGap,
          fontSize: u.fsLabel,
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
        <div style={{ paddingTop: u.ptTop2 }}>
          <TechnicalSeatGrid data={seatGridData} />
        </div>
      )}

      {/* 6. THRESHOLD STRIP */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: u.ptTop,
          borderTop: "1px solid #EFEEEA",
        }}
      >
        <ThresholdStrip thresholds={param.thresholds} unit={param.unit} fontSize={u.fsThreshold} />
      </div>

      {/* 7. ASDR FOOTER — subtle engineering annotation (only when participating) */}
      {asdrFooter && (
        <div
          style={{
            marginTop: u.mt2,
            paddingTop: u.mt2,
            borderTop: "1px solid #EFEEEA",
            fontSize: u.fsCategory,
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