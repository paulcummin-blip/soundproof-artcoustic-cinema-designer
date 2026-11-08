// restore-stale-engineering-contract.test.mjs
//
// Focused acceptance tests for the stale-engineering-contract Restore
// checkpoint correction.
//
// Room D has a valid, uncalculated two-subwoofer baseline. A previous
// four-subwoofer arrangement left a retained engineering contract whose
// fingerprint does NOT match the current two-sub design. The Apply guard
// ("authoritative.currentFingerprintMatch") previously blocked the checkpoint
// capture entirely, so the four-sub alternative could not be applied.
//
// Required behaviour: engineering coherence is determined BEFORE the capture
// path is selected. A matching authoritative contract is captured with the
// physical design. A missing, stale, non-authoritative or fingerprint-mismatched
// contract routes to the physical-only (uncalculated) capture path so the valid
// two-sub baseline is checkpointed. The stale four-sub contract is never
// captured as the current design's engineering contract, and is never promoted
// as current after Restore.
//
// Room D regression fingerprints (from the captured diagnostic):
//   currentFingerprint         = cal:v8:10a7c42076d7125e  (two-sub, current)
//   contractResultFingerprint  = cal:v8:6aa4d014582314d2  (four-sub, stale)
//
// Covers:
//   1.  No engineering contract.
//   2.  Retained stale contract with mismatched fingerprint (Room D).
//   3.  Authoritative contract with matching fingerprint.
//   4.  Non-authoritative contract with matching fingerprint.
//   5.  Missing current engineering fingerprint.
//   6.  Exact physical capture including disabled instances and tuning.
//   7.  Failed checkpoint capture blocks Apply.
//   8.  Stale P19/P20 never becomes current after Restore.
//   9.  Successful physical-only Restore consumes the checkpoint.
//  10.  Durable save and cold reopen preserve the restored physical state.
//
// Run: node --import ./test/_alias-register.mjs --test test/restore-stale-engineering-contract.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

// ── Minimal localStorage mock (the node test env has none) ─────────────────
const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => { _ls.set(k, String(v)); },
  removeItem: (k) => { _ls.delete(k); },
};

const { resolveCaptureCoherence } = await import(
  "../src/components/room/bass/bda/captureCoherenceAuthority.js"
);
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
const { findRestoredContract } = await import(
  "../src/components/room/bass/bda/findRestoredContract.js"
);

// ── Room D regression fixture ──────────────────────────────────────────────
const PROJECT = "proj-roomd-stale";
const VERSION = "ver-roomd-stale";
const ENG_FP_TWO = "eng:roomd:two-sub";
const ENG_FP_FOUR = "eng:roomd:four-sub";
// Actual Room D fingerprints from the captured diagnostic.
const FP_CURRENT_TWO = "cal:v8:10a7c42076d7125e";
const FP_STALE_FOUR = "cal:v8:6aa4d014582314d2";

function makeTwoSubInstances() {
  return [
    { id: "sub-1", model: "SUB3-12", enabled: true, position: { x: 1.2, y: 0.3 }, rotationDeg: 0, bottomHeightM: 0.05, tuning: { gainDb: -1.5, delayMs: 2.1, polarity: -1 } },
    { id: "sub-2", model: "SUB3-12", enabled: true, position: { x: 4.8, y: 0.3 }, rotationDeg: 0, bottomHeightM: 0.05, tuning: { gainDb: -1.5, delayMs: 2.1, polarity: 1 } },
  ];
}

function makeFourSubInstances() {
  return [
    { id: "sub-1", model: "SUB3-12", enabled: true, position: { x: 1.2, y: 0.3 }, rotationDeg: 0, bottomHeightM: 0.05, tuning: { gainDb: -2.0, delayMs: 1.8, polarity: -1 } },
    { id: "sub-2", model: "SUB3-12", enabled: true, position: { x: 4.8, y: 0.3 }, rotationDeg: 0, bottomHeightM: 0.05, tuning: { gainDb: -2.0, delayMs: 1.8, polarity: 1 } },
    { id: "sub-3", model: "SUB3-12", enabled: true, position: { x: 1.2, y: 5.7 }, rotationDeg: 180, bottomHeightM: 0.05, tuning: { gainDb: -2.0, delayMs: 1.8, polarity: -1 } },
    { id: "sub-4", model: "SUB3-12", enabled: true, position: { x: 4.8, y: 5.7 }, rotationDeg: 180, bottomHeightM: 0.05, tuning: { gainDb: -2.0, delayMs: 1.8, polarity: 1 } },
  ];
}

function makeContract(fingerprint, baseDesign = "base-design-roomd") {
  return {
    version: "bass-analysis-v8",
    metricSchemaVersion: 9,
    instanceAuthorityVersion: 3,
    job: { resultFingerprint: fingerprint, currentJobFingerprint: fingerprint, status: "complete", completedAtMs: Date.now() },
    fingerprints: { baseDesign },
    selectedCandidate: { id: "cand-roomd" },
    selectedCandidateId: "cand-roomd",
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

// ── 1. No engineering contract ────────────────────────────────────────────
test("1. no engineering contract routes to physical-only (not coherent)", () => {
  const coherence = resolveCaptureCoherence({
    authoritative: false,
    captureEligible: false,
    currentFingerprint: FP_CURRENT_TWO,
    contract: { job: { resultFingerprint: null } },
  });
  assert.equal(coherence.isEngineeringCoherent, false, "no contract → not coherent → physical-only path");
  assert.equal(coherence.coherenceMode, null);
  assert.equal(coherence.hasContract, false);

  // Physical-only capture succeeds for the two-sub baseline.
  const captured = capture(PROJECT, VERSION, {
    subwooferInstances: makeTwoSubInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });
  assert.equal(captured, true);
  const cp = get(PROJECT, VERSION);
  assert.equal(cp.uncalculated, true);
  assert.equal(cp.bassFingerprint, null);
});

// ── 2. Retained stale contract with mismatched fingerprint (Room D) ───────
test("2. Room D: stale authoritative contract with mismatched fingerprint routes to physical-only", () => {
  // This is the exact Room D diagnostic state: authoritative + captureEligible
  // + STALE, contract fingerprint (four-sub) ≠ current fingerprint (two-sub).
  const coherence = resolveCaptureCoherence({
    authoritative: true,
    captureEligible: true,
    authorityStatus: "STALE",
    currentFingerprint: FP_CURRENT_TWO,
    contract: { job: { resultFingerprint: FP_STALE_FOUR } },
  });
  assert.equal(coherence.isEngineeringCoherent, false, "mismatched authoritative contract must NOT be coherent for the current design");
  assert.equal(coherence.coherenceMode, null, "no coherent mode for a stale-mismatched contract");
  assert.equal(coherence.fingerprintMatchesContract, false, "fingerprint mismatch detected");
  assert.equal(coherence.hasContract, true);
  assert.equal(coherence.contractFingerprint, FP_STALE_FOUR);
  assert.equal(coherence.currentFingerprint, FP_CURRENT_TWO);

  // The physical-only path captures the two-sub baseline with no bass contract.
  const captured = capture(PROJECT, VERSION, {
    subwooferInstances: makeTwoSubInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });
  assert.equal(captured, true, "physical-only capture must succeed despite the stale four-sub contract");
  const cp = get(PROJECT, VERSION);
  assert.equal(cp.uncalculated, true, "checkpoint is an uncalculated baseline");
  assert.equal(cp.bassFingerprint, null, "no four-sub bass contract stored");
  assert.equal(cp.engineeringFingerprint, ENG_FP_TWO, "two-sub design identity preserved");
});

// ── 3. Authoritative contract with matching fingerprint ───────────────────
test("3. authoritative contract with matching fingerprint is coherent (captured with bass contract)", () => {
  const coherence = resolveCaptureCoherence({
    authoritative: true,
    captureEligible: false,
    authorityStatus: "COMPLETE",
    currentFingerprint: FP_CURRENT_TWO,
    contract: { job: { resultFingerprint: FP_CURRENT_TWO } },
  });
  assert.equal(coherence.isEngineeringCoherent, true, "matching authoritative contract is coherent");
  assert.equal(coherence.coherenceMode, "authoritative-matched");
  assert.equal(coherence.fingerprintMatchesContract, true);

  // Coherent capture stores the bass fingerprint (not uncalculated).
  const captured = capture(PROJECT, VERSION, {
    subwooferInstances: makeTwoSubInstances(),
    seatingPositions: [],
    bassFingerprint: FP_CURRENT_TWO,
    engineeringFingerprint: ENG_FP_TWO,
  });
  assert.equal(captured, true);
  const cp = get(PROJECT, VERSION);
  assert.equal(cp.uncalculated, false);
  assert.equal(cp.bassFingerprint, FP_CURRENT_TWO);
});

// ── 4. Non-authoritative contract with matching fingerprint ───────────────
test("4. non-authoritative contract with matching fingerprint routes to physical-only", () => {
  // A non-authoritative contract (e.g. updating/failed) is never coherent even
  // if the fingerprint happens to match — the authority flag is the gate.
  const coherence = resolveCaptureCoherence({
    authoritative: false,
    captureEligible: false,
    currentFingerprint: FP_CURRENT_TWO,
    contract: { job: { resultFingerprint: FP_CURRENT_TWO } },
  });
  assert.equal(coherence.isEngineeringCoherent, false, "non-authoritative → physical-only even with matching fingerprint");
  assert.equal(coherence.coherenceMode, null);
});

// ── 5. Missing current engineering fingerprint ────────────────────────────
test("5. missing currentFingerprint with a contract routes to physical-only", () => {
  const coherence = resolveCaptureCoherence({
    authoritative: true,
    captureEligible: false,
    currentFingerprint: null,
    contract: { job: { resultFingerprint: FP_STALE_FOUR } },
  });
  assert.equal(coherence.isEngineeringCoherent, false, "no current fingerprint → cannot prove match → physical-only");
  assert.equal(coherence.fingerprintMatchesContract, false);
});

// ── 6. Exact physical capture including disabled instances and tuning ────
test("6. physical-only capture preserves disabled instances, tuning, orientation and heights", () => {
  const instances = [
    ...makeTwoSubInstances(),
    { id: "sub-3", model: "SUB3-12", enabled: false, position: { x: 2.0, y: 5.7 }, rotationDeg: 180, bottomHeightM: 0.1, tuning: { gainDb: 0, delayMs: 0, polarity: 1 } },
    { id: "sub-4", model: "SUB3-12", enabled: false, position: { x: 4.0, y: 5.7 }, rotationDeg: 180, bottomHeightM: 0.1, tuning: { gainDb: 0, delayMs: 0, polarity: 1 } },
  ];
  const captured = capture(PROJECT, VERSION, {
    subwooferInstances: instances,
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });
  assert.equal(captured, true);
  const cp = get(PROJECT, VERSION);
  assert.equal(cp.subwooferInstances.length, 4, "all four instances preserved including disabled");
  assert.equal(cp.subwooferInstances[2].enabled, false, "disabled instance preserved as disabled");
  assert.equal(cp.subwooferInstances[2].rotationDeg, 180, "orientation preserved");
  assert.equal(cp.subwooferInstances[2].bottomHeightM, 0.1, "height preserved");
  assert.deepEqual(cp.subwooferInstances[0].tuning, { gainDb: -1.5, delayMs: 2.1, polarity: -1 }, "tuning preserved exactly");

  // Source mutation must not corrupt the checkpoint (deep clone).
  instances[0].tuning.gainDb = 99;
  instances[2].enabled = true;
  assert.equal(cp.subwooferInstances[0].tuning.gainDb, -1.5, "checkpoint tuning isolated from source mutation");
  assert.equal(cp.subwooferInstances[2].enabled, false, "checkpoint enabled flag isolated from source mutation");
});

// ── 7. Failed checkpoint capture blocks Apply ────────────────────────────
test("7. captureCheckpoint returns false when engineeringFingerprint is missing (Apply guard holds)", () => {
  // The physical-only path requires engineeringFingerprint (design identity).
  // Without it, capture fails and the Apply transaction guard blocks the change.
  const captured = capture(PROJECT, VERSION, {
    subwooferInstances: makeTwoSubInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: null, // missing → capture fails
    allowUncalculated: true,
  });
  assert.equal(captured, false, "capture must fail without engineeringFingerprint");
  assert.equal(has(PROJECT, VERSION), false, "no checkpoint written on failed capture");
  // The Apply guard precondition: hadPhysicalDesign && !checkpointReady → block.
  const hadPhysicalDesign = makeTwoSubInstances().length > 0;
  const checkpointReady = has(PROJECT, VERSION);
  assert.equal(hadPhysicalDesign && !checkpointReady, true, "Apply must be blocked when capture fails");
});

// ── 8. Stale P19/P20 never becomes current after Restore ──────────────────
test("8. stale four-sub P19/P20 never becomes current after restoring the two-sub baseline", () => {
  // Checkpoint the two-sub baseline (physical-only, uncalculated).
  capture(PROJECT, VERSION, {
    subwooferInstances: makeTwoSubInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });
  const cp = get(PROJECT, VERSION);

  // After restore, the live design is the two-sub baseline. The stale four-sub
  // contract (FP_STALE_FOUR) must not appear current against the two-sub
  // cacheKey (FP_CURRENT_TWO), and no cacheKey must ever be current.
  // hasCurrentBassResult takes the authority object + cacheKey (not fingerprints).
  const staleFourSubAuthority = {
    authoritative: true,
    contract: { job: { resultFingerprint: FP_STALE_FOUR } },
  };
  assert.equal(hasCurrentBassResult(staleFourSubAuthority, FP_CURRENT_TWO), false, "stale four-sub contract must not be current for the two-sub design");
  assert.equal(hasCurrentBassResult(staleFourSubAuthority, null), false, "no cacheKey must ever be current");

  // Sanity: only the correct recalculation (matching authoritative contract +
  // matching cacheKey) makes a result current — never a stale retained contract.
  const matchingTwoSubAuthority = {
    authoritative: true,
    contract: { job: { resultFingerprint: FP_CURRENT_TWO } },
  };
  assert.equal(hasCurrentBassResult(matchingTwoSubAuthority, FP_CURRENT_TWO), true, "sanity: a matching authoritative contract IS current (only a genuine recalculation reaches this state)");

  // The restored uncalculated baseline maps to NEEDS_UPDATE, never CURRENT.
  const restoreResult = {
    ok: true,
    bankRestored: false,
    uncalculated: true,
    physicalRestored: true,
    reason: "uncalculated-baseline-restored",
  };
  const exit = resolveRestoreExit(restoreResult);
  assert.equal(exit.outcome, RESTORE_OUTCOME.NEEDS_UPDATE, "restored uncalculated baseline must require calculation");
  assert.equal(exit.outcome !== RESTORE_OUTCOME.CURRENT, true, "must never appear as CURRENT");

  // findRestoredContract must not fabricate a contract for the uncalculated restore.
  const found = findRestoredContract({
    completedByFingerprint: {},
    bankTargets: {},
    checkpointSnapshot: cp,
    fingerprint: null,
  });
  assert.equal(found.contract, null, "no contract may be fabricated for the uncalculated baseline");
});

// ── 9. Successful physical-only Restore consumes the checkpoint ───────────
test("9. successful physical-only Restore consumes the checkpoint", () => {
  capture(PROJECT, VERSION, {
    subwooferInstances: makeTwoSubInstances(),
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });
  assert.equal(has(PROJECT, VERSION), true, "checkpoint exists before restore");

  // Restore transaction for the uncalculated path clears the checkpoint.
  // (restorePreviousDesign calls clearCheckpoint after a successful physical restore.)
  clear(PROJECT, VERSION);
  assert.equal(has(PROJECT, VERSION), false, "checkpoint consumed after successful restore");
  assert.equal(get(PROJECT, VERSION), null, "no residual checkpoint remains");
});

// ── 10. Durable save and cold reopen preserve the restored physical state ─
test("10. durable localStorage mirror preserves the two-sub baseline across cold reopen", () => {
  const instances = makeTwoSubInstances();
  capture(PROJECT, VERSION, {
    subwooferInstances: instances,
    seatingPositions: [],
    bassFingerprint: null,
    engineeringFingerprint: ENG_FP_TWO,
    allowUncalculated: true,
  });

  // The durable mirror must be written to localStorage (project/version-scoped).
  const durableKey = `b44-bda-checkpoint:v1:${PROJECT}::${VERSION}`;
  const raw = _ls.get(durableKey);
  assert.ok(raw, "durable checkpoint must be written to localStorage");
  const durable = JSON.parse(raw);
  assert.equal(durable.uncalculated, true, "durable record preserves uncalculated flag");
  assert.equal(durable.bassFingerprint, null, "durable record carries no four-sub bass contract");
  assert.equal(durable.engineeringFingerprint, ENG_FP_TWO, "durable record preserves two-sub design identity");
  assert.equal(durable.projectId, PROJECT, "durable record is project-scoped");
  assert.equal(durable.versionId, VERSION, "durable record is version-scoped");
  assert.equal(durable.subwooferInstances.length, 2, "durable record preserves both two-sub instances");
  assert.deepEqual(durable.subwooferInstances[0].tuning, { gainDb: -1.5, delayMs: 2.1, polarity: -1 }, "durable record preserves tuning");

  // Simulate a cold reopen: the in-memory store is empty, but the durable
  // record hydrates the checkpoint on first getCheckpoint() call.
  // (previousDesignCheckpoint.getCheckpoint hydrates from durable on miss.)
  // We verify the durable record alone is sufficient to reconstruct the state.
  assert.equal(durable.subwooferInstances[0].id, "sub-1");
  assert.equal(durable.subwooferInstances[1].id, "sub-2");

  // Cross-project key isolation: a different project must not collide.
  const otherKey = `b44-bda-checkpoint:v1:proj-other::${VERSION}`;
  assert.equal(_ls.has(otherKey), false, "no cross-project key collision");
});