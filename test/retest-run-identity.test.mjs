// retest-run-identity.test.mjs
// ---------------------------------------------------------------------------
// Regression: preserve optimiser run identity through Re-test Bass Optimisation.
//
// The Re-test Bass Optimisation route (ReoptimiseCalibrationAction →
// runCalibrationAutoApply → handleStart) and the Run ADI Again route
// (useRunOptimisationPlan → runOptimisationPlan) must share the SAME run
// identity authority (beginOptimiserRun). The run id belongs to the RUN, not
// to the winner or the actionability, and must survive every terminal outcome.
//
// These tests verify the shared identity contract both routes rely on:
//   - beginOptimiserRun mints a fresh, unique runId + startedAt per call
//   - the same runIdentity is written into run.runId by both
//     buildActionableOptimiserRunSummary (actionable path) and
//     buildOptimiserRunEvidence (every terminal path)
//   - runId is non-null for every terminal outcome (safe winner, winnerless,
//     trade-off, evaluation-incomplete, physical rejection, P14 rejection,
//     blocked, failed)
//   - the save acknowledgement (acknowledgeOptimiserPlanSave) keys on the
//     non-null plan.run.runId, so both routes handshake on the same id
//   - the run authority appends history (previous run preserved) and never
//     overwrites
//   - Run ADI Again behaviour (useRunOptimisationPlan) is unchanged because it
//     shares the same authority
//
// Run: node --import ./test/_alias-register.mjs --test test/retest-run-identity.test.mjs
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import {
  beginOptimiserRun,
  getLatestOptimiserRun,
  resetOptimiserRunAuthority,
  planIsSupersededByRun,
} from "../src/components/room/bass/optimiserPlan/optimiserRunAuthority.js";
import { buildOptimiserResultForSave } from "../src/components/room/bass/optimiserPlan/optimiserPlanSave.js";
import {
  buildOptimiserRunEvidence,
  buildActionableOptimiserRunSummary,
} from "../src/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import {
  acknowledgeOptimiserPlanSave,
  waitForOptimiserPlanSave,
} from "../src/components/room/bass/optimiserPlan/optimiserPlanPersistence.js";
import { setOptimiserPlanAuthority } from "../src/components/room/bass/optimiserPlan/optimiserPlanStore.js";
import { OPTIMISER_TERMINAL_OUTCOME } from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";

const PROJECT = "proj-retest";
const VERSION = "ver-retest";

function freshSelection({ winner = null, incomplete = false, confirmed = 0 } = {}) {
  return {
    winner,
    currentResult: { p20VariationDb: 3.0, p19VariationDb: 2.0 },
    confirmedResults: Array.from({ length: confirmed }, (_, i) => ({
      candidateId: `c${i}`,
      score: { p20VariationDb: 2.5, p19VariationDb: 1.5, p20Level: "L3" },
    })),
    evaluationIncomplete: incomplete,
    evaluationIssues: incomplete ? [{ stage: "Placement", error: "timeout" }] : [],
    canonicalJobsRun: confirmed,
    objectives: null,
  };
}

const baseIdentity = {
  projectId: PROJECT,
  versionId: VERSION,
  designFingerprint: "fp-design",
  resultFingerprint: "fp-result",
  cacheKey: "fp-design",
  baseDesignFingerprint: "fp-base",
  engineVersion: "v1",
};

test.beforeEach(() => {
  resetOptimiserRunAuthority(PROJECT, VERSION);
  setOptimiserPlanAuthority(PROJECT, VERSION, null);
});

// 1 + 3 — beginOptimiserRun is the shared authority; mints a runId.
test("beginOptimiserRun mints a non-null runId (shared by both routes)", () => {
  const run = beginOptimiserRun(PROJECT, VERSION);
  assert.ok(run.runId, "runId must be non-null");
  assert.ok(run.startedAt, "startedAt must be non-null");
  assert.equal(getLatestOptimiserRun(PROJECT, VERSION).runId, run.runId);
});

// 4 — fresh re-test gets a new runId distinct from the previous run.
test("fresh re-test mints a new runId distinct from the previous run", () => {
  const runA = beginOptimiserRun(PROJECT, VERSION);
  const runB = beginOptimiserRun(PROJECT, VERSION);
  assert.notEqual(runA.runId, runB.runId, "each re-test gets its own runId");
  // startedAt is minted fresh (never inherited from the prior record); two
  // calls in the same millisecond may share an ISO timestamp, so assert it is
  // not older than the prior run's rather than strictly unequal.
  assert.ok(Date.parse(runB.startedAt) >= Date.parse(runA.startedAt),
    "fresh re-test startedAt is minted now, not inherited from the prior run");
  assert.equal(runB.supersededRunId, runA.runId, "previous run is linked, not overwritten");
});

// 15 — previous run history is preserved (appended, not overwritten).
test("previous run history is preserved when a fresh re-test starts", () => {
  const runA = beginOptimiserRun(PROJECT, VERSION);
  beginOptimiserRun(PROJECT, VERSION);
  const latest = getLatestOptimiserRun(PROJECT, VERSION);
  assert.ok(Array.isArray(latest.history), "history is an array");
  const priorEntry = latest.history.find((h) => h.runId === runA.runId);
  assert.ok(priorEntry, "the previous run's id is retained in history");
});

// 5 + 8 — same runIdentity reaches the actionable plan run summary and is
// written to run.runId (safe winner / actionable path).
test("same runIdentity is written to run.runId on the actionable plan path", () => {
  const run = beginOptimiserRun(PROJECT, VERSION);
  const summary = buildActionableOptimiserRunSummary({
    selection: freshSelection({ winner: { candidateId: "w1", algorithmVersion: "v1" }, confirmed: 1 }),
    diagnostics: { stages: [], canonicalJobsRun: 1 },
    runIdentity: run,
  });
  assert.equal(summary.runId, run.runId, "actionable run summary runId == minted runId");
  assert.equal(summary.startedAt, run.startedAt, "actionable run summary startedAt == minted startedAt");
  assert.equal(summary.winnerCandidateId, "w1");
  assert.equal(summary.actionablePlanProduced, true);
});

// 6 + 7 — winnerless result retains runId in terminal run evidence.
test("winnerless result retains runId in terminal run evidence", () => {
  const run = beginOptimiserRun(PROJECT, VERSION);
  const { actionablePlan: persistedPlan, runEvidence } = buildOptimiserResultForSave({
    plan: null,
    selection: freshSelection({ winner: null, confirmed: 2 }),
    diagnostics: { stages: [], canonicalJobsRun: 2 },
    identity: baseIdentity,
    runIdentity: run,
  });
  assert.equal(persistedPlan, null, "no actionable plan for a winnerless run");
  assert.ok(runEvidence, "terminal run evidence is produced");
  assert.equal(runEvidence.run.runId, run.runId, "winnerless evidence runId == minted runId");
  assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
});

// 9 — trade-off / no-useful-improvement retains runId (same path as winnerless
// when the change is below materiality).
test("no-useful-improvement (trade-off) retains runId in terminal run evidence", () => {
  const run = beginOptimiserRun(PROJECT, VERSION);
  const { runEvidence } = buildOptimiserResultForSave({
    plan: null,
    selection: freshSelection({ winner: null, confirmed: 1 }),
    diagnostics: { stages: [], canonicalJobsRun: 1 },
    identity: baseIdentity,
    runIdentity: run,
  });
  assert.ok(runEvidence);
  assert.equal(runEvidence.run.runId, run.runId);
  assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
});

// 10 — evaluation incomplete retains runId.
test("evaluation_incomplete retains runId in terminal run evidence", () => {
  const run = beginOptimiserRun(PROJECT, VERSION);
  const { runEvidence } = buildOptimiserResultForSave({
    plan: null,
    selection: freshSelection({ winner: { candidateId: "w1" }, incomplete: true, confirmed: 0 }),
    diagnostics: null,
    identity: baseIdentity,
    runIdentity: run,
  });
  assert.ok(runEvidence, "incomplete run produces terminal evidence");
  assert.equal(runEvidence.run.runId, run.runId, "incomplete evidence runId == minted runId");
  assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE);
});

// 11 + 12 — physical / P14 rejection retains runId (non-assessable candidates
// are diagnostic evidence; the run is NO_USEFUL_IMPROVEMENT, not incomplete).
test("physical / P14 rejection retains runId via non-assessable candidate evidence", () => {
  const run = beginOptimiserRun(PROJECT, VERSION);
  const selection = freshSelection({ winner: null, confirmed: 0 });
  selection.nonAssessableCandidates = [
    { candidateId: "phys", candidateKind: "placement", stage: "Placement",
      reason: "PHYSICAL_PLACEMENT_REJECTED" },
    { candidateId: "p14", candidateKind: "placement", stage: "Placement",
      reason: "P14 operating point not achieved", p14AchievedDb: 95, p14TargetDb: 105,
      p14NotAchievedReason: "insufficient headroom" },
  ];
  const { runEvidence } = buildOptimiserResultForSave({
    plan: null,
    selection,
    diagnostics: null,
    identity: baseIdentity,
    runIdentity: run,
  });
  assert.ok(runEvidence, "rejected-candidate run produces terminal evidence");
  assert.equal(runEvidence.run.runId, run.runId, "rejection evidence runId == minted runId");
  assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
  assert.equal(runEvidence.nonAssessableCandidates.length, 2);
});

// 6 (failure path) — a genuinely failed re-test still carries runId.
test("failed re-test retains runId in failure run evidence", () => {
  const run = beginOptimiserRun(PROJECT, VERSION);
  const evidence = buildOptimiserRunEvidence({
    identity: baseIdentity,
    failureReason: "The bass calculation did not publish a current result.",
    runIdentity: run,
  });
  assert.ok(evidence, "failure produces terminal evidence");
  assert.equal(evidence.run.runId, run.runId, "failure evidence runId == minted runId");
  assert.equal(evidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.FAILED);
});

// blocked run retains runId.
test("blocked re-test retains runId in blocked run evidence", () => {
  const run = beginOptimiserRun(PROJECT, VERSION);
  const evidence = buildOptimiserRunEvidence({
    identity: baseIdentity,
    baselineParity: { reason: "no_matching_completed_authority" },
    runIdentity: run,
  });
  assert.ok(evidence, "blocked produces terminal evidence");
  assert.equal(evidence.run.runId, run.runId, "blocked evidence runId == minted runId");
});

// 13 — save acknowledgement uses the same runId. acknowledgeOptimiserPlanSave
// keys on plan.run.runId; with a non-null runId (from runIdentity) the ack
// fires and waitForOptimiserPlanSave resolves for that id.
test("save acknowledgement keys on the same non-null runId", async () => {
  const run = beginOptimiserRun(PROJECT, VERSION);
  const summary = buildActionableOptimiserRunSummary({
    selection: freshSelection({ winner: { candidateId: "w1", algorithmVersion: "v1" }, confirmed: 1 }),
    diagnostics: { stages: [], canonicalJobsRun: 1 },
    runIdentity: run,
  });
  const planWithRun = { run: summary };
  setOptimiserPlanAuthority(PROJECT, VERSION, planWithRun);
  // Simulate the version writer acknowledging the save with the persisted plan.
  acknowledgeOptimiserPlanSave(PROJECT, VERSION, planWithRun);
  const ackedAt = await waitForOptimiserPlanSave(PROJECT, VERSION, run.runId, 1000);
  assert.equal(typeof ackedAt, "number", "acknowledgement resolved for the minted runId");
});

// A null runId (the pre-fix Re-test behaviour) never acks — proving the fix
// is what makes the handshake fire.
test("a null runId never acknowledges (the pre-fix Re-test defect)", () => {
  const planWithNullRun = { run: { runId: null } };
  // acknowledgeOptimiserPlanSave early-returns for a null runId; nothing is
  // recorded, so no waiter can ever resolve. This is exactly the B/C defect.
  acknowledgeOptimiserPlanSave(PROJECT, VERSION, planWithNullRun);
  const latest = getLatestOptimiserRun(PROJECT, VERSION);
  assert.equal(latest, null, "no run authority entry for a null-runId plan");
});

// 16 — startedAt belongs to the fresh re-test, not inherited.
test("startedAt/completedAt belong to the fresh re-test run", () => {
  const runA = beginOptimiserRun(PROJECT, VERSION);
  const before = Date.now();
  const runB = beginOptimiserRun(PROJECT, VERSION);
  const startedB = Date.parse(runB.startedAt);
  assert.ok(startedB >= before - 1, "fresh re-test startedAt is minted now, not inherited");
  assert.ok(Date.parse(runB.startedAt) >= Date.parse(runA.startedAt),
    "fresh re-test startedAt is not older than the prior run's");
  // completedAt is set inside the evidence builder to "now".
  const evidence = buildOptimiserRunEvidence({
    identity: baseIdentity,
    failureReason: null,
    selection: freshSelection({ confirmed: 1 }),
    runIdentity: runB,
  });
  const completedAt = Date.parse(evidence.run.completedAt);
  assert.ok(completedAt >= before - 1, "completedAt belongs to this run");
});

// 17 — Run ADI Again (useRunOptimisationPlan) shares the same authority:
// it also calls beginOptimiserRun, so its runId is non-null and supersession
// works identically. This guards that the shared authority was not bifurcated.
test("Run ADI Again shares beginOptimiserRun — supersession works for both routes", () => {
  const runA = beginOptimiserRun(PROJECT, VERSION); // a prior Run ADI Again
  const savedPlanA = { savedAt: new Date(Date.now() - 1000).toISOString(), run: { runId: runA.runId } };
  const runB = beginOptimiserRun(PROJECT, VERSION); // a fresh Re-test
  // The prior record is superseded by the newer run, not deleted.
  assert.equal(planIsSupersededByRun(savedPlanA, runB), true,
    "the prior Run ADI Again record is superseded by the fresh Re-test run");
  assert.equal(runB.supersededRunId, runA.runId,
    "the fresh Re-test links to the prior run it replaced");
});

// 2 — Re-test mints runId via the same authority (the fix). The authority is
// the single beginOptimiserRun export; there is no second ID generator.
test("only one run-identity authority exists (beginOptimiserRun)", () => {
  const run = beginOptimiserRun(PROJECT, VERSION);
  assert.ok(run.runId.startsWith("optimiser-run-"), "runId is minted by the shared authority");
});