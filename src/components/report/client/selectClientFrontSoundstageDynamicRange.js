/**
 * selectClientFrontSoundstageDynamicRange
 * ---------------------------------------
 * Pure selector for the Front Soundstage Dynamic Range client Visual Report.
 *
 * Reads the CANONICAL per-seat LCR SPL values only:
 *   allSeatSplMetrics.get(seatId).spl.screen.{FL,FC,FR}.value
 *
 * Does NOT recalculate SPL. The front soundstage value is the limiting LCR
 * channel (Math.min of the already-calculated FL/FC/FR values), graded against
 * the RP22 P12 presentation thresholds for client-facing display only.
 *
 * Returns:
 *   {
 *     seats: [{ id, x, y, spl, formatted, level, rank, isStrongest }],
 *     rsp,
 *     hasAny: boolean
 *   }
 */

// P12 presentation thresholds (client-facing display only — does not modify
// the RP22 engine's room-scope P12 grading).
// L4: >=111, L3: >=108, L2: >=105, L1: >=102, Below L1: <102
const LEVEL_LABELS = {
  L4: "L4", L3: "L3", L2: "L2", L1: "L1", FAIL: "Below L1",
};
const LEVEL_RANK = {
  L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0,
};

function gradeFrontSpl(db) {
  if (!Number.isFinite(db)) return { level: null, rank: -1 };
  if (db >= 111) return { level: "L4", rank: 4 };
  if (db >= 108) return { level: "L3", rank: 3 };
  if (db >= 105) return { level: "L2", rank: 2 };
  if (db >= 102) return { level: "L1", rank: 1 };
  return { level: "FAIL", rank: 0 };
}

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

function readScreenSpl(allSeatSplMetrics, seatId) {
  if (!allSeatSplMetrics || typeof allSeatSplMetrics.get !== "function") return null;
  const entry = allSeatSplMetrics.get(seatId);
  const screen = entry?.spl?.screen;
  if (!screen) return null;
  const fl = Number.isFinite(screen.FL?.value) ? Number(screen.FL.value) : null;
  const fc = Number.isFinite(screen.FC?.value) ? Number(screen.FC.value) : null;
  const fr = Number.isFinite(screen.FR?.value) ? Number(screen.FR.value) : null;
  // Also tolerate legacy L/C/R keys
  const l = fl ?? (Number.isFinite(screen.L?.value) ? Number(screen.L.value) : null);
  const c = fc ?? (Number.isFinite(screen.C?.value) ? Number(screen.C.value) : null);
  const r = fr ?? (Number.isFinite(screen.R?.value) ? Number(screen.R.value) : null);
  const values = [l, c, r].filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  return Math.min(...values);
}

export function selectClientFrontSoundstageDynamicRange({ allSeatSplMetrics, seatingPositions, rsp }) {
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map((raw) => {
      const base = normalizeSeat(raw);
      if (!base) return null;

      const rawSpl = readScreenSpl(allSeatSplMetrics, base.id);
      if (rawSpl === null || !Number.isFinite(rawSpl)) return null;

      const spl = Math.ceil(rawSpl); // whole dB, matches engine P12 rounding
      const { level, rank } = gradeFrontSpl(rawSpl);
      const formatted = `${spl} dB`;

      return {
        ...base,
        spl,
        formatted,
        level: LEVEL_LABELS[level] ?? level,
        rank,
        isStrongest: false,
      };
    })
    .filter(Boolean);

  const valid = seats.filter((s) => s.rank >= 0);
  const bestRank = valid.length ? Math.max(...valid.map((s) => s.rank)) : -1;
  valid.forEach((s) => {
    s.isStrongest = bestRank > 0 && s.rank === bestRank;
  });

  return { seats: valid, rsp, hasAny: valid.length > 0 };
}

export default selectClientFrontSoundstageDynamicRange;