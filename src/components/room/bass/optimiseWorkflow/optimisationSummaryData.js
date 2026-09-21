// optimisationSummaryData.js
// Pure presentation-layer data extraction for the Bass Optimisation summary.
//
// Transforms the V2 engine's selection, stage verdicts, and completed bass
// authority into a designer-friendly summary showing canonical P19/P20
// before→after, failing-seat count, primary floor, and 6-way classification.
//
// This module does NOT alter the optimiser, materiality thresholds, RP22
// grading, or published authoritative results. It only reads data the engine
// already produces and reshapes it for display.

import { buildStageResults } from "../improveBassV2/improveBassV2StageAuthority";
import { countFailingSeats } from "../improveBassV2/zeroFailOptimiser";
import { classifyOptimisationStage } from "./optimisationStageClassifier";
import { lowestPrimaryP19P20Level, bassRankFromLevel } from "@/components/utils/rp22/bassGradingAuthority";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

// ── Worst primary seat for P19 (lowest level, then highest raw) ──
function worstPrimarySeat(perSeatArray) {
  if (!Array.isArray(perSeatArray) || !perSeatArray.length) return null;
  const primary = perSeatArray.filter((s) => s.isPrimary);
  const candidates = primary.length ? primary : perSeatArray;
  return candidates.reduce((worst, seat) => {
    const seatLevel = numericLevel(seat.level);
    const worstLevel = numericLevel(worst.level);
    if (seatLevel < worstLevel) return seat;
    if (seatLevel === worstLevel) {
      const seatRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const worstRaw = Math.abs(Number(worst.variationDbRaw) || 0);
      if (seatRaw > worstRaw) return seat;
    }
    return worst;
  }, candidates[0]);
}

// ── Worst seat for P20 (lowest level, then highest raw) ──
function worstSeat(perSeatArray) {
  if (!Array.isArray(perSeatArray) || !perSeatArray.length) return null;
  return perSeatArray.reduce((worst, seat) => {
    const seatLevel = numericLevel(seat.level);
    const worstLevel = numericLevel(worst.level);
    if (seatLevel < worstLevel) return seat;
    if (seatLevel === worstLevel) {
      const seatRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const worstRaw = Math.abs(Number(worst.variationDbRaw) || 0);
      if (seatRaw > worstRaw) return seat;
    }
    return worst;
  }, perSeatArray[0]);
}

// ── Primary floor: canonical minimum across primary P19 + P20 ──
function primaryFloor(result) {
  return bassRankFromLevel(lowestPrimaryP19P20Level(result)) ?? 0;
}

function getGlobalLevelAlignment(completedBassAuthority) {
  return (
    completedBassAuthority?.contract?.selectedCandidate?.globalLevelAlignment ||
    completedBassAuthority?.contract?.productAnalysis?.parameters?.globalLevelAlignment ||
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

// ── Build a stage entry from canonical before/after results ──
function buildCanonicalStageEntry({
  key,
  label,
  combinations,
  currentResult,
  candidateResult,
  verdict,
  internalProxy,
}) {
  const hasCandidate = !!candidateResult;
  const classification = hasCandidate
    ? classifyOptimisationStage(currentResult, candidateResult)
    : "NO_MATERIAL_IMPROVEMENT";

  const p19Before = worstPrimarySeat(currentResult?.perSeatP19);
  const p19After = hasCandidate ? worstPrimarySeat(candidateResult?.perSeatP19) : p19Before;
  const p20Before = worstSeat(currentResult?.perSeatP20);
  const p20After = hasCandidate ? worstSeat(candidateResult?.perSeatP20) : p20Before;

  const failsBefore = countFailingSeats(currentResult);
  const failsAfter = hasCandidate ? countFailingSeats(candidateResult) : failsBefore;

  const floorBefore = primaryFloor(currentResult);
  const floorAfter = hasCandidate ? primaryFloor(candidateResult) : floorBefore;

  return {
    key,
    label,
    combinationsTested: combinations,
    verdict,
    classification,
    isAdvisory: key === "subPositions" || key === "seating",
    p19: {
      beforeLevel: p19Before?.level ?? null,
      beforeRaw: p19Before?.variationDbRaw ?? null,
      afterLevel: p19After?.level ?? null,
      afterRaw: p19After?.variationDbRaw ?? null,
    },
    p20: {
      beforeLevel: p20Before?.level ?? null,
      beforeRaw: p20Before?.variationDbRaw ?? null,
      afterLevel: p20After?.level ?? null,
      afterRaw: p20After?.variationDbRaw ?? null,
    },
    failingSeats: { before: failsBefore, after: failsAfter },
    primaryFloor: { before: floorBefore, after: floorAfter },
    internal: internalProxy,
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
  const currentResult = selection?.currentResult;
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

  // Proxy metric (internal search metric — behind debug disclosure)
  const baselineP19 = num(currentResult?.achievedP19VariationDb);

  const stages = [];

  // Phase
  const phaseCombinations =
    num(selection?.phaseDiagnostics?.tested) ??
    num(selection?.phaseDiagnostics?.optionCount) ??
    0;
  const phaseCandidate = stageResults.phase.verdict === "improvement" ? stageResults.phase.result : null;
  stages.push(
    buildCanonicalStageEntry({
      key: "phase",
      label: "Phase",
      combinations: phaseCombinations,
      currentResult,
      candidateResult: phaseCandidate,
      verdict: stageResults.phase.verdict,
      internalProxy: {
        currentP19: baselineP19,
        bestP19: phaseCandidate ? num(phaseCandidate.achievedP19VariationDb) : baselineP19,
      },
    }),
  );

  // Delay
  const delayCombinations =
    (num(selection?.calibrationDiagnostics?.coarseCount) ?? 0) +
    (num(selection?.calibrationDiagnostics?.fineCount) ?? 0);
  const delayCandidate = stageResults.delay.verdict === "improvement" ? stageResults.delay.result : null;
  stages.push(
    buildCanonicalStageEntry({
      key: "delay",
      label: "Delay",
      combinations: delayCombinations,
      currentResult,
      candidateResult: delayCandidate,
      verdict: stageResults.delay.verdict,
      internalProxy: {
        currentP19: baselineP19,
        bestP19: delayCandidate ? num(delayCandidate.achievedP19VariationDb) : baselineP19,
      },
    }),
  );

  // Gain
  const gainCombinations =
    (num(selection?.gainDiagnostics?.coarseCount) ?? 0) +
    (num(selection?.gainDiagnostics?.fineCount) ?? 0);
  const gainCandidate = stageResults.gain.verdict === "improvement" ? stageResults.gain.result : null;
  stages.push(
    buildCanonicalStageEntry({
      key: "gain",
      label: "Relative Gain",
      combinations: gainCombinations,
      currentResult,
      candidateResult: gainCandidate,
      verdict: stageResults.gain.verdict,
      internalProxy: {
        currentP19: baselineP19,
        bestP19: gainCandidate ? num(gainCandidate.achievedP19VariationDb) : baselineP19,
      },
    }),
  );

  // Global Bass Trim (special: no separate per-seat results — only RSP P19)
  const stepDb = num(gla?.stepDb) ?? 0.25;
  const trimCombinations = gla
    ? Math.round(((num(gla.downwardBoundDb) ?? 0) + (num(gla.upwardBoundDb) ?? 0)) / stepDb) + 1
    : 0;
  const trimAligned = gla?.aligned ?? false;
  stages.push({
    key: "globalTrim",
    label: "Global Bass Trim",
    combinationsTested: trimCombinations,
    verdict: trimAligned ? "improvement" : "no_improvement",
    classification: trimAligned ? "IMPROVES_P19" : "NO_MATERIAL_IMPROVEMENT",
    p19: {
      beforeLevel: null,
      beforeRaw: gla ? num(gla.originalP19VariationDb) : null,
      afterLevel: null,
      afterRaw: gla ? num(gla.alignedP19VariationDb) : null,
      isRspOnly: true,
    },
    p20: {
      beforeLevel: null,
      beforeRaw: null,
      afterLevel: null,
      afterRaw: null,
      isNoChange: true,
    },
    failingSeats: { before: null, after: null, isNoChange: true },
    primaryFloor: { before: null, after: null, isNoChange: true },
    internal: {
      currentP19: gla ? num(gla.originalP19VariationDb) : baselineP19,
      bestP19: gla ? num(gla.alignedP19VariationDb) : baselineP19,
    },
  });

  // Subwoofer Positions
  const subCombinations = sumFunnelGenerated(
    selection?.evaluationCounts || selection?.funnel,
  );
  const subCandidate = stageResults.subPositions.verdict === "improvement" ? stageResults.subPositions.result : null;
  stages.push(
    buildCanonicalStageEntry({
      key: "subPositions",
      label: "Subwoofer Positions",
      combinations: subCombinations,
      currentResult,
      candidateResult: subCandidate,
      verdict: stageResults.subPositions.verdict,
      internalProxy: {
        currentP19: baselineP19,
        bestP19: subCandidate ? num(subCandidate.achievedP19VariationDb) : baselineP19,
      },
    }),
  );

  // Seating (where applicable)
  const seatingCandidate = stageResults.seating.verdict === "improvement" ? stageResults.seating.result : null;
  if (stageResults.seating.verdict !== "not_tested") {
    stages.push(
      buildCanonicalStageEntry({
        key: "seating",
        label: "Seating Positions",
        combinations: 0,
        currentResult,
        candidateResult: seatingCandidate,
        verdict: stageResults.seating.verdict,
        internalProxy: {
          currentP19: baselineP19,
          bestP19: seatingCandidate ? num(seatingCandidate.achievedP19VariationDb) : baselineP19,
        },
      }),
    );
  }

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
  const hasFails = currentResult ? countFailingSeats(currentResult) > 0 : false;

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