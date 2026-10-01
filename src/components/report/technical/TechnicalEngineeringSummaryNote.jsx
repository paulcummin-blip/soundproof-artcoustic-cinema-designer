/**
 * TechnicalEngineeringSummaryNote.jsx
 * -----------------------------------
 * Technical Report — the neutral engineering summary statement.
 *
 * The Technical Report documents the finished design: parameter evidence,
 * engineering results, thresholds, and the limitations those results already
 * show by themselves. It gives no post-design change advice. Design changes are
 * proposed, applied and undone in the Bass Optimiser workflow, before the
 * report is generated. This component states that position in one short,
 * factual paragraph, where the former ADI Design Guidance section used to sit.
 *
 * Presentation only: it reads no engineering authority, recalculates nothing,
 * and adds no parameter, score, rating or recommendation.
 *
 * Screen-only. It is not part of the exported PDF — the PDF documents the
 * finished design and carries no workflow note.
 */

import React from "react";
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from "@/components/report/typography/reportTypography";

const COLORS = {
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  border: "#DCDBD6",
};

export default function TechnicalEngineeringSummaryNote() {
  return (
    <div
      className="tech-engineering-summary-note screen-only"
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: "20px 24px",
      }}
    >
      <style>{`
        @media print {
          .tech-engineering-summary-note { display: none !important; }
        }
      `}</style>
      <div
        style={{
          fontFamily: FONT_HEADING,
          fontSize: 16,
          fontWeight: 400,
          color: COLORS.primary,
          marginBottom: 8,
          letterSpacing: "0.01em",
        }}
      >
        ENGINEERING SUMMARY
      </div>
      <div
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          color: COLORS.body,
          fontFamily: FONT_BODY,
          maxWidth: 780,
        }}
      >
        This report documents the selected cinema design against RP22 and RP23
        criteria. Results are shown by parameter, with supporting room, seating,
        loudspeaker and bass-performance data. Design-change recommendations are
        handled in the Bass Optimiser workflow before report generation.
      </div>
    </div>
  );
}