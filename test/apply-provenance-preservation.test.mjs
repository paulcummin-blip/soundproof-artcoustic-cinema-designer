// apply-provenance-preservation.test.mjs
// Validates that a later optimisation run does not erase the appliedLeverRecords
// of a previously applied recommendation, and that runSpent is scoped to the
// current run only.
//
// This tests the pure resolver functions — no React, no database, no network.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveApplyProvenance,
  mergeAppliedLeverRecords,
} from "../src/components/room/bass/optimiserPlan/optimiserApplyProvenance.js";

// ── mergeAppliedLeverRecords ──

test("mergeAppliedLeverRecords carries existing records into a new plan", () => {
  const existingPlan = {
    run: { runId: "run-A" },
    appliedLeverRecords: [
      { runId: "run-A", leverKey: "seat_movement", direction: "to",
        verification: { status: "verified" },
        resultingDesignFingerprint: "fp-after-apply-A",
        undoneAt: null },
    ],
  };
  const newRecord = {
    run: { runId: "run-B" },
    designFingerprint: "fp-B",
  };
  const merged = mergeAppliedLeverRecords(existingPlan, newRecord);
  assert.ok(Array.isArray(merged.appliedLeverRecords));
  assert.equal(merged.appliedLeverRecords.length, 1);
  assert.equal(merged.appliedLeverRecords[0].runId, "run-A");
  assert.equal(merged.run.runId, "run-B");
});

test("mergeAppliedLeverRecords is a no-op when no existing records", () => {
  const existingPlan = { run: { runId: "run-A" } };
  const newRecord = { run: { runId: "run-B" }, designFingerprint: "fp-B" };
  const merged = mergeAppliedLeverRecords(existingPlan, newRecord);
  assert.equal(merged, newRecord, "should return the new record unchanged");
  assert.equal(merged.appliedLeverRecords, undefined);
});

test("mergeAppliedLeverRecords does not overwrite when new record already has records", () => {
  const existingPlan = {
    run: { runId: "run-A" },
    appliedLeverRecords: [
      { runId: "run-A", leverKey: "seat_movement", direction: "to" },
    ],
  };
  const newRecord = {
    run: { runId: "run-B" },
    appliedLeverRecords: [
      { runId: "run-B", leverKey: "delay", direction: "to" },
    ],
  };
  const merged = mergeAppliedLeverRecords(existingPlan, newRecord);
  assert.equal(merged.appliedLeverRecords.length, 1);
  assert.equal(merged.appliedLeverRecords[0].runId, "run-B");
});

// ── resolveApplyProvenance: runSpent scoping ──

test("runSpent is false for a new run even when an old run has applied records", () => {
  const plan = {
    run: { runId: "run-B" },
    designFingerprint: "fp-B",
    appliedLeverRecords: [
      // Record from the OLD run (run-A) — historical evidence only
      { runId: "run-A", leverKey: "seat_movement", direction: "to",
        verification: { status: "verified" },
        resultingDesignFingerprint: "fp-after-apply-A",
        sourceDesignFingerprint: "fp-A",
        undoneAt: null },
    ],
  };
  const provenance = resolveApplyProvenance(plan, "fp-B");
  assert.equal(provenance.hasAppliedRecord, false,
    "old run's applied records must not make the new run appear spent");
  assert.deepEqual(provenance.appliedLeverKeys, [],
    "old run's levers must not appear as applied on the new run");
  assert.equal(provenance.status, "none");
});

test("runSpent is true when the current run has its own applied record", () => {
  const plan = {
    run: { runId: "run-B" },
    designFingerprint: "fp-B",
    appliedLeverRecords: [
      { runId: "run-B", leverKey: "seat_movement", direction: "to",
        verification: { status: "verified" },
        resultingDesignFingerprint: "fp-after-apply-B",
        sourceDesignFingerprint: "fp-B",
        undoneAt: null },
    ],
  };
  const provenance = resolveApplyProvenance(plan, "fp-after-apply-B");
  assert.equal(provenance.hasAppliedRecord, true);
  assert.deepEqual(provenance.appliedLeverKeys, ["seat_movement"]);
  assert.equal(provenance.status, "verified");
});

test("verified status matches when resulting fingerprint equals current", () => {
  const plan = {
    run: { runId: "run-1" },
    designFingerprint: "fp-orig",
    appliedLeverRecords: [
      { runId: "run-1", leverKey: "seat_movement", direction: "to",
        verification: { status: "verified" },
        resultingDesignFingerprint: "fp-new",
        sourceDesignFingerprint: "fp-orig",
        undoneAt: null },
    ],
  };
  const provenance = resolveApplyProvenance(plan, "fp-new");
  assert.equal(provenance.status, "verified");
  assert.ok(provenance.verifiedRecord);
});

test("pending status matches when source fingerprint equals saved fingerprint", () => {
  const plan = {
    run: { runId: "run-1" },
    designFingerprint: "fp-orig",
    appliedLeverRecords: [
      { runId: "run-1", leverKey: "seat_movement", direction: "to",
        verification: { status: "pending" },
        sourceDesignFingerprint: "fp-orig",
        undoneAt: null },
    ],
  };
  // Current fingerprint has moved (seats committed) but verification not done
  const provenance = resolveApplyProvenance(plan, "fp-moved");
  assert.equal(provenance.status, "pending");
  assert.ok(provenance.pendingRecord);
});

test("none status when an unrelated change moved the design with no record", () => {
  const plan = {
    run: { runId: "run-1" },
    designFingerprint: "fp-orig",
    appliedLeverRecords: [],
  };
  const provenance = resolveApplyProvenance(plan, "fp-unrelated");
  assert.equal(provenance.status, "none");
  assert.equal(provenance.hasAppliedRecord, false);
});

// ── End-to-end: preserve across a new run ──

test("appliedLeverRecords survive a new run that produces a terminal (no-improvement) plan", () => {
  // 1. Original plan with a verified seating apply
  const originalPlan = {
    run: { runId: "run-A" },
    designFingerprint: "fp-A",
    appliedLeverRecords: [
      { runId: "run-A", leverKey: "seat_movement", direction: "to",
        verification: { status: "verified",
          levels: { p19Level: "L2", p20Level: "L2" } },
        resultingDesignFingerprint: "fp-A-applied",
        sourceDesignFingerprint: "fp-A",
        undoneAt: null },
    ],
  };

  // 2. A new run produces a terminal record (no appliedLeverRecords of its own)
  const newRunRecord = {
    run: { runId: "run-B" },
    designFingerprint: "fp-B",
    terminalOutcome: "no_useful_improvement",
  };

  // 3. The save path merges the old records into the new record
  const mergedPlan = mergeAppliedLeverRecords(originalPlan, newRunRecord);

  // 4. The merged plan preserves the old run's provenance
  assert.equal(mergedPlan.appliedLeverRecords.length, 1);
  assert.equal(mergedPlan.appliedLeverRecords[0].runId, "run-A");

  // 5. The new run is NOT spent (its own runId has no applied records)
  const provenance = resolveApplyProvenance(mergedPlan, "fp-B");
  assert.equal(provenance.hasAppliedRecord, false,
    "new run must not be spent by old run's records");
  assert.equal(provenance.status, "none");
  assert.deepEqual(provenance.appliedLeverKeys, []);
});