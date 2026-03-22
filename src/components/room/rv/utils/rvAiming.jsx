/**
 * rvAiming.js
 * Speaker aiming / yaw helpers extracted from RoomVisualisation.jsx (Stage 1).
 * Pure functions — no React, no side effects.
 */

// We import helpers from existing utilities in the app.
// safeYawToMLP lives in RenderPrimitives; getCanonicalRole in surroundRoleMap.
import { safeYawToMLP } from '@/components/room/rv/RenderPrimitives';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { resolveSpeakerYaw } from '@/components/utils/speakerAimResolver';

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

  // ── LCR: handled locally (not surround logic) ─────────────────────────────
  if (role === 'FL' || role === 'L') {
    if (aimLeftRightAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
    return lcrAngleInfo?.L ?? 0;
  }
  if (role === 'FC' || role === 'C') return 0;
  if (role === 'FR' || role === 'R') {
    if (aimLeftRightAtMLP && mlp) return getAimingYawDeg(speaker, mlp);
    return lcrAngleInfo?.R ?? 0;
  }

  // ── Surrounds / Wides: delegate to single source of truth ─────────────────
  // Build a minimal appState-like object from the individual toggle booleans
  const appState = {
    aimFrontWidesAtMLP:    aimFrontWidesAtMLP,
    aimSideSurroundsAtMLP: aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP: aimRearSurroundsAtMLP,
  };

  // Normalise speaker position so resolveSpeakerYaw can read it as .position
  const speakerWithPos = {
    ...speaker,
    position: speaker.position ?? { x: speaker.x, y: speaker.y },
  };

  return resolveSpeakerYaw({
    speaker: speakerWithPos,
    mlpPos: mlp,
    appState,
    getCanonicalRole,
  });
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