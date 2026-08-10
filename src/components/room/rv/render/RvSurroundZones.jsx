/**
 * RvSurroundZones.jsx
 * -------------------
 * Renders canonical RP22 side/rear surround zones in the Room Designer plan view.
 * Uses the SAME computeRp22SurroundZones authority as P11 compliance.
 *
 * Toggle-driven:
 *   showSideSurround  → sideLeft / sideRight + forward extremity fade
 *   showRearSurround → backLeft / backRight (only when active)
 *
 * Visual treatment:
 *   - Side zones: subtle semi-transparent fill matching existing RP22 overlay style
 *   - Forward extremity: faded gradient (visual only, P11-inside)
 *   - Directly-behind exclusion: subtle dashed boundary (no fill) to make the
 *     Figure 5-11 topology understandable — the central rear region is NOT
 *     part of the Side Surround recommendation
 *   - Back zones: subtle semi-transparent fill, distinct tint from side zones
 *
 * Authority: CEDIA/CTA-RP22 v1.2 Section 5.6.1, Figure 5-11.
 */

import React, { useMemo } from "react";
import {
  computeRp22SurroundZones,
  hasActiveSurroundBack,
} from "@/components/utils/rp22/rp22SurroundZones";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Opaque colours — transparency controlled by fillOpacity/strokeOpacity ONLY (no double-alpha)
const SIDE_FILL = "#213428";
const SIDE_STROKE = "#213428";
const BACK_FILL = "#4A230F";
const BACK_STROKE = "#4A230F";
const EXCLUSION_STROKE = "#782828";
const FADE_STROKE = "#213428";

// Single opacity values (applied via fillOpacity/strokeOpacity, never via rgba alpha + opacity)
const SIDE_FILL_OPACITY = 0.12;
const SIDE_STROKE_OPACITY = 0.35;
const BACK_FILL_OPACITY = 0.12;
const BACK_STROKE_OPACITY = 0.35;
const EXCLUSION_STROKE_OPACITY = 0.30;
const FADE_STROKE_OPACITY = 0.25;
const FADE_FORWARD_STOP = 0.03;
const FADE_LISTENING_STOP = 0.12;

function zoneToRect(zone, meterToCanvasX, meterToCanvasY) {
  if (!zone || !zone.active) return null;
  if (
    !isNum(zone.xMin) ||
    !isNum(zone.xMax) ||
    !isNum(zone.yMin) ||
    !isNum(zone.yMax)
  )
    return null;

  const xPx = meterToCanvasX(zone.xMin);
  const wPx = meterToCanvasX(zone.xMax) - meterToCanvasX(zone.xMin);
  const yTopPx = meterToCanvasY(zone.yMin);
  const yBotPx = meterToCanvasY(zone.yMax);
  const yPx = Math.min(yTopPx, yBotPx);
  const hPx = Math.abs(yBotPx - yTopPx);

  if (!isNum(xPx) || !isNum(yPx) || !isNum(wPx) || !isNum(hPx)) return null;
  if (wPx <= 0 || hPx <= 0) return null;

  return { xPx, yPx, wPx, hPx };
}

function renderSideZone(zone, key, meterToCanvasX, meterToCanvasY) {
  const r = zoneToRect(zone, meterToCanvasX, meterToCanvasY);
  if (!r) return null;
  return (
    <rect
      key={key}
      x={r.xPx}
      y={r.yPx}
      width={r.wPx}
      height={r.hPx}
      fill={SIDE_FILL}
      fillOpacity={SIDE_FILL_OPACITY}
      stroke={SIDE_STROKE}
      strokeOpacity={SIDE_STROKE_OPACITY}
      strokeWidth={0.5}
      strokeDasharray="4,3"
      pointerEvents="none"
    />
  );
}

function renderBackZone(zone, key, meterToCanvasX, meterToCanvasY) {
  const r = zoneToRect(zone, meterToCanvasX, meterToCanvasY);
  if (!r) return null;
  return (
    <rect
      key={key}
      x={r.xPx}
      y={r.yPx}
      width={r.wPx}
      height={r.hPx}
      fill={BACK_FILL}
      fillOpacity={BACK_FILL_OPACITY}
      stroke={BACK_STROKE}
      strokeOpacity={BACK_STROKE_OPACITY}
      strokeWidth={0.5}
      strokeDasharray="4,3"
      pointerEvents="none"
    />
  );
}

/**
 * Render the directly-behind exclusion as a subtle dashed boundary (no fill).
 * This makes the Figure 5-11 topology visible: the central rear region is
 * NOT part of the Side Surround recommendation.
 */
function renderExclusionBoundary(zones, meterToCanvasX, meterToCanvasY) {
  const ex = zones.directlyBehindExclusion;
  if (!ex || !ex.active) return null;

  const r = zoneToRect(ex, meterToCanvasX, meterToCanvasY);
  if (!r) return null;

  return (
    <rect
      key="rp22-directly-behind-exclusion"
      x={r.xPx}
      y={r.yPx}
      width={r.wPx}
      height={r.hPx}
      fill="none"
      stroke={EXCLUSION_STROKE}
      strokeOpacity={EXCLUSION_STROKE_OPACITY}
      strokeWidth={0.5}
      strokeDasharray="2,4"
      pointerEvents="none"
    />
  );
}

/**
 * Render the 500 mm forward extremity as a faded extension of the side zones.
 * Uses a vertical gradient from transparent (forward edge) to the normal
 * side-zone fill opacity (at listeningFrontY). Visual only — P11-inside.
 */
function renderForwardExtremity(zones, side, meterToCanvasX, meterToCanvasY) {
  const fe = zones.forwardExtremity;
  if (!fe || !fe.p11Inside) return null;

  const zone = side === "left" ? zones.sideLeft : zones.sideRight;
  if (!zone || !zone.active) return null;

  // X range matches the side zone
  const xPx = meterToCanvasX(zone.xMin);
  const wPx = meterToCanvasX(zone.xMax) - meterToCanvasX(zone.xMin);

  // Y range: from forwardExtremeY to listeningFrontY
  const yTopPx = meterToCanvasY(fe.yMin);
  const yBotPx = meterToCanvasY(fe.yMax);
  const yPx = Math.min(yTopPx, yBotPx);
  const hPx = Math.abs(yBotPx - yTopPx);

  if (!isNum(xPx) || !isNum(yPx) || !isNum(wPx) || !isNum(hPx)) return null;
  if (wPx <= 0 || hPx <= 0) return null;

  const gid = `rp22-fe-${side}`;

  return (
    <g key={`rp22-fe-${side}`} pointerEvents="none">
      <defs>
        <linearGradient
          id={gid}
          gradientUnits="userSpaceOnUse"
          x1={xPx}
          y1={yTopPx}
          x2={xPx}
          y2={yBotPx}
        >
          <stop offset="0" stopColor={SIDE_FILL} stopOpacity={FADE_FORWARD_STOP} />
          <stop offset="1" stopColor={SIDE_FILL} stopOpacity={FADE_LISTENING_STOP} />
        </linearGradient>
      </defs>
      <rect
        x={xPx}
        y={yPx}
        width={wPx}
        height={hPx}
        fill={`url(#${gid})`}
        stroke={FADE_STROKE}
        strokeOpacity={FADE_STROKE_OPACITY}
        strokeWidth={0.4}
        strokeDasharray="3,4"
        pointerEvents="none"
      />
    </g>
  );
}

export default function RvSurroundZones({
  seatingPositions,
  widthM,
  lengthM,
  mlpPoint,
  placedSpeakers,
  meterToCanvasX,
  meterToCanvasY,
  showSideSurround,
  showRearSurround,
  // Legacy prop — kept for backward compat but ignored (toggle-driven now)
  showZones,
}) {
  const zones = useMemo(() => {
    return computeRp22SurroundZones({
      seatingPositions,
      dimensions: { widthM, lengthM },
      mlpPoint,
      hasSurroundBack: hasActiveSurroundBack(placedSpeakers),
    });
  }, [seatingPositions, widthM, lengthM, mlpPoint, placedSpeakers]);

  if (!zones || zones.status !== "ok") return null;

  const showSide = showSideSurround || showZones;
  const showRear = showRearSurround || showZones;

  return (
    <g className="rp22-surround-zones-layer" pointerEvents="none">
      {/* Side zones + forward extremity + exclusion boundary */}
      {showSide && (
        <>
          {renderForwardExtremity(zones, "left", meterToCanvasX, meterToCanvasY)}
          {renderForwardExtremity(zones, "right", meterToCanvasX, meterToCanvasY)}
          {renderSideZone(zones.sideLeft, "rp22-sl-zone", meterToCanvasX, meterToCanvasY)}
          {renderSideZone(zones.sideRight, "rp22-sr-zone", meterToCanvasX, meterToCanvasY)}
          {renderExclusionBoundary(zones, meterToCanvasX, meterToCanvasY)}
        </>
      )}

      {/* Rear / Surround Back zones */}
      {showRear && (
        <>
          {renderBackZone(zones.backLeft, "rp22-sbl-zone", meterToCanvasX, meterToCanvasY)}
          {renderBackZone(zones.backRight, "rp22-sbr-zone", meterToCanvasX, meterToCanvasY)}
        </>
      )}
    </g>
  );
}