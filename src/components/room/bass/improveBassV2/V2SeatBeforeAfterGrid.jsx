// V2SeatBeforeAfterGrid.jsx
// Per-seat before→after evidence for the V2 Improve Bass result.
//
// For each seat shows:
//   P19: current raw dB → optimised raw dB, current level → optimised level
//   P20: current raw dB → optimised raw dB, current level → optimised level
//
// Uses data already present in currentResult.perSeatP19/P20 and
// winner.perSeatP19/P20. Does NOT recalculate anything.
//
// Primary distinction is based on canonical seating priority
// (seatPriorityAuthority), not the result's isPrimary boolean.
// Row structure follows real seating rows (Row 1 = 2 seats, Row 2 = 3 seats).

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { PRIMARY } from "@/components/utils/seatPriorityAuthority";
import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";

const REFERENCE_IDS = new Set(["rsp", "mlp", "synthetic-rsp", "synthetic_rsp"]);

function isRealSeat(seat) {
  const id = String(seat?.id ?? seat?.seatId ?? "").trim().toLowerCase();
  return !!id && !REFERENCE_IDS.has(id) && !seat?.__isSyntheticRsp && !seat?.isSyntheticRsp;
}

function buildResultMap(results) {
  const map = new Map();
  (Array.isArray(results) ? results : []).forEach((r) => {
    if (r && r.seatId) map.set(String(r.seatId), r);
  });
  return map;
}

function formatP19Db(raw) {
  if (!Number.isFinite(Number(raw))) return "—";
  const designVal = resolveRp22DesignValue(19, Math.abs(Number(raw)));
  return `±${designVal} dB`;
}

function formatP20Db(raw) {
  if (!Number.isFinite(Number(raw))) return "—";
  const designVal = resolveRp22DesignValue(20, Math.abs(Number(raw)));
  return `±${designVal} dB`;
}

function p19LevelText(level) {
  const n = Number(level);
  if (Number.isFinite(n)) return n > 0 ? `L${n}` : "FAIL";
  const match = String(level || "").toUpperCase().match(/^L?([0-4])$/);
  if (!match) return "—";
  return Number(match[1]) === 0 ? "FAIL" : `L${match[1]}`;
}

function p20LevelText(level) {
  const upper = String(level ?? "").toUpperCase();
  if (level === 0 || upper === "FAIL") return "FAIL";
  const match = upper.match(/^L?([1-4])$/);
  return match ? `L${match[1]}` : "—";
}

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

/**
 * Build per-seat before→after rows from seatingPositions and before/after
 * per-seat result arrays. Groups by real seating row, preserving order.
 */
function buildBeforeAfterRows(seatingPositions, beforeResults, afterResults) {
  const beforeMap = buildResultMap(beforeResults);
  const afterMap = buildResultMap(afterResults);
  const rows = new Map();

  (Array.isArray(seatingPositions) ? seatingPositions : []).filter(isRealSeat).forEach((seat, index) => {
    const row = Number(seat.row ?? seat.rowNumber) || 1;
    if (!rows.has(row)) rows.set(row, []);
    const id = String(seat.id ?? seat.seatId);
    rows.get(row).push({
      seatId: id,
      row,
      column: Number(seat.column ?? seat.col ?? seat.indexInRow ?? seat.seatNumber) || index + 1,
      priority: seat.priority === "secondary" ? "secondary" : "primary",
      before: beforeMap.get(id) || null,
      after: afterMap.get(id) || null,
    });
  });

  return [...rows.entries()].sort(([a], [b]) => a - b).map(([row, seats]) => ({
    row,
    seats: seats.sort((a, b) => a.column - b.column),
  }));
}

function SeatBeforeAfterCell({ seat, parameter, formatDb, levelTextFn }) {
  const isPrimary = seat.priority === PRIMARY;
  const borderColour = isPrimary ? "#1B1A1A" : "#C1B6AD";
  const borderWidth = isPrimary ? "2px" : "1px";

  const before = seat.before;
  const after = seat.after;
  const beforeRaw = Number.isFinite(Number(before?.variationDbRaw)) ? Number(before.variationDbRaw) : null;
  const afterRaw = Number.isFinite(Number(after?.variationDbRaw)) ? Number(after.variationDbRaw) : null;
  const beforeLevel = before ? numericLevel(before.level) : 0;
  const afterLevel = after ? numericLevel(after.level) : 0;

  // Detect trade-off: same level but raw worsened
  const rawDelta = beforeRaw != null && afterRaw != null
    ? Math.abs(afterRaw) - Math.abs(beforeRaw)
    : null;
  const isTradeOff = isPrimary && rawDelta != null && rawDelta > 0
    && beforeLevel === afterLevel && Math.abs(rawDelta) > 0.05;

  return (
    <div
      style={{
        border: `${borderWidth} solid ${borderColour}`,
        borderRadius: 6,
        padding: 3,
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 0,
      }}
    >
      <div className="flex items-center gap-1">
        <RP22GradingPill level={beforeLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0, fontSize: 9 }}>
          {formatDb(beforeRaw)}
        </RP22GradingPill>
        <span className="text-[8px] text-[#8A7B6A] flex-shrink-0">→</span>
        <RP22GradingPill level={afterLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0, fontSize: 9 }}>
          {formatDb(afterRaw)}
        </RP22GradingPill>
      </div>
      <div className="flex items-center gap-1 text-[8px] text-[#8A7B6A]">
        <span style={{ flex: 1, textAlign: "center" }}>{levelTextFn(before?.level)}</span>
        <span className="flex-shrink-0">→</span>
        <span style={{ flex: 1, textAlign: "center" }}>{levelTextFn(after?.level)}</span>
      </div>
      {isTradeOff && (
        <div className="text-[7px] text-amber-700 font-medium text-center leading-tight">
          +{rawDelta.toFixed(2)} dB
        </div>
      )}
    </div>
  );
}

function SeatRow({ row, parameter, formatDb, levelTextFn }) {
  return (
    <div key={row.row} className="flex flex-wrap justify-center gap-1">
      {row.seats.map((seat) => (
        <SeatBeforeAfterCell
          key={seat.seatId}
          seat={seat}
          parameter={parameter}
          formatDb={formatDb}
          levelTextFn={levelTextFn}
        />
      ))}
    </div>
  );
}

/**
 * Render per-seat before→after evidence for P19 and P20.
 *
 * @param {Array} seatingPositions - canonical seating positions with row/priority
 * @param {Array} beforeP19 - currentResult.perSeatP19
 * @param {Array} afterP19 - winner.perSeatP19
 * @param {Array} beforeP20 - currentResult.perSeatP20
 * @param {Array} afterP20 - winner.perSeatP20
 */
export default function V2SeatBeforeAfterGrid({
  seatingPositions = [],
  beforeP19 = [],
  afterP19 = [],
  beforeP20 = [],
  afterP20 = [],
}) {
  const p19Rows = buildBeforeAfterRows(seatingPositions, beforeP19, afterP19);
  const p20Rows = buildBeforeAfterRows(seatingPositions, beforeP20, afterP20);

  if (!p19Rows.length && !p20Rows.length) {
    return (
      <div className="rounded-md border border-[#DCDBD6] bg-[#F8F8F7] px-3 py-2 text-[11px] text-[#625143]">
        No per-seat data available
      </div>
    );
  }

  return (
    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
      <div className="rounded-lg border border-[#DCDBD6] bg-white p-2">
        <div className="mb-1 font-semibold text-[#213428] text-[10px]">P19 — All Seats (before → after)</div>
        <div className="grid gap-1.5">
          {p19Rows.map((row) => (
            <SeatRow key={row.row} row={row} parameter="P19" formatDb={formatP19Db} levelTextFn={p19LevelText} />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-[#DCDBD6] bg-white p-2">
        <div className="mb-1 font-semibold text-[#213428] text-[10px]">P20 — All Seats (before → after)</div>
        <div className="grid gap-1.5">
          {p20Rows.map((row) => (
            <SeatRow key={row.row} row={row} parameter="P20" formatDb={formatP20Db} levelTextFn={p20LevelText} />
          ))}
        </div>
      </div>
    </div>
  );
}