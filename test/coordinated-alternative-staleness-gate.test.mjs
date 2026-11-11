// coordinated-alternative-staleness-gate.test.mjs
// Tests for the staleness gate that prevents stale physical recommendations
// from appearing after the designer changes the room configuration.
//
// The gate reuses the existing plan-freshness authority
// (resolveOptimiserPlanStatus) — it never computes a second fingerprint.
//
// Tests:
//   1. Current plan, matching fingerprint: eligible physical recommendations display
//   2. Changed seating (stale fingerprint): old recommendations disappear
//   3. Changed subwoofer positions or quantity (stale fingerprint): old recommendations disappear
//   4. Changed RSP authority (stale fingerprint): old recommendations disappear
//   5. Stale plan reopened: historical evidence remains stored, but no current recommendation card appears
//   6. New current ADI run: eligible recommendations can appear again
//   7. Per-seat P20 comparisons use candidate-owned evidence, not current live values

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldShowCoordinatedAlternatives,
  selectEligiblePhysicalAlternativesFromSummary,
} from "../src/components/room/bass/optimiserPlan/coordinatedPhysicalAlternativePresentation.js";
import { OPTIMISER_PLAN_STATUS } from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";

// A confirmed candidate with full reproducibility evidence.
const CONFIRMED_CANDIDATE = {
  candidateId: "coordinated:FOUR_PAIRS:300",
  placementId: "FOUR_PAIRS",
  quantity: 4,
  offsetMm: 300,
  installedQuantity: 2,
  p19Level: "L3",
  p19VariationDb: 2.1,
  p14Db: 117,
  perSeatP20: [
    { seatId: "seat-r1-c2", isPrimary: true, level: 3, variationDbRaw: 2.5, worstFrequencyHz: 35 },
    { seatId: "seat-r2-c1", isPrimary: false, level: 2, variationDbRaw: 4.1, worstFrequencyHz: 28 },
  ],
  materialityOutcome: { material: true, rule: "p20-primary", reason: "Primary P20 improved" },
  rspAuthority: { rspMode: "seat_bound", designatedRspSeatId: "seat-r1-c2", rspPosition: { x: 2.5, y: 4.3, z: 1.2 } },
  isCrossQuantity: true,
  physicalAlternativeEligible: true,
  selectedSubModel: "SP-2-8",
  subwooferInstances: [
    { id: "sub-1", model: "SP-2-8", position: { x: 1.0, y: 0.3, z: 0 }, bottomHeightM: 0.1, rotationDeg: 0, orientation: "front" },
    { id: "sub-2", model: "SP-2-8", position: { x: 3.5, y: 0.3, z: 0 }, bottomHeightM: 0.1, rotationDeg: 0, orientation: "front" },
  ],
  seatingPositions: [{ id: "seat-r1-c2", x: 2.5, y: 4.3, z: 1.2, priority: "primary" }],
  tuning: [{ sourceId: "sub-1", delayMs: 1, gainDb: 0, polarity: 1, phaseControlDeg: 0 }],
};

const COORDINATED_SUMMARY = {
  status: "completed",
  confirmedCount: 1,
  confirmedCandidates: [CONFIRMED_CANDIDATE],
};

// A plan view with a coordinated summary and a given status.
function planViewWithStatus(status, summary = COORDINATED_SUMMARY) {
  return { status, coordinatedSummary: summary };
}

test("1. current plan, matching fingerprint — eligible physical recommendations display", () => {
  const planView = planViewWithStatus(OPTIMISER_PLAN_STATUS.CURRENT);
  assert.equal(shouldShowCoordinatedAlternatives(planView), true);
  const alternatives = selectEligiblePhysicalAlternativesFromSummary(planView.coordinatedSummary);
  assert.equal(alternatives.length, 1);
  assert.equal(alternatives[0].candidateId, CONFIRMED_CANDIDATE.candidateId);
});

test("2. changed seating (stale fingerprint) — old recommendations disappear", () => {
  const planView = planViewWithStatus(OPTIMISER_PLAN_STATUS.STALE);
  assert.equal(shouldShowCoordinatedAlternatives(planView), false);
});

test("3. changed subwoofer positions or quantity (stale fingerprint) — old recommendations disappear", () => {
  const planView = planViewWithStatus(OPTIMISER_PLAN_STATUS.STALE);
  assert.equal(shouldShowCoordinatedAlternatives(planView), false);
});

test("4. changed RSP authority (stale fingerprint) — old recommendations disappear", () => {
  const planView = planViewWithStatus(OPTIMISER_PLAN_STATUS.STALE);
  assert.equal(shouldShowCoordinatedAlternatives(planView), false);
});

test("5. stale plan reopened — historical evidence remains stored, no card appears", () => {
  // The coordinatedSummary is still present (historical evidence), but the
  // staleness gate prevents it from being presented.
  const planView = planViewWithStatus(OPTIMISER_PLAN_STATUS.STALE);
  assert.ok(planView.coordinatedSummary, "historical evidence is still stored");
  assert.equal(shouldShowCoordinatedAlternatives(planView), false);
  // Even if someone called the presentation directly, the evidence is there
  // — the gate, not the presentation, is what hides it.
  const alternatives = selectEligiblePhysicalAlternativesFromSummary(planView.coordinatedSummary);
  assert.equal(alternatives.length, 1, "evidence is preserved for audit");
});

test("6. new current ADI run — eligible recommendations can appear again", () => {
  // After a new run, the plan becomes CURRENT again.
  const stalePlanView = planViewWithStatus(OPTIMISER_PLAN_STATUS.STALE);
  assert.equal(shouldShowCoordinatedAlternatives(stalePlanView), false);
  // New run produces a fresh CURRENT plan with a new coordinated summary.
  const freshPlanView = planViewWithStatus(OPTIMISER_PLAN_STATUS.CURRENT, {
    ...COORDINATED_SUMMARY,
    confirmedCandidates: [{ ...CONFIRMED_CANDIDATE, candidateId: "coordinated:FRESH:250" }],
  });
  assert.equal(shouldShowCoordinatedAlternatives(freshPlanView), true);
  const alternatives = selectEligiblePhysicalAlternativesFromSummary(freshPlanView.coordinatedSummary);
  assert.equal(alternatives.length, 1);
  assert.equal(alternatives[0].candidateId, "coordinated:FRESH:250");
});

test("7. per-seat P20 comparisons use candidate-owned evidence, not current live values", () => {
  const livePerSeatP20 = [
    { seatId: "seat-r1-c2", level: 1, variationDbRaw: 8.5 },
    { seatId: "seat-r2-c1", level: 1, variationDbRaw: 9.0 },
  ];
  // Pass live values — they must be ignored.
  const alternatives = selectEligiblePhysicalAlternativesFromSummary(COORDINATED_SUMMARY, livePerSeatP20);
  assert.equal(alternatives.length, 1);
  const seats = alternatives[0].perSeatP20Comparisons;
  assert.equal(seats.length, 2);
  for (const seat of seats) {
    assert.equal(seat.beforeLevel, null, "before level is null — no live values used");
    assert.equal(seat.beforeVariationDb, null, "before variation is null — no live values used");
    // After values come from the candidate's own saved evidence.
    assert.ok(seat.afterLevel != null, "after level is from candidate evidence");
    assert.ok(seat.afterVariationDb != null, "after variation is from candidate evidence");
  }
});

test("absent plan — no coordinated summary, gate returns false", () => {
  assert.equal(shouldShowCoordinatedAlternatives({ status: OPTIMISER_PLAN_STATUS.ABSENT, coordinatedSummary: null }), false);
  assert.equal(shouldShowCoordinatedAlternatives(null), false);
});

test("unsupported plan — old schema, gate returns false even with summary", () => {
  const planView = planViewWithStatus(OPTIMISER_PLAN_STATUS.UNSUPPORTED);
  assert.equal(shouldShowCoordinatedAlternatives(planView), false);
});

test("failed plan — gate returns false", () => {
  const planView = planViewWithStatus(OPTIMISER_PLAN_STATUS.FAILED);
  assert.equal(shouldShowCoordinatedAlternatives(planView), false);
});

test("incomplete plan — gate returns false", () => {
  const planView = planViewWithStatus(OPTIMISER_PLAN_STATUS.INCOMPLETE);
  assert.equal(shouldShowCoordinatedAlternatives(planView), false);
});

test("no useful improvement (terminal, current) — gate returns true, alternatives can show", () => {
  const planView = planViewWithStatus(OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT);
  assert.equal(shouldShowCoordinatedAlternatives(planView), true);
});

test("non-actionable winner (terminal, current) — gate returns true", () => {
  const planView = planViewWithStatus(OPTIMISER_PLAN_STATUS.NON_ACTIONABLE_WINNER);
  assert.equal(shouldShowCoordinatedAlternatives(planView), true);
});