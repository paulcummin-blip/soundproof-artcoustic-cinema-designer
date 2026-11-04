// p14-operating-point-rejection.test.mjs
// ---------------------------------------------------------------------------
// Regression suite for PHYSICAL / OPERATING-POINT REJECTION as a terminal
// candidate outcome — distinct from NON-ASSESSABLE (P18 above transition) and
// from genuine missing evidence.
//
// When the requested P14 operating target cannot be achieved, the canonical
// authority deliberately does NOT evaluate P18/P19/P20. That is a completed
// physical rejection, not a calculation failure:
//   - the candidate is terminally rejected (assessable = false)
//   - the reason (p14-operating-point-not-achieved) survives the full chain
//   - the requested + achieved P14 dB travel with the verdict
//   - P18/P19/P20 are never fabricated
//   - the run is NOT incomplete because of these candidates
//   - genuine missing evidence and P18-above-transition remain separately
//     classified
//
// Covers:
//   A. P14 target achieved → downstream P18/P19/P20 evaluate normally
//   B. P14 target not achieved → terminal rejected candidate, reason preserved
//   C. P14 rejected candidate → no fabricated P18/P19/P20
//   D. Mixed run → run complete, valid survives, P14-rejected retained
//   E. All P14-rejected → complete, NO_USEFUL_IMPROVEMENT, not incomplete
//   F. P18 above transition → still NO_VALID_P19_P20_ASSESSMENT_BAND
//   G. Genuine missing evidence → still invalid/incomplete
//   H. Primary-seat safety unchanged
//   I. Three-sub Stage 2 handoff unchanged
//   J. Run evidence preserves P14 candidate ID, kind, reason, requested/achieved
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
import { resolveQuantityOrder } from "../src/components/room/bass/stage2/stage2QuantityOrder.js";
import { buildOptimiserRunEvidence } from "../src/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import { OPTIMISER_TERMINAL_OUTCOME } from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import { STAGE2_CANONICAL_VERSION } from "../src/components/room/bass/stage2/stage2Constants.js";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

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

/**
 * Build a canonically-confirmed candidate result.
 *
 * `p14Rejected = true` mirrors the canonical authority's behaviour when the
 * requested P14 operating target cannot be achieved: requestedP14Pass === false
 * with reason p14-operating-point-not-achieved, and P18/P19/P20 deliberately
 * NOT evaluated (null/absent, assessment band null). This is the exact shape
 * evaluateStage2Confirmation now produces for a P14 operating-point failure.
 */
function makeResult({
  candidateId,
  candidateKind = "position",
  primary = [],
  achievedP19VariationDb = null,
  achievedP20VariationDb = null,
  achievedP18Hz = 20,
  transitionHz = 80,
  p18AchievedLevel = 3,
  p14Rejected = false,
  p14AchievedDb = 117,
  p14TargetDb = 117,
  requestedP14Pass = true,
  p14NotAchievedReason = null,
  inputIdentity = "fp-test",
} = {}) {
  const perSeatP20 = primary.map((s) => ({
    seatId: s.id,
    isPrimary: s.isPrimary !== false,
    variationDbRaw: s.p20Raw,
    level: levelLabel(gradeP20(s.p20Raw)),
  }));
  const aggP19 = achievedP19VariationDb ?? primary[0]?.p19Raw ?? 3.0;
  const p20Raw = achievedP20VariationDb ?? primary[0]?.p20Raw ?? 5.0;

  // P14 operating-point failure: P18/P19/P20 intentionally not evaluated.
  const p14Fail = p14Rejected === true;
  return {
    candidateId,
    candidateKind,
    inputIdentity,
    timingVersion: STAGE2_CANONICAL_VERSION,
    // P14 operating-point rejection fields (carried by evaluateStage2Confirmation)
    requestedP14Pass: p14Fail ? false : requestedP14Pass,
    p14NotAchievedReason: p14Fail
      ? (p14NotAchievedReason || "p14-operating-point-not-achieved")
      : null,
    p14AchievedDb,
    p14AchievedLevel: p14Fail ? 0 : 2,
    p14TargetDb,
    operatingOutputDb: p14Fail ? p14AchievedDb : 117,
    // When P14 failed, the authority deliberately did not evaluate these.
    achievedP18Hz: p14Fail ? null : achievedP18Hz,
    p18AchievedLevel: p14Fail ? 0 : p18AchievedLevel,
    assessmentStartHz: p14Fail ? null : 20,
    assessmentEndHz: p14Fail ? null : 200,
    transitionHz,
    canonicalAuthorityReceipt: { selectedCandidateId: candidateId, postEqCurveSignature: "sig" },
    physicalValidation: { passed: true },
    appliedTuning: [
      { sourceId: "sub-1", delayMs: 0, gainDb: 0, polarity: 1 },
      { sourceId: "sub-2", delayMs: 0, gainDb: 0, polarity: 1 },
    ],
    achievedP19VariationDb: p14Fail ? null : aggP19,
    achievedP19Level: p14Fail ? null : levelLabel(gradeP19(aggP19)),
    achievedP20VariationDb: p14Fail ? null : p20Raw,
    achievedP20Level: p14Fail ? null : levelLabel(gradeP20(p20Raw)),
    perSeatP20: p14Fail ? [] : perSeatP20,
  };
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

function makeSnapshotForBaseline(baselineResult, opts = {}) {
  const seats = (baselineResult?.perSeatP20 || []).map((s) => ({
    id: String(s.seatId),
    isPrimary: s.isPrimary !== false,
  }));
  return makeSnapshot({ ...opts, seats });
}

// ---------------------------------------------------------------------------
describe("P14 operating-point rejection — terminal candidate outcome", () => {

  // A. P14 target achieved → downstream P18/P19/P20 evaluate normally
  it("A — P14 target achieved: candidate validates normally with P18/P19/P20", () => {
    const result = makeResult({
      candidateId: "p14-pass-1",
      primary: [{ id: "seat-r1-c1", p20Raw: 3.0, p19Raw: 3.0 }],
      p14Rejected: false,
      requestedP14Pass: true,
    });
    const check = validateCandidateForRun(result, {
      seats: [{ id: "seat-r1-c1", isPrimary: true }],
    });
    assert.equal(check.nonAssessable, false, "not terminal-rejected when P14 passes");
    assert.equal(check.assessable, true);
    assert.equal(check.valid, true, "valid candidate with full evidence");
    assert.deepEqual(check.issues, []);
    assert.equal(check.reason, null, "no P14 terminal-rejection reason");
  });

  // B. P14 target not achieved → terminal rejected candidate, reason preserved
  it("B — classifyCandidateAssessability returns terminal rejection with P14 reason", () => {
    const verdict = classifyCandidateAssessability({
      requestedP14Pass: false,
      p14AchievedDb: 110,
      p14TargetDb: 117,
      p14NotAchievedReason: "p14-operating-point-not-achieved",
      transitionHz: 91,
    });
    assert.equal(verdict.assessable, false, "P14 fail → not assessable");
    assert.equal(verdict.reason, CANDIDATE_ASSESSABILITY_REASON.P14_OPERATING_POINT_NOT_ACHIEVED);
    assert.equal(verdict.p14AchievedDb, 110, "achieved P14 preserved");
    assert.equal(verdict.p14TargetDb, 117, "requested P14 preserved");
    assert.equal(verdict.p14NotAchievedReason, "p14-operating-point-not-achieved");
    assert.equal(verdict.achievedP18Hz, null, "P18 not evaluated");
  });

  it("B2 — validateCandidateForRun returns non-assessable with P14 reason, empty issues", () => {
    const result = makeResult({
      candidateId: "p14-fail-1",
      p14Rejected: true,
      p14AchievedDb: 110,
      p14TargetDb: 117,
      primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
    });
    const check = validateCandidateForRun(result, {
      seats: [{ id: "seat-r1-c1", isPrimary: true }],
    });
    assert.equal(check.nonAssessable, true, "terminal rejection outcome");
    assert.equal(check.assessable, false);
    assert.equal(check.reason, CANDIDATE_ASSESSABILITY_REASON.P14_OPERATING_POINT_NOT_ACHIEVED);
    assert.equal(check.valid, false);
    assert.deepEqual(check.issues, [], "no fabricated missing-evidence errors");
    assert.equal(check.p14AchievedDb, 110, "achieved P14 preserved through validator");
    assert.equal(check.p14TargetDb, 117, "requested P14 preserved through validator");
    assert.equal(check.p14NotAchievedReason, "p14-operating-point-not-achieved");
    // The result is carried as-is, never graded, never fabricated.
    assert.equal(check.result, result);
  });

  // C. P14 rejected candidate → no fabricated P18/P19/P20
  it("C — P14-rejected candidate carries no fabricated P18/P19/P20", () => {
    const result = makeResult({
      candidateId: "p14-fail-2",
      p14Rejected: true,
      primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
    });
    const check = validateCandidateForRun(result, {
      seats: [{ id: "seat-r1-c1", isPrimary: true }],
    });
    assert.equal(check.nonAssessable, true);
    assert.equal(check.result.achievedP18Hz, null, "P18 not evaluated");
    assert.equal(check.result.achievedP19VariationDb, null, "P19 not evaluated");
    assert.equal(check.result.achievedP20VariationDb, null, "P20 not evaluated");
    assert.equal(check.result.assessmentStartHz, null, "no fabricated assessment band");
    assert.deepEqual(check.result.perSeatP20, [], "no fabricated per-seat P20");
  });

  // D. Mixed run → run complete, valid survives, P14-rejected retained in diagnostics
  it("D — mixed run: valid survives, P14-rejected retained, run complete", () => {
    const baseline = makeResult({
      candidateId: "current",
      candidateKind: "current",
      primary: [{ id: "seat-r1-c1", p20Raw: 6.0, p19Raw: 5.0 }],
    });
    const valid = makeResult({
      candidateId: "valid-1",
      primary: [{ id: "seat-r1-c1", p20Raw: 2.5, p19Raw: 2.5 }],
    });
    const p14Rejected = makeResult({
      candidateId: "p14-fail-4",
      p14Rejected: true,
      primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
    });
    const snapshot = makeSnapshotForBaseline(baseline);
    const selection = selectConfirmedRecommendations([valid, p14Rejected], snapshot, baseline);
    assert.ok(selection.winner, "valid candidate wins");
    assert.equal(selection.winner.candidateId, "valid-1");
    assert.equal(selection.terminalOutcome, "material");
    assert.equal(selection.terminalOutcome !== "incomplete", true, "run complete");
    const rejectedEval = selection.evaluations.find((e) => e.candidateId === "p14-fail-4");
    assert.ok(rejectedEval, "P14-rejected retained as evaluation evidence");
    assert.equal(rejectedEval.status, "non-assessable");
    assert.equal(rejectedEval.reason, CANDIDATE_ASSESSABILITY_REASON.P14_OPERATING_POINT_NOT_ACHIEVED);
    // P14-rejected is excluded from confirmed results.
    assert.equal(selection.confirmedResults.some((r) => r.candidateId === "p14-fail-4"), false);
  });

  // E. All P14-rejected → run complete, NO_USEFUL_IMPROVEMENT, not incomplete
  it("E — all P14-rejected: run complete, no winner, not incomplete", () => {
    const baseline = makeResult({
      candidateId: "current",
      candidateKind: "current",
      primary: [{ id: "seat-r1-c1", p20Raw: 5.0, p19Raw: 3.0 }],
    });
    const a = makeResult({
      candidateId: "p14-fail-a",
      p14Rejected: true,
      primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
    });
    const b = makeResult({
      candidateId: "p14-fail-b",
      p14Rejected: true,
      primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
    });
    const snapshot = makeSnapshotForBaseline(baseline);
    const selection = selectConfirmedRecommendations([a, b], snapshot, baseline);
    assert.equal(selection.winner, null);
    assert.equal(selection.terminalOutcome, "no-better-evaluated");
    assert.equal(selection.terminalOutcome !== "incomplete", true, "run NOT incomplete");
    assert.equal(selection.nonAssessableCount, 2);
  });

  // F. P18 above transition → still NO_VALID_P19_P20_ASSESSMENT_BAND (distinct)
  it("F — P18-above-transition remains NO_VALID_P19_P20_ASSESSMENT_BAND", () => {
    const verdict = classifyCandidateAssessability({
      requestedP14Pass: true,
      achievedP18Hz: 129.051,
      transitionHz: 91.287,
    });
    assert.equal(verdict.assessable, false);
    assert.equal(verdict.reason, CANDIDATE_ASSESSABILITY_REASON.NO_VALID_P19_P20_ASSESSMENT_BAND);
    assert.equal(verdict.p14NotAchievedReason, null, "not a P14 rejection");
    assert.equal(verdict.p14AchievedDb, null, "no P14 dB for a band rejection");
  });

  // G. Genuine missing evidence → still invalid/incomplete
  it("G — genuine missing evidence (P14 null, no P20) stays invalid/incomplete", () => {
    const result = makeResult({
      candidateId: "broken-1",
      primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
      requestedP14Pass: null,
      p14Rejected: false,
    });
    // Strip perSeatP20 to simulate genuine missing evidence.
    result.perSeatP20 = [];
    const check = validateCandidateForRun(result, {
      seats: [{ id: "seat-r1-c1", isPrimary: true }],
    });
    assert.equal(check.nonAssessable, false, "not classified as terminal rejection");
    assert.equal(check.assessable, true);
    assert.equal(check.valid, false, "genuine missing evidence is invalid");
    assert.ok(check.issues.length > 0, "evaluation issues remain");
  });

  // H. Primary-seat safety unchanged — a P14-rejected candidate never reaches
  //    safety comparison (it is excluded before the safety check).
  it("H — primary-seat safety: P14-rejected candidate never compared", () => {
    const baseline = makeResult({
      candidateId: "current",
      candidateKind: "current",
      primary: [{ id: "seat-r1-c1", p20Raw: 5.0, p19Raw: 3.0 }],
    });
    const p14Rejected = makeResult({
      candidateId: "p14-fail-safety",
      p14Rejected: true,
      primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
    });
    const snapshot = makeSnapshotForBaseline(baseline);
    const selection = selectConfirmedRecommendations([p14Rejected], snapshot, baseline);
    const rejectedEval = selection.evaluations.find((e) => e.candidateId === "p14-fail-safety");
    assert.equal(rejectedEval.status, "non-assessable");
    // It is never classified as a safety-rejected or protected-seat-trade-off.
    assert.notEqual(rejectedEval.status, "safety-rejected");
    assert.notEqual(rejectedEval.status, "protected-seat-trade-off");
  });

  // I. Three-sub Stage 2 handoff unchanged
  it("I — three-sub Stage 2 quantity ordering unchanged", () => {
    const order = resolveQuantityOrder(3);
    assert.ok(order.includes(3), "three-sub quantity still ordered");
    assert.equal(order[0], 3, "current quantity promoted first");
  });

  // J. Run evidence preserves P14 candidate ID, kind, reason, requested/achieved
  it("J — buildOptimiserRunEvidence saves P14-rejected candidates as diagnostic evidence", () => {
    const baseline = makeResult({
      candidateId: "current",
      candidateKind: "current",
      primary: [{ id: "seat-r1-c1", p20Raw: 5.0, p19Raw: 3.0 }],
    });
    const p14Rejected = makeResult({
      candidateId: "practical-wall-front-10%",
      candidateKind: "position",
      p14Rejected: true,
      p14AchievedDb: 110,
      p14TargetDb: 117,
      primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
    });
    const snapshot = makeSnapshotForBaseline(baseline);
    const selection = selectConfirmedRecommendations([p14Rejected], snapshot, baseline);
    // The engine attaches nonAssessableCandidates from its evaluations
    // (improveBassV2Engine line ~1758). Mirror that here.
    selection.nonAssessableCandidates = selection.evaluations
      .filter((e) => e.status === "non-assessable")
      .map((e) => ({
        candidateId: e.candidateId,
        candidateKind: "position",
        stage: "Placement",
        status: "non-assessable",
        reason: e.reason,
        achievedP18Hz: e.achievedP18Hz,
        transitionHz: e.transitionHz,
        p14AchievedDb: e.p14AchievedDb,
        p14TargetDb: e.p14TargetDb,
        p14NotAchievedReason: e.p14NotAchievedReason,
      }));
    const evidence = buildOptimiserRunEvidence({
      selection,
      diagnostics: null,
      identity: { projectId: "p", versionId: "v" },
    });
    assert.ok(Array.isArray(evidence.nonAssessableCandidates), "field present");
    assert.equal(evidence.nonAssessableCandidates.length, 1);
    const entry = evidence.nonAssessableCandidates[0];
    assert.equal(entry.candidateId, "practical-wall-front-10%", "candidate ID preserved");
    assert.equal(entry.candidateKind, "position", "candidate kind preserved");
    assert.equal(entry.status, "non-assessable");
    assert.equal(entry.reason, CANDIDATE_ASSESSABILITY_REASON.P14_OPERATING_POINT_NOT_ACHIEVED);
    assert.equal(entry.p14AchievedDb, 110, "achieved P14 preserved in evidence");
    assert.equal(entry.p14TargetDb, 117, "requested P14 preserved in evidence");
    assert.equal(entry.p14NotAchievedReason, "p14-operating-point-not-achieved");
    // Run is NO_USEFUL_IMPROVEMENT, not EVALUATION_INCOMPLETE.
    assert.equal(evidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
    assert.notEqual(evidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE);
    assert.ok(Array.isArray(evidence.run.nonAssessableCandidates));
    assert.equal(evidence.run.nonAssessableCandidates.length, 1);
    assert.equal(evidence.run.nonAssessableCandidates[0].p14AchievedDb, 110);
  });
});

// ---------------------------------------------------------------------------
// CASE A — the three reconstructed Case A candidates must now be terminally
// rejected for the P14 reason, not reported as missing P18/P19/P20.
// ---------------------------------------------------------------------------

describe("Case A — three candidates terminally rejected (P14 operating-point)", () => {
  const CASE_A_CANDIDATES = [
    { id: "practical-wall-front-10%", kind: "position" },
    { id: "C_FRONT_PAIR:0.15_0|0.85_0", kind: "position" },
    { id: "practical-wall-front-15%", kind: "position" },
  ];

  for (const { id, kind } of CASE_A_CANDIDATES) {
    it(`${id} — requestedP14Pass=false, reason preserved, no fabricated metrics`, () => {
      const result = makeResult({
        candidateId: id,
        candidateKind: kind,
        p14Rejected: true,
        p14AchievedDb: 108,
        p14TargetDb: 117,
        primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
      });
      const check = validateCandidateForRun(result, {
        seats: [{ id: "seat-r1-c1", isPrimary: true }],
      });
      assert.equal(check.nonAssessable, true, "terminal rejected");
      assert.equal(check.assessable, false);
      assert.equal(check.reason, CANDIDATE_ASSESSABILITY_REASON.P14_OPERATING_POINT_NOT_ACHIEVED);
      assert.equal(check.result.requestedP14Pass, false);
      assert.equal(check.p14AchievedDb, 108, "achieved P14 preserved");
      assert.equal(check.p14TargetDb, 117, "requested P14 preserved");
      assert.equal(check.p14NotAchievedReason, "p14-operating-point-not-achieved");
      // These must no longer appear as missing-evidence / invalid-band errors.
      assert.deepEqual(check.issues, [], "no generic missing-evidence errors");
      // No fabricated metrics.
      assert.equal(check.result.achievedP18Hz, null, "P18 not evaluated by design");
      assert.equal(check.result.achievedP19VariationDb, null, "P19 not evaluated by design");
      assert.equal(check.result.achievedP20VariationDb, null, "P20 not evaluated by design");
      assert.equal(check.result.assessmentStartHz, null, "no invalid assessment band");
    });
  }

  it("Case A run — all three rejected, run completes (NOT EVALUATION_INCOMPLETE)", () => {
    const baseline = makeResult({
      candidateId: "current",
      candidateKind: "current",
      primary: [{ id: "seat-r1-c1", p20Raw: 5.0, p19Raw: 3.0 }],
    });
    const candidates = CASE_A_CANDIDATES.map(({ id, kind }) =>
      makeResult({
        candidateId: id,
        candidateKind: kind,
        p14Rejected: true,
        p14AchievedDb: 108,
        p14TargetDb: 117,
        primary: [{ id: "seat-r1-c1", p20Raw: 3.0 }],
      }),
    );
    const snapshot = makeSnapshotForBaseline(baseline);
    const selection = selectConfirmedRecommendations(candidates, snapshot, baseline);
    assert.equal(selection.winner, null);
    assert.equal(selection.terminalOutcome, "no-better-evaluated");
    assert.notEqual(selection.terminalOutcome, "incomplete", "run NOT incomplete");
    assert.equal(selection.nonAssessableCount, 3);
    // Every Case A candidate is recorded as non-assessable with the P14 reason.
    for (const { id } of CASE_A_CANDIDATES) {
      const ev = selection.evaluations.find((e) => e.candidateId === id);
      assert.ok(ev, `${id} retained as evaluation evidence`);
      assert.equal(ev.status, "non-assessable");
      assert.equal(ev.reason, CANDIDATE_ASSESSABILITY_REASON.P14_OPERATING_POINT_NOT_ACHIEVED);
    }
  });
});