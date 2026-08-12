/**
 * SeatResultLayout.jsx
 * ---------------------
 * Shared compact seating-layout result map for SEAT-scope RP22 parameters
 * in the Design Review Parameter Explorer.
 *
 * Renders per-seat Performance Level results positioned by the ACTUAL canonical
 * seating geometry (physical X / row / Y), not a fixed grid.
 *
 * Orientation matches the Room Designer plan convention:
 *   - SCREEN / front of room at the TOP
 *   - Front seating row above rear rows
 *   - Within each row: left -> right follows actual physical X order
 *
 * This component is PRESENTATION ONLY. It consumes existing canonical
 * per-seat result data (buildSeatGridData) and seating positions. It performs
 * no grading, no seat matching, and no RSP calculation.
 *
 * Props:
 *   seatingPositions  — canonical seats [{id, x, y, rowNumber, isPrimary, indexInRow}]
 *   seatResults       — buildSeatGridData output [{row, seats:[{id, level, value, isPrimary}]}]
 *   rspSeatId         — canonical RSP seat id
 *   valueFormatter    — optional (result, seat) => string; defaults to result.value
 */

import React, { useMemo } from "react";
import { getLevelColors } from "@/components/utils/rp22Colors";
import { normalizeLevel } from "@/components/designreview/needsAttentionAuthority";

const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

const finiteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

/** Map a raw level to a compact label + canonical level colours. */
function levelVisuals(level) {
  const norm = normalizeLevel(level);
  if (norm === "L4") return { label: "L4", ...getLevelColors(4) };
  if (norm === "L3") return { label: "L3", ...getLevelColors(3) };
  if (norm === "L2") return { label: "L2", ...getLevelColors(2) };
  if (norm === "L1") return { label: "L1", ...getLevelColors(1) };
  if (norm === "FAIL") return { label: "FAIL", ...getLevelColors(0) };
  return {
    label: norm === "N/A" ? "N/A" : "—",
    bg: "#F3F4F6",
    text: "#9CA3AF",
    border: "#E5E7EB",
  };
}

export default function SeatResultLayout({
  seatingPositions = [],
  seatResults = [],
  rspSeatId = "",
  valueFormatter = null,
}) {
  // Flatten seat results into a seatId -> result lookup
  const resultMap = useMemo(() => {
    const map = {};
    for (const row of seatResults) {
      for (const seat of row?.seats || []) {
        if (seat?.id) map[seat.id] = seat;
      }
    }
    return map;
  }, [seatResults]);

  // Group seating positions by row; sort rows front->back (by Y), seats left->right (by X)
  const layoutRows = useMemo(() => {
    const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
    if (!seats.length) return [];

    const byRow = new Map();
    for (const s of seats) {
      const r = Number(s?.rowNumber ?? s?.row) || 1;
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r).push(s);
    }

    const rowEntries = Array.from(byRow.entries()).map(([rowNum, list]) => {
      const sorted = list.slice().sort((a, b) => finiteNumber(a?.x) - finiteNumber(b?.x));
      const minY = sorted.reduce((m, s) => Math.min(m, finiteNumber(s?.y)), Infinity);
      return { rowNum, seats: sorted, minY };
    });
    rowEntries.sort((a, b) => a.minY - b.minY);
    return rowEntries;
  }, [seatingPositions]);

  // Global X range across all seats for proportional horizontal positioning
  const xRange = useMemo(() => {
    const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
    let minX = Infinity, maxX = -Infinity;
    for (const s of seats) {
      const x = Number(s?.x);
      if (Number.isFinite(x)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return { min: 0, max: 1 };
    if (maxX - minX < 1e-6) return { min: minX - 0.5, max: maxX + 0.5 };
    return { min: minX, max: maxX };
  }, [seatingPositions]);

  if (!layoutRows.length) return null;

  const xToPct = (x) => {
    const span = xRange.max - xRange.min;
    const t = span > 1e-6 ? (x - xRange.min) / span : 0.5;
    // clamp into [12, 88] so markers stay inside the track
    return 12 + t * 76;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Screen / front of room */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9B8E82", fontFamily: BODY_FONT }}>
        <div style={{ flex: 1, height: 1, background: "#E6E4DD" }} />
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em" }}>SCREEN</span>
        <div style={{ flex: 1, height: 1, background: "#E6E4DD" }} />
      </div>

      {/* Rows — front row first (top), rear rows below */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {layoutRows.map((rowObj, rowIdx) => (
          <div key={`row-${rowObj.rowNum}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Subtle row label */}
            <div style={{
              width: 38,
              flexShrink: 0,
              fontSize: 8,
              fontWeight: 700,
              color: "#9B8E82",
              letterSpacing: "0.06em",
              fontFamily: BODY_FONT,
              textAlign: "right",
            }}>
              ROW {rowIdx + 1}
            </div>

            {/* Seat track — seats positioned by actual physical X */}
            <div style={{ position: "relative", flex: 1, height: 40 }}>
              {rowObj.seats.map((seat) => {
                const result = resultMap[seat.id] || {};
                const lvl = result.level;
                const val = valueFormatter ? valueFormatter(result, seat) : (result.value || "—");
                const colors = levelVisuals(lvl);
                const isRsp = !!seat?.isPrimary || (rspSeatId && seat.id === rspSeatId);
                const pct = xToPct(finiteNumber(seat?.x));
                return (
                  <div
                    key={seat.id || `seat-${pct}`}
                    title={`Row ${rowIdx + 1} · Seat ${seat?.indexInRow ?? "?"}${isRsp ? " · RSP" : ""}`}
                    style={{
                      position: "absolute",
                      left: `${pct}%`,
                      top: 0,
                      transform: "translateX(-50%)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <span style={{
                      minWidth: 28,
                      padding: "2px 6px",
                      borderRadius: 4,
                      border: `1px solid ${colors.border}`,
                      background: colors.bg,
                      color: colors.text,
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: BODY_FONT,
                      textAlign: "center",
                      lineHeight: 1.1,
                      boxShadow: isRsp ? "0 0 0 1.5px #213428" : "none",
                    }}>
                      {colors.label}
                    </span>
                    <span style={{
                      fontSize: 8,
                      color: "#625143",
                      fontFamily: BODY_FONT,
                      whiteSpace: "nowrap",
                      lineHeight: 1,
                    }}>
                      {val}
                    </span>
                    {isRsp && (
                      <span style={{
                        fontSize: 7,
                        fontWeight: 700,
                        color: "#213428",
                        letterSpacing: "0.06em",
                        fontFamily: BODY_FONT,
                        lineHeight: 1,
                      }}>
                        RSP
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}