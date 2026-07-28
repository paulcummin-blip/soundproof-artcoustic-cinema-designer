// Utilities for applying recommended subwoofer layouts and detecting applied state.
// Coordinates are in metres and represent cabinet centres, matching the saved
// room-plan subwoofer objects.

export const COORDINATE_TOLERANCE_M = 0.01; // 10 mm

const roundCoord = (value) => Number(Number(value || 0).toFixed(6));

/**
 * Compare two arrays of source coordinates within a tolerance.
 * Returns true only if every source matches position-by-position.
 */
export function coordinatesMatch(currentSources, recommendationSources, tolerance = COORDINATE_TOLERANCE_M) {
  const current = Array.isArray(currentSources) ? currentSources : [];
  const recommended = Array.isArray(recommendationSources) ? recommendationSources : [];
  if (current.length === 0 || recommended.length === 0) return false;
  if (current.length !== recommended.length) return false;
  // Unordered matching: every recommended position must have a matching current
  // position. This handles identical subs being in a different order.
  const used = new Array(current.length).fill(false);
  return recommended.every((candidate) => {
    const cx = roundCoord(candidate.x);
    const cy = roundCoord(candidate.y);
    for (let index = 0; index < current.length; index += 1) {
      if (used[index]) continue;
      const dx = Math.abs(roundCoord(current[index].x) - cx);
      const dy = Math.abs(roundCoord(current[index].y) - cy);
      if (dx <= tolerance && dy <= tolerance) {
        used[index] = true;
        return true;
      }
    }
    return false;
  });
}

/**
 * Validate that every recommended coordinate is inside the room boundary.
 * Returns { valid: boolean, reason: string | null, invalidIndex: number | null }.
 */
export function validateRecommendationCoordinates(layout, roomDims) {
  if (!layout?.sources || !Array.isArray(layout.sources) || layout.sources.length === 0) {
    return { valid: false, reason: "No recommended positions found.", invalidIndex: null };
  }
  const width = Number(roomDims?.widthM) || 0;
  const length = Number(roomDims?.lengthM) || 0;
  if (width <= 0 || length <= 0) {
    return { valid: false, reason: "Room dimensions are not valid.", invalidIndex: null };
  }
  const margin = 0.001; // 1 mm safety margin
  for (let index = 0; index < layout.sources.length; index += 1) {
    const source = layout.sources[index];
    const x = Number(source?.x);
    const y = Number(source?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { valid: false, reason: `Sub ${index + 1} has missing coordinates.`, invalidIndex: index };
    }
    if (x < margin || x > width - margin || y < margin || y > length - margin) {
      return { valid: false, reason: `Sub ${index + 1} is outside the room boundary.`, invalidIndex: index };
    }
  }
  return { valid: true, reason: null, invalidIndex: null };
}

/**
 * Compute wall-relative distances for a source position.
 * All distances are in metres from the cabinet centre to the wall.
 */
export function wallRelativeDimensions(source, roomDims) {
  const x = Number(source?.x) || 0;
  const y = Number(source?.y) || 0;
  const width = Number(roomDims?.widthM) || 0;
  const length = Number(roomDims?.lengthM) || 0;
  return {
    fromLeftWall: roundCoord(x),
    fromRightWall: roundCoord(Math.max(0, width - x)),
    fromFrontWall: roundCoord(y),
    fromRearWall: roundCoord(Math.max(0, length - y)),
  };
}

/**
 * Check whether a recommended position conflicts with a room element (door, window, etc.).
 * Returns { conflicts: boolean, reason: string | null }.
 */
export function checkPositionConflicts(layout, roomElements, roomDims) {
  if (!Array.isArray(roomElements) || roomElements.length === 0) {
    return { conflicts: false, reason: null };
  }
  const width = Number(roomDims?.widthM) || 0;
  const length = Number(roomDims?.lengthM) || 0;
  for (let index = 0; index < layout.sources.length; index += 1) {
    const source = layout.sources[index];
    const sx = Number(source?.x) || 0;
    const sy = Number(source?.y) || 0;
    for (const element of roomElements) {
      if (!element || !element.type) continue;
      const wall = element.wall;
      const xPosition = Number(element.x_position) || 0; // 0-1 along wall
      const elemWidth = Number(element.width) || 0;
      const clearance = Number(element.clearance) || 0.5;
      // Simplified conflict check: within clearance distance of the element zone
      if (wall === "front" || wall === "back") {
        const wallY = wall === "front" ? 0 : length;
        const elemStartX = xPosition * width;
        const elemEndX = elemStartX + elemWidth;
        const distToWall = Math.abs(sy - wallY);
        if (distToWall < clearance && sx >= elemStartX - clearance && sx <= elemEndX + clearance) {
          return { conflicts: true, reason: `Sub ${index + 1} conflicts with a ${element.type} on the ${wall} wall.` };
        }
      } else if (wall === "left" || wall === "right") {
        const wallX = wall === "left" ? 0 : width;
        const elemStartY = xPosition * length;
        const elemEndY = elemStartY + elemWidth;
        const distToWall = Math.abs(sx - wallX);
        if (distToWall < clearance && sy >= elemStartY - clearance && sy <= elemEndY + clearance) {
          return { conflicts: true, reason: `Sub ${index + 1} conflicts with a ${element.type} on the ${wall} wall.` };
        }
      }
    }
  }
  return { conflicts: false, reason: null };
}