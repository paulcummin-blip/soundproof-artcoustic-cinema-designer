import { CANONICAL_BASS_PRIORITY_MODES, normalizeBassPriorityMode, rankBassCandidates } from "@/components/utils/bassPriorityPolicies";
import { displayBassCandidates } from "@/components/utils/bassCandidatePoolEligibility";

const levelText = (value) => value > 0 ? `L${value}` : "FAIL";

// Lightweight priority selection — reuses the stored candidate pool and never
// runs fitting, physics, paired diagnostics, or bank evaluation.
export function selectCandidateFromPool(pool, priorityMode) {
  const mode = normalizeBassPriorityMode(priorityMode);
  const perf = (typeof performance !== "undefined" && performance.now) ? () => performance.now() : () => Date.now();
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
  const selectablePool = Array.isArray(pool.selectablePool) && pool.selectablePool.length > 0 ? pool.selectablePool : pool.candidates;
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
    selectedCandidateId: selected.candidateId,
    productionCandidateId: selected.candidateId,
    filterBankSignature: selected.filterBankSignature,
    postEqCurveSignature: selected.postEqCurveSignature,
    selectedFilters: selected.generatedFilterBank,
    finalPostEqCurve: selected.finalPostEqCurve,
    achievedP14Level: levelText(selected.achievedP14Level),
    achievedP14Db: selected.achievedP14Db,
    p14TargetBasis: selected.p14TargetBasis || pool.p14TargetBasis || "minimum",
    achievedP18Level: levelText(selected.achievedP18Level),
    achievedP18FrequencyHz: selected.achievedP18FrequencyHz,
    achievedP19Level: levelText(selected.achievedP19Level),
    achievedP19VariationDb: selected.achievedP19VariationDb,
    officialP19VariationDb: selected.officialP19VariationDb,
    correctableP19VariationDb: selected.correctableP19VariationDb,
    achievedP20Level: selected.achievedP20Level,
    achievedP20VariationDb: selected.achievedP20VariationDb,
    worstP20SeatId: selected.worstP20SeatId,
    perSeatP20Results: selected.perSeatP20Results,
    assessmentAuthority: {
      candidateId: selected.candidateId,
      graphCandidateId: selected.candidateId,
      filterBankCandidateId: selected.candidateId,
      p19CandidateId: selected.candidateId,
      p20CandidateIds: (selected.perSeatP20Results || []).map(() => selected.candidateId),
    },
    selectedFitProfile: selected.designEqFitProfile || "standard",
    selectedFitProfileConfig: selected.designEqFitProfileConfig || null,
    requestedP19ToleranceDb: selected.requestedP19ToleranceDb ?? null,
    candidates: pool.candidates,
    displayCandidates: displayBassCandidates(pool.candidates, selected),
    rejectedCandidates: pool.candidates.filter((candidate) => !candidate.meetsRequestedEnvelope),
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