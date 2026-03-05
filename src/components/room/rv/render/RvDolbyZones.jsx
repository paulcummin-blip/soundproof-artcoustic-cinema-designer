"use client";

import React from "react";

export default function RvDolbyZones({
  hasRoomRect,
  overlaysForRendering,
  mlp,
  toPx,
  widthM,
  lengthM,
  dolbyLayout,
  getDolbyZoneSpecs,
  arcPathForBand,
}) {
  if (!hasRoomRect) return null;
  if (!overlaysForRendering?.enableDolbyZones) return null;

  const seat = mlp;
  if (!seat || !Number.isFinite(seat.x) || !Number.isFinite(seat.y)) return null;
  if (!toPx) return null;

  const w = widthM || 4.5;
  const l = lengthM || 6.0;

  const specs = getDolbyZoneSpecs(dolbyLayout || "5.1");
  if (!specs || !specs.length) return null;

  const rM = Math.max(0.5, Math.min(w, l) * 0.35);
  const rLabel = rM * 0.35;

  const intersectRay = (sx, sy, deg) => {
    const rad = (deg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);

    const tVals = [];
    const xMin = 0, xMax = w, yMin = 0, yMax = l;

    if (Math.abs(dx) > 1e-9) {
      const t1 = (xMin - sx) / dx;
      const y1 = sy + t1 * dy;
      if (t1 > 0 && y1 >= yMin && y1 <= yMax) tVals.push(t1);

      const t2 = (xMax - sx) / dx;
      const y2 = sy + t2 * dy;
      if (t2 > 0 && y2 >= yMin && y2 <= yMax) tVals.push(t2);
    }

    if (Math.abs(dy) > 1e-9) {
      const t3 = (yMin - sy) / dy;
      const x3 = sx + t3 * dx;
      if (t3 > 0 && x3 >= xMin && x3 <= xMax) tVals.push(t3);

      const t4 = (yMax - sy) / dy;
      const x4 = sx + t4 * dx;
      if (t4 > 0 && x4 >= xMin && x4 <= xMax) tVals.push(t4);
    }

    if (!tVals.length) return null;
    const t = Math.min(...tVals);
    return { x: sx + t * dx, y: sy + t * dy };
  };

  const elements = [];

  specs.forEach((spec, si) => {
    spec.ranges.forEach((rng, ri) => {
      const d = arcPathForBand(seat.x, seat.y, rM, rng[0], rng[1], toPx);
      if (d) {
        elements.push(
          <path
            key={`band-${si}-${ri}`}
            d={d}
            fill="none"
            stroke={spec.stroke}
            strokeWidth={1.5}
            strokeDasharray="6,6"
            opacity={0.85}
            pointerEvents="none"
          />
        );
      }

      [rng[0], rng[1]].forEach((deg, di) => {
        const hit = intersectRay(seat.x, seat.y, deg);
        if (!hit) return;

        const [sx, sy] = toPx(seat.x, seat.y);
        const [ex, ey] = toPx(hit.x, hit.y);

        elements.push(
          <line
            key={`spoke-${si}-${ri}-${di}`}
            x1={sx}
            y1={sy}
            x2={ex}
            y2={ey}
            stroke={spec.stroke}
            strokeWidth={1}
            strokeDasharray="3,6"
            opacity={0.7}
            pointerEvents="none"
          />
        );

        const rad = (deg * Math.PI) / 180;
        const lx = seat.x + Math.sin(rad) * rLabel;
        const ly = seat.y - Math.cos(rad) * rLabel;
        const [lpx, lpy] = toPx(lx, ly);

        elements.push(
          <g key={`label-${si}-${ri}-${di}`} pointerEvents="none" opacity={0.95}>
            <rect
              x={lpx - 12}
              y={lpy - 10}
              width={24}
              height={16}
              rx={3}
              fill="white"
              opacity={0.9}
            />
            <text
              x={lpx}
              y={lpy + 2}
              fontSize="11"
              textAnchor="middle"
              fill={spec.stroke}
            >
              {Math.round(deg)}°
            </text>
          </g>
        );
      });
    });
  });

  return <g data-testid="dolby-zones">{elements}</g>;
}