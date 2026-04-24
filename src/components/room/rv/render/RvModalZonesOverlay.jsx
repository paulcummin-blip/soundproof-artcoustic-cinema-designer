import React from "react";

const STRONG_FILL = "#4A230F";
const MEDIUM_FILL = "#625143";
const CONTOUR_STROKE = "#213428";

const AXIAL_BANDS = [
  { position: 0.5, width: 0.08, kind: "strong" },
  { position: 0.25, width: 0.06, kind: "medium" },
  { position: 0.75, width: 0.06, kind: "medium" },
  { position: 1 / 6, width: 0.045, kind: "medium" },
  { position: 0.5, width: 0.045, kind: "soft" },
  { position: 5 / 6, width: 0.045, kind: "medium" },
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getSubAxisPosition(sub, axisLength, axis) {
  const value = Number(sub?.position?.[axis]);
  if (!(Number.isFinite(value) && axisLength > 0)) return null;
  return clamp01(value / axisLength);
}

function getBandExcitation(subPositions, bandPosition, bandWidth) {
  if (!Array.isArray(subPositions) || subPositions.length === 0) return 0.35;

  const halfWidth = bandWidth / 2;
  const values = subPositions
    .map((position) => {
      if (!Number.isFinite(position)) return null;
      const distance = Math.abs(position - bandPosition);
      const normalized = distance / Math.max(halfWidth, 0.001);
      if (normalized <= 1) {
        return 1;
      }
      if (normalized <= 2.4) {
        return Math.max(0, 1 - ((normalized - 1) / 1.4));
      }
      return 0;
    })
    .filter((value) => value !== null);

  if (values.length === 0) return 0.35;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getFillForKind(kind) {
  if (kind === "strong") return STRONG_FILL;
  return MEDIUM_FILL;
}

function getBandOpacity(kind, excitation) {
  const softExcitation = clamp01(excitation);

  if (kind === "strong") {
    return 0.06 + softExcitation * 0.12;
  }

  if (kind === "soft") {
    return 0.02 + softExcitation * 0.04;
  }

  return 0.025 + softExcitation * 0.075;
}

function getContourOpacity(excitation) {
  return 0.05 + clamp01(excitation) * 0.16;
}

export default function RvModalZonesOverlay({ widthM, lengthM, toPx, subwoofers = [] }) {
  if (!(Number(widthM) > 0) || !(Number(lengthM) > 0) || typeof toPx !== "function") {
    return null;
  }

  const [x0, y0] = toPx(0, 0);
  const [x1, y1] = toPx(widthM, lengthM);
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const roomWidthPx = Math.abs(x1 - x0);
  const roomHeightPx = Math.abs(y1 - y0);

  const xPositions = Array.isArray(subwoofers)
    ? subwoofers.map((sub) => getSubAxisPosition(sub, Number(widthM), "x")).filter(Number.isFinite)
    : [];
  const yPositions = Array.isArray(subwoofers)
    ? subwoofers.map((sub) => getSubAxisPosition(sub, Number(lengthM), "y")).filter(Number.isFinite)
    : [];

  const widthCenterExcitation = getBandExcitation(xPositions, 0.5, 0.08);
  const lengthCenterExcitation = getBandExcitation(yPositions, 0.5, 0.08);

  return (
    <g data-layer="modal-zones-overlay" pointerEvents="none">
      {AXIAL_BANDS.map((band, index) => {
        const xCenter = left + roomWidthPx * clamp01(band.position);
        const bandWidth = roomWidthPx * band.width;
        const excitation = getBandExcitation(xPositions, band.position, band.width);
        return (
          <rect
            key={`width-band-${index}`}
            x={xCenter - bandWidth / 2}
            y={top}
            width={bandWidth}
            height={roomHeightPx}
            fill={getFillForKind(band.kind)}
            opacity={getBandOpacity(band.kind, excitation)}
          />
        );
      })}

      {AXIAL_BANDS.map((band, index) => {
        const yCenter = top + roomHeightPx * clamp01(band.position);
        const bandHeight = roomHeightPx * band.width;
        const excitation = getBandExcitation(yPositions, band.position, band.width);
        return (
          <rect
            key={`length-band-${index}`}
            x={left}
            y={yCenter - bandHeight / 2}
            width={roomWidthPx}
            height={bandHeight}
            fill={getFillForKind(band.kind)}
            opacity={getBandOpacity(band.kind, excitation)}
          />
        );
      })}

      <line
        x1={left + roomWidthPx * 0.5}
        y1={top}
        x2={left + roomWidthPx * 0.5}
        y2={top + roomHeightPx}
        stroke={CONTOUR_STROKE}
        strokeOpacity={getContourOpacity(widthCenterExcitation)}
        strokeWidth={1.5}
        strokeDasharray="8 8"
      />

      <line
        x1={left}
        y1={top + roomHeightPx * 0.5}
        x2={left + roomWidthPx}
        y2={top + roomHeightPx * 0.5}
        stroke={CONTOUR_STROKE}
        strokeOpacity={getContourOpacity(lengthCenterExcitation)}
        strokeWidth={1.5}
        strokeDasharray="8 8"
      />
    </g>
  );
}