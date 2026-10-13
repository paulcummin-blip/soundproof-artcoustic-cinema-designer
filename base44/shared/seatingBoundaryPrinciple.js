/**
 * seatingBoundaryPrinciple.js (shared)
 * ------------------------------------
 * PARAMETER 1, EXPLAINED: what seating clearance from the room boundaries is FOR,
 * and what it does not promise.
 *
 * WHY IT EXISTS. P1 is assessed at every seating position, and a report that
 * states only a distance and a level tells the client nothing about why the
 * seating sits where it sits. This module carries the design principle behind
 * that distance, reads the ACTUAL seating and room geometry the design records,
 * and composes a concise client-facing explanation of the practical benefit:
 *
 *   - the room's own low-frequency behaviour interacts with the wall a listener
 *     sits near, so the bass differs more from seat to seat;
 *   - reflections returning from that wall arrive sooner and stronger;
 *   - a listener sits closer to the surrounding loudspeakers;
 *   - the difference between one seat and the next grows.
 *
 * Suitable clearance reduces those effects. It never guarantees a better bass
 * result or a better design, because the seating also has to answer to the
 * viewing geometry, the loudspeaker positions, the number of seats, comfort and
 * access, the floor space available and the client's own priorities.
 *
 * WHAT IT IS NOT. It is not an engineering authority and it grades nothing: the
 * P1 distance and level come from `p1LevelAuthority` and `p1BoundaryGeometry`
 * exactly as before, and nothing here recalculates, re-grades or restates a
 * level. It states no measured acoustic outcome, and it never establishes why a
 * particular designer chose a seating position: that exists only where the
 * designer has recorded an explanation.
 *
 * THE TWO MEASUREMENTS ARE KEPT SEPARATE. The distance to the NEAREST boundary
 * is the one P1 assesses, and it may be a side wall, the front wall or the rear
 * wall. The distance to the wall BEHIND the seating is a different measurement
 * with its own acoustic meaning, and neither is ever inferred from the other.
 *
 * Pure: no React, no SDK, no timestamps, no runtime-specific APIs. Importable
 * from a backend function, from a report component and from tests.
 */

/** The principle generation, recorded wherever the principle is carried. */
export const SEATING_BOUNDARY_VERSION = '1.0';

/** The subject, named once, as the parameter is named in client-facing copy. */
export const SEATING_BOUNDARY_SUBJECT = 'Seating distance from the room boundaries';

/**
 * THE PRINCIPLE, in one statement. Carries no figure and no level, so it can be
 * handed to a writer as professional context exactly as it stands.
 */
export const SEATING_BOUNDARY_PRINCIPLE =
  'Seating set close to a room boundary carries four practical compromises. The room\'s own low-frequency '
  + 'behaviour interacts with the nearby wall, so the bass can differ more from one seat to the next. '
  + 'Reflections returning from that wall arrive sooner and stronger, which softens clarity and the sense of '
  + 'space. The listener sits closer to the surrounding loudspeakers, so the system wraps around the audience '
  + 'less evenly. And the difference between one seat and the next grows. Providing suitable clearance helps '
  + 'reduce all four, so the seating position is part of the acoustic design rather than a matter of fitting '
  + 'seats into the room.';

/** The four compromises, each stated on its own so copy can use the one that bites. */
export const SEATING_BOUNDARY_COMPROMISES = Object.freeze([
  'uneven bass response, because the room\'s own low-frequency behaviour interacts with the wall the listener sits near',
  'stronger early reflections from the nearby wall, which affect clarity and spatial presentation',
  'less separation between the listener and the surrounding loudspeakers, because the seat has less room around it',
  'greater differences in the listening experience between seating positions',
]);

/** What clearance is worth, and what it is not. */
export const SEATING_BOUNDARY_LIMITS =
  'Clearance is a design measure rather than a result: it reduces those compromises and never guarantees a '
  + 'particular bass response, a particular measured outcome or a better design overall. A room can be seated '
  + 'clear of every wall and still be limited elsewhere, and a closer seat can be the right answer where the '
  + 'viewing geometry or the client\'s priorities call for it.';

/** What the seating position has to balance, besides the boundary distance. */
export const SEATING_BOUNDARY_BALANCE = Object.freeze([
  'acoustic performance',
  'viewing angles and viewing distances',
  'the loudspeaker geometry, front and surround',
  'the number of seats the room has to hold',
  'comfort and access around the seating',
  'the floor space available',
  'the priorities the client has stated',
]);

/** The writing rules the explanation and any copy built from it are held to. */
export const SEATING_BOUNDARY_RULES = Object.freeze([
  'explain the practical benefit for the listener, never restate the distance or the RP22 level as if it were the benefit',
  'use the seating and room geometry the design records, and keep the distance to the nearest boundary separate from the distance to the wall behind the seating: they are different measurements and neither is inferred from the other',
  'relate the seating position to the viewing geometry and to where the surrounding loudspeakers are placed, because a seating row answers to all of them',
  'where clearance is limited, explain the compromise constructively: say what the seats near the boundary hear and where the seating sits, and never present the room as a fault or the design as worse than the evidence states',
  'where clearance is favourable, explain why it benefits the design rather than describing it as a score',
  'where the room leaves less space than the designer would like, acknowledge the balance between acoustic behaviour and the seats, the viewing distances and the space the client wants to keep',
  'never invent the reason a seating position was chosen: use a recorded designer explanation where one exists, and otherwise explain the principle and state where the seating sits',
  'never suggest that an RP22 level or a distance guarantees a particular measured acoustic result',
  'never let this become a paragraph repeated in every narrative: it belongs where a seating decision is being explained',
]);

/** The walls, named as the room drawing names them: the front wall carries the display. */
export const SEATING_BOUNDARY_WALLS = Object.freeze({
  front: 'front wall',
  rear: 'rear wall',
  left: 'left wall',
  right: 'right wall',
});

/**
 * How much clearance the geometry shows, read from the distances themselves. The
 * bands follow the spacing RP22 uses for P1, and they are used here ONLY to
 * choose the wording: no level is ever named in the explanation, and nothing is
 * re-graded.
 */
export const CLEARANCE_BANDS = Object.freeze([
  Object.freeze({ key: 'generous', min: 1.5 }),
  Object.freeze({ key: 'comfortable', min: 1.2 }),
  Object.freeze({ key: 'modest', min: 0.8 }),
  Object.freeze({ key: 'limited', min: 0.5 }),
  Object.freeze({ key: 'tight', min: 0 }),
]);

/** The band a distance falls in, or null where no distance is stated. */
export function clearanceBand(distanceM) {
  const value = Number(distanceM);
  if (!Number.isFinite(value) || value < 0) return null;
  const band = CLEARANCE_BANDS.find((entry) => value >= entry.min);
  return band ? band.key : null;
}

const FAVOURABLE_BANDS = Object.freeze(['generous', 'comfortable', 'modest']);

/** A room whose own size is the reason the seating cannot sit further out. */
const TIGHT_ROOM_LENGTH_M = 5.0;
const TIGHT_ROOM_WIDTH_M = 3.8;
/** Seats within this distance of one another in depth are one row. */
const ROW_BAND_M = 0.4;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** One decimal place, which is all a client explanation needs. */
function metres(value) {
  return `${Number(value).toFixed(1)}m`;
}

/** The seating point, read from either seat shape the app records. */
function seatPoint(seat, index) {
  const x = num(seat?.x ?? seat?.position?.x);
  const y = num(seat?.y ?? seat?.position?.y);
  if (x === null || y === null) return null;
  return {
    id: String(seat?.id ?? `seat-${index}`),
    label: String(seat?.label ?? seat?.id ?? `seat-${index}`),
    x,
    y,
    row: num(seat?.row ?? seat?.rowNumber),
    isPrimary: seat?.isPrimary === true,
  };
}

/**
 * READ THE ACTUAL GEOMETRY. Every distance is measured from the seating the
 * design records to the room walls, in the room's own coordinates (the front
 * wall carries the display, exactly as the plan drawings and the P1 boundary
 * authority read them). Nothing is graded and nothing is assumed: where the
 * seats or the room dimensions are missing, the geometry is simply unavailable.
 *
 * @param {Object} input
 * @param {Array} input.seats — the seating positions as the design records them
 * @param {{widthM:number,lengthM:number}} input.roomDims — the room rectangle
 * @returns {Object} the geometry, per seat and in summary
 */
export function readSeatBoundaryGeometry({ seats = [], roomDims = null } = {}) {
  const widthM = num(roomDims?.widthM);
  const lengthM = num(roomDims?.lengthM);

  const points = (Array.isArray(seats) ? seats : [])
    .map(seatPoint)
    .filter(Boolean);

  if (widthM === null || lengthM === null || widthM <= 0 || lengthM <= 0 || points.length === 0) {
    return {
      available: false,
      reason: points.length === 0 ? 'no_seating_recorded' : 'no_room_dimensions_recorded',
      room_width_m: widthM,
      room_length_m: lengthM,
      seat_count: points.length,
      row_count: 0,
      seats: [],
    };
  }

  const measured = points.map((point) => {
    const toWalls = [
      { boundary: 'front', boundary_m: point.y },
      { boundary: 'rear', boundary_m: lengthM - point.y },
      { boundary: 'left', boundary_m: point.x },
      { boundary: 'right', boundary_m: widthM - point.x },
    ];
    const nearest = toWalls.reduce((best, entry) => (entry.boundary_m < best.boundary_m ? entry : best));
    return {
      ...point,
      rear_wall_m: lengthM - point.y,
      nearest_boundary: nearest.boundary,
      nearest_boundary_m: nearest.boundary_m,
      nearest_boundary_label: SEATING_BOUNDARY_WALLS[nearest.boundary] || nearest.boundary,
    };
  });

  // Rows, in depth, so "the rear row" is the seating nearest the wall behind it
  // rather than a row number that happens to be recorded.
  const rows = [];
  for (const seat of [...measured].sort((a, b) => b.y - a.y)) {
    const row = rows.find((entry) => Math.abs(entry.y - seat.y) <= ROW_BAND_M);
    if (row) row.seats.push(seat);
    else rows.push({ y: seat.y, seats: [seat] });
  }
  const rearRow = rows[0] || null;

  const closestSeat = measured.reduce((best, seat) => (
    seat.nearest_boundary_m < best.nearest_boundary_m ? seat : best
  ));
  const rearRowRearWallM = rearRow
    ? Math.min(...rearRow.seats.map((seat) => seat.rear_wall_m))
    : null;
  const closestRearWallSeat = measured.reduce((best, seat) => (
    seat.rear_wall_m < best.rear_wall_m ? seat : best
  ));

  const clearance = clearanceBand(closestSeat.nearest_boundary_m);
  const rearClearance = clearanceBand(rearRowRearWallM);
  const roomIsConstraint = (
    lengthM < TIGHT_ROOM_LENGTH_M
    || widthM < TIGHT_ROOM_WIDTH_M
  ) && !FAVOURABLE_BANDS.includes(clearance);

  return {
    available: true,
    reason: null,
    room_width_m: widthM,
    room_length_m: lengthM,
    seat_count: measured.length,
    row_count: rows.length,
    multi_row: rows.length > 1,
    seats: measured,
    nearest_boundary_m: closestSeat.nearest_boundary_m,
    nearest_boundary: closestSeat.nearest_boundary,
    nearest_boundary_label: closestSeat.nearest_boundary_label,
    nearest_seat_id: closestSeat.id,
    // The two measurements, kept apart on purpose.
    rear_row_rear_wall_m: rearRowRearWallM,
    closest_rear_wall_m: closestRearWallSeat.rear_wall_m,
    rear_wall_is_nearest: closestSeat.nearest_boundary === 'rear',
    clearance,
    rear_clearance: rearClearance,
    room_is_constraint: roomIsConstraint,
    trade_off: roomIsConstraint,
  };
}

/**
 * The client-facing explanation of this project's seating clearance: the actual
 * distances, the principle behind them, and the balance where the room leaves
 * less space than the designer would like.
 *
 * Composed from the geometry, so two different rooms are explained differently
 * rather than sharing a paragraph. Never states a level, never promises a
 * measured result and never invents the designer's reason for the position.
 *
 * @param {Object} geometry — readSeatBoundaryGeometry output
 * @returns {{available:boolean, situation:string|null, trade_off:boolean, paragraph:string|null, sentences:Array<string>}}
 */
export function buildSeatingBoundaryExplanation(geometry) {
  if (!geometry || geometry.available !== true || geometry.nearest_boundary_m == null) {
    return { available: false, situation: null, trade_off: false, paragraph: null, sentences: [] };
  }

  const nearest = geometry.nearest_boundary_m;
  const wall = geometry.nearest_boundary_label || 'nearest wall';
  const band = geometry.clearance;
  const favourable = FAVOURABLE_BANDS.includes(band);
  const rearWallM = geometry.rear_row_rear_wall_m;
  const sentences = [];

  // 1. Where the seating actually sits, against its nearest boundary.
  if (band === 'generous') {
    sentences.push(`The seating is placed clear of the room's walls: the tightest position in the room still leaves ${metres(nearest)} to the ${wall}.`);
  } else if (band === 'comfortable') {
    sentences.push(`The seating holds a comfortable distance from the room's boundaries, with the closest position ${metres(nearest)} from the ${wall}.`);
  } else if (band === 'modest') {
    sentences.push(`The seating holds a workable distance from the room's boundaries, the closest position being ${metres(nearest)} from the ${wall}.`);
  } else {
    sentences.push(`The seating comes close to the room's boundaries in places, the nearest position being ${metres(nearest)} from the ${wall}.`);
  }

  // 2. What that distance does for the listener. The principle, in the terms a
  // client hears it in.
  if (favourable) {
    sentences.push(
      'That separation gives the room\'s lowest frequencies space to settle more evenly from seat to seat, '
      + 'and it holds the reflection returning from the nearest wall far enough back that it does not crowd '
      + 'the direct sound. It also leaves more room between the audience and the surrounding loudspeakers, so '
      + 'the seats hear a more similar presentation.',
    );
  } else {
    sentences.push(
      'Seats that close to a boundary hear more of the room\'s own low-frequency behaviour, and more of the '
      + 'reflection coming back from that wall, while sitting closer to the surrounding loudspeakers. Those '
      + 'positions are therefore the ones where the experience differs most from the rest of the seating.',
    );
  }

  // 3. The wall behind the seating, which is a different measurement from the
  // nearest boundary and the one that matters most for the low frequencies.
  if (rearWallM != null && (geometry.multi_row || geometry.rear_wall_is_nearest)) {
    sentences.push(geometry.multi_row
      ? `Behind the seating the distance that matters most to the low frequencies is held at ${metres(rearWallM)} from the rear row to the wall behind it.`
      : `Behind the seating, the distance that matters most to the low frequencies is ${metres(rearWallM)} from the row to the wall behind it.`);
  }

  // 4. The balance, where the room itself is the constraint, and the honest note
  // that clearance is a design measure rather than a promise, where it is not.
  if (geometry.trade_off) {
    sentences.push(
      'The room itself is what limits that clearance: seating further from the walls would take seats, '
      + 'viewing distance or floor space the client wants to keep. This arrangement favours the space the '
      + 'room can give while holding as much of the acoustic benefit as the dimensions allow, which is a '
      + 'balance of performance against the seating, the viewing geometry and the space available, rather '
      + 'than a search for the largest clearance the room could hold.',
    );
  } else {
    sentences.push('Clearance of this kind helps rather than guarantees: how the room behaves and where the loudspeakers sit still set the result.');
  }

  const situation = band === 'generous'
    ? 'generous_clearance'
    : band === 'comfortable'
      ? 'comfortable_clearance'
      : band === 'modest'
        ? 'workable_clearance'
        : band === 'limited'
          ? 'limited_clearance'
          : 'tight_clearance';

  return {
    available: true,
    situation,
    trade_off: geometry.trade_off === true,
    favourable,
    nearest_boundary_m: nearest,
    nearest_boundary: geometry.nearest_boundary,
    rear_wall_m: rearWallM,
    paragraph: sentences.join(' '),
    sentences,
  };
}

/**
 * The one-line statement of where the seating sits, for a surface that has room
 * for a clause rather than a paragraph.
 */
export function seatingBoundaryClause(geometry) {
  if (!geometry || geometry.available !== true || geometry.nearest_boundary_m == null) return null;
  const wall = geometry.nearest_boundary_label || 'nearest wall';
  const nearest = metres(geometry.nearest_boundary_m);
  if (geometry.trade_off) {
    return `The seating is set as clear of the ${wall} as the room allows, at ${nearest}, which keeps the low frequencies and the reflections behind the seating working for the room rather than against it`;
  }
  if (geometry.rear_row_rear_wall_m != null && geometry.multi_row) {
    return `The seating keeps ${nearest} from the ${wall} and ${metres(geometry.rear_row_rear_wall_m)} from the wall behind the rear row, which lets the room's low frequencies settle more evenly across the rows`;
  }
  return `The seating keeps ${nearest} from the ${wall}, which lets the room's low frequencies settle more evenly from seat to seat`;
}

export default buildSeatingBoundaryExplanation;