import React from "react";
import { SpeakerIcon, isRenderableSpeaker, getSpeakerDims } from "@/components/room/rv/RenderPrimitives";
import { getCanonicalRole as defaultGetCanonicalRole } from "@/components/utils/surroundRoleMap";
import { getPlanAimDeg } from "@/components/room/rv/utils/rvAiming";

/**
 * RvSpeakerLayer — renders all bed-layer draggable speaker icons onto the SVG canvas.
 */
export default function RvSpeakerLayer({
  speakers = [],
  toPx,
  scale,
  mlp,
  aimAtMLP,
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  widthM,
  lengthM,
  lcrAngleInfo,
  getCanonicalRole,
  bedLayerSpeakerMouseDownHandler,
  handleIconEnter,
  handleIconMove,
  handleIconLeave,
}) {
  if (!toPx || !scale) return null;

  const resolveRole = getCanonicalRole || defaultGetCanonicalRole;

  return (
    <g data-layer="bed-speakers">
      {(speakers || []).map((speaker) => {
        if (!isRenderableSpeaker(speaker)) return null;

        const { widthM: speakerWidthM, depthM: speakerDepthM } = getSpeakerDims(speaker.model);

        // Compute yaw first — wall-mounted position derivation depends on it
        const role = resolveRole(speaker.role);
        const speakerForAim = { ...speaker, x: speaker.position.x, y: speaker.position.y };
        const yawDeg = getPlanAimDeg(
          speakerForAim,
          mlp,
          widthM,
          lengthM,
          aimAtMLP,
          aimFrontWidesAtMLP,
          aimSideSurroundsAtMLP,
          aimRearSurroundsAtMLP,
          lcrAngleInfo,
        );

        // For front-wall LCR (FL/FC/FR): anchor the rear edge to the front wall.
        // The stored position is the wall anchor; shift the render centre into the room
        // by the yaw-projected half-depth so the cabinet stays flush to the front wall
        // regardless of rotation angle.
        const LCR_ROLES = ['FL', 'FC', 'FR'];
        const FRONT_WALL_GAP_M = 0.01; // matches frontWallY in drag solver

        let renderX = speaker.position.x;
        let renderY = speaker.position.y;

        if (LCR_ROLES.includes(role)) {
          const yawRad = (yawDeg || 0) * (Math.PI / 180);
          // Projected half-depth along Y (into the room) for a rotated rectangle
          const halfDepth = speakerDepthM / 2;
          const halfWidth = speakerWidthM / 2;
          const projectedHalfExtentY =
            halfDepth * Math.abs(Math.cos(yawRad)) +
            halfWidth * Math.abs(Math.sin(yawRad));
          // Rear edge is at FRONT_WALL_GAP_M; centre is that far + projectedHalfExtentY into the room
          renderY = FRONT_WALL_GAP_M + projectedHalfExtentY;
          // X stays as stored (symmetric drag already handles this correctly)
          renderX = speaker.position.x;
        }

        const [canvasX, canvasY] = toPx(renderX, renderY);

        const onMouseDown = bedLayerSpeakerMouseDownHandler
          ? (e) => bedLayerSpeakerMouseDownHandler(e, speaker.id)
          : undefined;

        return (
          <SpeakerIcon
            key={speaker.id || speaker.role}
            speaker={speaker}
            canvasX={canvasX}
            canvasY_raw={canvasY}
            yawDeg={yawDeg}
            widthM={speakerWidthM}
            depthM={speakerDepthM}
            scale={scale}
            speakerMouseDownHandler={onMouseDown}
            onIconEnter={handleIconEnter}
            onIconMove={handleIconMove}
            onIconLeave={handleIconLeave}
          />
        );
      })}
    </g>
  );
}