// optimisationStageClassifier.js
// ---------------------------------------------------------------------------
// Presentation-layer 6-way classification for Bass Optimisation summary stages.
//
// Classifies each canonically confirmed stage result as:
//   IMPROVES_BOTH           — P19 and P20 both materially improve
//   IMPROVES_P19            — only P19 materially improves
//   IMPROVES_P20            — only P20 materially improves
//   TRADE_OFF               — one improves, the other worsens
//   NO_MATERIAL_IMPROVEMENT — nothing material changed
//   UNSAFE                  — hard safety regression (P14/P18 or primary seat)
//
// Uses ONLY existing canonical detectors:
//   - tradeOffClassifier.js  (improvement / worsening / trade-off detection)
//   - zeroFailOptimiser.js   (failing-seat count, hard safety regression)
//
// No new acoustic maths. No new thresholds. No changes to optimisation logic.
// ---------------------------------------------------------------------------

import {
  classifyVerifiedTradeOff,
  hasPrimarySeatLevelRegression,
  findBestP19Improvement,
  findBestP20Improvement,
} from "../improveBassV2/tradeOffClassifier";
import {
  countFailingSeats,
  hasHardSafetyRegression,
} from "../improveBassV2/zeroFailOptimiser";

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

/**
 * Classify a stage's canonical result against the current baseline.
 *
 * @param {object} currentResult  - baseline canonical result (selection.currentResult)
 * @param {object} candidateResult - stage's canonically confirmed result
 * @returns {string} one of:
 *   IMPROVES_BOTH | IMPROVES_P19 | IMPROVES_P20 | TRADE_OFF |
 *   NO_MATERIAL_IMPROVEMENT | UNSAFE
 */
export function classifyOptimisationStage(currentResult, candidateResult) {
  if (!currentResult || !candidateResult) return "NO_MATERIAL_IMPROVEMENT";

  // ── 1. Hard safety: P14/P18 level regression ──
  const hardSafety = hasHardSafetyRegression(
    {
      p14Level: numericLevel(candidateResult.achievedP14Level ?? candidateResult.p14AchievedLevel),
      p18Level: numericLevel(candidateResult.achievedP18Level ?? candidateResult.p18AchievedLevel),
    },
    {
      p14Level: numericLevel(currentResult.achievedP14Level ?? currentResult.p14AchievedLevel),
      p18Level: numericLevel(currentResult.achievedP18Level ?? currentResult.p18AchievedLevel),
    },
  );
  if (hardSafety.regressed) return "UNSAFE";

  // ── 2. Primary seat level regression (unsafe unless fails decreased) ──
  const primaryRegression = hasPrimarySeatLevelRegression(candidateResult, currentResult);
  const currentFails = countFailingSeats(currentResult);
  const candidateFails = countFailingSeats(candidateResult);
  const failsDecreased = candidateFails < currentFails;
  if (primaryRegression.regressed && !failsDecreased) return "UNSAFE";

  // ── 3. Trade-off: material improvement in one, worsening in the other ──
  const tradeOff = classifyVerifiedTradeOff(currentResult, candidateResult);
  if (tradeOff.isTradeOff) return "TRADE_OFF";

  // ── 4. Pure improvements (no material worsening in either parameter) ──
  const p19Improved = findBestP19Improvement(candidateResult, currentResult).improved;
  const p20Improved = findBestP20Improvement(candidateResult, currentResult).improved;

  if (p19Improved && p20Improved) return "IMPROVES_BOTH";
  if (p19Improved) return "IMPROVES_P19";
  if (p20Improved) return "IMPROVES_P20";

  // Failing-seat reduction without detected per-seat level improvement
  // (e.g. secondary seat FAIL → L1 not caught by primary-only P19 check)
  if (failsDecreased) return "IMPROVES_BOTH";

  return "NO_MATERIAL_IMPROVEMENT";
}