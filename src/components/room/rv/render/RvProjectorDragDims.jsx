"use client";

/**
 * RvProjectorDragDims
 *
 * Renders live dimension guides from the projector lens centre to all four
 * room walls while the projector is being dragged on Plan View.
 *
 * Visual language matches RvRoomElementDragDims / RvMlpDragDims:
 *   dashed green guide lines, tick end-caps, bold small labels.
 * Rendered OUTSIDE RvZoomGroup so the clipPath cannot clip annotations.
 */

const TEXT_SIZE = 10;
const TEXT_HALF_W = 50;
const TEXT_H = TEXT_SIZE;
const SAFE_PAD = 4;

const STROKE = '#3E6B4F';
const STROKE_W = 1;
const DASH = '3,3';
const TEXT_FILL = '#213428';
const TEXT_WEIGHT = 600;
const TICK = 5;

function clampTextX(x, svgW) {
  return Math.max(TEXT_HALF_W + SAFE_PAD, Math.min(x, svgW - TEXT_HALF_W - SAFE_PAD));
}
function clampTextY(y, svgH) {
  return Math.max(TEXT_H + SAFE_PAD, Math.min(y, svgH - TEXT_H - SAFE_PAD));
}

export default function RvProjectorDragDims({
  dragInfo,
  scale,
  meterToCanvasX,
  meterToCanvasY,
  svgW = 1000,
  svgH = 700,
}) {
  if (!dragInfo || !dragInfo.visible) return null;

  const { x, y, widthM, lengthM, distLeft, distRight, distFront, distRear } = dragInfo;
  if (![x, y, widthM, lengthM, distLeft, distRight, distFront, distRear].every(Number.isFinite)) return null;

  const ptX = meterToCanvasX(x);
  const ptY = meterToCanvasY(y);
  const wallLeftX = meterToCanvasX(0);
  const wallRightX = meterToCanvasX(widthM);
  const wallFrontY = meterToCanvasY(0);
  const wallRearY = meterToCanvasY(lengthM);

  return (
    <g data-layer="projector-drag-dims" pointerEvents="none">
      {/* Left wall distance — horizontal line at projector Y */}
      {distLeft > 0.005 && (
        <g>
          <line x1={wallLeftX} y1={ptY} x2={ptX} y2={ptY}
            stroke={STROKE} strokeWidth={STROKE_W} strokeDasharray={DASH} />
          <line x1={wallLeftX} y1={ptY - TICK} x2={wallLeftX} y2={ptY + TICK}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={ptX} y1={ptY - TICK} x2={ptX} y2={ptY + TICK}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <text
            x={clampTextX((wallLeftX + ptX) / 2, svgW)}
            y={clampTextY(ptY - 10, svgH)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={TEXT_SIZE}
            fontWeight={TEXT_WEIGHT}
            fill={TEXT_FILL}
            style={{ userSelect: 'none' }}
          >
            {distLeft.toFixed(2)} m
          </text>
        </g>
      )}
      {/* Right wall distance — horizontal line at projector Y */}
      {distRight > 0.005 && (
        <g>
          <line x1={ptX} y1={ptY} x2={wallRightX} y2={ptY}
            stroke={STROKE} strokeWidth={STROKE_W} strokeDasharray={DASH} />
          <line x1={ptX} y1={ptY - TICK} x2={ptX} y2={ptY + TICK}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={wallRightX} y1={ptY - TICK} x2={wallRightX} y2={ptY + TICK}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <text
            x={clampTextX((ptX + wallRightX) / 2, svgW)}
            y={clampTextY(ptY - 10, svgH)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={TEXT_SIZE}
            fontWeight={TEXT_WEIGHT}
            fill={TEXT_FILL}
            style={{ userSelect: 'none' }}
          >
            {distRight.toFixed(2)} m
          </text>
        </g>
      )}
      {/* Front wall distance — vertical line at projector X */}
      {distFront > 0.005 && (
        <g>
          <line x1={ptX} y1={wallFrontY} x2={ptX} y2={ptY}
            stroke={STROKE} strokeWidth={STROKE_W} strokeDasharray={DASH} />
          <line x1={ptX - TICK} y1={wallFrontY} x2={ptX + TICK} y2={wallFrontY}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={ptX - TICK} y1={ptY} x2={ptX + TICK} y2={ptY}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <text
            x={clampTextX(ptX + 10, svgW)}
            y={clampTextY((wallFrontY + ptY) / 2, svgH)}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={TEXT_SIZE}
            fontWeight={TEXT_WEIGHT}
            fill={TEXT_FILL}
            style={{ userSelect: 'none' }}
          >
            {distFront.toFixed(2)} m
          </text>
        </g>
      )}
      {/* Rear wall distance — vertical line at projector X */}
      {distRear > 0.005 && (
        <g>
          <line x1={ptX} y1={ptY} x2={ptX} y2={wallRearY}
            stroke={STROKE} strokeWidth={STROKE_W} strokeDasharray={DASH} />
          <line x1={ptX - TICK} y1={ptY} x2={ptX + TICK} y2={ptY}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={ptX - TICK} y1={wallRearY} x2={ptX + TICK} y2={wallRearY}
            stroke={STROKE} strokeWidth={STROKE_W} />
          <text
            x={clampTextX(ptX + 10, svgW)}
            y={clampTextY((ptY + wallRearY) / 2, svgH)}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={TEXT_SIZE}
            fontWeight={TEXT_WEIGHT}
            fill={TEXT_FILL}
            style={{ userSelect: 'none' }}
          >
            {distRear.toFixed(2)} m
          </text>
        </g>
      )}
    </g>
  );
}