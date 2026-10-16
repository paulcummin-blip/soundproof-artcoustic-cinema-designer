/**
 * reportGeometryContext.js (shared)
 * ---------------------------------
 * THE FROZEN GEOMETRY CONTEXT a report narrative may be written from.
 *
 * WHY IT EXISTS. The Project Report's own ADI Design Highlights explain the seating
 * decision in THIS design's own terms: where the seating actually sits, how far the
 * nearest boundary is, and how far the rear row sits from the wall behind it. The
 * report page reads that geometry from the live design, and it is the same geometry
 * the report and its drawings were produced from.
 *
 * A narrative written off the page cannot see it: the frozen evidence pack carries
 * the published RP22 and RP23 results, and the seating decision is explained from the
 * room the seats stand in. So the geometry is supplied to the writer as its OWN
 * block, beside — never inside — the frozen engineering evidence, and it is FROZEN
 * with the accepted narrative, so a narrative written in one room can never be shown
 * as if it described another.
 *
 * WHERE IT COMES FROM. The geometry is read from the frozen Project Report evidence
 * itself — the exact room dimensions and seat coordinates that report and its
 * drawings were produced from — and then CONFIRMED against the saved design version's
 * own design state. Where the version states geometry that disagrees with the report,
 * the geometry is not used at all: a narrative is never written from a room the saved
 * report does not describe.
 *
 * WHAT IT IS NOT. Design context only. It is never engineering evidence: no RP22
 * result, no Performance Level, no loudspeaker capability, no acoustic outcome and no
 * precise measurement is read from it. THE TWO SEATING MEASUREMENTS ARE KEPT APART:
 * the distance to the NEAREST boundary (which is what P1 assesses, and may be a side
 * wall, the front wall or the rear wall) is a different measurement from the distance
 * to the wall BEHIND the seating, and neither is ever inferred from the other.
 *
 * Pure: no React, no SDK, no timestamps, no runtime-specific APIs. Importable from a
 * backend function, from a report component and from tests.
 */

import { readSeatBoundaryGeometry } from '../seatingBoundaryPrinciple.js';

/** The geometry-context generation, recorded wherever a context is carried. */
export const REPORT_GEOMETRY_CONTEXT_VERSION = '1.0';

/** The one rule the writer is held to over the geometry block. */
export const REPORT_GEOMETRY_CONTEXT_RULE =
  'this is where the seating sits in the room that produced the saved report, read from that report\'s own saved '
  + 'geometry: use it only to explain the seating position in this room\'s own terms, and never as engineering '
  + 'evidence. It states no RP22 result, no Performance Level, no loudspeaker capability and no measured acoustic '
  + 'outcome, and the distance to the nearest boundary is never read from the distance to the wall behind the '
  + 'seating, or the other way round';

/** The two seating measurements, stated once, for the block and for the copy. */
export const REPORT_GEOMETRY_TWO_MEASUREMENTS_RULE =
  'the distance to the nearest boundary is the one P1 assesses and it may be a side wall, the front wall or the rear '
  + 'wall; the distance to the wall behind the seating is a different measurement with its own low-frequency '
  + 'meaning. They are stated as two separate measurements and neither is inferred from the other';

/** How the saved version's own geometry stands against the report's. */
export const GEOMETRY_AGREEMENT = Object.freeze({
  MATCHED: 'matched',
  MISMATCH: 'mismatch',
  NOT_STATED: 'not_stated',
});

/** Why a context carries no usable geometry. */
export const GEOMETRY_REFUSAL = Object.freeze({
  NO_REPORT_GEOMETRY: 'report_geometry_not_recorded',
  VERSION_MOVED: 'saved_version_geometry_disagrees_with_the_report',
});

/** The coordinates agree to the centimetre, which is all a seating plan states. */
const TOLERANCE_M = 0.01;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Three decimals: a seating plan's own precision, and float noise removed. */
function round3(value) {
  const n = num(value);
  return n === null ? null : Number(n.toFixed(3));
}

/** Parse a value the design state may store as JSON text or as an object. */
function parseMaybe(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Deterministic key order, so the same geometry always fingerprints identically. */
function canonicalise(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort().filter((key) => value[key] !== undefined);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalise(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * ONE seat, normalised. The app records a seat either as a plan point ({x, y}) or as
 * a report-evidence point ({position: {x_m, y_m}}), and both are read here into the
 * same shape so the two sides can never fingerprint the same seat differently.
 */
function normalisedSeat(seat, index) {
  const x = round3(num(seat?.x ?? seat?.x_m ?? seat?.position?.x ?? seat?.position?.x_m));
  const y = round3(num(seat?.y ?? seat?.y_m ?? seat?.position?.y ?? seat?.position?.y_m));
  if (x === null || y === null) return null;
  const id = String(seat?.id ?? seat?.seat_id ?? `seat-${index + 1}`);
  const label = String(seat?.label ?? seat?.seat_label ?? id);
  const row = num(seat?.row ?? seat?.rowNumber ?? seat?.row_number);
  return { seat_id: id, label, row: row === null ? null : Math.round(row), x_m: x, y_m: y };
}

/** The room rectangle, normalised, from either naming the app records. */
function normalisedRoom(room) {
  return {
    width_m: round3(num(room?.width_m ?? room?.widthM)),
    length_m: round3(num(room?.length_m ?? room?.lengthM)),
    height_m: round3(num(room?.height_m ?? room?.heightM)),
    volume_m3: round3(num(room?.volume_m3 ?? room?.volumeM3)),
  };
}

/**
 * THE GEOMETRY THE SAVED REPORT STATES: its own room rectangle and its own seat
 * coordinates, exactly as the report froze them. Nothing is inferred: a room the
 * evidence does not state stays null, and a seat the evidence does not place is
 * dropped rather than placed.
 */
export function readReportGeometry(reportEvidence) {
  const perSeat = Array.isArray(reportEvidence?.seating?.per_seat) ? reportEvidence.seating.per_seat : [];
  return {
    room: normalisedRoom(reportEvidence?.room),
    seats: perSeat.map(normalisedSeat).filter(Boolean),
  };
}

/**
 * THE GEOMETRY THE SAVED VERSION HOLDS NOW, read from its own design state. It is
 * read only to CONFIRM the report's geometry, never to replace it, and a version
 * that states none simply confirms nothing.
 */
export function readVersionGeometry(version) {
  const state = parseMaybe(version?.design_state) || {};
  const dims = parseMaybe(state.roomDims) || {};
  const seats = Array.isArray(state.seating_positions)
    ? state.seating_positions
    : (Array.isArray(state.seatingPositions) ? state.seatingPositions : []);
  return {
    room: normalisedRoom({
      widthM: dims.widthM ?? dims.width_m ?? state.room_width,
      lengthM: dims.lengthM ?? dims.length_m ?? state.room_length,
      heightM: dims.heightM ?? dims.height_m ?? state.room_height,
    }),
    seats: seats.map(normalisedSeat).filter(Boolean),
  };
}

/** The seating summary alone: every derived distance, and no seat list. */
function boundaryView(boundary) {
  if (!boundary) return null;
  const { seats: _seats, ...rest } = boundary;
  return rest;
}

/**
 * The geometry parts from one room rectangle and one seating set: the normalised
 * room, the seats in a stable order, and the boundary summary the seating plan
 * states. Both the frozen side and the live side are built through this one
 * function, so the same geometry always produces the same parts and the same
 * fingerprint.
 */
export function buildGeometryParts({ room = null, seats = [] } = {}) {
  const normalisedRoomValue = normalisedRoom(room);
  const normalisedSeats = (Array.isArray(seats) ? seats : [])
    .map(normalisedSeat)
    .filter(Boolean)
    .sort((a, b) => String(a.seat_id).localeCompare(String(b.seat_id)));

  const boundary = readSeatBoundaryGeometry({
    // The boundary reader measures a seat from its own plan point, so the normalised
    // seat is handed back in that reader's own shape. The normalised {x_m, y_m} stays
    // the ONE form this context and its fingerprint are built from.
    seats: normalisedSeats.map((seat) => ({
      id: seat.seat_id,
      label: seat.label,
      row: seat.row,
      x: seat.x_m,
      y: seat.y_m,
    })),
    roomDims: { widthM: normalisedRoomValue.width_m, lengthM: normalisedRoomValue.length_m },
  });

  const available = boundary.available === true && normalisedSeats.length > 0;
  return {
    available,
    reason: available ? null : (boundary.reason || 'no_seating_recorded'),
    room: normalisedRoomValue,
    seats: normalisedSeats,
    boundary: boundaryView(boundary),
  };
}

/**
 * THE CONTEXT'S FINGERPRINT: this room and these seats, and nothing else — no label,
 * no room volume and no time. The same geometry always produces the same
 * fingerprint, and any move of the room or a single seat changes it, which is what
 * makes a narrative written in one arrangement go stale in another.
 */
export function geometryFingerprint(parts) {
  if (!parts || parts.available !== true) return null;
  const text = canonicalise({
    room: {
      width_m: parts.room.width_m,
      length_m: parts.room.length_m,
      height_m: parts.room.height_m,
    },
    seats: (Array.isArray(parts.seats) ? parts.seats : []).map((seat) => ({
      seat_id: seat.seat_id,
      row: seat.row,
      x_m: seat.x_m,
      y_m: seat.y_m,
    })),
  });
  return `rg1-${fnv1a(text)}-${text.length.toString(16)}`;
}

/** Whether the saved version states the same room rectangle as the report. */
function compareRoom(reportRoom, versionRoom) {
  const stated = ['width_m', 'length_m', 'height_m']
    .filter((key) => reportRoom[key] !== null && versionRoom[key] !== null);
  if (stated.length === 0) return GEOMETRY_AGREEMENT.NOT_STATED;
  return stated.every((key) => Math.abs(reportRoom[key] - versionRoom[key]) <= TOLERANCE_M)
    ? GEOMETRY_AGREEMENT.MATCHED
    : GEOMETRY_AGREEMENT.MISMATCH;
}

/** Whether the saved version places the same seats in the same places as the report. */
function compareSeating(reportSeats, versionSeats) {
  if (reportSeats.length === 0 || versionSeats.length === 0) return GEOMETRY_AGREEMENT.NOT_STATED;
  if (reportSeats.length !== versionSeats.length) return GEOMETRY_AGREEMENT.MISMATCH;
  const byId = new Map(versionSeats.map((seat) => [seat.seat_id, seat]));
  const matches = reportSeats.every((seat) => {
    const other = byId.get(seat.seat_id);
    if (!other) return false;
    return Math.abs(seat.x_m - other.x_m) <= TOLERANCE_M && Math.abs(seat.y_m - other.y_m) <= TOLERANCE_M;
  });
  return matches ? GEOMETRY_AGREEMENT.MATCHED : GEOMETRY_AGREEMENT.MISMATCH;
}

/** The agreement of the report's geometry with the saved version's own. */
export function compareGeometryWithVersion(parts, versionGeometry) {
  const room = compareRoom(parts.room, versionGeometry?.room || {});
  const seating = compareSeating(parts.seats, versionGeometry?.seats || []);
  const compared = room !== GEOMETRY_AGREEMENT.NOT_STATED || seating !== GEOMETRY_AGREEMENT.NOT_STATED;
  return {
    // Whether the version was able to confirm the report's geometry at all.
    checked: compared,
    // False ONLY where the version was compared and disagreed. A version that
    // states nothing confirms nothing and never manufactures a mismatch.
    agrees: compared ? (room !== GEOMETRY_AGREEMENT.MISMATCH && seating !== GEOMETRY_AGREEMENT.MISMATCH) : null,
    room,
    seating,
    confirmed_against: 'the saved design version the report was generated from',
  };
}

/**
 * THE FROZEN GEOMETRY CONTEXT for one saved Project Report.
 *
 * @param {Object} input
 * @param {Object|null} input.reportEvidence — the frozen Project Report evidence
 * @param {Object|null} [input.version] — the saved design version
 * @param {string|null} [input.projectId]
 * @param {string|null} [input.versionId]
 * @param {string|null} [input.reportSnapshotId]
 * @returns {Object} the context, usable only where `available` is true
 */
export function buildReportGeometryContext({
  reportEvidence = null,
  version = null,
  projectId = null,
  versionId = null,
  reportSnapshotId = null,
} = {}) {
  const identity = {
    project_id: projectId ?? null,
    version_id: versionId ?? version?.id ?? null,
    version_number: num(version?.version_number),
    version_name: version?.version_name ?? null,
    report_snapshot_id: reportSnapshotId ?? null,
  };

  const reportGeometry = readReportGeometry(reportEvidence);
  const parts = buildGeometryParts({ room: reportGeometry.room, seats: reportGeometry.seats });
  const agreement = compareGeometryWithVersion(parts, readVersionGeometry(version));

  const base = {
    version: REPORT_GEOMETRY_CONTEXT_VERSION,
    rule: REPORT_GEOMETRY_CONTEXT_RULE,
    two_measurements_rule: REPORT_GEOMETRY_TWO_MEASUREMENTS_RULE,
    identity,
    room: parts.room,
    agreement,
  };

  // The saved report does not state the geometry: nothing may be explained from it.
  if (!parts.available) {
    return {
      ...base,
      available: false,
      reason: GEOMETRY_REFUSAL.NO_REPORT_GEOMETRY,
      detail: parts.reason,
      seats: [],
      boundary: null,
      fingerprint: null,
    };
  }

  // The saved version has moved away from the room the report describes. The
  // geometry is NOT used: the report and this design no longer describe one room,
  // and a narrative is never written from the wrong one.
  if (agreement.agrees === false) {
    return {
      ...base,
      available: false,
      reason: GEOMETRY_REFUSAL.VERSION_MOVED,
      detail: `room:${agreement.room} seating:${agreement.seating}`,
      seats: parts.seats,
      boundary: parts.boundary,
      fingerprint: null,
    };
  }

  return {
    ...base,
    available: true,
    reason: null,
    detail: null,
    seats: parts.seats,
    boundary: parts.boundary,
    fingerprint: geometryFingerprint(parts),
  };
}

/**
 * THE FINGERPRINT OF THE GEOMETRY THE DESIGN HOLDS NOW, from the room rectangle and
 * the seating positions the report page already reads. Used only to compare a saved
 * narrative's own frozen geometry against the design on screen, so a narrative
 * written before a seat or a wall moved is never presented as current.
 */
export function liveGeometryFingerprint({ roomDims = null, seatingPositions = [] } = {}) {
  const room = {
    width_m: num(roomDims?.widthM ?? roomDims?.width_m),
    length_m: num(roomDims?.lengthM ?? roomDims?.length_m),
    height_m: num(roomDims?.heightM ?? roomDims?.height_m),
  };
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : []).map(normalisedSeat).filter(Boolean);
  return geometryFingerprint(buildGeometryParts({ room, seats }));
}

/**
 * THE CONTEXT AS THE WRITER READS IT.
 *
 * The block is stated in the writer's own vocabulary and carries no key that names
 * live design state, so the writer input's own guard still proves it carries the
 * evidence and the contract only. It states the geometry as CONTEXT: the room, where
 * each seat stands, and the seating summary — the nearest-boundary distance and the
 * rear-wall clearance as two separate measurements, and no level, result or promise.
 */
export function writerGeometryBlock(context = null) {
  if (!context || context.available !== true) return null;
  const boundary = context.boundary || {};
  return {
    available: true,
    generation: REPORT_GEOMETRY_CONTEXT_VERSION,
    rule: REPORT_GEOMETRY_CONTEXT_RULE,
    two_measurements_rule: REPORT_GEOMETRY_TWO_MEASUREMENTS_RULE,
    read_from: 'the saved report\'s own frozen geometry, confirmed against the saved design version it was generated from',
    fingerprint: context.fingerprint ?? null,
    identity: { ...context.identity },
    room: { ...context.room },
    seats: (Array.isArray(context.seats) ? context.seats : []).map((seat) => ({ ...seat })),
    seating_position: {
      nearest_boundary_m: boundary.nearest_boundary_m ?? null,
      nearest_boundary: boundary.nearest_boundary ?? null,
      nearest_boundary_label: boundary.nearest_boundary_label ?? null,
      nearest_seat_id: boundary.nearest_seat_id ?? null,
      rear_row_rear_wall_m: boundary.rear_row_rear_wall_m ?? null,
      closest_rear_wall_m: boundary.closest_rear_wall_m ?? null,
      rear_wall_is_nearest: boundary.rear_wall_is_nearest === true,
      clearance: boundary.clearance ?? null,
      rear_clearance: boundary.rear_clearance ?? null,
      row_count: boundary.row_count ?? null,
      multi_row: boundary.multi_row === true,
      seat_rows_separation_m: boundary.row_spacing_m ?? null,
      room_is_constraint: boundary.room_is_constraint === true,
      space_behind_seating: boundary.space_behind_seating === true,
    },
  };
}

export default buildReportGeometryContext;