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
  NEW_EXPERIENTIAL_CLAIM: 'a_new_experiential_claim_was_added',
  NEW_ROOM_USE_CLAIM: 'a_new_room_use_was_added',
  NEW_DESIGN_RATIONALE: 'a_new_design_rationale_was_added',
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
const LIMITATION = /\b(?:not|never|cannot|can't|isn't|aren't|doesn't|don't|won't|without|lacks?|lacking|limits?|limiting|limited|only|up to|at most|remains?|requires? (?:attention|work)|to be (?:addressed|confirmed)|assum\w*|estimat\w*|approximately|about)\b/gi;

/** Every limitation word a text states, lowercased, so a refusal can name the ones that went. */
function limitationWords(value) {
  const found = String(value || '').match(new RegExp(LIMITATION.source, LIMITATION.flags)) || [];
  return found.map((word) => word.toLowerCase());
}

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

/**
 * The claim types one text makes, read sentence by sentence — the sentence each
 * one was read from is kept, so a refusal can quote the copy that carried it.
 */
function claimTypeSentences(text) {
  const types = new Map();
  for (const sentence of sentenceParts(text)) {
    const note = (label) => { if (!types.has(label)) types.set(label, sentence); };
    const kind = assertionKind(sentence);
    if (kind === 'gain') note(CLAIM_TYPE.GAIN);
    if (kind === 'change') note(CLAIM_TYPE.CHANGE);
    if (kind === 'same') note(CLAIM_TYPE.SAME);
    if (kind === 'result') note(CLAIM_TYPE.RESULT);
    if (isRecommendation(sentence)) note(CLAIM_TYPE.RECOMMENDATION);
    if (seatConsistencyClaim(sentence)) note(CLAIM_TYPE.CONSISTENCY);
  }
  return types;
}

/** The claim types one text makes. */
function claimTypes(text) {
  return new Set(claimTypeSentences(text).keys());
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

/**
 * Meaning that can be added without adding a protected figure or one of the
 * writer vocabulary's structural claim types. These are semantic families, not
 * fixed phrases: a source may be paraphrased freely inside a family it already
 * expresses, but a rewrite may not introduce a family the source never carried.
 */
const SEMANTIC_CLAIM = Object.freeze([
  {
    key: 'experiential_view',
    code: ADI_CONSERVATION_REJECTION.NEW_EXPERIENTIAL_CLAIM,
    category: 'experiential claim',
    explanation: 'The rewritten copy adds a benefit about the viewing experience or sightlines that the source copy never states.',
    patterns: [
      /\b(?:involving|immersive|engaging|compelling)\s+(?:view|viewing|picture|experience)\b/i,
      /\b(?:improv\w*|better|clear(?:er)?)\s+(?:the\s+)?(?:view|viewing|sightlines?)\b/i,
      /\b(?:view|picture)\b[^.]{0,48}\bfeels?\s+(?:close|involving|immersive|engaging)\b/i,
    ],
  },
  {
    key: 'room_use',
    code: ADI_CONSERVATION_REJECTION.NEW_ROOM_USE_CLAIM,
    category: 'room use',
    explanation: 'The rewritten copy assigns a use or audience purpose to the room that the source copy never states.',
    patterns: [
      /\b(?:shared|family|social|multi[- ]?purpose)\s+(?:use|room|cinema|space)\b/i,
      /\b(?:use|used)\s+(?:by|for)\s+(?:the\s+)?(?:family|friends|guests)\b/i,
    ],
  },
  {
    key: 'design_rationale',
    code: ADI_CONSERVATION_REJECTION.NEW_DESIGN_RATIONALE,
    category: 'design rationale',
    explanation: 'The rewritten copy adds an engineering or design rationale that the source copy never states.',
    patterns: [
      /\b(?:established|recognised|proven|standard|accepted)\s+(?:design\s+)?approach\b/i,
      /\b(?:manage|manages|managing|control|controls|controlling|smooth|smooths|smoothing|reduce|reduces|reducing)\b[^.]{0,80}\b(?:room modes?|bass behaviour|low[- ]frequency (?:behaviour|variation|resonances?))\b/i,
    ],
  },
]);

function semanticClaimSentences(text) {
  const claims = new Map();
  for (const sentence of sentenceParts(text)) {
    for (const claim of SEMANTIC_CLAIM) {
      if (!claims.has(claim.key) && claim.patterns.some((pattern) => pattern.test(sentence))) {
        claims.set(claim.key, { claim, sentence });
      }
    }
  }
  return claims;
}

/**
 * The sentence of a text that carries a token, so a refusal can quote the copy it
 * was read from. Presentation of the same refusal, never part of the decision.
 */
function excerptFor(text, token) {
  const needle = String(token || '').toLowerCase();
  if (needle.length === 0) return null;
  const wholeWord = /^[a-z]+$/.test(needle) ? new RegExp(`\\b${needle}\\b`, 'i') : null;
  const sentences = sentenceParts(text);
  const carrying = sentences.find((sentence) => (wholeWord
    ? wholeWord.test(sentence)
    : sentence.toLowerCase().includes(needle)));
  if (carrying) return carrying;
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > 0 ? flat.slice(0, 240) : null;
}

/**
 * One refusal: the code the workflow acts on, and — for diagnosis alone — the
 * exact category, values and excerpts it was read from.
 *
 * The extra fields never take part in the decision: a rewrite is refused because
 * a violation exists at all, and the code and the detail are exactly what they
 * have always been. They exist so a refusal can be read afterwards without
 * re-running the provider, and they are never stored on a record.
 */
function violation(code, detail, facts = {}) {
  return {
    code,
    detail,
    category: facts.category || null,
    rule: code,
    originalValue: facts.originalValue ?? null,
    proposedValue: facts.proposedValue ?? null,
    originalExcerpt: facts.originalExcerpt ?? null,
    proposedExcerpt: facts.proposedExcerpt ?? null,
    explanation: facts.explanation || null,
  };
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
    violations.push(violation(ADI_CONSERVATION_REJECTION.ADDED_NUMBER, `added:${token}`, {
      category: 'figure',
      proposedValue: token,
      proposedExcerpt: excerptFor(after, token),
      explanation: `The rewritten copy states the figure ${token}, which the copy it came from does not.`,
    }));
  }
  for (const token of numbers.dropped) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.DROPPED_NUMBER, `dropped:${token}`, {
      category: 'figure',
      originalValue: token,
      originalExcerpt: excerptFor(before, token),
      explanation: `The figure ${token} stated by the original copy is not in the rewritten copy.`,
    }));
  }

  const levels = difference(levelTokens(before), levelTokens(after));
  for (const token of levels.added) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.ADDED_LEVEL, `added:${token}`, {
      category: 'performance level',
      proposedValue: token,
      proposedExcerpt: excerptFor(after, token),
      explanation: `The rewritten copy states Performance Level ${token}, which the original copy does not.`,
    }));
  }
  for (const token of levels.dropped) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.DROPPED_LEVEL, `dropped:${token}`, {
      category: 'performance level',
      originalValue: token,
      originalExcerpt: excerptFor(before, token),
      explanation: `Performance Level ${token} stated by the original copy is not in the rewritten copy.`,
    }));
  }

  const parameters = difference(parameterIds(before), parameterIds(after));
  for (const token of parameters.added) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.ADDED_PARAMETER, `added:P${token}`, {
      category: 'parameter',
      proposedValue: `P${token}`,
      proposedExcerpt: excerptFor(after, `P${token}`),
      explanation: `The rewritten copy names parameter P${token}, which the original copy does not.`,
    }));
  }
  for (const token of parameters.dropped) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.DROPPED_PARAMETER, `dropped:P${token}`, {
      category: 'parameter',
      originalValue: `P${token}`,
      originalExcerpt: excerptFor(before, `P${token}`),
      explanation: `The parameter P${token} named by the original copy is not named by the rewritten copy.`,
    }));
  }

  // ── Equipment: the products and the quantities named ────────────────────
  const products = difference(
    modelTokens(before).filter(isProductToken),
    modelTokens(after).filter(isProductToken),
  );
  for (const token of products.added) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.ADDED_PRODUCT, `added:${token}`, {
      category: 'equipment',
      proposedValue: token,
      proposedExcerpt: excerptFor(after, token),
      explanation: `The rewritten copy names equipment the original copy never named.`,
    }));
  }
  for (const token of products.dropped) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.DROPPED_PRODUCT, `dropped:${token}`, {
      category: 'equipment',
      originalValue: token,
      originalExcerpt: excerptFor(before, token),
      explanation: 'Equipment named by the original copy is not named by the rewritten copy.',
    }));
  }

  // ── Scope: never widened, and never one the original did not name ───────
  const scopes = difference(scopeTokens(before), scopeTokens(after));
  for (const token of scopes.added) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.WIDENED_SCOPE, `added:${token}`, {
      category: 'seat scope',
      proposedValue: token,
      proposedExcerpt: excerptFor(after, token),
      explanation: 'The rewritten copy states a seat scope the original copy never named.',
    }));
  }
  for (const token of scopes.dropped) {
    violations.push(violation(ADI_CONSERVATION_REJECTION.WIDENED_SCOPE, `dropped:${token}`, {
      category: 'seat scope',
      originalValue: token,
      originalExcerpt: excerptFor(before, token),
      explanation: 'A seat scope the original copy named is no longer stated in the rewritten copy.',
    }));
  }

  // ── A material limitation is never removed ──────────────────────────────
  const limitationsBefore = matchCount(before, LIMITATION);
  const limitationsAfter = matchCount(after, LIMITATION);
  if (limitationsAfter < limitationsBefore) {
    const gone = difference(limitationWords(before), limitationWords(after)).dropped;
    violations.push(violation(
      ADI_CONSERVATION_REJECTION.REMOVED_LIMITATION,
      `${limitationsBefore}->${limitationsAfter}`,
      {
        category: 'limitation',
        originalValue: gone.length > 0 ? gone.join(', ') : limitationsBefore,
        proposedValue: limitationsAfter,
        originalExcerpt: gone.map((word) => excerptFor(before, word)).filter(Boolean)[0] || null,
        explanation: 'A limitation, caveat or assumption the original copy stated is not in the rewritten copy.',
      },
    ));
  }

  // ── A reason is never invented ──────────────────────────────────────────
  const reasonsBefore = rationaleWords(before);
  for (const word of rationaleWords(after)) {
    if (!reasonsBefore.has(word)) {
      violations.push(violation(ADI_CONSERVATION_REJECTION.INVENTED_REASON, `added:${word}`, {
        category: 'reason',
        proposedValue: word,
        proposedExcerpt: excerptFor(after, word),
        explanation: 'The rewritten copy gives a reason, with a connector the original copy never used.',
      }));
    }
  }

  // ── Plausible benefits and explanations are still new meaning ───────────
  // These phrases were previously invisible because they add no protected
  // figure, product, seat scope or recognised structural claim, and because
  // noun-phrase rationales need no connector such as “because” or “to ensure”.
  const semanticBefore = semanticClaimSentences(before);
  const semanticAfter = semanticClaimSentences(after);
  for (const [key, found] of semanticAfter.entries()) {
    if (!semanticBefore.has(key)) {
      violations.push(violation(found.claim.code, `added:${key}`, {
        category: found.claim.category,
        proposedValue: key,
        proposedExcerpt: found.sentence,
        explanation: found.claim.explanation,
      }));
    }
  }

  // ── A claim the original never made is never added ──────────────────────
  const claimsBefore = claimTypes(before);
  const claimsAfter = claimTypeSentences(after);
  for (const claim of claimsAfter.keys()) {
    if (!claimsBefore.has(claim)) {
      violations.push(violation(ADI_CONSERVATION_REJECTION.NEW_CLAIM, `added:${claim}`, {
        category: 'claim',
        proposedValue: claim,
        proposedExcerpt: claimsAfter.get(claim) || null,
        explanation: `The rewritten copy makes ${claim}, which the original copy never made.`,
      }));
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