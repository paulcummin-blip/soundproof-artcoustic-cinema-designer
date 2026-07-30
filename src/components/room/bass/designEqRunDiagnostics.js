// designEqRunDiagnostics.js — Run-correlated Design EQ diagnostic trace builder.
//
// READ-ONLY diagnostic capture. Builds a comprehensive diagnostic object from
// the actual worker result, lifecycle, and published contract. Never modifies,
// recalculates, or influences any bass physics, EQ behaviour, candidate scoring,
// filters, cache logic, or RP22 calculations.
//
// EVIDENCE INTEGRITY RULES:
//   - Every field is read from the real production path. MISSING = null.
//   - No synthetic values, no example values, no inferred reasons.
//   - No derived timestamps presented as captured.
//   - No constant substitution when worker-version fields are absent.
//   - Ranking comes from selectionDiagnostics.rankedCandidates, not array position.
//   - Rejection status uses three explicit states: accepted / rejected / unknown.
//   - `rejected === false` is NOT proof of acceptance — only explicit
//     `decision === "Accepted"` or `accepted === true` means accepted.
//   - Curve signatures are computed from their actual corresponding curves.
//   - Filter response contributions use the EXACT production peakingEqResponseDb
//     function — never an approximation.

import { buildCurveSignature } from "./bassResultAuthority";
import { peakingEqResponseDb } from "@/components/utils/designEqBankLimits";
import { getDiagRun } from "./bassDiagTokenTrace";

const isNum = (v) => Number.isFinite(Number(v));
const num = (v) => isNum(v) ? Number(v) : null;

// Interpolate a curve at an arbitrary frequency (read-only, same approach as production).
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

// Adapt a graph series into the {frequency, spl} format expected by buildCurveSignature.
// Does NOT change any values — only maps the actual plotted point shape. Handles
// {frequency, spl}, {x, y}, and {freq, db} without altering the underlying numbers.
function adaptGraphSeriesToCurveSignatureInput(series) {
  if (!Array.isArray(series) || !series.length) return [];
  return series.map((point) => {
    if (!point || typeof point !== "object") return null;
    const frequency = Number.isFinite(Number(point.frequency)) ? Number(point.frequency)
      : Number.isFinite(Number(point.x)) ? Number(point.x)
      : Number.isFinite(Number(point.freq)) ? Number(point.freq)
      : null;
    const spl = Number.isFinite(Number(point.spl)) ? Number(point.spl)
      : Number.isFinite(Number(point.y)) ? Number(point.y)
      : Number.isFinite(Number(point.db)) ? Number(point.db)
      : null;
    if (frequency == null || spl == null) return null;
    return { frequency, spl };
  }).filter(Boolean);
}

// Three-state rejection: accepted / rejected / unknown.
// Uses ONLY explicit production decision fields. `rejected === false` is NOT
// proof of acceptance — it only means rejection was not explicitly recorded.
function rejectionStatus(entry) {
  if (!entry) return "unknown";
  if (entry.decision === "Accepted") return "accepted";
  if (entry.decision === "Rejected") return "rejected";
  if (entry.accepted === true) return "accepted";
  if (entry.rejected === true) return "rejected";
  return "unknown";
}

// Compute total absolute EQ gain from a filter bank (read-only).
function totalAbsoluteGain(filters) {
  if (!Array.isArray(filters)) return 0;
  return filters.filter((f) => f?.enabled).reduce((sum, f) => sum + Math.abs(Number(f.gainDb) || 0), 0);
}

// Build the candidate pool diagnostics section.
// Ranking comes from selectionDiagnostics.rankedCandidates, NOT array position.
// Exclusion reasons use ONLY stored production fields — no synthetic fallback text.
function buildCandidatePoolDiagnostics(pool, optimisationResult) {
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : [];
  const selectablePool = Array.isArray(pool?.selectablePool) ? pool.selectablePool : [];
  const salvageDiagnostics = pool?.salvageDiagnostics || {};
  const salvageTrigger = pool?.salvageTriggerDiagnosticsByProfile || {};
  const selectionDiagnostics = optimisationResult?.selectionDiagnostics || {};
  const rankedCandidates = Array.isArray(selectionDiagnostics.rankedCandidates) ? selectionDiagnostics.rankedCandidates : [];
  const selectedCandidateId = optimisationResult?.selectedCandidateId || null;

  const rankByCandidateId = new Map();
  const selectionReasonByCandidateId = new Map();
  for (const rc of rankedCandidates) {
    if (rc?.candidateId) {
      rankByCandidateId.set(rc.candidateId, rc.rank ?? null);
      selectionReasonByCandidateId.set(rc.candidateId, rc.reason || null);
    }
  }

  return candidates.map((candidate) => {
    const profile = candidate?.designEqFitProfile || null;
    const baseProfile = typeof profile === "string" && (profile.endsWith("_sanitised") || profile.endsWith("_cut_only"))
      ? profile.replace(/_(sanitised|cut_only)$/, "")
      : profile;
    const salvageInfo = baseProfile ? (salvageDiagnostics[baseProfile] || null) : null;
    const triggerInfo = baseProfile ? (salvageTrigger[baseProfile] || null) : null;
    const selectable = selectablePool.some((c) => c?.candidateId === candidate?.candidateId);
    const filters = Array.isArray(candidate?.generatedFilterBank) ? candidate.generatedFilterBank : [];
    const enabledFilters = filters.filter((f) => f?.enabled);
    const candidateId = candidate?.candidateId || null;
    const rank = candidateId ? (rankByCandidateId.get(candidateId) ?? null) : null;
    const storedReason = candidateId ? (selectionReasonByCandidateId.get(candidateId) ?? null) : null;

    // Exclusion reason from actual stored fields only — no synthetic fallback text.
    // When no reason was recorded by the production path, return null.
    let exclusionReason = null;
    if (!selectable) {
      if (candidate?.physicalValidation?.passed === false) {
        exclusionReason = candidate?.physicalValidation?.reason || candidate?.physicalValidation?.message || null;
      } else if (candidate?.bankValidationResult?.allOk === false) {
        exclusionReason = candidate?.bankValidationResult?.reason || null;
      }
      // No synthetic fallback labels — return null when no reason was recorded.
    }

    return {
      candidateId,
      fitProfile: profile,
      startingBankOrSeed: candidate?.selectedStart ?? null,
      startStrategy: candidate?.startStrategy || null,
      fallbackOrSalvagePath: salvageInfo ? {
        invoked: triggerInfo?.salvageInvoked ?? null,
        sanitisedFiltersRetained: salvageInfo?.sanitisedFilters?.length ?? null,
        cutOnlyFiltersRetained: salvageInfo?.cutOnlyFilters?.length ?? null,
        trigger: triggerInfo || null,
      } : null,
      bankValidStatus: candidate?.physicalValidation?.passed ?? candidate?.physicalEqAuthorityPassed ?? null,
      selectableStatus: selectable,
      exclusionReason,
      enabledFilterCount: enabledFilters.length,
      totalAbsoluteEqGainDb: totalAbsoluteGain(filters),
      houseCurveRmsResidualDb: num(candidate?.rspRmsResidualDb ?? candidate?.fitMetrics?.rmsResidualDb),
      houseCurveMaxResidualDb: num(candidate?.rspObjectiveMaxDeviationDb ?? candidate?.fitMetrics?.maximumResidualDb),
      meanAbsoluteResidualDb: num(candidate?.rspMeanAbsoluteResidualDb),
      meanSignedResidualDb: num(candidate?.rspMeanSignedResidualDb),
      worstSeatDeviationDb: num(candidate?.worstSeatMaxDeviationDb),
      meanSeatDeviationDb: num(candidate?.meanSeatMaxDeviationDb),
      finalRankingPosition: rank,
      selectedFlag: candidateId === selectedCandidateId,
      selectionReason: candidateId === selectedCandidateId ? (storedReason || selectionDiagnostics?.selectionReason || null) : storedReason,
    };
  });
}

// Build region and filter diagnostics for a SINGLE candidate.
// Captures detected regions, primary decisions, rejected proposals, and
// protected null regions from the actual stored production diagnostic arrays.
function buildCandidateRegionAndFilterDiagnostics(candidate) {
  if (!candidate) return [];
  const candidateId = candidate.candidateId || null;
  const fitProfile = candidate.designEqFitProfile || null;
  const detectedRegions = Array.isArray(candidate.designEqDetectedRegions) ? candidate.designEqDetectedRegions : [];
  const filterDecisions = Array.isArray(candidate.designEqFilterDecisionDiagnostics) ? candidate.designEqFilterDecisionDiagnostics : [];
  const rejectedCandidates = Array.isArray(candidate.rejectedEqCandidates) ? candidate.rejectedEqCandidates : [];
  const protectedNullRegions = Array.isArray(candidate.protectedNullRegions) ? candidate.protectedNullRegions : [];

  const rows = [];

  for (const region of detectedRegions) {
    rows.push({
      candidateId, fitProfile,
      stage: "primary",
      provenance: "detected region",
      centreFrequencyHz: num(region?.centreHz ?? region?.centreFrequencyHz ?? region?.centerFrequencyHz ?? region?.frequencyHz),
      lowerFrequencyHz: num(region?.startHz ?? region?.lowerFrequencyHz ?? region?.lowerHz),
      upperFrequencyHz: num(region?.endHz ?? region?.upperFrequencyHz ?? region?.upperHz),
      widthOctaves: num(region?.widthOctaves),
      rawSpl: num(region?.rawSpl ?? region?.rawDb),
      smoothedSpl: num(region?.smoothedSpl ?? region?.smoothedDb),
      targetSpl: num(region?.targetSpl ?? region?.targetDb),
      rawResidual: num(region?.rawResidual ?? region?.rawResidualDb),
      smoothedResidual: num(region?.smoothedResidual ?? region?.smoothedResidualDb),
      protectedNullStatus: region?.insideProtectedNull ? "protected" : (region?.protectedNull ? "protected" : "not-protected"),
      returnedClassification: region?.kind || region?.classification || null,
      requestedGain: num(region?.requestedGain ?? region?.requestedGainDb),
      initialQ: num(region?.initialQ ?? region?.proposedQ),
      scaledGain: num(region?.scaledGain ?? region?.scaledGainDb),
      finalQ: num(region?.finalQ ?? region?.Q),
      acceptedGain: num(region?.acceptedGain ?? region?.gainDb),
      rejectedStatus: rejectionStatus(region),
      exactRejectionReason: region?.reason || region?.rejectionReason || null,
      sourceDomainBoostAllowanceDb: num(region?.sourceDomainBoostAllowanceDb),
      aggregateBankBoostAtFrequencyDb: num(region?.aggregateBankBoostAtFrequencyDb),
      bankLimitResult: region?.bankLimitResult || null,
      objectiveBefore: num(region?.objectiveBefore),
      objectiveAfter: num(region?.objectiveAfter),
      seatRegressionResult: region?.seatRegressionResult || null,
      checkpointRetainedOrDiscarded: region?.checkpointRetainedOrDiscarded || null,
    });
  }

  for (const filter of filterDecisions) {
    rows.push({
      candidateId, fitProfile,
      stage: filter?.stage || "primary",
      provenance: filter?.provenance || "filter decision",
      centreFrequencyHz: num(filter?.frequencyHz ?? filter?.centreFrequencyHz),
      lowerFrequencyHz: num(filter?.lowerFrequencyHz ?? filter?.lowerHz),
      upperFrequencyHz: num(filter?.upperFrequencyHz ?? filter?.upperHz),
      widthOctaves: num(filter?.widthOctaves),
      rawSpl: num(filter?.beforeEqSpl ?? filter?.rawSpl),
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
      rejectedStatus: rejectionStatus(filter),
      exactRejectionReason: filter?.reason || filter?.rejectionReason || null,
      sourceDomainBoostAllowanceDb: num(filter?.sourceDomainBoostAllowanceDb),
      aggregateBankBoostAtFrequencyDb: num(filter?.aggregateCorrectionAtFrequencyDb ?? filter?.aggregateBankBoostAtFrequencyDb),
      bankLimitResult: filter?.bankLimitResult || null,
      objectiveBefore: num(filter?.objectiveBefore),
      objectiveAfter: num(filter?.objectiveAfter),
      seatRegressionResult: filter?.seatRegressionResult || null,
      checkpointRetainedOrDiscarded: filter?.checkpointRetainedOrDiscarded || null,
    });
  }

  for (const rejected of rejectedCandidates) {
    rows.push({
      candidateId, fitProfile,
      stage: rejected?.stage || "primary",
      provenance: rejected?.provenance || "rejected candidate",
      centreFrequencyHz: num(rejected?.frequencyHz ?? rejected?.centreFrequencyHz),
      lowerFrequencyHz: num(rejected?.lowerFrequencyHz ?? rejected?.startHz),
      upperFrequencyHz: num(rejected?.upperFrequencyHz ?? rejected?.endHz),
      widthOctaves: num(rejected?.widthOctaves),
      rawSpl: num(rejected?.beforeEqSpl ?? rejected?.rawSpl),
      smoothedSpl: num(rejected?.smoothedSpl),
      targetSpl: num(rejected?.targetSpl),
      rawResidual: num(rejected?.rawResidual),
      smoothedResidual: num(rejected?.smoothedResidual),
      protectedNullStatus: rejected?.protectedNull ? "protected" : "not-protected",
      returnedClassification: rejected?.classification || null,
      requestedGain: num(rejected?.requestedGainDb ?? rejected?.proposedGainDb ?? rejected?.gainDb),
      initialQ: num(rejected?.initialQ ?? rejected?.proposedQ ?? rejected?.Q),
      scaledGain: num(rejected?.scaledGainDb),
      finalQ: num(rejected?.finalQ ?? rejected?.Q),
      acceptedGain: null,
      rejectedStatus: "rejected",
      exactRejectionReason: rejected?.reason || rejected?.rejectionReason || null,
      sourceDomainBoostAllowanceDb: num(rejected?.sourceDomainBoostAllowanceDb),
      aggregateBankBoostAtFrequencyDb: num(rejected?.aggregateBankBoostAtFrequencyDb),
      bankLimitResult: rejected?.bankLimitResult || null,
      objectiveBefore: num(rejected?.objectiveBefore),
      objectiveAfter: num(rejected?.objectiveAfter),
      seatRegressionResult: rejected?.seatRegressionResult || null,
      checkpointRetainedOrDiscarded: rejected?.checkpointRetainedOrDiscarded || null,
    });
  }

  for (const region of protectedNullRegions) {
    rows.push({
      candidateId, fitProfile,
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
      requestedGain: null,
      initialQ: null,
      scaledGain: null,
      finalQ: null,
      acceptedGain: null,
      rejectedStatus: "protected",
      exactRejectionReason: region?.reason || null,
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

// Build the region and filter diagnostics section covering EVERY pool candidate.
// Each row preserves the real candidate ID and fit profile.
function buildRegionAndFilterDiagnostics(pool) {
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : [];
  const allRows = [];
  for (const candidate of candidates) {
    allRows.push(...buildCandidateRegionAndFilterDiagnostics(candidate));
  }
  return allRows;
}

// List every filter materially contributing at a specific frequency.
// Uses the EXACT production peakingEqResponseDb — never an approximation.
function contributingFiltersAtFrequency(filters, frequency, thresholdDb = 0.1) {
  if (!Array.isArray(filters) || !Number.isFinite(frequency)) return [];
  return filters
    .filter((f) => f?.enabled)
    .map((f) => {
      const contribution = peakingEqResponseDb(frequency, f);
      return {
        frequencyHz: num(f.frequencyHz),
        Q: num(f.Q),
        gainDb: num(f.gainDb),
        contributionDb: Number.isFinite(contribution) ? contribution : null,
        material: Number.isFinite(contribution) && Math.abs(contribution) >= thresholdDb,
      };
    })
    .filter((f) => f.material);
}

// Build the final authority trace section.
// Curve signatures are computed from their ACTUAL corresponding curves.
// Graph series is adapted into {frequency, spl} without changing values.
function buildFinalAuthorityTrace(optimisationResult, rspRawCurve, graphRspEqSeries) {
  const selected = optimisationResult?.selectedCandidate;
  if (!selected) return null;

  const finalPostEqCurve = Array.isArray(selected.finalPostEqCurve) ? selected.finalPostEqCurve : [];
  const combinedEqCurve = Array.isArray(selected.combinedEqCurve) ? selected.combinedEqCurve : [];
  const targetCurve = Array.isArray(selected.productionHouseCurveTarget) ? selected.productionHouseCurveTarget : [];
  const filters = Array.isArray(selected.generatedFilterBank) ? selected.generatedFilterBank : [];

  // Signature 1: selected candidate finalPostEqCurve
  const finalPostEqCurveSignature = buildCurveSignature(finalPostEqCurve);

  // Signature 2: canonicalPostEqRsp from the final response
  const finalResponse = optimisationResult?.finalOptimisedBassResponse;
  const canonicalPostEqRsp = Array.isArray(finalResponse?.canonicalPostEqRsp) ? finalResponse.canonicalPostEqRsp : [];
  const canonicalPostEqRspSignature = buildCurveSignature(canonicalPostEqRsp);

  // Signature 3: final response postEqRspCurve
  const postEqRspCurve = Array.isArray(finalResponse?.postEqRspCurve) ? finalResponse.postEqRspCurve : [];
  const postEqRspCurveSignature = buildCurveSignature(postEqRspCurve);

  // Signature 4: actual graph rsp-eq series after graph-domain construction and display smoothing.
  // Adapt the real plotted series into the signature input without changing its values.
  const graphRspEqAdapted = adaptGraphSeriesToCurveSignatureInput(graphRspEqSeries);
  const plottedRspEqSeriesSignature = buildCurveSignature(graphRspEqAdapted);

  // Frequency-specific traces for 111 Hz and 140 Hz.
  // Filter contributions use the EXACT production peakingEqResponseDb.
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
      contributingFilters: contributingFiltersAtFrequency(filters, freq),
    };
  }

  return {
    selectedCandidateId: selected.candidateId || null,
    selectedFitProfile: selected.designEqFitProfile || null,
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
  };
}

// Build the P19 authority trace from the published contract ONLY.
// Uses contract.productAnalysis.parameters.p19. Does not substitute p19.value
// for variationDbRaw unless the production contract explicitly establishes
// they are the same field. Fields not exposed in the contract return null.
function buildP19AuthorityTrace(contract) {
  const p19 = contract?.productAnalysis?.parameters?.p19;
  if (!p19) return null;
  return {
    value: num(p19.value),
    unit: p19.unit || null,
    level: num(p19.level),
    // The published P19 contract does not expose variationDbRaw separately.
    // Do not substitute p19.value for variationDbRaw.
    variationDbRaw: null,
    worstFrequencyHz: null,
    assessmentBand: null,
    sourceCurveIdentity: null,
    postEqSplAtWorstFrequencyDb: null,
    targetSplAtWorstFrequencyDb: null,
    selectedCandidateId: contract?.selectedCandidateId || null,
    status: p19.status || null,
    passedL1: p19.passedL1 ?? null,
  };
}

// Build the lifecycle trace from the real bassDiagTokenTrace data for this token.
// Only includes stages actually recorded for this exact token.
function buildLifecycleTrace(diagnosticToken) {
  if (!diagnosticToken) return [];
  const run = getDiagRun(diagnosticToken);
  if (!run?.stages) return [];
  const stageOrder = [
    "token-created",
    "requestManual",
    "startRequest",
    "worker.postMessage",
    "worker-event-received",
    "worker-completed",
    "main-thread-accepted",
    "result-published",
    "contract-published",
  ];
  const stages = run.stages;
  const result = [];
  for (const stageName of stageOrder) {
    const entry = stages[stageName];
    if (entry) {
      result.push({
        stage: stageName,
        atMs: num(entry.ts),
        requestId: entry.requestId || entry.startRequestId || entry.postMessageRequestId || entry.completedRequestId || entry.acceptedRequestId || entry.publishedRequestId || null,
      });
    }
  }
  // Include any stages not in the predefined order (defensive).
  for (const [stageName, entry] of Object.entries(stages)) {
    if (!stageOrder.includes(stageName)) {
      result.push({
        stage: stageName,
        atMs: num(entry.ts),
        requestId: entry.requestId || null,
      });
    }
  }
  return result;
}

// Main entry — build the complete run-correlated diagnostic object.
export function buildDesignEqRunDiagnostics({
  diagnosticToken = null,
  lifecycle = null,
  result = null,
  optimisationResult = null,
  contract = null,
  rspRawCurve = [],
  graphRspEqSeries = null,
  collectDiagnostics = false,
} = {}) {
  // Gate: only build if the result itself proves diagnostics were collected.
  const resultCollectDiagnostics = result?.collectDiagnostics === true || optimisationResult?.collectDiagnostics === true;
  if (!resultCollectDiagnostics) return null;
  if (!result && !optimisationResult) return null;
  if (!diagnosticToken) return null;

  const pool = result?.pool || optimisationResult?.pool || null;

  // Identity section — uses captured run fields only. No constant substitution.
  // No derived timestamps. Reports missing data as null.
  const identity = {
    diagnosticToken: diagnosticToken || null,
    workerRequestId: result?.workerRequestId || null,
    inputFingerprint: result?.fingerprint || null,
    cacheKey: result?.fingerprint || null,
    protocolVersion: result?.protocolVersion || null,
    poolVersion: result?.poolVersion || null,
    engineVersion: result?.engineVersion || null,
    resultSchemaVersion: result?.resultSchemaVersion || null,
    startedAtMs: num(result?.startedAtMs),
    completedAtMs: num(result?.completedAtMs),
    collectDiagnostics: result?.collectDiagnostics === true,
  };

  const candidatePoolDiagnostics = buildCandidatePoolDiagnostics(pool, optimisationResult);
  const regionAndFilterDiagnostics = buildRegionAndFilterDiagnostics(pool);
  const finalAuthorityTrace = buildFinalAuthorityTrace(optimisationResult, rspRawCurve, graphRspEqSeries);
  const p19AuthorityTrace = buildP19AuthorityTrace(contract);
  const lifecycleTrace = buildLifecycleTrace(diagnosticToken);

  return {
    identity,
    lifecycleTrace,
    candidatePoolDiagnostics,
    regionAndFilterDiagnostics,
    finalAuthorityTrace,
    p19AuthorityTrace,
    poolId: pool?.poolId || null,
    poolGenerationStatus: pool?.generationStatus || null,
    generatedCandidateCount: pool?.generatedCandidateCount ?? null,
    physicallyCredibleCount: pool?.physicallyCredibleCount ?? null,
    selectedCandidateId: optimisationResult?.selectedCandidateId || optimisationResult?.selectedCandidate?.candidateId || null,
    selectionReason: optimisationResult?.selectionDiagnostics?.selectionReason || optimisationResult?.selectionReason || null,
    // UI JSON construction time — NOT captured run evidence. Labelled explicitly.
    uiJsonConstructedAtMs: Date.now(),
  };
}