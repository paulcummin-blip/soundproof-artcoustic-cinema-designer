"use client";

import { useMemo } from "react";
import { SpeakerIcon } from "@/components/room/rv/RenderPrimitives";
import { hasPos } from "@/components/room/rv/RenderPrimitives";

function rvIsOverheadRole(role) {
  const r = String(role || '').toUpperCase();
  switch (r) {
    case 'TFL': case 'TFR': case 'TML': case 'TMR':
    case 'TRL': case 'TRR': case 'TFC': case 'TRC':
    case 'TBC': case 'TL': case 'TR': case 'TBL': case 'TBR':
      return true;
    default:
      return false;
  }
}

export function useOverheadIconElements({
  placedSpeakers,
  toPx,
  scale,
  setHoveredSpeaker,
  overheadGlobalModel,
  useFrontGlobal,
  useMidGlobal,
  useRearGlobal,
  overheadFrontOverride,
  overheadMidOverride,
  overheadRearOverride,
  bedLayerSpeakerMouseDownHandler,
  handleIconEnter,
  handleIconMove,
  handleIconLeave,
}) {
  return useMemo(() => {
    if (!placedSpeakers || !placedSpeakers.length) return null;

    const getBandForRole = (role) => {
      const r = String(role || "").toUpperCase();
      if (r === "TFL" || r === "TFR" || r === "TFC") return "front";
      if (r === "TML" || r === "TMR") return "mid";
      if (r === "TRL" || r === "TRR" || r === "TRC") return "rear";
      return null;
    };

    const isOff = (modelId) => {
      if (!modelId) return true;
      const up = String(modelId).toUpperCase();
      return up === "OFF" || up.startsWith("OFF ");
    };

    const resolveModelForSpeaker = (spk) => {
      const band = getBandForRole(spk.role);
      if (!band) return null;

      let modelId = null;

      if (band === "front") {
        modelId = useFrontGlobal
          ? overheadGlobalModel
          : (overheadFrontOverride || overheadGlobalModel);
      } else if (band === "mid") {
        modelId = useMidGlobal
          ? overheadGlobalModel
          : (overheadMidOverride || overheadGlobalModel);
      } else if (band === "rear") {
        modelId = useRearGlobal
          ? overheadGlobalModel
          : (overheadRearOverride || overheadGlobalModel);
      }

      if (isOff(modelId)) return null;
      return modelId || null;
    };

    const overheadSpeakers = (placedSpeakers || [])
      .filter((spk) => rvIsOverheadRole(spk.role) && hasPos(spk))
      .map((spk) => {
        const modelId = resolveModelForSpeaker(spk);

        if (globalThis.__B44_LOGS) console.log(
          "[RV overhead-icons]",
          spk.role,
          "modelId:",
          modelId,
          "pos:",
          spk.position
        );

        if (!modelId) return null;
        return { spk, modelId };
      })
      .filter(Boolean);

    if (!overheadSpeakers.length) return null;

    return (
      <g data-layer="overhead-icons">
        {overheadSpeakers.map(({ spk, modelId }) => {
          const [xPx, yPx] = toPx(spk.position.x, spk.position.y);

          return (
            <SpeakerIcon
              key={spk.id || spk.role}
              speaker={{ ...spk, model: modelId }}
              canvasX={xPx}
              canvasY_raw={yPx}
              yawDeg={0}
              widthM={0.27}
              depthM={0.27}
              scale={scale}
              speakerMouseDownHandler={(e) => bedLayerSpeakerMouseDownHandler(e, spk.id)}
              onIconEnter={handleIconEnter}
              onIconMove={handleIconMove}
              onIconLeave={handleIconLeave}
            />
          );
        })}
      </g>
    );
  }, [
    placedSpeakers,
    toPx,
    scale,
    setHoveredSpeaker,
    overheadGlobalModel,
    useFrontGlobal,
    useMidGlobal,
    useRearGlobal,
    overheadFrontOverride,
    overheadMidOverride,
    overheadRearOverride,
    bedLayerSpeakerMouseDownHandler,
  ]);
}