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
  const response = contract?.finalOptimisedBassResponse;
  const graph = contract?.graphPayload;
  return parameter?.status === "complete"
    && isCanonicalP19Ready({
      canonicalPostEqRsp: response?.canonicalPostEqRsp
        || response?.postEqRspCurve
        || graph?.postEqRspCurve,
      canonicalTargetCurve: response?.canonicalTargetCurve
        || graph?.productionHouseCurveTarget,
      officialVariationDb: parameter?.value,
      officialLevel: parameter?.level,
    });
}
