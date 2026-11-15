// seating-restored-provenance.test.mjs
// Validates that when a seating recommendation was applied historically (verified
// Apply record with undoneAt: null) but the current design coordinates match the
// recommendation's original (fromY) positions, the plan resolver:
//   1. identifies the seating lever as RESTORED (not APPLIED, not NOT_APPLIED)
//   2. offers no Apply and no Undo for the restored lever
//   3. does NOT populate undoneAt or undoVerification on the historical record
//   4. retains the verified Apply record as historical evidence
//
// This is a design-coordinate match, not a verified Undo. No acoustic calculation
// is changed; no Apply/Undo mechanism is introduced.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveOptimiserPlanStatus } from "../src/components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import { OPTIMISER_LEVER } from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import { resolveSeatingMatch } from "../src/components/room/bass/optimiserPlan/optimiserPlanMatching.js";

const ORIG_FP = "fp-orig";
const APPLIED_FP = "fp-applied";
const RUN_ID = "optimiser-run-2026-11-10T15:14:02.819Z-1";

function makeSeatingLever({ fromY, toY, seatIds }) {
  const changes = seatIds.map((seatId) => ({
    lever: OPTIMISER_LEVER.SEATING,
    seatId,
    fromY,
    toY,
    label: `Row ${seatId}`,
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

function makePlan({ seatingPositions, fromY = 4.0, toY = 3.9, seatIds = ["s1", "s2", "s3", "s4", "s5", "s6"] }) {
  return {
    planVersion: 3,
    designFingerprint: ORIG_FP,
    run: { runId: RUN_ID },
    levers: {
      [OPTIMISER_LEVER.SEATING]: makeSeatingLever({ fromY, toY, seatIds }),
    },
    appliedLeverRecords: [
      {
        runId: RUN_ID,
        leverKey: OPTIMISER_LEVER.SEATING,
        direction: "to",
        appliedAt: "2026-11-10T15:15:00.000Z",
        sourceDesignFingerprint: ORIG_FP,
        resultingDesignFingerprint: APPLIED_FP,
        beforeValues: makeSeatingLever({ fromY, toY, seatIds }).changes,
        afterValues: makeSeatingLever({ fromY, toY, seatIds }).changes,
        affectedIds: seatIds,
        verification: {
          status: "verified",
          calculationFingerprint: APPLIED_FP,
          levels: { p19Level: "L3", p20Level: "L3", p19VariationDb: 2.0, p20VariationDb: 3.0 },
          verifiedAt: "2026-11-10T15:15:10.000Z",
        },
        undoneAt: null,
        undoVerification: null,
      },
    ],
    baseline: {
      achievedP19Level: "L2",
      achievedP20Level: "L2",
      achievedP19VariationDb: 3.0,
      achievedP20VariationDb: 4.0,
    },
    leverDecisions: {},
  };
}

// ── resolveSeatingMatch: restoredToOriginal ──

test("resolveSeatingMatch reports restoredToOriginal when seats match fromY", () => {
  const lever = makeSeatingLever({ fromY: 4.0, toY: 3.9, seatIds: ["s1", "s2"] });
  const seats = makeSeats(["s1", "s2"], 4.0); // at original
  const match = resolveSeatingMatch(lever, seats);
  assert.equal(match.applied, false, "seats at fromY are not applied");
  assert.equal(match.restoredToOriginal, true, "seats at fromY are restored to original");
  assert.equal(match.positionsKnown, true);
});

test("resolveSeatingMatch reports restoredToOriginal false when seats match toY", () => {
  const lever = makeSeatingLever({ fromY: 4.0, toY: 3.9, seatIds: ["s1", "s2"] });
  const seats = makeSeats(["s1", "s2"], 3.9); // at applied target
  const match = resolveSeatingMatch(lever, seats);
  assert.equal(match.applied, true, "seats at toY are applied");
  assert.equal(match.restoredToOriginal, false, "seats at toY are not restored to original");
});

test("resolveSeatingMatch reports restoredToOriginal false when seats are at neither", () => {
  const lever = makeSeatingLever({ fromY: 4.0, toY: 3.9, seatIds: ["s1", "s2"] });
  const seats = makeSeats(["s1", "s2"], 3.5); // at neither
  const match = resolveSeatingMatch(lever, seats);
  assert.equal(match.applied, false);
  assert.equal(match.restoredToOriginal, false);
});

test("resolveSeatingMatch restoredToOriginal false when a seat is missing", () => {
  const lever = makeSeatingLever({ fromY: 4.0, toY: 3.9, seatIds: ["s1", "s2"] });
  const seats = makeSeats(["s1"], 4.0); // s2 missing
  const match = resolveSeatingMatch(lever, seats);
  assert.equal(match.positionsKnown, false);
  assert.equal(match.restoredToOriginal, false);
});

// ── resolveOptimiserPlanStatus: RESTORED lever state ──

test("seating lever is RESTORED when coordinates match fromY and historical apply exists", () => {
  const plan = makePlan({ fromY: 4.0, toY: 3.9 });
  const seats = makeSeats(["s1", "s2", "s3", "s4", "s5", "s6"], 4.0); // at original
  const resolved = resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: ORIG_FP,
    instances: [],
    seatingPositions: seats,
  });

  assert.equal(resolved.status, "current", "plan is current (fingerprint matches original)");
  const seatingLever = resolved.levers.find((l) => l.key === OPTIMISER_LEVER.SEATING);
  assert.ok(seatingLever, "seating lever exists");
  assert.equal(seatingLever.state, "restored", "seating lever is RESTORED");
  assert.equal(seatingLever.canApply, false, "no Apply offered for restored lever");
  assert.equal(seatingLever.canUndo, false, "no Undo offered for restored lever");
});

test("RESTORED lever does not populate undoneAt or undoVerification on the historical record", () => {
  const plan = makePlan({ fromY: 4.0, toY: 3.9 });
  const seats = makeSeats(["s1", "s2", "s3", "s4", "s5", "s6"], 4.0);
  resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: ORIG_FP,
    instances: [],
    seatingPositions: seats,
  });

  // The resolver must not mutate the plan's appliedLeverRecords.
  const record = plan.appliedLeverRecords[0];
  assert.equal(record.undoneAt, null, "undoneAt is still null — no fabricated Undo");
  assert.equal(record.undoVerification, null, "undoVerification is still null");
  assert.equal(record.verification.status, "verified", "original Apply verification retained");
});

test("RESTORED lever retains verified Apply result for reference", () => {
  const plan = makePlan({ fromY: 4.0, toY: 3.9 });
  const seats = makeSeats(["s1", "s2", "s3", "s4", "s5", "s6"], 4.0);
  const resolved = resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: ORIG_FP,
    instances: [],
    seatingPositions: seats,
  });

  // appliedVerified is false because the current fingerprint doesn't match the
  // applied fingerprint — the design is back at the original. The verified header
  // does not show. The historical record is retained.
  assert.equal(resolved.appliedVerified, false, "verified improvement not in current design");
  assert.equal(resolved.runSpent, true, "run is spent — historical apply record exists");
  assert.deepEqual(resolved.appliedLeverKeys, [OPTIMISER_LEVER.SEATING]);
  // The lever's effect (predicted improvement) is retained for reference.
  const seatingLever = resolved.levers.find((l) => l.key === OPTIMISER_LEVER.SEATING);
  assert.ok(seatingLever.effect, "predicted effect retained for reference");
});

test("seating lever is NOT restored when there is no historical apply record", () => {
  const plan = makePlan({ fromY: 4.0, toY: 3.9 });
  plan.appliedLeverRecords = []; // no historical apply
  const seats = makeSeats(["s1", "s2", "s3", "s4", "s5", "s6"], 4.0);
  const resolved = resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: ORIG_FP,
    instances: [],
    seatingPositions: seats,
  });

  const seatingLever = resolved.levers.find((l) => l.key === OPTIMISER_LEVER.SEATING);
  assert.notEqual(seatingLever.state, "restored", "no RESTORED state without a historical apply");
});

test("seating lever is APPLIED (not RESTORED) when coordinates match toY", () => {
  const plan = makePlan({ fromY: 4.0, toY: 3.9 });
  const seats = makeSeats(["s1", "s2", "s3", "s4", "s5", "s6"], 3.9); // at applied target
  // When seats match toY, the fingerprint is the APPLIED fingerprint.
  const resolved = resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: APPLIED_FP,
    instances: [],
    seatingPositions: seats,
  });

  const seatingLever = resolved.levers.find((l) => l.key === OPTIMISER_LEVER.SEATING);
  assert.equal(seatingLever.state, "applied", "seating lever is APPLIED when at toY");
  assert.equal(resolved.appliedVerified, true, "verified against the applied fingerprint");
});

test("RESTORED is not triggered for an old run's records when a newer run is current", () => {
  const plan = makePlan({ fromY: 4.0, toY: 3.9 });
  // Change the plan's run to a newer run — the old record is historical only.
  plan.run = { runId: "newer-run" };
  const seats = makeSeats(["s1", "s2", "s3", "s4", "s5", "s6"], 4.0);
  const resolved = resolveOptimiserPlanStatus({
    plan,
    currentDesignFingerprint: ORIG_FP,
    instances: [],
    seatingPositions: seats,
  });

  const seatingLever = resolved.levers.find((l) => l.key === OPTIMISER_LEVER.SEATING);
  // The old run's apply record doesn't make the new run spent, so no RESTORED.
  assert.notEqual(seatingLever.state, "restored", "old run's records don't trigger RESTORED on a new run");
});