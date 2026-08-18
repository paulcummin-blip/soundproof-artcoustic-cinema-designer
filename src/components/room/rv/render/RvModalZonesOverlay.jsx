import React from "react";

// Diagnostic overlay: approximate node lines of the first three axial room modes.
// This is a spatial design guide only — it does NOT derive from, feed, or alter the
// bass simulation, P18/P19/P20, sub/seat grading, EQ, or any saved coordinates.
// See SubwooferPanel "Show Room Mode Guide" + "Understanding Room Modes" context.

const SPEED_OF_SOUND = 343; // m/s

// Neutral, non-warning palette. Reads as a reference overlay, not a prohibited zone.
const BAND_FILL = "#8A8F95";        // cool neutral grey
const CENTER_LINE_STROKE = "#5B6470"; // darker neutral grey-blue

// Normalized interior node positions for axial orders 1–3 in a rectangular room.
// f_n = n * c / (2 * L); node lines fall at k/n for k = 1 .. n-1.
const AXIAL_BANDS = [
  { position: 0.5,    width: 0.07, order: 1 },
  { position: 0.25,   width: 0.05, order: 2 },
  { position: 0.75,   width: 0.05, order: 2 },
  { position: 1 / 6,  width: 0.04, order: 3 },
  { position: 0.5,    width: 0.04, order: 3 },
  { position: 5 / 6,  width: 0.04, order: 3 },
];

function ordinalLabel(n) {
  if (n === 1) return "1st order";
  if (n === 2) return "2nd order";
  if (n === 3) return "3rd order";
  return `${n}th order`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

const SEAT_HALF_WIDTH_M = 0.30;
const SEAT_FRONT_BACK_TOLERANCE_M = 0.15;

function getSeatBandIntersectionFactor(seatingPositions, bandPosition, bandWidth, axisLength, axis) {
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0 || !(axisLength > 0)) return 0;

  const bandCenterM = clamp01(bandPosition) * axisLength;
  const bandHalfWidthM = (bandWidth * axisLength) / 2;
  const toleranceM = axis === "x" ? SEAT_HALF_WIDTH_M : SEAT_FRONT_BACK_TOLERANCE_M;

  const intersections = seatingPositions
    .map((seat) => {
      const seatValue = Number(seat?.[axis] ?? seat?.position?.[axis]);
      if (!Number.isFinite(seatValue)) return null;
      const distance = Math.abs(seatValue - bandCenterM);
      const threshold = bandHalfWidthM + toleranceM;
      if (distance <= threshold) return 1;
      const fadeThreshold = threshold + toleranceM;
      if (distance <= fadeThreshold) {
        return Math.max(0, 1 - ((distance - threshold) / Math.max(toleranceM, 0.001)));
      }
      return 0;
    })
    .filter((value) => value !== null);

  if (intersections.length === 0) return 0;
  return Math.max(...intersections);
}

function axialFrequencyHz(order, dimensionM) {
  if (!(Number(dimensionM) > 0) || !(order > 0)) return null;
  const f = (order * SPEED_OF_SOUND) / (2 * Number(dimensionM));
  return Number.isFinite(f) ? Math.round(f) : null;
}

function bandBaseOpacity(order) {
  // Light, neutral. 1st-order (single centre node) slightly more visible than higher orders.
  return order === 1 ? 0.05 : 0.035;
}

export default function RvModalZonesOverlay({ widthM, lengthM, toPx, seatingPositions = [] }) {
  if (!(Number(widthM) > 0) || !(Number(lengthM) > 0) || typeof toPx !== "function") {
    return null;
  }

  const [x0, y0] = toPx(0, 0);
  const [x1, y1] = toPx(widthM, lengthM);
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const roomWidthPx = Math.abs(x1 - x0);
  const roomHeightPx = Math.abs(y1 - y0);

  const renderBand = (band, axis, dimensionPx, crossAxisPx, dimensionM, originX, originY) => {
    const center = axis === "x"
      ? originX + dimensionPx * clamp01(band.position)
      : originY + dimensionPx * clamp01(band.position);
    const bandThickness = dimensionPx * band.width;

    // Seat proximity is a very subtle context hint only — never enough to read as a warning.
    const seatIntersection = getSeatBandIntersectionFactor(
      seatingPositions, band.position, band.width, Number(dimensionM), axis
    );
    const opacity = clamp01(bandBaseOpacity(band.order) + seatIntersection * 0.025);

    const freqHz = axialFrequencyHz(band.order, Number(dimensionM));
    const axisLabel = axis === "x" ? "Width" : "Length";
    const tooltip = freqHz != null
      ? `${axisLabel} axial mode — ${ordinalLabel(band.order)} · ${freqHz} Hz`
      : `${axisLabel} axial mode — ${ordinalLabel(band.order)}`;

    if (axis === "x") {
      return (
        <g key={`width-band-${band.position}-${band.order}`}>
          <rect
            x={center - bandThickness / 2}
            y={top}
            width={bandThickness}
            height={roomHeightPx}
            fill={BAND_FILL}
            opacity={opacity}
          />
          <line
            x1={center}
            y1={top}
            x2={center}
            y2={top + roomHeightPx}
            stroke={CENTER_LINE_STROKE}
            strokeOpacity={0.18}
            strokeWidth={1}
            strokeDasharray="6 6"
          >
            <title>{tooltip}</title>
          </line>
        </g>
      );
    }
    return (
      <g key={`length-band-${band.position}-${band.order}`}>
        <rect
          x={left}
          y={center - bandThickness / 2}
          width={roomWidthPx}
          height={bandThickness}
          fill={BAND_FILL}
          opacity={opacity}
        />
        <line
          x1={left}
          y1={center}
          x2={left + roomWidthPx}
          y2={center}
          stroke={CENTER_LINE_STROKE}
          strokeOpacity={0.18}
          strokeWidth={1}
          strokeDasharray="6 6"
        >
          <title>{tooltip}</title>
        </line>
      </g>
    );
  };

  return (
    <g data-layer="modal-zones-overlay" pointerEvents="none">
      {AXIAL_BANDS.map((band) => renderBand(band, "x", roomWidthPx, roomHeightPx, widthM, left, top))}
      {AXIAL_BANDS.map((band) => renderBand(band, "y", roomHeightPx, roomWidthPx, lengthM, top, left))}
    </g>
  );
}