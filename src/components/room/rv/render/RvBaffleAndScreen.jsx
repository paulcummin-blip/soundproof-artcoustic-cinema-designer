"use client";

import React from "react";

export default function RvBaffleAndScreen({
  screen,
  roomRect,
  scale,
  actualScreenFrontY,
  showBaffle,
  showScreen,
  widthM,
  SCREEN_THICKNESS_M,
  meterToCanvasX,
  exportMode,
  screenFrontPlaneM,
  screenPlaneMode,
}) {
  if (!roomRect || !Number.isFinite(scale)) return null;

  const inch2m = 0.0254;

  const borderM = Math.max(0, (Number(screen?.borderThicknessCm ?? screen?.frameThicknessCm ?? 8) || 0) / 100);
  const visibleWm = Math.max(0.1, Number(screen?.visibleWidthInches || 100) * inch2m);
  const frameWm = visibleWm + (2 * borderM);

  const exportPlaneM = Number(screenFrontPlaneM);
  const planeDepthM =
    (exportMode === "dimensions" &&
      screenPlaneMode === "fixed" &&
      Number.isFinite(exportPlaneM) &&
      exportPlaneM > 0)
      ? exportPlaneM
      : actualScreenFrontY;

  const xCentre = widthM / 2;
  const yFront = (roomRect?.y ?? 0);

  const xVisibleL = meterToCanvasX(xCentre - visibleWm / 2);
  const xVisibleR = meterToCanvasX(xCentre + visibleWm / 2);
  const visibleW_px = xVisibleR - xVisibleL;

  const xFrameL = meterToCanvasX(xCentre - frameWm / 2);
  const xFrameR = meterToCanvasX(xCentre + frameWm / 2);
  const frameW_px = xFrameR - xFrameL;

  const baffleH = Math.max(1, planeDepthM * scale);
  const screenH_px = SCREEN_THICKNESS_M * scale;
  const baffleTop = yFront;
  const screenPlaneY = yFront + baffleH;

  return (
    <>
      {showBaffle && (
        <>
          <rect
            x={xVisibleL}
            y={baffleTop}
            width={visibleW_px}
            height={baffleH}
            fill="none"
            stroke="#4A230F"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            pointerEvents="none"
          />
          <line
            x1={xVisibleL}
            y1={baffleTop}
            x2={xVisibleL}
            y2={screenPlaneY}
            stroke="#4A230F"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            pointerEvents="none"
          />
          <line
            x1={xVisibleR}
            y1={baffleTop}
            x2={xVisibleR}
            y2={screenPlaneY}
            stroke="#4A230F"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            pointerEvents="none"
          />
        </>
      )}
      {showScreen && (
        <rect
          x={xFrameL}
          y={screenPlaneY}
          width={frameW_px}
          height={screenH_px}
          fill="#1a1a1a"
          stroke="#333"
          strokeWidth="0.5"
          pointerEvents="none"
        />
      )}
    </>
  );
}