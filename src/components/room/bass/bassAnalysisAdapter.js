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
import { formatP14RecommendedDetail, formatP14TargetBasisDetail, normalizeP14TargetBasis } from "@/components/utils/p14CapabilityAuthority";
import { buildBassTargetViews } from "@/components/room/bass/bassTargetViews";
import { assessP18Extension, formatP18TargetBasisDetail, normalizeP18TargetBasis } from "@/components/utils/p18ExtensionAuthority";
import { isCanonicalP19Ready } from "@/components/room/bass/p19Readiness";

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

function hasCanonicalSeatResults(results, realSeatCount) {
  if (realSeatCount === 0) return true;
  return Array.isArray(results)
    && results.length === realSeatCount
    && results.every((seat) => !!seat?.seatId
      && Number.isFinite(Number(seat?.variationDbRaw))
      && Number.isFinite(Number(seat?.level)));
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
function buildCandidateRef(candidate, collectDiagnostics = false) {
  if (!candidate) return null;
  const p20Value = Number.isFinite(candidate.achievedP20VariationDb) ? Number(candidate.achievedP20VariationDb) : null;
  const p20Level = Number.isFinite(candidate.achievedP20Level) ? Number(candidate.achievedP20Level) : null;
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
    selectedP14TargetBasis: candidate.selectedP14TargetBasis || candidate.p14TargetBasis || "minimum",
    selectedP14Level: Number.isFinite(candidate.selectedP14Level) ? candidate.selectedP14Level : null,
    selectedP14TargetDb: Number.isFinite(candidate.selectedP14TargetDb) ? candidate.selectedP14TargetDb : null,
    availableP14CapabilityDb: Number.isFinite(candidate.availableP14CapabilityDb) ? candidate.availableP14CapabilityDb : null,
    requestedP14Pass: typeof candidate.requestedP14Pass === "boolean" ? candidate.requestedP14Pass : null,
    achievedP14MinimumLevel: typeof candidate.achievedP14MinimumLevel === "number" ? candidate.achievedP14MinimumLevel : 0,
    achievedP14RecommendedLevel: typeof candidate.achievedP14RecommendedLevel === "number" ? candidate.achievedP14RecommendedLevel : 0,
    minimumLevel: typeof candidate.minimumLevel === "number" ? candidate.minimumLevel : 0,
    recommendedLevel: typeof candidate.recommendedLevel === "number" ? candidate.recommendedLevel : 0,
    limitingFrequencyHz: Number.isFinite(candidate.limitingFrequencyHz) ? candidate.limitingFrequencyHz : null,
    headroomConsumedByEqDb: Number.isFinite(candidate.headroomConsumedByEqDb) ? candidate.headroomConsumedByEqDb : null,
    limitation: candidate.limitation || null,
    p14TargetBasis: normalizeP14TargetBasis(candidate.p14TargetBasis),
    p14CapabilityDetails: candidate.p14CapabilityDetails || null,
    postEqCapabilityAssessment: candidate.postEqCapabilityAssessment || null,
    targetWarning: candidate.targetWarning || null,
    requestedP18Pass: typeof candidate.requestedP18Pass === "boolean" ? candidate.requestedP18Pass : null,
    p18RequiredExtensionAssessment: candidate.p18RequiredExtensionAssessment || null,
    requiredExtensionHz: Number.isFinite(candidate.requiredExtensionHz) ? candidate.requiredExtensionHz : null,
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
    // Canonical P19 seat authority is computed once by
    // computeOfficialPerSeatP19Assessment. Do not recreate or halve it here.
    perSeatP19Results: (Array.isArray(candidate.perSeatP19Results) ? candidate.perSeatP19Results : [])
      .map((seat) => ({
        seatId: seat?.seatId ?? null,
        variationDbRaw: Number.isFinite(seat?.variationDbRaw) ? Number(seat.variationDbRaw) : null,
        displayVariationDb: Number.isFinite(seat?.displayVariationDb) ? Number(seat.displayVariationDb) : null,
        level: Number.isFinite(seat?.level) ? Number(seat.level) : null,
        worstFrequencyHz: Number.isFinite(seat?.worstFrequencyHz) ? Number(seat.worstFrequencyHz) : null,
      }))
      .filter((seat) => seat.seatId && Number.isFinite(seat.variationDbRaw) && Number.isFinite(seat.level)),
    perSeatDiagnostics: (Array.isArray(candidate.perSeatMetrics) ? candidate.perSeatMetrics : []).map((seat) => ({
      seatId: seat?.seatId ?? null,
      maxAbsDeviationDb: Number.isFinite(seat?.maxAbsDeviationDb) ? seat.maxAbsDeviationDb : null,
      rmsDeviationDb: Number.isFinite(seat?.rmsDeviationDb) ? seat.rmsDeviationDb : null,
      worstFrequencyHz: Number.isFinite(seat?.worstFrequencyHz) ? seat.worstFrequencyHz : null,
    })),
    meetsRequestedEnvelope: candidate.meetsRequestedEnvelope ?? null,
    filterCount: Array.isArray(candidate.generatedFilterBank) ? candidate.generatedFilterBank.filter((f) => f?.enabled).length : 0,
    selectedOperatingOutputDb: Number.isFinite(candidate.selectedOperatingOutputDb) ? candidate.selectedOperatingOutputDb : null,
    operatingOutputDiagnostics: candidate.operatingOutputDiagnostics || null,
    // Preserve the candidate acceptance diagnostics array ONLY when engineering
    // diagnostics were requested. The array is passed through unchanged — never
    // recalculated, transformed, or recreated. When diagnostics were not
    // requested, the field is an empty array so the contract stays clean.
    designEqCandidateAcceptanceDiagnostics: collectDiagnostics && Array.isArray(candidate.designEqCandidateAcceptanceDiagnostics)
      ? candidate.designEqCandidateAcceptanceDiagnostics
      : [],
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
  p18TargetBasis = "minimum",
  selectedP14Level = 4,
  selectedP14TargetDb = null,
  selectedP14RequiredExtensionHz = null,
  selectedP18RequiredExtensionHz = null,
  collectDiagnostics = false,
  metricPublication = null,
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
    contract.job.metricSchemaVersion = optimisationResult?.metricSchemaVersion ?? null;
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
  contract.selectedCandidate = buildCandidateRef(selectedCandidate, collectDiagnostics);
  contract.bassAuthority = selectedCandidate?.postEqCapabilityAssessment || null;
  contract.finalOptimisedBassResponse = finalResponse;
  contract.achievedP14Db = selectedCandidate?.achievedP14Db ?? null;
  contract.achievedP14Level = selectedCandidate?.achievedP14Level ?? null;
  contract.achievedP18FrequencyHz = selectedCandidate?.achievedP18FrequencyHz ?? null;
  contract.achievedP18Level = selectedCandidate?.achievedP18Level ?? null;
  contract.achievedP19VariationDb = selectedCandidate?.achievedP19VariationDb ?? null;
  contract.achievedP19Level = selectedCandidate?.achievedP19Level ?? null;
  contract.achievedP20VariationDb = selectedCandidate?.achievedP20VariationDb ?? null;
  contract.achievedP20Level = selectedCandidate?.achievedP20Level ?? null;
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
  // --- Diagnostic identity (Stage B) ---
  // Compact identity object from the selected optimisation result. Only
  // captured run identity fields — no candidate, filter, curve, or P19
  // diagnostic content.
  contract.diagnosticIdentity = optimisationResult?.diagnosticIdentity || null;

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
  contract.modeCandidates[BASS_MODE_BALANCED] = buildCandidateRef(selectedByMode.balanced || null, collectDiagnostics);
  contract.modeCandidates[BASS_MODE_HOUSE_CURVE_ACCURACY] = buildCandidateRef(selectedByMode.house_curve_accuracy || null, collectDiagnostics);
  contract.modeCandidates[BASS_MODE_DEPTH] = buildCandidateRef(selectedByMode.depth || null, collectDiagnostics);
  contract.modeCandidates[BASS_MODE_SPL] = buildCandidateRef(selectedByMode.spl || null, collectDiagnostics);

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

  // P14: the generic `value` is the ACHIEVED product capability (from
  // assessP14Capability via postEqCapabilityAssessment.maximumAvailableSplAfterEqDb),
  // NOT the requested target. The requested target is retained separately as
  // `requestedTargetDb`. Fail closed: if achieved capability is missing, value
  // is null and the parameter is unavailable — the target is never substituted
  // as capability.
  const p14SelectedLevel = (Number.isFinite(Number(selectedP14Level)) && Number(selectedP14Level) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(selectedP14Level))))
    : null;
  const requestedTargetDb = Number.isFinite(selectedP14TargetDb) ? selectedP14TargetDb : selectedCandidate?.selectedP14TargetDb ?? null;
  const selectedP14TargetBasis = normalizeP14TargetBasis(p14TargetBasis);
  // C6.2C1: Capability source preference order (never falls back to requestedTargetDb):
  //   1. optimisationResult.canonicalMetricAuthority.p14 — completed canonical
  //      metric authority, proven to originate from assessP14Capability.
  //   2. selectedCandidate.postEqCapabilityAssessment.maximumAvailableSplAfterEqDb
  //      (buildPostEqBassCapabilityOutcome — same assessP14Capability lineage).
  //   3. selectedCandidate.availableP14CapabilityDb (legacy compatibility).
  //   4. selectedCandidate.achievedP14Db (legacy compatibility).
  const canonicalP14 = optimisationResult?.canonicalMetricAuthority?.p14 || null;
  const achievedCapabilityDb = Number.isFinite(canonicalP14?.achievedCapabilityDb)
    ? canonicalP14.achievedCapabilityDb
    : (Number.isFinite(selectedCandidate?.postEqCapabilityAssessment?.maximumAvailableSplAfterEqDb)
      ? selectedCandidate.postEqCapabilityAssessment.maximumAvailableSplAfterEqDb
      : (Number.isFinite(selectedCandidate?.availableP14CapabilityDb)
        ? selectedCandidate.availableP14CapabilityDb
        : (Number.isFinite(selectedCandidate?.achievedP14Db) ? selectedCandidate.achievedP14Db : null)));
  // C6.2C1: achievedLevel is the RP22 level supported by achievedCapabilityDb.
  // It is NOT zeroed when the requested target is missed — pass/fail is tracked
  // separately in `pass`. Missing capability gives level null.
  const achievedLevel = Number.isFinite(canonicalP14?.achievedLevel)
    ? canonicalP14.achievedLevel
    : (Number.isFinite(selectedCandidate?.postEqCapabilityAssessment?.achievedP14Level)
      ? selectedCandidate.postEqCapabilityAssessment.achievedP14Level
      : (typeof selectedCandidate?.achievedP14Level === "number" ? selectedCandidate.achievedP14Level : null));
  const p14CapabilitySource = Number.isFinite(canonicalP14?.achievedCapabilityDb)
    ? "canonicalMetricAuthority"
    : (Number.isFinite(selectedCandidate?.postEqCapabilityAssessment?.maximumAvailableSplAfterEqDb)
      ? "postEqCapabilityAssessment"
      : (Number.isFinite(selectedCandidate?.availableP14CapabilityDb)
        ? "availableP14CapabilityDb"
        : (Number.isFinite(selectedCandidate?.achievedP14Db) ? "achievedP14Db" : null)));
  const headroomOrShortfallDb = Number.isFinite(achievedCapabilityDb) && Number.isFinite(requestedTargetDb)
    ? achievedCapabilityDb - requestedTargetDb
    : null;
  const p14Pass = Number.isFinite(achievedCapabilityDb) && Number.isFinite(requestedTargetDb)
    ? achievedCapabilityDb >= requestedTargetDb
    : null;
  const p14Status = achievedCapabilityDb == null
    ? PARAM_STATUS_NOT_APPLICABLE
    : paramStatus(true);
  contract.productAnalysis.parameters.p14 = {
    ...createBassParameterResult({
      parameter: PARAM_P14,
      status: p14Status,
      level: achievedCapabilityDb == null ? null : (achievedLevel ?? null),
      value: achievedCapabilityDb,
      unit: "dBC",
      passedL1: p14Pass,
      isStale,
      recommendedLevel: selectedCandidate?.achievedP14RecommendedLevel ?? 0,
      recommendedDetail: formatP14RecommendedDetail(selectedCandidate?.achievedP14RecommendedLevel ?? 0),
      targetBasis: selectedP14TargetBasis,
      targetBasisDetail: formatP14TargetBasisDetail(selectedP14TargetBasis),
      ...(achievedCapabilityDb == null ? { reason: "Achieved product capability unavailable" } : {}),
    }),
    selectedLevel: p14SelectedLevel,
    selectedTargetDb: requestedTargetDb,
    availableCapabilityDb: achievedCapabilityDb,
    requestedTargetDb,
    achievedCapabilityDb,
    headroomOrShortfallDb,
    achievedLevel,
    pass: p14Pass,
    p14CapabilitySource,
  };

  // P18 — independently grade the precise 1/3-octave-smoothed -3 dB point.
  // The favourable whole-Hz floor is applied only by the P18 authority.
  const authorityP18 = finalResponse?.finalSeatVariationData?.p18;
  const p18Value = Number.isFinite(authorityP18?.extensionHz)
    ? authorityP18.extensionHz
    : Number.isFinite(selectedCandidate?.achievedP18FrequencyHz) ? selectedCandidate.achievedP18FrequencyHz : (Number.isFinite(optimisationResult?.achievedP18FrequencyHz) ? optimisationResult.achievedP18FrequencyHz : null);
  const selectedP18TargetBasis = normalizeP18TargetBasis(p18TargetBasis);
  const p18Assessment = assessP18Extension(p18Value, selectedP18TargetBasis);
  // P18 remains an independent achieved extension result even when the selected
  // P14 request is above the product envelope. A P14 miss must not erase a valid
  // 1/3-octave-smoothed -3 dB crossing (for example 30.65 Hz → 30 Hz → Min L2).
  const p18ResultAvailable = p18Assessment.level != null;
  const p18Level = p18Assessment.level;
  contract.productAnalysis.parameters.p18 = {
    ...createBassParameterResult({
      parameter: PARAM_P18, status: paramStatus(p18ResultAvailable), level: p18Level, value: p18Value,
      unit: "Hz", passedL1: p18Level != null ? p18Level >= 1 : false, isStale,
      targetBasis: selectedP18TargetBasis,
      targetBasisDetail: formatP18TargetBasisDetail(selectedP18TargetBasis),
    }),
    designHz: p18Assessment.designHz,
    performanceBand: p18Assessment.performanceBand,
    performanceMultiplier: p18Assessment.performanceMultiplier,
    qualifiedAtSelectedP14Output: p18ResultAvailable,
  };

  // P19 — publish only from the official assessment of the finished canonical
  // post-EQ RSP against the finished canonical target. Candidate/legacy values
  // are deliberately not fallbacks for readiness.
  const authorityP19 = finalResponse?.finalSeatVariationData?.p19;
  const p19Ready = optimisationResult?.p19AssessmentReady === true
    && hasCanonicalSeatResults(selectedCandidate?.perSeatP19Results, realSeatCount)
    && isCanonicalP19Ready({
      canonicalPostEqRsp: finalResponse?.canonicalPostEqRsp,
      canonicalTargetCurve: finalResponse?.canonicalTargetCurve,
      officialVariationDb: authorityP19?.variationDb,
      officialLevel: authorityP19?.level,
    });
  const p19Level = p19Ready ? authorityP19.level : null;
  const p19Value = p19Ready ? authorityP19.variationDb : null;
  const p19Status = p19Ready
    ? paramStatus(true)
    : contract.job.status === "error"
      ? PARAM_STATUS_ERROR
      : hasResult
        ? PARAM_STATUS_UPDATING
        : detailedStatus === "CALCULATING" ? PARAM_STATUS_CALCULATING : PARAM_STATUS_UNCALCULATED;
  contract.productAnalysis.parameters.p19 = createBassParameterResult({
    parameter: PARAM_P19, status: p19Status, level: p19Level, value: p19Value,
    unit: "dB", passedL1: p19Ready ? p19Level >= 1 : null, isStale,
    reason: p19Ready ? null : "Canonical post-EQ response, target curve, or official P19 assessment is pending",
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
    const p20Ready = Number.isFinite(authorityP20?.variationDb)
      && Number.isFinite(authorityP20?.level)
      && hasCanonicalSeatResults(selectedCandidate?.perSeatP20Results, realSeatCount);
    const p20Level = p20Ready ? Number(authorityP20.level) : null;
    const p20Value = p20Ready ? Number(authorityP20.variationDb) : null;
    contract.productAnalysis.parameters.p20 = createBassParameterResult({
      parameter: PARAM_P20, status: p20Ready ? paramStatus(true) : PARAM_STATUS_UPDATING, level: p20Level, value: p20Value,
      unit: "dB", passedL1: p20Ready ? p20Level >= 1 : null, isStale,
      reason: p20Ready ? null : "Canonical P20 headline or complete seat evidence is pending",
    });
  } else {
    contract.productAnalysis.parameters.p20 = createBassParameterResult({
      parameter: PARAM_P20,
      status: contract.job.status === "error" ? PARAM_STATUS_ERROR : detailedStatus === "CALCULATING" ? PARAM_STATUS_CALCULATING : PARAM_STATUS_UNCALCULATED,
      level: null, value: null, unit: "dB", passedL1: null, isStale,
    });
  }

  // Build both target interpretations from the same selected candidate and acoustic result.
  contract.bassTargets = buildBassTargetViews(contract.productAnalysis.parameters, contract.selectedCandidate, selectedP18TargetBasis);
  contract.selectedTargetBasis = normalizeP14TargetBasis(p14TargetBasis);
  contract.selectedP14TargetBasis = contract.selectedTargetBasis;
  contract.selectedP14Level = p14SelectedLevel;
  contract.selectedP14TargetDb = requestedTargetDb;
  contract.selectedP14RequiredExtensionHz = Number.isFinite(selectedP14RequiredExtensionHz) ? selectedP14RequiredExtensionHz : null;
  contract.selectedP18TargetBasis = selectedP18TargetBasis;
  contract.selectedP18RequiredExtensionHz = Number.isFinite(selectedP18RequiredExtensionHz)
    ? selectedP18RequiredExtensionHz
    : (Number.isFinite(selectedP14RequiredExtensionHz) ? selectedP14RequiredExtensionHz : null);
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

  // C6.2A: Metric publication receipt — computed before publishCompletedBassContract()
  // from the canonical metric authority and graph-source identity. This is the
  // sole authoritative publication receipt; BassResponse reads it from the contract.
  contract.metricPublication = metricPublication || null;

  return contract;
}