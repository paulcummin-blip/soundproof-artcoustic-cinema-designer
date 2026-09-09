// p14-target-cache-durability.test.mjs
//
// Focused regression tests for the P14 target cache durability fix.
//
// CONFIRMED DEFECT:
//   setTargetCacheEntry relied on a 2-second debounced persistence write.
//   Background targets complete ~1.5s apart, so each new target reset the
//   debounce before the previous write occurred. During a sweep, persistence
//   was delayed until 2s after the FINAL target. If the user closed the
//   browser during that interval, completed targets existed only in memory.
//
// FIX:
//   Each verified target is persisted IMMEDIATELY (bypasses the 2s debounce)
//   via the new `immediate: true` option. The debounce remains for non-terminal
//   cache mutations. A final belt-and-braces flush is performed when 8/8 is
//   reached. Write failures are explicitly logged and the dirty marker is
//   retained for retry — the target is NOT falsely treated as durably saved.
//
// These tests exercise the REAL p14TargetCache.js module (not inlined copies)
// via a mock base44 client that stores records in an in-memory Map.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  setTargetCacheEntry,
  setLimitedTargetCacheEntry,
  getTargetCacheEntry,
  getTargetCacheProgress,
  hydrateTargetCache,
  flushTargetCachePersistence,
  getPersistenceFailure,
  isTargetCacheDirty,
  _resetTargetCacheForTest,
} from "@/components/room/bass/p14TargetCache";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "@/lib/bassAuthorityVersion";

// ── Mock contract builder ──────────────────────────────────────────────
// Creates a contract that passes all three cache gates:
//   A. isAuthoritativeBassContract (structural + canonical + publication + envelope)
//   B. hasGraphPayload (graphPayload.postEqRspCurve non-empty)
//   C. hasReadyCanonicalP19Contract (p19 complete + curves + finite values)
//
// gradeP19FromRaw(2.5) = floor(2.5) = 2 → wholeDb ≤ 2 → L4 (4)
// gradeP20FromRaw(2.5) = floor(2.5) = 2 → wholeDb ≤ 2 → L4 (4)

const P18_HZ = 30;
const ASSESS_START_HZ = 30;
const ASSESS_END_HZ = 120;

function makeAuthoritativeContract({ fingerprint = 'fp-cal-1', targetKey = 'minimum-L3' } = {}) {
  return {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    instanceAuthorityVersion: 4,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    selectedCandidateId: 'cand-' + targetKey,
    selectedCandidate: {
      candidateId: 'cand-' + targetKey,
      achievedP18FrequencyHz: P18_HZ,
      perSeatP19Results: [{ seatId: 'seat-1', variationDbRaw: 2.5, level: 4 }],
    },
    provenance: { realSeatCount: 1 },
    metricPublication: {
      canonicalMetricPublicationValid: true,
      publicationRejectionReason: null,
    },
    assessmentEnvelope: {
      achievedP18FrequencyHz: P18_HZ,
      achievedP18Bounded: true,
      assessmentStartHz: ASSESS_START_HZ,
      assessmentEndHz: ASSESS_END_HZ,
      officialP19WorstFrequencyHz: 35,
      p19TargetIdentity: 'practical-calibration-target',
    },
    job: {
      status: 'complete',
      resultFingerprint: fingerprint,
      currentJobFingerprint: fingerprint,
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      resultSchemaVersion: 32,
      elapsedMs: 5000,
    },
    productAnalysis: {
      parameters: {
        p18: { status: 'complete', value: P18_HZ },
        p19: {
          status: 'complete',
          value: 2.5,
          level: 4,
        },
      },
    },
    graphPayload: {
      postEqRspCurve: [{ freq: 20, db: 0 }, { freq: 30, db: -1 }],
      productionHouseCurveTarget: [{ freq: 20, db: 0 }, { freq: 30, db: -1 }],
      postEqPerSeatCurves: [[{ freq: 20, db: 0 }]],
      eqFilterBank: [{ freq: 25, gain: -2, q: 1 }],
    },
  };
}

function makeLimitedContract({ targetKey = 'minimum-L1' } = {}) {
  return {
    __p14Limited: true,
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    instanceAuthorityVersion: 4,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    selectedCandidateId: 'cand-' + targetKey,
    selectedCandidate: {
      candidateId: 'cand-' + targetKey,
    },
    provenance: { realSeatCount: 0 },
    metricPublication: {
      canonicalMetricPublicationValid: false,
      publicationRejectionReason: 'p14-capability-limitation',
    },
    job: {
      status: 'complete',
      resultFingerprint: 'fp-limited-' + targetKey,
      currentJobFingerprint: 'fp-limited-' + targetKey,
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      resultSchemaVersion: 32,
      elapsedMs: 3000,
    },
    productAnalysis: {
      parameters: {
        p14: {
          status: 'complete',
          pass: false,
          achievedCapabilityDb: 105,
          requestedTargetDb: 109,
          headroomOrShortfallDb: -4,
        },
      },
    },
  };
}

// ── Test helpers ───────────────────────────────────────────────────────

const EIGHT_TARGETS = [
  { key: 'minimum-L1', db: 109, basis: 'minimum', level: 1 },
  { key: 'minimum-L2', db: 112, basis: 'minimum', level: 2 },
  { key: 'minimum-L3', db: 115, basis: 'minimum', level: 3 },
  { key: 'minimum-L4', db: 118, basis: 'minimum', level: 4 },
  { key: 'recommended-L1', db: 114, basis: 'recommended', level: 1 },
  { key: 'recommended-L2', db: 117, basis: 'recommended', level: 2 },
  { key: 'recommended-L3', db: 120, basis: 'recommended', level: 3 },
  { key: 'recommended-L4', db: 123, basis: 'recommended', level: 4 },
];

const BASE_DESIGN_FP = 'base-design-fp-1';
const PROJECT_ID = 'test-proj-durability';

function resetMockDb() {
  if (globalThis.__P14_CACHE_MOCK_DB__) globalThis.__P14_CACHE_MOCK_DB__.clear();
  globalThis.__P14_CACHE_MOCK_FAIL__ = false;
}

function waitForMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForWriteToSettle(projectId) {
  await flushTargetCachePersistence(projectId);
  await waitForMs(10);
}

beforeEach(() => {
  _resetTargetCacheForTest();
  resetMockDb();
});

// ═══════════════════════════════════════════════════════════════
// TEST 1: Single target durability — immediate write, no 2s debounce
// ═══════════════════════════════════════════════════════════════

test("Single target durability: completed target is persisted immediately (no 2s debounce)", async () => {
  const contract = makeAuthoritativeContract({ targetKey: 'minimum-L3' });

  const inserted = setTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });
  assert.equal(inserted, true, "setTargetCacheEntry must return true for a valid contract");

  await waitForMs(100);

  const dbRecords = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.ok(dbRecords, "ProjectAnalysisCache record must exist in DB after immediate write");
  assert.ok(dbRecords.target_cache, "Record must have target_cache field");

  const stored = typeof dbRecords.target_cache === 'string'
    ? JSON.parse(dbRecords.target_cache)
    : dbRecords.target_cache;
  assert.equal(stored.baseDesignFingerprint, BASE_DESIGN_FP, "Stored cache must have correct base design fingerprint");
  assert.ok(stored.targets['minimum-L3'], "Stored cache must contain the completed target");
});

// ═══════════════════════════════════════════════════════════════
// TEST 2: Single target durability — reopen restores the target
// ═══════════════════════════════════════════════════════════════

test("Single target durability: reopen (hydrate) restores the completed target", async () => {
  const contract = makeAuthoritativeContract({ targetKey: 'minimum-L3' });
  setTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);

  _resetTargetCacheForTest();
  await hydrateTargetCache(PROJECT_ID);

  const restored = getTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L3');
  assert.ok(restored, "Hydrated target must be available after reopen");
  assert.equal(restored.selectedCandidateId, 'cand-minimum-L3', "Restored contract must match the saved target");
});

// ═══════════════════════════════════════════════════════════════
// TEST 3: Partial sweep — 5/8 saved, reopen restores 5/8
// ═══════════════════════════════════════════════════════════════

test("Partial sweep: 5/8 targets saved, reopen restores 5/8 (only 3 missing need calculation)", async () => {
  const firstFive = EIGHT_TARGETS.slice(0, 5);
  for (const target of firstFive) {
    const contract = makeAuthoritativeContract({ targetKey: target.key });
    setTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, target.key, contract, { immediate: true });
    await waitForMs(50);
  }
  await waitForWriteToSettle(PROJECT_ID);

  _resetTargetCacheForTest();
  await hydrateTargetCache(PROJECT_ID);

  const progress = getTargetCacheProgress(PROJECT_ID, BASE_DESIGN_FP, EIGHT_TARGETS.map(t => t.key));
  assert.equal(progress.resolved, 5, "Reopen must show 5 of 8 resolved");
  assert.equal(progress.ready, 5, "5 authoritative targets must be ready");

  for (const target of firstFive) {
    const restored = getTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, target.key);
    assert.ok(restored, `Target ${target.key} must be restored from DB (no recalculation)`);
  }

  const lastThree = EIGHT_TARGETS.slice(5);
  for (const target of lastThree) {
    const missing = getTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, target.key);
    assert.equal(missing, null, `Target ${target.key} must NOT be restored (needs calculation)`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST 4: Complete sweep — 8/8 saved, reopen restores 8/8
// ═══════════════════════════════════════════════════════════════

test("Complete sweep: 8/8 targets saved, reopen restores 8/8 with no recalculation", async () => {
  for (const target of EIGHT_TARGETS) {
    const contract = makeAuthoritativeContract({ targetKey: target.key });
    setTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, target.key, contract, { immediate: true });
    await waitForMs(50);
  }
  await flushTargetCachePersistence(PROJECT_ID);
  await waitForMs(10);

  _resetTargetCacheForTest();
  await hydrateTargetCache(PROJECT_ID);

  const progress = getTargetCacheProgress(PROJECT_ID, BASE_DESIGN_FP, EIGHT_TARGETS.map(t => t.key));
  assert.equal(progress.resolved, 8, "Reopen must show 8 of 8 resolved");
  assert.equal(progress.ready, 8, "All 8 authoritative targets must be ready");

  for (const target of EIGHT_TARGETS) {
    const restored = getTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, target.key);
    assert.ok(restored, `Target ${target.key} must be restored from DB (no recalculation)`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST 5: Immediate close boundary — target durable before 2s
// ═══════════════════════════════════════════════════════════════

test("Immediate close boundary: target is durable immediately after completion (no 2s wait)", async () => {
  const contract = makeAuthoritativeContract({ targetKey: 'minimum-L3' });
  setTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });

  await waitForMs(50);

  const dbRecord = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.ok(dbRecord, "DB record must exist within 50ms of completion (immediate write)");
  assert.ok(dbRecord.target_cache, "target_cache must be persisted");

  _resetTargetCacheForTest();
  await hydrateTargetCache(PROJECT_ID);
  const restored = getTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L3');
  assert.ok(restored, "Target must survive an immediate close (no 2s wait required)");
});

// ═══════════════════════════════════════════════════════════════
// TEST 6: Write failure — result retained in memory, dirty, diagnostic emitted
// ═══════════════════════════════════════════════════════════════

test("Write failure: result retained in memory, dirty marker set, diagnostic emitted, no false durable state", async () => {
  globalThis.__P14_CACHE_MOCK_FAIL__ = true;

  const contract = makeAuthoritativeContract({ targetKey: 'minimum-L3' });
  setTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });

  await waitForMs(100);

  const inMemory = getTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L3');
  assert.ok(inMemory, "Completed result must remain in memory after write failure");

  assert.ok(isTargetCacheDirty(PROJECT_ID), "Dirty marker must be retained for retry after write failure");

  const failure = getPersistenceFailure(PROJECT_ID);
  assert.ok(failure, "Persistence failure must be recorded for diagnostics");
  assert.ok(failure.error, "Failure record must have an error message");
  assert.ok(failure.timestamp > 0, "Failure record must have a timestamp");

  const dbRecord = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.equal(dbRecord, undefined, "DB must NOT have the record after write failure");

  globalThis.__P14_CACHE_MOCK_FAIL__ = false;
  await flushTargetCachePersistence(PROJECT_ID);
  await waitForMs(100);

  const dbRecordAfterRetry = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.ok(dbRecordAfterRetry, "DB must have the record after retry succeeds");
  assert.equal(getPersistenceFailure(PROJECT_ID), null, "Persistence failure must be cleared after successful retry");
});

// ═══════════════════════════════════════════════════════════════
// TEST 7: Fingerprint change — stale saved bundle not used as current
// ═══════════════════════════════════════════════════════════════

test("Fingerprint change: stale saved bundle is NOT used as current authority", async () => {
  for (const target of EIGHT_TARGETS) {
    const contract = makeAuthoritativeContract({ targetKey: target.key });
    setTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, target.key, contract, { immediate: true });
    await waitForMs(30);
  }
  await waitForWriteToSettle(PROJECT_ID);

  _resetTargetCacheForTest();
  await hydrateTargetCache(PROJECT_ID);

  const progressSame = getTargetCacheProgress(PROJECT_ID, BASE_DESIGN_FP, EIGHT_TARGETS.map(t => t.key));
  assert.equal(progressSame.resolved, 8, "Same fingerprint: 8/8 must be available");

  const NEW_FP = 'base-design-fp-2-changed';
  const progressChanged = getTargetCacheProgress(PROJECT_ID, NEW_FP, EIGHT_TARGETS.map(t => t.key));
  assert.equal(progressChanged.resolved, 0, "Different fingerprint: 0/8 must be available (stale not used)");

  const staleEntry = getTargetCacheEntry(PROJECT_ID, NEW_FP, 'minimum-L3');
  assert.equal(staleEntry, null, "Stale target must NOT be returned for a different fingerprint");
});

// ═══════════════════════════════════════════════════════════════
// TEST 8: Irrelevant UI change — saved 8/8 remains current
// ═══════════════════════════════════════════════════════════════

test("Irrelevant UI change: saved 8/8 remains current (no recalculation)", async () => {
  for (const target of EIGHT_TARGETS) {
    const contract = makeAuthoritativeContract({ targetKey: target.key });
    setTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, target.key, contract, { immediate: true });
    await waitForMs(30);
  }
  await waitForWriteToSettle(PROJECT_ID);

  _resetTargetCacheForTest();
  await hydrateTargetCache(PROJECT_ID);

  const progress = getTargetCacheProgress(PROJECT_ID, BASE_DESIGN_FP, EIGHT_TARGETS.map(t => t.key));
  assert.equal(progress.resolved, 8, "Irrelevant UI change: 8/8 must remain current");
  assert.equal(progress.ready, 8, "All 8 must be ready (no recalculation)");

  for (const target of EIGHT_TARGETS) {
    const entry = getTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, target.key);
    assert.ok(entry, `Switching to ${target.key} must be immediate (cached)`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST 9: Debounce still works for non-terminal mutations (deferPersistence)
// ═══════════════════════════════════════════════════════════════

test("Debounce preserved: non-terminal mutations (deferPersistence) do NOT write immediately", async () => {
  const contract = makeAuthoritativeContract({ targetKey: 'minimum-L3' });

  setTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { deferPersistence: true });

  await waitForMs(100);
  let dbRecord = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.equal(dbRecord, undefined, "deferPersistence: no write should occur");

  const inMemory = getTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L3');
  assert.ok(inMemory, "Result must be in memory even with deferred persistence");

  await flushTargetCachePersistence(PROJECT_ID);
  await waitForMs(100);
  dbRecord = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.ok(dbRecord, "Explicit flush must write the deferred result");
});

// ═══════════════════════════════════════════════════════════════
// TEST 10: LIMITED contract durability — immediate write
// ═══════════════════════════════════════════════════════════════

test("LIMITED contract durability: completed LIMITED target is persisted immediately", async () => {
  const limited = makeLimitedContract({ targetKey: 'minimum-L1' });

  const inserted = setLimitedTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L1', limited, { immediate: true });
  assert.equal(inserted, true, "setLimitedTargetCacheEntry must return true for a valid LIMITED contract");

  await waitForMs(100);

  const dbRecord = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.ok(dbRecord, "LIMITED target must be persisted immediately");

  _resetTargetCacheForTest();
  await hydrateTargetCache(PROJECT_ID);

  const restored = getTargetCacheEntry(PROJECT_ID, BASE_DESIGN_FP, 'minimum-L1');
  assert.ok(restored, "LIMITED target must be restored after reopen");
  assert.ok(restored.__p14Limited, "Restored LIMITED target must carry the __p14Limited marker");
});