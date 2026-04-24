import React from "react";

const RISK_FILL = "#4A230F";
const WARNING_FILL = "#625143";
const CONTOUR_STROKE = "#213428";

const nullBands = [
  { position: 0.5, width: 0.08, fill: RISK_FILL, opacity: 0.14 },
  { position: 0.25, width: 0.06, fill: WARNING_FILL, opacity: 0.09 },
  { position: 0.75, width: 0.06, fill: WARNING_FILL, opacity: 0.09 },
  { position: 1 / 6, width: 0.045, fill: WARNING_FILL, opacity: 0.07 },
  { position: 0.5, width: 0.045, fill: WARNING_FILL, opacity: 0.05 },
  { position: 5 / 6, width: 0.045, fill: WARNING_FILL, opacity: 0.07 },
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export default function RvModalZonesOverlay({ widthM, lengthM, toPx }) {
  if (!(Number(widthM) > 0) || !(Number(lengthM) > 0) || typeof toPx !== "function") {
    return null;
  }

  const [x0, y0] = toPx(0, 0);
  const [x1, y1] = toPx(widthM, lengthM);
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const roomWidthPx = Math.abs(x1 - x0);
  const roomHeightPx = Math.abs(y1 - y0);

  return (
    <g data-layer="modal-zones-overlay" pointerEvents="none">
      {nullBands.map((band, index) => {
        const xCenter = left + roomWidthPx * clamp01(band.position);
        const bandWidth = roomWidthPx * band.width;
        return (
          <rect
            key={`width-band-${index}`}
            x={xCenter - bandWidth / 2}
            y={top}
            width={bandWidth}
            height={roomHeightPx}
            fill={band.fill}
            opacity={band.opacity}
          />
        );
      })}

      {nullBands.map((band, index) => {
        const yCenter = top + roomHeightPx * clamp01(band.position);
        const bandHeight = roomHeightPx * band.width;
        return (
          <rect
            key={`length-band-${index}`}
            x={left}
            y={yCenter - bandHeight / 2}
            width={roomWidthPx}
            height={bandHeight}
            fill={band.fill}
            opacity={band.opacity}
          />
        );
      })}

      <line
        x1={left + roomWidthPx * 0.5}
        y1={top}
        x2={left + roomWidthPx * 0.5}
        y2={top + roomHeightPx}
        stroke={CONTOUR_STROKE}
        strokeOpacity={0.16}
        strokeWidth={1.5}
        strokeDasharray="8 8"
      />

      <line
        x1={left}
        y1={top + roomHeightPx * 0.5}
        x2={left + roomWidthPx}
        y2={top + roomHeightPx * 0.5}
        stroke={CONTOUR_STROKE}
        strokeOpacity={0.16}
        strokeWidth={1.5}
        strokeDasharray="8 8"
      />
    </g>
  );
}