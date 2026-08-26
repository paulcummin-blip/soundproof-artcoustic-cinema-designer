/**
 * SeatPrioritySelector.jsx
 * ------------------------
 * Simplified monochrome seat map for toggling Primary / Secondary
 * classification. Lives inside the Rows & Seats section of the seating
 * controls.
 *
 * This is a PRIORITY SELECTOR ONLY — it is not a Plan View. It does not
 * reproduce actual lateral seat offsets, stagger, or X/Y geometry. Each row
 * is rendered as a centred horizontal group so rows have clean vertical
 * symmetry even when row seat counts differ.
 *
 * Interaction:
 *   - Click any seat to toggle Primary <-> Secondary (immediate, no modal).
 *   - Priority is independent of the internal RSP / isPrimary calculation.
 *
 * Visual design is deliberately simple and monochrome. No RP22 Level
 * colours, SPL, pass/fail, or compliance results are shown here.
 */

import React, { useMemo } from "react";
import { toggleSeatPriority, resolveSeatPriority } from "@/components/utils/seatPriorityAuthority";

const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

// The surrounding row label already identifies the row, so each button only
// needs its seat number within that row.
function compactSeatLabel(seat, indexInRow) {
  const col = Number.isFinite(indexInRow) ? indexInRow + 1 : 1;
  return `S${col}`;
}

export default function SeatPrioritySelector({
  seatingPositions = [],
  onSetSeatingPositions,
  disabled = false,
  designatedRspSeatId = null,
  onSetDesignatedRspSeatId = null,
  rspMode = "auto_from_screen",
  onRspModeChange = null,
}) {
  // Group seats by rowNumber, sorted, then left->right by x (canonical order).
  const rows = useMemo(() => {
    const list = Array.isArray(seatingPositions) ? seatingPositions : [];
    const byRow = new Map();
    for (const seat of list) {
      const key = Number(seat?.rowNumber) || 1;
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key).push(seat);
    }
    const sortedRows = Array.from(byRow.keys()).sort((a, b) => a - b);
    return sortedRows.map((rowNum) => {
      const rowSeats = byRow.get(rowNum).slice().sort((a, b) => (Number(a?.x) || 0) - (Number(b?.x) || 0));
      return { rowNum, seats: rowSeats };
    });
  }, [seatingPositions]);

  const handleToggle = (seatId) => {
    if (disabled || typeof onSetSeatingPositions !== "function") return;
    const next = toggleSeatPriority(seatingPositions, seatId);
    if (next !== seatingPositions) {
      onSetSeatingPositions(next);
    }
  };

  // Designate a seat as the canonical RSP (seat_bound mode).
  // Explicit action: the designer chooses this seat as the RSP, so the bass
  // engine RSP uses its exact coordinates and P20 for that seat is naturally 0.
  // Clicking the green dot on the already-designated seat unbinds (free-floating).
  const handleDesignateRsp = (seatId) => {
    if (disabled) return;
    if (!onSetDesignatedRspSeatId || !onRspModeChange) return;
    if (designatedRspSeatId === seatId && rspMode === "seat_bound") {
      // Unbind — return to free-floating auto RSP.
      onSetDesignatedRspSeatId(null);
      onRspModeChange("auto_from_screen");
    } else {
      onSetDesignatedRspSeatId(seatId);
      onRspModeChange("seat_bound");
    }
  };

  if (!rows.length) return null;

  return (
    <div className="space-y-3" data-seat-priority-selector>
      <div className="flex items-center justify-between">
        <span
          className="text-lg font-bold"
          style={{ color: "#1B1A1A", fontFamily: BODY_FONT, letterSpacing: "0.01em" }}
        >
          Seat Priority
        </span>
        <div className="flex items-center gap-4 text-xs" style={{ color: "#3E4349", fontFamily: BODY_FONT }}>
          <span className="flex items-center gap-1.5">
            <span
              style={{
                display: "inline-block",
                width: 16,
                height: 16,
                borderRadius: 4,
                background: "#1B1A1A",
                border: "1px solid #1B1A1A",
              }}
            />
            Primary
          </span>
          <span className="flex items-center gap-1.5">
            <span
              style={{
                display: "inline-block",
                width: 16,
                height: 16,
                borderRadius: 4,
                background: "#EDECE8",
                border: "1px solid #C1B6AD",
              }}
            />
            Secondary
          </span>
        </div>
      </div>

      <p className="text-sm leading-snug" style={{ color: "#3E4349", fontFamily: BODY_FONT }}>
        Tap any seat to toggle Primary / Secondary. Secondary seats stay fully
        included in every calculation.
        {onSetDesignatedRspSeatId && onRspModeChange && (
          <span style={{ display: "block", marginTop: 4 }}>
            Tap the <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#22c55e", border: "1.5px solid #fff", boxShadow: "0 0 3px rgba(34,197,94,0.5)", verticalAlign: "middle" }} /> green dot to bind the RSP to that seat (P20 = 0 for the bound seat).
          </span>
        )}
      </p>

      <div className="space-y-3 p-5 rounded-xl" style={{ border: "1.5px solid #C1B6AD", background: "#F8F8F7" }}>
        {rows.map(({ rowNum, seats }) => (
          <div key={`row-${rowNum}`} className="flex items-center gap-3">
            <div
              className="text-sm shrink-0 font-medium"
              style={{ color: "#3E4349", fontFamily: BODY_FONT, width: 64 }}
            >
              Row {rowNum}
            </div>
            <div className="flex-1 flex justify-center">
              <div className="flex items-center gap-2.5">
                {seats.map((seat, idxInRow) => {
                  const isSecondary = resolveSeatPriority(seat) === "secondary";
                  const label = compactSeatLabel(seat, idxInRow);
                  const isDesignatedRsp = designatedRspSeatId === seat?.id && rspMode === "seat_bound";

                  const baseStyle = {
                    width: 54,
                    height: 46,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: BODY_FONT,
                    cursor: disabled ? "default" : "pointer",
                    transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
                    userSelect: "none",
                    position: "relative",
                  };

                  let style;
                  if (isSecondary) {
                    style = {
                      ...baseStyle,
                      background: "#EDECE8",
                      color: "#625143",
                      border: "1px solid #C1B6AD",
                      opacity: 0.85,
                    };
                  } else {
                    style = {
                      ...baseStyle,
                      background: "#1B1A1A",
                      color: "#FFFFFF",
                      border: "1px solid #1B1A1A",
                    };
                  }

                  // Highlight the designated RSP seat with a green border.
                  if (isDesignatedRsp) {
                    style = {
                      ...style,
                      border: "2px solid #22c55e",
                      boxShadow: "0 0 0 1px #22c55e",
                    };
                  }

                  const tooltip = isSecondary
                    ? `Secondary seat (${label}) — click to make Primary`
                    : `Primary seat (${label}) — click to make Secondary`;
                  const rspTooltip = isDesignatedRsp
                    ? `RSP bound to ${label} — click green dot to unbind`
                    : `Designate ${label} as RSP (seat-bound)`;

                  return (
                    <div key={seat?.id || label} className="flex items-center" style={{ position: "relative" }}>
                      <button
                        type="button"
                        title={tooltip}
                        aria-label={tooltip}
                        disabled={disabled}
                        style={style}
                        onClick={() => handleToggle(seat?.id)}
                        onMouseEnter={(e) => {
                          if (disabled) return;
                          e.currentTarget.style.borderColor = "#213428";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = isDesignatedRsp
                            ? "#22c55e"
                            : (isSecondary ? "#C1B6AD" : "#1B1A1A");
                        }}
                      >
                        {label}
                      </button>
                      {onSetDesignatedRspSeatId && onRspModeChange && (
                        <button
                          type="button"
                          title={rspTooltip}
                          aria-label={rspTooltip}
                          disabled={disabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDesignateRsp(seat?.id);
                          }}
                          style={{
                            position: "absolute",
                            top: -6,
                            right: -6,
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            border: "2px solid #ffffff",
                            background: isDesignatedRsp ? "#22c55e" : "#ffffff",
                            cursor: disabled ? "default" : "pointer",
                            padding: 0,
                            lineHeight: 0,
                            boxShadow: isDesignatedRsp ? "0 0 5px rgba(34,197,94,0.6)" : "0 1px 2px rgba(0,0,0,0.15)",
                            transition: "background-color 120ms ease, box-shadow 120ms ease",
                          }}
                          onMouseEnter={(e) => {
                            if (disabled) return;
                            if (!isDesignatedRsp) e.currentTarget.style.background = "#86efac";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDesignatedRsp ? "#22c55e" : "#ffffff";
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}