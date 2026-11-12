// formatCrossover.js
// ---------------------------------------------------------------------------
// Safely format a crossover configuration object into a readable string.
//
// The crossover object (from normaliseCrossoverConfig in crossoverAuthority.js)
// carries: frequencyHz, speakerHpSlopeDbPerOct, subwooferLpSlopeDbPerOct,
// linkFrequencies, and subwooferFrequencyHz (when linkFrequencies is false).
//
// This helper never throws and returns null when the object is absent or has
// no usable frequency — the caller should omit the label entirely in that case.
// It performs NO calculation and changes no engineering value.
// ---------------------------------------------------------------------------

/**
 * @param {object|null} crossover
 * @returns {string|null} A human-readable crossover label, or null when absent.
 */
export function formatCrossover(crossover) {
  if (!crossover || typeof crossover !== "object") return null;
  const freq = Number(crossover.frequencyHz);
  if (!Number.isFinite(freq) || freq <= 0) return null;
  const slope = Number(crossover.speakerHpSlopeDbPerOct)
    || Number(crossover.subwooferLpSlopeDbPerOct)
    || 24;
  const parts = [`${Math.round(freq)} Hz`, `${slope} dB/oct`];
  if (crossover.linkFrequencies === false) {
    const subFreq = Number(crossover.subwooferFrequencyHz);
    if (Number.isFinite(subFreq) && subFreq > 0 && subFreq !== freq) {
      parts.push(`sub ${Math.round(subFreq)} Hz`);
    }
  }
  return parts.join(" · ");
}