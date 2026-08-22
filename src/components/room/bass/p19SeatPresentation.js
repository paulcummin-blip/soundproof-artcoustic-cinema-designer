import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";

const referenceIds = new Set(["rsp", "mlp", "synthetic-rsp", "synthetic_rsp"]);

const seatId = (value) => String(value ?? "").trim();
const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

function isRealP19Seat(seat) {
  const id = seatId(seat?.id ?? seat?.seatId).toLowerCase();
  return !!id && !referenceIds.has(id) && !seat?.__isSyntheticRsp && !seat?.isSyntheticRsp;
}

function rowNumber(seat) {
  const value = Number(seat?.row ?? seat?.rowNumber);
  return Number.isFinite(value) ? value : 1;
}

function columnNumber(seat, fallback) {
  const value = Number(seat?.column ?? seat?.col ?? seat?.indexInRow ?? seat?.seatNumber);
  return Number.isFinite(value) ? value : fallback;
}

export function p19LevelText(level) {
  const match = String(level ?? "").toUpperCase().match(/^L?([0-4])$/);
  if (!match) return "—";
  return Number(match[1]) === 0 ? "FAIL" : `L${match[1]}`;
}

export function formatAuthoritativeP19Result(result) {
  if (!finite(result?.variationDbRaw)) return "—";
  const designVal = resolveRp22DesignValue(19, Math.abs(Number(result.variationDbRaw)));
  return `±${designVal} dB`;
}

/**
 * Build per-seat P19 rows from seating positions and per-seat P19 results.
 * Each row contains seats with: seatId, row, column, priority, level, variationDbRaw, displayVariationDb.
 */
export function buildP19SeatRows(seatingPositions = [], perSeatP19Results = []) {
  const resultMap = new Map((Array.isArray(perSeatP19Results) ? perSeatP19Results : [])
    .filter(isRealP19Seat).map((result) => [seatId(result.seatId), result]));
  const rows = new Map();
  (Array.isArray(seatingPositions) ? seatingPositions : []).filter(isRealP19Seat).forEach((seat, index) => {
    const row = rowNumber(seat);
    if (!rows.has(row)) rows.set(row, []);
    const id = seatId(seat.id ?? seat.seatId);
    const result = resultMap.get(id) || null;
    rows.get(row).push({
      seatId: id,
      row,
      column: columnNumber(seat, index + 1),
      priority: resolveSeatPriority(seat),
      level: result && finite(result.variationDbRaw) ? p19LevelText(result.level) : "—",
      variationDbRaw: result && finite(result.variationDbRaw) ? Number(result.variationDbRaw) : null,
      displayVariationDb: result && finite(result.variationDbRaw) ? formatAuthoritativeP19Result(result) : "—",
      worstFrequencyHz: result && finite(result.worstFrequencyHz) ? Number(result.worstFrequencyHz) : null,
      source: result,
    });
  });
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([row, seats]) => ({
    row,
    seats: seats.sort((a, b) => a.column - b.column),
  }));
}

/**
 * Find the lowest-performing seat (highest deviation) from P19 per-seat rows.
 */
export function p19LowestSeat(rows = []) {
  return rows.flatMap((row) => row.seats).filter((seat) => seat.level !== "—" && seat.variationDbRaw != null)
    .sort((a, b) => Math.abs(b.variationDbRaw) - Math.abs(a.variationDbRaw))[0] || null;
}

/**
 * Extract the RSP P19 result from the p19 parameter.
 * Returns { level, value, displayValue } or null.
 */
export function p19RspResult(parameter) {
  if (!parameter || parameter.status !== "complete" || parameter.level == null || !finite(parameter.value)) return null;
  const designVal = resolveRp22DesignValue(19, Math.abs(Number(parameter.value)));
  return {
    level: Number(parameter.level) > 0 ? `L${parameter.level}` : "FAIL",
    value: Number(parameter.value),
    displayValue: `±${designVal} dB`,
  };
}