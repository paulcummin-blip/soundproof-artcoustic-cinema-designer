/**
 * RspReferenceMarker — the Reference Seating Position (RSP) drawn as a survey
 * crosshair.
 *
 * The RSP is a reference POINT, never a seat. It carries no performance halo and
 * no priority keyline, so it can never be read as a Primary seat — even when it
 * sits at or near one. Used by the Bass Performance seat map and by that page's
 * legend, and importable by any Visual Report diagram that marks the reference
 * position.
 *
 * Pure presentation: it draws the coordinate it is given and decides nothing.
 *
 * Props:
 *   cx, cy       — reference position in SVG px
 *   ringR        — crosshair ring radius
 *   dotR         — centre dot radius
 *   tickR        — half-length of the crosshair ticks
 *   color        — stroke/fill colour
 *   strokeWidth  — ring stroke width
 *   tickStrokeWidth — crosshair tick stroke width. Defaults to 1 for the px-space
 *                     seat maps. A diagram drawn in METRES must pass a metre
 *                     value (e.g. 0.01), otherwise the ticks are drawn one metre
 *                     thick and the marker becomes a large black cross.
 */

import React from "react";

export const RSP_RING_R = 8;
export const RSP_DOT_R = 3;
export const RSP_TICK_R = 11;
export const RSP_COLOR = "#213428";

export default function RspReferenceMarker({
  cx,
  cy,
  ringR = RSP_RING_R,
  dotR = RSP_DOT_R,
  tickR = RSP_TICK_R,
  color = RSP_COLOR,
  strokeWidth = 2.5,
  tickStrokeWidth = 1,
}) {
  return (
    <g>
      {/* Survey ticks — the signal that this is a reference point, not a seat. */}
      <line x1={cx - tickR} y1={cy} x2={cx + tickR} y2={cy} stroke={color} strokeWidth={tickStrokeWidth} />
      <line x1={cx} y1={cy - tickR} x2={cx} y2={cy + tickR} stroke={color} strokeWidth={tickStrokeWidth} />
      <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={color} strokeWidth={strokeWidth} />
      <circle cx={cx} cy={cy} r={dotR} fill={color} />
    </g>
  );
}