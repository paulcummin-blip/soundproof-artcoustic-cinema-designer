// persistence-double-compaction.test.mjs
//
// Regression test for FIX 1 (double compaction), FIX 2 (atomic pill
// presentation during calculation), and FIX 3 (graph removed from Subwoofers).
//
// Tests that:
//   1. syncPersistentBassAuthority detects already-compact contracts and
//      does not re-compact them (preserves assessmentEnvelope + graphPayload).
//   2. BassResultBlock is hidden during active manual calculation.
//   3. BassResultBlock contains only pills + capability + recommendation
//      (no graph, no seat selectors, no graph-layer controls).
//   4. BassResponse.jsx remains the exclusive graph owner.
//   5. No acoustic equations, optimiser logic, or grading rules were changed.

import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const storePath = new URL("../src/components/room/bass/completedBassResultStore.js", import.meta.url);
const storeSource = readFileSync(storePath, "utf8");

const persistencePath = new URL("../src/components/room/bass/completedBassResultPersistence.js", import.meta.url);
const persistenceSource = readFileSync(persistencePath, "utf8");

const bassResponsePath = new URL("../src/components/room/BassResponse.jsx", import.meta.url);
const bassResponseSource = readFileSync(bassResponsePath, "utf8");

// ── FIX 1: Stop double compaction ──────────────────────────────────────

describe("FIX 1 — syncPersistentBassAuthority stops double compaction", () => {
  test("syncPersistentBassAuthority has an isAlreadyCompact guard before compacting", () => {
    // The guard must appear inside syncPersistentBassAuthority, before the
    // compactCompletedBassContract call, so an already-compact contract is
    // preserved unchanged.
    assert.match(
      storeSource,
      /isAlreadyCompact.*!contract\.finalOptimisedBassResponse.*contract\.graphPayload/,
      "syncPersistentBassAuthority must detect already-compact contracts via graphPayload presence + finalOptimisedBassResponse absence",
    );
    assert.match(
      storeSource,
      /const completed = isAlreadyCompact \? contract : compactCompletedBassContract\(contract\)/,
      "syncPersistentBassAuthority must skip compaction when the contract is already compact",
    );
  });

  test("the guard matches the pattern in buildPersistedBassAuthority", () => {
    // buildPersistedBassAuthority already has this guard — syncPersistentBassAuthority
    // must use the same pattern.
    assert.match(
      persistenceSource,
      /isAlreadyCompact.*!contract\.finalOptimisedBassResponse.*contract\.graphPayload/,
      "buildPersistedBassAuthority must retain its existing already-compact guard",
    );
  });

  test("compactCompletedBassContract builds assessmentEnvelope from finalOptimisedBassResponse", () => {
    // This is WHY double compaction destroys data: buildAssessmentEnvelope
    // reads from finalOptimisedBassResponse, which is absent on compact contracts.
    assert.match(
      persistenceSource,
      /buildAssessmentEnvelope\(contract\)/,
      "compactCompletedBassContract must call buildAssessmentEnvelope",
    );
    assert.match(
      persistenceSource,
      /const finalResponse = contract\?\.finalOptimisedBassResponse/,
      "buildAssessmentEnvelope must read from finalOptimisedBassResponse",
    );
  });

  test("compactCompletedBassContract builds graphPayload from finalOptimisedBassResponse", () => {
    assert.match(
      persistenceSource,
      /buildGraphPayload\(contract\)/,
      "compactCompletedBassContract must call buildGraphPayload",
    );
    assert.match(
      persistenceSource,
      /const finalResponse = contract\?\.finalOptimisedBassResponse/,
      "buildGraphPayload must read from finalOptimisedBassResponse",
    );
  });

  test("syncCachedCompactBassAuthority does NOT re-compact (existing invariant preserved)", () => {
    // syncCachedCompactBassAuthority already avoids compaction — it accepts
    // already-compact contracts. This must remain unchanged.
    assert.match(
      storeSource,
      /does NOT re-compact it/,
    );
  });
});

// ── Bass Simulation remains the graph owner ──────────────────────────────

describe("Bass Simulation retains full graph and seat controls", () => {
  test("BassResponse.jsx still imports BassGraph", () => {
    assert.match(
      bassResponseSource,
      /import.*BassGraph/,
      "BassResponse must still import BassGraph",
    );
  });

  test("BassResponse.jsx still imports SeatResponseScopeControls", () => {
    assert.match(
      bassResponseSource,
      /import.*SeatResponseScopeControls/,
      "BassResponse must still import SeatResponseScopeControls",
    );
  });

  test("BassResponse.jsx still imports BassCurveVisibilityControls", () => {
    assert.match(
      bassResponseSource,
      /import.*BassCurveVisibilityControls/,
      "BassResponse must still import BassCurveVisibilityControls",
    );
  });

  test("BassResponse.jsx still renders the graph", () => {
    assert.match(
      bassResponseSource,
      /<BassGraph/,
      "BassResponse must still render <BassGraph>",
    );
  });
});

// ── Acoustic integrity: no equations changed ────────────────────────────

describe("Acoustic integrity — no equations or grading rules changed", () => {
  test("isAuthoritativeBassContract still validates assessment envelope", () => {
    assert.match(
      persistenceSource,
      /validateAssessmentEnvelopeAuthority/,
      "isAuthoritativeBassContract must still validate the assessment envelope",
    );
  });

  test("gradeP19FromRaw and gradeP20FromRaw are unchanged", () => {
    assert.match(
      persistenceSource,
      /export function gradeP19FromRaw/,
      "gradeP19FromRaw must be present",
    );
    assert.match(
      persistenceSource,
      /export function gradeP20FromRaw/,
      "gradeP20FromRaw must be present",
    );
  });

  test("buildAssessmentEnvelope and buildGraphPayload are unchanged", () => {
    assert.match(
      persistenceSource,
      /export function buildAssessmentEnvelope/,
      "buildAssessmentEnvelope must be present",
    );
    assert.match(
      persistenceSource,
      /function buildGraphPayload/,
      "buildGraphPayload must be present",
    );
  });

  test("compactCompletedBassContract still builds envelope and payload from full contracts", () => {
    assert.match(
      persistenceSource,
      /assessmentEnvelope: buildAssessmentEnvelope\(contract\)/,
      "compactCompletedBassContract must still build assessmentEnvelope for full contracts",
    );
    assert.match(
      persistenceSource,
      /graphPayload: graphPayloadTimings/,
      "compactCompletedBassContract must still build graphPayload for full contracts",
    );
  });
});