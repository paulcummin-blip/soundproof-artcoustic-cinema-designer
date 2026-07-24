const referenceIds = new Set(["rsp", "mlp", "synthetic-rsp", "synthetic_rsp"]);

const seatId = (value) => String(value ?? "").trim();
const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

export function isRealP20Seat(seat) {
  const id = seatId(seat?.id ?? seat?.seatId).toLowerCase();
  return !!id && !referenceIds.has(id) && !seat?.__isSyntheticRsp && !seat?.isSyntheticRsp;
}

export function p20LevelText(level) {
  const match = String(level ?? "").toUpperCase().match(/^L?([1-4])$/);
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

export function formatAuthoritativeP20Result(result) {
  return finite(result?.variationDbRaw) ? `±${Math.abs(Number(result.variationDbRaw)).toFixed(1)} dB` : "—";
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

export function p20WorstSeat(rows = []) {
  return rows.flatMap((row) => row.seats).filter((seat) => seat.level !== "—")
    .sort((a, b) => Number(a.level.slice(1)) - Number(b.level.slice(1))
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
    const beforeLevel = Number(seat.level.slice(1));
    const afterLevel = Number(after[index]?.level?.slice(1));
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