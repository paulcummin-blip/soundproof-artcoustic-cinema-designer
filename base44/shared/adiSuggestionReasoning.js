/**
 * adiSuggestionReasoning.js (shared)
 * -----------------------------------
 * WHAT ADI MAY SUGGEST THE PROPOSAL EXPLAINS.
 *
 * A suggestion may ask the report to explain a design DECISION only where that
 * decision's reasoning is recorded. Where only the calculated result exists, the
 * suggestion asks the report to explain the result and what it means for the room:
 * ADI never implies Sound Proof knows why a speaker, seat, subwoofer position or
 * spacing was chosen when that reasoning is on no record.
 *
 * The reasoning is read from the same material the Client Brief audit reads it from:
 * the recorded interpretation, and the designer's own words in the brief and notes.
 * What a suggestion asks about is
 * read from its own words: the subject it names (the overheads, the subwoofers, the
 * seats) and the MATTER it asks to be explained (the spacing, the arrangement, the
 * positions, the count). A reason documents the suggestion only when it names both, so
 * a recorded decision about which overhead SPEAKER was chosen never documents a
 * decision about the overhead SPACING — which is exactly what keeps an invented design
 * reason out of the report.
 *
 * So, for every candidate suggestion:
 *
 *   asks nothing about a decision        → suggested as it is;
 *   asks about a decision whose reasoning
 *   is recorded                          → suggested as it is;
 *   asks about an unrecorded decision in
 *   a known design area with a calculated
 *   result to offer instead              → rewritten to that result-and-significance
 *                                          example;
 *   asks about an unrecorded decision in
 *   no known area                        → dropped, never shown.
 *
 * Where an important decision has no recorded reasoning, ADI may also offer the
 * designer a short optional question about it. The question is an offer and never a
 * requirement: nothing blocks generating a proposal, and no answer is assumed.
 *
 * Pure: no React, no SDK, no writes.
 */

import { asksForReasoning, groundedReason } from './proposalWriter/writerBriefReasoning.js';

/**
 * The example ADI offers for the overhead arrangement when the reason for the spacing
 * is not recorded: the result and what it means for the room, never why it was chosen.
 */
export const OVERHEAD_ARRANGEMENT_CHIP = 'Explain the overhead loudspeaker arrangement and what its assessed spacing means for this room';

/** Instruction and connector words: part of asking, never part of what is asked about. */
const CHIP_STOPWORDS = new Set([
  'explain', 'explains', 'explaining', 'highlight', 'emphasise', 'emphasize', 'mention',
  'show', 'suggest', 'discuss', 'note', 'because', 'chosen', 'chose', 'choice', 'decided',
  'decision', 'decisions', 'reason', 'reasons', 'reasoning', 'rationale', 'logic', 'with',
  'that', 'this', 'these', 'those', 'from', 'into', 'their', 'there', 'them', 'they', 'when',
  'what', 'which', 'while', 'where', 'have', 'has', 'had', 'been', 'being', 'also', 'only',
  'just', 'more', 'less', 'very', 'make', 'made', 'give', 'given', 'need', 'needs', 'want',
  'keep', 'ensure', 'used', 'using', 'about', 'across', 'every', 'each', 'both', 'some',
  'any', 'all', 'and', 'for', 'the', 'was', 'were', 'are', 'does', 'did', 'not', 'would',
  'could', 'should', 'will', 'shall', 'must', 'can', 'may', 'might', 'who', 'whom', 'whose',
  'our', 'your', 'his', 'her', 'its', 'one', 'also', 'than', 'then', 'its',
]);

/**
 * The words that name the SUBJECT of a suggestion. They appear wherever the subject is
 * mentioned, so they never evidence a decision's reasoning. Every other word the
 * suggestion uses is matter — including the decision words a reason has to name, which
 * is what stops a recorded speaker choice from documenting a spacing decision.
 */
const SUBJECT_WORDS = new Set([
  'overhead', 'overheads', 'height', 'ceiling', 'speaker', 'speakers', 'loudspeaker',
  'loudspeakers', 'lcr', 'front', 'stage', 'screen', 'channel', 'channels', 'subwoofer',
  'subwoofers', 'sub', 'subs', 'bass', 'seat', 'seats', 'seating', 'row', 'rows', 'room',
  'cinema', 'system', 'systems', 'sound', 'audio', 'design', 'acoustic', 'acoustics',
  'theatre', 'tv', 'display', 'projector', 'picture', 'image', 'angle', 'angles', 'level',
  'levels', 'result', 'results', 'value', 'values', 'performance', 'quality', 'capability',
  'content', 'impact', 'depth', 'weight', 'scale', 'immersion', 'assessment', 'assessed',
  'consideration', 'considerations', 'decision', 'decisions', 'treatment', 'panel', 'panels',
  'tonal', 'tonally', 'timbre', 'frequency', 'frequencies', 'viewing', 'range', 'output',
  'extension', 'response', 'geometry', 'layout', 'configuration', 'zone', 'zones', 'area',
  'areas',
]);

/**
 * The design areas ADI recognises. The area decides what a suggestion is about, the
 * result example to offer instead when the reasoning is not recorded, the matter that
 * documents that area's own decision, and the optional question ADI may put to the
 * designer.
 */
const DESIGN_AREAS = Object.freeze([
  {
    key: 'overheads',
    naming: /\boverhead|loudspeaker arrangement|height\s+(?:channel|speaker)|ceiling/i,
    subjectPatterns: [/\boverhead|height\s+(?:channel|speaker)/i],
    // A reason for the overhead SPACING is only documented by material that states the
    // spacing: a decision about which overhead speaker to use is a different decision.
    documentedTerms: ['spacing'],
    resultPresent: (facts) => Boolean(facts?.parameters?.p9),
    resultChip: (facts) => (facts?.parameters?.p9 ? OVERHEAD_ARRANGEMENT_CHIP : null),
    clarification: 'Was the overhead arrangement influenced by the seating positions, ceiling layout or aesthetics?',
  },
  {
    key: 'subwoofers',
    naming: /\bsubwoofers?\b|\bsubs\b|bass\s+(?:layout|configuration|strategy)/i,
    subjectPatterns: [/\bsubwoofers?\b|\bsubs\b/i],
    documentedTerms: ['consistency', 'placement', 'count', 'strategy', 'symmetry', 'position'],
    resultPresent: (facts) => Number.isFinite(facts?.subwoofers?.totalSubwooferCount)
      && facts.subwoofers.totalSubwooferCount > 0,
    resultChip: () => null,
    clarification: 'Was the subwoofer count and placement chosen for consistency across the seats, or for another reason?',
  },
  {
    key: 'speakers',
    naming: /\bspeakers?\b|loudspeaker|\bLCR\b|front\s+stage|screen\s+channel|\bmodel\b/i,
    subjectPatterns: [/\bspeakers?\b|loudspeaker|\bLCR\b|front\s+stage|screen\s+channel|\bmodel\b/i],
    documentedTerms: [],
    resultPresent: () => false,
    resultChip: () => null,
    clarification: null,
  },
  {
    key: 'seating',
    naming: /\bseats?\b|\bseating\b|\brows?\b|viewing\s+position/i,
    subjectPatterns: [/\bseats?\b|\bseating\b|\brows?\b/i],
    documentedTerms: ['priority', 'position', 'comfort', 'sightline'],
    resultPresent: () => false,
    resultChip: () => null,
    clarification: null,
  },
]);

/** The design area a suggestion names, or null when it names none of them. */
export function suggestionArea(label) {
  const text = String(label || '');
  return DESIGN_AREAS.find((area) => area.naming.test(text)) || null;
}

/** The matter one suggestion asks to be explained: its own words, minus subject words. */
function chipMatter(label) {
  return [...new Set(
    String(label || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((word) => word.replace(/^[.-]+|[.-]+$/g, ''))
      .filter((word) => word.length >= 4 && !CHIP_STOPWORDS.has(word) && !SUBJECT_WORDS.has(word)),
  )];
}

/**
 * Whether the material records a reason for the decision THIS suggestion asks about:
 * a sentence (or two related sentences of one paragraph) that names the suggestion's
 * subject and its matter, with a stated basis, purpose or constraint.
 */
export function reasoningIsDocumented({ label, material } = {}) {
  const area = suggestionArea(label);
  const matter = chipMatter(label);
  // A suggestion that names no subject and no matter says nothing about what it asks
  // to be explained, so nothing can document it.
  if (!area && matter.length === 0) return false;
  return groundedReason({
    text: material,
    subjectPatterns: area ? area.subjectPatterns : [/\w/],
    contentTerms: matter,
  });
}

/**
 * What ADI does with one candidate suggestion.
 *
 * @param {{ label: string, material?: string, facts?: Object }} input
 * @returns {{ status: 'passed'|'rewritten'|'rejected', label: string|null, rule: string|null, note: string|null }}
 */
export function resolveReasoningSuggestion({ label, material = '', facts = null } = {}) {
  const text = String(label || '').trim();
  if (!text || !asksForReasoning(text)) {
    return { status: 'passed', label: text, rule: null, note: null };
  }
  if (reasoningIsDocumented({ label: text, material })) {
    return { status: 'passed', label: text, rule: null, note: null };
  }

  const area = suggestionArea(text);
  const instead = area?.resultChip ? area.resultChip(facts) : null;
  if (instead) {
    return {
      status: 'rewritten',
      label: instead,
      rule: 'reasoning_not_recorded',
      note: 'The reasoning behind this decision is not recorded, so this example asks for the calculated result and what it means for the room instead.',
    };
  }
  return {
    status: 'rejected',
    label: null,
    rule: 'reasoning_not_recorded',
    note: 'The reasoning behind this decision is not recorded in the design interpretation, so ADI does not suggest explaining it.',
  };
}

/**
 * The short optional questions ADI may put to the designer: an important decision whose
 * reasoning is not recorded, where the design does state a result for it. They are
 * offers, never requirements, and no answer is assumed.
 */
export function buildClarifications({ facts = null, material = '' } = {}) {
  const out = [];
  for (const area of DESIGN_AREAS) {
    if (!area.clarification || !area.resultPresent(facts)) continue;
    if (groundedReason({
      text: material,
      subjectPatterns: area.subjectPatterns,
      contentTerms: area.documentedTerms,
    })) continue;
    out.push({ area: area.key, question: area.clarification });
  }
  return out;
}

export default resolveReasoningSuggestion;