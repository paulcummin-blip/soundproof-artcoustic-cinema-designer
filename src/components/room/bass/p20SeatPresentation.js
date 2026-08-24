const referenceIds = new Set(["rsp", "mlp", "synthetic-rsp", "synthetic_rsp"]);

const seatId = (value) => String(value ?? "").trim();
const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

export function isRealP20Seat(seat) {
  const id = seatId(seat?.id ?? seat?.seatId).toLowerCase();
  return !!id && !referenceIds.has(id) && !seat?.__isSyntheticRsp && !seat?.isSyntheticRsp;
}

export function p20LevelText(level) {
  // RP22 P20 does not define Level 1, but Sound Proof grades >4 dB as L1
  // (not FAIL) because P20 is not applicable at Level 1. Only level 0
  // (genuine failure / not computed) displays as "FAIL".
  const upper = String(level ?? "").toUpperCase();
  if (level === 0 || upper === "FAIL") return "FAIL";
  const match = upper.match(/^L?([1-4])$/);
  return match ? `L${match[1]}` : "—";
}

function rowNumber(seat) {
  const value = Number(seat?.row ?? seat?.rowNumber);
  return Number.isFinite(value) ? value : 1;
}

function columnNumber(seat, fallback) {
  const value = Number(seat?.column ?? seat?.col ?? seat?.indexInRow ?? seat?.seatNumber);
  return Number.isFinite(value) ? value : fallback;
}

import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";

export function formatAuthoritativeP20Result(result) {
  if (!finite(result?.variationDbRaw)) return "—";
  const designVal = resolveRp22DesignValue(20, Math.abs(Number(result.variationDbRaw)));
  return `±${designVal} dB`;
}

export function buildP20SeatRows(seatingPositions = [], perSeatP20Results = []) {
  const resultMap = new Map((Array.isArray(perSeatP20Results) ? perSeatP20Results : [])
    .filter(isRealP20Seat).map((result) => [seatId(result.seatId), result]));
  const rows = new Map();
  (Array.isArray(seatingPositions) ? seatingPositions : []).filter(isRealP20Seat).forEach((seat, index) => {
    const row = rowNumber(seat);
    if (!rows.has(row)) rows.set(row, []);
    const id = seatId(seat.id ?? seat.seatId);
    const result = resultMap.get(id) || null;
    rows.get(row).push({
      seatId: id,
      row,
      column: columnNumber(seat, index + 1),
      priority: resolveSeatPriority(seat),
      level: result && finite(result.variationDbRaw) ? p20LevelText(result.level) : "—",
      variationDbRaw: result && finite(result.variationDbRaw) ? Number(result.variationDbRaw) : null,
      displayVariationDb: result && finite(result.variationDbRaw) ? formatAuthoritativeP20Result(result) : "—",
      worstFrequencyHz: result && finite(result.worstFrequencyHz) ? Number(result.worstFrequencyHz) : null,
      comparisonPointCount: result && finite(result.comparisonPointCount) ? Number(result.comparisonPointCount) : null,
      source: result,
    });
  });
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([row, seats]) => ({
    row,
    seats: seats.sort((a, b) => a.column - b.column),
  }));
}

/**
 * Find the best-performing Primary seat (lowest variation) from P20 per-seat rows.
 * Uses seat-priority authority to determine which seats are Primary.
 * If no Primary seats have results, returns null.
 */
export function p20BestPrimarySeat(rows = []) {
  return rows.flatMap((row) => row.seats)
    .filter((seat) => seat.priority === PRIMARY && seat.level !== "—" && seat.variationDbRaw != null)
    .sort((a, b) => Math.abs(a.variationDbRaw) - Math.abs(b.variationDbRaw))[0] || null;
}

// Numeric rank for P20 level sorting: FAIL = 0 (worst), L1-L4 = 1-4, unknown = 5.
// Sound Proof grades >4 dB as L1 (not FAIL) since P20 is not applicable at L1.
const p20LevelRank = (level) => {
  if (level === "FAIL") return 0;
  const match = String(level || "").match(/^L([1-4])$/);
  return match ? Number(match[1]) : 5;
};

export function p20WorstSeat(rows = []) {
  return rows.flatMap((row) => row.seats).filter((seat) => seat.level !== "—")
    .sort((a, b) => p20LevelRank(a.level) - p20LevelRank(b.level)
      || Math.abs(b.variationDbRaw) - Math.abs(a.variationDbRaw))[0] || null;
}

export function p20SummaryFromResults(perSeatP20Results = []) {
  const seats = (Array.isArray(perSeatP20Results) ? perSeatP20Results : []).filter(isRealP20Seat)
    .map((result, index) => ({ id: result.seatId, row: 1, column: index + 1 }));
  return p20WorstSeat(buildP20SeatRows(seats, perSeatP20Results));
}

export function buildP20BeforeAfter(seatingPositions, beforeResults, afterResults) {
  const beforeRows = buildP20SeatRows(seatingPositions, beforeResults);
  const afterRows = buildP20SeatRows(seatingPositions, afterResults);
  const before = beforeRows.flatMap((row) => row.seats);
  const after = afterRows.flatMap((row) => row.seats);
  const changedSeatIds = before.filter((seat, index) => seat.level !== after[index]?.level).map((seat) => seat.seatId);
  const deltas = before.map((seat, index) => {
    const beforeLevel = p20LevelRank(seat.level);
    const afterLevel = p20LevelRank(after[index]?.level);
    return Number.isFinite(beforeLevel) && Number.isFinite(afterLevel) ? afterLevel - beforeLevel : null;
  }).filter((delta) => delta != null && delta !== 0);
  const upCount = deltas.filter((delta) => delta > 0).length;
  const downCount = deltas.filter((delta) => delta < 0).length;
  const maxDelta = deltas.sort((a, b) => Math.abs(b) - Math.abs(a))[0] ?? 0;
  const direction = upCount && !downCount ? "up" : downCount && !upCount ? "down" : "mixed";
  return {
    beforeRows, afterRows, changedSeatIds, seatsAffected: changedSeatIds.length,
    summary: { changed: changedSeatIds.length, total: before.length, maxDelta, direction, upCount, downCount },
  };
}