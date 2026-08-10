/**
 * RvMlpMarker
 *
 * Renders the green RSP dot on the plan canvas.
 * The dot is ALWAYS draggable — the user can initiate dragging from the
 * current AUTO position. On first committed drag, the mode switches to
 * manual_position (handled by useMouseUpHandler).
 * A grab-cursor + pulse ring is shown as a visual affordance in all modes.
 */
import React from "react";

export default function RvMlpMarker({
  toPx,
  mlpDotX_m,
  mlpDotY_m,
  _overlays,
  exportMode,
  rspMode,
  onMouseDown,
}) {
  if (!Number.isFinite(mlpDotX_m) || !Number.isFinite(mlpDotY_m)) return null;

  const [x, y] = toPx(mlpDotX_m, mlpDotY_m);
  const isManual = rspMode === "manual_position";

  return (
    <g data-testid="mlp-marker" style={{ pointerEvents: "all" }}>
      {/* Invisible oversized hit target — ensures easy grab even at zoom */}
      <circle
        cx={x}
        cy={y}
        r={14}
        fill="transparent"
        pointerEvents="all"
        style={{ cursor: "grab" }}
        onMouseDown={onMouseDown}
      />

      {/* Pulse ring — drag affordance, shown in all modes */}
      <circle
        cx={x}
        cy={y}
        r={10}
        fill="none"
        stroke="#22c55e"
        strokeWidth={1.5}
        opacity={isManual ? 0.4 : 0.25}
        pointerEvents="none"
      />

      {/* Main dot */}
      <circle
        cx={x}
        cy={y}
        r={isManual ? 6 : 5}
        fill="#22c55e"
        stroke="#ffffff"
        strokeWidth={2}
        opacity={0.9}
        pointerEvents="none"
        style={{ cursor: "grab" }}
      />

      {/* Label */}
      {_overlays?.ROOM_DIMS && exportMode !== "dimensions" && (
        <text
          x={x}
          y={y + 36}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#22c55e"
          pointerEvents="none"
        >
          RSP
        </text>
      )}
    </g>
  );
}