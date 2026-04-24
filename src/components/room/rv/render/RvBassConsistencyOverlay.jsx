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
      risk: Math.abs(((p.value - min) / range) - 0.5) * 2,
    }));
  }, [widthM, lengthM, subwoofers]);

  return (
    <g pointerEvents="none">
      {grid.map((p, i) => {
        const [cx, cy] = toPx(p.x, p.y);
        const { risk } = p;
        return (
          <rect
            key={i}
            x={cx - 6}
            y={cy - 6}
            width={12}
            height={12}
            fill={
              risk > 0.75
                ? 'rgba(180, 38, 38, 0.35)'
                : risk > 0.5
                ? 'rgba(180, 38, 38, 0.22)'
                : risk > 0.25
                ? 'rgba(180, 38, 38, 0.12)'
                : 'transparent'
            }
          />
        );
      })}
    </g>
  );
}