import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  COMPLETED_BASS_CACHE_VERSION,
  INSTANCE_AUTHORITY_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "../../../../base44/shared/bassAuthorityVersion.js";

export { COMPLETED_BASS_CACHE_VERSION };

/**
 * Explicit authority status — distinct from job status.
 *
 * `complete` (job status) means the analysis finished; it does NOT mean the
 * metrics are authoritative. Use `authorityStatus` to gate publication,
 * exports, and UI authority indicators.
 */
export const BASS_AUTHORITY_STATUS = Object.freeze({
  LOADING: "LOADING",
  UPDATING: "UPDATING",
  BLOCKED: "BLOCKED",
  ERROR: "ERROR",
  UNCALCULATED: "UNCALCULATED",
  NOT_VERIFIED: "NOT_VERIFIED",
  AUTHORITATIVE: "AUTHORITATIVE",
});

export function isStructurallyCompleteBassContract(contract) {
  const status = contract?.job?.status;
  return ["ready", "complete"].includes(status)
    && contract?.version === BASS_ANALYSIS_CONTRACT_VERSION
    && contract?.metricSchemaVersion === RP22_BASS_METRIC_SCHEMA_VERSION
    && contract?.job?.metricSchemaVersion === RP22_BASS_METRIC_SCHEMA_VERSION
    && !!contract?.selectedCandidate
    && !!contract?.selectedCandidateId
    && !!contract?.job?.resultFingerprint
    && !!contract?.job?.currentJobFingerprint
    && contract.job.resultFingerprint === contract.job.currentJobFingerprint;
}

/**
 * Authoritative: structurally complete AND metric publication is valid.
 *
 * A contract that is structurally complete but has an invalid or missing
 * metricPublication receipt is NOT authoritative — its metrics must not be
 * published downstream.
 */
function hasCanonicalSeatMetricAuthority(contract) {
  const realSeatCount = Number(contract?.provenance?.realSeatCount);
  if (!Number.isInteger(realSeatCount) || realSeatCount < 0) return false;
  const p19Seats = contract?.selectedCandidate?.perSeatP19Results;
  if (realSeatCount > 0 && (!Array.isArray(p19Seats)
    || p19Seats.length !== realSeatCount
    || p19Seats.some((seat) => !seat?.seatId || !Number.isFinite(seat?.variationDbRaw) || !Number.isFinite(seat?.level)))) return false;
  const p20 = contract?.productAnalysis?.parameters?.p20;
  const p20Seats = contract?.selectedCandidate?.perSeatP20Results;
  if (p20?.status === "complete" && (!Array.isArray(p20Seats)
    || p20Seats.length !== realSeatCount
    || p20Seats.some((seat) => !seat?.seatId || !Number.isFinite(seat?.variationDbRaw) || !Number.isFinite(seat?.level)))) return false;
  return true;
}

export function isAuthoritativeBassContract(contract) {
  if (!isStructurallyCompleteBassContract(contract)) return false;
  if (!hasCanonicalSeatMetricAuthority(contract)) return false;
  const pub = contract?.metricPublication;
  return !!pub && pub.canonicalMetricPublicationValid === true;
}

/**
 * Exportable: authoritative (currently equivalent, but kept as a distinct
 * predicate so export gating can diverge from authority in future without
 * touching call sites).
 */
export function isExportableBassContract(contract) {
  return isAuthoritativeBassContract(contract);
}

// Backward-compat alias — explicit meaning: structural completeness only.
// Existing callers that only need the structural check are unaffected.
export const isCompletedBassContract = isStructurallyCompleteBassContract;

function cloneCurve(curve) {
  return Array.isArray(curve) ? curve.map((point) => ({ ...point })) : [];
}

/**
 * Build the minimum finished-result graph payload from a full contract.
 *
 * Only the curves and scalars genuinely consumed by buildBassGraphSeries are
 * preserved. Room-engine curves (rspRawCurve, normalizedSeries, per-seat raw)
 * are NOT persisted — they are already available from the live room engine
 * after hydration and are identical when the fingerprint matches.
 *
 * Signatures (postEqCurveSignature, filterBankSignature) are NOT persisted —
 * they are recomputed from the saved curves using the SAME canonical helpers
 * during adapter construction (finishedGraphAdapter.js).
 */
function buildGraphPayload(contract) {
  const finalResponse = contract?.finalOptimisedBassResponse;
  if (!finalResponse?.postEqRspCurve?.length) return null;
  const candidate = contract?.selectedCandidate;
  return {
    postEqRspCurve: cloneCurve(finalResponse.postEqRspCurve),
    productionHouseCurveTarget: cloneCurve(finalResponse.canonicalTargetCurve),
    maximumSplCurveAfterEq: cloneCurve(finalResponse.maximumSplCurveAfterEq),
    postEqPerSeatCurves: (Array.isArray(finalResponse.postEqPerSeatCurves) ? finalResponse.postEqPerSeatCurves : [])
      .map((seat) => ({ seatId: seat.seatId, responseData: cloneCurve(seat.responseData) }))
      .filter((seat) => seat.seatId && seat.responseData.length),
    eqFilterBank: (Array.isArray(finalResponse.eqFilterBank) ? finalResponse.eqFilterBank : [])
      .map((filter) => ({ ...filter })),
    sourceCapabilityCurves: (Array.isArray(finalResponse.sourceCapabilityCurves) ? finalResponse.sourceCapabilityCurves : [])
      .map((curve) => cloneCurve(curve))
      .filter((curve) => Array.isArray(curve) && curve.length >= 2),
    selectedCandidateId: finalResponse.selectedCandidateId || contract.selectedCandidateId || null,
    operatingLevelOffsetDb: Number.isFinite(finalResponse.operatingLevelOffsetDb) ? finalResponse.operatingLevelOffsetDb : 0,
    maximumSplSafetyMarginDb: Number.isFinite(finalResponse.maximumSplSafetyMarginDb) ? finalResponse.maximumSplSafetyMarginDb : 0,
    correctionStartHz: Number.isFinite(finalResponse.correctionStartHz) ? finalResponse.correctionStartHz : null,
    correctionEndHz: Number.isFinite(finalResponse.correctionEndHz) ? finalResponse.correctionEndHz : null,
    designEqFitProfile: candidate?.designEqFitProfile || null,
  };
}

export function compactCompletedBassContract(contract) {
  if (!isCompletedBassContract(contract)) return null;
  return {
    version: contract.version,
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    analysisId: contract.analysisId,
    fingerprints: contract.fingerprints,
    job: { ...contract.job, status: "complete" },
    productAnalysis: { status: "complete", parameters: contract.productAnalysis?.parameters || {} },
    selectedMode: contract.selectedMode,
    selectedCandidateId: contract.selectedCandidateId,
    selectedCandidate: {
      id: contract.selectedCandidate?.id || contract.selectedCandidateId,
      worstP20SeatId: contract.selectedCandidate?.worstP20SeatId || null,
      perSeatP19Results: contract.selectedCandidate?.perSeatP19Results || [],
      perSeatP20Results: contract.selectedCandidate?.perSeatP20Results || [],
      p14TargetBasis: contract.selectedCandidate?.p14TargetBasis || contract.productAnalysis?.parameters?.p14?.targetBasis || "minimum",
    },
    requestedP14TargetDb: Number.isFinite(contract.selectedP14TargetDb) ? contract.selectedP14TargetDb : null,
    requestedP14Basis: contract.selectedP14TargetBasis || null,
    requestedP14Level: Number.isFinite(contract.selectedP14Level) ? contract.selectedP14Level : null,
    requestedP18ExtensionHz: Number.isFinite(contract.selectedP18RequiredExtensionHz) ? contract.selectedP18RequiredExtensionHz : null,
    metricPublication: contract.metricPublication || null,
    provenance: contract.provenance || {},
    graphPayload: buildGraphPayload(contract),
  };
}

/**
 * Validate that a completed bass contract's stored P14 identity matches the
 * currently requested P14 identity. Defense-in-depth: the calibration fingerprint
 * already includes P14 identity (v4+), so a fingerprint mismatch rejects wrong
 * results at the cache layer. This function provides an explicit second check
 * at the contract level so a ready result is never presented under mismatched
 * P14 identity.
 */
export function bassContractMatchesRequestedP14(contract, requested) {
  if (!contract) return false;
  // Handle both full contracts (selectedP14*) and compact contracts (requestedP14*).
  // Compact contracts store requestedP14TargetDb/requestedP14Basis/requestedP14Level
  // instead of selectedP14*, so read both field names.
  const cDb = Number.isFinite(contract.selectedP14TargetDb) ? contract.selectedP14TargetDb
    : (Number.isFinite(contract.requestedP14TargetDb) ? contract.requestedP14TargetDb : null);
  const cBasis = contract.selectedP14TargetBasis || contract.requestedP14Basis || null;
  const cLevel = Number.isFinite(contract.selectedP14Level) ? contract.selectedP14Level
    : (Number.isFinite(contract.requestedP14Level) ? contract.requestedP14Level : null);
  const cExtHz = Number.isFinite(contract.selectedP14RequiredExtensionHz) ? contract.selectedP14RequiredExtensionHz : null;
  const rDb = Number.isFinite(requested?.selectedP14TargetDb) ? requested.selectedP14TargetDb : null;
  const rBasis = requested?.p14TargetBasis || requested?.selectedP14TargetBasis || null;
  const rLevel = Number.isFinite(requested?.requestedLevel) ? requested.requestedLevel : (Number.isFinite(requested?.selectedP14Level) ? requested.selectedP14Level : null);
  const rExtHz = Number.isFinite(requested?.selectedP14RequiredExtensionHz) ? requested.selectedP14RequiredExtensionHz : null;
  // Extension Hz is derived from basis+level; compact contracts don't store it
  // explicitly. Only compare when both sides have a finite value.
  if (cExtHz !== null && rExtHz !== null && cExtHz !== rExtHz) return false;
  return cDb === rDb && cBasis === rBasis && cLevel === rLevel;
}

export function buildPersistedBassAuthority(existing, currentFingerprint, contract = null, forceUpdating = false) {
  const compatibleExisting = existing
    && existing.version === COMPLETED_BASS_CACHE_VERSION
    && existing.instanceAuthorityVersion === INSTANCE_AUTHORITY_VERSION
    && existing.metricSchemaVersion === RP22_BASS_METRIC_SCHEMA_VERSION;
  const previous = compatibleExisting ? existing : {};
  const completedByFingerprint = { ...(previous.completedByFingerprint || {}) };
  // If the contract is already compact (has graphPayload, lacks
  // finalOptimisedBassResponse), use it directly instead of re-compacting.
  // Re-compacting a compact contract would lose the graphPayload because
  // buildGraphPayload reads from finalOptimisedBassResponse which is absent.
  const isAlreadyCompact = contract && !contract.finalOptimisedBassResponse && contract.graphPayload;
  const compact = isAlreadyCompact ? contract : compactCompletedBassContract(contract);
  if (compact) completedByFingerprint[compact.job.resultFingerprint] = compact;
  const bounded = Object.fromEntries(Object.entries(completedByFingerprint)
    .sort(([, left], [, right]) => Number(right?.job?.completedAtMs || 0) - Number(left?.job?.completedAtMs || 0))
    .slice(0, 3));
  const fingerprint = currentFingerprint || compact?.job?.resultFingerprint || previous.currentFingerprint || null;
  const matching = fingerprint ? bounded[fingerprint] || null : null;
  return {
    version: COMPLETED_BASS_CACHE_VERSION,
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    currentFingerprint: fingerprint,
    // Preserve "complete" when a matching structurally-complete snapshot exists
    // for the current fingerprint, even if forceUpdating is true (transient
    // incomplete contract from a worker that hasn't produced a replacement yet).
    // Only downgrade to "updating" when no matching snapshot exists.
    status: matching ? "complete" : fingerprint ? "updating" : "uncalculated",
    completedByFingerprint: bounded,
    updatedAtMs: Date.now(),
  };
}

/**
 * Reconstruct the persisted-authority wrapper from a raw ProjectAnalysisCache
 * record. This is the exact adapter used by hydrateCompletedBassAuthority().
 *
 * Stamps the required top-level `instanceAuthorityVersion` so
 * resolvePersistedBassAuthority() accepts the wrapper on cold hydration
 * instead of rejecting it to UNCALCULATED (the defect that deadlocked the
 * direct Technical Report on "Loading report…").
 *
 * The same authority version already stored on the persisted completed
 * contract is used — no separate report-specific value is invented.
 */
export function buildHydratedPersistedWrapper(record) {
  if (!record) return null;
  return {
    version: record.completed_cache_version,
    instanceAuthorityVersion: record.instance_authority_version,
    metricSchemaVersion: record.metric_schema_version,
    currentFingerprint: record.current_fingerprint,
    status: record.status,
    completedByFingerprint: record.completed_by_fingerprint,
  };
}

/**
 * Resolve the persisted bass authority for a project.
 *
 * Cache isolation: records without the correct instanceAuthorityVersion are
 * treated as stale and rejected. Old CFG-keyed results always miss.
 */
export function resolvePersistedBassAuthority(projectId, persisted) {
  const state = persisted && typeof persisted === "object" ? persisted : {};

  // Cache isolation: reject records without the current cache, instance, and metric generations.
  if (state.version !== COMPLETED_BASS_CACHE_VERSION
    || state.instanceAuthorityVersion !== INSTANCE_AUTHORITY_VERSION
    || state.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION) {
    return {
      projectId: String(projectId || "free"),
      status: "uncalculated",
      authorityStatus: BASS_AUTHORITY_STATUS.UNCALCULATED,
      currentFingerprint: null,
      contract: null,
      staleContract: null,
      structurallyComplete: false,
      authoritative: false,
      exportable: false,
      publicationRejectionReason: null,
    };
  }

  const currentFingerprint = state.currentFingerprint || null;
  const snapshots = state.completedByFingerprint || {};

  // Also reject individual snapshots that lack the authority version.
  const validSnapshots = Object.fromEntries(
    Object.entries(snapshots).filter(
      ([, snap]) => snap?.instanceAuthorityVersion === INSTANCE_AUTHORITY_VERSION
        && snap?.version === BASS_ANALYSIS_CONTRACT_VERSION
        && snap?.metricSchemaVersion === RP22_BASS_METRIC_SCHEMA_VERSION
    )
  );

  const current = state.status === "complete" && currentFingerprint ? validSnapshots[currentFingerprint] || null : null;
  const staleContract = Object.values(validSnapshots)
    .filter((snapshot) => snapshot !== current && isStructurallyCompleteBassContract(snapshot))
    .sort((left, right) => Number(right?.job?.completedAtMs || 0) - Number(left?.job?.completedAtMs || 0))[0] || null;
  const structurallyComplete = isStructurallyCompleteBassContract(current);
  const authoritative = isAuthoritativeBassContract(current);
  const exportable = isExportableBassContract(current);
  const publicationRejectionReason = structurallyComplete && !authoritative
    ? (current?.metricPublication?.publicationRejectionReason || "metric-publication-invalid")
    : null;
  const authorityStatus = structurallyComplete
    ? (authoritative ? BASS_AUTHORITY_STATUS.AUTHORITATIVE : BASS_AUTHORITY_STATUS.NOT_VERIFIED)
    : (state.status === "uncalculated" ? BASS_AUTHORITY_STATUS.UNCALCULATED : BASS_AUTHORITY_STATUS.UPDATING);
  return {
    projectId: String(projectId || "free"),
    status: current ? "complete" : state.status === "uncalculated" ? "uncalculated" : "updating",
    authorityStatus,
    currentFingerprint,
    contract: structurallyComplete ? current : null,
    staleContract,
    structurallyComplete,
    authoritative,
    exportable,
    publicationRejectionReason,
  };
}