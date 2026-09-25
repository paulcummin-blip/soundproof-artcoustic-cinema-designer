// LimitingSeatLabel.jsx
//
// Custom SVG label for a Recharts ReferenceLine that renders the limiting
// seat as a green rounded pill (matching the seat selector), with
// "Limiting frequency" and the Hz value stacked beneath it — directly on
// the graph at the limiting-frequency annotation.
//
// Must use SVG elements only — Recharts renders labels inside <svg>.

import React from "react";

/**
 * @param {object} props
 * @param {object} [props.viewBox] - Recharts positioning ({ x, y, width, height }).
 * @param {string} props.seatPillLabel - e.g. "R1S1"
 * @param {number} [props.limitingFrequencyHz] - e.g. 26
 * @param {string} [props.color] - pill fill/stroke colour (defaults to brand green)
 */
export default function LimitingSeatLabel({ viewBox, seatPillLabel, limitingFrequencyHz, color = "#213428" }) {
  if (!seatPillLabel) return null;

  // Recharts may pass viewBox as a nested prop or as top-level x/y.
  const vb = viewBox || {};
  const cx = vb.x ?? 0;
  const chartTop = vb.y ?? 0;

  const pillW = 52;
  const pillH = 26;
  const pillX = cx - pillW / 2;
  // Stack upward from the chart top: Hz (bottom) → label → pill (top)
  const pillY = chartTop - pillH - 30;

  return (
    <g>
      {/* Pill background */}
      <rect
        x={pillX}
        y={pillY}
        width={pillW}
        height={pillH}
        rx={13}
        ry={13}
        fill={color}
        stroke={color}
        strokeWidth={2}
      />
      {/* Pill text */}
      <text
        x={cx}
        y={pillY + pillH / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#FFFFFF"
        fontSize={11}
        fontWeight={700}
        fontFamily="'Didact Gothic', sans-serif"
      >
        {seatPillLabel}
      </text>
      {/* "Limiting frequency" label */}
      <text
        x={cx}
        y={chartTop - 18}
        textAnchor="middle"
        fill="#625143"
        fontSize={9}
        fontWeight={600}
        letterSpacing="0.6"
        fontFamily="'Didact Gothic', sans-serif"
      >
        LIMITING FREQUENCY
      </text>
      {/* Hz value */}
      {limitingFrequencyHz != null && (
        <text
          x={cx}
          y={chartTop - 4}
          textAnchor="middle"
          fill="#1B1A1A"
          fontSize={14}
          fontWeight={700}
          fontFamily="'Didact Gothic', sans-serif"
        >
          {limitingFrequencyHz} Hz
        </text>
      )}
    </g>
  );
}