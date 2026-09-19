/**
 * confidence.js
 * --------------------------------
 * Confidence helpers for Proposal Intelligence.
 *
 * Proposal Intelligence uses the same numeric confidence scale as
 * Engineering Authority (0.0–0.99). Product Intelligence letter grades
 * (A/B/C/D) are normalised to this scale so both inputs share one
 * confidence space.
 *
 * Confidence propagation rule:
 *   A decision's confidence = the floor of the evidence it cites.
 *   Low engineering confidence produces cautious recommendations.
 */

export const LETTER_TO_NUMERIC = Object.freeze({
  A: 0.95,
  B: 0.85,
  C: 0.70,
  D: 0.50,
});

/** Convert a Product Intelligence letter grade (A/B/C/D) to numeric. */
export function letterToNumeric(letter) {
  return LETTER_TO_NUMERIC[letter] ?? 0.50;
}

/** Convert a numeric confidence back to a letter grade for display. */
export function numericToLetter(value) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 0.90) return 'A';
  if (value >= 0.75) return 'B';
  if (value >= 0.60) return 'C';
  return 'D';
}

/** Lowest confidence among a list of numeric values (conservative floor). */
export function confidenceFloor(values) {
  const valid = (values || []).filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0) return 0;
  return Math.min(...valid);
}

/** Average confidence among a list of numeric values. */
export function confidenceAverage(values) {
  const valid = (values || []).filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Attach both numeric and letter confidence to a decision object. */
export function withDecisionConfidence(value) {
  const rounded = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  return {
    confidence: rounded,
    confidence_letter: numericToLetter(rounded),
  };
}