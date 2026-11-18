// sideElevationOrientationProjection.js
//
// Projects a speaker cabinet into the side-elevation (Y-Z) plane using the
// SAME effective yaw the Plan View renderer computes (getPlanAimDeg →
// resolveSpeakerYaw). No new rotation value is created, saved, or passed back
// to the design — this is a read-only rendering projection so both views show
// the same physical installation.

import { getPlanAimDeg } from "@/components/room/rv/utils/rvAiming";
import { yHalfExtentM, rearWallY } from "@/components/room/rv/utils/rvGeometry";

const REAR_ROLES = new Set(["SBL", "SBR", "SCL", "SCR", "SC"]);

/**
 * The effective plan-view yaw for a speaker, reusing the single aiming
 * authority the Plan View uses. Returns 0 when the speaker or aim context is
 * missing, matching the plan-view fallback.
 *
 * @param {object} speaker        - Placed speaker (needs .role and .position)
 * @param {{x:number,y:number}|null} mlp - Current MLP / RSP position
 * @param {number} roomWidthM
 * @param {number} roomLengthM
 * @param {object} appState       - AppState slice with aim toggle booleans
 * @returns {number} yaw in degrees
 */
export function effectiveSpeakerYawDeg(speaker, mlp, roomWidthM, roomLengthM, appState) {
  if (!speaker) return 0;
  return getPlanAimDeg(
    speaker,
    mlp,
    roomWidthM,
    roomLengthM,
    appState?.aimAtMLP ?? false,
    appState?.aimFrontWidesAtMLP ?? false,
    appState?.aimSideSurroundsAtMLP ?? false,
    appState?.aimRearSurroundsAtMLP ?? false,
    null, // lcrAngleInfo — surround roles do not read it
  );
}

/**
 * Projects a speaker cabinet into the side-elevation plane. The apparent
 * along-Y extent is the rotated cabinet's projection onto the room-depth axis;
 * the render centre Y matches the Plan View's wall-derived position so the
 * two views cannot disagree about where the cabinet sits.
 *
 * @returns {{ yawDeg:number, projectedHalfDepthM:number, projectedDepthM:number, renderCentreY:number }}
 */
export function sideProjectionForSpeaker({
  speaker,
  mlp,
  roomWidthM,
  roomLengthM,
  cabinetWidthM,
  cabinetDepthM,
  appState,
}) {
  const yawDeg = effectiveSpeakerYawDeg(speaker, mlp, roomWidthM, roomLengthM, appState);
  const halfY = yHalfExtentM(cabinetDepthM, cabinetWidthM, yawDeg);
  const role = String(speaker?.role || "").toUpperCase();
  const isRear = REAR_ROLES.has(role);

  // Rear-wall speakers: the Plan View derives render Y from the wall, not the
  // stored position, so the cabinet stays flush to the wall at every yaw. The
  // side elevation uses the same wall-derived centre. Every other wall-mounted
  // speaker uses its stored position.y as the Plan View does.
  const renderCentreY = isRear
    ? rearWallY(roomLengthM, { widthM: cabinetWidthM, depthM: cabinetDepthM }, yawDeg)
    : (Number.isFinite(speaker?.position?.y) ? speaker.position.y : 0);

  return {
    yawDeg,
    projectedHalfDepthM: halfY,
    projectedDepthM: halfY * 2,
    renderCentreY,
  };
}