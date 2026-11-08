// stage2-candidate-eligibility.test.mjs
// Focused tests for the canonical recommendation-eligibility gate and the
// Apply safeguard that blocks physically invalid ADI subwoofer recommendations.
//
// The confirmed failure (Room C, ~6 × 10 × 3 m): an RP22_E four-subwoofer
// candidate failed its own physical-validity assessment (front-left cabinet
// ~0.37 m outside the room), yet received a ranking tuple and became the
// recommended four-sub arrangement with an enabled Apply action.
//
// These tests confirm:
//   1. A rejected arrangement cannot become bestFinalist.
//   2. It remains visible in diagnostic evidence (rejectedCandidates) with its
//      physical rejection reason.
//   3. The practical selector does not override physical eligibility.
//   4. The card cannot enable Apply for the invalid candidate.
//   5. The Apply authority rejects the same candidate even if invoked directly.
//   6. A valid alternative can still be selected if one exists.
//   7. If none exists, the recommendation honestly reports no eligible layout.
//   8. Rooms A and B retain their valid candidates and unchanged evidence.
//   9. Existing 1/2/4-subwoofer Apply and Restore behaviour remains intact.
//
// Run: node --import ./test/_alias-register.mjs --test test/stage2-candidate-eligibility.test.mjs

import assert from "node:assert/strict";

import {
  candidateRecommendationEligibility,
  isCandidateEligibleForRecommendation,
  resultEvidenceIsValid,
} from "../src/components/room/bass/stage2/stage2CandidateEligibility.js";
import { Stage2PlacementController } from "../src/components/room/bass/stage2/stage2PlacementStore.js";
import {
  resolveQuantityApplyState,
  buildQuantityApplyInstances,
} from "../src/components/room/bass/optimiserPlan/quantityPlacementApplyAuthority.js";
import { buildEvaluatedOption } from "../src/components/room/bass/bda/evaluatedOptionPresentation.js";

const seatPriorityMap = new Map([
  ["seat-1", "primary"],
  ["seat-2", "primary"],
]);

const context = {
  roomDims: { widthM: 6, lengthM: 10, heightM: 3 },
  selectedSubModel: "SUB3-12",
  subwooferBottomHeightM: 0.05,
};

// ── Helpers ─────────────────────────────────────────────────────────────

// A valid Stage 2 confirmation result (eligible). Room C dimensions.
function makeValidResult(overrides = {}) {
  return {
    finalistId: "valid-f",
    familyId: "FOUR_THIRD_PAIRS",
    quantity: 4,
    coordinates: [
      { x: 1.0, y: 0.3 },
      { x: 5.0, y: 0.3 },
      { x: 1.0, y: 9.7 },
      { x: 5.0, y: 9.7 },
    ],
    selectedProduct: "SUB3-12",
    requestedP14Pass: true,
    terminal: false,
    physicalRejection: null,
    physicalValidation: { passed: true },
    achievedP19Level: 3,
    achievedP19VariationDb: 2.5,
    achievedP20VariationDb: 3.0,
    perSeatP19: [
      { seatId: "seat-1", isPrimary: true, level: 3, variationDbRaw: 2.1 },
      { seatId: "seat-2", isPrimary: true, level: 3, variationDbRaw: 2.3 },
    ],
    perSeatP20: [
      { seatId: "seat-1", isPrimary: true, level: 2, variationDbRaw: 3.4 },
      { seatId: "seat-2", isPrimary: true, level: 2, variationDbRaw: 3.1 },
    ],
    rankingData: {
      rankingTuple: [0, 2, 0, 0, -2, -3, 0, 0, 0, 0, 0, 0, 0, 0, -3, 0, 0, "k"],
      primarySummary: { seats: [{ seatId: "seat-1", p20Level: 2 }, { seatId: "seat-2", p20Level: 2 }] },
      secondarySummary: { seats: [] },
    },
    ...overrides,
  };
}

// The Room C RP22_E candidate: physically rejected (front-left cabinet
// ~0.37 m outside the room). It STILL receives a degenerate ranking tuple
// from buildStage2RankingTuple (no per-seat evidence → zero failing seats),
// which is exactly why it could become bestFinalist before the eligibility
// gate. It carries physicalRejection + physicalValidation.passed=false +
// terminal, matching the real evaluateStage2Confirmation output shape.
function makeRejectedResult(overrides = {}) {
  return {
    finalistId: "rp22-e-rejected",
    familyId: "RP22_E",
    quantity: 4,
    coordinates: [
      { x: -0.37, y: 0.3 }, // ~0.37 m outside the left wall
      { x: 5.0, y: 0.3 },
      { x: 1.0, y: 9.7 },
      { x: 5.0, y: 9.7 },
    ],
    selectedProduct: "SUB3-12",
    physicalRejection: {
      passed: false,
      reason: "cabinet-boundary-violation",
      violations: ["left-wall-intersection"],
    },
    physicalValidation: { passed: false, reason: "cabinet-boundary-violation" },
    terminal: true,
    // Degenerate ranking tuple — the defect vector. buildStage2RankingTuple
    // produces this for a result with no per-seat evidence.
    rankingData: {
      rankingTuple: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "rej"],
      primarySummary: { seats: [] },
      secondarySummary: { seats: [] },
    },
    ...overrides,
  };
}

// Build a controller with completedResults set directly, then snapshot it.
function snapshotWith(completedResults) {
  const controller = new Stage2PlacementController();
  controller.completedResults = completedResults;
  controller.placementFingerprint = null; // practicalGetRawTransfer returns null
  return controller.buildResultsSnapshot();
}

// ── 1. candidateRecommendationEligibility ───────────────────────────────
{
  assert.ok(isCandidateEligibleForRecommendation(makeValidResult()),
    "a valid result is eligible");
  assert.ok(!isCandidateEligibleForRecommendation(makeRejectedResult()),
    "a physically rejected result is NOT eligible");
  assert.ok(!isCandidateEligibleForRecommendation(makeValidResult({ terminal: true })),
    "a terminal result is NOT eligible");
  assert.ok(!isCandidateEligibleForRecommendation(makeValidResult({ physicalRejection: { reason: "cabinet-overlap-violation" } })),
    "an overlap-rejected result is NOT eligible");
  assert.ok(!isCandidateEligibleForRecommendation(makeValidResult({ physicalValidation: { passed: false, reason: "x" } })),
    "a result with physicalValidation.passed=false is NOT eligible");
  assert.ok(!isCandidateEligibleForRecommendation(makeValidResult({ requestedP14Pass: false })),
    "a result that failed the P14 operating point is NOT eligible");
  assert.ok(!isCandidateEligibleForRecommendation(makeValidResult({ achievedP19Level: null })),
    "a result with no P19 level is NOT eligible");
  assert.ok(!isCandidateEligibleForRecommendation({ ...makeValidResult(), rankingData: {} }),
    "a result with no ranking tuple is NOT eligible");

  const verdict = candidateRecommendationEligibility(makeRejectedResult());
  assert.equal(verdict.eligible, false);
  assert.equal(verdict.reason, "cabinet-boundary-violation",
    "rejected candidate keeps its original physical rejection reason");
}

// ── 2. resultEvidenceIsValid (single authority, re-exported) ───────────
{
  assert.ok(resultEvidenceIsValid(makeValidResult()), "valid result evidence is valid");
  assert.ok(!resultEvidenceIsValid(makeRejectedResult()), "rejected result evidence is invalid");
}

// ── 3. Rejected candidate cannot become bestFinalist; kept in diagnostics
{
  const snapshot = snapshotWith({ 4: [makeRejectedResult(), makeValidResult()] });
  const four = snapshot.four_sub_result;
  assert.ok(four, "four_sub_result present");
  assert.equal(four.bestFinalist.finalistId, "valid-f",
    "TEST 1: the rejected RP22_E arrangement cannot become bestFinalist");
  assert.equal(four.finalistCount, 1, "only the eligible candidate is in the ranked set");
  assert.ok(Array.isArray(four.rejectedCandidates) && four.rejectedCandidates.length === 1,
    "TEST 2: rejected candidate remains in diagnostic evidence");
  assert.equal(four.rejectedCandidates[0].finalistId, "rp22-e-rejected");
  assert.equal(four.rejectedCandidates[0].eligibilityReason, "cabinet-boundary-violation",
    "TEST 2: rejected candidate carries its original physical rejection reason");
  // evaluatedFinalists stays the eligible ranked set (downstream consumers
  // only ever see physically/e evidentially valid candidates).
  assert.equal(four.evaluatedFinalists.length, 1);
  assert.equal(four.evaluatedFinalists[0].finalistId, "valid-f");
}

// ── 4. Practical selector does not override physical eligibility ───────
// The rejected candidate is a conventional front/rear family (RP22_E). Before
// the gate it could win on family preference over a side-wall candidate. With
// the gate it is excluded entirely, so the practical selector only sees the
// eligible pool.
{
  const sideEligible = makeValidResult({ finalistId: "side-d", familyId: "RP22_D" });
  const snapshot = snapshotWith({ 4: [makeRejectedResult(), sideEligible] });
  assert.equal(snapshot.four_sub_result.bestFinalist.finalistId, "side-d",
    "TEST 3: the practical selector chooses from the eligible pool only — the rejected conventional candidate cannot win on family");
}

// ── 5. No eligible candidate → bestFinalist null, honest empty recommendation
{
  const snapshot = snapshotWith({ 4: [makeRejectedResult()] });
  assert.equal(snapshot.four_sub_result.bestFinalist, null,
    "TEST 7: no eligible candidate → no actionable recommendation");
  assert.equal(snapshot.four_sub_result.finalistCount, 0);
  assert.ok(snapshot.four_sub_result.rejectedCandidates.length === 1,
    "the rejected candidate is still preserved in diagnostics");
}

// ── 6. Rooms A and B retain valid candidates and unchanged evidence ────
// A valid 1/2/4 run (no rejected candidates) is unchanged.
{
  const snapshot = snapshotWith({
    1: [makeValidResult({ finalistId: "a1", quantity: 1, coordinates: [{ x: 3, y: 0.3 }] })],
    2: [makeValidResult({ finalistId: "b2", quantity: 2, coordinates: [{ x: 2, y: 0.3 }, { x: 4, y: 0.3 }] })],
    4: [makeValidResult({ finalistId: "b4", quantity: 4 })],
  });
  assert.equal(snapshot.one_sub_result.bestFinalist.finalistId, "a1");
  assert.equal(snapshot.two_sub_result.bestFinalist.finalistId, "b2");
  assert.equal(snapshot.four_sub_result.bestFinalist.finalistId, "b4");
  for (const q of ["one_sub_result", "two_sub_result", "four_sub_result"]) {
    assert.equal(snapshot[q].rejectedCandidates.length, 0,
      "TEST 8: valid rooms have no rejected candidates");
    assert.equal(snapshot[q].finalistCount, snapshot[q].evaluatedFinalists.length,
      "TEST 8: eligible evidence is unchanged");
  }
}

// ── 7. Card cannot enable Apply for the invalid candidate ──────────────
// The option built from a rejected result has valid=false, terminal=true,
// physicalRejection=true → canApplyOption must be false.
{
  const option = buildEvaluatedOption(makeRejectedResult(), seatPriorityMap, context);
  assert.ok(option, "option built from rejected result");
  assert.equal(option.valid, false, "rejected result → option.valid false");
  assert.equal(option.terminal, true);
  assert.equal(option.physicalRejection, true);
  // Mirror the card's canApplyOption gate.
  const canApply = Boolean(option && option.valid && !option.terminal && !option.physicalRejection);
  assert.equal(canApply, false,
    "TEST 4: the card cannot enable Apply for the invalid candidate");
}

// ── 8. Apply authority rejects the invalid candidate even if invoked directly
{
  const option = buildEvaluatedOption(makeRejectedResult(), seatPriorityMap, context);
  const coords = option.coordinates.map((c) => ({ x: c.x, y: c.y, placement: c.placement }));
  const rejected = resolveQuantityApplyState({
    candidateFingerprint: "fp",
    currentFingerprint: "fp",
    coordinates: coords,
    quantity: 4,
    option,
    roomDims: context.roomDims,
    model: option.model,
  });
  assert.equal(rejected.canApply, false,
    "TEST 5: Apply authority rejects the invalid candidate independently");
  assert.equal(rejected.blockReason, "terminal-candidate",
    "the rejection reason identifies the terminal/physical rejection");

  // Even without the option flags, the independent boundary re-check catches
  // the out-of-bounds cabinet.
  const boundaryRejected = resolveQuantityApplyState({
    candidateFingerprint: "fp",
    currentFingerprint: "fp",
    coordinates: coords,
    quantity: 4,
    roomDims: context.roomDims,
    model: "SUB3-12",
  });
  assert.equal(boundaryRejected.canApply, false,
    "TEST 5: the independent boundary re-check rejects out-of-bounds cabinet geometry");
  assert.equal(boundaryRejected.blockReason, "cabinet-boundary-violation");
}

// ── 9. A valid alternative can still be selected ──────────────────────
{
  const option = buildEvaluatedOption(makeValidResult(), seatPriorityMap, context);
  const canApply = Boolean(option && option.valid && !option.terminal && !option.physicalRejection);
  assert.equal(canApply, true,
    "TEST 6: a valid alternative can still be selected and applied");
  const applyState = resolveQuantityApplyState({
    candidateFingerprint: "fp",
    currentFingerprint: "fp",
    coordinates: option.coordinates.map((c) => ({ x: c.x, y: c.y, placement: c.placement })),
    quantity: 4,
    option,
    roomDims: context.roomDims,
    model: option.model,
  });
  assert.equal(applyState.canApply, true,
    "TEST 6: Apply authority permits a valid alternative");
}

// ── 10. Existing 1/2/4 Apply + Restore behaviour remains intact ───────
// buildQuantityApplyInstances still produces a complete one-to-one match for a
// valid 1→2→4→1 transition, and resolveQuantityApplyState still passes for a
// plain valid candidate without option/roomDims (backward compatibility).
{
  const FRONT = [
    { x: 1.0, y: 0.3, placement: "front" },
    { x: 5.0, y: 0.3, placement: "front" },
  ];
  const REAR = [
    { x: 1.0, y: 9.7, placement: "rear" },
    { x: 5.0, y: 9.7, placement: "rear" },
  ];
  const FOUR = [...FRONT, ...REAR];
  const DEFAULTS = { model: "SUB3-12", bottomHeightM: 0.05, frontOrientation: "vertical", rearOrientation: "vertical" };

  const one = [{ id: "a", model: "SUB3-12", enabled: true, position: { x: 1.0, y: 0.3 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: "vertical", legacyGroup: "front" }];
  const r12 = buildQuantityApplyInstances({ coordinates: FRONT, quantity: 2, instances: one, defaults: DEFAULTS, frontCoords: FRONT, rearCoords: [] });
  assert.equal(r12.valid, true, "TEST 9: 1→2 Apply valid");
  const r24 = buildQuantityApplyInstances({ coordinates: FOUR, quantity: 4, instances: r12.instances, defaults: DEFAULTS, frontCoords: FRONT, rearCoords: REAR });
  assert.equal(r24.valid, true, "TEST 9: 2→4 Apply valid");
  const single = [{ x: 1.0, y: 0.3, placement: "front" }];
  const r41 = buildQuantityApplyInstances({ coordinates: single, quantity: 1, instances: r24.instances, defaults: DEFAULTS, frontCoords: single, rearCoords: [] });
  assert.equal(r41.valid, true, "TEST 9: 4→1 Apply valid");

  // Backward compatibility: resolveQuantityApplyState without option/roomDims
  // still passes for a plain valid candidate.
  const plain = resolveQuantityApplyState({
    candidateFingerprint: "fp",
    currentFingerprint: "fp",
    coordinates: FOUR,
    quantity: 4,
  });
  assert.equal(plain.canApply, true, "TEST 9: plain Apply state backward compatible");
}

console.log("stage2-candidate-eligibility: all checks passed");