/**
 * RvP9Corridors
 * -------------
 * SVG renderer for dynamic P9 target corridors in the Room Designer plan view.
 *
 * Renders translucent branded bands showing where the selected overhead row
 * can be moved to achieve different P9 outcomes (L4/L3/L2/L1).
 * For .2 layouts, renders a discreet "not applicable" note.
 *
 * Uses restrained branded styling — low opacity so room geometry and speakers
 * remain clear. No bright colours, gradients, or dashboard styling.
 */

import React from "react";

const CORRIDOR_OPACITY = {
  L4: 0.10,
  L3: 0.08,
  L2: 0.06,
  L1: 0.04,
};

const CORRIDOR_LABELS = {
  L4: "L4 target",
  L3: "L3",
  L2: "L2",
  L1: "L1",
};

export default function RvP9Corridors({
  corridors,
  applicable,
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
      <g data-layer="p9-corridors" pointerEvents="none">
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

  if (!applicable || !corridors || corridors.length === 0) return null;

  const [x0px] = toPx(0, 0);
  const [x1px] = toPx(widthM, 0);
  const wpx = Math.abs(x1px - x0px);

  return (
    <g data-layer="p9-corridors" pointerEvents="none">
      {corridors.map((band, i) => {
        const [, y0px] = toPx(0, band.yStart);
        const [, y1px] = toPx(0, band.yEnd);
        const y = Math.min(y0px, y1px);
        const hpx = Math.max(1, Math.abs(y1px - y0px));
        const opacity = CORRIDOR_OPACITY[band.level] || 0.06;
        const isL1 = band.level === "L1";

        return (
          <g key={`p9-band-${i}`}>
            <rect
              x={x0px}
              y={y}
              width={wpx}
              height={hpx}
              fill={isL1 ? "none" : band.color}
              fillOpacity={isL1 ? 0 : opacity}
              stroke={band.color}
              strokeWidth={isL1 ? 1 : 0.5}
              strokeOpacity={isL1 ? 0.2 : 0.12}
              strokeDasharray={isL1 ? "4 4" : undefined}
            />
            <text
              x={x0px + 6}
              y={y + Math.max(10, 11)}
              fill={band.color}
              fontSize={9}
              fontFamily="Didact Gothic, sans-serif"
              opacity={0.45}
            >
              {CORRIDOR_LABELS[band.level] || band.level}
            </text>
          </g>
        );
      })}
    </g>
  );
}