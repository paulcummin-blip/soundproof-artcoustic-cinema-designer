// optimiserSeatingEvidence.js
// ---------------------------------------------------------------------------
// Pure builder for the SEATING evidence a saved Optimisation Plan carries.
//
// The optimiser's seating search moves the listener layout along the room length
// axis and evaluates the result canonically. Older plans persisted nothing of
// that movement, so a winner whose change was seating arrived back as "no change
// was recorded" — untruthful evidence, and nothing usable to apply.
//
// This module reformats ONLY what the run already evaluated: the evaluated seat
// positions (the destination) and the design's current seat positions (the
// origin). Every value written here was produced by the run. It moves nothing,
// evaluates nothing, scores nothing, re-grades nothing, and changes no bass
// maths, no P19/P20 definition and no RP22 threshold.
// ---------------------------------------------------------------------------

import { OPTIMISER_LEVER } from "./optimiserPlanConstants.js";
import { validateSeatingPositions } from "../improveBassV2/seatingPositionSearch.js";

/** Below this the seats are treated as unmoved. */
export const SEATING_MOVE_TOLERANCE_M = 0.005;

/** What the seating destinations were checked against. */
export const SEATING_VALIDATION_BASIS = "room bounds and screen clearance";

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const round3 = (value) => (value == null ? null : Math.round(value * 1000) / 1000);

/** Seats carry a flat `y` in app state; `y_m` is the legacy spelling. */
const seatY = (seat) => num(seat?.y ?? seat?.y_m);
const seatX = (seat) => num(seat?.x ?? seat?.x_m);

/** A stable, human label for one seat, used in the persisted change rows. */
export function seatMovementLabel(seat, index) {
  const named = seat?.label || seat?.name || null;
  if (named) return String(named);
  const row = num(seat?.rowNumber);
  return row != null ? `Row ${row} seat ${index + 1}` : `Seat ${index + 1}`;
}

/** "toward the screen" / "away from the screen", or null when nothing moved. */
export function seatingDirectionText(deltaM) {
  const delta = num(deltaM);
  if (delta == null || Math.abs(delta) < SEATING_MOVE_TOLERANCE_M) return null;
  return delta < 0 ? "toward the screen" : "away from the screen";
}

/** "Move the seating 100 mm toward the screen", or null when nothing moved. */
export function seatingMovementText(offsetMm) {
  const mm = num(offsetMm);
  if (mm == null || Math.abs(mm) < 5) return null;
  return `Move the seating ${Math.round(Math.abs(mm))} mm ${mm < 0 ? "toward the screen" : "away from the screen"}`;
}

/**
 * The seating movement a candidate evaluated, with the previous and evaluated
 * position of every affected seat.
 *
 * Returns null when the run produced no seating movement at all — no change is
 * ever invented from an offset that was not evaluated.
 *
 * @param {object} params
 * @param {object|null} [params.seatingResult] - the run's confirmed seating result
 * @param {object|null} [params.winner] - the final winning candidate (may carry seating)
 * @param {Array} [params.seatingPositions] - the design's CURRENT seat positions
 */
export function buildSeatingMovement({
  seatingResult = null,
  winner = null,
  seatingPositions = [],
} = {}) {
  const source = seatingResult || winner || null;
  if (!source) return null;

  const destination = Array.isArray(source.seatingPositions) ? source.seatingPositions : null;
  const current = Array.isArray(seatingPositions) ? seatingPositions : [];
  const declaredOffsetMm = num(source.seatingOffsetMm);
  const declaredOffsetM = declaredOffsetMm != null ? declaredOffsetMm / 1000 : null;

  // The destination positions are what makes the movement applyable. Without
  // them the offset is reported as a fact and no seat row is fabricated.
  if (!destination || destination.length === 0) {
    if (declaredOffsetM == null) return null;
    const offsetMm = Math.round(declaredOffsetM * 1000);
    return {
      seatingOffsetMm: offsetMm,
      wholeBlockMoved: false,
      seatsKnown: false,
      seatIds: [],
      changes: [],
      movementLabel: seatingMovementText(offsetMm),
    };
  }

  const byId = new Map();
  current.forEach((seat) => {
    if (seat?.id != null) byId.set(String(seat.id), seat);
  });

  const deltas = [];
  const changes = destination
    .map((seat, index) => {
      const toY = seatY(seat);
      if (toY == null) return null;
      const currentSeat = seat?.id != null ? byId.get(String(seat.id)) : (current[index] || null);
      // The origin is the design's own seat where it is known. When it is not,
      // it is reconstructed from the offset the run itself declared.
      const fromY = seatY(currentSeat)
        ?? (declaredOffsetM != null ? round3(toY - declaredOffsetM) : null);
      const deltaM = fromY != null ? round3(toY - fromY) : null;
      if (deltaM != null) deltas.push(deltaM);
      return {
        lever: OPTIMISER_LEVER.SEATING,
        seatId: seat?.id != null ? String(seat.id) : `seat-${index + 1}`,
        label: seatMovementLabel(seat, index),
        fromX: round3(seatX(currentSeat)),
        fromY: round3(fromY),
        toX: round3(seatX(seat)),
        toY: round3(toY),
        deltaMm: deltaM != null ? Math.round(deltaM * 1000) : null,
        direction: seatingDirectionText(deltaM),
      };
    })
    .filter(Boolean);

  const moved = changes.filter((change) => change.deltaMm != null && Math.abs(change.deltaMm) >= 5);
  if (moved.length === 0) return null;

  // "The whole block moved" means every seat travelled the same distance in the
  // same direction. A per-seat difference is reported as it is, never averaged
  // away into a block movement.
  const sameDelta = deltas.length === moved.length
    && deltas.every((delta) => Math.abs(delta - deltas[0]) < SEATING_MOVE_TOLERANCE_M);
  const seatingOffsetMm = sameDelta
    ? Math.round(deltas[0] * 1000)
    : (declaredOffsetMm != null
      ? Math.round(declaredOffsetMm)
      : Math.round(moved.reduce((sum, change) => sum + change.deltaMm, 0) / moved.length));

  return {
    seatingOffsetMm,
    wholeBlockMoved: sameDelta,
    seatsKnown: true,
    seatIds: moved.map((change) => change.seatId),
    changes,
    movementLabel: seatingMovementText(seatingOffsetMm),
  };
}

/**
 * Whether every destination seat position is still a legal position.
 *
 * `valid: null` means the geometry could not be re-checked here; the basis states
 * that the optimiser validated the candidate before evaluating it, which is what
 * actually happened. It is never reported as "valid" on its own authority.
 */
export function seatingDestinationsValid({
  changes = [],
  roomDims = null,
  screenWall = "front",
} = {}) {
  const rows = Array.isArray(changes) ? changes : [];
  if (rows.length === 0) return { valid: null, reason: null, basis: null };
  const complete = rows.every((row) => Number.isFinite(Number(row?.toY)));
  if (!roomDims || !complete) {
    return { valid: null, reason: null, basis: "validated by the optimiser before evaluation" };
  }
  const seats = rows.map((row, index) => ({
    id: row.seatId,
    x: Number.isFinite(Number(row.toX)) ? Number(row.toX) : 0,
    y: Number(row.toY),
    rowNumber: index,
  }));
  const reason = validateSeatingPositions(seats, roomDims, screenWall);
  return { valid: !reason, reason: reason || null, basis: SEATING_VALIDATION_BASIS };
}

/**
 * The seating component of a COMBINED winner, so the winning change is stated
 * with the rest of the combined candidate rather than inferred from the lever.
 */
export function buildSeatingComponent({ winner = null, seatingPositions = [] } = {}) {
  if (!winner) return null;
  const movement = buildSeatingMovement({ winner, seatingPositions });
  if (!movement) return null;
  return {
    sourceCandidateId: winner.candidateId || null,
    seatingOffsetMm: movement.seatingOffsetMm,
    wholeBlockMoved: movement.wholeBlockMoved,
    seatsKnown: movement.seatsKnown,
    seatIds: movement.seatIds,
    changes: movement.changes,
  };
}