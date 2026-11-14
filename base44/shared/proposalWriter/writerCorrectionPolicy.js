/**
 * writerCorrectionPolicy.js (shared)
 * -----------------------------------
 * THE BOUNDED WORDING-CORRECTION GATE.
 *
 * One safe, bounded automatic correction attempt is made when, and only when,
 * every rejection a draft received is a purely lexical or stylistic violation:
 * wording the writer can rephrase without touching a claim, a figure, a level,
 * a product, a scope, a citation or a piece of engineering evidence.
 *
 * This module owns the allowlist and the single decision: is this set of
 * violations eligible for an automatic wording correction? It never weakens,
 * disables or bypasses the validator — the corrected draft is validated by the
 * same complete validator as the initial draft, and a correction that fails is
 * reported, never silently accepted.
 *
 * The allowlist starts with the natural-writing wording-only rejections: the
 * generic marketing phrase, the em dash, the stock connective, the repeated
 * mechanical opener, the software-report register and the validation register.
 * Each is purely about how the copy reads and carries no engineering content.
 * Engineering, numerical, product, scope, citation, grounding and evidence
 * rejections are deliberately absent: a draft that broke one of those is never
 * handed back to the writer for an automatic fix, because the fix could change
 * an engineering fact rather than a sentence.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { WRITER_REJECTION } from './writerContractSchema.js';

/**
 * The rejections that are purely lexical or stylistic and may be corrected
 * automatically. A draft is eligible only when every rejection it received is
 * in this list.
 *
 * Each of these is a wording-only check:
 *   - GENERIC_MARKETING_PHRASE: a generic phrase matched in the copy;
 *   - EM_DASH_IN_NARRATIVE: an em dash character in the copy;
 *   - STOCK_CONNECTIVE: a forbidden connective at the head of a sentence;
 *   - REPETITIVE_PARAGRAPH_OPENER: the same mechanical opener repeated;
 *   - REPORT_VOICE: the software-report register;
 *   - VALIDATION_REGISTER: client copy defending its own claim.
 *
 * None of these touches a claim ID, a figure, a Performance Level, a product, a
 * scope, a citation or an engineering result, so correcting the wording cannot
 * alter an engineering fact. The corrected draft is still validated by the
 * complete validator, so a correction that introduces an engineering violation
 * is refused, never accepted.
 */
export const WORDING_CORRECTION_ELIGIBLE_REJECTIONS = Object.freeze([
  WRITER_REJECTION.GENERIC_MARKETING_PHRASE,
  WRITER_REJECTION.EM_DASH_IN_NARRATIVE,
  WRITER_REJECTION.STOCK_CONNECTIVE,
  WRITER_REJECTION.REPETITIVE_PARAGRAPH_OPENER,
  WRITER_REJECTION.REPORT_VOICE,
  WRITER_REJECTION.VALIDATION_REGISTER,
]);

/** The reason recorded when a correction is attempted. */
export const WORDING_CORRECTION_REASON = 'wording_only_violations';

/**
 * Whether a set of violations is eligible for one bounded wording correction.
 *
 * Eligible when:
 *   - there is at least one violation (a valid draft needs no correction);
 *   - every violation's code is in the wording-only allowlist.
 *
 * A single engineering, numerical, product, scope, citation, grounding or
 * evidence rejection makes the whole set ineligible: the draft is left for the
 * existing validation-failed / needs-human-review path, never handed to the
 * writer for an automatic fix that could change an engineering fact.
 *
 * @param {Array<{code: string}>} violations
 * @returns {{ eligible: boolean, reason: string|null, eligible_rule_ids: Array<string> }}
 */
export function isEligibleForWordingCorrection(violations = []) {
  const list = Array.isArray(violations) ? violations : [];
  if (list.length === 0) {
    return { eligible: false, reason: null, eligible_rule_ids: [] };
  }

  // Every reported failure must belong to the allowlist. A violation with no
  // code, or a code that is not a string, is a reported failure that does not
  // belong to the allowlist, so the whole set is ineligible: the draft is left
  // for the existing validation-failed / needs-human-review path.
  const eligible = list.every((entry) => {
    const code = entry?.code;
    return typeof code === 'string'
      && code.length > 0
      && WORDING_CORRECTION_ELIGIBLE_REJECTIONS.includes(code);
  });

  if (!eligible) {
    return { eligible: false, reason: null, eligible_rule_ids: [] };
  }

  const codes = list
    .map((entry) => entry?.code)
    .filter((code) => typeof code === 'string' && code.length > 0);

  return {
    eligible: true,
    reason: WORDING_CORRECTION_REASON,
    eligible_rule_ids: [...new Set(codes)],
  };
}

export default isEligibleForWordingCorrection;