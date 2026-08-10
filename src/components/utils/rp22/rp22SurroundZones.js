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
 * Rules (RP22 5.6.1, Figure 5-11):
 *   SIDE SURROUNDS (SL/SR):
 *     - Lateral side regions bounded by the room wall on the outside and the
 *       listening-area lateral edge (seatMinX / seatMaxX) on the inside.
 *     - Continue rearward to the back wall regardless of Surround Back.
 *     - Must avoid the directly-behind exclusion (rearward projection of the
 *       complete listening-area lateral footprint, y > listeningBackY).
 *     - May extend forward of the front row by up to 500mm (faded, P11-inside).
 *
 *   SURROUND BACK (SBL/SBR):
 *     - Must be positioned behind the rear line of the listening area.
 *     - Split at the listening-area centre (listeningCenterX), not room half-width.
 *     - Overlap in Y with the rearward lateral side regions (intentional).
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
    !isNum(bounds.listeningBackY) ||
    !isNum(bounds.seatMinX) ||
    !isNum(bounds.seatMaxX)
  ) {
    return {
      status: "indeterminate",
      sideLeft: null,
      sideRight: null,
      directlyBehindExclusion: null,
      backLeft: null,
      backRight: null,
      forwardExtremity: null,
      authorityBounds: null,
      listeningFrontY: null,
      listeningBackY: null,
      hasSurroundBack,
    };
  }

  // ── Canonical listening-area lateral bounds (RP22 Figure 5-11) ──
  // Use seatMinX/seatMaxX (complete listener-head envelope), NOT xLeft/xRight
  // (which are influenced by overhead-placement geometry).
  const listeningLeftX = bounds.seatMinX;
  const listeningRightX = bounds.seatMaxX;
  const listeningFrontY = bounds.listeningFrontY;
  const listeningBackY = bounds.listeningBackY;
  const listeningCenterX = (listeningLeftX + listeningRightX) / 2;

  // ── Room bounds (generic physical boundary handling) ──
  // 0.05 m is a generic room-geometry safety inset, NOT an RP22 rule.
  const WALL_INSET = 0.05;
  const FORWARD_EXTENSION = 0.500; // RP22 5.6.1: up to 500 mm forward of front row

  const roomLeftX = WALL_INSET;
  const roomRightX = Math.max(roomLeftX + 0.01, widthM - WALL_INSET);
  const roomFrontY = WALL_INSET;
  const roomRearY = Math.max(roomFrontY + 0.01, lengthM - WALL_INSET);

  // ── Forward extremity (RP22 5.6.1) ──
  const forwardExtremeY = Math.max(roomFrontY, listeningFrontY - FORWARD_EXTENSION);

  // ── Side envelopes (RP22 Figure 5-11 lateral side regions) ──
  // Continue rearward regardless of whether Surround Back speakers exist.
  // hasSurroundBack must NOT shorten the side envelopes.
  const sideLeft = {
    xMin: roomLeftX,
    xMax: listeningLeftX,
    yMin: forwardExtremeY,
    yMax: roomRearY,
    active: true,
  };

  const sideRight = {
    xMin: listeningRightX,
    xMax: roomRightX,
    yMin: forwardExtremeY,
    yMax: roomRearY,
    active: true,
  };

  // ── Directly-behind exclusion (RP22 "No Surround speakers here") ──
  // Rearward projection of the complete listening-area lateral footprint.
  // y > listeningBackY is the semantic condition (exclusive at the front edge).
  const directlyBehindExclusion = {
    xMin: listeningLeftX,
    xMax: listeningRightX,
    yMin: listeningBackY,
    yMax: roomRearY,
    active: true,
  };

  // ── Surround Back zones (behind listening-area rear line, split at center) ──
  // These overlap in Y with the rearward lateral side regions. That is
  // intentional — the distinction is lateral position, not a transverse handoff.
  const backLeft = {
    xMin: roomLeftX,
    xMax: listeningCenterX,
    yMin: listeningBackY,
    yMax: roomRearY,
    active: hasSurroundBack,
  };

  const backRight = {
    xMin: listeningCenterX,
    xMax: roomRightX,
    yMin: listeningBackY,
    yMax: roomRearY,
    active: hasSurroundBack,
  };

  // ── Forward extremity metadata (presentation only) ──
  // The complete 500 mm extremity is INSIDE for P11.
  const forwardExtremity = {
    yMin: forwardExtremeY,
    yMax: listeningFrontY,
    p11Inside: true,
    visualTreatment: "faded",
  };

  return {
    status: "ok",
    authorityBounds: {
      roomLeftX,
      roomRightX,
      roomFrontY,
      roomRearY,
      listeningLeftX,
      listeningRightX,
      listeningFrontY,
      listeningBackY,
      listeningCenterX,
      forwardExtremeY,
    },
    sideLeft,
    sideRight,
    directlyBehindExclusion,
    backLeft,
    backRight,
    forwardExtremity,
    listeningFrontY,
    listeningBackY,
    hasSurroundBack,
  };
}

/**
 * Test whether a point (x, y) is inside a rectangular zone (inclusive boundaries).
 * Returns:
 *   true  — point is inside the zone
 *   false — point is outside the zone
 *   null  — indeterminate (zone inactive or geometry invalid)
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

/**
 * Test whether a point (x, y) is inside the directly-behind exclusion.
 * The rear boundary uses y > listeningBackY (exclusive), so y == listeningBackY
 * does NOT count as behind.
 */
function isInsideDirectlyBehind(x, y, exclusion) {
  if (!exclusion || !exclusion.active) return false;
  if (!isNum(x) || !isNum(y)) return false;
  if (
    !isNum(exclusion.xMin) ||
    !isNum(exclusion.xMax) ||
    !isNum(exclusion.yMin) ||
    !isNum(exclusion.yMax)
  )
    return false;
  return (
    x >= exclusion.xMin &&
    x <= exclusion.xMax &&
    y > exclusion.yMin &&
    y <= exclusion.yMax
  );
}

/**
 * Canonical RP22 surround-zone membership for a specific role.
 * Handles side envelopes, directly-behind exclusion precedence, and
 * surround-back zones.
 *
 * Returns:
 *   true  — point is inside the canonical zone for this role
 *   false — point is outside the canonical zone for this role
 *   null  — indeterminate (zone inactive or geometry invalid)
 */
export function isInsideSurroundRole(x, y, role, zones) {
  if (!zones || zones.status !== "ok") return null;
  if (!isNum(x) || !isNum(y)) return null;

  const r = String(role || "").toUpperCase();

  if (r === "SL" || r === "SR") {
    const zone = r === "SL" ? zones.sideLeft : zones.sideRight;
    if (!zone || !zone.active) return null;

    const insideEnvelope = isInsideSurroundZone(x, y, zone);
    if (insideEnvelope === null) return null;

    // Directly-behind exclusion wins over side-envelope membership.
    if (
      insideEnvelope &&
      isInsideDirectlyBehind(x, y, zones.directlyBehindExclusion)
    ) {
      return false;
    }
    return insideEnvelope;
  }

  if (r === "SBL" || r === "SBR") {
    const zone = r === "SBL" ? zones.backLeft : zones.backRight;
    if (!zone || !zone.active) return null;
    return isInsideSurroundZone(x, y, zone);
  }

  return null;
}