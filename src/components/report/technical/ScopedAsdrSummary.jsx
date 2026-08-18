/**
 * ScopedAsdrSummary.jsx
 * ---------------------
 * Shared presentation of the three scoped ASDR results
 * (Primary, Secondary, All).
 *
 * Pure presentation — consumes scopedRatings produced by
 * calculateScopedRoomDesignRating (Stage B authority). No recalculation,
 * no percentages, no "out of" scores, no report-only scoring.
 *
 * Used by:
 *   - TechnicalPerformanceSummary (print, Page 3 room-scope ASDR block)
 *   - TechnicalAsdrScorecard (print, Page 3b overall result card)
 *   - RP22Report screen-only layout (interactive ASDR header)
 */

import React from "react";
import {
  getRoomDesignRatingDesignation,
  getDesignPerformanceIndex,
} from "./designRatingPresentation";

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
function ScopeLine({ label, rating, emphasize }) {
  const isConfigured =
    rating &&
    rating.status !== "NOT_ASSESSED" &&
    rating.status !== "NOT_CONFIGURED";
  const designation = isConfigured
    ? getRoomDesignRatingDesignation(rating) || "—"
    : "Not configured";
  const index = isConfigured ? getDesignPerformanceIndex(rating) : null;

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
          fontSize: emphasize ? "14pt" : "11pt",
          fontWeight: 400,
          color: isConfigured ? COLORS.primary : COLORS.muted,
          fontFamily: FONT_HEADING,
          lineHeight: 1.15,
        }}
      >
        {designation}
        {isConfigured && index != null && (
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
    </div>
  );
}

export default function ScopedAsdrSummary({ scopedRatings }) {
  if (!scopedRatings) return null;
  const { primary, secondary, all } = scopedRatings;
  return (
    <div>
      <ScopeLine label="Primary Seating" rating={primary} emphasize />
      <ScopeLine label="Secondary Seating" rating={secondary} />
      <ScopeLine label="All Seating" rating={all} />
    </div>
  );
}