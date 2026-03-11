/**
 * rvGeometry.js
 * Pure geometry helpers extracted from RoomVisualisation.jsx (Stage 1).
 * No side effects. No React imports.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const SURROUND_WALL_GAP_M = 0.01;

const WALL_BUFFER_M = 0.01; // min gap between screen face and speaker face

// ─── Wall-position helpers ────────────────────────────────────────────────────

/**
 * Returns the X position of a side-wall speaker so its rotated footprint
 * stays at least SURROUND_WALL_GAP_M from the wall.
 *
 * @param {number} roomWidth
 * @param {{ depthM?: number, widthM?: number }|null|undefined} dims
 * @param {'left'|'right'|'L'|'R'} side
 * @param {number} [yawDeg=90] - live yaw from the renderer (default 90 = wall-flat)
 * @returns {number}
 */
export function sideWallX(roomWidth, dims, side, yawDeg = 90) {
  const depthM = dims?.depthM ?? 0.082;
  const widthM = dims?.widthM ?? 0.27;
  const halfX = xHalfExtentM(depthM, widthM, yawDeg);
  if (side === 'left' || side === 'L') {
    return halfX + SURROUND_WALL_GAP_M;
  }
  return roomWidth - halfX - SURROUND_WALL_GAP_M;
}

/** Alias kept for callers that use fixedSideX */
export const fixedSideX = sideWallX;

/**
 * Returns the Y position of a rear-wall speaker so its rotated footprint
 * stays at least SURROUND_WALL_GAP_M from the rear wall.
 *
 * @param {number} roomLength
 * @param {{ depthM?: number, widthM?: number }|null|undefined} dims
 * @param {number} [yawDeg=180] - live yaw from renderer (default 180 = facing front)
 * @returns {number}
 */
export function rearWallY(roomLength, dims, yawDeg = 180) {
  const depthM = dims?.depthM ?? 0.082;
  const widthM = dims?.widthM ?? 0.27;
  const halfY = yHalfExtentM(depthM, widthM, yawDeg);
  return roomLength - halfY - SURROUND_WALL_GAP_M;
}

// ─── Overhead pair map ────────────────────────────────────────────────────────

/**
 * Maps overhead canonical roles to their paired partner role.
 * TFL↔TFR, TML↔TMR, TRL↔TRR
 */
export const OVERHEAD_PAIR_MAP = {
  TFL: 'TFR',
  TFR: 'TFL',
  TML: 'TMR',
  TMR: 'TML',
  TRL: 'TRR',
  TRR: 'TRL',
};

// ─── Angle helpers ────────────────────────────────────────────────────────────

/**
 * Floor a degree value, returning null for null/undefined.
 * Adds 1e-9 before flooring to avoid floating-point edge cases.
 *
 * @param {number|null|undefined} deg
 * @returns {number|null}
 */
export function floorDeg(deg) {
  if (deg == null || !Number.isFinite(deg)) return null;
  return Math.floor(deg + 1e-9);
}

/**
 * Mirror an X coordinate around a centre line.
 *
 * @param {number} x
 * @param {number} cx - centre X
 * @returns {number}
 */
export function mirrorX(x, cx) {
  return 2 * cx - x;
}

/**
 * Clamp a value to a [min, max] segment.
 *
 * @param {number} x
 * @param {{ min: number, max: number }} seg
 * @returns {number}
 */
export function clampToSegment(x, seg) {
  if (!seg) return x;
  return Math.max(seg.min, Math.min(seg.max, x));
}

// ─── LCR symmetric placement ──────────────────────────────────────────────────

/**
 * Resolve the X position for a symmetric LCR speaker, respecting zone limits.
 *
 * @param {{ desiredX: number, isLeft: boolean, screenCenterX: number, leftZone: { min:number, max:number }|null, rightZone: { min:number, max:number }|null }} opts
 * @returns {number}
 */
export function resolveSymmetricLCR({ desiredX, isLeft, screenCenterX, leftZone, rightZone }) {
  const zone = isLeft ? leftZone : rightZone;
  if (!zone) return desiredX;
  const clamped = clampToSegment(desiredX, zone);
  return clamped;
}

// ─── Minimum screen depth ─────────────────────────────────────────────────────

/**
 * Half the Y extent of a speaker box projected onto the room-Y axis at yawDeg.
 * (0° = facing front wall; 90° = facing right wall)
 */
export function yHalfExtentM(depthM, widthM, yawDeg) {
  const rad = (yawDeg * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  return (depthM * cosA + widthM * sinA) / 2;
}

/**
 * Half the X extent of a speaker box projected onto the room-X axis at yawDeg.
 * Used to compute how far a rotated speaker protrudes toward a side wall.
 *
 * At yaw=90° (wall-flat, facing into room) this equals depthM/2 — matching
 * the old halfDepth calculation, so existing callers are unaffected.
 *
 * @param {number} depthM
 * @param {number} widthM
 * @param {number} yawDeg - 0° = facing front, 90° = facing right (wall-flat on left wall)
 * @returns {number}
 */
export function xHalfExtentM(depthM, widthM, yawDeg) {
  const rad = (yawDeg * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  // X projection is the complement of Y projection: sin↔cos swapped
  return (depthM * sinA + widthM * cosA) / 2;
}

/**
 * Determine whether a canonical role is a subwoofer role.
 * @param {string} role
 * @returns {boolean}
 */
function isSubRole(role) {
  if (!role) return false;
  const r = role.toUpperCase();
  return r === 'SW' || r === 'SUB' || r.startsWith('SW') || r.startsWith('SUB');
}

/**
 * Compute the minimum screen front-plane depth (metres from front wall) so
 * that all front/centre/sub speakers clear the screen face by WALL_BUFFER_M.
 *
 * @param {{ frontObjects?: Array, getDims: (speaker: object) => { widthM: number, depthM: number, heightM: number }|null, lcrAngles?: { L: number, R: number }, aimAtMLP?: boolean }} opts
 * @returns {number} depth in metres (≥ 0), or 0 if no objects / no clearance needed
 */
export function computeMinimumScreenDepthM({
  frontObjects = [],
  getDims,
  lcrAngles = { L: 0, R: 0 },
  aimAtMLP = false,
}) {
  if (!frontObjects.length || typeof getDims !== 'function') return 0;

  let maxDepth = 0;

  for (const obj of frontObjects) {
    const dims = getDims(obj);
    if (!dims) continue;

    const { depthM = 0.082, widthM = 0.082 } = dims;
    const role = (obj?.role ?? '').toUpperCase();

    // Determine yaw angle for this speaker
    let yawDeg = 0;
    if (role === 'FL' || role === 'L') {
      yawDeg = aimAtMLP ? (lcrAngles?.L ?? 0) : 0;
    } else if (role === 'FR' || role === 'R') {
      yawDeg = aimAtMLP ? (lcrAngles?.R ?? 0) : 0;
    } else {
      // FC / centre / subs — always 0
      yawDeg = 0;
    }

    const halfExtent = yHalfExtentM(depthM, widthM, yawDeg);
    // The speaker front face is at: speakerCentreY - halfExtent
    // We need the screen front plane to be at least: speakerCentreY + halfExtent + WALL_BUFFER_M
    // But the centreY for a front-wall speaker IS halfExtent (touching back of screen)
    // So minimum screen depth = depthM + WALL_BUFFER_M (full depth + gap)
    const neededDepth = halfExtent * 2 + WALL_BUFFER_M;
    if (neededDepth > maxDepth) maxDepth = neededDepth;
  }

  return maxDepth;
}