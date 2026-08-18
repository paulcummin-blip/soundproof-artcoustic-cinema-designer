// subPlacementGuideCoordinates.js
//
// ONE canonical placement coordinate authority for subwoofer positioning.
// Consumed by BOTH:
//   - bestSubLayoutCandidates.js (Placement Guide candidate generation)
//   - useSubDragHandler.jsx (magnetic drag snapping)
//
// Resolves physically valid wall-centre positions using cabinet half-extents
// so a subwoofer centre is never placed inside a wall. Interior quarter /
// midpoint positions are pure room fractions and are cabinet-independent.

import { BEST_SUB_LAYOUT_CONSTANTS as C } from "./bestSubLayoutConstants";

const DEFAULT_CLEARANCE_M = 0.01; // 10 mm cabinet-to-wall clearance

/**
 * Compute recognised placement coordinates for the current room.
 *
 * Wall positions (frontY, rearY, leftX, rightX) resolve the physically valid
 * cabinet CENTRE position:
 *   leftX  = max(nominalInset, halfX + clearance)
 *   rightX = min(width - nominalInset, width - halfX - clearance)
 *   frontY = max(nominalInset, halfY + clearance)
 *   rearY  = min(length - nominalInset, length - halfY - clearance)
 *
 * When cabinetHalfExtents is omitted (candidate generation without a specific
 * cabinet), halfX/halfY default to 0 and wall positions fall back to the
 * nominal inset — matching the pre-existing recommendation behaviour.
 *
 * Interior positions (quarterX1, midX, quarterX3, quarterY1, midY, quarterY3)
 * are pure room fractions and are always cabinet-independent.
 *
 * @param {object} opts
 * @param {number} opts.widthM
 * @param {number} opts.lengthM
 * @param {{halfX:number, halfY:number}=} opts.cabinetHalfExtents
 * @param {number=} opts.wallClearance  - cabinet-to-wall clearance in metres
 * @returns {object|null} placement coordinates, or null if room is invalid
 */
export function getSubPlacementGuideCoordinates({
  widthM,
  lengthM,
  cabinetHalfExtents,
  wallClearance,
}) {
  const W = Number(widthM);
  const L = Number(lengthM);
  if (!Number.isFinite(W) || !Number.isFinite(L) || W <= 0 || L <= 0) return null;

  const nominalInset = Math.min(C.minimumWallClearanceM, W / 4, L / 4);
  const clearance = Number.isFinite(Number(wallClearance))
    ? Number(wallClearance)
    : DEFAULT_CLEARANCE_M;

  const halfX = Number.isFinite(cabinetHalfExtents?.halfX)
    ? Math.max(0, cabinetHalfExtents.halfX)
    : 0;
  const halfY = Number.isFinite(cabinetHalfExtents?.halfY)
    ? Math.max(0, cabinetHalfExtents.halfY)
    : 0;

  // Physical wall-centre limits: cabinet centre cannot be closer than
  // half-extent + clearance to any wall.
  const physicalLeftX = halfX + clearance;
  const physicalRightX = W - halfX - clearance;
  const physicalFrontY = halfY + clearance;
  const physicalRearY = L - halfY - clearance;

  // Resolve: the LARGER of nominal inset and physical limit wins for the
  // near wall; the SMALLER of (span - nominal) and physical limit wins for
  // the far wall. This guarantees the centre is both at-or-beyond the
  // nominal inset AND physically clear of the wall.
  const leftX = Math.max(nominalInset, physicalLeftX);
  const rightX = Math.min(W - nominalInset, physicalRightX);
  const frontY = Math.max(nominalInset, physicalFrontY);
  const rearY = Math.min(L - nominalInset, physicalRearY);

  // Interior positions — pure room fractions, cabinet-independent.
  const quarterX1 = W * 0.25;
  const midX = W * 0.5;
  const quarterX3 = W * 0.75;
  const quarterY1 = L * 0.25;
  const midY = L * 0.5;
  const quarterY3 = L * 0.75;

  return {
    frontY,
    rearY,
    leftX,
    rightX,
    quarterX1,
    midX,
    quarterX3,
    quarterY1,
    midY,
    quarterY3,
    nominalInset,
  };
}