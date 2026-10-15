// three-sub-stage1-stage2.test.mjs
// ---------------------------------------------------------------------------
// THREE-SOURCE PLACEMENT — the guards, the wiring and the existing-quantity
// regression, all in one focused suite.
//
// What is proved here:
//
//   PAIR TOLERANCE    the practical pair authority recognises a real installed
//                     pair inside its 100 mm installation band, and refuses five
//                     near-misses: same side of the centre line, staggered depth,
//                     different models, different walls, and the two-source rule.
//   TWO-SUB RULE      the frozen 10 mm "one acoustic position" rule is untouched:
//                     a two-subwoofer pair only 81 mm apart in depth is NOT
//                     collapsed, and a genuine 10 mm pair still is.
//   INSTALLED DEPTH   a source whose depth does not change keeps the depth it is
//                     installed at; a source whose depth does change is judged by
//                     the normal wall rules, and a mid-room move is theoretical.
//   STAGE 1           quantity 3 generates wall-position candidates, refines the
//                     mirrored pair of each pair-capable family, and publishes a
//                     real three_sub_result with three coordinates per finalist.
//   STAGE 2           three_sub_result is promoted, ranked and stored exactly like
//                     1/2/4, and the fingerprints of designs with no three-source
//                     finalists are bit-for-bit unchanged.
//   REGRESSION        1-, 2- and 4-sub families are untouched and none of them
//                     reads the three-source family set.
//
// No bass maths, no P19/P20 definition, no RP22 grading, no applied calibration.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  IDENTICAL_PAIR_TOLERANCE_M,
  PRACTICAL_PAIR_TOLERANCE_M,
  classifySymmetricPair,
  isIdenticalSymmetricPair,
} from "../components/room/bass/improveBassV2/practicalPairAuthority.js";
import { detectSubwooferGroups } from "../components/room/bass/improveBassV2/subwooferGroupAuthority.js";
import {
  generateFineCandidates,
  generateStage1Candidates,
} from "../components/room/bass/stage1/stage1CandidateGenerator.js";
import {
  ENABLED_FAMILIES,
  FAMILY_IDS,
} from "../components/room/bass/stage1/stage1FamilyRegistry.js";
import {
  STAGE1_CANDIDATE_BUDGETS,
  STAGE1_FAMILY_POLICY_VERSION,
  STAGE1_FINALIST_COUNT,
} from "../components/room/bass/stage1/stage1Constants.js";
import {
  THREE_SUB_ENABLED_FAMILIES,
  THREE_SUB_FAMILY_IDS,
  threeSubFamilyBestParam,
} from "../components/room/bass/stage1/stage1ThreeSubFamilies.js";
import { runStage1SearchForQuantity } from "../components/room/bass/stage1/stage1PlacementEngine.js";
import {
  getStage1State,
  publishHydratedStage1,
} from "../components/room/bass/stage1/stage1PlacementStore.js";
import { buildPromotionPlan } from "../components/room/bass/stage2/stage2FinalistPromotion.js";
import { computeStage2PlacementFingerprint } from "../components/room/bass/stage2/stage2PlacementFingerprint.js";
import { STAGE2_QUANTITY_ORDER } from "../components/room/bass/stage2/stage2OverallBestSelection.js";
import { STAGE2_FINALISTS_MAX } from "../components/room/bass/stage2/stage2Constants.js";
import {
  estimateOptimiserCalculations,
  resolveSearchGroupCount,
} from "../components/room/bass/optimiserPlan/optimiserCalculationEstimate.js";
import { buildOptimiserRunWorkload } from "../components/room/bass/optimiserPlan/optimiserRunWorkload.js";
import { DEFAULT_BEST_SUB_LAYOUT_PHYSICS } from "../components/room/bass/best-layout/bestSubLayoutPhysicsSnapshot.js";
import {
  INSTALLED_DEPTH_TOLERANCE_M,
  classifyMovementPracticality,
} from "../components/room/bass/best-layout/practicalPlacementAuthority.js";
import { validateCandidateSet } from "../components/room/bass/improveBassV2/positionCandidateGenerator.js";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..");
const read = (path) => readFileSync(join(SRC, path), "utf8");

const ROOM = Object.freeze({ widthM: 4.6, lengthM: 5.08, heightM: 2.4 });
const SEATS = [
  { id: "seat-1", x: 2.3, y: 3.0, priority: "primary" },
  { id: "seat-2", x: 1.4, y: 3.0, priority: "primary" },
];
const RSP = { x: 2.3, y: 3.0 };

const sub = (id, model, x, y, legacyGroup) => ({
  id, model, enabled: true, position: { x, y }, legacyGroup,
});

// A. the live Barton topology: one front subwoofer, a practical rear pair whose
//    cabinets sit 81 mm apart in depth but are mirrored laterally.
const BARTON = [
  sub("sub-front-1", "SUB4-12", 2.3, 0.6, "front"),
  sub("sub-rear-1", "SUB3-12", 1.05, 4.862, "rear"),
  sub("sub-rear-2", "SUB3-12", 3.55, 4.782, "rear"),
];
// B. front pair + rear singleton.
const FRONT_PAIR = [
  sub("sub-front-1", "SUB3-12", 1.25, 0.6, "front"),
  sub("sub-front-2", "SUB3-12", 3.35, 0.6, "front"),
  sub("sub-rear-1", "SUB3-12", 2.3, 4.5, "rear"),
];
// C. three genuinely asymmetric wall positions: no mirrored pair anywhere.
const ASYMMETRIC = [
  sub("sub-front-1", "SUB3-12", 2.3, 0.6, "front"),
  sub("sub-rear-1", "SUB3-12", 1.25, 4.6, "rear"),
  sub("sub-rear-2", "SUB3-12", 2.7, 4.6, "rear"),
];

const stage1For = (quantity, instances = BARTON) => ({
  quantity,
  roomDims: ROOM,
  rspPosition: RSP,
  seatingPositions: SEATS,
  physicsOptions: DEFAULT_BEST_SUB_LAYOUT_PHYSICS,
  generationId: null,
  instances,
});

const THREE_SUB_FAMILY_SET = new Set(Object.values(THREE_SUB_FAMILY_IDS));

describe("practical pair authority — the 100 mm band and its five refusals", () => {
  it("recognises the installed Barton rear pair inside the installation band", () => {
    const verdict = classifySymmetricPair(BARTON[1], BARTON[2], { widthM: ROOM.widthM });
    assert.equal(verdict.paired, true);
    assert.equal(verdict.identical, false, "an 81 mm depth offset is not one identical position");
    assert.ok(Math.abs(verdict.lateralOffsetM) < 1e-9, "the pair is mirrored laterally");
    assert.ok(Math.abs(verdict.depthDeltaM - 0.08) < 0.002);
    assert.equal(verdict.toleranceM, PRACTICAL_PAIR_TOLERANCE_M);
  });

  it("names both bands and keeps the identical band at 10 mm", () => {
    assert.equal(IDENTICAL_PAIR_TOLERANCE_M, 0.01);
    assert.equal(PRACTICAL_PAIR_TOLERANCE_M, 0.1);
    // 81 mm apart in depth: not one acoustic position …
    assert.equal(isIdenticalSymmetricPair(BARTON[1], BARTON[2], { widthM: ROOM.widthM }), false);
    // … but a genuinely co-located pair still is.
    const near = { ...BARTON[2], position: { x: 3.55, y: 4.861 } };
    assert.equal(isIdenticalSymmetricPair(BARTON[1], near, { widthM: ROOM.widthM }), true);
  });

  it("refuses a same-wall pair that sits on one side of the centre line", () => {
    const both = { ...BARTON[2], position: { x: 1.45, y: 4.78 } };
    const verdict = classifySymmetricPair(BARTON[1], both, { widthM: ROOM.widthM });
    assert.equal(verdict.paired, false);
    assert.match(verdict.reason, /same side/i);
  });

  it("refuses two coordinates merely 100 mm apart on the same side", () => {
    const near = { ...BARTON[1], position: { x: BARTON[1].position.x + 0.06, y: BARTON[1].position.y } };
    assert.equal(classifySymmetricPair(BARTON[1], near, { widthM: ROOM.widthM }).paired, false);
  });

  it("refuses a mirrored pair whose depths differ by more than the band", () => {
    const staggered = { ...BARTON[2], position: { x: 3.55, y: 4.862 - 0.4 } };
    const verdict = classifySymmetricPair(BARTON[1], staggered, { widthM: ROOM.widthM });
    assert.equal(verdict.paired, false);
    assert.match(verdict.reason, /staggered/i);
  });

  it("refuses two different models", () => {
    const other = { ...BARTON[2], model: "SUB4-12" };
    const verdict = classifySymmetricPair(BARTON[1], other, { widthM: ROOM.widthM });
    assert.equal(verdict.paired, false);
    assert.match(verdict.reason, /different subwoofer models/i);
  });

  it("refuses two sources on different walls, and never groups them as one pair", () => {
    const front = sub("sub-front-1", "SUB3-12", 1.05, 0.6, "front");
    const rear = sub("sub-rear-1", "SUB3-12", 3.55, 4.5, "rear");
    assert.equal(classifySymmetricPair(front, rear, { widthM: ROOM.widthM }).paired, false);
    const grouping = detectSubwooferGroups([front, rear], ROOM);
    assert.equal(grouping.status, "eligible");
    assert.equal(grouping.groups.length, 2, "two walls are never one group");
  });

  it("does not widen the two-source rule: an 81 mm two-sub pair stays two groups", () => {
    const pair = [BARTON[1], BARTON[2]];
    assert.equal(isIdenticalSymmetricPair(pair[0], pair[1], { widthM: ROOM.widthM }), false);
    const grouping = detectSubwooferGroups(pair, ROOM);
    assert.equal(grouping.status, "eligible");
    assert.equal(grouping.groups.length, 2);
  });

  it("keeps the frozen two-source pair suppression for a genuine 10 mm pair", () => {
    const a = sub("s1", "SUB3-12", 1.15, 4.6, "rear");
    const b = sub("s2", "SUB3-12", 3.45, 4.605, "rear");
    assert.equal(isIdenticalSymmetricPair(a, b, { widthM: ROOM.widthM }), true);
    const grouping = detectSubwooferGroups([a, b], ROOM);
    assert.equal(grouping.status, "skipped", "a symmetric same-wall pair is still one group");
  });
});

describe("three-source grouping — the layout decides the groups", () => {
  const cases = [
    ["one front subwoofer with a rear pair", BARTON, ["Front singleton", "Rear pair"]],
    ["a front pair with one rear subwoofer", FRONT_PAIR, ["Front pair", "Rear singleton"]],
    ["three asymmetric positions", ASYMMETRIC, ["Front singleton", "Rear left", "Rear right"]],
  ];

  cases.forEach(([label, instances, labels]) => {
    it(`groups ${label}`, () => {
      const grouping = detectSubwooferGroups(instances, ROOM);
      assert.equal(grouping.status, "eligible");
      assert.equal(grouping.groups.length, labels.length);
      assert.deepEqual(grouping.groups.map((g) => g.label), labels);
      const grouped = grouping.groups.flatMap((g) => g.sourceIds);
      assert.equal(grouped.length, 3, "every physical source is accounted for");
      assert.equal(new Set(grouped).size, 3, "no source is dropped or duplicated");
    });
  });

  it("never reports a three-source design as unsearchable", () => {
    assert.equal(resolveSearchGroupCount(3, 2), 2);
    assert.equal(resolveSearchGroupCount(3, null), 3);
  });
});

describe("installed-depth preservation is not a practicality bypass", () => {
  const cabinet = { widthM: 0.5, depthM: 0.3 };

  it("keeps the installed depth of a source whose depth does not change", () => {
    assert.equal(INSTALLED_DEPTH_TOLERANCE_M, 0.001);
    // A source installed tight to the wall (inside a nominal cabinet clearance).
    const installed = [{ x: 2.3, y: 0.04 }, { x: 1.05, y: 4.862 }, { x: 3.55, y: 4.782 }];
    const unchanged = installed.map((p) => ({ ...p }));
    assert.equal(validateCandidateSet(unchanged, ROOM, cabinet.widthM, cabinet.depthM,
      { baselinePositions: installed }), true);
    // The same coordinates judged with no baseline are refused — which is exactly
    // the rejection the installed-depth rule exists to avoid.
    assert.equal(validateCandidateSet(unchanged, ROOM, cabinet.widthM, cabinet.depthM), false);
  });

  it("still rejects a depth change that leaves the cabinet outside the room", () => {
    const baseline = [{ x: 2.3, y: 0.04 }];
    const moved = [{ x: 2.3, y: 5.02 }];
    assert.equal(validateCandidateSet(moved, ROOM, cabinet.widthM, cabinet.depthM,
      { baselinePositions: baseline }), false);
  });

  it("treats a moved source in the middle of the room as theoretical", () => {
    const baseline = [{ x: 2.3, y: 0.6 }, { x: 1.05, y: 4.862 }, { x: 3.55, y: 4.782 }];
    const midRoom = [{ x: 2.3, y: ROOM.lengthM / 2 }, baseline[1], baseline[2]];
    const verdict = classifyMovementPracticality({
      currentPositions: baseline, coordinates: midRoom, roomDims: ROOM,
    });
    assert.equal(verdict.practical, false);
    // A source that stays on its own wall at the wall it started on stays practical.
    const onWalls = [{ x: 2.3, y: 0 }, { x: 1.05, y: ROOM.lengthM }, { x: 3.55, y: ROOM.lengthM }];
    assert.equal(classifyMovementPracticality({
      currentPositions: baseline, coordinates: onWalls, roomDims: ROOM,
    }).practical, true);
  });
});

describe("Stage 1 quantity 3", () => {
  it("generates three-source candidates from the four practical topologies", () => {
    const { candidates, familyCoverage } = generateStage1Candidates(3);
    assert.ok(candidates.length > 0);
    assert.ok(candidates.length <= STAGE1_CANDIDATE_BUDGETS[3].normal);
    assert.equal(candidates.every((c) => c.sources.length === 3), true,
      "every candidate carries three explicit coordinates");
    THREE_SUB_ENABLED_FAMILIES.forEach((familyId) => {
      assert.ok(familyCoverage[familyId] > 0, `${familyId} generated no candidates`);
    });
    assert.ok(familyCoverage[THREE_SUB_FAMILY_IDS.THREE_BOUNDARY_CUSTOM] > 0);
    assert.equal(ENABLED_FAMILIES[3].length, THREE_SUB_ENABLED_FAMILIES.length);
  });

  it("declares its three-source search space: coarse, refined and layout", () => {
    const { candidates, familyCoverage } = generateStage1Candidates(3);
    // Coarse: every wall arrangement the four topologies can have, plus the
    // boundary fallback — comfortably inside the 64-candidate budget.
    assert.equal(candidates.length, 43);
    assert.equal(familyCoverage[THREE_SUB_FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR], 12);
    assert.equal(familyCoverage[THREE_SUB_FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE], 12);
    assert.equal(familyCoverage[THREE_SUB_FAMILY_IDS.THREE_ASYMMETRIC_REAR_PAIR], 12);
    assert.equal(familyCoverage[THREE_SUB_FAMILY_IDS.THREE_DISTRIBUTED_POSITIONS], 6);
    assert.equal(familyCoverage[THREE_SUB_FAMILY_IDS.THREE_BOUNDARY_CUSTOM], 1);
    // Refined: the two pair-capable families, nine 10 mm steps each. The
    // asymmetric and distributed arrangements have no single parameter to refine.
    const refined = THREE_SUB_ENABLED_FAMILIES.reduce((sum, familyId) =>
      sum + generateFineCandidates(familyId, { spread: 0.25, singletons: [0.5] }).length, 0);
    assert.equal(refined, 18);
  });

  it("refines the mirrored pair of each pair-capable family and nothing else", () => {
    const pairFamily = FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR;
    const best = generateStage1Candidates(3).candidates
      .filter((c) => c.familyId === pairFamily)
      .sort((a, b) => a.seedDisplacement - b.seedDisplacement)[0];
    const param = threeSubFamilyBestParam(best);
    assert.ok(param && Number.isFinite(param.spread));
    const fine = generateFineCandidates(pairFamily, param);
    assert.equal(fine.length, 9, "a 10 mm refinement either side of the spread");
    assert.equal(fine.every((c) => c.sources.length === 3), true);
    // The refined pair stays mirrored about the centre line.
    fine.forEach((c) => {
      const xs = c.sources.slice(1).map((s) => s.xNorm);
      assert.ok(Math.abs(xs[0] + xs[1] - 1) < 1e-9);
    });
    // A family with no mirrored pair has no single parameter to refine.
    assert.equal(generateFineCandidates(FAMILY_IDS.THREE_ASYMMETRIC_REAR_PAIR, param).length, 0);
    assert.equal(generateFineCandidates(FAMILY_IDS.THREE_DISTRIBUTED_POSITIONS, param).length, 0);
  });

  it("publishes a three_sub_result with three coordinates per finalist", () => {
    const result = runStage1SearchForQuantity(stage1For(3));
    assert.equal(result.quantity, 3);
    assert.equal(result.status, "complete");
    assert.ok(result.candidateCount > 0);
    assert.equal(result.aProhibitionValidation, "PASS");
    assert.ok(result.finalists.length > 0, "a three-source design has finalists");
    assert.ok(result.finalists.length <= STAGE1_FINALIST_COUNT[3]);
    result.finalists.forEach((finalist) => {
      assert.equal(finalist.sources.length, 3, "no fourth source is invented, none is dropped");
      finalist.sources.forEach((source) => {
        assert.equal(Number.isFinite(source.x), true);
        assert.equal(Number.isFinite(source.y), true);
        assert.equal(Number.isFinite(source.xNorm), true);
      });
      assert.ok(THREE_SUB_FAMILY_SET.has(finalist.familyId));
      assert.ok(finalist.screening, "each finalist carries its screening metrics");
    });
  });

  it("uses the canonical key and never aliases it to four_sub_result", () => {
    const engine = read("components/room/bass/stage1/stage1PlacementEngine.js");
    assert.match(engine, /3: "three_sub_result"/);
    assert.equal(/3:\s*"four_sub_result"/.test(engine), false);
    assert.match(engine, /quantities = \[2, 4, 1, 3\]/);
    assert.equal(STAGE1_FAMILY_POLICY_VERSION, "stage1-family-policy-v3-three-source");
  });
});

describe("Stage 1 store, hydration and cache schema carry quantity 3", () => {
  it("publishes and hydrates the three-source result", () => {
    const three = { quantity: 3, status: "complete", finalists: [{ id: "f3" }] };
    publishHydratedStage1("proj-3", "ver-3", "fp-3", {
      one_sub_result: { status: "complete", finalists: [] },
      two_sub_result: { status: "complete", finalists: [] },
      three_sub_result: three,
      four_sub_result: { status: "complete", finalists: [] },
    });
    const state = getStage1State("proj-3", "ver-3");
    assert.equal(state.three_sub_result, three);
  });

  it("names three_sub_result in every store, persistence and hydration path", () => {
    const files = [
      "components/room/bass/stage1/stage1PlacementStore.js",
      "components/room/bass/stage1/stage1PlacementPersistence.js",
      "components/room/bass/stage1/useStage1PlacementOptimiser.js",
      "components/room/bass/stage2/stage2FinalistPromotion.js",
      "components/room/bass/stage2/stage2PlacementStore.js",
      "components/room/bass/stage2/stage2PlacementPersistence.js",
      "components/room/bass/stage2/useStage2PlacementOptimiser.js",
    ];
    files.forEach((file) => {
      const source = read(file);
      const occurrences = (source.match(/three_sub_result/g) || []).length;
      assert.ok(occurrences >= 2, `${file} carries the three-source result`);
      assert.equal(/three_sub_result:\s*[^\n]*four_sub_result/.test(source), false,
        `${file} must not read or write the four-source value under the three-source key`);
      assert.equal(/3:\s*"four_sub_result"/.test(source), false);
    });
    // The A-prohibition roll-up and the cache validity check both include it.
    const persistence = read("components/room/bass/stage1/stage1PlacementPersistence.js");
    assert.match(persistence, /results\.three_sub_result\?\.aProhibitionValidation === "PASS"/);
    assert.match(persistence, /hydrated\.three_sub_result/);
  });

  it("declares three_sub_result in both cache entity schemas", () => {
    const stage1 = JSON.parse(read("../base44/entities/Stage1PlacementCache.jsonc"));
    const stage2 = JSON.parse(read("../base44/entities/Stage2PlacementCache.jsonc"));
    assert.equal(stage1.properties.three_sub_result.type, "object");
    assert.equal(stage2.properties.three_sub_result.type, "object");
  });
});

describe("Stage 2 promotes, ranks and stores the three-source quantity", () => {
  const promoted = () => {
    const stage1 = {};
    [1, 2, 4].forEach((qty) => { stage1[`${["", "one", "two", "three", "four"][qty]}_sub_result`] = { finalists: [] }; });
    stage1.three_sub_result = {
      finalists: [{ id: "t1", familyId: FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR },
        { id: "t2", familyId: FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE },
        { id: "t3", familyId: FAMILY_IDS.THREE_ASYMMETRIC_REAR_PAIR }],
    };
    return buildPromotionPlan(stage1);
  };

  it("builds a promotion plan entry for quantity 3", () => {
    const plan = promoted();
    // The normal promotion target is two finalists per quantity; the third is
    // evaluated only when Stage 2's own tie/failure rules ask for it. Quantity 3
    // is promoted by exactly the same rule as 1, 2 and 4.
    assert.equal(plan[3].length, 2);
    assert.ok(plan[3].length <= STAGE2_FINALISTS_MAX);
    assert.equal(plan[1].length, 0);
    assert.equal(plan[2].length, 0);
    assert.equal(plan[4].length, 0);
    assert.deepEqual(plan[3].map((f) => f.id), ["t1", "t2"]);
  });

  it("includes quantity 3 in the overall-best ordering", () => {
    assert.deepEqual([...STAGE2_QUANTITY_ORDER], [1, 2, 3, 4]);
  });

  it("leaves a design with no three-source finalists bit-for-bit unchanged", () => {
    const base = {
      stage1Fingerprint: "stage1-fp",
      selectedSubModel: "SUB3-12",
      subwooferBottomHeightM: 0.2,
      amplifierPowerPerSubW: 500,
    };
    const withoutKey = computeStage2PlacementFingerprint({
      ...base, stage1Finalists: { 1: [{ id: "a", familyId: "ONE_FRONT_MID" }], 2: [], 4: [] },
    });
    const withEmptyKey = computeStage2PlacementFingerprint({
      ...base, stage1Finalists: { 1: [{ id: "a", familyId: "ONE_FRONT_MID" }], 2: [], 3: [], 4: [] },
    });
    const withThree = computeStage2PlacementFingerprint({
      ...base,
      stage1Finalists: { 1: [{ id: "a", familyId: "ONE_FRONT_MID" }], 2: [], 3: [{ id: "t1", familyId: "THREE_FRONT_SINGLE_REAR_PAIR" }], 4: [] },
    });
    assert.equal(withEmptyKey, withoutKey, "an empty three-source set must not move the fingerprint");
    assert.notEqual(withThree, withoutKey, "real three-source finalists are part of the identity");
  });

  it("keeps the pre-run card and workload reporting a three-source design as searchable", () => {
    const estimate = estimateOptimiserCalculations({ instances: BARTON, roomDims: ROOM });
    assert.equal(estimate.available, true);
    assert.equal(estimate.sourceCount, 3);
    assert.equal(estimate.groups, 2);
    assert.equal(estimate.reason, null);
    const byKey = Object.fromEntries(estimate.families.map((f) => [f.key, f.count]));
    assert.equal(byKey.delay, 60);
    assert.equal(byKey.gain, 22);
    assert.equal(byKey.phase, 72);
    assert.equal(byKey.polarity, 4);
    assert.equal(byKey.placement, STAGE1_CANDIDATE_BUDGETS[3].normal);
    assert.equal(byKey.seating, 11);
    assert.equal(estimate.total, 233);

    const workload = buildOptimiserRunWorkload({ instances: BARTON, roomDims: ROOM });
    assert.equal(workload.available, true);
    const rows = Object.fromEntries(workload.rows.map((r) => [r.key, r.steps]));
    assert.equal(rows.placement, 64);
    assert.equal(rows.phase, 76, "phase and polarity are one grouped search");
    assert.equal(workload.totalSteps, 233);
    // The three-source groups, stated as the layout actually is.
    assert.equal(workload.groups, 2);
  });

  it("never maps the three-source quantity onto the four-source result", () => {
    const engine = read("components/room/bass/improveBassV2/improveBassV2Engine.js");
    assert.match(engine, /stage2Result\.three_sub_result/);
    const stage2 = read("components/room/bass/stage2/stage2PlacementStore.js");
    assert.match(stage2, /3: "three_sub_result"/);
    assert.equal(/3:\s*"four_sub_result"/.test(stage2), false);
  });
});

describe("existing quantities are untouched", () => {
  it("keeps 1-, 2- and 4-sub families free of the three-source families", () => {
    [[1, 1], [2, 2], [4, 4]].forEach(([quantity, expectedSources]) => {
      const { candidates, familyCoverage } = generateStage1Candidates(quantity);
      assert.ok(candidates.length > 0);
      assert.equal(candidates.every((c) => c.sources.length === expectedSources), true);
      assert.equal(candidates.some((c) => THREE_SUB_FAMILY_SET.has(c.familyId)), false,
        `quantity ${quantity} must not read a three-source family`);
      assert.equal(Object.keys(familyCoverage).some((id) => THREE_SUB_FAMILY_SET.has(id)), false);
      assert.ok(candidates.length <= STAGE1_CANDIDATE_BUDGETS[quantity].normal);
    });
  });

  it("keeps the two-sub and four-sub search families exactly as they were", () => {
    const two = new Set(Object.keys(generateStage1Candidates(2).familyCoverage));
    const four = new Set(Object.keys(generateStage1Candidates(4).familyCoverage));
    assert.equal([...two].some((id) => id.startsWith("THREE_")), false);
    assert.equal([...four].some((id) => id.startsWith("THREE_")), false);
    assert.equal(ENABLED_FAMILIES[2].some((id) => THREE_SUB_FAMILY_SET.has(id)), false);
    assert.equal(ENABLED_FAMILIES[4].some((id) => THREE_SUB_FAMILY_SET.has(id)), false);
    // The two-sub budget and pair rule are unchanged.
    assert.equal(STAGE1_CANDIDATE_BUDGETS[2].normal, 128);
    assert.equal(STAGE1_CANDIDATE_BUDGETS[1].normal, 96);
    assert.equal(STAGE1_CANDIDATE_BUDGETS[4].normal, 192);
    // The two-sub rule itself is unchanged: a genuine pair still suppresses
    // differential grouped timing (proved in the pair block above), and the group
    // count the estimate uses for an existing quantity is unchanged.
    assert.equal(resolveSearchGroupCount(1, null), 0);
    assert.equal(resolveSearchGroupCount(2, null), 2);
    assert.equal(resolveSearchGroupCount(4, 2), 2);
    assert.equal(STAGE1_CANDIDATE_BUDGETS[2].allocation.C_FRONT_PAIR, 48);
  });

  it("leaves the 1-, 2- and 4-sub declared totals exactly as they were", () => {
    // The same totals the ADI calculation-count suite has pinned since before the
    // three-source families existed: 107 / 297 / 361. Asserted here too, because
    // that suite needs the full matcher set and is not runnable under the local
    // focused-suite runner.
    const one = [sub("s1", "SUB3-12", 2.3, 0.6, "front")];
    const two = [
      sub("s1", "SUB3-12", 2.3, 0.6, "front"),
      sub("s2", "SUB3-12", 2.3, 4.5, "rear"),
    ];
    const four = [
      sub("s1", "SUB3-12", 1.25, 0.6, "front"),
      sub("s2", "SUB3-12", 3.35, 0.6, "front"),
      sub("s3", "SUB3-12", 1.25, 4.4, "rear"),
      sub("s4", "SUB3-12", 3.35, 4.4, "rear"),
    ];
    assert.equal(estimateOptimiserCalculations({ instances: one, roomDims: ROOM }).total, 107);
    assert.equal(estimateOptimiserCalculations({ instances: two, roomDims: ROOM }).total, 297);
    assert.equal(estimateOptimiserCalculations({ instances: four, roomDims: ROOM }).total, 361);
  });

  it("refines the existing two- and four-sub families as before", () => {
    assert.equal(generateFineCandidates(FAMILY_IDS.C_FRONT_PAIR, 0.25).length, 9);
    assert.equal(generateFineCandidates(FAMILY_IDS.RP22_C, 0.25).length, 9);
    assert.equal(generateFineCandidates(FAMILY_IDS.RP22_D, 0.25).length, 9);
    assert.equal(generateFineCandidates(FAMILY_IDS.FOUR_THIRD_PAIRS, 0.333).length, 9);
    assert.equal(generateFineCandidates(FAMILY_IDS.ONE_FRONT_MID, 0.5).length, 0);
  });
});

describe("end to end — three sources on every topology", () => {
  const cases = [
    ["one front subwoofer with a rear pair", BARTON, FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR],
    ["a front pair with one rear subwoofer", FRONT_PAIR, FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE],
    ["three asymmetric positions", ASYMMETRIC, FAMILY_IDS.THREE_ASYMMETRIC_REAR_PAIR],
  ];

  cases.forEach(([label, instances, familyId]) => {
    it(`stages a genuine three-source layout end to end for ${label}`, () => {
      // Stage 1 publishes.
      const result = runStage1SearchForQuantity(stage1For(3, instances));
      assert.ok(result.finalists.length > 0);
      // Stage 2 promotes what Stage 1 published — the same object, no re-derivation.
      const plan = buildPromotionPlan({ three_sub_result: { finalists: result.finalists } });
      assert.ok(plan[3].length > 0, "a three-source finalist is promoted");
      // Every promoted candidate keeps all three coordinates, in the design's own
      // source order, and stays inside the room.
      plan[3].forEach((finalist) => {
        assert.equal(finalist.sources.length, 3);
        finalist.sources.forEach((source) => {
          assert.ok(source.x >= 0 && source.x <= ROOM.widthM + 1e-9);
          assert.ok(source.y >= 0 && source.y <= ROOM.lengthM + 1e-9);
        });
      });
      // A physical recommendation can be produced: the design's own topology
      // finalist is a practical wall arrangement for this design.
      const matched = result.finalists.find((f) => f.familyId === familyId);
      assert.ok(matched, `${familyId} produced a finalist for this topology`);
      const baseline = instances.map((s) => ({ x: s.position.x, y: s.position.y }));
      const coordinates = matched.sources.map((s) => ({ x: s.x, y: s.y }));
      const verdict = classifyMovementPracticality({
        currentPositions: baseline, coordinates, roomDims: ROOM,
      });
      assert.equal(verdict.practical, true, verdict.reason || "expected a practical arrangement");
      // And the group the design already has is the group the candidate keeps.
      const grouping = detectSubwooferGroups(instances, ROOM);
      assert.equal(grouping.groups.flatMap((g) => g.sourceIds).length, 3);
    });
  });
});