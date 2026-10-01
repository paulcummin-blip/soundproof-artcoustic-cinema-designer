/**
 * PerSeatPerformanceRows
 * ----------------------
 * The seating rows of the Visual Report's Per-Seat Performance section.
 *
 * One line of cards per PHYSICAL seating row, seats left to right exactly as
 * they sit in the room, and the rows running front to back. The card width is
 * fixed by the layout authority (see perSeatCardLayout) from the widest row, so
 * every row is one unbroken line however many seats the system has.
 *
 * A reference position that falls BETWEEN two rows is drawn between them, in
 * the place it actually occupies in the plan — it is a position, not a seat, so
 * it never becomes a card and never becomes a Primary seat.
 *
 * Presentation only: every value on a card arrives already published.
 *
 * Props:
 *   layout — from resolveSeatRowLayout (row metrics, card width, tier)
 *   rsp    — the canonical reference position { x, y } in metres, or null
 *   print  — print (PDF) context
 */

import React from "react";
import PerSeatPerformanceCard from "./PerSeatPerformanceCard";
import { CARD_TIERS } from "./perSeatCardLayout";

const FONT_BODY = "Didact Gothic, Century Gothic, sans-serif";

/**
 * Where a free-standing reference position belongs among the rows: 0 in front
 * of the front row, `rows.length` behind the rear row, otherwise the index it
 * falls between. Returns null when there is nothing to place.
 */
export function resolveRspRowIndex(rowYs, rspY) {
  const y = Number(rspY);
  if (!Number.isFinite(y)) return null;
  const ys = (Array.isArray(rowYs) ? rowYs : []).map(Number);
  if (ys.length === 0 || !ys.every(Number.isFinite)) return null;
  if (y <= ys[0]) return 0;
  for (let index = 0; index < ys.length - 1; index += 1) {
    if (y >= ys[index] && y <= ys[index + 1]) return index + 1;
  }
  return ys.length;
}

function RspBetweenRowsMarker({ print, betweenRows }) {
  return (
    <div
      className="per-seat-performance-rsp-marker"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: "100%",
        boxSizing: "border-box",
        padding: print ? "1px 0" : "2px 0",
      }}
    >
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: print ? "1px 5px" : "1px 6px",
        background: "#F1F0EE",
        border: "1px solid #B9AE9F",
        borderRadius: 3,
        fontSize: print ? 7 : 8,
        fontWeight: 700,
        color: "#625143",
        letterSpacing: "0.06em",
      }}>
        RSP
      </span>
      <span style={{
        fontSize: print ? 8 : 10,
        color: "#625143",
        fontFamily: FONT_BODY,
      }}>
        Reference seating position{betweenRows ? " (between the rows)" : ""}
      </span>
    </div>
  );
}

export default function PerSeatPerformanceRows({ layout, rsp, print }) {
  const seatRows = layout?.seatRows || [];
  if (seatRows.length === 0) return null;

  const tier = layout.tier || CARD_TIERS.standard;
  const boundToSeat = seatRows.some((row) => row.seats.some((seat) => seat.isRsp));
  const markerIndex = boundToSeat
    ? null
    : resolveRspRowIndex(seatRows.map((row) => row.y), rsp?.y);
  const markerBetweenRows = markerIndex !== null && markerIndex > 0 && markerIndex < seatRows.length;

  return (
    <div style={{
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: print ? 8 : 14,
    }}>
      {seatRows.map((row, rowIndex) => (
        <React.Fragment key={row.rowIndex}>
          {markerIndex === rowIndex && (
            <RspBetweenRowsMarker print={print} betweenRows={markerBetweenRows} />
          )}
          <div style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: print ? 4 : 6,
            breakInside: "avoid",
            pageBreakInside: "avoid",
          }}>
            {row.label && (
              <span style={{
                fontSize: tier.rowLabelSize,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#8A7B6A",
              }}>
                {row.label}
              </span>
            )}
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "flex-start",
              gap: tier.gap,
              width: "100%",
            }}>
              {row.seats.map((seat) => (
                <PerSeatPerformanceCard key={seat.id} seat={seat} layout={layout} print={print} />
              ))}
            </div>
          </div>
        </React.Fragment>
      ))}
      {markerIndex === seatRows.length && (
        <RspBetweenRowsMarker print={print} betweenRows={false} />
      )}
    </div>
  );
}