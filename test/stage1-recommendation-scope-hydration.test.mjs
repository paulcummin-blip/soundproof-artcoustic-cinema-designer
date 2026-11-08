// test/stage1-recommendation-scope-hydration.test.mjs
// Focused regression tests for the Stage 1 recommendation-scope cache hydration.
//
// isStage1CacheValid previously compared the scoped saved fingerprint
// (`stage1:v1:HASH|rec:1,2,4`) against the UNSCOPED base fingerprint,
// required a three_sub_result for a [1,2,4] request, and treated the aggregate
// `a_prohibition_validation: "FAIL"` (stamped by AND-ing all four quantities
// including the absent three) as disqualifying. A valid [1,2,4] cache was
// rejected on cold reopen, triggering a 53s Stage 1 re-search.
//
// The fix makes the validator scope-aware: it compares the base identity
// (room/RSP/seating/physics/algorithm/family) and checks that the saved cache
// SEARCHED every requested quantity, then reads each requested result's own
// aProhibitionValidation. No acoustic physics, RP22 scoring, ranking, graph
// or candidate evidence is changed.
//
// Run: node --import ./test/_alias-register.mjs test/stage1-recommendation-scope-hydration.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  isStage1CacheValid,
  // buildPersistedCache is not exported; the aggregate behaviour is verified
  // through the validator reading per-result aProhibitionValidation.
} from "@/components/room/bass/stage1/stage1PlacementPersistence";
import {
  parseStage1FingerprintScope,
  stage1ScopeCovers,
  RECOMMENDATION_QUANTITIES,
} from "@/components/room/bass/stage1/stage1RecommendationScope";
import {
  STAGE1_CACHE_VERSION,
  STAGE1_PLACEMENT_ALGORITHM_VERSION,
  STAGE1_FAMILY_POLICY_VERSION,
} from "@/components/room/bass/stage1/stage1Constants";

const BASE = "stage1:v1:abc123def456";

function completeResult(quantity, opts = {}) {
  return {
    quantity,
    status: "complete",
    candidateCount: 8,
    finalists: [{ finalistId: `f-${quantity}`, familyId: "FRONT_SINGLETON" }],
    aProhibitionValidation: opts.prohibition ?? "PASS",
    bEvaluated: false,
    searchTimingMs: 1200,
  };
}

function makeCache({ fingerprint, results, aProhibition = "PASS", status = "complete" }) {
  return {
    stage1_cache_version: STAGE1_CACHE_VERSION,
    placement_algorithm_version: STAGE1_PLACEMENT_ALGORITHM_VERSION,
    family_policy_version: STAGE1_FAMILY_POLICY_VERSION,
    current_fingerprint: fingerprint,
    status,
    one_sub_result: results?.one ?? null,
    two_sub_result: results?.two ?? null,
    three_sub_result: results?.three ?? null,
    four_sub_result: results?.four ?? null,
    a_prohibition_validation: aProhibition,
    b_evaluated: false,
  };
}

const REC_FP = `${BASE}|rec:1,2,4`;

test("1. Valid complete [1,2,4] cache hydrates successfully", () => {
  const cache = makeCache({
    fingerprint: REC_FP,
    results: { one: completeResult(1), two: completeResult(2), four: completeResult(4) },
    aProhibition: "FAIL", // stale aggregate from old writer
  });
  assert.equal(isStage1CacheValid(cache, REC_FP), true,
    "a valid [1,2,4] cache must hydrate its own request");
});

test("2. No three-subwoofer result is required for [1,2,4] scope", () => {
  const cache = makeCache({
    fingerprint: REC_FP,
    results: { one: completeResult(1), two: completeResult(2), four: completeResult(4) },
  });
  assert.equal(cache.three_sub_result, null);
  assert.equal(isStage1CacheValid(cache, REC_FP), true,
    "[1,2,4] request must not require three_sub_result");
});

test("3. Saved a_prohibition_validation FAIL does not invalidate a valid 1/2/4 cache when it concerns only an unrequested three-sub check", () => {
  const cache = makeCache({
    fingerprint: REC_FP,
    results: { one: completeResult(1), two: completeResult(2), four: completeResult(4) },
    aProhibition: "FAIL",
  });
  assert.equal(isStage1CacheValid(cache, REC_FP), true,
    "stale aggregate FAIL must not invalidate a 1/2/4 cache");
});

test("3b. A genuine per-quantity prohibition FAIL for a REQUESTED quantity invalidates", () => {
  const cache = makeCache({
    fingerprint: REC_FP,
    results: {
      one: completeResult(1, { prohibition: "FAIL" }),
      two: completeResult(2),
      four: completeResult(4),
    },
  });
  assert.equal(isStage1CacheValid(cache, REC_FP), false,
    "a per-result prohibition FAIL on a requested quantity must invalidate");
});

test("4. A true [1,2,3,4] request still validates quantity 3 correctly", () => {
  // Full-scope request against a full saved cache: quantity 3 must be present and PASS.
  const fullCache = makeCache({
    fingerprint: BASE,
    results: {
      one: completeResult(1),
      two: completeResult(2),
      three: completeResult(3),
      four: completeResult(4),
    },
  });
  assert.equal(isStage1CacheValid(fullCache, BASE), true,
    "full cache must hydrate a full request when all four PASS");

  // Full request against a [1,2,4] scoped cache: missing 3 must reject.
  const scopedCache = makeCache({
    fingerprint: REC_FP,
    results: { one: completeResult(1), two: completeResult(2), four: completeResult(4) },
  });
  assert.equal(isStage1CacheValid(scopedCache, BASE), false,
    "full request must reject a cache missing quantity 3");

  // Full request, quantity 3 present but prohibition FAIL: must reject.
  const failThree = makeCache({
    fingerprint: BASE,
    results: {
      one: completeResult(1),
      two: completeResult(2),
      three: completeResult(3, { prohibition: "FAIL" }),
      four: completeResult(4),
    },
  });
  assert.equal(isStage1CacheValid(failThree, BASE), false,
    "full request must reject when quantity 3 prohibition FAILs");
});

test("5. Missing requested quantity evidence is rejected", () => {
  // [1,2,4] request but only 1 and 2 were saved.
  const cache = makeCache({
    fingerprint: REC_FP,
    results: { one: completeResult(1), two: completeResult(2) },
  });
  assert.equal(isStage1CacheValid(cache, REC_FP), false,
    "missing quantity 4 evidence must be rejected");

  // Result present but not complete.
  const incomplete = makeCache({
    fingerprint: REC_FP,
    results: {
      one: completeResult(1),
      two: { ...completeResult(2), status: "updating", finalists: null },
      four: completeResult(4),
    },
  });
  assert.equal(isStage1CacheValid(incomplete, REC_FP), false,
    "an incomplete requested-quantity result must be rejected");
});

test("6. Incorrect scope fingerprint is rejected", () => {
  // Saved as single-quantity sel:1; request is [1,2,4].
  const selCache = makeCache({
    fingerprint: `${BASE}|sel:1`,
    results: { one: completeResult(1) },
  });
  assert.equal(isStage1CacheValid(selCache, REC_FP), false,
    "a sel:1 cache must not satisfy a [1,2,4] request");

  // Saved as rec:1,2; request is [1,2,4].
  const partialRec = makeCache({
    fingerprint: `${BASE}|rec:1,2`,
    results: { one: completeResult(1), two: completeResult(2) },
  });
  assert.equal(isStage1CacheValid(partialRec, REC_FP), false,
    "a rec:1,2 cache must not satisfy a [1,2,4] request");

  // A full saved cache DOES cover a [1,2,4] request (superset).
  const fullCache = makeCache({
    fingerprint: BASE,
    results: {
      one: completeResult(1),
      two: completeResult(2),
      three: completeResult(3),
      four: completeResult(4),
    },
  });
  assert.equal(isStage1CacheValid(fullCache, REC_FP), true,
    "a full cache must hydrate a [1,2,4] request (superset coverage)");
});

test("7. Changed room, seating or cabinet assumptions invalidate the cache", () => {
  // Different base fingerprint (design moved on).
  const cache = makeCache({
    fingerprint: REC_FP,
    results: { one: completeResult(1), two: completeResult(2), four: completeResult(4) },
  });
  const movedRequest = `stage1:v1:differenthash|rec:1,2,4`;
  assert.equal(isStage1CacheValid(cache, movedRequest), false,
    "a different base fingerprint must invalidate the cache");
});

test("8. Repeated hydration is deterministic", () => {
  const cache = makeCache({
    fingerprint: REC_FP,
    results: { one: completeResult(1), two: completeResult(2), four: completeResult(4) },
  });
  const first = isStage1CacheValid(cache, REC_FP);
  const second = isStage1CacheValid(cache, REC_FP);
  const third = isStage1CacheValid(cache, REC_FP);
  assert.deepEqual([first, second, third], [true, true, true],
    "repeated validation must be deterministic");
});

test("9. parseStage1FingerprintScope parses full, sel and rec correctly", () => {
  assert.deepEqual(parseStage1FingerprintScope(BASE), { base: BASE, scopeType: "full", quantities: [1, 2, 3, 4] });
  assert.deepEqual(parseStage1FingerprintScope(`${BASE}|sel:2`), { base: BASE, scopeType: "sel", quantities: [2] });
  assert.deepEqual(parseStage1FingerprintScope(REC_FP), { base: BASE, scopeType: "rec", quantities: [1, 2, 4] });
  // Unknown suffix falls back to full (never a narrower scope).
  assert.deepEqual(parseStage1FingerprintScope(`${BASE}|weird`), { base: `${BASE}|weird`, scopeType: "full", quantities: [1, 2, 3, 4] });
});

test("10. stage1ScopeCovers superset/subset semantics", () => {
  assert.equal(stage1ScopeCovers([1, 2, 3, 4], [1, 2, 4]), true, "full covers subset");
  assert.equal(stage1ScopeCovers([1, 2, 4], [1, 2, 4]), true, "exact match covers");
  assert.equal(stage1ScopeCovers([1, 2, 4], [3]), false, "missing quantity not covered");
  assert.equal(stage1ScopeCovers([1, 2], [1, 2, 4]), false, "subset does not cover superset");
  assert.equal(stage1ScopeCovers([], [1]), false, "empty saved does not cover");
  assert.equal(stage1ScopeCovers([1, 2, 4], []), false, "empty request does not cover");
});

test("11. RECOMMENDATION_QUANTITIES is the canonical [1,2,4] scope", () => {
  assert.deepEqual([...RECOMMENDATION_QUANTITIES], [1, 2, 4]);
});

test("12. Version mismatch is rejected", () => {
  const cache = makeCache({
    fingerprint: REC_FP,
    results: { one: completeResult(1), two: completeResult(2), four: completeResult(4) },
  });
  assert.equal(isStage1CacheValid({ ...cache, stage1_cache_version: 999 }, REC_FP), false);
  assert.equal(isStage1CacheValid({ ...cache, placement_algorithm_version: "x" }, REC_FP), false);
  assert.equal(isStage1CacheValid({ ...cache, family_policy_version: "x" }, REC_FP), false);
  assert.equal(isStage1CacheValid({ ...cache, status: "updating" }, REC_FP), false);
});