/**
 * rp22SurroundZones.js
 * ---------------------
 * Canonical RP22 side/rear surround zone resolver.
 * Authority: CEDIA/CTA-RP22 v1.2 Section 5.6.1.
 *
 * Shared by:
 *   - P11 compliance (computeP11Compliance)
 *   - Room Designer visible RP22 zone overlay (RvSurroundZones)
 *
 * Does NOT use getBedPads() or arbitrary ±150mm/±200mm seat margins.
 * Uses actual listening-area perimeter from outermost listener head positions
 * (via getListeningAreaBounds — the same authority used by overhead zones).
 *
 * Rules (RP22 5.6.1):
 *   SIDE SURROUNDS (SL/SR):
 *     - Must be on their respective sides of the space.
 *     - Must avoid the zone directly behind the listening area.
 *     - May extend forward of the front row by up to 500mm.
 *     - 5.x special case (no SBL/SBR): may extend further rearward, even onto
 *       the back wall, but must not sit directly behind the listening area
 *       (the X < W/2 / X > W/2 split enforces this).
 *
 *   SURROUND BACK (SBL/SBR):
 *     - Must be positioned behind the rear line of the listening area.
 *     - Must remain on their corresponding left/right side.
 */

import { getListeningAreaBounds } from "@/components/utils/rp22OverheadZones";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Determine whether surround-back speakers (SBL/SBR) are actually active
 * (placed with a real model). This drives the 5.x special-case logic.
 */
export function hasActiveSurroundBack(speakers) {
  if (!Array.isArray(speakers)) return false;
  return speakers.some((s) => {
    if (!s) return false;
    const model = String(s.model ?? "").trim().toLowerCase();
    if (!model || model === "off" || model === "none") return false;
    const role = getCanonicalRole(s.role);
    return role === "SBL" || role === "SBR";
  });
}

/**
 * Compute canonical RP22 surround zones.
 *
 * @param {Object}  opts
 * @param {Array}   opts.seatingPositions  - Actual listener head positions
 * @param {Object}  opts.dimensions        - { widthM, lengthM } or { width, length }
 * @param {Object}  opts.mlpPoint          - MLP/RSP { x, y, z }
 * @param {boolean} [opts.hasSurroundBack] - Whether SBL/SBR are actually active
 * @returns {Object} { status, sideLeft, sideRight, backLeft, backRight,
 *                     listeningFrontY, listeningBackY, hasSurroundBack }
 *
 * status === "indeterminate" when zone geometry cannot be calculated.
 * P11 must NOT produce a false L4 in that case.
 */
export function computeRp22SurroundZones({
  seatingPositions,
  dimensions,
  mlpPoint,
  hasSurroundBack = false,
}) {
  const widthM = Number(dimensions?.widthM ?? dimensions?.width) || 4.5;
  const lengthM = Number(dimensions?.lengthM ?? dimensions?.length) || 6.0;

  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];

  // Compute listening area bounds from actual listener head positions.
  // This is the SAME authority used by overhead zones (RP22 5.8.1).
  const bounds = getListeningAreaBounds(
    seats,
    mlpPoint || { x: widthM / 2, y: lengthM * 0.5, z: 1.2 },
    { widthM, lengthM, heightM: 2.4 },
    [],
    null
  );

  if (
    !bounds ||
    bounds.active === false ||
    !isNum(bounds.listeningFrontY) ||
    !isNum(bounds.listeningBackY)
  ) {
    return {
      status: "indeterminate",
      sideLeft: null,
      sideRight: null,
      backLeft: null,
      backRight: null,
      listeningFrontY: null,
      listeningBackY: null,
      hasSurroundBack,
    };
  }

  const listeningFrontY = bounds.listeningFrontY;
  const listeningBackY = bounds.listeningBackY;

  const WALL_INSET = 0.05;
  const FORWARD_EXTENSION = 0.500; // RP22 5.6.1: may extend forward of front row by up to 500mm

  // Side surround Y range
  const sideYMin = Math.max(WALL_INSET, listeningFrontY - FORWARD_EXTENSION);
  const sideYMax = hasSurroundBack
    ? listeningBackY // with SBL/SBR: side zone stops at listening area rear line
    : Math.max(sideYMin + 0.01, lengthM - WALL_INSET); // 5.x: extends to back wall

  // Surround-back Y range (only when SBL/SBR active)
  const backYMin = listeningBackY;
  const backYMax = lengthM - WALL_INSET;

  // X split: left half / right half (enforces "respective sides" and
  // prevents SL/SR from sitting "directly behind" the listening area center).
  const halfWidth = widthM / 2;

  const sideLeft = {
    xMin: 0,
    xMax: halfWidth,
    yMin: sideYMin,
    yMax: sideYMax,
    active: true,
  };

  const sideRight = {
    xMin: halfWidth,
    xMax: widthM,
    yMin: sideYMin,
    yMax: sideYMax,
    active: true,
  };

  const backLeft = {
    xMin: 0,
    xMax: halfWidth,
    yMin: backYMin,
    yMax: backYMax,
    active: hasSurroundBack,
  };

  const backRight = {
    xMin: halfWidth,
    xMax: widthM,
    yMin: backYMin,
    yMax: backYMax,
    active: hasSurroundBack,
  };

  return {
    status: "ok",
    sideLeft,
    sideRight,
    backLeft,
    backRight,
    listeningFrontY,
    listeningBackY,
    hasSurroundBack,
  };
}

/**
 * Test whether a point (x, y) is inside a surround zone.
 * Returns:
 *   true  — point is inside the zone
 *   false — point is outside the zone
 *   null  — indeterminate (zone inactive or geometry invalid)
 *
 * P11 must treat `null` as indeterminate, NOT as inside.
 */
export function isInsideSurroundZone(x, y, zone) {
  if (!zone || !zone.active) return null;
  if (!isNum(x) || !isNum(y)) return null;
  if (
    !isNum(zone.xMin) ||
    !isNum(zone.xMax) ||
    !isNum(zone.yMin) ||
    !isNum(zone.yMax)
  )
    return null;
  return x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax;
}