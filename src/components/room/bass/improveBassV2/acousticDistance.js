// acousticDistance.js
// Converts delay in milliseconds to equivalent acoustic path distance.
// Uses the same speed-of-sound constant as stage2TuningSearch.js (343 m/s).
//
// This is an ACOUSTIC TIMING EQUIVALENT — it does NOT imply the physical
// subwoofer has moved. It describes the equivalent path-length difference
// that would produce the same time delay in air.

export const SPEED_OF_SOUND_M_S = 343;

/**
 * Convert delay in milliseconds to equivalent acoustic path distance in meters.
 * @param {number} delayMs - delay in milliseconds
 * @returns {number} equivalent acoustic path distance in meters
 */
export function delayMsToAcousticDistance(delayMs) {
  const ms = Number(delayMs) || 0;
  return (ms / 1000) * SPEED_OF_SOUND_M_S;
}

/**
 * Format a delay as a human-readable acoustic path equivalent string.
 * Example: +9.0 ms → "≈ +3.09 m acoustic path"
 * @param {number} delayMs - delay in milliseconds (signed)
 * @returns {string} formatted string
 */
export function formatAcousticPath(delayMs) {
  const ms = Number(delayMs) || 0;
  const dist = delayMsToAcousticDistance(ms);
  const sign = ms >= 0 ? "+" : "";
  return `≈ ${sign}${dist.toFixed(2)} m acoustic path`;
}

/**
 * Format a delay with both ms and acoustic path.
 * Example: "+9.0 ms / ≈ +3.09 m acoustic path"
 * @param {number} delayMs - delay in milliseconds (signed)
 * @returns {string} formatted string
 */
export function formatDelayWithDistance(delayMs) {
  const ms = Number(delayMs) || 0;
  const sign = ms >= 0 ? "+" : "";
  return `${sign}${ms.toFixed(1)} ms / ${formatAcousticPath(ms)}`;
}