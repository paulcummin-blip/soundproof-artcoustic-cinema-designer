// overlays/OverheadZones.jsx
// RP22-compliant overhead zone rendering for Dolby upper speakers.
// Uses Section 5.8 and Parameter 9 guidance.

import React from "react";
import { useAppState } from "@/components/AppStateProvider";
import { getListeningAreaBounds, computeRp22OverheadZoneExtents } from "@/components/utils/rp22OverheadZones";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { computeP9GuideYs } from "@/components/utils/p9GuideGeometry";

/**
 * OverheadZones overlay component - renders RP22 overhead bands
 */
export default function OverheadZones({ roomRect, scale, toPx }) {
  const {
    roomDims,
    dolbyLayout,
    seatingPositions,
    mlpY_m,
    speakerSystem,
  } = useAppState() || {};

  // Extract overhead count from dolby layout
  const layoutStr = typeof dolbyLayout === "string" ? dolbyLayout : "";
  const base = layoutStr.split(" ")[0].split("_")[0]; // e.g. "5.1.4 Dolby Atmos" → "5.1.4"
  const parts = base ? base.split(".") : [];
  const heights = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;

  // If no height layer, return null
  if (heights === 0) {
    return null;
  }

  // Compute MLP point
  const mlpPoint = mlpY_m 
    ? { x: roomDims?.widthM / 2 || 2.25, y: mlpY_m, z: 1.2 }
    : null;

  // Get listening area bounds using RP22 logic
  const bounds = getListeningAreaBounds(
    seatingPositions,
    mlpPoint,
    roomDims,
    speakerSystem?.placedSpeakers || [],
    getCanonicalRole
  );

  // If bounds are inactive, return null
  if (!bounds || bounds.active === false) {
    return null;
  }

  // Compute zone extents
  const zones = computeRp22OverheadZoneExtents(
    bounds,
    roomDims,
    seatingPositions,
    speakerSystem?.placedSpeakers || [],
    getCanonicalRole
  );

  // Determine which zones to show based on overhead count
  const showFront = heights === 4 || heights === 6;
  const showMid = heights === 2 || heights === 6;
  const showBack = heights === 4 || heights === 6;

  const elements = [];

  // Helper to render a zone with pieces
  const renderZone = (zone, zoneKey, fill) => {
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

    // Define opacity based on zone type
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

      elements.push(
        <defs key={`${gid}-defs`}>
          <linearGradient id={gid} x1={x} y1={y} x2={x} y2={y + hpx} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={fill} stopOpacity={minOpacity} />
            <stop offset="50%" stopColor={fill} stopOpacity={maxOpacity} />
            <stop offset="100%" stopColor={fill} stopOpacity={minOpacity} />
          </linearGradient>
        </defs>
      );

      elements.push(
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
  };

  // Render zones with RP22 styling
  if (showFront) {
    renderZone(zones.frontZone, "front", "#4A230F");
  }

  if (showMid) {
    renderZone(zones.midZone, "mid", "#4A230F");
  }

  if (showBack) {
    renderZone(zones.backZone, "back", "#213428");
  }

  // ── P9 level guide lines (front/rear zones only, 4+ height channels) ──
  // Shows the Y positions at which overhead speaker placement crosses
  // the P9 L4/L3/L2 thresholds. Uses the same elevation geometry as the
  // canonical P9 authority (computeUpperVerticalAnglesForSeat).
  if (heights >= 4 && bounds?.active) {
    const frontCenterY = zones.frontZone?.active
      ? (zones.frontZone.y1 + zones.frontZone.y2) / 2
      : null;
    const rearCenterY = zones.backZone?.active
      ? (zones.backZone.y1 + zones.backZone.y2) / 2
      : null;
    const midCenterY = zones.midZone?.active
      ? (zones.midZone.y1 + zones.midZone.y2) / 2
      : null;
    const hasMid = heights === 6;

    const { frontGuides, rearGuides } = computeP9GuideYs({
      mlpY: mlpY_m || bounds.midCenterY,
      ceilingHeightM: roomDims?.heightM,
      earHeightM: bounds.mlpEarHeight,
      frontCenterY,
      rearCenterY,
      midCenterY,
      hasMid,
    });

    const renderGuides = (zoneKey, zone, guides, strokeColor) => {
      if (!zone || !zone.active || !Array.isArray(guides) || guides.length === 0) return;

      const pieces = Array.isArray(zone.pieces) && zone.pieces.length
        ? zone.pieces
        : [{ x1: zone.x1, x2: zone.x2 }];
      const rightmostX = Math.max(...pieces.map(p => Math.max(p.x1, p.x2)));

      guides.forEach(guide => {
        // Only render guides that fall within the zone's Y extent
        if (guide.yM < zone.y1 || guide.yM > zone.y2) return;

        const [, yPx] = toPx(0, guide.yM);
        const [labelX] = toPx(rightmostX, 0);

        // Dashed transverse line within each piece (clipped to zone width)
        pieces.forEach((piece, idx) => {
          const [x0px] = toPx(Math.min(piece.x1, piece.x2), 0);
          const [x1px] = toPx(Math.max(piece.x1, piece.x2), 0);
          elements.push(
            <line
              key={`p9-${zoneKey}-${guide.level}-${idx}`}
              x1={x0px}
              y1={yPx}
              x2={x1px}
              y2={yPx}
              stroke={strokeColor}
              strokeWidth="1.5"
              strokeOpacity="0.5"
              strokeDasharray="4,4"
            />
          );
        });

        // Small muted label at the right end of the guide line
        elements.push(
          <text
            key={`p9-${zoneKey}-label-${guide.level}`}
            x={labelX - 4}
            y={yPx - 3}
            textAnchor="end"
            fill="#625143"
            fontSize="10"
            fontFamily="system-ui, sans-serif"
          >
            {guide.level}
          </text>
        );
      });
    };

    if (showFront) {
      renderGuides('front', zones.frontZone, frontGuides, "#4A230F");
    }
    if (showBack) {
      renderGuides('rear', zones.backZone, rearGuides, "#213428");
    }
  }

  return (
    <g data-layer="overhead-bands" pointerEvents="none">
      {elements}
    </g>
  );
}

/**
 * Legacy export for backwards compatibility
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
    backZone: zones.backZone,
    bounds, // Include bounds with seatMinX/seatMaxX for icon clamping
    lateralMode: zones.lateralMode,
    excludedLeftSeatIds: zones.excludedLeftSeatIds,
    excludedRightSeatIds: zones.excludedRightSeatIds,
    excludedSeatCount: zones.excludedSeatCount,
    lateralReason: zones.reason,
  };
}

/**
 * Legacy export: Render the RP22 overhead bands as SVG <rect>s.
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
  };

  // Render zones with RP22 styling
  if (showFront) {
    renderZone(frontZone, "front", "Upper Front zone", "#4A230F");
  }

  if (showMid) {
    renderZone(midZone, "mid", "Top Middle zone", "#4A230F");
  }

  if (showBack) {
    renderZone(backZone, "back", "Upper Back zone", "#213428");
  }

  return <g data-layer="overhead-bands" pointerEvents="none">{elts}</g>;
}