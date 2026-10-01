/**
 * PerSeatPerformanceCard
 * ----------------------
 * One compact seat card for the Visual Report's Per-Seat Performance section:
 * the seat's identity in the seating plan, its priority, and its published
 * RP22 / RP23 levels as pills with the metric value beside each one.
 *
 * The report version of the Room Designer seat pop-up — same authority, same
 * presenters — laid out far more tightly because many cards sit side by side.
 *
 * Presentation only: every level and value arrives already published. Nothing
 * here grades, measures or recomputes.
 *
 * Seat PRIORITY drives the outline: a Primary seat carries a heavy outline, a
 * Secondary seat a light one. The reference seating position is marked with its
 * own RSP chip and is never presented as a Primary seat.
 *
 * Props:
 *   seat  — { label, priority, isRsp, rp23, parameters, spl } from
 *           selectClientPerSeatPerformance
 *   print — print (PDF) context: tighter type and outline
 */

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { PRIMARY } from "@/components/utils/seatPriorityAuthority";

const FONT_BODY = "Didact Gothic, Century Gothic, sans-serif";

// Outline weights: Primary heavy, Secondary light. Identical on screen and in
// the PDF, so a printed card cannot change what the seat's priority looks like.
const OUTLINE = {
  primary: { screen: 2.5, print: 2 },
  secondary: { screen: 1, print: 0.8 },
};
const OUTLINE_COLOR = { primary: "#213428", secondary: "#D9D5CE" };

const PRIORITY_LABEL = { primary: "Primary", secondary: "Secondary" };

function Badge({ text, tone, print }) {
  const style = tone === "primary"
    ? { background: "#213428", color: "#FFFFFF", border: "1px solid #213428" }
    : tone === "rsp"
    ? { background: "#F1F0EE", color: "#625143", border: "1px solid #B9AE9F" }
    : { background: "#FFFFFF", color: "#625143", border: "1px solid #D9D5CE" };
  return (
    <span style={{
      ...style,
      borderRadius: 3,
      padding: print ? "1px 4px" : "1px 5px",
      fontSize: print ? 7 : 8,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      lineHeight: 1.4,
      whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  );
}

export default function PerSeatPerformanceCard({ seat, print }) {
  if (!seat) return null;

  const outline = OUTLINE[seat.priority] || OUTLINE.secondary;
  const width = print ? 132 : 148;

  const rows = [
    { key: "rp23", label: "RP23", ...seat.rp23 },
    ...(seat.parameters || []),
  ];

  return (
    <div
      className="per-seat-performance-card"
      style={{
        width,
        maxWidth: "100%",
        boxSizing: "border-box",
        border: `${print ? outline.print : outline.screen}px solid ${OUTLINE_COLOR[seat.priority] || OUTLINE_COLOR.secondary}`,
        borderRadius: 8,
        background: "#FFFFFF",
        padding: print ? "6px 7px 7px" : "8px 9px 9px",
        display: "flex",
        flexDirection: "column",
        gap: print ? 3 : 4,
        breakInside: "avoid",
        pageBreakInside: "avoid",
        fontFamily: FONT_BODY,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{
          fontSize: print ? 8.5 : 9.5,
          fontWeight: 700,
          color: "#213428",
          letterSpacing: "0.02em",
          lineHeight: 1.25,
        }}>
          {seat.label}
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <Badge text={PRIORITY_LABEL[seat.priority] || "Secondary"} tone={seat.priority} print={print} />
          {seat.isRsp && <Badge text="RSP" tone="rsp" print={print} />}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: print ? 1 : 2 }}>
        {rows.map((row) => (
          <div key={row.key} style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            minHeight: print ? 13 : 15,
          }}>
            <span style={{
              width: print ? 26 : 30,
              flexShrink: 0,
              fontSize: print ? 8 : 9,
              fontWeight: 600,
              color: "#3E4349",
              letterSpacing: "0.02em",
            }}>
              {row.label}
            </span>
            <RP22GradingPill level={row.level} variant="compact" />
            <span style={{
              marginLeft: "auto",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: print ? 7.5 : 8.5,
              color: "#8A7B6A",
              letterSpacing: "0.01em",
            }}>
              {row.valueText && row.valueText !== "—" ? row.valueText : ""}
            </span>
          </div>
        ))}
      </div>

      {(seat.spl || []).length > 0 && (
        <div style={{
          borderTop: "1px solid #EFEEE9",
          paddingTop: print ? 3 : 4,
          display: "flex",
          flexWrap: "wrap",
          columnGap: 6,
          rowGap: 2,
        }}>
          {(seat.spl || []).map((entry) => (
            <span key={entry.role} style={{
              fontSize: print ? 7.5 : 8.5,
              color: "#625143",
              whiteSpace: "nowrap",
            }}>
              {entry.role} {entry.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}