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
  const { widthM = 4.5, lengthM = 6.0 } = roomDims || {};
  
  // Guard: no seats or invalid MLP - return default inactive bounds
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0 || !mlpPoint) {
    return {
      listeningFrontY: 0,
      listeningBackY: 0,
      midCenterY: lengthM / 2,
      xLeft: widthM * 0.25,
      xRight: widthM * 0.75,
      active: false
    };
  }

  // 1. Compute min/max seat Y positions
  // Support both { position: { x, y, z } } and flat { x, y, z } seat shapes.
  const seatYs = seatingPositions
    .map((s) => {
      if (s && s.position && Number.isFinite(s.position.y)) {
        return Number(s.position.y);
      }
      if (s && Number.isFinite(s.y)) {
        return Number(s.y);
      }
      return null;
    })
    .filter((y) => Number.isFinite(y));

  if (seatYs.length === 0) {
    // No valid seats → disable overhead zones
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
    xRight,
    active: true
  };
}

/**
 * Compute RP22-compliant overhead zone extents.
 * Returns three zones: front (Upper Front), mid (Top Middle), back (Upper Back).
 * All zones use the same X-range (overhead ceiling lines).
 * Zones are height-aware: positions respond to ceiling height and ear height.
 * 
 * @param {Object} bounds - Output from getListeningAreaBounds
 * @param {Object} roomDims - {widthM, lengthM, heightM}
 * @returns {Object} {frontZone, midZone, backZone} each with {x1, x2, y1, y2, active}
 */
export function computeRp22OverheadZoneExtents(bounds, roomDims) {
  if (!bounds || bounds.active === false) {
    return {
      frontZone: { x1: 0, x2: 0, y1: 0, y2: 0, active: false },
      midZone: { x1: 0, x2: 0, y1: 0, y2: 0, active: false },
      backZone: { x1: 0, x2: 0, y1: 0, y2: 0, active: false }
    };
  }

  const { lengthM = 6.0, heightM = 2.4 } = roomDims || {};
  const { listeningFrontY, listeningBackY, midCenterY, xLeft, xRight } = bounds;

  const screenWallInner = 0.05;
  const rearWallInner = lengthM - 0.05;

  // Height-aware zone calculation
  // Use ceiling height and MLP ear height to compute front/rear offsets
  const mlpY_m = midCenterY;
  const ceilingHeightM = heightM;
  const earHeightM = bounds.mlpEarHeight || 1.1;
  const verticalM = Math.max(ceilingHeightM - earHeightM, 0.5);

  // Target elevation angles for front/rear (45°)
  const FRONT_ELEV_DEG = 45;
  const REAR_ELEV_DEG = 45;
  const FRONT_ELEV_RAD = FRONT_ELEV_DEG * Math.PI / 180;
  const REAR_ELEV_RAD = REAR_ELEV_DEG * Math.PI / 180;

  // Compute ideal offsets from MLP
  const frontOffsetM = verticalM * Math.tan(FRONT_ELEV_RAD);
  const rearOffsetM = verticalM * Math.tan(REAR_ELEV_RAD);

  // Ideal centers before clamping
  let idealFrontCenterY = mlpY_m - frontOffsetM;
  let idealRearCenterY = mlpY_m + rearOffsetM;

  // Clamp to stay within listening area and room bounds
  const minFrontCenterY = screenWallInner;
  const maxRearCenterY = rearWallInner;

  const frontOffset = Math.min(frontOffsetM, mlpY_m - minFrontCenterY);
  const rearOffset = Math.min(rearOffsetM, maxRearCenterY - mlpY_m);

  // Keep symmetric about MLP
  const symmetricOffset = Math.min(frontOffset, rearOffset);
  idealFrontCenterY = mlpY_m - symmetricOffset;
  idealRearCenterY = mlpY_m + symmetricOffset;

  // Band thickness (±0.5m around center)
  const halfBandM = 0.5;

  // Middle zone: centered on MLP
  const midZone = {
    x1: xLeft,
    x2: xRight,
    y1: Math.max(screenWallInner, mlpY_m - halfBandM),
    y2: Math.min(rearWallInner, mlpY_m + halfBandM),
    active: true
  };

  // Front zone: centered on idealFrontCenterY
  const frontZone = {
    x1: xLeft,
    x2: xRight,
    y1: Math.max(screenWallInner, idealFrontCenterY - halfBandM),
    y2: Math.min(midZone.y1, idealFrontCenterY + halfBandM),
    active: true
  };

  // Back zone: centered on idealRearCenterY
  const backZone = {
    x1: xLeft,
    x2: xRight,
    y1: Math.max(midZone.y2, idealRearCenterY - halfBandM),
    y2: Math.min(rearWallInner, idealRearCenterY + halfBandM),
    active: true
  };

  // Ensure zones are valid (y2 > y1)
  frontZone.active = frontZone.y2 > frontZone.y1;
  midZone.active = midZone.y2 > midZone.y1;
  backZone.active = backZone.y2 > backZone.y1;

  return { frontZone, midZone, backZone };
}