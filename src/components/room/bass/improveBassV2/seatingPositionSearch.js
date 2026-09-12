// seatingPositionSearch.js
// Seating position search — moves the complete seating layout together
// along the room length axis.
//
// Tests offsets from -500 mm to +500 mm in 100 mm steps (11 candidates).
// Sign convention:
//   Negative offset = toward screen (reduces distance from screen wall)
//   Positive offset = away from screen (increases distance from screen wall)
//
// Preserves: row spacing, lateral positions, seat IDs, Primary/Secondary
// priority, ear/platform heights.
//
// Constraints checked:
//   - Room boundaries (seats must remain inside the room)
//   - Screen/viewing geometry (seats must not pass through the screen)
//   - Speaker clearance (seats must not overlap speaker positions)
//
// Returns ONE best candidate (the single best by P19 > P20 > P18 > P14).
// Does NOT independently scatter seats — the entire layout moves together.

const OFFSETS_MM = [-500, -400, -300, -200, -100, 0, 100, 200, 300, 400, 500];
const BOUNDARY_MARGIN_M = 0.3; // minimum distance from walls
const SCREEN_CLEARANCE_M = 1.0; // minimum distance from screen wall

/**
 * Generate seating position candidates by shifting all seats along the
 * room length axis.
 *
 * @param {Array} seatingPositions - current seating positions
 * @param {object} roomDims - { widthM, lengthM, heightM }
 * @param {string} screenWall - which wall the screen is on
 * @returns {Array} candidates: [{ offsetMm, seatingPositions, valid, rejectionReason }]
 */
export function generateSeatingCandidates(seatingPositions, roomDims, screenWall = "front") {
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return [];
  const L = Number(roomDims?.lengthM) || 0;
  if (L <= 0) return [];

  // Determine the length axis and screen position.
  // screenWall "front" = screen at y=0, seats move along y axis.
  // screenWall "back" = screen at y=L, seats move along y axis (inverted sign).
  const isScreenFront = screenWall !== "back";

  return OFFSETS_MM.map((offsetMm) => {
    const offsetM = offsetMm / 1000;

    // Apply offset to all seats along the length axis (y).
    // Positive offset = away from screen (increasing y for front screen).
    // Negative offset = toward screen (decreasing y for front screen).
    const effectiveOffset = isScreenFront ? offsetM : -offsetM;
    const movedSeats = seatingPositions.map((seat) => ({
      ...seat,
      y_m: Number(seat.y_m || seat.y || 0) + effectiveOffset,
    }));

    // Check constraints
    const rejectionReason = validateSeatingConstraints(movedSeats, roomDims, screenWall, effectiveOffset);
    return {
      offsetMm,
      offsetM,
      effectiveOffsetM: effectiveOffset,
      direction: offsetMm < 0 ? "toward screen" : offsetMm > 0 ? "away from screen" : "current",
      seatingPositions: movedSeats,
      valid: !rejectionReason,
      rejectionReason,
    };
  });
}

/**
 * Validate that moved seats respect room boundaries and screen clearance.
 */
function validateSeatingConstraints(movedSeats, roomDims, screenWall, offsetM) {
  const L = Number(roomDims?.lengthM) || 0;
  const W = Number(roomDims?.widthM) || 0;
  if (L <= 0 || W <= 0) return "Invalid room dimensions";

  for (const seat of movedSeats) {
    const y = Number(seat.y_m || seat.y || 0);
    const x = Number(seat.x_m || seat.x || 0);

    // Room boundary checks
    if (y < BOUNDARY_MARGIN_M) return `Seat ${seat.id || "?"} too close to front wall (${(y * 100).toFixed(0)} cm)`;
    if (y > L - BOUNDARY_MARGIN_M) return `Seat ${seat.id || "?"} too close to back wall (${((L - y) * 100).toFixed(0)} cm)`;
    if (x < BOUNDARY_MARGIN_M) return `Seat ${seat.id || "?"} too close to left wall`;
    if (x > W - BOUNDARY_MARGIN_M) return `Seat ${seat.id || "?"} too close to right wall`;

    // Screen clearance check
    if (screenWall !== "back" && y < SCREEN_CLEARANCE_M) {
      return `Seat ${seat.id || "?"} too close to screen (${(y * 100).toFixed(0)} cm)`;
    }
    if (screenWall === "back" && y > L - SCREEN_CLEARANCE_M) {
      return `Seat ${seat.id || "?"} too close to screen (${((L - y) * 100).toFixed(0)} cm)`;
    }
  }

  return null;
}

/**
 * Get the offset candidates (for display/diagnostics).
 */
export function getSearchOffsets() {
  return [...OFFSETS_MM];
}

/**
 * Build a human-readable description of the seating change.
 */
export function describeSeatingChange(offsetMm) {
  if (offsetMm === 0) return "Current position";
  const direction = offsetMm < 0 ? "toward screen" : "away from screen";
  return `Move seating ${Math.abs(offsetMm)} mm ${direction}`;
}