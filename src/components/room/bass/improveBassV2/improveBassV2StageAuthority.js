// improveBashV2StageAuthority.js
// Transforms the V2 engine's selection object into per-stage results.
//
// The engine produces a single `selection` with a `winner`, `recommendations`,
// `calibrationResult`, and `confirmedResults`. This module maps that output
// to the 5-stage designer workflow:
//
//   1. PHASE              — NOT AVAILABLE YET (no 5-degree phase control)
//   2. DELAY              — best grouped-delay result (from calibrationResult)
//   3. GAIN               — best grouped-gain result (from gainResult)
//   4. SUBWOOFER POSITIONS — best position candidate (from confirmedResults)
//   5. SEATING POSITIONS   — best seating result (from seatingResult)
//
// Each stage has exactly ONE result (or none). Runner-up candidates are NOT
// surfaced in the normal designer UI.
//
// Safety/materiality are NOT re-evaluated here — the engine already applied
// those gates. This module only maps engine output to the 5-stage structure.

import { isMaterialImprovement } from "./materialityGate.js";
import { compareCanonicalRecommendations } from "./recommendationRanker.js";

/**
 * Build per-stage results from the engine's selection object.
 *
 * @param {object} selection - engine selection (state.winner)
 * @param {object} snapshot - design snapshot
 * @param {Array} currentInstances - current subwooferInstances
 * @returns {object} per-stage results:
 *   { phase, delay, gain, subPositions, seating }
 *   Each stage: { verdict, result, reason }
 *   verdict: 'improvement' | 'no_improvement' | 'not_available' | 'not_tested'
 */
export function buildStageResults(selection) {
  if (!selection) {
    return {
      phase: { verdict: "not_tested", result: null },
      delay: { verdict: "not_tested", result: null },
      gain: { verdict: "not_tested", result: null },
      subPositions: { verdict: "not_tested", result: null },
      seating: { verdict: "not_tested", result: null },
    };
  }

  const currentResult = selection.currentResult;

  // ── 1. PHASE — NOT AVAILABLE YET ───────────────────────────────────
  // The intended grouped phase search requires an all-pass or processor
  // phase control model with 5-degree resolution. Only binary polarity
  // (0°/180°) is currently implemented. Do NOT fake it.
  const phase = {
    verdict: "not_available",
    result: null,
    reason:
      "Grouped 5-degree phase search requires an all-pass or processor phase control model. " +
      "Only binary polarity (0°/180°) is currently implemented. " +
      "The physical phase control definition is not yet available.",
  };

  // ── 2. DELAY — best grouped-delay result ───────────────────────────
  // The engine's calibrationResult is the delay-only search winner.
  const delayResult = selection.calibrationResult || null;
  const delayMaterial = selection.calibrationMaterial?.material === true;

  // Extract group label and adjustment from the tuning + calibration diagnostics
  const delayGrouping = selection.calibrationDiagnostics?.grouping;
  const delayTuning = delayResult?.appliedTuning || delayResult?.tuning || [];
  let delayGroupLabel = null;
  let delayAdjustmentMs = 0;
  if (delayGrouping?.groups?.length && delayTuning.length) {
    const maxDelay = Math.max(...delayTuning.map((t) => Number(t.delayMs) || 0));
    const minDelay = Math.min(...delayTuning.map((t) => Number(t.delayMs) || 0));
    delayAdjustmentMs = maxDelay - minDelay;
    if (delayAdjustmentMs > 0.01) {
      const adjustedSources = delayTuning
        .filter((t) => Math.abs(Number(t.delayMs) - maxDelay) < 0.01)
        .map((t) => t.sourceId);
      const adjustedGroup = delayGrouping.groups.find(
        (g) => adjustedSources.length > 0 && adjustedSources.every((id) => g.sourceIds.includes(id)),
      );
      delayGroupLabel = adjustedGroup?.label || null;
    }
  }

  const delay = {
    verdict: delayMaterial && delayResult ? "improvement" : "no_improvement",
    result: delayMaterial ? delayResult : null,
    reason: delayMaterial ? null : "No material delay improvement found.",
    delayGroupLabel,
    delayAdjustmentMs,
  };

  // ── 3. GAIN — best grouped-gain result ────────────────────────────
  // The engine's gainResult is the gain-only search winner (new stage).
  const gainResult = selection.gainResult || null;
  const gainMaterial = selection.gainMaterial?.material === true;
  const gain = {
    verdict: gainMaterial && gainResult ? "improvement" : "no_improvement",
    result: gainMaterial ? gainResult : null,
    reason: gainMaterial ? null : "No material gain improvement found.",
  };

  // ── 4. SUBWOOFER POSITIONS — best position candidate ──────────────
  // From confirmedResults, pick the best position candidate by canonical
  // ranking. Only ONE result is surfaced.
  const positionResults = (selection.confirmedResults || []).filter(
    (r) => r && r.isPositionCandidate && r.candidateKind !== "current",
  );
  let bestPosition = null;
  if (positionResults.length > 0 && currentResult) {
    bestPosition = positionResults
      .slice()
      .sort((a, b) => compareCanonicalRecommendations(a, b))[0];
    // Verify materiality (engine already checked, but double-check)
    const mat = isMaterialImprovement(currentResult, bestPosition);
    if (!mat.material) bestPosition = null;
  }
  const subPositions = {
    verdict: bestPosition ? "improvement" : "no_improvement",
    result: bestPosition,
    reason: bestPosition ? null : "No material position improvement found.",
  };

  // ── 5. SEATING POSITIONS — best seating result ───────────────────
  // The engine's seatingResult is the seating search winner (new stage).
  const seatingResult = selection.seatingResult || null;
  const seatingMaterial = selection.seatingMaterial?.material === true;
  const seating = {
    verdict: seatingMaterial && seatingResult ? "improvement" : "no_improvement",
    result: seatingMaterial ? seatingResult : null,
    reason: seatingMaterial ? null : "No material seating improvement found.",
  };

  return { phase, delay, gain, subPositions, seating };
}

/**
 * Get the list of stage keys in display order.
 */
export const STAGE_ORDER = ["phase", "delay", "gain", "subPositions", "seating"];

/**
 * Get the display label for a stage key.
 */
export const STAGE_DISPLAY_LABELS = {
  phase: "PHASE",
  delay: "DELAY",
  gain: "GAIN",
  subPositions: "SUBWOOFER POSITIONS",
  seating: "SEATING POSITIONS",
};