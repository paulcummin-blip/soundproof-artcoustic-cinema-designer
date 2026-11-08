// captureCoherenceAuthority.js
//
// Pure decision helper for captureBeforeApply (bdaCheckpointAuthority.js).
//
// Determines whether the retained engineering contract describes the CURRENT
// physical design, BEFORE the capture path is selected. A matching
// authoritative engineering contract may be captured with the physical design.
// A missing, stale, non-authoritative or fingerprint-mismatched engineering
// contract must NOT prevent capturing a valid physical baseline — it routes
// to the physical-only (uncalculated) capture path instead of blocking Apply.
//
// The strict fingerprint protection for engineering recovery is preserved here:
// a mismatched authoritative contract is never reported as coherent, so it is
// never captured as a coherent engineering state.
//
// Pure: no imports, no side effects. Fully unit-testable.

/**
 * @typedef {Object} CompletedBassAuthority
 * @property {boolean} [authoritative]     - true when the authority is COMPLETE/AUTHORITATIVE.
 * @property {boolean} [captureEligible]    - true when a STALE authority's contract baseDesign matches the current design.
 * @property {string} [authorityStatus]     - 'STALE' | 'COMPLETE' | etc.
 * @property {string} [currentFingerprint]  - the live design's current bass fingerprint.
 * @property {{ job?: { resultFingerprint?: string } } } [contract] - the retained bass contract.
 */

/**
 * Resolve capture coherence for a completed bass authority.
 *
 * @param {CompletedBassAuthority} completedBassAuthority
 * @returns {{
 *   isEngineeringCoherent: boolean,
 *   coherenceMode: 'authoritative-matched' | 'stale-capture-eligible' | null,
 *   fingerprintMatchesContract: boolean,
 *   hasContract: boolean,
 *   contractFingerprint: string | null,
 *   currentFingerprint: string | null,
 * }}
 */
export function resolveCaptureCoherence(completedBassAuthority) {
  const isCaptureEligible = !!completedBassAuthority?.captureEligible;
  const hasContract = !!completedBassAuthority?.contract?.job?.resultFingerprint;
  const contractFingerprint = hasContract
    ? completedBassAuthority.contract.job.resultFingerprint
    : null;
  const currentFingerprint = completedBassAuthority?.currentFingerprint || null;
  const fingerprintMatchesContract = !!(
    currentFingerprint
    && contractFingerprint
    && currentFingerprint === contractFingerprint
  );

  // An AUTHORITATIVE contract is coherent for the CURRENT design only when its
  // result fingerprint matches the current design fingerprint. A
  // fingerprint-mismatched contract is stale — it describes a different physical
  // design (e.g. a previous four-sub arrangement retained after the designer
  // reverted to a two-sub baseline). It must not be captured as the current
  // design's engineering contract.
  const isAuthoritativeCoherent = !!completedBassAuthority?.authoritative
    && hasContract
    && fingerprintMatchesContract;

  // A captureEligible STALE authority is coherent: the captureEligible flag
  // already verified the contract's baseDesign matches the current design, so
  // the contract belongs to the current physical design even though its result
  // fingerprint differs from the live (moved) currentFingerprint. Only applies
  // when the authority is NOT also authoritative (an authoritative+stale
  // authority with a mismatched fingerprint is stale, not coherent).
  const isStaleCaptureEligibleCoherent = isCaptureEligible
    && !completedBassAuthority?.authoritative
    && hasContract;

  const isEngineeringCoherent = isAuthoritativeCoherent || isStaleCaptureEligibleCoherent;
  const coherenceMode = isAuthoritativeCoherent
    ? 'authoritative-matched'
    : (isStaleCaptureEligibleCoherent ? 'stale-capture-eligible' : null);

  return {
    isEngineeringCoherent,
    coherenceMode,
    fingerprintMatchesContract,
    hasContract,
    contractFingerprint,
    currentFingerprint,
  };
}