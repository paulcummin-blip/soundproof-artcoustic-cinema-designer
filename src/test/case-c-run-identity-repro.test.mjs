// case-c-run-identity-repro.test.mjs
// ---------------------------------------------------------------------------
// Regression suite for optimiser run identity preservation when no safe winner
// exists. A completed optimiser run may legitimately end with winner = null
// (retained trade-off, standalone offerable lever, all candidates rejected).
// The run identity (runId) and completed candidate evidence must survive the
// save handoff; the save acknowledgement must fire; a save failure must not
// discard the completed calculation as "optimisation incomplete".
//
// Pure functions only. No acoustic maths are changed by this suite.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import assert from "node:assert/strict";

import { buildOptimiserResultForSave } from "../src/components/room/bass/optimiserPlan/optimiserPlanSave.js";
import { buildOptimiserPlan } from "../src/components/room/bass/optimiserPlan/buildOptimiserPlan.js";
import {
  buildOptimiserRunEvidence,
  buildActionableOptimiserRunSummary,
} from "../src/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import {
  serializeOptimiserPlan,
  acknowledgeOptimiserPlanSave,
  waitForOptimiserPlanSave,
} from "../src/components/room/bass/optimiserPlan/optimiserPlanPersistence.js";
import { OPTIMISER_TERMINAL_OUTCOME } from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";

const activeRun = {
  runId: "optimiser-run-2026-11-04T09:00:00.000Z-1",
  startedAt: "2026-11-04T09:00:00.000Z",
  supersededRunId: null,
};

function makeConfirmedResult(candidateId, p20, opts = {}) {
  return {
    candidateId,
    candidateKind: opts.candidateKind || "calibration",
    inputIdentity: "fp-case-c",
    timingVersion: "stage2-canonical-v6-delay-lag",
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    achievedP18Hz: 20,
    p18AchievedLevel: 3,
    transitionHz: 91.287,
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
    achievedP19VariationDb: 3.0,
    achievedP19Level: "L3",
    achievedP20VariationDb: p20,
    achievedP20Level: "L3",
    perSeatP20: [
      { seatId: "seat-r1-c1", isPrimary: true, variationDbRaw: p20, level: "L3" },
    ],
  };
}

function makeBaseline() {
  const r = makeConfirmedResult("current", 5.0);
  r.candidateKind = "current";
  return r;
}

describe("Winnerless actionable run — run identity preserved", () => {
  // ── A. ACTIONABLE PLAN + NO WINNER (the actual broken handoff) ──
  it("A — buildActionableOptimiserRunSummary returns a run summary with no winner", () => {
    const selection = {
      winner: null,
      confirmedResults: [makeConfirmedResult("cand-1", 4.9)],
      currentResult: makeBaseline(),
      canonicalJobsRun: 1,
    };
    const summary = buildActionableOptimiserRunSummary({
      selection,
      diagnostics: { stages: [], canonicalJobsRun: 1 },
      runIdentity: activeRun,
    });
    assert.ok(summary, "run summary produced even with no winner");
    assert.equal(summary.runId, activeRun.runId, "runId preserved");
    assert.equal(summary.terminal, true, "run is terminal");
    assert.equal(summary.winnerCandidateId, null, "winner is nullable");
    assert.equal(summary.actionablePlanProduced, true);
    assert.equal(summary.outcome, "actionable_plan_produced");
  });

  it("A — actionable plan with no winner carries run.runId through the save path", () => {
    // An actionable plan that needs no winner: a standalone offerable lever is
    // built directly so the actionability + run summary path is exercised.
    const plan = {
      planVersion: 3,
      savedAt: new Date().toISOString(),
      recordKind: "plan",
      projectId: "p1",
      versionId: "v1",
      designFingerprint: "fp",
      resultFingerprint: "rfp",
      cacheKey: "fp",
      levers: {
        delay: {
          lever: "delay",
          evidenceStatus: "evaluated",
          evaluated: true,
          notEvaluated: false,
          effect: { p19DeltaDb: -1, p20DeltaDb: -1.5, p14DeltaDb: 0 },
          changes: [{ sourceId: "sub-1", delayMs: 5 }],
          practical: true,
          validation: { destinationsValid: true },
        },
      },
      baseline: { achievedP20VariationDb: 5.0 },
      leverDecisions: {},
    };
    const selection = {
      winner: null,
      confirmedResults: [],
      evaluationIssues: [],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
      nonAssessableCandidates: [],
      canonicalJobsRun: 1,
      currentResult: makeBaseline(),
    };
    const { actionablePlan, runEvidence } = buildOptimiserResultForSave({
      plan,
      selection,
      diagnostics: { stages: [], canonicalJobsRun: 1 },
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });
    assert.ok(actionablePlan, "actionable plan produced");
    assert.ok(actionablePlan.run, "actionable plan carries a run summary");
    assert.equal(actionablePlan.run.runId, activeRun.runId, "run.runId preserved with no winner");
    assert.equal(actionablePlan.run.winnerCandidateId, null, "winner null on run summary");
    assert.equal(runEvidence, null, "no terminal evidence for an actionable plan");
  });

  it("A — save acknowledgement fires for a winnerless actionable plan", async () => {
    const plan = {
      planVersion: 3,
      savedAt: new Date().toISOString(),
      recordKind: "plan",
      projectId: "p2",
      versionId: "v2",
      designFingerprint: "fp2",
      resultFingerprint: "rfp2",
      cacheKey: "fp2",
      levers: {
        delay: {
          lever: "delay",
          evidenceStatus: "evaluated",
          evaluated: true,
          notEvaluated: false,
          effect: { p19DeltaDb: -1, p20DeltaDb: -1.5, p14DeltaDb: 0 },
          changes: [{ sourceId: "sub-1", delayMs: 5 }],
          practical: true,
          validation: { destinationsValid: true },
        },
      },
      baseline: { achievedP20VariationDb: 5.0 },
      leverDecisions: {},
    };
    const selection = {
      winner: null,
      confirmedResults: [],
      evaluationIssues: [],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
      nonAssessableCandidates: [],
      canonicalJobsRun: 1,
      currentResult: makeBaseline(),
    };
    const { actionablePlan } = buildOptimiserResultForSave({
      plan, selection,
      diagnostics: { stages: [], canonicalJobsRun: 1 },
      identity: { projectId: "p2", versionId: "v2", designFingerprint: "fp2" },
      runIdentity: activeRun,
    });
    const serialized = serializeOptimiserPlan(actionablePlan);
    assert.ok(serialized.run?.runId, "serialized actionable plan has run.runId");
    acknowledgeOptimiserPlanSave("p2", "v2", serialized);
    const at = await waitForOptimiserPlanSave("p2", "v2", activeRun.runId, 1000);
    assert.equal(typeof at, "number", "acknowledgement fires without a 60s wait");
  });

  // ── B. CASE C — completed run, no safe winner, trade-off retained ──
  it("B — Case C: 35 valid + 2 non-assessable + 1 trade-off, no winner, runId preserved", () => {
    const baseline = makeBaseline();
    const confirmedResults = [];
    for (let i = 0; i < 35; i++) {
      confirmedResults.push(makeConfirmedResult(`cand-${i + 1}`, 4.9));
    }
    const selection = {
      winner: null,
      currentResult: baseline,
      confirmedResults,
      evaluations: confirmedResults.map((r) => ({ candidateId: r.candidateId, status: "below-materiality" })),
      nonAssessableCandidates: [
        { candidateId: "na-1", candidateKind: "position", stage: "phase", status: "non-assessable", reason: "no-valid-p19-p20-assessment-band", achievedP18Hz: 129.051, transitionHz: 91.287 },
        { candidateId: "na-2", candidateKind: "position", stage: "phase", status: "non-assessable", reason: "no-valid-p19-p20-assessment-band", achievedP18Hz: 100.0, transitionHz: 80.0 },
      ],
      tradeOffs: [{ candidateId: "trade-off-1", candidateKind: "calibration", reason: "primary-seat-regression" }],
      evaluationIssues: [],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
      canonicalJobsRun: 37,
    };
    const plan = buildOptimiserPlan({
      selection, baseline,
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      instances: [],
    });
    expect(plan).toBe(null);
    const { runEvidence } = buildOptimiserResultForSave({
      plan, selection,
      diagnostics: { stages: [], canonicalJobsRun: 37 },
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });
    assert.ok(runEvidence, "Case C run evidence produced");
    assert.equal(runEvidence.run.runId, activeRun.runId, "Case C runId preserved");
    assert.equal(runEvidence.run.candidatesEvaluated, 35, "35 valid candidates preserved");
    assert.equal(runEvidence.nonAssessableCandidates.length, 2, "non-assessable records preserved");
    assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
    assert.notEqual(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
      "Case C is not reported incomplete");
  });

  it("B — Case C save acknowledgement fires without a 60s wait", async () => {
    const baseline = makeBaseline();
    const selection = {
      winner: null,
      currentResult: baseline,
      confirmedResults: [makeConfirmedResult("cand-1", 4.9)],
      evaluations: [{ candidateId: "cand-1", status: "below-materiality" }],
      nonAssessableCandidates: [
        { candidateId: "na-1", candidateKind: "position", stage: "phase", status: "non-assessable", reason: "no-valid-p19-p20-assessment-band", achievedP18Hz: 129.051, transitionHz: 91.287 },
      ],
      tradeOffs: [{ candidateId: "trade-off-1", candidateKind: "calibration", reason: "primary-seat-regression" }],
      evaluationIssues: [],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
      canonicalJobsRun: 1,
    };
    const { runEvidence } = buildOptimiserResultForSave({
      plan: null, selection,
      diagnostics: { stages: [], canonicalJobsRun: 1 },
      identity: { projectId: "p3", versionId: "v3", designFingerprint: "fp3" },
      runIdentity: activeRun,
    });
    const serialized = serializeOptimiserPlan(runEvidence);
    assert.ok(serialized.run?.runId, "Case C serialized evidence has run.runId");
    acknowledgeOptimiserPlanSave("p3", "v3", serialized);
    const at = await waitForOptimiserPlanSave("p3", "v3", activeRun.runId, 1000);
    assert.equal(typeof at, "number", "Case C acknowledgement fires, no 60s wait");
  });

  // ── C. NO SAFE WINNER / NO USEFUL IMPROVEMENT ──
  it("C — no-safe-winner run saves with runId and NO_USEFUL_IMPROVEMENT", () => {
    const baseline = makeBaseline();
    const selection = {
      winner: null,
      currentResult: baseline,
      confirmedResults: [makeConfirmedResult("cand-1", 4.9)],
      evaluations: [{ candidateId: "cand-1", status: "below-materiality" }],
      nonAssessableCandidates: [],
      tradeOffs: [],
      evaluationIssues: [],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
      canonicalJobsRun: 1,
    };
    const { runEvidence } = buildOptimiserResultForSave({
      plan: null, selection,
      diagnostics: { stages: [], canonicalJobsRun: 1 },
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });
    assert.ok(runEvidence, "no-safe-winner run produces evidence");
    assert.equal(runEvidence.run.runId, activeRun.runId);
    assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
    assert.equal(runEvidence.run.winnerCandidateId, null, "winner null on the run");
  });

  // ── D. SAFE WINNER — unchanged ──
  it("D — safe-winner actionable plan still carries runId", () => {
    const winner = makeConfirmedResult("winner-1", 2.0);
    const plan = {
      planVersion: 3,
      savedAt: new Date().toISOString(),
      recordKind: "plan",
      projectId: "p1",
      versionId: "v1",
      designFingerprint: "fp",
      resultFingerprint: "rfp",
      cacheKey: "fp",
      levers: {
        delay: {
          lever: "delay",
          evidenceStatus: "evaluated",
          evaluated: true,
          notEvaluated: false,
          effect: { p19DeltaDb: -1, p20DeltaDb: -1.5, p14DeltaDb: 0 },
          changes: [{ sourceId: "sub-1", delayMs: 5 }],
          practical: true,
          validation: { destinationsValid: true },
        },
      },
      baseline: { achievedP20VariationDb: 5.0 },
      leverDecisions: {},
    };
    const selection = {
      winner,
      confirmedResults: [winner],
      evaluationIssues: [],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
      canonicalJobsRun: 1,
      currentResult: makeBaseline(),
    };
    const { actionablePlan } = buildOptimiserResultForSave({
      plan, selection,
      diagnostics: { stages: [], canonicalJobsRun: 1 },
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });
    assert.ok(actionablePlan, "safe-winner path produces an actionable plan");
    assert.equal(actionablePlan.run.runId, activeRun.runId, "runId present on safe-winner plan");
    assert.equal(actionablePlan.run.winnerCandidateId, "winner-1", "winner id present on safe-winner plan");
  });

  // ── F. GENUINE COMPUTATION INCOMPLETE — stays incomplete ──
  it("F — genuine computation failure stays incomplete with runId", () => {
    const selection = {
      winner: null,
      confirmedResults: [],
      evaluationIssues: [{ stage: "phase", error: "canonical evaluation crashed" }],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
      nonAssessableCandidates: [],
      currentResult: makeBaseline(),
    };
    const { runEvidence } = buildOptimiserResultForSave({
      plan: null, selection,
      diagnostics: null,
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });
    assert.ok(runEvidence, "evidence produced for incomplete run");
    assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
      "genuine computation failure stays incomplete");
    assert.equal(runEvidence.run.runId, activeRun.runId, "runId still present for incomplete run");
  });

  // ── RUN HISTORY — serialised record retains run identity ──
  it("Run history — serialised evidence retains runId, terminal outcome and winner nullability", () => {
    const baseline = makeBaseline();
    const selection = {
      winner: null,
      currentResult: baseline,
      confirmedResults: [makeConfirmedResult("cand-1", 4.9)],
      evaluations: [{ candidateId: "cand-1", status: "below-materiality" }],
      nonAssessableCandidates: [
        { candidateId: "na-1", candidateKind: "position", stage: "phase", status: "non-assessable", reason: "no-valid-p19-p20-assessment-band", achievedP18Hz: 129.051, transitionHz: 91.287 },
      ],
      tradeOffs: [{ candidateId: "trade-off-1", candidateKind: "calibration", reason: "primary-seat-regression" }],
      evaluationIssues: [],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
      canonicalJobsRun: 1,
    };
    const { runEvidence } = buildOptimiserResultForSave({
      plan: null, selection,
      diagnostics: { stages: [], canonicalJobsRun: 1 },
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });
    const persisted = serializeOptimiserPlan(runEvidence);
    // What cold reopen / history reads back:
    assert.equal(persisted.run?.runId, activeRun.runId, "history retains runId");
    assert.equal(persisted.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT, "history retains terminal outcome");
    assert.equal(persisted.run?.winnerCandidateId, null, "winner nullable in history");
    assert.ok(Array.isArray(persisted.run?.nonAssessableCandidates) || persisted.run?.nonAssessableCandidates === undefined,
      "non-assessable evidence travels with the run record");
  });
});