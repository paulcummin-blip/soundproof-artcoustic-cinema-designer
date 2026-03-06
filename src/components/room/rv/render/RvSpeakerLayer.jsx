import React from "react";
import { SpeakerIcon, isRenderableSpeaker, getSpeakerDims, safeYawToMLP } from "@/components/room/rv/RenderPrimitives";
import { getCanonicalRole as defaultGetCanonicalRole } from "@/components/utils/surroundRoleMap";

/**
 * RvSpeakerLayer — renders all bed-layer draggable speaker icons onto the SVG canvas.
 */
export default function RvSpeakerLayer({
  speakers = [],
  toPx,
  scale,
  mlp,
  aimAtMLP,
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

        // Compute yaw: aim at MLP if enabled, else 0
        let yawDeg = 0;
        if (aimAtMLP && mlp) {
          yawDeg = safeYawToMLP(speaker.position, mlp);
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