// coordinated-diagnostics-enrichment.test.mjs
// Tests that selection evaluation outcomes are enriched into the coordinated
// diagnostics and survive serialization + hydration.

import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichCoordinatedDiagnosticsWithEvaluations } from "../src/components/room/bass/improveBassV2/coordinatedDiagnosticsEnrichment.js";
import { buildCoordinatedSummary } from "../src/components/room/bass/optimiserPlan/coordinatedSummary.js";
import { serializeOptimiserPlan } from "../src/components/room/bass/optimiserPlan/optimiserPlanPersistence.js";

const CONFIRMED_CANDIDATE = {
  candidateId: "coordinated:FOUR_THIRD_PAIRS:0.19_0|0.81_0|0.19_1|0.81_1:-600",
  placementId: "FOUR_THIRD_PAIRS:0.19_0|0.81_0|0.19_1|0.81_1",
  quantity: 4,
  offsetMm: -600,
  p19Level: 4,
  p19VariationDb: 2.066,
  p20Level: 2,
  p20VariationDb: 4.638,
  p14Db: 124.056,
  p18Hz: 20.174,
  responseBasis: "sub-only",
  crossover: null,
  crossoverSearched: false,
  tuning: [],
  receipt: { selectedCandidateId: "coordinated:FOUR_THIRD_PAIRS:0.19_0|0.81_0|0.19_1|0.81_1:-600" },
  perSeatP20: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 3, variationDbRaw: 3.883, worstFrequencyHz: 55 },
    { seatId: "seat-r1-c2", isPrimary: true, level: 2, variationDbRaw: 4.638, worstFrequencyHz: 62 },
  ],
  isCrossQuantity: true,
  rspAuthority: {
    rspMode: "seat_bound",
    designatedRspSeatId: "seat-r1-c2",
    rspPosition: { x: 1.75, y: 4.0, z: 1.2 },
    evaluatedRspPosition: { x: 1.75, y: 3.4, z: 1.2 },
  },
  installedQuantity: 2,
};

const DIAGNOSTICS = {
  status: "completed",
  eligible: true,
  skipReason: null,
  startedAt: "2026-11-10T15:14:02.819Z",
  elapsedMs: 5000,
  error: null,
  gateInputs: {
    hasExistingAuthority: true,
    hasCurrentFinalist: true,
    hasEffectiveBaseline: true,
    hasCurrentTransfer: true,
  },
  rspAuthority: {
    valid: true,
    rspMode: "seat_bound",
    designatedRspSeatId: "seat-r1-c2",
    issues: [],
  },
  installedQuantity: 2,
  quantityCoverage: { 4: 1 },
  missingQuantities: [1, 2],
  quantityAvailableCounts: { 4: 3 },
  quantityEligibleCounts: { 4: 1 },
  quantityRetainedCounts: { 4: 1 },
  placementsExcludedByCap: [],
  seatingOffsetsConsidered: 7,
  seatingStatesRetained: [-600, -300, 0, 300, 600],
  placementsGenerated: 10,
  placementsRetained: [{ id: "FOUR_THIRD_PAIRS", phase: "cross-quantity", quantity: 4, coordinates: [] }],
  combosEvaluated: 5,
  proxyScreened: [],
  survivors: [],
  confirmed: [CONFIRMED_CANDIDATE],
  rejected: [],
};

test("enrichCoordinatedDiagnosticsWithEvaluations — material candidate gets full outcomes", () => {
  const diagnostics = { ...DIAGNOSTICS, confirmed: [{ ...CONFIRMED_CANDIDATE }] };
  const evaluations = [
    {
      candidateId: CONFIRMED_CANDIDATE.candidateId,
      status: "material",
      materiality: { material: true, rule: "seat-level-improved", reason: "Level improvement" },
      protectedSafety: { safe: true },
    },
  ];
  const enriched = enrichCoordinatedDiagnosticsWithEvaluations(diagnostics, evaluations);
  const confirmed = enriched.confirmed[0];

  assert.equal(confirmed.validationOutcome.status, "material");
  assert.equal(confirmed.validationOutcome.valid, true);
  assert.deepEqual(confirmed.validationOutcome.issues, []);
  assert.equal(confirmed.protectedPrimarySafety.safe, true);
  assert.equal(confirmed.materialityOutcome.material, true);
  assert.equal(confirmed.materialityOutcome.rule, "seat-level-improved");
  assert.equal(confirmed.physicalAlternativeEligible, true);
  assert.equal(confirmed.physicalAlternativeDisplayed, false);
});

test("enrichCoordinatedDiagnosticsWithEvaluations — safety-rejected candidate NOT eligible", () => {
  const diagnostics = { ...DIAGNOSTICS, confirmed: [{ ...CONFIRMED_CANDIDATE }] };
  const evaluations = [
    {
      candidateId: CONFIRMED_CANDIDATE.candidateId,
      status: "safety-rejected",
      issues: ["Output did not pass"],
    },
  ];
  const enriched = enrichCoordinatedDiagnosticsWithEvaluations(diagnostics, evaluations);
  const confirmed = enriched.confirmed[0];

  // A safety-rejected candidate DID pass validation — it failed the safety
  // check. So validationOutcome.valid is true, but physicalAlternativeEligible
  // is false because the safety check did not pass.
  assert.equal(confirmed.validationOutcome.status, "safety-rejected");
  assert.equal(confirmed.validationOutcome.valid, true);
  assert.equal(confirmed.physicalAlternativeEligible, false);
});

test("enrichCoordinatedDiagnosticsWithEvaluations — below-materiality candidate NOT eligible", () => {
  const diagnostics = { ...DIAGNOSTICS, confirmed: [{ ...CONFIRMED_CANDIDATE }] };
  const evaluations = [
    {
      candidateId: CONFIRMED_CANDIDATE.candidateId,
      status: "below-materiality",
      materiality: { material: false, rule: "seat-level-not-cleared", reason: "No material improvement" },
    },
  ];
  const enriched = enrichCoordinatedDiagnosticsWithEvaluations(diagnostics, evaluations);
  const confirmed = enriched.confirmed[0];

  assert.equal(confirmed.physicalAlternativeEligible, false);
  assert.equal(confirmed.materialityOutcome.material, false);
});

test("enrichCoordinatedDiagnosticsWithEvaluations — missing evaluation is not-evaluated", () => {
  const diagnostics = { ...DIAGNOSTICS, confirmed: [{ ...CONFIRMED_CANDIDATE }] };
  const evaluations = [];
  const enriched = enrichCoordinatedDiagnosticsWithEvaluations(diagnostics, evaluations);
  const confirmed = enriched.confirmed[0];

  assert.equal(confirmed.validationOutcome.status, "not-evaluated");
  assert.equal(confirmed.validationOutcome.valid, false);
  assert.equal(confirmed.physicalAlternativeEligible, false);
});

test("enriched outcomes survive buildCoordinatedSummary + serializeOptimiserPlan + hydrate", () => {
  const diagnostics = { ...DIAGNOSTICS, confirmed: [{ ...CONFIRMED_CANDIDATE }] };
  const evaluations = [
    {
      candidateId: CONFIRMED_CANDIDATE.candidateId,
      status: "material",
      materiality: { material: true, rule: "seat-level-improved", reason: "Level improvement" },
      protectedSafety: { safe: true, regressedSeatId: null, parameter: null, reason: null },
    },
  ];
  enrichCoordinatedDiagnosticsWithEvaluations(diagnostics, evaluations);

  // Build the compact summary
  const summary = buildCoordinatedSummary(diagnostics);
  assert.ok(summary);
  const summaryConfirmed = summary.confirmedCandidates[0];
  assert.equal(summaryConfirmed.physicalAlternativeEligible, true);
  assert.equal(summaryConfirmed.validationOutcome.status, "material");
  assert.equal(summaryConfirmed.protectedPrimarySafety.safe, true);
  assert.equal(summaryConfirmed.materialityOutcome.material, true);
  assert.equal(summaryConfirmed.rspAuthority.rspMode, "seat_bound");
  assert.equal(summaryConfirmed.rspAuthority.evaluatedRspPosition.y, 3.4);
  assert.equal(summaryConfirmed.installedQuantity, 2);

  // Serialize + hydrate (simulate plan save + reopen)
  const plan = { coordinatedSummary: summary };
  const serialized = serializeOptimiserPlan(plan);
  assert.ok(serialized.coordinatedSummary);
  const restoredConfirmed = serialized.coordinatedSummary.confirmedCandidates[0];
  assert.equal(restoredConfirmed.physicalAlternativeEligible, true);
  assert.equal(restoredConfirmed.validationOutcome.status, "material");
  assert.equal(restoredConfirmed.protectedPrimarySafety.safe, true);
  assert.equal(restoredConfirmed.materialityOutcome.material, true);
  assert.equal(restoredConfirmed.rspAuthority.rspMode, "seat_bound");
  assert.equal(restoredConfirmed.rspAuthority.evaluatedRspPosition.y, 3.4);
  assert.equal(restoredConfirmed.installedQuantity, 2);
});

test("RSP authority validation outcome persisted in summary", () => {
  const diagnostics = { ...DIAGNOSTICS };
  const summary = buildCoordinatedSummary(diagnostics);
  assert.ok(summary.rspAuthority);
  assert.equal(summary.rspAuthority.valid, true);
  assert.equal(summary.rspAuthority.rspMode, "seat_bound");
  assert.equal(summary.rspAuthority.designatedRspSeatId, "seat-r1-c2");
});