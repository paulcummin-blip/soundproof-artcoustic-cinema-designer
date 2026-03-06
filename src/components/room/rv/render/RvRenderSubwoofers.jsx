import React from "react";
import { hasPos } from "@/components/room/rv/RenderPrimitives";
import { SpeakerRect } from "@/components/room/rv/RenderPrimitives";

export default function RvRenderSubwoofers({
  hasRoomRect,
  rearSubs,
  getModelDimsM,
  toPx,
  scale,
  dragging,
  draggedItemId,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
}) {
  if (!hasRoomRect) return null;

  const subsToRender = Array.isArray(rearSubs) ? rearSubs : [];
  if (!subsToRender.length) return null;

  return (
    <g data-layer="rear-subwoofers">
      {subsToRender.map((sub, i) => {
        if (!hasPos(sub)) return null;
        const { widthM, depthM } = getModelDimsM(sub.model);
        const subId = sub.id || `rear-sub-${i}`;

        const [cx, cy] = toPx(sub.position.x, sub.position.y);
        const w = widthM * scale;
        const d = depthM * scale;

        const handlePointerDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch (err) {}
          handleMouseDown(e, subId, 'sub');
        };

        const handlePointerMove = (e) => {
          if (!dragging || draggedItemId !== subId) return;
          e.preventDefault();
          e.stopPropagation();
          handleMouseMove(e);
        };

        const handlePointerUp = (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch (err) {}
          handleMouseUp(e);
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
              fill="transparent"
              pointerEvents="all"
            />
            <SpeakerRect
              speaker={sub}
              widthM={widthM}
              depthM={depthM}
              opacity={0.8}
              scale={scale}
              toPx={toPx}
              pointerEvents="none"
            />
          </g>
        );
      })}
    </g>
  );
}