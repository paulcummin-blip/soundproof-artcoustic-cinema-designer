/**
 * TechnicalAsdrScorecard.jsx
 * ---------------------------
 * Technical Report — ASDR Scorecard (redesigned).
 *
 * Hierarchy reversed: the FOUR DESIGN CATEGORIES lead the card (Spatial
 * Resolution, Dynamic Range, Timbre Matching, Viewing Geometry), each with
 * a headline result and Primary / Secondary subrows. The overall seating
 * summaries (Primary / Secondary / All with Design Performance Index) sit
 * beneath as supporting content.
 *
 * Presentation-only: consumes the canonical `roomDesignRating` and
 * `scopedRatings` from calculateRoomDesignRating / calculateScopedRoomDesignRating.
 * Does NOT recalculate any points, weights, levels, or category membership.
 * The modal achieved level is an unweighted "most often achieved" count
 * (getModalLevelForContribs) — not an ASDR-weighted aggregation.
 */

import React from "react";
import AsdrCategorySection from "./AsdrCategorySection";
import AsdrSeatingSummary from "./AsdrSeatingSummary";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  bg: "#F1F0EE",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
};

// Display labels for the four categories (index-aligned to CATEGORY_GROUPS).
const CATEGORY_DISPLAY = [
  "Spatial Resolution",
  "Dynamic Range",
  "Timbre Matching",
  "Screen / Viewing Geometry",
];

export default function TechnicalAsdrScorecard({
  roomDesignRating,
  showDesignRating = false,
  engineeringSummary = null,
}) {
  if (!showDesignRating || !roomDesignRating || !engineeringSummary) {
    return null;
  }

  // Direct read only. Category floors and scoped DPIs were calculated once
  // inside summariseEngineeringResults().
  const primarySummary = engineeringSummary.primary;
  const secondarySummary = engineeringSummary.secondary;
  const projectSummary = engineeringSummary.project;
  const primaryCats = primarySummary?.categories || [];
  const secondaryCats = secondarySummary?.categories || null;

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
      <div className="tech-asdr-scorecard-heading" style={{ marginBottom: "5mm" }}>
        <div
          style={{
            fontFamily: FONT_HEADING,
            fontSize: "18pt",
            fontWeight: 400,
            color: COLORS.primary,
            letterSpacing: "0.01em",
            lineHeight: 1.1,
          }}
        >
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

      {/* ── Four design categories — lead content ── */}
      <div
        className="tech-asdr-categories"
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "6mm 8mm",
          marginBottom: "4mm",
        }}
      >
        {CATEGORY_DISPLAY.map((label, i) => (
          <AsdrCategorySection
            key={label}
            label={label}
            primary={primaryCats[i]}
            secondary={secondaryCats ? secondaryCats[i] : null}
          />
        ))}
      </div>

      {/* ── Divider ── */}
      <div
        style={{
          borderTop: `2px solid ${COLORS.borderStrong}`,
          margin: "4mm 0 3mm 0",
        }}
      />

      {/* ── Overall seating summaries (supporting) ── */}
      <AsdrSeatingSummary
        primary={primarySummary}
        secondary={secondarySummary}
        all={projectSummary}
      />

      {/* ── Client language note (proprietary disclaimer) ── */}
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
        The Artcoustic System Design Rating is a proprietary Sound Proof design metric.
        It combines the achieved performance of the active design parameters with their
        relative importance. It is not a CEDIA RP22 or RP23 Performance Level.
      </div>
    </div>
  );
}