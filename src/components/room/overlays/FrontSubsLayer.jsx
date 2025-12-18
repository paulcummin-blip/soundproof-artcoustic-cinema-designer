import React from "react";

/**
 * FrontSubsLayer
 * Pure, memoized SVG layer for rendering *front* subwoofers.
 * Depends only on props; no app state or globals.
 *
 * Props:
 * - frontSubs: Array<{ id, model, position: { x, y } }>
 * - toPx(xM:number, yM:number) => [xPx:number, yPx:number]
 * - getModelDimsM(modelKey:string) => { widthM:number, depthM:number }
 * - scale: number (px per metre)
 */
const FrontSubsLayer = React.memo(function FrontSubsLayer({
  frontSubs = [],
  toPx,
  getModelDimsM,
  scale,
  onSubPointerDown,
  onSubPointerMove,
  onSubPointerUp,
  dragging,
  draggedItemId,
}) {
  if (!Array.isArray(frontSubs) || frontSubs.length === 0) return null;

  return (
    <g data-layer="front-subs">
      {frontSubs.map((sub, idx) => {
        const pos = sub?.position;
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;

        const dims = getModelDimsM?.(sub.model) || {};
        const wM = Number(dims.widthM) || 0.5;
        const dM = Number(dims.depthM) || 0.255;

        const [cx, cy] = toPx(pos.x, pos.y);
        const w = wM * scale;
        const d = dM * scale;
        const subId = sub.id || `front-sub-${idx}`;

        const handlePointerDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch (err) {}
          onSubPointerDown?.(e, subId);
        };
        
        const handlePointerMove = (e) => {
          if (!dragging || draggedItemId !== subId) return;
          e.preventDefault();
          e.stopPropagation();
          onSubPointerMove?.(e);
        };
        
        const handlePointerUp = (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch (err) {}
          onSubPointerUp?.(e);
        };

        return (
          <g
            key={subId}
            style={{ cursor: dragging && draggedItemId === subId ? 'grabbing' : 'grab', pointerEvents: 'all' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
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
              opacity={0.8}
              pointerEvents="none"
            />
          </g>
        );
      })}
    </g>
  );
});

export default FrontSubsLayer;