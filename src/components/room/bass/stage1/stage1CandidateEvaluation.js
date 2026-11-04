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
  STAGE1_POINTS_PER_OCTAVE,
  STAGE1_FALLBACK_SOURCE_HEIGHT_M,
} from "./stage1Constants";
import { screenCandidate } from "./stage1Screening";

/**
 * Build the engine options for Stage 1 screening (wider mode range than the
 * 20-80 Hz screening band — modes need room to resolve). Identical to the
 * inline options the serial engine built per quantity.
 */
export function buildStage1EngineOptions(physicsOptions) {
  return {
    ...physicsOptions,
    freqMinHz: STAGE1_SCREENING_FREQ_MIN_HZ,
    freqMaxHz: 200,
    smoothing: "none",
    pointsPerOctave: STAGE1_POINTS_PER_OCTAVE,
  };
}

/**
 * Prepare the shared, immutable evaluation context once per run.
 * preparedModes is room-dependent only (same across all quantities), so it is
 * computed once here and reused by every candidate evaluation.
 */
export function prepareStage1Context({ roomDims, rspPosition, seatingPositions, physicsOptions }) {
  const engineOptions = buildStage1EngineOptions(physicsOptions);
  const preparedModes = prepareModeBank(roomDims, engineOptions);
  return { roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes };
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
 * Returns { ...candidate, screening, transfer } on a complete transfer, or
 * null on an incomplete transfer — exactly the serial engine's behaviour.
 */
export function evaluateCandidate(candidate, context) {
  const { roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes } = context;
  const sources = candidateToSources(candidate, roomDims);
  const transfer = computeNormalizedRoomTransfer({
    roomDims,
    rspPosition,
    seatingPositions,
    subsForSimulation: sources,
    physicsOptions,
    pointsPerOctave: STAGE1_POINTS_PER_OCTAVE,
    preparedModes,
  });
  if (transfer.status !== "complete") return null;
  const screening = screenCandidate({ transferResult: transfer, seatingPositions, candidate });
  return { ...candidate, screening, transfer };
}