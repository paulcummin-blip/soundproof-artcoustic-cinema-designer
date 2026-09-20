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

function SeatingBlock({ label, summary, emphasize, concise }) {
  const configured = isConfigured(summary?.rating);
  const index = configured ? (summary?.designPerformanceIndex ?? null) : null;
  const supportLine = configured && concise ? (summary?.supportingSentence ?? null) : null;

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
          fontSize: emphasize ? "9pt" : "8pt",
          fontWeight: 600,
          color: COLORS.secondary,
          fontFamily: FONT_BODY,
          marginTop: "1mm",
          letterSpacing: "0.03em",
        }}
      >
        Design Performance Index
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
        {configured ? (index ?? "—") : "Not configured"}
      </div>
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
      <SeatingBlock label="Primary Seating" summary={primary} emphasize concise={false} />
      {secondary?.rating && (
        <SeatingBlock label="Secondary Seating" summary={secondary} emphasize={false} concise={false} />
      )}
      <SeatingBlock label="All Seating" summary={all} emphasize={false} concise />
    </div>
  );
}