/**
 * RvP9Corridors
 * -------------
 * SVG renderer for the dynamic P9 L4 target line in the Room Designer plan view.
 *
 * Renders a restrained dashed guide at the L4 boundary (50° adjacent-row gap),
 * with a very light translucent fill on the compliant side.
 * For .2 layouts, renders a discreet "Single overhead row" label.
 *
 * Supports multiple compliant ranges (state = "bounded_l4").
 * Follows the existing front-wide L4 target-line visual language.
 */

import React from "react";

export default function RvP9Corridors({
  ranges,
  boundaries,
  applicable,
  state,
  note,
  toPx,
  widthM,
  lengthM,
  scale,
}) {
  // .2 layout note — discreet label
  if (!applicable && note) {
    const [cx] = toPx(widthM / 2, 0);
    const [, cy] = toPx(0, lengthM / 2);
    return (
      <g data-layer="p9-target" pointerEvents="none">
        <text
          x={cx}
          y={cy}
          fill="#625143"
          fontSize={Math.max(9, 10 * scale)}
          textAnchor="middle"
          fontFamily="Didact Gothic, sans-serif"
          opacity={0.45}
        >
          {note}
        </text>
      </g>
    );
  }

  if (!applicable) return null;

  const [x0px] = toPx(0, 0);
  const [x1px] = toPx(widthM, 0);
  const wpx = Math.abs(x1px - x0px);

  return (
    <g data-layer="p9-target" pointerEvents="none">
      {/* L4-compliant ranges — very light translucent fill */}
      {(ranges || []).map((range, i) => {
        const [, yStartPx] = toPx(0, range.yStart);
        const [, yEndPx] = toPx(0, range.yEnd);
        const y = Math.min(yStartPx, yEndPx);
        const hpx = Math.max(0, Math.abs(yEndPx - yStartPx));
        return (
          <rect
            key={`p9-range-${i}`}
            x={x0px}
            y={y}
            width={wpx}
            height={hpx}
            fill="#213428"
            fillOpacity={0.06}
            stroke="none"
          />
        );
      })}

      {/* L4 target boundary lines */}
      {(boundaries || []).map((yBoundary, i) => {
        const [, yPx] = toPx(0, yBoundary);
        return (
          <g key={`p9-target-${i}`}>
            <line
              x1={x0px}
              y1={yPx}
              x2={x0px + wpx}
              y2={yPx}
              stroke="#213428"
              strokeWidth={2}
              strokeOpacity={0.6}
              strokeDasharray="6 4"
            />
            <text
              x={x0px + 6}
              y={yPx - 4}
              fill="#213428"
              fontSize={9}
              fontFamily="Didact Gothic, sans-serif"
              opacity={0.55}
            >
              P9 L4 target
            </text>
          </g>
        );
      })}
    </g>
  );
}