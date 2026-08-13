/**
 * seatPriorityAuthority.js
 * ------------------------
 * Canonical Primary / Secondary seat classification for Sound Proof.
 *
 * DESIGN INTENT
 *   Primary   — a normal/main listening position included when describing
 *               the performance delivered to the principal audience.
 *   Secondary — an occasional, overflow, bar, or otherwise lower-priority
 *               position the designer has explicitly classified as Secondary.
 *
 * A Secondary seat is NOT excluded from any calculation. It continues to
 * participate fully in RP22 per-seat analysis, bass simulation, speaker
 * coverage, compliance, and seat-to-seat consistency. The classification is
 * purely a descriptive distinction used when summarising the project.
 *
 * DATA AUTHORITY
 *   The canonical seat object lives on `appState.seatingPositions` in
 *   AppStateProvider. Each seat carries a `priority` field:
 *
 *     priority: "primary" | "secondary"
 *
 *   A seat with no stored priority (legacy projects) resolves to "primary",
 *   so old projects load without migration.
 *
 * RSP INDEPENDENCE
 *   Priority is a user classification independent of the internal Reference
 *   Seating Position / `isPrimary` flag. Every seat may be Primary or
 *   Secondary, including whichever seat is nearest the acoustic RSP.
 *
 * This module is the single shared helper consumed by the UI selector and
 * (in the next stage) by the report aggregation.
 */

export const PRIMARY = "primary";
export const SECONDARY = "secondary";

/**
 * Resolve a seat's priority to a canonical value.
 * Missing/invalid values resolve to PRIMARY so legacy projects load cleanly.
 * @param {object} seat
 * @returns {"primary" | "secondary"}
 */
export function resolveSeatPriority(seat) {
  const p = seat?.priority;
  return p === SECONDARY ? SECONDARY : PRIMARY;
}

/**
 * Toggle any seat's priority between Primary and Secondary.
 * Returns the SAME array reference when no change is made.
 *
 * @param {Array<object>} seats
 * @param {string} seatId
 * @returns {Array<object>} same ref if unchanged, new array otherwise
 */
export function toggleSeatPriority(seats, seatId) {
  if (!Array.isArray(seats) || !seatId) return seats;
  const idx = seats.findIndex((s) => s && s.id === seatId);
  if (idx === -1) return seats;
  const seat = seats[idx];
  const nextPriority = resolveSeatPriority(seat) === PRIMARY ? SECONDARY : PRIMARY;
  const next = seats.slice();
  next[idx] = { ...seat, priority: nextPriority };
  return next;
}

/**
 * All valid/evaluated seats. Secondary seats are NOT excluded — they remain
 * fully evaluated in every calculation. This helper is the canonical list the
 * report stage will consume.
 * @param {Array<object>} seats
 * @returns {Array<object>}
 */
export function getEvaluableSeats(seats) {
  return Array.isArray(seats) ? seats : [];
}

/**
 * Seats classified as Primary.
 * @param {Array<object>} seats
 * @returns {Array<object>}
 */
export function getPrimarySeats(seats) {
  return getEvaluableSeats(seats).filter((s) => resolveSeatPriority(s) === PRIMARY);
}

/**
 * Seats classified as Secondary.
 * @param {Array<object>} seats
 * @returns {Array<object>}
 */
export function getSecondarySeats(seats) {
  return getEvaluableSeats(seats).filter((s) => resolveSeatPriority(s) === SECONDARY);
}