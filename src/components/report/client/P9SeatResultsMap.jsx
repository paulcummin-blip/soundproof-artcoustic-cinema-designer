/**
 * P9SeatResultsMap
 * ----------------
 * "P9 results by seat": every seating position with its OWN published P9 result
 * — the limiting adjacent-row angle and its canonical level — laid out in the
 * same physical row arrangement as the seating plan (one line per row, seats
 * left to right), so the client reads each result against the layout.
 *
 * P9 is seat-scoped, so this block is the authority the drawing explains. It is
 * never reduced to row summaries: every seat keeps its own angle and level.
 *
 * Props:
 *   rows  — from buildP9SeatScope() (p9SeatScopeAuthority)
 *   print — print (PDF) context
 */

import React from "react";
import P9SeatResultTile from "./P9SeatResultTile";

const FONT_BODY = "Didact Gothic, Century Gothic, sans-serif";

export default function P9SeatResultsMap({ rows, print }) {
  const filled = (Array.isArray(rows) ? rows : []).filter((row) => row?.seats?.length);
  if (filled.length === 0) return null;

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: print ? 12 : 18,
        fontFamily: FONT_BODY,
      }}
    >
      {filled.map((row) => (
        <div
          key={row.rowIndex}
          data-p9-row={row.label}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: print ? 6 : 8,
          }}
        >
          <div
            style={{
              fontSize: print ? 9.5 : 11,
              fontWeight: 600,
              color: "#625143",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {`${row.label} · ${row.seatCount} seat${row.seatCount === 1 ? "" : "s"}`}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: print ? 8 : 12,
            }}
          >
            {row.seats.map((seat) => (
              <P9SeatResultTile key={seat.id} seat={seat} print={print} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}