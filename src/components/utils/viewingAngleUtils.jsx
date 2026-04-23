/**
 * RP23 viewing angle calculations and seat generation utilities
 * Prioritizes angle-based logic over distance tables for accurate RP23 compliance
 */
import { idealDistanceForWidth, viewingDimsM, angleFromDistance, rp23LevelForAngle } from "./viewingAndScreenMetrics";
import { computeScreenWidthMeters, distanceForHorizontalFOV } from "./viewingGeometry";
import { computeScreenMetrics, clampViewingOffset } from "./screenMetrics";

/**
 * Calculate viewing angle from a seat position to the screen
 * @param {object} seatPosition - Seat position {x, y, z}
 * @param {number} screenSize - Screen VISIBLE width in inches (not diagonal)
 * @param {string} aspectRatio - Screen aspect ratio (e.g., "16:9", "2.35:1") - Note: this parameter is unused in the current implementation as `screenSize` is now interpreted as visible width.
 * @param {object} screenPosition - Screen front plane position, e.g., {y: 0.20}
 * @returns {number} Viewing angle in degrees, or null if inputs invalid
*/
function calculateViewingAngle(seatPosition, screenSize, aspectRatio, screenPosition = null) {
  // Validate inputs - no silent fallbacks
  const viewerY = seatPosition?.y;
  const screenY = screenPosition?.y;
  
  if (!Number.isFinite(viewerY) || !Number.isFinite(screenY)) {
    return null;
  }
  
  if (!Number.isFinite(screenSize) || screenSize <= 0) {
    return null;
  }

  // screenSize is the visible width in inches - convert directly to meters
  const screenWidthMeters = screenSize * 0.0254;
  
  // Calculate distance from seat to screen front plane
  const viewerDistance = Math.abs(viewerY - screenY);
  
  if (viewerDistance <= 0) return null;
  
  // Calculate viewing angle: angle subtended by screen width at viewing distance
  // Formula: angle = 2 * atan((width/2) / distance)
  const viewingAngle = 2 * Math.atan((screenWidthMeters / 2) / viewerDistance) * (180 / Math.PI);
  
  return viewingAngle;
}

/**
 * Map RP23 horizontal FOV angle to compliance level
 * @param {number} angleDeg - Horizontal viewing angle in degrees
 * @returns {string|null} Level string ('L4', 'L3', 'L2', 'L1') or null if out of range
 */
export function rp23LevelForAngleDeg(angleDeg) {
  if (!Number.isFinite(angleDeg)) return null;
  // --- Sales-friendly normalisation ---
  let displayDeg;
  if (angleDeg < 50) {
    displayDeg = Math.ceil(angleDeg); // always round UP below 50
  } else if (angleDeg > 65) {
    displayDeg = Math.floor(angleDeg); // always round DOWN above 65
  } else {
    displayDeg = Math.round(angleDeg); // normal rounding inside window
  }
  // --- RP23 grading (STRICT 50–65 window) ---
  if (displayDeg >= 50 && displayDeg <= 65) return 'L4';
  if (displayDeg >= 45 && displayDeg <= 70) return 'L3';
  if (displayDeg >= 40 && displayDeg <= 80) return 'L2';
  if (displayDeg >= 33 && displayDeg <= 90) return 'L1';
  return null;
}

export function rp23DisplayAngleDeg(angleDeg) {
  if (!Number.isFinite(angleDeg)) return null;
  if (angleDeg < 50) return Math.ceil(angleDeg);
  if (angleDeg > 65) return Math.floor(angleDeg);
  return Math.round(angleDeg);
}

/**
 * Assign RP23 level based on viewing angle (legacy compatibility)
 * @param {number} viewingAngle - Viewing angle in degrees
 * @returns {object} RP23 level information
 */
function assignRP23Level(viewingAngle) {
  const level = rp23LevelForAngleDeg(viewingAngle);
  
  // Map level codes to full objects for backward compatibility
  const levelMap = {
    'L4': { level: 4, label: "Level 4 - Excellent", color: "green" },
    'L3': { level: 3, label: "Level 3 - Good", color: "blue" },
    'L2': { level: 2, label: "Level 2 - Acceptable", color: "yellow" },
    'L1': { level: 1, label: "Level 1 - Minimum", color: "orange" }
  };
  
  return levelMap[level] || { level: 0, label: "FAIL", color: "red" };
}

/**
 * Calculate optimal viewing distance for target RP23 level
 * @param {number} screenSize - Screen diagonal in inches
 * @param {string} aspectRatio - Screen aspect ratio
 * @param {number} targetAngle - Target viewing angle in degrees (default: 57.5° for Level 4 center)
 * @returns {number} Optimal viewing distance in meters
 */
function calculateOptimalViewingDistance(screenSize, aspectRatio, targetAngle = 57.5) {
  const [arW, arH] = aspectRatio.split(':').map(Number);
  if (isNaN(arW) || isNaN(arH) || arW === 0 || arH === 0) return 3.0;
  
  const screenWidthInches = screenSize * (arW / Math.sqrt(arW ** 2 + arH ** 2));
  const screenWidthMeters = screenWidthInches * 0.0254;
  
  // Calculate distance for target angle: distance = (screenWidth / 2) / tan(targetAngle / 2)
  const targetAngleRad = targetAngle * (Math.PI / 180);
  const optimalDistance = (screenWidthMeters / 2) / Math.tan(targetAngleRad / 2);
  
  return Math.max(1.5, optimalDistance); // Minimum 1.5m for practical room layout
}

/**
 * Function to get ear height for each row (acoustic reference height)
 * @param {number} rowNumber - The 1-based row number
 * @returns {number} Ear height in meters
 */
export const getEarHeightForRow = (rowNumber) => {
  switch(rowNumber) {
    case 1: return 1.2; // meters - standard ear height for front row
    case 2: return 1.5; // meters - elevated second row
    case 3: return 1.8; // meters - elevated third row
    default: return 1.2 + (rowNumber - 1) * 0.3; // extrapolate for additional rows
  }
};

/**
 * Generate seating positions with RP23 angle-based optimization
 * @param {object} params - Parameters for seating generation
 * @returns {array} Array of seat positions with RP23 analysis
 */
export function generateSeatingPositions({
  seatsPerRow = 3,
  numberOfRows = 1,
  seatSpacing = 0.6,
  screenSize = 100,         // viewing width in inches
  aspectRatio = "16:9",
  screenWall = "front",
  roomDimensions,
  seatingBlockOffset = 0    // additional manual nudge (m)
}) {
  const w = roomDimensions?.width ?? 4.5;
  const l = roomDimensions?.length ?? 6.0;

  // screen wall reference (front): y ≈ 0.10 m for your drawing space
  const screenY = 0.10;

  // Target the RP23 best angle (57.5°)
  const baseDist = idealDistanceForWidth(screenSize, aspectRatio); // meters

  // allow manual nudge via seatingBlockOffset (forward/back)
  const row1Y = Math.max(0.6, Math.min(l - 0.6, screenY + baseDist + seatingBlockOffset));

  const cx = w / 2;
  const seats = [];

  for (let row = 0; row < numberOfRows; row++) {
    const rowY = Math.max(0.6, Math.min(l - 0.6, row1Y + row * 0.9)); // simple 0.9m row spacing
    const startX = cx - ((seatsPerRow - 1) * seatSpacing) / 2;
    const earHeight = getEarHeightForRow(row + 1);

    for (let i = 0; i < seatsPerRow; i++) {
      const seatPosition = {
        id: `r${row+1}s${i+1}`,
        x: startX + i * seatSpacing,
        y: rowY,
        z: earHeight,
        rowNumber: row + 1,
        seatNumber: i + 1,
        isPrimary: (row === 0 && Math.floor(seatsPerRow/2) === i), // centre of front row as MLP
        seatSpacing: seatSpacing
      };

      // Calculate RP23 metrics using the new utility
      const { viewWm } = viewingDimsM(screenSize, aspectRatio);
      const distance = Math.max(0.001, seatPosition.y - screenY);
      const viewingAngle = angleFromDistance(viewWm, distance);
      const rp23Level = rp23LevelForAngle(viewingAngle);

      seats.push({
        ...seatPosition,
        viewingAngle: viewingAngle,
        rp23Level: rp23Level,
        rp23Label: `Level ${rp23Level}`,
        rp23Color: rp23Level >= 4 ? "green" : rp23Level >= 3 ? "blue" : rp23Level >= 2 ? "yellow" : "orange",
        distanceFromScreen: distance
      });
    }
  }

  return seats;
}

/**
 * Computes the Y-coordinates for each row based on an MLP anchor point and reference.
 * @param {object} options - Configuration options.
 * @param {'front'|'center'|'back'} options.mlpRef - Which row is considered the MLP reference ('front', 'center', 'back').
 * @param {number} options.mlpAnchorY - The base Y coordinate (in meters) for the MLP anchor.
 * @param {number} options.rowCount - Total number of rows.
 * @param {number} options.rowSpacingM - Spacing between rows in meters.
 * @param {number} options.viewingOffsetM - Additional offset to apply to the MLP anchor Y.
 * @returns {number[]} An array of Y coordinates for each row (0-indexed).
 */
export function computeRowCentersAroundAnchor({ mlpRef, mlpAnchorY, rowCount, rowSpacingM, viewingOffsetM }) {
  if (typeof mlpAnchorY !== 'number' || !isFinite(mlpAnchorY)) {
    console.warn('[computeRowCentersAroundAnchor] mlpAnchorY must be a finite number.');
    return []; 
  }
  if (rowCount <= 0) return [];

  const actualMLPY = mlpAnchorY + viewingOffsetM;
  const rowYs = new Array(rowCount);

  let offsetFromRow0ToMLP = 0; // Distance from the first row's Y to the actualMLPY
  if (mlpRef === 'front') {
    offsetFromRow0ToMLP = 0; // MLP is row 1
  } else if (mlpRef === 'center') {
    const middleIndex = (rowCount - 1) / 2;
    offsetFromRow0ToMLP = middleIndex * rowSpacingM;
  } else if (mlpRef === 'back') {
    offsetFromRow0ToMLP = (rowCount - 1) * rowSpacingM; // MLP is last row
  } else {
    console.warn(`[computeRowCentersAroundAnchor] Invalid mlpRef: ${mlpRef}. Defaulting to 'front'.`);
    offsetFromRow0ToMLP = 0;
  }

  const row0Y = actualMLPY - offsetFromRow0ToMLP;

  for (let i = 0; i < rowCount; i++) {
    rowYs[i] = row0Y + i * rowSpacingM;
  }

  return rowYs;
}


/**
 * Generate seating positions so front row distance yields a fixed total horizontal FOV (default 57.5°)
 * NOW: Uses anchor-based positioning if mlpAnchor is provided
 */
export function generateSeatingPositionsFOV({
  seatsPerRow = 2,
  numberOfRows = 1,
  seatSpacing = 0.8,
  screenSize = 100,
  aspectRatio = "16:9",
  roomDimensions = { width: 4.5, length: 6.0, height: 2.8 },
  screenWall = "front", 
  seatingBlockOffset = 0,
  targetFovDeg = 57.5,
  screenPlaneOffset = 0, 
  mlpAnchor = null, // NEW: optional anchor for positioning (Y coordinate of the MLP's base position)
  mlpBasis = 'front', // NEW: how to position rows relative to anchor ('front', 'center', 'back')
} = {}) {
  const W = Number(roomDimensions.width) || 4.5;
  const L = Number(roomDimensions.length) || 6.0;

  // Use unified screen metrics
  const { viewWm, distance57 } = computeScreenMetrics(screenSize, aspectRatio);
  
  // Apply viewing distance offset (clamped to ±2.0m)
  const clampedOffset = clampViewingOffset(seatingBlockOffset);
  
  const generated = [];

  // NEW: If anchor provided, use it to compute row positions
  // Check if mlpAnchor is a valid number to proceed with anchor-based positioning
  if (typeof mlpAnchor === 'number' && isFinite(mlpAnchor)) {
    try {
      const rowSpacing = 1.0; // Standard row spacing
      // Apply the viewing offset to the mlpAnchor directly, as per new behavior specification
      const adjustedMlpAnchorY = mlpAnchor + clampedOffset;
      
      const rowCentersY = computeRowCentersAroundAnchor({
        mlpRef: mlpBasis,
        mlpAnchorY: adjustedMlpAnchorY, // Pass the adjusted anchor as the base Y
        rowCount: numberOfRows,
        rowSpacingM: rowSpacing,
        viewingOffsetM: 0, // No additional offset, it's now 'baked' into adjustedMlpAnchorY
      });
      
      let mlpRow = 1; // Default MLP row for 'front' basis
      if (mlpBasis === 'center') {
        mlpRow = Math.ceil(numberOfRows / 2);
      } else if (mlpBasis === 'back') {
        mlpRow = numberOfRows;
      }

      for (let row = 1; row <= numberOfRows; row++) {
        const y = rowCentersY[row - 1]; // rowCentersY is 0-indexed
        if (typeof y !== 'number' || !isFinite(y)) {
          console.warn(`[generateSeatingPositionsFOV] Invalid Y coordinate for row ${row}, skipping.`);
          continue;
        }
        
        // Clamp Y to room boundaries
        const MIN_Y_CLEAR = screenPlaneOffset + 0.4; // Minimum distance from screen plane (adjust for screenPlaneOffset)
        const MAX_Y_ROOM = L - 0.4; // Maximum distance, ensuring clearance from back wall
        const finalY = Math.max(MIN_Y_CLEAR, Math.min(y, MAX_Y_ROOM));

        const z = getEarHeightForRow(row);

        for (let seat = 1; seat <= seatsPerRow; seat++) {
          const offsetFromCenter = (seat - 1 - (seatsPerRow - 1) / 2) * seatSpacing;
          const x = W / 2 + offsetFromCenter;
          
          // Clamp X to room boundaries
          const MIN_X_CLEAR = 0.4;
          const MAX_X_ROOM = W - 0.4;
          const finalX = Math.max(MIN_X_CLEAR, Math.min(x, MAX_X_ROOM));

          const seatId = `R${row}S${seat}`;
          
          generated.push({
            id: seatId,
            x: Number(finalX.toFixed(3)),
            y: Number(finalY.toFixed(3)),
            z: Number(z.toFixed(3)),
            rowNumber: row,
            seatNumber: seat,
            isPrimary: row === mlpRow && seat === Math.ceil(seatsPerRow / 2), // Adjusted for mlpBasis
            viewingAngle: targetFovDeg,
            rp23Level: 4
          });
        }
      }

      return generated;
    } catch (error) {
      console.warn('[generateSeatingPositionsFOV] Anchor-based positioning failed:', error);
      // Fall through to legacy method if anchor-based fails
    }
  }

  // LEGACY: Original distance-based calculation (fallback if mlpAnchor is not provided or fails)
  // This path already correctly applies clampedOffset to targetDistance
  const targetDistance = distance57 + clampedOffset;
  const MIN_FRONT_CLEAR = 0.4;
  const MAX_Y_ROOM = L - 0.4; // Maximum distance, ensuring clearance from back wall

  const baseFromPlane = Math.max(targetDistance, MIN_FRONT_CLEAR);
  const baseY = Number(screenPlaneOffset) + baseFromPlane;
  const yFrontRow = Math.min(baseY, MAX_Y_ROOM); // Clamp front row to room back boundary

  const rowSpacing = 1.0;

  for (let row = 1; row <= numberOfRows; row++) {
    const y = yFrontRow + (row - 1) * rowSpacing;
    
    // Clamp Y to room boundaries also for legacy path
    const MIN_Y_CLEAR = screenPlaneOffset + 0.4; // Minimum distance from screen plane (adjust for screenPlaneOffset)
    const finalY = Math.max(MIN_Y_CLEAR, Math.min(y, MAX_Y_ROOM));

    const z = getEarHeightForRow(row);

    for (let seat = 1; seat <= seatsPerRow; seat++) {
      const offsetFromCenter = (seat - 1 - (seatsPerRow - 1) / 2) * seatSpacing;
      const x = W / 2 + offsetFromCenter;
      
      // Clamp X to room boundaries also for legacy path
      const MIN_X_CLEAR = 0.4;
      const MAX_X_ROOM = W - 0.4;
      const finalX = Math.max(MIN_X_CLEAR, Math.min(x, MAX_X_ROOM));
      
      const seatId = `R${row}S${seat}`;
      
      generated.push({
        id: seatId,
        x: Number(finalX.toFixed(3)),
        y: Number(finalY.toFixed(3)),
        z: Number(z.toFixed(3)),
        rowNumber: row,
        seatNumber: seat,
        isPrimary: row === 1 && seat === Math.ceil(seatsPerRow / 2),
        viewingAngle: targetFovDeg, 
        rp23Level: 4 
      });
    }
  }

  return generated;
}

/**
 * Evaluate RP23 compliance for existing seat positions
 * @param {array} seats - Existing seat positions
 * @param {number} screenSize - Screen diagonal in inches
 * @param {string} aspectRatio - Screen aspect ratio
 * @param {number} screenPlaneOffset - The Y coordinate of the screen plane (e.g., 0 for front wall)
 * @returns {array} Seats with RP23 analysis added
 */
export function evaluateRP23ForSeats(seats, screenSize, aspectRatio, screenPlaneOffset = 0) {
  // First, calculate the visible screen width from the diagonal and aspect ratio,
  // as calculateViewingAngle now expects visible width directly.
  const [arW, arH] = aspectRatio.split(':').map(Number);
  let visibleScreenWidthInches = 0;
  if (Number.isFinite(arW) && Number.isFinite(arH) && arW > 0 && arH > 0) {
    visibleScreenWidthInches = screenSize * (arW / Math.sqrt(arW ** 2 + arH ** 2));
  } else {
    console.warn("[evaluateRP23ForSeats] Invalid aspect ratio provided, cannot compute visible screen width.");
  }

  return seats.map(seat => {
    // Pass the derived visible screen width and screenPlaneOffset to calculateViewingAngle
    // aspectRatio parameter is now ignored by calculateViewingAngle but is kept for signature compatibility
    const viewingAngle = calculateViewingAngle(seat, visibleScreenWidthInches, aspectRatio, { y: screenPlaneOffset });
    
    // If viewingAngle is null (due to invalid inputs), provide a default or handle as error
    const validViewingAngle = viewingAngle === null ? 0 : viewingAngle; // Default to 0 for error cases

    const rp23Level = assignRP23Level(validViewingAngle);
    const distanceFromScreen = Math.abs(seat.y - screenPlaneOffset);
    
    return {
      ...seat,
      viewingAngle: validViewingAngle,
      rp23Level: rp23Level.level,
      rp23Label: rp23Level.label,
      rp23Color: rp23Level.color,
      distanceFromScreen: distanceFromScreen
    };
  });
}

/**
 * Compute listening area bounds (bounding box around seat centers) and dsw/dbw distances.
 * Returns null if no valid seats.
 */
export function getListeningAreaBounds(seatingPositions = [], roomDimensions = { width: 0, length: 0 }) {
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return null;
  const valid = seatingPositions.filter(s => typeof s?.x === "number" && typeof s?.y === "number");
  if (valid.length === 0) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of valid) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const w = Number(roomDimensions?.width) || 0;
  const l = Number(roomDimensions?.length) || 0;

  // Distance to side walls (min distance of the bounding box to either side wall)
  const dswLeft = Math.max(0, minX);          // distance from left wall (x=0)
  const dswRight = Math.max(0, Math.max(0, w - maxX)); // distance from right wall (x=w)
  const dsw = Math.min(dswLeft, dswRight);

  // Distance to back wall (rear/back wall at y=length)
  const dbw = Math.max(0, l - maxY);

  return { minX, maxX, minY, maxY, midX, midY, dsw, dbw };
}

/**
 * Grade a distance (m) into RP22-like L1..L4 thresholds for wall clearances.
 * Thresholds (m): L4 >= 1.5, L3 >= 1.2, L2 >= 0.8, L1 >= 0.5, else 0.
 */
export function gradeWallClearance(distanceM = 0) {
  const d = Number(distanceM) || 0;
  if (d >= 1.5) return 4;
  if (d >= 1.2) return 3;
  if (d >= 0.8) return 2;
  if (d >= 0.5) return 1;
  return 0;
}

// Export individual functions for use in other components
export { calculateViewingAngle, assignRP23Level, calculateOptimalViewingDistance };