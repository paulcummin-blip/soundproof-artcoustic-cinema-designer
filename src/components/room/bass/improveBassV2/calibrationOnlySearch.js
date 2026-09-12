// calibrationOnlySearch.js
// Calibration-only search for the CURRENT subwoofer positions.
//
// Uses the existing per-source/per-seat complex raw transfers (captured with
// ZERO tuning) and runs the combined delay + polarity + trim search.
// The result is confirmed through the full canonical chain (EQ pool, P14/P18/
// P19/P20 authority) by the engine via evaluateStage2ConfirmationWithTuning.
//
// This module does NOT move subwoofers. It only searches delay, polarity,
// and trim/gain for the current installed positions.

import { searchDelayPolarityTrim } from "../stage2/stage2TuningSearch.js";

/**
 * Run the combined delay + polarity + trim search on Current's raw transfers.
 *
 * @param {object} rawTransfer - Cached raw transfer with perSourcePerSeatComplexTransfers
 * @returns {{ bestTuning: Array, searchScore: number, delays: number[], gains: number[], polarities: number[] } | null}
 */
export function runCalibrationOnlySearch(rawTransfer) {
  if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length) return null;

  const rspTransfers = rawTransfer.perSourcePerSeatComplexTransfers.filter(
    (t) => t.seatId === "rsp",
  );
  if (!rspTransfers.length) return null;

  const sources = rawTransfer.sources || [];
  const sourceCount = sources.length;

  if (sourceCount <= 1) {
    return {
      bestTuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }],
      searchScore: Infinity,
      delays: [0],
      gains: [0],
      polarities: [0],
    };
  }

  // Run combined delay + polarity + trim search (4-phase: delay -> polarity -> trim -> re-optimise delay)
  const searchResult = searchDelayPolarityTrim(rspTransfers, sources);
  const bestFinalist = searchResult.finalists?.[0];

  if (!bestFinalist?.tuning) return null;

  return {
    // Preserve every finalist already returned by the existing search.
    candidates: searchResult.finalists,
    retainedCandidateCount: searchResult.finalists.length,
    shortlistComplete: false, // coordinate-descent trials are not retained
    bestTuning: bestFinalist.tuning,
    searchScore: bestFinalist.score ?? Infinity,
    delays: bestFinalist.delays || [],
    gains: bestFinalist.gains || [],
    polarities: bestFinalist.polarities || [],
  };
}