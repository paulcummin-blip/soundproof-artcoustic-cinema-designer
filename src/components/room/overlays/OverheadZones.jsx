// overlays/OverheadZones.js
// RP22-compliant overhead zone rendering for Dolby upper speakers.
// Uses Section 5.8 and Parameter 9 guidance.

import React from "react";
import { getListeningAreaBounds, computeRp22OverheadZoneExtents } from "@/components/utils/rp22OverheadZones";

/**
 * Compute RP22-compliant overhead zones.
 * Returns { status:'ok', frontZone?, midZone?, backZone? }
 * Each zone: { x1, x2, y1, y2, active } in *metres*.
 */
export function computeOverheadZones({
  seatingPositions,
  heightM,
  widthM,
  lengthM,
  mlpY_m,
  mlpPoint,
  placedSpeakers,
  getCanonicalRole,
}) {
  // Construct MLP point if not provided
  const mlp = mlpPoint || { x: widthM / 2, y: mlpY_m || lengthM / 2, z: 1.2 };

  // Get listening area bounds using RP22 logic
  const bounds = getListeningAreaBounds(
    seatingPositions,
    mlp,
    { widthM, lengthM, heightM },
    placedSpeakers,
    getCanonicalRole
  );

  // Compute zone extents (handles inactive bounds internally)
  const zones = computeRp22OverheadZoneExtents(
    bounds,
    { widthM, lengthM, heightM },
    seatingPositions,
    placedSpeakers,
    getCanonicalRole
  );

  // Determine status based on whether we have valid seats
  const hasValidSeats = Array.isArray(seatingPositions) && seatingPositions.length > 0 && bounds?.active !== false;
  
  return {
    status: hasValidSeats ? "ok" : "disabled",
    frontZone: zones.frontZone,
    midZone: zones.midZone,
    backZone: zones.backZone
  };
}

/**
 * Render the RP22 overhead bands as SVG <rect>s.
 * config: ".2" | ".4" | ".6"
 * Returns a single <g> element.
 */
export function renderOverheadBandsSVG({
  zones,
  config,
  toPx,
  scale,
  roomRect,
  widthM,
}) {
  if (!zones || zones.status !== "ok") return null;

  const { frontZone, midZone, backZone } = zones;

  // Determine which zones to show based on config
  const show2 = config === ".2";
  const show4 = config === ".4";
  const show6 = config === ".6";

  const showFront = show4 || show6;
  const showMid = show2 || show6;
  const showBack = show4 || show6;

  const elts = [];

  // Helper to render a zone
  const renderZone = (zone, zoneKey, label, fill) => {
    if (!zone || !zone.active) return;

    // Use pieces if available, otherwise fallback to full zone
    const pieces = Array.isArray(zone.pieces) && zone.pieces.length
      ? zone.pieces
      : [{ x1: zone.x1, x2: zone.x2 }];

    const [, y0px] = toPx(0, zone.y1);
    const [, y1px] = toPx(0, zone.y2);

    const y = Math.min(y0px, y1px);
    const hpx = Math.abs(y1px - y0px);

    if (hpx <= 0) return;

    // Define opacity based on zone type: mid is strongest, front/rear are lighter
    let minOpacity = 0.06;
    let maxOpacity = 0.12;

    if (zoneKey === 'mid') {
      minOpacity = 0.10;
      maxOpacity = 0.24;
    } else if (zoneKey === 'front') {
      minOpacity = 0.06;
      maxOpacity = 0.18;
    } else if (zoneKey === 'back') {
      minOpacity = 0.06;
      maxOpacity = 0.20;
    }

    // Render each piece separately
    pieces.forEach((piece, idx) => {
      const [x0px] = toPx(piece.x1, 0);
      const [x1px] = toPx(piece.x2, 0);

      const x = Math.min(x0px, x1px);
      const wpx = Math.abs(x1px - x0px);

      if (wpx <= 0) return;

      // Gradient for visual polish
      const gid = `oh-${zoneKey}-${idx}-grad`;

      elts.push(
        <defs key={`${gid}-defs`}>
          <linearGradient id={gid} x1={x} y1={y} x2={x} y2={y + hpx} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={fill} stopOpacity={minOpacity} />
            <stop offset="50%" stopColor={fill} stopOpacity={maxOpacity} />
            <stop offset="100%" stopColor={fill} stopOpacity={minOpacity} />
          </linearGradient>
        </defs>
      );

      elts.push(
        <rect
          key={`rect-${zoneKey}-${idx}`}
          x={x}
          y={y}
          width={wpx}
          height={hpx}
          fill={`url(#${gid})`}
          pointerEvents="none"
        />
      );
    });

    // Optional: add zone label (can be toggled via prop if desired)
    // Uncomment if you want text labels inside zones:
    /*
    elts.push(
      <text
        key={`label-${zoneKey}`}
        x={x + wpx / 2}
        y={y + hpx / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={12}
        fill="#666"
        opacity={0.5}
        pointerEvents="none"
      >
        {label}
      </text>
    );
    */
  };

  // Render zones with RP22 styling - using side surround color family
  // Upper Front: warm brown (matches left side surround)
  if (showFront) {
    renderZone(frontZone, "front", "Upper Front zone", "#4A230F");
  }

  // Top Middle: warm brown (primary overhead zone, highest opacity)
  if (showMid) {
    renderZone(midZone, "mid", "Top Middle zone", "#4A230F");
  }

  // Upper Back: darker brown (matches right side surround)
  if (showBack) {
    renderZone(backZone, "back", "Upper Back zone", "#213428");
  }

  return <g data-layer="overhead-bands" pointerEvents="none">{elts}</g>;
}