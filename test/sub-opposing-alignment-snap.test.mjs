// sub-opposing-alignment-snap.test.mjs
// Tests for the opposing-wall alignment snap logic.

import { test } from "node:test";
import assert from "node:assert/strict";

import { findOpposingAlignmentSnap } from "@/components/room/rv/utils/subOpposingAlignmentSnap";

// Room: 6 m wide × 8 m long. Sub dims: 0.50 × 0.30 m (w × d).
const W = 6;
const L = 8;
const getModelDimsM = () => ({ widthM: 0.5, depthM: 0.3 });
const draggedDims = { widthM: 0.5, depthM: 0.3 };

// Wall-proximity: deriveSubWallOrientation uses probe = max(halfW, halfD) + 0.15
// = 0.25 + 0.15 = 0.40. A sub at y=0.01 (front wall) is "front". A sub at y=7.99
// (rear wall) is "rear". Left wall: x=0.01. Right wall: x=5.99.

test("front-to-rear: dragged front sub snaps X to rear partner X", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, position: { x: 1.5, y: 0.01 } };
  // Candidate position: close to partner X (1.5) but 3 cm off
  const allPartners = [
    { id: "sub-rear-1", enabled: true, position: { x: 1.5, y: 7.99 } },
  ];
  const result = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM: W, lengthM: L,
    candidateX: 1.53, candidateY: 0.01,
    draggedDims, getModelDimsM,
  });
  assert.ok(result, "must return a snap");
  assert.equal(result.type, "opposing");
  assert.equal(result.axis, "x");
  assert.equal(result.snappedX, 1.5);
  assert.equal(result.snappedY, 0.01);
  assert.equal(result.partnerId, "sub-rear-1");
  assert.equal(result.draggedWall, "front");
  assert.equal(result.partnerWall, "rear");
});

test("rear-to-front: dragged rear sub snaps X to front partner X", () => {
  const draggedSub = { id: "sub-rear-1", enabled: true, position: { x: 1.5, y: 7.99 } };
  const allPartners = [
    { id: "sub-front-1", enabled: true, position: { x: 1.5, y: 0.01 } },
  ];
  const result = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM: W, lengthM: L,
    candidateX: 1.47, candidateY: 7.99,
    draggedDims, getModelDimsM,
  });
  assert.ok(result, "must return a snap");
  assert.equal(result.axis, "x");
  assert.equal(result.snappedX, 1.5);
  assert.equal(result.draggedWall, "rear");
  assert.equal(result.partnerWall, "front");
});

test("left-to-right: dragged left sub snaps Y to right partner Y", () => {
  const draggedSub = { id: "sub-left-1", enabled: true, position: { x: 0.01, y: 2.0 } };
  const allPartners = [
    { id: "sub-right-1", enabled: true, position: { x: 5.99, y: 2.0 } },
  ];
  const result = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM: W, lengthM: L,
    candidateX: 0.01, candidateY: 2.03,
    draggedDims, getModelDimsM,
  });
  assert.ok(result, "must return a snap");
  assert.equal(result.axis, "y");
  assert.equal(result.snappedY, 2.0);
  assert.equal(result.draggedWall, "left");
  assert.equal(result.partnerWall, "right");
});

test("right-to-left: dragged right sub snaps Y to left partner Y", () => {
  const draggedSub = { id: "sub-right-1", enabled: true, position: { x: 5.99, y: 2.0 } };
  const allPartners = [
    { id: "sub-left-1", enabled: true, position: { x: 0.01, y: 2.0 } },
  ];
  const result = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM: W, lengthM: L,
    candidateX: 5.99, candidateY: 1.97,
    draggedDims, getModelDimsM,
  });
  assert.ok(result, "must return a snap");
  assert.equal(result.axis, "y");
  assert.equal(result.snappedY, 2.0);
  assert.equal(result.draggedWall, "right");
  assert.equal(result.partnerWall, "left");
});

test("no snap when candidate is more than 5 cm from partner coordinate", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, position: { x: 1.5, y: 0.01 } };
  const allPartners = [
    { id: "sub-rear-1", enabled: true, position: { x: 1.5, y: 7.99 } },
  ];
  const result = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM: W, lengthM: L,
    candidateX: 1.56, candidateY: 0.01, // 6 cm off — exceeds 5 cm tolerance
    draggedDims, getModelDimsM,
  });
  assert.equal(result, null, "must not snap beyond 5 cm capture distance");
});

test("no snap when dragged sub is not near any wall", () => {
  const draggedSub = { id: "sub-mid-1", enabled: true, position: { x: 3.0, y: 4.0 } };
  const allPartners = [
    { id: "sub-rear-1", enabled: true, position: { x: 1.5, y: 7.99 } },
  ];
  const result = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM: W, lengthM: L,
    candidateX: 3.0, candidateY: 4.0,
    draggedDims, getModelDimsM,
  });
  assert.equal(result, null, "interior sub has no wall → no opposing snap");
});

test("no snap when partner is on a non-opposing wall", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, position: { x: 1.5, y: 0.01 } };
  // Partner is on the left wall, not the rear wall
  const allPartners = [
    { id: "sub-left-1", enabled: true, position: { x: 0.01, y: 4.0 } },
  ];
  const result = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM: W, lengthM: L,
    candidateX: 1.5, candidateY: 0.01,
    draggedDims, getModelDimsM,
  });
  assert.equal(result, null, "front sub does not oppose a left-wall sub");
});

test("disabled partners are ignored", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, position: { x: 1.5, y: 0.01 } };
  const allPartners = [
    { id: "sub-rear-1", enabled: false, position: { x: 1.5, y: 7.99 } },
  ];
  const result = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM: W, lengthM: L,
    candidateX: 1.5, candidateY: 0.01,
    draggedDims, getModelDimsM,
  });
  assert.equal(result, null, "disabled partner must be ignored");
});

test("picks the closest partner when multiple opposing partners exist", () => {
  const draggedSub = { id: "sub-front-1", enabled: true, position: { x: 1.5, y: 0.01 } };
  const allPartners = [
    { id: "sub-rear-1", enabled: true, position: { x: 1.53, y: 7.99 } }, // 3 cm away
    { id: "sub-rear-2", enabled: true, position: { x: 1.48, y: 7.99 } }, // 2 cm away — closer
  ];
  const result = findOpposingAlignmentSnap({
    draggedSub, allPartners, widthM: W, lengthM: L,
    candidateX: 1.5, candidateY: 0.01,
    draggedDims, getModelDimsM,
  });
  assert.ok(result, "must return a snap");
  assert.equal(result.partnerId, "sub-rear-2", "must pick the closer partner");
  assert.equal(result.snappedX, 1.48);
});