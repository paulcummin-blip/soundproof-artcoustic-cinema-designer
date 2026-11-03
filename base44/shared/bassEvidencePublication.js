/**
 * bassEvidencePublication.js (shared, backend)
 * --------------------------------------------
 * Retains the authoritative bass graph payload inside the immutable engineering
 * publication, so a frozen Project Report renders its OWN P19 graph after the
 * bounded `completed_by_fingerprint` map has evicted the matching contract.
 *
 * The retained evidence is a COPY of the SAME authoritative graphPayload the
 * live bass result uses — no second graph format, no recalculation, no
 * substitution. It is frozen with the publication at publish time.
 *
 * This is the backend / bare-Node copy. The frontend imports its IDENTICAL
 * mirror at src/lib/bassEvidencePublication.js (the preview sandbox forbids
 * importing /base44/shared/... from the browser with a 403, so the pure logic
 * is mirrored rather than re-exported across the boundary). Keep the two files
 * in step: any change here must be mirrored in src/lib/bassEvidencePublication.js.
 */

/** Bumped when the retained evidence shape changes. */
export const BASS_EVIDENCE_SCHEMA_VERSION = 1;

/** A retained/copied graphPayload is usable with the same rule as the live one. */
function graphPayloadIsUsable(graphPayload) {
  return !!graphPayload
    && Array.isArray(graphPayload.postEqRspCurve)
    && graphPayload.postEqRspCurve.length > 0
    && Array.isArray(graphPayload.correctionCurve);
}

function bassContractForFingerprint(cacheRecord, bassFingerprint) {
  const cbf = cacheRecord?.completed_by_fingerprint;
  if (!cbf || typeof cbf !== 'object' || !bassFingerprint) return null;
  const contract = cbf[bassFingerprint];
  return (contract && typeof contract === 'object') ? contract : null;
}

/**
 * Resolve the authoritative bass evidence to retain with an immutable
 * engineering publication. Returns null when no matching authoritative
 * completed contract exists, or when its graph payload is not usable.
 *
 * PUBLISH-TIME FINGERPRINT MATCH:
 *   The contract is read from `completed_by_fingerprint[bassFingerprint]`, so
 *   the lookup key IS the publication's own bass fingerprint. The contract's
 *   own `job.resultFingerprint` must equal that key: a contract stored under a
 *   different result fingerprint is never attached — no unrelated graph data
 *   is ever frozen with a publication it did not come from.
 *
 * @param {object|null} cacheRecord - the ProjectAnalysisCache record (read)
 * @param {string} bassFingerprint - publication.provenance.bass_fingerprint
 * @returns {object|null} the retained bass evidence block, or null
 */
export function resolveBassEvidenceForPublication(cacheRecord, bassFingerprint) {
  const contract = bassContractForFingerprint(cacheRecord, bassFingerprint);
  if (!contract) return null;
  const contractResultFp = contract?.job?.resultFingerprint || null;
  if (contractResultFp && contractResultFp !== bassFingerprint) return null;
  const graphPayload = contract?.graphPayload;
  if (!graphPayloadIsUsable(graphPayload)) return null;
  return {
    schema_version: BASS_EVIDENCE_SCHEMA_VERSION,
    fingerprint: bassFingerprint,
    graphPayload,
    // Compact-contract fields buildFinishedGraphOptimisationResult reads
    // BESIDE graphPayload, so the retained evidence reproduces the graph AND
    // its RP22 markers exactly without the evictable contract.
    assessmentEnvelope: contract.assessmentEnvelope ?? null,
    bassResultSeatResultsP20: Array.isArray(contract?.bassResult?.seatResults?.P20)
      ? contract.bassResult.seatResults.P20
      : [],
    selectedCandidateId: contract.selectedCandidateId ?? null,
    requestedP14TargetDb: Number.isFinite(contract.requestedP14TargetDb)
      ? contract.requestedP14TargetDb
      : null,
    jobResultFingerprint: contractResultFp,
    calibrationFingerprint: contract?.fingerprints?.calibration ?? null,
  };
}

/**
 * Whether a publication carries retained bass evidence with a usable graph
 * whose fingerprint matches the publication's own bass fingerprint.
 */
export function hasRetainedBassEvidence(publication) {
  const retained = publication?.bass_evidence;
  if (!retained || typeof retained !== 'object') return false;
  const bassFp = publication?.provenance?.bass_fingerprint;
  if (!bassFp || retained.fingerprint !== bassFp) return false;
  return graphPayloadIsUsable(retained.graphPayload);
}

/**
 * Reconstruct a compact-contract-shaped object from retained publication bass
 * evidence, so buildFinishedGraphOptimisationResult / buildP19RspGraph consume
 * it identically to the original authoritative completed contract.
 *
 * READ-TIME FINGERPRINT MATCH:
 *   The retained evidence's fingerprint must equal the publication's own
 *   provenance.bass_fingerprint. A mismatch means the retained graph did not
 *   come from this publication — it is not used, and the caller falls back to
 *   the legacy cache or reports unavailable.
 *
 * Returns null when the retained evidence is absent, mismatched, or unusable.
 */
export function syntheticContractFromRetainedEvidence(publication) {
  if (!hasRetainedBassEvidence(publication)) return null;
  const retained = publication.bass_evidence;
  return {
    graphPayload: retained.graphPayload,
    assessmentEnvelope: retained.assessmentEnvelope,
    bassResult: { seatResults: { P20: retained.bassResultSeatResultsP20 || [] } },
    selectedCandidateId: retained.selectedCandidateId,
    requestedP14TargetDb: retained.requestedP14TargetDb,
    job: { resultFingerprint: retained.jobResultFingerprint },
    fingerprints: { calibration: retained.calibrationFingerprint },
  };
}