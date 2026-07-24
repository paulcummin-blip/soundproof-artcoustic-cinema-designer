import { calculateDesignEqCurve, DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import { computeParam18ProductExtension, computeP19DeviationBelowSchroeder, artcousticHouseCurveOffsetAt } from "@/components/utils/rp22BassMetrics";
import { computeOfficialP19Assessment, computeOfficialP20Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { selectCandidateFromPool } from "@/components/utils/bassCandidatePoolSelection";
import { calculateHouseCurveEqCurve } from "@/components/utils/houseCurveFitter";
import { calculateAllSeatMetricsFromCorrected } from "@/components/utils/houseCurveFitterCore";
import { retargetCandidateForRequest } from "@/components/utils/bassCandidateRequestRetargeting";
import { summarizeCoreOperations } from "@/components/utils/bassOptimiserPerformance";
import { annotateCandidatePoolForHouseCurveRanking } from "@/components/utils/houseCurveCandidateRankingMetrics";
import { stampPoolAuthority } from "@/components/room/bass/bassResultAuthority";
import { BASS_OPTIMISER_POOL_VERSION } from "@/components/room/bass/bassOptimiserWorkerProtocol";
import { isPhysicallyCredibleBassCandidate } from "@/components/utils/bassCandidatePoolEligibility";
import { buildCanonicalAbsoluteHouseCurveTarget, deriveResponseAnchoredTarget, interpolateCanonicalTarget, resolveHouseCurveDomains } from "@/components/utils/houseCurveTargetAuthority";
import { identifyProtectedNullRegions, isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import { assessP14Capability } from "@/components/utils/p14CapabilityAuthority";
import { calculatePairedP14P18ProductionAuthority } from "@/components/utils/pairedP14P18ProductionAuthority";
import { buildPairedP14P18CandidateSummary } from "@/components/utils/pairedP14P18CandidateSummary";
import { buildFilterBankSignature } from "@/components/room/bass/bassResultAuthority";
import { buildBassCapabilityReceiptDiagnostics } from "@/components/room/bass/bassCapabilityDiagnostics";

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

function makeRequests(definitions) {
  const base = definitions.find((definition) => definition.value === 1);
  const requests = [{ p14: base, p18: base, p19: base }];
  definitions.forEach((p14) => definitions.forEach((p18) => definitions.forEach((p19) => {
    if (p14.value !== 1 || p18.value !== 1 || p19.value !== 1) requests.push({ p14, p18, p19 });
  })));
  return requests;
}

export function buildCandidate({ request, rawCurve, activeSubs, usableLfHz, definitions, eqResult, perSeatRawCurves, targetAnchorDb, targetAnchorSource, p14TargetBasis, domains, canonicalTargetCurve, protectedNullRegions, perSourceComplexTransfers, normalizedTransferFingerprint, calibrationFingerprint }) {
  const assessmentStartHz = domains.p19StartHz;
  const assessmentEndHz = domains.p19EndHz;
  const correctionStartHz = domains.correctionStartHz;
  const correctionEndHz = domains.correctionEndHz;
  const eq = eqResult;
  const finalPostEqCurve = eq.curve;
  const combinedEqCurve = eq.combinedEqCurve || [];
  const capabilityLimitedFrequencies = eq.filters.filter((filter) => filter.enabled && filter.gainDb > 0 && filter.gainDb < 6).map((filter) => filter.frequencyHz);

  // Candidate-specific P19 residual diagnostics — derived from the cached EQ
  // result without re-running the fitter. The cached worstResidualDiagnostics
  // were computed with whatever P19 tolerance the first request for this cache
  // entry happened to carry. Each candidate recomputes requiredBoostToP19ToleranceDb
  // and p19ToleranceCapabilityLimited from its own request.p19.p19ToleranceDb
  // using the signedResidualDb and remainingPointBoostDb already stored in
  // each diagnostic. The cached EQ result is never mutated.
  const candidateRequestedP19ToleranceDb = request.p19.p19ToleranceDb;
  const candidateWorstResidualDiagnostics = Array.isArray(eq.worstResidualDiagnostics)
    ? eq.worstResidualDiagnostics.map((diag) => {
        const signedResidualDb = diag.signedResidualDb;
        const remainingPointBoostDb = diag.remainingPointBoostDb;
        const requiredBoostToP19ToleranceDb = signedResidualDb < 0
          ? Math.max(0, Math.abs(signedResidualDb) - candidateRequestedP19ToleranceDb)
          : 0;
        const p19ToleranceCapabilityLimited = signedResidualDb < 0
          && requiredBoostToP19ToleranceDb > remainingPointBoostDb;
        return { ...diag, requiredBoostToP19ToleranceDb, p19ToleranceCapabilityLimited };
      })
    : eq.worstResidualDiagnostics;
  const preEqP14 = assessP14Capability({ activeSubs, targetBasis: p14TargetBasis });
  const p14 = assessP14Capability({ activeSubs, combinedEqCurve, targetBasis: p14TargetBasis });
  const p18 = computeParam18ProductExtension(activeSubs, usableLfHz, p14TargetBasis);
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
  const achievedP18FrequencyHz = p18?.value ?? null;
  const achievedP18Level = Number(String(p18?.level || "").replace("L", "")) || 0;
  const achievedP19VariationDb = officialP19.variationDbRaw;
  const achievedP19Level = levelFromValue(achievedP19VariationDb, definitions, "p19ToleranceDb", true);
  const meetsRequestedEnvelope = achievedP14Level >= request.p14.value && achievedP18Level >= request.p18.value && achievedP19Level >= request.p19.value;
  const rejectionReason = [
    achievedP14Level < request.p14.value && `P14 ${p14?.targetBasisLabel || "Minimum"} design target not achieved after EQ headroom`, 
    achievedP18Level < request.p18.value && `P18 extension does not reach the requested ${request.p18.p18LimitHz} Hz boundary`,
    achievedP19Level < request.p19.value && `P19 variation exceeds ±${request.p19.p19ToleranceDb} dB between ${assessmentStartHz}–${assessmentEndHz} Hz`,
  ].filter(Boolean).join("; ");

  // Seat-aware metrics: apply the candidate's exact EQ bank to each real seat's raw response.
  // The EQ bank is the RSP-calibrated combinedEqCurve; it is applied identically to every seat.
  // No per-seat EQ re-fitting is performed — Design EQ remains an RSP calibration engine.
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
  worstRealSeatHouseCurveLevel = levelFromValue(worstRealSeatHouseCurveVariationDb, definitions, "p19ToleranceDb", true);

  // Uniform seat metrics: calculate the same worst/mean/RMS metrics for every
  // candidate profile using the identical 1/3-octave smoothing, assessment band,
  // and target curve used by houseCurveFitterCore.js. When no real seats exist,
  // calculate equivalent fallback values from the RSP.
  const seatsForUniformMetrics = perSeatPostEqCurves.length > 0
    ? perSeatPostEqCurves
    : [{ seatId: "rsp", isPrimary: true, responseData: finalPostEqCurve }];
  const uniformSeatMetrics = calculateAllSeatMetricsFromCorrected(
    seatsForUniformMetrics, assessmentStartHz, assessmentEndHz, candidateTargetAnchorDb, productionHouseCurveTarget
  );

  // Normalised aggregate bank limits — comparable across all profiles.
  // For house-curve, use eq.bankLimits. For Standard/Accuracy, derive from
  // eq.bankDiagnostics.selectedBankLimits — including the real validation
  // fields (boostLimitOk, cutLimitOk, sourceDomainHeadroomOk, allOk) from
  // finalBankLimits. Never hardcode validation success.
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
    selectedEqBankIdentity: buildFilterBankSignature({ generatedFilterBank: eq.filters }),
    normalizedTransferFingerprint,
    calibrationFingerprint,
    legacyScalarDiagnostic: achievedP14Db,
  });
  const pairedP14P18Summary = buildPairedP14P18CandidateSummary(pairedP14P18Authority);

  return {
    requestedP14Level: request.p14.level,
    requestedP14TargetDb: request.p14.p14TargetDb,
    requestedP18Level: request.p18.level,
    requestedP19Level: request.p19.level,
    requestedTargetSpl: targetAnchorDb,
    responseTargetAnchorDb: targetAnchorDb,
    targetAnchorSource,
    requestedP19ToleranceDb: request.p19.p19ToleranceDb,
    assessmentStartHz,
    assessmentEndHz,
    fitStartHz: eq.fitStartHz ?? correctionStartHz,
    fitEndHz: eq.fitEndHz ?? correctionEndHz,
    correctionStartHz,
    correctionEndHz,
    preEqP14Db: preEqP14?.value ?? null,
    preEqP14Level: preEqP14?.level ?? 0,
    // Part E: Carry the effective profile contract from the Design EQ fit so
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
    // Stage 3A2 diagnostics only. Existing scalar authority and selection remain unchanged.
    pairedP14P18Authority,
    pairedP14P18Summary,
  };
}

// Part E: The two profile families generated for every RP22 request. Standard
// preserves P14 with −10 dB cuts; Accuracy trades P14 for closer house-curve
// alignment with −15 dB cuts. Both retain the +6 dB aggregate boost cap.
const FIT_PROFILES_TO_GENERATE = [
  DESIGN_EQ_FIT_PROFILES.standard,
  DESIGN_EQ_FIT_PROFILES.accuracy,
];

export function generateCandidatePool({ rawCurve = [], activeSubs = [], usableLfHz = null, transitionHz = 120, correctionEndHz = 200, targetAnchorDb = null, p14TargetBasis = "recommended", perSeatRawCurves = [], perSourceComplexTransfers = [], normalizedTransferFingerprint = null, calibrationFingerprint = null, collectDiagnostics = false, onProgress = null, reuseCandidateEvaluations = true, reuseExactHouseCurveEvaluations = true }) {
  const missingInputs = [
    !rawCurve.length && "rawCurve",
    !activeSubs.length && "activeSubs",
  ].filter(Boolean);
  if (missingInputs.length) return stampPoolAuthority({
    poolVersion: BASS_OPTIMISER_POOL_VERSION,
    candidates: [], selectablePool: [], definitions: null, performanceSummary: null, poolId: null,
    generatedCandidateCount: 0, physicallyCredibleCount: 0, requestedEnvelopeValidCount: 0,
    standardFitCount: 0, accuracyFitCount: 0, houseCurveFitCount: 0,
    generationStatus: "invalid-inputs", missingInputs,
    warningMessage: `Missing mandatory optimiser input${missingInputs.length > 1 ? "s" : ""}: ${missingInputs.join(", ")}`,
  });
  const perf = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
  const t0 = perf();
  const preparationStart = perf();
  const definitions = getRp22BassOperatingDefinitions(p14TargetBasis);
  const requests = makeRequests(definitions);
  const domains = resolveHouseCurveDomains(rawCurve.map((point) => point.frequency), correctionEndHz);
  const responseTargetAnchorDb = deriveResponseAnchoredTarget({ rawCurve, usableLfHz, startHz: domains.correctionStartHz, endHz: domains.correctionEndHz });
  const targetAnchorSource = "product-aware-rsp-robust-average";
  const canonicalTargetCurve = buildCanonicalAbsoluteHouseCurveTarget({
    frequencyGrid: rawCurve.map((point) => point.frequency),
    targetAnchorDb: responseTargetAnchorDb,
    correctionStartHz: domains.correctionStartHz,
    correctionEndHz: domains.correctionEndHz,
  });
  const protectedNullRegions = identifyProtectedNullRegions(
    rawCurve, domains.correctionStartHz, domains.correctionEndHz, responseTargetAnchorDb,
    activeSubs, usableLfHz, null, canonicalTargetCurve,
  );
  const preparedSeatCurves = (Array.isArray(perSeatRawCurves) ? perSeatRawCurves : []).filter((seat) => Array.isArray(seat?.responseData) && seat.responseData.length > 0);
  const responsePreparationTimeMs = perf() - preparationStart;
  const coreFitCache = new Map();
  const candidateEvaluationCache = new Map();
  let coreFitTimeMs = 0;
  let perSeatEvaluationTimeMs = 0;
  let totalCompletedBankEvaluations = 0;
  let candidateEvaluationCount = 0;
  let reusedCandidateEvaluationCount = 0;
  let curveFilterEvaluationCount = 0;
  let standardFitCount = 0;
  let accuracyFitCount = 0;
  let houseCurveFitCount = 0;
  const totalTasks = requests.length * (FIT_PROFILES_TO_GENERATE.length + 1);
  const report = (phase, completedTasks) => {
    if (onProgress) onProgress({
      phase, completedTasks, totalTasks,
      completedRequests: completedTasks, totalRequests: totalTasks, // backward compat for BassCalculationStatus
      uniqueCoreFits: coreFitCache.size, bankEvaluations: totalCompletedBankEvaluations,
      standardFitCount, accuracyFitCount, houseCurveFitCount,
    });
  };
  report("Normalised curves prepared", 0);
  report("Candidate definitions generated", 0);
  let taskIndex = 0;
  const candidates = [];
  const appendCandidate = (evaluationKey, request, eqResult) => {
    const cached = reuseCandidateEvaluations ? candidateEvaluationCache.get(evaluationKey) : null;
    if (cached) {
      reusedCandidateEvaluationCount++;
      candidates.push(retargetCandidateForRequest(cached, request));
      return;
    }
    const seatStart = perf();
    const candidate = buildCandidate({ request, rawCurve, activeSubs, usableLfHz, definitions, eqResult, perSeatRawCurves: preparedSeatCurves, targetAnchorDb: responseTargetAnchorDb, targetAnchorSource, p14TargetBasis, domains, canonicalTargetCurve, protectedNullRegions, perSourceComplexTransfers, normalizedTransferFingerprint, calibrationFingerprint });
    perSeatEvaluationTimeMs += perf() - seatStart;
    candidateEvaluationCount++;
    curveFilterEvaluationCount += preparedSeatCurves.reduce((count, seat) => count + seat.responseData.length, 0);
    if (reuseCandidateEvaluations) candidateEvaluationCache.set(evaluationKey, candidate);
    candidates.push(candidate);
  };
  for (const request of requests) {
    const assessmentStartHz = domains.p19StartHz;
    const assessmentEndHz = domains.p19EndHz;
    const correctionStartHz = domains.correctionStartHz;
    const correctionEndHz = domains.correctionEndHz;
    const requestCapabilityTargetDb = request.p14.p14TargetDb;
    // Standard fit — generated first so its enabled filter bank can seed the
    // Accuracy fit. The seed guarantees the Accuracy result retains or improves
    // the Standard checkpoint's maximum house-curve deviation.
    taskIndex++;
    report("Core EQ fitting", taskIndex);
    const standardCacheKey = [
      responseTargetAnchorDb, requestCapabilityTargetDb, correctionStartHz, correctionEndHz,
      "standard", DESIGN_EQ_FIT_PROFILES.standard.fittingToleranceDb,
      DESIGN_EQ_FIT_PROFILES.standard.maximumCutDb,
      DESIGN_EQ_FIT_PROFILES.standard.maximumAggregateBoostDb,
      DESIGN_EQ_FIT_PROFILES.standard.preserveP14, "noseed",
    ].join(":");
    let standardEq = coreFitCache.get(standardCacheKey);
    if (!standardEq) {
      const fitStart = perf();
      standardEq = calculateDesignEqCurve(rawCurve, usableLfHz, activeSubs, {
        requestedSystemOutputDb: requestCapabilityTargetDb,
        targetAnchorDb: responseTargetAnchorDb,
        canonicalTargetCurve,
        protectedNullRegions,
        targetToleranceDb: request.p19.p19ToleranceDb,
        fitProfile: "standard", assessmentStartHz: correctionStartHz, assessmentEndHz: correctionEndHz, collectDiagnostics,
      });
      coreFitTimeMs += perf() - fitStart;
      totalCompletedBankEvaluations += standardEq.bankDiagnostics?.completedBankEvaluationCount || 0;
      coreFitCache.set(standardCacheKey, standardEq);
      standardFitCount++;
    }
    report("Per-seat evaluation", taskIndex);
    appendCandidate(standardCacheKey, request, standardEq);

    // Accuracy fit — seeded with the Standard fit's enabled filter bank.
    // The seed signature is included in the cache key so a seeded Accuracy fit
    // cannot reuse an unrelated cached result.
    taskIndex++;
    report("Core EQ fitting", taskIndex);
    const standardSeedFilters = (standardEq.filters || []).filter((f) => f && f.enabled);
    const seedSignature = standardSeedFilters.map((f) => `${f.frequencyHz}:${f.gainDb}:${f.Q}`).join(",");
    const accuracyCacheKey = [
      responseTargetAnchorDb, requestCapabilityTargetDb, correctionStartHz, correctionEndHz,
      "accuracy", DESIGN_EQ_FIT_PROFILES.accuracy.fittingToleranceDb,
      DESIGN_EQ_FIT_PROFILES.accuracy.maximumCutDb,
      DESIGN_EQ_FIT_PROFILES.accuracy.maximumAggregateBoostDb,
      DESIGN_EQ_FIT_PROFILES.accuracy.preserveP14, `seed:${seedSignature}`,
    ].join(":");
    let accuracyEq = coreFitCache.get(accuracyCacheKey);
    if (!accuracyEq) {
      const fitStart = perf();
      accuracyEq = calculateDesignEqCurve(rawCurve, usableLfHz, activeSubs, {
        requestedSystemOutputDb: requestCapabilityTargetDb,
        targetAnchorDb: responseTargetAnchorDb,
        canonicalTargetCurve,
        protectedNullRegions,
        targetToleranceDb: request.p19.p19ToleranceDb,
        fitProfile: "accuracy", assessmentStartHz: correctionStartHz, assessmentEndHz: correctionEndHz, collectDiagnostics,
        initialFilters: standardSeedFilters,
      });
      coreFitTimeMs += perf() - fitStart;
      totalCompletedBankEvaluations += accuracyEq.bankDiagnostics?.completedBankEvaluationCount || 0;
      coreFitCache.set(accuracyCacheKey, accuracyEq);
      accuracyFitCount++;
    }
    report("Per-seat evaluation", taskIndex);
    appendCandidate(accuracyCacheKey, request, accuracyEq);

    // House-curve fit — seat-aware, optimised for worst-seat P19 deviation.
    // Uses the same shared bank for RSP and every real seat. Seeded from the
    // Standard filter bank but optimises for the worst seat, not the RSP.
    taskIndex++;
    report("House-curve multi-start fits", taskIndex);
    const houseCurveCacheKey = [
      responseTargetAnchorDb, requestCapabilityTargetDb, assessmentStartHz, assessmentEndHz, correctionStartHz, correctionEndHz,
      "house_curve", `seed:${seedSignature}`,
    ].join(":");
    let houseCurveEq = coreFitCache.get(houseCurveCacheKey);
    if (!houseCurveEq) {
      const fitStart = perf();
      houseCurveEq = calculateHouseCurveEqCurve(rawCurve, preparedSeatCurves, usableLfHz, activeSubs, {
        requestedSystemOutputDb: requestCapabilityTargetDb,
        targetAnchorDb: responseTargetAnchorDb,
        canonicalTargetCurve,
        protectedNullRegions,
        targetToleranceDb: request.p19.p19ToleranceDb,
        assessmentStartHz, assessmentEndHz,
        fitStartHz: correctionStartHz, fitEndHz: correctionEndHz,
        correctionStartHz, correctionEndHz, collectDiagnostics,
        initialFilters: standardSeedFilters,
        reuseExactEvaluations: reuseExactHouseCurveEvaluations,
      });
      coreFitTimeMs += perf() - fitStart;
      perSeatEvaluationTimeMs += houseCurveEq.operationCounts?.perSeatEvaluationTimeMs || 0;
      totalCompletedBankEvaluations += houseCurveEq.bankDiagnostics?.completedBankEvaluationCount || 0;
      coreFitCache.set(houseCurveCacheKey, houseCurveEq);
      houseCurveFitCount++;
    }
    report("Per-seat evaluation", taskIndex);
    appendCandidate(houseCurveCacheKey, request, houseCurveEq);
  }
  report("Candidate bank built", totalTasks);
  const rankedCandidates = annotateCandidatePoolForHouseCurveRanking(candidates);
  report("rankedCandidates created", totalTasks);
  const rankedSelectablePool = rankedCandidates.filter(isPhysicallyCredibleBassCandidate);
  report("rankedSelectablePool created", totalTasks);
  const requestedEnvelopeValidCount = rankedCandidates.filter((c) => c.meetsRequestedEnvelope).length;
  const t1 = perf();
  const poolId = `${rawCurve.length}:${activeSubs.length}:${usableLfHz}:${transitionHz}:${correctionEndHz}:${responseTargetAnchorDb}:${perSeatRawCurves.length}:${t0}`;
  return stampPoolAuthority({
    poolVersion: BASS_OPTIMISER_POOL_VERSION,
    candidates: rankedCandidates,
    selectablePool: rankedSelectablePool,
    definitions,
    performanceSummary: {
      totalOptimiserTimeMs: t1 - t0,
      requestCount: requests.length,
      profileCount: FIT_PROFILES_TO_GENERATE.length + 1, // Standard + Accuracy + house-curve
      uniqueCoreFitCount: coreFitCache.size,
      standardFitCount,
      accuracyFitCount,
      houseCurveFitCount,
      sourceSeatResponsePreparationTimeMs: responsePreparationTimeMs,
      coreFitTimeMs,
      perSeatEvaluationTimeMs,
      candidateBankValidationTimeMs: Array.from(coreFitCache.values()).reduce((sum, eq) => sum + (eq.operationCounts?.candidateBankValidationTimeMs || 0), 0),
      contractAdaptationTimeMs: 0,
      completedBankEvaluationCount: totalCompletedBankEvaluations,
      seatCount: preparedSeatCurves.length,
      candidateBankCount: rankedCandidates.length,
      candidateEvaluationCount,
      reusedCandidateEvaluationCount,
      curveFilterEvaluationCount,
      ...summarizeCoreOperations(coreFitCache.values()),
    },
    poolId,
    generatedCandidateCount: rankedCandidates.length,
    physicallyCredibleCount: rankedSelectablePool.length,
    requestedEnvelopeValidCount,
    standardFitCount,
    accuracyFitCount,
    houseCurveFitCount,
    generationStatus: "complete",
    missingInputs: [],
    warningMessage: null,
    responseTargetAnchorDb,
    targetAnchorSource,
    p14TargetBasis,
    canonicalTargetCurve,
    protectedNullRegions,
    capabilityEnvelopeDiagnostics: buildBassCapabilityReceiptDiagnostics(activeSubs),
  });
}

export { selectCandidateFromPool };

// Backward-compatible wrapper — calls both stages.
export function optimiseBassSystem(options) {
  const pool = generateCandidatePool(options);
  return selectCandidateFromPool(pool);
}