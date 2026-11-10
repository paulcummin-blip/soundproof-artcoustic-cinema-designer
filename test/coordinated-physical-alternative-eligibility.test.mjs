// coordinated-physical-alternative-eligibility.test.mjs
// Tests for the physical-alternative presentation authority.
//
// Tests:
//   1. A candidate with status "material" is eligible
//   2. A candidate with status "safety-rejected" is NOT eligible
//   3. A candidate with status "below-materiality" is NOT eligible
//   4. A candidate with status "protected-seat-trade-off" is NOT eligible
//   5. A candidate with status "trade-off" is NOT eligible
//   6. buildPhysicalAlternativePresentation returns full data for an eligible candidate
//   7. buildPhysicalAlternativePresentation returns null for an ineligible candidate
//   8. selectEligiblePhysicalAlternatives filters from a coordinated summary
//   9. Remaining compromises are reported accurately for a candidate with poor Secondary P20

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPhysicalAlternativeEligible,
  buildPhysicalAlternativePresentation,
  selectEligiblePhysicalAlternatives,
} from "../src/components/room/bass/optimiserPlan/coordinatedPhysicalAlternativePresentation.js";

const CONFIRMED = {
  candidateId: "coordinated:FOUR_THIRD_PAIRS:0.19_0|0.81_0|0.19_1|0.81_1:-600",
  placementId: "FOUR_THIRD_PAIRS:0.19_0|0.81_0|0.19_1|0.81_1",
  quantity: 4,
  offsetMm: -600,
  installedQuantity: 2,
  p14Db: 124.056,
  p19Level: 4,
  p19VariationDb: 2.066,
  perSeatP20: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 3, variationDbRaw: 3.883, worstFrequencyHz: 55 },
    { seatId: "seat-r1-c2", isPrimary: true, level: 2, variationDbRaw: 4.638, worstFrequencyHz: 62 },
    { seatId: "seat-r1-c3", isPrimary: true, level: 3, variationDbRaw: 3.883, worstFrequencyHz: 55 },
    { seatId: "seat-r2-c1", isPrimary: false, level: 1, variationDbRaw: 10.058, worstFrequencyHz: 48 },
    { seatId: "seat-r2-c2", isPrimary: false, level: 1, variationDbRaw: 10.178, worstFrequencyHz: 48 },
    { seatId: "seat-r2-c3", isPrimary: false, level: 1, variationDbRaw: 10.058, worstFrequencyHz: 48 },
  ],
  isCrossQuantity: true,
  rspAuthority: {
    rspMode: "seat_bound",
    designatedRspSeatId: "seat-r1-c2",
    rspPosition: { x: 1.75, y: 4.0, z: 1.2 },
    evaluatedRspPosition: { x: 1.75, y: 3.4, z: 1.2 },
  },
};

const CURRENT_RESULT = {
  perSeatP20: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 1, variationDbRaw: 8.5 },
    { seatId: "seat-r1-c2", isPrimary: true, level: 2, variationDbRaw: 4.644 },
    { seatId: "seat-r1-c3", isPrimary: true, level: 1, variationDbRaw: 8.5 },
    { seatId: "seat-r2-c1", isPrimary: false, level: 1, variationDbRaw: 10.911 },
    { seatId: "seat-r2-c2", isPrimary: false, level: 1, variationDbRaw: 10.911 },
    { seatId: "seat-r2-c3", isPrimary: false, level: 1, variationDbRaw: 10.911 },
  ],
};

test("status material — eligible", () => {
  assert.equal(isPhysicalAlternativeEligible({ status: "material" }), true);
});

test("status safety-rejected — NOT eligible", () => {
  assert.equal(isPhysicalAlternativeEligible({ status: "safety-rejected" }), false);
});

test("status below-materiality — NOT eligible", () => {
  assert.equal(isPhysicalAlternativeEligible({ status: "below-materiality" }), false);
});

test("status protected-seat-trade-off — NOT eligible", () => {
  assert.equal(isPhysicalAlternativeEligible({ status: "protected-seat-trade-off" }), false);
});

test("status trade-off — NOT eligible", () => {
  assert.equal(isPhysicalAlternativeEligible({ status: "trade-off" }), false);
});

test("buildPhysicalAlternativePresentation — full data for eligible candidate", () => {
  const evaluation = {
    candidateId: CONFIRMED.candidateId,
    status: "material",
    materiality: { material: true, rule: "seat-level-improved", reason: "Level improvement: seat-r1-c1 P20 L1 -> L3" },
  };
  const presentation = buildPhysicalAlternativePresentation(CONFIRMED, evaluation, CURRENT_RESULT);
  assert.ok(presentation);
  assert.equal(presentation.candidateId, CONFIRMED.candidateId);
  assert.equal(presentation.quantity, 4);
  assert.equal(presentation.offsetMm, -600);
  assert.equal(presentation.p14.achievedDb, 124.056);
  assert.equal(presentation.p19.level, 4);
  assert.equal(presentation.p19.variationDb, 2.066);
  assert.equal(presentation.rspAuthority.rspMode, "seat_bound");
  assert.equal(presentation.rspAuthority.evaluatedRspPosition.y, 3.4);
  assert.equal(presentation.installationComplexity.quantityChange, 2);
  assert.equal(presentation.installationComplexity.seatingOffsetMm, -600);
  assert.equal(presentation.installationComplexity.isCrossQuantity, true);
  assert.equal(presentation.materialImprovement, "Level improvement: seat-r1-c1 P20 L1 -> L3");
  assert.equal(presentation.displayed, false);
});

test("buildPhysicalAlternativePresentation — null for ineligible candidate", () => {
  const evaluation = {
    candidateId: CONFIRMED.candidateId,
    status: "safety-rejected",
  };
  const presentation = buildPhysicalAlternativePresentation(CONFIRMED, evaluation, CURRENT_RESULT);
  assert.equal(presentation, null);
});

test("remaining compromises reported accurately for poor Secondary P20", () => {
  const evaluation = {
    candidateId: CONFIRMED.candidateId,
    status: "material",
    materiality: { material: true, rule: "seat-level-improved", reason: "Primary P20 improved" },
  };
  const presentation = buildPhysicalAlternativePresentation(CONFIRMED, evaluation, CURRENT_RESULT);
  assert.ok(presentation);
  // Secondary seats are all L1 — they should be in remaining compromises
  const secondaryCompromises = presentation.remainingCompromises.filter((c) => !c.isPrimary);
  assert.equal(secondaryCompromises.length, 3);
  for (const c of secondaryCompromises) {
    assert.equal(c.level, 1);
  }
  // Primary seats L2 and L3 — L2 is still "poor" (<= 2)
  const primaryCompromises = presentation.remainingCompromises.filter((c) => c.isPrimary);
  assert.equal(primaryCompromises.length, 1); // seat-r1-c2 is L2
  assert.equal(primaryCompromises[0].seatId, "seat-r1-c2");
});

test("selectEligiblePhysicalAlternatives — filters from coordinated summary", () => {
  const coordinatedSummary = {
    confirmedCandidates: [
      CONFIRMED,
      { ...CONFIRMED, candidateId: "coordinated:OTHER:0" },
    ],
  };
  const evaluations = [
    { candidateId: CONFIRMED.candidateId, status: "material", materiality: { material: true, reason: "Improved" } },
    { candidateId: "coordinated:OTHER:0", status: "below-materiality", materiality: { material: false } },
  ];
  const presentations = selectEligiblePhysicalAlternatives(coordinatedSummary, evaluations, CURRENT_RESULT);
  assert.equal(presentations.length, 1);
  assert.equal(presentations[0].candidateId, CONFIRMED.candidateId);
});

test("selectEligiblePhysicalAlternatives — empty for no eligible candidates", () => {
  const coordinatedSummary = {
    confirmedCandidates: [CONFIRMED],
  };
  const evaluations = [
    { candidateId: CONFIRMED.candidateId, status: "safety-rejected" },
  ];
  const presentations = selectEligiblePhysicalAlternatives(coordinatedSummary, evaluations, CURRENT_RESULT);
  assert.equal(presentations.length, 0);
});

test("per-seat P20 comparisons include before/after", () => {
  const evaluation = {
    candidateId: CONFIRMED.candidateId,
    status: "material",
    materiality: { material: true, reason: "Improved" },
  };
  const presentation = buildPhysicalAlternativePresentation(CONFIRMED, evaluation, CURRENT_RESULT);
  assert.ok(presentation);
  const seatR1C1 = presentation.perSeatP20Comparisons.find((s) => s.seatId === "seat-r1-c1");
  assert.equal(seatR1C1.beforeLevel, 1);
  assert.equal(seatR1C1.afterLevel, 3);
  assert.equal(seatR1C1.isPrimary, true);
});