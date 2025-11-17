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
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) {
    return { status: "disabled" };
  }

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

  if (!bounds) {
    return { status: "disabled" };
  }

  // Compute zone extents
  const zones = computeRp22OverheadZoneExtents(bounds, { widthM, lengthM, heightM });

  return {
    status: "ok",
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

    const [x0px] = toPx(zone.x1, 0);
    const [x1px] = toPx(zone.x2, 0);
    const [, y0px] = toPx(0, zone.y1);
    const [, y1px] = toPx(0, zone.y2);

    const x = Math.min(x0px, x1px);
    const y = Math.min(y0px, y1px);
    const wpx = Math.abs(x1px - x0px);
    const hpx = Math.abs(y1px - y0px);

    if (wpx <= 0 || hpx <= 0) return;

    // Gradient for visual polish
    const gid = `oh-${zoneKey}-grad`;

    elts.push(
      <defs key={`${gid}-defs`}>
        <linearGradient id={gid} x1={x} y1={y} x2={x} y2={y + hpx} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={fill} stopOpacity="0.06" />
          <stop offset="50%" stopColor={fill} stopOpacity="0.12" />
          <stop offset="100%" stopColor={fill} stopOpacity="0.06" />
        </linearGradient>
      </defs>
    );

    elts.push(
      <rect
        key={`rect-${zoneKey}`}
        x={x}
        y={y}
        width={wpx}
        height={hpx}
        fill={`url(#${gid})`}
        pointerEvents="none"
      />
    );

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

  // Render zones with RP22 styling
  // Upper Front: warm brown
  if (showFront) {
    renderZone(frontZone, "front", "Upper Front zone", "#4A230F");
  }

  // Top Middle: neutral grey
  if (showMid) {
    renderZone(midZone, "mid", "Top Middle zone", "#555555");
  }

  // Upper Back: warm brown (or use a slightly different shade if desired)
  if (showBack) {
    renderZone(backZone, "back", "Upper Back zone", "#213428");
  }

  return <g data-layer="overhead-bands" pointerEvents="none">{elts}</g>;
}