// sub-snap-merge.test.mjs
// Integration tests for the merged snapping behavior in useSubDragHandler.
//
// Verifies that wall lock (perpendicular) and subwoofer alignment (along-wall)
// operate simultaneously, that both guides are reported, and that manual
// asymmetrical placement remains possible.
//
// These tests call the pure snap functions the same way the handler does and
// replicate the merge logic to assert the combined result.

import { test } from "node:test";
import assert from "node:assert/strict";

import { findOpposingAlignmentSnap } from "@/components/room/rv/utils/subOpposingAlignmentSnap";
import { findSymmetrySnap } from "@/components/room/rv/utils/subSymmetrySnap";
import { findCoordinateSnap } from "@/components/room/rv/utils/subCoordinateSnap";
import { getSubPlacementGuideCoordinates } from "@/components/room/bass/best-layout/subPlacementGuideCoordinates";
import { deriveSubWallOrientation, subHalfExtents } from "@/components/room/rv/utils/subWallOrientation";

// Room: 6 m wide × 8 m long. Sub: 0.50 × 0.30 m (w × d).
const W = 6;
const L = 8;
const getModelDimsM = () => ({ widthM: 0.5, depthM: 0.3 });
const draggedDims = { widthM: 0.5, depthM: 0.3 };
const EPS = 0.01;

// Replicates the merge logic from useSubDragHandler.
function mergeSnaps({
  clampedX, clampedY, widthM, lengthM, w, d,
  draftFrontSubs, draftRearSubs, draggedSub, draftArray, rspPoint, scale = 100,
}) {
  const _ext = subHalfExtents(w, d,
    deriveSubWallOrientation({ x: clampedX, y: clampedY, widthM, lengthM, subWidthM: w, subDepthM: d }).rotationDeg);

  const guideCoordinates = getSubPlacementGuideCoordinates({
    widthM, lengthM, cabinetHalfExtents: _ext, wallClearance: EPS,
  });

  const toleranceM = Math.max(0.02, Math.min(0.15, 8 / scale));

  const coordSnap = guideCoordinates
    ? findCoordinateSnap({ candidateX: clampedX, candidateY: clampedY, guideCoordinates, toleranceM })
    : null;

  const allPartners = [
    ...(draftFrontSubs || []),
    ...(draftRearSubs || []),
  ];

  const opposingResult = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM, lengthM,
    candidateX: clampedX, candidateY: clampedY,
    draggedDims: { widthM: w, depthM: d }, getModelDimsM,
  });

  const symResult = findSymmetrySnap({
    draggedSub, draftArray, widthM, lengthM,
    candidateX: clampedX, candidateY: clampedY,
    draggedDims: { widthM: w, depthM: d }, getModelDimsM, rspPoint,
  });

  let snapX = clampedX;
  let snapY = clampedY;

  if (coordSnap) {
    if (coordSnap.snapX !== null) snapX = coordSnap.snapX;
    if (coordSnap.snapY !== null) snapY = coordSnap.snapY;
  }

  const draggedWall = deriveSubWallOrientation({
    x: clampedX, y: clampedY, widthM, lengthM, subWidthM: w, subDepthM: d,
  }).wall;
  const alongAxis = (draggedWall === "front" || draggedWall === "rear") ? "x" : "y";

  let chosenSub = null;
  let chosenDist = Infinity;
  if (opposingResult) {
    const dist = alongAxis === "x"
      ? Math.abs(clampedX - opposingResult.snappedX)
      : Math.abs(clampedY - opposingResult.snappedY);
    if (dist < chosenDist) { chosenSub = opposingResult; chosenDist = dist; }
  }
  if (symResult) {
    const dist = alongAxis === "x"
      ? Math.abs(clampedX - symResult.snappedX)
      : Math.abs(clampedY - symResult.snappedY);
    if (dist < chosenDist) { chosenSub = symResult; chosenDist = dist; }
  }

  if (chosenSub) {
    if (alongAxis === "x" && Number.isFinite(chosenSub.snappedX)) {
      snapX = chosenSub.snappedX;
    } else if (alongAxis === "y" && Number.isFinite(chosenSub.snappedY)) {
      snapY = chosenSub.snappedY;
    }
  }

  return { snapX, snapY, opposingResult, symResult, coordSnap };
}

// ── Test 1: Front sub dragged along wall — opposing alignment + wall lock ──

test("front sub along wall: wall lock (Y) + opposing alignment (X) simultaneously", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, model: "SUB", position: { x: 1.5, y: 0.01 } };
  const draftFrontSubs = [
    draggedSub,
  ];
  const draftRearSubs = [
    { id: "sub-rear-1", enabled: true, model: "SUB", position: { x: 1.5, y: 7.99 } },
  ];

  // Dragged to X=1.53 (3 cm from partner X=1.5), Y at wall.
  const result = mergeSnaps({
    clampedX: 1.53, clampedY: 0.16, // near front wall
    widthM: W, lengthM: L, w: 0.5, d: 0.3,
    draftFrontSubs, draftRearSubs,
    draggedSub, draftArray: draftFrontSubs,
    rspPoint: { x: 3, y: 5 },
  });

  // Opposing snap fires (X within 5 cm of partner).
  assert.ok(result.opposingResult, "opposing snap must fire");
  // Coordinate snap fires (Y near front wall).
  assert.ok(result.coordSnap, "coordinate snap must fire (wall lock)");
  // X is snapped to partner X (opposing overrides along-wall).
  assert.equal(result.snapX, 1.5, "X snapped to opposing partner");
  // Y is snapped to wall (coordinate wall lock).
  assert.ok(Math.abs(result.snapY - result.coordSnap.snapY) < 1e-9, "Y snapped to wall lock");
});

// ── Test 2: Same-wall symmetry along the wall ──

test("front sub along wall: same-wall symmetry (X) + wall lock (Y) simultaneously", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, model: "SUB", position: { x: 1.5, y: 0.16 } };
  const draftFrontSubs = [
    draggedSub,
    { id: "sub-front-2", enabled: true, model: "SUB", position: { x: 4.5, y: 0.16 } },
  ];

  // Mirror of 4.5 across W=6 is 1.5. Dragged to X=1.53 (3 cm from mirror).
  const result = mergeSnaps({
    clampedX: 1.53, clampedY: 0.16,
    widthM: W, lengthM: L, w: 0.5, d: 0.3,
    draftFrontSubs, draftRearSubs: [],
    draggedSub, draftArray: draftFrontSubs,
    rspPoint: { x: 3, y: 5 },
  });

  assert.ok(result.symResult, "symmetry snap must fire");
  assert.ok(result.coordSnap, "coordinate snap (wall lock) must fire");
  assert.equal(result.snapX, 1.5, "X snapped to mirrored position");
  assert.ok(Math.abs(result.snapY - result.coordSnap.snapY) < 1e-9, "Y snapped to wall");
});

// ── Test 3: Both opposing + symmetry simultaneously (four-sub arrangement) ──

test("four-sub arrangement: both opposing and symmetry fire simultaneously", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, model: "SUB", position: { x: 1.5, y: 0.16 } };
  const draftFrontSubs = [
    draggedSub,
    { id: "sub-front-2", enabled: true, model: "SUB", position: { x: 4.5, y: 0.16 } },
  ];
  const draftRearSubs = [
    { id: "sub-rear-1", enabled: true, model: "SUB", position: { x: 1.5, y: 7.84 } },
    { id: "sub-rear-2", enabled: true, model: "SUB", position: { x: 4.5, y: 7.84 } },
  ];

  // Drag front-left sub to X=1.53 (3 cm from both targets: opposing rear X=1.5
  // and symmetry mirror X=1.5 — they agree in a symmetric arrangement).
  const result = mergeSnaps({
    clampedX: 1.53, clampedY: 0.16,
    widthM: W, lengthM: L, w: 0.5, d: 0.3,
    draftFrontSubs, draftRearSubs,
    draggedSub, draftArray: draftFrontSubs,
    rspPoint: { x: 3, y: 5 },
  });

  // BOTH snaps fire — both guides can render.
  assert.ok(result.opposingResult, "opposing snap fires (front-to-rear)");
  assert.ok(result.symResult, "symmetry snap fires (front-to-front)");
  assert.ok(result.coordSnap, "wall lock fires");
  // Applied X = 1.5 (both agree).
  assert.equal(result.snapX, 1.5, "X snapped to the agreed target");
  assert.ok(Math.abs(result.snapY - result.coordSnap.snapY) < 1e-9, "Y at wall lock");
});

// ── Test 4: Disagreeing targets — closest wins, both guides show independently ──

test("disagreeing targets: both fire but closest wins position", () => {
  // Front-left at X=1.5. Opposing rear at X=1.0. Symmetry mirror of front-right
  // (4.5) is 1.5. So opposing target = 1.0, symmetry target = 1.5.
  const draggedSub = { id: "sub-front-1", enabled: true, model: "SUB", position: { x: 1.5, y: 0.16 } };
  const draftFrontSubs = [
    draggedSub,
    { id: "sub-front-2", enabled: true, model: "SUB", position: { x: 4.5, y: 0.16 } },
  ];
  const draftRearSubs = [
    { id: "sub-rear-1", enabled: true, model: "SUB", position: { x: 1.0, y: 7.84 } },
  ];

  // Drag to X=1.02 (2 cm from opposing 1.0, 48 cm from symmetry 1.5).
  // Opposing fires (2 cm < 5 cm). Symmetry does NOT fire (48 cm > 5 cm).
  const result = mergeSnaps({
    clampedX: 1.02, clampedY: 0.16,
    widthM: W, lengthM: L, w: 0.5, d: 0.3,
    draftFrontSubs, draftRearSubs,
    draggedSub, draftArray: draftFrontSubs,
    rspPoint: { x: 3, y: 5 },
  });

  assert.ok(result.opposingResult, "opposing fires (within 5 cm)");
  assert.equal(result.symResult, null, "symmetry does NOT fire (48 cm away)");
  assert.equal(result.snapX, 1.0, "X snapped to opposing target (closest)");
});

// ── Test 5: Manual asymmetrical placement remains possible ──

test("deliberately asymmetrical: no sub snap fires, coordinate snap only", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, model: "SUB", position: { x: 1.5, y: 0.16 } };
  const draftFrontSubs = [
    draggedSub,
    { id: "sub-front-2", enabled: true, model: "SUB", position: { x: 4.5, y: 0.16 } },
  ];
  const draftRearSubs = [
    { id: "sub-rear-1", enabled: true, model: "SUB", position: { x: 1.5, y: 7.84 } },
  ];

  // Drag to X=2.5 (1 m from mirror 1.5, 1 m from opposing 1.5 — way outside 5 cm).
  const result = mergeSnaps({
    clampedX: 2.5, clampedY: 0.16,
    widthM: W, lengthM: L, w: 0.5, d: 0.3,
    draftFrontSubs, draftRearSubs,
    draggedSub, draftArray: draftFrontSubs,
    rspPoint: { x: 3, y: 5 },
  });

  assert.equal(result.opposingResult, null, "no opposing snap");
  assert.equal(result.symResult, null, "no symmetry snap");
  // X stays at 2.5 (no sub snap override). Coordinate snap may fire on X if near
  // a guide position (2.5 is not quarter/midpoint for W=6 → quarter=1.5, mid=3,
  // quarter3=4.5). So X stays at 2.5.
  assert.equal(result.snapX, 2.5, "X unchanged — manual placement preserved");
});

// ── Test 6: 10 mm wall clearance maintained ──

test("wall lock: snapped Y maintains 10 mm clearance (halfY + EPS)", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, model: "SUB", position: { x: 3, y: 0.16 } };
  const draftFrontSubs = [draggedSub];
  const draftRearSubs = [];

  const result = mergeSnaps({
    clampedX: 3, clampedY: 0.16,
    widthM: W, lengthM: L, w: 0.5, d: 0.3,
    draftFrontSubs, draftRearSubs,
    draggedSub, draftArray: draftFrontSubs,
    rspPoint: { x: 3, y: 5 },
  });

  assert.ok(result.coordSnap, "coordinate snap fires at wall");
  // frontY = max(nominalInset, halfY + clearance). halfY for 0° rotation = d/2 = 0.15.
  // clearance = 0.01. So physicalFrontY = 0.15 + 0.01 = 0.16.
  // nominalInset = min(BEST_SUB_LAYOUT_CONSTANTS.minimumWallClearanceM, ...).
  // The snapped Y must be >= 0.16 (halfY + EPS).
  assert.ok(result.snapY >= 0.16 - 1e-9, "Y maintains 10 mm clearance");
});

// ── Test 7: Side wall — opposing alignment on Y axis + wall lock on X ──

test("left-wall sub: wall lock (X) + opposing alignment (Y) simultaneously", () => {
  const draggedSub = { id: "sub-left-1", enabled: true, model: "SUB", position: { x: 0.16, y: 2.0 } };
  const draftFrontSubs = [];
  const draftRearSubs = [];
  // For side-wall subs, they'd be in the front/rear arrays by current architecture,
  // but the merge uses allPartners from both arrays. Place the right-wall partner.
  const allPartners = [
    { id: "sub-right-1", enabled: true, model: "SUB", position: { x: 5.84, y: 2.0 } },
  ];

  // We need to test with the direct snap since side-wall subs may be in
  // draftFrontSubs in the real architecture. Test the opposing snap directly.
  const opposing = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM: W, lengthM: L,
    candidateX: 0.16, candidateY: 2.03,
    draggedDims, getModelDimsM,
  });

  assert.ok(opposing, "opposing snap fires for side-wall sub");
  assert.equal(opposing.axis, "y", "left↔right aligns Y");
  assert.equal(opposing.snappedY, 2.0, "Y snapped to partner Y");
  assert.equal(opposing.snappedX, 0.16, "X unchanged (wall lock preserved)");
});

// ── Test 8: subSnapState reports all three independently ──

test("subSnapState shape: { opposing, symmetry, coordinate } reported independently", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, model: "SUB", position: { x: 1.5, y: 0.16 } };
  const draftFrontSubs = [
    draggedSub,
    { id: "sub-front-2", enabled: true, model: "SUB", position: { x: 4.5, y: 0.16 } },
  ];
  const draftRearSubs = [
    { id: "sub-rear-1", enabled: true, model: "SUB", position: { x: 1.5, y: 7.84 } },
  ];

  const result = mergeSnaps({
    clampedX: 1.53, clampedY: 0.16,
    widthM: W, lengthM: L, w: 0.5, d: 0.3,
    draftFrontSubs, draftRearSubs,
    draggedSub, draftArray: draftFrontSubs,
    rspPoint: { x: 3, y: 5 },
  });

  // The handler reports { opposing, symmetry, coordinate } — each guide reads
  // its own key. All three can be non-null simultaneously.
  assert.ok(result.opposingResult, "opposing key present");
  assert.ok(result.symResult, "symmetry key present");
  assert.ok(result.coordSnap, "coordinate key present");
  assert.equal(result.opposingResult.type, "opposing");
  assert.equal(result.symResult.type, "symmetry");
  assert.equal(result.coordSnap.type, "coordinate");
});