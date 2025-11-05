
/**
 * Speaker positioning utilities with proper wall-based placement
 * Screen is always on the front wall (Y = 0), room depth is Y-axis
 */

import { medianAlongWallsForWide } from './frontWideUtils';

/**
 * Calculate azimuth angle (consistent with speakerUtils.js)
 * @param {object} from - Listening position {x, y}
 * @param {object} to - Speaker position {x, y}
 * @returns {number} Azimuth in degrees (0-360), where 0° is right side (positive X axis)
 */
function calculateAzimuthAngle(from, to) {
  const dx = to.x - from.x;
  const dy = from.y - to.y; // Y axis flipped because screen is 'north' (Y=0 is front, Y increases towards back)
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

/**
 * Apply corner avoidance rule for surround speakers
 * @param {object} position - Current speaker position {x, y, z}
 * @param {object} dimensions - Room dimensions {width, length, height}
 * @param {object} mlp - Main listening position {x, y}
 * @returns {object} Adjusted position avoiding corners
 */
function avoidCorners(position, dimensions, mlp) {
  const { x, y } = position;
  const { width, length } = dimensions;
  const cornerBuffer = 0.5; // Meters from corner to avoid

  let newX = x;
  let newY = y;

  // Check if too close to any corner (based on initial placement, not MLP)
  const tooCloseToLeftFront = x < cornerBuffer && y < cornerBuffer;
  const tooCloseToRightFront = x > width - cornerBuffer && y < cornerBuffer;
  const tooCloseToLeftRear = x < cornerBuffer && y > length - cornerBuffer;
  const tooCloseToRightRear = x > width - cornerBuffer && y > length - cornerBuffer;

  if (tooCloseToLeftFront) {
    newX = Math.max(x, cornerBuffer);
    newY = Math.max(y, cornerBuffer);
  } else if (tooCloseToRightFront) {
    newX = Math.min(x, width - cornerBuffer);
    newY = Math.max(y, cornerBuffer);
  } else if (tooCloseToLeftRear) {
    newX = Math.max(x, cornerBuffer);
    newY = Math.min(y, length - cornerBuffer);
  } else if (tooCloseToRightRear) {
    newX = Math.min(x, width - cornerBuffer);
    newY = Math.min(y, length - cornerBuffer);
  }

  return { ...position, x: newX, y: newY };
}


/**
 * Calculate speaker position based on role and room constraints
 * @param {string} role - Speaker role (L, C, R, LS, RS, etc.)
 * @param {object} dimensions - Room dimensions {width, length, height}
 * @param {array} seatingPositions - Array of seat positions
 * @param {string} screenWall - Wall where screen is located (always 'north')
 * @param {object} screenInfo - Screen information {width}
 * @param {number} seatingRows - Number of seating rows
 * @returns {object} Speaker position {x, y, z}
 */
export function calculateSpeakerPosition(role, dimensions, seatingPositions, screenWall, screenInfo, seatingRows) {
  const { width, length, height } = dimensions;
  const screenWidthMeters = screenInfo?.width || 3.0;

  // Calculate MLP from primary seats
  const primarySeats = seatingPositions.filter(s => s.isPrimary);
  const mlp = primarySeats.length > 0 ? {
    x: primarySeats.reduce((sum, s) => sum + s.x, 0) / primarySeats.length,
    y: primarySeats.reduce((sum, s) => sum + s.y, 0) / primarySeats.length
  } : { x: width / 2, y: length * 0.6 };

  let position = { x: width / 2, y: length / 2, z: 1.2 };

  // Handle Wide speakers with median wall-path placement
  if (role === 'LW' || role === 'RW') {
    // Get existing speaker positions for calculation
    // This `allSpeakers` variable is currently a placeholder as this function calculates
    // a single speaker's position. The `calculateOptimalWidePositions` function
    // below will handle the full calculation based on all speakers.
    const allSpeakers = seatingPositions.length > 0 ? [] : []; 
    
    // For now, use basic positioning - this will be enhanced by the placement system
    if (role === 'LW') {
      position = {
        x: Math.max(0.3, width * 0.15),
        y: 0.3,
        z: 1.2
      };
    } else if (role === 'RW') {
      position = {
        x: Math.min(width - 0.3, width * 0.85),
        y: 0.3,
        z: 1.2
      };
    }
  } else {
    switch (role) {
      // LCR Speakers - Always on screen wall (Y = 0)
      case 'C': // Center
        position = {
          x: width / 2,
          y: 0.1, // Flush to front wall
          z: screenInfo?.height || 1.2
        };
        break;

      case 'L': // Left
        position = {
          x: Math.max(0.3, (width / 2) - (screenWidthMeters / 2) + 0.3),
          y: 0.1,
          z: screenInfo?.height || 1.2
        };
        break;

      case 'R': // Right
        position = {
          x: Math.min(width - 0.3, (width / 2) + (screenWidthMeters / 2) - 0.3),
          y: 0.1,
          z: screenInfo?.height || 1.2
        };
        break;

      // Side Surrounds - Lock to side walls
      case 'LS': // Left Surround
        {
          const targetY = Math.max(0.5, Math.min(length - 0.5, mlp.y + 0.5));
          position = {
            x: 0.1, // Flush to left wall
            y: targetY,
            z: 1.2
          };
        }
        break;

      case 'RS': // Right Surround
        {
          const targetY = Math.max(0.5, Math.min(length - 0.5, mlp.y + 0.5));
          position = {
            x: width - 0.1, // Flush to right wall
            y: targetY,
            z: 1.2
          };
        }
        break;

      // Rear Surrounds - Prefer rear wall, avoid corners
      case 'LBS': // Left Back Surround
      case 'LRS': // Left Rear Surround
        {
          // Try rear wall first
          let x = Math.max(0.5, width * 0.25);
          let y = length - 0.1;

          // Check if angle from MLP is acceptable (135°-150°)
          const azimuth = calculateAzimuthAngle(mlp, { x, y });

          if (azimuth >= 135 && azimuth <= 150) {
            position = { x, y, z: 1.2 };
          } else {
            // Fallback to side wall
            position = {
              x: 0.1,
              y: Math.max(0.5, Math.min(length - 0.5, length * 0.8)),
              z: 1.2
            };
          }
          // Apply corner avoidance
          position = avoidCorners(position, dimensions, mlp);
        }
        break;

      case 'RBS': // Right Back Surround
      case 'RRS': // Right Rear Surround
        {
          // Try rear wall first
          let x = Math.min(width - 0.5, width * 0.75);
          let y = length - 0.1;

          // Check if angle from MLP is acceptable (210°-225°)
          const azimuth = calculateAzimuthAngle(mlp, { x, y });

          if (azimuth >= 210 && azimuth <= 225) {
            position = { x, y, z: 1.2 };
          } else {
            // Fallback to side wall
            position = {
              x: width - 0.1,
              y: Math.max(0.5, Math.min(length - 0.5, length * 0.8)),
              z: 1.2
            };
          }
          // Apply corner avoidance
          position = avoidCorners(position, dimensions, mlp);
        }
        break;

      // Additional Side Surrounds
      case 'LSS': // Left Side Surround
        position = {
          x: 0.1,
          y: Math.max(0.5, Math.min(length - 0.5, mlp.y - 0.5)),
          z: 1.2
        };
        break;

      case 'RSS': // Right Side Surround
        position = {
          x: width - 0.1,
          y: Math.max(0.5, Math.min(length - 0.5, mlp.y - 0.5)),
          z: 1.2
        };
        break;

      // Height/Overhead Speakers
      case 'TFL': // Top Front Left
        position = {
          x: width * 0.3,
          y: length * 0.3,
          z: height - 0.2
        };
        break;

      case 'TFR': // Top Front Right
        position = {
          x: width * 0.7,
          y: length * 0.3,
          z: height - 0.2
        };
        break;

      case 'TRL': // Top Rear Left
        position = {
          x: width * 0.3,
          y: length * 0.7,
          z: height - 0.2
        };
        break;

      case 'TRR': // Top Rear Right
        position = {
          x: width * 0.7,
          y: length * 0.7,
          z: height - 0.2
        };
        break;

      case 'TM': // Top Middle
        position = {
          x: width / 2,
          y: length / 2,
          z: height - 0.2
        };
        break;

      default:
        // Default positioning for unknown roles
        position = {
          x: width / 2,
          y: length / 2,
          z: 1.2
        };
    }
  }

  // Final validation - ensure position is within room bounds
  position.x = Math.max(0.1, Math.min(width - 0.1, position.x));
  position.y = Math.max(0.1, Math.min(length - 0.1, position.y));
  position.z = Math.max(0.1, Math.min(height - 0.1, position.z));

  return position;
}

/**
 * Enhanced placement function that handles Wide speakers with proper wall-path logic.
 * This function should be called *after* initial L, R, LS, RS positions are determined.
 * @param {array} allSpeakers - Array of all speaker objects with their calculated positions.
 * @param {object} dimensions - Room dimensions {width, length, height}.
 * @returns {object} An object containing optimal positions for LW and RW, or null if not calculable.
 */
export function calculateOptimalWidePositions(allSpeakers, dimensions) {
  const { width, length } = dimensions;
  
  // Find the L/R and LS/RS speakers
  const L = allSpeakers.find(sp => sp.role === 'L');
  const R = allSpeakers.find(sp => sp.role === 'R');
  const LS = allSpeakers.find(sp => sp.role === 'LS');
  const RS = allSpeakers.find(sp => sp.role === 'RS');

  if (!L || !R || !LS || !RS) {
    console.warn("Cannot calculate optimal wide positions: missing L, R, LS, or RS speakers.");
    return { LW: null, RW: null };
  }

  const widePositions = medianAlongWallsForWide({
    leftWallX: 0.1,
    rightWallX: width - 0.1,
    frontWallY: 0.1,
    L: L.position,
    LS: LS.position,
    R: R.position,
    RS: RS.position
  });

  return widePositions;
}


/**
 * Optimize surround speaker positions for RP22 Parameter 5 compliance
 * @param {array} speakers - Array of speaker objects with positions
 * @param {object} mlp - Main Listening Position
 * @param {object} dimensions - Room dimensions
 * @returns {array} Optimized speaker array
 */
export function optimizeSurroundPositions(speakers, mlp, dimensions) {
  const surroundRoles = ["LS", "RS", "LSS", "RSS", "LBS", "RBS", "LRS", "RRS", "LW", "RW"];
  const surrounds = speakers.filter(sp => surroundRoles.includes(sp.role));

  if (surrounds.length < 2) return speakers;

  // Calculate azimuths and sort clockwise
  const surroundsWithAzimuth = surrounds.map(sp => ({
    ...sp,
    azimuth: calculateAzimuthAngle(mlp, sp.position) // Use the new azimuth function
  }));

  let sorted = surroundsWithAzimuth.sort((a, b) => a.azimuth - b.azimuth);

  // Anchor sequence on RS if present
  const rsIndex = sorted.findIndex(s => s.role === 'RS');
  if (rsIndex > 0) {
    sorted = [...sorted.slice(rsIndex), ...sorted.slice(0, rsIndex)];
  }

  // Calculate adjacent angles for RP22 compliance
  const optimizedSurrounds = sorted.map((speaker, index) => {
    if (index === sorted.length - 1) return speaker; // Last speaker, no adjustment needed

    const nextSpeaker = sorted[index + 1];
    const angleDiff = (nextSpeaker.azimuth - speaker.azimuth + 360) % 360;

    // If angle is too wide, try to compress spacing
    if (angleDiff > 80) {
      // Attempt to move speakers closer while respecting wall constraints
      // This is a simplified optimization - full implementation would be more complex
      console.warn(`Wide angle detected between ${speaker.role} and ${nextSpeaker.role}: ${angleDiff.toFixed(1)}°`);
    }

    return speaker;
  });

  // Replace optimized surrounds in the original array
  const otherSpeakers = speakers.filter(sp => !surroundRoles.includes(sp.role));
  return [...otherSpeakers, ...optimizedSurrounds];
}
