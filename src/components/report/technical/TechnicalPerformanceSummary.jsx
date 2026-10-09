/**
 * TechnicalPerformanceSummary.jsx
 * ------------------------------
 * Technical Report — Page 3: RP22 Performance Summary.
 *
 * Presents the existing live RP22 level-count distribution as:
 *   - Room parameters: wide low-profile summary card with L4/L3/L2/L1 counts
 *   - Seat parameters: per-row seating matrix with compact seat cards, each
 *     naming the seat and stating its Artcoustic System Design Rating score.
 *     The rating is labelled once above the grid, so no card repeats it.
 *   - RSP seat marked subtly
 *   - Explanatory technical note at bottom
 *
 * Presentation-only — does NOT invent any aggregate grade, overall room
 * level, seat grade, average, or score. All counts are passed as props
 * from the existing canonical analysis engine.
 */

import React from "react";
import TechnicalLevelBadge from "./TechnicalLevelBadge";
import ScopedAsdrSummary from "./ScopedAsdrSummary";
import { formatDesignIndex } from "./designIndexDisplay";

import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
  reportSectionHeadingStyle,
} from '@/components/report/typography/reportTypography';

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

/**
 * Compact per-seat card: the seat's identity, then its Artcoustic System Design
 * Rating score as the prominent value. The rating is named once above the grid,
 * so no card repeats a label, an active count or explanatory wording.
 */
function SeatSummaryCard({ seat, isRsp, isCompromised, showDesignRating, designRating, designRatingIndex }) {
  const seatNum = extractSeatCol(seat.seatId);
  const score = designRating && designRating.status !== "NOT_ASSESSED"
    ? formatDesignIndex(designRatingIndex)
    : null;

  return (
    <div
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

      {/* MORE COMPROMISED — relative design observation (not an RP22 level) */}
      {isCompromised && (
        <div
          style={{
            fontSize: "6pt",
            fontWeight: 700,
            color: "#8B5E34",
            background: "#F5EDE3",
            border: "1px solid #E0D4C2",
            padding: "0.6mm 1.4mm",
            borderRadius: 2,
            letterSpacing: "0.06em",
            fontFamily: FONT_BODY,
            lineHeight: 1,
          }}
        >
          MORE COMPROMISED
        </div>
      )}

      {/* The seat's Artcoustic System Design Rating — the prominent value.
          The rating is named once above the grid, so the score needs no label
          of its own and the active count is not repeated on every card. */}
      {showDesignRating && designRating && (
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

export default function TechnicalPerformanceSummary({
  engineeringSummary,
  rspSeatId,
  showDesignRating = false,
}) {
  if (!engineeringSummary) return null;
  const reportCounts = engineeringSummary.project?.reportCounts || {};
  const roomLevelCounts = reportCounts.roomLevelCounts || {};
  const roomCalculatedCount = reportCounts.roomCalculatedCount || 0;
  const seatCountsByRow = reportCounts.seatCountsByRow || [];
  const seatCompromiseById = reportCounts.seatCompromiseById || {};
  const totalRoomParameters = reportCounts.roomParameterCount || 0;
  const totalSeatParameters = reportCounts.seatParameterCount || 0;
  const seatDesignRatings = engineeringSummary.designRating?.seatDesignRatings || {};
  const seatDesignPerformanceIndexById = engineeringSummary.designRating?.seatDesignPerformanceIndexById || {};
  const roomDesignRating = engineeringSummary.project?.rating || null;

  return (
    <div
      className="tech-summary-page"
      style={{
        background: COLORS.bg,
        minHeight: "268mm",
        padding: "7mm 10mm",
        boxSizing: "border-box",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        fontFamily: FONT_BODY,
        color: COLORS.body,
      }}
    >
      {/* ── Page heading ──
          Marked so the Technical Report's one section-heading rule sets the
          gap below it in the exported PDF as well as on screen. */}
      <div data-report-section-heading="true" style={{ marginBottom: "6mm" }}>
        <div style={reportSectionHeadingStyle("18pt", { color: COLORS.primary })}>
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
          <span style={reportSectionHeadingStyle("12pt", { fontWeight: 600, color: COLORS.primary })}>
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
          {/* The fifth bucket is the FAILURE count, labelled FAIL — never a dash.
              Same bucket and same colour token the RP22 Compliance Report uses. */}
          <LevelCountBlock level="FAIL" count={roomLevelCounts?.fail ?? 0} />
        </div>

        {/* Artcoustic System Design Rating — three scoped results */}
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
                marginBottom: "3mm",
              }}
            >
              ARTCOUSTIC SYSTEM DESIGN RATING
            </div>
            <ScopedAsdrSummary engineeringSummary={engineeringSummary} />
            <div
              style={{
                fontSize: "7pt",
                color: COLORS.label,
                marginTop: "3mm",
                fontStyle: "italic",
                fontFamily: FONT_BODY,
              }}
            >
              Sound Proof proprietary design metric. Not part of CEDIA RP22 or RP23.
            </div>
          </div>
        )}
      </div>

      {/* ── Per-seat ratings ──
          ONE clear label above the grid names what every seat card states, so
          no card carries a label, a repeated active count or explanatory copy. */}
      <div className="print-avoid-break">
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "4mm",
            marginBottom: "3.5mm",
          }}
        >
          <span style={reportSectionHeadingStyle("12pt", { fontWeight: 600, color: COLORS.primary })}>
            ARTCOUSTIC SYSTEM DESIGN RATING
          </span>
          <span style={{ fontSize: "9pt", color: COLORS.secondary, fontFamily: FONT_BODY }}>
            {totalSeatParameters} parameters · {reportCounts.seatCalculatedParamCount || 0} calculated · {reportCounts.seatsEvaluated || 0} seats
          </span>
        </div>

        {(seatCountsByRow || []).map(({ rowNum, seats }) => (
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
                <SeatSummaryCard
                  key={seat.seatId}
                  seat={seat}
                  isRsp={String(seat.seatId) === String(rspSeatId)}
                  isCompromised={!!seatCompromiseById?.[seat.seatId]?.isCompromised}
                  showDesignRating={showDesignRating}
                  designRating={seatDesignRatings?.[seat.seatId] ?? null}
                  designRatingIndex={seatDesignPerformanceIndexById?.[seat.seatId] ?? null}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Seat comparison summary line ── */}
      {reportCounts.compromisedSeatCount === 0 ? (
        <div style={{ marginTop: "2.5mm", fontSize: "8.5pt", color: COLORS.secondary, fontFamily: FONT_BODY, fontStyle: "italic" }}>
          No listening position shows material compromise across the calculated seat-scope RP22 parameters.
        </div>
      ) : (
        <div style={{ marginTop: "2.5mm", fontSize: "8.5pt", color: COLORS.secondary, fontFamily: FONT_BODY, fontStyle: "italic" }}>
          Some positions show material compromise across multiple calculated seat-scope RP22 parameters.
        </div>
      )}

      {/* ── Explanatory note ── */}
      <div
        style={{
          marginTop: "3mm",
          paddingTop: "3mm",
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
            marginTop: "2.5mm",
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