// electronic-first-execution-order.test.mjs
// Acceptance tests for the corrected non-intrusive-first Bass ADI hierarchy.
//
// Verifies the ACTUAL execution sequence in the engine source, not merely the
// gate helper: the combined electronic optimisation (including crossover) must
// run before the physical placement gate, gain candidates must be part of the
// electronic gate input, crossover diagnostics must be wired into
// electronicsCompleted, and the combined search must run exactly once.

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import {
  readEscalationLevels,
  isPhysicalPlacementEligible,
  isSeatingEligible,
  electronicsCompleted,
  isPhysicalRecommendationAcceptable,
  filterPhysicalForSignificance,
} from "../src/components/room/bass/improveBassV2/nonIntrusiveHierarchyGate.js";

const ENGINE = "src/components/room/bass/improveBassV2/improveBassV2Engine.js";
const engineSource = fs.readFileSync(ENGINE, "utf8");

function rawForLevel(l) { return { 1: 6, 2: 4, 3: 3, 4: 2, 0: 6 }[l] ?? 6; }
function seat(id, level, isPrimary) { return { seatId: id, isPrimary, level, variationDbRaw: rawForLevel(level) }; }
function result({ p19Level, p20Primary = 1, p20Secondary = null, p14Level = 2, p14Db = 100 } = {}) {
  const perSeatP20 = [];
  if (p20Primary != null) perSeatP20.push(seat("p1", p20Primary, true));
  if (p20Secondary != null) perSeatP20.push(seat("s1", p20Secondary, false));
  const levels = [p20Primary, p20Secondary].filter((l) => l != null);
  return {
    achievedP19Level: p19Level, achievedP19VariationDb: p19Level != null ? rawForLevel(p19Level) : null,
    achievedP20Level: levels.length ? Math.min(...levels) : null,
    achievedP20VariationDb: levels.length ? Math.max(...levels.map(rawForLevel)) : null,
    perSeatP20, p14AchievedLevel: p14Level, p14AchievedDb: p14Db,
  };
}
function physicalResult({ p19Level, p20Primary, p20Secondary, p14Level = 2, p14Db = 100, id = "pos" } = {}) {
  const r = result({ p19Level, p20Primary, p20Secondary, p14Level, p14Db });
  return { ...r, isPositionCandidate: true, candidateId: id };
}

// 1 — Phase, delay, gain and crossover finish before placement eligibility.
test("1: combined electronic search is wired before the placement gate", () => {
  const combinedIdx = engineSource.indexOf("await runCombinedOptimisation(");
  const gateIdx = engineSource.indexOf("isPhysicalPlacementEligible(bestElectronicResult)");
  assert.ok(combinedIdx > -1, "runCombinedOptimisation is called");
  assert.ok(gateIdx > -1, "placement gate is evaluated");
  assert.ok(combinedIdx < gateIdx, "combined electronic search runs before the placement gate");
});

// 2 — A confirmed gain-only winner is included in the electronic gate input.
test("2: gain candidates are part of the electronic gate input", () => {
  assert.ok(engineSource.includes("funnelCandidates.filter((r) => !isPhysicalCandidate(r))"),
    "electronic pool is filtered from funnelCandidates, including gain candidates");
  // A gain winner leaving all L1 must permit placement (gate opens).
  const gainWinner = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  assert.equal(isPhysicalPlacementEligible(gainWinner), true);
});

// 3 — A confirmed crossover-only winner can close (decide) the physical gate.
test("3: crossover diagnostics are wired into electronicsCompleted", () => {
  assert.ok(engineSource.includes("crossoverDiagnostics: combinedDiagnostics"),
    "crossover diagnostics are passed to electronicsCompleted");
  const done = { status: "completed-shortlist", valid: 1 };
  const crossoverDone = { status: "completed", screened: 5, confirmed: 2, tested: 5 };
  assert.equal(electronicsCompleted({
    phaseDiagnostics: done, calibrationDiagnostics: done, gainDiagnostics: done,
    crossoverDiagnostics: crossoverDone,
  }).complete, true);
  // A crossover winner leaving all L1 permits placement.
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 })), true);
});

// 4 — A failed or unverified crossover search cannot be counted as completed.
test("4: failed or no-coverage crossover is not complete", () => {
  const done = { status: "completed-shortlist", valid: 1 };
  const failed = electronicsCompleted({
    phaseDiagnostics: done, calibrationDiagnostics: done, gainDiagnostics: done,
    crossoverDiagnostics: { status: "error" },
  });
  assert.equal(failed.complete, false);
  assert.ok(failed.reasons.some((r) => r.startsWith("crossover:")));
  const noCoverage = electronicsCompleted({
    phaseDiagnostics: done, calibrationDiagnostics: done, gainDiagnostics: done,
    crossoverDiagnostics: { status: "unavailable", screened: 0, tested: 0, confirmed: 0 },
  });
  assert.equal(noCoverage.complete, false);
  assert.ok(noCoverage.reasons.some((r) => r.startsWith("crossover:")));
});

// 5 — All applicable Levels L1 after completed electronics opens placement.
test("5: all L1 after electronics opens placement", () => {
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 })), true);
});

// 6 — Any Level above L1 closes placement.
test("6: any level above L1 closes placement", () => {
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 2, p20Primary: 1, p20Secondary: 1 })), false);
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 1, p20Primary: 2, p20Secondary: 1 })), false);
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 1, p20Primary: 1, p20Secondary: 2 })), false);
});

// 7 — Any Level above L1 after practical placement closes seating.
test("7: any level above L1 after placement closes seating", () => {
  assert.equal(isSeatingEligible(result({ p19Level: 2, p20Primary: 1, p20Secondary: 1 })), false);
  assert.equal(isSeatingEligible(result({ p19Level: 1, p20Primary: 2, p20Secondary: 1 })), false);
  assert.equal(isSeatingEligible(result({ p19Level: 1, p20Primary: 1, p20Secondary: 2 })), false);
});

// 8 — Phase 9B cannot bypass the seating gate.
test("8: Phase 9B coordinated search is gated by seatingGate", () => {
  assert.ok(engineSource.includes("seatingGate && existingAuthority"),
    "Phase 9B coordinatedEligible requires seatingGate");
  assert.ok(engineSource.includes("hierarchy_gate_closed"),
    "Phase 9B records hierarchy-gate-closed skip reason");
  assert.ok(engineSource.includes("if (!placementGate) break;"),
    "Stage 11B escalation breaks when placement gate closed");
});

// 9 — Same-Level dB improvements cannot justify physical changes.
test("9: same-level dB-only physical candidate is not recommendable", () => {
  const baseline = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1, p14Level: 2, p14Db: 100 });
  const same = physicalResult({ p19Level: 1, p20Primary: 1, p20Secondary: 1, id: "posSame" });
  same.perSeatP20 = [
    { seatId: "p1", isPrimary: true, level: 1, variationDbRaw: 5 },
    { seatId: "s1", isPrimary: false, level: 1, variationDbRaw: 6 },
  ];
  same.achievedP20VariationDb = 5;
  assert.equal(isPhysicalRecommendationAcceptable(baseline, same), false);
  assert.equal(filterPhysicalForSignificance([same], baseline).includes(same), false);
  // A genuine level improvement IS acceptable.
  const improved = physicalResult({ p19Level: 2, p20Primary: 1, p20Secondary: 1, id: "posLvl" });
  assert.equal(isPhysicalRecommendationAcceptable(baseline, improved), true);
});

// 10 — Combined electronics run once, with canonical results retained.
test("10: runCombinedOptimisation is called exactly once", () => {
  const matches = engineSource.match(/await runCombinedOptimisation\(/g) || [];
  assert.equal(matches.length, 1, "combined electronic search runs exactly once");
  // Combined candidates are pushed into confirmedResults for final selection.
  assert.ok(engineSource.includes("confirmedResults.push(cc);\n          funnelCandidates.push(cc);"),
    "combined candidates retained for final selection");
});

// 11 — Existing Starting Layout Stage 1/2 remains unchanged.
test("11: no new Stage 1/2 placement calls were added to the engine", () => {
  assert.ok(!engineSource.includes("runStage1Placement("), "no Stage 1 call added");
  assert.ok(!engineSource.includes("runStage2Placement("), "no Stage 2 call added");
  // The engine still consumes stage2Result from the existing Stage 1/2 search.
  assert.ok(engineSource.includes("gatherCandidates("), "existing candidate gathering preserved");
});

// 12 — Saved diagnostics accurately describe completed and skipped categories.
test("12: hierarchyGateDiagnostics carries electronics + crossover state", () => {
  assert.ok(engineSource.includes("selection.hierarchyGateDiagnostics=hierarchyGateDiagnostics"),
    "hierarchy diagnostics attached to selection");
  assert.ok(engineSource.includes("electronicsComplete: electronicsGate.complete"),
    "electronics completion recorded");
  assert.ok(engineSource.includes("electronicsReasons: electronicsGate.reasons"),
    "electronics reasons recorded (including crossover)");
});

// 13 — No-secondary-seat design: P20 Secondary is not applicable.
test("13: single-row design treats P20 Secondary as not applicable", () => {
  const singleRow = result({ p19Level: 1, p20Primary: 1, p20Secondary: null });
  const levels = readEscalationLevels(singleRow);
  assert.equal(levels.p20Secondary, "not_applicable");
  // Gate still requires P19 + Primary at L1.
  assert.equal(isPhysicalPlacementEligible(singleRow), true);
  const singleRowAbove = result({ p19Level: 2, p20Primary: 1, p20Secondary: null });
  assert.equal(isPhysicalPlacementEligible(singleRowAbove), false);
});