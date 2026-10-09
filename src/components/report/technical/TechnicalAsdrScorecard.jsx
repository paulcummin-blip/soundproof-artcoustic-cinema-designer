/**
 * TechnicalAsdrScorecard.jsx
 * ---------------------------
 * Technical Report — the Artcoustic System Design Rating page.
 *
 * This page carries the proprietary ASDR only:
 *   - the three scoped scores, Primary / Secondary / All Seating, each stated
 *     as its Design Performance Index
 *   - the per-seat ASDR score grid (AsdrSeatScoreGrid)
 *   - the proprietary-rating explanation at the foot of the page
 *
 * RP22 / RP23 results are deliberately absent. The four category floor results
 * are RP22 / RP23 performance and belong to the RP22 Performance Summary page
 * (TechnicalPerformanceSummary): this page answers "how strong is the design
 * according to the ASDR", that page answers "how does this cinema perform
 * against RP22 / RP23". Neither page repeats the other's content.
 *
 * Presentation-only: consumes the canonical `roomDesignRating` and the
 * published `engineeringSummary`. Does NOT recalculate any points, weights,
 * levels, indices or category membership, and adds no report-only scoring.
 */

import React from "react";
import AsdrSeatingSummary from "./AsdrSeatingSummary";
import AsdrSeatScoreGrid from "./AsdrSeatScoreGrid";

import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
  reportSectionHeadingStyle,
} from '@/components/report/typography/reportTypography';

const COLORS = {
  bg: "#F1F0EE",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
};

export default function TechnicalAsdrScorecard({
  roomDesignRating,
  showDesignRating = false,
  engineeringSummary = null,
  rspSeatId = null,
}) {
  if (!showDesignRating || !roomDesignRating || !engineeringSummary) {
    return null;
  }

  // Direct read only. The scoped design performance indices and the per-seat
  // ratings were calculated once inside summariseEngineeringResults().
  const primarySummary = engineeringSummary.primary;
  const secondarySummary = engineeringSummary.secondary;
  const projectSummary = engineeringSummary.project;
  const reportCounts = projectSummary?.reportCounts || {};
  const seatCountsByRow = reportCounts.seatCountsByRow || [];
  const seatDesignRatings = engineeringSummary.designRating?.seatDesignRatings || {};
  const seatDesignPerformanceIndexById =
    engineeringSummary.designRating?.seatDesignPerformanceIndexById || {};

  return (
    <div
      className="tech-asdr-scorecard"
      style={{
        background: COLORS.bg,
        padding: "8mm 10mm 5mm 10mm",
        boxSizing: "border-box",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        fontFamily: FONT_BODY,
        color: COLORS.body,
      }}
    >
      {/* ── Page heading ── */}
      <div
        className="tech-asdr-scorecard-heading"
        data-report-section-heading="true"
        style={{ marginBottom: "5mm" }}
      >
        <div style={reportSectionHeadingStyle("18pt", { color: COLORS.primary })}>
          ARTCOUSTIC SYSTEM DESIGN RATING
        </div>
        <div
          style={{
            fontSize: "9pt",
            color: COLORS.secondary,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: FONT_BODY,
            marginTop: "1mm",
          }}
        >
          DESIGN SCORECARD
        </div>
      </div>

      {/* ── The three scoped ASDR scores — the page's lead content ── */}
      <div
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "6mm 8mm",
          breakInside: "avoid",
          pageBreakInside: "avoid",
        }}
      >
        <AsdrSeatingSummary
          primary={primarySummary}
          secondary={secondarySummary}
          all={projectSummary}
        />
      </div>

      {/* ── Divider ── */}
      <div
        style={{
          borderTop: `2px solid ${COLORS.borderStrong}`,
          margin: "5mm 0 4mm 0",
        }}
      />

      {/* ── Per-seat ASDR scores ──
          ONE heading names what every seat card states, so no card repeats the
          rating label, an active count or explanatory copy. */}
      <div className="print-avoid-break">
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "4mm",
            marginBottom: "3.5mm",
          }}
        >
          <span style={reportSectionHeadingStyle("12pt", { fontWeight: 600, color: COLORS.primary })}>
            ARTCOUSTIC SYSTEM DESIGN RATING BY SEAT
          </span>
          <span style={{ fontSize: "9pt", color: COLORS.secondary, fontFamily: FONT_BODY }}>
            {reportCounts.seatParameterCount || 0} parameters · {reportCounts.seatCalculatedParamCount || 0} calculated · {reportCounts.seatsEvaluated || 0} seats
          </span>
        </div>

        <AsdrSeatScoreGrid
          seatCountsByRow={seatCountsByRow}
          rspSeatId={rspSeatId}
          seatDesignRatings={seatDesignRatings}
          seatDesignPerformanceIndexById={seatDesignPerformanceIndexById}
        />
      </div>

      {/* ── Proprietary-rating explanation ── */}
      <div
        style={{
          marginTop: "3mm",
          fontSize: "8pt",
          color: COLORS.secondary,
          fontFamily: FONT_BODY,
          lineHeight: 1.5,
          fontStyle: "italic",
          breakInside: "avoid",
          pageBreakInside: "avoid",
        }}
      >
        The Artcoustic System Design Rating is a Sound Proof proprietary design metric, used as an
        internal design diagnostic for relative design comparison. It combines the achieved
        performance of the active design parameters with their relative importance, and it is not a
        CEDIA RP22 or RP23 Performance Level.
      </div>
    </div>
  );
}