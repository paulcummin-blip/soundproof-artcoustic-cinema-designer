// tradeOffVerificationAuthority.js
//
// Trade-off Apply verification authority.
//
// Replaces the fixed 800ms timer as the VERIFIED APPLIED authority.
// VERIFIED APPLIED must only appear after a new authoritative bass result
// has completed for the applied design. This module checks:
//
//   1. Applied tuning is present and matches the graded candidate (isApplied).
//   2. Current design fingerprint reflects the applied tuning (the fingerprint
//      includes tuning, so isApplied === true implies this).
//   3. A completed/publication-valid bass result exists for that fingerprint
//      (completedBassAuthority.authoritative === true AND
//       currentFingerprint === liveCacheKey).
//   4. The resulting P14/P18/P19/P20 values are available in the contract.
//   5. Only then → "verified".
//
// While waiting → "recalculating".
// If recalculation fails or becomes stale → "failed".
//
// This module is PURE — no side effects, no timers. It reads the shared bass
// results state and returns a deterministic verification status.

const VERIFICATION_RECALCULATING = "recalculating";
const VERIFICATION_VERIFIED = "verified";
const VERIFICATION_FAILED = "failed";

/**
 * Extract verified after-values from a completed bass authority contract.
 * Returns null if the required P14/P18/P19/P20 values are not available.
 *
 * @param {object} completedBassAuthority - the authoritative bass result
 * @returns {object|null} verified after-values or null
 */
function extractVerifiedValues(completedBassAuthority) {
  if (!completedBassAuthority || !completedBassAuthority.contract) return null;
  const contract = completedBassAuthority.contract;
  const selectedCandidate = contract.selectedCandidate || {};

  // Per-seat P19/P20 results must exist
  const perSeatP19Results = Array.isArray(selectedCandidate.perSeatP19Results)
    ? selectedCandidate.perSeatP19Results
    : [];
  const perSeatP20Results = Array.isArray(selectedCandidate.perSeatP20Results)
    ? selectedCandidate.perSeatP20Results
    : [];
  if (perSeatP19Results.length === 0 || perSeatP20Results.length === 0) return null;

  // P14 achieved level must be available
  const p14AchievedLevel = selectedCandidate.p14AchievedLevel
    ?? selectedCandidate.achievedP14Level
    ?? contract.p14AchievedLevel
    ?? null;

  // P18 achieved extension must be available
  const p18AchievedExtensionHz = selectedCandidate.p18AchievedExtensionHz
    ?? selectedCandidate.achievedExtensionHz
    ?? contract.p18AchievedExtensionHz
    ?? null;

  // P14/P18 may be null if not yet calculated — but P19/P20 per-seat must exist
  return {
    perSeatP19Results,
    perSeatP20Results,
    p14AchievedLevel,
    p18AchievedExtensionHz,
    selectedCandidate,
  };
}

/**
 * Resolve the trade-off verification status from the shared bass results.
 *
 * @param {object} params
 * @param {boolean} params.isApplied - whether the applied tuning matches current instances
 * @param {object} params.shared - shared bass results store
 * @param {string|null} params.currentDesignFingerprint - the current V2 design fingerprint
 * @returns {{ status: string, verifiedValues: object|null, reason: string|null }}
 */
export function resolveTradeOffVerification({ isApplied, shared, currentDesignFingerprint: _currentDesignFingerprint }) {
  // Condition 1: Applied tuning must be present and match the graded candidate
  if (!isApplied) {
    return { status: VERIFICATION_RECALCULATING, verifiedValues: null, reason: "tuning-not-yet-applied" };
  }

  if (!shared) {
    return { status: VERIFICATION_RECALCULATING, verifiedValues: null, reason: "no-shared-results" };
  }

  // Check for calculation failure / stale
  const calculationOutcome = shared.calculationOutcome;
  const detailedStatus = shared.detailedStatus;
  const detailedError = shared.detailedError;

  // If the bass engine reported an error, verification fails
  if (calculationOutcome === "error" || detailedStatus === "ERROR") {
    return {
      status: VERIFICATION_FAILED,
      verifiedValues: null,
      reason: detailedError || "bass-calculation-error",
    };
  }

  // If the bass engine is still calculating, we're recalculating
  if (shared.calculationInProgress === true || detailedStatus === "CALCULATING" || detailedStatus === "PROCESSING") {
    return { status: VERIFICATION_RECALCULATING, verifiedValues: null, reason: "calculation-in-progress" };
  }

  const completedBassAuthority = shared.completedBassAuthority;
  const liveCacheKey = shared.cacheKey;

  // Condition 3: A completed/publication-valid bass result must exist
  if (!completedBassAuthority) {
    return { status: VERIFICATION_RECALCULATING, verifiedValues: null, reason: "no-completed-authority" };
  }

  if (completedBassAuthority.authoritative !== true) {
    // The authority exists but is not publication-valid (stale or downgraded)
    // Check if it's stale (fingerprint mismatch) → failed, or just not ready → recalculating
    if (completedBassAuthority.currentFingerprint && liveCacheKey
        && completedBassAuthority.currentFingerprint !== liveCacheKey) {
      return { status: VERIFICATION_RECALCULATING, verifiedValues: null, reason: "authority-fingerprint-stale-waiting-for-recalc" };
    }
    return { status: VERIFICATION_RECALCULATING, verifiedValues: null, reason: "authority-not-yet-publication-valid" };
  }

  // Condition 3 (continued): persisted currentFingerprint must match the live cacheKey
  if (!liveCacheKey || !completedBassAuthority.currentFingerprint) {
    return { status: VERIFICATION_RECALCULATING, verifiedValues: null, reason: "missing-fingerprint-identity" };
  }
  if (completedBassAuthority.currentFingerprint !== liveCacheKey) {
    // The authority is for a different design — the new result hasn't arrived yet
    return { status: VERIFICATION_RECALCULATING, verifiedValues: null, reason: "fingerprint-mismatch-waiting-for-new-result" };
  }

  // Condition 4: P14/P18/P19/P20 values must be available
  const verifiedValues = extractVerifiedValues(completedBassAuthority);
  if (!verifiedValues) {
    return { status: VERIFICATION_RECALCULATING, verifiedValues: null, reason: "metric-values-not-yet-available" };
  }

  // All conditions met — VERIFIED APPLIED
  return { status: VERIFICATION_VERIFIED, verifiedValues, reason: null };
}

export { VERIFICATION_RECALCULATING, VERIFICATION_VERIFIED, VERIFICATION_FAILED };