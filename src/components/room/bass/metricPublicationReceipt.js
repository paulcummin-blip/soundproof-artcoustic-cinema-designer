// metricPublicationReceipt.js
//
// Stage C6.2A — Metric publication receipt for the completed bass contract.
//
// Computes the final serializable metricPublication block that is attached
// to the completed bass contract BEFORE publishCompletedBassContract().
//
// Reuses the existing canonical metric authority (buildCanonicalCompletedBassMetricAuthority)
// and graph-source identity helpers (same fields as bassGraphDomainBuilder.js)
// to produce the single authoritative publication receipt.
//
// This module does NOT:
//   - Change EQ, P14/P18/P19 maths, product capability, or graph values.
//   - Create a second store.
//   - Introduce any render or publication loop.

import { computeCanonicalMetricPublication } from "./canonicalCompletedBassMetricAuthority";
import { buildGraphSourceIdentity } from "./graphSourceIdentity";

// Re-export for backward compatibility — any existing imports of
// buildGraphSourceIdentity from this module still resolve.
export { buildGraphSourceIdentity };

/**
 * Build the full metric publication receipt for the completed contract.
 *
 * Combines:
 *   - canonicalMetricDiagnostics (from buildCanonicalCompletedBassMetricAuthority)
 *   - graph-source identity (from buildGraphSourceIdentity)
 *   - computeCanonicalMetricPublication (final publication gating)
 *
 * The graph parity check verifies that the graph-source identity (the hashes
 * the graph series WILL carry) matches the metric authority identity. This
 * is a structural check — the runtime check in BassResponse verifies the
 * rendered series actually carry these hashes.
 *
 * @param {object|null} optimisationResult - from BassBackgroundAnalysisOwner
 * @returns {object|null} serializable metricPublication block, or null if no diagnostics
 */
export function buildMetricPublicationReceipt(optimisationResult) {
  const d = optimisationResult?.canonicalMetricDiagnostics;
  if (!d) return null;

  const graphSource = buildGraphSourceIdentity(optimisationResult);

  // Graph parity: verify graph-source hashes match metric authority hashes.
  const postEqMatch = !!(graphSource?.postEqCurveHash
    && graphSource.postEqCurveHash === d.metricPostEqCurveHash);
  const targetMatch = !!(graphSource?.targetCurveHash
    && graphSource.targetCurveHash === d.metricTargetCurveHash);
  const candidateMatch = !!(graphSource?.candidateId
    && graphSource.candidateId === d.metricCompletedCandidateId);
  const fingerprintMatch = !!(graphSource?.fingerprint
    && graphSource.fingerprint === d.metricCompletedContractFingerprint);
  const calibrationMatch = !!(graphSource?.calibrationFingerprint
    && graphSource.calibrationFingerprint === d.metricCalibrationFingerprint);
  const graphMetricParityValid = !!(postEqMatch && targetMatch
    && candidateMatch && fingerprintMatch && calibrationMatch);
  const graphParityReason = !postEqMatch ? "post-eq-hash-mismatch"
    : !targetMatch ? "target-hash-mismatch"
    : !candidateMatch ? "candidate-id-mismatch"
    : !fingerprintMatch ? "result-fingerprint-mismatch"
    : !calibrationMatch ? "calibration-fingerprint-mismatch"
    : null;

  const publication = computeCanonicalMetricPublication({
    canonicalMetricAuthorityValid: d.canonicalMetricAuthorityValid === true,
    graphMetricParityValid,
    authorityRejectionReason: d.rejectionReason || null,
    graphParityReason,
  });

  return {
    canonicalMetricAuthorityValid: d.canonicalMetricAuthorityValid === true,
    graphMetricParityValid,
    canonicalMetricPublicationValid: publication.canonicalMetricPublicationValid,
    publicationRejectionReason: publication.publicationRejectionReason,
    activeRequestFingerprint: d.metricRequestFingerprint || null,
    returnedWorkerFingerprint: d.metricReturnedWorkerFingerprint || null,
    completedContractFingerprint: d.metricCompletedContractFingerprint || null,
    calibrationFingerprint: d.metricCalibrationFingerprint || null,
    candidateId: d.metricCandidateId || null,
    completedCandidateId: d.metricCompletedCandidateId || null,
    candidateCompletedFingerprint: d.metricCompletedCandidateFingerprint || null,
    postEqCurveHash: d.metricPostEqCurveHash || null,
    targetCurveHash: d.metricTargetCurveHash || null,
    graphPostEqCurveHash: graphSource?.postEqCurveHash || null,
    graphTargetCurveHash: graphSource?.targetCurveHash || null,
    graphFilterBankSignature: graphSource?.filterBankSignature || null,
    metricCurvePointCount: d.metricCurvePointCount || 0,
    targetCurvePointCount: d.targetCurvePointCount || 0,
    frequencyGridParityValid: d.frequencyGridParityValid === true,
    p14IdentityParityValid: d.p14IdentityParityValid === true,
    candidateIdParityValid: d.candidateIdParityValid === true,
    candidateFingerprintParityValid: d.candidateFingerprintParityValid === true,
    fingerprintParityValid: d.fingerprintParityValid === true,
  };
}