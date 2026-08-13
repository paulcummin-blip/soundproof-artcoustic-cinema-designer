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

  if (!rows.length) return null;

  return (
    <div className="space-y-3" data-seat-priority-selector>
      <div className="flex items-center justify-between">
        <span
          className="text-sm font-medium"
          style={{ color: "#3E4349", fontFamily: BODY_FONT }}
        >
          Seat Priority
        </span>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: "#625143", fontFamily: BODY_FONT }}>
          <span className="flex items-center gap-1">
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: 3,
                background: "#1B1A1A",
                border: "1px solid #1B1A1A",
              }}
            />
            Primary
          </span>
          <span className="flex items-center gap-1">
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: 3,
                background: "#EDECE8",
                border: "1px solid #C1B6AD",
              }}
            />
            Secondary
          </span>
        </div>
      </div>

      <p className="text-[11px] leading-snug" style={{ color: "#625143", fontFamily: BODY_FONT }}>
        Tap any seat to toggle Primary / Secondary. Secondary seats stay fully
        included in every calculation.
      </p>

      <div className="space-y-2 p-3 rounded-lg" style={{ border: "1px solid #C1B6AD", background: "#F8F8F7" }}>
        {rows.map(({ rowNum, seats }) => (
          <div key={`row-${rowNum}`} className="flex items-center gap-2">
            <div
              className="text-xs shrink-0"
              style={{ color: "#625143", fontFamily: BODY_FONT, width: 44 }}
            >
              Row {rowNum}
            </div>
            <div className="flex-1 flex justify-center">
              <div className="flex items-center gap-1.5">
                {seats.map((seat, idxInRow) => {
                  const isSecondary = resolveSeatPriority(seat) === "secondary";
                  const label = compactSeatLabel(seat, idxInRow);

                  const baseStyle = {
                    width: 34,
                    height: 30,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: BODY_FONT,
                    cursor: disabled ? "default" : "pointer",
                    transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
                    userSelect: "none",
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

                  const tooltip = isSecondary
                    ? `Secondary seat (${label}) — click to make Primary`
                    : `Primary seat (${label}) — click to make Secondary`;

                  return (
                    <button
                      type="button"
                      key={seat?.id || label}
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
                        e.currentTarget.style.borderColor = isSecondary ? "#C1B6AD" : "#1B1A1A";
                      }}
                    >
                      {label}
                    </button>
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