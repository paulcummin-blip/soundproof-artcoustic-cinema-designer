/**
 * adiRejectionDiagnostics.js (shared)
 * -----------------------------------
 * WHAT A REFUSED REWRITE IS READ WITH — observability only.
 *
 * A refused rewrite is a ZERO-WRITE outcome: the original copy stands, and nothing
 * about the refusal is stored on the section, on the report snapshot or anywhere
 * else in the project. That is exactly what made a refusal undiagnosable. This
 * module assembles the refusal into one shape, returned in the response to the
 * button that asked for it, so the copy that was refused, the stage that refused it
 * and the facts each violation was read from can be inspected while the refusal is
 * still on screen.
 *
 * IT DECIDES NOTHING. Every rule and every refusal is decided by the modules that
 * already decide it — the meaning-conservation gate, the product grounding and the
 * surface's own validator. This reads their own results and states them uniformly.
 * No rule is added, relaxed, reordered or re-run here, and nothing here is stored.
 *
 * Pure: no React, no SDK, no writes, no runtime-specific APIs.
 */

/** The stage that refused a rewrite. */
export const ADI_REJECTION_STAGE = Object.freeze({
  /** The meaning-conservation gate: the rewrite said something the original did not. */
  MEANING_CONSERVATION: 'meaning_conservation',
  /** The version's product grounding: the rewrite named equipment the design does not specify. */
  PRODUCT_GROUNDING: 'product_grounding',
  /** The surface's own validator, run again on the improved copy. */
  ORIGINAL_SURFACE_VALIDATOR: 'original_surface_validator',
  /** The highlighted text was put back wrongly: the copy outside it changed. */
  SELECTION_CONSERVATION: 'selection_conservation',
});

/** A value as a reader can see it, or null where there is nothing to state. */
function text(value) {
  if (value === null || value === undefined) return null;
  const stated = Array.isArray(value) ? value.join(', ') : String(value);
  return stated.length > 0 ? stated : null;
}

/**
 * One violation in the uniform shape.
 *
 * A violation that already carries the fields — the conservation gate's own — is
 * read as it stands. A validator's own violation (a code, a section, a detail and,
 * where it was read, the sentence, the clause and the matched text) is stated in the
 * same shape, and nothing is invented for the parts it does not carry.
 *
 * @param {Object} entry — a violation exactly as the deciding module reported it
 * @returns {Object} rule, category, the two values, the two excerpts and an explanation
 */
export function normaliseDiagnosticViolation(entry = {}) {
  const code = text(entry.rule) || text(entry.rule_id) || text(entry.code);
  const detail = text(entry.detail);
  const section = text(entry.section);

  return {
    rule: code,
    category: text(entry.category) || (section ? `surface validator · ${section}` : 'surface validator'),
    originalValue: text(entry.originalValue),
    proposedValue: text(entry.proposedValue) || text(entry.matched_substring),
    originalExcerpt: text(entry.originalExcerpt),
    proposedExcerpt: text(entry.proposedExcerpt) || text(entry.sentence) || text(entry.clause),
    explanation: text(entry.explanation) || detail || code,
    // The validator's own remainder, carried verbatim rather than summarised.
    detail,
    code,
    section,
    citedClaimIds: Array.isArray(entry.cited_claim_ids) ? entry.cited_claim_ids : [],
  };
}

/**
 * The diagnostic one refusal is read with.
 *
 * @param {Object} input
 * @param {string} [input.originalText] — the copy as it stood, the grounded authority
 * @param {string|null} [input.proposedText] — the copy that was refused, where one arrived
 * @param {string|null} [input.stage] — the stage that refused it, from ADI_REJECTION_STAGE
 * @param {Array} [input.violations] — the deciding module's own violations, verbatim
 * @returns {{ originalText: string|null, proposedText: string|null, rejectionStage: string|null, violations: Array }}
 */
export function buildAdiRejectionDiagnostics({
  originalText = '',
  proposedText = null,
  stage = null,
  violations = [],
} = {}) {
  return {
    originalText: text(originalText),
    proposedText: text(proposedText),
    rejectionStage: stage || null,
    violations: (Array.isArray(violations) ? violations : []).map(normaliseDiagnosticViolation),
  };
}

export default buildAdiRejectionDiagnostics;