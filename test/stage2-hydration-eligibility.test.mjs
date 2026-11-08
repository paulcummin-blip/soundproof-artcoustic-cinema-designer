// test/stage2-hydration-eligibility.test.mjs
// Focused regression tests for the Stage 2 hydration eligibility defect.
//
// publishHydratedStage2 previously copied a saved Stage 2 cache verbatim, so a
// historical invalid bestFinalist — e.g. a physically rejected RP22_E four-sub
// arrangement (cabinet-boundary-violation / left-wall-intersection) that
// pre-dated the eligibility gate — was restored as the actionable
// recommendation even after the eligibility authority was introduced.
//
// The fix re-applies the SAME canonical eligibility and practical-selection
// authority used by fresh Stage 2 construction (buildResultsSnapshot) to the
// hydrated evidence. Hydration runs no acoustic simulation, mutates no
// candidate metric / ranking / curve / evidence, and invents no P19/P20
// values. A still-eligible historical bestFinalist is preserved verbatim; a
// no-longer-eligible one is replaced by the practical front/rear preference
// over the eligible ranked pool, or null when none exists.
//
// Run: node --import ./test/_alias-register.mjs test/stage2-hydration-eligibility.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  publishHydratedStage2,
  getStage2State,
} from "@/components/room/bass/stage2/stage2PlacementStore";
import { isCandidateEligibleForRecommendation } from "@/components/room/bass/stage2/stage2CandidateEligibility";
import { resolveQuantityApplyState } from "@/components/room/bass/optimiserPlan/quantityPlacementApplyAuthority";

const PROJECT_ID = "hydration-test-project";
const VERSION_ID = "hydration-test-version";
const FINGERPRINT = "stage2:v3:fa19ba170150bcc1|rec:1,2,4";
const PLACEMENT_FP = "place:v1:fa19ba170150bcc1";

// ── Candidate factories ──────────────────────────────────────────────────

// RP22_E: the physically-rejected four-sub arrangement from the disposable
// Room C evidence. valid:false, terminal:true, null P19/P20, recorded
// physical rejection = cabinet-boundary-violation / left-wall-intersection.
function rejectedRp22E() {
  return {
    finalistId: "RP22_E:0.08_0.08|0.92_0.08|0.08_0.92|0.92_0.92",
    familyId: "RP22_E",
    quantity: 4,
    coordinates: [
      { x: 0.08, y: 0.08 },
      { x: 0.92, y: 0.08 },
      { x: 0.08, y: 0.92 },
      { x: 0.92, y: 0.92 },
    ],
    valid: false,
    terminal: true,
    physicalRejection: {
      reason: "cabinet-boundary-violation",
      detail: "left-wall-intersection",
    },
    physicalValidation: { passed: false, reason: "cabinet-boundary-violation" },
    requestedP14Pass: false,
    achievedP19Level: null,
    achievedP20Level: null,
    perSeatP19: [],
    perSeatP20: [],
    rankingData: { rankingTuple: [4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  };
}

// RP22_D: a valid front/rear four-sub alternative present in the saved
// evidence. P14 achieved, aggregate P19 Level present and non-negative.
function validRp22D() {
  return {
    finalistId: "RP22_D:0.25_0.08|0.75_0.08|0.25_0.92|0.75_0.92",
    familyId: "RP22_D",
    quantity: 4,
    coordinates: [
      { x: 0.25, y: 0.08 },
      { x: 0.75, y: 0.08 },
      { x: 0.25, y: 0.92 },
      { x: 0.75, y: 0.92 },
    ],
    valid: true,
    terminal: false,
    physicalRejection: null,
    physicalValidation: { passed: true },
    requestedP14Pass: true,
    achievedP19VariationDb: 4.2,
    achievedP20VariationDb: 6.5,
    achievedP19Level: 2,
    achievedP20Level: 1,
    perSeatP19: [{ seatId: "s1", p19Level: 2 }],
    perSeatP20: [{ seatId: "s1", p20Level: 1 }],
    rankingData: {
      rankingTuple: [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      primarySummary: { seats: [{ p20Level: 1 }] },
    },
  };
}

// B_LAST_RESORT: a valid four-wall-midpoint alternative (side/mixed family).
// Eligible, but a side/mixed family — so the practical front/rear preference
// defaults to the conventional RP22_D unless a compelling benefit exists.
function validBLastResort() {
  return {
    finalistId: "RP22_B_LAST_RESORT:0.5_0.08|0.5_0.92|0.08_0.5|0.92_0.5",
    familyId: "RP22_B_LAST_RESORT",
    quantity: 4,
    coordinates: [
      { x: 0.5, y: 0.08 },
      { x: 0.5, y: 0.92 },
      { x: 0.08, y: 0.5 },
      { x: 0.92, y: 0.5 },
    ],
    valid: true,
    terminal: false,
    physicalRejection: null,
    physicalValidation: { passed: true },
    requestedP14Pass: true,
    achievedP19VariationDb: 3.8,
    achievedP20VariationDb: 7.0,
    achievedP19Level: 2,
    achievedP20Level: 1,
    perSeatP19: [{ seatId: "s1", p19Level: 2 }],
    perSeatP20: [{ seatId: "s1", p20Level: 1 }],
    rankingData: {
      rankingTuple: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      primarySummary: { seats: [{ p20Level: 1 }] },
    },
  };
}

// A valid two-sub recommendation (for test 8 — valid historical saved
// recommendation remains unchanged).
function validTwoSub() {
  return {
    finalistId: "FRONT_REAR_PAIR:0.5_0.08|0.5_0.92",
    familyId: "FRONT_REAR_PAIR",
    quantity: 2,
    coordinates: [
      { x: 0.5, y: 0.08 },
      { x: 0.5, y: 0.92 },
    ],
    valid: true,
    terminal: false,
    physicalRejection: null,
    physicalValidation: { passed: true },
    requestedP14Pass: true,
    achievedP19VariationDb: 3.0,
    achievedP20VariationDb: 5.0,
    achievedP19Level: 2,
    achievedP20Level: 1,
    perSeatP19: [{ seatId: "s1", p19Level: 2 }],
    perSeatP20: [{ seatId: "s1", p20Level: 1 }],
    rankingData: {
      rankingTuple: [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      primarySummary: { seats: [{ p20Level: 1 }] },
    },
  };
}

// ── The exact Room C saved evidence (pre-fix shape: evaluatedFinalists holds
//    ALL evaluated candidates, bestFinalist = invalid RP22_E) ───────────────

function roomCSavedResults() {
  return {
    placement_fingerprint: PLACEMENT_FP,
    one_sub_result: null,
    two_sub_result: null,
    three_sub_result: null,
    four_sub_result: {
      quantity: 4,
      // Pre-fix shape: all candidates in evaluatedFinalists, no
      // rejectedCandidates field. bestFinalist points at the invalid RP22_E.
      evaluatedFinalists: [rejectedRp22E(), validBLastResort(), validRp22D()],
      rejectedCandidates: [],
      bestFinalist: rejectedRp22E(),
      finalistCount: 3,
    },
    overall_best: { ...rejectedRp22E(), quantity: 4 },
    canonical_jobs_run: 3,
    total_runtime_ms: 12000,
    b_eligible: false,
    b_evaluated: false,
    b_eligibility_reason: null,
    b_failed_candidates: [],
    b_result: null,
  };
}

function resetState() {
  // publishHydratedStage2 overwrites the in-memory slot, so re-publishing a
  // fresh baseline between subtests is sufficient (no stale accumulation).
  publishHydratedStage2(PROJECT_ID, VERSION_ID, FINGERPRINT, {
    placement_fingerprint: null,
    one_sub_result: null,
    two_sub_result: null,
    three_sub_result: null,
    four_sub_result: null,
    overall_best: null,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

test("1+2. Replay Room C saved result: rejected RP22_E is not bestFinalist", () => {
  resetState();
  publishHydratedStage2(PROJECT_ID, VERSION_ID, FINGERPRINT, roomCSavedResults());
  const state = getStage2State(PROJECT_ID, VERSION_ID);
  const four = state.four_sub_result;
  assert.ok(four, "four_sub_result should be present");
  assert.notEqual(four.bestFinalist?.finalistId, rejectedRp22E().finalistId,
    "rejected RP22_E must not be the hydrated bestFinalist");
  assert.equal(isCandidateEligibleForRecommendation(four.bestFinalist), true,
    "hydrated bestFinalist must be eligible");
});

test("3. Replacement is an actually eligible candidate, not merely next ranking", () => {
  resetState();
  publishHydratedStage2(PROJECT_ID, VERSION_ID, FINGERPRINT, roomCSavedResults());
  const four = getStage2State(PROJECT_ID, VERSION_ID).four_sub_result;
  const best = four.bestFinalist;
  assert.ok(best, "an eligible replacement should exist");
  // Eligible by the canonical authority (physical + evidence), not just by
  // being the next entry in the saved ranking.
  assert.equal(isCandidateEligibleForRecommendation(best), true);
  assert.equal(best.physicalRejection, null);
  assert.equal(best.terminal, false);
  assert.equal(best.requestedP14Pass, true);
  assert.ok(best.achievedP19Level != null && Number(best.achievedP19Level) >= 0,
    "replacement must carry real P19/P20 evidence (not manufactured absence)");
});

test("4. Practical front/rear preference applied consistently (RP22_D over B_LAST_RESORT)", () => {
  resetState();
  publishHydratedStage2(PROJECT_ID, VERSION_ID, FINGERPRINT, roomCSavedResults());
  const four = getStage2State(PROJECT_ID, VERSION_ID).four_sub_result;
  // Both RP22_D and B_LAST_RESORT are eligible. RP22_D is the conventional
  // front/rear arrangement; B_LAST_RESORT is side/mixed. With no compelling
  // whole-Level benefit (equal P19/P20 Levels), the practical preference must
  // keep RP22_D — hydration must not revert to the acoustic-ranking winner
  // when the conventional candidate is feasible.
  assert.equal(four.bestFinalist.finalistId, validRp22D().finalistId,
    "practical front/rear preference must select the conventional RP22_D");
});

test("5. Rejected evidence and original rejection reasons remain available", () => {
  resetState();
  publishHydratedStage2(PROJECT_ID, VERSION_ID, FINGERPRINT, roomCSavedResults());
  const four = getStage2State(PROJECT_ID, VERSION_ID).four_sub_result;
  assert.ok(Array.isArray(four.rejectedCandidates) && four.rejectedCandidates.length === 1,
    "rejected RP22_E must be retained in rejectedCandidates");
  const rejected = four.rejectedCandidates[0];
  assert.equal(rejected.finalistId, rejectedRp22E().finalistId);
  // Original physical rejection reason kept verbatim.
  assert.equal(rejected.eligibilityReason, "cabinet-boundary-violation");
});

test("6. No P19/P20 values are manufactured for the rejected candidate", () => {
  resetState();
  publishHydratedStage2(PROJECT_ID, VERSION_ID, FINGERPRINT, roomCSavedResults());
  const four = getStage2State(PROJECT_ID, VERSION_ID).four_sub_result;
  const rejected = four.rejectedCandidates[0];
  assert.equal(rejected.achievedP19Level, null,
    "rejected candidate P19 must stay null — never manufactured");
  assert.equal(rejected.achievedP20Level, null,
    "rejected candidate P20 must stay null — never manufactured");
  assert.equal(rejected.valid, false);
  assert.equal(rejected.terminal, true);
});

test("7. Zero eligible candidates produces no actionable card", () => {
  resetState();
  publishHydratedStage2(PROJECT_ID, VERSION_ID, FINGERPRINT, {
    placement_fingerprint: PLACEMENT_FP,
    four_sub_result: {
      quantity: 4,
      evaluatedFinalists: [rejectedRp22E()],
      rejectedCandidates: [],
      bestFinalist: rejectedRp22E(),
      finalistCount: 1,
    },
    overall_best: null,
  });
  const four = getStage2State(PROJECT_ID, VERSION_ID).four_sub_result;
  assert.equal(four.bestFinalist, null,
    "no eligible candidate ⇒ bestFinalist must be null (no actionable card)");
  assert.equal(four.evaluatedFinalists.length, 0,
    "evaluatedFinalists must be empty when none are eligible");
  assert.equal(four.rejectedCandidates.length, 1,
    "the rejected candidate is still retained for diagnostics");
  assert.equal(getStage2State(PROJECT_ID, VERSION_ID).overall_best, null);
});

test("8. Valid historical saved recommendation remains unchanged", () => {
  resetState();
  const validTwo = validTwoSub();
  publishHydratedStage2(PROJECT_ID, VERSION_ID, FINGERPRINT, {
    placement_fingerprint: PLACEMENT_FP,
    two_sub_result: {
      quantity: 2,
      evaluatedFinalists: [validTwo],
      rejectedCandidates: [],
      bestFinalist: validTwo,
      finalistCount: 1,
    },
    overall_best: { ...validTwo, quantity: 2 },
  });
  const two = getStage2State(PROJECT_ID, VERSION_ID).two_sub_result;
  assert.equal(two.bestFinalist.finalistId, validTwo.finalistId,
    "a still-eligible historical bestFinalist is preserved verbatim");
  assert.equal(two.evaluatedFinalists.length, 1);
  assert.equal(two.rejectedCandidates.length, 0);
});

test("9. Repeated hydration is deterministic and idempotent", () => {
  resetState();
  publishHydratedStage2(PROJECT_ID, VERSION_ID, FINGERPRINT, roomCSavedResults());
  const first = getStage2State(PROJECT_ID, VERSION_ID).four_sub_result;
  // Hydrate a second time from the FIRST hydrated output (post-fix shape with
  // split evaluatedFinalists/rejectedCandidates). The result must be identical.
  publishHydratedStage2(PROJECT_ID, VERSION_ID, FINGERPRINT, {
    placement_fingerprint: PLACEMENT_FP,
    four_sub_result: {
      quantity: 4,
      evaluatedFinalists: first.evaluatedFinalists,
      rejectedCandidates: first.rejectedCandidates,
      bestFinalist: first.bestFinalist,
      finalistCount: first.finalistCount,
    },
    overall_best: getStage2State(PROJECT_ID, VERSION_ID).overall_best,
  });
  const second = getStage2State(PROJECT_ID, VERSION_ID).four_sub_result;
  assert.equal(second.bestFinalist?.finalistId, first.bestFinalist?.finalistId,
    "idempotent: bestFinalist unchanged on re-hydration");
  assert.equal(second.evaluatedFinalists.length, first.evaluatedFinalists.length);
  assert.equal(second.rejectedCandidates.length, first.rejectedCandidates.length);
  assert.equal(second.rejectedCandidates[0]?.eligibilityReason,
    first.rejectedCandidates[0]?.eligibilityReason,
    "idempotent: rejection reason stable");
});

test("10. Direct Apply of rejected RP22_E is blocked without side effects", () => {
  const rejected = rejectedRp22E();
  // The Apply authority independently verifies eligibility + physical boundary,
  // so passing the rejected candidate directly must refuse. resolveQuantityApplyState
  // returns { canApply, blockReason } only — it never mutates instances, starts a
  // bass calculation or publishes engineering. A refusal is side-effect-free.
  const verdict = resolveQuantityApplyState({
    candidateFingerprint: "any",
    currentFingerprint: "any", // not stale, so the eligibility/boundary checks run
    coordinates: rejected.coordinates,
    quantity: 4,
    option: {
      finalistId: rejected.finalistId,
      familyId: rejected.familyId,
      quantity: 4,
      coordinates: rejected.coordinates,
      valid: rejected.valid,
      terminal: rejected.terminal,
      physicalRejection: rejected.physicalRejection,
      requestedP14Pass: rejected.requestedP14Pass,
      achievedP19Level: rejected.achievedP19Level,
      achievedP20Level: rejected.achievedP20Level,
    },
    roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
    model: "SUB2-12",
  });
  assert.equal(verdict.canApply, false,
    "direct Apply of rejected RP22_E must be refused");
  assert.ok(verdict.blockReason && typeof verdict.blockReason === "string",
    "refusal must carry a blockReason");
  // A refusal returns no instance payload and never starts a calculation.
  assert.ok(!verdict.targetInstances,
    "refused Apply must not produce target instances");
});