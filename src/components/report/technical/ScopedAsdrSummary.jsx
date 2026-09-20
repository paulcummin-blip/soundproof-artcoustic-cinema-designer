/**
 * ScopedAsdrSummary.jsx
 * ---------------------
 * Shared presentation of the three scoped ASDR results
 * (Primary, Secondary, All).
 *
 * Pure presentation — consumes the published engineering summary.
 * No recalculation,
 * no percentages, no "out of" scores, no report-only scoring.
 *
 * Used by:
 *   - TechnicalPerformanceSummary (print, Page 3 room-scope ASDR block)
 *   - TechnicalAsdrScorecard (print, Page 3b overall result card)
 *   - RP22Report screen-only layout (interactive ASDR header)
 */

import React from "react";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  primary: "#213428",
  secondary: "#625143",
  muted: "#9B9890",
};

/**
 * One scoped rating line: label, designation, Design Performance Index.
 * NOT_CONFIGURED scopes show "Not configured" with no index.
 */
function ScopeLine({ label, summary, emphasize }) {
  const rating = summary?.rating;
  const isConfigured =
    rating &&
    rating.status !== "NOT_ASSESSED" &&
    rating.status !== "NOT_CONFIGURED";
  const index = isConfigured ? (summary?.designPerformanceIndex ?? null) : null;

  return (
    <div style={{ marginBottom: emphasize ? "3mm" : "2.5mm" }}>
      <div
        style={{
          fontSize: emphasize ? "8pt" : "7.5pt",
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
          fontSize: emphasize ? "14pt" : "11pt",
          fontWeight: 400,
          color: isConfigured ? COLORS.primary : COLORS.muted,
          fontFamily: FONT_HEADING,
          lineHeight: 1.15,
        }}
      >
        {isConfigured ? (index ?? "—") : "Not configured"}
      </div>
    </div>
  );
}

export default function ScopedAsdrSummary({ engineeringSummary }) {
  if (!engineeringSummary) return null;
  return (
    <div>
      <ScopeLine label="Primary Seating" summary={engineeringSummary.primary} emphasize />
      <ScopeLine label="Secondary Seating" summary={engineeringSummary.secondary} />
      <ScopeLine label="All Seating" summary={engineeringSummary.project} />
    </div>
  );
}