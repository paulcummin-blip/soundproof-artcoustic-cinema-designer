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
  const envelopeValidation = validateAssessmentEnvelopeAuthority(contract);
  if (!envelopeValidation.valid) return false;
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

// ---------------------------------------------------------------------------
// Assessment envelope authority (v9)
//
// The compact contract carries ONE authoritative assessment/marker envelope
// so the finished graph adapter can reconstruct P18/P19/P20 graph markers
// after cold reopen without re-running the bass engine.
//
// Grade validation: stored P19/P20 per-seat levels are validated against the
// CURRENT shared grading authority (inlined here for bare-Node compatibility).
// If a persisted level disagrees with the current mapper, the contract is
// rejected as NOT_VERIFIED — it is never cosmetically repaired in the UI.
//
// Band validation: P19/P20 worst frequencies must fall within
// [assessmentStartHz, assessmentEndHz]. An old fixed-20-Hz marker cannot
// become authoritative when the achieved P18 crossing is higher.
// ---------------------------------------------------------------------------

/**
 * Grade P19 from raw deviation using the current shared whole-dB rule.
 * wholeDb = floor(abs(rawDeviationDb))
 * 0–2 → L4 (4), 3 → L3 (3), 4 → L2 (2), 5 → L1 (1), 6+ → FAIL (0)
 */
export function gradeP19FromRaw(rawDeviationDb) {
  if (!Number.isFinite(Number(rawDeviationDb))) return null;
  const wholeDb = Math.floor(Math.abs(Number(rawDeviationDb)));
  if (wholeDb <= 2) return 4;
  if (wholeDb <= 3) return 3;
  if (wholeDb <= 4) return 2;
  if (wholeDb <= 5) return 1;
  return 0;
}

/**
 * Grade P20 from raw deviation using the current shared whole-dB rule.
 * wholeDb = floor(abs(rawDeviationDb))
 * 0–2 → L4 (4), 3 → L3 (3), 4 → L2 (2), 5+ → L1 (1)
 * P20 never FAILs — floored ≥5 dB maps to L1 (not FAIL).
 */
export function gradeP20FromRaw(rawDeviationDb) {
  if (!Number.isFinite(Number(rawDeviationDb))) return null;
  const wholeDb = Math.floor(Math.abs(Number(rawDeviationDb)));
  if (wholeDb <= 2) return 4;
  if (wholeDb <= 3) return 3;
  if (wholeDb <= 4) return 2;
  return 1;
}

/**
 * Build the authoritative assessment/marker envelope from a full contract's
 * finalOptimisedBassResponse. This is the ONE envelope persisted on the
 * compact contract and consumed by the finished graph adapter.
 */
export function buildAssessmentEnvelope(contract) {
  const finalResponse = contract?.finalOptimisedBassResponse;
  if (!finalResponse) return null;

  const achievedP18FrequencyHz = Number.isFinite(Number(finalResponse.achievedP18FrequencyHz))
    ? Number(finalResponse.achievedP18FrequencyHz)
    : (Number.isFinite(Number(finalResponse.finalSeatVariationData?.p18?.extensionHz))
      ? Number(finalResponse.finalSeatVariationData.p18.extensionHz)
      : null);

  const assessmentStartHz = Number.isFinite(Number(finalResponse.assessmentStartHz))
    ? Number(finalResponse.assessmentStartHz)
    : null;

  const assessmentEndHz = Number.isFinite(Number(finalResponse.assessmentEndHz))
    ? Number(finalResponse.assessmentEndHz)
    : null;

  const officialP19WorstFrequencyHz = Number.isFinite(Number(finalResponse.finalSeatVariationData?.p19?.worstFrequencyHz))
    ? Number(finalResponse.finalSeatVariationData.p19.worstFrequencyHz)
    : null;

  // P20 worst seat: resolve from finalSeatVariationData or selectedCandidate
  const p20SeatData = finalResponse.finalSeatVariationData?.p20;
  const p20WorstSeatId = p20SeatData?.worstSeatId ?? contract?.selectedCandidate?.worstP20SeatId ?? null;
  const p20PerSeat = Array.isArray(p20SeatData?.perSeatResults) ? p20SeatData.perSeatResults : [];
  const worstP20 = p20PerSeat.find((s) => String(s?.seatId) === String(p20WorstSeatId))
    || p20PerSeat.reduce((worst, seat) => {
      if (!Number.isFinite(Number(seat?.variationDbRaw))) return worst;
      if (!worst || Math.abs(Number(seat.variationDbRaw)) > Math.abs(Number(worst.variationDbRaw))) return seat;
      return worst;
    }, null);
  const p20WorstFrequencyHz = worstP20 && Number.isFinite(Number(worstP20.worstFrequencyHz))
    ? Number(worstP20.worstFrequencyHz)
    : null;

  return {
    achievedP18FrequencyHz,
    assessmentStartHz,
    assessmentEndHz,
    officialP19WorstFrequencyHz,
    p20WorstSeatId,
    p20WorstFrequencyHz,
  };
}

/**
 * Validate a contract's assessment envelope authority.
 *
 * For compact contracts: requires the stored assessmentEnvelope.
 * For full contracts: builds the envelope from finalOptimisedBassResponse.
 *
 * Validates:
 *   1. Envelope presence (v9 requirement — removing it causes rejection)
 *   2. Per-seat P19/P20 grades match the current shared mapper
 *   3. P19/P20 worst frequencies fall within [assessmentStartHz, assessmentEndHz]
 */
export function validateAssessmentEnvelopeAuthority(contract) {
  const isCompact = !contract?.finalOptimisedBassResponse;
  const envelope = isCompact
    ? contract?.assessmentEnvelope
    : buildAssessmentEnvelope(contract);

  if (!envelope) return { valid: false, reason: "missing-assessment-envelope" };

  if (!Number.isFinite(Number(envelope.achievedP18FrequencyHz)))
    return { valid: false, reason: "missing-achieved-p18-frequency" };
  if (!Number.isFinite(Number(envelope.assessmentStartHz)))
    return { valid: false, reason: "missing-assessment-start-hz" };
  if (!Number.isFinite(Number(envelope.assessmentEndHz)))
    return { valid: false, reason: "missing-assessment-end-hz" };

  // Four-way P18 authority parity: the selected candidate, envelope, assessment
  // start, and product-analysis card must all carry the same canonical achieved
  // P18 crossing. A transition-window contract with a stale fixed-20-Hz
  // assessmentStartHz alongside a higher achieved P18 crossing is rejected
  // here — it must be replaced by a fresh canonical calculation. All four
  // values are required; missing any one is a rejection (no partial authority
  // by filtering). Full-precision values are compared (no rounding/display).
  const P18_AUTHORITY_TOLERANCE_HZ = 0.01;
  const candidateP18Raw = contract?.selectedCandidate?.achievedP18FrequencyHz;
  const envelopeP18Raw = envelope.achievedP18FrequencyHz;
  const envelopeStartRaw = envelope.assessmentStartHz;
  const cardP18Raw = contract?.productAnalysis?.parameters?.p18?.value;
  if (candidateP18Raw == null || envelopeP18Raw == null
    || envelopeStartRaw == null || cardP18Raw == null) {
    return { valid: false, reason: `p18-authority-missing:${candidateP18Raw ?? null}:${envelopeP18Raw ?? null}:${envelopeStartRaw ?? null}:${cardP18Raw ?? null}` };
  }
  const candidateP18 = Number(candidateP18Raw);
  const envelopeP18 = Number(envelopeP18Raw);
  const envelopeStartHz = Number(envelopeStartRaw);
  const cardP18 = Number(cardP18Raw);
  if (!Number.isFinite(candidateP18) || !Number.isFinite(envelopeP18)
    || !Number.isFinite(envelopeStartHz) || !Number.isFinite(cardP18)) {
    return { valid: false, reason: `p18-authority-missing:${candidateP18}:${envelopeP18}:${envelopeStartHz}:${cardP18}` };
  }
  const p18Spread = Math.max(candidateP18, envelopeP18, envelopeStartHz, cardP18)
    - Math.min(candidateP18, envelopeP18, envelopeStartHz, cardP18);
  if (p18Spread > P18_AUTHORITY_TOLERANCE_HZ) {
    return { valid: false, reason: `p18-authority-split:${candidateP18}:${envelopeP18}:${envelopeStartHz}:${cardP18}` };
  }

  // Validate per-seat P19 grades against current shared mapper
  const p19Seats = contract?.selectedCandidate?.perSeatP19Results;
  if (Array.isArray(p19Seats)) {
    for (const seat of p19Seats) {
      if (!Number.isFinite(Number(seat?.variationDbRaw))) continue;
      const expectedLevel = gradeP19FromRaw(seat.variationDbRaw);
      const storedLevel = Number(seat?.level);
      if (expectedLevel != null && Number.isFinite(storedLevel) && expectedLevel !== storedLevel) {
        return { valid: false, reason: `p19-grade-mismatch:seat:${seat.seatId}:stored:${storedLevel}:expected:${expectedLevel}` };
      }
    }
  }

  // Validate per-seat P20 grades against current shared mapper
  const p20Seats = contract?.selectedCandidate?.perSeatP20Results;
  if (Array.isArray(p20Seats)) {
    for (const seat of p20Seats) {
      if (!Number.isFinite(Number(seat?.variationDbRaw))) continue;
      const expectedLevel = gradeP20FromRaw(seat.variationDbRaw);
      const storedLevel = Number(seat?.level);
      if (expectedLevel != null && Number.isFinite(storedLevel) && expectedLevel !== storedLevel) {
        return { valid: false, reason: `p20-grade-mismatch:seat:${seat.seatId}:stored:${storedLevel}:expected:${expectedLevel}` };
      }
    }
  }

  // Band validation: worst frequencies must be within [assessmentStartHz, assessmentEndHz]
  const start = Number(envelope.assessmentStartHz);
  const end = Number(envelope.assessmentEndHz);
  if (Number.isFinite(Number(envelope.officialP19WorstFrequencyHz))) {
    const f = Number(envelope.officialP19WorstFrequencyHz);
    if (f < start || f > end)
      return { valid: false, reason: `p19-worst-frequency-out-of-band:${f}:${start}:${end}` };
  }
  if (Number.isFinite(Number(envelope.p20WorstFrequencyHz))) {
    const f = Number(envelope.p20WorstFrequencyHz);
    if (f < start || f > end)
      return { valid: false, reason: `p20-worst-frequency-out-of-band:${f}:${start}:${end}` };
  }

  return { valid: true, reason: null };
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

export function compactCompletedBassContract(contract, { graphPayloadTimings = null } = {}) {
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
      achievedP18FrequencyHz: Number.isFinite(Number(contract.selectedCandidate?.achievedP18FrequencyHz))
        ? Number(contract.selectedCandidate.achievedP18FrequencyHz)
        : (Number.isFinite(Number(contract.finalOptimisedBassResponse?.achievedP18FrequencyHz))
          ? Number(contract.finalOptimisedBassResponse.achievedP18FrequencyHz)
          : null),
    },
    requestedP14TargetDb: Number.isFinite(contract.selectedP14TargetDb) ? contract.selectedP14TargetDb : null,
    requestedP14Basis: contract.selectedP14TargetBasis || null,
    requestedP14Level: Number.isFinite(contract.selectedP14Level) ? contract.selectedP14Level : null,
    requestedP18ExtensionHz: Number.isFinite(contract.selectedP18RequiredExtensionHz) ? contract.selectedP18RequiredExtensionHz : null,
    assessmentEnvelope: buildAssessmentEnvelope(contract),
    metricPublication: contract.metricPublication || null,
    provenance: contract.provenance || {},
    graphPayload: graphPayloadTimings
      ? (() => {
          const s = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
          const r = buildGraphPayload(contract);
          graphPayloadTimings.graphPayload = (((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - s);
          return r;
        })()
      : buildGraphPayload(contract),
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
 * Copies the record's persisted cache, instance, and RP22 metric generations.
 * It must never stamp current versions onto an old record, because doing so
 * would relabel stale physics as current authority.
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