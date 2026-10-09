/**
 * AsdrSeatScoreGrid.jsx
 * ---------------------
 * The per-seat Artcoustic System Design Rating grid: one row per seating row,
 * one compact card per seat carrying the seat's identity and its ASDR score.
 *
 * Used by the Technical Report's ASDR page (TechnicalAsdrScorecard). It carries
 * the proprietary design metric only — no RP22 / RP23 level, count or category
 * floor appears here.
 *
 * Pure presentation — reads the canonical per-seat ratings and indices out of
 * the published engineering summary and never recalculates a score, a level or
 * an index. The rating is named once by the page's own heading, so a card
 * repeats no label, no active count and no explanatory wording.
 */
import React from "react";

import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';
import { formatDesignIndex } from "./designIndexDisplay";

const COLORS = {
  cardBg: "#FFFFFF",
  primary: "#213428",
  secondary: "#625143",
  border: "#E6E4DD",
  label: "#9B8E82",
};

/** Extract the 1-based seat column number from a "seat-r{row}-c{col}" ID. */
const extractSeatCol = (seatId) => {
  const match = String(seatId || "").match(/^seat-r(\d+)-c(\d+)$/);
  return match ? parseInt(match[2], 10) : null;
};

/** One compact seat card: seat identity, optional RSP marker, ASDR score. */
function SeatScoreCard({ seat, isRsp, rating, index }) {
  const seatNum = extractSeatCol(seat.seatId);
  const score = rating && rating.status !== "NOT_ASSESSED"
    ? formatDesignIndex(index)
    : null;

  return (
    <div
      className="tech-asdr-seat-card"
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${isRsp ? COLORS.primary : COLORS.border}`,
        borderWidth: isRsp ? "1.5px" : "1px",
        borderRadius: 6,
        padding: "2.5mm 3mm",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1mm",
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      {/* Seat identity — smaller than the score that follows it */}
      <div style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
        <span
          style={{
            fontSize: "8.5pt",
            fontWeight: 600,
            color: COLORS.secondary,
            fontFamily: FONT_HEADING,
            letterSpacing: "0.04em",
          }}
        >
          Seat {seatNum ?? "?"}
        </span>
        {isRsp && (
          <span
            style={{
              fontSize: "6.5pt",
              fontWeight: 700,
              color: "#FFFFFF",
              background: COLORS.primary,
              padding: "0.6mm 1.4mm",
              borderRadius: 2,
              letterSpacing: "0.1em",
              fontFamily: FONT_BODY,
              lineHeight: 1,
            }}
          >
            RSP
          </span>
        )}
      </div>

      {/* The seat's Artcoustic System Design Rating — the prominent value.
          The rating is named once above the grid, so the score needs no label
          of its own and no count is repeated on every card. */}
      {rating && (
        score ? (
          <div
            style={{
              fontSize: "20pt",
              fontWeight: 600,
              color: COLORS.primary,
              fontFamily: FONT_HEADING,
              lineHeight: 1,
            }}
          >
            {score}
          </div>
        ) : (
          <div
            style={{
              fontSize: "7.5pt",
              color: COLORS.label,
              fontFamily: FONT_BODY,
            }}
          >
            Not assessed
          </div>
        )
      )}
    </div>
  );
}

/**
 * Props:
 *   seatCountsByRow                 — per-row seat groups from the published report counts
 *   rspSeatId                       — the seat bound as the reporting position (marked RSP)
 *   seatDesignRatings               — per-seat ASDR rating objects
 *   seatDesignPerformanceIndexById  — per-seat ASDR index values
 */
export default function AsdrSeatScoreGrid({
  seatCountsByRow = [],
  rspSeatId = null,
  seatDesignRatings = {},
  seatDesignPerformanceIndexById = {},
}) {
  if (!seatCountsByRow.length) return null;

  return (
    <div className="tech-asdr-seat-grid">
      {seatCountsByRow.map(({ rowNum, seats }) => (
        <div key={rowNum} style={{ marginBottom: "3.5mm" }}>
          <div
            style={{
              fontSize: "9pt",
              fontWeight: 600,
              color: COLORS.secondary,
              letterSpacing: "0.1em",
              marginBottom: "2mm",
              fontFamily: FONT_HEADING,
            }}
          >
            ROW {rowNum}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${seats.length}, 1fr)`,
              gap: "3mm",
            }}
          >
            {seats.map((seat) => (
              <SeatScoreCard
                key={seat.seatId}
                seat={seat}
                isRsp={String(seat.seatId) === String(rspSeatId)}
                rating={seatDesignRatings?.[seat.seatId] ?? null}
                index={seatDesignPerformanceIndexById?.[seat.seatId] ?? null}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}