// protected-seat-safety-authority.test.mjs
// Forensic regression suite for the ONE shared protected primary-seat safety
// authority. Runs Case C (the audited unsafe candidate) and the control cases
// (Case A safe path, missing evidence, P19 safety unchanged) against the
// shared authority AND the winner-selection path it now gates.
//
// Pure functions only. No acoustic maths are changed by this suite.

import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateProtectedSeatSafety,
  protectedSeatRegressionForApply,
} from "../src/components/room/bass/improveBassV2/protectedSeatSafetyAuthority.js";
import { selectConfirmedRecommendations } from "../src/components/room/bass/improveBassV2/confirmedRecommendationSelection.js";
import { hasPrimarySeatRegression } from "../src/components/room/bass/best-layout/authoritativeFinalistSelection.js";
const { resolveImprovementResult, IMPROVEMENT_CASE } = await import(
  "../src/components/room/bass/optimiserPlan/improvementResultAuthority.js"
);

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const STAGE2_CANONICAL_VERSION = "stage2-canonical-v6-delay-lag";

// P19: floor(|raw|) <=2->L4, <=3->L3, <=4->L2, <=5->L1, >5->FAIL
// P20: floor(|raw|) <=2->L4, <=3->L3, <=4->L2, >4->L1
function gradeP19(raw) {
  const wholeDb = Math.floor(Math.abs(raw));
  return wholeDb <= 2 ? 4 : wholeDb <= 3 ? 3 : wholeDb <= 4 ? 2 : wholeDb <= 5 ? 1 : 0;
}
function gradeP20(raw) {
  const wholeDb = Math.floor(Math.abs(raw));
  return wholeDb <= 2 ? 4 : wholeDb <= 3 ? 3 : wholeDb <= 4 ? 2 : 1;
}
function levelLabel(n) {
  return n > 0 ? `L${n}` : "FAIL";
}

function makeSeatP19(seatId, isPrimary, raw) {
  return { seatId, isPrimary, variationDbRaw: raw, level: levelLabel(gradeP19(raw)) };
}
function makeSeatP20(seatId, isPrimary, raw) {
  return { seatId, isPrimary, variationDbRaw: raw, level: levelLabel(gradeP20(raw)) };
}

/**
 * Build a canonically-confirmed candidate result. `primary` is an array of
 * { id?, p19Raw, p20Raw } for the primary seats; `secondary` likewise.
 * Levels are GRADED from the raw values, so a fixture can never claim a level
 * its raw does not support — exactly the contract the engine enforces.
 */
function makeResult({
  candidateId,
  primary = [],
  secondary = [],
  achievedP19VariationDb = null,
  achievedP20VariationDb = null,
  candidateKind = "position",
  isPositionCandidate = true,
  inputIdentity = "fp-test",
}) {
  const perSeatP19 = [];
  const perSeatP20 = [];
  primary.forEach((p, i) => {
    const id = p.id || `seat-r1-c${i + 1}`;
    perSeatP19.push(makeSeatP19(id, true, p.p19Raw));
    perSeatP20.push(makeSeatP20(id, true, p.p20Raw));
  });
  secondary.forEach((p, i) => {
    const id = p.id || `seat-r2-c${i + 1}`;
    perSeatP19.push(makeSeatP19(id, false, p.p19Raw));
    perSeatP20.push(makeSeatP20(id, false, p.p20Raw));
  });
  const aggP19 = achievedP19VariationDb ?? primary[0]?.p19Raw ?? 3.0;
  return {
    candidateId,
    candidateKind,
    isPositionCandidate,
    inputIdentity,
    timingVersion: STAGE2_CANONICAL_VERSION,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    achievedP18Hz: 20,
    p18AchievedLevel: 3,
    p14AchievedDb: 117,
    p14AchievedLevel: 2,
    operatingOutputDb: 117,
    p14TargetDb: 117,
    requestedP14Pass: true,
    canonicalAuthorityReceipt: { selectedCandidateId: candidateId, postEqCurveSignature: "sig" },
    physicalValidation: { passed: true },
    appliedTuning: [
      { sourceId: "sub-1", delayMs: 0, gainDb: 0, polarity: 1 },
      { sourceId: "sub-2", delayMs: 0, gainDb: 0, polarity: 1 },
    ],
    achievedP19VariationDb: aggP19,
    achievedP19Level: levelLabel(gradeP19(aggP19)),
    achievedP20VariationDb: achievedP20VariationDb ?? primary[0]?.p20Raw ?? 5.0,
    achievedP20Level: levelLabel(gradeP20(achievedP20VariationDb ?? primary[0]?.p20Raw ?? 5.0)),
    perSeatP19,
    perSeatP20,
  };
}

/** A snapshot sufficient for selectConfirmedRecommendations. */
function makeSnapshot({ effectiveConfiguration = null, seats } = {}) {
  return {
    effectiveConfiguration,
    evaluationIncomplete: false,
    validationContext: {
      seats: seats || [
        { id: "seat-r1-c1", isPrimary: true },
        { id: "seat-r1-c2", isPrimary: true },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// CASE C — the exact audited unsafe candidate
// Two protected primary seats regress L4 -> L1 (+5.948 dB / +5.302 dB raw),
// while the aggregate P20 improves. This candidate MUST NOT be the safe winner.
// ---------------------------------------------------------------------------

// Baseline: two primary seats at L4 (raw 2.0). Aggregate P19 holds at L4,
// aggregate P20 is L1 (raw 7.0).
const CASE_C_BASELINE = makeResult({
  candidateId: "current",
  candidateKind: "current",
  isPositionCandidate: false,
  primary: [
    { id: "seat-r1-c1", p19Raw: 2.0, p20Raw: 2.0 }, // L4 / L4
    { id: "seat-r1-c2", p19Raw: 2.0, p20Raw: 2.0 }, // L4 / L4
  ],
  achievedP19VariationDb: 2.0, // aggregate P19 = L4 (held)
  achievedP20VariationDb: 7.0,  // aggregate P20 = L1
});

// Candidate: both primary seats regress L4 -> L1. P20 raw worsens by exactly
// +5.948 dB and +5.302 dB. The aggregate P20 still IMPROVES (7.0 -> 4.5, L1->L2)
// while the aggregate P19 holds at L4 — so the OLD winner path (hard safety +
// materiality) let this through. The shared protected-seat authority catches it.
const CASE_C_CANDIDATE = makeResult({
  candidateId: "case-c-unsafe",
  primary: [
    { id: "seat-r1-c1", p19Raw: 7.948, p20Raw: 7.948 }, // +5.948 dB, L1
    { id: "seat-r1-c2", p19Raw: 7.302, p20Raw: 7.302 }, // +5.302 dB, L1
  ],
  achievedP19VariationDb: 2.0, // aggregate P19 held at L4 (hard safety blind to the per-seat drop)
  achievedP20VariationDb: 4.5, // aggregate P20 IMPROVES to L2
});

test("CASE C — shared authority detects both protected-seat regressions", () => {
  const safety = evaluateProtectedSeatSafety(CASE_C_CANDIDATE, CASE_C_BASELINE);
  assert.equal(safety.safe, false, "Case C candidate is unsafe");
  assert.equal(safety.evidenceComplete, true, "evidence is complete");
  assert.equal(safety.reason, "primary-seat-regression");
  assert.equal(safety.protectedSeatRegressions.length, 4, "both seats regress on P19 AND P20");
  // Primary seat 1 regressed by +5.948 dB (P20)
  const p20Seat1 = safety.protectedSeatRegressions.find(
    (r) => r.seatId === "seat-r1-c1" && r.parameter === "P20",
  );
  assert.ok(p20Seat1, "seat-r1-c1 P20 regression recorded");
  assert.equal(p20Seat1.rawDeltaDb, 5.9, "seat-r1-c1 P20 raw regression preserved (rounded to 1 dp)");
  assert.equal(p20Seat1.currentLevel, 4, "seat-r1-c1 was L4");
  assert.equal(p20Seat1.candidateLevel, 1, "seat-r1-c1 became L1");
  const p20Seat2 = safety.protectedSeatRegressions.find(
    (r) => r.seatId === "seat-r1-c2" && r.parameter === "P20",
  );
  assert.ok(p20Seat2, "seat-r1-c2 P20 regression recorded");
  assert.equal(p20Seat2.rawDeltaDb, 5.3, "seat-r1-c2 P20 raw regression preserved (rounded to 1 dp)");
  // Worst regression is the largest raw worsening (5.948 dB)
  assert.equal(safety.worstRegressionDb, 5.9, "worst regression magnitude preserved");
});

test("CASE C — winner selection rejects the unsafe candidate", () => {
  const selection = selectConfirmedRecommendations(
    [CASE_C_CANDIDATE],
    makeSnapshot(),
    CASE_C_BASELINE,
  );
  assert.equal(selection.winner, null, "Case C unsafe candidate must NOT be the winner");
  assert.equal(selection.recommendations.length, 0, "no safe recommendation for Case C");
  assert.ok(selection.tradeOffs.length >= 1, "Case C retained as a trade-off");
  const tradeOff = selection.tradeOffs.find((t) => t.candidateId === "case-c-unsafe");
  assert.ok(tradeOff, "Case C trade-off entry present");
  assert.equal(tradeOff.protectedSafety.safe, false, "trade-off carries the shared safety result");
  assert.equal(tradeOff.protectedSafety.worstRegressionDb, 5.9, "regression magnitude preserved on the trade-off");
});

test("CASE C — Apply eligibility uses the same authority and refuses", () => {
  const regression = protectedSeatRegressionForApply(CASE_C_CANDIDATE, CASE_C_BASELINE);
  assert.equal(regression.regressed, true, "Apply sees the primary-seat regression");
  assert.ok(regression.seatId, "Apply names the regressing seat");
  assert.ok(regression.parameter, "Apply names the parameter");
});

test("CASE C — overall P20 improvement remains visible", () => {
  const selection = selectConfirmedRecommendations(
    [CASE_C_CANDIDATE],
    makeSnapshot(),
    CASE_C_BASELINE,
  );
  const evaluation = selection.evaluations.find((e) => e.candidateId === "case-c-unsafe");
  assert.ok(evaluation, "Case C is evaluated");
  assert.equal(CASE_C_CANDIDATE.achievedP20VariationDb, 4.5, "candidate overall P20 is 4.5 dB");
  assert.equal(CASE_C_BASELINE.achievedP20VariationDb, 7.0, "baseline overall P20 is 7.0 dB");
  // The improvement is real and preserved on the candidate record.
  assert.ok(CASE_C_BASELINE.achievedP20VariationDb > CASE_C_CANDIDATE.achievedP20VariationDb, "overall P20 improves");
});

// ---------------------------------------------------------------------------
// CASE A — the historical successful safe candidate (regression control)
// A candidate that improves a primary seat and regresses nothing.
// ---------------------------------------------------------------------------

const CASE_A_BASELINE = makeResult({
  candidateId: "current",
  candidateKind: "current",
  isPositionCandidate: false,
  primary: [{ id: "seat-r1-c1", p19Raw: 5.8, p20Raw: 7.0 }], // L1 / L1
  achievedP19VariationDb: 5.8, // L1
  achievedP20VariationDb: 7.0,  // L1
});

const CASE_A_CANDIDATE = makeResult({
  candidateId: "case-a-safe",
  primary: [{ id: "seat-r1-c1", p19Raw: 4.8, p20Raw: 7.0 }], // L2 / L1 (P19 improves, P20 holds)
  achievedP19VariationDb: 4.8, // L2 — aggregate P19 improves L1->L2
  achievedP20VariationDb: 7.0,  // L1 (held)
});

test("CASE A — safe candidate passes the shared authority", () => {
  const safety = evaluateProtectedSeatSafety(CASE_A_CANDIDATE, CASE_A_BASELINE);
  assert.equal(safety.safe, true, "Case A is safe");
  assert.equal(safety.evidenceComplete, true);
  assert.equal(safety.protectedSeatRegressions.length, 0);
});

test("CASE A — safe candidate remains eligible as the winner", () => {
  const selection = selectConfirmedRecommendations(
    [CASE_A_CANDIDATE],
    makeSnapshot({ effectiveConfiguration: null }),
    CASE_A_BASELINE,
  );
  assert.ok(selection.winner, "Case A safe candidate must remain the winner");
  assert.equal(selection.winner.candidateId, "case-a-safe");
  assert.equal(selection.tradeOffs.length, 0, "no trade-off for a safe candidate");
});

// ---------------------------------------------------------------------------
// Other control cases required by the task
// ---------------------------------------------------------------------------

test("Candidate improves overall P20 and no Primary seat regresses -> safe eligible", () => {
  const baseline = makeResult({
    candidateId: "current", candidateKind: "current", isPositionCandidate: false,
    primary: [{ id: "seat-r1-c1", p19Raw: 5.8, p20Raw: 7.0 }], // L1 / L1
    achievedP19VariationDb: 5.8, achievedP20VariationDb: 7.0,
  });
  const candidate = makeResult({
    candidateId: "safe-improve",
    primary: [{ id: "seat-r1-c1", p19Raw: 4.8, p20Raw: 5.5 }], // L2 / L2 (both improve)
    achievedP19VariationDb: 4.8, achievedP20VariationDb: 5.5,
  });
  const safety = evaluateProtectedSeatSafety(candidate, baseline);
  assert.equal(safety.safe, true);
  const selection = selectConfirmedRecommendations([candidate], makeSnapshot(), baseline);
  assert.ok(selection.winner, "safe improvement should be the winner");
});

test("Candidate improves one Primary seat and worsens another beyond tolerance -> unsafe/trade-off", () => {
  const baseline = makeResult({
    candidateId: "current", candidateKind: "current", isPositionCandidate: false,
    primary: [
      { id: "seat-r1-c1", p19Raw: 3.5, p20Raw: 3.5 }, // L3 / L3
      { id: "seat-r1-c2", p19Raw: 3.5, p20Raw: 3.5 }, // L3 / L3
    ],
    achievedP19VariationDb: 3.5, achievedP20VariationDb: 3.5,
  });
  // Seat 1 improves L3->L4; seat 2 worsens same-level raw by +2.0 dB (beyond 1.0 dB).
  const candidate = makeResult({
    candidateId: "mixed-primary",
    primary: [
      { id: "seat-r1-c1", p19Raw: 2.0, p20Raw: 2.0 }, // L4 / L4 (improves)
      { id: "seat-r1-c2", p19Raw: 5.5, p20Raw: 5.5 }, // L1 / L1 (raw +2.0, level drops L3->L1)
    ],
    achievedP19VariationDb: 3.5, achievedP20VariationDb: 2.5,
  });
  const safety = evaluateProtectedSeatSafety(candidate, baseline);
  assert.equal(safety.safe, false, "worsening a primary seat by >1dB is unsafe");
  assert.ok(safety.protectedSeatRegressions.length >= 1, "the worsened primary seat is recorded");
  const selection = selectConfirmedRecommendations([candidate], makeSnapshot(), baseline);
  assert.equal(selection.winner, null, "unsafe mixed candidate is not the winner");
  assert.ok(selection.tradeOffs.length >= 1, "retained as a trade-off");
});

test("Candidate makes no meaningful change -> not promoted merely because it is safe", () => {
  const baseline = makeResult({
    candidateId: "current", candidateKind: "current", isPositionCandidate: false,
    primary: [{ id: "seat-r1-c1", p19Raw: 4.8, p20Raw: 7.0 }], // L2 / L1
    achievedP19VariationDb: 4.8, achievedP20VariationDb: 7.0,
  });
  // Same levels, only 0.3 dB improvement (below the 1.0 dB materiality threshold).
  const candidate = makeResult({
    candidateId: "no-change",
    primary: [{ id: "seat-r1-c1", p19Raw: 4.5, p20Raw: 7.0 }], // L2 / L1 (P19 +0.3 dB, same level)
    achievedP19VariationDb: 4.5, achievedP20VariationDb: 7.0,
  });
  const safety = evaluateProtectedSeatSafety(candidate, baseline);
  assert.equal(safety.safe, true, "no regression, so safe");
  const selection = selectConfirmedRecommendations([candidate], makeSnapshot(), baseline);
  assert.equal(selection.winner, null, "safe but immaterial -> no winner");
  assert.equal(selection.tradeOffs.length, 0, "no trade-off for an immaterial change");
});

test("Candidate lacks complete Primary-seat evidence -> cannot be marked safe", () => {
  const baseline = makeResult({
    candidateId: "current", candidateKind: "current", isPositionCandidate: false,
    primary: [{ id: "seat-r1-c1", p19Raw: 3.5, p20Raw: 3.5 }], // L3 / L3
    achievedP19VariationDb: 3.5, achievedP20VariationDb: 3.5,
  });
  // Candidate with NO primary seats (all seats marked non-primary).
  const candidate = makeResult({
    candidateId: "no-primary",
    primary: [],
    secondary: [{ id: "seat-r2-c1", p19Raw: 2.0, p20Raw: 2.0 }],
    achievedP19VariationDb: 2.0, achievedP20VariationDb: 2.0,
  });
  const safety = evaluateProtectedSeatSafety(candidate, baseline);
  assert.equal(safety.safe, false, "missing primary-seat evidence must not default to safe");
  assert.equal(safety.evidenceComplete, false, "evidence flagged incomplete");
  assert.equal(safety.reason, "missing-primary-seat-evidence");
});

test("Missing baseline -> unsafe and incomplete", () => {
  const safety = evaluateProtectedSeatSafety(CASE_C_CANDIDATE, null);
  assert.equal(safety.safe, false);
  assert.equal(safety.evidenceComplete, false);
});

test("P19 safety rule remains intact — a P19 primary-seat level drop is unsafe", () => {
  const baseline = makeResult({
    candidateId: "current", candidateKind: "current", isPositionCandidate: false,
    primary: [{ id: "seat-r1-c1", p19Raw: 2.79, p20Raw: 3.5 }], // L4 / L3
    achievedP19VariationDb: 2.79, achievedP20VariationDb: 3.5,
  });
  const candidate = makeResult({
    candidateId: "p19-drop",
    primary: [{ id: "seat-r1-c1", p19Raw: 4.28, p20Raw: 3.5 }], // L2 / L3 (P19 level drops L4->L2)
    achievedP19VariationDb: 4.28, achievedP20VariationDb: 3.5,
  });
  const safety = evaluateProtectedSeatSafety(candidate, baseline);
  assert.equal(safety.safe, false, "P19 primary level drop is unsafe");
  const p19Regression = safety.protectedSeatRegressions.find((r) => r.parameter === "P19");
  assert.ok(p19Regression, "P19 regression recorded");
  assert.equal(p19Regression.currentLevel, 4);
  assert.equal(p19Regression.candidateLevel, 2);
});

test("Shared authority agrees with the existing canonical Apply rule", () => {
  // The shared authority must reach the same safe/unsafe verdict as the
  // existing hasPrimarySeatRegression for a range of cases.
  const cases = [
    [CASE_C_CANDIDATE, CASE_C_BASELINE],
    [CASE_A_CANDIDATE, CASE_A_BASELINE],
  ];
  for (const [candidate, baseline] of cases) {
    const shared = evaluateProtectedSeatSafety(candidate, baseline);
    const canonical = hasPrimarySeatRegression(candidate, baseline);
    assert.equal(shared.safe, !canonical.regressed, "shared safe === canonical not-regressed");
  }
});

test("Display: improvement panel suppresses 'No protected seat gets worse' when a regression is carried", () => {
  // resolveImprovementResult reads calibrationDecision.regression (the shared
  // authority result Apply recorded). Simulate the decision shape.
  const unsafeDecision = {
    decision: "hold",
    regression: protectedSeatRegressionForApply(CASE_C_CANDIDATE, CASE_C_BASELINE),
    before: { p20: { deviationDb: 7.5, level: "L1" } },
    after: { p20: { deviationDb: 5.5, level: "L2" } },
    statement: "Not applied because a primary seat would regress.",
  };
  const unsafe = resolveImprovementResult({
    planView: { levers: [] },
    headline: { kind: "improvement", adjustment: "Move sub" },
    summary: { recommendedLever: "placement" },
    calibrationDecision: unsafeDecision,
    calibrationKind: null,
    tradeOffActive: true, // trade-off workflow owns the panel
  });
  // When the trade-off workflow owns it, the improvement panel claims nothing.
  assert.equal(unsafe.caseKey, IMPROVEMENT_CASE.TRADE_OFF);
  assert.equal(unsafe.seats, null, "no seats text when trade-off owns the panel");

  // A safe decision carries no regression -> the safe text is allowed.
  const safeDecision = {
    decision: "hold",
    regression: { regressed: false },
    before: { p20: { deviationDb: 7.5, level: "L1" } },
    after: { p20: { deviationDb: 6.0, level: "L2" } },
    statement: "Held for your approval.",
  };
  const safe = resolveImprovementResult({
    planView: {
      levers: [
        { key: "placement", evaluated: true, canApply: true, changes: [{ a: 1 }], effect: "x" },
      ],
    },
    headline: { kind: "improvement", adjustment: "Move sub", comparison: "L1 -> L2" },
    summary: { recommendedLever: "placement" },
    calibrationDecision: safeDecision,
    calibrationKind: null,
  });
  assert.equal(safe.caseKey, IMPROVEMENT_CASE.REVIEW);
  assert.ok(safe.seats, "safe candidate shows the seats block");
  assert.equal(safe.seats.text, "No protected seat gets worse", "safe wording shown only when safe");
});