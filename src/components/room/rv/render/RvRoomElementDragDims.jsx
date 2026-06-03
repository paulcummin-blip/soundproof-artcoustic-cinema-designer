"use client";

/**
 * RvRoomElementDragDims
 *
 * Renders live wall-distance dimension lines while a room element is being dragged.
 * Visual style matches existing room dimension lines (engineering, light, minimal).
 * Only visible during a roomElement drag — hidden automatically when drag ends.
 */
export default function RvRoomElementDragDims({ dragInfo, widthM, lengthM, scale, meterToCanvasX, meterToCanvasY }) {
  if (!dragInfo || !dragInfo.visible) return null;

  const { wall, posM, lengthM: elLen, distA, distB, labelA, labelB } = dragInfo;

  // Pixel helpers
  const px = (m) => m * scale;

  // Element body pixel bounds
  let bodyX1, bodyY1, bodyX2, bodyY2;

  if (wall === 'front') {
    bodyX1 = meterToCanvasX(posM);
    bodyX2 = meterToCanvasX(posM + elLen);
    bodyY1 = meterToCanvasY(0);
    bodyY2 = bodyY1 + Math.max(6, px(0.06));
  } else if (wall === 'rear') {
    bodyX1 = meterToCanvasX(posM);
    bodyX2 = meterToCanvasX(posM + elLen);
    bodyY2 = meterToCanvasY(lengthM);
    bodyY1 = bodyY2 - Math.max(6, px(0.06));
  } else if (wall === 'left') {
    bodyX1 = meterToCanvasX(0);
    bodyX2 = bodyX1 + Math.max(6, px(0.06));
    bodyY1 = meterToCanvasY(posM);
    bodyY2 = meterToCanvasY(posM + elLen);
  } else { // right
    bodyX2 = meterToCanvasX(widthM);
    bodyX1 = bodyX2 - Math.max(6, px(0.06));
    bodyY1 = meterToCanvasY(posM);
    bodyY2 = meterToCanvasY(posM + elLen);
  }

  const midBodyX = (bodyX1 + bodyX2) / 2;
  const midBodyY = (bodyY1 + bodyY2) / 2;

  const TICK = 5;
  const STROKE = '#3E6B4F';
  const STROKE_W = 1;
  const DASH = '3,3';
  const TEXT_SIZE = 10;
  const TEXT_FILL = '#213428';
  const TEXT_WEIGHT = 600;

  // ── Horizontal walls (front / rear) ────────────────────────────────────────
  if (wall === 'front' || wall === 'rear') {
    const wallX_left  = meterToCanvasX(0);
    const wallX_right = meterToCanvasX(widthM);
    const leftEdgeX = bodyX1;
    const rightEdgeX = bodyX2;

    // Dim line sits 28px outside the room wall — well within the 60px PADDING margin
    const dimY = wall === 'front'
      ? meterToCanvasY(0) - 28
      : meterToCanvasY(lengthM) + 28;
    // Text sits another 14px further out from the dim line
    const textY = wall === 'front' ? dimY - 14 : dimY + 14;

    return (
      <g data-layer="room-element-drag-dims" pointerEvents="none">
        {distA > 0.005 && (
          <g>
            <line x1={wallX_left} y1={dimY} x2={leftEdgeX} y2={dimY}
              stroke={STROKE} strokeWidth={STROKE_W} strokeDasharray={DASH} />
            <line x1={wallX_left} y1={dimY - TICK} x2={wallX_left} y2={dimY + TICK}
              stroke={STROKE} strokeWidth={STROKE_W} />
            <line x1={leftEdgeX} y1={dimY - TICK} x2={leftEdgeX} y2={dimY + TICK}
              stroke={STROKE} strokeWidth={STROKE_W} />
            <text
              x={(wallX_left + leftEdgeX) / 2}
              y={textY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={TEXT_SIZE}
              fontWeight={TEXT_WEIGHT}
              fill={TEXT_FILL}
              style={{ userSelect: 'none' }}
            >
              ← {distA.toFixed(2)} m
            </text>
          </g>
        )}
        {distB > 0.005 && (
          <g>
            <line x1={rightEdgeX} y1={dimY} x2={wallX_right} y2={dimY}
              stroke={STROKE} strokeWidth={STROKE_W} strokeDasharray={DASH} />
            <line x1={rightEdgeX} y1={dimY - TICK} x2={rightEdgeX} y2={dimY + TICK}
              stroke={STROKE} strokeWidth={STROKE_W} />
            <line x1={wallX_right} y1={dimY - TICK} x2={wallX_right} y2={dimY + TICK}
              stroke={STROKE} strokeWidth={STROKE_W} />
            <text
              x={(rightEdgeX + wallX_right) / 2}
              y={textY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={TEXT_SIZE}
              fontWeight={TEXT_WEIGHT}
              fill={TEXT_FILL}
              style={{ userSelect: 'none' }}
            >
              {distB.toFixed(2)} m →
            </text>
          </g>
        )}
        <line x1={midBodyX} y1={meterToCanvasY(0) - 3} x2={midBodyX} y2={meterToCanvasY(0) + 3}
          stroke={STROKE} strokeWidth={1} />
      </g>
    );
  }

  // ── Vertical walls (left / right) ──────────────────────────────────────────
  const wallY_top    = meterToCanvasY(0);
  const wallY_bottom = meterToCanvasY(lengthM);
  const topEdgeY     = bodyY1;
  const bottomEdgeY  = bodyY2;

  // Dim line sits 32px outside the room wall — fits within the 60px PADDING margin
  // Text is placed inline (non-rotated) beside the dim line for readability
  const dimX = wall === 'left'
    ? meterToCanvasX(0) - 32
    : meterToCanvasX(widthM) + 32;
  const textAnchor = wall === 'left' ? 'end' : 'start';
  const textX = wall === 'left' ? dimX - 6 : dimX + 6;

  return (
    <g data-layer="room-element-drag-dims" pointerEvents="none">
      {distA > 0.005 && (
        <g>
          <line x1={dimX} y1={wallY_top} x2={dimX} y2={topEdgeY}
            stroke={STROKE} strokeWidth={STROKE_W} strokeDasharray={DASH} />
          <line x1={dimX - TICK} y1={wallY_top} x2={dimX + TICK} y2={wallY_top}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={dimX - TICK} y1={topEdgeY} x2={dimX + TICK} y2={topEdgeY}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <text
            x={textX}
            y={(wallY_top + topEdgeY) / 2}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            fontSize={TEXT_SIZE}
            fontWeight={TEXT_WEIGHT}
            fill={TEXT_FILL}
            style={{ userSelect: 'none' }}
          >
            {distA.toFixed(2)} m
          </text>
        </g>
      )}
      {distB > 0.005 && (
        <g>
          <line x1={dimX} y1={bottomEdgeY} x2={dimX} y2={wallY_bottom}
            stroke={STROKE} strokeWidth={STROKE_W} strokeDasharray={DASH} />
          <line x1={dimX - TICK} y1={bottomEdgeY} x2={dimX + TICK} y2={bottomEdgeY}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={dimX - TICK} y1={wallY_bottom} x2={dimX + TICK} y2={wallY_bottom}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <text
            x={textX}
            y={(bottomEdgeY + wallY_bottom) / 2}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            fontSize={TEXT_SIZE}
            fontWeight={TEXT_WEIGHT}
            fill={TEXT_FILL}
            style={{ userSelect: 'none' }}
          >
            {distB.toFixed(2)} m
          </text>
        </g>
      )}
    </g>
  );
}