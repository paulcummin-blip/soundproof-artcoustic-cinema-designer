// retestPreflightAuthority.js
// ---------------------------------------------------------------------------
// Re-test Bass Optimisation preflight: decide whether to REUSE the current
// authoritative bass baseline or RECALCULATE before starting the optimiser
// search.
//
// PROVEN DEFECT: the Re-test route (runCalibrationAutoApply → handleStart)
// unconditionally called onCalculate() then waited for the current bass
// publication BEFORE starting the optimiser search — even when the bass
// authority was already authoritative, current and fingerprint-matched. On the
// audited Case C baseline that wasted ~27.4 s of pre-search work for no new
// engineering authority.
//
// CORE RULE — reuse the existing bass authority when ALL of:
//   1. authoritative bass result exists (authorityStatus === AUTHORITATIVE)
//   2. authoritative result is current (published result fingerprint matches
//      the current design fingerprint)
//   3. required baseline evidence for the optimiser exists (selectedCandidate,
//      the P19/P20 baseline the optimiser ranks against)
//
// If ANY condition fails, take the slow path (calculate → wait for current
// publication → start search). This is a READ of the existing currentness
// authority: it never creates a new bass publication, never recalculates, and
// never changes the baseline identity the optimiser receives.
//
// Reuses the SAME currentness check the rest of the app already uses
// (hasPublishedCurrentDesign / resolveBassAuthorityState's resultIsCurrent):
//   authorityStatus === AUTHORITATIVE && resultFingerprint === cacheKey
//
// PURE: no React, no stores, no calculation. It reads an already-resolved
// shared bass authority and returns one decision.
// ---------------------------------------------------------------------------

/**
 * Whether the Re-test preflight can skip onCalculate + waitForCurrentPublication
 * and start the optimiser search directly against the existing authoritative
 * bass result.
 *
 * @param {object|null} shared - the shared bass authority object (the live
 *   `sharedRef.current` from the bass analysis owner)
 * @returns {{ reuse: boolean, reason: string, baselineIdentity: object|null }}
 *   reuse — true when the fast path may be taken
 *   reason — why (diagnostic only; never user-facing)
 *   baselineIdentity — { projectId, versionId, resultFingerprint, designFingerprint,
 *     authorityReference } describing the baseline the optimiser will reuse, when
 *     reuse is true; null otherwise
 */
export function canReuseCurrentBaselineForOptimiser(shared) {
  const authority = shared?.completedBassAuthority || null;
  const authorityStatus = authority?.authorityStatus || null;
  const contract = authority?.contract || null;
  const resultFingerprint = contract?.job?.resultFingerprint || null;
  const designFingerprint = shared?.cacheKey || null;
  const baselineEvidencePresent = !!contract?.selectedCandidate;

  // 1. Authoritative bass result must exist. STALE / UPDATING / UNCALCULATED /
  //    BLOCKED / ERROR / LOADING / NOT_VERIFIED all mean the authority is not
  //    the current published result for the design as it stands.
  if (authorityStatus !== "AUTHORITATIVE") {
    return {
      reuse: false,
      reason: authorityStatus ? `authority_status_${authorityStatus}` : "no_authority",
      baselineIdentity: null,
    };
  }

  // 2. The published result fingerprint must match the current design
  //    fingerprint. A mismatch means the design moved on after the result was
  //    published — the optimiser must not rank against a stale baseline.
  if (!resultFingerprint || !designFingerprint || resultFingerprint !== designFingerprint) {
    return {
      reuse: false,
      reason: "fingerprint_mismatch",
      baselineIdentity: null,
    };
  }

  // 3. Required optimiser baseline evidence (selectedCandidate — the P19/P20
  //    baseline the optimiser ranks against) must be present.
  if (!baselineEvidencePresent) {
    return {
      reuse: false,
      reason: "missing_baseline_evidence",
      baselineIdentity: null,
    };
  }

  return {
    reuse: true,
    reason: "authoritative_current_match",
    baselineIdentity: {
      resultFingerprint,
      designFingerprint,
      authorityReference: authority?.authorityStatus || null,
    },
  };
}