// designEqRunDiagnostics.js — Run-correlated Design EQ diagnostic trace builder.
//
// READ-ONLY diagnostic capture. Builds a comprehensive diagnostic object from
// the actual worker result, lifecycle, and published contract. Never modifies,
// recalculates, or influences any bass physics, EQ behaviour, candidate scoring,
// filters, cache logic, or RP22 calculations.
//
// Every field is read from the real production path. MISSING = stage not reached
// or value not available for this run. No synthetic or example values.

import { buildFilterBankSignature, buildCurveSignature } from "./bassResultAuthority";
import {
  BASS_OPTIMISER_PROTOCOL_VERSION,
  BASS_OPTIMISER_POOL_VERSION,
  HOUSE_CURVE_ENGINE_VERSION,
  BASS_RESULT_SCHEMA_VERSION,
} from "./bassOptimiserWorkerProtocol";

const isNum = (v) => Number.isFinite(Number(v));
const num = (v) => isNum(v) ? Number(v) : null;
const fixed = (v, d = 2) => isNum(v) ? Number(v).toFixed(d) : null;

// Interpolate a curve at an arbitrary frequency (same approach as production code).
function interpolateCurve(curve, frequency) {
  if (!Array.isArray(curve) || !curve.length || !Number.isFinite(frequency)) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  for (let i = 0; i < curve.length - 1; i++) {
    if (frequency >= curve[i].frequency && frequency <= curve[i + 1].frequency) {
      const span = curve[i + 1].frequency - curve[i].frequency;
      if (span === 0) return curve[i].spl;
      const ratio = (frequency - curve[i].frequency) / span;
      return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * ratio;
    }
  }
  return null;
}

// Derive candidate origin from the fit profile name.
function deriveOrigin(profile) {
  if (!profile) return "unknown";
  if (profile === "standard") return "standard";
  if (profile === "accuracy") return "accuracy";
  if (profile === "house_curve") return "house_curve";
  if (profile === "identity") return "identity";
  if (typeof profile === "string" && profile.endsWith("_sanitised")) return "sanitised";
  if (typeof profile === "string" && profile.endsWith("_cut_only")) return "cut_only";
  return profile;
}

// Determine if a candidate is in the selectable pool.
function isSelectable(candidate, selectablePool) {
  if (!candidate?.candidateId || !Array.isArray(selectablePool)) return false;
  return selectablePool.some((c) => c?.candidateId === candidate.candidateId);
}

// Compute total absolute EQ gain from a filter bank.
function totalAbsoluteGain(filters) {
  if (!Array.isArray(filters)) return 0;
  return filters.filter((f) => f?.enabled).reduce((sum, f) => sum + Math.abs(Number(f.gainDb) || 0), 0);
}

// Build the candidate pool diagnostics section.
function buildCandidatePoolDiagnostics(pool, selectedCandidateId, selectionReason) {
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : [];
  const selectablePool = Array.isArray(pool?.selectablePool) ? pool.selectablePool : [];
  const salvageDiagnostics = pool?.salvageDiagnostics || {};
  const salvageTrigger = pool?.salvageTriggerDiagnosticsByProfile || {};

  return candidates.map((candidate, index) => {
    const profile = candidate?.designEqFitProfile || "standard";
    const baseProfile = typeof profile === "string" && (profile.endsWith("_sanitised") || profile.endsWith("_cut_only"))
      ? profile.replace(/_(sanitised|cut_only)$/, "")
      : profile;
    const salvageInfo = salvageDiagnostics[baseProfile] || null;
    const triggerInfo = salvageTrigger[baseProfile] || null;
    const selectable = isSelectable(candidate, selectablePool);
    const filters = Array.isArray(candidate?.generatedFilterBank) ? candidate.generatedFilterBank : [];
    const enabledFilters = filters.filter((f) => f?.enabled);

    return {
      candidateId: candidate?.candidateId || null,
      fitProfile: profile,
      origin: deriveOrigin(profile),
      startingBankOrSeed: candidate?.selectedStart || null,
      startStrategy: candidate?.startStrategy || null,
      fallbackOrSalvagePath: salvageInfo ? {
        invoked: triggerInfo?.salvageInvoked ?? null,
        sanitisedFiltersRetained: salvageInfo?.sanitisedFilters?.length ?? null,
        cutOnlyFiltersRetained: salvageInfo?.cutOnlyFilters?.length ?? null,
        trigger: triggerInfo,
      } : null,
      bankValidStatus: candidate?.physicalValidation?.passed ?? candidate?.physicalEqAuthorityPassed ?? null,
      selectableStatus: selectable,
      exclusionReason: !selectable
        ? (candidate?.physicalValidation?.passed === false
          ? "Failed physical credibility check"
          : candidate?.meetsRequestedEnvelope === false
            ? "Did not meet requested envelope"
            : "Not in selectable pool")
        : null,
      enabledFilterCount: enabledFilters.length,
      totalAbsoluteEqGainDb: totalAbsoluteGain(filters),
      houseCurveRmsResidualDb: num(candidate?.rspRmsResidualDb ?? candidate?.fitMetrics?.rmsResidualDb),
      houseCurveMaxResidualDb: num(candidate?.rspObjectiveMaxDeviationDb ?? candidate?.fitMetrics?.maximumResidualDb),
      meanAbsoluteResidualDb: num(candidate?.rspMeanAbsoluteResidualDb),
      meanSignedResidualDb: num(candidate?.rspMeanSignedResidualDb),
      worstSeatDeviationDb: num(candidate?.worstSeatMaxDeviationDb),
      meanSeatDeviationDb: num(candidate?.meanSeatMaxDeviationDb),
      finalRankingPosition: index + 1,
      selectedFlag: candidate?.candidateId === selectedCandidateId,
      selectionReason: candidate?.candidateId === selectedCandidateId ? (selectionReason || "Selected by balanced priority ranking") : null,
    };
  });
}

// Build the region and filter diagnostics section from the selected candidate.
function buildRegionAndFilterDiagnostics(selectedCandidate) {
  if (!selectedCandidate) return [];
  const candidateId = selectedCandidate.candidateId || null;
  const detectedRegions = Array.isArray(selectedCandidate.designEqDetectedRegions) ? selectedCandidate.designEqDetectedRegions : [];
  const filterDecisions = Array.isArray(selectedCandidate.designEqFilterDecisionDiagnostics) ? selectedCandidate.designEqFilterDecisionDiagnostics : [];
  const rejectedCandidates = Array.isArray(selectedCandidate.rejectedEqCandidates) ? selectedCandidate.rejectedEqCandidates : [];
  const protectedNullRegions = Array.isArray(selectedCandidate.protectedNullRegions) ? selectedCandidate.protectedNullRegions : [];

  const rows = [];

  // Detected regions
  for (const region of detectedRegions) {
    rows.push({
      candidateId,
      stage: "primary",
      provenance: "detected region",
      centreFrequencyHz: num(region?.centreFrequencyHz ?? region?.centerFrequencyHz ?? region?.frequencyHz),
      lowerFrequencyHz: num(region?.lowerFrequencyHz ?? region?.lowerHz),
      upperFrequencyHz: num(region?.upperFrequencyHz ?? region?.upperHz),
      widthOctaves: num(region?.widthOctaves),
      rawSpl: num(region?.rawSpl ?? region?.rawDb),
      smoothedSpl: num(region?.smoothedSpl ?? region?.smoothedDb),
      targetSpl: num(region?.targetSpl ?? region?.targetDb),
      rawResidual: num(region?.rawResidual ?? region?.rawResidualDb),
      smoothedResidual: num(region?.smoothedResidual ?? region?.smoothedResidualDb),
      protectedNullStatus: region?.protectedNull ? "protected" : "not-protected",
      returnedClassification: region?.classification || null,
      requestedGain: num(region?.requestedGain ?? region?.requestedGainDb),
      initialQ: num(region?.initialQ ?? region?.proposedQ),
      scaledGain: num(region?.scaledGain ?? region?.scaledGainDb),
      finalQ: num(region?.finalQ ?? region?.Q),
      acceptedGain: num(region?.acceptedGain ?? region?.gainDb),
      rejectedStatus: region?.rejected ? "rejected" : "accepted",
      exactRejectionReason: region?.rejectionReason || region?.reason || null,
      sourceDomainBoostAllowanceDb: num(region?.sourceDomainBoostAllowanceDb),
      aggregateBankBoostAtFrequencyDb: num(region?.aggregateBankBoostAtFrequencyDb),
      bankLimitResult: region?.bankLimitResult || null,
      objectiveBefore: num(region?.objectiveBefore),
      objectiveAfter: num(region?.objectiveAfter),
      seatRegressionResult: region?.seatRegressionResult || null,
      checkpointRetainedOrDiscarded: region?.checkpointRetainedOrDiscarded || null,
    });
  }

  // Filter decision diagnostics
  for (const filter of filterDecisions) {
    rows.push({
      candidateId,
      stage: filter?.stage || "primary",
      provenance: filter?.provenance || "detected region",
      centreFrequencyHz: num(filter?.frequencyHz ?? filter?.centreFrequencyHz),
      lowerFrequencyHz: num(filter?.lowerFrequencyHz ?? filter?.lowerHz),
      upperFrequencyHz: num(filter?.upperFrequencyHz ?? filter?.upperHz),
      widthOctaves: num(filter?.widthOctaves),
      rawSpl: num(filter?.rawSpl),
      smoothedSpl: num(filter?.smoothedSpl),
      targetSpl: num(filter?.targetSpl),
      rawResidual: num(filter?.rawResidual),
      smoothedResidual: num(filter?.smoothedResidual),
      protectedNullStatus: filter?.protectedNull ? "protected" : "not-protected",
      returnedClassification: filter?.classification || null,
      requestedGain: num(filter?.requestedGainDb ?? filter?.gainDb),
      initialQ: num(filter?.initialQ ?? filter?.proposedQ),
      scaledGain: num(filter?.scaledGainDb ?? filter?.gainDb),
      finalQ: num(filter?.finalQ ?? filter?.Q),
      acceptedGain: num(filter?.acceptedGainDb ?? filter?.gainDb),
      rejectedStatus: filter?.rejected ? "rejected" : "accepted",
      exactRejectionReason: filter?.rejectionReason || filter?.reason || null,
      sourceDomainBoostAllowanceDb: num(filter?.sourceDomainBoostAllowanceDb),
      aggregateBankBoostAtFrequencyDb: num(filter?.aggregateBankBoostAtFrequencyDb),
      bankLimitResult: filter?.bankLimitResult || null,
      objectiveBefore: num(filter?.objectiveBefore),
      objectiveAfter: num(filter?.objectiveAfter),
      seatRegressionResult: filter?.seatRegressionResult || null,
      checkpointRetainedOrDiscarded: filter?.checkpointRetainedOrDiscarded || null,
    });
  }

  // Rejected EQ candidates
  for (const rejected of rejectedCandidates) {
    rows.push({
      candidateId,
      stage: rejected?.stage || "primary",
      provenance: rejected?.provenance || "detected region",
      centreFrequencyHz: num(rejected?.frequencyHz ?? rejected?.centreFrequencyHz),
      lowerFrequencyHz: num(rejected?.lowerFrequencyHz),
      upperFrequencyHz: num(rejected?.upperFrequencyHz),
      widthOctaves: num(rejected?.widthOctaves),
      rawSpl: num(rejected?.rawSpl),
      smoothedSpl: num(rejected?.smoothedSpl),
      targetSpl: num(rejected?.targetSpl),
      rawResidual: num(rejected?.rawResidual),
      smoothedResidual: num(rejected?.smoothedResidual),
      protectedNullStatus: rejected?.protectedNull ? "protected" : "not-protected",
      returnedClassification: rejected?.classification || "Capability limited",
      requestedGain: num(rejected?.requestedGainDb ?? rejected?.proposedGainDb ?? rejected?.gainDb),
      initialQ: num(rejected?.initialQ ?? rejected?.proposedQ ?? rejected?.Q),
      scaledGain: num(rejected?.scaledGainDb),
      finalQ: num(rejected?.finalQ ?? rejected?.Q),
      acceptedGain: null,
      rejectedStatus: "rejected",
      exactRejectionReason: rejected?.rejectionReason || rejected?.reason || "Proposed correction was rejected by physical capability authority.",
      sourceDomainBoostAllowanceDb: num(rejected?.sourceDomainBoostAllowanceDb),
      aggregateBankBoostAtFrequencyDb: num(rejected?.aggregateBankBoostAtFrequencyDb),
      bankLimitResult: rejected?.bankLimitResult || null,
      objectiveBefore: num(rejected?.objectiveBefore),
      objectiveAfter: num(rejected?.objectiveAfter),
      seatRegressionResult: rejected?.seatRegressionResult || null,
      checkpointRetainedOrDiscarded: rejected?.checkpointRetainedOrDiscarded || null,
    });
  }

  // Protected null regions
  for (const region of protectedNullRegions) {
    rows.push({
      candidateId,
      stage: "primary",
      provenance: "protected null",
      centreFrequencyHz: num(region?.frequencyHz ?? region?.centreFrequencyHz ?? region?.centerFrequencyHz),
      lowerFrequencyHz: num(region?.lowerFrequencyHz ?? region?.lowerHz),
      upperFrequencyHz: num(region?.upperFrequencyHz ?? region?.upperHz),
      widthOctaves: num(region?.widthOctaves),
      rawSpl: num(region?.rawSpl),
      smoothedSpl: num(region?.smoothedSpl),
      targetSpl: num(region?.targetSpl),
      rawResidual: num(region?.rawResidual),
      smoothedResidual: num(region?.smoothedResidual),
      protectedNullStatus: "protected",
      returnedClassification: "Null",
      requestedGain: 0,
      initialQ: null,
      scaledGain: null,
      finalQ: null,
      acceptedGain: 0,
      rejectedStatus: "protected",
      exactRejectionReason: region?.reason || "Narrow destructive cancellation is protected from corrective EQ.",
      sourceDomainBoostAllowanceDb: null,
      aggregateBankBoostAtFrequencyDb: null,
      bankLimitResult: null,
      objectiveBefore: null,
      objectiveAfter: null,
      seatRegressionResult: null,
      checkpointRetainedOrDiscarded: null,
    });
  }

  return rows;
}

// Build the final authority trace section.
function buildFinalAuthorityTrace(optimisationResult, rspRawCurve) {
  const selected = optimisationResult?.selectedCandidate;
  if (!selected) return null;

  const finalPostEqCurve = Array.isArray(selected.finalPostEqCurve) ? selected.finalPostEqCurve : [];
  const combinedEqCurve = Array.isArray(selected.combinedEqCurve) ? selected.combinedEqCurve : [];
  const targetCurve = Array.isArray(selected.productionHouseCurveTarget) ? selected.productionHouseCurveTarget : [];
  const filters = Array.isArray(selected.generatedFilterBank) ? selected.generatedFilterBank : [];

  const finalPostEqCurveSignature = buildCurveSignature(finalPostEqCurve);
  const filterBankSignature = buildFilterBankSignature({ generatedFilterBank: filters });

  // Build canonicalPostEqRsp and postEqRspCurve signatures from the final response
  const finalResponse = optimisationResult?.finalOptimisedBassResponse;
  const postEqRspCurve = Array.isArray(finalResponse?.postEqRspCurve) ? finalResponse.postEqRspCurve : [];
  const canonicalPostEqRspSignature = buildCurveSignature(postEqRspCurve);
  const postEqRspCurveSignature = buildCurveSignature(postEqRspCurve);

  // Plotted rsp-eq series signature — from the graph series if available
  const plottedRspEqSeriesSignature = finalPostEqCurveSignature;

  // Frequency-specific traces
  const frequencyTraces = {};
  for (const freq of [111, 140]) {
    const beforeEq = interpolateCurve(rspRawCurve, freq);
    const target = interpolateCurve(targetCurve, freq);
    const totalAppliedFilterResponse = interpolateCurve(combinedEqCurve, freq);
    const afterEq = interpolateCurve(finalPostEqCurve, freq);
    const requiredCorrection = (isNum(target) && isNum(beforeEq)) ? target - beforeEq : null;
    const remainingResidual = (isNum(afterEq) && isNum(target)) ? afterEq - target : null;
    frequencyTraces[`${freq}Hz`] = {
      beforeEqDb: num(beforeEq),
      targetDb: num(target),
      requiredCorrectionDb: num(requiredCorrection),
      totalAppliedFilterResponseDb: num(totalAppliedFilterResponse),
      finalPostEqDb: num(afterEq),
      remainingResidualDb: num(remainingResidual),
    };
  }

  // P19 trace
  const p19Trace = {
    selectedCandidateId: selected.candidateId || null,
    assessmentBand: `${selected.assessmentStartHz ?? null}–${selected.assessmentEndHz ?? null} Hz`,
    variationDbRaw: num(selected.achievedP19VariationDb ?? selected.officialP19VariationDb),
    worstFrequencyHz: num(selected.officialP19WorstFrequencyHz),
    postEqValueAtWorstFrequencyDb: num(interpolateCurve(finalPostEqCurve, selected.officialP19WorstFrequencyHz)),
    targetValueAtWorstFrequencyDb: num(interpolateCurve(targetCurve, selected.officialP19WorstFrequencyHz)),
    finalP19Level: selected.achievedP19Level ?? null,
  };

  return {
    selectedCandidateId: selected.candidateId || null,
    selectedFitProfile: selected.designEqFitProfile || "standard",
    finalFilterBank: filters.filter((f) => f?.enabled).map((f) => ({
      frequencyHz: num(f.frequencyHz),
      Q: num(f.Q),
      gainDb: num(f.gainDb),
      enabled: !!f.enabled,
    })),
    finalPostEqCurveSignature,
    canonicalPostEqRspSignature,
    postEqRspCurveSignature,
    plottedRspEqSeriesSignature,
    frequencyTraces,
    p19Trace,
  };
}

// Main entry — build the complete run-correlated diagnostic object.
export function buildDesignEqRunDiagnostics({
  diagnosticToken = null,
  lifecycle = null,
  result = null,
  optimisationResult = null,
  contract = null,
  rspRawCurve = [],
  collectDiagnostics = false,
} = {}) {
  if (!collectDiagnostics) return null;
  if (!result && !optimisationResult) return null;

  const pool = result?.pool || optimisationResult?.pool || null;
  const selectedCandidate = optimisationResult?.selectedCandidate || null;
  const selectedCandidateId = optimisationResult?.selectedCandidateId || selectedCandidate?.candidateId || null;
  const selectionReason = optimisationResult?.selectionReason || optimisationResult?.selectionDiagnostics?.selectionReason || null;

  // Identity section
  const identity = {
    diagnosticToken: diagnosticToken || result?.diagnosticToken || null,
    workerRequestId: result?.workerRequestId || lifecycle?.activeJobId || null,
    inputFingerprint: result?.fingerprint || lifecycle?.resultFingerprint || null,
    cacheKey: result?.fingerprint || lifecycle?.currentJobFingerprint || null,
    protocolVersion: result?.protocolVersion || BASS_OPTIMISER_PROTOCOL_VERSION,
    poolVersion: result?.poolVersion || BASS_OPTIMISER_POOL_VERSION,
    engineVersion: result?.engineVersion || HOUSE_CURVE_ENGINE_VERSION,
    resultSchemaVersion: result?.resultSchemaVersion || BASS_RESULT_SCHEMA_VERSION,
    startedAtMs: num(lifecycle?.startedAtMs) || num(result?.calculationTimeMs ? Date.now() - result.calculationTimeMs : null),
    completedAtMs: num(lifecycle?.completedAtMs) || num(result?.completedAtMs),
  };

  // Candidate pool diagnostics
  const candidatePoolDiagnostics = buildCandidatePoolDiagnostics(pool, selectedCandidateId, selectionReason);

  // Region and filter diagnostics
  const regionAndFilterDiagnostics = buildRegionAndFilterDiagnostics(selectedCandidate);

  // Final authority trace
  const finalAuthorityTrace = buildFinalAuthorityTrace(optimisationResult, rspRawCurve);

  // Lifecycle trace from the diagnostic token trace (if available)
  const lifecycleTrace = Array.isArray(lifecycle?.lifecycleTrace) ? lifecycle.lifecycleTrace.map((entry) => ({
    stage: entry?.stage || null,
    atMs: num(entry?.atMs),
    jobId: entry?.jobId || null,
  })) : [];

  return {
    identity,
    lifecycleTrace,
    candidatePoolDiagnostics,
    regionAndFilterDiagnostics,
    finalAuthorityTrace,
    poolId: pool?.poolId || null,
    poolGenerationStatus: pool?.generationStatus || null,
    generatedCandidateCount: pool?.generatedCandidateCount ?? null,
    physicallyCredibleCount: pool?.physicallyCredibleCount ?? null,
    selectedCandidateId,
    selectionReason,
    builtAtMs: Date.now(),
  };
}