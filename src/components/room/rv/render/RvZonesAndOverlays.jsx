"use client";

import React from "react";
import RP22ZonesOverlay from "@/components/room/RP22ZonesOverlay";
import { renderOverheadBandsSVG } from "@/components/room/utils/overheadZones";

export default function RvZonesAndOverlays({
  exportMode,
  overlaysForRendering,
  augmentedZones,
  toPx,
  placedSpeakers,
  mlp,
  widthM,
  lengthM,
  heightM,
  getModelDimsM,
  roomRect,
  WALL_BUFFER_M,

  // Overheads
  dolbyLayout,
  overheadZones,
  getCanonicalRole,
  scale,

  // Front wides (optional if you still render them here)
  frontWideZones,
  meterToCanvasX,
  meterToCanvasY,
}) {
  const showOverheads =
    !!(overlaysForRendering?.OVERHEADS_2 ||
       overlaysForRendering?.OVERHEADS_4 ||
       overlaysForRendering?.OVERHEADS_6);

  const OverheadsBands = (() => {
    if (!showOverheads) return null;

    const parts = String(dolbyLayout || "5.1").split(".");
    const ohCount = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;

    const config =
      ohCount === 2 ? ".2" :
      ohCount === 4 ? ".4" :
      ohCount === 6 ? ".6" : "off";

    if (config === "off") return null;

    return renderOverheadBandsSVG({
      zones: overheadZones,
      config,
      toPx,
      scale,
      roomRect,
      placedSpeakers,
      getCanonicalRole,
      widthM,
    });
  })();

  return (
    <>
      {/* RP22 Zones Overlay */}
      {exportMode !== "clean" && (
        <g className="rp22-zones-layer" pointerEvents="none">
          <RP22ZonesOverlay
            overlays={overlaysForRendering}
            zones={augmentedZones}
            toPx={toPx}
            lcrOnly={false}
            placedSpeakers={placedSpeakers}
            mlpPoint={mlp}
            dimensions={{ width: widthM, length: lengthM, height: heightM }}
            getModelDimsM={getModelDimsM}
            WALL_BUFFER_M={WALL_BUFFER_M}
            roomRect={roomRect}
          />
        </g>
      )}

      {/* Front Wide Zones (if present in this section) */}
      {!!(overlaysForRendering?.showZones) && frontWideZones?.status === "ok" && (
        <>
          <rect
            x={meterToCanvasX(frontWideZones.left.xMin)}
            y={meterToCanvasY(frontWideZones.left.yMax)}
            width={meterToCanvasX(frontWideZones.left.xMax) - meterToCanvasX(frontWideZones.left.xMin)}
            height={meterToCanvasY(frontWideZones.left.yMin) - meterToCanvasY(frontWideZones.left.yMax)}
            fill="#e0f2f7"
            opacity="0.2"
            pointerEvents="none"
          />
          <rect
            x={meterToCanvasX(frontWideZones.right.xMin)}
            y={meterToCanvasY(frontWideZones.right.yMax)}
            width={meterToCanvasX(frontWideZones.right.xMax) - meterToCanvasX(frontWideZones.right.xMin)}
            height={meterToCanvasY(frontWideZones.right.yMin) - meterToCanvasY(frontWideZones.right.yMax)}
            fill="#e0f2f7"
            opacity="0.2"
            pointerEvents="none"
          />
        </>
      )}

      {/* Overhead Zones / Bands */}
      {OverheadsBands}
      </>
      );
      }