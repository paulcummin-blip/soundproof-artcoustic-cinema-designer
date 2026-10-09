/**
 * TechnicalPerformanceSummary.jsx
 * ------------------------------
 * Technical Report — Page 3: RP22 Performance Summary.
 *
 * This page carries RP22 / RP23 performance only:
 *   - Room parameters: wide low-profile summary card with L4/L3/L2/L1 counts
 *   - Seat parameters: the four RP22 / RP23 design categories, each with its
 *     Primary and Secondary seat-scope floor result as a canonical level pill
 *   - Seat-comparison line and the explanatory technical note at the bottom
 *
 * The Artcoustic System Design Rating is deliberately absent: its scores are
 * not RP22 results, and they belong to the ASDR page (TechnicalAsdrScorecard),
 * which is the only place that proprietary design metric is presented.
 *
 * Presentation-only — does NOT invent any aggregate grade, overall room
 * level, seat grade, average, or score. Counts and floor results are read from
 * the existing canonical analysis engine and floor authority.
 */

import React from "react";
import TechnicalLevelBadge from "./TechnicalLevelBadge";
import AsdrCategorySection from "./AsdrCategorySection";

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
  accent: "#4A230F",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
  label: "#9B8E82",
};

// Display labels for the four RP22 / RP23 design categories (index-aligned to
// the canonical category groups the published engineering summary is built from).
const CATEGORY_DISPLAY = [
  "Spatial Resolution",
  "Dynamic Range",
  "Timbre Matching",
  "Screen / Viewing Geometry",
];

/** A level badge + "× count" pair, used in room and seat summaries. */
function LevelCountBlock({ level, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
      <TechnicalLevelBadge level={level} size="small" />
      <span style={{ fontSize: "10pt", color: COLORS.body, fontFamily: FONT_BODY }}>
        × {count}
      </span>
    </div>
  );
}

export default function TechnicalPerformanceSummary({
  engineeringSummary,
  rspSeatId,
  showDesignRating = false,
}) {
  if (!engineeringSummary) return null;
  const reportCounts = engineeringSummary.project?.reportCounts || {};
  const roomLevelCounts = reportCounts.roomLevelCounts || {};
  const roomCalculatedCount = reportCounts.roomCalculatedCount || 0;
  const totalRoomParameters = reportCounts.roomParameterCount || 0;
  const totalSeatParameters = reportCounts.seatParameterCount || 0;
  const primaryCategories = engineeringSummary.primary?.categories || [];
  const secondaryCategories = engineeringSummary.secondary?.categories || null;

  return (
    <div
      className="tech-summary-page"
      style={{
        background: COLORS.bg,
        minHeight: "268mm",
        padding: "7mm 10mm",
        boxSizing: "border-box",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        fontFamily: FONT_BODY,
        color: COLORS.body,
      }}
    >
      {/* ── Page heading ──
          Marked so the Technical Report's one section-heading rule sets the
          gap below it in the exported PDF as well as on screen. */}
      <div data-report-section-heading="true" style={{ marginBottom: "6mm" }}>
        <div style={reportSectionHeadingStyle("18pt", { color: COLORS.primary })}>
          RP22 PERFORMANCE SUMMARY
        </div>
      </div>

      {/* ── Room parameters card ── */}
      <div
        className="print-avoid-break"
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "6mm 8mm",
          marginBottom: "6mm",
          breakInside: "avoid",
          pageBreakInside: "avoid",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "4mm",
            marginBottom: "5mm",
          }}
        >
          <span style={reportSectionHeadingStyle("12pt", { fontWeight: 600, color: COLORS.primary })}>
            ROOM PARAMETERS
          </span>
          <span
            style={{
              fontSize: "9pt",
              color: COLORS.secondary,
              fontFamily: FONT_BODY,
            }}
          >
            {totalRoomParameters} parameters · {roomCalculatedCount ?? 0} calculated
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "4mm",
          }}
        >
          <LevelCountBlock level="L4" count={roomLevelCounts?.L4 ?? 0} />
          <LevelCountBlock level="L3" count={roomLevelCounts?.L3 ?? 0} />
          <LevelCountBlock level="L2" count={roomLevelCounts?.L2 ?? 0} />
          <LevelCountBlock level="L1" count={roomLevelCounts?.L1 ?? 0} />
          {/* The fifth bucket is the FAILURE count, labelled FAIL — never a dash.
              Same bucket and same colour token the RP22 Compliance Report uses. */}
          <LevelCountBlock level="FAIL" count={roomLevelCounts?.fail ?? 0} />
        </div>

      </div>

      {/* ── Seat parameters ──
          RP22 / RP23 performance at the listening positions: the four design
          categories, each with its Primary and Secondary seat-scope floor
          result. The Artcoustic System Design Rating is not shown on this page
          — its scores belong to the ASDR page. */}
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
            SEAT PARAMETERS
          </span>
          <span style={{ fontSize: "9pt", color: COLORS.secondary, fontFamily: FONT_BODY }}>
            {totalSeatParameters} parameters · {reportCounts.seatCalculatedParamCount || 0} calculated · {reportCounts.seatsEvaluated || 0} seats
          </span>
        </div>

        <div
          className="tech-asdr-categories"
          style={{
            background: COLORS.cardBg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            padding: "5mm 8mm",
          }}
        >
          {CATEGORY_DISPLAY.map((label, i) => (
            <AsdrCategorySection
              key={label}
              label={label}
              primary={primaryCategories[i]}
              secondary={secondaryCategories ? secondaryCategories[i] : null}
            />
          ))}
        </div>
      </div>

      {/* ── Seat comparison summary line ── */}
      {reportCounts.compromisedSeatCount === 0 ? (
        <div style={{ marginTop: "2.5mm", fontSize: "8.5pt", color: COLORS.secondary, fontFamily: FONT_BODY, fontStyle: "italic" }}>
          No listening position shows material compromise across the calculated seat-scope RP22 parameters.
        </div>
      ) : (
        <div style={{ marginTop: "2.5mm", fontSize: "8.5pt", color: COLORS.secondary, fontFamily: FONT_BODY, fontStyle: "italic" }}>
          Some positions show material compromise across multiple calculated seat-scope RP22 parameters.
        </div>
      )}

      {/* ── Explanatory note ── */}
      <div
        style={{
          marginTop: "3mm",
          paddingTop: "3mm",
          borderTop: `1px solid ${COLORS.border}`,
          fontSize: "8.5pt",
          color: COLORS.secondary,
          fontFamily: FONT_BODY,
          lineHeight: 1.5,
          fontStyle: "italic",
        }}
      >
        Room parameters assess system-wide performance. Seat parameters are evaluated
        independently at each listening position.
        <br />
        Seat comparison reflects relative differences between calculated seat-scope RP22 parameters. It is not an RP22 Performance Level.
      </div>

    </div>
  );
}