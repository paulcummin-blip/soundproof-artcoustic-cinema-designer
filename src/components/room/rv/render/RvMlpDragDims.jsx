"use client";

import {
  DIM_DASH as DASH,
  DIM_STROKE as STROKE,
  DIM_STROKE_W as STROKE_W,
  DIM_TEXT_FILL as TEXT_FILL,
  DIM_TEXT_SIZE as TEXT_SIZE,
  DIM_TEXT_WEIGHT as TEXT_WEIGHT,
  DIM_TICK as TICK,
  clampDimTextX as clampTextX,
  clampDimTextY as clampTextY,
} from "@/components/room/rv/render/rvDimensionStyle";

/**
 * RvMlpDragDims
 *
 * Renders live proximity dimension guides (nearest side wall + nearest
 * front/back wall) while the RSP / MLP marker is being dragged.
 *
 * Visual language matches RvRoomElementDragDims (dashed green guide lines,
 * tick end-caps, bold small labels). Rendered OUTSIDE RvZoomGroup so the
 * zoom-group clipPath cannot clip annotation text near wall edges.
 *
 * Stage 1 scope: RSP / MLP only. Visible only while dragging; unmounts
 * immediately on drag end (parent clears dragInfo to null/invisible).
 */

export default function RvMlpDragDims({
  dragInfo,
  scale,
  meterToCanvasX,
  meterToCanvasY,
  svgW = 1000,
  svgH = 700,
}) {
  if (!dragInfo || !dragInfo.visible) return null;

  const { x, y, side, sideDist, vert, vertDist } = dragInfo;
  if (![x, y, sideDist, vertDist].every(Number.isFinite)) return null;

  const ptX = meterToCanvasX(x);
  const ptY = meterToCanvasY(y);
  const wallX = side === 'left' ? meterToCanvasX(0) : meterToCanvasX(dragInfo.widthM);
  const wallY = vert === 'front' ? meterToCanvasY(0) : meterToCanvasY(dragInfo.lengthM);

  // Horizontal guide (point -> nearest side wall), drawn at the point's Y
  const hTextRaw = (ptX + wallX) / 2;
  const hTextX = clampTextX(hTextRaw, svgW);
  const hTextY = clampTextY(ptY - 10, svgH);

  // Vertical guide (point -> nearest front/back wall), drawn at the point's X
  const vTextRaw = (ptY + wallY) / 2;
  const vTextY = clampTextY(vTextRaw, svgH);
  const vTextX = clampTextX(ptX + 10, svgW);

  return (
    <g data-layer="mlp-drag-dims" pointerEvents="none">
      {sideDist > 0.005 && (
        <g>
          <line x1={ptX} y1={ptY} x2={wallX} y2={ptY}
            stroke={STROKE} strokeWidth={STROKE_W} strokeDasharray={DASH} />
          <line x1={ptX} y1={ptY - TICK} x2={ptX} y2={ptY + TICK}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={wallX} y1={ptY - TICK} x2={wallX} y2={ptY + TICK}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <text
            x={hTextX}
            y={hTextY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={TEXT_SIZE}
            fontWeight={TEXT_WEIGHT}
            fill={TEXT_FILL}
            style={{ userSelect: 'none' }}
          >
            {sideDist.toFixed(2)} m
          </text>
        </g>
      )}
      {vertDist > 0.005 && (
        <g>
          <line x1={ptX} y1={ptY} x2={ptX} y2={wallY}
            stroke={STROKE} strokeWidth={STROKE_W} strokeDasharray={DASH} />
          <line x1={ptX - TICK} y1={ptY} x2={ptX + TICK} y2={ptY}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={ptX - TICK} y1={wallY} x2={ptX + TICK} y2={wallY}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <text
            x={vTextX}
            y={vTextY}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={TEXT_SIZE}
            fontWeight={TEXT_WEIGHT}
            fill={TEXT_FILL}
            style={{ userSelect: 'none' }}
          >
            {vertDist.toFixed(2)} m
          </text>
        </g>
      )}
    </g>
  );
}