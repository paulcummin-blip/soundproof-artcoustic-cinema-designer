/**
 * useMlpCalculation.js
 * Extracted from RoomVisualisation.jsx (Stage 1).
 *
 * Computes the Main Listening Position (MLP) from:
 *   1. An explicit mlpPoint (highest priority)
 *   2. seatingPositions array (prefers primary seat)
 *   3. Room-centre fallback
 */

import { useMemo } from 'react';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Clamp MLP Y so it never sits too close to the front or rear walls.
 * Matches the original clampMlpY logic in RoomVisualisation.
 *
 * @param {number} y
 * @param {number} roomLengthM
 * @returns {number}
 */
function clampMlpY(y, roomLengthM) {
  if (!Number.isFinite(y) || !Number.isFinite(roomLengthM) || roomLengthM <= 0) return y;
  const minY = roomLengthM * 0.1;
  const maxY = roomLengthM * 0.95;
  return Math.max(minY, Math.min(maxY, y));
}

/**
 * Attempt to pick a seat from the seatingPositions array.
 * Prefers the primary seat; falls back to the first valid seat.
 *
 * @param {Array|null|undefined} seats
 * @returns {{ x:number, y:number, z?:number }|null}
 */
function pickMLP(seats) {
  if (!Array.isArray(seats) || seats.length === 0) return null;

  // Prefer explicitly-marked primary seat
  const primary = seats.find(s => s?.isPrimary === true || s?.id === 'primary');
  const candidate = primary ?? seats[0];

  if (!candidate) return null;
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return null;

  return { x: candidate.x, y: candidate.y, z: candidate.z ?? 0 };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{ mlpPoint: object|null, seatingPositions: Array|null, mlpBasis: any, roomWidthM: number, roomLengthM: number, seatingBlockOffset?: number, lockedMlpY?: number }} opts
 * @returns {{ x: number, y: number, z: number }|null}
 */
export function useMlpCalculation({
  mlpPoint,
  seatingPositions,
  mlpBasis,       // kept for dependency-list parity; not used in computation
  roomWidthM,
  roomLengthM,
  seatingBlockOffset, // retained in signature for caller compatibility; no longer affects RSP lock
  lockedMlpY,        // authoritative RSP Y (screen-derived or manual); always wins when finite
}) {
  const mlp = useMemo(() => {
    // ── RSP LOCK: if lockedMlpY is finite, always use it.
    // seatingBlockOffset (Front Row Distance) does NOT affect this lock.
    if (Number.isFinite(lockedMlpY)) {
      const cx = Number.isFinite(roomWidthM) ? roomWidthM / 2 : 0;
      return { x: cx, y: clampMlpY(lockedMlpY, roomLengthM), z: 1.2 };
    }

    // 1) Explicit mlpPoint — only used when lockedMlpY is not available
    if (
      mlpPoint &&
      Number.isFinite(mlpPoint.x) &&
      Number.isFinite(mlpPoint.y)
    ) {
      const clampedY = clampMlpY(mlpPoint.y, roomLengthM);
      return { x: mlpPoint.x, y: clampedY, z: mlpPoint.z ?? 0 };
    }

    // 2) From seating positions
    const fromSeats = pickMLP(seatingPositions);
    if (fromSeats) {
      const clampedY = clampMlpY(fromSeats.y, roomLengthM);
      return { x: fromSeats.x, y: clampedY, z: fromSeats.z ?? 0 };
    }

    // 3) Room-centre fallback
    if (Number.isFinite(roomWidthM) && Number.isFinite(roomLengthM) && roomLengthM > 0) {
      return {
        x: roomWidthM / 2,
        y: roomLengthM * 0.58,
        z: 0,
      };
    }

    return null;
  }, [
    mlpPoint,
    seatingPositions,
    mlpBasis,
    roomWidthM,
    roomLengthM,
    lockedMlpY,
  ]);

  return mlp;
}