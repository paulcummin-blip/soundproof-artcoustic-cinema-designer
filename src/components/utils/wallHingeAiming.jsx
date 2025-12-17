/**
 * Wall-hinge rotation: compute yaw angle that aims speaker at MLP
 * while preventing the cabinet from visually penetrating the wall.
 */

/**
 * Calculate raw yaw angle from speaker to target point (in degrees)
 * @param {object} speakerPos - {x, y}
 * @param {object} targetPos - {x, y}
 * @returns {number} Angle in degrees
 */
export function calculateRawYaw(speakerPos, targetPos) {
  if (!speakerPos || !targetPos) return 0;
  if (!Number.isFinite(speakerPos.x) || !Number.isFinite(speakerPos.y)) return 0;
  if (!Number.isFinite(targetPos.x) || !Number.isFinite(targetPos.y)) return 0;
  
  const dx = targetPos.x - speakerPos.x;
  const dy = targetPos.y - speakerPos.y;
  
  // atan2(dx, dy) gives angle from positive Y-axis (room forward direction)
  const angleRad = Math.atan2(dx, dy);
  return angleRad * (180 / Math.PI);
}

/**
 * Determine which wall a speaker is mounted on based on its position
 * @param {object} speakerPos - {x, y}
 * @param {object} roomDims - {width, length}
 * @param {number} tolerance - Distance threshold to consider "on wall"
 * @returns {string|null} 'front' | 'back' | 'left' | 'right' | null
 */
export function determineWall(speakerPos, roomDims, tolerance = 0.05) {
  if (!speakerPos || !roomDims) return null;
  if (!Number.isFinite(speakerPos.x) || !Number.isFinite(speakerPos.y)) return null;
  
  const { x, y } = speakerPos;
  const { width, length } = roomDims;
  
  // Check each wall
  if (Math.abs(y) < tolerance) return 'front';
  if (Math.abs(y - length) < tolerance) return 'back';
  if (Math.abs(x) < tolerance) return 'left';
  if (Math.abs(x - width) < tolerance) return 'right';
  
  return null;
}

/**
 * Clamp yaw angle to prevent cabinet from penetrating wall
 * @param {number} rawYaw - Unclamped yaw angle (degrees)
 * @param {string} wall - 'front' | 'back' | 'left' | 'right'
 * @param {number} maxRotation - Maximum rotation from wall normal (degrees)
 * @returns {number} Clamped yaw angle (degrees)
 */
export function clampYawForWall(rawYaw, wall, maxRotation = 85) {
  if (!wall) return rawYaw;
  
  // Define wall normal angles (direction perpendicular to wall, pointing into room)
  const wallNormals = {
    front: 0,     // Front wall faces down (positive Y)
    back: 180,    // Back wall faces up (negative Y)
    left: 90,     // Left wall faces right (positive X)
    right: -90,   // Right wall faces left (negative X)
  };
  
  const normalAngle = wallNormals[wall];
  if (normalAngle === undefined) return rawYaw;
  
  // Normalize angles to -180 to 180 range
  const normalize = (angle) => {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  };
  
  const normYaw = normalize(rawYaw);
  const normNormal = normalize(normalAngle);
  
  // Calculate angular difference from wall normal
  let diff = normalize(normYaw - normNormal);
  
  // Clamp to max rotation range
  if (diff > maxRotation) diff = maxRotation;
  if (diff < -maxRotation) diff = -maxRotation;
  
  return normalize(normNormal + diff);
}

/**
 * Main function: compute wall-hinge aimed yaw for a speaker
 * @param {object} params
 * @param {string} params.speakerRole - Speaker role (FL/FR/LW/RW/SL/SR/SBL/SBR)
 * @param {object} params.speakerPos - {x, y}
 * @param {object} params.mlpPos - {x, y}
 * @param {object} params.roomDims - {width, length}
 * @param {string} params.wall - Optional: 'front'|'back'|'left'|'right' (auto-detected if omitted)
 * @param {number} params.maxRotation - Maximum rotation from wall normal (default 85°)
 * @returns {number} Yaw angle in degrees, or null if inputs invalid
 */
export function computeWallHingeYaw({
  speakerRole,
  speakerPos,
  mlpPos,
  roomDims,
  wall = null,
  maxRotation = 85
}) {
  // Validate inputs
  if (!speakerPos || !mlpPos || !roomDims) {
    return null;
  }
  
  if (!Number.isFinite(speakerPos.x) || !Number.isFinite(speakerPos.y)) {
    return null;
  }
  
  if (!Number.isFinite(mlpPos.x) || !Number.isFinite(mlpPos.y)) {
    return null;
  }
  
  // Auto-detect wall if not provided
  const mountWall = wall || determineWall(speakerPos, roomDims);
  if (!mountWall) {
    // Can't determine wall, return raw yaw without clamping
    return calculateRawYaw(speakerPos, mlpPos);
  }
  
  // Calculate raw yaw to MLP
  const rawYaw = calculateRawYaw(speakerPos, mlpPos);
  
  // Clamp to prevent wall penetration
  return clampYawForWall(rawYaw, mountWall, maxRotation);
}

/**
 * Check if yaw angle changed significantly (avoid infinite update loops)
 * @param {number} oldYaw
 * @param {number} newYaw
 * @param {number} threshold - Minimum change in degrees to consider significant
 * @returns {boolean}
 */
export function yawChangedSignificantly(oldYaw, newYaw, threshold = 0.1) {
  if (!Number.isFinite(oldYaw) || !Number.isFinite(newYaw)) return true;
  return Math.abs(newYaw - oldYaw) > threshold;
}