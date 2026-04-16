import React from "react";
import { SpeakerIcon, isRenderableSpeaker, getSpeakerDims } from "@/components/room/rv/RenderPrimitives";
import { getCanonicalRole as defaultGetCanonicalRole } from "@/components/utils/surroundRoleMap";
import { getPlanAimDeg } from "@/components/room/rv/utils/rvAiming";
import { sideWallX, rearWallY } from "@/components/room/rv/utils/rvGeometry";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

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
  screen,
}) {
  if (!toPx || !scale) return null;

  const resolveRole = getCanonicalRole || defaultGetCanonicalRole;
  const tvPresetKey = screen?.tvPresetKey || null;
  const fcSpeaker = (speakers || []).find((speaker) => resolveRole(speaker?.role) === 'FC');
  const fcMeta = fcSpeaker?.model ? getSpeakerModelMeta(fcSpeaker.model, tvPresetKey || undefined) : null;
  const hideDiscreteFronts = fcMeta?.frontStageType === 'integrated_lcr';

  return (
    <g data-layer="bed-speakers">
      {(speakers || []).map((speaker) => {
        if (!isRenderableSpeaker(speaker)) return null;

        const role = resolveRole(speaker.role);
        if (hideDiscreteFronts && (role === 'FL' || role === 'FR')) return null;

        const speakerMeta = getSpeakerModelMeta(speaker.model, tvPresetKey || undefined);
        const { widthM: metaWidthM, depthM: speakerDepthM } = speakerMeta?.notFound
          ? getSpeakerDims(speaker.model)
          : speakerMeta;

        const speakerWidthM = metaWidthM;

        // Compute yaw first — wall-mounted position derivation depends on it
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
        const isLeftWallMounted =
          role === 'LW' ||
          role === 'SL' ||
          /^SL\d+$/.test(role);

        const isRightWallMounted =
          role === 'RW' ||
          role === 'SR' ||
          /^SR\d+$/.test(role);

        const isRearWallMounted =
          role === 'SBL' ||
          role === 'SBR';

        const FRONT_WALL_GAP_M = 0.01; // matches frontWallY in drag solver

        let renderX = speaker.position.x;
        let renderY = speaker.position.y;

        if (LCR_ROLES.includes(role)) {
          const yawRad = (yawDeg || 0) * (Math.PI / 180);
          const halfDepth = speakerDepthM / 2;
          const halfWidth = speakerWidthM / 2;
          const projectedHalfExtentY =
            halfDepth * Math.abs(Math.cos(yawRad)) +
            halfWidth * Math.abs(Math.sin(yawRad));

          renderY = FRONT_WALL_GAP_M + projectedHalfExtentY;
          renderX = speaker.position.x;
        } else if (isLeftWallMounted || isRightWallMounted) {
          renderX = sideWallX(
            widthM,
            { widthM: speakerWidthM, depthM: speakerDepthM },
            isLeftWallMounted ? 'L' : 'R',
            yawDeg || 0
          );
          renderY = speaker.position.y;
        } else if (isRearWallMounted) {
          renderX = speaker.position.x;
          renderY = rearWallY(
            lengthM,
            { widthM: speakerWidthM, depthM: speakerDepthM },
            yawDeg || 0
          );
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