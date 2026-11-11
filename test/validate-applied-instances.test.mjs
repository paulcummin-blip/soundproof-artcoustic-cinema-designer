// validate-applied-instances.test.mjs
//
// Tests the shared validateAppliedInstances helper that the three actionable
// Apply paths (BassPostCalculationActions, Rp22PlacementRecommendation,
// BestSubLayoutGuide) now use. Verifies that the EXACT instances buildAppliedInstances
// produces are validated through the existing cabinet-boundary and cabinet-overlap
// authorities — each cabinet against its own model dimensions (mixed-model aware).

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateAppliedInstances } from "../src/components/room/bass/best-layout/validateAppliedInstances.js";

const ROOM = { widthM: 4.5, lengthM: 6.0 };

function sub(model, x, y, opts = {}) {
  return {
    id: `sub-${model}-${x}-${y}`,
    model,
    enabled: true,
    position: { x, y },
    bottomHeightM: opts.bottomHeightM ?? 0.05,
    rotationDeg: opts.rotationDeg ?? 0,
    gainDb: 0, delayMs: 0, polarity: 1,
    legacyGroup: opts.legacyGroup ?? "front",
  };
}

test("validateAppliedInstances: valid 1-sub layout passes", () => {
  const instances = [sub("SUB2-12", 2.25, 0.4)];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, true, result.reason);
});

test("validateAppliedInstances: valid 2-sub layout passes", () => {
  const instances = [
    sub("SUB2-12", 1.35, 0.4),
    sub("SUB2-12", 3.15, 0.4),
  ];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, true, result.reason);
});

test("validateAppliedInstances: valid 4-sub layout passes", () => {
  const instances = [
    sub("SUB2-12", 1.35, 0.4),
    sub("SUB2-12", 3.15, 0.4),
    sub("SUB2-12", 1.35, 5.6, { legacyGroup: "rear", rotationDeg: 180 }),
    sub("SUB2-12", 3.15, 5.6, { legacyGroup: "rear", rotationDeg: 180 }),
  ];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, true, result.reason);
});

test("validateAppliedInstances: known overlapping SUB2-12 pair is rejected", () => {
  // X=1.935 and 2.365 → 430 mm separation, but SUB2-12 cabinet is 500 mm wide.
  const instances = [
    sub("SUB2-12", 1.935, 0.1375),
    sub("SUB2-12", 2.365, 0.1375),
  ];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "Two subwoofers would physically overlap.");
});

test("validateAppliedInstances: moved-apart pair passes", () => {
  // Same pair moved apart to valid front-wall positions.
  const instances = [
    sub("SUB2-12", 1.35, 0.4),
    sub("SUB2-12", 3.15, 0.4),
  ];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, true, result.reason);
});

test("validateAppliedInstances: cabinet crossing front wall is rejected", () => {
  // SUB2-12 is 500 mm wide × 430 mm deep. Centre at y=0.1 → depth half=215 mm
  // crosses the front wall (y=0) with the standard wall buffer.
  const instances = [sub("SUB2-12", 2.25, 0.1)];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, false);
  assert.ok(result.reason.includes("does not fit inside the room"), result.reason);
});

test("validateAppliedInstances: missing model is rejected", () => {
  const instances = [{ ...sub("SUB2-12", 2.25, 0.4), model: "" }];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, false);
  assert.ok(result.reason.includes("no model"), result.reason);
});

test("validateAppliedInstances: missing coordinates are rejected", () => {
  const instances = [{ ...sub("SUB2-12", 2.25, 0.4), position: { x: NaN, y: 0.4 } }];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, false);
  assert.ok(result.reason.includes("missing coordinates"), result.reason);
});

test("validateAppliedInstances: mixed-model layout checks each cabinet's own dimensions", () => {
  // SUB3-12 is 600 mm wide. Two SUB3-12s at 500 mm X separation overlap.
  const instances = [
    sub("SUB3-12", 1.8, 0.4),
    sub("SUB3-12", 2.3, 0.4),
  ];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "Two subwoofers would physically overlap.");
});

test("validateAppliedInstances: mixed-model layout with adequate separation passes", () => {
  const instances = [
    sub("SUB2-12", 1.0, 0.4),
    sub("SUB3-12", 3.5, 0.4),
  ];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, true, result.reason);
});

test("validateAppliedInstances: disabled instances are ignored", () => {
  const instances = [
    sub("SUB2-12", 1.935, 0.1375),
    { ...sub("SUB2-12", 2.365, 0.1375), enabled: false },
  ];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, true, result.reason);
});

test("validateAppliedInstances: rotated side-wall cabinet is validated with correct axis", () => {
  // Left-wall cabinet: rotation 90 swaps width/depth for footprint check.
  const instances = [sub("SUB2-12", 0.3, 3.0, { rotationDeg: 90, legacyGroup: "left" })];
  const result = validateAppliedInstances(instances, ROOM);
  assert.equal(result.valid, true, result.reason);
});

test("validateAppliedInstances: empty enabled list is rejected", () => {
  const result = validateAppliedInstances([], ROOM);
  assert.equal(result.valid, false);
});

test("validateAppliedInstances: invalid room dimensions are rejected", () => {
  const instances = [sub("SUB2-12", 2.25, 0.4)];
  const result = validateAppliedInstances(instances, { widthM: 0, lengthM: 0 });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "Room dimensions are not valid.");
});