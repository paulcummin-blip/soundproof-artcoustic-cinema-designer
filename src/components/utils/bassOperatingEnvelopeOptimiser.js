import { calculateDesignEqCurve } from "@/components/utils/designEqCalibration";
import { computeParam14LfeCapability, computeParam18BassExtension, computeP19DeviationBelowSchroeder, artcousticHouseCurveOffsetAt } from "@/components/utils/rp22BassMetrics";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";

const isNumber = (value) => Number.isFinite(Number(value));
const levelText = (value) => value > 0 ? `L${value}` : "FAIL";

function levelFromValue(value, definitions, key, lowerIsBetter = false) {
  if (!isNumber(value)) return 0;
  const eligible = definitions.filter((definition) => lowerIsBetter ? value <= definition[key] : value >= definition[key]);
  return eligible.length ? Math.max(...eligible.map((definition) => definition.value)) : 0;
}

function compareCandidates(a, b, mode) {
  const rank = (candidate) => {
    if (mode === "spl") return [candidate.achievedP14Level, candidate.achievedP14Db, -candidate.achievedP19VariationDb];
    if (mode === "extension") return [candidate.achievedP18Level, -candidate.achievedP18FrequencyHz, -candidate.achievedP19VariationDb];
    if (mode === "accuracy") return [candidate.achievedP19Level, -candidate.achievedP19VariationDb, candidate.achievedP14Level];

    const orderedLevels = [
      Number(candidate.achievedP14Level) || 0,
      Number(candidate.achievedP18Level) || 0,
      Number(candidate.achievedP19Level) || 0,
    ].sort((a, b) => a - b);
    const p19Variation = Number.isFinite(candidate.achievedP19VariationDb)
      ? candidate.achievedP19VariationDb
      : Infinity;
    const p14Db = Number.isFinite(candidate.achievedP14Db)
      ? candidate.achievedP14Db
      : -Infinity;
    const p18Hz = Number.isFinite(candidate.achievedP18FrequencyHz)
      ? candidate.achievedP18FrequencyHz
      : Infinity;

    return [orderedLevels[0], orderedLevels[1], orderedLevels[2], -p19Variation, p14Db, -p18Hz];
  };
  const aRank = rank(a);
  const bRank = rank(b);
  for (let index = 0; index < aRank.length; index += 1) if (aRank[index] !== bRank[index]) return bRank[index] - aRank[index];
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

function buildCandidate({ request, rawCurve, activeSubs, usableLfHz, transitionHz, definitions, eqResult }) {
  const assessmentStartHz = request.p18.p18LimitHz;
  const assessmentEndHz = Math.min(request.p14.p14UpperHz, transitionHz);
  const eq = eqResult;
  const finalPostEqCurve = eq.curve;
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
  };
}

function displayCandidates(candidates, selected) {
  const baseline = candidates[0];
  const valid = candidates.filter((candidate) => candidate.meetsRequestedEnvelope);
  const rejected = candidates.filter((candidate) => !candidate.meetsRequestedEnvelope && candidate.rejectionReason);
  return [...new Set([baseline, ...valid, ...rejected.slice(0, 3), selected].filter(Boolean))];
}

export function optimiseBassSystem({ rawCurve = [], activeSubs = [], usableLfHz = null, transitionHz = 120, priorityMode = "balanced" }) {
  const mode = ["balanced", "spl", "extension", "accuracy"].includes(priorityMode) ? priorityMode : "balanced";
  if (!rawCurve.length || !activeSubs.length) return { selectedMode: mode, selectedFilters: [], finalPostEqCurve: [], candidates: [], displayCandidates: [], warningMessage: "A raw response curve and active subwoofer system are required.", performanceSummary: null };
  const perf = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
  const t0 = perf();
  const definitions = getRp22BassOperatingDefinitions();
  const requests = makeRequests(definitions);

  // Part B: Cache heavy EQ fits by physical fitting contract within this invocation.
  // targetToleranceDb (P19) only affects worstResidualDiagnostics reporting, not
  // filter generation, bank limiting, acceptance, or checkpoint selection.
  // Cache key: (P14 target dB, assessment start Hz, assessment end Hz, fitting tolerance).
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
        collectDiagnostics: false,
      });
      coreFitTimeMs += perf() - fitStart;
      totalCompletedBankEvaluations += eq.bankDiagnostics?.completedBankEvaluationCount || 0;
      coreFitCache.set(cacheKey, eq);
    }
    return buildCandidate({ request, rawCurve, activeSubs, usableLfHz, transitionHz, definitions, eqResult: eq });
  });

  const validCandidates = candidates.filter((candidate) => candidate.meetsRequestedEnvelope);
  const selectedByMode = Object.fromEntries(["balanced", "spl", "extension", "accuracy"].map((candidateMode) => [candidateMode, [...validCandidates].sort((a, b) => compareCandidates(a, b, candidateMode))[0] || null]));
  const selected = selectedByMode[mode] || candidates[0];
  const isBestCalibratedAttempt = !selectedByMode[mode];

  // Part C: Run full diagnostics only for the selected candidate.
  // The diagnostic run uses collectDiagnostics: true and returns exactly the same
  // filter bank and scores as its lightweight equivalent.
  let selectedDiagnosticFitTimeMs = 0;
  let selectedRevisionCandidateCount = 0;
  if (selected) {
    const selectedP19Def = definitions.find((d) => d.level === selected.requestedP19Level);
    const diagStart = perf();
    const diagEq = calculateDesignEqCurve(rawCurve, usableLfHz, activeSubs, {
      requestedSystemOutputDb: selected.requestedTargetSpl,
      targetAnchorDb: selected.requestedTargetSpl,
      targetToleranceDb: selectedP19Def?.p19ToleranceDb ?? 0,
      fittingToleranceDb: 2,
      assessmentStartHz: selected.assessmentStartHz,
      assessmentEndHz: selected.assessmentEndHz,
      collectDiagnostics: true,
    });
    selectedDiagnosticFitTimeMs = perf() - diagStart;
    totalCompletedBankEvaluations += diagEq.bankDiagnostics?.completedBankEvaluationCount || 0;
    selectedRevisionCandidateCount = diagEq.revisionDiagnostics?.revisionAttemptCount ?? 0;
    selected.designEqIterationTrace = diagEq.iterationTrace;
    selected.designEqStopReason = diagEq.stopReason;
    selected.designEqSelectedCheckpoint = diagEq.selectedCheckpoint;
    selected.designEqBankDiagnostics = diagEq.bankDiagnostics;
    selected.designEqCheckpointSummaries = diagEq.checkpointSummaries;
    selected.designEqWorstResidualDiagnostics = diagEq.worstResidualDiagnostics;
    selected.designEqSelectionReason = diagEq.selectionReason;
    selected.designEqRevisionDiagnostics = diagEq.revisionDiagnostics;
  }

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
    candidates,
    displayCandidates: displayCandidates(candidates, selected),
    rejectedCandidates: candidates.filter((candidate) => !candidate.meetsRequestedEnvelope),
    selectedByMode,
    isBestCalibratedAttempt,
    warningMessage: isBestCalibratedAttempt ? "BEST CALIBRATED ATTEMPT — LEVEL 1 NOT ACHIEVED" : null,
    performanceSummary: {
      totalOptimiserTimeMs: t1 - t0,
      requestCount: requests.length,
      uniqueCoreFitCount: coreFitCache.size,
      coreFitTimeMs,
      selectedDiagnosticFitTimeMs,
      selectedRevisionCandidateCount,
      completedBankEvaluationCount: totalCompletedBankEvaluations,
    },
  };
}