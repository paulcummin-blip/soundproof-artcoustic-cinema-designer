// combined-electronic-auto-apply.test.mjs
// ---------------------------------------------------------------------------
// Focused acceptance tests for the combined electronic plan retention and
// automatic apply pathway.
//
// Tests the pure functions only (combinedElectronicLever, combinedElectronicApply,
// combinedElectronicIdentityProof, optimiserPlanSave offerability). No React,
// no stores, no acoustic calculation.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCombinedElectronicLever } from "../src/components/room/bass/optimiserPlan/combinedElectronicLever.js";
import {
  buildCombinedElectronicApply,
  buildCombinedElectronicUndo,
  isCombinedElectronicApplied,
  COMBINED_ELECTRONIC_APPLY_BLOCK,
} from "../src/components/room/bass/optimiserPlan/combinedElectronicApply.js";
import { proveCombinedElectronicIdentity } from "../src/components/room/bass/optimiserPlan/combinedElectronicIdentityProof.js";
import { OPTIMISER_LEVER, OPTIMISER_TERMINAL_OUTCOME } from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import { leverIsOfferable, resolvePlanActionability } from "../src/components/room/bass/optimiserPlan/optimiserPlanSave.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeInstances(overrides = []) {
  const base = [
    { id: "sub-1", model: "sub-model-a", enabled: true, legacyGroup: "front",
      position: { x: 1.5, y: 0.5 }, bottomHeightM: 0, rotationDeg: 0,
      delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: 1 },
    { id: "sub-2", model: "sub-model-a", enabled: true, legacyGroup: "rear",
      position: { x: 1.5, y: 5.5 }, bottomHeightM: 0, rotationDeg: 0,
      delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: 1 },
  ];
  return base.map((inst, i) => ({ ...inst, ...overrides[i] }));
}

function makeWinner(overrides = {}) {
  return {
    candidateId: "combined-integration-0",
    combinedFrom: { crossover: true, calibrationRetuned: true },
    crossover: {
      frequencyHz: 110,
      speakerHpSlopeDbPerOct: 24,
      subwooferLpSlopeDbPerOct: 24,
      linkFrequencies: true,
      subwooferFrequencyHz: 110,
    },
    appliedTuning: [
      { sourceId: "sub-1", delayMs: 3.5, gainDb: -1.0, phaseControlDeg: 45, polarity: 1 },
      { sourceId: "sub-2", delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: -1 },
    ],
    inputIdentity: "fp-design-current",
    // P19/P20 result fields — the winner's own measured effect.
    achievedP19Level: 3,
    achievedP19VariationDb: 5,
    achievedP20Level: 3,
    achievedP20VariationDb: 5,
    ...overrides,
  };
}

const identity = { designFingerprint: "fp-design-current", resultFingerprint: "fp-result-current" };
// Baseline result: worse P19/P20 so the winner's deltas are improving.
const baselineResult = {
  achievedP19Level: 2, achievedP19VariationDb: 8,
  achievedP20Level: 2, achievedP20VariationDb: 10,
};
const baselinePlan = { p19Level: 2, p20Level: 2 };

// ── Section 2: Combined electronic plan retention ──────────────────────────

test("Combined electronic lever retains complete crossover + tuning payload", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });

  assert.ok(lever, "lever must be built");
  assert.equal(lever.lever, OPTIMISER_LEVER.COMBINED_ELECTRONIC);
  assert.ok(lever.crossover?.after, "crossover after must exist");
  assert.equal(lever.crossover.after.frequencyHz, 110);
  assert.equal(lever.crossover.after.speakerHpSlopeDbPerOct, 24);
  assert.equal(lever.crossover.after.subwooferLpSlopeDbPerOct, 24);
  assert.equal(lever.tuning.length, 2, "per-source tuning must exist");
  assert.equal(lever.tuning[0].subId, "sub-1");
  assert.equal(lever.tuning[0].toDelayMs, 3.5);
  assert.equal(lever.tuning[0].toGainDb, -1.0);
  assert.equal(lever.tuning[0].toPhaseDeg, 45);
  assert.equal(lever.tuning[1].toPolarity, -1);
});

test("Combined electronic lever retains per-source model and geometry identity", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });

  assert.ok(lever.sourceIdentity, "sourceIdentity must exist");
  assert.equal(lever.sourceIdentity.length, 2);
  assert.equal(lever.sourceIdentity[0].model, "sub-model-a");
  assert.equal(lever.sourceIdentity[0].geometry.x, 1.5);
  assert.equal(lever.sourceIdentity[0].geometry.y, 0.5);
  assert.equal(lever.sourceIdentity[1].geometry.y, 5.5);
});

test("Combined electronic lever retains design and result fingerprints", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });

  assert.equal(lever.designFingerprint, "fp-design-current");
  assert.equal(lever.resultFingerprint, "fp-result-current");
  assert.equal(lever.cacheKey, "fp-design-current");
});

test("Combined electronic lever is actionable when identity proof passes", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });

  assert.equal(lever.identityProof.valid, true, "identity proof must pass");
  assert.equal(lever.actionable, true, "lever must be actionable when proof passes");
});

test("Combined electronic lever is NOT actionable when fingerprint is stale", () => {
  const winner = makeWinner({ inputIdentity: "fp-design-old" });
  const instances = makeInstances();
  const staleIdentity = { designFingerprint: "fp-design-current", resultFingerprint: "fp-result-current" };
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity: staleIdentity });

  assert.equal(lever.identityProof.valid, false, "identity proof must fail");
  assert.equal(lever.actionable, false, "lever must NOT be actionable when proof fails");
  assert.ok(lever.identityProof.issues.length > 0, "issues must be stated");
});

test("Combined electronic lever is NOT actionable when crossover is incomplete", () => {
  const winner = makeWinner({ crossover: { frequencyHz: 110, speakerHpSlopeDbPerOct: 24 } });
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });

  assert.equal(lever.identityProof.valid, false);
  assert.equal(lever.actionable, false);
});

test("Combined electronic lever is NOT actionable when physical change marker present", () => {
  const winner = makeWinner({ isPositionCandidate: true });
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });

  assert.equal(lever.identityProof.valid, false);
  assert.equal(lever.actionable, false);
});

// ── Section 3: Automatic electronic Apply ──────────────────────────────────

test("Combined electronic apply produces complete instances + crossover", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  const currentCrossover = { frequencyHz: 80, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24, linkFrequencies: true, subwooferFrequencyHz: 80 };

  const result = buildCombinedElectronicApply({ lever, instances, currentCrossover, identity });

  assert.equal(result.ok, true, "apply must succeed");
  assert.ok(result.instances, "new instances must exist");
  assert.ok(result.crossover, "new crossover must exist");
  assert.equal(result.crossover.frequencyHz, 110, "crossover frequency must be applied");
  assert.equal(result.previousCrossover.frequencyHz, 80, "previous crossover must be retained");
  // Tuning applied via applyCalibrationTuning stamps provenance.
  const active = result.instances.filter((i) => i.enabled !== false);
  assert.equal(active[0].delayMs, 3.5, "delay must be applied");
  assert.equal(active[0].gainDb, -1.0, "gain must be applied");
  assert.equal(active[0].tuningSource, "v2-optimised", "provenance must be stamped");
  assert.equal(active[1].polarity, -1, "polarity must be applied");
});

test("Combined electronic apply refuses incomplete crossover (no partial apply)", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  // Sabotage the crossover after.
  lever.crossover.after = null;
  const result = buildCombinedElectronicApply({ lever, instances, currentCrossover: null, identity });
  assert.equal(result.ok, false);
  assert.equal(result.code, COMBINED_ELECTRONIC_APPLY_BLOCK.NO_CROSSOVER);
});

test("Combined electronic apply refuses stale fingerprint", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  const staleIdentity = { designFingerprint: "fp-design-different" };
  const result = buildCombinedElectronicApply({ lever, instances, currentCrossover: null, identity: staleIdentity });
  assert.equal(result.ok, false);
  assert.equal(result.code, COMBINED_ELECTRONIC_APPLY_BLOCK.STALE_FINGERPRINT);
});

test("Combined electronic apply refuses geometry mismatch", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  // Move a subwoofer after the run was confirmed.
  const movedInstances = makeInstances([{ position: { x: 1.5, y: 0.5 } }, { position: { x: 1.5, y: 6.0 } }]);
  const result = buildCombinedElectronicApply({ lever, instances: movedInstances, currentCrossover: null, identity });
  assert.equal(result.ok, false);
  assert.equal(result.code, COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH);
});

test("Combined electronic apply refuses when identity proof failed", () => {
  const winner = makeWinner({ inputIdentity: "fp-design-old" });
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity: { designFingerprint: "fp-design-current" } });
  assert.equal(lever.actionable, false, "lever must not be actionable");
  const result = buildCombinedElectronicApply({ lever, instances, currentCrossover: null, identity: { designFingerprint: "fp-design-current" } });
  assert.equal(result.ok, false);
  assert.equal(result.code, COMBINED_ELECTRONIC_APPLY_BLOCK.INCOMPLETE);
});

test("Combined electronic undo restores previous tuning and crossover", () => {
  const winner = makeWinner();
  // Build the lever from NEUTRAL instances so `from` values are the pre-apply state.
  const neutralInstances = makeInstances();
  const previousCrossover = { frequencyHz: 80, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24, linkFrequencies: true, subwooferFrequencyHz: 80 };
  const lever = buildCombinedElectronicLever({ winner, instances: neutralInstances, baselineResult, identity, currentCrossover: previousCrossover });
  // Apply first, then undo from the applied instances.
  const applyResult = buildCombinedElectronicApply({ lever, instances: neutralInstances, currentCrossover: previousCrossover, identity });
  assert.equal(applyResult.ok, true);
  const result = buildCombinedElectronicUndo({ lever, instances: applyResult.instances });

  assert.equal(result.ok, true);
  assert.ok(result.instances);
  assert.ok(result.crossover, "crossover must be restored from before");
  assert.equal(result.crossover.frequencyHz, 80, "crossover frequency must be restored");
  const active = result.instances.filter((i) => i.enabled !== false);
  assert.equal(active[0].delayMs, 0, "delay must be restored");
  assert.equal(active[0].gainDb, 0, "gain must be restored");
  assert.equal(active[1].polarity, 1, "polarity must be restored");
});

test("isCombinedElectronicApplied detects a fully applied configuration", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  const appliedInstances = makeInstances([
    { delayMs: 3.5, gainDb: -1.0, phaseControlDeg: 45, polarity: 1, tuningSource: "v2-optimised" },
    { delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: -1, tuningSource: "v2-optimised" },
  ]);
  const appliedCrossover = { frequencyHz: 110, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24, linkFrequencies: true, subwooferFrequencyHz: 110 };
  assert.equal(isCombinedElectronicApplied(lever, appliedInstances, appliedCrossover), true);
});

test("isCombinedElectronicApplied rejects partial apply (tuning without crossover)", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  const appliedInstances = makeInstances([
    { delayMs: 3.5, gainDb: -1.0, phaseControlDeg: 45, polarity: 1, tuningSource: "v2-optimised" },
    { delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: -1, tuningSource: "v2-optimised" },
  ]);
  // Crossover NOT applied — still 80 Hz.
  const oldCrossover = { frequencyHz: 80, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24, linkFrequencies: true, subwooferFrequencyHz: 80 };
  assert.equal(isCombinedElectronicApplied(lever, appliedInstances, oldCrossover), false);
});

test("isCombinedElectronicApplied rejects coincidental value matching without provenance", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  // Values match but tuningSource is NOT v2-optimised — coincidental match.
  const coincidentalInstances = makeInstances([
    { delayMs: 3.5, gainDb: -1.0, phaseControlDeg: 45, polarity: 1 },
    { delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: -1 },
  ]);
  const appliedCrossover = { frequencyHz: 110, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24, linkFrequencies: true, subwooferFrequencyHz: 110 };
  assert.equal(isCombinedElectronicApplied(lever, coincidentalInstances, appliedCrossover), false);
});

// ── Section 5: Electronic improvement significance (offerability) ───────────

test("leverIsOfferable accepts a combined electronic lever with valid identity proof", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  assert.equal(leverIsOfferable(lever, baselinePlan), true);
});

test("leverIsOfferable rejects a combined electronic lever with failed identity proof", () => {
  const winner = makeWinner({ inputIdentity: "fp-design-old" });
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity: { designFingerprint: "fp-design-current" } });
  assert.equal(leverIsOfferable(lever, baselinePlan), false);
});

test("resolvePlanActionability returns actionable when combined electronic lever is offerable", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  const plan = { levers: { [OPTIMISER_LEVER.COMBINED_ELECTRONIC]: lever }, baseline: baselinePlan };
  const result = resolvePlanActionability({ plan, selection: { winner } });
  assert.equal(result.actionable, true);
  assert.ok(result.offerableLevers.includes(OPTIMISER_LEVER.COMBINED_ELECTRONIC));
});

test("resolvePlanActionability returns NON_ACTIONABLE_ELECTRONIC when identity proof fails", () => {
  const winner = makeWinner({ inputIdentity: "fp-design-old" });
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity: { designFingerprint: "fp-design-current" } });
  const plan = { levers: { [OPTIMISER_LEVER.COMBINED_ELECTRONIC]: lever }, baseline: baselinePlan };
  const result = resolvePlanActionability({ plan, selection: { winner } });
  assert.equal(result.actionable, false);
  assert.equal(result.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_ELECTRONIC);
});

// ── Section 4: Physical protection ─────────────────────────────────────────

test("Physical change marker prevents combined electronic apply", () => {
  const winner = makeWinner({ isPositionCandidate: true });
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  assert.equal(lever.actionable, false, "physical change must block actionable");
  const result = buildCombinedElectronicApply({ lever, instances, currentCrossover: null, identity });
  assert.equal(result.ok, false, "apply must be refused");
});

test("Seating offset marker prevents combined electronic apply", () => {
  const winner = makeWinner({ seatingOffsetMm: 200 });
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  assert.equal(lever.actionable, false);
  const result = buildCombinedElectronicApply({ lever, instances, currentCrossover: null, identity });
  assert.equal(result.ok, false);
});

// ── Section 6: Prevent optimisation loops ──────────────────────────────────

test("Applied configuration carries v2-optimised provenance for loop prevention", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  const result = buildCombinedElectronicApply({ lever, instances, currentCrossover: null, identity });
  const active = result.instances.filter((i) => i.enabled !== false);
  assert.ok(active.every((inst) => inst.tuningSource === "v2-optimised"), "all active instances must carry v2-optimised provenance");
});

test("isCombinedElectronicApplied requires provenance, preventing re-trigger on coincidental match", () => {
  const winner = makeWinner();
  const instances = makeInstances();
  const lever = buildCombinedElectronicLever({ winner, instances, baselineResult, identity });
  // Same values but no provenance — must NOT be detected as applied.
  const noProvenance = makeInstances([
    { delayMs: 3.5, gainDb: -1.0, phaseControlDeg: 45, polarity: 1 },
    { delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: -1 },
  ]);
  const appliedCrossover = { frequencyHz: 110, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24, linkFrequencies: true, subwooferFrequencyHz: 110 };
  assert.equal(isCombinedElectronicApplied(lever, noProvenance, appliedCrossover), false);
});