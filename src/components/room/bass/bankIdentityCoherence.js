// bankIdentityCoherence.js
//
// PURE identity policy for the P14 target bank vs the physical base design.
//
// The target bank is a PREPARATION cache keyed by the physical design's
// baseDesign fingerprint. It may legitimately be empty or partial — background
// preparation is explicitly incomplete — but it must never be counted as
// prepared for a design it does not belong to. That identity confusion is what
// allowed "Performance is current" to be shown after a Restore Previous Design
// while the bank still carried the moved (four-sub) design's fingerprint.
//
// This module holds ONLY the identity rules. It does NOT touch:
//   - bass maths, EQ, P14/P18/P19/P20 metrics, RP22 thresholds or grading
//   - the cache schema, target definitions, contract builder or fingerprints
//   - ADI, the graph shell, or the optimiser.
//
// Pure functions only: no React, no cache writes, no side effects.

import { BASS_LIFECYCLE_STATE } from "./bassCalculationLifecycle";

// Reason codes shared with callers/diagnostics.
export const BANK_BASE_DESIGN_MISMATCH_REASON = "bank-base-design-mismatch";
export const RESTORE_BANK_MISMATCH_REASON = "bank-snapshot-base-design-mismatch";

function preparedCountOf(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}

/**
 * Is the in-memory target bank coherent with the physical design?
 *
 * Coherent when:
 *   - the bank holds no prepared target (preparation explicitly incomplete), or
 *   - the bank's baseDesign identity equals the current physical design's.
 *
 * A non-empty bank whose identity cannot be proven to belong to the current
 * design fails closed — it must never be presented as prepared.
 */
export function resolveBankIdentityCoherence({
  bankBaseDesignFingerprint = null,
  bankPreparedCount = 0,
  baseDesignFingerprint = null,
} = {}) {
  const preparedCount = preparedCountOf(bankPreparedCount);
  if (preparedCount <= 0) {
    return { coherent: true, foreign: false, preparedCount, reason: "bank-not-prepared" };
  }
  if (!baseDesignFingerprint) {
    return { coherent: true, foreign: false, preparedCount, reason: "design-identity-unavailable" };
  }
  const foreign = !bankBaseDesignFingerprint
    || bankBaseDesignFingerprint !== baseDesignFingerprint;
  return {
    coherent: !foreign,
    foreign,
    preparedCount,
    reason: foreign ? BANK_BASE_DESIGN_MISMATCH_REASON : "bank-matches-design",
  };
}

/**
 * Apply the bank-identity gate to a lifecycle state.
 *
 * Only a false COMPLETE ("Performance is current") is replaced — with the
 * existing "needs recalculation" state, because the prepared family must be
 * rebuilt for the current design. Active calculation states and genuine
 * terminal failures are left untouched: they already convey "not current" and
 * must stay truthful.
 */
export function resolveLifecycleWithBankIdentity(lifecycleState, coherence) {
  if (!coherence?.foreign) return lifecycleState;
  if (lifecycleState === BASS_LIFECYCLE_STATE.COMPLETE) {
    return BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION;
  }
  return lifecycleState;
}

/**
 * Decide whether a checkpoint may carry the in-memory target bank.
 *
 * The checkpoint's DESIGN identity must come from the physical design's
 * authority — never from the bank. The bank snapshot is carried only when the
 * bank actually belongs to that same design; otherwise the checkpoint honestly
 * records "no prepared bank for this design" (null / 0) instead of carrying a
 * foreign bank into the restore.
 */
export function resolveCheckpointBankCarry({
  bankBaseDesignFingerprint = null,
  bankPreparedCount = 0,
  designBaseDesignFingerprint = null,
} = {}) {
  const preparedCount = preparedCountOf(bankPreparedCount);
  const carriesBank = !!designBaseDesignFingerprint
    && !!bankBaseDesignFingerprint
    && bankBaseDesignFingerprint === designBaseDesignFingerprint
    && preparedCount > 0;
  return {
    carriesBank,
    reason: carriesBank
      ? "bank-matches-design"
      : (designBaseDesignFingerprint ? BANK_BASE_DESIGN_MISMATCH_REASON : "design-identity-unavailable"),
  };
}

/**
 * Decide whether the restore transaction may reinstate the checkpoint's bank
 * snapshot (and set the restore lock).
 *
 * A snapshot may only be restored when the promoted authoritative contract for
 * the restored design describes the SAME physical design as the checkpoint.
 * Restoring a foreign snapshot would pin another design's fingerprint into the
 * in-memory bank, blocking preparation for the restored design.
 */
export function resolveRestoreBankDecision({
  checkpointBaseDesignFingerprint = null,
  snapshotPreparedCount = 0,
  contractBaseDesignFingerprint = null,
} = {}) {
  const preparedCount = preparedCountOf(snapshotPreparedCount);
  if (preparedCount <= 0) {
    return { restoreBank: false, setLock: false, reason: "bank-not-prepared" };
  }
  if (!checkpointBaseDesignFingerprint) {
    return { restoreBank: false, setLock: false, reason: "design-identity-unavailable" };
  }
  if (!contractBaseDesignFingerprint
    || contractBaseDesignFingerprint !== checkpointBaseDesignFingerprint) {
    return { restoreBank: false, setLock: false, reason: RESTORE_BANK_MISMATCH_REASON };
  }
  return { restoreBank: true, setLock: true, reason: null };
}

/**
 * May the bridge seed the verified foreground target over the existing bank?
 *
 * Protective intent (never destroy a bank that can still become current) is
 * preserved: a non-empty bank belonging to the CURRENTLY PUBLISHED authority's
 * design is protected. A bank belonging to neither the current physical design
 * nor the published authority is orphan/foreign and is replaceable — otherwise
 * a restored design stays stuck behind the moved design's bank.
 */
export function shouldProtectBankFromSeed({
  bankBaseDesignFingerprint = null,
  bankPreparedCount = 0,
  baseDesignFingerprint = null,
  publishedAuthorityBaseDesignFingerprint = null,
} = {}) {
  const preparedCount = preparedCountOf(bankPreparedCount);
  if (preparedCount <= 0) return false;
  if (!bankBaseDesignFingerprint) return false;
  if (bankBaseDesignFingerprint === baseDesignFingerprint) return false;
  return !!publishedAuthorityBaseDesignFingerprint
    && bankBaseDesignFingerprint === publishedAuthorityBaseDesignFingerprint;
}