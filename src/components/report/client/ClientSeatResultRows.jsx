/**
 * ClientSeatResultRows
 * --------------------
 * Seat-mapped result block for Visual Report pages.
 *
 * The canonical report result statement is a row of seat results in the SAME
 * physical arrangement as the seating plan: one line per seating row, one pill
 * per seat in that row, with the seat's value directly beneath its pill. The
 * client therefore reads the result against the layout they just looked at,
 * never as a linear Seat 1 … Seat N list.
 *
 * Pills are the canonical RP22GradingPill, so the L1–L4 styling is identical to
 * every other result pill in every other report. This component is presentation
 * only — it never grades, sorts or recalculates: it renders rows that were built
 * from already-published seat results.
 *
 * Props:
 *   rows        — [{ rowIndex, label, seats: [{ id, levelLabel, formatted, isPrimary }] }]
 *   heading     — optional block heading (e.g. "RP23 Viewing Result")
 *   valueKey    — seat field shown beneath each pill (default "formatted")
 *   pillTextKey — optional seat field whose text labels the pill. Pill COLOURS
 *                 still come from levelLabel, so a report that names a level in
 *                 its own words (P1's "Below L1") keeps the canonical grading
 *                 treatment while speaking the report's language.
 *   print       — print (PDF) context; screen sizes are slightly reduced
 */

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";

const COLORS = {
  heading: "#213428",
  rowLabel: "#625143",
  value: "#625143",
};

export default function ClientSeatResultRows({
  rows,
  heading,
  valueKey = "formatted",
  pillTextKey,
  print,
}) {
  const filled = (Array.isArray(rows) ? rows : []).filter((row) => row?.seats?.length);
  if (filled.length === 0) return null;

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: print ? 10 : 14,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}
    >
      {heading && (
        <div
          style={{
            fontSize: print ? 12 : 16,
            fontWeight: 600,
            color: COLORS.heading,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            textAlign: "center",
            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
          }}
        >
          {heading}
        </div>
      )}

      {filled.map((row) => (
        <div
          key={row.rowIndex}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: print ? 4 : 6,
          }}
        >
          <div
            style={{
              fontSize: print ? 9.5 : 11,
              fontWeight: 600,
              color: COLORS.rowLabel,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {row.label}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: print ? 10 : 16,
            }}
          >
            {row.seats.map((seat) => (
              <div
                key={seat.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <RP22GradingPill
                  level={seat.levelLabel}
                  variant="report"
                  style={{
                    padding: print ? "5px 12px" : "7px 14px",
                    fontSize: print ? 11.5 : 14,
                    minWidth: print ? 46 : 52,
                    fontWeight: seat.isPrimary ? 700 : 600,
                  }}
                >
                  {pillTextKey ? seat[pillTextKey] || undefined : undefined}
                </RP22GradingPill>
                <span
                  style={{
                    fontSize: print ? 9.5 : 11,
                    color: COLORS.value,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {seat[valueKey] ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}