/**
 * RvP9Corridors
 * -------------
 * SVG renderer for the dynamic P9 L4 target line in the Room Designer plan view.
 *
 * Renders on the actual overhead-zone pieces for the selected row — NOT
 * full-room-width. For each boundary, draws two short horizontal markers
 * (one per strip). Lightly shades the compliant part within the zone pieces.
 *
 * States:
 *   single_row — .2 layout, discreet label, no target line
 *   no_l4      — discreet zone-level message, no invisible group
 *   all_l4     — lightly shade + outline selected zone pieces, discreet label
 *   bounded_l4 — boundary markers on strips + compliant shading
 *
 * Follows the existing front-wide L4 target-line visual language:
 * restrained brand green (#213428), ~2px dashed line, low opacity.
 */

import React from "react";

const ZONE_KEY_MAP = {
  front: "frontZone",
  mid: "midZone",
  rear: "backZone",
};

export default function RvP9Corridors({
  ranges,
  boundaries,
  applicable,
  state,
  note,
  selectedRow,
  overheadZones,
  toPx,
  widthM,
  lengthM,
  scale,
}) {
  // .2 layout — discreet label, no target line
  if (!applicable && note) {
    const [cx] = toPx(widthM / 2, 0);
    const [, cy] = toPx(0, lengthM / 2);
    return (
      <g data-layer="p9-target" pointerEvents="none">
        <text
          x={cx}
          y={cy}
          fill="#625143"
          fontSize={Math.max(9, 10 * scale)}
          textAnchor="middle"
          fontFamily="Didact Gothic, sans-serif"
          opacity={0.45}
        >
          {note}
        </text>
      </g>
    );
  }

  if (!applicable) return null;

  // Resolve the selected row's zone pieces
  const zoneKey = ZONE_KEY_MAP[selectedRow];
  const zone = overheadZones?.[zoneKey];
  if (!zone || !zone.active) return null;

  const pieces = Array.isArray(zone.pieces) && zone.pieces.length
    ? zone.pieces
    : [{ x1: zone.x1, x2: zone.x2 }];
  if (pieces.length === 0) return null;

  const zoneYMin = Math.min(zone.y1, zone.y2);
  const zoneYMax = Math.max(zone.y1, zone.y2);

  // Helper: convert a Y (meters) to px
  const yToPx = (yM) => toPx(0, yM)[1];

  // ─── No-L4: discreet zone-level message ───────────────────────────────
  if (state === "no_l4") {
    const zoneMidY = (zoneYMin + zoneYMax) / 2;
    const cy = yToPx(zoneMidY);
    // Center across all pieces
    const allX = pieces.flatMap((p) => [p.x1, p.x2]);
    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX);
    const [cx] = toPx((xMin + xMax) / 2, 0);
    return (
      <g data-layer="p9-target" pointerEvents="none">
        <text
          x={cx}
          y={cy}
          fill="#625143"
          fontSize={Math.max(9, 10 * scale)}
          textAnchor="middle"
          fontFamily="Didact Gothic, sans-serif"
          opacity={0.5}
        >
          L4 target outside current placement range
        </text>
      </g>
    );
  }

  // ─── All-L4: lightly shade + outline zone pieces, discreet label ──────
  if (state === "all_l4") {
    const zoneYTopPx = yToPx(zoneYMin);
    const zoneYBotPx = yToPx(zoneYMax);
    const yPx = Math.min(zoneYTopPx, zoneYBotPx);
    const hpx = Math.abs(zoneYBotPx - zoneYTopPx);
    const zoneMidY = (zoneYMin + zoneYMax) / 2;
    const cy = yToPx(zoneMidY);

    return (
      <g data-layer="p9-target" pointerEvents="none">
        {pieces.map((piece, i) => {
          const [x0px] = toPx(piece.x1, 0);
          const [x1px] = toPx(piece.x2, 0);
          const x = Math.min(x0px, x1px);
          const wpx = Math.abs(x1px - x0px);
          return (
            <rect
              key={`p9-all-${i}`}
              x={x}
              y={yPx}
              width={wpx}
              height={hpx}
              fill="#213428"
              fillOpacity={0.07}
              stroke="#213428"
              strokeWidth={1}
              strokeOpacity={0.3}
            />
          );
        })}
        {/* Single discreet label centered across zone */}
        <text
          x={toPx((pieces[0].x1 + pieces[0].x2) / 2, 0)[0]}
          y={cy}
          fill="#213428"
          fontSize={Math.max(8, 9 * scale)}
          textAnchor="middle"
          fontFamily="Didact Gothic, sans-serif"
          opacity={0.5}
        >
          L4 throughout this zone
        </text>
      </g>
    );
  }

  // ─── Bounded L4: boundary markers on strips + compliant shading ──────
  // state === "bounded_l4"
  const labelFontSize = Math.max(8, 9 * scale);

  return (
    <g data-layer="p9-target" pointerEvents="none">
      {/* Light compliant shading on zone pieces, clipped to compliant ranges */}
      {(ranges || []).map((range, ri) => {
        // Constrain range to zone Y bounds
        const yStart = Math.max(range.yStart, zoneYMin);
        const yEnd = Math.min(range.yEnd, zoneYMax);
        if (yStart >= yEnd) return null;

        const yStartPx = yToPx(yStart);
        const yEndPx = yToPx(yEnd);
        const yTop = Math.min(yStartPx, yEndPx);
        const hpx = Math.abs(yEndPx - yStartPx);

        return pieces.map((piece, pi) => {
          const [x0px] = toPx(piece.x1, 0);
          const [x1px] = toPx(piece.x2, 0);
          const x = Math.min(x0px, x1px);
          const wpx = Math.abs(x1px - x0px);
          return (
            <rect
              key={`p9-range-${ri}-${pi}`}
              x={x}
              y={yTop}
              width={wpx}
              height={hpx}
              fill="#213428"
              fillOpacity={0.06}
              stroke="none"
            />
          );
        });
      })}

      {/* Boundary markers — two short horizontal lines per boundary (left + right strip) */}
      {(boundaries || []).map((yBoundary, bi) => {
        // Constrain boundary to zone Y bounds
        if (yBoundary < zoneYMin || yBoundary > zoneYMax) return null;

        const yPx = yToPx(yBoundary);

        return pieces.map((piece, pi) => {
          const [x0px] = toPx(piece.x1, 0);
          const [x1px] = toPx(piece.x2, 0);
          const x = Math.min(x0px, x1px);
          const wpx = Math.abs(x1px - x0px);
          return (
            <g key={`p9-boundary-${bi}-${pi}`}>
              <line
                x1={x}
                y1={yPx}
                x2={x + wpx}
                y2={yPx}
                stroke="#213428"
                strokeWidth={2}
                strokeOpacity={0.6}
                strokeDasharray="6 4"
              />
              {/* Label only on first piece to avoid duplication */}
              {pi === 0 && (
                <text
                  x={x + 4}
                  y={yPx - 3}
                  fill="#213428"
                  fontSize={labelFontSize}
                  fontFamily="Didact Gothic, sans-serif"
                  opacity={0.55}
                >
                  P9 L4 target
                </text>
              )}
            </g>
          );
        });
      })}
    </g>
  );
}