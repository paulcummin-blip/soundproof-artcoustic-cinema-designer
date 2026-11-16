// peakPowerAssumption.js
// ---------------------------------------------------------------------------
// The peak-to-continuous assumption behind provisional P12/P13 predictions.
//
// When a manufacturer publishes peak power handling but does not publish
// continuous power handling OR a recommended amplifier maximum, Sound Proof
// assumes continuous-equivalent power at 50% of the published peak rating.
// The resulting P12/P13 level is a PROVISIONAL ESTIMATE and is always
// classified LIMITED DATA — never GOOD or FULL.
//
// This is the LAST tier in the power authority hierarchy:
//   1. Published continuous / IEC / AES power  (manufacturer-published rating)
//   2. Recommended amplifier maximum            (manufacturer guidance)
//   3. 50% of published peak power               (this assumption — provisional)
//
// The assumption is applied consistently to every manufacturer, including
// Artcoustic. It never overrides better-quality published power data and it
// never invents a peak rating where none is published.
// ---------------------------------------------------------------------------

// 50% — the continuous-equivalent fraction of published peak power handling.
export const PEAK_TO_CONTINUOUS_FACTOR = 0.5;

// The label shown wherever the assumed power authority is stated.
export const PEAK_ASSUMPTION_LABEL =
  "Assumed continuous-equivalent (50% of published peak)";

// The explanation shown in the comparison information panel for provisional
// results. Uses a comma, never an em-dash, per copy guidelines.
export const PROVISIONAL_EXPLANATION =
  "Provisional RP22 estimate. The manufacturer has not published continuous power handling or a recommended amplifier maximum. Sound Proof has assumed continuous-equivalent power at 50% of the published peak rating. The resulting performance level is an estimate, not a manufacturer-verified capability.";

/**
 * Compute the assumed continuous-equivalent power from a published peak rating.
 * Returns null when the peak is not a positive finite number, so the caller
 * can fall through to the "no defensible calculation" path.
 * @param {number|null} peakW published peak power handling in watts
 * @returns {number|null} assumed continuous-equivalent power in watts
 */
export function assumedContinuousFromPeak(peakW) {
  const n = Number(peakW);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * PEAK_TO_CONTINUOUS_FACTOR;
}