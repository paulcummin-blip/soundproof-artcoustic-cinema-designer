// coordinatedCandidateFixture.js
// Build the Room D coordinated-candidate reference bundle from real candidate
// inputs — room geometry, subwoofer model, cabinet centres, moved seating,
// designated RSP, crossover and P14 target. No expected P19/P20 scores are
// hard-coded; every number is a genuine input the canonical evaluator consumes.
//
// This is a TEST FIXTURE for the developer-only acceptance bridge. It is not a
// second source of engineering truth and never reaches a dealer.

import { buildCoordinatedCandidateBundle } from "./coordinatedCandidateBundle";

// Room D physical envelope.
export const ROOM_D_DIMS = Object.freeze({
  widthM: 3.5,
  lengthM: 8.0,
  heightM: 3.0,
});

// Four SUB3-12 cabinet centres (metres), front/rear pairs.
export const ROOM_D_COORDINATES = Object.freeze([
  { x: 0.665, y: 0.1375 },
  { x: 2.835, y: 0.1375 },
  { x: 0.665, y: 7.8625 },
  { x: 2.835, y: 7.8625 },
]);

export const ROOM_D_SUBWOOFER_BOTTOM_HEIGHT_M = 0.05;
export const ROOM_D_SELECTED_SUB_MODEL = "SUB3-12";

// The accepted Room D proposal starts from the ORIGINAL saved seating and
// applies the −600 mm forward move exactly once. The original Room D rows are
// the primary row at Y = 4.0 m and the secondary row at Y = 5.8 m. After the
// single shift they become 3.4 m and 5.2 m. The fixture never starts from an
// already-shifted layout — doing so would apply the offset a second time.
export const ROOM_D_ORIGINAL_ROW_Y = Object.freeze([4.0, 5.8]);
export const ROOM_D_SHIFT_M = 0.6;

// The accepted Room D saved seating reference. The developer acceptance bridge
// validates the live saved seating against this exact reference before the
// coordinated candidate is built, so the fixture can never silently fall back
// to synthetic listeners for the acceptance test.
export const ROOM_D_EXPECTED_SEAT_IDS = Object.freeze([
  "seat-r1-c1", "seat-r1-c2", "seat-r1-c3",
  "seat-r2-c1", "seat-r2-c2", "seat-r2-c3",
]);
export const ROOM_D_EXPECTED_X_POSITIONS = Object.freeze([1.15, 1.75, 2.35]);
export const ROOM_D_EXPECTED_FRONT_EAR_HEIGHT_M = 1.2;
export const ROOM_D_EXPECTED_REAR_EAR_HEIGHT_M = 1.7;
const ROOM_D_REF_TOLERANCE_M = 1e-3; // 1 mm

const round3 = (v) => Math.round(v * 1000) / 1000;

// Resolve the front-row centre seat identity from a saved seating array. The
// designated RSP seat is the front-row (rowNumber === 1) seat closest to the
// room centreline. For the Room D reference this is `seat-r1-c2` at X = 1.75 m.
export function resolveRoomDDesignatedSeatId(savedSeating, roomWidthM = ROOM_D_DIMS.widthM) {
  const seats = Array.isArray(savedSeating) ? savedSeating : [];
  const centreX = Number.isFinite(Number(roomWidthM)) ? Number(roomWidthM) / 2 : 1.75;
  let best = null;
  let bestDist = Infinity;
  for (const seat of seats) {
    const row = Number(seat?.rowNumber);
    const x = Number(seat?.x);
    if (!Number.isFinite(row) || !Number.isFinite(x)) continue;
    if (row !== 1) continue;
    const dist = Math.abs(x - centreX);
    if (dist < bestDist) {
      bestDist = dist;
      best = seat;
    }
  }
  return best?.id || null;
}

/**
 * Strictly validate a live saved seating array against the accepted Room D
 * reference. Returns { valid, issues, summary }. When invalid the caller must
 * stop with an explicit input-mismatch error and never fall back to synthetic
 * seating for the acceptance bridge.
 *
 * Checks: exactly six seats; expected seat IDs; original row centres 4.0/5.8 m;
 * X positions 1.15/1.75/2.35 m per row; front-row ear height 1.2 m; rear-row
 * ear height 1.7 m.
 */
export function validateRoomDSavedSeatingReference(savedSeating) {
  const seats = Array.isArray(savedSeating) ? savedSeating : [];
  const issues = [];

  if (seats.length === 0) {
    return { valid: false, issues: ["No saved seating supplied"], summary: null };
  }
  if (seats.length !== 6) {
    issues.push(`Expected 6 saved seats, got ${seats.length}`);
  }

  const seatIds = seats.map((s) => String(s?.id || ""));
  for (const expected of ROOM_D_EXPECTED_SEAT_IDS) {
    if (!seatIds.includes(expected)) {
      issues.push(`Missing expected seat ID ${expected}`);
    }
  }

  const centres = rowCentresFromSavedSeating(seats);
  const expectedCentres = ROOM_D_ORIGINAL_ROW_Y;
  if (
    centres.length !== expectedCentres.length ||
    centres.some((c, i) => Math.abs(c - expectedCentres[i]) > ROOM_D_REF_TOLERANCE_M)
  ) {
    issues.push(
      `Row centres [${centres.join(", ")}] m do not match expected original Room D rows [${expectedCentres.join(", ")}] m`,
    );
  }

  const byRow = new Map();
  for (const seat of seats) {
    const row = Number(seat?.rowNumber);
    if (!Number.isFinite(row)) continue;
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(Number(seat?.x));
  }
  const sortedRows = [...byRow.keys()].sort((a, b) => a - b);
  for (const row of sortedRows) {
    const xs = byRow.get(row).sort((a, b) => a - b);
    if (
      xs.length !== ROOM_D_EXPECTED_X_POSITIONS.length ||
      xs.some((x, i) => Math.abs(x - ROOM_D_EXPECTED_X_POSITIONS[i]) > ROOM_D_REF_TOLERANCE_M)
    ) {
      issues.push(
        `Row ${row} X positions [${xs.join(", ")}] m do not match expected [${ROOM_D_EXPECTED_X_POSITIONS.join(", ")}] m`,
      );
    }
  }

  const frontHeights = seats
    .filter((s) => Number(s?.rowNumber) === 1)
    .map((s) => Number(s?.z))
    .filter((v) => Number.isFinite(v));
  const rearHeights = seats
    .filter((s) => Number(s?.rowNumber) === 2)
    .map((s) => Number(s?.z))
    .filter((v) => Number.isFinite(v));
  const frontHeight = frontHeights.length
    ? frontHeights.reduce((a, b) => a + b, 0) / frontHeights.length
    : null;
  const rearHeight = rearHeights.length
    ? rearHeights.reduce((a, b) => a + b, 0) / rearHeights.length
    : null;
  if (frontHeight == null || Math.abs(frontHeight - ROOM_D_EXPECTED_FRONT_EAR_HEIGHT_M) > ROOM_D_REF_TOLERANCE_M) {
    issues.push(
      `Front-row ear height ${frontHeight} m does not match expected ${ROOM_D_EXPECTED_FRONT_EAR_HEIGHT_M} m`,
    );
  }
  if (rearHeight == null || Math.abs(rearHeight - ROOM_D_EXPECTED_REAR_EAR_HEIGHT_M) > ROOM_D_REF_TOLERANCE_M) {
    issues.push(
      `Rear-row ear height ${rearHeight} m does not match expected ${ROOM_D_EXPECTED_REAR_EAR_HEIGHT_M} m`,
    );
  }

  const designatedSeatId = resolveRoomDDesignatedSeatId(seats);
  const designatedSeat = seats.find((s) => String(s?.id) === designatedSeatId);
  const proposedRowCentres = centres.map((c) => round3(c - ROOM_D_SHIFT_M));
  const proposedRsp = designatedSeat
    ? {
        x: Number(designatedSeat.x),
        y: round3(Number(designatedSeat.y) - ROOM_D_SHIFT_M),
        z: Number.isFinite(Number(designatedSeat.z)) ? Number(designatedSeat.z) : 1.2,
      }
    : null;

  const summary = {
    seatCount: seats.length,
    seatIds,
    rowCentres: centres.map(round3),
    xPositions: sortedRows.length ? byRow.get(sortedRows[0]).sort((a, b) => a - b) : [],
    frontEarHeight: frontHeight,
    rearEarHeight: rearHeight,
    proposedRowCentres,
    proposedRsp,
    designatedSeatId,
  };

  return { valid: issues.length === 0, issues, summary };
}

// Compute the per-row mean Y from a saved seating array, ordered by rowNumber.
// Used to verify a caller-supplied saved layout matches the expected original
// Room D rows before the shift is applied.
function rowCentresFromSavedSeating(savedSeating) {
  const byRow = new Map();
  for (const seat of savedSeating) {
    const row = Number(seat?.rowNumber);
    const y = Number(seat?.y);
    if (!Number.isFinite(row) || !Number.isFinite(y)) continue;
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(y);
  }
  return [...byRow.keys()]
    .sort((a, b) => a - b)
    .map((row) => {
      const ys = byRow.get(row);
      return ys.reduce((sum, y) => sum + y, 0) / ys.length;
    });
}

// Build the proposed (moved) Room D seating from the original saved rows.
//
// When `savedSeating` is supplied (the actual saved seating from the open
// project), it is validated against the expected original Room D row centres.
// A mismatch rejects the fixture with an explicit input-mismatch error rather
// than silently constructing different seating — and an already-shifted layout
// (3.4 / 5.2 m) is rejected here, so it is never shifted a second time.
//
// Seat IDs, row membership, priority, height and platform metadata are
// preserved verbatim from the saved seating; only y is shifted by −0.6 m.
function buildRoomDSeating(savedSeating = null) {
  let originSeats;

  if (savedSeating) {
    const centres = rowCentresFromSavedSeating(savedSeating);
    const expected = ROOM_D_ORIGINAL_ROW_Y;
    const tolerance = 1e-3; // 1 mm
    const mismatch =
      centres.length !== expected.length ||
      centres.some((c, i) => Math.abs(c - expected[i]) > tolerance);
    if (mismatch) {
      throw new Error(
        `Room D fixture input mismatch: saved seating row centres [${centres.join(", ")}] m `
        + `do not match the expected original Room D rows [${expected.join(", ")}] m. `
        + `Refusing to construct different seating from a non-matching saved layout.`,
      );
    }
    // Preserve every saved field; only y will be shifted below.
    originSeats = savedSeating.map((seat) => ({
      id: seat.id,
      rowNumber: seat.rowNumber,
      priority: seat.priority,
      x: Number(seat.x),
      y: Number(seat.y),
      z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2,
      earHeight: seat.earHeight,
      platformHeight: seat.platformHeight,
    }));
  } else {
    // Canonical original Room D rows: front row 3 seats, rear row 3 seats,
    // laterally symmetric about the 1.75 m centreline.
    originSeats = [];
    let seatIndex = 0;
    for (let row = 0; row < ROOM_D_ORIGINAL_ROW_Y.length; row++) {
      const lateralOffsets = [-0.8, 0, 0.8];
      for (const offset of lateralOffsets) {
        seatIndex += 1;
        originSeats.push({
          id: `room-d-seat-${seatIndex}`,
          rowNumber: row + 1,
          priority: row === 0 ? "primary" : "secondary",
          x: 1.75 + offset,
          y: ROOM_D_ORIGINAL_ROW_Y[row],
          z: 1.2,
          earHeight: 1.2,
          platformHeight: 0.4,
        });
      }
    }
  }

  // Apply the −600 mm forward move exactly once.
  return originSeats.map((seat) => ({ ...seat, y: Number(seat.y) - ROOM_D_SHIFT_M }));
}

// The proposed RSP follows the designated primary seat. After the single
// −600 mm move the front-row centre seat sits at (1.75, 3.4, 1.2). The fixture
// passes the seat identity and the resolved RSP so the bundle's RSP authority
// can bind it.
export const ROOM_DESIGNATED_SEAT_ID = "room-d-seat-2"; // front-row centre
export const ROOM_D_RSP_POSITION = Object.freeze({ x: 1.75, y: 3.4, z: 1.2 });

// Combined LCR/sub crossover (95 Hz). The integration context is supplied by
// the caller at run time from the live LCR sources — the fixture only carries
// the crossover configuration the canonical evaluator consumes.
export const ROOM_D_CROSSOVER = Object.freeze({
  type: "lowpass",
  frequencyHz: 95,
  order: 4,
  enabled: true,
});

// P14 target. Level 2 / minimum basis, 117 dB — the standard operating target.
export const ROOM_D_P14_TARGET = Object.freeze({
  p14TargetBasis: "minimum",
  p14TargetLevel: 2,
  p14TargetDb: 117,
  p18TargetBasis: "minimum",
});

/**
 * Build the Room D coordinated candidate bundle from real inputs.
 *
 * @param {object} [overrides] — optional field overrides (e.g. integrationContext)
 * @returns {object} coordinated candidate bundle (validated by the caller)
 */
export function buildRoomDBundle(overrides = {}) {
  const savedSeating = overrides.savedSeating || null;
  // When live saved seating is supplied, the designated RSP seat is the
  // front-row centre seat of the saved layout (e.g. seat-r1-c2), not the
  // synthetic room-d-seat-2 identity. This keeps the RSP bound to the actual
  // saved seat so it follows the moved seat exactly.
  const designatedSeatId = overrides.designatedSeatId
    || (savedSeating ? resolveRoomDDesignatedSeatId(savedSeating) : ROOM_DESIGNATED_SEAT_ID);
  const seatingPositions = buildRoomDSeating(savedSeating);
  return buildCoordinatedCandidateBundle({
    candidateId: overrides.candidateId || "room-d-4sub-600mm",
    quantity: 4,
    coordinates: ROOM_D_COORDINATES,
    selectedSubModel: ROOM_D_SELECTED_SUB_MODEL,
    subwooferBottomHeightM: ROOM_D_SUBWOOFER_BOTTOM_HEIGHT_M,
    seatingPositions,
    designatedSeatId,
    fallbackRsp: ROOM_D_RSP_POSITION,
    roomWidthM: ROOM_D_DIMS.widthM,
    tuning: ROOM_D_COORDINATES.map(() => ({
      delayMs: 0,
      gainDb: 0,
      polarity: 0,
      phaseControlDeg: 0,
    })),
    crossover: overrides.crossover || ROOM_D_CROSSOVER,
    autoAlignEnabled: false,
    integrationContext: overrides.integrationContext || null,
    responseBasis: overrides.responseBasis
      || (overrides.integrationContext ? "combined-lcr-sub" : "sub-only"),
    p14Target: overrides.p14Target || ROOM_D_P14_TARGET,
  });
}

export { buildRoomDSeating as _buildRoomDSeating };