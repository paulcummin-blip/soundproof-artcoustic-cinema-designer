// One readiness authority for P19 publication and target-cache reuse.
// This module does not calculate P19; it only verifies that the canonical
// inputs and the already-computed official result are complete.
function hasCurve(curve) {
  return Array.isArray(curve) && curve.length > 0;
}

export function isCanonicalP19Ready({
  canonicalPostEqRsp,
  canonicalTargetCurve,
  officialVariationDb,
  officialLevel,
} = {}) {
  return hasCurve(canonicalPostEqRsp)
    && hasCurve(canonicalTargetCurve)
    && Number.isFinite(officialVariationDb)
    && Number.isFinite(officialLevel);
}

export function hasReadyCanonicalP19Contract(contract) {
  const parameter = contract?.productAnalysis?.parameters?.p19;
  // Not-assessable P19 is a terminal state — the assessment has reached a
  // conclusion (P19 cannot be graded because P18 extension was not achieved
  // or the assessment band is invalid). This counts as ready for publication;
  // the contract carries the failure reason instead of per-seat results.
  if (parameter?.notAssessable === true
    && parameter?.status === "complete"
    && typeof parameter?.reason === "string"
    && parameter.reason.length > 0) {
    return true;
  }
  // Assessable P19 requires complete status, valid curves, and finite values.
  const response = contract?.finalOptimisedBassResponse;
  const graph = contract?.graphPayload;
  return parameter?.status === "complete"
    && isCanonicalP19Ready({
      canonicalPostEqRsp: response?.canonicalPostEqRsp
        || response?.referenceEq
        || graph?.postEqRspCurve,
      canonicalTargetCurve: response?.canonicalTargetCurve
        || graph?.canonicalTargetCurve,
      officialVariationDb: parameter?.value,
      officialLevel: parameter?.level,
    });
}