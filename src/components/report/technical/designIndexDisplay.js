/**
 * designIndexDisplay.js
 * ---------------------
 * The single display authority for the internal Design Index inside the
 * Technical Report — a designer / dealer technical document.
 *
 * Scope (one rule, one place):
 *   · the index MAY appear in the Technical Report, because that document is a
 *     designer/dealer technical document;
 *   · it is never shown as a percentage: no "82%", no "Design Index 82%", no
 *     "82% (Primary)", no "out of 100" wording and no percentage sign;
 *   · it is never described as a client-facing score, a proposal score or a
 *     pass/fail percentage;
 *   · it is labelled as the internal / technical design index and presented as
 *     an internal design diagnostic, not as a headline performance result;
 *   · in client-facing proposal copy it must not appear at all (enforced by the
 *     shared writing contract and the proposal row guard).
 *
 * Value normalisation: the index is a dimensionless integer. A value stored as a
 * share is the same index expressed as a fraction, so 0.82 displays as "82" and
 * 82 displays as "82". Nothing is ever appended to it.
 *
 * Pure: no React, no side effects, and no recalculation of any score, weight,
 * level or designation.
 */

export const TECHNICAL_DESIGN_INDEX_LABEL = 'Internal Design Index';

export const TECHNICAL_DESIGN_INDEX_NOTE =
  'Used as an internal design diagnostic, not a client-facing performance score.';

/**
 * Normalise a stored design index for display.
 *   82     → 82
 *   0.82   → 82   (the same index expressed as a share)
 *   82.4   → 82
 *   null / non-numeric → null
 * @param {number|string|null|undefined} value
 * @returns {number|null}
 */
export function normaliseDesignIndex(value) {
  if (value === null || value === undefined || value === '') return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const scaled = v > 0 && v < 1 ? v * 100 : v;
  return Math.max(0, Math.round(scaled));
}

/**
 * Format the design index digit-only. Never carries a percentage sign, a
 * "/100" suffix or "out of 100" wording.
 * @param {number|string|null|undefined} value
 * @returns {string|null}
 */
export function formatDesignIndex(value) {
  const index = normaliseDesignIndex(value);
  return index == null ? null : String(index);
}

/**
 * Read the internal index out of a rating object (or a legacy numeric value)
 * ready for display.
 *
 * This deliberately reads the stored value and normalises it here rather than
 * pre-rounding it elsewhere: a rating that carries the index as a share (0.82)
 * must display as 82, not as 1. The band/designation maths is untouched.
 *
 * @param {Object|number|null|undefined} ratingOrValue
 * @returns {number|null}
 */
export function readDesignIndexForDisplay(ratingOrValue) {
  if (ratingOrValue == null) return null;
  if (typeof ratingOrValue === 'object') {
    if (ratingOrValue.designPerformanceIndex != null) {
      return normaliseDesignIndex(ratingOrValue.designPerformanceIndex);
    }
    if (ratingOrValue.actualPoints != null) {
      return normaliseDesignIndex(Number(ratingOrValue.actualPoints) / 10);
    }
    return null;
  }
  return normaliseDesignIndex(ratingOrValue);
}

/**
 * Phrasing that is allowed in the Technical Report. Every entry is non-percentage
 * and names the index as internal or technical.
 */
export const TECHNICAL_DESIGN_INDEX_ALLOWED_SAMPLES = [
  'Design Index: 82',
  'Technical Design Index: 82',
  'Internal Design Index',
  'Design Index classification: Primary',
  'Used as an internal design diagnostic.',
];

/**
 * Phrasing that must never appear, in the Technical Report or anywhere else.
 * These are the approved failing samples for the copy guard.
 */
export const TECHNICAL_DESIGN_INDEX_FORBIDDEN_SAMPLES = [
  'Design Index: 82%',
  '82% (Primary)',
  'The design scored 82%',
  'Design Index percentage',
  'Client score',
  'Proposal score',
  'Performance percentage',
];

/**
 * Copy guard for the internal Design Index in technical and report copy.
 *
 * Fails when the index is expressed as a percentage, when it is called a client
 * or proposal score, or when a percentage sign is attached to it in any wording.
 *
 * @param {string} text
 * @returns {{ok: boolean, violations: Array<{sample: string, reason: string}>}}
 */
export function auditTechnicalDesignIndexCopy(text) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const violations = [];

  for (const sample of TECHNICAL_DESIGN_INDEX_FORBIDDEN_SAMPLES) {
    if (lower.includes(sample.toLowerCase())) {
      violations.push({
        sample,
        reason: 'the internal Design Index is never a percentage and never a client-facing score',
      });
    }
  }

  // Any percentage attached to the index, whatever the surrounding wording or
  // spacing: "Design Index 82%", "82 % index", "index 82 per cent". The worded
  // form requires a word boundary so the phrase "as a percentage" in guidance
  // copy is not mistaken for a percentage attached to the index.
  const indexNearPercent =
    /\bindex\b[^.\n]{0,24}(?:%|per ?cent\b)|(?:%|per ?cent\b)[^.\n]{0,24}\bindex\b/i;
  if (indexNearPercent.test(source)) {
    violations.push({
      sample: 'percentage attached to the Design Index',
      reason: 'no percentage sign may be attached to the internal Design Index',
    });
  }

  return { ok: violations.length === 0, violations };
}