import { calculateDesignEqCurve, DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import { computeParam18AchievedExtension, computeP19DeviationBelowSchroeder, artcousticHouseCurveOffsetAt } from "@/components/utils/rp22BassMetrics";
import { computeOfficialP19Assessment, computeOfficialP20Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { selectCandidateFromPool } from "@/components/utils/bassCandidatePoolSelection";
import { calculateHouseCurveEqCurve } from "@/components/utils/houseCurveFitter";
import { calculateAllSeatMetricsFromCorrected, houseCurveP19Level } from "@/components/utils/houseCurveFitterCore";
import { summarizeCoreOperations } from "@/components/utils/bassOptimiserPerformance";
import { annotateCandidatePoolForHouseCurveRanking } from "@/components/utils/houseCurveCandidateRankingMetrics";
import { stampPoolAuthority } from "@/components/room/bass/bassResultAuthority";
import { BASS_OPTIMISER_POOL_VERSION } from "@/components/room/bass/bassOptimiserWorkerProtocol";
import { isPhysicallyCredibleBassCandidate } from "@/components/utils/bassCandidatePoolEligibility";
import { buildCanonicalAbsoluteHouseCurveTarget, interpolateCanonicalTarget, resolveHouseCurveDomains } from "@/components/utils/houseCurveTargetAuthority";
import { identifyProtectedNullRegions, isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import { assessP14Capability } from "@/components/utils/p14CapabilityAuthority";
import { calculatePairedP14P18ProductionAuthority } from "@/components/utils/pairedP14P18ProductionAuthority";
import { buildPairedP14P18CandidateSummary } from "@/components/utils/pairedP14P18CandidateSummary";
import { buildFilterBankSignature } from "@/components/room/bass/bassResultAuthority";
import { buildBassCapabilityReceiptDiagnostics } from "@/components/room/bass/bassCapabilityDiagnostics";
import { resolveRequestedRp22HouseCurveTarget } from "@/components/utils/requestedRp22HouseCurveAuthority";
import { buildPostEqBassCapabilityOutcome } from "@/components/utils/postEqBassCapabilityOutcome";
import { generateCanonicalCandidatePool } from "@/components/utils/canonicalBassOptimiser";

const isNumber = (value) => Number.isFinite(Number(value));

function levelFromValue(value, definitions, key, lowerIsBetter = false) {
  if (!isNumber(value)) return 0;
  const eligible = definitions.filter((definition) => lowerIsBetter ? value <= definition[key] : value >= definition[key]);
  return eligible.length ? Math.max(...eligible.map((definition) => definition.value)) : 0;
}

// Interpolate the combined EQ correction curve at an arbitrary frequency.
// Used to apply the RSP-calibrated EQ bank to each real seat's raw response
// without re-running the Design EQ fitter.
function interpolateCorrection(combinedEqCurve, frequency) {
  if (!Array.isArray(combinedEqCurve) || combinedEqCurve.length === 0 || !Number.isFinite(frequency)) return 0;
  if (frequency <= combinedEqCurve[0].frequency) return combinedEqCurve[0].spl;
  if (frequency >= combinedEqCurve[combinedEqCurve.length - 1].frequency) return combinedEqCurve[combinedEqCurve.length - 1].spl;
  for (let i = 0; i < combinedEqCurve.length - 1; i++) {
    if (frequency >= combinedEqCurve[i].frequency && frequency <= combinedEqCurve[i + 1].frequency) {
      const span = combinedEqCurve[i + 1].frequency - combinedEqCurve[i].frequency;
      if (span === 0) return combinedEqCurve[i].spl;
      const ratio = (frequency - combinedEqCurve[i].frequency) / span;
      return combinedEqCurve[i].spl + (combinedEqCurve[i + 1].spl - combinedEqCurve[i].spl) * ratio;
    }
  }
  return 0;
}

function makeRequests(definitions, requestedLevel) {
  const requested = definitions.find((definition) => definition.value === requestedLevel);
  return requested ? [{ p14: requested, p18: requested, p19: requested }] : [];
}

export function buildCandidate({ request, rawCurve, activeSubs, usableLfHz, definitions, eqResult, perSeatRawCurves, targetAnchorDb, targetAnchorSource, designTarget, p14TargetBasis, domains, canonicalTargetCurve, protectedNullRegions, perSourceComplexTransfers, normalizedTransferFingerprint, calibrationFingerprint }) {
  const assessmentStartHz = domains.p19StartHz;
  const assessmentEndHz = domains.p19EndHz;
  const correctionStartHz = domains.correctionStartHz;
  const correctionEndHz = domains.correctionEndHz;
  const eq = eqResult;
  const finalPostEqCurve = eq.curve;
  const combinedEqCurve = eq.combinedEqCurve || [];
  const capabilityLimitedFrequencies = eq.filters.filter((filter) => filter.enabled && filter.gainDb > 0 && filter.gainDb < 6).map((filter) => filter.frequencyHz);

  // Candidate-specific P19 diagnostics are derived from the fixed request without re-running EQ.
  const candidateRequestedP19ToleranceDb = request.p19.p19ToleranceDb;
  const candidateRequestedP19FullDifferenceCeilingDb = 2 * (candidateRequestedP19ToleranceDb + 1);
  const candidateWorstResidualDiagnostics = Array.isArray(eq.worstResidualDiagnostics)
    ? eq.worstResidualDiagnostics.map((diag) => {
        const signedResidualDb = diag.signedResidualDb;
        const remainingPointBoostDb = diag.remainingPointBoostDb;
        const requiredBoostToP19ToleranceDb = signedResidualDb < 0
          ? Math.max(0, Math.abs(signedResidualDb) - candidateRequestedP19FullDifferenceCeilingDb + 1e-6)
          : 0;
        const p19ToleranceCapabilityLimited = signedResidualDb < 0
          && requiredBoostToP19ToleranceDb > remainingPointBoostDb;
        return { ...diag, requiredBoostToP19ToleranceDb, p19ToleranceCapabilityLimited };
      })
    : eq.worstResidualDiagnostics;
  const p14 = assessP14Capability({ activeSubs, combinedEqCurve, targetBasis: p14TargetBasis });
  const smoothed = applyBassSmoothing(finalPostEqCurve, "third");
  const assessedCurve = smoothed.filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz);
  const productionHouseCurveTarget = canonicalTargetCurve.map((point) => ({ ...point }));
  const rspResiduals = assessedCurve.map((point) => point.spl - interpolateCanonicalTarget(productionHouseCurveTarget, point.frequency));
  const rspRmsResidualDb = rspResiduals.length ? Math.sqrt(rspResiduals.reduce((sum, value) => sum + value ** 2, 0) / rspResiduals.length) : null;
  const rspMeanSignedResidualDb = rspResiduals.length ? rspResiduals.reduce((sum, value) => sum + value, 0) / rspResiduals.length : null;
  const rspMeanAbsoluteResidualDb = rspResiduals.length ? rspResiduals.reduce((sum, value) => sum + Math.abs(value), 0) / rspResiduals.length : null;
  const rspShapeRmsResidualDb = rspResiduals.length ? Math.sqrt(rspResiduals.reduce((sum, value) => sum + (value - rspMeanSignedResidualDb) ** 2, 0) / rspResiduals.length) : null;
  const officialP19 = computeOfficialP19Assessment({
    rspPostEqCurve: finalPostEqCurve,
    canonicalTargetCurve: productionHouseCurveTarget,
    assessmentStartHz,
    assessmentEndHz,
  });
  const correctableAssessedCurve = assessedCurve.filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
  const correctableP19 = computeP19DeviationBelowSchroeder({
    freqsHz: correctableAssessedCurve.map((point) => point.frequency),
    splDb: correctableAssessedCurve.map((point) => point.spl),
    targetDb: correctableAssessedCurve.map((point) => interpolateCanonicalTarget(productionHouseCurveTarget, point.frequency)),
    schroederHz: assessmentEndHz,
  });
  const achievedP14Db = p14?.value ?? null;
  const p14CheckpointDeltaDb = null;
  const achievedP14Level = p14?.level ?? 0;
  const achievedP14MinimumLevel = p14?.minimumLevel ?? 0;
  const achievedP14RecommendedLevel = p14?.recommendedLevel ?? 0;
  const achievedP19VariationDb = officialP19.variationDbRaw;
  const achievedP19Level = houseCurveP19Level(achievedP19VariationDb);

  // Apply the same RSP-calibrated EQ bank to every real seat; no per-seat re-fitting.
  const candidateTargetAnchorDb = targetAnchorDb;
  let worstRealSeatHouseCurveVariationDb = null;
  let worstRealSeatHouseCurveLevel = 0;
  let worstRealSeatHouseCurveSeatId = null;
  const perSeatPostEqCurves = [];
  for (const seat of perSeatRawCurves || []) {
    if (!seat?.seatId || !Array.isArray(seat?.responseData) || seat.responseData.length === 0) continue;
    if (seat.seatId === "rsp" || seat.__isSyntheticRsp) continue;
    const postEqSeatCurve = seat.responseData.map((point) => ({
      frequency: point.frequency,
      spl: point.spl + interpolateCorrection(combinedEqCurve, point.frequency),
    }));
    perSeatPostEqCurves.push({ seatId: seat.seatId, responseData: postEqSeatCurve, isPrimary: !!seat.isPrimary });
    const seatSmoothed = applyBassSmoothing(postEqSeatCurve, "third");
    const seatAssessed = seatSmoothed.filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz);
    const seatP19 = computeP19DeviationBelowSchroeder({
      freqsHz: seatAssessed.map((p) => p.frequency),
      splDb: seatAssessed.map((p) => p.spl),
      targetDb: seatAssessed.map((p) => interpolateCanonicalTarget(productionHouseCurveTarget, p.frequency)),
      schroederHz: assessmentEndHz,
    });
    const seatVariation = seatP19?.resultDb ?? null;
    if (Number.isFinite(seatVariation) && (worstRealSeatHouseCurveVariationDb === null || seatVariation > worstRealSeatHouseCurveVariationDb)) {
      worstRealSeatHouseCurveVariationDb = seatVariation;
      worstRealSeatHouseCurveSeatId = seat.seatId;
    }
  }
  worstRealSeatHouseCurveLevel = houseCurveP19Level(worstRealSeatHouseCurveVariationDb);
  const p18 = computeParam18AchievedExtension({
    rspPostEqCurve: finalPostEqCurve, perSeatPostEqCurves, activeSubs,
    configuredUsableLfHz: usableLfHz, p14TargetBasis,
  });
  const achievedP18FrequencyHz = p18?.value ?? null;
  const achievedP18Level = Number(String(p18?.level || "").replace("L", "")) || 0;
  const legacyMeetsRequestedEnvelope = achievedP14Level >= request.p14.value && achievedP18Level >= request.p18.value && achievedP19Level >= request.p19.value;
  const legacyRejectionReason = [
    achievedP14Level < request.p14.value && `P14 ${p14?.targetBasisLabel || "Minimum"} design target not achieved after EQ headroom`,
    achievedP18Level < request.p18.value && `Achieved post-EQ room extension does not reach the requested ${request.p18.p18LimitHz} Hz boundary`,
    achievedP19Level < request.p19.value && `P19 variation exceeds ±${request.p19.p19ToleranceDb} dB between ${assessmentStartHz}–${assessmentEndHz} Hz`,
  ].filter(Boolean).join("; ");

  // Calculate uniform fixed-target seat metrics for every EQ profile.
  const seatsForUniformMetrics = perSeatPostEqCurves.length > 0
    ? perSeatPostEqCurves
    : [{ seatId: "rsp", isPrimary: true, responseData: finalPostEqCurve }];
  const uniformSeatMetrics = calculateAllSeatMetricsFromCorrected(
    seatsForUniformMetrics, assessmentStartHz, assessmentEndHz, candidateTargetAnchorDb, productionHouseCurveTarget
  );

  // Normalise physical bank-limit diagnostics across all EQ profiles.
  const bankValidationResult = eq.designEqFitProfile === "house_curve"
    ? eq.bankLimits
    : eq.bankDiagnostics?.selectedBankLimits;
  const aggregateBankLimits = eq.designEqFitProfile === "house_curve"
    ? {
        maxAggregateBoostDb: eq.bankLimits?.maxAggregateBoostDb ?? null,
        maxAggregateBoostHz: eq.bankLimits?.maxAggregateBoostHz ?? null,
        maxAggregateCutDb: eq.bankLimits?.maxAggregateCutDb ?? null,
        maxAggregateCutHz: eq.bankLimits?.maxAggregateCutHz ?? null,
        boostLimitOk: eq.bankLimits?.boostLimitOk ?? null,
        cutLimitOk: eq.bankLimits?.cutLimitOk ?? null,
        sourceDomainHeadroomOk: eq.bankLimits?.sourceDomainHeadroomOk ?? null,
        allOk: eq.bankLimits?.allOk ?? null,
      }
    : {
        maxAggregateBoostDb: eq.bankDiagnostics?.selectedBankLimits?.maxAggregateBoostDb ?? null,
        maxAggregateBoostHz: eq.bankDiagnostics?.selectedBankLimits?.maxAggregateBoostHz ?? null,
        maxAggregateCutDb: eq.bankDiagnostics?.selectedBankLimits?.maxAggregateCutDb ?? null,
        maxAggregateCutHz: eq.bankDiagnostics?.selectedBankLimits?.maxAggregateCutHz ?? null,
        boostLimitOk: eq.bankDiagnostics?.selectedBankLimits?.boostLimitOk ?? null,
        cutLimitOk: eq.bankDiagnostics?.selectedBankLimits?.cutLimitOk ?? null,
        sourceDomainHeadroomOk: eq.bankDiagnostics?.selectedBankLimits?.sourceDomainHeadroomOk ?? null,
        allOk: eq.bankDiagnostics?.selectedBankLimits?.allOk ?? null,
      };

  // P20 reporting compares each non-RSP seat with the authoritative RSP curve.
  // It does not use the target curve or protected-null exclusions.
  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: finalPostEqCurve,
    perSeatPostEqCurves,
    assessmentStartHz,
    assessmentEndHz,
  });
  const achievedP20Level = p20.worstSeat?.level ?? 0;
  const achievedP20VariationDb = p20.worstSeat?.variationDbRaw ?? null;
  const worstP20SeatId = p20.worstSeat?.seatId ?? null;
  const p20Available = p20.available;
  const pairedP14P18Authority = calculatePairedP14P18ProductionAuthority({
    activeSubs,
    perSourceComplexTransfers,
    combinedEqCurve,
    targetBasis: p14TargetBasis,
    requestedLevel: designTarget.requestedLevel,
    requestedTargetSplDb: designTarget.targetAnchorDb,
    selectedEqBankIdentity: buildFilterBankSignature({ generatedFilterBank: eq.filters }),
    normalizedTransferFingerprint,
    calibrationFingerprint,
    legacyScalarDiagnostic: achievedP14Db,
  });
  const pairedP14P18Summary = buildPairedP14P18CandidateSummary(pairedP14P18Authority);
  const postEqCapabilityAssessment = buildPostEqBassCapabilityOutcome({
    authority: pairedP14P18Authority, requestedLevel: designTarget.requestedLevel, targetAnchorDb, scalarP14: p14,
    achievedP18Level, achievedP18FrequencyHz, achievedP19Level, achievedP19VariationDb,
    achievedP20Level, achievedP20VariationDb, p20Available,
  });
  const meetsRequestedEnvelope = (postEqCapabilityAssessment.authorityComplete
    ? postEqCapabilityAssessment.passesRequestedLevel
    : legacyMeetsRequestedEnvelope) && achievedP18Level >= request.p18.value && achievedP19Level >= request.p19.value;
  const rejectionReason = meetsRequestedEnvelope ? "" : [
    postEqCapabilityAssessment.limitation?.reason, legacyRejectionReason,
  ].filter(Boolean).join("; ");

  return {
    requestedP14Level: request.p14.level,
    requestedP14TargetDb: request.p14.p14TargetDb,
    requestedP18Level: request.p18.level,
    requestedP19Level: request.p19.level,
    requestedTargetSpl: targetAnchorDb,
    responseTargetAnchorDb: targetAnchorDb,
    targetAnchorSource,
    designTarget,
    requestedP19ToleranceDb: request.p19.p19ToleranceDb,
    assessmentStartHz,
    assessmentEndHz,
    fitStartHz: eq.fitStartHz ?? correctionStartHz,
    fitEndHz: eq.fitEndHz ?? correctionEndHz,
    correctionStartHz,
    correctionEndHz,
    // Carry the effective profile contract from the Design EQ fit so
    // the priority selector and validation panel can distinguish Standard from
    // Accuracy candidates.
    designEqFitProfile: eq.designEqFitProfile || "standard",
    designEqFitProfileConfig: eq.designEqFitProfileConfig || null,
    achievedP14Db,
    achievedP14Level,
    achievedP14MinimumLevel,
    achievedP14RecommendedLevel,
    p14TargetBasis: p14?.targetBasis || p14TargetBasis,
    p14CapabilityDetails: p14,
    achievedP18FrequencyHz,
    achievedP18Level,
    p18AchievedAuthority: p18,
    achievedP19VariationDb,
    achievedP19Level,
    officialP19VariationDb: achievedP19VariationDb,
    officialP19WorstFrequencyHz: officialP19.worstFrequencyHz,
    officialP19Label: officialP19.label,
    correctableP19VariationDb: correctableP19?.resultDb ?? null,
    correctableP19Label: "Correctable P19 — optimiser diagnostic",
    protectedNullRegions: (protectedNullRegions || []).map((region) => ({ ...region })),
    rspObjectiveMaxDeviationDb: eq.rspObjectiveMaxDeviationDb ?? achievedP19VariationDb,
    rspRmsResidualDb: eq.rspRmsDeviationDb ?? rspRmsResidualDb,
    rspMeanSignedResidualDb: eq.rspMeanSignedResidualDb ?? rspMeanSignedResidualDb,
    rspMeanAbsoluteResidualDb,
    rspShapeRmsResidualDb: eq.rspShapeRmsDeviationDb ?? rspShapeRmsResidualDb,
    startStrategy: eq.designEqFitProfile === "house_curve" ? "multi-start" : "single",
    selectedStart: eq.selectedStart ?? null,
    generatedFilterBank: eq.filters,
    finalPostEqCurve,
    combinedEqCurve,
    productionHouseCurveTarget,
    fitterHouseCurveTarget: eq.fitterHouseCurveTarget || productionHouseCurveTarget,
    designEqIterationTrace: eq.iterationTrace,
    designEqDetectedRegions: eq.detectedRegions || [],
    designEqCandidateAcceptanceDiagnostics: eq.candidateAcceptanceDiagnostics || [],
    designEqCandidateSelectionDiagnostics: eq.candidateSelectionDiagnostics || [],
    designEqFilterDecisionDiagnostics: eq.filterDecisionDiagnostics || [],
    physicalEqAuthorityPassed: eq.physicalEqAuthorityPassed !== false,
    physicalAuthorityViolations: eq.physicalAuthorityViolations || [],
    rejectedEqCandidates: eq.rejectedEqCandidates || [],
    seatToleranceAdjustedCandidates: eq.seatToleranceAdjustedCandidates || [],
    seatRegressionToleranceDiagnostics: eq.seatRegressionToleranceDiagnostics || null,
    designEqStopReason: eq.stopReason,
    designEqSelectedCheckpoint: eq.selectedCheckpoint,
    designEqBankDiagnostics: eq.bankDiagnostics,
    designEqCheckpointSummaries: eq.checkpointSummaries,
    designEqWorstResidualDiagnostics: candidateWorstResidualDiagnostics,
    designEqSelectionReason: eq.selectionReason,
    designEqRevisionDiagnostics: eq.revisionDiagnostics,
    lfCapabilityProtection: eq.lfCapabilityProtection || null,
    houseCurveDiagnostics: eq.houseCurveDiagnostics ? {
      ...eq.houseCurveDiagnostics,
      finalParameters: {
        p14: { level: achievedP14Level, valueDb: achievedP14Db },
        p18: { level: achievedP18Level, frequencyHz: achievedP18FrequencyHz },
        p19: { level: achievedP19Level, deviationDb: achievedP19VariationDb },
        p20: { level: achievedP20Level, deviationDb: achievedP20VariationDb },
      },
      bankLimits: aggregateBankLimits,
    } : null,
    p14CheckpointDeltaDb,
    capabilityLimitedFrequencies,
    meetsRequestedEnvelope,
    allAtLeastL1: achievedP14Level >= 1 && achievedP18Level >= 1 && achievedP19Level >= 1,
    rejectionReason,
    worstRealSeatHouseCurveVariationDb,
    worstRealSeatHouseCurveLevel,
    worstRealSeatHouseCurveSeatId,
    achievedP20Level,
    achievedP20VariationDb,
    worstP20SeatId,
    p20Available,
    perSeatP20Results: p20.perSeatResults,
    p20Label: p20.label,
    perSeatPostEqCurves,
    // Uniform seat metrics — calculated identically for every profile (Standard,
    // Accuracy, house-curve) from perSeatPostEqCurves using the same 1/3-octave
    // smoothing, assessment band, and target curve as houseCurveFitterCore.js.
    // When no real seats exist, equivalent fallback values are calculated from RSP.
    worstSeatP19Level: uniformSeatMetrics?.worstSeatP19Level ?? 0,
    worstSeatMaxDeviationDb: uniformSeatMetrics?.worstSeatMaxDeviationDb ?? null,
    worstSeatId: uniformSeatMetrics?.worstSeatId ?? null,
    meanSeatMaxDeviationDb: uniformSeatMetrics?.meanSeatMaxDeviationDb ?? null,
    rmsSeatTargetErrorDb: uniformSeatMetrics?.rmsSeatTargetErrorDb ?? null,
    perSeatMetrics: uniformSeatMetrics?.seatMetrics ?? [],
    houseCurveStopReason: eq.stopReason,
    houseCurveBankLimits: eq.bankLimits,
    houseCurveLimitingReason: eq.limitingReason,
    houseCurveBaselineWorstSeatDeviation: eq.baselineWorstSeatDeviationDb,
    // Exact final result from the existing Design EQ bank validator.
    bankValidationResult,
    // Normalised aggregate bank limits — retained for diagnostics compatibility.
    aggregateBankLimits,
    // Position-aware post-EQ capability authority and report.
    pairedP14P18Authority,
    pairedP14P18Summary,
    postEqCapabilityAssessment,
  };
}

export function generateCandidatePool(options = {}) {
  return generateCanonicalCandidatePool(options);
}

export { selectCandidateFromPool };

// Backward-compatible wrapper — calls both stages.
export function optimiseBassSystem(options) {
  const pool = generateCandidatePool(options);
  return selectCandidateFromPool(pool);
}