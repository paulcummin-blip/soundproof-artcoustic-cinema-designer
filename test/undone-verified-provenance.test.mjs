// undone-verified-provenance.test.mjs
// Validates the five ADI results panel states:
//   1. Not applied
//   2. Applied and verified
//   3. Undone and verified
//   4. Original seating restored without verified Undo
//   5. Stale analysis after unrelated design changes
//
// Presentation-only: no acoustic calculation, RP22 threshold, optimiser search,
// candidate scoring, Apply/Undo handler, persistence, project data or saved
// historical record is changed by any of these tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveOptimiserPlanStatus } from "../src/components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import { resolveApplyProvenance } from "../src/components/room/bass/optimiserPlan/optimiserApplyProvenance.js";
import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_STATE,
  OPTIMISER_PLAN_STATUS,
} from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";

const ORIG_FP = "fp-orig";
const APPLIED_FP = "fp-applied";
const RUN_ID = "run-2026-11-15";

function makeSeatingLever({ fromY = 4.0, toY = 3.9, seatIds = ["s1", "s2"] }) {
  const changes = seatIds.map((seatId) => ({
    lever: OPTIMISER_LEVER.SEATING,
    seatId,
    fromY,
    toY,
    label: `Row 1 Seat ${seatId}`,
  }));
  return {
    evaluated: true,
    notEvaluated: false,
    evidenceStatus: "evaluated",
    effect: {
      p19VariationDb: 2.0,
      p20VariationDb: 3.0,
      p19Level: "L3",
      p20Level: "L3",
      p19LevelBefore: "L2",
      p20LevelBefore: "L2",
    },
    changes,
    validation: { destinationsValid: true },
    seating: { movementLabel: "Move seating forward 100 mm" },
  };
}

function makeSeats(seatIds, y) {
  return seatIds.map((id) => ({ id, y, row: 1 }));
}

function makeBasePlan({ appliedLeverRecords = [], seatingPositions = [], fromY = 4.0, toY = 3.9 }) {
  return {
    planVersion: 3,
    designFingerprint: ORIG_FP,
    run: { runId: RUN_ID },
    levers: {
      [OPTIMISER_LEVER.SEATING]: makeSeatingLever({ fromY, toY }),
    },
    appliedLeverRecords,
    baseline: {
      achievedP19Level: "L2",
      achievedP20Level: "L2",
      achievedP19VariationDb: 3.0,
      achievedP20VariationDb: 4.0,
    },
    baselineParity: { status: "MATCH", reasons: [], trace: null },
    leverDecisions: {},
  };
}

const VERIFIED_LEVELS = { p19Level: "L3", p20Level: "L3", p19VariationDb: 2.0, p20VariationDb: 3.0 };
const RESTORED_LEVELS = { p19Level: "L2", p20Level: "L2", p19VariationDb: 3.0, p20VariationDb: 4.0 };

// ── 1. Not applied ──

test("not applied: seating lever resolves NOT_APPLIED, no verified state", () => {
  const plan = makeBasePlan({ seatingPositions: makeSeats(["s1", "s2"], 4.0) });
  const view = resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: ORIG_FP,
    instances: [],
    seatingPositions: makeSeats(["s1", "s2"], 4.0),
  });
  const seating = view.levers.find((l) => l.key === OPTIMISER_LEVER.SEATING);
  assert.equal(view.status, OPTIMISER_PLAN_STATUS.CURRENT);
  assert.equal(view.appliedVerified, false);
  assert.equal(view.undoneVerified, false);
  assert.equal(view.runSpent, false);
  assert.equal(seating.state, OPTIMISER_LEVER_STATE.NOT_APPLIED);
  assert.equal(seating.stateLabel, "Not applied");
});

// ── 2. Applied and verified ──

test("applied and verified: seating lever resolves APPLIED, verified levels surfaced", () => {
  const records = [{
    runId: RUN_ID,
    leverKey: OPTIMISER_LEVER.SEATING,
    direction: "to",
    appliedAt: "2026-11-15T10:00:00.000Z",
    sourceDesignFingerprint: ORIG_FP,
    resultingDesignFingerprint: APPLIED_FP,
    beforeValues: [],
    afterValues: [],
    affectedIds: ["s1", "s2"],
    verification: {
      status: "verified",
      calculationFingerprint: APPLIED_FP,
      levels: VERIFIED_LEVELS,
      verifiedAt: "2026-11-15T10:00:10.000Z",
    },
    undoneAt: null,
    undoVerification: null,
  }];
  const plan = makeBasePlan({
    appliedLeverRecords: records,
    seatingPositions: makeSeats(["s1", "s2"], 3.9),
  });
  const view = resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: APPLIED_FP,
    instances: [],
    seatingPositions: makeSeats(["s1", "s2"], 3.9),
  });
  const seating = view.levers.find((l) => l.key === OPTIMISER_LEVER.SEATING);
  assert.equal(view.appliedVerified, true);
  assert.equal(view.undoneVerified, false);
  assert.equal(view.runSpent, true);
  assert.equal(seating.state, OPTIMISER_LEVER_STATE.APPLIED);
  assert.equal(view.appliedVerification?.levels?.p19Level, "L3");
  assert.equal(view.appliedVerification?.levels?.p20Level, "L3");
  assert.equal(seating.canApply, false, "Apply disabled when run spent");
  assert.equal(seating.canUndo, true, "Undo available for applied lever");
});

// ── 3. Undone and verified ──

test("undone and verified: seating lever resolves UNDONE_VERIFIED, restored levels surfaced", () => {
  const records = [{
    runId: RUN_ID,
    leverKey: OPTIMISER_LEVER.SEATING,
    direction: "to",
    appliedAt: "2026-11-15T10:00:00.000Z",
    sourceDesignFingerprint: ORIG_FP,
    resultingDesignFingerprint: APPLIED_FP,
    beforeValues: [],
    afterValues: [],
    affectedIds: ["s1", "s2"],
    verification: {
      status: "verified",
      calculationFingerprint: APPLIED_FP,
      levels: VERIFIED_LEVELS,
      verifiedAt: "2026-11-15T10:00:10.000Z",
    },
    undoneAt: "2026-11-15T10:05:00.000Z",
    undoVerification: {
      status: "verified",
      calculationFingerprint: ORIG_FP,
      levels: RESTORED_LEVELS,
      verifiedAt: "2026-11-15T10:05:10.000Z",
    },
  }];
  const plan = makeBasePlan({
    appliedLeverRecords: records,
    seatingPositions: makeSeats(["s1", "s2"], 4.0),
  });
  const view = resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: ORIG_FP,
    instances: [],
    seatingPositions: makeSeats(["s1", "s2"], 4.0),
  });
  const seating = view.levers.find((l) => l.key === OPTIMISER_LEVER.SEATING);
  assert.equal(view.appliedVerified, false, "not applied-verified after undo");
  assert.equal(view.undoneVerified, true, "undoneVerified surfaced");
  assert.equal(view.runSpent, true, "run still spent");
  assert.equal(seating.state, OPTIMISER_LEVER_STATE.UNDONE_VERIFIED);
  assert.equal(view.undoneVerification?.levels?.p19Level, "L2");
  assert.equal(view.undoneVerification?.levels?.p20Level, "L2");
  assert.equal(seating.canApply, false, "Apply disabled for undone lever");
  assert.equal(seating.canUndo, false, "Undo disabled for undone lever");
});

test("undone and verified: distinct from RESTORED (coordinate match alone)", () => {
  // A record with undoneAt: null but seats at fromY → RESTORED, NOT UNDONE_VERIFIED
  const records = [{
    runId: RUN_ID,
    leverKey: OPTIMISER_LEVER.SEATING,
    direction: "to",
    appliedAt: "2026-11-15T10:00:00.000Z",
    sourceDesignFingerprint: ORIG_FP,
    resultingDesignFingerprint: APPLIED_FP,
    beforeValues: [],
    afterValues: [],
    affectedIds: ["s1", "s2"],
    verification: {
      status: "verified",
      calculationFingerprint: APPLIED_FP,
      levels: VERIFIED_LEVELS,
      verifiedAt: "2026-11-15T10:00:10.000Z",
    },
    undoneAt: null,
    undoVerification: null,
  }];
  const plan = makeBasePlan({
    appliedLeverRecords: records,
    seatingPositions: makeSeats(["s1", "s2"], 4.0),
  });
  const view = resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: ORIG_FP,
    instances: [],
    seatingPositions: makeSeats(["s1", "s2"], 4.0),
  });
  const seating = view.levers.find((l) => l.key === OPTIMISER_LEVER.SEATING);
  assert.equal(view.undoneVerified, false, "coordinate match alone is not undone-verified");
  assert.equal(seating.state, OPTIMISER_LEVER_STATE.RESTORED, "coordinate match resolves RESTORED");
});

// ── 4. Original seating restored without verified Undo ──
// (covered by the test above — RESTORED, not UNDONE_VERIFIED)

// ── 5. Stale analysis after unrelated design changes ──

test("stale after unrelated design change: status STALE, no verified state", () => {
  const plan = makeBasePlan({ seatingPositions: makeSeats(["s1", "s2"], 4.0) });
  const view = resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: "fp-unrelated-change",
    instances: [],
    seatingPositions: makeSeats(["s1", "s2"], 4.0),
  });
  assert.equal(view.status, OPTIMISER_PLAN_STATUS.STALE);
  assert.equal(view.appliedVerified, false);
  assert.equal(view.undoneVerified, false);
  assert.equal(view.staleReason != null, true);
});

// ── resolveApplyProvenance: undoneVerified detection ──

test("resolveApplyProvenance returns undoneVerified when sourceDesignFingerprint matches current", () => {
  const plan = {
    designFingerprint: ORIG_FP,
    run: { runId: RUN_ID },
    appliedLeverRecords: [{
      runId: RUN_ID,
      leverKey: OPTIMISER_LEVER.SEATING,
      direction: "to",
      sourceDesignFingerprint: ORIG_FP,
      resultingDesignFingerprint: APPLIED_FP,
      undoneAt: "2026-11-15T10:05:00.000Z",
      undoVerification: { status: "verified", levels: RESTORED_LEVELS },
      verification: { status: "verified" },
    }],
  };
  const result = resolveApplyProvenance(plan, ORIG_FP);
  assert.equal(result.undoneVerified, true);
  assert.equal(result.undoneRecord?.leverKey, OPTIMISER_LEVER.SEATING);
  assert.equal(result.status, "none", "undone record does not produce a verified apply status");
  assert.equal(result.hasAppliedRecord, true, "run still spent");
});

test("resolveApplyProvenance returns undoneVerified false when undoVerification is not verified", () => {
  const plan = {
    designFingerprint: ORIG_FP,
    run: { runId: RUN_ID },
    appliedLeverRecords: [{
      runId: RUN_ID,
      leverKey: OPTIMISER_LEVER.SEATING,
      direction: "to",
      sourceDesignFingerprint: ORIG_FP,
      resultingDesignFingerprint: APPLIED_FP,
      undoneAt: "2026-11-15T10:05:00.000Z",
      undoVerification: { status: "incomplete" },
      verification: { status: "verified" },
    }],
  };
  const result = resolveApplyProvenance(plan, ORIG_FP);
  assert.equal(result.undoneVerified, false, "incomplete undo is not undone-verified");
});

test("resolveApplyProvenance returns undoneVerified false when fingerprint does not match", () => {
  const plan = {
    designFingerprint: ORIG_FP,
    run: { runId: RUN_ID },
    appliedLeverRecords: [{
      runId: RUN_ID,
      leverKey: OPTIMISER_LEVER.SEATING,
      direction: "to",
      sourceDesignFingerprint: ORIG_FP,
      resultingDesignFingerprint: APPLIED_FP,
      undoneAt: "2026-11-15T10:05:00.000Z",
      undoVerification: { status: "verified", levels: RESTORED_LEVELS },
      verification: { status: "verified" },
    }],
  };
  const result = resolveApplyProvenance(plan, "fp-other-change");
  assert.equal(result.undoneVerified, false, "fingerprint mismatch is not undone-verified");
});