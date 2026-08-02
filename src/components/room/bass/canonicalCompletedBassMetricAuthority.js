// canonicalCompletedBassMetricAuthority.js
//
// Stage C6.1A — Canonical completed-bass metric authority.
//
// Derives ONE canonical metric authority object from the completed
// product-constrained candidate (finalOptimisedBassResponse). This is the
// SOLE input authority for P14, P18, P19, and report/export metric
// consumption. No metric consumer may use rspBassResponse (186 points),
// legacy seat-response curves, pre-headroom-limited curves, the requested
// P14 target as achieved capability, or independently reconstructed target
// curves.
//
// C6.1A fixes:
//   1. P14 achieved capability sourced from assessP14Capability (production
//      product-capability), never the requested target.
//   2. Completed-result identity check: request, completed, worker, and
//      candidate fingerprints must all be present and consistent.
//   3. P14 identity fails closed: completedResultP14Identity is mandatory.
//   4. Graph boundary hash check moved to BassResponse (no circular hashes
//      here). This module publishes metric hashes only.
//   5. Curve length: 186 = hard legacy rejection, 360 = canonical. Frequency
//      grid parity between post-EQ and target curves.

import { buildCurveSignature, buildFilterBankSignature } from "./bassResultAuthority";

const ASSESSMENT_BAND = Object.freeze({ lowerHz: 20, upperHz: 120 });
const EXPECTED_CURVE_LENGTH = 360;
const LEGACY_CURVE_LENGTH = 186;
const FREQUENCY_TOLERANCE_HZ = 0.01;

const isFiniteNum = (value) => Number.isFinite(Number(value));

// Normalise P14 identity aliases. The completed result (from
// evaluateCanonicalBassAuthority) uses selectedP14Level and requiredExtensionHz.
// The fingerprint uses p14TargetLevel and selectedP14RequiredExtensionHz.
// Canonical field names: selectedP14TargetDb, p14TargetBasis, p14TargetLevel,
// selectedP14RequiredExtensionHz.
function normaliseP14Identity(identity) {
  if (!identity || typeof identity !== "object") return null;
  const targetDb = isFiniteNum(identity.selectedP14TargetDb) ? Number(identity.selectedP14TargetDb) : null;
  const basis = identity.p14TargetBasis || identity.selectedP14TargetBasis || null;
  const level = isFiniteNum(identity.p14TargetLevel) ? Number(identity.p14TargetLevel)
    : isFiniteNum(identity.selectedP14Level) ? Number(identity.selectedP14Level)
    : isFiniteNum(identity.requestedLevel) ? Number(identity.requestedLevel)
    : null;
  const extHz = isFiniteNum(identity.selectedP14RequiredExtensionHz) ? Number(identity.selectedP14RequiredExtensionHz)
    : isFiniteNum(identity.requiredExtensionHz) ? Number(identity.requiredExtensionHz)
    : null;
  return { selectedP14TargetDb: targetDb, p14TargetBasis: basis, p14TargetLevel: level, selectedP14RequiredExtensionHz: extHz };
}

function p14IdentitiesMatch(a, b) {
  return a.selectedP14TargetDb === b.selectedP14TargetDb
    && a.p14TargetBasis === b.p14TargetBasis
    && a.p14TargetLevel === b.p14TargetLevel
    && a.selectedP14RequiredExtensionHz === b.selectedP14RequiredExtensionHz;
}

function frequencyGridParity(postEq, target) {
  if (!Array.isArray(postEq) || !Array.isArray(target)) return { valid: false, reason: "missing-curves" };
  if (postEq.length !== target.length) return { valid: false, reason: `point-count-mismatch:${postEq.length}:${target.length}` };
  if (!postEq.length) return { valid: false, reason: "empty-curves" };
  const firstA = Number(postEq[0]?.frequency);
  const firstB = Number(target[0]?.frequency);
  const lastA = Number(postEq[postEq.length - 1]?.frequency);
  const lastB = Number(target[target.length - 1]?.frequency);
  if (!Number.isFinite(firstA) || !Number.isFinite(firstB) || Math.abs(firstA - firstB) > FREQUENCY_TOLERANCE_HZ)
    return { valid: false, reason: `first-frequency-mismatch:${firstA}:${firstB}` };
  if (!Number.isFinite(lastA) || !Number.isFinite(lastB) || Math.abs(lastA - lastB) > FREQUENCY_TOLERANCE_HZ)
    return { valid: false, reason: `last-frequency-mismatch:${lastA}:${lastB}` };
  for (let i = 0; i < postEq.length; i++) {
    const fA = Number(postEq[i]?.frequency);
    const fB = Number(target[i]?.frequency);
    if (!Number.isFinite(fA) || !Number.isFinite(fB) || Math.abs(fA - fB) > FREQUENCY_TOLERANCE_HZ)
      return { valid: false, reason: `frequency-mismatch-at-index:${i}:${fA}:${fB}` };
  }
  return { valid: true, reason: null };
}

/**
 * Build the canonical completed-bass metric authority from the completed
 * product-constrained candidate.
 *
 * @param {object} finalOptimisedBassResponse - from buildFinalOptimisedBassResponse
 * @param {string|null} requestFingerprint - active request cache key (cacheKey)
 * @param {string|null} completedResultFingerprint - calibration fingerprint
 * @param {string|null} workerResultFingerprint - fingerprint returned by the worker
 * @param {string|null} candidateFingerprint - selected candidate identity hash
 * @param {object|null} completedResultP14Identity - P14 identity that produced the completed result (MANDATORY)
 * @param {object} requestedP14Identity - current requested P14 identity
 *
 * @returns {{ authority: object|null, diagnostics: object }}
 */
export function buildCanonicalCompletedBassMetricAuthority({
  finalOptimisedBassResponse,
  requestFingerprint = null,
  completedResultFingerprint = null,
  workerResultFingerprint = null,
  candidateFingerprint = null,
  completedResultP14Identity = null,
  requestedP14Identity,
}) {
  const diagnostics = {
    canonicalMetricAuthorityValid: false,
    metricRequestFingerprint: requestFingerprint ?? null,
    metricCompletedFingerprint: completedResultFingerprint ?? null,
    metricWorkerFingerprint: workerResultFingerprint ?? null,
    metricCandidateFingerprint: candidateFingerprint ?? null,
    fingerprintParityValid: false,
    metricFingerprint: null,
    metricCandidateId: null,
    metricPostEqCurveHash: null,
    metricTargetCurveHash: null,
    metricCurvePointCount: 0,
    targetCurvePointCount: 0,
    frequencyGridParityValid: false,
    frequencyGridParityReason: null,
    legacyMetricCurveDetected: false,
    p14IdentityParityValid: false,
    achievedCapabilitySource: null,
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

  diagnostics.metricFingerprint = completedResultFingerprint || null;
  diagnostics.metricCandidateId = candidateId;
  diagnostics.metricPostEqCurveHash = postEqCurveHash;
  diagnostics.metricTargetCurveHash = targetCurveHash;
  diagnostics.metricCurvePointCount = postEqRsp.length;
  diagnostics.targetCurvePointCount = targetCurve.length;
  diagnostics.legacyMetricCurveDetected = postEqRsp.length === LEGACY_CURVE_LENGTH;

  // --- Strict identity checks ---

  // 1. Fingerprint parity: all four fingerprints must be present and consistent.
  //    - requestFingerprint (cacheKey) and workerResultFingerprint must be equal.
  //    - completedResultFingerprint (calibrationFingerprint) must be embedded
  //      in requestFingerprint (cacheKey = calibrationFingerprint|mode:...|...).
  //    - candidateFingerprint must be present (candidate identity hash).
  const hasAllFingerprints = !!(requestFingerprint && completedResultFingerprint && workerResultFingerprint && candidateFingerprint);
  const workerMatchesRequest = requestFingerprint && workerResultFingerprint && workerResultFingerprint === requestFingerprint;
  const completedEmbeddedInRequest = requestFingerprint && completedResultFingerprint && requestFingerprint.includes(completedResultFingerprint);
  diagnostics.fingerprintParityValid = hasAllFingerprints && !!workerMatchesRequest && !!completedEmbeddedInRequest;
  if (!hasAllFingerprints) {
    diagnostics.rejectionReason = "missing-fingerprint";
    return { authority: null, diagnostics };
  }
  if (!workerMatchesRequest) {
    diagnostics.rejectionReason = "worker-fingerprint-mismatch";
    return { authority: null, diagnostics };
  }
  if (!completedEmbeddedInRequest) {
    diagnostics.rejectionReason = "completed-fingerprint-not-embedded-in-request";
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

  // 4. P14 identity — fail closed: completedResultP14Identity is MANDATORY.
  const requestedNorm = normaliseP14Identity(requestedP14Identity);
  if (!requestedNorm || requestedNorm.selectedP14TargetDb == null || requestedNorm.p14TargetBasis == null || requestedNorm.p14TargetLevel == null) {
    diagnostics.rejectionReason = "missing-requested-p14-identity";
    return { authority: null, diagnostics };
  }

  const completedNorm = normaliseP14Identity(completedResultP14Identity);
  if (!completedNorm) {
    diagnostics.rejectionReason = "missing-completed-result-p14-identity";
    return { authority: null, diagnostics };
  }
  if (completedNorm.selectedP14TargetDb == null || completedNorm.p14TargetBasis == null || completedNorm.p14TargetLevel == null) {
    diagnostics.rejectionReason = "incomplete-completed-result-p14-identity";
    return { authority: null, diagnostics };
  }
  diagnostics.p14IdentityParityValid = p14IdentitiesMatch(completedNorm, requestedNorm);
  if (!diagnostics.p14IdentityParityValid) {
    diagnostics.rejectionReason = "requested-p14-identity-mismatch";
    return { authority: null, diagnostics };
  }

  // 5. Frequency grid parity between post-EQ and target curves.
  const gridParity = frequencyGridParity(postEqRsp, targetCurve);
  diagnostics.frequencyGridParityValid = gridParity.valid;
  diagnostics.frequencyGridParityReason = gridParity.reason;
  if (!gridParity.valid) {
    diagnostics.rejectionReason = `frequency-grid-parity-failed:${gridParity.reason}`;
    return { authority: null, diagnostics };
  }

  // 6. P14 achieved capability — from assessP14Capability via the canonical
  // authority evaluation chain. This is the production product-capability
  // value (approved continuous SPL, frequency-dependent, power-summed across
  // active subs, minus positive EQ demand and safety margin). It must NEVER
  // equal the requested target (which would indicate target leakage).
  const achievedCapabilityDb = isFiniteNum(finalOptimisedBassResponse.achievedP14Db) ? Number(finalOptimisedBassResponse.achievedP14Db) : null;
  const achievedLevel = isFiniteNum(finalOptimisedBassResponse.achievedP14Level) ? Number(finalOptimisedBassResponse.achievedP14Level) : null;
  diagnostics.achievedCapabilitySource = "assessP14Capability:approved-continuous-frequency-dependent-post-eq";

  if (achievedCapabilityDb == null) {
    diagnostics.rejectionReason = "missing-achieved-p14-capability";
    return { authority: null, diagnostics };
  }
  // Guard: the requested target must never be stored as achieved capability.
  if (requestedNorm.selectedP14TargetDb != null && achievedCapabilityDb === requestedNorm.selectedP14TargetDb) {
    diagnostics.rejectionReason = "achieved-capability-equals-requested-target-leakage";
    return { authority: null, diagnostics };
  }

  const requestedDb = requestedNorm.selectedP14TargetDb;
  const headroomOrShortfallDb = achievedCapabilityDb - requestedDb;
  const pass = achievedCapabilityDb >= requestedDb;

  const authority = {
    identity: {
      fingerprint: completedResultFingerprint,
      requestFingerprint,
      workerResultFingerprint,
      candidateFingerprint,
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
    p14Identity: {
      requested: requestedNorm,
      completed: completedNorm,
      parityValid: diagnostics.p14IdentityParityValid,
    },
    fingerprintParity: {
      requestFingerprint,
      completedResultFingerprint,
      workerResultFingerprint,
      candidateFingerprint,
      parityValid: diagnostics.fingerprintParityValid,
    },
    frequencyGridParity: {
      valid: diagnostics.frequencyGridParityValid,
      metricCurvePointCount: postEqRsp.length,
      targetCurvePointCount: targetCurve.length,
    },
    p18Input: {
      canonicalPostEqRsp: postEqRsp,
      assessmentBand: { ...ASSESSMENT_BAND },
      requiredExtensionHz: requestedNorm.selectedP14RequiredExtensionHz,
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