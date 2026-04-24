import React, { useMemo } from "react";

const GRID_SIZE = 28; // keep lightweight

export default function RvBassConsistencyOverlay({
  widthM,
  lengthM,
  subwoofers = [],
  toPx,
}) {
  const grid = useMemo(() => {
    if (!widthM || !lengthM) return [];
    const points = [];
    for (let xi = 0; xi < GRID_SIZE; xi++) {
      for (let yi = 0; yi < GRID_SIZE; yi++) {
        const x = (xi / (GRID_SIZE - 1)) * widthM;
        const y = (yi / (GRID_SIZE - 1)) * lengthM;
        let pressure = 0;
        subwoofers.forEach(sub => {
          const dx = x - sub.position.x;
          const dy = y - sub.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
          // simple interference approximation
          const phase = dist * 2.5;
          pressure += Math.cos(phase) / dist;
        });
        points.push({ x, y, value: pressure });
      }
    }
    // normalise
    const values = points.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return points.map(p => ({
      ...p,
      norm: (p.value - min) / range,
    }));
  }, [widthM, lengthM, subwoofers]);

  return (
    <g pointerEvents="none" opacity={0.55}>
      {grid.map((p, i) => {
        const [cx, cy] = toPx(p.x, p.y);
        // brand-aligned tones
        let fill;
        if (p.norm < 0.35) {
          fill = "#F1F0EE"; // cancellation (light)
        } else if (p.norm < 0.7) {
          fill = "#DCDBD6"; // neutral
        } else {
          fill = "#625143"; // strong / stable
        }
        return (
          <rect
            key={i}
            x={cx - 6}
            y={cy - 6}
            width={12}
            height={12}
            fill={fill}
          />
        );
      })}
    </g>
  );
}