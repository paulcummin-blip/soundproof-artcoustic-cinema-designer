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

  // 5. Extract ear height for height-aware zone calculation
  // 1) Try explicit MLP ear height if present
  let mlpEarHeightM =
    (Number.isFinite(mlpPoint?.earHeightM) && mlpPoint.earHeightM) ||
    (Number.isFinite(mlpPoint?.ear_h) && mlpPoint.ear_h) ||
    (Number.isFinite(mlpPoint?.z) && mlpPoint.z) ||
    null;

  // 2) Otherwise, derive from seating row ear heights (average)
  if (!Number.isFinite(mlpEarHeightM)) {
    const rowHeights = Array.isArray(seatingPositions)
      ? seatingPositions
          .map((seat) => seat?.earHeightM ?? seat?.ear_h ?? seat?.position?.z)
          .filter((h) => Number.isFinite(h))
      : [];

    if (rowHeights.length > 0) {
      const sum = rowHeights.reduce((acc, h) => acc + h, 0);
      mlpEarHeightM = sum / rowHeights.length;
    }
  }

  // 3) Final fallback
  if (!Number.isFinite(mlpEarHeightM)) {
    mlpEarHeightM = 1.2;
  }

  const mlpEarHeight = mlpEarHeightM;

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
    mlpEarHeight,
    active: true
  };
}

/**
 * Compute RP22-compliant overhead zone extents.
 * Returns three zones: front (Upper Front), mid (Top Middle), back (Upper Back).
 * X-width depends solely on ear-to-ceiling height and target azimuth angles.
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

  const { widthM = 4.5, lengthM = 6.0, heightM = 2.4 } = roomDims || {};
  const { listeningFrontY, listeningBackY, midCenterY } = bounds;

  const screenWallInner = 0.05;
  const rearWallInner = lengthM - 0.05;

  // Height-aware zone calculation
  // Use ceiling height and MLP ear height to compute front/rear offsets
  const mlpY_m = midCenterY;
  const ceilingHeightM = heightM;
  const earHeightM = bounds.mlpEarHeight || 1.1;
  const earToCeilingM = Math.max(0.4, ceilingHeightM - earHeightM);

  // Target elevation angles for front/rear (45°)
  const FRONT_ELEV_DEG = 45;
  const REAR_ELEV_DEG = 45;
  const FRONT_ELEV_RAD = FRONT_ELEV_DEG * Math.PI / 180;
  const REAR_ELEV_RAD = REAR_ELEV_DEG * Math.PI / 180;

  // Compute ideal offsets from MLP (Y direction)
  const frontOffsetM = earToCeilingM * Math.tan(FRONT_ELEV_RAD);
  const rearOffsetM = earToCeilingM * Math.tan(REAR_ELEV_RAD);

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

  // ────────────────────────────────────────────────────────────────────────────
  // X-WIDTH CALCULATION: Single common lateral band for all overhead rows
  // ────────────────────────────────────────────────────────────────────────────
  
  // RP22 target azimuth ranges for overhead positions
  const FRONT_AZ_MIN = 20;  // degrees
  const FRONT_AZ_MAX = 45;
  const MID_AZ_MIN = 40;
  const MID_AZ_MAX = 60;
  const REAR_AZ_MIN = 20;
  const REAR_AZ_MAX = 45;

  // Collect all valid azimuth ranges
  const azMins = [];
  const azMaxs = [];

  if (Number.isFinite(FRONT_AZ_MIN) && Number.isFinite(FRONT_AZ_MAX)) {
    azMins.push(FRONT_AZ_MIN);
    azMaxs.push(FRONT_AZ_MAX);
  }
  if (Number.isFinite(MID_AZ_MIN) && Number.isFinite(MID_AZ_MAX)) {
    azMins.push(MID_AZ_MIN);
    azMaxs.push(MID_AZ_MAX);
  }
  if (Number.isFinite(REAR_AZ_MIN) && Number.isFinite(REAR_AZ_MAX)) {
    azMins.push(REAR_AZ_MIN);
    azMaxs.push(REAR_AZ_MAX);
  }

  // Compute common azimuth range (fallback to mid-range defaults)
  const commonAzMinDeg = azMins.length ? Math.min(...azMins) : 20;
  const commonAzMaxDeg = azMaxs.length ? Math.max(...azMaxs) : 60;

  // Single target lateral angle for all bands
  const commonAzTargetDeg = (commonAzMinDeg + commonAzMaxDeg) / 2;
  const commonAzTargetRad = (commonAzTargetDeg * Math.PI) / 180;

  // Lateral half-span at ceiling, using ear-to-ceiling as the "radius"
  const halfSpanOverhead = earToCeilingM * Math.tan(commonAzTargetRad);

  const roomCenterX = widthM / 2;

  // Apply same X-bounds to all three bands (no Y-based scaling)
  const x1Overhead = Math.max(0, roomCenterX - halfSpanOverhead);
  const x2Overhead = Math.min(widthM, roomCenterX + halfSpanOverhead);

  // Band thickness (±0.5m around center)
  const halfBandM = 0.5;

  // Helper: shrink span around center to create recommended core
  const shrinkSpan = (y1, y2, factor = 0.7) => {
    const mid = (y1 + y2) / 2;
    const half = ((y2 - y1) / 2) * factor;
    return { coreY1: mid - half, coreY2: mid + half };
  };

  // Middle zone: centered on MLP
  const midY1 = Math.max(screenWallInner, mlpY_m - halfBandM);
  const midY2 = Math.min(rearWallInner, mlpY_m + halfBandM);
  const midCore = shrinkSpan(midY1, midY2);
  
  const midZone = {
    x1: x1Overhead,
    x2: x2Overhead,
    y1: midY1,
    y2: midY2,
    coreY1: midCore.coreY1,
    coreY2: midCore.coreY2,
    active: true
  };

  // Front zone: centered on idealFrontCenterY
  const frontY1 = Math.max(screenWallInner, idealFrontCenterY - halfBandM);
  const frontY2 = Math.min(midZone.y1, idealFrontCenterY + halfBandM);
  const frontCore = shrinkSpan(frontY1, frontY2);
  
  const frontZone = {
    x1: x1Overhead,
    x2: x2Overhead,
    y1: frontY1,
    y2: frontY2,
    coreY1: frontCore.coreY1,
    coreY2: frontCore.coreY2,
    active: true
  };

  // Back zone: centered on idealRearCenterY
  const backY1 = Math.max(midZone.y2, idealRearCenterY - halfBandM);
  const backY2 = Math.min(rearWallInner, idealRearCenterY + halfBandM);
  const backCore = shrinkSpan(backY1, backY2);
  
  const backZone = {
    x1: x1Overhead,
    x2: x2Overhead,
    y1: backY1,
    y2: backY2,
    coreY1: backCore.coreY1,
    coreY2: backCore.coreY2,
    active: true
  };

  // Ensure zones are valid (y2 > y1)
  frontZone.active = frontZone.y2 > frontZone.y1;
  midZone.active = midZone.y2 > midZone.y1;
  backZone.active = backZone.y2 > backZone.y1;

  return { frontZone, midZone, backZone };
}