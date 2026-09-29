// test/bass-current-status-authority.test.mjs
//
// Focused tests proving the FALSE CURRENT + RESTORE STALL fixes:
//
//   1. Authority/bank mismatch blocks current — COMPLETE ("Performance is
//      current") is never resolved while the prepared bank belongs to another
//      design than the authority, even at 8/8.
//   2. Missing physical identity does NOT fail open — when the physical
//      baseDesign fingerprint is unavailable, a known authority/bank
//      disagreement still blocks current.
//   3. Coherent authority + bank + physical design (with the selected target
//      prepared) still allows current.
//   4. A restore that returns cache-miss / an empty bank exits Restoring and
//      reports an actionable state (restoring is never left set).
//   5. A coherent restored authority enables the target-bank rebuild through the
//      existing bridge seed + scheduler — no manual Update required.
//
// Run: node --import ./test/_alias-register.mjs test/bass-current-status-authority.test.mjs

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  resolveBankIdentityCoherence,
  resolveLifecycleWithBankIdentity,
  AUTHORITY_BANK_MISMATCH_REASON,
  SELECTED_TARGET_NOT_PREPARED_REASON,
} from "@/components/room/bass/bankIdentityCoherence";
import {
  BASS_LIFECYCLE_STATE,
  BASS_LIFECYCLE_COPY,
  deriveBassDisplayStatus,
} from "@/components/room/bass/bassCalculationLifecycle";
import {
  resolveRestoreExit,
  resolveRestoredAuthorityRebuild,
  RESTORE_OUTCOME,
} from "@/components/room/bass/bda/restoreRecoveryAuthority";
import {
  setTargetCacheEntry,
  getTargetBankIdentity,
  getTargetBankSnapshot,
  _resetTargetCacheForTest,
} from "@/components/room/bass/p14TargetCache";
import {
  publishCachedCompactBassContract,
  _resetCompletedBassStoreForTest,
} from "@/components/room/bass/completedBassResultStore";
import { restorePreviousDesign } from "@/components/room/bass/bda/bdaCheckpointAuthority";
import {
  captureCheckpoint,
  clearCheckpoint,
} from "@/components/room/bass/bda/previousDesignCheckpoint";
import {
  setRestoring,
  isRestoring,
  _resetRestoreStateForTest,
} from "@/components/room/bass/bda/restoreStateStore";
import { buildCanonicalBassResult } from "@/components/room/bass/canonicalBassResult";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "@/lib/bassAuthorityVersion";

const PROJECT_ID = "test-project-current-status";
const VERSION_ID = "test-version-current-status";

const DESIGN_A = "basedesign::two-sub";
const DESIGN_B = "basedesign::four-sub";

const P18_HZ = 30;
const TARGET_DB_MAP = {
  "minimum-L1": 109, "minimum-L2": 112, "minimum-L3": 115, "minimum-L4": 118,
  "recommended-L1": 114, "recommended-L2": 117, "recommended-L3": 120, "recommended-L4": 123,
};

// Minimal contract that passes the target-cache gates (structural + canonical
// publication + envelope authority + graph payload + P19 readiness) and carries
// the design identity in fingerprints.baseDesign.
function makeContract({ fingerprint = "fp-cal-1", targetKey = "minimum-L2", baseDesign = DESIGN_A } = {}) {
  const basis = targetKey.split("-")[0];
  const level = parseInt(targetKey.split("-")[1].slice(1), 10);
  const db = TARGET_DB_MAP[targetKey] || 112;
  const curve = [{ freq: 20, db: 0 }, { freq: 30, db: -1 }];
  const contract = {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    instanceAuthorityVersion: 4,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    selectedCandidateId: `cand-${targetKey}`,
    selectedCandidate: {
      id: `cand-${targetKey}`,
      candidateId: `cand-${targetKey}`,
      achievedP18FrequencyHz: P18_HZ,
      perSeatP19Results: [],
      perSeatP20Results: [{ seatId: "seat-1", variationDbRaw: 2.5, level: 4 }],
    },
    selectedP14TargetDb: db,
    selectedP14TargetBasis: basis,
    selectedP14Level: level,
    fingerprints: { baseDesign },
    provenance: { realSeatCount: 1, primarySeatIds: ["seat-1"] },
    metricPublication: {
      canonicalMetricPublicationValid: true,
      publicationRejectionReason: null,
    },
    assessmentEnvelope: {
      achievedP18FrequencyHz: P18_HZ,
      achievedP18Bounded: true,
      assessmentStartHz: P18_HZ,
      assessmentEndHz: 120,
      officialP19WorstFrequencyHz: 35,
      p19TargetIdentity: "house-curve-target",
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
      postEqRspCurve: curve,
      referenceEq: curve,
      correctionCurve: [],
      productionHouseCurveTarget: curve,
      canonicalTargetCurve: curve,
      postEqPerSeatCurves: [[{ freq: 20, db: 0 }]],
      eqFilterBank: [{ freq: 25, gain: -2, q: 1 }],
    },
  };
  contract.bassResult = buildCanonicalBassResult(contract);
  return contract;
}

// The status decision is exactly: resolveLifecycleWithBankIdentity(rawState, coherence).
function lifecycleFor(rawState, coherence) {
  return resolveLifecycleWithBankIdentity(rawState, coherence);
}

beforeEach(() => {
  _resetTargetCacheForTest();
  _resetCompletedBassStoreForTest();
  _resetRestoreStateForTest();
  clearCheckpoint(PROJECT_ID, VERSION_ID);
});

// ═══════════════════════════════════════════════════════════════
// 1 — AUTHORITY / BANK MISMATCH BLOCKS CURRENT
// ═══════════════════════════════════════════════════════════════

test("1. authority baseDesign A + bank baseDesign B (8/8) never resolves to COMPLETE", () => {
  // The bank is real (written through the canonical cache API).
  const foreignContract = makeContract({ fingerprint: "fp-b", targetKey: "minimum-L2", baseDesign: DESIGN_B });
  assert.equal(setTargetCacheEntry(PROJECT_ID, VERSION_ID, DESIGN_B, "minimum-L2", foreignContract, { immediate: true }), true);
  const identity = getTargetBankIdentity(PROJECT_ID, VERSION_ID);
  assert.equal(identity.baseDesignFingerprint, DESIGN_B);
  assert.ok(identity.count > 0);

  const coherence = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: identity.baseDesignFingerprint,
    bankPreparedCount: identity.count,
    baseDesignFingerprint: DESIGN_A,
    authorityBaseDesignFingerprint: DESIGN_A,
    selectedTargetAvailable: true,
  });
  assert.equal(coherence.coherent, false);
  assert.equal(coherence.foreign, true);

  const lifecycle = lifecycleFor(BASS_LIFECYCLE_STATE.COMPLETE, coherence);
  assert.notEqual(lifecycle, BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(lifecycle, BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION);
  assert.notEqual(deriveBassDisplayStatus(lifecycle).text, BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.COMPLETE]);
});

// ═══════════════════════════════════════════════════════════════
// 2 — MISSING PHYSICAL IDENTITY DOES NOT FAIL OPEN
// ═══════════════════════════════════════════════════════════════

test("2. physical identity unavailable + authority A vs bank B → incoherent (no fail-open)", () => {
  const coherence = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: DESIGN_B,
    bankPreparedCount: 8,
    baseDesignFingerprint: null,
    authorityBaseDesignFingerprint: DESIGN_A,
    selectedTargetAvailable: true,
  });
  assert.equal(coherence.coherent, false, "a known authority/bank disagreement must not be treated as coherent");
  assert.equal(coherence.foreign, true);
  assert.equal(coherence.reason, AUTHORITY_BANK_MISMATCH_REASON);
  assert.notEqual(lifecycleFor(BASS_LIFECYCLE_STATE.COMPLETE, coherence), BASS_LIFECYCLE_STATE.COMPLETE);
});

test("2a. agreement is still provable without a physical identity (authority === bank)", () => {
  const coherence = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: DESIGN_A,
    bankPreparedCount: 8,
    baseDesignFingerprint: null,
    authorityBaseDesignFingerprint: DESIGN_A,
    selectedTargetAvailable: true,
  });
  assert.equal(coherence.coherent, true, "authority and bank agreeing proves coherence without the physical identity");
  assert.equal(coherence.reason, "authority-bank-agree");
  assert.equal(lifecycleFor(BASS_LIFECYCLE_STATE.COMPLETE, coherence), BASS_LIFECYCLE_STATE.COMPLETE);
});

test("2b. pre-hydration behaviour preserved — no authority identity, no physical identity", () => {
  const coherence = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: DESIGN_B,
    bankPreparedCount: 8,
    baseDesignFingerprint: null,
  });
  assert.equal(coherence.coherent, true, "nothing is known yet — the status must not be suppressed");
});

// ═══════════════════════════════════════════════════════════════
// 3 — COHERENT IDENTITIES ALLOW CURRENT
// ═══════════════════════════════════════════════════════════════

test("3. physical A + authority A + bank A + selected target prepared → COMPLETE", () => {
  const coherence = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: DESIGN_A,
    bankPreparedCount: 8,
    baseDesignFingerprint: DESIGN_A,
    authorityBaseDesignFingerprint: DESIGN_A,
    selectedTargetAvailable: true,
  });
  assert.equal(coherence.coherent, true);
  assert.equal(coherence.reason, "bank-matches-design");
  assert.equal(lifecycleFor(BASS_LIFECYCLE_STATE.COMPLETE, coherence), BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(deriveBassDisplayStatus(BASS_LIFECYCLE_STATE.COMPLETE).text, BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.COMPLETE]);
});

test("3a. selected target missing from a non-empty bank blocks current", () => {
  const coherence = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: DESIGN_A,
    bankPreparedCount: 4,
    baseDesignFingerprint: DESIGN_A,
    authorityBaseDesignFingerprint: DESIGN_A,
    selectedTargetAvailable: false,
  });
  assert.equal(coherence.coherent, false);
  assert.equal(coherence.reason, SELECTED_TARGET_NOT_PREPARED_REASON);
  assert.notEqual(lifecycleFor(BASS_LIFECYCLE_STATE.COMPLETE, coherence), BASS_LIFECYCLE_STATE.COMPLETE);
});

test("3b. empty bank → preparation not required, current still allowed", () => {
  const coherence = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: null,
    bankPreparedCount: 0,
    baseDesignFingerprint: DESIGN_A,
    authorityBaseDesignFingerprint: DESIGN_A,
    selectedTargetAvailable: false,
  });
  assert.equal(coherence.coherent, true);
  assert.equal(coherence.reason, "bank-not-prepared");
  assert.equal(lifecycleFor(BASS_LIFECYCLE_STATE.COMPLETE, coherence), BASS_LIFECYCLE_STATE.COMPLETE);
});

test("3c. only the false COMPLETE is replaced — active states stay truthful", () => {
  const foreign = resolveBankIdentityCoherence({
    bankBaseDesignFingerprint: DESIGN_B,
    bankPreparedCount: 8,
    baseDesignFingerprint: DESIGN_A,
    authorityBaseDesignFingerprint: DESIGN_A,
    selectedTargetAvailable: true,
  });
  assert.equal(resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.PREPARING, foreign), BASS_LIFECYCLE_STATE.PREPARING);
  assert.equal(resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.SEARCHING, foreign), BASS_LIFECYCLE_STATE.SEARCHING);
  assert.equal(resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.FAILED, foreign), BASS_LIFECYCLE_STATE.FAILED);
  assert.equal(resolveLifecycleWithBankIdentity(BASS_LIFECYCLE_STATE.TIMED_OUT, foreign), BASS_LIFECYCLE_STATE.TIMED_OUT);
});

// ═══════════════════════════════════════════════════════════════
// 4 — RESTORE ALWAYS EXITS RESTORING
// ═══════════════════════════════════════════════════════════════

test("4. restore cache-miss exits Restoring and reports an actionable state", async () => {
  const BASS_FP = "fp-cache-miss";
  captureCheckpoint(PROJECT_ID, VERSION_ID, {
    subwooferInstances: [{ id: "sub-1" }, { id: "sub-2" }],
    seatingPositions: [],
    bassFingerprint: BASS_FP,
    engineeringFingerprint: "eng-fp",
    includesSeating: false,
    baseDesignFingerprint: DESIGN_A,
    targetBankSnapshot: null,
    targetBankCount: 0,
  });

  const result = await restorePreviousDesign(PROJECT_ID, VERSION_ID, {
    commitInstances: () => {},
    commitSeating: undefined,
    sharedRef: { current: { cacheKey: BASS_FP } },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cache-miss");
  assert.equal(result.physicalRestored, true);

  // The bar's exit policy + its finally block.
  setRestoring(PROJECT_ID, VERSION_ID, true);
  assert.equal(isRestoring(PROJECT_ID, VERSION_ID), true);
  const exit = resolveRestoreExit(result);
  assert.equal(exit.outcome, RESTORE_OUTCOME.NEEDS_UPDATE);
  assert.equal(exit.releaseRestoring, true, "the restore transaction must always release Restoring");
  assert.equal(exit.showNeedsUpdate, true, "an actionable state must be shown");
  if (exit.releaseRestoring) setRestoring(PROJECT_ID, VERSION_ID, false);
  assert.equal(isRestoring(PROJECT_ID, VERSION_ID), false, "Restoring must not outlive the transaction");
});

test("4a. empty restored bank (ok=true) also exits Restoring — never stuck", () => {
  const exit = resolveRestoreExit({ ok: true, bankRestored: false, bankDesignMatches: true });
  assert.equal(exit.outcome, RESTORE_OUTCOME.NEEDS_UPDATE);
  assert.equal(exit.releaseRestoring, true);
  assert.equal(exit.showNeedsUpdate, true);
});

test("4b. every restore outcome releases Restoring", () => {
  const outcomes = [
    null,
    { ok: false, reason: "physical-restore-failed", physicalRestored: false },
    { ok: false, reason: "cache-miss", physicalRestored: true, bankRestored: false },
    { ok: false, reason: "fingerprint-not-ready", physicalRestored: true },
    { ok: false, reason: "authority-not-coherent", physicalRestored: true },
    { ok: false, reason: "promotion-failed", physicalRestored: true },
    { ok: false, reason: "bank-snapshot-base-design-mismatch", physicalRestored: true, bankRestored: false },
    { ok: true, bankRestored: true, bankDesignMatches: true },
    { ok: true, bankRestored: false, bankDesignMatches: false },
  ];
  outcomes.forEach((result) => {
    const exit = resolveRestoreExit(result);
    assert.equal(exit.releaseRestoring, true, `Restoring must be released for ${JSON.stringify(result)}`);
    const actionable = exit.showNeedsUpdate || exit.showRetry || exit.outcome === RESTORE_OUTCOME.CURRENT || exit.outcome === RESTORE_OUTCOME.NONE;
    assert.equal(actionable, true, `every outcome must be actionable: ${JSON.stringify(result)}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5 — RESTORED AUTHORITY REBUILDS THE BANK (PATH C)
// ═══════════════════════════════════════════════════════════════

test("5. coherent restored authority + foreign bank → rebuild eligible, no fresh optimiser run", () => {
  const BASS_FP = "fp-restored-a";
  // The bank still holds the moved design's prepared family.
  const foreignContract = makeContract({ fingerprint: "fp-b", targetKey: "minimum-L2", baseDesign: DESIGN_B });
  setTargetCacheEntry(PROJECT_ID, VERSION_ID, DESIGN_B, "minimum-L2", foreignContract, { immediate: true });
  assert.equal(getTargetBankIdentity(PROJECT_ID, VERSION_ID).baseDesignFingerprint, DESIGN_B);

  // The restored (design A) authority is published and current.
  const restoredContract = makeContract({ fingerprint: BASS_FP, targetKey: "minimum-L2", baseDesign: DESIGN_A });
  assert.equal(publishCachedCompactBassContract(PROJECT_ID, VERSION_ID, restoredContract, BASS_FP, null), true);

  const decision = resolveRestoredAuthorityRebuild({
    projectHydrationReady: true,
    authorityHydrationSettled: true,
    manualRequestActive: false,
    placementPreviewActive: false,
    baseDesignFingerprint: DESIGN_A,
    cacheKey: BASS_FP,
    contractAuthoritative: true,
    contractGraphComplete: true,
    contractResultFingerprint: BASS_FP,
    contractBaseDesignFingerprint: DESIGN_A,
    contractMatchesRequestedTarget: true,
    authorityAuthoritative: true,
    authorityCurrentFingerprint: BASS_FP,
    selectedTargetInBank: false,
    bankCoherent: false,
    familyResolved: 0,
    familyTotal: 8,
  });
  assert.equal(decision.eligible, true, "a coherent restored authority must be able to rebuild the bank");
  assert.equal(decision.bankNeedsRebuild, true);
  assert.equal(decision.reason, "restored-authority-bank-rebuild");

  // The existing bridge seed then writes the verified target (same code path).
  assert.equal(setTargetCacheEntry(PROJECT_ID, VERSION_ID, DESIGN_A, "minimum-L2", restoredContract, { immediate: true }), true);
  const bank = getTargetBankSnapshot(PROJECT_ID, VERSION_ID);
  assert.equal(bank.baseDesignFingerprint, DESIGN_A, "bank identity must switch to the restored design");
  assert.equal(bank.count, 1, "the restored foreground target is now prepared");
  assert.ok(bank.targets["minimum-L2"], "the scheduler can now fill the remaining targets");
});

test("5a. rebuild is not eligible when the bank is already complete / coherent", () => {
  const decision = resolveRestoredAuthorityRebuild({
    projectHydrationReady: true,
    authorityHydrationSettled: true,
    baseDesignFingerprint: DESIGN_A,
    cacheKey: "fp-a",
    contractAuthoritative: true,
    contractGraphComplete: true,
    contractResultFingerprint: "fp-a",
    contractBaseDesignFingerprint: DESIGN_A,
    contractMatchesRequestedTarget: true,
    authorityAuthoritative: true,
    authorityCurrentFingerprint: "fp-a",
    selectedTargetInBank: true,
    bankCoherent: true,
    familyResolved: 8,
    familyTotal: 8,
  });
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "bank-complete");
});

test("5b. rebuild refuses a non-current authority, a foreign design or active work", () => {
  const base = {
    projectHydrationReady: true,
    authorityHydrationSettled: true,
    baseDesignFingerprint: DESIGN_A,
    cacheKey: "fp-a",
    contractAuthoritative: true,
    contractGraphComplete: true,
    contractResultFingerprint: "fp-a",
    contractBaseDesignFingerprint: DESIGN_A,
    contractMatchesRequestedTarget: true,
    authorityAuthoritative: true,
    authorityCurrentFingerprint: "fp-a",
    selectedTargetInBank: false,
    bankCoherent: false,
    familyResolved: 0,
    familyTotal: 8,
  };
  assert.equal(resolveRestoredAuthorityRebuild({ ...base, authorityCurrentFingerprint: "fp-other" }).eligible, false);
  assert.equal(resolveRestoredAuthorityRebuild({ ...base, authorityAuthoritative: false }).eligible, false);
  assert.equal(resolveRestoredAuthorityRebuild({ ...base, contractBaseDesignFingerprint: DESIGN_B }).eligible, false);
  assert.equal(resolveRestoredAuthorityRebuild({ ...base, contractResultFingerprint: "fp-other" }).eligible, false);
  assert.equal(resolveRestoredAuthorityRebuild({ ...base, contractGraphComplete: false }).eligible, false);
  assert.equal(resolveRestoredAuthorityRebuild({ ...base, placementPreviewActive: true }).eligible, false);
  assert.equal(resolveRestoredAuthorityRebuild({ ...base, manualRequestActive: true }).eligible, false);
  assert.equal(resolveRestoredAuthorityRebuild({ ...base, authorityHydrationSettled: false }).eligible, false);
  assert.equal(resolveRestoredAuthorityRebuild({ ...base, projectHydrationReady: false }).eligible, false);
  // A physical move (foreign contract design) can never seed from a stale authority.
  assert.equal(resolveRestoredAuthorityRebuild({ ...base, baseDesignFingerprint: DESIGN_B }).eligible, false);
});