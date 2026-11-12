// completion-evidence-and-escalation.test.mjs
// Focused acceptance tests for the corrected Bass ADI completion evidence and
// escalation authority. Verifies the gate helper, the seating authority, the
// persistence wiring, the significance colour rule, and the UI status evidence.

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import {
  readEscalationLevels,
  isPhysicalPlacementEligible,
  isSeatingEligible,
  electronicsCompleted,
  crossoverGenuinelyCompleted,
  isPhysicalRecommendationAcceptable,
  filterPhysicalForSignificance,
} from "../src/components/room/bass/improveBassV2/nonIntrusiveHierarchyGate.js";
import { identifyBestPositionCandidate } from "../src/components/room/bass/improveBassV2/combinedOptimisationSearch.js";
import { buildSearchStatusEvidence } from "../src/components/room/bass/optimiserPlan/searchStatusEvidence.js";

const ENGINE = "src/components/room/bass/improveBassV2/improveBassV2Engine.js";
const PERSIST = "src/components/room/bass/optimiserPlan/optimiserPlanPersistence.js";
const PLAN_BUILDER = "src/components/room/bass/optimiserPlan/buildOptimiserPlan.js";
const RESOLVER = "src/components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
const engineSource = fs.readFileSync(ENGINE, "utf8");
const persistSource = fs.readFileSync(PERSIST, "utf8");
const planSource = fs.readFileSync(PLAN_BUILDER, "utf8");
const resolverSource = fs.readFileSync(RESOLVER, "utf8");

function rawForLevel(l) { return { 1: 6, 2: 4, 3: 3, 4: 2, 0: 6 }[l] ?? 6; }
function seat(id, level, isPrimary) { return { seatId: id, isPrimary, level, variationDbRaw: rawForLevel(level) }; }
function result({ p19Level, p20Primary = 1, p20Secondary = null, p14Level = 2, p14Db = 100 } = {}) {
  const perSeatP20 = [];
  if (p20Primary != null) perSeatP20.push(seat("p1", p20Primary, true));
  if (p20Secondary != null) perSeatP20.push(seat("s1", p20Secondary, false));
  return {
    achievedP19Level: p19Level, achievedP19VariationDb: p19Level != null ? rawForLevel(p19Level) : null,
    achievedP20Level: null, achievedP20VariationDb: null, perSeatP20,
    p14AchievedLevel: p14Level, p14AchievedDb: p14Db,
  };
}
function positionResult({ p19Level, p20Primary, p20Secondary, id = "pos" } = {}) {
  const r = result({ p19Level, p20Primary, p20Secondary });
  return { ...r, isPositionCandidate: true, candidateId: id };
}

// 1 — Crossover screening without evaluation does not count as completed.
test("1: crossover screening without confirmation is not complete", () => {
  const screened = crossoverGenuinelyCompleted({ status: "completed", screened: 5, confirmed: 0, tested: 5 });
  assert.equal(screened.complete, false);
  assert.equal(screened.reason, "screened-not-confirmed");
});

// 2 — Crossover genuinely evaluated and canonically confirmed reports completed.
test("2: crossover with confirmation is complete (no winner needed)", () => {
  const confirmed = crossoverGenuinelyCompleted({ status: "completed", screened: 5, confirmed: 3, tested: 5 });
  assert.equal(confirmed.complete, true);
  // A no-safe-improvement search that confirmed and rejected all is still complete.
  const noWinner = crossoverGenuinelyCompleted({ status: "no_safe_improvement", screened: 5, confirmed: 5 });
  assert.equal(noWinner.complete, true);
});

// 3 — No combined response produces an accurate not-applicable status.
test("3: unavailable combined response is genuinely not-applicable", () => {
  const unavailable = crossoverGenuinelyCompleted({ status: "unavailable" });
  assert.equal(unavailable.complete, true);
  assert.equal(unavailable.reason, "not-applicable");
  // A skipped-not-run crossover is NOT complete.
  const skipped = crossoverGenuinelyCompleted({ status: "skipped" });
  assert.equal(skipped.complete, false);
});

// 4 — Delay/gain with zero actual search evidence are not incorrectly marked tested.
test("4: electronic category without confirmation evidence is not complete", () => {
  const done = { status: "completed-shortlist", confirmed: 1, valid: 1 };
  const noEvidence = electronicsCompleted({
    phaseDiagnostics: { status: "completed-shortlist", confirmed: 0, valid: 0 },
    calibrationDiagnostics: done, gainDiagnostics: done,
  });
  assert.equal(noEvidence.complete, false);
  assert.ok(noEvidence.reasons.some((r) => r.startsWith("phase:")));
  // Stale or cancelled diagnostics are not complete.
  const stale = electronicsCompleted({
    phaseDiagnostics: { status: "stale" }, calibrationDiagnostics: done, gainDiagnostics: done,
  });
  assert.equal(stale.complete, false);
});

// 5 — Placement gate records its exact confirmed input Levels and decision.
test("5: placement gate reads exact electronic levels", () => {
  assert.ok(engineSource.includes("electronicLevels: bestElectronicResult ? readEscalationLevels(bestElectronicResult) : null"),
    "gate records the confirmed electronic levels");
  assert.ok(engineSource.includes("placementGate,"), "placement gate decision recorded");
});

// 6 — FAIL, missing or stale Levels cannot be treated as L1.
test("6: FAIL, missing or stale levels cannot open the gate", () => {
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 0, p20Primary: 1, p20Secondary: 1 })), false);
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: null, p20Primary: 1, p20Secondary: 1 })), false);
  const missingPrimary = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  missingPrimary.perSeatP20[0] = { seatId: "p1", isPrimary: true, level: null };
  assert.equal(isPhysicalPlacementEligible(missingPrimary), false);
});

// 7 — Invalid/impractical placement cannot open seating.
test("7: impractical placement cannot open seating", () => {
  const baseline = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  const confirmedResults = [
    { ...positionResult({ p19Level: 1, p20Primary: 1, p20Secondary: 1, id: "impractical" }), practical: false },
  ];
  const best = identifyBestPositionCandidate(confirmedResults, baseline);
  assert.equal(best, null, "impractical candidate filtered out");
});

// 8 — Failed or incomplete placement cannot open seating.
test("8: no qualifying placement result closes the seating gate", () => {
  const baseline = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  // No position candidates at all.
  assert.equal(identifyBestPositionCandidate([], baseline), null);
  // Position candidates without canonical level evidence.
  const noLevels = { isPositionCandidate: true, candidateId: "noLevel", perSeatP20: [] };
  assert.equal(identifyBestPositionCandidate([noLevels], baseline), null);
  // The engine must not fall back to Current for the seating gate.
  assert.ok(engineSource.includes("bestPracticalResult && existingAuthority"),
    "seating gate requires a qualifying placement result, not a Current fallback");
});

// 9 — Eligible practical placement raising one Level above L1 blocks seating.
test("9: placement raising a level above L1 blocks seating", () => {
  const placementAboveL1 = result({ p19Level: 2, p20Primary: 1, p20Secondary: 1 });
  assert.equal(isSeatingEligible(placementAboveL1), false);
  const placementAllL1 = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  assert.equal(isSeatingEligible(placementAllL1), true);
});

// 10 — Phase 9B shares the same seating authority.
test("10: Phase 9B coordinated search is gated by the same seating gate", () => {
  assert.ok(engineSource.includes("seatingGate && existingAuthority"),
    "Phase 9B coordinatedEligible requires seatingGate");
  assert.ok(engineSource.includes("hierarchy_gate_closed"),
    "Phase 9B records hierarchy-gate-closed skip reason");
});

// 11 — Zero seating probes cannot display Seating tested.
test("11: zero seating probes produce a skipped status, not tested", () => {
  const status = buildSearchStatusEvidence({
    phaseDiagnostics: { status: "completed-shortlist", confirmed: 1, valid: 1 },
    calibrationDiagnostics: { status: "completed-shortlist", confirmed: 1, valid: 1 },
    gainDiagnostics: { status: "completed-shortlist", confirmed: 1, valid: 1 },
    combinedDiagnostics: { status: "completed", confirmed: 2, screened: 5 },
    placementGate: true,
    seatingGate: false,
    placementEvaluated: true,
    seatingDiagnostics: { tested: 0, confirmed: 0, status: "skipped" },
  });
  const seating = status.categories.find((c) => c.key === "seating");
  assert.equal(seating.evaluated, false);
  assert.notEqual(seating.status, "completed");
});

// 12 — Save and cold reopen preserve matching hierarchy diagnostics and statuses.
test("12: hierarchy diagnostics and search status are persisted and restored", () => {
  assert.ok(persistSource.includes("hierarchyGateDiagnostics: plan.hierarchyGateDiagnostics"),
    "persistence serialises hierarchyGateDiagnostics");
  assert.ok(persistSource.includes("searchStatus: plan.searchStatus"),
    "persistence serialises searchStatus");
  assert.ok(planSource.includes("hierarchyGateDiagnostics: selection?.hierarchyGateDiagnostics"),
    "plan builder attaches hierarchyGateDiagnostics");
  assert.ok(planSource.includes("searchStatus: buildSearchStatusEvidence"),
    "plan builder attaches searchStatus");
  assert.ok(resolverSource.includes("hierarchyGateDiagnostics: plan.hierarchyGateDiagnostics"),
    "resolver exposes hierarchyGateDiagnostics");
  assert.ok(resolverSource.includes("searchStatus: plan.searchStatus"),
    "resolver exposes searchStatus");
});

// 13 — The same-Level colour rule is applied consistently.
test("13: same-level dB change is neutral, level-up is green, level-down is red", () => {
  const cardsSource = fs.readFileSync("src/components/room/bass/optimiserPlan/AdiImprovementCards.jsx", "utf8");
  assert.ok(cardsSource.includes('metric.levelChange === "up" ? "text-[#213428]"'),
    "MetricCard colours green on level-up");
  assert.ok(cardsSource.includes('metric.levelChange === "down" ? "text-[#B91C1C]"'),
    "MetricCard colours red on level-down");
  const beforeAfterSource = fs.readFileSync("src/components/room/bass/optimiserPlan/AdiBeforeAfterResult.jsx", "utf8");
  assert.ok(beforeAfterSource.includes('levelChange === "up" ? "text-[#213428]"'),
    "BeforeAfter colours green on level-up");
  assert.ok(beforeAfterSource.includes('levelChange === "down" ? "text-[#B91C1C]"'),
    "BeforeAfter colours red on level-down");
  // Same-level improvement text is neutral, no leading plus on absolute magnitudes.
  assert.ok(beforeAfterSource.includes("dB change"), "improvement text uses neutral 'dB change'");
});

// 14 — Existing Starting Layout Stage 1/2 and acoustic calculations remain unchanged.
test("14: no new Stage 1/2 or acoustic solver calls added", () => {
  assert.ok(!engineSource.includes("runStage1Placement("), "no Stage 1 call added");
  assert.ok(!engineSource.includes("runStage2Placement("), "no Stage 2 call added");
  assert.ok(engineSource.includes("gatherCandidates("), "existing candidate gathering preserved");
  assert.ok(engineSource.includes("crossoverDiagnostics: combinedDiagnostics"),
    "crossover diagnostics wired (no new acoustic math)");
});