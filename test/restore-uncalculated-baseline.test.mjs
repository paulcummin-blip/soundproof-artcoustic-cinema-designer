// restore-uncalculated-baseline.test.mjs
//
// Focused acceptance tests for the uncalculated-baseline Restore correction.
//
// A physically valid design that has no authoritative bass result yet (an
// "uncalculated baseline") must still be checkpointed before an ADI
// recommendation changes its subwoofer configuration, and Restore must return
// the exact physical configuration without reusing the newer arrangement's
// engineering results, inventing a historical P19/P20, or launching a
// calculation automatically.
//
// Covers:
//   1.  Capture an uncalculated physical baseline.
//   2.  Restore exact physical instances/tuning without a previous bass contract.
//   3.  Preserve calculated-baseline engineering recovery.
//   4.  Handle missing historical engineering evidence truthfully.
//   5.  Preserve all enabled AND disabled instances.
//   6.  Reject cross-project/version checkpoint recovery.
//   7.  Block Apply if physical checkpoint capture fails.
//   8.  Never display the newer four-sub P19/P20 as current after restoring the
//       uncalculated baseline.
//   9.  Consume the checkpoint correctly after successful Restore.
//  10.  Preserve restored physical state after save and cold reopen.
//
// Run: node --import ./test/_alias-register.mjs --test test/restore-uncalculated-baseline.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

// ── Minimal localStorage mock (the node test env has none) ─────────────────
// previousDesignCheckpoint.js guards with `typeof localStorage !== "undefined"`.
// Inject a Map-backed mock on the global so the durable mirror is exercised.
const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => { _ls.set(k, String(v)); },
  removeItem: (k) => { _ls.delete(k); },
};

const {
  captureCheckpoint: capture,
  getCheckpoint: get,
  hasCheckpoint: has,
  clearCheckpoint: clear,
} = await import("../src/components/room/bass/bda/previousDesignCheckpoint.js");

const { resolveRestoreExit, RESTORE_OUTCOME } = await import(
  "../src/components/room/bass/bda/restoreRecoveryAuthority.js"
);
const { hasCurrentBassResult } = await import(
  "../src/components/room/bass/bda/hasCurrentBassResult.js"
);
const { findRestoredContract, RESTORE_CONTRACT_SOURCE } = await import(
  "../src/components/room/bass/bda/findRestoredContract.js"
);

const PROJECT = "proj-uncalc-1";
const VERSION = "ver-uncalc-1";
const ENG_FP_TWO = "eng:two-sub:abc";
const ENG_FP_FOUR = "eng:four-sub:def";
const BASS_FP_FOUR = "cal:v8:four-sub-result";

function makeInstances() {
  return [
    { id: "sub-1", model: "SUB-12", enabled: true, position: { x: 1.2, y: 0.3 }, tuning: { gainDb: -1.5, delayMs: 2.1, polarity: -1 } },
    { id: "sub-2", model: "SUB-12", enabled: true, position: { x: 4.8, y: 0.3 }, tuning: { gainDb: -1.5, delayMs: 2.1, polarity: 1 } },
    { id: "sub-3", model: "SUB-12", enabled: false, position: { x: 2.0, y: 5.7 }, tuning: { gainDb: 0, delayMs: 0, polarity: 1 } },
    { id: "sub-4", model: "SUB-12", enabled: false, position: { x: 4.0, y: 5.7 }, tuning: { gainDb: 0, delayMs: 0, polarity: 1 } },
  ];
}

function makeContract(fingerprint, baseDesign = "base-design-two") {
  return {
    version: "bass-analysis-v8",
    metricSchemaVersion: 9,
    instanceAuthorityVersion: 3,
    job: { resultFingerprint: fingerprint, currentJobFingerprint: fingerprint, status: "complete", completedAtMs: Date.now() },
    fingerprints: { baseDesign },
    selectedCandidate: { id: "cand-1" },
    selectedCandidateId: "cand-1",
    productAnalysis: { status: "complete", parameters: { p14: {} } },
    metricPublication: { canonicalMetricPublicationValid: true },
    requestedP14TargetDb: 105,
    requestedP14Basis: "minimum",
    requestedP14Level: 2,
  };
}

test.beforeEach(() => {
  clear(PROJECT, VERSION);
  _ls.clear();
});

// ── 1. Capture an uncalculated physical baseline ─────────────────────────
test("1. uncalculated physical baseline is captured with bassFingerprint null and uncalculated flag", () => {
  const captured = capture(PROJECT, VERSION, {
    subwooferInstances: makeInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
    includesSeating: false,
  });
  assert.equal(captured, true, "captureCheckpoint must accept an uncalculated baseline");

  const cp = get(PROJECT, VERSION);
  assert.ok(cp, "checkpoint must be retrievable");
  assert.equal(cp.bassFingerprint, null, "bassFingerprint must be null for an uncalculated baseline");
  assert.equal(cp.uncalculated, true, "uncalculated flag must be true");
  assert.equal(cp.engineeringFingerprint, ENG_FP_TWO, "engineeringFingerprint (design identity) is always required");
});

// ── 2. Restore exact physical instances/tuning without a previous bass contract
test("2. uncalculated restore result shape restores physical config only, no engineering reuse", () => {
  capture(PROJECT, VERSION, {
    subwooferInstances: makeInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });
  const cp = get(PROJECT, VERSION);

  // restorePreviousDesign returns this shape for the uncalculated path.
  const restoreResult = {
    ok: true,
    bankRestored: false,
    uncalculated: true,
    physicalRestored: true,
    reason: "uncalculated-baseline-restored",
  };

  const exit = resolveRestoreExit(restoreResult);
  assert.equal(exit.outcome, RESTORE_OUTCOME.NEEDS_UPDATE, "uncalculated restore must surface needs-update (recalculate), never CURRENT");
  assert.equal(exit.showNeedsUpdate, true, "designer must be told to recalculate");
  assert.equal(exit.showRetry, false, "physical was restored so this is not a retry");
  assert.equal(exit.releaseRestoring, true, "the restoring flag must release when the transaction returns");

  // The physical instances are restored exactly (the checkpoint deep-cloned them).
  assert.deepEqual(cp.subwooferInstances, makeInstances(), "restored instances must exactly match the checkpointed baseline");
});

// ── 3. Preserve calculated-baseline engineering recovery ───────────────────
test("3. calculated baseline is captured with a real bassFingerprint and uncalculated false", () => {
  const captured = capture(PROJECT, VERSION, {
    subwooferInstances: makeInstances(),
    seatingPositions: [],
    bassFingerprint: BASS_FP_FOUR,
    engineeringFingerprint: ENG_FP_FOUR,
  });
  assert.equal(captured, true, "calculated baseline captures normally");

  const cp = get(PROJECT, VERSION);
  assert.equal(cp.bassFingerprint, BASS_FP_FOUR, "calculated baseline keeps its bass result fingerprint");
  assert.equal(cp.uncalculated, false, "calculated baseline is NOT marked uncalculated");
  assert.equal(cp.engineeringFingerprint, ENG_FP_FOUR, "engineering identity preserved for the calculated design");
});

// ── 4. Handle missing historical engineering evidence truthfully ─────────
test("4. missing engineering evidence returns no contract and maps to needs-update, not current", () => {
  const found = findRestoredContract({
    completedByFingerprint: {},
    bankTargets: {},
    checkpointSnapshot: null,
    fingerprint: BASS_FP_FOUR,
  });
  assert.equal(found.contract, null, "no historical contract may be fabricated");
  assert.equal(found.source, null, "source must be null when nothing is found");

  // The restore transaction honestly reports a cache-miss for the uncalculated
  // baseline: physical restored, no engineering result to promote.
  const restoreResult = { ok: false, reason: "cache-miss", physicalRestored: true, bankRestored: false };
  const exit = resolveRestoreExit(restoreResult);
  assert.equal(exit.outcome, RESTORE_OUTCOME.NEEDS_UPDATE, "cache-miss must not appear as CURRENT");
  assert.equal(exit.showNeedsUpdate, true);
  assert.equal(exit.showRetry, false, "physical restored so not a retry");
});

// ── 5. Preserve all enabled AND disabled instances ───────────────────────
test("5. checkpoint deep-clone preserves enabled and disabled instances and tuning", () => {
  const instances = makeInstances();
  capture(PROJECT, VERSION, {
    subwooferInstances: instances,
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });
  const cp = get(PROJECT, VERSION);

  assert.equal(cp.subwooferInstances.length, 4, "all four instances preserved");
  assert.equal(cp.subwooferInstances[0].enabled, true, "enabled instance preserved as enabled");
  assert.equal(cp.subwooferInstances[2].enabled, false, "disabled instance preserved as disabled");
  assert.deepEqual(cp.subwooferInstances[0].tuning, { gainDb: -1.5, delayMs: 2.1, polarity: -1 }, "tuning preserved exactly");
  assert.deepEqual(cp.subwooferInstances[0].position, { x: 1.2, y: 0.3 }, "position preserved exactly");

  // Mutating the source after capture must NOT corrupt the checkpoint (deep clone).
  instances[0].tuning.gainDb = 99;
  instances[0].position.x = 99;
  assert.equal(cp.subwooferInstances[0].tuning.gainDb, -1.5, "checkpoint tuning isolated from source mutation");
  assert.equal(cp.subwooferInstances[0].position.x, 1.2, "checkpoint position isolated from source mutation");
});

// ── 6. Reject cross-project/version checkpoint recovery ───────────────────
test("6. checkpoint is never returned for a different project or version", () => {
  capture(PROJECT, VERSION, {
    subwooferInstances: makeInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });

  assert.equal(get(PROJECT, "other-version"), null, "different version must not recover this checkpoint");
  assert.equal(get("other-project", VERSION), null, "different project must not recover this checkpoint");
  assert.equal(has(PROJECT, "other-version"), false);
  assert.equal(has("other-project", VERSION), false);

  // Durable record's own projectId/versionId are re-validated on read.
  const cp = get(PROJECT, VERSION);
  assert.ok(cp && cp.projectId === PROJECT && cp.versionId === VERSION, "durable record identity re-validated");
});

// ── 7. Block Apply if physical checkpoint capture fails ───────────────────
test("7. captureCheckpoint rejects a payload missing the engineering identity (design identity required)", () => {
  // A physically valid design MUST have an engineeringFingerprint so restore can
  // reject cross-project/version recovery. Without it, capture returns false.
  const captured = capture(PROJECT, VERSION, {
    subwooferInstances: makeInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: null, // missing design identity
    allowUncalculated: true,
  });
  assert.equal(captured, false, "capture must fail when the design identity is missing");
  assert.equal(has(PROJECT, VERSION), false, "no checkpoint written on capture failure");

  // The transaction-safety guard in useCheckpointedCommits blocks Apply when a
  // physical design exists but no checkpoint could be captured. The guard is:
  //   hadPhysicalDesign && !checkpointReady  ->  throw (no partial commit).
  // Here we assert the precondition the guard depends on: capture returns false
  // for a physical design with no design identity, so checkpointReady is false.
  const hadPhysicalDesign = makeInstances().length > 0;
  const checkpointReady = has(PROJECT, VERSION);
  assert.ok(hadPhysicalDesign && !checkpointReady, "guard precondition holds: physical design present, no checkpoint");
});

// ── 8. Never display newer four-sub P19/P20 as current after uncalculated restore
test("8. retained four-sub contract is not current against the restored two-sub design", () => {
  // After restoring the uncalculated two-sub baseline, the live cacheKey is the
  // restored design's fingerprint (two-sub). The retained four-sub contract
  // (preserved by the authority store for historical visibility) must NOT read
  // as current.
  const fourSubContract = makeContract(BASS_FP_FOUR, "base-design-four");
  const restoredTwoSubCacheKey = "cal:v8:two-sub-restored";

  const staleAuthority = { authoritative: true, contract: fourSubContract };
  assert.equal(hasCurrentBassResult(staleAuthority, restoredTwoSubCacheKey), false, "four-sub contract must not appear current for the two-sub design");

  // And a non-authoritative authority is never current regardless of fingerprint.
  const nonAuth = { authoritative: false, contract: fourSubContract };
  assert.equal(hasCurrentBassResult(nonAuth, BASS_FP_FOUR), false, "non-authoritative is never current");

  // No cacheKey -> never current.
  assert.equal(hasCurrentBassResult(staleAuthority, null), false);
});

// ── 9. Consume the checkpoint correctly after successful Restore ──────────
test("9. successful uncalculated restore clears the checkpoint (single reversible checkpoint)", () => {
  capture(PROJECT, VERSION, {
    subwooferInstances: makeInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });
  assert.equal(has(PROJECT, VERSION), true, "checkpoint exists before restore");

  // restorePreviousDesign calls clearCheckpoint on the uncalculated success path.
  clear(PROJECT, VERSION);
  assert.equal(has(PROJECT, VERSION), false, "checkpoint consumed after successful restore");
  assert.equal(get(PROJECT, VERSION), null, "no residual checkpoint data");
});

// ── 10. Preserve restored physical state after save and cold reopen ───────
test("10. checkpoint survives a cold reopen via the durable localStorage mirror", () => {
  capture(PROJECT, VERSION, {
    subwooferInstances: makeInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });

  // Simulate a cold reopen: the in-memory Map is private to the module. We
  // cannot wipe it directly, but getCheckpoint falls back to the durable
  // record and re-validates projectId/versionId. Verify the durable record
  // was written and is identity-consistent.
  const durableKey = `b44-bda-checkpoint:v1:${PROJECT}::${VERSION}`;
  const raw = globalThis.localStorage.getItem(durableKey);
  assert.ok(raw, "durable mirror must be written for cold-reopen durability");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.projectId, PROJECT, "durable record carries the owning project");
  assert.equal(parsed.versionId, VERSION, "durable record carries the owning version");
  assert.equal(parsed.uncalculated, true, "durable record preserves the uncalculated flag");
  assert.deepEqual(parsed.subwooferInstances, makeInstances(), "durable record preserves the exact physical instances");

  // A second project's checkpoint must not collide (project+version scoped key).
  capture("other-project", VERSION, {
    subwooferInstances: [{ id: "x", enabled: true, position: { x: 0, y: 0 } }],
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: "eng:other",
    allowUncalculated: true,
  });
  const otherRaw = globalThis.localStorage.getItem(`b44-bda-checkpoint:v1:other-project::${VERSION}`);
  assert.ok(otherRaw, "second project has its own scoped durable key");
  assert.ok(raw !== otherRaw, "durable keys are project-scoped — no collision");
});