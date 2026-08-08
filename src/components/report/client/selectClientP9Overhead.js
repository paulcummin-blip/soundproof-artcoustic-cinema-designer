/**
 * selectClientP9Overhead
 * -----------------------
 * Pure selector for the P9 Overhead Speaker Spacing Visual Report page.
 *
 * Maps real-seat geometry + canonical P9 values from the engine's perSeatRp22.
 *
 * Authority:
 *   P9: analysisResult.perSeatRp22[seat.id].rp22[9]
 *
 * P9 thresholds (RP22):
 *   L4 <= 50°, L3 <= 60°, L2 <= 80°, >80° = FAIL (Level 1 is N/A for P9)
 *
 * No interpolation, no regrading, no local recomputation.
 * Reads perSeatRp22 directly — does not recalculate P9.
 *
 * Excludes: synthetic mlp, malformed seats, missing seat IDs.
 */
import { resolveCoordinate } from "./selectClientSpeakerBalance";

const LEVEL_RANK = { L4: 4, L3: 3, L2: 2, FAIL: 1 };

/**
 * Map a raw engine P9 level to a display level.
 * Engine produces numeric 1 for >80°, but RP22 P9 Level 1 is N/A — display as FAIL.
 */
function normalizeP9Level(rawLevel) {
  if (rawLevel === null || rawLevel === undefined) return null;
  const n = typeof rawLevel === "number"
    ? rawLevel
    : parseInt(String(rawLevel).replace(/[^0-9]/g, ""), 10);
  if (Number.isFinite(n)) {
    if (n === 4) return "L4";
    if (n === 3) return "L3";
    if (n === 2) return "L2";
    if (n === 1) return "FAIL"; // >80° — below L2, not L1
  }
  const s = String(rawLevel).trim().toUpperCase();
  if (s === "FAIL") return "FAIL";
  return null;
}

function resolveDegrees(param) {
  if (!param || typeof param !== "object") return null;
  const v = param.value;
  return Number.isFinite(v) ? v : null;
}

function isApplicableP9(param) {
  if (!param || typeof param !== "object") return false;
  if (param.applicable === false) return false;
  const level = normalizeP9Level(param.level);
  if (level === null) return false;
  if (level === "FAIL") return true;
  return resolveDegrees(param) !== null;
}

/**
 * Build a client-facing summary from the actual per-seat distribution.
 * Does NOT invent a room-level P9 grade.
 */
function buildSummary(seats) {
  const assessed = seats.filter((s) => s.p9Level !== null);
  if (assessed.length === 0) {
    return "This layout uses one overhead row, so spacing between rows is not assessed.";
  }

  const levelCounts = {};
  for (const s of assessed) {
    levelCounts[s.p9Level] = (levelCounts[s.p9Level] || 0) + 1;
  }
  const levels = Object.keys(levelCounts);

  if (levels.length === 1) {
    return `All seats achieve ${levels[0]} overhead speaker spacing.`;
  }

  const sorted = [...levels].sort((a, b) => LEVEL_RANK[b] - LEVEL_RANK[a]);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const bestCount = levelCounts[best];
  const worstCount = levelCounts[worst];

  const primary = assessed.filter((s) => s.isPrimary);
  const primaryBest = primary.length > 0 && primary.every((s) => s.p9Level === best);

  if (primaryBest && best !== worst) {
    return `Overhead continuity is strongest through the primary seating (${best}), with ${worstCount} seat${worstCount > 1 ? "s" : ""} achieving ${worst}.`;
  }

  return `${bestCount} of ${assessed.length} seats achieve ${best} overhead spacing, with ${worstCount} at ${worst}.`;
}

/**
 * Pure selector for the P9 Overhead client page.
 *
 * @param {Object} analysisResult   - from useRP22AnalysisEngine
 * @param {Array}  seatingPositions - original full-precision seat array
 * @returns {Object} { seats, counts, hasAnyValidResult, summary }
 */
export function selectClientP9Overhead({ analysisResult, seatingPositions }) {
  const empty = {
    seats: [],
    counts: {},
    hasAnyValidResult: false,
    summary: "This layout uses one overhead row, so spacing between rows is not assessed.",
  };

  if (!analysisResult || !Array.isArray(seatingPositions)) return empty;

  const perSeat = analysisResult.perSeatRp22 || {};

  const validSeats = seatingPositions.filter((s) => {
    if (!s || s.id == null) return false;
    if (s.id === "mlp") return false;
    const x = resolveCoordinate(s.x, s.position?.x);
    const y = resolveCoordinate(s.y, s.position?.y);
    return x !== null && y !== null;
  });

  const seats = validSeats.map((seat) => {
    const seatData = perSeat[seat.id];
    const rp22 = seatData?.rp22 || {};
    const rawP9 = rp22[9];

    const x = resolveCoordinate(seat.x, seat.position?.x);
    const y = resolveCoordinate(seat.y, seat.position?.y);

    const applicable = isApplicableP9(rawP9);
    const level = applicable ? normalizeP9Level(rawP9.level) : null;
    const degrees = applicable ? resolveDegrees(rawP9) : null;

    return {
      id: seat.id,
      x,
      y,
      isPrimary: seatData?.isPrimary || seat.isPrimary || false,
      isSecondary: seatData?.isSecondary || seat.isSecondary || false,
      p9Level: level,
      p9Degrees: degrees,
      applicable,
    };
  });

  const counts = {};
  for (const seat of seats) {
    const key = seat.p9Level || "not_assessed";
    counts[key] = (counts[key] || 0) + 1;
  }

  const hasAnyValidResult = seats.some((s) => s.p9Level !== null);
  const summary = buildSummary(seats);

  return { seats, counts, hasAnyValidResult, summary };
}