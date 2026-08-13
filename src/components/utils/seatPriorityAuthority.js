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
 * RSP RULE
 *   The Reference Seating Position (the seat with `isPrimary === true`,
 *   determined by enforceOnePrimary / computeMLPAndPrimary) must always
 *   resolve to Primary. `enforceRspPriority` guarantees this at the data
 *   level. The UI must also prevent toggling the RSP to Secondary.
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
 * Is this seat the current RSP?
 * The RSP is the seat flagged `isPrimary === true` by the canonical
 * RSP selection (enforceOnePrimary / computeMLPAndPrimary).
 * @param {object} seat
 * @returns {boolean}
 */
export function isRspSeat(seat) {
  return Boolean(seat && seat.isPrimary === true);
}

/**
 * Enforce that the RSP seat (isPrimary === true) has priority === "primary".
 * Returns the SAME array reference when no change is needed (so it is safe to
 * use inside React state setters and effects without causing render loops).
 *
 * This does NOT change which seat is the RSP — it only guarantees the RSP
 * seat's priority classification. The previous RSP (if it loses isPrimary)
 * keeps its existing explicit priority; Primary is the safe fallback when no
 * reliable prior value exists.
 *
 * @param {Array<object>} seats
 * @returns {Array<object>} same ref if unchanged, new array otherwise
 */
export function enforceRspPriority(seats) {
  if (!Array.isArray(seats) || seats.length === 0) return seats;
  const rspIdx = seats.findIndex((s) => s && s.isPrimary === true);
  if (rspIdx === -1) return seats; // no RSP seat present — nothing to enforce
  const rsp = seats[rspIdx];
  if (resolveSeatPriority(rsp) === PRIMARY) return seats; // already primary
  const next = seats.slice();
  next[rspIdx] = { ...rsp, priority: PRIMARY };
  return next;
}

/**
 * Toggle a seat's priority between Primary and Secondary.
 * The RSP seat can never become Secondary — toggling it is a no-op.
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
  // RSP can never become Secondary
  if (isRspSeat(seat)) return seats;
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