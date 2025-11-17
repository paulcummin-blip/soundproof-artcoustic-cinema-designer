// components/utils/rp22OverheadZones.js
// RP22-compliant overhead zone calculations for Dolby upper speakers.
// Section 5.8 and Parameter 9 compliance.

/**
 * Compute listening area bounds relative to seating positions and MLP.
 * Returns the front/back boundaries of the listening area plus overhead X-lines.
 * 
 * @param {Array} seatingPositions - Array of seat objects with .position.{x,y,z} in metres
 * @param {Object} mlpPoint - MLP/RSP position {x, y, z} in metres
 * @param {Object} roomDims - {widthM, lengthM, heightM} in metres
 * @param {Array} placedSpeakers - Array of speaker objects (to derive overhead X-lines)
 * @param {Function} getCanonicalRole - Function to normalize speaker roles
 * @returns {Object} {listeningFrontY, listeningBackY, midCenterY, xLeft, xRight}
 */
export function getListeningAreaBounds(
  seatingPositions,
  mlpPoint,
  roomDims,
  placedSpeakers = [],
  getCanonicalRole = null
) {
  // Guard: no seats or invalid MLP
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0 || !mlpPoint) {
    return null;
  }

  const { widthM = 4.5, lengthM = 6.0 } = roomDims || {};

  // 1. Compute min/max seat Y positions
  const seatYs = seatingPositions
    .map(s => Number(s?.position?.y))
    .filter(y => Number.isFinite(y));

  if (seatYs.length === 0) {
    return null;
  }

  const minSeatY = Math.min(...seatYs);
  const maxSeatY = Math.max(...seatYs);

  // 2. Apply RP22 margins (200mm front/back)
  const frontMargin = 0.20;
  const backMargin = 0.20;

  let listeningFrontY = minSeatY - frontMargin;
  let listeningBackY = maxSeatY + backMargin;

  // 3. Clamp to room bounds (don't go outside walls)
  // Screen wall is at Y=0, rear wall is at Y=lengthM
  const screenWallInner = 0.05; // small offset from screen wall
  const rearWallInner = lengthM - 0.05;

  listeningFrontY = Math.max(screenWallInner, listeningFrontY);
  listeningBackY = Math.min(rearWallInner, listeningBackY);

  // 4. MLP center Y for middle zone
  const midCenterY = Number(mlpPoint.y) || (minSeatY + maxSeatY) / 2;

  // 5. Determine overhead left/right X positions
  // Prefer: align with FL/FR speaker X coordinates
  // Fallback: symmetric around room center within seating bounds
  let xLeft = widthM * 0.25;
  let xRight = widthM * 0.75;

  if (Array.isArray(placedSpeakers) && getCanonicalRole) {
    const fl = placedSpeakers.find(s => getCanonicalRole(s.role) === "FL");
    const fr = placedSpeakers.find(s => getCanonicalRole(s.role) === "FR");

    if (fl && Number.isFinite(fl.position?.x)) {
      xLeft = fl.position.x;
    }
    if (fr && Number.isFinite(fr.position?.x)) {
      xRight = fr.position.x;
    }
  }

  // Clamp X to room bounds
  xLeft = Math.max(0, Math.min(widthM, xLeft));
  xRight = Math.max(0, Math.min(widthM, xRight));

  return {
    listeningFrontY,
    listeningBackY,
    midCenterY,
    xLeft,
    xRight
  };
}

/**
 * Compute RP22-compliant overhead zone extents.
 * Returns three zones: front (Upper Front), mid (Top Middle), back (Upper Back).
 * All zones use the same X-range (overhead ceiling lines).
 * Zones do not overlap in Y; middle zone wins in case of conflict.
 * 
 * @param {Object} bounds - Output from getListeningAreaBounds
 * @param {Object} roomDims - {widthM, lengthM, heightM}
 * @returns {Object} {frontZone, midZone, backZone} each with {x1, x2, y1, y2, active}
 */
export function computeRp22OverheadZoneExtents(bounds, roomDims) {
  if (!bounds) {
    return {
      frontZone: { x1: 0, x2: 0, y1: 0, y2: 0, active: false },
      midZone: { x1: 0, x2: 0, y1: 0, y2: 0, active: false },
      backZone: { x1: 0, x2: 0, y1: 0, y2: 0, active: false }
    };
  }

  const { lengthM = 6.0 } = roomDims || {};
  const { listeningFrontY, listeningBackY, midCenterY, xLeft, xRight } = bounds;

  const screenWallInner = 0.05;
  const rearWallInner = lengthM - 0.05;

  // Middle zone: centered on MLP ± 0.5m
  const midHalfDepth = 0.5;
  let yMidStart = midCenterY - midHalfDepth;
  let yMidEnd = midCenterY + midHalfDepth;

  // Clamp middle zone to room
  yMidStart = Math.max(screenWallInner, yMidStart);
  yMidEnd = Math.min(rearWallInner, yMidEnd);

  const midActive = yMidEnd > yMidStart;

  // Front zone: screen wall → listening front
  let yFrontStart = screenWallInner;
  let yFrontEnd = listeningFrontY;

  // Trim front zone if it overlaps with middle zone
  if (midActive && yFrontEnd > yMidStart) {
    yFrontEnd = yMidStart;
  }

  const frontActive = yFrontEnd > yFrontStart;

  // Back zone: listening back → rear wall
  let yBackStart = listeningBackY;
  let yBackEnd = rearWallInner;

  // Trim back zone if it overlaps with middle zone
  if (midActive && yBackStart < yMidEnd) {
    yBackStart = yMidEnd;
  }

  const backActive = yBackEnd > yBackStart;

  return {
    frontZone: {
      x1: xLeft,
      x2: xRight,
      y1: yFrontStart,
      y2: yFrontEnd,
      active: frontActive
    },
    midZone: {
      x1: xLeft,
      x2: xRight,
      y1: yMidStart,
      y2: yMidEnd,
      active: midActive
    },
    backZone: {
      x1: xLeft,
      x2: xRight,
      y1: yBackStart,
      y2: yBackEnd,
      active: backActive
    }
  };
}