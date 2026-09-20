/**
 * Passive P1 Visual Report selector.
 *
 * Reads exact per-seat P1 rows from the published engineering summary and joins
 * them to geometry. Wall-distance zones remain presentation-only.
 */
const LEVEL_LABELS = {
  L4: "L4",
  L3: "L3",
  L2: "L2",
  L1: "L1",
  FAIL: "Below L1",
};
const LEVEL_RANK = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0 };

function normalizeSeat(seat) {
  if (!seat) return null;
  const x = Number(seat.x ?? seat.position?.x);
  const y = Number(seat.y ?? seat.position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { id: seat.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`, x, y };
}

export function selectClientRecommendedSeatingPosition({ engineeringSummary, seatingPositions, rsp }) {
  const published = engineeringSummary?.project?.reportCounts?.seatResultsByParameter?.p1 || [];
  const resultBySeat = new Map(published.map((result) => [String(result.seatId), result]));

  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map((raw) => {
      const base = normalizeSeat(raw);
      if (!base) return null;
      const result = resultBySeat.get(String(base.id));
      if (!result || result.status !== "scored") return null;
      const levelRaw = result.level || null;
      const distanceM = Number.isFinite(Number(result.value)) ? Number(result.value) : null;
      return {
        ...base,
        isPrimary: result.isPrimary === true,
        distanceM,
        formatted: result.valueFormatted || (distanceM == null ? null : `${distanceM.toFixed(2)}m`),
        level: LEVEL_LABELS[levelRaw] || null,
        levelRaw,
        rank: LEVEL_RANK[levelRaw] ?? -1,
      };
    })
    .filter(Boolean);

  return { seats, rsp, hasAny: seats.length > 0 };
}

export default selectClientRecommendedSeatingPosition;
