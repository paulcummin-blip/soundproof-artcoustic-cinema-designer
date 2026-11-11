// calibration-identity-guard.test.mjs
// P0-1 regression: a candidate whose tuning was derived from a different
// physical configuration must never be auto-applied as calibration.
//
// Tests the shared guard (isCalibrationOnlyResult) and the two consumers that
// gate the auto-apply path:
//   - confirmedCalibrationCandidates (adiCalibrationCandidateSelection.js)
//   - extractCalibrationTuning (optimiseWorkflowOrchestrator.js)
//
// The guard reads the physical-identity markers the V2 engine, the combined
// search and the coordinated search already stamp on every confirmed
// candidate. It changes no acoustic maths, scoring, threshold, budget,
// candidate generation or ranking.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isCalibrationOnlyResult,
  isPhysicalIdentityCandidate,
} from "../src/components/room/bass/optimiseWorkflow/calibrationIdentityGuard.js";
import { confirmedCalibrationCandidates } from "../src/components/room/bass/optimiseWorkflow/adiCalibrationCandidateSelection.js";

// extractCalibrationTuning is not exported separately, but buildAutoApplySummary
// calls it. We test the guard directly and via the selection path.
import { buildAutoApplySummary } from "../src/components/room/bass/optimiseWorkflow/optimiseWorkflowOrchestrator.js";

const TUNING = [
  { sourceId: "sub-1", delayMs: 1.2, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
  { sourceId: "sub-2", delayMs: 0.8, gainDb: -1, polarity: -1, phaseControlDeg: 90 },
];

function calibrationResult(overrides = {}) {
  return {
    candidateKind: "calibration",
    candidateId: "calibration-delay-1",
    appliedTuning: TUNING,
    achievedP19Level: "L2",
    achievedP19VariationDb: 3.1,
    achievedP20Level: 3,
    achievedP20VariationDb: 2.4,
    p14AchievedDb: 117,
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 3, variationDbRaw: 2.4 }],
    ...overrides,
  };
}

describe("P0-1: calibration identity guard", () => {
  it("accepts a genuine calibration-only candidate (grouped delay)", () => {
    assert.equal(isCalibrationOnlyResult(calibrationResult()), true);
    assert.equal(isPhysicalIdentityCandidate(calibrationResult()), false);
  });

  it("accepts a calibration-only combined retune on Current geometry", () => {
    const combined = calibrationResult({
      candidateKind: "calibration",
      candidateId: "combined-calibration",
      candidateOrigin: "combined",
      combinedFrom: { calibrationOnly: true, phaseRetuned: true, delayRetuned: true, gainRetuned: true },
    });
    assert.equal(isCalibrationOnlyResult(combined), true);
  });

  it("rejects a cross-quantity candidate (different sub count)", () => {
    assert.equal(isCalibrationOnlyResult(calibrationResult({ isCrossQuantity: true })), false);
  });

  it("rejects a position candidate (different sub positions)", () => {
    assert.equal(isCalibrationOnlyResult(calibrationResult({ isPositionCandidate: true })), false);
  });

  it("rejects a seating candidate (moved seating)", () => {
    assert.equal(isCalibrationOnlyResult(calibrationResult({ candidateKind: "seating" })), false);
    assert.equal(isCalibrationOnlyResult(calibrationResult({ seatingOffsetMm: 300 })), false);
  });

  it("rejects a coordinated candidate (Phase 9B)", () => {
    assert.equal(isCalibrationOnlyResult(calibrationResult({ isCoordinatedCandidate: true })), false);
    assert.equal(isCalibrationOnlyResult(calibrationResult({ isPhysicalAlternative: true })), false);
  });

  it("rejects a calibration+seating combined candidate", () => {
    const calSeating = calibrationResult({
      candidateKind: "calibration",
      candidateId: "combined-cal-seating",
      candidateOrigin: "combined-calibration-seating",
      seatingOffsetMm: 400,
      seatingPositions: [{ id: "s1", y: 3.5 }],
      combinedFrom: { calibrationRetuned: true, seatingOffsetMm: 400 },
    });
    assert.equal(isCalibrationOnlyResult(calSeating), false);
  });

  it("rejects a position+calibration combined candidate", () => {
    const posCal = calibrationResult({
      candidateKind: "position",
      candidateId: "combined:position-1",
      candidateOrigin: "combined",
      isPositionCandidate: true,
      combinedFrom: { positionCandidateId: "position-1", calibrationRetuned: true },
    });
    assert.equal(isCalibrationOnlyResult(posCal), false);
  });

  it("accepts a zero-offset seating candidate (no actual move)", () => {
    // seatingOffsetMm === 0 means the seating did not actually move — the
    // candidate is effectively calibration-only under the installed geometry.
    assert.equal(isCalibrationOnlyResult(calibrationResult({ seatingOffsetMm: 0 })), true);
  });
});

describe("P0-1: confirmedCalibrationCandidates filters physical candidates", () => {
  const baseSelection = {
    calibrationResult: calibrationResult({ candidateId: "delay-winner" }),
    gainResult: calibrationResult({ candidateKind: "gain", candidateId: "gain-winner" }),
    phaseResult: calibrationResult({ candidateKind: "phase", candidateId: "phase-winner" }),
  };

  it("includes genuine calibration-only stage results", () => {
    const candidates = confirmedCalibrationCandidates({ selection: baseSelection });
    const ids = candidates.map((c) => c.candidateId);
    assert.ok(ids.includes("delay-winner"), "delay winner included");
    assert.ok(ids.includes("gain-winner"), "gain winner included");
    assert.ok(ids.includes("phase-winner"), "phase winner included");
  });

  it("excludes a combinedResult that involved seating", () => {
    const selection = {
      ...baseSelection,
      combinedResult: calibrationResult({
        candidateKind: "calibration",
        candidateId: "combined-cal-seating",
        candidateOrigin: "combined-calibration-seating",
        seatingOffsetMm: 400,
        combinedFrom: { calibrationRetuned: true, seatingOffsetMm: 400 },
      }),
    };
    const candidates = confirmedCalibrationCandidates({ selection });
    const ids = candidates.map((c) => c.candidateId);
    assert.ok(!ids.includes("combined-cal-seating"), "calibration+seating combined excluded");
  });

  it("excludes a combinedResult that involved a position candidate", () => {
    const selection = {
      ...baseSelection,
      combinedResult: calibrationResult({
        candidateKind: "position",
        candidateId: "combined:position-1",
        candidateOrigin: "combined",
        isPositionCandidate: true,
        combinedFrom: { positionCandidateId: "position-1" },
      }),
    };
    const candidates = confirmedCalibrationCandidates({ selection });
    const ids = candidates.map((c) => c.candidateId);
    assert.ok(!ids.includes("combined:position-1"), "position+calibration combined excluded");
  });

  it("includes a calibration-only combined retune on Current geometry", () => {
    const selection = {
      ...baseSelection,
      combinedResult: calibrationResult({
        candidateKind: "calibration",
        candidateId: "combined-calibration",
        candidateOrigin: "combined",
        combinedFrom: { calibrationOnly: true, phaseRetuned: true, delayRetuned: true, gainRetuned: true },
      }),
    };
    const candidates = confirmedCalibrationCandidates({ selection });
    const ids = candidates.map((c) => c.candidateId);
    assert.ok(ids.includes("combined-calibration"), "calibration-only combined included");
  });
});

describe("P0-1: extractCalibrationTuning (via buildAutoApplySummary) excludes physical winners", () => {
  const instances = [
    { id: "sub-1", enabled: true, delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
    { id: "sub-2", enabled: true, delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
  ];

  it("returns null tuning when the winner is a position candidate", () => {
    const selection = { winner: calibrationResult({ isPositionCandidate: true }) };
    const summary = buildAutoApplySummary(selection, instances);
    assert.equal(summary.tuning, null);
  });

  it("returns null tuning when the winner is a seating candidate", () => {
    const selection = { winner: calibrationResult({ candidateKind: "seating", seatingOffsetMm: 300 }) };
    const summary = buildAutoApplySummary(selection, instances);
    assert.equal(summary.tuning, null);
  });

  it("returns null tuning when the winner is a cross-quantity candidate", () => {
    const selection = { winner: calibrationResult({ isCrossQuantity: true }) };
    const summary = buildAutoApplySummary(selection, instances);
    assert.equal(summary.tuning, null);
  });

  it("returns null tuning when the winner is a coordinated candidate", () => {
    const selection = { winner: calibrationResult({ isCoordinatedCandidate: true, isPhysicalAlternative: true }) };
    const summary = buildAutoApplySummary(selection, instances);
    assert.equal(summary.tuning, null);
  });

  it("returns null tuning when the winner is a calibration+seating combined candidate", () => {
    const selection = {
      winner: calibrationResult({
        candidateOrigin: "combined-calibration-seating",
        seatingOffsetMm: 400,
        combinedFrom: { seatingOffsetMm: 400 },
      }),
    };
    const summary = buildAutoApplySummary(selection, instances);
    assert.equal(summary.tuning, null);
  });

  it("returns the tuning when the winner is a genuine calibration-only candidate", () => {
    const selection = { winner: calibrationResult() };
    const summary = buildAutoApplySummary(selection, instances);
    assert.ok(Array.isArray(summary.tuning), "tuning returned for calibration-only winner");
    assert.equal(summary.tuning.length, TUNING.length);
  });

  it("returns the tuning for a calibration-only combined retune", () => {
    const selection = {
      winner: calibrationResult({
        candidateId: "combined-calibration",
        candidateOrigin: "combined",
        combinedFrom: { calibrationOnly: true },
      }),
    };
    const summary = buildAutoApplySummary(selection, instances);
    assert.ok(Array.isArray(summary.tuning), "tuning returned for calibration-only combined");
  });
});