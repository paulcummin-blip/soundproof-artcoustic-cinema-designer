import { validateOptimiserVersions } from "../bassOptimiserWorkerProtocol.js";
import { STAGE2_CANONICAL_VERSION } from "../stage2/stage2Constants.js";
import { isCurrentAuthorityNonStale } from "./improveBassV2Fingerprint.js";

// A compact completed contract preserves the published metrics. Supplement only
// its validation metadata from the matching full production result; never retune
// or reassess Current merely because compaction omitted that metadata.
export function attachCurrentCanonicalValidation(comparison, { authority, canonical, sources, liveCacheKey, sourceIds }) {
  const contract = authority?.contract;
  const receipt = contract?.provenance;
  if (!comparison || !isCurrentAuthorityNonStale(authority, liveCacheKey) ||
      !validateOptimiserVersions(canonical).valid || canonical.cacheKey !== liveCacheKey ||
      canonical.completedContractFingerprint !== liveCacheKey ||
      !contract?.selectedCandidateId || canonical.selectedCandidateId !== contract.selectedCandidateId ||
      !receipt?.postEqCurveSignature || canonical.postEqCurveSignature !== receipt.postEqCurveSignature ||
      canonical.physicalValidation?.passed !== true) return null;
  // A receipt match must also agree with the actual published seat values.
  for (const [field, fullField] of [["perSeatP19", "perSeatP19Results"], ["perSeatP20", "perSeatP20Results"]]) {
    const rows = canonical[fullField];
    if (!Array.isArray(rows) || rows.length !== comparison[field]?.length ||
        new Set(rows.map(s => s.seatId)).size !== rows.length ||
        comparison[field].some(s => !rows.some(r => r.seatId === s.seatId &&
          r.variationDbRaw === s.variationDbRaw && r.level === s.level))) return null;
  }
  if (!Array.isArray(sources) || sources.length !== sourceIds?.length ||
      new Set(sources.map(s => s.id)).size !== sources.length ||
      sourceIds.some(id => !sources.some(s => s.id === id))) return null;
  return { ...comparison,
    assessmentStartHz: contract.assessmentEnvelope?.assessmentStartHz,
    assessmentEndHz: contract.assessmentEnvelope?.assessmentEndHz,
    operatingOutputDb: canonical.finalOptimisedBassResponse?.selectedOperatingOutputDb,
    p14TargetDb: contract.requestedP14TargetDb,
    requestedP14Pass: canonical.requestedP14Pass,
    physicalValidation: canonical.physicalValidation,
    canonicalAuthorityReceipt: { ...receipt, selectedCandidateId: contract.selectedCandidateId },
    timingVersion: STAGE2_CANONICAL_VERSION,
    appliedTuning: sourceIds.map(id => ({ ...sources.find(s => s.id === id).tuning, sourceId: id })),
  };
}
