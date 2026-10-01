/**
 * P1SeatResultBlock
 * -----------------
 * The assessed, seat-based P1 result for the Visual Report — the half of the
 * page the boundary-zone drawing cannot show.
 *
 * P1 is assessed at every seating position, so the block lays the published
 * per-seat results out in the SAME physical arrangement as the seating plan
 * (one line per row, one pill per assessed seat, each seat's published wall
 * distance beneath it). The drawing above it stays the design view of the
 * boundary zones; this block is the result.
 *
 * Presentation only: every level and distance comes from the published
 * engineering authority via selectClientRecommendedSeatingPosition. Nothing
 * here grades, measures or recomputes.
 *
 * The pill's COLOURS come from the raw published level, while its TEXT uses the
 * report's own wording — so a failure reads "Below L1", exactly as the boundary
 * zone legend beside it is named, never a second name for the same state.
 *
 * Props:
 *   rows  — [{ rowIndex, label, seats: [{ id, levelLabel, pillText, formatted, isPrimary }] }]
 *   print — print (PDF) context
 */

import React from "react";
import ClientSeatResultRows from "./ClientSeatResultRows";

export default function P1SeatResultBlock({ rows, print }) {
  const hasRows = (Array.isArray(rows) ? rows : []).some((row) => row?.seats?.length);
  if (!hasRows) return null;

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
        rows={rows}
        heading="P1 Seat Results"
        valueKey="formatted"
        pillTextKey="pillText"
        print={print}
      />
    </div>
  );
}