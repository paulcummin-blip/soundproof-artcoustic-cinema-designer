// canonicalCompletedBassMetricAuthority.js
//
// Stage C6.1 — Canonical completed-bass metric authority.
//
// Derives ONE canonical metric authority object from the completed
// product-constrained candidate (finalOptimisedBassResponse). This is the
// SOLE input authority for P14, P18, P19, and report/export metric
// consumption. No metric consumer may use rspBassResponse (186 points),
// legacy seat-response curves, pre-headroom-limited curves, the requested
// P14 target as achieved capability, or independently reconstructed target
// curves.
//
// This stage establishes the shared input authority and diagnostic receipt
// only. It does NOT calculate final P18 or P19 differently — the existing
// calculation paths remain unchanged.

import { buildCurveSignature, buildFilterBankSignature } from "./bassResultAuthority";

const ASSESSMENT_BAND = Object.freeze({ lowerHz: 20, upperHz: 120 });
const EXPECTED_CURVE_LENGTH = 360;
const LEGACY_CURVE_LENGTH = 186;

const isFiniteNum = (value) => Number.isFinite(Number(value));

/**
 * Build the canonical completed-bass metric authority from the completed
 * product-constrained candidate.
 *
 * @param {object} finalOptimisedBassResponse - from buildFinalOptimisedBassResponse
 * @param {string|null} completedResultFingerprint - calibration fingerprint / cacheKey
 * @param {object|null} completedResultP14Identity - P14 identity used to produce the completed result
 * @param {object} requestedP14Identity - current requested P14 identity
 * @param {string|null} graphPostEqCurveHash - hash of the graph's post-EQ source curve
 * @param {string|null} graphTargetCurveHash - hash of the graph's target source curve
 *
 * @returns {{ authority: object|null, diagnostics: object }}
 */
export function buildCanonicalCompletedBassMetricAuthority({
  finalOptimisedBassResponse,
  completedResultFingerprint,
  completedResultP14Identity = null,
  requestedP14Identity,
  graphPostEqCurveHash = null,
  graphTargetCurveHash = null,
}) {
  const diagnostics = {
    canonicalMetricAuthorityValid: false,
    metricFingerprint: null,
    metricCandidateId: null,
    metricPostEqCurveHash: null,
    metricTargetCurveHash: null,
    graphPostEqCurveHash: graphPostEqCurveHash ?? null,
    metricCurvePointCount: 0,
    legacyMetricCurveDetected: false,
    rejectionReason: null,
  };

  if (!finalOptimisedBassResponse?.selectedCandidateId) {
    diagnostics.rejectionReason = "missing-final-optimised-bass-response";
    return { authority: null, diagnostics };
  }

  const postEqRsp = finalOptimisedBassResponse.canonicalPostEqRsp;
  const targetCurve = finalOptimisedBassResponse.canonicalTargetCurve;

  if (!Array.isArray(postEqRsp) || !postEqRsp.length) {
    diagnostics.rejectionReason = "missing-canonical-post-eq-rsp";
    return { authority: null, diagnostics };
  }
  if (!Array.isArray(targetCurve) || !targetCurve.length) {
    diagnostics.rejectionReason = "missing-production-house-curve-target";
    return { authority: null, diagnostics };
  }

  // --- Identity hashes ---
  const postEqCurveHash = finalOptimisedBassResponse.postEqCurveSignature || buildCurveSignature(postEqRsp);
  const targetCurveHash = buildCurveSignature(targetCurve);
  const filterBankSignature = finalOptimisedBassResponse.filterBankSignature
    || buildFilterBankSignature({ generatedFilterBank: finalOptimisedBassResponse.eqFilterBank });
  const candidateId = finalOptimisedBassResponse.selectedCandidateId;
  const fingerprint = completedResultFingerprint || null;

  diagnostics.metricFingerprint = fingerprint;
  diagnostics.metricCandidateId = candidateId;
  diagnostics.metricPostEqCurveHash = postEqCurveHash;
  diagnostics.metricTargetCurveHash = targetCurveHash;
  diagnostics.metricCurvePointCount = postEqRsp.length;
  diagnostics.legacyMetricCurveDetected = postEqRsp.length === LEGACY_CURVE_LENGTH;

  // --- Strict identity checks ---

  // 1. Completed result fingerprint must be present
  if (!fingerprint) {
    diagnostics.rejectionReason = "missing-completed-result-fingerprint";
    return { authority: null, diagnostics };
  }

  // 2. Reject legacy 186-point rspBassResponse
  if (postEqRsp.length === LEGACY_CURVE_LENGTH) {
    diagnostics.rejectionReason = "legacy-curve-length-186";
    return { authority: null, diagnostics };
  }

  // 3. Curve length must match expected canonical length
  if (postEqRsp.length !== EXPECTED_CURVE_LENGTH) {
    diagnostics.rejectionReason = `unexpected-curve-length:${postEqRsp.length}`;
    return { authority: null, diagnostics };
  }

  // 4. Graph post-EQ hash must match metric post-EQ hash (when graph hash provided)
  if (graphPostEqCurveHash && graphPostEqCurveHash !== postEqCurveHash) {
    diagnostics.rejectionReason = "graph-post-eq-hash-mismatch";
    return { authority: null, diagnostics };
  }

  // 5. Target curve hash must match graph target curve hash (when graph hash provided)
  if (graphTargetCurveHash && graphTargetCurveHash !== targetCurveHash) {
    diagnostics.rejectionReason = "target-curve-hash-mismatch";
    return { authority: null, diagnostics };
  }

  // 6. Requested P14 identity must be present
  const requestedDb = isFiniteNum(requestedP14Identity?.selectedP14TargetDb) ? Number(requestedP14Identity.selectedP14TargetDb) : null;
  const requestedBasis = requestedP14Identity?.p14TargetBasis || null;
  const requestedLevel = isFiniteNum(requestedP14Identity?.requestedLevel) ? Number(requestedP14Identity.requestedLevel) : null;
  const requestedExtHz = isFiniteNum(requestedP14Identity?.selectedP14RequiredExtensionHz) ? Number(requestedP14Identity.selectedP14RequiredExtensionHz) : null;

  if (requestedDb == null || requestedBasis == null || requestedLevel == null) {
    diagnostics.rejectionReason = "missing-requested-p14-identity";
    return { authority: null, diagnostics };
  }

  // 7. Requested P14 identity must match completed-result request identity
  if (completedResultP14Identity) {
    const cDb = isFiniteNum(completedResultP14Identity.selectedP14TargetDb) ? Number(completedResultP14Identity.selectedP14TargetDb) : null;
    const cBasis = completedResultP14Identity.p14TargetBasis || null;
    const cLevel = isFiniteNum(completedResultP14Identity.requestedLevel) ? Number(completedResultP14Identity.requestedLevel) : null;
    const cExtHz = isFiniteNum(completedResultP14Identity.selectedP14RequiredExtensionHz) ? Number(completedResultP14Identity.selectedP14RequiredExtensionHz) : null;
    if (cDb !== requestedDb || cBasis !== requestedBasis || cLevel !== requestedLevel || cExtHz !== requestedExtHz) {
      diagnostics.rejectionReason = "requested-p14-identity-mismatch";
      return { authority: null, diagnostics };
    }
  }

  // --- Build authority object ---
  const achievedCapabilityDb = isFiniteNum(finalOptimisedBassResponse.achievedP14Db) ? finalOptimisedBassResponse.achievedP14Db : null;
  const achievedLevel = isFiniteNum(finalOptimisedBassResponse.achievedP14Level) ? finalOptimisedBassResponse.achievedP14Level : null;
  const headroomOrShortfallDb = (achievedCapabilityDb != null && requestedDb != null) ? achievedCapabilityDb - requestedDb : null;
  const pass = (achievedCapabilityDb != null && requestedDb != null) ? achievedCapabilityDb >= requestedDb : null;

  const authority = {
    identity: {
      fingerprint,
      candidateId,
      filterBankSignature,
      postEqCurveHash,
      targetCurveHash,
    },
    curves: {
      canonicalPostEqRsp: postEqRsp,
      productionHouseCurveTarget: targetCurve,
    },
    p14: {
      requestedTargetDb: requestedDb,
      achievedCapabilityDb,
      headroomOrShortfallDb,
      achievedLevel,
      pass,
    },
    p18Input: {
      canonicalPostEqRsp: postEqRsp,
      assessmentBand: { ...ASSESSMENT_BAND },
      requiredExtensionHz: requestedExtHz,
    },
    p19Input: {
      canonicalPostEqRsp: postEqRsp,
      productionHouseCurveTarget: targetCurve,
      assessmentBand: { ...ASSESSMENT_BAND },
    },
  };

  diagnostics.canonicalMetricAuthorityValid = true;
  return { authority, diagnostics };
}