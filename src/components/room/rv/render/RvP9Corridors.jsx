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
  rows,
  overheadZones,
  toPx,
  widthM,
  lengthM,
  scale,
}) {
  // .2 layout (or otherwise not applicable) — render nothing
  if (!applicable) return null;

  // ─── Resolve rows to render ─────────────────────────────────────────
  // If selectedRow is provided, render only that row. Otherwise render all
  // applicable rows from the hook result (baseline guides without selection).
  const rowsToRender = (rows && rows.length > 0)
    ? rows
    : (selectedRow ? [{ row: selectedRow, state }] : []);

  if (rowsToRender.length === 0) return null;

  const labelFontSize = 9;

  // Boundary styling per level — L4 is the reference, L3/L2 progressively subtler
  const BOUNDARY_STYLE = {
    L4: { strokeWidth: 2, strokeOpacity: 0.6, dasharray: "6 4" },
    L3: { strokeWidth: 1.5, strokeOpacity: 0.45, dasharray: "5 3" },
    L2: { strokeWidth: 1.5, strokeOpacity: 0.35, dasharray: "4 3" },
  };

  // Helper: convert Y (meters) to px
  const yToPx = (yM) => toPx(0, yM)[1];

  return (
    <g data-layer="p9-target" pointerEvents="none">
      {/* Per-row L4 shading and state messages */}
      {rowsToRender.map(({ row, state: rowState }) => {
        const zoneKey = ZONE_KEY_MAP[row];
        const zone = overheadZones?.[zoneKey];
        if (!zone || !zone.active) return null;

        const pieces = Array.isArray(zone.pieces) && zone.pieces.length
          ? zone.pieces
          : [{ x1: zone.x1, x2: zone.x2 }];
        if (pieces.length === 0) return null;

        const zoneYMin = Math.min(zone.y1, zone.y2);
        const zoneYMax = Math.max(zone.y1, zone.y2);
        const rowRanges = (ranges || []).filter((r) => r.row === row);
        const rowBoundaries = (boundaries || []).filter((b) => b.row === row);

        return (
          <g key={`p9-row-${row}`}>
            {/* L4-compliant shading within zone pieces (clipped to zone Y) */}
            {rowState !== "no_l4" && rowRanges.map((range, ri) => {
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
                    key={`p9-range-${row}-${ri}-${pi}`}
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

            {/* All-L4: outline zone pieces + discreet label */}
            {rowState === "all_l4" && pieces.map((piece, i) => {
              const zoneYTopPx = yToPx(zoneYMin);
              const zoneYBotPx = yToPx(zoneYMax);
              const yPx = Math.min(zoneYTopPx, zoneYBotPx);
              const hpx = Math.abs(zoneYBotPx - zoneYTopPx);
              const [x0px] = toPx(piece.x1, 0);
              const [x1px] = toPx(piece.x2, 0);
              const x = Math.min(x0px, x1px);
              const wpx = Math.abs(x1px - x0px);
              return (
                <rect
                  key={`p9-all-${row}-${i}`}
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
            {rowState === "all_l4" && (() => {
              const zoneMidY = (zoneYMin + zoneYMax) / 2;
              const cy = yToPx(zoneMidY);
              const [cx] = toPx((pieces[0].x1 + pieces[0].x2) / 2, 0);
              return (
                <text
                  x={cx}
                  y={cy}
                  fill="#213428"
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily="Didact Gothic, sans-serif"
                  opacity={0.5}
                >
                  L4 throughout this zone
                </text>
              );
            })()}

            {/* In-zone P9 placement guides — clipped to this zone's pieces */}
            {rowBoundaries.map((b, bi) => {
              const style = BOUNDARY_STYLE[b.level] || BOUNDARY_STYLE.L4;
              const yPx = yToPx(b.y);
              const rightmostX = Math.max(...pieces.map((p) => Math.max(p.x1, p.x2)));
              const [labelXpx] = toPx(rightmostX, 0);
              return (
                <g key={`p9-guide-${row}-${bi}`}>
                  {pieces.map((piece, pi) => {
                    const [x0px] = toPx(Math.min(piece.x1, piece.x2), 0);
                    const [x1px] = toPx(Math.max(piece.x1, piece.x2), 0);
                    return (
                      <line
                        key={`p9-guide-line-${row}-${bi}-${pi}`}
                        x1={x0px}
                        y1={yPx}
                        x2={x1px}
                        y2={yPx}
                        stroke="#213428"
                        strokeWidth={style.strokeWidth}
                        strokeOpacity={style.strokeOpacity}
                        strokeDasharray={style.dasharray}
                      />
                    );
                  })}
                  <text
                    x={labelXpx - 4}
                    y={yPx - 3}
                    fill="#213428"
                    fontSize={labelFontSize}
                    textAnchor="end"
                    fontFamily="Didact Gothic, sans-serif"
                    opacity={Math.min(0.7, style.strokeOpacity + 0.15)}
                  >
                    {b.deg}° · {b.level}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}