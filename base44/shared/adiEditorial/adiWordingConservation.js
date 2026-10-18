/**
 * adiWordingConservation.js (shared)
 * ----------------------------------
 * THE MEANING-CONSERVATION GATE an editorial pass has to pass.
 *
 * An editorial pass may improve the wording of meaning that is ALREADY
 * SUPPORTED. This module is the mechanical half of that rule: it reads the copy
 * as it stands and the copy ADI proposes, and it reports every way the proposed
 * version says something the original did not.
 *
 * It is deliberately a comparison of two texts rather than a second evidence
 * reader. The original copy is the grounded authority — it was written from the
 * frozen evidence and it passed validation — so a rewrite that carries the same
 * numbers, levels, scope words, products, limitations and claim types carries the
 * same meaning. What this gate catches:
 *
 *   - a figure, a level, a parameter number or a quantity that was ADDED;
 *   - a figure, a level, a product or a quantity that was DROPPED;
 *   - a seating scope that was widened, or one the original never named;
 *   - a material limitation that was removed;
 *   - a reason (because, so that, to ensure…) the original never gave;
 *   - a kind of claim — a gain, a change, a recommendation, a consistency claim —
 *     the original never made.
 *
 * A number word is read as the number it states, so "eight seats" and "8 seats"
 * are the same fact and a rewrite between them is not a change.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { approvalPlainText } from '../proposalApproval/sectionApprovalAuthority.js';
import { seatConsistencyClaim } from '../proposalWriter/writerOutputTextRules.js';
import {
  assertionKind,
  isProductToken,
  isRecommendation,
  levelTokens,
  measurementTokens,
  modelTokens,
  parameterIds,
  seatScopeInText,
  sentenceParts,
} from '../proposalWriter/writerVocabulary.js';

/** Why a proposed rewrite was refused. Internal codes: the workflow never shows them. */
export const ADI_CONSERVATION_REJECTION = Object.freeze({
  EMPTY: 'proposed_copy_is_empty',
  ADDED_NUMBER: 'a_number_was_added',
  DROPPED_NUMBER: 'a_number_was_dropped',
  ADDED_LEVEL: 'a_performance_level_was_added',
  DROPPED_LEVEL: 'a_performance_level_was_dropped',
  ADDED_PARAMETER: 'a_parameter_was_added',
  DROPPED_PARAMETER: 'a_parameter_was_dropped',
  ADDED_PRODUCT: 'equipment_was_added',
  DROPPED_PRODUCT: 'equipment_was_dropped',
  WIDENED_SCOPE: 'scope_was_changed',
  REMOVED_LIMITATION: 'a_material_limitation_was_removed',
  INVENTED_REASON: 'a_reason_was_invented',
  NEW_CLAIM: 'a_claim_the_original_never_made_was_added',
  SELECTION_NOT_CONSERVED: 'the_copy_outside_the_selection_changed',
});

/** The number words a rewrite may legitimately swap for digits, and back. */
const NUMBER_WORDS = Object.freeze({
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
});

const NUMBER_WORD_PATTERN = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi');
const DIGITS = /\d+(?:\.\d+)?/g;

/**
 * Every number a string states, as digits. A number word is read as the number it
 * states, and a thousands separator is taken out, so "eight seats", "8 seats" and
 * "1,000 W" and "1000 W" all read as the same figure.
 */
export function numericTokens(value) {
  const text = String(value || '')
    .replace(NUMBER_WORD_PATTERN, (word) => String(NUMBER_WORDS[word.toLowerCase()]))
    .replace(/(\d),(\d)/g, '$1$2');
  const found = text.match(DIGITS) || [];
  return found.map((token) => token.replace(/\.$/, ''));
}

/** The words that state a limitation, a caveat or an assumption. */
const LIMITATION = /\b(?:not|never|cannot|can't|isn't|aren't|doesn't|don't|won't|without|lacks?|lacking|limited|only|up to|at most|remains?|requires? (?:attention|work)|to be (?:addressed|confirmed)|assum\w*|estimat\w*|approximately|about)\b/gi;

/** The connectors a reason is written with. */
const RATIONALE = /\b(?:because|so that|in order to|to ensure|which means|that is why|therefore|designed to)\b/gi;

/** The claim types an editorial pass may never add. */
const CLAIM_TYPE = Object.freeze({
  GAIN: 'a claim of a gain or an improvement',
  CHANGE: 'a claim of a change',
  SAME: 'a claim of an identical result',
  RESULT: 'a claim of an achieved result',
  RECOMMENDATION: 'a recommendation',
  CONSISTENCY: 'a claim of seat-to-seat consistency',
});

/** A multiset of the matches a pattern makes in a string. */
function matchCount(value, pattern) {
  const found = String(value || '').match(new RegExp(pattern.source, pattern.flags)) || [];
  return found.length;
}

/** A multiset of tokens, so "two 30 Hz figures" and one are not the same. */
function multiset(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

/** Every token the proposed copy added, and every one it dropped. */
function difference(original, proposed) {
  const before = multiset(original);
  const after = multiset(proposed);
  const added = [];
  const dropped = [];
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const key of keys) {
    const was = before.get(key) || 0;
    const now = after.get(key) || 0;
    if (now > was) added.push(key);
    if (now < was) dropped.push(key);
  }
  return { added, dropped };
}

/** The claim types one text makes, read sentence by sentence. */
function claimTypes(text) {
  const types = new Set();
  for (const sentence of sentenceParts(text)) {
    const kind = assertionKind(sentence);
    if (kind === 'gain') types.add(CLAIM_TYPE.GAIN);
    if (kind === 'change') types.add(CLAIM_TYPE.CHANGE);
    if (kind === 'same') types.add(CLAIM_TYPE.SAME);
    if (kind === 'result') types.add(CLAIM_TYPE.RESULT);
    if (isRecommendation(sentence)) types.add(CLAIM_TYPE.RECOMMENDATION);
    if (seatConsistencyClaim(sentence)) types.add(CLAIM_TYPE.CONSISTENCY);
  }
  return types;
}

/** The seating scopes a text names, as a multiset. */
function scopeTokens(text) {
  return sentenceParts(text).map((sentence) => seatScopeInText(sentence)).filter(Boolean);
}

/** The reason connectors a text uses, as a set. */
function rationaleWords(text) {
  const found = String(text || '').match(RATIONALE) || [];
  return new Set(found.map((word) => word.toLowerCase()));
}

/** One refusal. */
function violation(code, detail) {
  return { code, detail };
}

/**
 * Read a proposed rewrite against the copy it came from.
 *
 * @param {Object} input
 * @param {string} input.original — the copy as it stands, the grounded authority
 * @param {string} input.improved — the wording ADI proposes
 * @returns {{ ok: boolean, violations: Array<{code: string, detail: string}> }}
 */
export function checkWordingConservation({ original = '', improved = '' } = {}) {
  const before = approvalPlainText(original);
  const after = approvalPlainText(improved);
  const violations = [];

  if (!after) return { ok: false, violations: [violation(ADI_CONSERVATION_REJECTION.EMPTY, 'no_proposed_copy')] };

  // ── Figures, levels, parameters and quantities ──────────────────────────
  const numbers = difference(numericTokens(before), numericTokens(after));
  for (const token of numbers.added) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.ADDED_NUMBER, `added:${token}`));
  }
  for (const token of numbers.dropped) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.DROPPED_NUMBER, `dropped:${token}`));
  }

  const levels = difference(levelTokens(before), levelTokens(after));
  for (const token of levels.added) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.ADDED_LEVEL, `added:${token}`));
  }
  for (const token of levels.dropped) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.DROPPED_LEVEL, `dropped:${token}`));
  }

  const parameters = difference(parameterIds(before), parameterIds(after));
  for (const token of parameters.added) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.ADDED_PARAMETER, `added:P${token}`));
  }
  for (const token of parameters.dropped) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.DROPPED_PARAMETER, `dropped:P${token}`));
  }

  // ── Equipment: the products and the quantities named ────────────────────
  const products = difference(
    modelTokens(before).filter(isProductToken),
    modelTokens(after).filter(isProductToken),
  );
  for (const token of products.added) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.ADDED_PRODUCT, `added:${token}`));
  }
  for (const token of products.dropped) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.DROPPED_PRODUCT, `dropped:${token}`));
  }

  // ── Scope: never widened, and never one the original did not name ───────
  const scopes = difference(scopeTokens(before), scopeTokens(after));
  for (const token of scopes.added) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.WIDENED_SCOPE, `added:${token}`));
  }
  for (const token of scopes.dropped) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.WIDENED_SCOPE, `dropped:${token}`));
  }

  // ── A material limitation is never removed ──────────────────────────────
  const limitationsBefore = matchCount(before, LIMITATION);
  const limitationsAfter = matchCount(after, LIMITATION);
  if (limitationsAfter < limitationsBefore) {
    violations.push(violation(
      ADI_CONSERVATION_REJECTION.REMOVED_LIMITATION,
      `${limitationsBefore}->${limitationsAfter}`,
    ));
  }

  // ── A reason is never invented ──────────────────────────────────────────
  const reasonsBefore = rationaleWords(before);
  for (const word of rationaleWords(after)) {
    if (!reasonsBefore.has(word)) {
      violations.push(violation(ADI_CONSERVATION_REJECTION.INVENTED_REASON, `added:${word}`));
    }
  }

  // ── A claim the original never made is never added ──────────────────────
  const claimsBefore = claimTypes(before);
  for (const claim of claimTypes(after)) {
    if (!claimsBefore.has(claim)) {
      violations.push(violation(ADI_CONSERVATION_REJECTION.NEW_CLAIM, `added:${claim}`));
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Plain text with its whitespace flattened, for a whole-copy comparison. */
function flat(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * THE SELECTION RULE, read mechanically: everything outside the highlighted text
 * is unchanged.
 *
 * The designer's selection is rewritten on its own, and the editor puts the
 * improved wording back into the copy in its place. This reads the two bodies and
 * proves that the only difference between them is that one replacement: the copy
 * as it was, with exactly one occurrence of the selected text replaced by the
 * improved text, has to read the same as the body on screen.
 *
 * @param {Object} input
 * @param {string} input.originalBody — the section's copy before the edit
 * @param {string} input.improvedBody — the section's copy after the editor spliced it
 * @param {string} input.selectionText — exactly what the designer highlighted
 * @param {string} input.improvedSelection — exactly what ADI returned for it
 * @returns {{ ok: boolean, violations: Array<{code: string, detail: string}> }}
 */
export function checkSelectionSpliceConservation({
  originalBody = '',
  improvedBody = '',
  selectionText = '',
  improvedSelection = '',
} = {}) {
  const before = flat(approvalPlainText(originalBody));
  const after = flat(approvalPlainText(improvedBody));
  const selected = flat(approvalPlainText(selectionText));
  const replacement = flat(approvalPlainText(improvedSelection));

  const at = before.indexOf(selected);
  const onlyOnce = at >= 0 && before.indexOf(selected, at + selected.length) < 0;
  const expected = onlyOnce
    ? flat(`${before.slice(0, at)}${replacement}${before.slice(at + selected.length)}`)
    : '';

  if (!onlyOnce || expected !== after) {
    return {
      ok: false,
      violations: [violation(
        ADI_CONSERVATION_REJECTION.SELECTION_NOT_CONSERVED,
        onlyOnce ? 'the_copy_outside_the_selection_changed' : 'the_selected_copy_was_not_found_once',
      )],
    };
  }

  return { ok: true, violations: [] };
}

export default checkWordingConservation;