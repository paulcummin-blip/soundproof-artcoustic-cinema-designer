/**
 * TechnicalSeatGrid.jsx
 * ----------------------
 * Compact per-seat level grid for seat-scope parameters in the Technical Report.
 *
 * Renders a grid with:
 *   - Row labels on the left
 *   - Seat number above each badge
 *   - Rectangular level badge per seat
 *   - Measured value beneath each badge (where available)
 *
 * Replaces the old loose "L4 L4 L1 L1" text with a structured grid
 * consistent with the Visual Report listening-area pages.
 */

import React from "react";
import TechnicalLevelBadge from "./TechnicalLevelBadge";

export default function TechnicalSeatGrid({ data }) {
  if (!data || !data.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {data.map((row) => {
        const seats = row.seats || [];
        if (!seats.length) return null;
        return (
          <div
            key={`row-${row.row}`}
            style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
          >
            {/* Row label */}
            <span
              style={{
                fontSize: "8pt",
                color: "#625143",
                minWidth: 28,
                flexShrink: 0,
                paddingTop: 2,
                fontWeight: 600,
                fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
              }}
            >
              Row {row.row}
            </span>

            {/* Seat cells — distributed evenly across available width */}
            <div
              style={{
                display: "flex",
                gap: 4,
                flex: 1,
              }}
            >
              {seats.map((seat) => (
                <div
                  key={seat.id || `seat-${row.row}-${seat.indexInRow}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 1.5,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: "8pt",
                      color: "#9B8E82",
                      lineHeight: 1,
                      fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
                    }}
                  >
                    S{seat.indexInRow ?? "?"}
                  </span>
                  <TechnicalLevelBadge level={seat.level} size="small" />
                  {seat.value && seat.value !== "—" && seat.value !== "N/A" && (
                    <span
                      style={{
                        fontSize: "7.5pt",
                        color: "#625143",
                        lineHeight: 1.2,
                        fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
                        whiteSpace: "normal",
                        textAlign: "center",
                      }}
                    >
                      {seat.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}