import React from "react";

const FrontSubsLayer = React.memo(function FrontSubsLayer({ frontSubs = [], toPx, getModelDimsM, scale }) {
  if (!Array.isArray(frontSubs) || frontSubs.length === 0) return null;

  return (
    <g data-layer="front-subs" pointerEvents="none">
      {frontSubs.map((sub, idx) => {
        if (!sub || !sub.position || !Number.isFinite(sub.position.x) || !Number.isFinite(sub.position.y)) {
          return null;
        }
        const dims = getModelDimsM(sub.model) || {};
        const wM = Number(dims.widthM) || 0.5;
        const dM = Number(dims.depthM) || 0.255;

        const [cx, cy] = toPx(sub.position.x, sub.position.y);
        const w = wM * scale;
        const d = dM * scale;

        return (
          <g key={sub.id || `front-sub-${idx}`}>
            <rect
              x={cx - w / 2}
              y={cy - d / 2}
              width={w}
              height={d}
              rx={0}
              ry={0}
              fill="#1a1a1a"
              stroke="none"
              strokeWidth={0}
            />
          </g>
        );
      })}
    </g>
  );
});

export default FrontSubsLayer;