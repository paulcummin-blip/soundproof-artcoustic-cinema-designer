// nonIntrusiveHierarchyGate.test.mjs
// Pure unit tests for the non-intrusive-first escalation hierarchy gate.
//
// These tests verify the DECISION LOGIC only: reading escalation levels,
// the all-L1 gate, electronic completion, and physical recommendation
// significance. They do not exercise the engine, the worker, or the browser.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readEscalationLevels,
  isAllL1,
  hasMaterialLimitation,
  physicalEligibilityReason,
  isPhysicalPlacementEligible,
  isSeatingEligible,
  electronicsCompleted,
  electronicCategoryCompleted,
  crossoverGenuinelyCompleted,
  hasGenuineLevelImprovement,
  isPhysicalRecommendationAcceptable,
  isPhysicalCandidate,
  filterPhysicalForSignificance,
} from "../src/components/room/bass/improveBassV2/nonIntrusiveHierarchyGate.js";

// gradeP20: <=2 -> L4, <=3 -> L3, <=4 -> L2, else L1. A grade-consistent
// variationDbRaw for a desired P20 level (used where isMaterialImprovement
// validates the seat row). P19 uses the same thresholds (gradeP19: <=5 -> L1,
// >5 -> FAIL) so L1 needs >=6.
function rawForLevel(level) {
  return { 1: 6, 2: 4, 3: 3, 4: 2, 0: 6 }[level] ?? 6;
}

function seat(seatId, level, isPrimary) {
  return { seatId, isPrimary, level, variationDbRaw: rawForLevel(level) };
}

function result({ p19Level, p20Primary = 1, p20Secondary = null, p14Level = 1, p14Db = 100 } = {}) {
  const perSeatP20 = [];
  if (p20Primary != null) perSeatP20.push(seat("p1", p20Primary, true));
  if (p20Secondary != null) perSeatP20.push(seat("s1", p20Secondary, false));
  const levels = [p20Primary, p20Secondary].filter((l) => l != null);
  return {
    achievedP19Level: p19Level,
    achievedP19VariationDb: p19Level != null ? rawForLevel(p19Level) : null,
    achievedP20Level: levels.length ? Math.min(...levels) : null,
    achievedP20VariationDb: levels.length ? Math.max(...levels.map(rawForLevel)) : null,
    perSeatP20,
    p14AchievedLevel: p14Level,
    p14AchievedDb: p14Db,
  };
}

// ── readEscalationLevels ────────────────────────────────────────────────

test("readEscalationLevels: reads P19 RSP and P20 Primary/Secondary", () => {
  const r = result({ p19Level: 1, p20Primary: 2, p20Secondary: 1 });
  const levels = readEscalationLevels(r);
  assert.equal(levels.p19Rsp, 1);
  assert.equal(levels.p20Primary, 2);
  assert.equal(levels.p20Secondary, 1);
});

test("readEscalationLevels: single-row cinema has P20 Secondary not_applicable", () => {
  const r = result({ p19Level: 1, p20Primary: 1, p20Secondary: null });
  const levels = readEscalationLevels(r);
  assert.equal(levels.p20Secondary, "not_applicable");
});

test("readEscalationLevels: missing result returns nulls", () => {
  const levels = readEscalationLevels(null);
  assert.equal(levels.p19Rsp, null);
  assert.equal(levels.p20Primary, null);
  assert.equal(levels.p20Secondary, null);
});

test("readEscalationLevels: FAIL seat gives level 0 (worse than L1)", () => {
  const r = result({ p19Level: 1, p20Primary: 0, p20Secondary: 1 });
  const levels = readEscalationLevels(r);
  assert.equal(levels.p20Primary, 0);
});

// ── isAllL1 ─────────────────────────────────────────────────────────────

test("isAllL1: true when all applicable levels are L1", () => {
  assert.equal(isAllL1({ p19Rsp: 1, p20Primary: 1, p20Secondary: 1 }), true);
});

test("isAllL1: true for single-row (Secondary not_applicable)", () => {
  assert.equal(isAllL1({ p19Rsp: 1, p20Primary: 1, p20Secondary: "not_applicable" }), true);
});

test("isAllL1: false when any applicable level is L2 or better", () => {
  assert.equal(isAllL1({ p19Rsp: 1, p20Primary: 2, p20Secondary: 1 }), false);
  assert.equal(isAllL1({ p19Rsp: 2, p20Primary: 1, p20Secondary: 1 }), false);
  assert.equal(isAllL1({ p19Rsp: 1, p20Primary: 1, p20Secondary: 2 }), false);
});

test("isAllL1: false when any applicable level is FAIL (0)", () => {
  assert.equal(isAllL1({ p19Rsp: 1, p20Primary: 0, p20Secondary: 1 }), false);
});

test("isAllL1: false when any applicable level is missing (null)", () => {
  assert.equal(isAllL1({ p19Rsp: null, p20Primary: 1, p20Secondary: 1 }), false);
  assert.equal(isAllL1({ p19Rsp: 1, p20Primary: null, p20Secondary: 1 }), false);
  // Secondary missing on a multi-row design (has secondary seats but unstated)
  assert.equal(isAllL1({ p19Rsp: 1, p20Primary: 1, p20Secondary: null }), false);
});

test("isAllL1: false for empty/missing input", () => {
  assert.equal(isAllL1(null), false);
  assert.equal(isAllL1({}), false);
});

// ── hasMaterialLimitation ───────────────────────────────────────────────

test("hasMaterialLimitation: true when any applicable group is L1", () => {
  assert.equal(hasMaterialLimitation({ p19Rsp: 1, p20Primary: 2, p20Secondary: 2 }), true);
  assert.equal(hasMaterialLimitation({ p19Rsp: 2, p20Primary: 1, p20Secondary: 2 }), true);
  assert.equal(hasMaterialLimitation({ p19Rsp: 2, p20Primary: 2, p20Secondary: 1 }), true);
});

test("hasMaterialLimitation: true when any applicable group is FAIL (0)", () => {
  assert.equal(hasMaterialLimitation({ p19Rsp: 0, p20Primary: 2, p20Secondary: 2 }), true);
  assert.equal(hasMaterialLimitation({ p19Rsp: 2, p20Primary: 0, p20Secondary: 2 }), true);
});

test("hasMaterialLimitation: false when every applicable group is L2 or better", () => {
  assert.equal(hasMaterialLimitation({ p19Rsp: 2, p20Primary: 2, p20Secondary: 2 }), false);
  assert.equal(hasMaterialLimitation({ p19Rsp: 4, p20Primary: 4, p20Secondary: 4 }), false);
});

test("hasMaterialLimitation: false when any applicable level is missing (null)", () => {
  assert.equal(hasMaterialLimitation({ p19Rsp: null, p20Primary: 1, p20Secondary: 1 }), false);
  assert.equal(hasMaterialLimitation({ p19Rsp: 1, p20Primary: null, p20Secondary: 1 }), false);
});

test("hasMaterialLimitation: single-row (Secondary not_applicable) checks P19 + Primary", () => {
  assert.equal(hasMaterialLimitation({ p19Rsp: 1, p20Primary: 2, p20Secondary: "not_applicable" }), true);
  assert.equal(hasMaterialLimitation({ p19Rsp: 2, p20Primary: 2, p20Secondary: "not_applicable" }), false);
});

test("hasMaterialLimitation: false for empty/missing input", () => {
  assert.equal(hasMaterialLimitation(null), false);
  assert.equal(hasMaterialLimitation({}), false);
});

// ── physicalEligibilityReason ──────────────────────────────────────────

test("physicalEligibilityReason: null when a limitation exists (eligible)", () => {
  assert.equal(physicalEligibilityReason({ p19Rsp: 1, p20Primary: 2, p20Secondary: 2 }), null);
});

test("physicalEligibilityReason: no-material-limitation when all L2+", () => {
  assert.equal(physicalEligibilityReason({ p19Rsp: 2, p20Primary: 2, p20Secondary: 2 }), "no-material-limitation");
  assert.equal(physicalEligibilityReason({ p19Rsp: 4, p20Primary: 4, p20Secondary: 4 }), "no-material-limitation");
});

test("physicalEligibilityReason: missing-evidence when a level is null", () => {
  assert.equal(physicalEligibilityReason({ p19Rsp: null, p20Primary: 1, p20Secondary: 1 }), "missing-evidence");
});

// ── Placement / Seating gates ───────────────────────────────────────────

test("isPhysicalPlacementEligible: any L1 group permits placement", () => {
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 })), true);
  // P19 L4 strong, but Secondary P20 L1 poor: placement still eligible.
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 4, p20Primary: 3, p20Secondary: 1 })), true);
  // P19 L1 poor with Primary P20 strong: placement eligible on P19 limitation.
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 1, p20Primary: 4, p20Secondary: 4 })), true);
});

test("isPhysicalPlacementEligible: strong performance across all groups blocks placement", () => {
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 4, p20Primary: 4, p20Secondary: 4 })), false);
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 2, p20Primary: 2, p20Secondary: 2 })), false);
});

test("isPhysicalPlacementEligible: missing P19 blocks placement", () => {
  const r = result({ p19Level: null, p20Primary: 1, p20Secondary: 1 });
  assert.equal(isPhysicalPlacementEligible(r), false);
});

test("isPhysicalPlacementEligible: single-row with P19 L1 eligible", () => {
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 1, p20Primary: 2, p20Secondary: null })), true);
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 2, p20Primary: 2, p20Secondary: null })), false);
});

test("isSeatingEligible: same any-limitation gate on the best available result", () => {
  assert.equal(isSeatingEligible(result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 })), true);
  // Secondary L1 with others strong: seating eligible.
  assert.equal(isSeatingEligible(result({ p19Level: 4, p20Primary: 4, p20Secondary: 1 })), true);
  // All strong: seating not eligible.
  assert.equal(isSeatingEligible(result({ p19Level: 4, p20Primary: 4, p20Secondary: 4 })), false);
});

// ── Electronic completion ───────────────────────────────────────────────

test("electronicCategoryCompleted: completed-shortlist is complete", () => {
  assert.equal(electronicCategoryCompleted({ status: "completed-shortlist", valid: 2 }).complete, true);
});

test("electronicCategoryCompleted: incomplete is not complete", () => {
  assert.equal(electronicCategoryCompleted({ status: "incomplete" }).complete, false);
});

test("electronicCategoryCompleted: error is not complete", () => {
  assert.equal(electronicCategoryCompleted({ status: "completed-shortlist", error: "boom" }).complete, false);
});

test("electronicCategoryCompleted: not_run is not complete", () => {
  assert.equal(electronicCategoryCompleted({ status: "not_run" }).complete, false);
});

test("electronicCategoryCompleted: skipped with grouping is not-applicable (complete)", () => {
  assert.equal(electronicCategoryCompleted({ status: "skipped", grouping: { reason: "no group" } }).complete, true);
});

test("electronicCategoryCompleted: skipped without grouping is not-run (not complete)", () => {
  assert.equal(electronicCategoryCompleted({ status: "skipped" }).complete, false);
});

test("electronicsCompleted: phase+delay+gain complete passes", () => {
  const e = electronicsCompleted({
    phaseDiagnostics: { status: "completed-shortlist", valid: 1 },
    calibrationDiagnostics: { status: "completed-shortlist", valid: 1 },
    gainDiagnostics: { status: "completed-shortlist", valid: 1 },
  });
  assert.equal(e.complete, true);
});

test("electronicsCompleted: one incomplete blocks", () => {
  const e = electronicsCompleted({
    phaseDiagnostics: { status: "completed-shortlist", valid: 1 },
    calibrationDiagnostics: { status: "incomplete" },
    gainDiagnostics: { status: "completed-shortlist", valid: 1 },
  });
  assert.equal(e.complete, false);
  assert.ok(e.reasons.some((r) => r.startsWith("delay:")));
});

// ── Crossover genuine coverage ─────────────────────────────────────────

test("crossoverGenuinelyCompleted: confirmed>0 is complete (screening alone is not)", () => {
  // Screening without canonical confirmation is NOT a genuine evaluation.
  assert.equal(crossoverGenuinelyCompleted({ status: "completed", screened: 5, tested: 2, confirmed: 0 }).complete, false);
  // Confirmed candidates prove a genuine evaluation, with or without a winner.
  assert.equal(crossoverGenuinelyCompleted({ status: "completed", screened: 5, tested: 2, confirmed: 3 }).complete, true);
  assert.equal(crossoverGenuinelyCompleted({ status: "no_safe_improvement", screened: 5, confirmed: 5 }).complete, true);
});

test("crossoverGenuinelyCompleted: no coverage is not complete", () => {
  assert.equal(crossoverGenuinelyCompleted({ screened: 0, tested: 0 }).complete, false);
});

test("crossoverGenuinelyCompleted: skipped with coverage is not-applicable", () => {
  assert.equal(crossoverGenuinelyCompleted({ status: "skipped", screened: 0 }).complete, false);
});

test("crossoverGenuinelyCompleted: error is not complete", () => {
  assert.equal(crossoverGenuinelyCompleted({ error: "boom", screened: 5 }).complete, false);
});

test("electronicsCompleted: crossover diagnostics with no coverage blocks", () => {
  const e = electronicsCompleted({
    phaseDiagnostics: { status: "completed-shortlist", valid: 1 },
    calibrationDiagnostics: { status: "completed-shortlist", valid: 1 },
    gainDiagnostics: { status: "completed-shortlist", valid: 1 },
    crossoverDiagnostics: { screened: 0, tested: 0 },
  });
  assert.equal(e.complete, false);
  assert.ok(e.reasons.some((r) => r.startsWith("crossover:")));
});

// ── Genuine level improvement ──────────────────────────────────────────

test("hasGenuineLevelImprovement: P19 level rise is genuine", () => {
  const base = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  const cand = result({ p19Level: 2, p20Primary: 1, p20Secondary: 1 });
  assert.equal(hasGenuineLevelImprovement(base, cand), true);
});

test("hasGenuineLevelImprovement: P20 Primary level rise is genuine", () => {
  const base = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  const cand = result({ p19Level: 1, p20Primary: 2, p20Secondary: 1 });
  assert.equal(hasGenuineLevelImprovement(base, cand), true);
});

test("hasGenuineLevelImprovement: same levels (dB-only) is NOT genuine", () => {
  const base = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  const cand = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  assert.equal(hasGenuineLevelImprovement(base, cand), false);
});

test("hasGenuineLevelImprovement: FAIL->L1 on secondary is genuine", () => {
  const base = result({ p19Level: 1, p20Primary: 1, p20Secondary: 0 });
  const cand = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  assert.equal(hasGenuineLevelImprovement(base, cand), true);
});

test("hasGenuineLevelImprovement: regression on one metric disqualifies", () => {
  const base = result({ p19Level: 2, p20Primary: 1, p20Secondary: 1 });
  const cand = result({ p19Level: 1, p20Primary: 2, p20Secondary: 1 });
  assert.equal(hasGenuineLevelImprovement(base, cand), false);
});

test("hasGenuineLevelImprovement: missing evidence disqualifies", () => {
  const base = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  const cand = result({ p19Level: null, p20Primary: 2, p20Secondary: 1 });
  assert.equal(hasGenuineLevelImprovement(base, cand), false);
});

// ── Physical recommendation significance ───────────────────────────────

test("isPhysicalCandidate: position candidate is physical", () => {
  assert.equal(isPhysicalCandidate({ isPositionCandidate: true }), true);
  assert.equal(isPhysicalCandidate({ candidateKind: "seating", seatingOffsetMm: 100 }), true);
  assert.equal(isPhysicalCandidate({ candidateOrigin: "coordinated" }), true);
});

test("isPhysicalCandidate: calibration/electronic is NOT physical", () => {
  assert.equal(isPhysicalCandidate({ candidateKind: "calibration" }), false);
  assert.equal(isPhysicalCandidate({ candidateId: "current" }), false);
});

// A grade-consistent physical candidate with full canonical fields so
// isMaterialImprovement can validate it.
function physicalResult({ p19Level, p20Primary, p20Secondary, p14Level = 2, p14Db = 100, id = "pos" } = {}) {
  const perSeatP20 = [];
  if (p20Primary != null) perSeatP20.push(seat("p1", p20Primary, true));
  if (p20Secondary != null) perSeatP20.push(seat("s1", p20Secondary, false));
  const levels = [p20Primary, p20Secondary].filter((l) => l != null);
  return {
    isPositionCandidate: true,
    candidateId: id,
    achievedP19Level: p19Level,
    achievedP19VariationDb: p19Level != null ? rawForLevel(p19Level) : null,
    achievedP20Level: levels.length ? Math.min(...levels) : null,
    achievedP20VariationDb: levels.length ? Math.max(...levels.map(rawForLevel)) : null,
    perSeatP20,
    p14AchievedLevel: p14Level,
    p14AchievedDb: p14Db,
  };
}

test("filterPhysicalForSignificance: removes physical same-level dB-only", () => {
  const baseline = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1, p14Level: 2, p14Db: 100 });
  // Physical candidate: same levels, a 1 dB worst-primary improvement (raw 6->5,
  // both grade to L1). Material by dB but NO level improvement -> filtered out.
  const physicalSameLevel = physicalResult({ p19Level: 1, p20Primary: 1, p20Secondary: 1, id: "pos1" });
  physicalSameLevel.perSeatP20 = [
    { seatId: "p1", isPrimary: true, level: 1, variationDbRaw: 5 },
    { seatId: "s1", isPrimary: false, level: 1, variationDbRaw: 6 },
  ];
  physicalSameLevel.achievedP20VariationDb = 5;
  // Physical candidate: genuine P20 Primary level improvement (L1 -> L2) -> kept.
  const physicalLevelUp = physicalResult({ p19Level: 1, p20Primary: 2, p20Secondary: 1, id: "pos2" });
  // Electronic candidate: always kept.
  const electronic = { candidateKind: "calibration", candidateId: "cal1" };
  const filtered = filterPhysicalForSignificance([physicalSameLevel, physicalLevelUp, electronic], baseline);
  assert.equal(filtered.includes(physicalSameLevel), false);
  assert.equal(filtered.includes(physicalLevelUp), true);
  assert.equal(filtered.includes(electronic), true);
});

test("filterPhysicalForSignificance: P14 regression removes physical", () => {
  const baseline = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1, p14Level: 2, p14Db: 100 });
  const physical = physicalResult({ p19Level: 1, p20Primary: 2, p20Secondary: 1, p14Level: 1, p14Db: 95, id: "pos1" });
  physical.p14NotAchievedReason = "operating-point-not-achieved";
  const filtered = filterPhysicalForSignificance([physical], baseline);
  assert.equal(filtered.includes(physical), false);
});

test("isPhysicalRecommendationAcceptable: electronic-style candidate not filtered", () => {
  // isPhysicalCandidate false -> filter keeps it regardless.
  const baseline = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  const electronic = { candidateKind: "calibration", candidateId: "cal1" };
  const filtered = filterPhysicalForSignificance([electronic], baseline);
  assert.equal(filtered.includes(electronic), true);
});