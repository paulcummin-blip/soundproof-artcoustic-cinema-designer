// P19 Bounded Refinement — Anti-Cheat Regression Tests (A–J)
//
// Tests that the eligibility gates in p19BoundedRefinement.js correctly
// reject candidates that cheat P19 by:
//   A. Gaining from worse P18 / shrunk assessment band
//   B. Old-band L1 but recalculated-band FAIL → publish FAIL
//   C. Boost exceeding +6 dB → reject (physical authority)
//   D. Cut exceeding −15 dB → reject (physical authority)
//   E. Protected-null boost → reject (physical authority)
//   F. Primary P19 displayed/raw prohibited regression → reject
//   G. Primary P20 displayed/raw prohibited regression → reject
//   H. Second primary fails while first remains safe → reject
//   I. P19 improves but worst P20 worsens >1.0 dB → reject
//   J. P19 improves and P20 worsens ≤1.0 dB → may remain eligible
//
// Also tests:
//   - Pass-1 invalid for refinement (no P14 or no physical authority)
//   - Exact candidate count tracking
import test from "node:test";
import assert from "node:assert/strict";
import { refineP19GlobalNormalisation } from "../src/components/utils/p19BoundedRefinement.js";

// ---------------------------------------------------------------------------
// Helpers — build mock evaluations
// ---------------------------------------------------------------------------

function makeEvaluation(overrides = {}) {
  return {
    globalTrimDb: -3.0,
    correctionCurve: [],
    operatingPreEqCurve: [],
    achievedPreEqCurve: [],
    unconstrainedPostEqCurve: [],
    finalPostEqCurve: [],
    perSeatPostEqCurves: [],
    productOperatingEnvelope: { curve: [] },
    p14Pass: true,
    p14Status: "PASS",
    p14AchievedDb: 109,
    p14TargetDb: 109,
    p14MarginDb: 2.0,
    pairedP14P18Authority: { status: "PASS" },
    achievedP18Hz: 20,
    achievedP18Level: 1,
    achievedP18Bounded: false,
    p18Passes: true,
    assessmentBand: { valid: true, lowerHz: 20, upperHz: 120 },
    p19Db: 7.0,
    p19Level: null,
    p19WorstFrequencyHz: null,
    perSeatP19: [],
    p20Available: true,
    p20Db: 5.0,
    p20Level: null,
    perSeatP20: [],
    maxBoostDb: 3.0,
    maxCutDb: -5.0,
    physicalEqAuthorityPassed: true,
    physicalAuthorityViolations: [],
    selectedOperatingOutputDb: 112,
    finalOperatingOutputDb: 112.0,
    operatingOutputErrorDb: 0.0,
    operatingOutputValid: true,
    primarySeatSafety: { regressed: false },
    ...overrides,
  };
}

function makePass1(overrides = {}) {
  return makeEvaluation({
    globalTrimDb: -3.0,
    p19Db: 7.63,
    p20Db: 5.0,
    p20Available: true,
    achievedP18Hz: 20,
    achievedP18Level: 1,
    p14Pass: true,
    physicalEqAuthorityPassed: true,
    primarySeatSafety: { regressed: false },
    ...overrides,
  });
}

// Mock evaluator that returns a queue of evaluations, with pass1-like defaults
// for all calls beyond the queued ones. The defaults match pass1's metrics so
// no spurious "improvement" is found from unqueued trim values.
function makeMockEvaluator(evaluations, pass1) {
  let idx = 0;
  const defaultEval = pass1 || makeEvaluation({ p19Db: 7.63 });
  return (trim) => {
    if (idx >= evaluations.length) return { ...defaultEval, globalTrimDb: trim };
    const eval_ = evaluations[idx];
    idx++;
    return { ...eval_, globalTrimDb: trim };
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("A: P19 gain caused by worse P18/shrunk band → reject", () => {
  const pass1 = makePass1({
    p19Db: 7.63,
    achievedP18Hz: 20,
    achievedP18Level: 1,
    assessmentBand: { valid: true, lowerHz: 20, upperHz: 120 },
  });
  // Candidate has lower P19 but worse P18 level and higher extension Hz
  const candidate = makeEvaluation({
    p19Db: 6.0,
    achievedP18Hz: 25, // worse extension
    achievedP18Level: 0, // worse level
    assessmentBand: { valid: true, lowerHz: 25, upperHz: 120 }, // shrunk band
  });
  // isEligible is not exported, but refineP19GlobalNormalisation uses it.
  // We test via refineP19GlobalNormalisation with a mock evaluator.
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  // The candidate should be ineligible due to P18 level regression
  assert.equal(result.refinementImproved, false, "Candidate with worse P18 level must not be accepted");
});

test("B: old-band L1 but recalculated-band FAIL → publish FAIL", () => {
  const pass1 = makePass1({
    p19Db: 5.0,
    assessmentBand: { valid: true, lowerHz: 20, upperHz: 120 },
  });
  // Candidate has L1 on old band but recalculated band is narrower and FAIL
  const candidate = makeEvaluation({
    p19Db: 8.0, // worse on recalculated band
    assessmentBand: { valid: true, lowerHz: 25, upperHz: 120 },
  });
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  // The candidate's P19 on the recalculated band is worse → not improved
  assert.equal(result.refinementImproved, false, "Recalculated-band FAIL must not be published as improvement");
});

test("C: > +6 dB correction → reject/fail physical authority", () => {
  const pass1 = makePass1();
  const candidate = makeEvaluation({
    p19Db: 5.0,
    maxBoostDb: 6.5, // exceeds +6 dB limit
    physicalEqAuthorityPassed: false,
  });
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  assert.equal(result.refinementImproved, false, "Boost > +6 dB must be rejected");
});

test("D: < -15 dB correction → reject/fail physical authority", () => {
  const pass1 = makePass1();
  const candidate = makeEvaluation({
    p19Db: 5.0,
    maxCutDb: -15.5, // exceeds -15 dB limit
    physicalEqAuthorityPassed: false,
  });
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  assert.equal(result.refinementImproved, false, "Cut < -15 dB must be rejected");
});

test("E: protected-null boost → reject", () => {
  const pass1 = makePass1();
  const candidate = makeEvaluation({
    p19Db: 5.0,
    physicalEqAuthorityPassed: false,
    physicalAuthorityViolations: [{ type: "protected-null-boost", frequency: 35 }],
  });
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  assert.equal(result.refinementImproved, false, "Protected-null boost must be rejected");
});

test("F: primary P19 displayed/raw prohibited regression → reject", () => {
  const pass1 = makePass1({
    perSeatP19: [
      { seatId: "seat-1", isPrimary: true, variationDbRaw: 5.0 },
      { seatId: "seat-2", isPrimary: true, variationDbRaw: 6.0 },
    ],
  });
  const candidate = makeEvaluation({
    p19Db: 5.0,
    primarySeatSafety: { regressed: true }, // primary seat regressed
    perSeatP19: [
      { seatId: "seat-1", isPrimary: true, variationDbRaw: 7.0 }, // regressed
      { seatId: "seat-2", isPrimary: true, variationDbRaw: 6.0 },
    ],
  });
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  assert.equal(result.refinementImproved, false, "Primary P19 regression must be rejected");
});

test("G: primary P20 displayed/raw prohibited regression → reject", () => {
  const pass1 = makePass1({
    p20Db: 5.0,
    perSeatP20: [
      { seatId: "seat-1", isPrimary: true, variationDbRaw: 4.0 },
      { seatId: "seat-2", isPrimary: true, variationDbRaw: 5.0 },
    ],
  });
  const candidate = makeEvaluation({
    p19Db: 5.0,
    p20Db: 5.0,
    primarySeatSafety: { regressed: true }, // primary P20 regressed
    perSeatP20: [
      { seatId: "seat-1", isPrimary: true, variationDbRaw: 6.0 }, // regressed
      { seatId: "seat-2", isPrimary: true, variationDbRaw: 5.0 },
    ],
  });
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  assert.equal(result.refinementImproved, false, "Primary P20 regression must be rejected");
});

test("H: second primary fails while first remains safe → reject", () => {
  const pass1 = makePass1({
    perSeatP19: [
      { seatId: "seat-1", isPrimary: true, variationDbRaw: 5.0 },
      { seatId: "seat-2", isPrimary: true, variationDbRaw: 5.0 },
    ],
    perSeatP20: [
      { seatId: "seat-1", isPrimary: true, variationDbRaw: 4.0 },
      { seatId: "seat-2", isPrimary: true, variationDbRaw: 4.0 },
    ],
  });
  // First primary is safe, second primary regressed
  const candidate = makeEvaluation({
    p19Db: 5.0,
    primarySeatSafety: { regressed: true }, // hasPrimarySeatRegression catches ALL primaries
    perSeatP19: [
      { seatId: "seat-1", isPrimary: true, variationDbRaw: 5.0 }, // safe
      { seatId: "seat-2", isPrimary: true, variationDbRaw: 7.0 }, // regressed
    ],
  });
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  assert.equal(result.refinementImproved, false, "Second primary regression must be rejected even if first is safe");
});

test("I: P19 improves but worst P20 worsens >1.0 dB → reject", () => {
  const pass1 = makePass1({
    p19Db: 7.63,
    p20Db: 5.0,
    p20Available: true,
  });
  const candidate = makeEvaluation({
    p19Db: 6.0, // improves by 1.63 dB
    p20Db: 6.5, // worsens by 1.5 dB > 1.0 tolerance
    p20Available: true,
    primarySeatSafety: { regressed: false },
  });
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  assert.equal(result.refinementImproved, false, "P20 damage > 1.0 dB must make candidate ineligible");
});

test("J: P19 improves and P20 worsens ≤1.0 dB → may remain eligible", () => {
  const pass1 = makePass1({
    p19Db: 7.63,
    p20Db: 5.0,
    p20Available: true,
  });
  const candidate = makeEvaluation({
    p19Db: 6.0, // improves by 1.63 dB
    p20Db: 5.7, // worsens by 0.7 dB ≤ 1.0 tolerance
    p20Available: true,
    primarySeatSafety: { regressed: false },
  });
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  // Should be eligible — P20 damage is within tolerance
  assert.equal(result.refinementImproved, true, "P20 damage ≤ 1.0 dB should not block an otherwise eligible candidate");
  assert.equal(result.refinedP19Db, 6.0, "Refined P19 should be the candidate's P19");
});

test("Pass-1 invalid for refinement (no P14) → no refinement", () => {
  const pass1 = makePass1({ p14Pass: false });
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: () => makeEvaluation(),
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  assert.equal(result.refinementAttempted, true);
  assert.equal(result.refinementImproved, false);
  assert.equal(result.bindingConstraint, "pass1-invalid-for-refinement");
  assert.equal(result.pass1P14Pass, false);
});

test("Pass-1 invalid for refinement (no physical authority) → no refinement", () => {
  const pass1 = makePass1({ physicalEqAuthorityPassed: false });
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: () => makeEvaluation(),
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  assert.equal(result.refinementAttempted, true);
  assert.equal(result.refinementImproved, false);
  assert.equal(result.bindingConstraint, "pass1-invalid-for-refinement");
  assert.equal(result.pass1PhysicalEqAuthorityPassed, false);
});

test("Exact candidate count — tracks actual evaluateCandidate calls", () => {
  let callCount = 0;
  const pass1 = makePass1({ p19Db: 7.63 });
  const evaluator = (trim) => {
    callCount++;
    return makeEvaluation({ globalTrimDb: trim, p19Db: 7.63 }); // no improvement
  };
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: evaluator,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  // Should have called evaluator for coarse + fine candidates
  assert.ok(result.coarseCandidatesTested > 0, "Coarse count must be > 0");
  assert.ok(result.candidatesTested === result.coarseCandidatesTested + result.fineCandidatesTested,
    "Total must equal coarse + fine");
  assert.ok(callCount === result.candidatesTested, `Actual calls (${callCount}) must match reported count (${result.candidatesTested})`);
});

test("All candidate profiles use same P18 requirement — consistency regression", () => {
  // This test verifies that isEligible uses the same P18 level comparison
  // regardless of candidate profile. A candidate with a lower P18 level
  // than Pass-1 is always rejected.
  const pass1 = makePass1({ achievedP18Level: 2, achievedP18Hz: 18 });
  
  // Candidate with lower P18 level — must be rejected
  const candidate = makeEvaluation({
    p19Db: 5.0,
    achievedP18Level: 1, // worse than pass1's 2
    achievedP18Hz: 18,
  });
  const eval_ = makeMockEvaluator([candidate], pass1);
  const result = refineP19GlobalNormalisation({
    evaluateCandidate: eval_,
    pass1GlobalTrimDb: -3.0,
    pass1Evaluation: pass1,
  });
  assert.equal(result.refinementImproved, false, "Candidate with lower P18 level must always be rejected");
});