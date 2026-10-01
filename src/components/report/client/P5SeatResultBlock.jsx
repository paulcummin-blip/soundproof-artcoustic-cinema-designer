/**
 * P5SeatResultBlock
 * -----------------
 * The assessed, seat-based P5 result for the Visual Report — the half of the
 * page that the RSP-centred drawing cannot show.
 *
 * P5 is assessed at every seating position, so the block lays the published
 * per-seat results out in the SAME physical arrangement as the seating plan
 * (one line per row, one pill per seat) and names the limiting seat and its
 * angle. The drawing above it remains the design view from the reference
 * seating position; this block is the assessed result.
 *
 * Presentation only: every level, angle and count comes from the published
 * engineering authority via selectClientP5SeatResults. Nothing here grades,
 * measures or recomputes.
 *
 * Props:
 *   seatResults — output of selectClientP5SeatResults()
 *   print       — print (PDF) context
 */

import React from "react";
import ClientSeatResultRows from "./ClientSeatResultRows";

const COLORS = {
  limiting: "#213428",
  limitingLabel: "#625143",
};

export default function P5SeatResultBlock({ seatResults, print }) {
  if (!seatResults?.hasAnyValidResult) return null;

  const limiting = seatResults.limitingSeat;

  // "Front row, seat 3 of 4" — the seat's place in its own physical row.
  const limitingSeatLabel = limiting
    ? [
        limiting.rowLabel,
        limiting.positionInRow && limiting.rowSize
          ? `seat ${limiting.positionInRow} of ${limiting.rowSize}`
          : null,
      ].filter(Boolean).join(", ")
    : null;

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: print ? 12 : 18,
        padding: print ? "0 8px" : "4px 0 0 0",
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}
    >
      <ClientSeatResultRows
        rows={seatResults.rows}
        heading="P5 Seat Results"
        valueKey="formatted"
        print={print}
      />

      {limiting && (
        <div
          style={{
            width: "100%",
            maxWidth: print ? "100%" : 600,
            padding: print ? "10px 14px" : "14px 18px",
            background: "#F1F0EE",
            borderRadius: 12,
            border: "1px solid #DCDBD6",
            display: "flex",
            flexDirection: "column",
            gap: print ? 4 : 6,
          }}
        >
          <div style={{ fontSize: print ? 12 : 14, color: COLORS.limiting, fontWeight: 600 }}>
            Limiting seat — {limitingSeatLabel}
          </div>
          <div style={{ fontSize: print ? 11 : 13, color: COLORS.limitingLabel, lineHeight: 1.5 }}>
            Limiting angle — {limiting.formatted} maximum spacing between adjacent surround
            speakers.
          </div>
        </div>
      )}
    </div>
  );
}