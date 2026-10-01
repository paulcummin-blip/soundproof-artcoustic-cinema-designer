/**
 * P5SeatResultBlock
 * -----------------
 * The assessed, seat-based P5 result for the Visual Report — the half of the
 * page that the RSP-centred drawing cannot show.
 *
 * P5 is assessed at every seating position, so the block lays the published
 * per-seat results out in the SAME physical arrangement as the seating plan
 * (one line per row, one pill per seat, each seat's published angle beneath it).
 * The drawing above it remains the design view from the reference seating
 * position; this block is the assessed result.
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

export default function P5SeatResultBlock({ seatResults, print }) {
  if (!seatResults?.hasAnyValidResult) return null;

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
    </div>
  );
}