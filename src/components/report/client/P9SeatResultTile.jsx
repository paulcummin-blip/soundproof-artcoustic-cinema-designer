/**
 * P9SeatResultTile
 * ----------------
 * One seat in the P9 result map: the seat's identity, its own published
 * limiting adjacent-row angle, and its canonical RP22 level pill.
 *
 * The outline carries SEAT PRIORITY only (Primary heavier, Secondary lighter),
 * using the same weights and tones as the report's per-seat performance cards,
 * so priority reads identically wherever it appears. The level pill is the
 * canonical RP22GradingPill, so L1–L4 styling is identical to every other result
 * pill in every other report.
 *
 * Presentation only: angle and level arrive already published; nothing here
 * grades or measures.
 *
 * Props:
 *   seat  — { id, label, angle, level, priority, assessed } from buildP9SeatScope
 *   print — print (PDF) context
 */

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";

const FONT_BODY = "Didact Gothic, Century Gothic, sans-serif";

const OUTLINE = {
  primary: { screen: 2.5, print: 2 },
  secondary: { screen: 1, print: 0.8 },
};
const OUTLINE_COLOR = { primary: "#213428", secondary: "#D9D5CE" };
const PRIORITY_LABEL = { primary: "Primary", secondary: "Secondary" };

export default function P9SeatResultTile({ seat, print }) {
  if (!seat) return null;

  const priority = seat.priority === "primary" ? "primary" : "secondary";
  const outline = OUTLINE[priority];

  return (
    <div
      data-p9-seat={seat.id}
      data-p9-priority={priority}
      style={{
        border: `${print ? outline.print : outline.screen}px solid ${OUTLINE_COLOR[priority]}`,
        borderRadius: 8,
        background: "#FFFFFF",
        padding: print ? "6px 10px" : "8px 12px",
        minWidth: print ? 72 : 86,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        fontFamily: FONT_BODY,
      }}
    >
      <span
        style={{
          fontSize: print ? 8.5 : 10,
          color: "#3E4349",
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
        }}
      >
        {seat.label}
      </span>
      <span
        style={{
          fontSize: print ? 13 : 16,
          fontWeight: 600,
          color: "#1B1A1A",
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}
      >
        {seat.assessed ? `${Number(seat.angle).toFixed(1)}°` : "—"}
      </span>
      <RP22GradingPill
        level={seat.assessed ? seat.level : null}
        variant="report"
        style={{
          padding: print ? "4px 10px" : "5px 12px",
          fontSize: print ? 11 : 13,
          minWidth: print ? 42 : 48,
        }}
      />
      <span
        style={{
          fontSize: print ? 7.5 : 8.5,
          color: "#625143",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {PRIORITY_LABEL[priority]}
      </span>
    </div>
  );
}