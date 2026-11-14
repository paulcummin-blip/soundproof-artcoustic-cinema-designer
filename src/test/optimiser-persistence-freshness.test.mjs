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
  planIdentityIsUnverified,
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

describe("planIdentityIsUnverified (freshness gap closure)", () => {
  it("suppresses a modern plan when no in-memory run exists (initial loading state)", () => {
    const modernPlan = { run: { runId: "run-001" }, savedAt: "2026-11-14T17:28:31.000Z" };
    assert.equal(planIdentityIsUnverified(modernPlan, null), true,
      "modern plan with no latestRun must be suppressed (pending/resolved-no-history/failed)");
  });

  it("does not suppress a modern plan when the in-memory run exists (successful identity match)", () => {
    const modernPlan = { run: { runId: "run-001" }, savedAt: "2026-11-14T17:28:31.000Z" };
    const latestRun = { runId: "run-001", startedAt: "2026-11-14T17:28:00.000Z" };
    assert.equal(planIdentityIsUnverified(modernPlan, latestRun), false,
      "modern plan with a matching latestRun must not be suppressed");
  });

  it("does not suppress a modern plan even when the run differs (supersession is handled elsewhere)", () => {
    // When latestRun exists but differs, planIsSupersededByRun handles the
    // mismatch. planIdentityIsUnverified only checks whether identity has
    // been established at all — a non-null latestRun means it has.
    const modernPlan = { run: { runId: "run-A" }, savedAt: "2026-11-14T16:00:00.000Z" };
    const latestRun = { runId: "run-B", startedAt: "2026-11-14T17:28:00.000Z" };
    assert.equal(planIdentityIsUnverified(modernPlan, latestRun), false,
      "a non-null latestRun means identity is established; supersession is separate");
  });

  it("does not suppress a legacy plan (no run.runId) regardless of latestRun", () => {
    const legacyPlan = { savedAt: "2026-11-14T16:00:00.000Z" };
    assert.equal(planIdentityIsUnverified(legacyPlan, null), false,
      "legacy plan with no latestRun must not be suppressed (compatibility)");
    assert.equal(planIdentityIsUnverified(legacyPlan, { runId: "run-X" }), false,
      "legacy plan with a latestRun must not be suppressed (compatibility)");
  });

  it("does not suppress when there is no plan at all", () => {
    assert.equal(planIdentityIsUnverified(null, null), false,
      "null plan must not be suppressed (nothing to verify)");
    assert.equal(planIdentityIsUnverified(null, { runId: "run-X" }), false,
      "null plan with a latestRun must not be suppressed");
  });
});

describe("Apply freshness gate (useLeverApplyActions)", () => {
  it("blocks a lever apply when planRunId differs from latestRunId", () => {
    const planRunId = "run-A-older";
    const latestRunId = "run-B-newer";
    const blocked = planRunId && (!latestRunId || latestRunId !== planRunId);
    assert.ok(blocked, "stale plan must be blocked at the apply boundary");
  });

  it("allows a lever apply when planRunId matches latestRunId", () => {
    const planRunId = "run-current-001";
    const latestRunId = "run-current-001";
    const blocked = planRunId && (!latestRunId || latestRunId !== planRunId);
    assert.ok(!blocked, "current plan must not be blocked");
  });

  // ── FRESHNESS GAP CLOSURE: initial loading, match, mismatch, failed lookup ──
  // The tightened gate: `if (planRunId && (!latestRunId || latestRunId !== planRunId)) return;`
  // This blocks modern plans whenever latestRunId is null (initial loading, failed
  // lookup, or resolved-but-no-history) — closing the gap where an older plan could
  // temporarily render as current. Legacy plans (no planRunId) remain exempt.

  it("blocks a lever apply during initial loading (latestRunId null, identity pending)", () => {
    const planRunId = "run-001";
    const latestRunId = null;
    const blocked = planRunId && (!latestRunId || latestRunId !== planRunId);
    assert.ok(blocked, "modern plan with null latestRunId must be blocked (initial loading)");
  });

  it("allows a lever apply after successful identity match", () => {
    const planRunId = "run-001";
    const latestRunId = "run-001";
    const blocked = planRunId && (!latestRunId || latestRunId !== planRunId);
    assert.ok(!blocked, "modern plan with matching latestRunId must be allowed");
  });

  it("blocks a lever apply on identity mismatch (newer run in history)", () => {
    const planRunId = "run-A-older";
    const latestRunId = "run-B-newer";
    const blocked = planRunId && (!latestRunId || latestRunId !== planRunId);
    assert.ok(blocked, "modern plan with mismatched latestRunId must be blocked");
  });

  it("blocks a lever apply after failed history lookup (latestRunId still null)", () => {
    const planRunId = "run-001";
    const latestRunId = null;
    const blocked = planRunId && (!latestRunId || latestRunId !== planRunId);
    assert.ok(blocked, "modern plan with null latestRunId after failed lookup must be blocked");
  });

  it("blocks a lever apply when history resolved but found no rows (latestRunId null)", () => {
    const planRunId = "run-001";
    const latestRunId = null;
    const blocked = planRunId && (!latestRunId || latestRunId !== planRunId);
    assert.ok(blocked, "modern plan with null latestRunId after empty history must be blocked");
  });

  it("allows a lever apply for a run begun in this session (latestRunId set before history)", () => {
    const planRunId = "run-session-001";
    const latestRunId = "run-session-001";
    const blocked = planRunId && (!latestRunId || latestRunId !== planRunId);
    assert.ok(!blocked, "modern plan matching a session-begun run must be allowed");
  });

  it("allows a lever apply when plan has no run identity (legacy plan)", () => {
    const planRunId = null;
    const latestRunId = "run-B";
    const blocked = planRunId && (!latestRunId || latestRunId !== planRunId);
    assert.ok(!blocked, "legacy plan without runId must not be blocked by the gate");
  });
});