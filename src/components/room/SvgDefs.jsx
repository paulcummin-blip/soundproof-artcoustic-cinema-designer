// components/room/SvgDefs.jsx
import React from "react";

export default function SvgDefs({ ids, scale, svgW, svgH }) {
  return (
    <defs>
      {/* UNIQUE GRID ID */}
      <pattern id={ids.grid} width={scale} height={scale} patternUnits="userSpaceOnUse">
        <path d={`M ${scale} 0 L 0 0 0 ${scale}`} fill="none" stroke="#DCDBD6" strokeWidth="0.7" opacity="0.8" />
      </pattern>

      {/* CLIP THE ENTIRE DRAWING TO THE SVG VIEWPORT */}
      <clipPath id={ids.clip} clipPathUnits="userSpaceOnUse">
        <rect x="0" y="0" width={svgW} height={svgH} />
      </clipPath>

      {/* B) Defensive kill switch for any stray front-wide gradients */}
      <style>{`
        [id^="grad_front_wide_"] { display: none !important; }
      `}</style>
    </defs>
  );
}