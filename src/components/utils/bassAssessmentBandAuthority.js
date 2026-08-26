// bassAssessmentBandAuthority.js
//
// Single authority for the P19/P20 assessment frequency band.
//
// The band is [achieved P18 F3 → room transition frequency], and is valid
// ONLY when the selected P14 operating target is achieved (P14 PASS) AND a
// legitimate sustained P18 F3 has been established.
//
// This is deliberately SEPARATE from the P18 plateau-reference band (60–200 Hz
// median). The P18 reference band selects the SPL plateau for F3 calculation;
// the P19/P20 assessment band selects the frequency range for deviation grading.
// The two authorities must never be conflated.
//
// When P14 FAILS, the band is invalid and P19/P20 must NOT be graded — no
// fallback to a different SPL, no substitute lower bound, no persisted grades.

const isFiniteNum = (value) => value !== null && value !== undefined && typeof value !== "boolean" && Number.isFinite(Number(value));

/**
 * Resolve the P19/P20 assessment band from the operating-point chain.
 *
 * @param {object} params
 * @param {boolean} params.p14Pass - whether the selected P14 operating target was achieved
 * @param {number|null} params.achievedP18Hz - achieved P18 -3 dB extension frequency (Hz)
 * @param {number|null} params.transitionHz - room transition / Schroeder frequency (Hz)
 * @returns {{ valid: boolean, lowerHz: number|null, upperHz: number|null, reason: string|null }}
 */
export function resolveBassAssessmentBand({ p14Pass, achievedP18Hz, transitionHz } = {}) {
  if (p14Pass !== true) {
    return { valid: false, lowerHz: null, upperHz: null, reason: "p14-operating-point-not-achieved" };
  }
  if (!isFiniteNum(achievedP18Hz) || Number(achievedP18Hz) <= 0) {
    return { valid: false, lowerHz: null, upperHz: null, reason: "p18-extension-not-achieved" };
  }
  if (!isFiniteNum(transitionHz) || Number(transitionHz) <= 0) {
    return { valid: false, lowerHz: null, upperHz: null, reason: "transition-frequency-unavailable" };
  }
  const lower = Number(achievedP18Hz);
  const upper = Number(transitionHz);
  if (upper <= lower) {
    return { valid: false, lowerHz: null, upperHz: null, reason: "transition-not-above-p18" };
  }
  return { valid: true, lowerHz: lower, upperHz: upper, reason: null };
}

/**
 * Format the assessment band as a human-readable caption.
 * @param {object} band - from resolveBassAssessmentBand
 * @returns {string}
 */
export function formatBassAssessmentBandCaption(band) {
  if (!band?.valid) return "P19/P20 assessment: not available";
  const lower = Math.round(band.lowerHz);
  const upper = Math.round(band.upperHz);
  return `P19/P20 assessment: ${lower}–${upper} Hz`;
}