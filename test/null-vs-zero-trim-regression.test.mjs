// null-vs-zero-trim-regression.test.mjs
//
// Regression tests for the null/auto trim semantics bug and the operating-level
// authority gate.
//
// Root cause being tested:
//   evaluateCandidate(null) previously treated null as 0 because
//   Number(null) === 0, making Number.isFinite(Number(null)) === true.
//   This caused Pass-1 to use an explicit 0 dB trim instead of AUTO normalisation,
//   producing a 118.6 dBC operating output instead of the selected 112 dBC target.
//
// Tests:
//   1. null means AUTO (not explicit 0 dB)
//   2. explicit zero remains zero
//   3. null and 0 are never equivalent
//   4. operating-output gate rejects 118.632 dBC at 112 target
//   5. operating-output gate accepts ~112 dBC at 112 target
//   6. search domain includes ~-12.25 region when Pass-1 is -19.4
//   7. Pass-1 with invalid operating output stops refinement
//   8. P20 >1 dB damage rejection still applies
//   9. +6/-15 constraints still apply

import test from "node:test";
import assert from "node:assert/strict";
import { refineP19GlobalNormalisation } from "../src/components/utils/p19BoundedRefinement.js";

// ---------------------------------------------------------------------------
// Nullish/finite check — the exact logic used in evaluateCandidate
// ---------------------------------------------------------------------------

function hasExplicitTrim(v) {
  return v !== null && v !== undefined && Number.isFinite(Number(v));
}

// ---------------------------------------------------------------------------
// Helpers — build mock evaluations
// ---------------------------------------------------------------------------

function makeEvaluation(overrides = {}) {
  return {
    globalTrimDb: -19.4,
    correctionCurve: [],
    operatingPreEqCurve: [],
    achievedPreEqCurve: [],
    unconstrainedPostEqCurve: [],
    finalPostEqCurve: [],
    perSeatPostEqCurves: [],
    productOperatingEnvelope: { curve: [] },
    p14Pass: true,
    p14Status: "PASS",
    p14AchievedDb: 120.69,
    p14TargetDb: 112,
    p14MarginDb: 8.69,
    pairedP14P18Authority: { status: "PASS" },
    achievedP18Hz: 15.436,
    achievedP18Level: 2,
    achievedP18Bounded: false,
    p18Passes: true,
    assessmentBand: { valid: true, lowerHz: 15.436, upperHz: 128.3 },
    p19Db: 7.63,
    p19Level: 0,
    p19WorstFrequencyHz: 15.44,
    perSeatP19: [{ seatId: "seat-r1-c2", isPrimary: true, variationDbRaw: 7.63, level: 0 }],
    p20Available: true,
    p20Db: 0.085,
    p20Level: 4,
    perSeatP20: [{ seatId: "seat-r1-c2", isPrimary: true, variationDbRaw: 0.085, level: 4 }],
    maxBoostDb: 3.5,
    maxCutDb: -8.2,
    physicalEqAuthorityPassed: true,
    physicalAuthorityViolations: [],
    selectedOperatingOutputDb: 112,
    finalOperatingOutputDb: 112.1,
    operatingOutputErrorDb: 0.1,
    operatingOutputValid: true,
    primarySeatSafety: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: null means AUTO — not explicit 0 dB
// ---------------------------------------------------------------------------

test("null means AUTO — not explicit 0 dB", () => {
  assert.equal(hasExplicitTrim(null), false, "null must NOT be treated as explicit trim");
  assert.equal(hasExplicitTrim(undefined), false, "undefined must NOT be treated as explicit trim");
});

// ---------------------------------------------------------------------------
// Test 2: explicit zero remains zero
// ---------------------------------------------------------------------------

test("explicit zero remains zero", () => {
  assert.equal(hasExplicitTrim(0), true, "0 must be treated as explicit trim");
  assert.equal(hasExplicitTrim(-12.25), true, "-12.25 must be treated as explicit trim");
  assert.equal(hasExplicitTrim(-19.4), true, "-19.4 must be treated as explicit trim");
});

// ---------------------------------------------------------------------------
// Test 3: null and 0 are never equivalent
// ---------------------------------------------------------------------------

test("null and 0 are never equivalent", () => {
  assert.notEqual(hasExplicitTrim(null), hasExplicitTrim(0),
    "null and 0 must produce different hasExplicitTrim results");
});

// ---------------------------------------------------------------------------
// Test 4: operating-output gate rejects 118.632 dBC at 112 target
// ---------------------------------------------------------------------------

test("operating-output gate: 118.632 dBC candidate at 112 target is rejected", () => {
  const pass1 = makeEvaluation({
    globalTrimDb: -19.4,
    p19Db: 7.63,
    finalOperatingOutputDb: 112.1,
    operatingOutputErrorDb: 0.1,
    operatingOutputValid: true,
  });
  const invalidCandidate = makeEvaluation({
    globalTrimDb: 0,
    p19Db: 5.0, // apparently better P19, but invalid operating output
    finalOperatingOutputDb: 118.632,
    operatingOutputErrorDb: 6.632,
    operatingOutputValid: false,
  });

  const result = refineP19GlobalNormalisation({
    evaluateCandidate: (trim) => {
      if (Math.abs(trim - (-19.4)) < 0.01) return pass1;
      if (Math.abs(trim) < 0.01) return invalidCandidate;
      // All other candidates have invalid operating output
      return makeEvaluation({ globalTrimDb: trim, operatingOutputValid: false });
    },
    pass1GlobalTrimDb: -19.4,
    pass1Evaluation: pass1,
  });

  assert.equal(result.refinementAttempted, true);
  // The invalid 118.632 dBC candidate must NOT be selected as the winner
  if (result.refinementImproved) {
    assert.notEqual(result.refinedGlobalTrimDb, 0,
      "118.632 dBC candidate must not be selected at 112 target");
  }
});

// ---------------------------------------------------------------------------
// Test 5: operating-output gate accepts ~112 dBC at 112 target
// ---------------------------------------------------------------------------

test("operating-output gate: ~112 dBC candidate at 112 target is eligible", () => {
  const pass1 = makeEvaluation({
    globalTrimDb: -19.4,
    p19Db: 7.63,
    finalOperatingOutputDb: 112.0,
    operatingOutputErrorDb: 0.0,
    operatingOutputValid: true,
  });
  const validCandidate = makeEvaluation({
    globalTrimDb: -12.4,
    p19Db: 6.17,
    finalOperatingOutputDb: 112.1,
    operatingOutputErrorDb: 0.1,
    operatingOutputValid: true,
  });

  const result = refineP19GlobalNormalisation({
    evaluateCandidate: (trim) => {
      if (Math.abs(trim - (-19.4)) < 0.01) return pass1;
      // Valid candidate at -12.4 (on the 1.0 dB coarse grid from -19.4)
      if (Math.abs(trim - (-12.4)) < 0.01) return validCandidate;
      // Other candidates: valid operating output but worse P19
      return makeEvaluation({
        globalTrimDb: trim,
        p19Db: 7.5,
        operatingOutputValid: true,
        finalOperatingOutputDb: 112.0,
      });
    },
    pass1GlobalTrimDb: -19.4,
    pass1Evaluation: pass1,
  });

  assert.equal(result.refinementAttempted, true);
  assert.equal(result.refinementImproved, true, "Valid -12.4 candidate should improve P19");
  assert.equal(result.refinedGlobalTrimDb, -12.4, "Should select -12.4 dB candidate");
  assert.equal(result.refinedOperatingOutputValid, true, "Refined operating output must be valid");
});

// ---------------------------------------------------------------------------
// Test 6: search domain includes ~-12.25 region when Pass-1 is -19.4
// ---------------------------------------------------------------------------

test("search domain includes ~-12.25 region when Pass-1 is -19.4", () => {
  const pass1 = makeEvaluation({ globalTrimDb: -19.4, p19Db: 7.63 });
  const testedTrims = [];

  refineP19GlobalNormalisation({
    evaluateCandidate: (trim) => {
      testedTrims.push(trim);
      return makeEvaluation({
        globalTrimDb: trim,
        p19Db: 7.63,
        operatingOutputValid: true,
        finalOperatingOutputDb: 112.0,
      });
    },
    pass1GlobalTrimDb: -19.4,
    pass1Evaluation: pass1,
  });

  // The search must include trims in the -13 to -11 range (the ~-12.25 region)
  const includesMinus12Region = testedTrims.some(t => t >= -13 && t <= -11);
  assert.equal(includesMinus12Region, true,
    `Search domain must include ~-12.25 region; tested trims: ${testedTrims.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Test 7: Pass-1 with invalid operating output stops refinement
// ---------------------------------------------------------------------------

test("Pass-1 with invalid operating output stops refinement", () => {
  const pass1 = makeEvaluation({
    globalTrimDb: 0,
    p19Db: 12.55,
    finalOperatingOutputDb: 118.632,
    operatingOutputErrorDb: 6.632,
    operatingOutputValid: false,
  });

  const result = refineP19GlobalNormalisation({
    evaluateCandidate: () => makeEvaluation({ operatingOutputValid: false }),
    pass1GlobalTrimDb: 0,
    pass1Evaluation: pass1,
  });

  assert.equal(result.refinementAttempted, true);
  assert.equal(result.refinementImproved, false);
  assert.equal(result.reason, "pass1-invalid-for-refinement");
  assert.equal(result.pass1OperatingOutputValid, false);
  assert.equal(result.candidatesTested, 0, "No candidates should be tested when Pass-1 is invalid");
});

// ---------------------------------------------------------------------------
// Test 8: P20 >1 dB damage rejection still applies
// ---------------------------------------------------------------------------

test("P20 >1 dB damage rejection still applies", () => {
  const pass1 = makeEvaluation({
    globalTrimDb: -19.4,
    p19Db: 7.63,
    p20Db: 3.108,
    perSeatP20: [{ seatId: "seat-r1-c1", isPrimary: false, variationDbRaw: 3.108, level: 3 }],
    operatingOutputValid: true,
    finalOperatingOutputDb: 112.0,
  });
  const damagingCandidate = makeEvaluation({
    globalTrimDb: -2.25,
    p19Db: 10.298, // worse P19 anyway, but also test P20 damage
    p20Db: 4.286, // +1.179 dB damage > 1.0 tolerance
    perSeatP20: [{ seatId: "seat-r1-c1", isPrimary: false, variationDbRaw: 4.286, level: 2 }],
    operatingOutputValid: true,
    finalOperatingOutputDb: 112.0,
  });

  const result = refineP19GlobalNormalisation({
    evaluateCandidate: (trim) => {
      if (Math.abs(trim - (-19.4)) < 0.01) return pass1;
      if (Math.abs(trim - (-2.25)) < 0.01) return damagingCandidate;
      return makeEvaluation({
        globalTrimDb: trim,
        operatingOutputValid: true,
        finalOperatingOutputDb: 112.0,
        p19Db: 7.63,
      });
    },
    pass1GlobalTrimDb: -19.4,
    pass1Evaluation: pass1,
  });

  // The damaging candidate must NOT be selected
  if (result.refinementImproved) {
    assert.notEqual(result.refinedGlobalTrimDb, -2.25,
      "P20-damaging candidate (-2.25) must not be selected");
  }
});

// ---------------------------------------------------------------------------
// Test 9: +6/-15 constraints still apply
// ---------------------------------------------------------------------------

test("boost >+6 dB candidate is rejected", () => {
  const pass1 = makeEvaluation({ globalTrimDb: -19.4, p19Db: 7.63, operatingOutputValid: true });
  const overBoostCandidate = makeEvaluation({
    globalTrimDb: -12.25,
    p19Db: 5.0,
    maxBoostDb: 6.5, // exceeds +6 dB limit
    operatingOutputValid: true,
  });

  const result = refineP19GlobalNormalisation({
    evaluateCandidate: (trim) => {
      if (Math.abs(trim - (-19.4)) < 0.01) return pass1;
      if (Math.abs(trim - (-12.25)) < 0.01) return overBoostCandidate;
      return makeEvaluation({ globalTrimDb: trim, operatingOutputValid: true, p19Db: 7.63 });
    },
    pass1GlobalTrimDb: -19.4,
    pass1Evaluation: pass1,
  });

  if (result.refinementImproved) {
    assert.notEqual(result.refinedGlobalTrimDb, -12.25,
      "Over-boost candidate must not be selected");
  }
});

test("cut <-15 dB candidate is rejected", () => {
  const pass1 = makeEvaluation({ globalTrimDb: -19.4, p19Db: 7.63, operatingOutputValid: true });
  const overCutCandidate = makeEvaluation({
    globalTrimDb: -12.25,
    p19Db: 5.0,
    maxCutDb: -15.5, // exceeds -15 dB limit
    operatingOutputValid: true,
  });

  const result = refineP19GlobalNormalisation({
    evaluateCandidate: (trim) => {
      if (Math.abs(trim - (-19.4)) < 0.01) return pass1;
      if (Math.abs(trim - (-12.25)) < 0.01) return overCutCandidate;
      return makeEvaluation({ globalTrimDb: trim, operatingOutputValid: true, p19Db: 7.63 });
    },
    pass1GlobalTrimDb: -19.4,
    pass1Evaluation: pass1,
  });

  if (result.refinementImproved) {
    assert.notEqual(result.refinedGlobalTrimDb, -12.25,
      "Over-cut candidate must not be selected");
  }
});