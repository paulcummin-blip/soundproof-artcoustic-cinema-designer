/**
 * P9ProjectResultPanel
 * --------------------
 * The one result panel at the foot of the P9 page: the PROJECT limiting SEAT
 * result — the seat with the largest published adjacent-row angle — and what the
 * parameter measures.
 *
 * It never presents the reference seating position as the authority and never
 * shows a single-RSP value. Shared by the screen page and the print page so the
 * two carry identical copy.
 *
 * Props:
 *   result — { angle, level, seatLabel, rowLabel } from buildP9SeatScope, or null
 *   print  — print (PDF) context, which renders the report's print result card
 */

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";

const FONT_BODY = "Didact Gothic, Century Gothic, sans-serif";

export const P9_RESULT_COPY = {
  title: "P9 — Overhead speaker spacing",
  label: "Project limiting seat result",
  explanation: "Maximum vertical angle between adjacent overhead speaker rows.",
};

export default function P9ProjectResultPanel({ result, print }) {
  if (!result) return null;

  const identity = [result.rowLabel, result.seatLabel].filter(Boolean).join(" · ");

  if (print) {
    return (
      <div className="client-report-print-result">
        <div className="client-report-print-result__badge" style={{ fontFamily: FONT_BODY }}>
          <RP22GradingPill level={result.level} variant="printCompact" />
        </div>
        <div className="client-report-print-result__content" style={{ fontFamily: FONT_BODY }}>
          <div className="client-report-print-result__label">{P9_RESULT_COPY.title}</div>
          <div className="client-report-print-result__explanation">
            {`${P9_RESULT_COPY.label}: ${Number(result.angle).toFixed(1)}° · ${result.level}`}
          </div>
          <div className="client-report-print-result__supporting">
            {`${P9_RESULT_COPY.explanation}${identity ? ` Limiting seat: ${identity}.` : ""}`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-p9-project-result="true"
      style={{
        width: "100%",
        maxWidth: 820,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "18px 24px",
        background: "#F1F0EE",
        border: "1px solid #DCDBD6",
        borderRadius: 12,
        fontFamily: FONT_BODY,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#3E4349",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {P9_RESULT_COPY.title}
        </div>
        <div style={{ fontSize: 13, color: "#1B1A1A", marginTop: 6 }}>
          {P9_RESULT_COPY.label}
        </div>
        <div style={{ fontSize: 12, color: "#3E4349", lineHeight: 1.5, marginTop: 2 }}>
          {P9_RESULT_COPY.explanation}
        </div>
        {identity && (
          <div style={{ fontSize: 11, color: "#625143", marginTop: 6 }}>
            {`Limiting seat: ${identity}`}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span
          style={{
            fontSize: 30,
            fontWeight: 600,
            color: "#4A230F",
            letterSpacing: "0.01em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {`${Number(result.angle).toFixed(1)}°`}
        </span>
        <RP22GradingPill
          level={result.level}
          variant="report"
          style={{ padding: "7px 14px", fontSize: 14, minWidth: 52 }}
        />
      </div>
    </div>
  );
}