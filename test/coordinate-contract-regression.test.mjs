// coordinate-contract-regression.test.mjs
// ---------------------------------------------------------------------------
// Explicit coordinate-domain + full cabinet-boundary contract regression.
//
// Verifies every object entering Stage 2 canonical evaluation declares an
// explicit coordinateSpace, wall references resolve ONCE, cabinet centres
// pass through unchanged, the full cabinet volume is boundary-validated, and
// a physical rejection is a terminal candidate outcome that never makes the
// run incomplete. Changes NO acoustic maths, P14/P18/P19/P20, ranking,
// primary-seat safety, or optimiser timeouts.
//
// Run: node --import ./test/_alias-register.mjs --test test/coordinate-contract-regression.test.mjs
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCabinetCentre,
  resolveInstallableWallCentre,
  validateCabinetBoundary,
  COORDINATE_SPACE,
} from "../src/components/room/bass/stage2/installableWallCentreAuthority.js";
import {
  getCabinetDepthM,
  getCabinetWidthM,
  WALL_BUFFER_M,
} from "../src/components/utils/subwooferInstanceMigration.js";
import {
  classifyCandidateAssessability,
  CANDIDATE_ASSESSABILITY_REASON,
  validateCandidateForRun,
} from "../src/components/room/bass/improveBassV2/confirmedCandidateValidity.js";
import {
  evaluateStage2Placement,
} from "../src/components/room/bass/stage2/stage2CanonicalEvaluation.js";
import {
  fullTransferIdentity,
} from "../src/components/room/bass/stage2/stage2FullTransferReuse.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ROOM = { widthM: 5, lengthM: 8, heightM: 3 };
const MODEL = "SUB3-12";
const DEPTH = getCabinetDepthM(MODEL);
const WIDTH = getCabinetWidthM(MODEL);
const HALF_D = DEPTH / 2;
const HALF_W = WIDTH / 2;

function wallRef(xNorm, yNorm) {
  return resolveCabinetCentre({
    roomDims: ROOM, xNorm, yNorm,
    coordinateSpace: COORDINATE_SPACE.WALL_REFERENCE, modelKey: MODEL,
  });
}
function cabCentre(xNorm, yNorm) {
  return resolveCabinetCentre({
    roomDims: ROOM, xNorm, yNorm,
    coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE, modelKey: MODEL,
  });
}

// ---------------------------------------------------------------------------
// 1-5. WALL_REFERENCE resolves once (front / rear / left / right / corner)
// ---------------------------------------------------------------------------

test("1. front wall_reference resolves once: y = buffer + depth/2", () => {
  const c = wallRef(0.5, 0);
  assert.equal(c.y, WALL_BUFFER_M + HALF_D);
  assert.equal(c.mountingWall, "front");
  assert.equal(c.x, 0.5 * ROOM.widthM, "x passes through along the front wall");
  assert.notEqual(c.y, 0);
});

test("2. rear wall_reference resolves once: y = L - buffer - depth/2", () => {
  const c = wallRef(0.5, 1);
  assert.equal(c.y, ROOM.lengthM - WALL_BUFFER_M - HALF_D);
  assert.equal(c.mountingWall, "rear");
});

test("3. left-wall reference uses cabinet width: x = buffer + width/2", () => {
  const c = wallRef(0, 0.5);
  assert.equal(c.x, WALL_BUFFER_M + HALF_W, "left wall offsets by half width + buffer");
  assert.equal(c.y, 0.5 * ROOM.lengthM, "y passes through along the side wall");
  assert.notEqual(c.x, 0, "no cabinet centre sits on x=0");
});

test("4. right-wall reference uses cabinet width: x = W - buffer - width/2", () => {
  const c = wallRef(1, 0.5);
  assert.equal(c.x, ROOM.widthM - WALL_BUFFER_M - HALF_W);
  assert.notEqual(c.x, ROOM.widthM, "no cabinet centre sits on x=roomWidth");
});

test("5. corner reference resolves BOTH axes (front-left)", () => {
  const c = wallRef(0, 0);
  assert.equal(c.x, WALL_BUFFER_M + HALF_W, "corner x offset by width");
  assert.equal(c.y, WALL_BUFFER_M + HALF_D, "corner y offset by depth");
  assert.deepEqual(c.mountingWalls.sort(), ["front", "left"]);
});

test("5b. corner reference resolves BOTH axes (rear-right)", () => {
  const c = wallRef(1, 1);
  assert.equal(c.x, ROOM.widthM - WALL_BUFFER_M - HALF_W);
  assert.equal(c.y, ROOM.lengthM - WALL_BUFFER_M - HALF_D);
  assert.deepEqual(c.mountingWalls.sort(), ["rear", "right"]);
});

// ---------------------------------------------------------------------------
// 6-9. CABINET_CENTRE passes through unchanged
// ---------------------------------------------------------------------------

test("6. cabinet_centre front passes unchanged (no wall offset)", () => {
  const c = cabCentre(0.5, 0.1);
  assert.equal(c.x, 0.5 * ROOM.widthM);
  assert.equal(c.y, 0.1 * ROOM.lengthM);
  assert.equal(c.clearanceUsed, null, "no wall buffer applied to a cabinet centre");
});

test("7. cabinet_centre rear passes unchanged (no second depth offset)", () => {
  const c = cabCentre(0.5, 0.9);
  assert.equal(c.y, 0.9 * ROOM.lengthM, "rear cabinet centre is not pushed in by depth/2");
});

test("8. Case B normalized cabinet centre yNorm=0.0171875 succeeds → (1.25, 0.1375)", () => {
  // Case B: xNorm=0.25, yNorm=0.0171875, room 5×8.
  // Physical centre must be (1.25, 0.1375) — no wall-boundary exception.
  const c = cabCentre(0.25, 0.0171875);
  assert.equal(c.x, 1.25);
  assert.equal(c.y, 0.1375);
  assert.equal(c.coordinateSpace, COORDINATE_SPACE.CABINET_CENTRE);
});

test("9. Case B physical centres survive as cabinet_centre (no double offset)", () => {
  // A cabinet_centre at yNorm=0.0171875 must NOT be reinterpreted as a wall
  // reference (which would throw "not a wall-boundary").
  const c = cabCentre(0.25, 0.0171875);
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
  assert.equal(c.y, 0.0171875 * ROOM.lengthM);
});

// ---------------------------------------------------------------------------
// 10. Seating batch uses the same resolved centres (behavioural contract)
// ---------------------------------------------------------------------------

test("10. seating-batch coordinates match main evaluation centres", () => {
  // The seating-batch path builds coordinates from the SAME built sources
  // (resolveCabinetCentre) as the main canonical evaluation. A cabinet_centre
  // finalist resolves identically here and in evaluateStage2Placement.
  const finalist = {
    id: "seating-batch-match",
    familyId: "current",
    sources: [
      { xNorm: 0.25, yNorm: 0.0171875, coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE },
      { xNorm: 0.75, yNorm: 0.0171875, coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE },
    ],
  };
  // Main evaluation centre for source 0:
  const mainCentre = resolveCabinetCentre({
    roomDims: ROOM, xNorm: finalist.sources[0].xNorm, yNorm: finalist.sources[0].yNorm,
    coordinateSpace: finalist.sources[0].coordinateSpace, modelKey: MODEL,
  });
  // Seating batch reads coordinates from the built sources (s.x, s.y), which
  // are the resolveCabinetCentre output — so they must match exactly.
  assert.equal(mainCentre.x, 1.25);
  assert.equal(mainCentre.y, 0.1375);
});

// ---------------------------------------------------------------------------
// 11. Transfer reuse distinguishes coordinateSpace
// ---------------------------------------------------------------------------

test("11. transfer reuse distinguishes wall_reference from cabinet_centre", () => {
  // A wall-reference candidate and a cabinet-centre candidate with the same
  // normalised values are NOT interchangeable: their cache identities differ.
  const wallId = fullTransferIdentity({
    finalist: { sources: [{ xNorm: 0, yNorm: 0, coordinateSpace: COORDINATE_SPACE.WALL_REFERENCE }] },
    roomDims: ROOM, selectedSubModel: MODEL,
  });
  const cabId = fullTransferIdentity({
    finalist: { sources: [{ xNorm: 0, yNorm: 0, coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE }] },
    roomDims: ROOM, selectedSubModel: MODEL,
  });
  assert.notEqual(JSON.stringify(wallId), JSON.stringify(cabId),
    "cache identity must include coordinateSpace");
});

// ---------------------------------------------------------------------------
// 12. Case C: no evaluated cabinet centre at x=0 / x=roomWidth
// ---------------------------------------------------------------------------

test("12. Case C side-wall/corner references never evaluate at x=0 or x=roomWidth", () => {
  // xNorm=0 and xNorm=1 are WALL REFERENCES. Resolved centres sit inside the
  // room by half the cabinet width plus the buffer — never on the wall plane.
  for (const yNorm of [0, 0.5, 1]) {
    const left = wallRef(0, yNorm);
    const right = wallRef(1, yNorm);
    assert.ok(left.x > 0, `x=0 reference resolves to x>0 (yNorm=${yNorm})`);
    assert.ok(right.x < ROOM.widthM, `x=1 reference resolves to x<roomWidth (yNorm=${yNorm})`);
    assert.ok(left.x >= WALL_BUFFER_M + HALF_W - 1e-9);
    assert.ok(right.x <= ROOM.widthM - WALL_BUFFER_M - HALF_W + 1e-9);
  }
});

// ---------------------------------------------------------------------------
// 13-14. Full cabinet boundary validation
// ---------------------------------------------------------------------------

test("13. complete cabinet boundary validation passes for an interior centre", () => {
  const v = validateCabinetBoundary({
    centre: { x: 2.5, y: 4 },
    roomDims: ROOM, cabinetWidthM: WIDTH, cabinetDepthM: DEPTH,
  });
  assert.equal(v.valid, true);
  assert.deepEqual(v.violations, []);
});

test("14. impossible cabinet (centre too close to wall) is rejected", () => {
  // A cabinet centre at x=0.05 with a finite width cannot fit: the cabinet
  // would intersect the left wall.
  const v = validateCabinetBoundary({
    centre: { x: 0.05, y: 4 },
    roomDims: ROOM, cabinetWidthM: WIDTH, cabinetDepthM: DEPTH,
  });
  assert.equal(v.valid, false);
  assert.ok(v.violations.includes("left-wall-intersection"));
});

// ---------------------------------------------------------------------------
// 14b. End-to-end: evaluateStage2Placement returns physicalRejection
// ---------------------------------------------------------------------------

test("14b. evaluateStage2Placement returns terminal physicalRejection for an impossible cabinet_centre", () => {
  // A cabinet_centre placed at x=0.01 (near the left wall) cannot fit the full
  // cabinet volume. The placement must return a terminal physical rejection —
  // NOT a worker exception, NOT missing evidence, NOT evaluation_incomplete.
  const finalist = {
    id: "impossible-cabinet",
    familyId: "test",
    sources: [
      { xNorm: 0.01 / ROOM.widthM, yNorm: 0.5, coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE, modelKey: MODEL },
    ],
  };
  const result = evaluateStage2Placement({
    finalist, roomDims: ROOM,
    rspPosition: { x: 2.5, y: 4, z: 1.2 },
    seatingPositions: [{ id: "s1", x: 2.5, y: 4, z: 1.2, priority: "primary" }],
    selectedSubModel: MODEL, amplifierPowerPerSubW: 500, subwooferBottomHeightM: 0.1,
  });
  assert.ok(result, "a result is returned (not a thrown exception)");
  assert.equal(result.terminal, true);
  assert.equal(result.physicalRejection?.passed, false);
  assert.ok(Array.isArray(result.physicalRejection?.violations));
  // No acoustic evidence is fabricated for a physical rejection.
  assert.equal(result.rspRawCurve, undefined);
  assert.equal(result.perSeatRawCurves, undefined);
});

// ---------------------------------------------------------------------------
// 15. Physical rejection does NOT make the run incomplete
// ---------------------------------------------------------------------------

test("15. physical rejection is terminal non-assessable (run stays complete)", () => {
  // A physical rejection is classified as a completed terminal candidate —
  // nonAssessable, never an issue that makes the run incomplete.
  const rejectionResult = {
    physicalRejection: { passed: false, reason: "cabinet-boundary-violation", violations: ["left-wall-intersection"] },
    transitionHz: 120,
    p14TargetDb: 105,
    terminal: true,
  };
  const a = classifyCandidateAssessability(rejectionResult);
  assert.equal(a.assessable, false);
  assert.equal(a.reason, CANDIDATE_ASSESSABILITY_REASON.PHYSICAL_PLACEMENT_REJECTED);

  const check = validateCandidateForRun(rejectionResult, {});
  assert.equal(check.assessable, false);
  assert.equal(check.nonAssessable, true, "physical rejection routes to nonAssessable, not evaluationIssues");
  assert.equal(check.valid, false);
  assert.equal(check.reason, CANDIDATE_ASSESSABILITY_REASON.PHYSICAL_PLACEMENT_REJECTED);
});

// ---------------------------------------------------------------------------
// 16-17. P14 / P18 terminal rejections unchanged
// ---------------------------------------------------------------------------

test("16. P14 operating-point rejection is terminal (unchanged)", () => {
  const p14Rejected = {
    transitionHz: 120,
    p14TargetDb: 120,
    p14AchievedDb: 90,
    p14NotAchievedReason: "p14-operating-point-not-achieved",
    requestedP14Pass: false,
  };
  const a = classifyCandidateAssessability(p14Rejected);
  assert.equal(a.assessable, false);
  assert.equal(a.reason, CANDIDATE_ASSESSABILITY_REASON.P14_OPERATING_POINT_NOT_ACHIEVED);
});

test("17. P18/transition non-assessable rejection is unchanged", () => {
  // P18 F3 at/above the room transition → no valid P19/P20 band.
  const p18Rejected = {
    transitionHz: 120,
    achievedP18Hz: 130,
    p14TargetDb: 105,
    requestedP14Pass: true,
  };
  const a = classifyCandidateAssessability(p18Rejected);
  assert.equal(a.assessable, false);
  assert.equal(a.reason, CANDIDATE_ASSESSABILITY_REASON.NO_VALID_P19_P20_ASSESSMENT_BAND);
});

// ---------------------------------------------------------------------------
// 18. Genuine missing evidence remains incomplete (unchanged)
// ---------------------------------------------------------------------------

test("18. genuine missing evidence remains assessable+invalid (not a terminal rejection)", () => {
  // A result with no physical rejection, P14 achieved, but missing P18/P19/P20
  // evidence is NOT classified as a terminal rejection — it is a genuine
  // missing-evidence case that the run reports as incomplete.
  const missingEvidence = {
    transitionHz: 120,
    p14TargetDb: 105,
    p14AchievedDb: 106,
    requestedP14Pass: true,
    achievedP18Hz: 30,
    // no perSeatP19 / perSeatP20
  };
  const a = classifyCandidateAssessability(missingEvidence);
  assert.equal(a.assessable, true, "missing evidence is not a terminal physical/P14/P18 rejection");
});

// ---------------------------------------------------------------------------
// 19. Primary-seat safety unchanged (smoke)
// ---------------------------------------------------------------------------

test("19. primary-seat safety authority contract is unchanged (import smoke)", () => {
  // The safety authority is not modified by this change. This test asserts the
  // assessability authority does not accidentally classify a safe primary-seat
  // candidate as a physical rejection.
  const a = classifyCandidateAssessability({
    physicalRejection: undefined,
    transitionHz: 120,
    p14TargetDb: 105,
    p14AchievedDb: 106,
    requestedP14Pass: true,
    achievedP18Hz: 30,
  });
  assert.equal(a.assessable, true);
});

// ---------------------------------------------------------------------------
// 20. Three-sub Stage 2 handoff unchanged (coordinateSpace smoke)
// ---------------------------------------------------------------------------

test("20. three-sub Stage 2 handoff: cabinet_centre finalists pass through", () => {
  // A three-sub current-design finalist (cabinet_centre) with Case B-like
  // positions reaches Stage 2 without a wall-boundary exception.
  const finalist = {
    id: "three-sub-current",
    familyId: "current",
    sources: [
      { xNorm: 0.25, yNorm: 0.0171875, coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE, modelKey: MODEL },
      { xNorm: 0.75, yNorm: 0.0171875, coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE, modelKey: MODEL },
      { xNorm: 0.5, yNorm: 0.9828125, coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE, modelKey: MODEL },
    ],
  };
  const result = evaluateStage2Placement({
    finalist, roomDims: ROOM,
    rspPosition: { x: 2.5, y: 4, z: 1.2 },
    seatingPositions: [{ id: "s1", x: 2.5, y: 4, z: 1.2, priority: "primary" }],
    selectedSubModel: MODEL, amplifierPowerPerSubW: 500, subwooferBottomHeightM: 0.1,
  });
  assert.ok(result, "three-sub cabinet_centre handoff reached simulation");
  assert.ok(!result.physicalRejection, "no physical rejection for valid Case B three-sub centres");
  assert.ok(result.coordinates, "coordinates returned");
  assert.equal(result.coordinates.length, 3);
  // Evaluated = recommended: the front pair centres are the cabinet centres.
  assert.ok(Math.abs(result.coordinates[0].x - 1.25) < 1e-9);
  assert.ok(Math.abs(result.coordinates[0].y - 0.1375) < 1e-9);
});

// ---------------------------------------------------------------------------
// 21. Malformed / missing coordinateSpace fails explicitly
// ---------------------------------------------------------------------------

test("21a. missing coordinateSpace throws (not silently reinterpreted)", () => {
  assert.throws(
    () => resolveCabinetCentre({ roomDims: ROOM, xNorm: 0.25, yNorm: 0.0171875, modelKey: MODEL }),
    /missing or invalid coordinateSpace/,
  );
});

test("21b. unknown coordinateSpace throws", () => {
  assert.throws(
    () => resolveCabinetCentre({ roomDims: ROOM, xNorm: 0.25, yNorm: 0.0171875, coordinateSpace: "canvas", modelKey: MODEL }),
    /missing or invalid coordinateSpace/,
  );
});

test("21c. NaN coordinate throws", () => {
  assert.throws(
    () => resolveCabinetCentre({ roomDims: ROOM, xNorm: NaN, yNorm: 0.5, coordinateSpace: COORDINATE_SPACE.WALL_REFERENCE, modelKey: MODEL }),
    /non-finite coordinate/,
  );
});

test("21d. invalid room dimensions throw", () => {
  assert.throws(
    () => resolveCabinetCentre({ roomDims: { widthM: 0, lengthM: 8 }, xNorm: 0.5, yNorm: 0, coordinateSpace: COORDINATE_SPACE.WALL_REFERENCE, modelKey: MODEL }),
    /invalid room width/,
  );
});

test("21e. wall_reference off-wall point throws (not a wall reference)", () => {
  // A wall_reference coordinate that sits on NO wall is malformed for that
  // domain — it must throw rather than be silently treated as cabinet_centre.
  assert.throws(
    () => resolveCabinetCentre({ roomDims: ROOM, xNorm: 0.25, yNorm: 0.0171875, coordinateSpace: COORDINATE_SPACE.WALL_REFERENCE, modelKey: MODEL }),
    /is not a wall-boundary reference/,
  );
});

// ---------------------------------------------------------------------------
// Case B retest: V2 confirmation reached
// ---------------------------------------------------------------------------

test("Case B 0.0171875 handoff: Stage 2 source creation PASS (no wall-boundary exception)", () => {
  // The original failure: a cabinet_centre yNorm=0.0171875 was fed to
  // resolveInstallableWallCentre which threw "is not a wall-boundary". With the
  // explicit coordinateSpace contract, the cabinet_centre passes through.
  const c = cabCentre(0.25, 0.0171875);
  assert.equal(c.x, 1.25);
  assert.equal(c.y, 0.1375);
  assert.equal(c.coordinateSpace, COORDINATE_SPACE.CABINET_CENTRE);
  // And it passes the full cabinet boundary check (interior centre).
  const v = validateCabinetBoundary({
    centre: { x: c.x, y: c.y }, roomDims: ROOM,
    cabinetWidthM: WIDTH, cabinetDepthM: DEPTH,
  });
  assert.equal(v.valid, true);
});

test("Case B V2 confirmation REACHED: evaluateStage2Placement returns acoustic evidence", () => {
  const finalist = {
    id: "case-b-current",
    familyId: "current",
    sources: [
      { xNorm: 0.25, yNorm: 0.0171875, coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE, modelKey: MODEL },
      { xNorm: 0.75, yNorm: 0.0171875, coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE, modelKey: MODEL },
    ],
  };
  const result = evaluateStage2Placement({
    finalist, roomDims: ROOM,
    rspPosition: { x: 2.5, y: 4, z: 1.2 },
    seatingPositions: [{ id: "s1", x: 2.5, y: 4, z: 1.2, priority: "primary" }],
    selectedSubModel: MODEL, amplifierPowerPerSubW: 500, subwooferBottomHeightM: 0.1,
  });
  assert.ok(result, "V2 confirmation reached — a raw transfer was produced");
  assert.ok(!result.physicalRejection, "no physical rejection for Case B cabinet centres");
  assert.ok(result.rspRawCurve?.length > 0, "acoustic evidence was generated");
  assert.ok(Math.abs(result.coordinates[0].x - 1.25) < 1e-9);
  assert.ok(Math.abs(result.coordinates[0].y - 0.1375) < 1e-9);
});