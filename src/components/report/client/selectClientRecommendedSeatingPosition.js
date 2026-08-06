/**
 * selectClientRecommendedSeatingPosition
 * --------------------------------------
 * Pure selector for the P1 (Recommended Seating Position) client Visual Report.
 *
 * Reads the CANONICAL P1 result only:
 *   analysisResult.perSeatRp22[seatId].rp22[1]
 *
 * Does NOT recalculate P1 from the shaded wall-distance zones — those zones are
 * purely visual. The seat distance/level shown on the page comes exclusively
 * from the analysis engine's canonical per-seat P1 metric.
 *
 * Returns:
 *   {
 *     seats: [{ id, x, y, distanceM, formatted, level, levelRaw, rank, isStrongest }],
 *     rsp,
 *     hasAny: boolean
 *   }
 */

// Engine stores P1 level as a canonical string ("L4"/"L3"/"L2"/"L1"/"FAIL") or,
// on legacy paths, a numeric (4/3/2/1). Map both forms to the client-facing
// display label used by the shaded-zone legend. Do NOT alter the canonical
// level object — this only normalises for display/ranking.
const LEVEL_LABELS = {
  L4: "L4", L3: "L3", L2: "L2", L1: "L1", FAIL: "Below L1",
  4: "L4", 3: "L3", 2: "L2", 1: "L1",
};
const LEVEL_RANK = {
  L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0,
  4: 4, 3: 3, 2: 2, 1: 1,
};

function normalizeSeat(seat) {
  if (!seat) return null;
  const x = Number(seat.x ?? seat.position?.x);
  const y = Number(seat.y ?? seat.position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: seat.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`,
    x,
    y,
  };
}

export function selectClientRecommendedSeatingPosition({ analysisResult, seatingPositions, rsp }) {
  const perSeat = analysisResult?.perSeatRp22;

  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map((raw) => {
      const base = normalizeSeat(raw);
      if (!base) return null;

      const p1 = perSeat?.[base.id]?.rp22?.[1];
      const levelRaw = p1?.level;
      const distanceM = Number.isFinite(p1?.valueM)
        ? Number(p1.valueM)
        : Number.isFinite(p1?.value)
          ? Number(p1.value)
          : null;
      const formatted = p1?.formatted ?? (Number.isFinite(distanceM) ? `${distanceM.toFixed(2)}m` : null);
      const level = LEVEL_LABELS[levelRaw] ?? (levelRaw == null ? null : String(levelRaw));
      const rank = levelRaw in LEVEL_RANK ? LEVEL_RANK[levelRaw] : -1;

      return { ...base, distanceM, formatted, level, levelRaw, rank };
    })
    .filter(Boolean);

  const valid = seats.filter((s) => s.rank >= 0);
  const bestRank = valid.length ? Math.max(...valid.map((s) => s.rank)) : -1;
  valid.forEach((s) => {
    s.isStrongest = bestRank > 0 && s.rank === bestRank;
  });

  return { seats: valid, rsp, hasAny: valid.length > 0 };
}

export default selectClientRecommendedSeatingPosition;