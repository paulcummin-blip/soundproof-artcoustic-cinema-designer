// test/optimiser-authority-repair.test.mjs
// Regression tests for the three confirmed optimiser authority defects found
// in the Luxavo audit:
//
// 1. Restore the global Stage 2 candidate pool
//    Stage 2 publishes `evaluatedFinalists` but the downstream optimiser consumed
//    `finalists`, so zero global Stage 2 challengers reached final optimisation.
//
// 2. Make graded tuning equal applied tuning
//    The optimiser grades manual delays, but after Apply, automatic arrival
//    alignment adds additional delays. Fix: V2 delays are the final effective
//    delays; auto-align is bypassed for V2-applied instances.
//
// 3. Enforce the material-improvement gate
//    A candidate can fail the optimiser's own material-improvement test and
//    still become the visible recommendation. Fix: reject non-material winners.
//
// Run: node --import ./test/_alias-register.mjs test/optimiser-authority-repair.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { gatherCandidates } from "@/components/room/bass/improveBassV2/improveBassV2Engine";
import { selectWinnerWithProtection } from "@/components/room/bass/improveBassV2/improveBassV2Engine";
import { buildOptimisedInstances } from "@/components/room/bass/improveBassV2/improveBassV2Apply";
import { buildAuthoritativeAutoAlignDelays } from "@/components/room/bass/useAuthoritativeBassResponse";
import { isMaterialImprovement } from "@/components/room/bass/improveBassV2/materialityGate";

// ── Helpers ──────────────────────────────────────────────────────────────

const ROOM_DIMS = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };

function makeEvaluatedFinalist(finalistId, coords, familyId = "test-family") {
  return {
    finalistId,
    familyId,
    quantity: coords.length,
    coordinates: coords,
    achievedP19VariationDb: 5.0,
    achievedP20VariationDb: 7.0,
    achievedP19Level: "L2",
    achievedP20Level: "L1",
    perSeatP19: [],
    perSeatP20: [],
    rankingData: { rankingTuple: [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  };
}

function makeSubwooferInstances(positions, tuning = []) {
  return positions.map((pos, i) => ({
    id: `sub-${i + 1}`,
    model: "SUB2-12",
    enabled: true,
    position: { x: pos.x, y: pos.y },
    bottomHeightM: 0,
    rotationDeg: 0,
    delayMs: tuning[i]?.delayMs || 0,
    gainDb: tuning[i]?.gainDb || 0,
    polarity: tuning[i]?.polarity || 0,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFECT 1: Restore the global Stage 2 candidate pool
// ═══════════════════════════════════════════════════════════════════════════

test("DEFECT 1: gatherCandidates returns non-empty pool when Stage 2 publishes evaluatedFinalists", () => {
  // Current design: 2 subs at mid-room
  const currentInstances = makeSubwooferInstances([
    { x: 1.0, y: 3.0 },
    { x: 3.5, y: 3.0 },
  ]);

  // Stage 2 result with evaluatedFinalists (the canonical field name)
  const stage2Result = {
    one_sub_result: null,
    two_sub_result: {
      quantity: 2,
      evaluatedFinalists: [
        makeEvaluatedFinalist("front-midpair", [
          { x: 1.0, y: 0.5 },
          { x: 3.5, y: 0.5 },
        ]),
        makeEvaluatedFinalist("rear-midpair", [
          { x: 1.0, y: 5.5 },
          { x: 3.5, y: 5.5 },
        ]),
        makeEvaluatedFinalist("midwall-midpair", [
          { x: 0.5, y: 3.0 },
          { x: 4.0, y: 3.0 },
        ]),
      ],
      bestFinalist: null,
      finalistCount: 3,
    },
    four_sub_result: null,
  };

  const candidates = gatherCandidates({
    subwooferInstances: currentInstances,
    roomDims: ROOM_DIMS,
    stage2Result,
    placementFingerprint: null,
  });

  // BEFORE fix: candidates was [] because extractStage2Finalists read `finalists`
  //            (undefined) instead of `evaluatedFinalists`.
  // AFTER fix: candidates contains all 3 evaluated finalists (none match current).
  assert.ok(candidates.length > 0, "Stage 2 evaluatedFinalists must produce non-empty candidate pool");
  assert.equal(candidates.length, 3, "All 3 evaluated finalists should become candidates");
  assert.ok(
    candidates.every((c) => c.id && c.finalist?.sources?.length === 2),
    "Each candidate must have id and finalist.sources with correct quantity",
  );
});

test("DEFECT 1: gatherCandidates returns empty pool when Stage 2 uses old `finalists` field (backward compat)", () => {
  const currentInstances = makeSubwooferInstances([
    { x: 1.0, y: 3.0 },
    { x: 3.5, y: 3.0 },
  ]);

  // Stage 2 result with the OLD `finalists` field (should NOT be read)
  const stage2Result = {
    two_sub_result: {
      finalists: [
        { id: "old-format", sources: [{ xNorm: 0.2, yNorm: 0.1 }, { xNorm: 0.8, yNorm: 0.1 }] },
      ],
    },
  };

  const candidates = gatherCandidates({
    subwooferInstances: currentInstances,
    roomDims: ROOM_DIMS,
    stage2Result,
    placementFingerprint: null,
  });

  assert.equal(candidates.length, 0, "Old `finalists` field must not be read — only `evaluatedFinalists`");
});

test("DEFECT 1: gatherCandidates excludes candidates matching current placement", () => {
  const currentInstances = makeSubwooferInstances([
    { x: 1.0, y: 0.5 },
    { x: 3.5, y: 0.5 },
  ]);

  const stage2Result = {
    two_sub_result: {
      evaluatedFinalists: [
        // This one matches current — should be excluded
        makeEvaluatedFinalist("current-match", [
          { x: 1.0, y: 0.5 },
          { x: 3.5, y: 0.5 },
        ]),
        // This one is different — should be included
        makeEvaluatedFinalist("rear-midpair", [
          { x: 1.0, y: 5.5 },
          { x: 3.5, y: 5.5 },
        ]),
      ],
    },
  };

  const candidates = gatherCandidates({
    subwooferInstances: currentInstances,
    roomDims: ROOM_DIMS,
    stage2Result,
    placementFingerprint: null,
  });

  assert.equal(candidates.length, 1, "Current-matching candidate must be excluded");
  assert.equal(candidates[0].id, "rear-midpair");
});

// ═══════════════════════════════════════════════════════════════════════════
// DEFECT 2: Make graded tuning equal applied tuning
// ═══════════════════════════════════════════════════════════════════════════

test("DEFECT 2: buildOptimisedInstances marks active instances with tuningSource=v2-optimised", () => {
  const winner = {
    positionCoordinates: [
      { x: 1.0, y: 0.5 },
      { x: 3.5, y: 0.5 },
    ],
    appliedTuning: [
      { delayMs: 0, gainDb: 0, polarity: 0 },
      { delayMs: 10, gainDb: -3, polarity: -1 },
    ],
  };

  const currentInstances = makeSubwooferInstances([
    { x: 2.0, y: 3.0 },
    { x: 2.5, y: 3.0 },
  ]);

  const result = buildOptimisedInstances(winner, currentInstances, ROOM_DIMS, "SUB2-12");

  assert.equal(result.length, 2, "All instances preserved");
  assert.ok(
    result.every((inst) => inst.tuningSource === "v2-optimised"),
    "Every active instance must carry tuningSource=v2-optimised so production engine bypasses auto-align",
  );
  // Verify delays are exactly what was graded
  assert.equal(result[0].delayMs, 0);
  assert.equal(result[1].delayMs, 10);
  assert.equal(result[1].gainDb, -3);
  assert.equal(result[1].polarity, -1);
});

test("DEFECT 2: buildOptimisedInstances preserves disabled instances without V2 flag", () => {
  const winner = {
    positionCoordinates: [{ x: 1.0, y: 0.5 }],
    appliedTuning: [{ delayMs: 5, gainDb: 0, polarity: 0 }],
  };

  const currentInstances = [
    ...makeSubwooferInstances([{ x: 2.0, y: 3.0 }]),
    {
      id: "disabled-sub",
      model: "SUB2-12",
      enabled: false,
      position: { x: 0, y: 0 },
      bottomHeightM: 0,
      rotationDeg: 0,
      delayMs: 0,
      gainDb: 0,
      polarity: 0,
    },
  ];

  const result = buildOptimisedInstances(winner, currentInstances, ROOM_DIMS, "SUB2-12");

  assert.equal(result.length, 2, "Disabled instance preserved");
  const active = result.find((i) => i.enabled !== false);
  const disabled = result.find((i) => i.enabled === false);
  assert.equal(active.tuningSource, "v2-optimised", "Active instance has V2 flag");
  assert.equal(disabled.tuningSource, undefined, "Disabled instance does NOT have V2 flag");
});

test("DEFECT 2: buildAuthoritativeAutoAlignDelays returns {} when V2 tuning is applied", () => {
  const rspPosition = { x: 2.25, y: 3.0, z: 1.2 };

  const frontSubsLive = [
    {
      id: "front-sub-left",
      position: { x: 1.0, y: 0.5, z: 0.35 },
      delayMs: 0,
      tuningSource: "v2-optimised",
    },
    {
      id: "front-sub-right",
      position: { x: 3.5, y: 0.5, z: 0.35 },
      delayMs: 10,
      tuningSource: "v2-optimised",
    },
  ];

  // WITH V2 flag — auto-align must be bypassed
  const delays = buildAuthoritativeAutoAlignDelays({
    enabled: true,
    rspPosition,
    frontSubsLive,
    rearSubsLive: [],
    frontSubsCfg: null,
    rearSubsCfg: null,
  });

  assert.deepEqual(delays, {}, "Auto-align must return empty (bypassed) when V2 tuning is applied");
});

test("DEFECT 2: buildAuthoritativeAutoAlignDelays returns delays when V2 tuning is NOT applied", () => {
  const rspPosition = { x: 2.25, y: 3.0, z: 1.2 };

  const frontSubsLive = [
    {
      id: "front-sub-left",
      position: { x: 1.0, y: 0.5, z: 0.35 },
      delayMs: 0,
      // No tuningSource — production default (auto-align active)
    },
    {
      id: "front-sub-right",
      position: { x: 3.5, y: 0.5, z: 0.35 },
      delayMs: 0,
    },
  ];

  const delays = buildAuthoritativeAutoAlignDelays({
    enabled: true,
    rspPosition,
    frontSubsLive,
    rearSubsLive: [],
    frontSubsCfg: null,
    rearSubsCfg: null,
  });

  assert.ok(Object.keys(delays).length > 0, "Auto-align must produce delays when V2 tuning is NOT applied");
});

test("DEFECT 2: graded effective delays == post-Apply effective delays", () => {
  // Simulate the full cycle:
  // 1. V2 optimiser grades delays [0, 10] ms on raw transfers (with embedded arrivals)
  // 2. Apply writes [0, 10] ms to instances with tuningSource=v2-optimised
  // 3. Production engine bypasses auto-align → effective delays = [0, 10] ms
  // 4. Graded == Applied ✓

  const gradedDelays = [0, 10];
  const winner = {
    positionCoordinates: [
      { x: 1.0, y: 0.5 },
      { x: 3.5, y: 0.5 },
    ],
    appliedTuning: gradedDelays.map((d) => ({ delayMs: d, gainDb: 0, polarity: 0 })),
  };

  const currentInstances = makeSubwooferInstances([
    { x: 2.0, y: 3.0 },
    { x: 2.5, y: 3.0 },
  ]);

  // Apply
  const appliedInstances = buildOptimisedInstances(winner, currentInstances, ROOM_DIMS, "SUB2-12");

  // Extract the effective delays the production engine would use
  const rspPosition = { x: 2.25, y: 3.0, z: 1.2 };
  const frontSubsLive = appliedInstances.map((inst) => ({
    id: inst.id,
    position: { ...inst.position, z: 0.35 },
    delayMs: inst.delayMs,
    tuningSource: inst.tuningSource,
  }));

  const autoAlignDelays = buildAuthoritativeAutoAlignDelays({
    enabled: true,
    rspPosition,
    frontSubsLive,
    rearSubsLive: [],
    frontSubsCfg: null,
    rearSubsCfg: null,
  });

  // Effective delay = manual + auto-align. With V2 bypass, auto-align = 0.
  const effectiveDelays = appliedInstances.map((inst, i) => {
    const autoKey = `front-sub-${i === 0 ? "left" : "right"}`;
    return (Number(inst.delayMs) || 0) + (Number(autoAlignDelays[autoKey]) || 0);
  });

  // The graded delays must equal the post-Apply effective delays
  assert.deepEqual(
    effectiveDelays,
    gradedDelays,
    "Graded effective delays must equal post-Apply effective delays for every sub",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// DEFECT 3: Enforce the material-improvement gate
// ═══════════════════════════════════════════════════════════════════════════

function makeAuthorityResult({ p19Level, p20Level, p19Db, p20Db, perSeatP19 = [], perSeatP20 = [] }) {
  return {
    assessmentStartHz: 26, assessmentEndHz: 151, achievedP18Hz: 26, p18AchievedLevel: 2,
    p14AchievedDb: 119, p14AchievedLevel: 4, p14TargetDb: 115, operatingOutputDb: 115, requestedP14Pass: true,
    physicalValidation: {passed:true}, timingVersion: "stage2-canonical-v6-delay-lag",
    canonicalAuthorityReceipt: {selectedCandidateId:"test-canonical",postEqCurveSignature:"test-curve"},
    achievedP19Level: p19Level,
    achievedP20Level: p20Level,
    achievedP19VariationDb: p19Db,
    achievedP20VariationDb: p20Db,
    perSeatP19,
    perSeatP20,
  };
}

function makePrimarySeat(seatId, variationDbRaw, level) {
  return { seatId, isPrimary: true, variationDbRaw, level };
}

test("DEFECT 3: best-ranked candidate PASSES materiality → recommendation allowed", () => {
  const existingAuthority = makeAuthorityResult({
    p19Level: "L1",
    p20Level: "L1",
    p19Db: 5.8,
    p20Db: 12.0,
    perSeatP19: [makePrimarySeat("seat-1", 5.8, "L1")],
    perSeatP20: [makePrimarySeat("seat-1", 12.0, "L1")],
  });

  // Candidate improves P19 level L1→L2 (material via path A)
  const winnerResult = makeAuthorityResult({
    p19Level: "L2",
    p20Level: "L1",
    p19Db: 4.8,
    p20Db: 12.0,
    perSeatP19: [makePrimarySeat("seat-1", 4.8, "L2")],
    perSeatP20: [makePrimarySeat("seat-1", 12.0, "L1")],
  });

  const matCheck = isMaterialImprovement(existingAuthority, winnerResult);
  assert.equal(matCheck.material, true, "Level improvement L1→L2 must be material");

  // selectWinnerWithProtection must return the winner
  const snapshot = {
    positions: [{ x: 1.0, y: 0.5 }, { x: 3.5, y: 0.5 }],
    instanceIds: ["sub-1", "sub-2"],
    tuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }, { delayMs: 10, gainDb: 0, polarity: 0 }],
  };

  const selection = selectWinnerWithProtection(
    [{ ...winnerResult, candidateId: "challenger-1", isCurrent: false }],
    snapshot,
    existingAuthority,
  );

  assert.equal(selection.isCurrent, false, "Material candidate must be recommended");
  assert.ok(selection.winner, "Winner must be present for material candidate");
});

test("DEFECT 3: best-ranked candidate FAILS materiality → no recommendation", () => {
  const existingAuthority = makeAuthorityResult({
    p19Level: "L2",
    p20Level: "L1",
    p19Db: 4.8,
    p20Db: 7.0,
    perSeatP19: [makePrimarySeat("seat-1", 4.8, "L2")],
    perSeatP20: [makePrimarySeat("seat-1", 7.0, "L1")],
  });

  // Candidate: same levels, only 0.3 dB improvement (below 1.0 dB threshold)
  const winnerResult = makeAuthorityResult({
    p19Level: "L2",
    p20Level: "L1",
    p19Db: 4.5,
    p20Db: 7.0,
    perSeatP19: [makePrimarySeat("seat-1", 4.5, "L2")],
    perSeatP20: [makePrimarySeat("seat-1", 7.0, "L1")],
  });

  const matCheck = isMaterialImprovement(existingAuthority, winnerResult);
  assert.equal(matCheck.material, false, "0.3 dB improvement with same levels must NOT be material");

  const snapshot = {
    positions: [{ x: 1.0, y: 0.5 }, { x: 3.5, y: 0.5 }],
    instanceIds: ["sub-1", "sub-2"],
    tuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }, { delayMs: 10, gainDb: 0, polarity: 0 }],
  };

  const selection = selectWinnerWithProtection(
    [{ ...winnerResult, candidateId: "challenger-1", isCurrent: false }],
    snapshot,
    existingAuthority,
  );

  // BEFORE fix: selection.winner was set (non-material candidate recommended)
  // AFTER fix: selection.winner is null, message is "No verified material automatic improvement found"
  assert.equal(selection.isCurrent, true, "Non-material candidate must NOT be recommended");
  assert.equal(selection.winner, null, "Winner must be null for non-material candidate");
  assert.equal(
    selection.message,
    "Valid changes were below the material-improvement threshold.",
    "A completed valid 0.3 dB change is below materiality, not incomplete",
  );
});

test("DEFECT 3: worse P20 cannot be hidden by a small P19 improvement to one front seat", () => {
  const existingAuthority = makeAuthorityResult({
    p19Level: "L2",
    p20Level: "L2",
    p19Db: 4.8,
    p20Db: 6.0,
    perSeatP19: [
      makePrimarySeat("seat-1", 4.8, "L2"),
      makePrimarySeat("seat-2", 5.5, "L2"),
    ],
    perSeatP20: [
      makePrimarySeat("seat-1", 6.0, "L2"),
      makePrimarySeat("seat-2", 6.5, "L2"),
    ],
  });

  // Candidate: P19 improves 0.4 dB on seat-1, but P20 worsens from L2 to L1
  // on seat-2. The canonical materiality gate must reject this — a worse P20
  // level on any primary seat is a regression, not a material improvement.
  const winnerResult = makeAuthorityResult({
    p19Level: "L2",
    p20Level: "L1", // P20 level DROPPED
    p19Db: 4.6,
    p20Db: 8.0,
    perSeatP19: [
      makePrimarySeat("seat-1", 4.6, "L2"),
      makePrimarySeat("seat-2", 5.5, "L2"),
    ],
    perSeatP20: [
      makePrimarySeat("seat-1", 6.0, "L2"),
      makePrimarySeat("seat-2", 8.0, "L1"), // P20 regressed L2→L1
    ],
  });

  const matCheck = isMaterialImprovement(existingAuthority, winnerResult);
  assert.equal(matCheck.material, false, "Worse P20 level must not be hidden by small P19 improvement");

  const snapshot = {
    positions: [{ x: 1.0, y: 0.5 }, { x: 3.5, y: 0.5 }],
    instanceIds: ["sub-1", "sub-2"],
    tuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }, { delayMs: 10, gainDb: 0, polarity: 0 }],
  };

  const selection = selectWinnerWithProtection(
    [{ ...winnerResult, candidateId: "challenger-1", isCurrent: false }],
    snapshot,
    existingAuthority,
  );

  assert.equal(selection.isCurrent, true, "Candidate with P20 regression must not be recommended");
  assert.equal(selection.winner, null);
});