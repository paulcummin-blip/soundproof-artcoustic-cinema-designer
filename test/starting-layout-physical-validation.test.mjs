// starting-layout-physical-validation.test.mjs
//
// Regression tests for the fix to the "Use 2-sub layout" front-wall
// intersection defect. Two related corrections are locked in:
//
//   1. Fresh-layout generation: the advisor resolves cabinet half-extents
//      from the model Apply will use (default SUB2-12), even when no
//      subwoofers are installed — so getSubPlacementGuideCoordinates produces
//      a cabinet-aware front-wall centre (137.5 mm for SUB2-12), never the
//      nominal 100 mm inset a point-source assumption produces.
//
//   2. Apply safety: validateRecommendationLayout validates the FULL cabinet
//      footprint through the existing validateCabinetBoundary authority. A
//      recommendation whose centre lies inside the room but whose cabinet
//      crosses a wall is rejected before Apply can save it.
//
// Run: node --import ./test/_alias-register.mjs --test test/starting-layout-physical-validation.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { getSubPlacementGuideCoordinates } from "@/components/room/bass/best-layout/subPlacementGuideCoordinates";
import { subHalfExtents } from "@/components/room/rv/utils/subWallOrientation";
import { getCabinetWidthM, getCabinetDepthM } from "@/components/utils/subwooferInstanceMigration";
import { generateBestSubLayoutCandidateSet } from "@/components/room/bass/best-layout/bestSubLayoutCandidates";
import { validateRecommendationLayout } from "@/components/room/bass/best-layout/applyRecommendationUtils";
import { validateCabinetBoundary } from "@/components/room/bass/stage2/installableWallCentreAuthority";

// The disposable Test Data room that exposed the defect.
const ROOM = { widthM: 4.3, lengthM: 6.4, heightM: 2.6 };
const SUB2_12 = "SUB2-12";

// SUB2-12: 500 mm wide, 255 mm deep. At rotation 0 (front/rear wall), the
// cabinet half-extents along the room axes are halfX=250 mm, halfY=127.5 mm.
// The required front-wall centre is halfY + 10 mm clearance = 137.5 mm.
const SUB2_12_HALF_DEPTH_M = 0.1275;
const REQUIRED_FRONT_Y_M = SUB2_12_HALF_DEPTH_M + 0.01; // 0.1375

function sub2_12HalfExtents(rotationDeg) {
  return subHalfExtents(getCabinetWidthM(SUB2_12), getCabinetDepthM(SUB2_12), rotationDeg);
}

// ── 1. Fresh-layout generation: cabinet-aware guide coordinates ────────────

test("SUB2-12 guide front-wall centre is 137.5 mm, not the 100 mm nominal inset", () => {
  const halfExtents = sub2_12HalfExtents(0);
  const guide = getSubPlacementGuideCoordinates({
    widthM: ROOM.widthM,
    lengthM: ROOM.lengthM,
    cabinetHalfExtents: halfExtents,
  });
  assert.equal(guide.frontY, REQUIRED_FRONT_Y_M);
  assert.equal(guide.rearY, ROOM.lengthM - REQUIRED_FRONT_Y_M);
});

test("without cabinet extents the guide falls back to the 100 mm nominal inset (the defect source)", () => {
  const guide = getSubPlacementGuideCoordinates({
    widthM: ROOM.widthM,
    lengthM: ROOM.lengthM,
    cabinetHalfExtents: null,
  });
  // This is the value that produced the saved 27.5 mm overlap. It documents
  // WHY the advisor must receive extents — not a behaviour to preserve.
  assert.equal(guide.frontY, 0.1);
});

test("candidate generation with SUB2-12 extents produces physically valid front-wall centres", () => {
  const halfExtents = sub2_12HalfExtents(0);
  const { candidates } = generateBestSubLayoutCandidateSet(ROOM, { front: 0.05, rear: 0.05 }, [], halfExtents);
  assert.ok(candidates.length > 0, "candidates should be generated");
  for (const candidate of candidates) {
    for (const source of candidate.sources) {
      if (source.placement === "front") {
        assert.ok(
          source.y >= REQUIRED_FRONT_Y_M - 1e-9,
          `front source y=${source.y} should be >= ${REQUIRED_FRONT_Y_M}`,
        );
      }
      if (source.placement === "rear") {
        assert.ok(
          source.y <= ROOM.lengthM - REQUIRED_FRONT_Y_M + 1e-9,
          `rear source y=${source.y} should be <= ${ROOM.lengthM - REQUIRED_FRONT_Y_M}`,
        );
      }
    }
  }
});

test("1/2/4-sub starting layouts all keep the SUB2-12 cabinet inside the room", () => {
  const halfExtents = sub2_12HalfExtents(0);
  const { candidates } = generateBestSubLayoutCandidateSet(ROOM, { front: 0.05, rear: 0.05 }, [], halfExtents);
  for (const quantity of [1, 2, 4]) {
    const layout = candidates.find((c) => c.sources.length === quantity);
    assert.ok(layout, `a ${quantity}-sub candidate should exist`);
    const validation = validateRecommendationLayout(layout, ROOM, SUB2_12);
    assert.ok(validation.valid, `${quantity}-sub layout should be valid: ${validation.reason}`);
  }
});

// ── 2. Apply safety: full-cabinet boundary validation ──────────────────────

test("the saved defect (Y=100 mm SUB2-12) is rejected before Apply with a front-wall reason", () => {
  const layout = {
    sources: [
      { x: 1.075, y: 0.1, placement: "front" },
      { x: 3.225, y: 0.1, placement: "front" },
    ],
  };
  const result = validateRecommendationLayout(layout, ROOM, SUB2_12);
  assert.equal(result.valid, false);
  assert.match(result.reason, /front wall/i);
  assert.deepEqual(result.violations, ["front-wall-intersection"]);
});

test("a valid Y=137.5 mm SUB2-12 two-sub layout passes the full-cabinet check", () => {
  const layout = {
    sources: [
      { x: 1.075, y: REQUIRED_FRONT_Y_M, placement: "front" },
      { x: 3.225, y: REQUIRED_FRONT_Y_M, placement: "front" },
    ],
  };
  const result = validateRecommendationLayout(layout, ROOM, SUB2_12);
  assert.equal(result.valid, true);
  assert.equal(result.reason, null);
});

test("without a model the centre check still passes (backward compatibility)", () => {
  const layout = {
    sources: [
      { x: 1.075, y: 0.1, placement: "front" },
      { x: 3.225, y: 0.1, placement: "front" },
    ],
  };
  const result = validateRecommendationLayout(layout, ROOM);
  assert.equal(result.valid, true);
  assert.equal(result.reason, null);
});

// ── 3. Rotation and model changes ──────────────────────────────────────────

test("a left-wall SUB2-12 at rotation 90 needs x >= 137.5 mm (depth swaps to X)", () => {
  const halfExtents = sub2_12HalfExtents(90);
  // At rotation 90, halfX = halfD = 127.5 mm, so required left-wall centre is 137.5 mm.
  assert.equal(halfExtents.halfX, SUB2_12_HALF_DEPTH_M);

  const valid = {
    sources: [{ x: REQUIRED_FRONT_Y_M, y: 3.0, placement: "left", rotationDeg: 90 }],
  };
  assert.ok(validateRecommendationLayout(valid, ROOM, SUB2_12).valid);

  const invalid = {
    sources: [{ x: 0.1, y: 3.0, placement: "left", rotationDeg: 90 }],
  };
  const result = validateRecommendationLayout(invalid, ROOM, SUB2_12);
  assert.equal(result.valid, false);
  assert.match(result.reason, /left wall/i);
});

test("a right-wall SUB2-12 at rotation 270 is validated with the swapped footprint", () => {
  // subHalfExtents only swaps at rotation 90, but the validator normalises 270
  // to 90 so a right-wall cabinet's depth is checked along X.
  const valid = {
    sources: [{ x: ROOM.widthM - REQUIRED_FRONT_Y_M, y: 3.0, placement: "right", rotationDeg: 270 }],
  };
  assert.ok(validateRecommendationLayout(valid, ROOM, SUB2_12).valid);

  const invalid = {
    sources: [{ x: ROOM.widthM - 0.1, y: 3.0, placement: "right", rotationDeg: 270 }],
  };
  const result = validateRecommendationLayout(invalid, ROOM, SUB2_12);
  assert.equal(result.valid, false);
  assert.match(result.reason, /right wall/i);
});

test("SUB3-12 (600 mm wide, 255 mm deep) front-wall centre is also 137.5 mm", () => {
  const sub3 = "SUB3-12";
  const cabinetWidthM = getCabinetWidthM(sub3);
  const cabinetDepthM = getCabinetDepthM(sub3);
  assert.equal(cabinetWidthM, 0.6);
  assert.equal(cabinetDepthM, 0.255);
  const { halfY } = subHalfExtents(cabinetWidthM, cabinetDepthM, 0);
  assert.equal(halfY, SUB2_12_HALF_DEPTH_M);
  const layout = {
    sources: [{ x: ROOM.widthM / 2, y: REQUIRED_FRONT_Y_M, placement: "front" }],
  };
  assert.ok(validateRecommendationLayout(layout, ROOM, sub3).valid);
});

// ── 4. The physical authority is unchanged ─────────────────────────────────

test("validateCabinetBoundary still requires 137.5 mm for a SUB2-12 at the front wall", () => {
  const widthM = getCabinetWidthM(SUB2_12);
  const depthM = getCabinetDepthM(SUB2_12);
  const at100 = validateCabinetBoundary({
    centre: { x: 2.15, y: 0.1 },
    roomDims: ROOM,
    cabinetWidthM: widthM,
    cabinetDepthM: depthM,
  });
  assert.equal(at100.valid, false);
  assert.deepEqual(at100.violations, ["front-wall-intersection"]);

  const at1375 = validateCabinetBoundary({
    centre: { x: 2.15, y: REQUIRED_FRONT_Y_M },
    roomDims: ROOM,
    cabinetWidthM: widthM,
    cabinetDepthM: depthM,
  });
  assert.equal(at1375.valid, true);
});