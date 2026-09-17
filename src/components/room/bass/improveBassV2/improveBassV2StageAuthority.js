// improveBashV2StageAuthority.js
// Transforms the V2 engine's selection object into per-stage results.
//
// The engine produces a single `selection` with a `winner`, `recommendations`,
// `calibrationResult`, and `confirmedResults`. This module maps that output
// to the 5-stage designer workflow:
//
//   1. PHASE              — best grouped all-pass result (from phaseResult)
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
import { compareZeroFailFirst } from "./zeroFailOptimiser.js";

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

  // ── 1. PHASE — grouped physical all-pass search ────────────────────
  const phaseResult = selection.phaseResult || null;
  const phaseMaterial = selection.phaseMaterial?.material === true;
  const phaseDiagnostics = selection.phaseDiagnostics || null;
  const phaseSearchSkipped = phaseDiagnostics?.status === "skipped"
    || phaseDiagnostics?.searchStatus === "skipped";
  const groupedPhase = phaseResult?.groupedPhase || null;
  const phaseGrouping = phaseDiagnostics?.grouping || null;
  const phaseGroup = groupedPhase && phaseGrouping?.groups?.find(
    (group) => group.id === groupedPhase.direction,
  );
  const phase = {
    verdict: phaseSearchSkipped
      ? "not_tested"
      : phaseMaterial && phaseResult
        ? "improvement"
        : "no_improvement",
    result: phaseMaterial ? phaseResult : null,
    reason: phaseSearchSkipped
      ? phaseDiagnostics?.grouping?.reason || "No differential phase control is applicable."
      : phaseMaterial
        ? null
        : "No material all-pass phase improvement found.",
    phaseGroupLabel: phaseGroup?.label || null,
    phaseAtReferenceDeg: Number(groupedPhase?.phaseAtReferenceDeg) || 0,
    phaseReferenceHz: Number(groupedPhase?.phaseReferenceHz)
      || Number(phaseDiagnostics?.phaseReferenceHz)
      || 80,
    phaseModel: groupedPhase?.phaseModel || phaseDiagnostics?.phaseModel || "first-order-all-pass",
  };

  // ── 2. DELAY — best grouped-delay result ───────────────────────────
  // The engine's calibrationResult is the delay-only search winner.
  const delayResult = selection.calibrationResult || null;
  const delayMaterial = selection.calibrationMaterial?.material === true;

  // Extract the ACTUAL adjustment from the grouped delay candidate.
  // The candidate's adjustmentMs is the real delta being applied to the
  // adjusted group. Do NOT compute maxDelay - minDelay from the tuning —
  // that gives the intergroup difference, which can differ from the actual
  // adjustment when the baseline already has non-zero delays.
  const delayGrouping = selection.calibrationDiagnostics?.grouping;
  const groupedDelay = delayResult?.groupedDelay;
  let delayGroupLabel = null;
  let delayAdjustmentMs = 0;
  if (groupedDelay && delayGrouping?.groups?.length) {
    delayAdjustmentMs = Number(groupedDelay.adjustmentMs) || 0;
    if (delayAdjustmentMs > 0.01) {
      const adjustedGroup = delayGrouping.groups.find(
        (g) => g.id === groupedDelay.direction,
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
  const gainGrouping = selection.gainDiagnostics?.grouping || null;
  const gain = {
    verdict: gainMaterial && gainResult ? "improvement" : "no_improvement",
    result: gainMaterial ? gainResult : null,
    reason: gainMaterial ? null : "No material gain improvement found.",
    grouping: gainGrouping,
  };

  // ── 4. SUBWOOFER POSITIONS — best position candidate ──────────────
  // From confirmedResults, pick the best position candidate by canonical
  // ranking. Only ONE result is surfaced.
  // Exclude combined candidates from the subPositions stage — they have
  // isPositionCandidate=true but belong in the dedicated combined stage.
  const positionResults = (selection.confirmedResults || []).filter(
    (r) => r && r.isPositionCandidate && r.candidateKind !== "current"
      && r.candidateOrigin !== "combined"
      && r.candidateOrigin !== "combined-calibration-seating",
  );
  let bestPosition = null;
  if (positionResults.length > 0 && currentResult) {
    bestPosition = positionResults
      .slice()
      .sort((a, b) => compareZeroFailFirst(a, b))[0];
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

  // ── 6. BEST OVERALL IMPROVEMENT — single best across ALL interventions ──
  // The overall winner is selection.winner — the best confirmed result across
  // Current, phase, delay, gain, position, seating, and combined candidates,
  // selected by the existing zero-fail-first comparator (fewest failing seats
  // first, then primary-seat floor, then raw margins, then simpler-intervention
  // tie-break). The winner may legitimately be a simple delay-only change,
  // a phase+delay combination, a seating+calibration combination, a position+
  // calibration combination, or a full combined solution.
  const bestOverallResult = selection.winner || null;
  const combined = {
    verdict: bestOverallResult ? "improvement" : "no_improvement",
    result: bestOverallResult,
    reason: bestOverallResult ? null : "No material improvement found across any intervention.",
  };

  return { phase, delay, gain, subPositions, seating, combined };
}

/**
 * Get the list of stage keys in display order.
 */
export const STAGE_ORDER = ["phase", "delay", "gain", "subPositions", "seating", "combined"];

/**
 * Get the display label for a stage key.
 */
export const STAGE_DISPLAY_LABELS = {
  phase: "PHASE",
  delay: "DELAY",
  gain: "GAIN",
  subPositions: "SUBWOOFER POSITIONS",
  seating: "SEATING POSITIONS",
  combined: "BEST OVERALL IMPROVEMENT",
};