/**
 * AsdrSeatingSummary.jsx
 * ----------------------
 * Overall seating-group summaries for the redesigned ASDR scorecard.
 * Sits BELOW the four category sections as supporting content.
 *
 * Primary / Secondary show: designation, Design Performance Index, modal
 * achieved level, and the level distribution.
 * All Seating shows: designation, Design Performance Index, and a concise
 * supporting sentence (existing getDesignRatingSupportingSentence).
 *
 * Pure presentation — consumes existing designation / index / supporting
 * sentence helpers plus the new unweighted modal helpers. No recalculation.
 */
import React from "react";
import {
  getRoomDesignRatingDesignation,
  getDesignPerformanceIndex,
  getDesignRatingSupportingSentence,
  getModalLevelForContribs,
  formatModalLevels,
  formatLevelDistribution,
} from "./designRatingPresentation";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  primary: "#213428",
  secondary: "#625143",
  muted: "#9B9890",
  border: "#E6E4DD",
};

function isConfigured(rating) {
  return (
    !!rating &&
    rating.status !== "NOT_ASSESSED" &&
    rating.status !== "NOT_CONFIGURED"
  );
}

function SeatingBlock({ label, rating, emphasize, concise }) {
  const configured = isConfigured(rating);
  const designation = configured
    ? getRoomDesignRatingDesignation(rating) || "—"
    : "Not configured";
  const index = configured ? getDesignPerformanceIndex(rating) : null;

  let modalLine = null;
  let distLine = null;
  let supportLine = null;

  if (configured) {
    if (concise) {
      supportLine = getDesignRatingSupportingSentence(rating);
    } else {
      const { modalLevels, distribution, hasFail } = getModalLevelForContribs(
        rating.contributions || []
      );
      const modalText = hasFail
        ? "Parameters FAIL"
        : formatModalLevels(modalLevels)
          ? `Predominantly ${formatModalLevels(modalLevels)}`
          : null;
      if (modalText) modalLine = modalText;
      distLine = formatLevelDistribution(distribution);
    }
  }

  return (
    <div style={{ marginBottom: emphasize ? "4mm" : "3mm" }}>
      <div
        style={{
          fontSize: emphasize ? "9pt" : "8pt",
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontFamily: FONT_BODY,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: emphasize ? "14pt" : "12pt",
          fontWeight: 400,
          color: configured ? COLORS.primary : COLORS.muted,
          fontFamily: FONT_HEADING,
          lineHeight: 1.15,
        }}
      >
        {designation}
        {configured && index != null && (
          <span
            style={{
              fontSize: emphasize ? "9pt" : "8pt",
              fontWeight: 600,
              color: COLORS.secondary,
              fontFamily: FONT_BODY,
              marginLeft: "3mm",
              letterSpacing: "0.03em",
            }}
          >
            · Design Performance Index {index}
          </span>
        )}
      </div>
      {modalLine && (
        <div
          style={{
            fontSize: "9pt",
            fontWeight: 600,
            color: COLORS.primary,
            fontFamily: FONT_BODY,
            marginTop: "1mm",
          }}
        >
          {modalLine}
        </div>
      )}
      {distLine && (
        <div
          style={{
            fontSize: "8pt",
            color: COLORS.secondary,
            fontFamily: FONT_BODY,
            marginTop: "0.5mm",
          }}
        >
          {distLine}
        </div>
      )}
      {supportLine && (
        <div
          style={{
            fontSize: "8.5pt",
            color: COLORS.secondary,
            fontFamily: FONT_BODY,
            marginTop: "1mm",
            lineHeight: 1.4,
          }}
        >
          {supportLine}
        </div>
      )}
    </div>
  );
}

export default function AsdrSeatingSummary({ primary, secondary, all }) {
  return (
    <div
      className="print-avoid-break tech-asdr-seating-summary"
      style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <SeatingBlock label="Primary Seating" rating={primary} emphasize concise={false} />
      {secondary && (
        <SeatingBlock label="Secondary Seating" rating={secondary} emphasize={false} concise={false} />
      )}
      <SeatingBlock label="All Seating" rating={all} emphasize={false} concise />
    </div>
  );
}