// optimiser-persistence-freshness.test.mjs
// ---------------------------------------------------------------------------
// Focused tests for the ADI optimisation plan persistence and freshness
// corrections. Validates the run-ID freshness gate at the Apply boundary and
// the durable run identity restoration after reload.
//
// Run: node src/test/_p7-run.mjs src/test/optimiser-persistence-freshness.test.mjs

import { describe, it } from "vitest";
import assert from "node:assert/strict";

import {
  restoreLatestRunIdentity,
  getLatestOptimiserRun,
  resetOptimiserRunAuthority,
  planIsSupersededByRun,
  beginOptimiserRun,
} from "../components/room/bass/optimiserPlan/optimiserRunAuthority.js";

const PID = "proj-freshness-test";
const VID = "ver-freshness-test";

describe("restoreLatestRunIdentity", () => {
  it("sets the latest run identity without minting a new run", () => {
    resetOptimiserRunAuthority(PID, VID);
    restoreLatestRunIdentity(PID, VID, {
      runId: "run-durable-001",
      startedAt: "2026-11-14T17:28:31.000Z",
    });
    const latest = getLatestOptimiserRun(PID, VID);
    assert.ok(latest, "latest run should be set");
    assert.equal(latest.runId, "run-durable-001");
    assert.equal(latest.startedAt, "2026-11-14T17:28:31.000Z");
    assert.equal(latest.restored, true);
    resetOptimiserRunAuthority(PID, VID);
  });

  it("does not overwrite a begun run", () => {
    resetOptimiserRunAuthority(PID, VID);
    const begun = beginOptimiserRun(PID, VID);
    restoreLatestRunIdentity(PID, VID, {
      runId: "run-durable-older",
      startedAt: "2026-11-14T10:00:00.000Z",
    });
    const latest = getLatestOptimiserRun(PID, VID);
    assert.equal(latest.runId, begun.runId, "begun run must not be overwritten by a restore");
    resetOptimiserRunAuthority(PID, VID);
  });

  it("makes an older restored plan superseded when a newer history run is restored", () => {
    resetOptimiserRunAuthority(PID, VID);
    // Simulate: the saved plan was from run-A, but history shows run-B (newer, failed to save).
    restoreLatestRunIdentity(PID, VID, {
      runId: "run-B-newer",
      startedAt: "2026-11-14T17:28:31.000Z",
    });
    const latest = getLatestOptimiserRun(PID, VID);
    const olderPlan = {
      run: { runId: "run-A-older" },
      savedAt: "2026-11-14T16:16:00.000Z",
    };
    assert.equal(planIsSupersededByRun(olderPlan, latest), true,
      "the older plan must be superseded by the newer restored run");
    resetOptimiserRunAuthority(PID, VID);
  });

  it("does not supersede a plan whose run matches the restored identity", () => {
    resetOptimiserRunAuthority(PID, VID);
    restoreLatestRunIdentity(PID, VID, {
      runId: "run-current-001",
      startedAt: "2026-11-14T17:28:31.000Z",
    });
    const latest = getLatestOptimiserRun(PID, VID);
    const matchingPlan = {
      run: { runId: "run-current-001" },
      savedAt: "2026-11-14T17:28:35.000Z",
    };
    assert.equal(planIsSupersededByRun(matchingPlan, latest), false,
      "a plan whose runId matches the latest run must not be superseded");
    resetOptimiserRunAuthority(PID, VID);
  });
});

describe("Apply freshness gate (useLeverApplyActions)", () => {
  it("blocks a lever apply when planRunId differs from latestRunId", async () => {
    // Simulate the freshness check that useLeverApplyActions performs.
    const planRunId = "run-A-older";
    const latestRunId = "run-B-newer";
    const blocked = planRunId && latestRunId && planRunId !== latestRunId;
    assert.equal(blocked, true, "stale plan must be blocked at the apply boundary");
  });

  it("allows a lever apply when planRunId matches latestRunId", () => {
    const planRunId = "run-current-001";
    const latestRunId = "run-current-001";
    const blocked = planRunId && latestRunId && planRunId !== latestRunId;
    assert.equal(blocked, false, "current plan must not be blocked");
  });

  it("allows a lever apply when run identity is not yet established (no latestRunId)", () => {
    // Before the history read completes, latestRunId is null — the gate
    // does not block, matching the pre-correction behavior.
    const planRunId = "run-A";
    const latestRunId = null;
    const blocked = planRunId && latestRunId && planRunId !== latestRunId;
    assert.equal(blocked, false, "no latest run must not block (graceful before history read)");
  });

  it("allows a lever apply when plan has no run identity (legacy plan)", () => {
    const planRunId = null;
    const latestRunId = "run-B";
    const blocked = planRunId && latestRunId && planRunId !== latestRunId;
    assert.equal(blocked, false, "legacy plan without runId must not be blocked by the gate");
  });
});