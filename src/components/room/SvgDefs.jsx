import React from 'react';

export default function SvgDefs({ ids, scale, svgW, svgH }) {
  const gridCellM = 0.5;
  const gridStepPx = gridCellM * scale;

  return (
    <defs>
      {/* Clip path to prevent zoom from escaping canvas */}
      <clipPath id={ids.clip}>
        <rect x="0" y="0" width={svgW} height={svgH} />
      </clipPath>

      {/* Grid pattern with proper centering */}
      <pattern
        id={ids.grid}
        patternUnits="userSpaceOnUse"
        width={gridStepPx}
        height={gridStepPx}
        x="0"
        y="0"
      >
        <path
          d={`M ${gridStepPx} 0 L 0 0 0 ${gridStepPx}`}
          fill="none"
          stroke="#E6E4DD"
          strokeWidth="0.5"
        />
      </pattern>
    </defs>
  );
}