/**
 * RvSeatDimensions
 *
 * Dimensions mode: the three measurements for ONE selected seat, taken from that
 * seat's own listening position — nearest side wall, rear wall and screen plane.
 *
 * The screen distance is the same authority the seat HUD shows
 * (|seat Y - screen plane Y|), and only the selected seat is ever drawn; the
 * parent clears the payload to hide the guides. Reuses the plan's shared
 * dimension visual language (rvDimensionStyle) so it reads identically to the
 * seat-drag and RSP guides, and is rendered outside the zoom clip group by the
 * parent so labels near a wall are never clipped.
 */
import React from "react";
import {
  DIM_DASH,
  DIM_STROKE,
  DIM_STROKE_W,
  DIM_TEXT_FILL,
  DIM_TEXT_SIZE,
  DIM_TEXT_WEIGHT,
  DIM_TICK,
  clampDimTextX,
  clampDimTextY,
  formatDimMeters,
} from "@/components/room/rv/render/rvDimensionStyle";

const LABEL_STYLE = { userSelect: 'none' };

export default function RvSeatDimensions({
  dimensions,
  meterToCanvasX,
  meterToCanvasY,
  svgW = 1000,
  svgH = 700,
}) {
  if (!dimensions?.visible) return null;
  if (typeof meterToCanvasX !== 'function' || typeof meterToCanvasY !== 'function') return null;

  const { x, y, widthM, lengthM, side, sideDist, rearDist, screenDist, screenPlaneM } = dimensions;
  if (![x, y, sideDist, rearDist].every(Number.isFinite)) return null;

  const ptX = meterToCanvasX(x);
  const ptY = meterToCanvasY(y);
  if (![ptX, ptY].every(Number.isFinite)) return null;

  const sideWallX = side === 'left' ? meterToCanvasX(0) : meterToCanvasX(widthM);
  const rearWallY = meterToCanvasY(lengthM);
  const screenY = Number.isFinite(screenPlaneM) ? meterToCanvasY(screenPlaneM) : null;

  // Labels are placed apart on purpose: the side label sits above its leader,
  // the rear label to the right of its leader and the screen label to the left,
  // so the three stay readable without covering seats or each other.
  const sideTextX = clampDimTextX((ptX + sideWallX) / 2, svgW);
  const sideTextY = clampDimTextY(ptY - 10, svgH);
  const rearTextX = clampDimTextX(ptX + 10, svgW);
  const rearTextY = clampDimTextY((ptY + rearWallY) / 2, svgH);
  const screenTextX = clampDimTextX(ptX - 10, svgW);
  const screenTextY = clampDimTextY(screenY == null ? ptY : (ptY + screenY) / 2, svgH);

  return (
    <g data-layer="seat-dimensions" pointerEvents="none">
      {/* Origin anchor — the selected seat's own listening position */}
      <circle cx={ptX} cy={ptY} r={3} fill={DIM_STROKE} opacity={0.85} />

      {/* 1 — nearest side wall */}
      {sideDist > 0.005 && (
        <g>
          <line x1={ptX} y1={ptY} x2={sideWallX} y2={ptY}
            stroke={DIM_STROKE} strokeWidth={DIM_STROKE_W} strokeDasharray={DIM_DASH} />
          <line x1={ptX} y1={ptY - DIM_TICK} x2={ptX} y2={ptY + DIM_TICK}
            stroke={DIM_STROKE} strokeWidth={DIM_STROKE_W} />
          <line x1={sideWallX} y1={ptY - DIM_TICK} x2={sideWallX} y2={ptY + DIM_TICK}
            stroke={DIM_STROKE} strokeWidth={DIM_STROKE_W} />
          <text
            x={sideTextX}
            y={sideTextY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={DIM_TEXT_SIZE}
            fontWeight={DIM_TEXT_WEIGHT}
            fill={DIM_TEXT_FILL}
            style={LABEL_STYLE}
          >
            {`Side wall ${formatDimMeters(sideDist)}`}
          </text>
        </g>
      )}

      {/* 2 — rear wall */}
      {rearDist > 0.005 && (
        <g>
          <line x1={ptX} y1={ptY} x2={ptX} y2={rearWallY}
            stroke={DIM_STROKE} strokeWidth={DIM_STROKE_W} strokeDasharray={DIM_DASH} />
          <line x1={ptX - DIM_TICK} y1={rearWallY} x2={ptX + DIM_TICK} y2={rearWallY}
            stroke={DIM_STROKE} strokeWidth={DIM_STROKE_W} />
          <text
            x={rearTextX}
            y={rearTextY}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={DIM_TEXT_SIZE}
            fontWeight={DIM_TEXT_WEIGHT}
            fill={DIM_TEXT_FILL}
            style={LABEL_STYLE}
          >
            {`Rear wall ${formatDimMeters(rearDist)}`}
          </text>
        </g>
      )}

      {/* 3 — screen plane */}
      {screenY != null && Number.isFinite(screenDist) && screenDist > 0.005 && (
        <g>
          <line x1={ptX} y1={ptY} x2={ptX} y2={screenY}
            stroke={DIM_STROKE} strokeWidth={DIM_STROKE_W} strokeDasharray={DIM_DASH} />
          <line x1={ptX - DIM_TICK} y1={screenY} x2={ptX + DIM_TICK} y2={screenY}
            stroke={DIM_STROKE} strokeWidth={DIM_STROKE_W} />
          <text
            x={screenTextX}
            y={screenTextY}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={DIM_TEXT_SIZE}
            fontWeight={DIM_TEXT_WEIGHT}
            fill={DIM_TEXT_FILL}
            style={LABEL_STYLE}
          >
            {`Screen ${formatDimMeters(screenDist)}`}
          </text>
        </g>
      )}
    </g>
  );
}