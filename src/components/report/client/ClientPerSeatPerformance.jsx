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
 *   rows  — [{ rowIndex, label, seats: [...] }] from selectClientPerSeatPerformance
 *   print — print (PDF) context
 */

import React from "react";
import PerSeatPerformanceCard from "./PerSeatPerformanceCard";

const FONT_HEADING = "Futura PT Light, Century Gothic, sans-serif";
const FONT_BODY = "Didact Gothic, Century Gothic, sans-serif";

const OUTLINE_KEY = [
  { key: "primary", label: "Primary seat", width: 2.5, color: "#213428" },
  { key: "secondary", label: "Secondary seat", width: 1, color: "#D9D5CE" },
];

export default function ClientPerSeatPerformance({ rows, print }) {
  const seatRows = (Array.isArray(rows) ? rows : []).filter((row) => row?.seats?.length);
  if (seatRows.length === 0) return null;

  return (
    <div
      className="per-seat-performance"
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: print ? 8 : 16,
        padding: print ? 0 : "32px 36px",
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

      <div style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: print ? 8 : 14,
      }}>
        {seatRows.map((row) => (
          <div key={row.rowIndex} style={{
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
                fontSize: print ? 8 : 10,
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
              gap: print ? 6 : 10,
              width: "100%",
            }}>
              {row.seats.map((seat) => (
                <PerSeatPerformanceCard key={seat.id} seat={seat} print={print} />
              ))}
            </div>
          </div>
        ))}
      </div>

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