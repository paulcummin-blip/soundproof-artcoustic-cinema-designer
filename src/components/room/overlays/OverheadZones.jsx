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
    placedSpeakers,
    seatingPositions,
    getCanonicalRole
  );

  // Determine status based on whether we have valid seats
  const hasValidSeats = Array.isArray(seatingPositions) && seatingPositions.length > 0 && bounds?.active !== false;
  
  return {
    status: hasValidSeats ? "ok" : "disabled",
    frontZone: zones.frontZone,
    midZone: zones.midZone,
    backZone: zones.backZone,
    lateral: zones.lateral
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

  // Helper to compute left/right spans from lateral constraints
  const getLeftRightSpans = (lateral) => {
    if (!lateral) return null;

    const centreX_m = Number(lateral.centreX_m);
    const minHalf_m = Number(lateral.minHalfSpanM);
    const maxHalf_m = Number(lateral.maxHalfSpanM);

    if (!Number.isFinite(centreX_m) || !Number.isFinite(maxHalf_m) || maxHalf_m <= 0) {
      return null;
    }

    const innerHalf = Math.max(0, minHalf_m || 0);
    const outerHalf = maxHalf_m;

    if (outerHalf <= innerHalf) {
      return {
        left: { x1: centreX_m - outerHalf, x2: centreX_m - outerHalf },
        right: { x1: centreX_m + outerHalf, x2: centreX_m + outerHalf },
      };
    }

    return {
      left: {
        x1: centreX_m - outerHalf,
        x2: centreX_m - innerHalf,
      },
      right: {
        x1: centreX_m + innerHalf,
        x2: centreX_m + outerHalf,
      },
    };
  };

  const lateral = zones?.lateral || null;
  const spans = getLeftRightSpans(lateral);

  // Helper to render a zone
  const renderZone = (zone, zoneKey, label, fill) => {
    if (!zone || !zone.active) return;

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

    // If we have lateral splits, render left and right strips separately
    if (spans) {
      // Left strip
      if (spans.left && Number.isFinite(spans.left.x1) && Number.isFinite(spans.left.x2) && spans.left.x2 > spans.left.x1) {
        const [x0px] = toPx(spans.left.x1, 0);
        const [x1px] = toPx(spans.left.x2, 0);
        const xLeft = Math.min(x0px, x1px);
        const wLeft = Math.abs(x1px - x0px);

        const gidLeft = `oh-${zoneKey}-left-grad`;

        elts.push(
          <defs key={`${gidLeft}-defs`}>
            <linearGradient id={gidLeft} x1={xLeft} y1={y} x2={xLeft} y2={y + hpx} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={fill} stopOpacity={minOpacity} />
              <stop offset="50%" stopColor={fill} stopOpacity={maxOpacity} />
              <stop offset="100%" stopColor={fill} stopOpacity={minOpacity} />
            </linearGradient>
          </defs>
        );

        elts.push(
          <rect
            key={`rect-${zoneKey}-left`}
            x={xLeft}
            y={y}
            width={wLeft}
            height={hpx}
            fill={`url(#${gidLeft})`}
            pointerEvents="none"
          />
        );

        // Left core
        if (zone.coreY1 != null && zone.coreY2 != null) {
          const [, coreY0px] = toPx(0, zone.coreY1);
          const [, coreY1px] = toPx(0, zone.coreY2);
          const coreY = Math.min(coreY0px, coreY1px);
          const coreH = Math.abs(coreY1px - coreY0px);

          if (coreH > 0) {
            elts.push(
              <rect
                key={`core-${zoneKey}-left`}
                x={xLeft}
                y={coreY}
                width={wLeft}
                height={coreH}
                fill={fill}
                fillOpacity={0.15}
                stroke={fill}
                strokeWidth={0.5}
                strokeOpacity={0.3}
                strokeDasharray="2,2"
                pointerEvents="none"
              />
            );
          }
        }
      }

      // Right strip
      if (spans.right && Number.isFinite(spans.right.x1) && Number.isFinite(spans.right.x2) && spans.right.x2 > spans.right.x1) {
        const [x0px] = toPx(spans.right.x1, 0);
        const [x1px] = toPx(spans.right.x2, 0);
        const xRight = Math.min(x0px, x1px);
        const wRight = Math.abs(x1px - x0px);

        const gidRight = `oh-${zoneKey}-right-grad`;

        elts.push(
          <defs key={`${gidRight}-defs`}>
            <linearGradient id={gidRight} x1={xRight} y1={y} x2={xRight} y2={y + hpx} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={fill} stopOpacity={minOpacity} />
              <stop offset="50%" stopColor={fill} stopOpacity={maxOpacity} />
              <stop offset="100%" stopColor={fill} stopOpacity={minOpacity} />
            </linearGradient>
          </defs>
        );

        elts.push(
          <rect
            key={`rect-${zoneKey}-right`}
            x={xRight}
            y={y}
            width={wRight}
            height={hpx}
            fill={`url(#${gidRight})`}
            pointerEvents="none"
          />
        );

        // Right core
        if (zone.coreY1 != null && zone.coreY2 != null) {
          const [, coreY0px] = toPx(0, zone.coreY1);
          const [, coreY1px] = toPx(0, zone.coreY2);
          const coreY = Math.min(coreY0px, coreY1px);
          const coreH = Math.abs(coreY1px - coreY0px);

          if (coreH > 0) {
            elts.push(
              <rect
                key={`core-${zoneKey}-right`}
                x={xRight}
                y={coreY}
                width={wRight}
                height={coreH}
                fill={fill}
                fillOpacity={0.15}
                stroke={fill}
                strokeWidth={0.5}
                strokeOpacity={0.3}
                strokeDasharray="2,2"
                pointerEvents="none"
              />
            );
          }
        }
      }

      return;
    }

    // Fallback: no lateral data - render full-width band
    const [x0px] = toPx(zone.x1, 0);
    const [x1px] = toPx(zone.x2, 0);
    const x = Math.min(x0px, x1px);
    const wpx = Math.abs(x1px - x0px);

    if (wpx <= 0) return;

    const gid = `oh-${zoneKey}-grad`;

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
        key={`rect-${zoneKey}`}
        x={x}
        y={y}
        width={wpx}
        height={hpx}
        fill={`url(#${gid})`}
        pointerEvents="none"
      />
    );

    // Render recommended core if available
    if (zone.coreY1 != null && zone.coreY2 != null) {
      const [, coreY0px] = toPx(0, zone.coreY1);
      const [, coreY1px] = toPx(0, zone.coreY2);
      
      const coreY = Math.min(coreY0px, coreY1px);
      const coreH = Math.abs(coreY1px - coreY0px);
      
      if (coreH > 0) {
        elts.push(
          <rect
            key={`core-${zoneKey}`}
            x={x}
            y={coreY}
            width={wpx}
            height={coreH}
            fill={fill}
            fillOpacity={0.15}
            stroke={fill}
            strokeWidth={0.5}
            strokeOpacity={0.3}
            strokeDasharray="2,2"
            pointerEvents="none"
          />
        );
      }
    }

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