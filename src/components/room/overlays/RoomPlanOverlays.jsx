"use client";

import React from "react";
import RP22ZonesOverlay from "@/components/room/RP22ZonesOverlay";
import FrontSubsLayer from "@/components/room/overlays/FrontSubsLayer";
import { renderOverheadBandsSVG } from "@/components/room/overlays/OverheadZones";

export default function RoomPlanOverlays(props) {
  const {
    _overlays,
    rp22AnglesEnabled,
    roomRect,

    // converters / geometry
    toPx,
    meterToCanvasX,
    meterToCanvasY,
    scale,

    // room dims
    widthM,
    lengthM,
    heightM,

    // data
    mlp,
    mlpY_m,
    seatingPositions,
    placedSpeakers,
    dolbyLayout,
    frontWideZones,
    overheadZones,
    speakersEpoch,

    // subs
    frontSubsCfg,
    rearSubsCfg,

    // screen plane
    showScreenPlane,
    actualScreenFrontY,

    // mlp dot
    mlpPxX,
    mlpPxY,

    // passthrough
    activeProjectId,
  } = props;

  return (
    <>
      {/* RP22 Zones Overlay (Bed Layer) */}
      {_overlays?.showZones && rp22AnglesEnabled && roomRect && (
        <RP22ZonesOverlay
          key="rp22-zones-overlay"
          roomRect={roomRect}
          toPx={toPx}
          meterToCanvasX={meterToCanvasX}
          meterToCanvasY={meterToCanvasY}
          widthM={widthM}
          lengthM={lengthM}
          heightM={heightM}
          mlp={mlp}
          seatingPositions={seatingPositions}
          placedSpeakers={placedSpeakers}
          dolbyLayout={dolbyLayout}
          activeProjectId={activeProjectId}
          speakersEpoch={speakersEpoch}
          frontWideZones={frontWideZones}
          overheadZones={overheadZones}
          debug_drawZones={false}
          debug_drawSeatBands={false}
        />
      )}

      {/* Front Wide Zones (visualisation only - auto-positioning logic lives elsewhere) */}
      {_overlays?.showZones && frontWideZones?.status === "ok" && (
        <>
          {/* Left Front Wide Zone (X-range) */}
          <rect
            x={meterToCanvasX(frontWideZones.left.xMin)}
            y={meterToCanvasY(frontWideZones.left.yMax)}
            width={
              meterToCanvasX(frontWideZones.left.xMax) -
              meterToCanvasX(frontWideZones.left.xMin)
            }
            height={
              meterToCanvasY(frontWideZones.left.yMin) -
              meterToCanvasY(frontWideZones.left.yMax)
            }
            fill="#e0f2f7"
            opacity="0.2"
            pointerEvents="none"
          />

          {/* Right Front Wide Zone (X-range) */}
          <rect
            x={meterToCanvasX(frontWideZones.right.xMin)}
            y={meterToCanvasY(frontWideZones.right.yMax)}
            width={
              meterToCanvasX(frontWideZones.right.xMax) -
              meterToCanvasX(frontWideZones.right.xMin)
            }
            height={
              meterToCanvasY(frontWideZones.right.yMin) -
              meterToCanvasY(frontWideZones.right.yMax)
            }
            fill="#e0f2f7"
            opacity="0.2"
            pointerEvents="none"
          />
        </>
      )}

      {/* RP22 Overhead Zones: always render for visual debug, conditionally visible */}
      {overheadZones?.status === "ok" && (
        <>
          {renderOverheadBandsSVG({
            overheadZones,
            roomRect,
            meterToCanvasY,
            meterToCanvasX,
            widthM,
            lengthM,
            mlpY_m,
            seatingPositions,
            dolbyLayout,
            showZones: _overlays?.showZones,
            debug: false,
          })}
        </>
      )}

      {/* Subwoofer placement zones */}
      <FrontSubsLayer
        toPx={toPx}
        meterToCanvasY={meterToCanvasY}
        meterToCanvasX={meterToCanvasX}
        widthM={widthM}
        lengthM={lengthM}
        frontSubsCfg={frontSubsCfg}
        rearSubsCfg={rearSubsCfg}
        showSubs={_overlays?.showZones}
      />

      {/* Screen plane line (if floating screen or cavity enabled) */}
      {showScreenPlane && roomRect && (
        <line
          x1={roomRect.x}
          y1={meterToCanvasY(actualScreenFrontY)}
          x2={roomRect.x + roomRect.width}
          y2={meterToCanvasY(actualScreenFrontY)}
          stroke="#8B4513"
          strokeWidth="2"
          strokeDasharray="8 8"
          pointerEvents="none"
        />
      )}

      {/* Current MLP Dot */}
      <circle
        cx={mlpPxX}
        cy={mlpPxY}
        r={5}
        fill="green"
        stroke="white"
        strokeWidth="1.5"
      />
    </>
  );
}