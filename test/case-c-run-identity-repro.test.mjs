// case-c-run-identity-repro.test.mjs
// ---------------------------------------------------------------------------
// Reproduction for Case C: a completed optimiser run with valid candidates,
// non-assessable candidates, a retained trade-off, and NO safe winner.
//
// The run identity (runId) must survive the save handoff and the persistence
// acknowledgement must fire for a winnerless terminal run.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import assert from "node:assert/strict";

import { buildOptimiserResultForSave } from "../src/components/room/bass/optimiserPlan/optimiserPlanSave.js";
import { buildOptimiserPlan } from "../src/components/room/bass/optimiserPlan/buildOptimiserPlan.js";
import { buildOptimiserRunEvidence } from "../src/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
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

function makeConfirmedResult(candidateId, p20) {
  return {
    candidateId,
    candidateKind: "calibration",
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

describe("Case C — run identity preserved without a safe winner", () => {
  it("buildOptimiserResultForSave preserves runId for a trade-off-only completed run", () => {
    const baseline = makeBaseline();
    // 35 valid (but non-offerable) confirmed candidates — none clears the
    // materiality gate as a standalone lever, so no actionable plan.
    const confirmedResults = [];
    for (let i = 0; i < 35; i++) {
      confirmedResults.push(makeConfirmedResult(`cand-${i + 1}`, 4.9));
    }
    const selection = {
      winner: null,
      currentResult: baseline,
      confirmedResults,
      evaluations: confirmedResults.map((r) => ({
        candidateId: r.candidateId,
        status: "below-materiality",
      })),
      nonAssessableCandidates: [
        {
          candidateId: "na-1",
          candidateKind: "position",
          stage: "phase",
          status: "non-assessable",
          reason: "no-valid-p19-p20-assessment-band",
          achievedP18Hz: 129.051,
          transitionHz: 91.287,
        },
        {
          candidateId: "na-2",
          candidateKind: "position",
          stage: "phase",
          status: "non-assessable",
          reason: "no-valid-p19-p20-assessment-band",
          achievedP18Hz: 100.0,
          transitionHz: 80.0,
        },
      ],
      tradeOffs: [
        {
          candidateId: "trade-off-1",
          candidateKind: "calibration",
          reason: "primary-seat-regression",
        },
      ],
      evaluationIssues: [],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
      canonicalJobsRun: 37,
    };

    const plan = buildOptimiserPlan({
      selection,
      baseline,
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      instances: [],
    });

    // No winner and no standalone placement lever → plan builder returns null.
    // This is the trigger for the bug: the run must still be saved as evidence.
    expect(plan).toBe(null);

    const { actionablePlan, runEvidence } = buildOptimiserResultForSave({
      plan,
      selection,
      diagnostics: { stages: [], canonicalJobsRun: 37 },
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });

    expect(actionablePlan).toBe(null);
    assert.ok(runEvidence, "run evidence must be produced for a winnerless completed run");
    assert.ok(runEvidence.run, "run evidence carries a run block");
    assert.equal(runEvidence.run.runId, activeRun.runId, "run.runId is the active run id");
    assert.equal(runEvidence.run.terminal, true, "run is terminal");
    assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
    assert.equal(runEvidence.run.candidatesEvaluated, 35, "35 valid candidates preserved");
    assert.equal(runEvidence.nonAssessableCandidates.length, 2, "non-assessable preserved");
    assert.ok(runEvidence.run.rejectionReasons.length > 0, "rejection reason stated");
  });

  it("serializeOptimiserPlan preserves run.runId for the evidence record", () => {
    const evidence = buildOptimiserRunEvidence({
      selection: {
        winner: null,
        confirmedResults: [],
        evaluationIssues: [],
        evaluationIncomplete: false,
        baselineValidation: { valid: true },
        nonAssessableCandidates: [],
        currentResult: makeBaseline(),
      },
      diagnostics: null,
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });
    const serialized = serializeOptimiserPlan(evidence);
    assert.ok(serialized.run, "serialized plan carries run block");
    assert.equal(serialized.run.runId, activeRun.runId, "serialized run.runId preserved");
  });

  it("acknowledgeOptimiserPlanSave fires for a winnerless run evidence record", async () => {
    const evidence = buildOptimiserRunEvidence({
      selection: {
        winner: null,
        confirmedResults: [],
        evaluationIssues: [],
        evaluationIncomplete: false,
        baselineValidation: { valid: true },
        nonAssessableCandidates: [],
        currentResult: makeBaseline(),
      },
      diagnostics: null,
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });
    const serialized = serializeOptimiserPlan(evidence);
    // Simulate the project loader calling acknowledge after a durable save.
    acknowledgeOptimiserPlanSave("p1", "v1", serialized);
    // waitForOptimiserPlanSave should resolve immediately (already acknowledged).
    const at = await waitForOptimiserPlanSave("p1", "v1", activeRun.runId, 1000);
    assert.equal(typeof at, "number", "save acknowledged without a 60s wait");
  });

  it("no-safe-winner / no-trade-off run still saves with a runId", () => {
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
    const plan = buildOptimiserPlan({
      selection, baseline,
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      instances: [],
    });
    expect(plan).toBe(null);
    const { runEvidence } = buildOptimiserResultForSave({
      plan, selection,
      diagnostics: { stages: [], canonicalJobsRun: 1 },
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });
    assert.ok(runEvidence, "no-safe-winner run still produces evidence");
    assert.equal(runEvidence.run.runId, activeRun.runId);
    assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
  });

  it("safe-winner path still produces an actionable plan with a runId", () => {
    const baseline = makeBaseline();
    const winner = makeConfirmedResult("winner-1", 2.0);
    winner.candidateKind = "calibration";
    const selection = {
      winner,
      currentResult: baseline,
      confirmedResults: [winner],
      calibrationResult: {
        candidateId: "winner-1",
        appliedTuning: [{ sourceId: "sub-1", delayMs: 5, gainDb: 0, polarity: 1 }],
      },
      evaluationIssues: [],
      evaluationIncomplete: false,
      baselineValidation: { valid: true },
      canonicalJobsRun: 1,
    };
    const plan = buildOptimiserPlan({
      selection, baseline,
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      instances: [
        { id: "sub-1", position: { x: 1, y: 1 }, legacyGroup: "front", delayMs: 0, gainDb: 0, polarity: 1 },
      ],
    });
    const { actionablePlan } = buildOptimiserResultForSave({
      plan, selection,
      diagnostics: { stages: [], canonicalJobsRun: 1 },
      identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp" },
      runIdentity: activeRun,
    });
    assert.ok(actionablePlan, "safe-winner path produces an actionable plan");
    assert.ok(actionablePlan.run, "actionable plan carries a run summary");
    assert.equal(actionablePlan.run.runId, activeRun.runId, "runId present on actionable plan");
  });

  it("genuine incomplete computation stays incomplete", () => {
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
    assert.ok(runEvidence, "evidence produced even for an incomplete run");
    assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
      "genuine computation failure stays incomplete");
    assert.equal(runEvidence.run.runId, activeRun.runId, "runId still present for an incomplete run");
  });
});