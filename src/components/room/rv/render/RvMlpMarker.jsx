/**
 * RvMlpMarker
 *
 * Renders the green RSP dot on the plan canvas.
 * When rspMode === "manual_position", the dot becomes draggable and shows
 * a grab-cursor + pulse ring as a visual affordance.
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
    <g data-testid="mlp-marker" style={{ pointerEvents: isManual ? "all" : "none" }}>
      {/* Invisible oversized hit target — ensures easy grab even at zoom */}
      {isManual && (
        <circle
          cx={x}
          cy={y}
          r={14}
          fill="transparent"
          pointerEvents="all"
          style={{ cursor: "grab" }}
          onMouseDown={onMouseDown}
        />
      )}

      {/* Pulse ring — only shown in manual mode as drag affordance */}
      {isManual && (
        <circle
          cx={x}
          cy={y}
          r={10}
          fill="none"
          stroke="#22c55e"
          strokeWidth={1.5}
          opacity={0.4}
          pointerEvents="none"
        />
      )}

      {/* Main dot */}
      <circle
        cx={x}
        cy={y}
        r={isManual ? 6 : 4}
        fill="#22c55e"
        stroke="#ffffff"
        strokeWidth={2}
        opacity={0.9}
        pointerEvents="none"
        style={{ cursor: isManual ? "grab" : "default" }}
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