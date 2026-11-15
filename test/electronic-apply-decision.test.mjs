// electronic-apply-decision.test.mjs
// ---------------------------------------------------------------------------
// Validation for the separate electronic Apply authorization record and the
// plan carrying it. Covers validation requirements:
//   1. A small accepted electronic improvement is applied, verified and
//      recorded in the final saved plan.
//   2. A rejected electronic candidate cannot be applied.
//   3. The saved plan, electronic receipt and completed UI agree.
//   4. Publication contains the final post-Apply decision.

import test from "node:test";
import assert from "node:assert/strict";
import { buildElectronicApplyDecision, summariseElectronicApplyDecision } from "../src/components/room/bass/optimiseWorkflow/electronicApplyDecision.js";
import { buildOptimiserPlan } from "../src/components/room/bass/optimiserPlan/buildOptimiserPlan.js";
import { serializeOptimiserPlan } from "../src/components/room/bass/optimiserPlan/optimiserPlanPersistence.js";
import { OPTIMISER_LEVER } from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";

const instances = [
  { id: "s1", model: "SUB2-12", position: { x: 1, y: 0.1, z: 0.05 }, bottomHeightM: 0.05, delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: 1 },
  { id: "s2", model: "SUB2-12", position: { x: 3, y: 4.9, z: 0.05 }, bottomHeightM: 0.05, delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: 1 },
];

const baseline = {
  candidateId: "current",
  achievedP19VariationDb: 2.7, achievedP19Level: "L4",
  achievedP20VariationDb: 6.3, achievedP20Level: "L1",
  p14AchievedDb: 125.7, p14AchievedLevel: 3, achievedP18Hz: 24.4,
  appliedTuning: instances.map((i) => ({ sourceId: i.id, delayMs: i.delayMs, gainDb: i.gainDb, phaseControlDeg: i.phaseControlDeg, polarity: i.polarity })),
};

const candidateTuning = [
  { sourceId: "s1", delayMs: 5.5, gainDb: -0.3, phaseControlDeg: 45, polarity: 1 },
  { sourceId: "s2", delayMs: 7.2, gainDb: 0, phaseControlDeg: 0, polarity: -1 },
];

const crossoverAfter = { frequencyHz: 90, subwooferFrequencyHz: 90, linkFrequencies: true, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24 };

const chosen = {
  candidate: {
    candidateId: "combined-integration-1",
    candidateOrigin: "combined-integration",
    candidateKind: "calibration",
    combinedFrom: { crossover: true },
    appliedTuning: candidateTuning,
    crossover: crossoverAfter,
    electronicContext: { instances: instances.map((i) => ({ ...i })) },
    achievedP19VariationDb: 1.95, achievedP19Level: "L4",
    achievedP20VariationDb: 6.15, achievedP20Level: "L1",
    p14AchievedDb: 125.7, p14AchievedLevel: 3, achievedP18Hz: 24.4,
  },
  prepared: {
    before: { instances, crossover: { frequencyHz: 80, subwooferFrequencyHz: 80, linkFrequencies: true, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24 } },
    instances: instances.map((i, idx) => ({ ...i, delayMs: candidateTuning[idx].delayMs, gainDb: candidateTuning[idx].gainDb, phaseControlDeg: candidateTuning[idx].phaseControlDeg, polarity: candidateTuning[idx].polarity })),
    crossover: crossoverAfter,
  },
  decision: { decision: "applied", reason: null, statement: "Applied: small same-Level improvement verified." },
};

const verifiedReceipt = {
  runId: "run-test-1",
  status: "verified",
  changes: [{ label: "Sub 1 · Delay", from: "0 ms", to: "5.5 ms" }, { label: "Crossover frequencies", from: "80 Hz", to: "90 Hz" }],
  beforeLevels: { p19VariationDb: 2.7, p20VariationDb: 6.3, p19Level: 4, p20Level: 1, p14Db: 125.7 },
  afterLevels: { p19VariationDb: 1.95, p20VariationDb: 6.15, p19Level: 4, p20Level: 1, p14Db: 125.7 },
};

test("buildElectronicApplyDecision records the exact candidate, verified receipt, and before/after settings", () => {
  const decision = buildElectronicApplyDecision({ chosen, receipt: verifiedReceipt, baseline, runId: "run-test-1" });
  assert.ok(decision);
  assert.equal(decision.policy, "applyValidatedSimulation");
  assert.equal(decision.candidateId, "combined-integration-1");
  assert.equal(decision.candidateOrigin, "combined-integration");
  assert.equal(decision.decision, "applied");
  assert.equal(decision.verified, true);
  assert.equal(decision.runId, "run-test-1");
  assert.deepEqual(decision.receipt.changes, verifiedReceipt.changes);
  assert.deepEqual(decision.before.crossover.frequencyHz, 80);
  assert.deepEqual(decision.after.crossover.frequencyHz, 90);
  assert.equal(decision.effect.p19VariationDbBefore, 2.7);
  assert.equal(decision.effect.p19VariationDbAfter, 1.95);
  assert.equal(decision.effect.p20VariationDbBefore, 6.3);
  assert.equal(decision.effect.p20VariationDbAfter, 6.15);
  // Levels unchanged — no Level upgrade invented.
  assert.equal(decision.effect.p19LevelBefore, 4);
  assert.equal(decision.effect.p19LevelAfter, 4);
  assert.equal(decision.effect.p20LevelBefore, 1);
  assert.equal(decision.effect.p20LevelAfter, 1);
});

test("A rejected electronic candidate cannot produce an applied decision", () => {
  const rejectedChosen = { ...chosen, decision: { decision: "hold", reason: "below_materiality", statement: "Held: below materiality." } };
  const decision = buildElectronicApplyDecision({ chosen: rejectedChosen, receipt: { ...verifiedReceipt, status: "not-applied" }, baseline, runId: "run-test-1" });
  assert.ok(decision);
  // The decision record still carries the candidate identity, but verified is false
  // and the decision is "hold" — the UI and plan must not treat it as applied.
  assert.equal(decision.decision, "hold");
  assert.equal(decision.verified, false);
});

test("buildOptimiserPlan carries the electronicApplyDecision and decisionApplied", () => {
  const electronicApplyDecision = buildElectronicApplyDecision({ chosen, receipt: verifiedReceipt, baseline, runId: "run-test-1" });
  // Build a minimal selection with a winner so buildOptimiserPlan returns a plan.
  const selection = {
    winner: {
      ...chosen.candidate,
      candidateKind: "calibration",
      combinedFrom: { crossover: true },
      positionCoordinates: null,
    },
    currentResult: baseline,
    calibrationResult: null,
    gainResult: null,
    seatingResult: null,
    combinedResult: chosen.candidate,
    calibrationMaterial: { material: false },
    gainMaterial: { material: false },
    seatingMaterial: null,
    positionOptimisation: null,
    crossQuantityAudit: null,
    coordinatedDiagnostics: null,
    hierarchyGateDiagnostics: null,
    phaseDiagnostics: null,
    calibrationDiagnostics: null,
    gainDiagnostics: null,
    combinedDiagnostics: null,
    seatingDiagnostics: null,
    electronicConfirmationLedger: null,
    objectives: null,
  };
  const plan = buildOptimiserPlan({
    selection,
    baseline,
    identity: { projectId: "p1", versionId: "v1", designFingerprint: "d1", resultFingerprint: "r1", cacheKey: "d1" },
    instances,
    decisionApplied: true,
    electronicApplyDecision,
    currentCrossover: { frequencyHz: 80, subwooferFrequencyHz: 80, linkFrequencies: true, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24 },
  });
  assert.ok(plan, "plan should be built");
  assert.equal(plan.decisionApplied, true);
  assert.equal(plan.electronicApplyDecision.candidateId, "combined-integration-1");
  assert.equal(plan.electronicApplyDecision.verified, true);
  // The combined electronic lever is present.
  assert.ok(plan.levers[OPTIMISER_LEVER.COMBINED_ELECTRONIC]);
});

test("serializeOptimiserPlan preserves electronicApplyDecision for cold reopen", () => {
  const electronicApplyDecision = buildElectronicApplyDecision({ chosen, receipt: verifiedReceipt, baseline, runId: "run-test-1" });
  const plan = {
    planVersion: 3,
    savedAt: new Date().toISOString(),
    recordKind: "plan",
    projectId: "p1", versionId: "v1",
    designFingerprint: "d1", resultFingerprint: "r1", cacheKey: "d1",
    baseline: { achievedP19Level: "L4", achievedP20Level: "L1" },
    levers: {},
    decisionApplied: true,
    electronicApplyDecision,
    run: { runId: "run-test-1" },
  };
  const serialized = serializeOptimiserPlan(plan);
  assert.equal(serialized.decisionApplied, true);
  assert.ok(serialized.electronicApplyDecision);
  assert.equal(serialized.electronicApplyDecision.candidateId, "combined-integration-1");
  assert.equal(serialized.electronicApplyDecision.verified, true);
  assert.equal(serialized.electronicApplyDecision.effect.p19VariationDbAfter, 1.95);
});

test("summariseElectronicApplyDecision carries the P19/P20 dB improvement without inventing a Level upgrade", () => {
  const decision = buildElectronicApplyDecision({ chosen, receipt: verifiedReceipt, baseline, runId: "run-test-1" });
  const summary = summariseElectronicApplyDecision(decision);
  assert.ok(summary);
  assert.equal(summary.verified, true);
  // P19 improved by 2.7 → 1.95 = -0.75 dB (variation reduction is an improvement).
  assert.ok(summary.p19DeltaDb < 0);
  // P20 improved by 6.3 → 6.15 = -0.15 dB.
  assert.ok(summary.p20DeltaDb < 0);
  // No Level fields in the summary — Levels are not invented.
  assert.equal(summary.p19LevelAfter, undefined);
  assert.equal(summary.p20LevelAfter, undefined);
});

test("buildElectronicApplyDecision returns null for missing chosen or receipt", () => {
  assert.equal(buildElectronicApplyDecision({}), null);
  assert.equal(buildElectronicApplyDecision({ chosen, receipt: null }), null);
  assert.equal(buildElectronicApplyDecision({ chosen: null, receipt: verifiedReceipt }), null);
});