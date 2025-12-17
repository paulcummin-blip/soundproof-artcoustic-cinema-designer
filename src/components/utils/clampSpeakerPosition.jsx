// components/utils/clampSpeakerPosition.js
// Universal speaker position clamping and rear-wall snapping for Room Designer.
// Ensures NO speaker ever spawns outside the room on initial render.

// WALL_INSET_M: Same inset used for front LCR placement (symmetrical front/rear)
const WALL_INSET_M = 0.05;

// Rear speaker roles that MUST snap to back wall
const REAR_ROLES = new Set(['SBL', 'SBR', 'RBL', 'RBR', 'RL', 'RR', 'RSL', 'RSR', 'LRS', 'RRS']);

// Rear overhead roles that MUST snap to back wall
const REAR_OVERHEAD_ROLES = new Set(['TBL', 'TBR', 'TRL', 'TRR', 'TBC', 'TRC']);

/**
 * Normalize role to canonical form for comparison
 */
function getCanonicalRole(role) {
  const map = {
    // Bed surrounds
    'SL': 'SL', 'LS': 'SL',
    'SR': 'SR', 'RS': 'SR',
    'SBL': 'SBL', 'RL': 'SBL', 'RSL': 'SBL', 'LR': 'SBL', 'LRS': 'SBL',
    'SBR': 'SBR', 'RR': 'SBR', 'RSR': 'SBR', 'RRS': 'SBR',
    // Overheads
    'TBL': 'TBL', 'TRL': 'TBL',
    'TBR': 'TBR', 'TRR': 'TBR',
  };
  const upper = String(role || '').toUpperCase();
  return map[upper] || upper;
}

/**
 * Check if a role is a rear speaker (bed-layer or overhead)
 */
function isRearRole(role) {
  const canonical = getCanonicalRole(role);
  return REAR_ROLES.has(canonical) || REAR_OVERHEAD_ROLES.has(canonical);
}

/**
 * Clamp and snap speaker position to room bounds.
 * 
 * Rules:
 * - All speakers: clamp X and Y to [WALL_INSET_M, dimension - WALL_INSET_M]
 * - Rear speakers: force Y = room.length - WALL_INSET_M (snap to back wall)
 * 
 * @param {string} role - Speaker role (e.g. 'SBL', 'TRL', 'SL')
 * @param {Object} position - {x, y, z} in meters
 * @param {Object} dimensions - {width, length, height} OR {widthM, lengthM, heightM}
 * @returns {Object} Corrected {x, y, z} in meters
 */
export function clampSpeakerPosition(role, position, dimensions) {
  if (!position || !dimensions) return position;

  // Normalize dimensions (support both naming conventions)
  const W = Number(dimensions?.width ?? dimensions?.widthM) || 4.5;
  const L = Number(dimensions?.length ?? dimensions?.lengthM) || 6.0;

  let { x, y, z } = position;

  // If coordinates are invalid, don't attempt to fix
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    console.warn('[clampSpeakerPosition] Invalid coordinates for', role, position);
    return position;
  }

  // Preserve Z (not affected by room bounds)
  const safeZ = Number.isFinite(z) ? z : 1.1;

  // Clamp X and Y to room bounds
  const minX = WALL_INSET_M;
  const maxX = W - WALL_INSET_M;
  const minY = WALL_INSET_M;
  const maxY = L - WALL_INSET_M;

  let clampedX = Math.max(minX, Math.min(maxX, x));
  let clampedY = Math.max(minY, Math.min(maxY, y));

  // CRITICAL: Rear speakers MUST snap to back wall
  if (isRearRole(role)) {
    const backWallY = L - WALL_INSET_M;
    clampedY = backWallY;
    
    // Debug log for rear speakers (help identify placement issues)
    if (Math.abs(y - backWallY) > 0.01) {
      console.log(`[clampSpeakerPosition] ${role} snapped to back wall: ${y.toFixed(3)}m → ${backWallY.toFixed(3)}m`);
    }
  }

  return { x: clampedX, y: clampedY, z: safeZ };
}

/**
 * Batch clamp all speakers in an array.
 * Returns { speakers, changed: boolean }
 */
export function clampAllSpeakers(speakers, dimensions) {
  if (!Array.isArray(speakers) || speakers.length === 0) {
    return { speakers, changed: false };
  }

  let changed = false;
  const clamped = speakers.map(spk => {
    if (!spk || !spk.position) return spk;

    const corrected = clampSpeakerPosition(spk.role, spk.position, dimensions);
    
    // Check if position actually changed
    const EPS = 0.001;
    const posChanged = 
      Math.abs((corrected.x || 0) - (spk.position.x || 0)) > EPS ||
      Math.abs((corrected.y || 0) - (spk.position.y || 0)) > EPS;

    if (posChanged) {
      changed = true;
      return { ...spk, position: corrected };
    }

    return spk;
  });

  return { speakers: clamped, changed };
}