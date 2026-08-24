/**
 * ExpandedParameterDetail.jsx
 * ---------------------------
 * Expanded detail for a single RP22 parameter in the Design Review
 * Parameter Explorer.
 *
 * Reports the achieved Performance Level and values factually — no subjective
 * status (OK / Needs Attention). L1–L4 are neutral results; FAIL is the only
 * genuine failure state.
 *
 * ROOM-scope parameters show:
 *   - achieved / design value
 *   - achieved Performance Level
 *   - threshold table
 *   - Minimum / Recommended basis where applicable
 *   - relevant explanation
 *
 * SEAT-scope parameters show:
 *   - a per-seat table (SEAT | ACHIEVED VALUE | LEVEL) for every real seat
 *   - threshold table
 *   - RSP / reference identification
 *   - relevant explanation
 */

import React from "react";
import TechnicalLevelBadge from "@/components/report/technical/TechnicalLevelBadge";
import SeatScopeBadge from "@/components/report/SeatScopeBadge";
import SeatDetailTable from "@/components/designreview/SeatDetailTable";
import SeatResultLayout from "@/components/designreview/SeatResultLayout";
import { formatSeatLabel } from "@/components/utils/seatLabel";

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
    unit === "°" ? "°"
    : unit === "Hz" ? " Hz"
    : unit === "± db" || unit === "dB" || unit === "dB (min)" ? " dB"
    : unit === "dB SPL (C)" ? " dBC"
    : unit === "m" ? " m"
    : unit === "count" ? " speakers"
    : unit === "yes/no" ? ""
    : "";
  return isEq ? `${value}${unitStr}` : `${ineq} ${value}${unitStr}`;
};

function ThresholdTable({ thresholds, unit }) {
  const levels = ["L4", "L3", "L2", "L1"];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 0,
        border: "1px solid #E6E4DD",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {levels.map((k, i) => {
        const value = thresholds[k];
        const formatted = formatThresholdValue(value, unit, thresholds.direction);
        return (
          <div
            key={k}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "6px 4px",
              borderRight: i < 3 ? "1px solid #E6E4DD" : "none",
              background: "#F8F7F5",
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#213428",
                fontFamily: BODY_FONT,
              }}
            >
              {k}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#3E4349",
                fontFamily: BODY_FONT,
                marginTop: 2,
                whiteSpace: "nowrap",
              }}
            >
              {formatted}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ExpandedParameterDetail({
  param,
  analysisResult,
  bassPresentation,
  resolveThresholds,
  resolveP12P13DualLevels,
  getHudValueForParam,
  getHudLevelForParam,
  buildSeatGridData,
  buildAsdrFooter,
  buildP6Presentation,
  lockedSeatId,
  category,
  humanTitle,
  seatingPositions,
}) {
  const isSeatScope = String(param.scope || "").toLowerCase() === "seat";
  const resolvedThresholds = resolveThresholds(param);
  const resolvedParam =
    param.id === 12 || param.id === 13 || param.id === 14
      ? { ...param, thresholds: resolvedThresholds }
      : param;

  // Minimum / Recommended target basis note
  const targetBasisNote =
    param.id === 12 || param.id === 13
      ? (() => {
          const v = analysisResult?.gradedParameters?.primary?.[param.id]?.value;
          const dual = resolveP12P13DualLevels(param.id, v);
          return dual
            ? `Minimum ${dual.minimum} · Recommended ${dual.recommended}`
            : null;
        })()
      : param.id === 14
      ? bassPresentation.parameters.p14.detail
      : null;

  let achievedValue = getHudValueForParam(param);
  let lvl = getHudLevelForParam(param);
  let rspLabel = lockedSeatId ? formatSeatLabel(lockedSeatId) : null;

  // P6 special case: worst seat spread
  if (param.id === 6) {
    const p6 = buildP6Presentation();
    achievedValue = p6.achievedValue;
    if (p6.lvl !== null) lvl = p6.lvl;
    rspLabel = null;
  }

  const asdrFooter = buildAsdrFooter(param.id);
  const seatGridData = isSeatScope ? buildSeatGridData(param.id) : null;

  return (
    <div
      style={{
        padding: "12px 16px 16px",
        background: "#FBFAF8",
        borderTop: "1px solid #E6E4DD",
      }}
    >
      {/* Category + scope line */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          fontWeight: 700,
          color: "#9B8E82",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontFamily: BODY_FONT,
          marginBottom: 8,
        }}
      >
        <span>{category}</span>
        <span>Scope: {String(param.scope || "").toUpperCase()}</span>
      </div>

      {/* Result area — Room-scoped: achieved value + level badge.
          Seat-scoped: SEAT badge only; per-seat results are below. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          background: "#F8F7F5",
          borderRadius: 4,
          border: "1px solid #EFEEEA",
          marginBottom: 10,
        }}
      >
        {isSeatScope ? <SeatScopeBadge /> : <TechnicalLevelBadge level={lvl} />}
        {!isSeatScope && (
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#213428",
              fontFamily: HEADING_FONT,
              flex: 1,
              lineHeight: 1.1,
            }}
          >
            {achievedValue || "—"}
          </div>
        )}
      </div>

      {/* Seat result layout map for SEAT-scope parameters — actual seating geometry */}
      {isSeatScope && seatGridData && Array.isArray(seatingPositions) && seatingPositions.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <SeatResultLayout
            seatingPositions={seatingPositions}
            seatResults={seatGridData}
            rspSeatId={lockedSeatId}
          />
        </div>
      )}

      {/* Seat table for SEAT-scope parameters — every real seat */}
      {isSeatScope && seatGridData && (
        <div style={{ marginBottom: 10 }}>
          <SeatDetailTable data={seatGridData} rspSeatId={lockedSeatId} />
        </div>
      )}

      {/* Threshold table */}
      <div style={{ marginBottom: 10 }}>
        <ThresholdTable
          thresholds={resolvedParam.thresholds}
          unit={resolvedParam.unit}
        />
      </div>

      {/* Metadata: target basis + RSP reference */}
      {(targetBasisNote || rspLabel) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px 14px",
            fontSize: 10,
            color: "#625143",
            fontFamily: BODY_FONT,
            marginBottom: 8,
          }}
        >
          {targetBasisNote && (
            <span>
              <strong style={{ fontWeight: 600 }}>TARGET BASIS:</strong>{" "}
              {targetBasisNote}
            </span>
          )}
          {rspLabel && (
            <span>
              <strong style={{ fontWeight: 600 }}>RSP:</strong> {rspLabel}
            </span>
          )}
        </div>
      )}

      {/* Explanation */}
      <div
        style={{
          fontSize: 12,
          color: "#3E4349",
          lineHeight: 1.5,
          fontFamily: BODY_FONT,
          marginBottom: 8,
        }}
      >
        {param.short}
      </div>

      {/* ASDR footer — subtle engineering annotation */}
      {asdrFooter && (
        <div
          style={{
            paddingTop: 6,
            borderTop: "1px solid #EFEEEA",
            fontSize: 10,
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