const referenceIds = new Set(["rsp", "mlp", "synthetic-rsp", "synthetic_rsp"]);

const seatId = (value) => String(value ?? "").trim();
const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

export function isRealP20Seat(seat) {
  const id = seatId(seat?.id ?? seat?.seatId).toLowerCase();
  return !!id && !referenceIds.has(id) && !seat?.__isSyntheticRsp && !seat?.isSyntheticRsp;
}

export function p20LevelText(level) {
  // Grading text is owned by the canonical P20 display authority so the pill,
  // tooltip, marker and reports can never disagree about a level.
  return p20GradeText(level);
}

function rowNumber(seat) {
  const value = Number(seat?.row ?? seat?.rowNumber);
  return Number.isFinite(value) ? value : 1;
}

function columnNumber(seat, fallback) {
  const value = Number(seat?.column ?? seat?.col ?? seat?.indexInRow ?? seat?.seatNumber);
  if (Number.isFinite(value)) return value;
  const idMatch = seatId(seat?.id ?? seat?.seatId).match(/-c(\d+)$/i);
  if (idMatch) return Number(idMatch[1]);
  const x = Number(seat?.x ?? seat?.position?.x);
  return Number.isFinite(x) ? x : fallback;
}

import { p20GradeText, resolveP20SeatDisplay } from "@/components/room/bass/p20DisplayAuthority";
import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";

export function formatAuthoritativeP20Result(result) {
  // Single source of truth: the canonical P20 display authority owns the
  // Integer Floor Policy rounding. This function exists only so existing
  // consumers keep their import surface.
  return resolveP20SeatDisplay(result)?.displayVariationText ?? "—";
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
    // One display object per seat: every surface reads this, never its own rounding.
    const display = result ? resolveP20SeatDisplay(result, { seatingPosition: seat }) : null;
    rows.get(row).push({
      seatId: id,
      row,
      column: columnNumber(seat, index + 1),
      priority: resolveSeatPriority(seat),
      level: display ? display.grade : "—",
      variationDbRaw: display ? display.exactDeviationDb : null,
      displayVariationDb: display ? display.displayVariationText : "—",
      worstFrequencyHz: display ? display.limitingFrequencyHz : null,
      comparisonPointCount: result && finite(result.comparisonPointCount) ? Number(result.comparisonPointCount) : null,
      p20Display: display,
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

/**
 * The OVERALL worst all-seat P20, always stated explicitly so a selected seat
 * can never be mistaken for the project's worst seat.
 * e.g. "Worst all-seat P20: R1S2 ±12.2 dB at 73 Hz"
 */
export function formatWorstAllSeatP20Line(rows = []) {
  const worst = p20WorstSeat(rows);
  if (!worst) return null;
  const display = worst.p20Display || resolveP20SeatDisplay(worst.source || worst, { isAllSeatWorst: true });
  const hz = display?.displayFrequencyText ? ` at ${display.displayFrequencyText}` : "";
  return `Worst all-seat P20: ${display?.seatId || worst.seatId} ${display?.displayVariationText || worst.displayVariationDb}${hz}`;
}

/**
 * The selected seat's own P20 result, labelled as a selection so it is never
 * presented as the overall worst seat.
 * e.g. "Selected seat: R2S4 ±10.2 dB at 45 Hz"
 */
export function formatSelectedSeatP20Line(rows = [], selectedSeatId = null) {
  if (!selectedSeatId) return null;
  const seat = rows.flatMap((row) => row.seats).find((entry) => entry.seatId === selectedSeatId);
  if (!seat || seat.variationDbRaw == null) return null;
  const display = seat.p20Display || resolveP20SeatDisplay(seat.source || seat, { selectedSeatId });
  const hz = display?.displayFrequencyText ? ` at ${display.displayFrequencyText}` : "";
  return `Selected seat: ${seat.seatId} ${display?.displayVariationText || seat.displayVariationDb}${hz}`;
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