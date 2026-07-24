// bassAnalysisAdapter.js — Phase 1C: Live contract adapter.
//
// Adapts the current live bass optimisation result into the versioned
// BassAnalysisResult contract. Pure, defensive, no recalculation.
// Tolerates missing/partial data. Extracted from bassAnalysisContract.js
// to keep both modules under 600 lines.
//
// Dependency direction:
//   adapter → contract (factory, constants, validation)
//   adapter → fingerprints (isValidFingerprint)
//   adapter → candidateConsistency (buildCandidateSignature, signatureToString)
//
// This module does NOT:
//   - Change simulation maths, EQ fitting, candidate generation, or ranking.
//   - Recalculate P14/P18/P19/P20. It maps existing values only.
//   - Start any background work.
//   - Modify the production UI.

import {
  createBassAnalysisResult,
  createBassParameterResult,
  normalizeMode,
  isValidFingerprint,
  PARAM_P14, PARAM_P18, PARAM_P19, PARAM_P20,
  PARAM_STATUS_UNCALCULATED, PARAM_STATUS_CALCULATING, PARAM_STATUS_UPDATING,
  PARAM_STATUS_COMPLETE, PARAM_STATUS_NOT_APPLICABLE, PARAM_STATUS_ERROR,
  PRODUCT_STATUS_QUEUED, PRODUCT_STATUS_RUNNING, PRODUCT_STATUS_COMPLETE, PRODUCT_STATUS_STALE,
  PRODUCT_STATUS_UNCALCULATED, PRODUCT_STATUS_ERROR,
  BASS_MODE_BALANCED, BASS_MODE_HOUSE_CURVE_ACCURACY, BASS_MODE_DEPTH, BASS_MODE_SPL,
} from "@/components/room/bass/bassAnalysisContract";

import {
  buildCandidateSignature,
  signatureToString,
} from "@/components/room/bass/candidateConsistency";
import { levelP20_lfConsistency, numericRp22Level } from "@/components/utils/rp22/levels";
import { houseCurveP19Level } from "@/components/utils/houseCurveFitterCore";
import { formatP14RecommendedDetail, formatP14TargetBasisDetail, normalizeP14TargetBasis } from "@/components/utils/p14CapabilityAuthority";
import { buildBassTargetViews } from "@/components/room/bass/bassTargetViews";

// ---------------------------------------------------------------------------
// Adapter helpers
// ---------------------------------------------------------------------------

// Parse a legacy level string ("L2", "FAIL", "L0") into a numeric level.
// Returns null if the input is missing/unparseable.
function parseLegacyLevel(legacy) {
  if (legacy == null) return null;
  if (typeof legacy === "number") return Number.isFinite(legacy) ? Math.max(0, Math.min(4, Math.round(legacy))) : null;
  const s = String(legacy).trim();
  if (s === "" || s === "FAIL" || s === "L0" || s === "0") return 0;
  const m = s.match(/^L?(\d)$/);
  return m ? Math.max(0, Math.min(4, parseInt(m[1], 10))) : null;
}

// Count real seats, excluding RSP and synthetic RSP entries.
function countRealSeats(perSeatRawCurves) {
  if (!Array.isArray(perSeatRawCurves)) return 0;
  return perSeatRawCurves.filter((s) => {
    if (!s || !s.seatId) return false;
    if (s.seatId === "rsp") return false;
    if (s.__isSyntheticRsp) return false;
    return true;
  }).length;
}

// Map the detailed-calculation hook status to contract job status.
function mapJobStatus(detailedStatus, hasResult) {
  switch (detailedStatus) {
    case "QUEUED": return "queued";
    case "CALCULATING": return "running";
    case "COMPLETE": return "complete";
    case "OUT_OF_DATE": return "stale";
    case "CANCELLED": return "stale";
    case "ERROR": return "error";
    case "IDLE":
    default: return hasResult ? "complete" : "uncalculated";
  }
}

// Map the detailed-calculation hook status to productAnalysis section status.
// Uses ONLY valid product statuses — never "calculating".
function mapProductAnalysisStatus(detailedStatus, hasResult) {
  switch (detailedStatus) {
    case "QUEUED": return PRODUCT_STATUS_QUEUED;
    case "CALCULATING": return PRODUCT_STATUS_RUNNING;
    case "COMPLETE": return PRODUCT_STATUS_COMPLETE;
    case "OUT_OF_DATE": return hasResult ? PRODUCT_STATUS_STALE : PRODUCT_STATUS_UNCALCULATED;
    case "CANCELLED": return hasResult ? PRODUCT_STATUS_STALE : PRODUCT_STATUS_UNCALCULATED;
    case "ERROR": return PRODUCT_STATUS_ERROR;
    case "IDLE":
    default: return hasResult ? PRODUCT_STATUS_COMPLETE : PRODUCT_STATUS_UNCALCULATED;
  }
}

// Convert detailedProgress (object with completed/total) to a 0–1 number.
function progressToNumber(detailedProgress) {
  if (!detailedProgress || typeof detailedProgress !== "object") return null;
  const completed = Number(detailedProgress.completedRequests ?? detailedProgress.completedTasks);
  const total = Number(detailedProgress.totalRequests ?? detailedProgress.totalTasks);
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(1, completed / total));
}

// Build a compact candidate reference (no large curve arrays duplicated).
function buildCandidateRef(candidate) {
  if (!candidate) return null;
  const p20Value = Number.isFinite(candidate.achievedP20VariationDb) ? candidate.achievedP20VariationDb : null;
  const p20Level = p20Value == null
    ? (typeof candidate.achievedP20Level === "number" ? candidate.achievedP20Level : parseLegacyLevel(candidate.achievedP20Level))
    : numericRp22Level(levelP20_lfConsistency(p20Value));
  return {
    id: candidate.candidateId || null,
    designEqFitProfile: candidate.designEqFitProfile || "standard",
    startStrategy: candidate.startStrategy || null,
    selectedStart: candidate.selectedStart || null,
    filterBankSignature: candidate.filterBankSignature || null,
    requestedP14Level: candidate.requestedP14Level ?? null,
    requestedP18Level: candidate.requestedP18Level ?? null,
    requestedP19Level: candidate.requestedP19Level ?? null,
    achievedP14Level: Number.isFinite(candidate.postEqCapabilityAssessment?.achievedP14Level)
      ? candidate.postEqCapabilityAssessment.achievedP14Level
      : typeof candidate.achievedP14Level === "number" ? candidate.achievedP14Level : parseLegacyLevel(candidate.achievedP14Level),
    achievedP14Db: Number.isFinite(candidate.postEqCapabilityAssessment?.maximumAvailableSplAfterEqDb)
      ? candidate.postEqCapabilityAssessment.maximumAvailableSplAfterEqDb
      : Number.isFinite(candidate.achievedP14Db) ? candidate.achievedP14Db : null,
    achievedP14RecommendedLevel: typeof candidate.achievedP14RecommendedLevel === "number" ? candidate.achievedP14RecommendedLevel : 0,
    p14TargetBasis: normalizeP14TargetBasis(candidate.p14TargetBasis),
    p14CapabilityDetails: candidate.p14CapabilityDetails || null,
    postEqCapabilityAssessment: candidate.postEqCapabilityAssessment || null,
    designTarget: candidate.designTarget || null,
    achievedP18Level: typeof candidate.achievedP18Level === "number" ? candidate.achievedP18Level : parseLegacyLevel(candidate.achievedP18Level),
    achievedP18FrequencyHz: Number.isFinite(candidate.achievedP18FrequencyHz) ? candidate.achievedP18FrequencyHz : null,
    achievedP19Level: typeof candidate.achievedP19Level === "number" ? candidate.achievedP19Level : parseLegacyLevel(candidate.achievedP19Level),
    achievedP19VariationDb: Number.isFinite(candidate.achievedP19VariationDb) ? candidate.achievedP19VariationDb : null,
    officialP19VariationDb: Number.isFinite(candidate.officialP19VariationDb) ? candidate.officialP19VariationDb : null,
    correctableP19VariationDb: Number.isFinite(candidate.correctableP19VariationDb) ? candidate.correctableP19VariationDb : null,
    achievedP20Level: p20Level,
    achievedP20VariationDb: p20Value,
    worstP20SeatId: candidate.worstP20SeatId ?? null,
    perSeatP20Results: Array.isArray(candidate.perSeatP20Results) ? candidate.perSeatP20Results.map((seat) => ({ ...seat })) : [],
    p20Available: !!candidate.p20Available,
    perSeatP19Results: (Array.isArray(candidate.perSeatMetrics) ? candidate.perSeatMetrics : []).map((seat) => ({
      seatId: seat?.seatId ?? null,
      variationDbRaw: Number.isFinite(seat?.maxAbsDeviationDb) ? seat.maxAbsDeviationDb : null,
      level: Number.isFinite(seat?.maxAbsDeviationDb) ? houseCurveP19Level(seat.maxAbsDeviationDb) : null,
      worstFrequencyHz: Number.isFinite(seat?.worstFrequencyHz) ? seat.worstFrequencyHz : null,
    })),
    perSeatDiagnostics: (Array.isArray(candidate.perSeatMetrics) ? candidate.perSeatMetrics : []).map((seat) => ({
      seatId: seat?.seatId ?? null,
      maxAbsDeviationDb: Number.isFinite(seat?.maxAbsDeviationDb) ? seat.maxAbsDeviationDb : null,
      rmsDeviationDb: Number.isFinite(seat?.rmsDeviationDb) ? seat.rmsDeviationDb : null,
      worstFrequencyHz: Number.isFinite(seat?.worstFrequencyHz) ? seat.worstFrequencyHz : null,
    })),
    meetsRequestedEnvelope: candidate.meetsRequestedEnvelope ?? null,
    filterCount: Array.isArray(candidate.generatedFilterBank) ? candidate.generatedFilterBank.filter((f) => f?.enabled).length : 0,
  };
}

// Coerce a possibly-missing/numeric-string value to a finite number.
function toFiniteOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Build a candidate signature string for provenance (compact, no curves).
function buildProvenanceSignature(candidate, poolId) {
  if (!candidate) return null;
  const filters = (Array.isArray(candidate.generatedFilterBank) ? candidate.generatedFilterBank : [])
    .filter((f) => f?.enabled)
    .map((f) => {
      const freq = toFiniteOrZero(f?.frequencyHz).toFixed(2);
      const gain = toFiniteOrZero(f?.gainDb).toFixed(2);
      const q = toFiniteOrZero(f?.Q).toFixed(2);
      return `${freq}/${gain}/Q${q}`;
    })
    .join("|");
  return `Pool:${poolId || "—"}|Profile:${candidate.designEqFitProfile || "standard"}|Filters:[${filters || "(none)"}]`;
}

// Build a compact selected-product summary from activeSubs.
function buildProductSummary(activeSubs) {
  if (!Array.isArray(activeSubs) || activeSubs.length === 0) return null;
  const models = activeSubs
    .map((s) => s?.modelKey || s?.model || null)
    .filter((m) => m != null);
  return {
    count: activeSubs.length,
    models,
  };
}

// Build a compact source-layout summary from subsForSimulation.
function buildSourceLayoutSummary(subsForSimulation) {
  if (!Array.isArray(subsForSimulation) || subsForSimulation.length === 0) return null;
  return {
    count: subsForSimulation.length,
    positions: subsForSimulation.map((s) => ({
      id: s?.id || null,
      x: Number.isFinite(s?.x) ? s.x : null,
      y: Number.isFinite(s?.y) ? s.y : null,
      z: Number.isFinite(s?.z) ? s.z : null,
    })),
  };
}

// Resolve truthful response domain and productIndependent from the caller.
// Rules:
//   "unavailable"            → no response mapped, productIndependent = null
//   "normalized_room_transfer" → response proven independent of product
//   "legacy_product_aware"   → response includes product/source capability
function resolveResponseDomain(responseDomain) {
  switch (responseDomain) {
    case "normalized_room_transfer":
      return { responseDomain, productIndependent: true };
    case "legacy_product_aware":
      return { responseDomain, productIndependent: false };
    case "unavailable":
    default:
      return { responseDomain: "unavailable", productIndependent: null };
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Adapt the current live bass optimisation result into the new contract.
 * Pure, defensive, no recalculation. Tolerates missing/partial data.
 *
 * Phase 1C extensions:
 *   - rspRawCurve, perSeatRawCurves: map real room-response data
 *   - activeSubs, usableLfHz: map compact product summary
 *   - sourceLayout: map compact source-layout summary
 *   - responseDomain: truthful room-response provenance
 *   - analysisId: from calibration fingerprint + pool identity
 *   - selectedCandidateId: from live candidate consistency signature
 */
export function adaptCurrentBassOptimisationResult({
  optimisationResult = null,
  detailedStatus = null,
  detailedProgress = null,
  detailedElapsedMs = null,
  rspRawCurve = [],
  perSeatRawCurves = [],
  activeSubs = [],
  usableLfHz = null,
  sourceLayout = null,
  canonicalPriorityMode = null,
  fingerprints = null,
  responseDomain = null,
  backgroundLifecycle = null,
  p14TargetBasis = "minimum",
} = {}) {
  const contract = createBassAnalysisResult();

  // --- Fingerprints (Phase 1B) ---
  // Copy only valid string fingerprints supplied by the caller. Missing or
  // invalid fingerprints remain null. The adapter never computes fingerprints.
  if (fingerprints && typeof fingerprints === "object") {
    if (isValidFingerprint(fingerprints.geometry)) {
      contract.fingerprints.geometry = fingerprints.geometry;
    }
    if (isValidFingerprint(fingerprints.product)) {
      contract.fingerprints.product = fingerprints.product;
    }
    if (isValidFingerprint(fingerprints.calibration)) {
      contract.fingerprints.calibration = fingerprints.calibration;
    }
  }

  const hasResult = !!optimisationResult && !!optimisationResult.selectedCandidate;
  const realSeatCount = countRealSeats(perSeatRawCurves);
  const selectedCandidate = optimisationResult?.selectedCandidate || null;
  const finalResponse = optimisationResult?.finalOptimisedBassResponse || null;
  const poolId = optimisationResult?.poolId || null;

  // --- Job status ---
  contract.job.status = mapJobStatus(detailedStatus, hasResult);
  contract.job.elapsedMs = Number.isFinite(detailedElapsedMs) ? detailedElapsedMs : (optimisationResult?.performanceSummary?.totalOptimiserTimeMs ?? null);
  contract.job.progress = progressToNumber(detailedProgress);
  contract.job.phase = (detailedProgress && typeof detailedProgress === "object" && typeof detailedProgress.phase === "string") ? detailedProgress.phase : null;
  contract.job.message = optimisationResult?.warningMessage || null;
  contract.job.errorMessage = null;
  contract.job.isRefreshingPreviousResult = detailedStatus === "CALCULATING" && hasResult;
  if (backgroundLifecycle) {
    contract.job.status = backgroundLifecycle.status || "idle";
    contract.job.lifecycleStatus = contract.job.status;
    contract.job.currentJobFingerprint = backgroundLifecycle.currentJobFingerprint || null;
    contract.job.resultFingerprint = backgroundLifecycle.resultFingerprint || null;
    contract.job.queuedAtMs = Number.isFinite(backgroundLifecycle.queuedAtMs) ? backgroundLifecycle.queuedAtMs : null;
    contract.job.startedAtMs = Number.isFinite(backgroundLifecycle.startedAtMs) ? backgroundLifecycle.startedAtMs : null;
    contract.job.completedAtMs = Number.isFinite(backgroundLifecycle.completedAtMs) ? backgroundLifecycle.completedAtMs : null;
    contract.job.elapsedMs = Number.isFinite(backgroundLifecycle.elapsedMs) ? backgroundLifecycle.elapsedMs : contract.job.elapsedMs;
    contract.job.cacheStatus = backgroundLifecycle.cacheStatus || "none";
    contract.job.cacheRejectionReason = backgroundLifecycle.cacheRejectionReason || null;
    contract.job.engineVersion = optimisationResult?.engineVersion || null;
    contract.job.resultSchemaVersion = optimisationResult?.resultSchemaVersion || null;
    contract.job.errorMessage = backgroundLifecycle.errorMessage || null;
    contract.job.previousResultStale = !!backgroundLifecycle.previousResultStale;
    contract.job.phase = backgroundLifecycle.progressStage || contract.job.phase;
    contract.job.lastHeartbeatAtMs = Number.isFinite(backgroundLifecycle.lastHeartbeatAtMs) ? backgroundLifecycle.lastHeartbeatAtMs : null;
    contract.job.lastHeartbeatAgeMs = Number.isFinite(backgroundLifecycle.lastHeartbeatAgeMs) ? backgroundLifecycle.lastHeartbeatAgeMs : null;
    contract.job.stalled = !!backgroundLifecycle.stalled;
    contract.job.terminalOutcome = backgroundLifecycle.terminalOutcome || null;
  }

  // --- Selected mode (normalize both internal and canonical inputs) ---
  const rawMode = canonicalPriorityMode || optimisationResult?.selectedMode || null;
  contract.selectedMode = normalizeMode(rawMode);

  // --- Selected candidate ---
  contract.selectedCandidate = buildCandidateRef(selectedCandidate);
  contract.finalOptimisedBassResponse = finalResponse;
  contract.designRecommendation = optimisationResult?.primaryLimitation
    ? { ...optimisationResult.primaryLimitation }
    : null;

  // --- Selected candidate ID (matches live-candidate consistency signature) ---
  if (selectedCandidate && optimisationResult) {
    contract.selectedCandidateId = finalResponse?.selectedCandidateId || optimisationResult.selectedCandidateId || selectedCandidate.candidateId || null;
    if (!contract.selectedCandidateId) {
      try {
        const sig = buildCandidateSignature({ result: optimisationResult, rspRawCurve });
        contract.selectedCandidateId = sig ? signatureToString(sig) : null;
      } catch (e) {
        contract.selectedCandidateId = null;
      }
    }
  }

  // --- Provenance ---
  contract.provenance.poolId = poolId;
  contract.provenance.candidateSignature = buildProvenanceSignature(selectedCandidate, poolId);
  contract.provenance.filterBankSignature = finalResponse?.filterBankSignature || optimisationResult?.filterBankSignature || selectedCandidate?.filterBankSignature || null;
  contract.provenance.postEqCurveSignature = finalResponse?.postEqCurveSignature || optimisationResult?.postEqCurveSignature || null;
  contract.provenance.engineVersion = optimisationResult?.engineVersion || null;
  contract.provenance.realSeatCount = realSeatCount;
  contract.provenance.createdAtMs = null;

  // --- Analysis ID (from calibration fingerprint + pool identity) ---
  const calFp = contract.fingerprints.calibration;
  if (calFp && poolId) {
    contract.analysisId = `${calFp}|pool:${poolId}`;
  } else if (calFp) {
    contract.analysisId = calFp;
  }

  // --- Mode candidates ---
  const selectedByMode = optimisationResult?.selectedByMode || {};
  contract.modeCandidates[BASS_MODE_BALANCED] = buildCandidateRef(selectedByMode.balanced || null);
  contract.modeCandidates[BASS_MODE_HOUSE_CURVE_ACCURACY] = buildCandidateRef(selectedByMode.house_curve_accuracy || null);
  contract.modeCandidates[BASS_MODE_DEPTH] = buildCandidateRef(selectedByMode.depth || null);
  contract.modeCandidates[BASS_MODE_SPL] = buildCandidateRef(selectedByMode.spl || null);

  // --- Product analysis status ---
  contract.productAnalysis.status = mapProductAnalysisStatus(detailedStatus, hasResult);

  // --- Product summary (compact, from activeSubs) ---
  contract.productAnalysis.selectedProductSummary = buildProductSummary(activeSubs);
  contract.productAnalysis.usableLfHz = Number.isFinite(usableLfHz) ? usableLfHz : null;

  // --- Parameters (mapped from existing values, never recalculated) ---
  const isStale = (detailedStatus === "OUT_OF_DATE" || detailedStatus === "CANCELLED") && hasResult;
  const isUpdating = contract.job.isRefreshingPreviousResult;

  function paramStatus(levelPresent) {
    if (levelPresent) {
      if (isUpdating) return PARAM_STATUS_UPDATING;
      return PARAM_STATUS_COMPLETE;
    }
    return detailedStatus === "CALCULATING" ? PARAM_STATUS_CALCULATING : PARAM_STATUS_UNCALCULATED;
  }

  // P14
  const p14Level = selectedCandidate
    ? (typeof selectedCandidate.achievedP14Level === "number" ? selectedCandidate.achievedP14Level : parseLegacyLevel(optimisationResult?.achievedP14Level))
    : parseLegacyLevel(optimisationResult?.achievedP14Level);
  const p14Value = Number.isFinite(selectedCandidate?.achievedP14Db) ? selectedCandidate.achievedP14Db : (Number.isFinite(optimisationResult?.achievedP14Db) ? optimisationResult.achievedP14Db : null);
  const p14RecommendedLevel = selectedCandidate?.achievedP14RecommendedLevel ?? 0;
  const selectedP14TargetBasis = normalizeP14TargetBasis(selectedCandidate?.p14TargetBasis || p14TargetBasis);
  contract.productAnalysis.parameters.p14 = createBassParameterResult({
    parameter: PARAM_P14, status: paramStatus(p14Level != null), level: p14Level, value: p14Value,
    unit: "dBC", passedL1: p14Level != null ? p14Level >= 1 : null, isStale,
    recommendedLevel: p14RecommendedLevel,
    recommendedDetail: formatP14RecommendedDetail(p14RecommendedLevel),
    targetBasis: selectedP14TargetBasis,
    targetBasisDetail: formatP14TargetBasisDetail(selectedP14TargetBasis),
  });

  // P18 — final selected-candidate authority is achieved post-EQ room extension.
  const authorityP18 = finalResponse?.finalSeatVariationData?.p18;
  const p18Level = typeof authorityP18?.level === "number"
    ? authorityP18.level
    : selectedCandidate
      ? (typeof selectedCandidate.achievedP18Level === "number" ? selectedCandidate.achievedP18Level : parseLegacyLevel(optimisationResult?.achievedP18Level))
      : parseLegacyLevel(optimisationResult?.achievedP18Level);
  const p18Value = Number.isFinite(authorityP18?.extensionHz)
    ? authorityP18.extensionHz
    : Number.isFinite(selectedCandidate?.achievedP18FrequencyHz) ? selectedCandidate.achievedP18FrequencyHz : (Number.isFinite(optimisationResult?.achievedP18FrequencyHz) ? optimisationResult.achievedP18FrequencyHz : null);
  contract.productAnalysis.parameters.p18 = createBassParameterResult({
    parameter: PARAM_P18, status: paramStatus(p18Level != null), level: p18Level, value: p18Value,
    unit: "Hz", passedL1: p18Level != null ? p18Level >= 1 : null, isStale,
  });

  // P19
  const authorityP19 = finalResponse?.finalSeatVariationData?.p19;
  const p19Level = typeof authorityP19?.level === "number"
    ? authorityP19.level
    : selectedCandidate
      ? (typeof selectedCandidate.achievedP19Level === "number" ? selectedCandidate.achievedP19Level : parseLegacyLevel(optimisationResult?.achievedP19Level))
      : parseLegacyLevel(optimisationResult?.achievedP19Level);
  const p19Value = Number.isFinite(authorityP19?.variationDb)
    ? authorityP19.variationDb
    : Number.isFinite(selectedCandidate?.achievedP19VariationDb) ? selectedCandidate.achievedP19VariationDb : (Number.isFinite(optimisationResult?.achievedP19VariationDb) ? optimisationResult.achievedP19VariationDb : null);
  contract.productAnalysis.parameters.p19 = createBassParameterResult({
    parameter: PARAM_P19, status: paramStatus(p19Level != null), level: p19Level, value: p19Value,
    unit: "dB", passedL1: p19Level != null ? p19Level >= 1 : null, isStale,
  });

  // P20 — not applicable without a valid non-RSP comparison result.
  if (realSeatCount < 2 || selectedCandidate?.p20Available === false) {
    contract.productAnalysis.parameters.p20 = createBassParameterResult({
      parameter: PARAM_P20, status: PARAM_STATUS_NOT_APPLICABLE, level: null, value: null,
      unit: "dB", passedL1: null, isStale: false,
      reason: realSeatCount < 2 ? "Fewer than two real seats" : "No valid overlapping non-RSP seat response",
    });
  } else if (selectedCandidate && selectedCandidate.p20Available) {
    const authorityP20 = finalResponse?.finalSeatVariationData?.p20;
    const p20Level = typeof authorityP20?.level === "number"
      ? authorityP20.level
      : typeof selectedCandidate.achievedP20Level === "number" ? selectedCandidate.achievedP20Level : parseLegacyLevel(selectedCandidate.achievedP20Level);
    const p20Value = Number.isFinite(authorityP20?.variationDb)
      ? authorityP20.variationDb
      : Number.isFinite(selectedCandidate.achievedP20VariationDb) ? selectedCandidate.achievedP20VariationDb : null;
    contract.productAnalysis.parameters.p20 = createBassParameterResult({
      parameter: PARAM_P20, status: paramStatus(p20Level != null), level: p20Level, value: p20Value,
      unit: "dB", passedL1: p20Level != null ? p20Level >= 1 : null, isStale,
    });
  } else {
    contract.productAnalysis.parameters.p20 = createBassParameterResult({
      parameter: PARAM_P20,
      status: contract.job.status === "error" ? PARAM_STATUS_ERROR : detailedStatus === "CALCULATING" ? PARAM_STATUS_CALCULATING : PARAM_STATUS_UNCALCULATED,
      level: null, value: null, unit: "dB", passedL1: null, isStale,
    });
  }

  // Build both target interpretations from the same selected candidate and acoustic result.
  contract.bassTargets = buildBassTargetViews(contract.productAnalysis.parameters, contract.selectedCandidate);
  contract.selectedTargetBasis = normalizeP14TargetBasis(p14TargetBasis);
  const selectedTarget = contract.bassTargets[contract.selectedTargetBasis];
  contract.productAnalysis.parameters = {
    p14: selectedTarget.p14,
    p18: selectedTarget.p18,
    p19: selectedTarget.p19,
    p20: selectedTarget.p20,
  };
  contract.designRecommendation = selectedTarget.designRecommendation;

  // --- Room response (Phase 1C: map real data truthfully) ---
  const hasRspCurve = Array.isArray(rspRawCurve) && rspRawCurve.length > 0;
  const domain = resolveResponseDomain(responseDomain);

  contract.roomResponse.responseDomain = domain.responseDomain;
  contract.roomResponse.productIndependent = domain.productIndependent;

  // Preserve raw room transfer for provenance; final post-EQ authority is exposed separately.
  if (hasRspCurve) {
    contract.roomResponse.rspCurve = rspRawCurve;
    contract.roomResponse.postEqRspCurve = finalResponse?.postEqRspCurve || [];
    contract.roomResponse.postEqSeatCurves = finalResponse?.postEqPerSeatCurves || [];
    contract.roomResponse.status = "complete";
  } else {
    contract.roomResponse.status = "uncalculated";
  }

  // Map seat curves — compact references with seat IDs.
  if (Array.isArray(perSeatRawCurves) && perSeatRawCurves.length > 0) {
    contract.roomResponse.seatCurves = perSeatRawCurves.map((s) => ({
      seatId: s.seatId,
      responseData: s.responseData,
    }));
  }

  // Map source layout (compact summary from subsForSimulation).
  if (sourceLayout) {
    contract.roomResponse.sourceLayout = buildSourceLayoutSummary(sourceLayout);
  }

  // Map usable LF where available.
  contract.roomResponse.usableLfHz = Number.isFinite(usableLfHz) ? usableLfHz : null;

  return contract;
}