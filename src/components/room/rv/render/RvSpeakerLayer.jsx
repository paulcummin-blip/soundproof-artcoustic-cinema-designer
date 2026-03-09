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

        const { widthM, depthM } = getSpeakerDims(speaker.model);
        const [canvasX, canvasY] = toPx(speaker.position.x, speaker.position.y);

        // Compute role-aware yaw using the plan aiming helper
        // Pass position fields at top level as expected by getPlanAimDeg / getAimingYawDeg
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
            widthM={widthM}
            depthM={depthM}
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