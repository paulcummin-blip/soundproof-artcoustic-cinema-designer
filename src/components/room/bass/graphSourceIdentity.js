// graphSourceIdentity.js
//
// Stage C6.2A1 — Shared graph-source identity helper.
//
// Produces the exact identity fields that both:
//   - metricPublicationReceipt.js (contract receipt)
//   - bassGraphDomainBuilder.js (graph series)
// consume.
//
// This ensures the contract receipt and the rendered graph series carry the
// same identity, so graph parity can verify they match.
//
// C6.2A1: fingerprint uses completedContractFingerprint ONLY — no current-
// request (cacheKey) fallback. If completed-contract identity is missing,
// graph parity must fail closed.
//
// This module does NOT:
//   - Change EQ, metric maths, product capability, or graph values.
//   - Create a second store.
//   - Introduce any render or publication loop.

import { buildCurveSignature } from "./bassResultAuthority";

/**
 * Build the canonical graph-source identity from the optimisation result.
 *
 * @param {object|null} optimisationResult - from BassBackgroundAnalysisOwner
 * @returns {object|null} identity fields, or null if no optimisation result
 */
export function buildGraphSourceIdentity(optimisationResult) {
  if (!optimisationResult) return null;
  const finalResponse = optimisationResult.finalOptimisedBassResponse;
  const candidate = optimisationResult.selectedCandidate;
  const targetCurve = candidate?.productionHouseCurveTarget;
  return {
    postEqCurveHash: finalResponse?.postEqCurveSignature || null,
    targetCurveHash: Array.isArray(targetCurve) && targetCurve.length
      ? buildCurveSignature(targetCurve)
      : null,
    candidateId: finalResponse?.selectedCandidateId || candidate?.candidateId || null,
    // C6.2A1: completed-contract fingerprint ONLY — no cacheKey fallback.
    fingerprint: optimisationResult.completedContractFingerprint || null,
    calibrationFingerprint: optimisationResult.calibrationFingerprint || null,
    filterBankSignature: finalResponse?.filterBankSignature || null,
  };
}