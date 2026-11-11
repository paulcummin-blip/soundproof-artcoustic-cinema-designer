// cabinet-overlap-safety-gate.test.mjs
//
// Regression tests for the cabinet-overlap safety defect: two SUB2-12
// cabinets at X=1.935 m and X=2.365 m (430 mm centre separation) produced a
// genuine 70 mm cabinet overlap and were presented as a valid Bass ADI
// recommendation.
//
// These tests lock in the fix across all three physical-recommendation paths:
//   1. validateRecommendationLayout (Starting Layouts Apply gate)
//   2. validateCandidateSet (V2 placement generation)
//   3. validateCandidateCabinets (Phase 9B physical validation gate)
//
// Run: node --import ./test/_alias-register.mjs --test test/cabinet-overlap-safety-gate.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { validateRecommendationLayout } from "@/components/room/bass/best-layout/applyRecommendationUtils";
import { validateCandidateSet } from "@/components/room/bass/improveBassV2/positionCandidateGenerator";
import { validateCandidateCabinets, buildOverlapSources } from "@/components/room/bass/stage2/physicalCandidateGeometry";
import { validateCabinetOverlap } from "@/components/room/bass/stage2/installableWallCentreAuthority";
import { getCabinetWidthM, getCabinetDepthM, getCabinetHeightM } from "@/components/utils/subwooferInstanceMigration";
import { subHalfExtents } from "@/components/room/rv/utils/subWallOrientation";

// The disposable Test Data room that exposed the defect.
const ROOM = { widthM: 4.3, lengthM: 6.4, heightM: 2.6 };
const SUB2_12 = "SUB2-12";
const SUB3_12 = "SUB3-12";

// The exact known failure: two SUB2-12s at X=1.935 and 2.365 m, Y=0.1375 m,
// rotation 0°, bottom height 0.05 m. 430 mm centre separation, 500 mm cabinets
// → 70 mm cabinet overlap.
const DEFECT_COORDS = [
  { x: 1.935, y: 0.1375, rotationDeg: 0 },
  { x: 2.365, y: 0.1375, rotationDeg: 0 },
];
const DEFECT_BOTTOM_HEIGHT_M = 0.05;

// ── 1. The existing authority rejects the known defect ──────────────────────

test("validateCabinetOverlap rejects the exact known defect (430 mm separation, 500 mm cabinets)", () => {
  const cabinetWidthM = getCabinetWidthM(SUB2_12);
  const cabinetDepthM = getCabinetDepthM(SUB2_12);
  const cabinetHeightM = getCabinetHeightM(SUB2_12);
  assert.equal(cabinetWidthM, 0.5);
  const centreZ = DEFECT_BOTTOM_HEIGHT_M + cabinetHeightM / 2;
  const sources = DEFECT_COORDS.map((c) => ({
    x: c.x, y: c.y, z: centreZ,
    cabinetWidthM, cabinetDepthM, cabinetHeightM,
  }));
  const result = validateCabinetOverlap({ sources });
  assert.equal(result.valid, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].reason, "cabinet-overlap");
  // X separation 0.43 m < 0.5 m required → 70 mm overlap
  assert.ok(result.violations[0].centreDistanceM.x < result.violations[0].minSeparationM.x);
});

// ── 2. The shared helper (validateCandidateCabinets) ─────────────────────────

test("validateCandidateCabinets rejects the exact known defect with cabinet-overlap reason", () => {
  const result = validateCandidateCabinets({
    coordinates: DEFECT_COORDS,
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: DEFECT_BOTTOM_HEIGHT_M,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "cabinet-overlap");
  assert.ok(result.overlapResult);
  assert.equal(result.overlapResult.valid, false);
});

test("the same pair moved far enough apart passes", () => {
  const coords = [
    { x: 1.0, y: 0.1375, rotationDeg: 0 },
    { x: 3.3, y: 0.1375, rotationDeg: 0 },
  ];
  const result = validateCandidateCabinets({
    coordinates: coords,
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: DEFECT_BOTTOM_HEIGHT_M,
  });
  assert.equal(result.valid, true, `expected valid, got ${result.reason}`);
});

test("rotated cabinets with correct orientation-adjusted extents are validated", () => {
  // Two SUB2-12s on the left wall, rotated 90°, separated along Y.
  // At rotation 90, effective width along X = depth (255 mm), so they can sit
  // closer in X without overlapping.
  const cabinetWidthM = getCabinetWidthM(SUB2_12);
  const cabinetDepthM = getCabinetDepthM(SUB2_12);
  const { halfX } = subHalfExtents(cabinetWidthM, cabinetDepthM, 90);
  const leftWallX = halfX + 0.02; // just clear of the left wall
  const validCoords = [
    { x: leftWallX, y: 2.0, rotationDeg: 90 },
    { x: leftWallX, y: 4.0, rotationDeg: 90 },
  ];
  const result = validateCandidateCabinets({
    coordinates: validCoords,
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: DEFECT_BOTTOM_HEIGHT_M,
  });
  assert.equal(result.valid, true, `expected valid, got ${result.reason}`);
});

test("rotated cabinets that overlap in X are rejected", () => {
  const leftWallX = 0.15;
  const overlapping = [
    { x: leftWallX, y: 3.0, rotationDeg: 90 },
    { x: leftWallX, y: 3.0, rotationDeg: 90 },
  ];
  const result = validateCandidateCabinets({
    coordinates: overlapping,
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: DEFECT_BOTTOM_HEIGHT_M,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "cabinet-overlap");
});

test("different cabinet models and mixed dimensions are validated", () => {
  // SUB3-12 is 600 mm wide. Two of them need 600 mm centre separation.
  const coords = [
    { x: 1.0, y: 0.1375, rotationDeg: 0 },
    { x: 1.5, y: 0.1375, rotationDeg: 0 },
  ];
  const result = validateCandidateCabinets({
    coordinates: coords,
    model: SUB3_12,
    roomDims: ROOM,
    bottomHeightM: DEFECT_BOTTOM_HEIGHT_M,
  });
  // 500 mm separation < 600 mm required → overlap
  assert.equal(result.valid, false);
  assert.equal(result.reason, "cabinet-overlap");
});

test("cabinets at different heights without vertical overlap are not flagged", () => {
  // The authority checks Z overlap. Two cabinets at the same X/Y but very
  // different heights should not overlap if their Z ranges don't intersect.
  // buildOverlapSources uses a uniform bottom height; to test vertical
  // separation we call validateCabinetOverlap directly with manual Z.
  const cabinetHeightM = getCabinetHeightM(SUB2_12);
  const sources = [
    { x: 2.0, y: 2.0, z: 0 + cabinetHeightM / 2, cabinetWidthM: 0.5, cabinetDepthM: 0.255, cabinetHeightM },
    { x: 2.0, y: 2.0, z: 2.0 + cabinetHeightM / 2, cabinetWidthM: 0.5, cabinetDepthM: 0.255, cabinetHeightM },
  ];
  const result = validateCabinetOverlap({ sources });
  assert.equal(result.valid, true, "cabinets at different heights should not overlap");
});

test("cabinets at the same height with vertical overlap ARE flagged", () => {
  const cabinetHeightM = getCabinetHeightM(SUB2_12);
  const sources = [
    { x: 2.0, y: 2.0, z: 0.05 + cabinetHeightM / 2, cabinetWidthM: 0.5, cabinetDepthM: 0.255, cabinetHeightM },
    { x: 2.0, y: 2.0, z: 0.05 + cabinetHeightM / 2, cabinetWidthM: 0.5, cabinetDepthM: 0.255, cabinetHeightM },
  ];
  const result = validateCabinetOverlap({ sources });
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].reason, "cabinet-overlap");
});

test("one-subwoofer configuration always passes overlap (no pairs)", () => {
  const result = validateCandidateCabinets({
    coordinates: [{ x: 2.15, y: 0.1375, rotationDeg: 0 }],
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: DEFECT_BOTTOM_HEIGHT_M,
  });
  assert.equal(result.valid, true);
});

test("four-subwoofer configuration with an overlapping pair is rejected", () => {
  const coords = [
    { x: 1.0, y: 0.1375, rotationDeg: 0 },
    { x: 1.3, y: 0.1375, rotationDeg: 0 }, // overlaps with first (300 mm < 500 mm)
    { x: 3.0, y: ROOM.lengthM - 0.1375, rotationDeg: 0 },
    { x: 3.5, y: ROOM.lengthM - 0.1375, rotationDeg: 0 },
  ];
  const result = validateCandidateCabinets({
    coordinates: coords,
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: DEFECT_BOTTOM_HEIGHT_M,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "cabinet-overlap");
});

test("missing model is rejected as missing-geometry, not treated as valid", () => {
  const result = validateCandidateCabinets({
    coordinates: DEFECT_COORDS,
    model: null,
    roomDims: ROOM,
    bottomHeightM: DEFECT_BOTTOM_HEIGHT_M,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "missing-geometry");
});

test("empty coordinates are rejected", () => {
  const result = validateCandidateCabinets({
    coordinates: [],
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: DEFECT_BOTTOM_HEIGHT_M,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "missing-geometry");
});

test("non-finite coordinates are rejected", () => {
  const result = validateCandidateCabinets({
    coordinates: [{ x: NaN, y: 0.1375 }, { x: 2.0, y: 0.1375 }],
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: DEFECT_BOTTOM_HEIGHT_M,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "missing-geometry");
});

// ── 3. Starting Layouts Apply gate (validateRecommendationLayout) ──────────

test("Starting Layout Apply rejects the known defect before saving", () => {
  const layout = {
    sources: [
      { x: 1.935, y: 0.1375, placement: "front", rotationDeg: 0 },
      { x: 2.365, y: 0.1375, placement: "front", rotationDeg: 0 },
    ],
  };
  const result = validateRecommendationLayout(layout, ROOM, SUB2_12);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "Two subwoofers would physically overlap.");
});

test("Starting Layout Apply accepts the same pair moved apart", () => {
  const layout = {
    sources: [
      { x: 1.0, y: 0.1375, placement: "front", rotationDeg: 0 },
      { x: 3.3, y: 0.1375, placement: "front", rotationDeg: 0 },
    ],
  };
  const result = validateRecommendationLayout(layout, ROOM, SUB2_12);
  assert.equal(result.valid, true);
});

test("Starting Layout Apply without a model preserves backward compatibility (centre check only)", () => {
  const layout = {
    sources: [
      { x: 1.935, y: 0.1375, placement: "front", rotationDeg: 0 },
      { x: 2.365, y: 0.1375, placement: "front", rotationDeg: 0 },
    ],
  };
  const result = validateRecommendationLayout(layout, ROOM);
  assert.equal(result.valid, true);
  assert.equal(result.reason, null);
});

// ── 4. V2 placement generation (validateCandidateSet) ───────────────────────

test("V2 validateCandidateSet rejects the known defect using dimension-aware overlap", () => {
  const positions = [
    { x: 1.935, y: 0.1375 },
    { x: 2.365, y: 0.1375 },
  ];
  const subWidthM = getCabinetWidthM(SUB2_12);
  const subDepthM = getCabinetDepthM(SUB2_12);
  const result = validateCandidateSet(positions, ROOM, subWidthM, subDepthM);
  assert.equal(result, false);
});

test("V2 validateCandidateSet accepts the same pair moved apart", () => {
  const positions = [
    { x: 1.0, y: 0.1375 },
    { x: 3.3, y: 0.1375 },
  ];
  const subWidthM = getCabinetWidthM(SUB2_12);
  const subDepthM = getCabinetDepthM(SUB2_12);
  const result = validateCandidateSet(positions, ROOM, subWidthM, subDepthM);
  assert.equal(result, true);
});

test("V2 validateCandidateSet with one sub always passes overlap", () => {
  const positions = [{ x: 2.15, y: 0.1375 }];
  const subWidthM = getCabinetWidthM(SUB2_12);
  const subDepthM = getCabinetDepthM(SUB2_12);
  const result = validateCandidateSet(positions, ROOM, subWidthM, subDepthM);
  assert.equal(result, true);
});

// ── 5. buildOverlapSources helper ───────────────────────────────────────────

test("buildOverlapSources derives cabinet-centre Z from bottom height", () => {
  const cabinetHeightM = getCabinetHeightM(SUB2_12);
  const { sources, dimensionsResolved } = buildOverlapSources({
    coordinates: [{ x: 2.0, y: 0.1375 }],
    model: SUB2_12,
    roomDims: ROOM,
    bottomHeightM: 0.05,
  });
  assert.equal(dimensionsResolved, true);
  assert.equal(sources[0].z, 0.05 + cabinetHeightM / 2);
});

test("buildOverlapSources returns dimensionsResolved=false for missing model", () => {
  const { sources, dimensionsResolved } = buildOverlapSources({
    coordinates: [{ x: 2.0, y: 0.1375 }],
    model: null,
    roomDims: ROOM,
    bottomHeightM: 0.05,
  });
  assert.equal(dimensionsResolved, false);
  assert.equal(sources.length, 0);
});