// test/cross-quantity-scope.test.mjs
// Focused tests for the cross-quantity scope extractor.
//
// Validates that extractEligibleCrossQuantityScope:
//   - returns [1, 2, 4] quantities (minus the installed one) that have
//     eligible evaluated finalists in the Stage 2 result,
//   - excludes quantities whose only finalists are physically rejected,
//     terminal or missing P19/P20 evidence,
//   - excludes the installed quantity,
//   - returns an empty array for a scoped (selectedQuantityOnly) Stage 2
//     result that only carries the installed quantity,
//   - returns an empty array for null/invalid inputs.
//
// Run: node --import ./test/_alias-register.mjs test/cross-quantity-scope.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { extractEligibleCrossQuantityScope, CROSS_QUANTITY_SCOPE } from "../src/components/room/bass/optimiseWorkflow/crossQuantityScope.js";

// Minimal eligible finalist — passes isCandidateEligibleForRecommendation.
function eligibleFinalist(finalistId) {
  return {
    finalistId,
    physicalRejection: null,
    physicalValidation: { passed: true },
    terminal: false,
    requestedP14Pass: true,
    achievedP19Level: 2,
    rankingData: { rankingTuple: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  };
}

// Physically rejected finalist — fails isCandidateEligibleForRecommendation.
function rejectedFinalist(finalistId) {
  return {
    finalistId,
    physicalRejection: { reason: "cabinet-boundary-violation" },
    physicalValidation: { passed: false, reason: "cabinet-boundary-violation" },
    terminal: false,
    achievedP19Level: 2,
    rankingData: { rankingTuple: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  };
}

// Terminal finalist — fails isCandidateEligibleForRecommendation.
function terminalFinalist(finalistId) {
  return {
    finalistId,
    physicalValidation: { passed: true },
    terminal: true,
    rankingData: { rankingTuple: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  };
}

function makeStage2Result({ one = null, two = null, four = null, scopeQuantity = null } = {}) {
  return {
    status: "complete",
    fingerprint: "stage2:v3:test|rec:1,2,4",
    placementFingerprint: "stage2-place:v3:test",
    scopeQuantity,
    one_sub_result: one ? { evaluatedFinalists: one } : null,
    two_sub_result: two ? { evaluatedFinalists: two } : null,
    four_sub_result: four ? { evaluatedFinalists: four } : null,
  };
}

test("CROSS_QUANTITY_SCOPE is [1, 2, 4]", () => {
  assert.deepEqual(CROSS_QUANTITY_SCOPE, [1, 2, 4]);
});

test("Returns eligible cross-quantities from a full [1,2,4] Stage 2 result", () => {
  const stage2 = makeStage2Result({
    one: [eligibleFinalist("F1")],
    two: [eligibleFinalist("F2")],
    four: [eligibleFinalist("F4")],
  });
  // Installed = 2 → cross-quantity scope should be [1, 4]
  assert.deepEqual(extractEligibleCrossQuantityScope(stage2, 2), [1, 4]);
  // Installed = 1 → cross-quantity scope should be [2, 4]
  assert.deepEqual(extractEligibleCrossQuantityScope(stage2, 1), [2, 4]);
  // Installed = 4 → cross-quantity scope should be [1, 2]
  assert.deepEqual(extractEligibleCrossQuantityScope(stage2, 4), [1, 2]);
});

test("Excludes quantities whose only finalists are physically rejected", () => {
  const stage2 = makeStage2Result({
    one: [rejectedFinalist("F1")],
    two: [eligibleFinalist("F2")],
    four: [eligibleFinalist("F4")],
  });
  // Installed = 2 → one is rejected, so scope is [4] only
  assert.deepEqual(extractEligibleCrossQuantityScope(stage2, 2), [4]);
});

test("Excludes quantities whose only finalists are terminal", () => {
  const stage2 = makeStage2Result({
    one: [terminalFinalist("F1")],
    two: [eligibleFinalist("F2")],
    four: [eligibleFinalist("F4")],
  });
  // Installed = 2 → one is terminal, so scope is [4] only
  assert.deepEqual(extractEligibleCrossQuantityScope(stage2, 2), [4]);
});

test("Includes a quantity when at least one finalist is eligible (mixed)", () => {
  const stage2 = makeStage2Result({
    one: [rejectedFinalist("F1-rej"), eligibleFinalist("F1-ok")],
    two: [eligibleFinalist("F2")],
    four: [eligibleFinalist("F4")],
  });
  // Installed = 2 → one has one eligible among rejected, so scope is [1, 4]
  assert.deepEqual(extractEligibleCrossQuantityScope(stage2, 2), [1, 4]);
});

test("Returns empty array for a scoped (selectedQuantityOnly) Stage 2 result", () => {
  // A scoped Stage 2 only carries the installed quantity (e.g. 2).
  const stage2 = makeStage2Result({
    two: [eligibleFinalist("F2")],
    scopeQuantity: 2,
  });
  // Installed = 2 → no cross-quantity results available
  assert.deepEqual(extractEligibleCrossQuantityScope(stage2, 2), []);
});

test("Returns empty array when no cross-quantity results exist", () => {
  const stage2 = makeStage2Result({
    two: [eligibleFinalist("F2")],
  });
  // Installed = 2 → no cross-quantity results
  assert.deepEqual(extractEligibleCrossQuantityScope(stage2, 2), []);
});

test("Returns empty array for null or invalid inputs", () => {
  assert.deepEqual(extractEligibleCrossQuantityScope(null, 2), []);
  assert.deepEqual(extractEligibleCrossQuantityScope(undefined, 2), []);
  assert.deepEqual(extractEligibleCrossQuantityScope({}, 0), []);
  assert.deepEqual(extractEligibleCrossQuantityScope({}, -1), []);
  assert.deepEqual(extractEligibleCrossQuantityScope({}, NaN), []);
  assert.deepEqual(extractEligibleCrossQuantityScope(null, null), []);
});

test("Result is always sorted ascending", () => {
  const stage2 = makeStage2Result({
    one: [eligibleFinalist("F1")],
    two: [eligibleFinalist("F2")],
    four: [eligibleFinalist("F4")],
  });
  const scope = extractEligibleCrossQuantityScope(stage2, 3);
  assert.deepEqual(scope, [1, 2, 4]);
  // Verify ascending
  for (let i = 1; i < scope.length; i++) {
    assert.ok(scope[i] > scope[i - 1], `scope not ascending: ${scope}`);
  }
});

test("Does not include quantity 3 (outside recommendation scope)", () => {
  const stage2 = {
    status: "complete",
    fingerprint: "stage2:v3:test",
    placementFingerprint: "stage2-place:v3:test",
    scopeQuantity: null,
    one_sub_result: { evaluatedFinalists: [eligibleFinalist("F1")] },
    two_sub_result: { evaluatedFinalists: [eligibleFinalist("F2")] },
    three_sub_result: { evaluatedFinalists: [eligibleFinalist("F3")] },
    four_sub_result: { evaluatedFinalists: [eligibleFinalist("F4")] },
  };
  // Installed = 2 → scope should be [1, 4], NOT [1, 3, 4]
  assert.deepEqual(extractEligibleCrossQuantityScope(stage2, 2), [1, 4]);
});