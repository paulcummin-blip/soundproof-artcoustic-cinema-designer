"use client";

import React from "react";

export default function RvStaticOverlays({
  ids,
  roomRect,
  widthM,
  lengthM,

  // defs + screen + overlays
  SvgDefs,
  BaffleAndScreen,
  showBaffle,
  showScreen,
  showScreenPlane,
  actualScreenFrontY,

  RP22ZonesOverlay,
  rp22AnglesEnabled,
  overlays,

  // converters + scale
  toPx,
  meterToCanvasX,
  meterToCanvasY,
  scale,

  // geometry / context
  heightM,
  mlp,
  mlpPxX,
  mlpPxY,
  mlpY_m,
  seatingPositions,
  placedSpeakers,
  dolbyLayout,
  speakersEpoch,

  // zones
  frontWideZones,
  overheadZones,
  renderOverheadBandsSVG,

  // subs zones layer
  FrontSubsLayer,
  frontSubsCfg,
  rearSubsCfg,

  // optional visual helpers
  BackSweepOverlay,
}) {
  return (
    <>
      <SvgDefs ids={ids} roomRect={roomRect} widthM={widthM} lengthM={lengthM} />

      {BaffleAndScreen}

      {/* RP22 Zones Overlay (Bed Layer) */}
      {overlays?.showZones && rp22AnglesEnabled && roomRect && (
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
          speakersEpoch={speakersEpoch}
          frontWideZones={frontWideZones}
          overheadZones={overheadZones}
          debug_drawZones={false}
          debug_drawSeatBands={false}
        />
      )}

      {/* Front Wide Zones (visualisation only) */}
      {overlays?.showZones && frontWideZones?.status === "ok" && (
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

      {/* RP22 Overhead Zones */}
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
            showZones: overlays?.showZones,
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
        showSubs={overlays?.showZones}
      />

      {/* Screen plane line */}
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
      <circle cx={mlpPxX} cy={mlpPxY} r={5} fill="green" stroke="white" strokeWidth="1.5" />

      <BackSweepOverlay />
    </>
  );
}