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

// Both seating rows moved 600 mm toward the screen (front screen at y=0).
// Seat identities and priorities are preserved; only y is shifted by -0.6 m.
// The two-row arrangement mirrors the known Room D layout: front row 3 seats,
// rear row 3 seats. Lateral positions are symmetric about the 1.75 m centreline.
function buildRoomDSeating() {
  const rowY = [3.4, 5.2]; // pre-move row centres (front, rear)
  const seats = [];
  let seatIndex = 0;
  for (let row = 0; row < rowY.length; row++) {
    const seatCount = 3;
    const lateralOffsets = seatCount === 3 ? [-0.8, 0, 0.8] : [0];
    for (const offset of lateralOffsets) {
      seatIndex += 1;
      const id = `room-d-seat-${seatIndex}`;
      seats.push({
        id,
        rowNumber: row + 1,
        priority: row === 0 ? "primary" : "secondary",
        x: 1.75 + offset,
        y: rowY[row],
        z: 1.2,
        earHeight: 1.2,
        platformHeight: 0.4,
      });
    }
  }
  // Apply the 600 mm forward move to every seat.
  return seats.map((seat) => ({ ...seat, y: Number(seat.y) - 0.6 }));
}

// The proposed RSP follows the designated primary seat. After the move, the
// front-row centre seat sits at (1.75, 2.8, 1.2). The fixture passes the seat
// identity and the resolved RSP so the bundle's RSP authority can bind it.
export const ROOM_DESIGNATED_SEAT_ID = "room-d-seat-2"; // front-row centre
export const ROOM_D_RSP_POSITION = Object.freeze({ x: 1.75, y: 2.8, z: 1.2 });

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
  const seatingPositions = buildRoomDSeating();
  return buildCoordinatedCandidateBundle({
    candidateId: overrides.candidateId || "room-d-4sub-600mm",
    quantity: 4,
    coordinates: ROOM_D_COORDINATES,
    selectedSubModel: ROOM_D_SELECTED_SUB_MODEL,
    subwooferBottomHeightM: ROOM_D_SUBWOOFER_BOTTOM_HEIGHT_M,
    seatingPositions,
    designatedSeatId: ROOM_DESIGNATED_SEAT_ID,
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