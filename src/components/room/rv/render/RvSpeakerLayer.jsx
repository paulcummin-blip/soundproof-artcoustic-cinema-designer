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

        // For wall-mounted surrounds: derive the render-center from the live yaw + fixed wall edge.
        // This ensures the icon never crosses the wall regardless of stored position lag,
        // and visually rotates around the wall-facing rear edge.
        const WALL_GAP_M = 0.01;
        const isAuto      = speaker.positionSource !== 'user';
        const isLeftWall  = isAuto && (role === 'LW' || /^SL\d*$/.test(role));
        const isRightWall = isAuto && (role === 'RW' || /^SR\d*$/.test(role));
        const isRearWall  = isAuto && (role === 'SBL' || role === 'SBR');

        let canvasX, canvasY;

        if (isLeftWall || isRightWall || isRearWall) {
          const yawRad = yawDeg * Math.PI / 180;
          const sinA = Math.abs(Math.sin(yawRad));
          const cosA = Math.abs(Math.cos(yawRad));
          // Half-extent of the rotated box projected onto each axis
          const hxPx = (speakerDepthM * sinA + speakerWidthM * cosA) / 2 * scale;
          const hyPx = (speakerDepthM * cosA + speakerWidthM * sinA) / 2 * scale;

          if (isLeftWall) {
            const [wX, wY] = toPx(WALL_GAP_M, speaker.position.y);
            canvasX = wX + hxPx;
            canvasY = wY;
          } else if (isRightWall) {
            const [wX, wY] = toPx(widthM - WALL_GAP_M, speaker.position.y);
            canvasX = wX - hxPx;
            canvasY = wY;
          } else { // isRearWall
            const [wX, wY] = toPx(speaker.position.x, lengthM - WALL_GAP_M);
            canvasX = wX;
            canvasY = wY - hyPx;
          }
        } else {
          [canvasX, canvasY] = toPx(speaker.position.x, speaker.position.y);
        }

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