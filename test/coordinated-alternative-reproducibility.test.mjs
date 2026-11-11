// coordinated-alternative-reproducibility.test.mjs
// P0-2 regression: a designer can recreate the evaluated coordinated
// alternative from its saved advice.
//
// Tests that:
//   1. The coordinated search records the exact evaluated configuration
//      (subwoofer model, XYZ coordinates, height, rotation, orientation;
//      moved seating positions; RSP; tuning) on every confirmed candidate.
//   2. The coordinated summary persists those fields.
//   3. The presentation module includes them and suppresses cards whose
//      evidence is incomplete (not reproducible).
//
// No acoustic physics, RP22 thresholds, search budgets, candidate generation
// or V2 ranking are changed.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildCoordinatedSummary } from "../src/components/room/bass/optimiserPlan/coordinatedSummary.js";
import {
  selectEligiblePhysicalAlternativesFromSummary,
} from "../src/components/room/bass/optimiserPlan/coordinatedPhysicalAlternativePresentation.js";

function makeConfirmedEntry(overrides = {}) {
  return {
    candidateId: "coordinated:placement-1:300",
    placementId: "placement-1",
    quantity: 4,
    offsetMm: 300,
    p19Level: "L3",
    p19VariationDb: 2.1,
    p20Level: 3,
    p20VariationDb: 1.8,
    p14Db: 117,
    p18Hz: 22,
    responseBasis: null,
    crossover: { low: 80, high: 120 },
    crossoverSearched: false,
    tuning: [
      { sourceId: "sub-1", delayMs: 1.2, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
      { sourceId: "sub-2", delayMs: 0.8, gainDb: -1, polarity: -1, phaseControlDeg: 90 },
    ],
    receipt: { selectedCandidateId: "placement-1" },
    perSeatP20: [
      { seatId: "s1", isPrimary: true, level: 3, variationDbRaw: 1.8, worstFrequencyHz: 35 },
      { seatId: "s2", isPrimary: false, level: 2, variationDbRaw: 4.2, worstFrequencyHz: 42 },
    ],
    isCrossQuantity: false,
    rspAuthority: {
      rspMode: "seat_bound",
      designatedRspSeatId: "s1",
      rspPosition: { x: 2.5, y: 4.0, z: 1.2 },
      evaluatedRspPosition: { x: 2.5, y: 4.3, z: 1.2 },
    },
    installedQuantity: 2,
    validationOutcome: { status: "material", valid: true, issues: [] },
    protectedPrimarySafety: { safe: true },
    materialityOutcome: { material: true, rule: "level-gain", reason: "Material improvement" },
    physicalAlternativeEligible: true,
    physicalAlternativeDisplayed: false,
    selectedSubModel: "SP-2-8",
    subwooferInstances: [
      {
        id: "sub-1",
        model: "SP-2-8",
        position: { x: 1.0, y: 0.3, z: 0 },
        bottomHeightM: 0.1,
        rotationDeg: 0,
        orientation: "front",
      },
      {
        id: "sub-2",
        model: "SP-2-8",
        position: { x: 3.5, y: 0.3, z: 0 },
        bottomHeightM: 0.1,
        rotationDeg: 0,
        orientation: "front",
      },
    ],
    seatingPositions: [
      { id: "s1", x: 2.5, y: 4.3, z: 1.2, priority: "primary", rowNumber: 1 },
      { id: "s2", x: 1.5, y: 4.3, z: 1.2, priority: "secondary", rowNumber: 1 },
    ],
    frontOrientation: "front",
    rearOrientation: null,
    ...overrides,
  };
}

describe("P0-2: coordinated summary persists reproducibility fields", () => {
  it("persists subwoofer model, instances, seating, orientation and tuning", () => {
    const diagnostics = { confirmed: [makeConfirmedEntry()], status: "completed" };
    const summary = buildCoordinatedSummary(diagnostics);
    assert.ok(summary, "summary built");
    const c = summary.confirmedCandidates[0];
    assert.equal(c.selectedSubModel, "SP-2-8");
    assert.equal(c.subwooferInstances.length, 2);
    assert.equal(c.subwooferInstances[0].position.x, 1.0);
    assert.equal(c.seatingPositions.length, 2);
    assert.equal(c.seatingPositions[0].y, 4.3);
    assert.equal(c.frontOrientation, "front");
    assert.ok(Array.isArray(c.tuning) && c.tuning.length === 2);
  });

  it("persists the RSP authority with the evaluated position", () => {
    const diagnostics = { confirmed: [makeConfirmedEntry()], status: "completed" };
    const summary = buildCoordinatedSummary(diagnostics);
    const c = summary.confirmedCandidates[0];
    assert.equal(c.rspAuthority.rspMode, "seat_bound");
    assert.equal(c.rspAuthority.evaluatedRspPosition.y, 4.3);
  });
});

describe("P0-2: presentation includes the reproducible configuration", () => {
  it("includes subwoofer model, positions, seating and tuning in the presentation", () => {
    const diagnostics = { confirmed: [makeConfirmedEntry()], status: "completed" };
    const summary = buildCoordinatedSummary(diagnostics);
    const [alt] = selectEligiblePhysicalAlternativesFromSummary(summary, []);
    assert.ok(alt, "alternative presented");
    assert.equal(alt.selectedSubModel, "SP-2-8");
    assert.equal(alt.subwooferInstances.length, 2);
    assert.equal(alt.subwooferInstances[0].position.x, 1.0);
    assert.equal(alt.seatingPositions.length, 2);
    assert.equal(alt.tuning.length, 2);
    assert.equal(alt.crossover.low, 80);
  });
});

describe("P0-2: non-reproducible alternatives are suppressed", () => {
  it("suppresses a card with no subwoofer positions", () => {
    const entry = makeConfirmedEntry({ subwooferInstances: [] });
    const summary = buildCoordinatedSummary({ confirmed: [entry], status: "completed" });
    const alternatives = selectEligiblePhysicalAlternativesFromSummary(summary, []);
    assert.equal(alternatives.length, 0, "card without sub positions suppressed");
  });

  it("suppresses a card with no seating positions", () => {
    const entry = makeConfirmedEntry({ seatingPositions: [] });
    const summary = buildCoordinatedSummary({ confirmed: [entry], status: "completed" });
    const alternatives = selectEligiblePhysicalAlternativesFromSummary(summary, []);
    assert.equal(alternatives.length, 0, "card without seating positions suppressed");
  });

  it("suppresses a card with no tuning", () => {
    const entry = makeConfirmedEntry({ tuning: [] });
    const summary = buildCoordinatedSummary({ confirmed: [entry], status: "completed" });
    const alternatives = selectEligiblePhysicalAlternativesFromSummary(summary, []);
    assert.equal(alternatives.length, 0, "card without tuning suppressed");
  });

  it("suppresses a card with no subwoofer model", () => {
    const entry = makeConfirmedEntry({ selectedSubModel: null });
    const summary = buildCoordinatedSummary({ confirmed: [entry], status: "completed" });
    const alternatives = selectEligiblePhysicalAlternativesFromSummary(summary, []);
    assert.equal(alternatives.length, 0, "card without subwoofer model suppressed");
  });

  it("suppresses a card with no RSP position", () => {
    const entry = makeConfirmedEntry({ rspAuthority: { rspMode: "manual_position" } });
    const summary = buildCoordinatedSummary({ confirmed: [entry], status: "completed" });
    const alternatives = selectEligiblePhysicalAlternativesFromSummary(summary, []);
    assert.equal(alternatives.length, 0, "card without RSP suppressed");
  });
});

describe("P0-2: eligible but non-eligible alternatives are still gated", () => {
  it("does not present a candidate that failed materiality", () => {
    const entry = makeConfirmedEntry({ physicalAlternativeEligible: false });
    const summary = buildCoordinatedSummary({ confirmed: [entry], status: "completed" });
    const alternatives = selectEligiblePhysicalAlternativesFromSummary(summary, []);
    assert.equal(alternatives.length, 0);
  });
});