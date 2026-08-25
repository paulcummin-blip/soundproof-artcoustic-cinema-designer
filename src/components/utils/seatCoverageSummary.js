/**
 * seatCoverageSummary.js
 * -----------------------
 * Presentation-layer helper that translates per-seat RP22 results into the
 * standard Sound Proof coverage summary:
 *
 *   "Primary Seats L3 · No seat lower than L2"
 *
 * The first term is the lowest achieved level across Primary seats.
 * The second term is the lowest achieved level across ALL evaluated seats
 * (Primary + Secondary).
 *
 * This is a PRESENTATION-ONLY module. It does not change any calculation,
 * ranking, minimum-seat logic, or authority. Internal fields such as
 * `worstSeat`, `worstPrimary`, `minLevel`, and ranking tuple fields are
 * preserved elsewhere and only translated at the presentation layer.
 */

import { PRIMARY, resolveSeatPriority } from "./seatPriorityAuthority";

/**
 * Numeric rank for an RP22 level string.
 * FAIL = 0 (worst), L1-L4 = 1-4, "—" or unknown = null (not evaluated).
 */
export function coverageLevelRank(level) {
  if (level === "FAIL" || level === 0) return 0;
  const match = String(level ?? "").match(/^L?([1-4])$/);
  return match ? Number(match[1]) : null;
}

/**
 * Convert a numeric rank (0-4) back to a display label.
 */
export function coverageRankToLabel(rank) {
  if (rank === null || rank === undefined) return "—";
  if (rank === 0) return "FAIL";
  return `L${rank}`;
}

/**
 * Lowest achieved level rank among a set of seat objects (each with `.level`
 * and `.priority`). Seats with "—" or null levels are skipped (not evaluated).
 * Returns null when no evaluated seats exist.
 */
export function lowestSeatLevelRank(seats) {
  const evaluated = (Array.isArray(seats) ? seats : [])
    .map((seat) => coverageLevelRank(seat?.level))
    .filter((rank) => rank !== null);
  if (!evaluated.length) return null;
  return Math.min(...evaluated);
}

/**
 * Lowest achieved level rank among PRIMARY seats only.
 */
export function lowestPrimarySeatLevelRank(seats) {
  return lowestSeatLevelRank(
    (Array.isArray(seats) ? seats : []).filter((seat) => resolveSeatPriority(seat) === PRIMARY),
  );
}

/**
 * Count seats at a given rank (FAIL = 0).
 */
function countSeatsAtRank(seats, rank) {
  return (Array.isArray(seats) ? seats : [])
    .filter((seat) => coverageLevelRank(seat?.level) === rank).length;
}

/**
 * Count FAIL seats (rank 0) among all evaluated seats.
 */
export function countFailSeats(seats) {
  return countSeatsAtRank(seats, 0);
}

/**
 * Count FAIL seats among Primary seats only.
 */
export function countFailPrimarySeats(seats) {
  return countFailAtRank(
    (Array.isArray(seats) ? seats : []).filter((seat) => resolveSeatPriority(seat) === PRIMARY),
    0,
  );
}

function countFailAtRank(seats, rank) {
  return countSeatsAtRank(seats, rank);
}

/**
 * Build the standard coverage summary string from a flat array of seat objects.
 *
 * Each seat object must have:
 *   - `.level`: "L1"-"L4" | "FAIL" | "—"
 *   - `.priority`: "primary" | "secondary" (optional, defaults to primary)
 *
 * Returns one of:
 *   "Primary Seats L4 · No seat lower than L4"
 *   "Primary Seats L3 · No seat lower than L2"
 *   "Primary Seats require improvement · No seat lower than FAIL"
 *   "Primary Seats L3 · One seat requires improvement"
 *   "Primary Seats L3 · 2 seats require improvement"
 *   "—" (when no seats are evaluated)
 */
export function formatCoverageSummary(seats) {
  const allSeats = Array.isArray(seats) ? seats : [];
  const primarySeats = allSeats.filter((seat) => resolveSeatPriority(seat) === PRIMARY);

  const primaryRank = lowestPrimarySeatLevelRank(allSeats);
  const allRank = lowestSeatLevelRank(allSeats);

  if (primaryRank === null && allRank === null) return "—";

  const primaryLabel = coverageRankToLabel(primaryRank);
  const allLabel = coverageRankToLabel(allRank);
  const failCount = countFailSeats(allSeats);
  const failPrimaryCount = countFailPrimarySeats(allSeats);

  // Primary seat failure — do not hide it.
  if (primaryRank === 0) {
    return `Primary Seats require improvement · No seat lower than FAIL`;
  }

  // All seats pass (no FAIL anywhere).
  if (failCount === 0) {
    return `Primary Seats ${primaryLabel} · No seat lower than ${allLabel}`;
  }

  // Some Secondary seats fail, Primary seats pass.
  if (failCount === 1) {
    return `Primary Seats ${primaryLabel} · One seat requires improvement`;
  }
  return `Primary Seats ${primaryLabel} · ${failCount} seats require improvement`;
}

/**
 * Build the coverage summary from P19/P20 seat rows (the structure returned
 * by buildP19SeatRows / buildP20SeatRows — an array of { row, seats: [...] }).
 */
export function formatCoverageSummaryFromRows(rows) {
  const seats = (Array.isArray(rows) ? rows : []).flatMap((row) => row?.seats || []);
  return formatCoverageSummary(seats);
}