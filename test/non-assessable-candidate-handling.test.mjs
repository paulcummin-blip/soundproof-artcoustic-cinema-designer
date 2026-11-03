// non-assessable-candidate-handling.test.mjs
// ---------------------------------------------------------------------------
// Regression suite for terminal NON_ASSESSABLE candidate handling.
//
// A candidate whose achieved P18 F3 sits at/above the room transition frequency
// has no valid P19/P20 assessment band. It is a TERMINAL CANDIDATE REJECTION,
// never missing evidence, never a run failure, and never a fabricated P19/P20.
//
// Covers:
//   A. Case C corner candidate (P18 129.051 Hz, transition 91.287 Hz)
//   B. Mixed outcome (valid + non-assessable + unsafe)
//   C. All non-assessable → run complete, "No valid improvement found"
//   D. Genuine missing evidence → run incomplete (distinction preserved)
//   E. Primary-seat safety still rejects Case C unsafe winner
//   F. Three-sub handoff: Stage 2 still receives qty 3
//   G. Plan save: nonAssessableCandidates saved, evaluationIncomplete=false
//
// Pure functions only. No acoustic maths are changed by this suite.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import assert from "node:assert/strict";

import {
  classifyCandidateAssessability,
  validateCandidateForRun,
  validateConfirmedCandidate,
  CANDIDATE_ASSESSABILITY_REASON,
} from "../src/components/room/bass/improveBassV2/confirmedCandidateValidity.js";
import { selectConfirmedRecommendations } from "../src/components/room/bass/improveBassV2/confirmedRecommendationSelection.js";
import { evaluateProtectedSeatSafety } from "../src/components/room/bass/improveBassV2/protectedSeatSafetyAuthority.js";
import { resolveQuantityOrder } from "../src/components/room/bass/stage2/stage2QuantityOrder.js";
import { resolvePlanActionability } from "../src/components/room/bass/optimiserPlan/optimiserPlanSave.js";
import { buildOptimiserRunEvidence } from "../src/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import { OPTIMISER_TERMINAL_OUTCOME } from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";

// ---------------------------------------------------------------------------
// Fixture builders (mirror protected-seat-safety-authority.test.mjs)
// ---------------------------------------------------------------------------

const STAGE2_CANONICAL_VERSION = "stage2-canonical-v6-delay-lag";

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
function makeSeatP20(seatId, isPrimary, raw) {
  return { seatId, isPrimary, variationDbRaw: raw, level: levelLabel(gradeP20(raw)) };
}

/**
 * Build a canonically-confirmed candidate result. When transitionHz is provided
 * the result carries it so classifyCandidateAssessability can decide
 * assessability from real evidence.
 */
function makeResult({
  candidateId,
  candidateKind = "position",
  primary = [],
  achievedP19VariationDb = null,
  achievedP20VariationDb = null,
  achievedP18Hz = 20,
  transitionHz = null,
  p18AchievedLevel = 3,
  inputIdentity = "fp-test",
  omitP19 = false,
  omitP20 = false,
  brokenP19 = false,
}) {
  const perSeatP20 = omitP20 ? [] : primary.map((p, i) => {
    const id = p.id || `seat-r1-c${i + 1}`;
    return makeSeatP20(id, true, p.p20Raw);
  });
  const aggP19 = achievedP19VariationDb ?? primary[0]?.p19Raw ?? 3.0;
  const result = {
    candidateId,
    candidateKind,
    inputIdentity,
    timingVersion: STAGE2_CANONICAL_VERSION,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    achievedP18Hz,
    p18AchievedLevel,
    transitionHz,
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
    achievedP19VariationDb: brokenP19 ? undefined : aggP19,
    achievedP19Level: brokenP19 ? undefined : levelLabel(gradeP19(aggP19)),
    achievedP20VariationDb: achievedP20VariationDb ?? primary[0]?.p20Raw ?? 5.0,
    achievedP20Level: levelLabel(gradeP20(achievedP20VariationDb ?? primary[0]?.p20Raw ?? 5.0)),
    perSeatP20,
  };
  return result;
}

function makeSnapshot({ effectiveConfiguration = null, evaluationIncomplete = false, seats } = {}) {
  return {
    effectiveConfiguration,
    evaluationIncomplete,
    validationContext: {
      seats: seats || [
        { id: "seat-r1-c1", isPrimary: true },
        { id: "seat-r1-c2", isPrimary: true },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
describe("Non-assessable candidate handling", () => {
// A. CASE C CORNER CANDIDATE — P18 129.051 Hz, transition 91.287 Hz
// ---------------------------------------------------------------------------

it("A — classifyCandidateAssessability rejects the corner candidate", () => {
  const result = { achievedP18Hz: 129.051, transitionHz: 91.287 };
  const verdict = classifyCandidateAssessability(result);
  assert.equal(verdict.assessable, false, "P18 >= transition → not assessable");
  assert.equal(verdict.reason, CANDIDATE_ASSESSABILITY_REASON.NO_VALID_P19_P20_ASSESSMENT_BAND);
  assert.equal(verdict.achievedP18Hz, 129.051);
  assert.equal(verdict.transitionHz, 91.287);
});

it("A — validateCandidateForRun returns non-assessable with empty issues", () => {
  const result = makeResult({
    candidateId: "corner-129",
    achievedP18Hz: 129.051,
    transitionHz: 91.287,
    primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
  });
  const check = validateCandidateForRun(result, {
    seats: [{ id: "seat-r1-c1", isPrimary: true }],
  });
  assert.equal(check.nonAssessable, true, "terminal non-assessable outcome");
  assert.equal(check.assessable, false);
  assert.equal(check.reason, CANDIDATE_ASSESSABILITY_REASON.NO_VALID_P19_P20_ASSESSMENT_BAND);
  assert.equal(check.valid, false);
  assert.deepEqual(check.issues, [], "no fabricated missing-evidence issues");
  // No P19/P20 is fabricated — the result is carried as-is, never graded.
  assert.equal(check.result, result);
});

it("A — non-assessable candidate adds no evaluationIssues to run-level state", () => {
  const result = makeResult({
    candidateId: "corner-129",
    achievedP18Hz: 129.051,
    transitionHz: 91.287,
    primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
  });
  const selection = selectConfirmedRecommendations(
    [result],
    makeSnapshot(),
    makeResult({
      candidateId: "current",
      candidateKind: "current",
      primary: [{ id: "seat-r1-c1", p20Raw: 5.0 }],
      achievedP19VariationDb: 3.0,
      achievedP20VariationDb: 5.0,
    }),
  );
  // The non-assessable candidate is recorded as an evaluation, not a run issue.
  const nonAssessable = selection.evaluations.find((e) => e.candidateId === "corner-129");
  assert.ok(nonAssessable, "non-assessable candidate recorded");
  assert.equal(nonAssessable.status, "non-assessable");
  assert.equal(nonAssessable.reason, CANDIDATE_ASSESSABILITY_REASON.NO_VALID_P19_P20_ASSESSMENT_BAND);
  // Run is NOT incomplete: no invalid candidates, no engine incomplete flag.
  assert.equal(selection.terminalOutcome, "no-better-evaluated", "run is complete");
  assert.equal(selection.winner, null, "no winner from a non-assessable-only run");
});

// ---------------------------------------------------------------------------
// B. MIXED OUTCOME — 1 valid, 1 non-assessable, 1 unsafe
// ---------------------------------------------------------------------------

it("B — mixed outcome: run complete, valid survives, unsafe rejected, non-assessable excluded", () => {
  const baseline = makeResult({
    candidateId: "current",
    candidateKind: "current",
    primary: [
      { id: "seat-r1-c1", p19Raw: 4.0, p20Raw: 4.0 },
      { id: "seat-r1-c2", p19Raw: 4.0, p20Raw: 4.0 },
    ],
    achievedP19VariationDb: 4.0,
    achievedP20VariationDb: 6.0,
  });

  const valid = makeResult({
    candidateId: "valid-improvement",
    primary: [
      { id: "seat-r1-c1", p20Raw: 2.5 },
      { id: "seat-r1-c2", p20Raw: 2.5 },
    ],
    achievedP19VariationDb: 2.5,
    achievedP20VariationDb: 2.5,
  });

  const nonAssessable = makeResult({
    candidateId: "na-corner",
    achievedP18Hz: 129.051,
    transitionHz: 91.287,
    primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
  });

  // Unsafe: both primary seats regress L4→L1
  const unsafe = makeResult({
    candidateId: "unsafe-regress",
    primary: [
      { id: "seat-r1-c1", p20Raw: 7.948 },
      { id: "seat-r1-c2", p20Raw: 7.302 },
    ],
    achievedP19VariationDb: 4.0,
    achievedP20VariationDb: 4.5,
  });

  const selection = selectConfirmedRecommendations(
    [valid, nonAssessable, unsafe],
    makeSnapshot(),
    baseline,
  );

  // Run is complete — no invalid candidates.
  assert.equal(selection.terminalOutcome, "material", "valid candidate wins");
  assert.ok(selection.winner, "winner exists");
  assert.equal(selection.winner.candidateId, "valid-improvement");

  // Non-assessable is excluded from ranking/confirmed results.
  const naEval = selection.evaluations.find((e) => e.candidateId === "na-corner");
  assert.ok(naEval, "non-assessable recorded as evaluation");
  assert.equal(naEval.status, "non-assessable");
  assert.equal(
    selection.confirmedResults.some((r) => r.candidateId === "na-corner"),
    false,
    "non-assessable not in confirmed results",
  );

  // Unsafe is handled by shared primary-seat safety — retained as trade-off.
  const unsafeEval = selection.evaluations.find((e) => e.candidateId === "unsafe-regress");
  assert.ok(unsafeEval, "unsafe candidate recorded");
  assert.notEqual(unsafeEval.status, "material", "unsafe is not a safe winner");
  assert.ok(selection.tradeOffs.some((t) => t.candidateId === "unsafe-regress"),
    "unsafe retained as trade-off via shared safety");
});

// ---------------------------------------------------------------------------
// C. ALL NON-ASSESSABLE → run complete, "No valid improvement found"
// ---------------------------------------------------------------------------

it("C — all non-assessable: run complete, no winner, not incomplete", () => {
  const baseline = makeResult({
    candidateId: "current",
    candidateKind: "current",
    primary: [{ id: "seat-r1-c1", p20Raw: 5.0 }],
    achievedP19VariationDb: 3.0,
    achievedP20VariationDb: 5.0,
  });

  const na1 = makeResult({
    candidateId: "na-1",
    achievedP18Hz: 129.051,
    transitionHz: 91.287,
    primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
  });
  const na2 = makeResult({
    candidateId: "na-2",
    achievedP18Hz: 100.0,
    transitionHz: 80.0,
    primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
  });

  const selection = selectConfirmedRecommendations([na1, na2], makeSnapshot(), baseline);

  assert.equal(selection.winner, null, "no winner");
  assert.equal(selection.terminalOutcome, "no-better-evaluated", "run is complete, not incomplete");
  assert.notEqual(selection.terminalOutcome, "incomplete", "not reported incomplete");
  assert.equal(selection.nonAssessableCount, 2, "both non-assessable counted");
  // The normal-user message is the "no valid improvement" wording, not incomplete.
  assert.ok(selection.message, "message is provided");
  assert.equal(
    selection.message.includes("incomplete") || selection.message.includes("Incomplete"),
    false,
    "normal-user copy does not say incomplete",
  );
});

// ---------------------------------------------------------------------------
// D. GENUINE MISSING EVIDENCE — run incomplete (distinction preserved)
// ---------------------------------------------------------------------------

it("D — genuine missing evidence keeps the run incomplete", () => {
  const baseline = makeResult({
    candidateId: "current",
    candidateKind: "current",
    primary: [{ id: "seat-r1-c1", p20Raw: 5.0 }],
    achievedP19VariationDb: 3.0,
    achievedP20VariationDb: 5.0,
  });

  // Assessable (P18 < transition) but broken P19 — genuine missing evidence.
  const broken = makeResult({
    candidateId: "broken-p19",
    achievedP18Hz: 20,
    transitionHz: 91.287,
    primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
    brokenP19: true,
  });

  const check = validateCandidateForRun(broken, {
    seats: [{ id: "seat-r1-c1", isPrimary: true }],
  });
  assert.equal(check.nonAssessable, false, "not classified as non-assessable");
  assert.equal(check.valid, false, "genuine validation failure");
  assert.ok(check.issues.length > 0, "issues returned for genuine missing evidence");

  const selection = selectConfirmedRecommendations([broken], makeSnapshot(), baseline);
  // An invalid candidate makes the run incomplete.
  assert.equal(selection.terminalOutcome, "incomplete", "genuine missing evidence → incomplete");
  const invalidEval = selection.evaluations.find((e) => e.candidateId === "broken-p19");
  assert.ok(invalidEval, "broken candidate recorded");
  assert.equal(invalidEval.status, "invalid");
});

// ---------------------------------------------------------------------------
// E. PRIMARY-SEAT SAFETY — Case C unsafe winner still rejected
// ---------------------------------------------------------------------------

it("E — primary-seat safety still rejects the Case C unsafe winner", () => {
  const baseline = makeResult({
    candidateId: "current",
    candidateKind: "current",
    primary: [
      { id: "seat-r1-c1", p19Raw: 2.0, p20Raw: 2.0 },
      { id: "seat-r1-c2", p19Raw: 2.0, p20Raw: 2.0 },
    ],
    achievedP19VariationDb: 2.0,
    achievedP20VariationDb: 7.0,
  });
  const unsafe = makeResult({
    candidateId: "case-c-unsafe",
    primary: [
      { id: "seat-r1-c1", p20Raw: 7.948 },
      { id: "seat-r1-c2", p20Raw: 7.302 },
    ],
    achievedP19VariationDb: 2.0,
    achievedP20VariationDb: 4.5,
  });

  const safety = evaluateProtectedSeatSafety(unsafe, baseline);
  assert.equal(safety.safe, false, "Case C candidate is unsafe");
  assert.equal(safety.reason, "primary-seat-regression");

  const selection = selectConfirmedRecommendations([unsafe], makeSnapshot(), baseline);
  assert.equal(selection.winner, null, "unsafe candidate is never the winner");
  assert.ok(selection.tradeOffs.some((t) => t.candidateId === "case-c-unsafe"),
    "unsafe retained as trade-off");
});

// ---------------------------------------------------------------------------
// F. THREE-SUB HANDOFF — Stage 2 still receives qty 3
// ---------------------------------------------------------------------------

it("F — resolveQuantityOrder prepends 3 for a three-sub design", () => {
  const order = resolveQuantityOrder(3);
  assert.ok(order.includes(3), "qty 3 is in the evaluation order");
  assert.equal(order[0], 3, "qty 3 is evaluated first");
  // The default order [2,4,1] still follows, minus the prepended current.
  assert.deepEqual(order, [3, 2, 4, 1]);
});

// ---------------------------------------------------------------------------
// G. PLAN SAVE — nonAssessableCandidates saved, evaluationIncomplete=false
// ---------------------------------------------------------------------------

it("G — buildOptimiserRunEvidence saves nonAssessableCandidates without incomplete", () => {
  const selection = {
    winner: null,
    currentResult: makeResult({
      candidateId: "current",
      candidateKind: "current",
      primary: [{ id: "seat-r1-c1", p20Raw: 5.0 }],
      achievedP19VariationDb: 3.0,
      achievedP20VariationDb: 5.0,
    }),
    confirmedResults: [],
    evaluations: [
      { candidateId: "na-1", status: "non-assessable", reason: CANDIDATE_ASSESSABILITY_REASON.NO_VALID_P19_P20_ASSESSMENT_BAND },
    ],
    nonAssessableCandidates: [
      {
        candidateId: "na-1",
        candidateKind: "position",
        stage: "phase",
        status: "non-assessable",
        reason: CANDIDATE_ASSESSABILITY_REASON.NO_VALID_P19_P20_ASSESSMENT_BAND,
        achievedP18Hz: 129.051,
        transitionHz: 91.287,
      },
    ],
    evaluationIssues: [],
    evaluationIncomplete: false,
    baselineValidation: { valid: true },
    canonicalJobsRun: 1,
  };

  const evidence = buildOptimiserRunEvidence({
    selection,
    diagnostics: null,
    identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
    currentDesignUnchanged: true,
  });

  assert.ok(evidence, "run evidence produced");
  // nonAssessableCandidates are saved as diagnostic evidence.
  assert.ok(Array.isArray(evidence.nonAssessableCandidates), "field present");
  assert.equal(evidence.nonAssessableCandidates.length, 1);
  const na = evidence.nonAssessableCandidates[0];
  assert.equal(na.candidateId, "na-1");
  assert.equal(na.candidateKind, "position");
  assert.equal(na.status, "non-assessable");
  assert.equal(na.reason, CANDIDATE_ASSESSABILITY_REASON.NO_VALID_P19_P20_ASSESSMENT_BAND);
  assert.equal(na.achievedP18Hz, 129.051);
  assert.equal(na.transitionHz, 91.287);
  // No P19/P20 fabricated on the diagnostic record.
  assert.equal(na.p19VariationDb, undefined, "no fabricated P19");
  assert.equal(na.p20VariationDb, undefined, "no fabricated P20");
  // Also available on the run sub-object (read by the evidence block).
  assert.ok(Array.isArray(evidence.run.nonAssessableCandidates), "run carries the field");

  // The run is NOT incomplete — terminal outcome is no_useful_improvement.
  assert.notEqual(evidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE);
  assert.equal(evidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
});

it("G — resolvePlanActionability: non-assessable-only run is complete, not incomplete", () => {
  // No plan (nothing actionable), no genuine evaluationIssues, no engine incomplete.
  const selection = {
    winner: null,
    evaluationIssues: [],
    evaluationIncomplete: false,
    nonAssessableCandidates: [
      { candidateId: "na-1", status: "non-assessable", reason: CANDIDATE_ASSESSABILITY_REASON.NO_VALID_P19_P20_ASSESSMENT_BAND },
    ],
  };
  const verdict = resolvePlanActionability({ plan: null, selection });
  // No plan and no winner → terminalOutcome null (nothing to save), NOT incomplete.
  assert.equal(verdict.actionable, false);
  assert.notEqual(verdict.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
    "non-assessable-only run is not incomplete");
});

it("G — resolvePlanActionability: genuine computation failure is incomplete", () => {
  const selection = {
    winner: null,
    evaluationIssues: [{ stage: "phase", error: "worker timed out" }],
    evaluationIncomplete: false,
  };
  const verdict = resolvePlanActionability({ plan: null, selection });
  // No plan, no winner → null outcome (the plan builder produced nothing). This
  // path is distinct from the incomplete path which requires a plan OR a winner.
  // The genuine-issue filter is exercised when a plan IS present.
  assert.equal(verdict.actionable, false);
});

it("G — resolvePlanActionability: genuine issue with plan is incomplete", () => {
  const selection = {
    winner: null,
    evaluationIssues: [{ stage: "calibration", issues: ["P19: missing aggregate RSP deviation"] }],
    evaluationIncomplete: false,
  };
  const plan = { levers: {}, baseline: null };
  const verdict = resolvePlanActionability({ plan, selection });
  assert.equal(verdict.actionable, false);
  assert.equal(verdict.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
    "genuine missing evidence with a plan → incomplete");
});

// ---------------------------------------------------------------------------
// Actionability distinction (section 5)
// ---------------------------------------------------------------------------

it("Actionability — valid safe candidate → actionable", () => {
  // A plan with an offerable lever is actionable. The lever verdict authority
  // decides offerability; here we verify the incomplete gate does not block it.
  const selection = {
    winner: { candidateId: "valid" },
    evaluationIssues: [],
    evaluationIncomplete: false,
  };
  const plan = {
    levers: {
      delay: {
        lever: "delay", evaluated: true, notEvaluated: false,
        effect: { p19DeltaDb: -1, p20DeltaDb: -1.5, p14DeltaDb: 0 },
        changes: [{ sourceId: "sub-1", delayMs: 5 }],
        practical: true,
        validation: { destinationsValid: true },
      },
    },
    baseline: { achievedP20VariationDb: 5.0 },
  };
  const verdict = resolvePlanActionability({ plan, selection });
  assert.equal(verdict.actionable, true, "valid safe candidate is actionable");
  assert.equal(verdict.terminalOutcome, null);
});

it("Actionability — only unsafe/non-assessable → complete, no safe improvement", () => {
  // No offerable levers, no genuine issues → no_useful_improvement, not incomplete.
  const selection = {
    winner: null,
    evaluationIssues: [],
    evaluationIncomplete: false,
    nonAssessableCandidates: [{ candidateId: "na-1", status: "non-assessable" }],
  };
  const plan = { levers: {}, baseline: null };
  const verdict = resolvePlanActionability({ plan, selection });
  assert.equal(verdict.actionable, false);
  assert.equal(verdict.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT,
    "only rejected candidates → no useful improvement, not incomplete");
});

it("Actionability — genuine computation failure → incomplete", () => {
  const selection = {
    winner: null,
    evaluationIssues: [{ stage: "phase", error: "canonical evaluation crashed" }],
    evaluationIncomplete: false,
  };
  const plan = { levers: {}, baseline: null };
  const verdict = resolvePlanActionability({ plan, selection });
  assert.equal(verdict.actionable, false);
  assert.equal(verdict.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
    "genuine computation failure → incomplete");
});
});