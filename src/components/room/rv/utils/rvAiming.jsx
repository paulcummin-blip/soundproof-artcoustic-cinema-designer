/**
 * rvAiming.js
 * Speaker aiming / yaw helpers extracted from RoomVisualisation.jsx (Stage 1).
 * Pure functions — no React, no side effects.
 */

// We import helpers from existing utilities in the app.
// safeYawToMLP lives in RenderPrimitives; getCanonicalRole in surroundRoleMap.
import { safeYawToMLP } from '@/components/room/rv/RenderPrimitives';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';

// ─── Low-level helpers ────────────────────────────────────────────────────────

/**
 * Compute the yaw angle (degrees) a speaker must rotate to aim at an MLP target.
 * Returns 0 if the speaker or target is missing / malformed.
 *
 * @param {{ x: number, y: number }} speaker - speaker position in room metres
 * @param {{ x: number, y: number }} mlpTarget - MLP position in room metres
 * @returns {number} yaw in degrees
 */
export function getAimingYawDeg(speaker, mlpTarget) {
  if (!speaker || !mlpTarget) return 0;
  if (!Number.isFinite(speaker.x) || !Number.isFinite(speaker.y)) return 0;
  if (!Number.isFinite(mlpTarget.x) || !Number.isFinite(mlpTarget.y)) return 0;

  // Use the shared helper if available; fall back to raw atan2
  if (typeof safeYawToMLP === 'function') {
    return safeYawToMLP(speaker, mlpTarget) ?? 0;
  }

  const dx = mlpTarget.x - speaker.x;
  const dy = mlpTarget.y - speaker.y;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

// ─── Per-role aiming ──────────────────────────────────────────────────────────

/**
 * Compute the plan-view yaw angle (degrees) for a speaker based on its role
 * and the various "aim at MLP" toggles.
 *
 * Matches the per-role logic that existed in RoomVisualisation.jsx.
 *
 * @param {object}  speaker
 * @param {{ x:number, y:number }|null} mlp
 * @param {number}  widthM
 * @param {number}  lengthM
 * @param {boolean} aimLeftRightAtMLP
 * @param {boolean} aimFrontWidesAtMLP
 * @param {boolean} aimSideSurroundsAtMLP
 * @param {boolean} aimRearSurroundsAtMLP
 * @param {{ L?: number, R?: number, LW?: number, RW?: number }|null} lcrAngleInfo
 * @returns {number} yaw in degrees
 */
export function getPlanAimDeg(
  speaker,
  mlp,
  widthM,
  lengthM,
  aimLeftRightAtMLP,
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  lcrAngleInfo,
) {
  if (!speaker) return 0;

  const role = getCanonicalRole ? getCanonicalRole(speaker.role) : (speaker.role ?? '').toUpperCase();

  switch (role) {
    // ── LCR front ──────────────────────────────────────────────────────────
    case 'FL':
    case 'L':
      if (aimLeftRightAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
      return lcrAngleInfo?.L ?? 0;

    case 'FC':
    case 'C':
      return 0;

    case 'FR':
    case 'R':
      if (aimLeftRightAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
      return lcrAngleInfo?.R ?? 0;

    // ── Front wides ────────────────────────────────────────────────────────
    case 'LW':
      if (aimFrontWidesAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
      return 90; // wall-flat left

    case 'RW':
      if (aimFrontWidesAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
      return -90; // wall-flat right

    // ── Side surrounds ─────────────────────────────────────────────────────
    case 'SL': {
      if (aimSideSurroundsAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
      const distToRear  = lengthM - (speaker.y ?? 0);
      const distToLeft  = speaker.x ?? 0;
      const distToRight = widthM - (speaker.x ?? 0);
      if (distToRear <= distToLeft && distToRear <= distToRight) return 180;
      return 90; // wall-flat left side
    }

    case 'SR': {
      if (aimSideSurroundsAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
      const distToRear  = lengthM - (speaker.y ?? 0);
      const distToLeft  = speaker.x ?? 0;
      const distToRight = widthM - (speaker.x ?? 0);
      if (distToRear <= distToLeft && distToRear <= distToRight) return 180;
      return -90; // wall-flat right side
    }

    // ── Rear surrounds ─────────────────────────────────────────────────────
    case 'SBL': {
      if (aimRearSurroundsAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
      // Choose orientation based on nearest wall
      const distToRear  = lengthM - (speaker.y ?? 0);
      const distToLeft  = speaker.x ?? 0;
      const distToRight = widthM - (speaker.x ?? 0);
      if (distToRear <= distToLeft && distToRear <= distToRight) return 180;
      if (distToLeft <= distToRight) return 90;
      return -90;
    }

    case 'SBR': {
      if (aimRearSurroundsAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
      const distToRear  = lengthM - (speaker.y ?? 0);
      const distToLeft  = speaker.x ?? 0;
      const distToRight = widthM - (speaker.x ?? 0);
      if (distToRear <= distToLeft && distToRear <= distToRight) return 180;
      if (distToRight <= distToLeft) return -90;
      return 90;
    }

    // ── Extra side surrounds (SL2/SR2, SL3/SR3…) ──────────────────────────
    default: {
      if (/^SL\d+$/.test(role)) {
        if (aimSideSurroundsAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
        return 90;
      }
      if (/^SR\d+$/.test(role)) {
        if (aimSideSurroundsAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
        return -90;
      }
      return 0;
    }
  }
}

// ─── Simple yaw resolver ──────────────────────────────────────────────────────

/**
 * Thin wrapper used by the visualiser's draw loop: returns the yaw for a
 * speaker given the LCR angle table and the global aimAtMLP flag.
 *
 * @param {object}  speaker
 * @param {{ L?: number, R?: number }|null} lcrAngles
 * @param {boolean} aimAtMLP
 * @returns {number}
 */
export function getYawForObject(speaker, lcrAngles, aimAtMLP) {
  if (!speaker) return 0;
  const role = getCanonicalRole ? getCanonicalRole(speaker.role) : (speaker.role ?? '').toUpperCase();

  if ((role === 'FL' || role === 'L') && aimAtMLP) return lcrAngles?.L ?? 0;
  if ((role === 'FR' || role === 'R') && aimAtMLP) return lcrAngles?.R ?? 0;
  if (role === 'FL' || role === 'L') return lcrAngles?.L ?? 0;
  if (role === 'FR' || role === 'R') return lcrAngles?.R ?? 0;
  return 0;
}