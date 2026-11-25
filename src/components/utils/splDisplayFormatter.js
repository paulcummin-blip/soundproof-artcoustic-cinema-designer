// Shared designer/client-facing SPL and dB presentation.
// Display only: callers retain the original full-precision value for all maths,
// persistence, optimisation, ranking and RP22 grading.
//
// All user-facing dB values are displayed as integers using conventional
// rounding (round half away from zero), per the Sound Proof whole-number dB
// presentation policy. This is NOT the RP22 grading authority —
// resolveRp22DesignValue owns grading quantisation (floor/ceil by group) and is
// unchanged. The values produced here are for display only.

/**
 * Conventional rounding to the nearest whole dB (round half away from zero).
 *   −13.5 → −14   −9.8 → −10   5.9 → 6   3.2 → 3   0.0 → 0
 * Never truncates or rounds in favour of a particular result.
 */
export function roundDbValue(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.sign(number) * Math.round(Math.abs(number));
}

/**
 * Format a dB value as a whole-number integer with a unit suffix.
 *   roundDbDisplayValue(−9.8, { unit: "dBC" }) → "−10 dBC"
 *   roundDbDisplayValue(3.2)                  → "3 dB"
 */
export function formatWholeNumberDb(value, { unit = "dB", fallback = "—" } = {}) {
  const wholeDb = roundDbValue(value);
  return wholeDb === null ? fallback : `${wholeDb} ${unit}`;
}

// Kept for backward compatibility — now conventional rounding, not ceiling.
export const ceilSplDisplayValue = roundDbValue;

export function formatSplDisplay(value, { unit = "dBC", fallback = "—" } = {}) {
  const wholeDb = roundDbValue(value);
  return wholeDb === null ? fallback : `${wholeDb} ${unit}`;
}