// combinedOptimisationSearch.js
// Combined optimisation phase for Improve Bass Response V2.
//
// PRINCIPLE: Reuse existing work. Do NOT rerun Stage 1 or modal simulation.
// Uses saved rawTransfers from Current, best seating, and best position to
// retune FULL calibration (phase → delay → gain chained) and canonically
// confirm combined candidates.
//
// CANDIDATE BUDGET (max 3 canonical confirmations):
//   1. Calibration-only combined (phase + delay + gain retuned together on Current)
//      — ALWAYS attempted when Current's rawTransfer exists. Does NOT require
//        a useful position candidate.
//   2. Calibration + seating (retuned on seating geometry)
//      — Only if seating is material.
//   3. Position + retuned calibration (retuned on position geometry, including phase)
//      — Only if position is useful.
//
// NO ACOUSTIC MATH CHANGED: Uses existing grouped-phase, grouped-delay,
// grouped-gain, and confirmation worker calls. No new equations or scaling.

import { runInWorker } from "./improveBassV2WorkerLifecycle.js";
import { effectiveConfigurationKey, validateConfirmedCandidate } from "./confirmedCandidateValidity.js";
import { compareZeroFailFirst } from "./zeroFailOptimiser.js";
import { isMaterialImprovement } from "./materialityGate.js";

const COMBINED_BUDGET_MS = 15000;
const MAX_COMBINED_CONFIRMATIONS = 3;

/**
 * Identify the best position candidate from confirmed results.
 * Uses zero-fail-first ordering (fewer failing seats first, then grade).
 */
export function identifyBestPositionCandidate(confirmedResults, existingAuthority) {
  if (!confirmedResults?.length || !existingAuthority) return null;
  const positionResults = confirmedResults.filter(
    (r) => r?.isPositionCandidate && r.candidateKind !== "current",
  );
  if (!positionResults.length) return null;
  return positionResults.slice().sort((a, b) => compareZeroFailFirst(a, b))[0];
}

/**
 * Identify the best calibration candidate (delay/phase/gain) from confirmed results.
 */
export function identifyBestCalibrationCandidate(confirmedResults, existingAuthority) {
  if (!confirmedResults?.length || !existingAuthority) return null;
  const calResults = confirmedResults.filter(
    (r) => r?.candidateKind === "calibration" || r?.candidateKind === "phase" || r?.candidateKind === "gain",
  );
  if (!calResults.length) return null;
  return calResults.slice().sort((a, b) => compareZeroFailFirst(a, b))[0];
}

/**
 * Retune full calibration (phase → delay → gain) on a rawTransfer.
 * Chains the searches so each builds on the previous result — individually
 * optimal values are NOT assumed to remain optimal when combined.
 *
 * Returns the final combined tuning (or the baseline if no improvement found).
 */
async function retuneFullCalibration(ctx, rawTransfer, baseline) {
  const { worker, controller, isStale, metrics, subwooferInstances, roomDims } = ctx;
  if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length || !baseline?.length) return null;

  let tuning = baseline;

  // 1. Phase search (grouped all-pass at 80 Hz)
  try {
    const t0 = performance.now();
    const phaseSearch = await runInWorker(worker, "grouped-phase", {
      rawTransfer, instances: subwooferInstances, roomDims, effectiveBaseline: tuning,
    }, controller.signal);
    metrics.recordWorkerCall("grouped-phase", "combined-retune-phase", performance.now() - t0, false);
    if (isStale()) return null;
    const phaseTuning = phaseSearch?.candidates?.[0]?.tuning;
    if (phaseTuning) tuning = phaseTuning;
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    // Phase search may be skipped (no differential phase applicable) — continue
  }

  // 2. Delay search (with phase tuning as baseline)
  try {
    const t0 = performance.now();
    const delaySearch = await runInWorker(worker, "grouped-delay", {
      rawTransfer, instances: subwooferInstances, roomDims, effectiveBaseline: tuning,
    }, controller.signal);
    metrics.recordWorkerCall("grouped-delay", "combined-retune-delay", performance.now() - t0, false);
    if (isStale()) return null;
    const delayTuning = delaySearch?.candidates?.[0]?.tuning;
    if (delayTuning) tuning = delayTuning;
  } catch (err) {
    if (err?.name === "AbortError") throw err;
  }

  // 3. Gain search (with delay tuning as baseline)
  try {
    const t0 = performance.now();
    const gainSearch = await runInWorker(worker, "grouped-gain", {
      rawTransfer, instances: subwooferInstances, roomDims, effectiveBaseline: tuning,
    }, controller.signal);
    metrics.recordWorkerCall("grouped-gain", "combined-retune-gain", performance.now() - t0, false);
    if (isStale()) return null;
    const gainTuning = gainSearch?.candidates?.[0]?.tuning;
    if (gainTuning) tuning = gainTuning;
  } catch (err) {
    if (err?.name === "AbortError") throw err;
  }

  return tuning;
}

/**
 * Canonically confirm a combined candidate. Returns the validation check.
 */
async function confirmCombinedCandidate(ctx, rawTransfer, tuning, candidateInfo, kind) {
  const { worker, controller, isStale, bindConfirmation, validationContext,
    p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis } = ctx;

  const response = await runInWorker(worker, "confirmation", {
    rawTransfer, tuning, tuningVariant: "delay-polarity-trim",
    p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
  }, controller.signal);
  if (isStale()) return null;
  if (!response) return null;

  const bound = bindConfirmation(response, tuning, candidateInfo, kind);
  return validateConfirmedCandidate(bound, validationContext);
}

/**
 * Run the combined optimisation phase.
 *
 * @param {object} ctx - engine context
 * @returns {object} { combinedCandidates, combinedDiagnostics }
 */
export async function runCombinedOptimisation(ctx) {
  const {
    confirmedResults,
    existingAuthority,
    snapshot,
    worker,
    controller,
    isCancelled,
    isStale,
    onProgress,
    onBestSoFar,
    metrics,
    bindConfirmation,
    validationContext,
    p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
    roomDims, subwooferInstances, rspPosition,
    seatingResult, seatingMaterial,
    seatingRawTransfer,
    currentRawTransfer,
    effectiveBaseline,
    positionRawTransfer,
    combinedStartTime,
  } = ctx;

  const diagnostics = {
    status: "incomplete",
    tested: 0,
    confirmed: 0,
    valid: 0,
    invalid: 0,
    budgetExceeded: false,
    options: [],
    candidatesBuilt: [],
  };
  const combinedCandidates = [];
  const elapsed = () => Date.now() - combinedStartTime;

  const retuneCtx = { worker, controller, isStale, metrics, subwooferInstances, roomDims };
  const confirmCtx = { worker, controller, isStale, bindConfirmation, validationContext,
    p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis };

  // ═══════════════════════════════════════════════════════════════════════
  // 1. CALIBRATION-ONLY COMBINED (always, if Current's rawTransfer exists)
  //    Retunes phase + delay + gain TOGETHER on Current's saved rawTransfer.
  //    Does NOT require a useful position candidate.
  // ═══════════════════════════════════════════════════════════════════════
  if (
    currentRawTransfer?.perSourcePerSeatComplexTransfers?.length &&
    effectiveBaseline?.length &&
    existingAuthority
  ) {
    onProgress("combining", "Retuning full calibration on current positions", 0, 3);
    if (isCancelled()) return { combinedCandidates: [], diagnostics: { ...diagnostics, status: "cancelled" } };
    if (isStale()) return { combinedCandidates: [], diagnostics: { ...diagnostics, status: "stale" } };

    try {
      const combinedTuning = await retuneFullCalibration(retuneCtx, currentRawTransfer, effectiveBaseline);
      if (isStale()) return { combinedCandidates: [], diagnostics: { ...diagnostics, status: "stale" } };
      diagnostics.tested++;

      if (combinedTuning && !isCancelled() && !isStale() && elapsed() < COMBINED_BUDGET_MS) {
        const check = await confirmCombinedCandidate(confirmCtx, currentRawTransfer, combinedTuning,
          { candidateOrigin: "combined-calibration" }, "calibration");
        diagnostics.confirmed++;
        if (check?.valid) {
          const result = check.result;
          result.candidateKind = "calibration";
          result.candidateId = "combined-calibration";
          result.candidateOrigin = "combined";
          result.combinedFrom = { calibrationOnly: true, phaseRetuned: true, delayRetuned: true, gainRetuned: true };
          combinedCandidates.push(result);
          diagnostics.valid++;
          diagnostics.candidatesBuilt.push("calibration-only");
          onBestSoFar({ result, candidate: { candidateOrigin: "combined" } });
        } else if (check) {
          diagnostics.invalid++;
          diagnostics.options.push({ stage: "confirm-cal-only", issues: check.issues });
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      diagnostics.options.push({ stage: "calibration-only", error: err.message });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. CALIBRATION + SEATING (if seating is material)
  //    Retunes full calibration on the SEATING rawTransfer (not Current's).
  //    Does NOT require a useful position candidate.
  // ═══════════════════════════════════════════════════════════════════════
  if (
    seatingMaterial?.material &&
    seatingResult &&
    seatingRawTransfer?.perSourcePerSeatComplexTransfers?.length &&
    elapsed() < COMBINED_BUDGET_MS - 5000 &&
    combinedCandidates.length < MAX_COMBINED_CONFIRMATIONS &&
    existingAuthority
  ) {
    onProgress("combining", "Retuning calibration on seating geometry", 1, 3);
    if (isCancelled()) return { combinedCandidates, diagnostics: { ...diagnostics, status: "cancelled" } };
    if (isStale()) return { combinedCandidates, diagnostics: { ...diagnostics, status: "stale" } };

    try {
      // Retune on the SEATING rawTransfer — do NOT reuse Current's calibration blindly
      const combinedTuning = await retuneFullCalibration(retuneCtx, seatingRawTransfer, effectiveBaseline);
      if (isStale()) return { combinedCandidates, diagnostics: { ...diagnostics, status: "stale" } };
      diagnostics.tested++;

      if (combinedTuning && !isCancelled() && !isStale() && elapsed() < COMBINED_BUDGET_MS) {
        const check = await confirmCombinedCandidate(confirmCtx, seatingRawTransfer, combinedTuning,
          { candidateOrigin: "combined-calibration-seating" }, "calibration");
        diagnostics.confirmed++;
        if (check?.valid) {
          const result = check.result;
          result.candidateKind = "calibration";
          result.candidateId = "combined-cal-seating";
          result.candidateOrigin = "combined-calibration-seating";
          result.seatingOffsetMm = seatingResult.seatingOffsetMm;
          result.seatingPositions = seatingResult.seatingPositions;
          result.combinedFrom = {
            calibrationRetuned: true,
            phaseRetuned: true,
            seatingOffsetMm: seatingResult.seatingOffsetMm,
          };
          combinedCandidates.push(result);
          diagnostics.valid++;
          diagnostics.candidatesBuilt.push("calibration-seating");
          onBestSoFar({ result, candidate: { candidateOrigin: "combined" } });
        } else if (check) {
          diagnostics.invalid++;
          diagnostics.options.push({ stage: "confirm-cal-seating", issues: check.issues });
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      diagnostics.options.push({ stage: "cal-seating", error: err.message });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. POSITION + RETUNED CALIBRATION (if position is useful)
  //    Retunes FULL calibration (including phase) on the position rawTransfer.
  // ═══════════════════════════════════════════════════════════════════════
  const bestPosition = identifyBestPositionCandidate(confirmedResults, existingAuthority);
  const positionIsUseful = bestPosition
    ? isMaterialImprovement(existingAuthority, bestPosition).material
    : false;
  const posRawTransfer = bestPosition?.rawTransfer || positionRawTransfer;

  if (
    positionIsUseful &&
    posRawTransfer?.perSourcePerSeatComplexTransfers?.length &&
    elapsed() < COMBINED_BUDGET_MS - 5000 &&
    combinedCandidates.length < MAX_COMBINED_CONFIRMATIONS &&
    existingAuthority
  ) {
    onProgress("combining", "Retuning full calibration on best position", 2, 3);
    if (isCancelled()) return { combinedCandidates, diagnostics: { ...diagnostics, status: "cancelled" } };
    if (isStale()) return { combinedCandidates, diagnostics: { ...diagnostics, status: "stale" } };

    try {
      const positionBaseline = bestPosition.appliedTuning || effectiveBaseline;
      // Retune FULL calibration (phase + delay + gain) on the position geometry
      const combinedTuning = await retuneFullCalibration(retuneCtx, posRawTransfer, positionBaseline);
      if (isStale()) return { combinedCandidates, diagnostics: { ...diagnostics, status: "stale" } };
      diagnostics.tested++;

      if (combinedTuning && !isCancelled() && !isStale() && elapsed() < COMBINED_BUDGET_MS) {
        const check = await confirmCombinedCandidate(confirmCtx, posRawTransfer, combinedTuning,
          { ...bestPosition, candidateOrigin: "combined" }, "position");
        diagnostics.confirmed++;
        if (check?.valid) {
          const result = check.result;
          result.isPositionCandidate = true;
          result.candidateOrigin = "combined";
          result.candidateId = "combined:" + (bestPosition.candidateId || "position");
          result.combinedFrom = {
            positionCandidateId: bestPosition.candidateId,
            calibrationRetuned: true,
            phaseRetuned: true,
            delayRetuned: true,
            gainRetuned: true,
          };
          combinedCandidates.push(result);
          diagnostics.valid++;
          diagnostics.candidatesBuilt.push("position-calibration");
          onBestSoFar({ result, candidate: { ...bestPosition, candidateOrigin: "combined" } });
        } else if (check) {
          diagnostics.invalid++;
          diagnostics.options.push({ stage: "confirm-pos-cal", issues: check.issues });
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      diagnostics.options.push({ stage: "position-calibration", error: err.message });
    }
  }

  diagnostics.status = combinedCandidates.length > 0 ? "completed" : "no_improvement";
  return { combinedCandidates, diagnostics };
}