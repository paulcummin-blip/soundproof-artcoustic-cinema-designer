/**
 * SeatResultMap
 * -------------
 * Seat-layout result map for seat-scoped parameters.
 *
 * Seat results are laid out in the same physical shape as the seating plan: one
 * band per seating row, seats in the order they occupy in the room (left to
 * right), each seat showing its level pill with its measured value beneath.
 *
 * Replaces the linear "Row 1 - Seat 3 | 2.29m | L4" table: a technician reading
 * the report sees the result where the seat actually is.
 *
 * Priority is expressed as outline weight only — primary seats carry a heavier
 * outline, secondary seats a lighter one. Seat identifiers are not printed in
 * the report view; the reference position (RSP) is stated separately by the
 * parameter card, never as a per-seat suffix.
 *
 * Presentation only: this component never grades, re-measures or re-orders
 * results beyond placing them in their physical row order.
 *
 * Props:
 *   rows           — [{ row, seats: [{ id, level, value, isPrimary, priority }] }]
 *   print          — print (PDF) sizing
 *   showRowLabels  — show the "Row N" label beside each band (default true)
 *   levelVariant   — grading-pill variant ("printCompact" default: this is a
 *                    print surface, so it opts into the print box)
 */

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { normalizeLevelForDisplay } from "@/components/utils/rp22LevelDisplay";
import {
  REPORT_FONT_BODY as BODY_FONT,
} from "@/components/report/typography/reportTypography";

export default function SeatResultMap({
  rows,
  print = false,
  showRowLabels = true,
  levelVariant = "printCompact",
}) {
  const list = Array.isArray(rows) ? rows.filter((row) => row?.seats?.length) : [];
  if (!list.length) return null;

  const labelSize = print ? "8pt" : "11px";
  const valueSize = print ? "7.5pt" : "11px";

  /**
   * One row's seats in the order they occupy the room: left to right by physical
   * x, falling back to their seat column when a position is not published.
   * Ordering is presentation only — no value, level or priority is altered.
   */
  const seatsInRoomOrder = (row) => [...row.seats].sort((a, b) => {
    const ax = Number.isFinite(Number(a?.x)) ? Number(a.x) : Number(a?.indexInRow ?? 0);
    const bx = Number.isFinite(Number(b?.x)) ? Number(b.x) : Number(b?.indexInRow ?? 0);
    return ax - bx;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: print ? 5 : 7 }}>
      {list.map((row) => (
        <div
          key={`seat-map-row-${row.row}`}
          style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
        >
          {showRowLabels && (
            <span
              style={{
                fontSize: labelSize,
                color: "#625143",
                minWidth: 34,
                flexShrink: 0,
                paddingTop: 2,
                fontWeight: 600,
                fontFamily: BODY_FONT,
              }}
            >
              Row {row.row}
            </span>
          )}
          <div style={{ display: "flex", flex: 1, gap: 4 }}>
            {seatsInRoomOrder(row).map((seat, index) => {
              const isPrimary = seat?.isPrimary === true
                || String(seat?.priority || "").toLowerCase() === "primary";
              return (
                <div
                  key={seat?.id || `seat-${row.row}-${index}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <RP22GradingPill
                    level={normalizeLevelForDisplay(seat?.level)}
                    variant={levelVariant}
                    style={{ borderWidth: isPrimary ? 2 : 1 }}
                  />
                  {seat?.value && (
                    <span
                      style={{
                        fontSize: valueSize,
                        color: "#625143",
                        lineHeight: 1.2,
                        textAlign: "center",
                        fontFamily: BODY_FONT,
                      }}
                    >
                      {seat.value}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}