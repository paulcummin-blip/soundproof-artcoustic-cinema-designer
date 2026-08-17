/**
 * TechnicalPerformanceSummary.jsx
 * ------------------------------
 * Technical Report — Page 3: RP22 Performance Summary.
 *
 * Presents the existing live RP22 level-count distribution as:
 *   - Room parameters: wide low-profile summary card with L4/L3/L2/L1 counts
 *   - Seat parameters: per-row seating matrix with compact seat cards
 *     showing Active count and level distribution
 *   - RSP seat marked subtly
 *   - Explanatory technical note at bottom
 *
 * Presentation-only — does NOT invent any aggregate grade, overall room
 * level, seat grade, average, or score. All counts are passed as props
 * from the existing canonical analysis engine.
 */

import React from "react";
import TechnicalLevelBadge from "./TechnicalLevelBadge";
import {
  getRoomDesignRatingDesignation,
  getDesignRatingSupportingSentence,
  getDesignPerformanceIndex,
} from "./designRatingPresentation";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  bg: "#F1F0EE",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  accent: "#4A230F",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
  label: "#9B8E82",
};

/** Extract the 1-based seat column number from a "seat-r{row}-c{col}" ID. */
const extractSeatCol = (seatId) => {
  const match = String(seatId || "").match(/^seat-r(\d+)-c(\d+)$/);
  return match ? parseInt(match[2], 10) : null;
};

/** A level badge + "× count" pair, used in room and seat summaries. */
function LevelCountBlock({ level, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
      <TechnicalLevelBadge level={level} size="small" />
      <span style={{ fontSize: "10pt", color: COLORS.body, fontFamily: FONT_BODY }}>
        × {count}
      </span>
    </div>
  );
}

/** Compact per-seat summary card: seat label, Active count, level distribution. */
function SeatSummaryCard({ seat, isRsp, isCompromised, showDesignRating, designRating }) {
  const seatNum = extractSeatCol(seat.seatId);
  const { counts, activeCount } = seat;

  return (
    <div
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${isRsp ? COLORS.primary : COLORS.border}`,
        borderWidth: isRsp ? "1.5px" : "1px",
        borderRadius: 6,
        padding: "4mm 5mm",
        display: "flex",
        flexDirection: "column",
        gap: "3mm",
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      {/* Seat label + RSP marker */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: "10pt",
            fontWeight: 600,
            color: COLORS.primary,
            fontFamily: FONT_HEADING,
          }}
        >
          Seat {seatNum ?? "?"}
        </span>
        {isRsp && (
          <span
            style={{
              fontSize: "7pt",
              fontWeight: 700,
              color: "#FFFFFF",
              background: COLORS.primary,
              padding: "0.8mm 2mm",
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

      {/* MORE COMPROMISED — relative design observation (not an RP22 level) */}
      {isCompromised && (
        <div
          style={{
            fontSize: "6.5pt",
            fontWeight: 700,
            color: "#8B5E34",
            background: "#F5EDE3",
            border: "1px solid #E0D4C2",
            padding: "0.8mm 2mm",
            borderRadius: 2,
            letterSpacing: "0.08em",
            fontFamily: FONT_BODY,
            lineHeight: 1,
            alignSelf: "flex-start",
          }}
        >
          MORE COMPROMISED
        </div>
      )}

      {/* Active count */}
      <div
        style={{
          fontSize: "8.5pt",
          color: COLORS.secondary,
          fontFamily: FONT_BODY,
        }}
      >
        Active: {activeCount ?? 0} of {seat.total ?? 0}
      </div>

      {/* Level distribution */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "2mm 4mm",
        }}
      >
        <LevelCountBlock level="L4" count={counts?.L4 ?? 0} />
        <LevelCountBlock level="L3" count={counts?.L3 ?? 0} />
        <LevelCountBlock level="L2" count={counts?.L2 ?? 0} />
        <LevelCountBlock level="L1" count={counts?.L1 ?? 0} />
      </div>

      {/* Unassessed */}
      <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
        <TechnicalLevelBadge level="—" size="small" />
        <span style={{ fontSize: "10pt", color: COLORS.body, fontFamily: FONT_BODY }}>
          × {(seat.total ?? 0) - (activeCount ?? 0)}
        </span>
      </div>

      {/* Design Rating — secondary to seat name, prominent enough to compare */}
      {showDesignRating && designRating && (
        <div
          style={{
            marginTop: "1mm",
            paddingTop: "2mm",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            style={{
              fontSize: "7.5pt",
              fontWeight: 700,
              color: COLORS.secondary,
              letterSpacing: "0.06em",
              fontFamily: FONT_BODY,
            }}
          >
            DESIGN RATING{" "}
            {designRating.status === "NOT_ASSESSED"
              ? "NOT ASSESSED"
              : `Index ${getDesignPerformanceIndex(designRating) ?? "—"}`}
          </div>

        </div>
      )}
    </div>
  );
}

export default function TechnicalPerformanceSummary({
  roomLevelCounts,
  roomCalculatedCount,
  seatCountsByRow,
  totalRoomParameters,
  totalSeatParameters,
  rspSeatId,
  seatCompromiseById,
  showDesignRating = false,
  roomDesignRating = null,
  seatDesignRatings = null,
}) {
  return (
    <div
      className="tech-summary-page"
      style={{
        background: COLORS.bg,
        minHeight: "268mm",
        padding: "8mm 10mm",
        boxSizing: "border-box",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        fontFamily: FONT_BODY,
        color: COLORS.body,
      }}
    >
      {/* ── Page heading ── */}
      <div style={{ marginBottom: "6mm" }}>
        <div
          style={{
            fontFamily: FONT_HEADING,
            fontSize: "18pt",
            fontWeight: 400,
            color: COLORS.primary,
            letterSpacing: "0.01em",
            lineHeight: 1.1,
          }}
        >
          RP22 PERFORMANCE SUMMARY
        </div>
      </div>

      {/* ── Room parameters card ── */}
      <div
        className="print-avoid-break"
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "6mm 8mm",
          marginBottom: "6mm",
          breakInside: "avoid",
          pageBreakInside: "avoid",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "4mm",
            marginBottom: "5mm",
          }}
        >
          <span
            style={{
              fontFamily: FONT_HEADING,
              fontSize: "12pt",
              fontWeight: 600,
              color: COLORS.primary,
              letterSpacing: "0.04em",
            }}
          >
            ROOM PARAMETERS
          </span>
          <span
            style={{
              fontSize: "9pt",
              color: COLORS.secondary,
              fontFamily: FONT_BODY,
            }}
          >
            {totalRoomParameters} parameters · {roomCalculatedCount ?? 0} calculated
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "4mm",
          }}
        >
          <LevelCountBlock level="L4" count={roomLevelCounts?.L4 ?? 0} />
          <LevelCountBlock level="L3" count={roomLevelCounts?.L3 ?? 0} />
          <LevelCountBlock level="L2" count={roomLevelCounts?.L2 ?? 0} />
          <LevelCountBlock level="L1" count={roomLevelCounts?.L1 ?? 0} />
          <LevelCountBlock level="—" count={roomLevelCounts?.unassessed ?? 0} />
        </div>

        {/* Artcoustic System Design Rating — room scope */}
        {showDesignRating && roomDesignRating && (
          <div
            style={{
              marginTop: "5mm",
              paddingTop: "4mm",
              borderTop: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              style={{
                fontSize: "8pt",
                fontWeight: 700,
                color: COLORS.secondary,
                letterSpacing: "0.1em",
                fontFamily: FONT_BODY,
                marginBottom: "2mm",
              }}
            >
              ARTCOUSTIC SYSTEM DESIGN RATING
            </div>
            <div
              style={{
                fontSize: "18pt",
                fontWeight: 400,
                color: COLORS.primary,
                fontFamily: FONT_HEADING,
                lineHeight: 1.1,
              }}
            >
              {roomDesignRating.status === "NOT_ASSESSED"
                ? "NOT ASSESSED"
                : (getRoomDesignRatingDesignation(roomDesignRating) || "—")}
            </div>
            {roomDesignRating.status !== "NOT_ASSESSED" && (
              <>
                <div style={{
                  fontSize: "8pt",
                  color: COLORS.body,
                  fontFamily: FONT_BODY,
                  lineHeight: 1.4,
                  marginTop: "2mm",
                }}>
                  {getDesignRatingSupportingSentence(roomDesignRating)}
                </div>
                <div style={{
                  fontSize: "9pt",
                  fontWeight: 600,
                  color: COLORS.secondary,
                  fontFamily: FONT_BODY,
                  marginTop: "2mm",
                  letterSpacing: "0.03em",
                }}>
                  Design Performance Index {getDesignPerformanceIndex(roomDesignRating) ?? "—"}
                </div>
              </>
            )}

            <div
              style={{
                fontSize: "7pt",
                color: COLORS.label,
                marginTop: "2mm",
                fontStyle: "italic",
                fontFamily: FONT_BODY,
              }}
            >
              Sound Proof proprietary design metric. Not part of CEDIA RP22 or RP23.
            </div>
          </div>
        )}
      </div>

      {/* ── Seat parameters ── */}
      <div className="print-avoid-break">
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "4mm",
            marginBottom: "5mm",
          }}
        >
          <span
            style={{
              fontFamily: FONT_HEADING,
              fontSize: "12pt",
              fontWeight: 600,
              color: COLORS.primary,
              letterSpacing: "0.04em",
            }}
          >
            SEAT PARAMETERS
          </span>
          <span
            style={{
              fontSize: "9pt",
              color: COLORS.secondary,
              fontFamily: FONT_BODY,
            }}
          >
            {totalSeatParameters} seat-scope parameters
          </span>
        </div>

        {(seatCountsByRow || []).map(({ rowNum, seats }) => (
          <div key={rowNum} style={{ marginBottom: "5mm" }}>
            <div
              style={{
                fontSize: "9pt",
                fontWeight: 600,
                color: COLORS.secondary,
                letterSpacing: "0.1em",
                marginBottom: "3mm",
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
                <SeatSummaryCard
                  key={seat.seatId}
                  seat={seat}
                  isRsp={String(seat.seatId) === String(rspSeatId)}
                  isCompromised={!!seatCompromiseById?.[seat.seatId]?.isCompromised}
                  showDesignRating={showDesignRating}
                  designRating={seatDesignRatings?.[seat.seatId] ?? null}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Seat comparison summary line ── */}
      {(() => {
        const compromisedCount = (seatCountsByRow || []).reduce(
          (sum, row) => sum + (row.seats || []).filter(s => seatCompromiseById?.[s.seatId]?.isCompromised).length,
          0
        );
        if (compromisedCount === 0) {
          return (
            <div style={{ marginTop: "3mm", fontSize: "8.5pt", color: COLORS.secondary, fontFamily: FONT_BODY, fontStyle: "italic" }}>
              Calculated seat performance is broadly consistent across the listening area.
            </div>
          );
        }
        return (
          <div style={{ marginTop: "3mm", fontSize: "8.5pt", color: COLORS.secondary, fontFamily: FONT_BODY, fontStyle: "italic" }}>
            Some positions show material compromise across multiple calculated seat-scope RP22 parameters.
          </div>
        );
      })()}

      {/* ── Explanatory note ── */}
      <div
        style={{
          marginTop: "4mm",
          paddingTop: "4mm",
          borderTop: `1px solid ${COLORS.border}`,
          fontSize: "8.5pt",
          color: COLORS.secondary,
          fontFamily: FONT_BODY,
          lineHeight: 1.5,
          fontStyle: "italic",
        }}
      >
        Room parameters assess system-wide performance. Seat parameters are evaluated
        independently at each listening position.
        <br />
        Seat comparison reflects relative differences between calculated seat-scope RP22 parameters. It is not an RP22 Performance Level.
      </div>

      {/* Design Rating footer — one concise line */}
      {showDesignRating && (
        <div
          style={{
            marginTop: "3mm",
            fontSize: "7.5pt",
            color: COLORS.secondary,
            fontFamily: FONT_BODY,
            lineHeight: 1.4,
          }}
        >
          Artcoustic System Design Rating is a proprietary Sound Proof design metric based on the
          calculated performance and importance of the assessed design parameters. It is not an
          RP22 or RP23 Performance Level.
        </div>
      )}
    </div>
  );
}