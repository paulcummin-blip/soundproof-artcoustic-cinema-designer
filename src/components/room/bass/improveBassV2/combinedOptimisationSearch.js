// combinedOptimisationSearch.js
// Combined optimisation phase for Improve Bass Response V2.
//
// PRINCIPLE: Reuse existing work. Do NOT rerun Stage 1 or modal simulation.
// The best position candidate's rawTransfer is already computed — retuning
// runs grouped-delay/phase/gain worker calls on that EXISTING rawTransfer.
//
// WORKFLOW:
//   1. Identify best position candidate from confirmedResults
//   2. Retune delay + gain on that position's rawTransfer (worker calls)
//   3. Merge retuned calibration with the position
//   4. Canonically confirm the combined candidate (1 confirmation)
//   5. Optionally: combine best calibration + best seating (1 more confirmation)
//
// BUDGET: Max 3 canonical confirmations. Target +5-15 seconds using cached
// transfers. If budget is exceeded, stop promoting more candidates.
//
// NO ACOUSTIC MATH CHANGED: Uses existing grouped-delay, grouped-gain, and
// confirmation worker calls. No new equations or scaling.

import { runInWorker } from "./improveBassV2WorkerLifecycle.js";
import { bindTuningToSourceIds } from "./improveBassV2ApplyCalibration.js";
import { effectiveConfigurationKey, validateConfirmedCandidate } from "./confirmedCandidateValidity.js";
import { selectConfirmedRecommendations } from "./confirmedRecommendationSelection.js";
import { compareZeroFailFirst } from "./zeroFailOptimiser.js";

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
 * Merge per-source tunings: take delay from delayTuning, gain from gainTuning,
 * phase from phaseTuning, keeping baseline for anything not overridden.
 */
function mergeTunings(baselineTuning, delayTuning, gainTuning) {
  if (!baselineTuning?.length) return baselineTuning || [];
  const merged = baselineTuning.map((t, i) => ({
    sourceId: t.sourceId,
    delayMs: delayTuning?.[i]?.delayMs ?? t.delayMs,
    gainDb: gainTuning?.[i]?.gainDb ?? t.gainDb,
    polarity: delayTuning?.[i]?.polarity ?? t.polarity,
    phaseControlDeg: delayTuning?.[i]?.phaseControlDeg ?? t.phaseControlDeg,
  }));
  return merged;
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
  };

  const combinedCandidates = [];
  const elapsed = () => Date.now() - combinedStartTime;

  // ── 1. Identify best position candidate ──────────────────────────
  const bestPosition = identifyBestPositionCandidate(confirmedResults, existingAuthority);

  if (!bestPosition) {
    diagnostics.status = "skipped";
    diagnostics.reason = "No position candidate to combine";
    return { combinedCandidates, diagnostics };
  }

  // Get the rawTransfer for the best position
  const positionRawTransfer = bestPosition.rawTransfer || ctx.positionRawTransfer;
  if (!positionRawTransfer?.perSourcePerSeatComplexTransfers?.length) {
    diagnostics.status = "skipped";
    diagnostics.reason = "No raw transfer available for best position";
    return { combinedCandidates, diagnostics };
  }

  // ── 2. Retune delay on the best position's rawTransfer ────────────
  onProgress("combining", "Retuning delay on best placement", 0, 2);
  if (isCancelled()) return { combinedCandidates: [], diagnostics: { ...diagnostics, status: "cancelled" } };
  if (isStale()) return { combinedCandidates: [], diagnostics: { ...diagnostics, status: "stale" } };

  let retunedDelay = null;
  let retunedGain = null;
  const effectiveBaseline = bestPosition.appliedTuning || existingAuthority?.appliedTuning || [];

  try {
    const delayT0 = performance.now();
    const delaySearch = await runInWorker(worker, "grouped-delay", {
      rawTransfer: positionRawTransfer,
      instances: subwooferInstances,
      roomDims,
      effectiveBaseline,
    }, controller.signal);
    metrics.recordWorkerCall("grouped-delay", "combined-retune-delay", performance.now() - delayT0, false);
    if (isStale()) return { combinedCandidates: [], diagnostics: { ...diagnostics, status: "stale" } };
    retunedDelay = delaySearch?.candidates?.[0]?.tuning || null;
    diagnostics.tested++;
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    diagnostics.options.push({ stage: "retune-delay", error: err.message });
  }

  onProgress("combining", "Retuning gain on best placement", 1, 2);
  if (isCancelled()) return { combinedCandidates: [], diagnostics: { ...diagnostics, status: "cancelled" } };

  // ── 3. Retune gain on the best position's rawTransfer ─────────────
  try {
    const gainT0 = performance.now();
    const gainSearch = await runInWorker(worker, "grouped-gain", {
      rawTransfer: positionRawTransfer,
      instances: subwooferInstances,
      roomDims,
      effectiveBaseline: retunedDelay || effectiveBaseline,
    }, controller.signal);
    metrics.recordWorkerCall("grouped-gain", "combined-retune-gain", performance.now() - gainT0, false);
    if (isStale()) return { combinedCandidates: [], diagnostics: { ...diagnostics, status: "stale" } };
    retunedGain = gainSearch?.candidates?.[0]?.tuning || null;
    diagnostics.tested++;
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    diagnostics.options.push({ stage: "retune-gain", error: err.message });
  }

  // ── 4. Merge tunings and canonically confirm ──────────────────────
  const mergedTuning = mergeTunings(effectiveBaseline, retunedDelay, retunedGain);
  if (!mergedTuning?.length) {
    diagnostics.status = "incomplete";
    diagnostics.reason = "Retuning produced no valid tuning";
    return { combinedCandidates, diagnostics };
  }

  // Budget check before canonical confirmation
  if (elapsed() > COMBINED_BUDGET_MS) {
    diagnostics.budgetExceeded = true;
    diagnostics.status = "budget_exceeded";
    diagnostics.reason = "Combined budget exceeded before confirmation";
    return { combinedCandidates, diagnostics };
  }

  const totalConfirmations = (seatingMaterial?.material && seatingResult && ctx.seatingRawTransfer?.perSourcePerSeatComplexTransfers?.length) ? 2 : 1;
  onProgress("combined_confirming", `Canonical confirmation 1 of ${totalConfirmations}`, 0, totalConfirmations);
  if (isCancelled()) return { combinedCandidates: [], diagnostics: { ...diagnostics, status: "cancelled" } };

  try {
    const confirmT0 = performance.now();
    const response = await runInWorker(worker, "confirmation", {
      rawTransfer: positionRawTransfer,
      tuning: mergedTuning,
      tuningVariant: "delay-polarity-trim",
      p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
    }, controller.signal);
    metrics.recordWorkerCall("confirmation", "combined-1", performance.now() - confirmT0, false);
    if (isStale()) return { combinedCandidates: [], diagnostics: { ...diagnostics, status: "stale" } };

    if (response) {
      const bound = bindConfirmation(response, mergedTuning, {
        ...bestPosition,
        candidateOrigin: "combined",
      }, "position");
      bound.isPositionCandidate = true;
      bound.candidateOrigin = "combined";
      bound.candidateId = "combined:" + (bestPosition.candidateId || "position");
      bound.combinedFrom = {
        positionCandidateId: bestPosition.candidateId,
        retunedDelay: !!retunedDelay,
        retunedGain: !!retunedGain,
      };
      const check = validateConfirmedCandidate(bound, validationContext);
      diagnostics.confirmed++;
      if (check.valid) {
        combinedCandidates.push(check.result);
        diagnostics.valid++;
        onBestSoFar({ result: check.result, candidate: { ...bestPosition, candidateOrigin: "combined" } });
      } else {
        diagnostics.invalid++;
        diagnostics.options.push({ stage: "confirm-combined", issues: check.issues });
      }
    }
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    diagnostics.options.push({ stage: "confirm-combined", error: err.message });
  }

  // ── 5. Optional second combined finalist: calibration + seating ──
  if (
    combinedCandidates.length > 0 &&
    seatingMaterial?.material &&
    seatingResult &&
    elapsed() < COMBINED_BUDGET_MS - 5000 &&
    combinedCandidates.length < MAX_COMBINED_CONFIRMATIONS
  ) {
    onProgress("combined_confirming", `Canonical confirmation 2 of ${totalConfirmations}`, 1, totalConfirmations);
    if (isCancelled()) return { combinedCandidates, diagnostics };

    // Combine best calibration tuning with best seating offset
    const bestCal = identifyBestCalibrationCandidate(confirmedResults, existingAuthority);
    if (bestCal?.appliedTuning) {
      try {
        // Use the seating result's rawTransfer if available, with the best calibration tuning
        const seatingRawTransfer = ctx.seatingRawTransfer;
        if (seatingRawTransfer?.perSourcePerSeatComplexTransfers?.length) {
          const confirmT0 = performance.now();
          const response = await runInWorker(worker, "confirmation", {
            rawTransfer: seatingRawTransfer,
            tuning: bestCal.appliedTuning,
            tuningVariant: "delay-polarity-trim",
            p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
          }, controller.signal);
          metrics.recordWorkerCall("confirmation", "combined-2", performance.now() - confirmT0, false);
          if (isStale()) return { combinedCandidates, diagnostics: { ...diagnostics, status: "stale" } };

          if (response) {
            const bound = bindConfirmation(response, bestCal.appliedTuning, {
              candidateOrigin: "combined-calibration-seating",
            }, "calibration");
            bound.candidateKind = "calibration";
            bound.candidateId = "combined-cal-seating";
            bound.seatingOffsetMm = seatingResult.seatingOffsetMm;
            bound.seatingPositions = seatingResult.seatingPositions;
            bound.combinedFrom = {
              calibrationCandidateId: bestCal.candidateId,
              seatingOffsetMm: seatingResult.seatingOffsetMm,
            };
            const check = validateConfirmedCandidate(bound, validationContext);
            diagnostics.confirmed++;
            if (check.valid) {
              combinedCandidates.push(check.result);
              diagnostics.valid++;
              onBestSoFar({ result: check.result, candidate: { candidateOrigin: "combined" } });
            } else {
              diagnostics.invalid++;
            }
          }
        }
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        diagnostics.options.push({ stage: "confirm-cal-seating", error: err.message });
      }
    }
  }

  diagnostics.status = combinedCandidates.length > 0 ? "completed" : "no_improvement";
  return { combinedCandidates, diagnostics };
}