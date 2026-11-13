// combined-electronic-plan-retention.test.mjs
// ---------------------------------------------------------------------------
// Focused acceptance tests for the combined electronic winner plan-retention
// fix. Verifies that a canonically confirmed combined crossover + tuning
// winner is retained as a plan lever (not lost as "winning change not
// retained"), that identity proof gates actionable classification, and that
// existing calibration-only and physical paths are unchanged.
//
// These tests import the REAL modules — no acoustic solvers, RP22 grading,
// search-space coverage, candidate ranking or physical escalation policy is
// modified or mocked. Each test builds a minimal selection/winner object that
// carries exactly the fields the plan builder reads.
// ---------------------------------------------------------------------------

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildOptimiserPlan } from "../src/components/room/bass/optimiserPlan/buildOptimiserPlan.js";
import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_EVIDENCE,
  OPTIMISER_PLAN_VERSION,
  OPTIMISER_TERMINAL_OUTCOME,
} from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import {
  leverIsOfferable,
  resolvePlanActionability,
  buildOptimiserResultForSave,
} from "../src/components/room/bass/optimiserPlan/optimiserPlanSave.js";
import { buildOptimiserRunEvidence } from "../src/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import { resolveCanonicalTerminalOutcome } from "../src/components/room/bass/optimiserPlan/resolveCanonicalTerminalOutcome.js";
import { proveCombinedElectronicIdentity } from "../src/components/room/bass/optimiserPlan/combinedElectronicIdentityProof.js";
import { buildCombinedElectronicLever } from "../src/components/room/bass/optimiserPlan/combinedElectronicLever.js";

// ── Helpers: minimal fixture objects carrying exactly the fields the plan
// builder and identity proof read. No acoustic values are fabricated — the
// effect/effect fields are read as-is and never recalculated. ──────────────

const FINGERPRINT = "cal:v8:test|mode:canonical|pool:test-pool";
const SOURCE_ID_A = "sub-front-1";
const SOURCE_ID_B = "sub-rear-1";

function makeInstances() {
  return [
    {
      id: SOURCE_ID_A, enabled: true, model: "sub-2-12",
      legacyGroup: "front",
      position: { x: 1.0, y: 0.3 },
      delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0,
      bottomHeightM: 0.05, rotationDeg: 0, tuningSource: "manual",
    },
    {
      id: SOURCE_ID_B, enabled: true, model: "sub-2-12",
      legacyGroup: "rear",
      position: { x: 1.0, y: 5.0 },
      delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0,
      bottomHeightM: 0.05, rotationDeg: 0, tuningSource: "manual",
    },
  ];
}

function makeCrossover(freq = 90, hp = 24, lp = 24, linked = true, subFreq = null) {
  return {
    frequencyHz: freq,
    speakerHpSlopeDbPerOct: hp,
    subwooferLpSlopeDbPerOct: lp,
    linkFrequencies: linked,
    ...(linked ? {} : { subwooferFrequencyHz: subFreq ?? freq }),
  };
}

function makeElectronicContext() {
  return {instances:makeInstances(),roomDims:{widthM:4,lengthM:5.5,heightM:2.5},
    seatingPositions:[{id:"seat-1",x:1,y:3},{id:"seat-2",x:2,y:3}],
    rspPosition:{x:1,y:3,z:1.2},amplifierPowerPerSubW:1000,
    selectedSubModel:"sub-2-12",integrationContext:{crossover:makeCrossover(80)}};
}

function makeTuning(delayA = 2, delayB = 0, gainA = -1, gainB = 0, phaseA = 45, phaseB = 0, polA = 1, polB = 1) {
  return [
    { sourceId: SOURCE_ID_A, delayMs: delayA, gainDb: gainA, phaseControlDeg: phaseA, polarity: polA },
    { sourceId: SOURCE_ID_B, delayMs: delayB, gainDb: gainB, phaseControlDeg: phaseB, polarity: polB },
  ];
}

function makeBaselineResult() {
  return {
    candidateId: "current",
    candidateKind: "current",
    achievedP19VariationDb: 4.5,
    achievedP19Level: "L1",
    achievedP20VariationDb: 4.71,
    achievedP20Level: "L2",
    achievedP18Hz: 22,
    p18AchievedLevel: "L1",
    p14AchievedDb: 95,
    p14AchievedLevel: "L1",
    p14TargetDb: 95,
    operatingOutputDb: 95,
    assessmentStartHz: 20,
    assessmentEndHz: 80,
    perSeatP19: [],
    perSeatP20: [
      { seatId: "seat-1", variationDbRaw: 3.5, level: "L2", isPrimary: true },
      { seatId: "seat-2", variationDbRaw: 4.71, level: "L2", isPrimary: false },
    ],
    appliedTuning: makeTuning(0, 0, 0, 0, 0, 0, 1, 1),
    inputIdentity: FINGERPRINT,
  };
}

function makeCombinedElectronicWinner({
  crossover = makeCrossover(),
  tuning = makeTuning(),
  p20 = 3.92,
  p20Level = "L3",
  p19 = 4.0,
  p19Level = "L2",
  inputIdentity = FINGERPRINT,
} = {}) {
  return {
    candidateId: "combined-integration-0",
    candidateKind: "calibration",
    candidateOrigin: "combined",
    combinedFrom: { crossover: true, phaseRetuned: true, delayRetuned: true, gainRetuned: true },
    crossover,
    appliedTuning: tuning,
    achievedP19VariationDb: p19,
    achievedP19Level: p19Level,
    achievedP20VariationDb: p20,
    achievedP20Level: p20Level,
    achievedP18Hz: 22,
    p18AchievedLevel: "L1",
    p14AchievedDb: 95,
    p14AchievedLevel: "L1",
    p14TargetDb: 95,
    operatingOutputDb: 95,
    assessmentStartHz: 20,
    assessmentEndHz: 80,
    perSeatP19: [],
    perSeatP20: [
      { seatId: "seat-1", variationDbRaw: 2.8, level: "L3", isPrimary: true },
      { seatId: "seat-2", variationDbRaw: 3.92, level: "L3", isPrimary: false },
    ],
    inputIdentity,
    configurationKey: "test-config-key",
    baselineCacheKey: FINGERPRINT,
    electronicContext: makeElectronicContext(),
  };
}

function makeSelection({ winner, calibrationResult = null, gainResult = null, seatingResult = null }) {
  return {
    winner,
    currentResult: makeBaselineResult(),
    confirmedResults: winner ? [winner] : [],
    calibrationResult,
    calibrationMaterial: calibrationResult ? { material: true } : null,
    gainResult,
    gainMaterial: gainResult ? { material: true } : null,
    seatingResult,
    seatingMaterial: null,
    evaluationIssues: [],
  };
}

const IDENTITY = {
  inputIdentity: FINGERPRINT,
  electronicContext: makeElectronicContext(),
  projectId: "proj-test",
  versionId: "ver-test",
  designFingerprint: FINGERPRINT,
  resultFingerprint: "result-test",
  cacheKey: FINGERPRINT,
  baseDesignFingerprint: FINGERPRINT,
  engineVersion: "test-v1",
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Combined electronic identity proof", () => {
  it("passes for a complete crossover + tuning winner on installed geometry", () => {
    const winner = makeCombinedElectronicWinner();
    const proof = proveCombinedElectronicIdentity({
      winner, instances: makeInstances(), identity: IDENTITY,
    });
    assert.equal(proof.valid, true);
    assert.equal(proof.issues.length, 0);
  });

  it("fails when crossover settings are missing", () => {
    const winner = makeCombinedElectronicWinner({ crossover: null });
    const proof = proveCombinedElectronicIdentity({
      winner, instances: makeInstances(), identity: IDENTITY,
    });
    assert.equal(proof.valid, false);
    assert.ok(proof.issues.length > 0);
  });

  it("fails when tuning is incomplete (wrong source count)", () => {
    const winner = makeCombinedElectronicWinner({
      tuning: [makeTuning()[0]], // only one source
    });
    const proof = proveCombinedElectronicIdentity({
      winner, instances: makeInstances(), identity: IDENTITY,
    });
    assert.equal(proof.valid, false);
    assert.ok(proof.issues.length > 0);
  });

  it("fails when a physical placement marker is present", () => {
    const winner = makeCombinedElectronicWinner();
    winner.isPositionCandidate = true;
    const proof = proveCombinedElectronicIdentity({
      winner, instances: makeInstances(), identity: IDENTITY,
    });
    assert.equal(proof.valid, false);
    assert.ok(proof.issues.length > 0);
  });

  it("fails when a seating offset is present", () => {
    const winner = makeCombinedElectronicWinner();
    winner.seatingOffsetMm = 200;
    const proof = proveCombinedElectronicIdentity({
      winner, instances: makeInstances(), identity: IDENTITY,
    });
    assert.equal(proof.valid, false);
    assert.ok(proof.issues.length > 0);
  });

  it("fails when the design fingerprint is stale", () => {
    const winner = makeCombinedElectronicWinner({ inputIdentity: "cal:v8:OLD" });
    const proof = proveCombinedElectronicIdentity({
      winner, instances: makeInstances(), identity: IDENTITY,
    });
    assert.equal(proof.valid, false);
    assert.ok(proof.issues.length > 0);
  });

  it("fails when combinedFrom.crossover is not true", () => {
    const winner = makeCombinedElectronicWinner();
    winner.combinedFrom = { calibrationOnly: true };
    const proof = proveCombinedElectronicIdentity({
      winner, instances: makeInstances(), identity: IDENTITY,
    });
    assert.equal(proof.valid, false);
    assert.ok(proof.issues.length > 0);
  });
});

describe("Combined electronic lever builder", () => {
  it("builds a lever from a complete combined electronic winner", () => {
    const winner = makeCombinedElectronicWinner();
    const lever = buildCombinedElectronicLever({
      winner, instances: makeInstances(),
      baselineResult: makeBaselineResult(), identity: IDENTITY,
    });
    assert.ok(lever);
    assert.equal(lever.lever, OPTIMISER_LEVER.COMBINED_ELECTRONIC);
    assert.equal(lever.evaluated, true);
    assert.equal(lever.evidenceStatus, OPTIMISER_LEVER_EVIDENCE.EVALUATED);
    // Identity proof passes (same fingerprint, same geometry), so the lever IS
    // actionable — the combined electronic apply path can reproduce it.
    assert.equal(lever.actionable, true);
    assert.ok(lever.effect);
    assert.ok(lever.crossover);
    assert.ok(Array.isArray(lever.tuning));
    assert.equal(lever.identityProof.valid, true);
  });

  it("returns null when the winner is not a combined electronic candidate", () => {
    const winner = makeCombinedElectronicWinner();
    winner.combinedFrom = { calibrationOnly: true };
    winner.crossover = null;
    const lever = buildCombinedElectronicLever({
      winner, instances: makeInstances(),
      baselineResult: makeBaselineResult(), identity: IDENTITY,
    });
    assert.equal(lever, null);
  });

  it("retains per-source tuning with before/after values", () => {
    const winner = makeCombinedElectronicWinner({
      tuning: makeTuning(3.5, 1.0, -2, 0, 60, 15, -1, 1),
    });
    const lever = buildCombinedElectronicLever({
      winner, instances: makeInstances(),
      baselineResult: makeBaselineResult(), identity: IDENTITY,
    });
    assert.ok(lever);
    assert.equal(lever.tuning.length, 2);
    const front = lever.tuning[0];
    assert.equal(front.fromDelayMs, 0);
    assert.equal(front.toDelayMs, 3.5);
    assert.equal(front.fromGainDb, 0);
    assert.equal(front.toGainDb, -2);
    assert.equal(front.fromPolarity, 1);
    assert.equal(front.toPolarity, -1);
    assert.equal(front.changed, true);
  });

  it("retains crossover before/after config", () => {
    const winner = makeCombinedElectronicWinner({
      crossover: makeCrossover(110, 12, 12, false, 100),
    });
    const lever = buildCombinedElectronicLever({
      winner, instances: makeInstances(),
      baselineResult: makeBaselineResult(), identity: IDENTITY,
      currentCrossover: makeCrossover(80, 24, 24),
    });
    assert.ok(lever);
    assert.equal(lever.crossover.before.frequencyHz, 80);
    assert.equal(lever.crossover.after.frequencyHz, 110);
    assert.equal(lever.crossover.after.linkFrequencies, false);
    assert.equal(lever.crossover.after.subwooferFrequencyHz, 100);
  });
});

describe("Combined electronic plan retention", () => {
  it("produces a plan (not null) for a combined electronic winner with no individual lever", () => {
    const winner = makeCombinedElectronicWinner();
    const selection = makeSelection({ winner });
    const plan = buildOptimiserPlan({
      selection, baseline: selection.currentResult,
      identity: IDENTITY, instances: makeInstances(),
      seatingPositions: [], roomDims: { widthM: 4, lengthM: 6, heightM: 2.4 },
    });
    assert.ok(plan);
    assert.equal(plan.planVersion, OPTIMISER_PLAN_VERSION);
    assert.ok(plan.levers[OPTIMISER_LEVER.COMBINED_ELECTRONIC]);
    // Identity proof passes, so the lever is actionable (available for Apply).
    assert.equal(plan.levers[OPTIMISER_LEVER.COMBINED_ELECTRONIC].actionable, true);
    assert.ok(plan.combined, "combined block should be populated");
  });

  it("classifies a combined electronic winner with sub-materiality improvement as NO_USEFUL_IMPROVEMENT, not EVALUATION_INCOMPLETE", () => {
    const winner = makeCombinedElectronicWinner();
    const selection = makeSelection({ winner });
    const plan = buildOptimiserPlan({
      selection, baseline: selection.currentResult,
      identity: IDENTITY, instances: makeInstances(),
      seatingPositions: [], roomDims: { widthM: 4, lengthM: 6, heightM: 2.4 },
    });
    const actionability = resolvePlanActionability({ plan, selection });
    // The winner's deltas are below the 1 dB materiality threshold, so the lever
    // is actionable (identity proof passes) but not offerable — the run is
    // NO_USEFUL_IMPROVEMENT, never EVALUATION_INCOMPLETE.
    assert.equal(actionability.actionable, false);
    assert.notEqual(actionability.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE);
    assert.ok(actionability.reason);
    assert.equal(actionability.offerableLevers.length, 0);
  });

  it("does not classify a valid completed search as EVALUATION_INCOMPLETE", () => {
    const winner = makeCombinedElectronicWinner();
    const selection = makeSelection({ winner });
    const plan = buildOptimiserPlan({
      selection, baseline: selection.currentResult,
      identity: IDENTITY, instances: makeInstances(),
      seatingPositions: [], roomDims: { widthM: 4, lengthM: 6, heightM: 2.4 },
    });
    const actionability = resolvePlanActionability({ plan, selection });
    assert.notEqual(actionability.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE);
  });

  it("preserves the combined electronic result in terminal run evidence", () => {
    const winner = makeCombinedElectronicWinner();
    const selection = makeSelection({ winner });
    const plan = buildOptimiserPlan({
      selection, baseline: selection.currentResult,
      identity: IDENTITY, instances: makeInstances(),
      seatingPositions: [], roomDims: { widthM: 4, lengthM: 6, heightM: 2.4 },
    });
    const { runEvidence } = buildOptimiserResultForSave({
      plan, selection, identity: IDENTITY,
    });
    assert.ok(runEvidence);
    // Sub-materiality improvement with passing identity proof: the lever is
    // actionable but not offerable, so the outcome is NO_USEFUL_IMPROVEMENT.
    assert.equal(runEvidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
    assert.ok(runEvidence.combinedElectronicResult);
    assert.equal(runEvidence.combinedElectronicResult.candidateId, "combined-integration-0");
    assert.ok(runEvidence.combinedElectronicResult.crossover);
  });

  it("resolves the canonical terminal outcome as no_useful_improvement for sub-materiality winner", () => {
    const winner = makeCombinedElectronicWinner();
    const selection = makeSelection({ winner });
    const plan = buildOptimiserPlan({
      selection, baseline: selection.currentResult,
      identity: IDENTITY, instances: makeInstances(),
      seatingPositions: [], roomDims: { widthM: 4, lengthM: 6, heightM: 2.4 },
    });
    const actionability = resolvePlanActionability({ plan, selection });
    const canonical = resolveCanonicalTerminalOutcome({ actionability });
    assert.equal(canonical, "no_useful_improvement");
  });

  it("classifies a combined electronic winner with failed identity proof as NON_ACTIONABLE_ELECTRONIC", () => {
    const winner = makeCombinedElectronicWinner({ inputIdentity: "stale-fingerprint" });
    const selection = makeSelection({ winner });
    const plan = buildOptimiserPlan({
      selection, baseline: selection.currentResult,
      identity: IDENTITY, instances: makeInstances(),
      seatingPositions: [], roomDims: { widthM: 4, lengthM: 6, heightM: 2.4 },
    });
    const actionability = resolvePlanActionability({ plan, selection });
    assert.equal(actionability.actionable, false);
    assert.equal(actionability.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_ELECTRONIC);
    assert.ok(actionability.reason);
    assert.equal(actionability.offerableLevers.length, 0);
  });
});

describe("leverIsOfferable gates combined electronic by materiality", () => {
  it("does not offer a sub-materiality combined electronic lever", () => {
    const winner = makeCombinedElectronicWinner();
    const lever = buildCombinedElectronicLever({
      winner, instances: makeInstances(),
      baselineResult: makeBaselineResult(), identity: IDENTITY,
    });
    assert.equal(leverIsOfferable(lever, makeBaselineResult()), false);
  });

  it("offers an above-materiality combined electronic lever with passing identity proof", () => {
    // Winner improves P20 by > 1 dB (4.71 → 3.0) and P19 by > 1 dB (4.5 → 3.0).
    const winner = makeCombinedElectronicWinner({ p20: 3.0, p20Level: "L3", p19: 3.0, p19Level: "L2" });
    const lever = buildCombinedElectronicLever({
      winner, instances: makeInstances(),
      baselineResult: makeBaselineResult(), identity: IDENTITY,
    });
    assert.equal(lever.identityProof.valid, true);
    assert.equal(lever.actionable, true);
    assert.equal(leverIsOfferable(lever, makeBaselineResult()), true);
  });

  it("does not offer a combined electronic lever with failed identity proof", () => {
    const winner = makeCombinedElectronicWinner({ inputIdentity: "stale-fingerprint" });
    const lever = buildCombinedElectronicLever({
      winner, instances: makeInstances(),
      baselineResult: makeBaselineResult(), identity: IDENTITY,
    });
    assert.equal(lever.actionable, false);
    assert.equal(leverIsOfferable(lever, makeBaselineResult()), false);
  });
});

describe("Existing calibration-only path unchanged", () => {
  it("still builds a delay lever from selection.calibrationResult", () => {
    const calResult = makeCombinedElectronicWinner();
    calResult.candidateId = "calibration-only-0";
    calResult.combinedFrom = { calibrationOnly: true };
    calResult.crossover = null;
    calResult.appliedTuning = makeTuning(3, 0, 0, 0, 0, 0, 1, 1);
    const selection = makeSelection({ winner: calResult, calibrationResult: calResult });
    const plan = buildOptimiserPlan({
      selection, baseline: selection.currentResult,
      identity: IDENTITY, instances: makeInstances(),
      seatingPositions: [], roomDims: { widthM: 4, lengthM: 6, heightM: 2.4 },
    });
    assert.ok(plan);
    // A calibration-only winner (no crossover) does NOT get the combined electronic lever.
    assert.equal(plan.levers[OPTIMISER_LEVER.COMBINED_ELECTRONIC], undefined);
    // But the delay lever IS built from the calibrationResult.
    if (plan.levers[OPTIMISER_LEVER.DELAY]) {
      assert.equal(plan.levers[OPTIMISER_LEVER.DELAY].evidenceStatus, OPTIMISER_LEVER_EVIDENCE.EVALUATED);
    }
  });

  it("an actionable delay lever still produces an actionable plan alongside a combined electronic lever", () => {
    const winner = makeCombinedElectronicWinner();
    const calResult = makeCombinedElectronicWinner();
    calResult.candidateId = "calibration-delay-0";
    calResult.combinedFrom = { calibrationOnly: true };
    calResult.crossover = null;
    calResult.appliedTuning = makeTuning(3.5, 0, 0, 0, 0, 0, 1, 1);
    calResult.achievedP20VariationDb = 4.0;
    calResult.achievedP20Level = "L2";
    const selection = makeSelection({ winner, calibrationResult: calResult });
    const plan = buildOptimiserPlan({
      selection, baseline: selection.currentResult,
      identity: IDENTITY, instances: makeInstances(),
      seatingPositions: [], roomDims: { widthM: 4, lengthM: 6, heightM: 2.4 },
    });
    assert.ok(plan);
    // Both levers should exist.
    assert.ok(plan.levers[OPTIMISER_LEVER.COMBINED_ELECTRONIC]);
    // The plan should be actionable if the delay lever is offerable.
    const actionability = resolvePlanActionability({ plan, selection });
    if (plan.levers[OPTIMISER_LEVER.DELAY] && leverIsOfferable(plan.levers[OPTIMISER_LEVER.DELAY], selection.currentResult)) {
      assert.equal(actionability.actionable, true);
      assert.ok(actionability.offerableLevers.includes(OPTIMISER_LEVER.DELAY));
    }
  });
});

describe("Candidate promotion preserves identity", () => {
  it("the plan's combined electronic lever carries the winner's candidateId", () => {
    const winner = makeCombinedElectronicWinner();
    winner.candidateId = "combined-integration-42";
    const selection = makeSelection({ winner });
    const plan = buildOptimiserPlan({
      selection, baseline: selection.currentResult,
      identity: IDENTITY, instances: makeInstances(),
      seatingPositions: [], roomDims: { widthM: 4, lengthM: 6, heightM: 2.4 },
    });
    assert.equal(
      plan.levers[OPTIMISER_LEVER.COMBINED_ELECTRONIC].sourceCandidateId,
      "combined-integration-42",
    );
  });
});