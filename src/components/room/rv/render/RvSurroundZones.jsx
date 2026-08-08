/**
 * RvSurroundZones.jsx
 * -------------------
 * Renders canonical RP22 side/rear surround zones in the Room Designer plan view.
 * Uses the SAME computeRp22SurroundZones authority as P11 compliance.
 *
 * Visual treatment: subtle semi-transparent rectangles matching the existing
 * RP22 placement zone style (front wides / overheads).
 */

import React, { useMemo } from "react";
import {
  computeRp22SurroundZones,
  hasActiveSurroundBack,
} from "@/components/utils/rp22/rp22SurroundZones";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function renderZone(zone, key, fill, meterToCanvasX, meterToCanvasY) {
  if (!zone || !zone.active) return null;
  if (
    !isNum(zone.xMin) ||
    !isNum(zone.xMax) ||
    !isNum(zone.yMin) ||
    !isNum(zone.yMax)
  )
    return null;

  const xPx = meterToCanvasX(zone.xMin);
  const wPx = meterToCanvasX(zone.xMax) - meterToCanvasX(zone.xMin);
  const yTopPx = meterToCanvasY(zone.yMin);
  const yBotPx = meterToCanvasY(zone.yMax);
  const yPx = Math.min(yTopPx, yBotPx);
  const hPx = Math.abs(yBotPx - yTopPx);

  if (!isNum(xPx) || !isNum(yPx) || !isNum(wPx) || !isNum(hPx)) return null;
  if (wPx <= 0 || hPx <= 0) return null;

  return (
    <rect
      key={key}
      x={xPx}
      y={yPx}
      width={wPx}
      height={hPx}
      fill={fill}
      opacity={0.13}
      stroke="rgba(33, 52, 40, 0.25)"
      strokeWidth={0.5}
      strokeDasharray="4,3"
      pointerEvents="none"
    />
  );
}

export default function RvSurroundZones({
  seatingPositions,
  widthM,
  lengthM,
  mlpPoint,
  placedSpeakers,
  meterToCanvasX,
  meterToCanvasY,
  showZones,
}) {
  const zones = useMemo(() => {
    if (!showZones) return null;
    return computeRp22SurroundZones({
      seatingPositions,
      dimensions: { widthM, lengthM },
      mlpPoint,
      hasSurroundBack: hasActiveSurroundBack(placedSpeakers),
    });
  }, [showZones, seatingPositions, widthM, lengthM, mlpPoint, placedSpeakers]);

  if (!zones || zones.status !== "ok") return null;

  return (
    <g className="rp22-surround-zones-layer" pointerEvents="none">
      {renderZone(
        zones.sideLeft,
        "rp22-sl-zone",
        "rgba(33, 52, 40, 0.12)",
        meterToCanvasX,
        meterToCanvasY
      )}
      {renderZone(
        zones.sideRight,
        "rp22-sr-zone",
        "rgba(33, 52, 40, 0.12)",
        meterToCanvasX,
        meterToCanvasY
      )}
      {renderZone(
        zones.backLeft,
        "rp22-sbl-zone",
        "rgba(74, 35, 15, 0.12)",
        meterToCanvasX,
        meterToCanvasY
      )}
      {renderZone(
        zones.backRight,
        "rp22-sbr-zone",
        "rgba(74, 35, 15, 0.12)",
        meterToCanvasX,
        meterToCanvasY
      )}
    </g>
  );
}