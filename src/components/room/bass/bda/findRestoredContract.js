// findRestoredContract.js
//
// Pure search-order helper for the Restore Previous Design transaction.
// Searches the established engineering-contract recovery paths in a controlled
// order and returns the first entry whose result fingerprint matches the
// restored calculation fingerprint:
//
//   1. Exact-fingerprint completed-contract cache (completed_by_fingerprint).
//   2. P14 target bank — via the existing exact-fingerprint reconciliation
//      helper, so a contract the capped completed map has evicted is found.
//   3. Checkpoint target-bank snapshot, if it carries a matching entry.
//
// This module does NOT validate the contract's authority, grade its metrics,
// or promote anything. The caller (restorePreviousDesign) performs the
// existing isAuthoritativeBassContract + publishCachedCompactBassContract
// validation/promotion. It reuses the existing reconciliation helper and
// does not create a second authority system.

import { findSavedContractForFingerprint } from "@/components/room/bass/bassIdentityReconciliation";

export const RESTORE_CONTRACT_SOURCE = Object.freeze({
  COMPLETED: "completed_by_fingerprint",
  BANK: "target_cache",
  CHECKPOINT: "checkpoint_snapshot",
});

/**
 * Find a recovered engineering contract for one exact result fingerprint.
 *
 * @param {object} input
 * @param {object|null} input.completedByFingerprint - the persisted completed snapshot map
 * @param {object|null} input.bankTargets - the P14 target bank targets object
 * @param {object|null} input.checkpointSnapshot - the checkpoint's target-bank snapshot
 * @param {string|null} input.fingerprint - the restored calculation fingerprint
 * @returns {{ contract: object|null, source: string|null }}
 */
export function findRestoredContract({
  completedByFingerprint = null,
  bankTargets = null,
  checkpointSnapshot = null,
  fingerprint = null,
} = {}) {
  if (!fingerprint) return { contract: null, source: null };

  // (1) + (2) completed cache + P14 target bank — the existing helper.
  const match = findSavedContractForFingerprint({
    completedByFingerprint,
    bankTargets,
    fingerprint,
  });
  if (match?.contract && match.contract.job?.resultFingerprint === fingerprint) {
    return { contract: match.contract, source: match.source };
  }

  // (3) Checkpoint target-bank snapshot — a deep-cloned bank carried at capture
  // time. Scan its entries for the restored fingerprint.
  if (checkpointSnapshot && typeof checkpointSnapshot === "object") {
    for (const entry of Object.values(checkpointSnapshot)) {
      if (entry?.job?.resultFingerprint === fingerprint) {
        return { contract: entry, source: RESTORE_CONTRACT_SOURCE.CHECKPOINT };
      }
    }
  }

  return { contract: null, source: null };
}