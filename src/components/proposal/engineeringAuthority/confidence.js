/**
 * confidence.js
 * --------------------------------
 * Confidence value constants and helpers for Engineering Authority.
 *
 * Confidence is ENGINEERING confidence — not GPT confidence.
 * It reflects the evidence quality of the underlying source data.
 * GPT uses these values to modulate writing certainty (Architecture Rule 4).
 */

export const CONFIDENCE = Object.freeze({
  MEASURED: 0.99,            // Directly measured (room dimensions)
  COMPUTED_GEOMETRIC: 0.95,  // Computed from verified geometry (P1, P5, P9)
  COMPUTED_SPL: 0.85,        // Computed from product specs (P12, P13)
  MODEL_DEPENDENT: 0.80,    // Model-dependent analysis (bass P14, P18, P19, P20)
  ASSUMED: 0.60,             // Designer assumption (P15, P21)
  ESTIMATE: 0.50,            // Engineering estimate
  NOT_CALCULATED: 0.0,       // Not yet calculated
});

/** Map SpeakerSpecification confidence letters to numeric confidence. */
export function confidenceFromSpecConfidence(specConfidence) {
  const map = {
    A: 0.95,  // Published
    B: 0.80,  // Calculated
    C: 0.65,  // Estimated
    D: 0.50,  // Engineering Estimate
  };
  return map[specConfidence] ?? CONFIDENCE.ESTIMATE;
}

/** Wrap a statement with a confidence value. */
export function withConfidence(statement, confidence) {
  return {
    statement: String(statement || ''),
    confidence: Number.isFinite(confidence) ? Math.round(confidence * 100) / 100 : 0,
  };
}

/** Create a "not calculated" entry. */
export function notCalculated(statement = 'Not calculated.') {
  return withConfidence(statement, CONFIDENCE.NOT_CALCULATED);
}