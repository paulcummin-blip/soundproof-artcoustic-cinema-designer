/**
 * writerBriefReasoning.js (shared)
 * --------------------------------
 * WHAT A REQUEST FOR REASONING IS, AND WHAT COUNTS AS ANSWERING IT.
 *
 * A brief asks for two different things and they are not interchangeable. "Explain
 * the 9.1.6 system layout" asks for a subject to be described, and a statement of
 * the layout describes it. "Explain the overhead speaker spacing logic" asks for
 * the reasoning behind a decision, and a statement of the figure does not answer
 * it: "Overhead speaker spacing is 66.5°" reports the result and never explains the
 * decision, so it is not a complete answer.
 *
 * So two vocabularies live here, and nothing else:
 *
 *   REASONING_REQUEST  the items that ask WHY or HOW a decision was made — the
 *                      logic, the reason, the rationale, the choice, the cause;
 *   REASON_STATED      the justification clause of a sentence — a stated basis,
 *                      purpose or constraint. A sentence carrying one of these says
 *                      why the design is as it is; one carrying only figures and
 *                      specification words states what it is and not why.
 *
 * Pure: no React, no SDK, no writes. It reads text and answers questions about it.
 */

/**
 * A request that asks for the REASONING behind a decision rather than for a subject
 * to be described: why something is where it is, how it was decided, what the logic
 * of a choice was. Reporting a result does not answer one of these.
 */
const REASONING_REQUEST = /\b(?:why|how|reason(?:s|ing)?|rationale|logic|justif\w*|decision|decisions|decided|chosen|choice|selected|intent(?:ion)?|because|due to|owing to|as a result of|resulting from|caused by|limited by|restricted by|compromis\w*|outside (?:their|its|the) ideal|out of position|not ideal)\b/i;

/**
 * The justification clause of a sentence: a stated basis, purpose or constraint.
 * A sentence carrying one of these says why the design is as it is; one carrying
 * only figures and specification words states what it is and not why.
 */
const REASON_STATED = /\b(?:because|since|so that|in order to|which is why|that is why|the reason|as a result|due to|owing to|limited by|constrained by|dictated by|driven by|governed by|required by|set by|set to|to ensure|to keep|to give|to provide|to retain|to support|to avoid|to maintain|to allow|to reduce|to protect|to preserve|to achieve|to reflect|to accommodate|to respect|intended to|means that|reflects the|reflect the|chosen for|selected for|chosen to|selected to|was chosen|were chosen|was selected|were selected|balances?|trade-?off|constraint|compromise|practical geometry|outside their ideal|outside its ideal|deliberately|purposefully)\b/i;

/** The sentences of a text, so a clause is read in its own sentence and not across one. */
export function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Whether a brief item asks for the reasoning behind a decision. */
export function asksForReasoning(item) {
  return REASONING_REQUEST.test(String(item || ''));
}

/** Whether a sentence states the reasoning, rather than reporting a figure. */
export function statesReasoning(passage) {
  return REASON_STATED.test(String(passage || ''));
}

/**
 * Whether a source documents a reason for ONE request's own subject. The reason, the
 * subject and the matter the request itself names must stand in the SAME sentence: a
 * reason about something else never documents this request, and a recorded decision
 * about the overhead SPEAKERS does not explain the overhead SPACING. Where nothing
 * states the matter the request asks about, no rationale is established.
 */
export function groundedReason({ text, subjectPatterns = [], contentTerms = [] } = {}) {
  for (const clause of sentences(text)) {
    if (!REASON_STATED.test(clause)) continue;
    const reachesSubject = subjectPatterns.some((pattern) => pattern.test(clause));
    const statesMatter = contentTerms.length === 0
      || contentTerms.some((term) => clause.toLowerCase().includes(term));
    if (reachesSubject && statesMatter) return true;
  }
  return false;
}

export default groundedReason;