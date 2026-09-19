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
  MEASURED: 0.99,            // Directly measured / user-entered (room dimensions)
  PUBLISHED_SPEC_A: 0.95,   // Published manufacturer spec — all key fields present
  PUBLISHED_SPEC_B: 0.85,   // Published manufacturer spec — most fields present
  PUBLISHED_SPEC_C: 0.70,   // Published manufacturer spec — partial data
  PUBLISHED_SPEC_D: 0.50,   // Published manufacturer spec — minimal data
  COMPUTED_GEOMETRIC: 0.95, // Computed from verified geometry (P1, P5, P9)
  COMPUTED_SPL: 0.85,        // Computed from product specs (P12, P13)
  MODEL_DEPENDENT: 0.80,    // Model-dependent analysis (bass P14, P18, P19, P20)
  ASSUMED: 0.60,             // Designer assumption (P15, P21)
  ESTIMATE: 0.50,            // Engineering estimate
  NOT_CALCULATED: 0.0,       // Not yet calculated
});

/** Map SpeakerSpecification confidence letters to numeric confidence. */
export function confidenceFromSpecConfidence(specConfidence) {
  const map = {
    A: CONFIDENCE.PUBLISHED_SPEC_A,
    B: CONFIDENCE.PUBLISHED_SPEC_B,
    C: CONFIDENCE.PUBLISHED_SPEC_C,
    D: CONFIDENCE.PUBLISHED_SPEC_D,
  };
  return map[specConfidence] ?? CONFIDENCE.ESTIMATE;
}

/**
 * Source provenance labels for engineering facts.
 * GPT can use these to naturally phrase statements like
 * "Based on the published loudspeaker specification..." without inventing anything.
 */
export const SOURCE = Object.freeze({
  USER_INPUT: 'User Input',
  MEASURED: 'Measured',
  PUBLISHED_SPEC: 'Published Manufacturer Specification',
  RP22_CALCULATION: 'RP22 Calculation',
  BASS_SIMULATION: 'Bass Modal Simulation',
  GEOMETRIC_CALCULATION: 'Geometric Calculation',
  DESIGNER_ASSUMPTION: 'Designer Assumption',
  ENGINEERING_ESTIMATE: 'Engineering Estimate',
  NOT_CALCULATED: 'Not Calculated',
});

/** Wrap a statement with a confidence value and optional source provenance. */
export function withConfidence(statement, confidence, source = null) {
  return {
    statement: String(statement || ''),
    confidence: Number.isFinite(confidence) ? Math.round(confidence * 100) / 100 : 0,
    source: source || null,
  };
}

/** Create a "not calculated" entry. */
export function notCalculated(statement = 'Not calculated.') {
  return withConfidence(statement, CONFIDENCE.NOT_CALCULATED, SOURCE.NOT_CALCULATED);
}