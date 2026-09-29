// test/restore-target-bank-identity-coherence.test.mjs
//
// Focused tests proving the restore / target-bank identity coherence fixes:
//
//   1. Crossed checkpoint capture — the checkpoint's DESIGN identity comes from
//      the physical design's authority (the coherent contract), never from the
//      in-memory target bank; a foreign bank snapshot is NOT carried.
//   2. Foreign bank snapshot rejected — the restore does not reinstate a bank
//      snapshot belonging to another physical design and does not set a foreign
//      restore lock. Physical restore still proceeds.
//   3. Current status blocked by a foreign bank — COMPLETE ("Performance is
//      current") is never resolved over a bank belonging to another design.
//   4. Orphan bank repair — a foreign/orphan bank is replaceable by the verified
//      foreground target, while a bank owned by the published authority stays
//      protected.
//
// Run: node --import ./test/_alias-register.mjs test/restore-target-bank-identity-coherence.test.mjs

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  resolveBankIdentityCoherence,
  resolveLifecycleWithBankIdentity,
  resolveCheckpointBankCarry,
  resolveRestoreBankDecision,
  shouldProtectBankFromSeed,
  RESTORE_BANK_MISMATCH_REASON,
} from "@/components/room/bass/bankIdentityCoherence";
import {
  BASS_LIFECYCLE_STATE,
  deriveBassDisplayStatus,
} from "@/components/room/bass/bassCalculationLifecycle";
import {
  setTargetCacheEntry,
  restoreTargetBankSnapshot,
  getRestoreLock,
  getTargetBankSnapshot,
  getTargetBankIdentity,
  _resetTargetCacheForTest,
} from "@/components/room/bass/p14TargetCache";
import {
  publishCachedCompactBassContract,
  _resetCompletedBassStoreForTest,
} from "@/components/room/bass/completedBassResultStore";
import {
  captureBeforeApply,
  restorePreviousDesign,
} from "@/components/room/bass/bda/bdaCheckpointAuthority";
import {
  captureCheckpoint,
  getCheckpoint,
  clearCheckpoint,
} from "@/components/room/bass/bda/previousDesignCheckpoint";
import { _resetRestoreStateForTest } from "@/components/room/bass/bda/restoreStateStore";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "@/lib/bassAuthorityVersion";

const PROJECT_ID = "test-project-bank-identity";
const VERSION_ID = "test-version-bank-identity";

const DESIGN_TWO_SUB = "basedesign::two-sub";
const DESIGN_THREE_SUB = "basedesign::three-sub";
const DESIGN_FOUR_SUB = "basedesign::four-sub";

const P18_HZ = 30;
const TARGET_DB_MAP = {
  "minimum-L1": 109, "minimum-L2": 112, "minimum-L3": 115, "minimum-L4": 118,
  "recommended-L1": 114, "recommended-L2": 117, "recommended-L3": 120, "recommended-L4": 123,
};

// Minimal contract that passes the target-cache gates (structural + canonical
// publication + envelope + graph payload + P19 readiness) and carries the
// physical design identity in fingerprints.baseDesign.
function makeContract({ fingerprint = "fp-cal-1", targetKey = "minimum-L2", baseDesign = DESIGN_TWO_SUB } = {}) {
  const basis = targetKey.split("-")[0];
  const level = parseInt(targetKey.split("-")[1].slice(1), 10);
  const db = TARGET_DB_MAP[targetKey] || 112;
  return {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    instanceAuthorityVersion: 4,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    selectedCandidateId: `cand-${targetKey}`,
    selectedCandidate: {
      candidateId: `cand-${targetKey}`,
      achievedP18FrequencyHz: P18_HZ,
      perSeatP19Results: [{ seatId: "seat-1", variationDbRaw: 2.5, level: 4 }],
      perSeatP20Results: [{ seatId: "seat-1", variationDbRaw: 2.5, level: 4 }],
    },
    selectedP14TargetDb: db,
    selectedP14TargetBasis: basis,
    selectedP14Level: level,
    fingerprints: { baseDesign },
    provenance: { realSeatCount: 1 },
    metricPublication: {
      canonicalMetricPublicationValid: true,
      publicationRejectionReason: null,
    },
    assessmentEnvelope: {
      achievedP18FrequencyHz: P18_HZ,
      achievedP18Bounded: true,
      assessmentStartHz: 30,
      assessmentEndHz: 120,
      officialP19WorstFrequencyHz: 35,
      p19TargetIdentity: "practical-calibration-target",
    },
    job: {
      status: "complete",
      resultFingerprint: fingerprint,
      currentJobFingerprint: fingerprint,
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      resultSchemaVersion: 32,
      elapsedMs: 5000,
    },
    productAnalysis: {
      parameters: {
        p14: { status: "complete", pass: true, achievedCapabilityDb: db, requestedTargetDb: db, headroomOrShortfallDb: 0 },
        p18: { status: "complete", value: P18_HZ },
        p19: { status: "complete", value: 2.5, level: 4 },
        p20: { status: "complete", value: 2.5, level: 4 },
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

const APP_STATE_TWO_SUB = {
  roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
  seatingPositions: [{ id: "seat-1", x: 2.25, y: 3.6 }],
  subwooferInstances: [{ id: "sub-1" }, { id: "sub-2" }],
  targetSpl: 85,
  splConfig: {},
};

beforeEach(() => {
  _resetTargetCacheForTest();
  _resetCompletedBassStoreForTest();
  _resetRestoreStateForTest();
  clearCheckpoint(PROJECT_ID, VERSION_ID);
});

// ═══════════════════════════════════════════════════════════════
// FIX 1 — CHECKPOINT USES DESIGN IDENTITY
// ═══════════════════════════════════════════════════════════════

test("1. crossed checkpoint: two-sub design + four-sub bank → checkpoint records the DESIGN identity and no bank", () => {
  // The in-memory bank belongs to the moved FOUR-sub design (non-empty).
  const fourSubContract = makeContract({ fingerprint: "fp-four-L2", targetKey: "minimum-L2", baseDesign: DESIGN_FOUR_SUB });
  const seeded = setTargetCacheEntry(PROJECT_ID, DESIGN_FOUR_SUB, "minimum-L2", fourSubContract, { immediate: true });
  assert.equal(seeded, true, "foreign bank must be non-empty for this test");
  assert.equal(getTargetBankIdentity(PROJECT_ID, VERSION_ID).baseDesignFingerprint, DESIGN_FOUR_SUB);

  // Capture for the TWO-sub physical design (coherent authority for that design).
  const captured = captureBeforeApply(PROJECT_ID, VERSION_ID, {
    appState: APP_STATE_TWO_SUB,
    completedBassAuthority: {
      authoritative: true,
      authorityStatus: "AUTHORITATIVE",
      currentFingerprint: "fp-two-sub",
      contract: {
        job: { resultFingerprint: "fp-two-sub" },
        fingerprints: { baseDesign: DESIGN_TWO_SUB },
      },
    },
    includesSeating: false,
    invocationSource: "test-crossed",
  });

  const checkpoint = getCheckpoint(PROJECT_ID, VERSION_ID);
  assert.equal(captured, true, "checkpoint must be captured");
  assert.ok(checkpoint, "checkpoint must exist");
  assert.equal(checkpoint.baseDesignFingerprint, DESIGN_TWO_SUB, "checkpoint identity must be the DESIGN's, not the bank's");
  assert.notEqual(checkpoint.baseDesignFingerprint, DESIGN_FOUR_SUB);
  assert.equal(checkpoint.targetBankSnapshot, null, "foreign bank snapshot must not be carried");
  assert.equal(checkpoint.targetBankCount, 0, "foreign bank must not be counted as prepared");
  assert.equal(checkpoint.subwooferInstances.length, 2, "physical instances still captured correctly");
});

test("1a. matching bank: checkpoint carries the bank snapshot for the same design", () => {
  const twoSubContract = makeContract({ fingerprint: "fp-two-L2", targetKey: "minimum-L2", baseDesign: DESIGN_TWO_SUB });
  setTargetCacheEntry(PROJECT_ID, DESIGN_TWO_SUB, "minimum-L2", twoSubContract, { immediate: true });

  captureBeforeApply(PROJECT_ID, VERSION_ID, {
    appState: APP_STATE_TWO_SUB,
    completedBassAuthority: {
      authoritative: true,
      authorityStatus: "AUTHORITATIVE",
      currentFingerprint: "fp-two-L2",
      contract: {
        job: { resultFingerprint: "fp-two-L2" },
        fingerprints: { baseDesign: DESIGN_TWO_SUB },
      },
    },
    invocationSource: "test-matching",
  });

  const checkpoint = getCheckpoint(PROJECT_ID, VERSION_ID);
  assert.equal(checkpoint.baseDesignFingerprint, DESIGN_TWO_SUB);
  assert.equal(checkpoint.targetBankCount, 1, "matching bank must be carried");
  assert.ok(checkpoint.targetBankSnapshot, "matching bank snapshot must be carried");
  assert.ok(checkpoint.targetBankSnapshot["minimum-L2"], "carried snapshot contains the prepared target");
});

test("1b. carry policy — foreign / empty / matching banks", () => {
  assert.equal(
    resolveCheckpointBankCarry({ bankBaseDesignFingerprint: DESIGN_FOUR_SUB, bankPreparedCount: 8, designBaseDesignFingerprint: DESIGN_TWO_SUB }).carriesBank,
    false,
    "foreign bank must not be carried",
  );
  assert.equal(
    resolveCheckpointBankCarry({ bankBaseDesignFingerprint: DESIGN_TWO_SUB, bankPreparedCount: 8, designBaseDesignFingerprint: DESIGN_TWO_SUB }).carriesBank,
    true,
    "matching bank must be carried",
  );
  assert.equal(
    resolveCheckpointBankCarry({ bankBaseDesignFingerprint: DESIGN_TWO_SUB, bankPreparedCount: 0, designBaseDesignFingerprint: DESIGN_TWO_SUB }).carriesBank,
    false,
    "nothing prepared must not be carried",
  );
  assert.equal(
    resolveCheckpointBankCarry({ bankBaseDesignFingerprint: DESIGN_FOUR_SUB, bankPreparedCount: 8, designBaseDesignFingerprint: null }).carriesBank,
    false,
    "unknown design identity must not carry a bank",
  );
});

// ═══════════════════════════════════════════════════════════════
// FIX 2 — FOREIGN BANK SNAPSHOT REJECTED
// ═══════════════════════════════════════════════════════════════

test("2. restore decision rejects a snapshot whose design differs from the promoted contract", () => {
  const decision = resolveRestoreBankDecision({
    checkpointBaseDesignFingerprint: DESIGN_FOUR_SUB,
    snapshotPreparedCount: 8,
    contractBaseDesignFingerprint: DESIGN_TWO_SUB,
  });
  assert.equal(decision.restoreBank, false, "foreign snapshot must not be restored");
  assert.equal(decision.setLock, false, "no foreign restore lock");
  assert.equal(decision.reason, RESTORE_BANK_MISMATCH_REASON);
});

test("2a. restore decision accepts a matching snapshot and skips empty / unknown cases", () => {
  const matching = resolveRestoreBankDecision({
    checkpointBaseDesignFingerprint: DESIGN_TWO_SUB,
    snapshotPreparedCount: 8,
    contractBaseDesignFingerprint: DESIGN_TWO_SUB,
  });
  assert.equal(matching.restoreBank, true);
  assert.equal(matching.setLock, true);
  assert.equal(matching.reason, null);

  const empty = resolveRestoreBankDecision({
    checkpointBaseDesignFingerprint: DESIGN_TWO_SUB,
    snapshotPreparedCount: 0,
    contractBaseDesignFingerprint: DESIGN_TWO_SUB,
  });
  assert.equal(empty.restoreBank, false);
  assert.equal(empty.reason, "bank-not-prepared");

  const unknown = resolveRestoreBankDecision({
    checkpointBaseDesignFingerprint: DESIGN_TWO_SUB,
    snapshotPreparedCount: 8,
    contractBaseDesignFingerprint: null,
  });
  assert.equal(unknown.restoreBank, false, "unproven contract identity must fail closed");
  assert.equal(unknown.setLock, false);
});

test("2b. restore: crossed checkpoint → physical restore proceeds, bank not reinstated, no foreign lock", async () => {
  const BASS_FP = "fp-two-sub-restored";
  // The in-memory bank is the moved FOUR-sub design's bank.
  const fourSubContract = makeContract({ fingerprint: "fp-four-L2", targetKey: "minimum-L2", baseDesign: DESIGN_FOUR_SUB });
  restoreTargetBankSnapshot(PROJECT_ID, VERSION_ID, DESIGN_FOUR_SUB, { "minimum-L2": fourSubContract });

  // Crossed checkpoint: TWO-sub instances, FOUR-sub identity + snapshot.
  captureCheckpoint(PROJECT_ID, VERSION_ID, {
    subwooferInstances: [{ id: "sub-1" }, { id: "sub-2" }],
    seatingPositions: [],
    bassFingerprint: BASS_FP,
    engineeringFingerprint: "eng-fp-two-sub",
    includesSeating: false,
    baseDesignFingerprint: DESIGN_FOUR_SUB,
    targetBankSnapshot: { "minimum-L2": fourSubContract },
    targetBankCount: 1,
  });

  // The restored (two-sub) design's authority is already authoritative.
  const restoredContract = makeContract({ fingerprint: BASS_FP, targetKey: "minimum-L2", baseDesign: DESIGN_TWO_SUB });
  assert.equal(
    publishCachedCompactBassContract(PROJECT_ID, VERSION_ID, restoredContract, BASS_FP, null),
    true,
    "restored design authority must be seeded",
  );

  const committed = [];
  const result = await restorePreviousDesign(PROJECT_ID, VERSION_ID, {
    commitInstances: (instances) => { committed.push(instances); },
    commitSeating: undefined,
    sharedRef: { current: { cacheKey: BASS_FP } },
  });

  assert.equal(committed.length, 1, "physical restore must proceed");
  assert.equal(result.physicalRestored, true);
  assert.equal(result.reason, RESTORE_BANK_MISMATCH_REASON, "mismatch reason must be reported");
  assert.equal(result.bankRestored, false);
  assert.equal(result.bankDesignMatches, false);
  assert.equal(getRestoreLock(PROJECT_ID, VERSION_ID), null, "no foreign restore lock may be set");
  assert.ok(getCheckpoint(PROJECT_ID, VERSION_ID), "checkpoint kept for retry");
});

test("2c. restore: matching checkpoint → bank snapshot reinstated and lock set for that design", async () => {
  const BASS_FP = "fp-two-sub-match";
  const twoSubContract = makeContract({ fingerprint: BASS_FP, targetKey: "minimum-L2", baseDesign: DESIGN_TWO_SUB });

  captureCheckpoint(PROJECT_ID, VERSION_ID, {
    subwooferInstances: [{ id: "sub-1" }, { id: "sub-2" }],
    seatingPositions: [],
    bassFingerprint: BASS_FP,
    engineeringFingerprint: "eng-fp-two-sub",
    includesSeating: false,
    baseDesignFingerprint: DESIGN_TWO_SUB,
    targetBankSnapshot: { "minimum-L2": twoSubContract },
    targetBankCount: 1,
  });

  assert.equal(
    publishCachedCompactBassContract(PROJECT_ID, VERSION_ID, twoSubContract, BASS_FP, null),
    true,
    "restored design authority must be seeded",
  );

  const result = await restorePreviousDesign(PROJECT_ID, VERSION_ID, {
    commitInstances: () => {},
    commitSeating: undefined,
    sharedRef: { current: { cacheKey: BASS_FP } },
  });

  assert.equal(result.ok, true, "matching restore must succeed");
  assert.equal(result.bankRestored, true);
  assert.equal(result.bankDesignMatches, true);
  const lock = getRestoreLock(PROJECT_ID, VERSION_ID);
  assert.ok(lock, "restore lock must be set for the restored design");
  assert.equal(lock.baseDesignFingerprint, DESIGN_TWO_SUB);
  assert.equal(
    getTargetBankSnapshot(PROJECT_ID, VERSION_ID).baseDesignFingerprint,
    DESIGN_TWO_SUB,
    "restored bank identity must be the restored design",
  );
  assert.equal(getCheckpoint(PROJECT_ID, VERSION_ID), null, "successful restore clears the checkpoint");
});

// ═══════════════════════════════════════════════════════════════
// FIX 3 — CURRENT BLOCKED BY FOREIGN BANK
// ═══════════════════════════════════════════════════════════════

test("3. foreign bank blocks COMPLETE — 'Performance is current' is never shown", () => {
  // Real cache read path: a non-empty bank for the four-sub design.
  const fourSubContract = makeContract({ fingerprint: "fp-four-L2", targetKey: "minimum-L2", baseDesign: DESIGN_FOUR_SUB });
  setTargetCacheEntry(PROJECT_ID, DESIGN_FOUR_SUB, "minimum-L2", fourSubContract, { immediate: true });
  const identity = getTargetBankIdentity(PROJECT_ID, VERSION_ID);
  assert.equal(identity.baseDesignFingerprint, DESIGN_FOUR_SUB);
  assert.equal(identity.count, 1);

  const coherence = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: identity.baseDesignFingerprint,
    bankPreparedCount: identity.count,
    baseDesignFingerprint: DESIGN_TWO_SUB,
  });
  assert.equal(coherence.foreign, true);
  assert.equal(coherence.coherent, false);

  const lifecycle = resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.COMPLETE, coherence);
  assert.notEqual(lifecycle, BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(lifecycle, BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION);
  assert.notEqual(deriveBassDisplayStatus(lifecycle).text, "Performance is current");
});

test("3a. matching, empty and partial banks still allow COMPLETE", () => {
  const matching = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: DESIGN_TWO_SUB, bankPreparedCount: 8, baseDesignFingerprint: DESIGN_TWO_SUB,
  });
  assert.equal(matching.coherent, true);
  assert.equal(resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.COMPLETE, matching), BASS_LIFECYCLE_STATE.COMPLETE);

  const empty = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: null, bankPreparedCount: 0, baseDesignFingerprint: DESIGN_TWO_SUB,
  });
  assert.equal(empty.coherent, true);
  assert.equal(resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.COMPLETE, empty), BASS_LIFECYCLE_STATE.COMPLETE);

  const partial = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: DESIGN_TWO_SUB, bankPreparedCount: 3, baseDesignFingerprint: DESIGN_TWO_SUB,
  });
  assert.equal(partial.coherent, true, "a partial bank for the current design is legitimate");
  assert.equal(resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.COMPLETE, partial), BASS_LIFECYCLE_STATE.COMPLETE);

  const unknownDesign = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: DESIGN_FOUR_SUB, bankPreparedCount: 8, baseDesignFingerprint: null,
  });
  assert.equal(unknownDesign.coherent, true, "pre-hydration design identity must not suppress the status");
});

test("3b. active calculation states are left untouched by the bank gate", () => {
  const foreign = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: DESIGN_FOUR_SUB, bankPreparedCount: 8, baseDesignFingerprint: DESIGN_TWO_SUB,
  });
  assert.equal(foreign.foreign, true);
  // Only the false COMPLETE is replaced — a genuine calculation keeps its state.
  assert.equal(resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.SEARCHING, foreign), BASS_LIFECYCLE_STATE.SEARCHING);
  assert.equal(resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.PREPARING, foreign), BASS_LIFECYCLE_STATE.PREPARING);
  assert.equal(resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.FAILED, foreign), BASS_LIFECYCLE_STATE.FAILED);
});

test("3c. identity comparison matrix", () => {
  assert.equal(resolveBankIdentityCoherence({ bankBaseDesignFingerprint: DESIGN_FOUR_SUB, bankPreparedCount: 8, baseDesignFingerprint: DESIGN_THREE_SUB }).foreign, true);
  assert.equal(resolveBankIdentityCoherence({ bankBaseDesignFingerprint: DESIGN_THREE_SUB, bankPreparedCount: 1, baseDesignFingerprint: DESIGN_THREE_SUB }).foreign, false);
  assert.equal(resolveBankIdentityCoherence({ bankBaseDesignFingerprint: null, bankPreparedCount: 4, baseDesignFingerprint: DESIGN_TWO_SUB }).foreign, true, "prepared entries without a provable identity fail closed");
});

// ═══════════════════════════════════════════════════════════════
// FIX 4 — ORPHAN BANK REPAIR
// ═══════════════════════════════════════════════════════════════

test("4. orphan bank (neither current design nor published authority) is replaceable", () => {
  const protectedSeed = shouldProtectBankFromSeed({
    bankBaseDesignFingerprint: DESIGN_FOUR_SUB,
    bankPreparedCount: 8,
    baseDesignFingerprint: DESIGN_TWO_SUB,
    publishedAuthorityBaseDesignFingerprint: DESIGN_TWO_SUB,
  });
  assert.equal(protectedSeed, false, "orphan bank must not block the verified foreground seed");
});

test("4a. a bank owned by the published authority stays protected", () => {
  const protectedSeed = shouldProtectBankFromSeed({
    bankBaseDesignFingerprint: DESIGN_FOUR_SUB,
    bankPreparedCount: 8,
    baseDesignFingerprint: DESIGN_THREE_SUB,
    publishedAuthorityBaseDesignFingerprint: DESIGN_FOUR_SUB,
  });
  assert.equal(protectedSeed, true);
});

test("4b. seed policy — current / empty / unproven banks", () => {
  assert.equal(shouldProtectBankFromSeed({
    bankBaseDesignFingerprint: DESIGN_TWO_SUB, bankPreparedCount: 8, baseDesignFingerprint: DESIGN_TWO_SUB,
    publishedAuthorityBaseDesignFingerprint: DESIGN_TWO_SUB,
  }), false, "a bank already matching the current design is not a downgrade");

  assert.equal(shouldProtectBankFromSeed({
    bankBaseDesignFingerprint: DESIGN_FOUR_SUB, bankPreparedCount: 0, baseDesignFingerprint: DESIGN_TWO_SUB,
    publishedAuthorityBaseDesignFingerprint: DESIGN_FOUR_SUB,
  }), false, "an empty bank holds nothing to protect");

  assert.equal(shouldProtectBankFromSeed({
    bankBaseDesignFingerprint: null, bankPreparedCount: 3, baseDesignFingerprint: DESIGN_TWO_SUB,
    publishedAuthorityBaseDesignFingerprint: null,
  }), false, "an unproven bank is replaceable");
});