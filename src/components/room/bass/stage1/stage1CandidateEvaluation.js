// stage1CandidateEvaluation.js
// ---------------------------------------------------------------------------
// Shared, PURE Stage 1 candidate evaluation. Imported by BOTH the in-browser
// evaluation worker (stage1Evaluation.worker.js) and the regression-test mock
// pool, so the acoustic maths run IDENTICALLY in serial (concurrency=1) and
// concurrent (concurrency=3) runs.
//
// This module is EVALUATION ONLY. It changes no candidate generation, no
// ranking, no safety, no geometry, no coordinates, no finalist selection.
// It computes the normalised room transfer for one candidate and derives the
// neutral screening metrics — exactly the work the serial engine did inline.
//
// The context (roomDims, rspPosition, seatingPositions, physicsOptions,
// preparedModes) is prepared ONCE per run and reused for every candidate, so
// every evaluation shares the same immutable room/source field — the same
// reuse the serial engine already had.
// ---------------------------------------------------------------------------

import { prepareModeBank } from "@/bass/core/rewBassEngine";
import { computeNormalizedRoomTransfer } from "../normalizedRoomTransferEngine";
import {
  STAGE1_SCREENING_FREQ_MIN_HZ,
  STAGE1_SCREENING_FREQ_MAX_HZ,
  STAGE1_POINTS_PER_OCTAVE,
  STAGE1_FALLBACK_SOURCE_HEIGHT_M,
} from "./stage1Constants";
import { computeStage1Fingerprint } from "./stage1Fingerprint";
import { finalistKey } from "./stage1FinalistEvidence";
import { screenCandidate } from "./stage1Screening";

/**
 * Build the engine options for Stage 1 screening (wider mode range than the
 * 20-80 Hz screening band — modes need room to resolve). Identical to the
 * inline options the serial engine built per quantity, but parameterised by
 * `pointsPerOctave` so the same helper serves the 8 PPO discovery pass and the
 * 32 PPO refinement pass.
 */
export function buildStage1EngineOptions(physicsOptions, pointsPerOctave = STAGE1_POINTS_PER_OCTAVE) {
  return {
    ...physicsOptions,
    freqMinHz: STAGE1_SCREENING_FREQ_MIN_HZ,
    freqMaxHz: 200,
    smoothing: "none",
    pointsPerOctave: Number.isFinite(pointsPerOctave) && pointsPerOctave > 0 ? pointsPerOctave : STAGE1_POINTS_PER_OCTAVE,
  };
}

/**
 * Prepare the shared, immutable evaluation context once per run.
 * preparedModes is room-dependent only (same across all quantities), so it is
 * computed once here and reused by every candidate evaluation. The mode bank
 * does not depend on pointsPerOctave (only the frequency axis does), so the
 * discovery (8 PPO) and refinement (32 PPO) passes share one preparedModes.
 */
export function prepareStage1Context({ roomDims, rspPosition, seatingPositions, physicsOptions }) {
  const engineOptions = buildStage1EngineOptions(physicsOptions);
  const preparedModes = prepareModeBank(roomDims, engineOptions);
  const fingerprint = computeStage1Fingerprint({ roomDims, rspPosition, seatingPositions, physicsOptions });
  return { roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes, fingerprint };
}

function filterToDisplayBand(curve) {
  return (curve || []).filter(
    (p) => p.frequency >= STAGE1_SCREENING_FREQ_MIN_HZ && p.frequency <= STAGE1_SCREENING_FREQ_MAX_HZ && Number.isFinite(p.spl),
  );
}

/**
 * Build the compact response evidence stored on a refined finalist so the
 * preview graph and the displayed metrics describe the SAME response. Only
 * the 20–80 Hz display band is retained (the full 15–200 Hz response was
 * already used for null-detection shoulders during screening).
 * @private
 */
function buildResponseEvidence(transfer) {
  const rspCurve = filterToDisplayBand(transfer.rspCurve);
  const seatCurves = (transfer.seatCurves || []).map((sc) => ({
    seatKey: sc.seatKey,
    originalSeatId: sc.originalSeatId,
    responseData: filterToDisplayBand(sc.responseData),
  }));
  return {
    rspCurve,
    seatCurves,
    frequencies: rspCurve.map((p) => p.frequency),
  };
}

function candidateToSources(candidate, roomDims) {
  return candidate.sources.map((s, i) => ({
    id: `stage1-src-${i + 1}`,
    x: s.xNorm * roomDims.widthM,
    y: s.yNorm * roomDims.lengthM,
    z: STAGE1_FALLBACK_SOURCE_HEIGHT_M,
    placement: "front",
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
  }));
}

/**
 * Evaluate a single candidate against the shared context.
 *
 * @param {object} candidate — { familyId, sources, ... }
 * @param {object} context — shared prepared context
 * @param {object} [options]
 * @param {number} [options.pointsPerOctave] — resolution (default discovery 8 PPO)
 * @param {boolean} [options.returnResponseEvidence] — attach compact 20–80 Hz
 *   response curves to the result so the preview graph and metrics share data
 * @returns {object|null} { ...candidate, screening, transfer[, responseEvidence] }
 *   on a complete transfer, or null on an incomplete transfer.
 */
export function evaluateCandidate(candidate, context, options = {}) {
  const { roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes } = context;
  const pointsPerOctave = Number.isFinite(options.pointsPerOctave) && options.pointsPerOctave > 0
    ? options.pointsPerOctave
    : STAGE1_POINTS_PER_OCTAVE;
  const sources = candidateToSources(candidate, roomDims);
  const transfer = computeNormalizedRoomTransfer({
    roomDims,
    rspPosition,
    seatingPositions,
    subsForSimulation: sources,
    physicsOptions,
    pointsPerOctave,
    preparedModes,
  });
  if (transfer.status !== "complete") return null;
  const screening = screenCandidate({ transferResult: transfer, seatingPositions, candidate });
  const result = { ...candidate, screening, transfer };
  if (options.returnResponseEvidence) {
    const key = finalistKey(candidate, sources.length, context.fingerprint);
    result.screening = { ...screening, key };
    result.responseEvidence = { ...buildResponseEvidence(transfer), key, ppo: pointsPerOctave };
  }
  return result;
}