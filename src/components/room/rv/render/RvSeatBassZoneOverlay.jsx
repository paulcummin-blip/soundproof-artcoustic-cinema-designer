import React from "react";

const ZONE_WIDTH_M = 0.60;
const ZONE_DEPTH_M = 0.25;
const FILL_COLOR = "#213428";
const FILL_OPACITY = 0.08;
const STROKE_COLOR = "#213428";
const STROKE_OPACITY = 0.18;

function getSeatPoint(seat) {
  const x = Number(seat?.x ?? seat?.position?.x);
  const y = Number(seat?.y ?? seat?.position?.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

export default function RvSeatBassZoneOverlay({ seatingPositions = [], toPx }) {
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0 || typeof toPx !== "function") {
    return null;
  }

  return (
    <g data-layer="seat-bass-zone-overlay" pointerEvents="none">
      {seatingPositions.map((seat, index) => {
        const point = getSeatPoint(seat);
        if (!point) return null;

        const [leftPx, centerYPx] = toPx(point.x - ZONE_WIDTH_M / 2, point.y);
        const [rightPx] = toPx(point.x + ZONE_WIDTH_M / 2, point.y);
        const [, topPx] = toPx(point.x, point.y - ZONE_DEPTH_M / 2);
        const [, bottomPx] = toPx(point.x, point.y + ZONE_DEPTH_M / 2);

        const widthPx = Math.abs(rightPx - leftPx);
        const heightPx = Math.abs(bottomPx - topPx);
        const x = Math.min(leftPx, rightPx);
        const y = Math.min(topPx, bottomPx);
        const radius = Math.min(heightPx / 2, widthPx / 2, 999);

        return (
          <rect
            key={seat?.id ?? `seat-bass-zone-${index}`}
            x={x}
            y={y}
            width={widthPx}
            height={heightPx}
            rx={radius}
            ry={radius}
            fill={FILL_COLOR}
            fillOpacity={FILL_OPACITY}
            stroke={STROKE_COLOR}
            strokeOpacity={STROKE_OPACITY}
            strokeWidth={1}
          />
        );
      })}
    </g>
  );
}