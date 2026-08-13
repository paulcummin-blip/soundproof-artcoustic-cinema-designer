/**
 * Rp22SeatCoverageSentence
 * ------------------------
 * Presentational component for the shared RP22 seating-coverage summary
 * sentence. Renders the sentence produced by buildRp22SeatCoverageSentence.
 *
 * Used by both the Technical Report and the Visual Report to ensure
 * identical wording and styling for the same project.
 *
 * Visually secondary to the main project title/result but clearly readable.
 */

import React from "react";

const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function Rp22SeatCoverageSentence({
  sentence,
  variant = "screen",
}) {
  if (!sentence) return null;

  const style =
    variant === "print"
      ? {
          fontSize: "9pt",
          color: "#3E4349",
          fontFamily: FONT_BODY,
          lineHeight: 1.5,
          marginTop: "3mm",
          marginBottom: "4mm",
          padding: "2.5mm 3.5mm",
          background: "#F8F8F7",
          borderRadius: "1.5mm",
          border: "0.5pt solid #E6E4DD",
        }
      : {
          fontSize: 13,
          color: "#3E4349",
          fontFamily: FONT_BODY,
          lineHeight: 1.5,
          marginTop: 12,
          marginBottom: 4,
          padding: "10px 14px",
          background: "#F8F8F7",
          borderRadius: 8,
          border: "1px solid #E6E4DD",
        };

  return (
    <div style={style} className="rp22-seat-coverage-sentence">
      {sentence}
    </div>
  );
}