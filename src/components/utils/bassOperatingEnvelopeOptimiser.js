import { calculateDesignEqCurve } from "@/components/utils/designEqCalibration";
import { computeParam14LfeCapability, computeParam18BassExtension, computeP19DeviationBelowSchroeder, computeParam20SeatConsistency, artcousticHouseCurveOffsetAt } from "@/components/utils/rp22BassMetrics";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { selectBestCandidate } from "@/components/utils/optimiserRanking";

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

function buildCandidate({ request, rawCurve, activeSubs, usableLfHz, transitionHz, definitions, eqResult, perSeatRawCurves }) {
  const assessmentStartHz = request.p18.p18LimitHz;
  const assessmentEndHz = Math.min(request.p14.p14UpperHz, transitionHz);
  const eq = eqResult;
  const finalPostEqCurve = eq.curve;
  const combinedEqCurve = eq.combinedEqCurve || [];
  const capabilityLimitedFrequencies = eq.filters.filter((filter) => filter.enabled && filter.gainDb > 0 && filter.gainDb < 6).map((filter) => filter.frequencyHz);
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

  // P20 seat consistency (reuse existing helper — do not implement a second version).
  // P20 is N/A when fewer than 2 real seats; FAIL/0 when 2+ seats but outside all tolerances.
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
    achievedP20Level = p20.worstSeatLevel ?? 0; // null → 0 (FAIL), never N/A→0
  }

  return {
    requestedP14Level: request.p14.level,
    requestedP18Level: request.p18.level,
    requestedP19Level: request.p19.level,
    requestedTargetSpl: request.p14.p14TargetDb,
    assessmentStartHz,
    assessmentEndHz,
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
    designEqWorstResidualDiagnostics: eq.worstResidualDiagnostics,
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

// Heavy candidate generation — does NOT depend on priorityMode.
// Generates all candidates with EQ fits, P14/P18/P19, seat-aware metrics, and P20.
export function generateCandidatePool({ rawCurve = [], activeSubs = [], usableLfHz = null, transitionHz = 120, perSeatRawCurves = [] }) {
  if (!rawCurve.length || !activeSubs.length) return {
    candidates: [], selectablePool: [], definitions: null, performanceSummary: null, poolId: null,
    generatedCandidateCount: 0, physicallyCredibleCount: 0, requestedEnvelopeValidCount: 0,
    warningMessage: "A raw response curve and active subwoofer system are required.",
  };
  const perf = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
  const t0 = perf();
  const definitions = getRp22BassOperatingDefinitions();
  const requests = makeRequests(definitions);
  const coreFitCache = new Map();
  let coreFitTimeMs = 0;
  let totalCompletedBankEvaluations = 0;
  const candidates = requests.map((request) => {
    const assessmentStartHz = request.p18.p18LimitHz;
    const assessmentEndHz = Math.min(request.p14.p14UpperHz, transitionHz);
    const cacheKey = `${request.p14.p14TargetDb}:${assessmentStartHz}:${assessmentEndHz}:2`;
    let eq = coreFitCache.get(cacheKey);
    if (!eq) {
      const fitStart = perf();
      eq = calculateDesignEqCurve(rawCurve, usableLfHz, activeSubs, {
        requestedSystemOutputDb: request.p14.p14TargetDb,
        targetAnchorDb: request.p14.p14TargetDb,
        targetToleranceDb: request.p19.p19ToleranceDb,
        fittingToleranceDb: 2,
        assessmentStartHz,
        assessmentEndHz,
        collectDiagnostics: true,
      });
      coreFitTimeMs += perf() - fitStart;
      totalCompletedBankEvaluations += eq.bankDiagnostics?.completedBankEvaluationCount || 0;
      coreFitCache.set(cacheKey, eq);
    }
    return buildCandidate({ request, rawCurve, activeSubs, usableLfHz, transitionHz, definitions, eqResult: eq, perSeatRawCurves });
  });
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
      uniqueCoreFitCount: coreFitCache.size,
      coreFitTimeMs,
      completedBankEvaluationCount: totalCompletedBankEvaluations,
    },
    poolId,
    generatedCandidateCount: candidates.length,
    physicallyCredibleCount: selectablePool.length,
    requestedEnvelopeValidCount,
    warningMessage: null,
  };
}

// Lightweight priority selection — reuses the stored candidate pool.
// Does NOT re-run any core fit, Design EQ fitting, or bank evaluation.
export function selectCandidateFromPool(pool, priorityMode) {
  const mode = ["balanced", "spl", "extension", "accuracy"].includes(priorityMode) ? priorityMode : "balanced";
  const perf = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
  const t0 = perf();
  if (!pool || !pool.candidates || pool.candidates.length === 0) {
    return {
      selectedMode: mode, selectedCandidate: null, selectedFilters: [], finalPostEqCurve: [],
      selectedP14TargetDb: null, achievedP14Level: "FAIL", achievedP14Db: null,
      achievedP18Level: "FAIL", achievedP18FrequencyHz: null,
      achievedP19Level: "FAIL", achievedP19VariationDb: null,
      candidates: [], displayCandidates: [], rejectedCandidates: [], selectedByMode: {},
      isBestCalibratedAttempt: true,
      warningMessage: pool?.warningMessage || "A raw response curve and active subwoofer system are required.",
      performanceSummary: pool?.performanceSummary || null,
      selectionReason: "No selectable candidates", priorityRerankTimeMs: 0, heavyPoolReused: true,
      poolId: pool?.poolId || null,
      generatedCandidateCount: pool?.generatedCandidateCount || 0,
      physicallyCredibleCount: pool?.physicallyCredibleCount || 0,
      requestedEnvelopeValidCount: pool?.requestedEnvelopeValidCount || 0,
    };
  }
  const selectablePool = pool.selectablePool.length > 0 ? pool.selectablePool : pool.candidates;
  const selectedByMode = Object.fromEntries(["balanced", "spl", "extension", "accuracy"].map((candidateMode) => {
    const { selected } = selectBestCandidate(selectablePool, candidateMode);
    return [candidateMode, selected];
  }));
  const selected = selectedByMode[mode] || selectablePool[0] || pool.candidates[0];
  const isBestCalibratedAttempt = !selected?.meetsRequestedEnvelope;
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
    candidates: pool.candidates,
    displayCandidates: displayCandidates(pool.candidates, selected),
    rejectedCandidates: pool.candidates.filter((c) => !c.meetsRequestedEnvelope),
    selectedByMode,
    isBestCalibratedAttempt,
    warningMessage: isBestCalibratedAttempt ? "BEST CALIBRATED ATTEMPT — LEVEL 1 NOT ACHIEVED" : null,
    performanceSummary: pool.performanceSummary,
    selectionReason: `Selected by ${mode} comparator from ${selectablePool.length} physically credible candidates`,
    priorityRerankTimeMs: t1 - t0,
    heavyPoolReused: true,
    poolId: pool.poolId,
    generatedCandidateCount: pool.generatedCandidateCount,
    physicallyCredibleCount: pool.physicallyCredibleCount,
    requestedEnvelopeValidCount: pool.requestedEnvelopeValidCount,
  };
}

// Backward-compatible wrapper — calls both stages.
export function optimiseBassSystem(options) {
  const pool = generateCandidatePool(options);
  return selectCandidateFromPool(pool, options.priorityMode);
}