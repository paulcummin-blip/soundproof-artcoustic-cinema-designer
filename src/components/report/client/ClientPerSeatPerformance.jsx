/**
 * ClientPerSeatPerformance
 * ------------------------
 * Visual Report section — Per-Seat Performance.
 *
 * Lays one compact card per assessed seat in the SAME physical arrangement as
 * the seating plan: one line per seating row, seats left-to-right across the
 * screen, exactly as the seats sit in the room. The room plan shows where the
 * seats are; this section shows how each one performs.
 *
 * The cards SCALE with the system. The card width comes from the widest
 * seating row (see perSeatCardLayout), so a 4-seat cinema gets large cards, a
 * 9-seat cinema smaller ones and a 12-seat cinema smaller again — while every
 * row stays one unbroken line in the plan's own shape, never a numbered list.
 * The section deliberately sits closer to the page edges than a text page so
 * the cards can use the width they need.
 *
 * Every level and value is read from the published engineering authority via
 * selectClientPerSeatPerformance. Nothing is graded, measured or recomputed, and
 * P19 is absent by construction — it is assessed at the reference seating
 * position only.
 *
 * On screen the section carries its own heading. In print the page supplies the
 * document heading (see PrintPerSeatPerformanceContent), so only the rows and
 * the key are re-drawn here.
 *
 * Props:
 *   rows        — [{ rowIndex, label, y, seats: [...] }] from selectClientPerSeatPerformance
 *   rsp         — the canonical reference position, for a marker between rows
 *   print       — print (PDF) context
 *   continuation — this is the on-screen page for the printed section's
 *                 continuation: the rows themselves are on that printed page
 */

import React, { useMemo } from "react";
import PerSeatPerformanceRows from "./PerSeatPerformanceRows";
import { resolveSeatRowLayout } from "./perSeatCardLayout";

const FONT_HEADING = "Futura PT Light, Century Gothic, sans-serif";
const FONT_BODY = "Didact Gothic, Century Gothic, sans-serif";

const OUTLINE_KEY = [
  { key: "primary", label: "Primary seat", width: 2.5, color: "#213428" },
  { key: "secondary", label: "Secondary seat", width: 1, color: "#D9D5CE" },
];

export default function ClientPerSeatPerformance({ rows, rsp, print, continuation = false }) {
  const layout = useMemo(() => resolveSeatRowLayout(rows), [rows]);
  if (!continuation && layout.seatRows.length === 0) return null;

  return (
    <div
      className="per-seat-performance"
      style={{
        width: "100%",
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: print ? 8 : 16,
        // Narrower side padding than a text page: the cards are the content, so
        // they get the full width rather than a comfortable reading measure.
        padding: print ? 0 : "26px 14px",
        background: print ? "transparent" : "#FFFFFF",
        borderRadius: print ? 0 : 16,
        border: print ? "none" : "1px solid #DCDBD6",
        boxShadow: print ? "none" : "0 2px 12px rgba(0,0,0,0.06)",
        boxSizing: "border-box",
        fontFamily: FONT_BODY,
      }}
    >
      {!print && (
        <div style={{ width: "100%" }}>
          <h2 style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 300,
            color: "#213428",
            letterSpacing: "0.01em",
            fontFamily: FONT_HEADING,
            textAlign: "center",
          }}>
            Per-Seat Performance
          </h2>
          <p style={{
            margin: "8px 0 0 0",
            fontSize: 13,
            color: "#625143",
            textAlign: "center",
            fontFamily: FONT_BODY,
          }}>
            RP22 and RP23 results by seating position
          </p>
        </div>
      )}

      {continuation ? (
        <p style={{
          margin: 0,
          fontSize: 12,
          color: "#8A7B6A",
          textAlign: "center",
          maxWidth: 620,
          lineHeight: 1.5,
        }}>
          The seating rows continue on this page in the printed report, in the
          same row-by-row layout.
        </p>
      ) : (
        <PerSeatPerformanceRows layout={layout} rsp={rsp} print={print} />
      )}

      {/* Key — the outline carries the seat's priority; the reference position
          is a separate marker, never a third kind of seat. */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: print ? 10 : 16,
        maxWidth: "100%",
      }}>
        {OUTLINE_KEY.map((entry) => (
          <div key={entry.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              display: "inline-block",
              width: 14,
              height: 10,
              borderWidth: print ? Math.max(1, entry.width - 0.5) : entry.width,
              borderStyle: "solid",
              borderColor: entry.color,
              borderRadius: 3,
              boxSizing: "border-box",
            }} />
            <span style={{ fontSize: print ? 8 : 10, color: "#3E4349" }}>{entry.label}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 10,
            background: "#F1F0EE",
            border: "1px solid #B9AE9F",
            borderRadius: 3,
            fontSize: print ? 6 : 7,
            fontWeight: 700,
            color: "#625143",
            letterSpacing: "0.06em",
          }}>
            RSP
          </span>
          <span style={{ fontSize: print ? 8 : 10, color: "#3E4349" }}>Reference position</span>
        </div>
      </div>

      <p style={{
        margin: 0,
        fontSize: print ? 8 : 10,
        color: "#8A7B6A",
        textAlign: "center",
        maxWidth: 620,
        lineHeight: 1.5,
      }}>
        Primary seats are shown with a heavier outline. Results are read at each
        seating position; the reference seating position is marked separately.
      </p>
    </div>
  );
}