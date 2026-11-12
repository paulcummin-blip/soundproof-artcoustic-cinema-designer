// non-intrusive-hierarchy-acceptance.test.mjs
// Acceptance tests for the non-intrusive-first Bass ADI hierarchy.
//
// Scenarios 1-9 and 11 are verified at the CODE level (the pure gate module
// that the engine now consults). Scenario 7 (Phase 9B cannot bypass) and 10
// (electronic progress indicators) additionally depend on the engine WIRING,
// which is verified by reading the engine source for the gate calls.
// Scenario 12 (save/reopen) and the actual runtime behaviour of every gate
// require a live engine + worker run in the browser and are marked
// BROWSER-UNVERIFIED below.

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

const ENGINE = "src/components/room/bass/improveBassV2/improveBassV2Engine.js";
const engineSource = fs.readFileSync(ENGINE, "utf8");

// 1 — Electronics raise P19 above L1: no physical search.
test("1: P19 RSP above L1 blocks placement gate", () => {
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 2, p20Primary: 1, p20Secondary: 1 })), false);
});

// 2 — Electronics raise only Primary P20 above L1: no physical search.
test("2: P20 Primary above L1 blocks placement gate", () => {
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 1, p20Primary: 2, p20Secondary: 1 })), false);
});

// 3 — Electronics raise only Secondary P20 above L1: no physical search.
test("3: P20 Secondary above L1 blocks placement gate", () => {
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 1, p20Primary: 1, p20Secondary: 2 })), false);
});

// 4 — All three remain L1: physical subwoofer placement becomes eligible.
test("4: all three L1 permits placement gate", () => {
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 })), true);
});

// 5 — Placement raises any metric above L1: seating search remains closed.
test("5: placement raising any metric above L1 blocks seating gate", () => {
  assert.equal(isSeatingEligible(result({ p19Level: 2, p20Primary: 1, p20Secondary: 1 })), false);
  assert.equal(isSeatingEligible(result({ p19Level: 1, p20Primary: 2, p20Secondary: 1 })), false);
  assert.equal(isSeatingEligible(result({ p19Level: 1, p20Primary: 1, p20Secondary: 2 })), false);
});

// 6 — Electronics and placement leave all three L1: seating search eligible.
test("6: all three still L1 after placement permits seating gate", () => {
  assert.equal(isSeatingEligible(result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 })), true);
});

// 7 — Phase 9B cannot bypass either physical gate (engine wiring).
test("7: engine wires Phase 9B coordinated search behind the seating gate", () => {
  assert.ok(engineSource.includes("seatingGate && existingAuthority"),
    "Phase 9B coordinatedEligible requires seatingGate");
  assert.ok(engineSource.includes("if (!placementGate) break;"),
    "Stage 11B escalation breaks when placement gate closed");
  assert.ok(engineSource.includes("hierarchy_gate_closed"),
    "Phase 9B records hierarchy-gate-closed skip reason");
});

// 8 — Missing/invalid Level does not trigger escalation.
test("8: missing or invalid levels block both gates", () => {
  // Missing P19 RSP level.
  assert.equal(isPhysicalPlacementEligible(result({ p19Level: null, p20Primary: 1, p20Secondary: 1 })), false);
  // Missing P20 Primary level on an existing primary seat.
  const missingPrimary = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  missingPrimary.perSeatP20[0] = { seatId: "p1", isPrimary: true, level: null, variationDbRaw: 6 };
  assert.equal(isPhysicalPlacementEligible(missingPrimary), false);
  // Missing P20 Secondary level on an existing secondary seat (multi-row).
  const missingSecondary = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1 });
  missingSecondary.perSeatP20[1] = { seatId: "s1", isPrimary: false, level: null, variationDbRaw: 6 };
  assert.equal(isSeatingEligible(missingSecondary), false);
});

// 9 — Same-Level dB improvement cannot justify physical movement.
test("9: same-level dB-only physical candidate is not recommendable", () => {
  const baseline = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1, p14Level: 2, p14Db: 100 });
  const same = physicalResult({ p19Level: 1, p20Primary: 1, p20Secondary: 1, id: "posSame" });
  // 1 dB worst-primary improvement, same levels (both L1).
  same.perSeatP20 = [
    { seatId: "p1", isPrimary: true, level: 1, variationDbRaw: 5 },
    { seatId: "s1", isPrimary: false, level: 1, variationDbRaw: 6 },
  ];
  same.achievedP20VariationDb = 5;
  assert.equal(isPhysicalRecommendationAcceptable(baseline, same), false);
  const filtered = filterPhysicalForSignificance([same], baseline);
  assert.equal(filtered.includes(same), false);
});

// 10 — Each electronic progress indicator reflects actual run evidence.
test("10: electronicsCompleted reflects genuine diagnostic evidence", () => {
  const done = { status: "completed-shortlist", valid: 1 };
  assert.equal(electronicsCompleted({ phaseDiagnostics: done, calibrationDiagnostics: done, gainDiagnostics: done }).complete, true);
  const incomplete = electronicsCompleted({
    phaseDiagnostics: { status: "incomplete" }, calibrationDiagnostics: done, gainDiagnostics: done,
  });
  assert.equal(incomplete.complete, false);
  assert.ok(incomplete.reasons.some((r) => r.startsWith("phase:")));
  // Crossover: combined-stage completion alone is not proof of crossover.
  const noCrossover = electronicsCompleted({
    phaseDiagnostics: done, calibrationDiagnostics: done, gainDiagnostics: done,
    crossoverDiagnostics: { screened: 0, tested: 0 },
  });
  assert.equal(noCrossover.complete, false);
  assert.ok(noCrossover.reasons.some((r) => r.startsWith("crossover:")));
});

// 11 — Canonical results, P14 capability and physical validation unchanged.
test("11: gate is pure — does not mutate results or thresholds", () => {
  const baseline = result({ p19Level: 1, p20Primary: 1, p20Secondary: 1, p14Level: 2, p14Db: 100 });
  const snapshot = JSON.parse(JSON.stringify(baseline));
  readEscalationLevels(baseline);
  isPhysicalPlacementEligible(baseline);
  isPhysicalRecommendationAcceptable(baseline, baseline);
  assert.deepEqual(baseline, snapshot, "gate functions must not mutate their inputs");
});

// 12 — Save/reopen preserves correctly identified optimisation evidence.
// BROWSER-UNVERIFIED: requires a live engine + worker run and a saved plan
// reopened from persistence. The hierarchy diagnostics are attached to the
// selection (selection.hierarchyGateDiagnostics) so they travel with the
// saved plan; verifying they survive a real save/reopen needs the browser.
test("12: engine attaches hierarchyGateDiagnostics to the selection (code-level wiring)", () => {
  assert.ok(engineSource.includes("selection.hierarchyGateDiagnostics=hierarchyGateDiagnostics"),
    "hierarchy diagnostics are attached to the selection for save/reopen");
});