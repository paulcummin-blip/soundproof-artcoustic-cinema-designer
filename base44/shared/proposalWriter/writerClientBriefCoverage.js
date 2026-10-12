/**
 * writerClientBriefCoverage.js (shared)
 * -------------------------------------
 * WHAT THE DESIGNER ASKED FOR, AND WHAT THE DRAFT DID WITH IT.
 *
 * The client brief is an instruction: every substantive request in it has to be
 * either written into the narrative or flagged as unsupported. Neither silently
 * ignoring it nor forcing every last item into the Design Summary is acceptable,
 * so this module reads the finished draft and answers, item by item, which of the
 * two happened — and where, so the answer can be checked.
 *
 * It decides nothing about the design and writes no copy: it is an internal audit
 * of coverage, returned beside the attempt. A brief item is never itself printed.
 *
 * Pure: no React, no SDK, no writes, no runtime-specific APIs.
 */

import { modelTokens } from './writerVocabulary.js';

/** What became of one brief item. */
export const BRIEF_ITEM_STATUS = Object.freeze({
  ADDRESSED: 'addressed',
  UNADDRESSED: 'unaddressed',
  UNSUPPORTED: 'unsupported',
});

/** The subjects a brief is likely to ask about, and the words that name them. */
const SUBJECT_TERMS = Object.freeze([
  { key: 'front_wides', pattern: /\bfront\s*wides?\b/i },
  { key: 'overheads', pattern: /\boverhead|height\s+(?:channel|speaker)/i },
  { key: 'subwoofers', pattern: /\bsubwoofers?\b|\bsubs\b|front\s*\/\s*rear|front\s+and\s+rear/i },
  { key: 'bass_output', pattern: /\bbass\s+output|lfe\b|low[- ]frequency\s+output/i },
  { key: 'bass_extension', pattern: /\bextension\b|\bextends?\b|\bHz\b/i },
  { key: 'bass_response', pattern: /\bbass\s+response\b|\bres(?:ponse)?\s+quality\b|\bP19\b/i },
  { key: 'seat_consistency', pattern: /\bconsistent|consistency|across\s+(?:all\s+)?seats|seat[- ]to[- ]seat|even\s+bass/i },
  // A channel layout reads as "x.1" or "x.1.y" — never as any decimal number, so a
  // viewing angle such as 57.3 is never mistaken for a layout.
  { key: 'system_layout', pattern: /\b\d{1,2}\.1(?:\.[1-6])?\b|architecture|layout|atmos|discrete\s+channels?|configuration/i },
  { key: 'dynamic_range', pattern: /\bdynamic\s+range|headroom|\bdBC\b|output\s+capability/i },
  { key: 'timbre', pattern: /\btimbre|tonal|tonally/i },
  { key: 'viewing', pattern: /\bviewing|viewing\s+angle|\brows?\b|seating\s+position|front\s+row|rear\s+row|screen\s+size|\bTV\b|display/i },
  { key: 'acoustic_treatment', pattern: /\bacoustic\s+treatment|abfuser|panel/i },
  { key: 'spatial_resolution', pattern: /\bspatial|surrounds?\b|soundstage|movement\s+of\s+sound/i },
]);

/** Words that carry no subject of their own. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'its', 'their', 'them', 'they', 'its',
  'explain', 'emphasise', 'emphasize', 'highlight', 'mention', 'discuss', 'show', 'note', 'please',
  'result', 'results', 'about', 'across', 'every', 'each', 'also', 'than', 'then', 'when', 'what',
  'which', 'while', 'have', 'has', 'are', 'was', 'were', 'will', 'shall', 'should', 'must', 'can',
  'only', 'just', 'more', 'less', 'very', 'make', 'made', 'give', 'given', 'need', 'want', 'keep',
  'ensure', 'because', 'between', 'within', 'out', 'both', 'some', 'any', 'all', 'use', 'using',
]);

/** The substantive requests the brief states, in the order it states them. */
export function briefItems(brief) {
  const sources = [brief?.client_brief, brief?.narrative_brief, brief?.designer_notes];
  const items = [];
  for (const source of sources) {
    if (typeof source !== 'string' || source.trim().length === 0) continue;
    for (const raw of source.split(/[\n\r•·;]+/)) {
      const item = raw.trim().replace(/^[-*\s]+/, '').replace(/[.\s]+$/, '');
      if (item.length >= 4) items.push(item);
    }
  }
  return items;
}

/** The word terms an item is recognised by, without its instruction words. */
function termsOf(item) {
  return [...new Set(
    String(item)
      .toLowerCase()
      .replace(/[^a-z0-9./\s-]/g, ' ')
      .split(/\s+/)
      .map((word) => word.replace(/^[./-]+|[./-]+$/g, ''))
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
  )];
}

/** The subjects an item asks about. */
export function briefItemSubjects(item) {
  return SUBJECT_TERMS.filter((entry) => entry.pattern.test(String(item))).map((entry) => entry.key);
}

/** Every string the pack states, so an item can be matched against the evidence. */
function packStrings(pack) {
  const out = [];
  const walk = (value, depth = 0) => {
    if (depth > 6 || value === null || value === undefined) return;
    if (typeof value === 'string') { out.push(value); return; }
    if (typeof value === 'number' || typeof value === 'boolean') { out.push(String(value)); return; }
    if (Array.isArray(value)) { value.forEach((entry) => walk(entry, depth + 1)); return; }
    if (typeof value === 'object') Object.values(value).forEach((entry) => walk(entry, depth + 1));
  };
  walk(pack);
  return out.join(' \n ');
}

/** The draft's own text, with markup taken out. */
function draftText(sections) {
  return (Array.isArray(sections) ? sections : [])
    .map((entry) => String(entry?.text || '').replace(/<[^>]*>/g, ' '))
    .join(' \n ');
}

/** The sections an item's own subjects or terms appear in. */
function sectionsCarrying(sections, { patterns = [], terms = [] } = {}) {
  const found = [];
  for (const entry of Array.isArray(sections) ? sections : []) {
    const text = String(entry?.text || '').replace(/<[^>]*>/g, ' ').toLowerCase();
    if (patterns.some((pattern) => pattern.test(text)) || terms.some((term) => text.includes(term))) {
      found.push(entry?.section || null);
    }
  }
  return [...new Set(found.filter(Boolean))];
}

/**
 * What the draft did with each substantive request in the brief.
 *
 * @param {Object} input
 * @param {Object} [input.brief] — the writer input's editorial_brief block
 * @param {Object} [input.pack] — the frozen pack the draft was written from
 * @param {Array<{section: string, text: string}>} [input.sections] — the finished draft
 * @returns {Object} the coverage audit
 */
export function buildClientBriefCoverage({ brief = null, pack = null, sections = [] } = {}) {
  const items = briefItems(brief);
  const evidenceText = packStrings(pack).toLowerCase();
  const draft = draftText(sections).toLowerCase();
  const models = new Set(modelTokens(evidenceText).map((token) => token.toLowerCase()));

  const rows = items.map((item) => {
    const terms = termsOf(item);
    const subjects = briefItemSubjects(item);
    const distinctive = terms.filter((term) => !models.has(term));
    const supportedTerms = distinctive.filter((term) => {
      if (evidenceText.includes(term)) return true;
      return subjects.some((subject) => (SUBJECT_TERMS.find((entry) => entry.key === subject)?.pattern || /$^/).test(evidenceText));
    });
    const matchedSubjectPatterns = subjects
      .map((subject) => SUBJECT_TERMS.find((entry) => entry.key === subject)?.pattern)
      .filter(Boolean);
    const matchedSubjects = matchedSubjectPatterns.filter((pattern) => pattern.test(draft));
    const matchedTerms = distinctive.filter((term) => draft.includes(term));

    // An item the evidence states nothing about is flagged as unsupported rather
    // than reported as copy that was merely left out.
    const supported = supportedTerms.length > 0 || subjects.length > 0;
    const addressed = matchedSubjects.length > 0 || matchedTerms.length > 0;
    const status = addressed
      ? BRIEF_ITEM_STATUS.ADDRESSED
      : (supported ? BRIEF_ITEM_STATUS.UNADDRESSED : BRIEF_ITEM_STATUS.UNSUPPORTED);

    return {
      item,
      subjects,
      status,
      supported,
      matched_terms: matchedTerms,
      sections: sectionsCarrying(sections, {
        patterns: matchedSubjectPatterns,
        terms: matchedTerms,
      }),
    };
  });

  const count = (status) => rows.filter((row) => row.status === status).length;
  return {
    supplied: items.length > 0,
    rule: 'every substantive request in the brief is either addressed in the narrative or flagged as unaddressed or unsupported: '
      + 'nothing is silently ignored, and no item is forced into a section it does not belong in',
    items: rows,
    addressed_count: count(BRIEF_ITEM_STATUS.ADDRESSED),
    unaddressed_count: count(BRIEF_ITEM_STATUS.UNADDRESSED),
    unsupported_count: count(BRIEF_ITEM_STATUS.UNSUPPORTED),
  };
}

export default buildClientBriefCoverage;