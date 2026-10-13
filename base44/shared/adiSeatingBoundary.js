/**
 * adiSeatingBoundary.js (shared)
 * ------------------------------
 * RP22 PARAMETER 1 AS THE INTERPRETATION STATES IT: where this design's seating
 * actually sits against the room's walls, and the principle behind that distance.
 *
 * WHY IT IS ITS OWN MODULE. `adiProjectInterpretation.js` assembles the design
 * story; this is one part of it, and it was split out for the same reason the
 * design philosophy was: each file stays readable.
 *
 * WHAT IT DOES, in two steps and no more:
 *   - it reads the FROZEN seating coordinates and the FROZEN room dimensions and
 *     measures two things that are deliberately kept apart: the distance from the
 *     seating to the NEAREST boundary, which is what P1 assesses and may be a side
 *     wall, and the distance to the wall BEHIND the seating, which carries its own
 *     low-frequency meaning;
 *   - it hands the writer the principle behind those distances, the compromises it
 *     reduces, what the seating has to balance, and what clearance does NOT
 *     establish.
 *
 * WHAT IT NEVER DOES. It grades nothing and states no level: the P1 distance and
 * level stay with `p1LevelAuthority` and `p1BoundaryGeometry`. It states no
 * measured acoustic outcome, and it never establishes why a particular designer
 * chose a seating position, which exists only where the designer has recorded an
 * explanation.
 *
 * Pure: no React, no SDK, no timestamps, no runtime-specific APIs.
 */

import {
  SEATING_BOUNDARY_BALANCE,
  SEATING_BOUNDARY_COMPROMISES,
  SEATING_BOUNDARY_LIMITS,
  SEATING_BOUNDARY_PRINCIPLE,
  SEATING_BOUNDARY_RULES,
  buildSeatingBoundaryExplanation,
  readSeatBoundaryGeometry,
} from './seatingBoundaryPrinciple.js';

/**
 * PARAMETER 1's two measurements, stated once. The nearest boundary is what P1
 * assesses; the wall behind the seating is a different measurement with its own
 * acoustic meaning, and one is never read from the other.
 */
export const SEATING_BOUNDARY_TWO_MEASUREMENTS =
  'the distance to the nearest room boundary and the distance to the wall behind the seating are two different '
  + 'measurements: the nearest boundary may be a side wall, the front wall or the rear wall, and neither distance '
  + 'is ever inferred from the other';

/** The one instruction the writer is held to over the seating clearance. */
export const SEATING_BOUNDARY_PROMPT_USE =
  '- Where a section explains the seating, use the seating clearance above: explain what the distance does for the '
  + 'listener rather than the measurement itself, keep the nearest boundary and the wall behind the seating as two '
  + 'separate measurements, write the balance between acoustic behaviour and the space the client keeps where the '
  + 'room is the constraint, and never state a level or a distance as a guarantee of a measured result. It belongs '
  + 'where a seating decision is being explained: never a paragraph repeated in every section.';

/** The situation, in the words the writer can use, never as a level. */
function situationText(block) {
  const base = {
    generous_clearance: 'the seating holds generous clearance from every boundary',
    comfortable_clearance: 'the seating holds a comfortable clearance from every boundary',
    workable_clearance: 'the seating holds a workable clearance, closer to the boundaries than a larger room would allow',
    limited_clearance: 'the seating comes close to the boundaries in places, which is the compromise this room imposes',
    tight_clearance: 'the seating is tight against the boundaries in places',
  }[block.situation] || 'the seating clearance is read from the recorded geometry';
  return block.trade_off
    ? `${base}, and the room itself is the constraint on how much clearance is available`
    : base;
}

const round2 = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : null);

/**
 * The seating-boundary block the interpretation carries, and the writer reads.
 *
 * @param {Object} input
 * @param {Object} input.snapshot — the frozen Engineering Snapshot
 * @param {{widthM:number,lengthM:number}} input.roomDims — the frozen room rectangle
 * @returns {Object} the block, frozen with the interpretation
 */
export function buildInterpretationSeatingBoundary({ snapshot = null, roomDims = null } = {}) {
  const geometry = readSeatBoundaryGeometry({
    seats: (Array.isArray(snapshot?.seats) ? snapshot.seats : []).map((seat) => ({
      id: seat?.id ?? null,
      x: seat?.position?.x ?? seat?.x,
      y: seat?.position?.y ?? seat?.y,
      row: seat?.row,
    })),
    roomDims,
  });
  const explanation = buildSeatingBoundaryExplanation(geometry);

  return {
    ...(geometry.available === true
      ? {
        available: true,
        situation: explanation.situation,
        trade_off: geometry.trade_off === true,
        seat_count: geometry.seat_count,
        row_count: geometry.row_count,
        room_width_m: round2(geometry.room_width_m),
        room_length_m: round2(geometry.room_length_m),
        nearest_boundary: geometry.nearest_boundary,
        nearest_boundary_label: geometry.nearest_boundary_label,
        nearest_boundary_m: round2(geometry.nearest_boundary_m),
        distance_to_rear_wall_m: round2(geometry.rear_row_rear_wall_m),
        rear_wall_is_the_nearest_boundary: geometry.rear_wall_is_nearest === true,
        room_is_the_constraint: geometry.room_is_constraint === true,
      }
      : {
        available: false,
        reason: geometry.reason,
      }),
    the_two_measurements: SEATING_BOUNDARY_TWO_MEASUREMENTS,
    principle: SEATING_BOUNDARY_PRINCIPLE,
    compromises: [...SEATING_BOUNDARY_COMPROMISES],
    limits: SEATING_BOUNDARY_LIMITS,
    balance: [...SEATING_BOUNDARY_BALANCE],
    rules: [...SEATING_BOUNDARY_RULES],
  };
}

/**
 * The seating clearance as prompt lines. It states where the seating sits and the
 * principle behind it, and it never states a level. Contains no em dashes.
 */
export function seatingBoundaryLines(block) {
  if (!block) return [];
  const lines = [
    '',
    'Seating clearance (RP22 Parameter 1: the design reason behind where the seating sits):',
  ];

  if (block.available === true) {
    lines.push(
      `  Where this design's seating sits: the nearest room boundary is the ${block.nearest_boundary_label || block.nearest_boundary} at ${block.nearest_boundary_m} m, and the seating keeps ${block.distance_to_rear_wall_m} m to the wall behind the rear row.`,
      `  This design's situation: ${situationText(block)}.`,
    );
  } else {
    lines.push('  Not stated: the frozen design records no seating coordinates or room dimensions, so no clearance is explained and none is invented.');
  }

  lines.push(
    `  The two measurements, never merged: ${block.the_two_measurements || SEATING_BOUNDARY_TWO_MEASUREMENTS}`,
    `  The principle: ${block.principle}`,
    `  What the seating has to balance: ${(block.balance || []).join('; ')}`,
    `  What clearance does not establish: ${block.limits}`,
    '  Rules for using it:',
    ...(block.rules || []).map((rule) => `  - ${rule}`),
  );

  return lines;
}

export default buildInterpretationSeatingBoundary;