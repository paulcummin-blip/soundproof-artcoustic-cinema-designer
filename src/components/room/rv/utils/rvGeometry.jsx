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
 * Returns the X position of a side-wall speaker, accounting for speaker depth
 * and the mandatory wall gap.
 *
 * @param {number} roomWidth  - room width in metres
 * @param {{ depthM?: number, widthM?: number }|null|undefined} dims - speaker dims
 * @param {'left'|'right'} side
 * @returns {number}
 */
/**
 * Half-extent of a rotated rectangular speaker along the wall-normal (X) axis.
 * For a side-wall speaker, this is the clearance dimension in room-X.
 * At yaw=90° (natural side orientation, depth into room) → returns halfDepth.
 */
export function xHalfExtentSideWall(depthM, widthM, yawDeg) {
  const rad = (yawDeg || 0) * Math.PI / 180;
  return (widthM * Math.abs(Math.cos(rad)) + depthM * Math.abs(Math.sin(rad))) / 2;
}

export function sideWallX(roomWidth, dims, side, yawDeg) {
  const d = dims?.depthM ?? 0.082;
  const halfExtent = (yawDeg != null)
    ? xHalfExtentSideWall(d, dims?.widthM ?? 0.27, yawDeg)
    : d / 2;
  if (side === 'left' || side === 'L') {
    return halfExtent + SURROUND_WALL_GAP_M;
  }
  return roomWidth - halfExtent - SURROUND_WALL_GAP_M;
}

/** Alias kept for callers that use fixedSideX */
export const fixedSideX = sideWallX;

/**
 * Returns the Y position of a rear-wall speaker.
 *
 * @param {number} roomLength
 * @param {{ depthM?: number }|null|undefined} dims
 * @returns {number}
 */
export function rearWallY(roomLength, dims, yawDeg) {
  const d = dims?.depthM ?? 0.082;
  if (yawDeg == null) return roomLength - d / 2 - SURROUND_WALL_GAP_M;
  const w = dims?.widthM ?? 0.27;
  const rad = (yawDeg || 0) * Math.PI / 180;
  const halfExtent = (d * Math.abs(Math.cos(rad)) + w * Math.abs(Math.sin(rad))) / 2;
  return roomLength - halfExtent - SURROUND_WALL_GAP_M;
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
 * Used to compute how far forward from the screen wall a speaker front face sits.
 *
 * @param {number} depthM  - speaker depth dimension (front-to-back in metres)
 * @param {number} widthM  - speaker width dimension (left-to-right in metres)
 * @param {number} yawDeg  - rotation around vertical axis (0° = facing front)
 * @returns {number}
 */
function yHalfExtentM(depthM, widthM, yawDeg) {
  const rad = (yawDeg * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  // Half-extents along Y axis = depth projected + width projected
  return (depthM * cosA + widthM * sinA) / 2;
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