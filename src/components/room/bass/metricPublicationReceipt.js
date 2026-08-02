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

import { buildCurveSignature } from "./bassResultAuthority";
import { computeCanonicalMetricPublication } from "./canonicalCompletedBassMetricAuthority";

/**
 * Build graph-source identity from the optimisation result.
 *
 * These are the same hashes that bassGraphDomainBuilder.js embeds into the
 * graph series (sourcePostEqCurveHash, sourceTargetCurveHash, sourceCandidateId,
 * sourceFingerprint, sourceCalibrationFingerprint). Computing them here from
 * the optimisationResult ensures the contract carries the same identity the
 * graph will render with.
 */
export function buildGraphSourceIdentity(optimisationResult) {
  if (!optimisationResult) return null;
  const finalResponse = optimisationResult.finalOptimisedBassResponse;
  const candidate = optimisationResult.selectedCandidate;
  const targetCurve = candidate?.productionHouseCurveTarget;
  return {
    graphPostEqCurveHash: finalResponse?.postEqCurveSignature || null,
    graphTargetCurveHash: Array.isArray(targetCurve) && targetCurve.length
      ? buildCurveSignature(targetCurve)
      : null,
    graphCandidateId: finalResponse?.selectedCandidateId || candidate?.candidateId || null,
    graphFingerprint: optimisationResult.completedContractFingerprint || null,
    graphCalibrationFingerprint: optimisationResult.calibrationFingerprint || null,
  };
}

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
  const postEqMatch = !!(graphSource?.graphPostEqCurveHash
    && graphSource.graphPostEqCurveHash === d.metricPostEqCurveHash);
  const targetMatch = !!(graphSource?.graphTargetCurveHash
    && graphSource.graphTargetCurveHash === d.metricTargetCurveHash);
  const candidateMatch = !!(graphSource?.graphCandidateId
    && graphSource.graphCandidateId === d.metricCompletedCandidateId);
  const fingerprintMatch = !!(graphSource?.graphFingerprint
    && graphSource.graphFingerprint === d.metricCompletedContractFingerprint);
  const calibrationMatch = !!(graphSource?.graphCalibrationFingerprint
    && graphSource.graphCalibrationFingerprint === d.metricCalibrationFingerprint);
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
    graphPostEqCurveHash: graphSource?.graphPostEqCurveHash || null,
    graphTargetCurveHash: graphSource?.graphTargetCurveHash || null,
    metricCurvePointCount: d.metricCurvePointCount || 0,
    targetCurvePointCount: d.targetCurvePointCount || 0,
    frequencyGridParityValid: d.frequencyGridParityValid === true,
    p14IdentityParityValid: d.p14IdentityParityValid === true,
    candidateIdParityValid: d.candidateIdParityValid === true,
    candidateFingerprintParityValid: d.candidateFingerprintParityValid === true,
    fingerprintParityValid: d.fingerprintParityValid === true,
  };
}