// sub-symmetry-snap-same-wall.test.mjs
// Tests for the same-wall symmetry snap with the same-wall fix and RSP metadata.

import { test } from "node:test";
import assert from "node:assert/strict";

import { findSymmetrySnap } from "@/components/room/rv/utils/subSymmetrySnap";

const W = 6;
const L = 8;
const getModelDimsM = () => ({ widthM: 0.5, depthM: 0.3 });
const draggedDims = { widthM: 0.5, depthM: 0.3 };

test("two front-wall subs: X-mirror across width centreline", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, position: { x: 1.5, y: 0.01 } };
  // Partner at x=4.5 → mirror is 6-4.5 = 1.5. Candidate at x=1.53 (3 cm off).
  const draftArray = [
    draggedSub,
    { id: "sub-front-2", enabled: true, position: { x: 4.5, y: 0.01 } },
  ];
  const result = findSymmetrySnap({
    draggedSub, draftArray, widthM: W, lengthM: L,
    candidateX: 1.53, candidateY: 0.01,
    draggedDims, getModelDimsM,
    rspPoint: { x: 3, y: 5 },
  });
  assert.ok(result, "must return a snap");
  assert.equal(result.type, "symmetry");
  assert.equal(result.axis, "x");
  assert.equal(result.snappedX, 1.5);
  assert.equal(result.snappedY, 0.01);
  assert.equal(result.partnerId, "sub-front-2");
  // RSP X is always W/2=3, so X-mirror equidistance is always true
  assert.equal(result.rspEquidistant, true);
  assert.equal(result.rspCentral, true);
});

test("two rear-wall subs: X-mirror across width centreline", () => {
  const draggedSub = { id: "sub-rear-1", enabled: true, position: { x: 1.5, y: 7.99 } };
  const draftArray = [
    draggedSub,
    { id: "sub-rear-2", enabled: true, position: { x: 4.5, y: 7.99 } },
  ];
  const result = findSymmetrySnap({
    draggedSub, draftArray, widthM: W, lengthM: L,
    candidateX: 1.53, candidateY: 7.99,
    draggedDims, getModelDimsM,
    rspPoint: { x: 3, y: 5 },
  });
  assert.ok(result, "must return a snap");
  assert.equal(result.axis, "x");
  assert.equal(result.snappedX, 1.5);
});

test("two left-wall subs: Y-mirror across length centreline, RSP central → equidistant", () => {
  const draggedSub = { id: "sub-left-1", enabled: true, position: { x: 0.01, y: 2.0 } };
  // Partner at y=6 → mirror is 8-6 = 2. Candidate at y=2.03 (3 cm off).
  const draftArray = [
    draggedSub,
    { id: "sub-left-2", enabled: true, position: { x: 0.01, y: 6.0 } },
  ];
  const result = findSymmetrySnap({
    draggedSub, draftArray, widthM: W, lengthM: L,
    candidateX: 0.01, candidateY: 2.03,
    draggedDims, getModelDimsM,
    rspPoint: { x: 3, y: 4.0 }, // RSP Y = L/2 → central
  });
  assert.ok(result, "must return a snap");
  assert.equal(result.axis, "y");
  assert.equal(result.snappedY, 2.0);
  assert.equal(result.rspEquidistant, true, "RSP at L/2 → equidistant");
  assert.equal(result.rspCentral, true);
});

test("two left-wall subs: RSP offset → NOT equidistant", () => {
  const draggedSub = { id: "sub-left-1", enabled: true, position: { x: 0.01, y: 2.0 } };
  const draftArray = [
    draggedSub,
    { id: "sub-left-2", enabled: true, position: { x: 0.01, y: 6.0 } },
  ];
  const result = findSymmetrySnap({
    draggedSub, draftArray, widthM: W, lengthM: L,
    candidateX: 0.01, candidateY: 2.03,
    draggedDims, getModelDimsM,
    rspPoint: { x: 3, y: 3.0 }, // RSP Y = 3.0, not L/2=4 → offset
  });
  assert.ok(result, "must return a snap (room symmetry still holds)");
  assert.equal(result.rspEquidistant, false, "RSP offset → NOT equidistant");
  assert.equal(result.rspCentral, false);
});

test("same-wall fix: front sub does NOT mirror against a rear-wall partner", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, position: { x: 1.5, y: 0.01 } };
  // Partner is on the REAR wall (y=7.99), not the same front wall.
  const draftArray = [
    draggedSub,
    { id: "sub-rear-1", enabled: true, position: { x: 4.5, y: 7.99 } },
  ];
  const result = findSymmetrySnap({
    draggedSub, draftArray, widthM: W, lengthM: L,
    candidateX: 1.53, candidateY: 0.01,
    draggedDims, getModelDimsM,
    rspPoint: { x: 3, y: 4 },
  });
  assert.equal(result, null, "front sub must NOT symmetry-snap to a rear-wall partner");
});

test("no snap beyond 5 cm capture distance", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, position: { x: 1.5, y: 0.01 } };
  const draftArray = [
    draggedSub,
    { id: "sub-front-2", enabled: true, position: { x: 4.5, y: 0.01 } },
  ];
  const result = findSymmetrySnap({
    draggedSub, draftArray, widthM: W, lengthM: L,
    candidateX: 1.57, candidateY: 0.01, // 7 cm off — exceeds 5 cm tolerance
    draggedDims, getModelDimsM,
    rspPoint: { x: 3, y: 4 },
  });
  assert.equal(result, null, "must not snap beyond 5 cm");
});

test("no snap when dragged sub is not near any wall (interior)", () => {
  const draggedSub = { id: "sub-mid", enabled: true, position: { x: 3.0, y: 4.0 } };
  const draftArray = [
    draggedSub,
    { id: "sub-front-2", enabled: true, position: { x: 4.5, y: 0.01 } },
  ];
  const result = findSymmetrySnap({
    draggedSub, draftArray, widthM: W, lengthM: L,
    candidateX: 3.0, candidateY: 4.0,
    draggedDims, getModelDimsM,
    rspPoint: { x: 3, y: 4 },
  });
  assert.equal(result, null, "interior sub has no wall → no symmetry snap");
});

test("deliberately asymmetrical: candidate far from mirror → no snap (free placement)", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, position: { x: 1.5, y: 0.01 } };
  const draftArray = [
    draggedSub,
    { id: "sub-front-2", enabled: true, position: { x: 4.5, y: 0.01 } },
  ];
  const result = findSymmetrySnap({
    draggedSub, draftArray, widthM: W, lengthM: L,
    candidateX: 2.5, candidateY: 0.01, // 1 m from mirror at 1.5 — way outside capture
    draggedDims, getModelDimsM,
    rspPoint: { x: 3, y: 4 },
  });
  assert.equal(result, null, "asymmetrical placement must not snap");
});