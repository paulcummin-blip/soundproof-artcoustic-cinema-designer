// test/p0-1-physical-geometry-auto-apply-guard.test.mjs
// P0-1 regression: physical alternatives cannot be automatically applied as
// calibration. A calibration-only result may be auto-applied ONLY when its
// source identities, quantity, positions, seating geometry and processing
// assumptions match the installed configuration.
//
// Tests cover: same-quantity repositioning, cross-quantity alternatives,
// moved seating, and unchanged-geometry calibration (which must still work).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
  resolveCalibrationAutoApply,
} from "../src/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import { candidatePhysicalGeometryMatchesInstalled } from "../src/components/room/bass/optimiseWorkflow/candidateGeometryMatchAuthority.js";

// Installed geometry: 2 active subwoofers with known IDs.
const INSTALLED_INSTANCES = [
  { id: "sub-front-1", enabled: true, position: { x: 1, y: 1, z: 0 }, delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
  { id: "sub-front-2", enabled: true, position: { x: 3, y: 1, z: 0 }, delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
  { id: "sub-disabled", enabled: false, position: { x: 2, y: 7, z: 0 }, delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
];

// Tuning that matches the 2 active installed sub IDs.
const TUNING_MATCHING = [
  { sourceId: "sub-front-1", delayMs: 5, gainDb: -1, polarity: 0, phaseControlDeg: 90 },
  { sourceId: "sub-front-2", delayMs: 3, gainDb: -1, polarity: 0, phaseControlDeg: 45 },
];

// A valid baseline result (current design).
const BASELINE = {
  candidateId: "current",
  candidateKind: "current",
  achievedP19Level: 2,
  achievedP19VariationDb: 3.5,
  achievedP20Level: 2,
  achievedP20VariationDb: 4.0,
  appliedTuning: [],
  perSeatP20: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 2, variationDbRaw: 4.0, worstFrequencyHz: 35 },
    { seatId: "seat-r2-c1", isPrimary: false, level: 1, variationDbRaw: 6.0, worstFrequencyHz: 42 },
  ],
  perSeatP19: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 2, wholeDbDeviation: 3.5, worstFrequencyHz: 35 },
    { seatId: "seat-r2-c1", isPrimary: false, level: 1, wholeDbDeviation: 5.0, worstFrequencyHz: 42 },
  ],
  worstSeatId: "seat-r2-c1",
};

describe("P0-1: candidatePhysicalGeometryMatchesInstalled", () => {
  it("matches when geometry is unchanged and source IDs match installed", () => {
    const candidate = {
      candidateId: "combined-calibration",
      candidateKind: "calibration",
      appliedTuning: TUNING_MATCHING,
    };
    const result = candidatePhysicalGeometryMatchesInstalled(candidate, INSTALLED_INSTANCES);
    assert.equal(result.matches, true);
    assert.deepEqual(result.reasons, []);
  });

  it("does NOT match when candidate depends on changed positions (isPositionCandidate)", () => {
    const candidate = {
      candidateId: "combined:position-1",
      isPositionCandidate: true,
      appliedTuning: TUNING_MATCHING,
    };
    const result = candidatePhysicalGeometryMatchesInstalled(candidate, INSTALLED_INSTANCES);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes("changed subwoofer positions")));
  });

  it("does NOT match when combinedFrom indicates a position candidate", () => {
    const candidate = {
      candidateId: "combined:position-1",
      combinedFrom: { positionCandidateId: "pos-cand-1" },
      appliedTuning: TUNING_MATCHING,
    };
    const result = candidatePhysicalGeometryMatchesInstalled(candidate, INSTALLED_INSTANCES);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes("retuned on a changed subwoofer position")));
  });

  it("does NOT match when seating moved (seatingOffsetMm nonzero)", () => {
    const candidate = {
      candidateId: "combined-cal-seating",
      candidateKind: "calibration",
      seatingOffsetMm: -600,
      appliedTuning: TUNING_MATCHING,
    };
    const result = candidatePhysicalGeometryMatchesInstalled(candidate, INSTALLED_INSTANCES);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes("moved seating")));
  });

  it("does NOT match when combinedFrom indicates moved seating", () => {
    const candidate = {
      candidateId: "combined-cal-seating",
      candidateKind: "calibration",
      combinedFrom: { seatingOffsetMm: 600 },
      appliedTuning: TUNING_MATCHING,
    };
    const result = candidatePhysicalGeometryMatchesInstalled(candidate, INSTALLED_INSTANCES);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes("retuned on moved seating")));
  });

  it("does NOT match on cross-quantity (tuning count != active count)", () => {
    const candidate = {
      candidateId: "combined:4sub",
      appliedTuning: [
        { sourceId: "coord-1", delayMs: 1, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
        { sourceId: "coord-2", delayMs: 1, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
        { sourceId: "coord-3", delayMs: 1, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
        { sourceId: "coord-4", delayMs: 1, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
      ],
    };
    const result = candidatePhysicalGeometryMatchesInstalled(candidate, INSTALLED_INSTANCES);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes("does not match installed active subwoofer count")));
  });

  it("does NOT match when source IDs don't resolve to installed instances", () => {
    const candidate = {
      candidateId: "combined:position-1",
      appliedTuning: [
        { sourceId: "stage2-src-1", delayMs: 5, gainDb: 0, polarity: 0, phaseControlDeg: 90 },
        { sourceId: "stage2-src-2", delayMs: 3, gainDb: 0, polarity: 0, phaseControlDeg: 45 },
      ],
    };
    const result = candidatePhysicalGeometryMatchesInstalled(candidate, INSTALLED_INSTANCES);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes("do not match the installed subwoofer instances")));
  });
});

describe("P0-1: resolveCalibrationAutoApply blocks physical-geometry candidates", () => {
  // A candidate result that improves P20 materially, with tuning that matches
  // installed IDs — the acoustic case for auto-apply is met.
  const IMPROVING_RESULT = {
    candidateId: "combined-calibration",
    candidateKind: "calibration",
    achievedP19Level: 3,
    achievedP19VariationDb: 2.0,
    achievedP20Level: 3,
    achievedP20VariationDb: 3.0,
    appliedTuning: TUNING_MATCHING,
    perSeatP20: [
      { seatId: "seat-r1-c1", isPrimary: true, level: 3, variationDbRaw: 3.0, worstFrequencyHz: 28 },
      { seatId: "seat-r2-c1", isPrimary: false, level: 2, variationDbRaw: 4.0, worstFrequencyHz: 35 },
    ],
    perSeatP19: [
      { seatId: "seat-r1-c1", isPrimary: true, level: 3, wholeDbDeviation: 2.0, worstFrequencyHz: 28 },
      { seatId: "seat-r2-c1", isPrimary: false, level: 2, wholeDbDeviation: 4.0, worstFrequencyHz: 35 },
    ],
    worstSeatId: "seat-r2-c1",
  };

  it("APPLIES a genuine calibration-only improvement (unchanged geometry)", () => {
    const decision = resolveCalibrationAutoApply({
      baseline: BASELINE,
      candidate: IMPROVING_RESULT,
      instances: INSTALLED_INSTANCES,
    });
    assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.APPLIED);
  });

  it("HOLDS a same-quantity repositioned candidate (isPositionCandidate)", () => {
    const candidate = { ...IMPROVING_RESULT, isPositionCandidate: true };
    const decision = resolveCalibrationAutoApply({
      baseline: BASELINE,
      candidate,
      instances: INSTALLED_INSTANCES,
    });
    assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.HOLD);
    assert.equal(decision.reason, CALIBRATION_APPLY_REASON.PHYSICAL_GEOMETRY_MISMATCH);
    assert.ok(decision.statement.includes("physical changes"));
  });

  it("HOLDS a cross-quantity alternative (4-sub tuning on 2-sub install)", () => {
    const candidate = {
      ...IMPROVING_RESULT,
      appliedTuning: [
        { sourceId: "coord-1", delayMs: 1, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
        { sourceId: "coord-2", delayMs: 1, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
        { sourceId: "coord-3", delayMs: 1, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
        { sourceId: "coord-4", delayMs: 1, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
      ],
    };
    const decision = resolveCalibrationAutoApply({
      baseline: BASELINE,
      candidate,
      instances: INSTALLED_INSTANCES,
    });
    assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.HOLD);
    assert.equal(decision.reason, CALIBRATION_APPLY_REASON.PHYSICAL_GEOMETRY_MISMATCH);
  });

  it("HOLDS a moved-seating candidate (seatingOffsetMm nonzero)", () => {
    const candidate = {
      ...IMPROVING_RESULT,
      candidateKind: "calibration",
      seatingOffsetMm: -600,
      combinedFrom: { seatingOffsetMm: -600 },
    };
    const decision = resolveCalibrationAutoApply({
      baseline: BASELINE,
      candidate,
      instances: INSTALLED_INSTANCES,
    });
    assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.HOLD);
    assert.equal(decision.reason, CALIBRATION_APPLY_REASON.PHYSICAL_GEOMETRY_MISMATCH);
  });

  it("HOLDS a candidate whose source IDs don't match installed instances", () => {
    const candidate = {
      ...IMPROVING_RESULT,
      appliedTuning: [
        { sourceId: "stage2-src-1", delayMs: 5, gainDb: 0, polarity: 0, phaseControlDeg: 90 },
        { sourceId: "stage2-src-2", delayMs: 3, gainDb: 0, polarity: 0, phaseControlDeg: 45 },
      ],
    };
    const decision = resolveCalibrationAutoApply({
      baseline: BASELINE,
      candidate,
      instances: INSTALLED_INSTANCES,
    });
    assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.HOLD);
    assert.equal(decision.reason, CALIBRATION_APPLY_REASON.PHYSICAL_GEOMETRY_MISMATCH);
  });
});