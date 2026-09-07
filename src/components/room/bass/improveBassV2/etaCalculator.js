// etaCalculator.js
// Rolling measured ETA for the Improve Bass V2 progress UI.
//
// Requirements:
//   - minimum sample count before ETA ("Estimating time remaining...")
//   - prefer recent observations (rolling window of last 10)
//   - remaining units x measured unit duration
//   - update with each meaningful completed unit
//   - ETA may increase/decrease as estimate improves
//
// This is an INDICATOR, not a promise.

export const MIN_ETA_SAMPLES = 3;
export const MAX_ETA_SAMPLES = 10;

/**
 * Compute ETA state from measured unit times and progress.
 *
 * @param {number[]} unitTimes - rolling array of per-unit durations (ms)
 * @param {number} current - completed units
 * @param {number} total - expected total units
 * @returns {{ status: "estimating" | "measured" | "finalising", etaSeconds: number | null }}
 */
export function computeEta(unitTimes, current, total) {
  if (!Array.isArray(unitTimes)) unitTimes = [];

  if (current >= total && total > 0) {
    return { status: "finalising", etaSeconds: null };
  }

  if (unitTimes.length < MIN_ETA_SAMPLES || total <= 0) {
    return { status: "estimating", etaSeconds: null };
  }

  // Use the most recent observations (already capped at MAX_ETA_SAMPLES by caller)
  const recent = unitTimes.slice(-MAX_ETA_SAMPLES);
  const avgMs = recent.reduce((a, b) => a + b, 0) / recent.length;
  const remaining = Math.max(0, total - current);
  const etaMs = remaining * avgMs;
  const etaSeconds = Math.ceil(etaMs / 1000);

  return { status: "measured", etaSeconds };
}

/**
 * Format the ETA for display.
 *
 * @param {string} etaStatus - "estimating" | "measured" | "finalising"
 * @param {number|null} etaSeconds
 * @returns {string}
 */
export function formatEta(etaStatus, etaSeconds) {
  if (etaStatus === "estimating") return "Estimating time remaining\u2026";
  if (etaStatus === "finalising") return "Finalising\u2026";
  if (etaSeconds == null || !Number.isFinite(etaSeconds)) return "Estimating time remaining\u2026";
  if (etaSeconds < 60) return `Approx. ${etaSeconds} sec remaining`;
  const mins = Math.floor(etaSeconds / 60);
  const secs = etaSeconds % 60;
  return `Approx. ${mins} min ${secs} sec remaining`;
}