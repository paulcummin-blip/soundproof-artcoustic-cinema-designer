// components/ui/SvgDefs.jsx
import React from "react";

export default function SvgDefs({ idsGrid, idsClip, scale, svgW, svgH }) {
  return (
    <defs>
      <pattern id={idsGrid} width={scale} height={scale} patternUnits="userSpaceOnUse">
        <path d={`M ${scale} 0 L 0 0 0 ${scale}`} fill="none" stroke="#DCDBD6" strokeWidth="0.7" opacity="0.8" />
      </pattern>

      <clipPath id={idsClip} clipPathUnits="userSpaceOnUse">
        <rect x="0" y="0" width={svgW} height={svgH} />
      </clipPath>

      <style>{`[id^="grad_front_wide_"] { display: none !important; }`}</style>
    </defs>
  );
}