import { rankBassCandidates } from "@/components/utils/bassPriorityPolicies";
import { displayBassCandidates } from "@/components/utils/bassCandidatePoolEligibility";

// Selects one canonical, physically valid EQ result. This function never fits,
// evaluates compliance, or reads designer-selected RP22 intent.
export function selectCandidateFromPool(pool) {
  const mode = "balanced";
  const perf = (typeof performance !== "undefined" && performance.now) ? () => performance.now() : () => Date.now();
  const startedAt = perf();
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : [];
  if (!candidates.length) {
    const emptySelection = rankBassCandidates([], mode);
    return {
      selectedMode: mode,
      selectedCandidate: null,
      selectedFilters: [],
      finalPostEqCurve: [],
      candidates: [],
      displayCandidates: [],
      rejectedCandidates: [],
      selectedByMode: {},
      warningMessage: pool?.warningMessage || "A raw response curve and active subwoofer system are required.",
      selectionReason: emptySelection.diagnostics.selectionReason,
      selectionDiagnostics: emptySelection.diagnostics,
      performanceSummary: pool?.performanceSummary || null,
      poolId: pool?.poolId || null,
      generatedCandidateCount: pool?.generatedCandidateCount || 0,
      physicallyCredibleCount: pool?.physicallyCredibleCount || 0,
      canonicalVerticalOffsetDb: pool?.canonicalVerticalOffsetDb ?? null,
      canonicalHouseCurveShape: pool?.canonicalHouseCurveShape || [],
    };
  }

  const selectablePool = Array.isArray(pool.selectablePool) && pool.selectablePool.length
    ? pool.selectablePool
    : candidates;
  const activeSelection = rankBassCandidates(selectablePool, mode);
  const selected = activeSelection.selected;
  const endedAt = perf();
  if (!selected) {
    return {
      selectedMode: mode,
      selectedCandidate: null,
      selectedFilters: [],
      finalPostEqCurve: [],
      candidates,
      displayCandidates: candidates,
      rejectedCandidates: candidates,
      selectedByMode: {},
      warningMessage: activeSelection.diagnostics.selectionReason,
      selectionReason: activeSelection.diagnostics.selectionReason,
      selectionDiagnostics: activeSelection.diagnostics,
      performanceSummary: pool.performanceSummary || null,
      poolId: pool.poolId,
    };
  }

  return {
    selectedMode: mode,
    selectedCandidate: selected,
    selectedCandidateId: selected.candidateId,
    productionCandidateId: selected.candidateId,
    filterBankSignature: selected.filterBankSignature,
    postEqCurveSignature: selected.postEqCurveSignature,
    rawResponseSignature: selected.rawResponseSignature,
    selectedFilters: selected.generatedFilterBank,
    finalPostEqCurve: selected.finalPostEqCurve,
    canonicalVerticalOffsetDb: selected.canonicalVerticalOffsetDb,
    canonicalHouseCurveShape: selected.canonicalHouseCurveShape,
    positiveEqDemandCurve: selected.positiveEqDemandCurve,
    fitMetrics: selected.fitMetrics,
    protectedNullRegions: selected.protectedNullRegions,
    physicalValidation: selected.physicalValidation,
    selectedFitProfile: selected.designEqFitProfile || "standard",
    selectedFitProfileConfig: selected.designEqFitProfileConfig || null,
    candidates,
    displayCandidates: displayBassCandidates(candidates, selected),
    rejectedCandidates: candidates.filter((candidate) => candidate.physicalValidation?.passed === false),
    selectedByMode: { balanced: selected },
    primaryLimitation: null,
    isBestCalibratedAttempt: false,
    warningMessage: null,
    performanceSummary: {
      ...pool.performanceSummary,
      contractAdaptationTimeMs: endedAt - startedAt,
      selectedDiagnosticFitTimeMs: 0,
      diagnosticsIncludedInCoreFits: true,
    },
    selectionReason: activeSelection.diagnostics.selectionReason,
    selectionDiagnostics: activeSelection.diagnostics,
    priorityRerankTimeMs: endedAt - startedAt,
    heavyPoolReused: true,
    workerStarted: false,
    poolId: pool.poolId,
    generatedCandidateCount: pool.generatedCandidateCount,
    physicallyCredibleCount: pool.physicallyCredibleCount,
    standardFitCount: pool.standardFitCount || 0,
    accuracyFitCount: pool.accuracyFitCount || 0,
    houseCurveFitCount: pool.houseCurveFitCount || 0,
  };
}