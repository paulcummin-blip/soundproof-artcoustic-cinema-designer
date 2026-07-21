import { calculateDesignEqCurve, DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import { computeParam14LfeCapability, computeParam18BassExtension, computeP19DeviationBelowSchroeder, computeParam20SeatConsistency, artcousticHouseCurveOffsetAt } from "@/components/utils/rp22BassMetrics";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { CANONICAL_BASS_PRIORITY_MODES, normalizeBassPriorityMode, rankBassCandidates } from "@/components/utils/bassPriorityPolicies";
import { calculateHouseCurveEqCurve } from "@/components/utils/houseCurveFitter";
import { calculateAllSeatMetricsFromCorrected } from "@/components/utils/houseCurveFitterCore";
import { retargetCandidateForRequest } from "@/components/utils/bassCandidateRequestRetargeting";
import { summarizeCoreOperations } from "@/components/utils/bassOptimiserPerformance";

const isNumber = (value) => Number.isFinite(Number(value));
const levelText = (value) => value > 0 ? `L${value}` : "FAIL";

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

export function buildCandidate({ request, rawCurve, activeSubs, usableLfHz, transitionHz, definitions, eqResult, perSeatRawCurves }) {
  const assessmentStartHz = request.p18.p18LimitHz;
  const assessmentEndHz = Math.min(request.p14.p14UpperHz, transitionHz);
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
  const p14 = computeParam14LfeCapability(finalPostEqCurve, false, [assessmentStartHz, assessmentEndHz]);
  const p18 = computeParam18BassExtension(finalPostEqCurve);
  const smoothed = applyBassSmoothing(finalPostEqCurve, "third");
  const assessedCurve = smoothed.filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz);
  const p19 = computeP19DeviationBelowSchroeder({
    freqsHz: assessedCurve.map((point) => point.frequency),
    splDb: assessedCurve.map((point) => point.spl),
    targetDb: assessedCurve.map((point) => request.p14.p14TargetDb + artcousticHouseCurveOffsetAt(point.frequency)),
    schroederHz: assessmentEndHz,
  });
  const achievedP14Db = p14?.value ?? null;
  const p14CheckpointDeltaDb =
    Number.isFinite(achievedP14Db) &&
    Number.isFinite(Number(eq.selectedCheckpoint?.p14MinimumSpl))
      ? achievedP14Db - Number(eq.selectedCheckpoint.p14MinimumSpl)
      : null;
  const achievedP14Level = levelFromValue(achievedP14Db, definitions, "p14TargetDb");
  const achievedP18FrequencyHz = p18?.value ?? null;
  const achievedP18Level = Number(String(p18?.level || "").replace("L", "")) || 0;
  const achievedP19VariationDb = p19?.resultDb ?? null;
  const achievedP19Level = levelFromValue(achievedP19VariationDb, definitions, "p19ToleranceDb", true);
  const meetsRequestedEnvelope = achievedP14Level >= request.p14.value && achievedP18Level >= request.p18.value && achievedP19Level >= request.p19.value;
  const rejectionReason = [
    achievedP14Level < request.p14.value && `P14 target not maintained between ${assessmentStartHz}–${assessmentEndHz} Hz`,
    achievedP18Level < request.p18.value && `P18 extension does not reach the requested ${request.p18.p18LimitHz} Hz boundary`,
    achievedP19Level < request.p19.value && `P19 variation exceeds ±${request.p19.p19ToleranceDb} dB between ${assessmentStartHz}–${assessmentEndHz} Hz`,
  ].filter(Boolean).join("; ");

  // Seat-aware metrics: apply the candidate's exact EQ bank to each real seat's raw response.
  // The EQ bank is the RSP-calibrated combinedEqCurve; it is applied identically to every seat.
  // No per-seat EQ re-fitting is performed — Design EQ remains an RSP calibration engine.
  const targetAnchorDb = request.p14.p14TargetDb;
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
      targetDb: seatAssessed.map((p) => targetAnchorDb + artcousticHouseCurveOffsetAt(p.frequency)),
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
    seatsForUniformMetrics, assessmentStartHz, assessmentEndHz, targetAnchorDb
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

  // P20 seat consistency reuses the authoritative grader. It is N/A with
  // fewer than two real seats and has an L1 floor for every finite result.
  let achievedP20Level = 0;
  let achievedP20VariationDb = null;
  let worstP20SeatId = null;
  let p20Available = false;
  const p20 = computeParam20SeatConsistency({
    rspResponse: finalPostEqCurve,
    perSeatResponses: perSeatPostEqCurves,
    transitionHz: assessmentEndHz,
    rspSeatId: "rsp",
  });
  if (p20) {
    p20Available = true;
    achievedP20VariationDb = p20.worstSeatDeviationDb ?? null;
    worstP20SeatId = p20.worstSeatId ?? null;
    achievedP20Level = p20.worstSeatLevel ?? 0;
  }

  return {
    requestedP14Level: request.p14.level,
    requestedP18Level: request.p18.level,
    requestedP19Level: request.p19.level,
    requestedTargetSpl: request.p14.p14TargetDb,
    requestedP19ToleranceDb: request.p19.p19ToleranceDb,
    assessmentStartHz,
    assessmentEndHz,
    // Part E: Carry the effective profile contract from the Design EQ fit so
    // the priority selector and validation panel can distinguish Standard from
    // Accuracy candidates.
    designEqFitProfile: eq.designEqFitProfile || "standard",
    designEqFitProfileConfig: eq.designEqFitProfileConfig || null,
    achievedP14Db,
    achievedP14Level,
    achievedP18FrequencyHz,
    achievedP18Level,
    achievedP19VariationDb,
    achievedP19Level,
    generatedFilterBank: eq.filters,
    finalPostEqCurve,
    combinedEqCurve,
    designEqIterationTrace: eq.iterationTrace,
    designEqStopReason: eq.stopReason,
    designEqSelectedCheckpoint: eq.selectedCheckpoint,
    designEqBankDiagnostics: eq.bankDiagnostics,
    designEqCheckpointSummaries: eq.checkpointSummaries,
    designEqWorstResidualDiagnostics: candidateWorstResidualDiagnostics,
    designEqSelectionReason: eq.selectionReason,
    designEqRevisionDiagnostics: eq.revisionDiagnostics,
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
  };
}

function displayCandidates(candidates, selected) {
  const baseline = candidates[0];
  const valid = candidates.filter((candidate) => candidate.meetsRequestedEnvelope);
  const rejected = candidates.filter((candidate) => !candidate.meetsRequestedEnvelope && candidate.rejectionReason);
  return [...new Set([baseline, ...valid, ...rejected.slice(0, 3), selected].filter(Boolean))];
}

// A selectable candidate must have a finite post-EQ response, a valid filter bank,
// and finite P14/P18/P19 results. Bank limits and broad-worsening guards are
// already enforced by the Design EQ fitter.
function isPhysicallyCredible(candidate) {
  if (!candidate) return false;
  if (!Array.isArray(candidate.finalPostEqCurve) || candidate.finalPostEqCurve.length === 0) return false;
  if (!Array.isArray(candidate.generatedFilterBank)) return false;
  if (!Number.isFinite(candidate.achievedP14Db)) return false;
  if (!Number.isFinite(candidate.achievedP18FrequencyHz)) return false;
  if (!Number.isFinite(candidate.achievedP19VariationDb)) return false;
  return true;
}

// Part E: The two profile families generated for every RP22 request. Standard
// preserves P14 with −10 dB cuts; Accuracy trades P14 for closer house-curve
// alignment with −15 dB cuts. Both retain the +6 dB aggregate boost cap.
const FIT_PROFILES_TO_GENERATE = [
  DESIGN_EQ_FIT_PROFILES.standard,
  DESIGN_EQ_FIT_PROFILES.accuracy,
];

// Heavy candidate generation — does NOT depend on priorityMode.
// Generates both Standard and Accuracy candidates for every RP22 request,
// each with EQ fits, P14/P18/P19, seat-aware metrics, and P20.
export function generateCandidatePool({ rawCurve = [], activeSubs = [], usableLfHz = null, transitionHz = 120, perSeatRawCurves = [], collectDiagnostics = false, onProgress = null, reuseCandidateEvaluations = true, reuseExactHouseCurveEvaluations = true }) {
  if (!rawCurve.length || !activeSubs.length) return {
    candidates: [], selectablePool: [], definitions: null, performanceSummary: null, poolId: null,
    generatedCandidateCount: 0, physicallyCredibleCount: 0, requestedEnvelopeValidCount: 0,
    standardFitCount: 0, accuracyFitCount: 0, warningMessage: "A raw response curve and active subwoofer system are required.",
  };
  const perf = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
  const t0 = perf();
  const preparationStart = perf();
  const definitions = getRp22BassOperatingDefinitions();
  const requests = makeRequests(definitions);
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
  report("Source/seat response preparation", 0);
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
    const candidate = buildCandidate({ request, rawCurve, activeSubs, usableLfHz, transitionHz, definitions, eqResult, perSeatRawCurves: preparedSeatCurves });
    perSeatEvaluationTimeMs += perf() - seatStart;
    candidateEvaluationCount++;
    curveFilterEvaluationCount += preparedSeatCurves.reduce((count, seat) => count + seat.responseData.length, 0);
    if (reuseCandidateEvaluations) candidateEvaluationCache.set(evaluationKey, candidate);
    candidates.push(candidate);
  };
  for (const request of requests) {
    const assessmentStartHz = request.p18.p18LimitHz;
    const assessmentEndHz = Math.min(request.p14.p14UpperHz, transitionHz);
    // Standard fit — generated first so its enabled filter bank can seed the
    // Accuracy fit. The seed guarantees the Accuracy result retains or improves
    // the Standard checkpoint's maximum house-curve deviation.
    taskIndex++;
    report("Core EQ fitting", taskIndex);
    const standardCacheKey = [
      request.p14.p14TargetDb, assessmentStartHz, assessmentEndHz,
      "standard", DESIGN_EQ_FIT_PROFILES.standard.fittingToleranceDb,
      DESIGN_EQ_FIT_PROFILES.standard.maximumCutDb,
      DESIGN_EQ_FIT_PROFILES.standard.maximumAggregateBoostDb,
      DESIGN_EQ_FIT_PROFILES.standard.preserveP14, "noseed",
    ].join(":");
    let standardEq = coreFitCache.get(standardCacheKey);
    if (!standardEq) {
      const fitStart = perf();
      standardEq = calculateDesignEqCurve(rawCurve, usableLfHz, activeSubs, {
        requestedSystemOutputDb: request.p14.p14TargetDb,
        targetAnchorDb: request.p14.p14TargetDb,
        targetToleranceDb: request.p19.p19ToleranceDb,
        fitProfile: "standard", assessmentStartHz, assessmentEndHz, collectDiagnostics,
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
      request.p14.p14TargetDb, assessmentStartHz, assessmentEndHz,
      "accuracy", DESIGN_EQ_FIT_PROFILES.accuracy.fittingToleranceDb,
      DESIGN_EQ_FIT_PROFILES.accuracy.maximumCutDb,
      DESIGN_EQ_FIT_PROFILES.accuracy.maximumAggregateBoostDb,
      DESIGN_EQ_FIT_PROFILES.accuracy.preserveP14, `seed:${seedSignature}`,
    ].join(":");
    let accuracyEq = coreFitCache.get(accuracyCacheKey);
    if (!accuracyEq) {
      const fitStart = perf();
      accuracyEq = calculateDesignEqCurve(rawCurve, usableLfHz, activeSubs, {
        requestedSystemOutputDb: request.p14.p14TargetDb,
        targetAnchorDb: request.p14.p14TargetDb,
        targetToleranceDb: request.p19.p19ToleranceDb,
        fitProfile: "accuracy", assessmentStartHz, assessmentEndHz, collectDiagnostics,
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
    report("Core EQ fitting", taskIndex);
    const houseCurveCacheKey = [
      request.p14.p14TargetDb, assessmentStartHz, assessmentEndHz,
      "house_curve", `seed:${seedSignature}`,
    ].join(":");
    let houseCurveEq = coreFitCache.get(houseCurveCacheKey);
    if (!houseCurveEq) {
      const fitStart = perf();
      houseCurveEq = calculateHouseCurveEqCurve(rawCurve, preparedSeatCurves, usableLfHz, activeSubs, {
        requestedSystemOutputDb: request.p14.p14TargetDb,
        targetAnchorDb: request.p14.p14TargetDb,
        targetToleranceDb: request.p19.p19ToleranceDb,
        assessmentStartHz, assessmentEndHz, collectDiagnostics,
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
  report("Candidate-bank validation", totalTasks);
  const selectablePool = candidates.filter(isPhysicallyCredible);
  const requestedEnvelopeValidCount = candidates.filter((c) => c.meetsRequestedEnvelope).length;
  const t1 = perf();
  const poolId = `${rawCurve.length}:${activeSubs.length}:${usableLfHz}:${transitionHz}:${perSeatRawCurves.length}:${t0}`;
  return {
    candidates,
    selectablePool,
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
      candidateBankCount: candidates.length,
      candidateEvaluationCount,
      reusedCandidateEvaluationCount,
      curveFilterEvaluationCount,
      ...summarizeCoreOperations(coreFitCache.values()),
    },
    poolId,
    generatedCandidateCount: candidates.length,
    physicallyCredibleCount: selectablePool.length,
    requestedEnvelopeValidCount,
    standardFitCount,
    accuracyFitCount,
    houseCurveFitCount,
    warningMessage: null,
  };
}

// Lightweight priority selection — reuses the stored candidate pool.
// Does NOT re-run any core fit, Design EQ fitting, or bank evaluation.
export function selectCandidateFromPool(pool, priorityMode) {
  const mode = normalizeBassPriorityMode(priorityMode);
  const perf = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
  const t0 = perf();
  if (!pool || !pool.candidates || pool.candidates.length === 0) {
    const emptySelection = rankBassCandidates([], mode);
    return {
      selectedMode: mode, selectedCandidate: null, selectedFilters: [], finalPostEqCurve: [],
      selectedP14TargetDb: null, achievedP14Level: "FAIL", achievedP14Db: null,
      achievedP18Level: "FAIL", achievedP18FrequencyHz: null,
      achievedP19Level: "FAIL", achievedP19VariationDb: null,
      selectedFitProfile: null, candidates: [], displayCandidates: [], rejectedCandidates: [], selectedByMode: {},
      isBestCalibratedAttempt: true,
      warningMessage: pool?.warningMessage || "A raw response curve and active subwoofer system are required.",
      performanceSummary: {
        ...pool?.performanceSummary,
        selectedDiagnosticFitTimeMs: 0,
        diagnosticsIncludedInCoreFits: true,
        selectedRevisionCandidateCount: 0,
      },
      selectionReason: emptySelection.diagnostics.selectionReason,
      selectionDiagnostics: emptySelection.diagnostics,
      priorityRerankTimeMs: 0, heavyPoolReused: true, workerStarted: false,
      poolId: pool?.poolId || null,
      generatedCandidateCount: pool?.generatedCandidateCount || 0,
      physicallyCredibleCount: pool?.physicallyCredibleCount || 0,
      requestedEnvelopeValidCount: pool?.requestedEnvelopeValidCount || 0,
      standardFitCount: pool?.standardFitCount || 0,
      accuracyFitCount: pool?.accuracyFitCount || 0,
    };
  }
  const selectablePool = pool.selectablePool.length > 0 ? pool.selectablePool : pool.candidates;
  const selectionsByMode = Object.fromEntries(CANONICAL_BASS_PRIORITY_MODES.map((candidateMode) => (
    [candidateMode, rankBassCandidates(selectablePool, candidateMode)]
  )));
  const selectedByMode = {
    ...Object.fromEntries(CANONICAL_BASS_PRIORITY_MODES.map((candidateMode) => (
      [candidateMode, selectionsByMode[candidateMode].selected]
    ))),
    accuracy: selectionsByMode.house_curve_accuracy.selected,
    extension: selectionsByMode.depth.selected,
  };
  const activeSelection = selectionsByMode[mode];
  const selected = activeSelection.selected;
  if (!selected) {
    return {
      selectedMode: mode, selectedCandidate: null, selectedFilters: [], finalPostEqCurve: [],
      selectedP14TargetDb: null, achievedP14Level: "FAIL", achievedP14Db: null,
      achievedP18Level: "FAIL", achievedP18FrequencyHz: null,
      achievedP19Level: "FAIL", achievedP19VariationDb: null,
      selectedFitProfile: null, candidates: pool.candidates, displayCandidates: [],
      rejectedCandidates: pool.candidates, selectedByMode, isBestCalibratedAttempt: true,
      warningMessage: activeSelection.diagnostics.selectionReason,
      selectionReason: activeSelection.diagnostics.selectionReason,
      selectionDiagnostics: activeSelection.diagnostics,
      priorityRerankTimeMs: 0, heavyPoolReused: true, workerStarted: false,
      poolId: pool.poolId,
    };
  }
  const isBestCalibratedAttempt = activeSelection.diagnostics.eligibilityGroup !== "bank_valid_all_p14_p18_p19_l1";
  const modeSelectionReason = activeSelection.diagnostics.selectionReason;
  const t1 = perf();
  return {
    selectedMode: mode,
    selectedP14TargetDb: selected.requestedTargetSpl,
    selectedCandidate: selected,
    selectedFilters: selected.generatedFilterBank,
    finalPostEqCurve: selected.finalPostEqCurve,
    achievedP14Level: levelText(selected.achievedP14Level),
    achievedP14Db: selected.achievedP14Db,
    achievedP18Level: levelText(selected.achievedP18Level),
    achievedP18FrequencyHz: selected.achievedP18FrequencyHz,
    achievedP19Level: levelText(selected.achievedP19Level),
    achievedP19VariationDb: selected.achievedP19VariationDb,
    // Part F: Surface the selected candidate's fit profile for the validation panel.
    selectedFitProfile: selected.designEqFitProfile || "standard",
    selectedFitProfileConfig: selected.designEqFitProfileConfig || null,
    requestedP19ToleranceDb: selected.requestedP19ToleranceDb ?? null,
    candidates: pool.candidates,
    displayCandidates: displayCandidates(pool.candidates, selected),
    rejectedCandidates: pool.candidates.filter((c) => !c.meetsRequestedEnvelope),
    selectedByMode,
    isBestCalibratedAttempt,
    warningMessage: isBestCalibratedAttempt ? "BEST CALIBRATED ATTEMPT — LEVEL 1 NOT ACHIEVED" : null,
    performanceSummary: {
      ...pool.performanceSummary,
      contractAdaptationTimeMs: t1 - t0,
      selectedDiagnosticFitTimeMs: 0,
      diagnosticsIncludedInCoreFits: true,
      selectedRevisionCandidateCount: Array.isArray(selected?.designEqRevisionDiagnostics?.attempts)
        ? selected.designEqRevisionDiagnostics.attempts.length
        : 0,
    },
    selectionReason: modeSelectionReason,
    selectionDiagnostics: activeSelection.diagnostics,
    priorityRerankTimeMs: t1 - t0,
    heavyPoolReused: true,
    workerStarted: false,
    poolId: pool.poolId,
    generatedCandidateCount: pool.generatedCandidateCount,
    physicallyCredibleCount: pool.physicallyCredibleCount,
    requestedEnvelopeValidCount: pool.requestedEnvelopeValidCount,
    standardFitCount: pool.standardFitCount || 0,
    accuracyFitCount: pool.accuracyFitCount || 0,
    houseCurveFitCount: pool.houseCurveFitCount || 0,
  };
}

// Backward-compatible wrapper — calls both stages.
export function optimiseBassSystem(options) {
  const pool = generateCandidatePool(options);
  return selectCandidateFromPool(pool, options.priorityMode);
}