// bassAssessmentBandAuthority.js
//
// Single authority for the P19/P20 assessment frequency band.
//
// The band is [achieved P18 F3 → room transition frequency], and is valid
// when a legitimate sustained P18 F3 has been established AND a valid
// transition frequency exists.
//
// P14 is an output-capability parameter. It constrains the predicted post-EQ
// response through available headroom, but it does NOT determine whether
// response shape and consistency can be assessed. P19 and P20 must be graded
// even when P14 fails, provided the acoustic prerequisites (P18 F3 and
// transition frequency) are valid. P14 retains its own separate authority.
//
// This is deliberately SEPARATE from the P18 plateau-reference band (60–200 Hz
// median). The P18 reference band selects the SPL plateau for F3 calculation;
// the P19/P20 assessment band selects the frequency range for deviation grading.
// The two authorities must never be conflated.

const isFiniteNum = (value) => value !== null && value !== undefined && typeof value !== "boolean" && Number.isFinite(Number(value));

/**
 * Resolve the P19/P20 assessment band from the operating-point chain.
 *
 * @param {object} params
 * @param {boolean} [params.p14Pass] - retained for caller compatibility; no longer gates the band
 * @param {number|null} params.achievedP18Hz - achieved P18 -3 dB extension frequency (Hz)
 * @param {number|null} params.transitionHz - room transition / Schroeder frequency (Hz)
 * @returns {{ valid: boolean, lowerHz: number|null, upperHz: number|null, reason: string|null }}
 */
export function resolveBassAssessmentBand({ p14Pass, achievedP18Hz, transitionHz } = {}) {
  // P14 pass is intentionally NOT a prerequisite. P14 is an output-capability
  // parameter; it constrains the predicted post-EQ response through headroom
  // but does not determine whether response shape/consistency can be graded.
  // P19 and P20 are assessed whenever the acoustic prerequisites (P18 F3 and
  // transition frequency) are valid, regardless of P14 grade.
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