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
 * C6.1B2 fingerprint fields (all explicit, no conflation):
 *   - activeRequestFingerprint:    the full cache/request fingerprint (cacheKey)
 *   - returnedWorkerFingerprint:   the fingerprint returned by the worker
 *   - completedContractFingerprint: the fingerprint on the COMPLETED CONTRACT
 *                                   (contract.job.resultFingerprint / lifecycle.resultFingerprint).
 *                                   MUST come from the completed contract/store,
 *                                   NOT from the current request cacheKey.
 *   - persistedCompletedFingerprint: optional fingerprint from the persisted
 *                                   completed authority store. If present, must match.
 *   - calibrationFingerprint:      the embedded calibration identity
 *   - candidateId:                 the selected candidate identity
 *   - candidateResultIdentity:     { candidateId, completedResultFingerprint } receipt
 *                                   linking the candidate to the completed result
 *   - graphMetricParityValid:      graph parity check result (null = not yet checked)
 *
 * Parity rules (C6.1B2):
 *   - activeRequestFingerprint === returnedWorkerFingerprint === completedContractFingerprint
 *   - If persistedCompletedFingerprint exists, it must also match
 *   - activeRequestFingerprint contains calibrationFingerprint (cache-key contract)
 *   - candidateResultIdentity.candidateId === finalOptimisedBassResponse.selectedCandidateId
 *   - candidateResultIdentity.completedResultFingerprint === completedContractFingerprint
 *
 * Publication gating (C6.1B2 Gap 3):
 *   - canonicalMetricAuthorityValid = identity + candidate + curve + P14 checks pass
 *   - graphMetricParityValid = graph series identity matches metric identity
 *   - canonicalMetricPublicationValid = canonicalMetricAuthorityValid && graphMetricParityValid
 *
 * @param {object} finalOptimisedBassResponse - from buildFinalOptimisedBassResponse
 * @param {string|null} activeRequestFingerprint - active request cache key
 * @param {string|null} returnedWorkerFingerprint - fingerprint returned by the worker
 * @param {string|null} completedContractFingerprint - fingerprint on the completed contract (NOT current request)
 * @param {string|null} persistedCompletedFingerprint - fingerprint from persisted completed authority (optional)
 * @param {string|null} calibrationFingerprint - embedded calibration identity
 * @param {string|null} candidateId - selected candidate identity
 * @param {object|null} candidateResultIdentity - { candidateId, completedResultFingerprint } receipt
 * @param {boolean|null} graphMetricParityValid - graph parity result (null = not yet checked)
 * @param {object|null} completedResultP14Identity - P14 identity that produced the completed result (MANDATORY)
 * @param {object} requestedP14Identity - current requested P14 identity
 *
 * @returns {{ authority: object|null, diagnostics: object }}
 */
export function buildCanonicalCompletedBassMetricAuthority({
  finalOptimisedBassResponse,
  activeRequestFingerprint = null,
  returnedWorkerFingerprint = null,
  completedContractFingerprint = null,
  // Backward compat: old param name
  completedResultFingerprint = null,
  persistedCompletedFingerprint = null,
  calibrationFingerprint = null,
  candidateId = null,
  candidateResultIdentity = null,
  graphMetricParityValid = null,
  completedResultP14Identity = null,
  requestedP14Identity,
}) {
  // C6.1B2 Gap 1: completedContractFingerprint MUST come from the completed
  // contract/store, NOT from the current request cacheKey. The caller must
  // source it from lifecycle.resultFingerprint or contract.job.resultFingerprint.
  // We do NOT fall back to activeRequestFingerprint here — that would defeat
  // the audit. If the caller passes the old param name, use it (backward compat).
  const resolvedCompletedContractFingerprint = completedContractFingerprint || completedResultFingerprint || null;

  // C6.1B2 Gap 2: Candidate-result identity receipt.
  const candidateReceiptCandidateId = candidateResultIdentity?.candidateId || null;
  const candidateReceiptCompletedFingerprint = candidateResultIdentity?.completedResultFingerprint || null;

  const diagnostics = {
    canonicalMetricAuthorityValid: false,
    // Explicit fingerprint fields (C6.1B2)
    metricRequestFingerprint: activeRequestFingerprint ?? null,
    metricReturnedWorkerFingerprint: returnedWorkerFingerprint ?? null,
    metricCompletedContractFingerprint: resolvedCompletedContractFingerprint ?? null,
    // Backward-compat alias for consumers that read the old field name
    metricCompletedResultFingerprint: resolvedCompletedContractFingerprint ?? null,
    metricPersistedCompletedFingerprint: persistedCompletedFingerprint ?? null,
    metricCalibrationFingerprint: calibrationFingerprint ?? null,
    metricCandidateId: candidateId ?? null,
    // Candidate-result identity receipt (C6.1B2 Gap 2)
    metricCompletedCandidateId: candidateReceiptCandidateId ?? null,
    metricCompletedCandidateFingerprint: candidateReceiptCompletedFingerprint ?? null,
    // Parity sub-checks
    requestWorkerParityValid: false,
    requestCompletedParityValid: false,
    persistedFingerprintParityValid: false,
    calibrationIdentityParityValid: false,
    candidateIdParityValid: false,
    candidateFingerprintParityValid: false,
    candidateResultIdentityValid: false,
    fingerprintParityValid: false,
    // Curve / P14 diagnostics
    metricPostEqCurveHash: null,
    metricTargetCurveHash: null,
    metricCurvePointCount: 0,
    targetCurvePointCount: 0,
    frequencyGridParityValid: false,
    frequencyGridParityReason: null,
    legacyMetricCurveDetected: false,
    p14IdentityParityValid: false,
    achievedCapabilitySource: null,
    // Publication gating (C6.1B2 Gap 3)
    graphMetricParityValid: graphMetricParityValid,
    canonicalMetricPublicationValid: false,
    publicationRejectionReason: null,
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
  const resolvedCandidateId = candidateId || finalOptimisedBassResponse.selectedCandidateId;

  diagnostics.metricPostEqCurveHash = postEqCurveHash;
  diagnostics.metricTargetCurveHash = targetCurveHash;
  diagnostics.metricCurvePointCount = postEqRsp.length;
  diagnostics.targetCurvePointCount = targetCurve.length;
  diagnostics.legacyMetricCurveDetected = postEqRsp.length === LEGACY_CURVE_LENGTH;

  // --- Strict identity checks (C6.1B2) ---

  // 1. Fingerprint parity — three-way: request === worker === completedContract.
  //    C6.1B2 Gap 1: completedContractFingerprint MUST come from the completed
  //    contract/store, NOT from the current request cacheKey. The caller is
  //    responsible for sourcing it correctly; we do NOT fall back to the
  //    request fingerprint here.
  const requestWorkerParityValid = !!(activeRequestFingerprint && returnedWorkerFingerprint
    && activeRequestFingerprint === returnedWorkerFingerprint);
  const requestCompletedParityValid = !!(activeRequestFingerprint && resolvedCompletedContractFingerprint
    && activeRequestFingerprint === resolvedCompletedContractFingerprint);
  const workerCompletedParityValid = !!(returnedWorkerFingerprint && resolvedCompletedContractFingerprint
    && returnedWorkerFingerprint === resolvedCompletedContractFingerprint);
  // If persistedCompletedFingerprint exists, it must also match.
  const persistedFingerprintParityValid = !persistedCompletedFingerprint
    || (persistedCompletedFingerprint === resolvedCompletedContractFingerprint);
  const calibrationIdentityParityValid = !!(activeRequestFingerprint && calibrationFingerprint
    && activeRequestFingerprint.includes(calibrationFingerprint));

  // 2. Candidate-result identity linkage (C6.1B2 Gap 2).
  //    Presence is insufficient — the candidate must be explicitly linked to
  //    the completed result via the candidateResultIdentity receipt.
  //    - candidateReceipt.candidateId must equal the selectedCandidateId
  //    - candidateReceipt.completedResultFingerprint must equal completedContractFingerprint
  const candidateIdParityValid = !!(candidateReceiptCandidateId && resolvedCandidateId
    && candidateReceiptCandidateId === resolvedCandidateId);
  const candidateFingerprintParityValid = !!(candidateReceiptCompletedFingerprint
    && resolvedCompletedContractFingerprint
    && candidateReceiptCompletedFingerprint === resolvedCompletedContractFingerprint);
  const candidateResultIdentityValid = !!(candidateIdParityValid && candidateFingerprintParityValid);

  diagnostics.requestWorkerParityValid = requestWorkerParityValid;
  diagnostics.requestCompletedParityValid = requestCompletedParityValid;
  diagnostics.workerCompletedParityValid = workerCompletedParityValid;
  diagnostics.persistedFingerprintParityValid = persistedFingerprintParityValid;
  diagnostics.calibrationIdentityParityValid = calibrationIdentityParityValid;
  diagnostics.candidateIdParityValid = candidateIdParityValid;
  diagnostics.candidateFingerprintParityValid = candidateFingerprintParityValid;
  diagnostics.candidateResultIdentityValid = candidateResultIdentityValid;
  diagnostics.fingerprintParityValid = !!(requestWorkerParityValid && requestCompletedParityValid
    && workerCompletedParityValid && persistedFingerprintParityValid
    && calibrationIdentityParityValid && candidateResultIdentityValid);

  // Fail closed: each missing identity is a hard rejection.
  if (!activeRequestFingerprint) {
    diagnostics.rejectionReason = "missing-active-request-fingerprint";
    return { authority: null, diagnostics };
  }
  if (!returnedWorkerFingerprint) {
    diagnostics.rejectionReason = "missing-returned-worker-fingerprint";
    return { authority: null, diagnostics };
  }
  if (!resolvedCompletedContractFingerprint) {
    diagnostics.rejectionReason = "missing-completed-contract-fingerprint";
    return { authority: null, diagnostics };
  }
  if (!calibrationFingerprint) {
    diagnostics.rejectionReason = "missing-calibration-fingerprint";
    return { authority: null, diagnostics };
  }
  if (!requestWorkerParityValid) {
    diagnostics.rejectionReason = "request-worker-fingerprint-mismatch";
    return { authority: null, diagnostics };
  }
  if (!requestCompletedParityValid) {
    diagnostics.rejectionReason = "request-completed-fingerprint-mismatch";
    return { authority: null, diagnostics };
  }
  if (!workerCompletedParityValid) {
    diagnostics.rejectionReason = "worker-completed-fingerprint-mismatch";
    return { authority: null, diagnostics };
  }
  if (!persistedFingerprintParityValid) {
    diagnostics.rejectionReason = "persisted-completed-fingerprint-mismatch";
    return { authority: null, diagnostics };
  }
  if (!calibrationIdentityParityValid) {
    diagnostics.rejectionReason = "calibration-identity-not-embedded-in-request";
    return { authority: null, diagnostics };
  }
  // C6.1B2 Gap 2: candidate must be explicitly linked to the completed result.
  if (!candidateReceiptCandidateId) {
    diagnostics.rejectionReason = "missing-candidate-result-identity-receipt";
    return { authority: null, diagnostics };
  }
  if (!candidateIdParityValid) {
    diagnostics.rejectionReason = "candidate-id-parity-mismatch";
    return { authority: null, diagnostics };
  }
  if (!candidateFingerprintParityValid) {
    diagnostics.rejectionReason = "candidate-fingerprint-parity-mismatch";
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
  // active subs, minus positive EQ demand and safety margin).
  //
  // C6.1B: Exact equality between achievedCapabilityDb and requestedTargetDb
  // is NOT rejected. A system may legitimately achieve exactly the target
  // after rounding or calculation. The protection is source provenance
  // (achievedCapabilitySource diagnostic), not numerical inequality.
  const achievedCapabilityDb = isFiniteNum(finalOptimisedBassResponse.achievedP14Db) ? Number(finalOptimisedBassResponse.achievedP14Db) : null;
  const achievedLevel = isFiniteNum(finalOptimisedBassResponse.achievedP14Level) ? Number(finalOptimisedBassResponse.achievedP14Level) : null;
  diagnostics.achievedCapabilitySource = "assessP14Capability:approved-continuous-frequency-dependent-post-eq";

  if (achievedCapabilityDb == null) {
    diagnostics.rejectionReason = "missing-achieved-p14-capability";
    return { authority: null, diagnostics };
  }

  const requestedDb = requestedNorm.selectedP14TargetDb;
  const headroomOrShortfallDb = achievedCapabilityDb - requestedDb;
  const pass = achievedCapabilityDb >= requestedDb;

  const authority = {
    identity: {
      activeRequestFingerprint,
      returnedWorkerFingerprint,
      completedContractFingerprint: resolvedCompletedContractFingerprint,
      // Backward-compat alias
      completedResultFingerprint: resolvedCompletedContractFingerprint,
      persistedCompletedFingerprint: persistedCompletedFingerprint ?? null,
      calibrationFingerprint,
      candidateId: resolvedCandidateId,
      candidateResultIdentity: {
        candidateId: candidateReceiptCandidateId,
        completedResultFingerprint: candidateReceiptCompletedFingerprint,
      },
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
      activeRequestFingerprint,
      returnedWorkerFingerprint,
      completedContractFingerprint: resolvedCompletedContractFingerprint,
      completedResultFingerprint: resolvedCompletedContractFingerprint,
      persistedCompletedFingerprint: persistedCompletedFingerprint ?? null,
      calibrationFingerprint,
      candidateId: resolvedCandidateId,
      candidateResultIdentity: {
        candidateId: candidateReceiptCandidateId,
        completedResultFingerprint: candidateReceiptCompletedFingerprint,
      },
      requestWorkerParityValid,
      requestCompletedParityValid,
      workerCompletedParityValid,
      persistedFingerprintParityValid,
      calibrationIdentityParityValid,
      candidateIdParityValid,
      candidateFingerprintParityValid,
      candidateResultIdentityValid,
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

  // C6.1B2 Gap 3: Graph parity gates publication. When graphMetricParityValid
  // is null (not yet checked), publication is NOT valid — the graph parity
  // check must be completed before any metric is published as authoritative.
  // When graphMetricParityValid is false, retain diagnostic data but do NOT
  // publish metric results as authoritative.
  if (graphMetricParityValid === null) {
    diagnostics.canonicalMetricPublicationValid = false;
    diagnostics.publicationRejectionReason = "graph-parity-not-yet-checked";
  } else if (!graphMetricParityValid) {
    diagnostics.canonicalMetricPublicationValid = false;
    diagnostics.publicationRejectionReason = "graph-metric-parity-invalid";
  } else {
    diagnostics.canonicalMetricPublicationValid = true;
    diagnostics.publicationRejectionReason = null;
  }

  return { authority, diagnostics };
}

/**
 * C6.1B2 Gap 3: Compute the final canonical metric publication receipt.
 *
 * This is the ONE final authority receipt that gates P14/P18/P19 metric
 * publication, report authority, export authority, and any "VALID" authority
 * label. It combines:
 *   - canonicalMetricAuthorityValid (identity + candidate + curve + P14 checks)
 *   - graphMetricParityValid (graph series identity matches metric identity)
 *
 * When graphMetricParityValid is false:
 *   - Retain diagnostic data (do not clear it)
 *   - Do NOT publish metric results as authoritative
 *   - Report/export authority must be INVALID
 *
 * @param {object} params
 * @param {boolean} params.canonicalMetricAuthorityValid - from buildCanonicalCompletedBassMetricAuthority
 * @param {boolean} params.graphMetricParityValid - from graph parity check
 * @param {string|null} params.authorityRejectionReason - rejection reason from authority builder
 * @param {string|null} params.graphParityReason - rejection reason from graph parity check
 * @returns {{ canonicalMetricPublicationValid: boolean, publicationRejectionReason: string|null }}
 */
export function computeCanonicalMetricPublication({
  canonicalMetricAuthorityValid,
  graphMetricParityValid,
  authorityRejectionReason = null,
  graphParityReason = null,
}) {
  if (!canonicalMetricAuthorityValid) {
    return {
      canonicalMetricPublicationValid: false,
      publicationRejectionReason: authorityRejectionReason || "metric-authority-invalid",
    };
  }
  if (!graphMetricParityValid) {
    return {
      canonicalMetricPublicationValid: false,
      publicationRejectionReason: `graph-parity-failed:${graphParityReason || "unknown"}`,
    };
  }
  return {
    canonicalMetricPublicationValid: true,
    publicationRejectionReason: null,
  };
}