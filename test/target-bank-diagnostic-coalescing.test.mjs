// target-bank-diagnostic-coalescing.test.mjs
// -------------------------------------------
// Focused regression tests for the diagnostic-only target-bank write defect.
//
// CONFIRMED DEFECT:
//   setFingerprintInputDigest called scheduleSync(projectId, versionId, {}),
//   scheduling a debounced full target_cache write. The only change was
//   ~1,842 characters of diagnostic fingerprintDigests metadata, but the
//   write re-sent the entire completed-contract map (~1 MB) and the platform
//   refused it with HTTP 429 (write traffic volume limit exceeded). The
//   previous target-bank write had already saved the same completed contracts
//   and graph evidence.
//
// FIX:
//   setFingerprintInputDigest no longer calls scheduleSync. The digest stays
//   in memory and is coalesced into the next genuinely necessary target-bank
//   persistence operation (setTargetCacheEntry, setLimitedTargetCacheEntry,
//   restoreTargetBankSnapshot), whose flush already serialises the whole
//   cache — digests included. No dirty marker is set, so a diagnostic-only
//   change never queues a standalone write.
//
// These tests exercise the REAL p14TargetCache.js module via a mock base44
// client that stores records in an in-memory Map.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  setFingerprintInputDigest,
  getFingerprintInputDigest,
  setTargetCacheEntry,
  getTargetCacheEntry,
  getTargetBankIdentity,
  getTargetBankSnapshot,
  restoreTargetBankSnapshot,
  hydrateTargetCache,
  flushTargetCachePersistence,
  isTargetCacheDirty,
  _resetTargetCacheForTest,
} from "@/components/room/bass/p14TargetCache";
import {
  buildCanonicalBassResult,
  CANONICAL_BASS_RESULT_VERSION,
} from "@/components/room/bass/canonicalBassResult";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "@/lib/bassAuthorityVersion";

// ── Mock contract builder (passes all current cache gates) ──────────────
// Mirrors the proven fixture from p14-target-bank-stall-fix.test.mjs:
// structural completeness, canonical seat-metric authority, assessment
// envelope (with reference-eq signature parity), canonical BassResult
// projection, finished graph payload (postEqRspCurve + correctionCurve +
// referenceEq), P19 readiness, and the current P18 selected-target schema.

const CURVE = [{ frequency: 20, spl: 80 }, { frequency: 30, spl: 78 }];

function makeAuthoritativeContract({ fingerprint = 'fp-cal-1', targetKey = 'minimum-L3' } = {}) {
  const contract = {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    instanceAuthorityVersion: 4,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    selectedCandidateId: 'cand-' + targetKey,
    selectedCandidate: {
      id: 'cand-' + targetKey,
      candidateId: 'cand-' + targetKey,
      achievedP18FrequencyHz: 30,
      perSeatP19Results: [{ seatId: 'seat-1', variationDbRaw: 2.5, level: 4 }],
      perSeatP20Results: [{ seatId: 'seat-1', variationDbRaw: 2.0, level: 4 }],
    },
    provenance: { realSeatCount: 1, primarySeatIds: ['seat-1'] },
    metricPublication: {
      canonicalMetricPublicationValid: true,
      publicationRejectionReason: null,
    },
    assessmentEnvelope: {
      achievedP18FrequencyHz: 30,
      achievedP18Bounded: true,
      assessmentStartHz: 30,
      assessmentEndHz: 120,
      officialP19WorstFrequencyHz: 35,
      p19TargetIdentity: 'house-curve-target',
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
        p18: { status: 'complete', value: 30, p18SelectedTargetSchemaVersion: 2 },
        p19: { status: 'complete', value: 2.5, level: 4 },
        p20: { status: 'complete', value: 2.0, level: 4 },
      },
    },
    graphPayload: {
      postEqRspCurve: CURVE,
      correctionCurve: [],
      referenceEq: CURVE,
      productionHouseCurveTarget: CURVE,
      postEqPerSeatCurves: [{ seatId: 'seat-1', responseData: CURVE }],
      eqFilterBank: [{ frequency: 25, gainDb: -2, q: 1 }],
    },
  };

  const canonical = buildCanonicalBassResult(contract);
  contract.bassResult = {
    version: CANONICAL_BASS_RESULT_VERSION,
    candidateId: contract.selectedCandidateId,
    resultFingerprint: fingerprint,
    P19: canonical.P19,
    P20: canonical.P20,
    seatResults: { P19: [], P20: canonical.seatResults.P20 },
    grading: canonical.grading,
  };
  return contract;
}

const BASE_DESIGN_FP = 'base-design-fp-1';
const PROJECT_ID = 'test-proj-diagnostic';
const VERSION_ID = 'ver-1';

function resetMockDb() {
  if (globalThis.__P14_CACHE_MOCK_DB__) globalThis.__P14_CACHE_MOCK_DB__.clear();
  globalThis.__P14_CACHE_MOCK_FAIL__ = false;
}

function waitForMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForWriteToSettle(projectId) {
  await flushTargetCachePersistence(projectId, VERSION_ID);
  await waitForMs(10);
}

beforeEach(() => {
  _resetTargetCacheForTest();
  resetMockDb();
});

// ═══════════════════════════════════════════════════════════════
// ACCEPTANCE 1: Changing only fingerprintDigests does not queue a
// full target-bank update.
// ═══════════════════════════════════════════════════════════════

test("A1. Diagnostic-only fingerprintDigests change does NOT queue a target-bank write", async () => {
  // First, persist a real completed target so a bank exists.
  const contract = makeAuthoritativeContract({ fingerprint: 'fp-cal-A', targetKey: 'minimum-L3' });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);
  assert.equal(isTargetCacheDirty(PROJECT_ID, VERSION_ID), false, "bank clean after real write settles");

  // Now change ONLY the diagnostic digest — no real evidence change.
  const stored = setFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-A', { subwooferLayout: '4-sub' });
  assert.equal(stored, true, "setFingerprintInputDigest must accept the digest");

  // The digest is available in memory.
  assert.deepEqual(
    getFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-A'),
    { subwooferLayout: '4-sub' },
    "digest must be in memory",
  );

  // No write is queued: dirty must remain false.
  assert.equal(
    isTargetCacheDirty(PROJECT_ID, VERSION_ID),
    false,
    "diagnostic-only change must NOT mark the bank dirty",
  );

  // An explicit flush must NOT send a write (dirty is false → early return).
  await flushTargetCachePersistence(PROJECT_ID, VERSION_ID);
  await waitForMs(10);

  // Confirm no second DB record was created and the existing record is unchanged.
  const dbRecord = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.ok(dbRecord, "original record survives");
  const storedBank = typeof dbRecord.target_cache === 'string'
    ? JSON.parse(dbRecord.target_cache)
    : dbRecord.target_cache;
  // The diagnostic digest was NOT persisted by the standalone flush (coalesced
  // for the next legitimate write — see A2).
  assert.equal(
    storedBank.fingerprintDigests?.['fp-cal-A'],
    undefined,
    "diagnostic digest must NOT be persisted by a diagnostic-only flush",
  );
});

test("A1b. Repeated diagnostic changes accumulate in memory without queueing writes", async () => {
  const contract = makeAuthoritativeContract({ fingerprint: 'fp-cal-B', targetKey: 'minimum-L2' });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L2', contract, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);

  setFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-B', { layout: '2-sub' });
  setFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-B2', { layout: '4-sub' });
  setFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-B3', { layout: '1-sub' });

  assert.equal(isTargetCacheDirty(PROJECT_ID, VERSION_ID), false, "no write queued after 3 digest changes");
  assert.ok(getFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-B'), "digest B in memory");
  assert.ok(getFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-B2'), "digest B2 in memory");
  assert.ok(getFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-B3'), "digest B3 in memory");
});

// ═══════════════════════════════════════════════════════════════
// ACCEPTANCE 2: Diagnostic metadata is included when the next
// legitimate evidence write occurs.
// ═══════════════════════════════════════════════════════════════

test("A2. Diagnostic metadata is coalesced into the next legitimate evidence write", async () => {
  // Seed a real completed target and let it settle.
  const contract1 = makeAuthoritativeContract({ fingerprint: 'fp-cal-C', targetKey: 'minimum-L3' });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L3', contract1, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);

  // Change only the diagnostic digest (no write queued).
  setFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-C', { layout: '4-sub', rsp: 'mid' });
  assert.equal(isTargetCacheDirty(PROJECT_ID, VERSION_ID), false, "diagnostic change did not queue");

  // A new completed target arrives — a legitimate evidence write.
  const contract2 = makeAuthoritativeContract({ fingerprint: 'fp-cal-D', targetKey: 'minimum-L4' });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L4', contract2, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);

  // The DB record must now carry the diagnostic digest coalesced into the write.
  const dbRecord = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.ok(dbRecord, "DB record exists after legitimate evidence write");
  const storedBank = typeof dbRecord.target_cache === 'string'
    ? JSON.parse(dbRecord.target_cache)
    : dbRecord.target_cache;
  assert.deepEqual(
    storedBank.fingerprintDigests?.['fp-cal-C'],
    { layout: '4-sub', rsp: 'mid' },
    "diagnostic digest must be persisted with the next legitimate evidence write",
  );
  assert.ok(storedBank.targets['minimum-L3'], "first target still present");
  assert.ok(storedBank.targets['minimum-L4'], "second target present");
});

// ═══════════════════════════════════════════════════════════════
// ACCEPTANCE 3: New or changed completed target evidence still
// persists immediately.
// ═══════════════════════════════════════════════════════════════

test("A3. New completed target evidence persists immediately (immediate write preserved)", async () => {
  const contract = makeAuthoritativeContract({ fingerprint: 'fp-cal-E', targetKey: 'minimum-L3' });
  const inserted = setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });
  assert.equal(inserted, true, "real evidence must be accepted");

  await waitForMs(100);

  const dbRecord = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.ok(dbRecord, "real evidence must be persisted immediately");
  const storedBank = typeof dbRecord.target_cache === 'string'
    ? JSON.parse(dbRecord.target_cache)
    : dbRecord.target_cache;
  assert.equal(storedBank.baseDesignFingerprint, BASE_DESIGN_FP, "correct base design persisted");
  assert.ok(storedBank.targets['minimum-L3'], "completed target persisted immediately");
});

test("A3b. Real evidence change marks the bank dirty (write is not suppressed)", async () => {
  const contract = makeAuthoritativeContract({ fingerprint: 'fp-cal-F', targetKey: 'minimum-L3' });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });
  await waitForMs(50);
  // The immediate write path flushes; after it settles dirty is cleared on
  // success. A second distinct target arriving marks dirty again.
  const contract2 = makeAuthoritativeContract({ fingerprint: 'fp-cal-G', targetKey: 'minimum-L4' });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L4', contract2, { immediate: true });
  await waitForMs(50);
  const dbRecord = globalThis.__P14_CACHE_MOCK_DB__.get(PROJECT_ID);
  assert.ok(dbRecord, "second real evidence write reached the DB");
  const storedBank = typeof dbRecord.target_cache === 'string'
    ? JSON.parse(dbRecord.target_cache)
    : dbRecord.target_cache;
  assert.ok(storedBank.targets['minimum-L4'], "second target persisted");
});

// ═══════════════════════════════════════════════════════════════
// ACCEPTANCE 4: Switching 4 → 2 → 4 preserves correct target
// identities and contracts.
// ═══════════════════════════════════════════════════════════════

test("A4. 4 → 2 → 4 target-bank identity switching preserves correct identities and contracts", async () => {
  const FP_4 = 'base-design-4sub';
  const FP_2 = 'base-design-2sub';
  const contract4 = makeAuthoritativeContract({ fingerprint: 'fp-cal-4a', targetKey: 'minimum-L3' });
  const contract2 = makeAuthoritativeContract({ fingerprint: 'fp-cal-2a', targetKey: 'minimum-L3' });

  // Step 1: 4-sub design completes.
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, FP_4, 'minimum-L3', contract4, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);
  let id = getTargetBankIdentity(PROJECT_ID, VERSION_ID);
  assert.equal(id.baseDesignFingerprint, FP_4, "step 1 identity is 4-sub");
  assert.equal(id.count, 1, "step 1 has 1 prepared target");

  // Step 2: switch to 2-sub design.
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, FP_2, 'minimum-L3', contract2, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);
  id = getTargetBankIdentity(PROJECT_ID, VERSION_ID);
  assert.equal(id.baseDesignFingerprint, FP_2, "step 2 identity is 2-sub");
  assert.equal(id.count, 1, "step 2 has 1 prepared target");

  // The 4-sub contract must NOT be returned for the 2-sub design (different base).
  assert.equal(getTargetCacheEntry(PROJECT_ID, VERSION_ID, FP_2, 'minimum-L3')?.selectedCandidateId, 'cand-minimum-L3');
  assert.equal(getTargetCacheEntry(PROJECT_ID, VERSION_ID, FP_4, 'minimum-L3'), null, "4-sub contract not visible under 2-sub base identity");

  // Step 3: return to 4-sub design — restore the 4-sub bank snapshot.
  const snap4 = getTargetBankSnapshot(PROJECT_ID, VERSION_ID);
  // The snapshot belongs to 2-sub now; restore the 4-sub contract explicitly.
  restoreTargetBankSnapshot(PROJECT_ID, VERSION_ID, FP_4, { 'minimum-L3': contract4 });
  await waitForWriteToSettle(PROJECT_ID);
  id = getTargetBankIdentity(PROJECT_ID, VERSION_ID);
  assert.equal(id.baseDesignFingerprint, FP_4, "step 3 identity restored to 4-sub");
  assert.equal(id.count, 1, "step 3 has 1 prepared target");
  assert.ok(getTargetCacheEntry(PROJECT_ID, VERSION_ID, FP_4, 'minimum-L3'), "4-sub contract recovered after return");
});

// ═══════════════════════════════════════════════════════════════
// ACCEPTANCE 5: Restore and cold reopening can recover the
// relevant completed result.
// ═══════════════════════════════════════════════════════════════

test("A5. Snapshot capture + restore recovers the completed result", async () => {
  const contract = makeAuthoritativeContract({ fingerprint: 'fp-cal-H', targetKey: 'minimum-L3' });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);

  // Capture a snapshot (Restore Previous Design checkpoint).
  const snapshot = getTargetBankSnapshot(PROJECT_ID, VERSION_ID);
  assert.ok(snapshot, "snapshot must be captured");
  assert.equal(snapshot.baseDesignFingerprint, BASE_DESIGN_FP);
  assert.equal(snapshot.count, 1);
  assert.ok(snapshot.targets['minimum-L3']);

  // Simulate a design move that wipes the bank, then restore.
  _resetTargetCacheForTest();
  restoreTargetBankSnapshot(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, snapshot.targets);
  await waitForWriteToSettle(PROJECT_ID);

  const restored = getTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L3');
  assert.ok(restored, "restored target must be available");
  assert.equal(restored.selectedCandidateId, 'cand-minimum-L3');
});

test("A5b. Cold reopen (hydrate) recovers the persisted completed result", async () => {
  const contract = makeAuthoritativeContract({ fingerprint: 'fp-cal-I', targetKey: 'minimum-L3' });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);

  // Cold reopen: reset in-memory state and hydrate from DB.
  _resetTargetCacheForTest();
  await hydrateTargetCache(PROJECT_ID, VERSION_ID);

  const restored = getTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L3');
  assert.ok(restored, "hydrate must recover the completed result");
  assert.equal(restored.selectedCandidateId, 'cand-minimum-L3');
});

// ═══════════════════════════════════════════════════════════════
// ACCEPTANCE 6: The change cannot cause stale target evidence to
// be accepted as current.
// ═══════════════════════════════════════════════════════════════

test("A6. Stale target evidence is NOT accepted as current (mismatched baseDesign returns null)", async () => {
  const contract = makeAuthoritativeContract({ fingerprint: 'fp-cal-J', targetKey: 'minimum-L3' });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);

  // A different baseDesignFingerprint must NOT see the stored target.
  const stale = getTargetCacheEntry(PROJECT_ID, VERSION_ID, 'base-design-DIFFERENT', 'minimum-L3');
  assert.equal(stale, null, "stale target must not be returned for a different baseDesign");

  // Diagnostic digest changes do not bypass the baseDesign gate.
  setFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-J', { layout: 'changed' });
  const stillStale = getTargetCacheEntry(PROJECT_ID, VERSION_ID, 'base-design-DIFFERENT', 'minimum-L3');
  assert.equal(stillStale, null, "diagnostic change must not make stale evidence current");
});

test("A6b. Diagnostic-only change does not alter target-bank identity or count", async () => {
  const contract = makeAuthoritativeContract({ fingerprint: 'fp-cal-K', targetKey: 'minimum-L3' });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, BASE_DESIGN_FP, 'minimum-L3', contract, { immediate: true });
  await waitForWriteToSettle(PROJECT_ID);

  const idBefore = getTargetBankIdentity(PROJECT_ID, VERSION_ID);
  setFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-K', { layout: '4-sub' });
  setFingerprintInputDigest(PROJECT_ID, VERSION_ID, 'fp-cal-K', { layout: '2-sub' });
  const idAfter = getTargetBankIdentity(PROJECT_ID, VERSION_ID);

  assert.equal(idAfter.baseDesignFingerprint, idBefore.baseDesignFingerprint, "identity unchanged by diagnostics");
  assert.equal(idAfter.count, idBefore.count, "count unchanged by diagnostics");
});