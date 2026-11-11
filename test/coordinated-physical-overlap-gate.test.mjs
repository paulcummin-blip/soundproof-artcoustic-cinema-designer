// coordinated-physical-overlap-gate.test.mjs
//
// Phase 9B coordinated search: a retained placement whose cabinets physically
// overlap must be rejected BEFORE the seating-batch worker, with a stable
// `cabinet-overlap` reason recorded in diagnostics. It must never reach
// electronic optimisation, canonical confirmation, confirmedCandidates or
// physicalAlternativeEligible.
//
// This test exercises validateCandidateCabinets (the Phase 9B physical
// validation gate) directly with the exact known defect geometry, then
// verifies the gate reason is the one coordinatedPhysicalSearch records in
// diagnostics.rejected when a placement is excluded.
//
// Run: node --import ./test/_alias-register.mjs --test test/coordinated-physical-overlap-gate.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { validateCandidateCabinets } from "@/components/room/bass/stage2/physicalCandidateGeometry";

const ROOM = { widthM: 4.3, lengthM: 6.4, heightM: 2.6 };
const SUB2_12 = "SUB2-12";

// The exact known failure: two SUB2-12s at X=1.935 and 2.365 m, Y=0.1375 m,
// rotation 0°, bottom height 0.05 m.
const OVERLAPPING_PLACEMENT = {
  id: "practical-wall-front-5%",
  quantity: 2,
  coordinates: [
    { x: 1.935, y: 0.1375 },
    { x: 2.365, y: 0.1375 },
  ],
};

// The same pair moved far enough apart to avoid overlap.
const VALID_PLACEMENT = {
  id: "practical-wall-front-valid",
  quantity: 2,
  coordinates: [
    { x: 1.0, y: 0.1375 },
    { x: 3.3, y: 0.1375 },
  ],
};

test("Phase 9B gate rejects the known defect with cabinet-overlap reason", () => {
  const check = validateCandidateCabinets({
    coordinates: OVERLAPPING_PLACEMENT.coordinates,
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: 0.05,
  });
  assert.equal(check.valid, false);
  assert.equal(check.reason, "cabinet-overlap");
  assert.ok(check.overlapResult);
  assert.equal(check.overlapResult.valid, false);
});

test("Phase 9B gate accepts the same pair moved apart", () => {
  const check = validateCandidateCabinets({
    coordinates: VALID_PLACEMENT.coordinates,
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: 0.05,
  });
  assert.equal(check.valid, true);
});

test("Phase 9B gate rejects a cross-quantity (4-sub) overlapping placement", () => {
  const coords = [
    { x: 1.0, y: 0.1375 },
    { x: 1.3, y: 0.1375 }, // overlaps first (300 mm < 500 mm)
    { x: 3.0, y: ROOM.lengthM - 0.1375 },
    { x: 3.5, y: ROOM.lengthM - 0.1375 },
  ];
  const check = validateCandidateCabinets({
    coordinates: coords,
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: 0.05,
  });
  assert.equal(check.valid, false);
  assert.equal(check.reason, "cabinet-overlap");
});

test("Phase 9B gate rejects a cabinet that crosses a room wall (cabinet-boundary)", () => {
  const coords = [
    { x: 0.05, y: 0.1375 }, // crosses left wall (needs >= 0.26 m for 500 mm cabinet)
    { x: 3.3, y: 0.1375 },
  ];
  const check = validateCandidateCabinets({
    coordinates: coords,
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: 0.05,
  });
  assert.equal(check.valid, false);
  assert.equal(check.reason, "cabinet-boundary");
});

test("Phase 9B diagnostic entry shape: rejected placement records stage, reason and violations", () => {
  // Simulates the diagnostic entry coordinatedPhysicalSearch pushes when the
  // physical validation gate rejects a placement.
  const check = validateCandidateCabinets({
    coordinates: OVERLAPPING_PLACEMENT.coordinates,
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: 0.05,
  });
  const rejectedEntry = {
    stage: "physical-validation",
    placementId: OVERLAPPING_PLACEMENT.id,
    quantity: OVERLAPPING_PLACEMENT.quantity,
    coordinates: OVERLAPPING_PLACEMENT.coordinates,
    reason: check.reason,
    violations: check.violations,
  };
  assert.equal(rejectedEntry.stage, "physical-validation");
  assert.equal(rejectedEntry.reason, "cabinet-overlap");
  assert.ok(Array.isArray(rejectedEntry.violations));
  assert.equal(rejectedEntry.violations.length, 1);
  assert.equal(rejectedEntry.violations[0].reason, "cabinet-overlap");
});

test("Phase 9B gate with a 1-sub placement has no overlap to check and passes", () => {
  const check = validateCandidateCabinets({
    coordinates: [{ x: 2.15, y: 0.1375 }],
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: 0.05,
  });
  assert.equal(check.valid, true);
});

test("Phase 9B gate treats missing model as missing-geometry (never valid)", () => {
  const check = validateCandidateCabinets({
    coordinates: OVERLAPPING_PLACEMENT.coordinates,
    model: null,
    roomDims: ROOM,
    bottomHeightM: 0.05,
  });
  assert.equal(check.valid, false);
  assert.equal(check.reason, "missing-geometry");
});