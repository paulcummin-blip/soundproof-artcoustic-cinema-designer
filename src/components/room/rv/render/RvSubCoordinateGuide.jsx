import React from "react";

/**
 * RvSubCoordinateGuide — drag-time magnetic coordinate snap guide for subwoofers.
 *
 * Renders subtle dashed helper lines at the snapped X and/or Y coordinate while
 * a subwoofer is being dragged. Wall lines are rendered slightly stronger than
 * interior quarter/midpoint lines. At a corner intersection both axes render.
 *
 * Read-only overlay; never affects positions or persistence. Only renders when
 * subSnapState.type === "coordinate".
 */
export default function RvSubCoordinateGuide({
  subSnapState,
  draggedItemId,
  frontLive,
  rearLive,
  toPx,
  widthM,
  lengthM,
}) {
  if (!subSnapState || subSnapState.type !== "coordinate") return null;

  const all = [
    ...(Array.isArray(frontLive) ? frontLive : []),
    ...(Array.isArray(rearLive) ? rearLive : []),
  ];
  const dragged = all.find((s) => s?.id === draggedItemId);
  if (!dragged?.position) return null;

  const { snapX, snapY, xLabel, yLabel } = subSnapState;

  const INTERIOR_COLOR = "#9CA3AF";
  const WALL_COLOR = "#4B5563";
  const INTERIOR_DASH = "5 4";
  const WALL_DASH = "4 3";
  const INTERIOR_WIDTH = 1;
  const WALL_WIDTH = 1.5;

  const xIsWall = xLabel === "LEFT WALL" || xLabel === "RIGHT WALL";
  const yIsWall = yLabel === "FRONT WALL" || yLabel === "REAR WALL";

  return (
    <g data-layer="sub-coordinate-guide" style={{ pointerEvents: "none" }}>
      {/* X-axis guide line (vertical line at snapX) */}
      {snapX !== null && Number.isFinite(snapX) && (() => {
        const [lx] = toPx(snapX, 0);
        const [, topY] = toPx(0, 0);
        const [, botY] = toPx(0, lengthM);
        return (
          <g>
            <line
              x1={lx} y1={topY} x2={lx} y2={botY}
              stroke={xIsWall ? WALL_COLOR : INTERIOR_COLOR}
              strokeWidth={xIsWall ? WALL_WIDTH : INTERIOR_WIDTH}
              strokeDasharray={xIsWall ? WALL_DASH : INTERIOR_DASH}
            />
            <text
              x={lx} y={topY - 4}
              textAnchor="middle"
              fontSize={8}
              fill={WALL_COLOR}
              fontWeight={600}
            >
              {xLabel}
            </text>
          </g>
        );
      })()}

      {/* Y-axis guide line (horizontal line at snapY) */}
      {snapY !== null && Number.isFinite(snapY) && (() => {
        const [, ly] = toPx(0, snapY);
        const [leftX] = toPx(0, 0);
        const [rightX] = toPx(widthM, 0);
        return (
          <g>
            <line
              x1={leftX} y1={ly} x2={rightX} y2={ly}
              stroke={yIsWall ? WALL_COLOR : INTERIOR_COLOR}
              strokeWidth={yIsWall ? WALL_WIDTH : INTERIOR_WIDTH}
              strokeDasharray={yIsWall ? WALL_DASH : INTERIOR_DASH}
            />
            <text
              x={rightX + 6} y={ly + 3}
              textAnchor="start"
              fontSize={8}
              fill={WALL_COLOR}
              fontWeight={600}
            >
              {yLabel}
            </text>
          </g>
        );
      })()}
    </g>
  );
}