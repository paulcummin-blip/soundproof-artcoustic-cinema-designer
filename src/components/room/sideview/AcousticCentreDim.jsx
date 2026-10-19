import React from "react";

/**
 * The finished-floor-to-acoustic-centre dimension for one surround or
 * front-wide cabinet in the Side Elevation.
 *
 * Read-only annotation: it states the same stored acoustic centre the control
 * panel and the hover card report, in metres, from the finished floor.
 */
export default function AcousticCentreDim({
  xPx,
  floorPx,
  centrePx,
  heightM,
  side = "right",
  color = "#9B9890",
}) {
  const value = Number(heightM);
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(Number(xPx)) ||
    !Number.isFinite(Number(floorPx)) ||
    !Number.isFinite(Number(centrePx))
  ) {
    return null;
  }

  const outward = side === "left" ? -1 : 1;
  const labelX = xPx + outward * 4;
  const midPx = (floorPx + centrePx) / 2;

  return (
    <g opacity={0.9}>
      <line
        x1={xPx} y1={floorPx}
        x2={xPx} y2={centrePx}
        stroke={color} strokeWidth={0.6} strokeDasharray="3 2" />
      <line x1={xPx - 3} y1={centrePx} x2={xPx + 3} y2={centrePx} stroke={color} strokeWidth={0.7} />
      <line x1={xPx - 3} y1={floorPx} x2={xPx + 3} y2={floorPx} stroke={color} strokeWidth={0.7} />
      <text
        x={labelX}
        y={midPx}
        textAnchor={side === "left" ? "end" : "start"}
        fontSize={6.5}
        fill={color}
        letterSpacing="0.02em">
        {value.toFixed(2)} m
      </text>
    </g>
  );
}