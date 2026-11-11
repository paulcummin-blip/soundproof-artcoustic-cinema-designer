// Unit tests for the quantity-aware placement selection policy.
// Proves the cross-quantity retention property the spec requires: available
// practical 1-, 2- and 4-subwoofer finalists all get an opportunity to enter
// coordinated screening within the shared five-placement cap, and the
// installed quantity does not exhaust the cap before cross-quantity
// finalists are considered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectQuantityAwarePlacements } from "../src/components/room/bass/improveBassV2/coordinatedPlacementSelection.js";

const mkPlacement = (id, quantity, familyId, coords) => ({
  id,
  quantity,
  familyId,
  coordinates: coords,
});

// Coordinates are arrays of {x,y} per source.
const coordsA = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
const coordsB = [{ x: 5, y: 6 }, { x: 7, y: 8 }];
const coordsC = [{ x: 9, y: 10 }, { x: 11, y: 12 }];
const coordsD = [{ x: 13, y: 14 }, { x: 15, y: 16 }];
const coordsE = [{ x: 17, y: 18 }, { x: 19, y: 20 }];
const coordsF = [{ x: 21, y: 22 }, { x: 23, y: 24 }];
const coords1a = [{ x: 0.5, y: 2 }];
const coords1b = [{ x: 4.5, y: 4 }];
const coords4a = [{ x: 1, y: 1 }, { x: 1, y: 3 }, { x: 4, y: 1 }, { x: 4, y: 3 }];

test("Room D scenario: installed-qty=2 with 5 placements does not exhaust the cap before 4-sub finalists", () => {
  // Installed quantity 2 has 5 screened placements (symmetric, asymmetric,
  // individual). Without quantity-aware selection the cap is filled entirely
  // by 2-sub placements and the 4-sub finalists never enter screening.
  // Cross-quantity has 3 four-subwoofer finalists available.
  const buckets = {
    1: [],
    2: [
      mkPlacement("i2-a", 2, "symmetric", coordsA),
      mkPlacement("i2-b", 2, "asymmetric-pair", coordsB),
      mkPlacement("i2-c", 2, "individual", coordsC),
      mkPlacement("i2-d", 2, "symmetric-2", coordsD),
      mkPlacement("i2-e", 2, "asymmetric-2", coordsE),
    ],
    4: [
      mkPlacement("x4-a", 4, "distributed", coords4a),
      mkPlacement("x4-b", 4, "front-rear", [{ x: 1, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 1 }, { x: 2, y: 3 }]),
      mkPlacement("x4-c", 4, "side-mid", [{ x: 0.5, y: 1 }, { x: 0.5, y: 3 }, { x: 4.5, y: 1 }, { x: 4.5, y: 3 }]),
    ],
  };
  const result = selectQuantityAwarePlacements({
    buckets,
    installedQuantity: 2,
    max: 5,
    supportedQuantities: [1, 2, 4],
  });

  // The four-subwoofer quantity must be represented — at least one 4-sub
  // finalist retained within the cap.
  assert.ok(result.quantityCoverage[4] >= 1,
    `4-sub must be represented, got coverage ${result.quantityCoverage[4]}`);
  // The installed quantity must still be represented.
  assert.ok(result.quantityCoverage[2] >= 1,
    `2-sub (installed) must be represented, got coverage ${result.quantityCoverage[2]}`);
  // Total retained must not exceed the cap.
  assert.equal(result.retained.length, 5);
  // The three 4-sub finalists should not all be excluded — at least one is retained.
  const excludedIds = result.excludedByCap.map((p) => p.id);
  const retained4 = result.retained.filter((p) => p.quantity === 4);
  assert.ok(retained4.length >= 1, "at least one 4-sub finalist must be retained");
  // Some 2-sub placements must be excluded by the cap (they no longer dominate).
  assert.ok(excludedIds.some((id) => id.startsWith("i2-")),
    "some installed-qty placements must be excluded by the cap");
});

test("every available quantity is represented when cap >= number of quantities", () => {
  // Three quantities available, cap 5 — each must get at least one slot.
  const buckets = {
    1: [mkPlacement("x1-a", 1, "centre", coords1a)],
    2: [mkPlacement("x2-a", 2, "symmetric", coordsA)],
    4: [mkPlacement("x4-a", 4, "distributed", coords4a)],
  };
  const result = selectQuantityAwarePlacements({
    buckets,
    installedQuantity: 2,
    max: 5,
    supportedQuantities: [1, 2, 4],
  });
  assert.equal(result.retained.length, 3);
  assert.equal(result.quantityCoverage[1], 1);
  assert.equal(result.quantityCoverage[2], 1);
  assert.equal(result.quantityCoverage[4], 1);
  assert.deepEqual(result.missingQuantities, []);
});

test("installed quantity is represented but does not occupy every slot", () => {
  // Installed qty 2 has 6 placements, cross-qty has 1 and 4 each with 1.
  const buckets = {
    1: [mkPlacement("x1-a", 1, "centre", coords1a)],
    2: [
      mkPlacement("i2-a", 2, "symmetric", coordsA),
      mkPlacement("i2-b", 2, "asymmetric", coordsB),
      mkPlacement("i2-c", 2, "individual", coordsC),
      mkPlacement("i2-d", 2, "symmetric-2", coordsD),
      mkPlacement("i2-e", 2, "asymmetric-2", coordsE),
      mkPlacement("i2-f", 2, "individual-2", coordsF),
    ],
    4: [mkPlacement("x4-a", 4, "distributed", coords4a)],
  };
  const result = selectQuantityAwarePlacements({
    buckets,
    installedQuantity: 2,
    max: 5,
    supportedQuantities: [1, 2, 4],
  });
  // Installed qty 2 must be represented but not occupy all 5 slots.
  assert.ok(result.quantityCoverage[2] >= 1, "installed qty represented");
  assert.ok(result.quantityCoverage[2] < 5, "installed qty does not occupy every slot");
  // Cross-quantities must also be represented.
  assert.ok(result.quantityCoverage[1] >= 1, "qty 1 represented");
  assert.ok(result.quantityCoverage[4] >= 1, "qty 4 represented");
  assert.equal(result.retained.length, 5);
});

test("missing quantities are reported, not invented", () => {
  // Qty 1 has no finalists.
  const buckets = {
    1: [],
    2: [mkPlacement("i2-a", 2, "symmetric", coordsA)],
    4: [mkPlacement("x4-a", 4, "distributed", coords4a)],
  };
  const result = selectQuantityAwarePlacements({
    buckets,
    installedQuantity: 2,
    max: 5,
    supportedQuantities: [1, 2, 4],
  });
  assert.deepEqual(result.missingQuantities, [1]);
  assert.equal(result.quantityCoverage[1], 0);
  // Available count for qty 1 is 0, not fabricated.
  assert.equal(result.availableCounts[1], 0);
});

test("all quantities empty returns empty retained", () => {
  const buckets = { 1: [], 2: [], 4: [] };
  const result = selectQuantityAwarePlacements({
    buckets,
    installedQuantity: 2,
    max: 5,
    supportedQuantities: [1, 2, 4],
  });
  assert.equal(result.retained.length, 0);
  assert.deepEqual(result.missingQuantities, [1, 2, 4]);
});

test("family diversity within a quantity is preferred", () => {
  // Installed qty 2 has 3 placements all from the SAME family plus 1 from a
  // different family. The selection should prefer the different family in
  // the first round.
  const buckets = {
    1: [],
    2: [
      mkPlacement("i2-a", 2, "symmetric", coordsA),
      mkPlacement("i2-b", 2, "symmetric", coordsB),  // duplicate family
      mkPlacement("i2-c", 2, "symmetric", coordsC),  // duplicate family
      mkPlacement("i2-d", 2, "asymmetric", coordsD),  // different family
    ],
    4: [mkPlacement("x4-a", 4, "distributed", coords4a)],
  };
  const result = selectQuantityAwarePlacements({
    buckets,
    installedQuantity: 2,
    max: 5,
    supportedQuantities: [1, 2, 4],
  });
  const retained2 = result.retained.filter((p) => p.quantity === 2);
  const families = new Set(retained2.map((p) => p.familyId));
  // Should retain both families, not 3 copies of symmetric.
  assert.ok(families.has("symmetric"), "symmetric family retained");
  assert.ok(families.has("asymmetric"), "asymmetric family retained");
  assert.ok(retained2.length <= 2, "at most 2 retained for qty 2 (family diversity)");
});

test("excludedByCap records eligible placements cut by the cap", () => {
  // More eligible placements than the cap — the leftovers are excludedByCap.
  const buckets = {
    1: [],
    2: [
      mkPlacement("i2-a", 2, "symmetric", coordsA),
      mkPlacement("i2-b", 2, "asymmetric", coordsB),
      mkPlacement("i2-c", 2, "individual", coordsC),
      mkPlacement("i2-d", 2, "symmetric-2", coordsD),
    ],
    4: [
      mkPlacement("x4-a", 4, "distributed", coords4a),
      mkPlacement("x4-b", 4, "front-rear", [{ x: 1, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 1 }, { x: 2, y: 3 }]),
    ],
  };
  const result = selectQuantityAwarePlacements({
    buckets,
    installedQuantity: 2,
    max: 4,
    supportedQuantities: [1, 2, 4],
  });
  assert.equal(result.retained.length, 4);
  assert.ok(result.excludedByCap.length >= 1, "at least one placement excluded by cap");
  // Every excluded placement has a reason.
  for (const p of result.excludedByCap) {
    assert.ok(p.exclusionReason, `excluded placement ${p.id} has a reason`);
  }
  // Retained + excluded = total eligible.
  const totalEligible = (buckets[2].length) + (buckets[4].length);
  assert.equal(result.retained.length + result.excludedByCap.length, totalEligible);
});

test("availableCounts distinguish available from retained", () => {
  // Qty 4 has 3 available but only 1 retained (cap + diversity).
  const buckets = {
    1: [],
    2: [
      mkPlacement("i2-a", 2, "symmetric", coordsA),
      mkPlacement("i2-b", 2, "asymmetric", coordsB),
      mkPlacement("i2-c", 2, "individual", coordsC),
    ],
    4: [
      mkPlacement("x4-a", 4, "distributed", coords4a),
      mkPlacement("x4-b", 4, "front-rear", [{ x: 1, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 1 }, { x: 2, y: 3 }]),
      mkPlacement("x4-c", 4, "side-mid", [{ x: 0.5, y: 1 }, { x: 0.5, y: 3 }, { x: 4.5, y: 1 }, { x: 4.5, y: 3 }]),
    ],
  };
  const result = selectQuantityAwarePlacements({
    buckets,
    installedQuantity: 2,
    max: 5,
    supportedQuantities: [1, 2, 4],
  });
  assert.equal(result.availableCounts[4], 3, "3 four-sub finalists available");
  assert.ok(result.quantityCoverage[4] >= 1, "at least 1 retained");
  assert.ok(result.quantityCoverage[4] <= result.availableCounts[4],
    "retained <= available");
});

test("coordinate dedup prevents the same physical placement twice", () => {
  // Same coordinates in two buckets — only one is retained.
  const buckets = {
    1: [],
    2: [mkPlacement("i2-a", 2, "symmetric", coordsA)],
    4: [mkPlacement("x4-a", 4, "distributed", coordsA)],  // same coords
  };
  const result = selectQuantityAwarePlacements({
    buckets,
    installedQuantity: 2,
    max: 5,
    supportedQuantities: [1, 2, 4],
  });
  assert.equal(result.retained.length, 1, "duplicate coords deduped");
  // The other is excluded as a coord_duplicate.
  assert.ok(result.excludedByCap.length >= 1, "duplicate excluded");
});