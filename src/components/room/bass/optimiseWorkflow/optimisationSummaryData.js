// optimisationSummaryData.js
// Pure presentation-layer data extraction for the Bass Optimisation summary.
//
// Transforms the V2 engine's selection, stage verdicts, and completed bass
// authority into a designer-friendly summary that explains WHY the optimiser
// reached its conclusion.
//
// This module does NOT alter the optimiser, materiality thresholds, RP22
// grading, or published authoritative results. It only reads data the engine
// already produces and reshapes it for display.

import { buildStageResults } from "../improveBassV2/improveBassV2StageAuthority";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getBaselineP19(selection, completedBassAuthority) {
  const fromSelection = num(selection?.currentResult?.achievedP19VariationDb);
  if (fromSelection != null) return fromSelection;
  return num(
    completedBassAuthority?.contract?.selectedCandidate?.achievedP19VariationDb,
  );
}

function getGlobalLevelAlignment(completedBassAuthority) {
  return (
    completedBassAuthority?.contract?.selectedCandidate?.globalLevelAlignment ||
    completedBassAuthority?.contract?.productAnalysis?.parameters
      ?.globalLevelAlignment ||
    null
  );
}

function sumFunnelGenerated(evaluationCounts) {
  if (!evaluationCounts || typeof evaluationCounts !== "object") return 0;
  const KEYS = ["symmetric", "asymmetricPair", "individual"];
  let total = 0;
  for (const key of KEYS) {
    const f = evaluationCounts[key];
    if (!f) continue;
    total += Number(f.generated) || 0;
  }
  return total;
}

const STAGE_REASONS = {
  phase: {
    improvement: "Phase alignment reduced seat-to-seat variation.",
    no_improvement:
      "Every phase combination increased the overall response error.",
    not_tested: "No differential phase control is applicable to this configuration.",
  },
  delay: {
    improvement: "Timing alignment reduced seat-to-seat variation.",
    no_improvement:
      "Timing improvements benefited some seats but degraded others.",
    not_tested: "Delay adjustment was not applicable to this configuration.",
  },
  gain: {
    improvement: "Gain balance reduced the overall response deviation.",
    no_improvement: "No gain balance reduced the overall response deviation.",
    not_tested: "Gain adjustment was not applicable to this configuration.",
  },
  globalTrim: {
    improvement: "A better operating level was found.",
    no_improvement: "The optimum operating level was already selected.",
    not_tested: "Global trim was not evaluated.",
  },
  subPositions: {
    improvement: "A better subwoofer layout was found.",
    no_improvement: "Improvement below the materiality threshold.",
    not_tested: "Position search was not applicable.",
  },
};

function getReason(stageKey, verdict) {
  const reasons = STAGE_REASONS[stageKey] || {};
  return reasons[verdict] || reasons.no_improvement || "No improvement found.";
}

function hasSeatFails(perSeatArr) {
  if (!Array.isArray(perSeatArr)) return false;
  return perSeatArr.some((s) => {
    const lvl = s?.level;
    return lvl === null || lvl === undefined || lvl === "FAIL" || lvl === "fail";
  });
}

function buildStageEntry(key, label, combinations, baselineP19, bestP19, verdict) {
  const improvement =
    baselineP19 != null && bestP19 != null ? baselineP19 - bestP19 : null;
  return {
    key,
    label,
    combinationsTested: combinations,
    currentP19: baselineP19,
    bestP19,
    improvement,
    outcome: verdict,
    reason: getReason(key, verdict),
  };
}

/**
 * Build the complete optimisation summary data from the V2 engine output.
 *
 * @param {object} params
 * @returns {object} { outcome, stages, confidence, physicalLimitation }
 */
export function buildOptimisationSummaryData({
  selection,
  stageVerdicts,
  v2Status,
  completedBassAuthority,
  autoApplied,
  subwooferCount,
}) {
  const stageResults = buildStageResults(selection);
  const baselineP19 = getBaselineP19(selection, completedBassAuthority);
  const gla = getGlobalLevelAlignment(completedBassAuthority);
  const verdicts = stageVerdicts || {};

  // ── Overall outcome ──
  const hasCalibrationApplied = !!(
    autoApplied?.phase ||
    autoApplied?.delay ||
    autoApplied?.gain ||
    autoApplied?.globalBassTrim
  );
  const outcome = hasCalibrationApplied
    ? "improvements_applied"
    : "no_improvements";

  // ── Per-stage data ──
  const stages = [];

  // Phase
  const phaseCombinations =
    num(selection?.phaseDiagnostics?.tested) ??
    num(selection?.phaseDiagnostics?.optionCount) ??
    0;
  const phaseBestP19 =
    stageResults.phase.verdict === "improvement"
      ? num(selection?.phaseResult?.achievedP19VariationDb)
      : baselineP19;
  stages.push(
    buildStageEntry(
      "phase",
      "Phase",
      phaseCombinations,
      baselineP19,
      phaseBestP19,
      stageResults.phase.verdict,
    ),
  );

  // Delay
  const delayCombinations =
    (num(selection?.calibrationDiagnostics?.coarseCount) ?? 0) +
    (num(selection?.calibrationDiagnostics?.fineCount) ?? 0);
  const delayBestP19 =
    stageResults.delay.verdict === "improvement"
      ? num(selection?.calibrationResult?.achievedP19VariationDb)
      : baselineP19;
  stages.push(
    buildStageEntry(
      "delay",
      "Delay",
      delayCombinations,
      baselineP19,
      delayBestP19,
      stageResults.delay.verdict,
    ),
  );

  // Gain
  const gainCombinations =
    (num(selection?.gainDiagnostics?.coarseCount) ?? 0) +
    (num(selection?.gainDiagnostics?.fineCount) ?? 0);
  const gainBestP19 =
    stageResults.gain.verdict === "improvement"
      ? num(selection?.gainResult?.achievedP19VariationDb)
      : baselineP19;
  stages.push(
    buildStageEntry(
      "gain",
      "Relative Gain",
      gainCombinations,
      baselineP19,
      gainBestP19,
      stageResults.gain.verdict,
    ),
  );

  // Global Bass Trim
  const stepDb = num(gla?.stepDb) ?? 0.25;
  const trimCombinations = gla
    ? Math.round(
        ((num(gla.downwardBoundDb) ?? 0) + (num(gla.upwardBoundDb) ?? 0)) /
          stepDb,
      ) + 1
    : 0;
  const trimCurrentP19 = gla ? num(gla.originalP19Db) : baselineP19;
  const trimBestP19 = gla ? num(gla.alignedP19Db) : baselineP19;
  const trimImprovement = gla ? num(gla.improvementDb) : 0;
  const trimOutcome = gla?.aligned ? "improvement" : "no_improvement";
  stages.push({
    key: "globalTrim",
    label: "Global Bass Trim",
    combinationsTested: trimCombinations,
    currentP19: trimCurrentP19,
    bestP19: trimBestP19,
    improvement: trimImprovement,
    outcome: trimOutcome,
    reason: getReason("globalTrim", trimOutcome),
  });

  // Subwoofer Positions
  const subCombinations = sumFunnelGenerated(
    selection?.evaluationCounts || selection?.funnel,
  );
  const subBestP19 =
    stageResults.subPositions.verdict === "improvement"
      ? num(stageResults.subPositions.result?.achievedP19VariationDb)
      : baselineP19;
  stages.push(
    buildStageEntry(
      "subPositions",
      "Subwoofer Positions",
      subCombinations,
      baselineP19,
      subBestP19,
      stageResults.subPositions.verdict,
    ),
  );

  // ── Confidence ──
  const coreStageKeys = ["phase_polarity", "delays", "gain", "sub_positions"];
  const incompleteStages = coreStageKeys.filter(
    (k) => verdicts[k] === "incomplete",
  );
  const isLowConfidence =
    v2Status === "cancelled" || v2Status === "error" || v2Status === "stale";
  const isMediumConfidence = !isLowConfidence && incompleteStages.length > 0;
  const confidenceLevel = isLowConfidence
    ? "LOW"
    : isMediumConfidence
      ? "MEDIUM"
      : "HIGH";

  const confidenceStages = [
    { label: "Phase", combinationsTested: phaseCombinations },
    { label: "Delay", combinationsTested: delayCombinations },
    { label: "Relative Gain", combinationsTested: gainCombinations },
    { label: "Global Trim", combinationsTested: trimCombinations },
    { label: "Subwoofer Positions", combinationsTested: subCombinations },
  ];

  // ── Physical limitation ──
  const perSeatP19 =
    completedBassAuthority?.contract?.selectedCandidate?.perSeatP19 || [];
  const perSeatP20 =
    completedBassAuthority?.contract?.selectedCandidate?.perSeatP20 || [];
  const hasFails = hasSeatFails(perSeatP19) || hasSeatFails(perSeatP20);

  const recommendations = [];
  if (hasFails) {
    if ((subwooferCount || 0) < 4) recommendations.push("Additional subwoofers");
    recommendations.push("Alternative subwoofer locations");
    recommendations.push("Seating position changes");
    recommendations.push("Room treatment");
  }

  return {
    outcome,
    stages,
    confidence: { level: confidenceLevel, stages: confidenceStages },
    physicalLimitation: { hasFails, recommendations },
  };
}