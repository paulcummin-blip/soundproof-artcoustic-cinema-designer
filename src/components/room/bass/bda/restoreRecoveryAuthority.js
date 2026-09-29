// restoreRecoveryAuthority.js
//
// PURE policy for the restore → rebuild handoff of the Bass status authority.
// Two decisions live here, extracted so they are testable without React and so
// the Restore bar and BassBackgroundAnalysisOwner stay thin:
//
//   1. resolveRestoreExit(result)
//      Every restore transaction outcome (cache-miss, unprovable/empty bank,
//      promotion failure, fingerprint not ready, physical failure) maps to a
//      VISIBLE, ACTIONABLE state. Restoring ALWAYS ends when the transaction
//      returns — nothing here may keep the shared restoring flag set. The
//      transaction itself is internally bounded (RESTORE_TIMEOUT_MS).
//
//   2. resolveRestoredAuthorityRebuild(inputs)
//      Foreground-ready Path C: a coherent restored/published authority for the
//      CURRENT design and target proves the foreground target is already
//      reusable. When the prepared target bank is missing, empty, foreign or
//      incomplete, that authority alone is sufficient to rebuild the bank via
//      the EXISTING bridge seed + background scheduler — no fresh optimiser run
//      (and no manual Update) is required.
//
// This module holds only these two policies. It does NOT touch bass maths, EQ,
// P14/P18/P19/P20 metrics, RP22 thresholds or grading, the cache schema, target
// definitions, the contract builder, fingerprints, ADI, the graph shell, the
// preview seat selector, or the optimiser. Pure functions only: no React, no
// cache writes, no side effects.

export const RESTORE_OUTCOME = Object.freeze({
  /** Restore complete and the prepared family belongs to the restored design. */
  CURRENT: "current",
  /** Physical design restored; the prepared family must be rebuilt. */
  NEEDS_UPDATE: "needs-update",
  /** Nothing was restored — the checkpoint is kept for a retry. */
  RETRY: "retry",
  /** No restore transaction has returned. */
  NONE: "none",
});

/**
 * Map a returned restore transaction to the visible state the designer sees.
 *
 * @param {object|null} result - value returned by restorePreviousDesign()
 * @returns {{
 *   outcome: string,
 *   releaseRestoring: boolean,
 *   showNeedsUpdate: boolean,
 *   showRetry: boolean,
 *   needsBankRebuild: boolean,
 *   reason: string|null,
 * }}
 */
export function resolveRestoreExit(result) {
  if (!result || typeof result !== "object") {
    return {
      outcome: RESTORE_OUTCOME.NONE,
      releaseRestoring: true,
      showNeedsUpdate: false,
      showRetry: false,
      needsBankRebuild: false,
      reason: null,
    };
  }

  // The physical design was NOT restored (failed / threw). The transaction keeps
  // the checkpoint in that case, so the actionable state is "retry". A
  // successful transaction (ok === true) always implies the physical design was
  // restored, even when it does not carry the flag explicitly.
  const physicallyRestored = result.ok === true || result.physicalRestored === true;
  if (!physicallyRestored) {
    return {
      outcome: RESTORE_OUTCOME.RETRY,
      releaseRestoring: true,
      showNeedsUpdate: false,
      showRetry: true,
      needsBankRebuild: false,
      reason: result.reason || "restore-failed",
    };
  }

  const bankRestored = result.bankRestored !== false;
  if (result.ok !== true || !bankRestored) {
    // Physical design restored, prepared family not (or not provably) restored.
    // The restore transaction has returned: it must exit into the actionable
    // "needs update / preparing target results" state, never stay Restoring.
    return {
      outcome: RESTORE_OUTCOME.NEEDS_UPDATE,
      releaseRestoring: true,
      showNeedsUpdate: true,
      showRetry: false,
      needsBankRebuild: true,
      reason: result.reason || (bankRestored ? "restore-incomplete" : "bank-empty"),
    };
  }

  return {
    outcome: RESTORE_OUTCOME.CURRENT,
    releaseRestoring: true,
    showNeedsUpdate: false,
    showRetry: false,
    needsBankRebuild: false,
    reason: null,
  };
}

/**
 * Foreground-ready Path C — may the prepared target bank be rebuilt from a
 * coherent restored/published authority alone?
 *
 * @param {object} inputs
 * @param {boolean} inputs.projectHydrationReady
 * @param {boolean} inputs.authorityHydrationSettled
 * @param {boolean} inputs.manualRequestActive
 * @param {boolean} inputs.placementPreviewActive
 * @param {string|null} inputs.baseDesignFingerprint - physical/base design identity
 * @param {string|null} inputs.cacheKey - current full result fingerprint (design + target)
 * @param {boolean} inputs.contractAuthoritative
 * @param {boolean} inputs.contractGraphComplete
 * @param {string|null} inputs.contractResultFingerprint
 * @param {string|null} inputs.contractBaseDesignFingerprint
 * @param {boolean} inputs.contractMatchesRequestedTarget
 * @param {boolean} inputs.authorityAuthoritative
 * @param {string|null} inputs.authorityCurrentFingerprint
 * @param {boolean} inputs.selectedTargetInBank
 * @param {boolean} inputs.bankCoherent
 * @param {number} inputs.familyResolved
 * @param {number} inputs.familyTotal
 */
export function resolveRestoredAuthorityRebuild({
  projectHydrationReady = false,
  authorityHydrationSettled = false,
  manualRequestActive = false,
  placementPreviewActive = false,
  baseDesignFingerprint = null,
  cacheKey = null,
  contractAuthoritative = false,
  contractGraphComplete = false,
  contractResultFingerprint = null,
  contractBaseDesignFingerprint = null,
  contractMatchesRequestedTarget = false,
  authorityAuthoritative = false,
  authorityCurrentFingerprint = null,
  selectedTargetInBank = false,
  bankCoherent = true,
  familyResolved = 0,
  familyTotal = 0,
} = {}) {
  const bankNeedsRebuild = !bankCoherent
    || (familyTotal > 0 && familyResolved < familyTotal);
  const blocked = (reason) => ({
    eligible: false,
    bankNeedsRebuild,
    reason,
  });

  if (!projectHydrationReady || !authorityHydrationSettled) return blocked("hydration-not-settled");
  if (manualRequestActive) return blocked("manual-request-active");
  if (placementPreviewActive) return blocked("placement-preview-active");
  if (!baseDesignFingerprint || !cacheKey) return blocked("design-identity-unavailable");
  if (!contractAuthoritative || !contractGraphComplete) return blocked("authority-not-usable");
  if (contractResultFingerprint !== cacheKey) return blocked("result-fingerprint-mismatch");
  if (!contractMatchesRequestedTarget) return blocked("target-identity-mismatch");
  if (contractBaseDesignFingerprint !== baseDesignFingerprint) return blocked("design-identity-mismatch");
  // The authority must be current for THIS design AND target — otherwise the
  // bridge seed would promote a result the designer is not looking at.
  if (!authorityAuthoritative || authorityCurrentFingerprint !== cacheKey) return blocked("authority-not-current");
  if (!bankNeedsRebuild) return blocked("bank-complete");
  if (selectedTargetInBank) return blocked("target-already-prepared");

  return {
    eligible: true,
    bankNeedsRebuild: true,
    reason: "restored-authority-bank-rebuild",
  };
}