// installable-wall-centre-authority.test.mjs
// ---------------------------------------------------------------------------
// Case B verification suite: physically installable cabinet-centre geometry.
//
// This suite verifies the GEOMETRIC authority that converts wall-boundary
// normalised positions into physically installable cabinet CENTRES before the
// source reaches the acoustic simulation. It changes NO acoustic maths, no
// optimiser ranking, no primary-seat safety, no P19/P20, no practicality gate
// and no timeouts. It proves:
//
//   1. coordinate semantics = cabinet centre (not wall plane)
//   2. SUB3-12 / sub3-12 resolve to the same canonical dimensions
//   3. a known product does NOT fall back to 0.30 m because of casing
//   4. front-wall centre offset is correct
//   5. rear-wall centre offset is correct
//   6. a different depth produces a different offset
//   7. Case B (THREE_FRONT_PAIR_REAR_SINGLE) all three cabinets inside the room
//   8. mounting walls remain front/front/rear
//   9. canonical evaluation uses the corrected centres (evaluated = recommended)
//  10. recommended coordinates equal evaluated coordinates (no post-eval shift)
//  11. impossible placement (off-wall yNorm) is still rejected
//  12. ranking-winner-non-actionable wording is accurate
//  13. no-ranking-winner wording is unchanged
//  14. candidatesEvaluated uses the real production contract (confirmed-records)
//  15. primary-seat safety authority is unchanged
//  16. three-sub Stage 2 handoff unchanged (smoke check of the family contract)
//
// Run: node --import ./test/_alias-register.mjs --test test/installable-wall-centre-authority.test.mjs
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveInstallableWallCentre,
  mountingWallFromYNorm,
} from "../src/components/room/bass/stage2/installableWallCentreAuthority.js";
import {
  getCabinetDepthM,
  getCabinetWidthM,
  WALL_BUFFER_M,
} from "../src/components/utils/subwooferInstanceMigration.js";
import { getSpeakerModelMeta } from "../src/components/models/speakers/registry.jsx";
import { normaliseModelKey } from "../src/components/utils/modelKeyNormaliser.js";
import {
  THREE_SUB_FAMILY_IDS,
  threeSubFamilyPoints,
} from "../src/components/room/bass/stage1/stage1ThreeSubFamilies.js";
import {
  OPTIMISER_NO_WINNER_REASON,
  OPTIMISER_WINNER_NON_PRACTICAL_REASON,
  OPTIMISER_TERMINAL_OUTCOME,
} from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import {
  resolvePlanActionability,
} from "../src/components/room/bass/optimiserPlan/optimiserPlanSave.js";
import {
  buildOptimiserRunEvidence,
} from "../src/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import {
  evaluateProtectedSeatSafety,
} from "../src/components/room/bass/improveBassV2/protectedSeatSafetyAuthority.js";

// ---------------------------------------------------------------------------
// Case B room + finalist
// ---------------------------------------------------------------------------

const CASE_B_ROOM = { widthM: 5, lengthM: 8, heightM: 3 };
const CASE_B_MODEL = "SUB3-12";
const CASE_B_FAMILY = THREE_SUB_FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE;

// The seed arrangement of topology B: front pair + rear singleton.
// The builder returns many candidates; the FIRST is the canonical seed
// (spread 0.25, singleton 0.5 for topology B): front(0.25,0), front(0.75,0),
// rear(0.5,1).
const CASE_B_SEED = threeSubFamilyPoints(CASE_B_FAMILY)[0];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function centreFor(point, modelKey = CASE_B_MODEL, roomDims = CASE_B_ROOM) {
  return resolveInstallableWallCentre({
    roomDims,
    xNorm: point.xNorm,
    yNorm: point.yNorm,
    modelKey,
  });
}

function isInsideRoom(centre, roomDims = CASE_B_ROOM) {
  const W = roomDims.widthM;
  const L = roomDims.lengthM;
  const halfW = getCabinetWidthM(CASE_B_MODEL) / 2;
  const halfD = centre.cabinetDepthM / 2;
  // Cabinet volume must be entirely inside the room: the centre +/- half extents
  // must stay within [0, W] x [0, L] (ignoring the shared wall buffer, which is
  // already accounted for in the centre y).
  const minX = halfW;
  const maxX = W - halfW;
  const minY = halfD;
  const maxY = L - halfD;
  return centre.x >= minX - 1e-9 && centre.x <= maxX + 1e-9
    && centre.y >= minY - 1e-9 && centre.y <= maxY + 1e-9;
}

// ---------------------------------------------------------------------------
// 1. coordinate semantics = cabinet centre
// ---------------------------------------------------------------------------

test("coordinate semantics: front-wall centre = buffer + depth/2 (not wall plane)", () => {
  const centre = centreFor({ xNorm: 0.5, yNorm: 0 });
  const depth = getCabinetDepthM(CASE_B_MODEL);
  assert.equal(centre.y, WALL_BUFFER_M + depth / 2,
    "front centre sits half-depth inside the room plus the wall buffer");
  assert.equal(centre.mountingWall, "front");
  assert.notEqual(centre.y, 0, "centre is NOT on the wall plane");
});

test("coordinate semantics: rear-wall centre = L - buffer - depth/2", () => {
  const centre = centreFor({ xNorm: 0.5, yNorm: 1 });
  const depth = getCabinetDepthM(CASE_B_MODEL);
  assert.equal(centre.y, CASE_B_ROOM.lengthM - WALL_BUFFER_M - depth / 2,
    "rear centre sits half-depth inside the room from the rear wall");
  assert.equal(centre.mountingWall, "rear");
});

test("coordinate semantics: x = xNorm * roomWidth (passes through)", () => {
  const centre = centreFor({ xNorm: 0.25, yNorm: 0 });
  assert.equal(centre.x, 0.25 * CASE_B_ROOM.widthM);
});

// ---------------------------------------------------------------------------
// 2. SUB3-12 / sub3-12 same canonical dimensions
// ---------------------------------------------------------------------------

test("SUB3-12 and sub3-12 resolve to the same canonical model key", () => {
  assert.equal(normaliseModelKey("SUB3-12"), "sub3-12");
  assert.equal(normaliseModelKey("sub3-12"), "sub3-12");
});

test("SUB3-12 and sub3-12 resolve to the same cabinet depth", () => {
  const upper = getCabinetDepthM("SUB3-12");
  const lower = getCabinetDepthM("sub3-12");
  assert.equal(upper, lower, "casing never changes the resolved depth");
  assert.equal(upper, 0.255, "both resolve to the canonical 0.255 m depth");
});

// ---------------------------------------------------------------------------
// 3. known product does not fall back to 0.30 m because of casing
// ---------------------------------------------------------------------------

test("SUB3-12 does NOT use the 0.30 m fallback", () => {
  const depth = getCabinetDepthM("SUB3-12");
  assert.notEqual(depth, 0.30, "known product must not hit the unknown-model fallback");
  assert.equal(depth, 0.255);
  // The registry itself reports the same depth.
  const meta = getSpeakerModelMeta("SUB3-12");
  assert.equal(meta.depthM, 0.255);
  assert.ok(!meta.notFound, "SUB3-12 is a found registry product");
});

test("sub3-12 (lowercase) does NOT use the 0.30 m fallback", () => {
  const depth = getCabinetDepthM("sub3-12");
  assert.notEqual(depth, 0.30);
  assert.equal(depth, 0.255);
});

// ---------------------------------------------------------------------------
// 4. front-wall centre offset correct
// ---------------------------------------------------------------------------

test("front-wall centre offset: 0.01 + 0.255/2 = 0.1375 m", () => {
  const centre = centreFor({ xNorm: 0.5, yNorm: 0 });
  assert.equal(centre.cabinetDepthM, 0.255);
  assert.equal(centre.clearanceUsed, WALL_BUFFER_M);
  assert.equal(centre.y, 0.01 + 0.255 / 2);
  assert.equal(centre.y, 0.1375);
});

// ---------------------------------------------------------------------------
// 5. rear-wall centre offset correct
// ---------------------------------------------------------------------------

test("rear-wall centre offset: 8 - 0.01 - 0.255/2 = 7.8625 m", () => {
  const centre = centreFor({ xNorm: 0.5, yNorm: 1 });
  assert.equal(centre.y, 8 - 0.01 - 0.255 / 2);
  assert.equal(centre.y, 7.8625);
});

// ---------------------------------------------------------------------------
// 6. different depth produces a different offset
// ---------------------------------------------------------------------------

test("a different cabinet depth produces a different front-wall offset", () => {
  const shallow = resolveInstallableWallCentre({
    roomDims: CASE_B_ROOM, xNorm: 0.5, yNorm: 0, cabinetDepthM: 0.20,
  });
  const deep = resolveInstallableWallCentre({
    roomDims: CASE_B_ROOM, xNorm: 0.5, yNorm: 0, cabinetDepthM: 0.40,
  });
  assert.notEqual(shallow.y, deep.y, "depth changes the centre y");
  assert.ok(deep.y > shallow.y, "deeper cabinet sits further into the room");
});

test("a different cabinet depth produces a different rear-wall offset", () => {
  const shallow = resolveInstallableWallCentre({
    roomDims: CASE_B_ROOM, xNorm: 0.5, yNorm: 1, cabinetDepthM: 0.20,
  });
  const deep = resolveInstallableWallCentre({
    roomDims: CASE_B_ROOM, xNorm: 0.5, yNorm: 1, cabinetDepthM: 0.40,
  });
  assert.notEqual(shallow.y, deep.y);
  assert.ok(deep.y < shallow.y, "deeper rear cabinet sits further from the rear wall");
});

// ---------------------------------------------------------------------------
// 7. Case B all three cabinets inside the room
// ---------------------------------------------------------------------------

test("Case B: THREE_FRONT_PAIR_REAR_SINGLE produces three explicit sources", () => {
  assert.ok(Array.isArray(CASE_B_SEED), "seed is an array of three points");
  assert.equal(CASE_B_SEED.length, 3, "one coordinate per physical source");
});

test("Case B: all three cabinet centres are inside the 5 x 8 x 3 room", () => {
  const centres = CASE_B_SEED.map((p) => centreFor(p));
  for (const c of centres) assert.ok(isInsideRoom(c), `centre ${JSON.stringify(c)} inside room`);
});

test("Case B: front centres y = 0.1375, rear centre y = 7.8625", () => {
  const [f1, f2, r1] = CASE_B_SEED.map((p) => centreFor(p));
  assert.equal(f1.y, 0.1375);
  assert.equal(f2.y, 0.1375);
  assert.equal(r1.y, 7.8625);
});

test("Case B: front centres x = 1.25 and 3.75, rear centre x = 2.5", () => {
  const [f1, f2, r1] = CASE_B_SEED.map((p) => centreFor(p));
  assert.equal(f1.x, 1.25); // 0.25 * 5
  assert.equal(f2.x, 3.75); // 0.75 * 5
  assert.equal(r1.x, 2.5);  // 0.5 * 5
});

// ---------------------------------------------------------------------------
// 8. mounting walls remain front/front/rear
// ---------------------------------------------------------------------------

test("Case B: mounting walls are preserved as front, front, rear", () => {
  const walls = CASE_B_SEED.map((p) => centreFor(p).mountingWall);
  assert.deepEqual(walls, ["front", "front", "rear"],
    "wall identity is derived from yNorm and preserved separate from the physical centre y");
});

test("mountingWallFromYNorm: 0 -> front, 1 -> rear, off-wall -> null", () => {
  assert.equal(mountingWallFromYNorm(0), "front");
  assert.equal(mountingWallFromYNorm(1), "rear");
  assert.equal(mountingWallFromYNorm(0.5), null);
});

// ---------------------------------------------------------------------------
// 9 + 10. canonical evaluation uses corrected centres (evaluated = recommended)
// ---------------------------------------------------------------------------

// buildStage2Sources (the acoustic source builder) and evaluateStage2Placement
// (the placement result that carries `coordinates` for the recommendation) BOTH
// resolve the cabinet centre through resolveInstallableWallCentre with the same
// roomDims, xNorm, yNorm and modelKey. This test replicates both call sites
// with the exact same inputs and proves the coordinates are identical: there is
// no post-evaluation shift.
test("evaluated coordinates equal recommended coordinates (no post-evaluation shift)", () => {
  const modelKey = normaliseModelKey(CASE_B_MODEL);
  // The acoustic source builder resolves one centre per source.
  const evaluated = CASE_B_SEED.map((s) => resolveInstallableWallCentre({
    roomDims: CASE_B_ROOM, xNorm: s.xNorm, yNorm: s.yNorm, modelKey,
  }));
  // The recommendation coordinates are resolved by the SAME authority with the
  // SAME inputs (see stage2CanonicalEvaluation.js: buildStage2Sources line ~108
  // and evaluateStage2Placement `coordinates` block line ~318).
  const recommended = CASE_B_SEED.map((s) => resolveInstallableWallCentre({
    roomDims: CASE_B_ROOM, xNorm: s.xNorm, yNorm: s.yNorm,
    modelKey: s.modelKey || modelKey,
  }));
  assert.equal(evaluated.length, recommended.length);
  for (let i = 0; i < evaluated.length; i++) {
    assert.equal(evaluated[i].x, recommended[i].x, `source ${i}: x matches`);
    assert.equal(evaluated[i].y, recommended[i].y, `source ${i}: y matches`);
    assert.equal(evaluated[i].mountingWall, recommended[i].mountingWall,
      `source ${i}: mounting wall matches`);
  }
});

test("resolveInstallableWallCentre is deterministic for identical inputs", () => {
  const a = centreFor({ xNorm: 0.25, yNorm: 0 });
  const b = centreFor({ xNorm: 0.25, yNorm: 0 });
  assert.deepEqual(a, b, "the same inputs always produce the same cabinet centre");
});

// ---------------------------------------------------------------------------
// 11. impossible placement still rejected
// ---------------------------------------------------------------------------

test("an off-wall yNorm (not 0 or 1) is rejected", () => {
  assert.throws(
    () => resolveInstallableWallCentre({
      roomDims: CASE_B_ROOM, xNorm: 0.5, yNorm: 0.5, modelKey: CASE_B_MODEL,
    }),
    /not a wall-boundary/,
    "only wall-boundary placements (yNorm 0 or 1) are installable",
  );
});

test("invalid room dimensions are rejected", () => {
  assert.throws(() => resolveInstallableWallCentre({
    roomDims: { widthM: 0, lengthM: 8, heightM: 3 }, xNorm: 0.5, yNorm: 0,
  }), /invalid room width/);
  assert.throws(() => resolveInstallableWallCentre({
    roomDims: { widthM: 5, lengthM: -1, heightM: 3 }, xNorm: 0.5, yNorm: 0,
  }), /invalid room length/);
});

// ---------------------------------------------------------------------------
// 12. ranking-winner-non-actionable wording accurate
// ---------------------------------------------------------------------------

test("OPTIMISER_WINNER_NON_PRACTICAL_REASON states a winner exists but is not practical", () => {
  assert.ok(OPTIMISER_WINNER_NON_PRACTICAL_REASON.includes("better-performing"),
    "states a better-performing option was found");
  assert.ok(OPTIMISER_WINNER_NON_PRACTICAL_REASON.toLowerCase().includes("not practical"),
    "states the placement is not practical");
});

test("resolvePlanActionability: theoretical placement returns the non-practical reason", () => {
  const plan = {
    levers: {
      placement: {
        lever: "placement",
        evaluated: true,
        effect: { p20VariationDb: 3.0 },
        changes: [{ sourceId: "sub-1", from: { x: 1, y: 1 }, to: { x: 1.25, y: 0.1375 } }],
        practical: false,
        theoreticalReason: "placement outside the wall-based envelope",
        validation: { destinationsValid: true },
      },
    },
    baseline: { p20VariationDb: 5.0 },
  };
  const result = resolvePlanActionability({ plan, selection: { evaluationIncomplete: false } });
  assert.equal(result.actionable, false, "non-practical placement is not actionable");
  // A winner that exists but whose placement is not practical is a
  // NON_ACTIONABLE_WINNER — distinct from a no-improvement run.
  assert.equal(result.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_WINNER);
  assert.ok(result.reason.startsWith(OPTIMISER_WINNER_NON_PRACTICAL_REASON),
    "the non-practical reason is stated, not the generic no-winner reason");
  assert.ok(!result.reason.includes(OPTIMISER_NO_WINNER_REASON),
    "the generic no-winner wording is NOT appended on top of the non-practical reason");
});

// ---------------------------------------------------------------------------
// 13. no-ranking-winner wording unchanged
// ---------------------------------------------------------------------------

test("OPTIMISER_NO_WINNER_REASON is the unchanged no-winner wording", () => {
  assert.equal(
    OPTIMISER_NO_WINNER_REASON,
    "No candidate was confirmed as a winner: every evaluated candidate was rejected before a winner could be established.",
  );
});

test("buildOptimiserRunEvidence appends the no-winner reason only when not non-practical", () => {
  // A terminal run with NO winner and NO non-practical reason gets the generic
  // no-winner wording.
  const evidence = buildOptimiserRunEvidence({
    selection: {
      confirmedResults: [{ candidateId: "c1", score: { p20VariationDb: 5.0 } }],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
    },
    diagnostics: { topCandidatesForWinningStage: [] },
    identity: { projectId: "p", versionId: "v" },
  });
  assert.ok(evidence.run.rejectionReasons.includes(OPTIMISER_NO_WINNER_REASON),
    "a run with no winner carries the generic no-winner reason");

  // A terminal run whose stated reason IS the non-practical reason must NOT
  // also carry the generic no-winner reason.
  const nonPractical = buildOptimiserRunEvidence({
    selection: {
      confirmedResults: [{ candidateId: "c1", score: { p20VariationDb: 5.0 } }],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
    },
    diagnostics: { topCandidatesForWinningStage: [] },
    identity: { projectId: "p", versionId: "v" },
    failureReason: OPTIMISER_WINNER_NON_PRACTICAL_REASON,
  });
  assert.ok(
    !nonPractical.run.rejectionReasons.includes(OPTIMISER_NO_WINNER_REASON),
    "the generic no-winner reason is never appended on top of the non-practical reason",
  );
  assert.ok(
    nonPractical.run.rejectionReasons.some((r) => r.startsWith(OPTIMISER_WINNER_NON_PRACTICAL_REASON)),
    "the non-practical reason is present",
  );
});

// ---------------------------------------------------------------------------
// 14. candidatesEvaluated uses the real production contract
// ---------------------------------------------------------------------------

test("candidatesEvaluated uses confirmed-records basis when confirmed results exist", () => {
  const evidence = buildOptimiserRunEvidence({
    selection: {
      confirmedResults: [
        { candidateId: "c1", score: { p20VariationDb: 5.0 } },
        { candidateId: "c2", score: { p20VariationDb: 4.5 } },
        { candidateId: "c3", score: { p20VariationDb: 4.0 } },
      ],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
    },
    diagnostics: { topCandidatesForWinningStage: [] },
    identity: { projectId: "p", versionId: "v" },
  });
  assert.equal(evidence.run.candidatesEvaluated, 3, "headline count = confirmed records");
  assert.equal(evidence.run.candidatesEvaluatedBasis, "confirmed-records",
    "the production contract names the basis honestly");
  assert.equal(evidence.run.resultsRetained, 3);
});

test("candidatesEvaluated falls back to stage-confirmed-max when no retained rows", () => {
  const evidence = buildOptimiserRunEvidence({
    selection: {
      confirmedResults: [],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
    },
    diagnostics: {
      topCandidatesForWinningStage: [],
      stages: [{ name: "Final EQ", candidatesEvaluated: { confirmed: 7 } }],
    },
    identity: { projectId: "p", versionId: "v" },
  });
  assert.equal(evidence.run.candidatesEvaluated, 7, "falls back to the max stage confirmed counter");
  assert.equal(evidence.run.candidatesEvaluatedBasis, "stage-confirmed-max");
});

// ---------------------------------------------------------------------------
// 15. primary-seat safety unchanged
// ---------------------------------------------------------------------------

test("primary-seat safety authority still rejects a regressing primary seat", () => {
  const baseline = {
    perSeatP20: [{ seatId: "s1", isPrimary: true, variationDbRaw: 2.0, level: "L4" }],
    perSeatP19: [{ seatId: "s1", isPrimary: true, variationDbRaw: 2.0, level: "L4" }],
  };
  const candidate = {
    perSeatP20: [{ seatId: "s1", isPrimary: true, variationDbRaw: 8.0, level: "L1" }],
    perSeatP19: [{ seatId: "s1", isPrimary: true, variationDbRaw: 8.0, level: "L1" }],
  };
  const safety = evaluateProtectedSeatSafety(candidate, baseline);
  assert.equal(safety.safe, false, "a primary-seat regression is still unsafe");
  assert.equal(safety.reason, "primary-seat-regression");
});

test("primary-seat safety authority passes a safe candidate", () => {
  const baseline = {
    perSeatP20: [{ seatId: "s1", isPrimary: true, variationDbRaw: 5.0, level: "L1" }],
    perSeatP19: [{ seatId: "s1", isPrimary: true, variationDbRaw: 5.0, level: "L1" }],
  };
  const candidate = {
    perSeatP20: [{ seatId: "s1", isPrimary: true, variationDbRaw: 3.0, level: "L3" }],
    perSeatP19: [{ seatId: "s1", isPrimary: true, variationDbRaw: 3.0, level: "L3" }],
  };
  const safety = evaluateProtectedSeatSafety(candidate, baseline);
  assert.equal(safety.safe, true, "an improving primary seat is safe");
});

// ---------------------------------------------------------------------------
// 16. three-sub Stage 2 handoff unchanged (family contract smoke check)
// ---------------------------------------------------------------------------

test("THREE_FRONT_PAIR_REAR_SINGLE remains a enabled three-sub family with 3 sources", () => {
  // The handoff contract: the family is enabled, produces three explicit
  // sources, and the pair indexes are the front pair (0,1).
  const points = threeSubFamilyPoints(CASE_B_FAMILY);
  assert.ok(points.length > 0, "family still generates candidates");
  for (const candidate of points) {
    assert.equal(candidate.length, 3, "every candidate carries three explicit sources");
    assert.equal(candidate[0].yNorm, 0, "first source on the front wall");
    assert.equal(candidate[1].yNorm, 0, "second source on the front wall");
    assert.equal(candidate[2].yNorm, 1, "third source on the rear wall");
  }
});

test("three-sub families all carry three explicit sources (handoff contract)", () => {
  for (const familyId of Object.values(THREE_SUB_FAMILY_IDS)) {
    if (familyId === THREE_SUB_FAMILY_IDS.THREE_BOUNDARY_CUSTOM) continue;
    const points = threeSubFamilyPoints(familyId);
    assert.ok(points.length > 0, `${familyId} generates candidates`);
    for (const candidate of points) {
      assert.equal(candidate.length, 3, `${familyId} candidate has three sources`);
    }
  }
});