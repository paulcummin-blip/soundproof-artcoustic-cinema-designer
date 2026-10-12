/**
 * writerClientBriefCoverage.js (shared)
 * -------------------------------------
 * WHAT THE DESIGNER ASKED FOR, AND WHAT THE FINISHED PROSE DID WITH IT.
 *
 * The client brief is an instruction, and a proposal is complete against it only
 * when the copy actually communicates what the brief asked for. A related claim ID
 * is not coverage: the audit reads the FINISHED NARRATIVE, item by item, and asks
 * whether the information the client asked for is on the page.
 *
 * FOUR OUTCOMES, and each one means something different:
 *
 *   ADDRESSED            the copy communicates what the item asked for;
 *   PARTIALLY ADDRESSED  the copy reaches the item's subject but omits a specific
 *                        the item asked for — a figure, or one of two named rows —
 *                        so the client is told part of it and not the rest;
 *   UNADDRESSED          the evidence supports the item and the copy does not
 *                        reach it at all;
 *   UNSUPPORTED          no source states it: the frozen evidence carries no
 *                        result for the item, so it can never be written.
 *
 * So a supported request that was silently left out is never reported as complete,
 * and an unsupported one is never reported as copy that was merely omitted.
 *
 * WHAT AN ITEM REQUIRES is read from the item's own words: the figure it names, the
 * result family it asks for (an extension in Hz, an output in dBC, a viewing angle),
 * whether it asks for the screen channel's own result, and whether it names both
 * seating rows. Nothing is required that the item did not ask for.
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
  PARTIALLY_ADDRESSED: 'partially_addressed',
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

/* ── what an item requires of the finished prose ───────────────────────────── */

/** A figure a brief item names in its own words, e.g. a size or an output. */
const NAMED_FIGURE = /(\d+(?:\.\d+)?)\s*(dBC|dBc|dB|kHz|Hz|°|degrees?|inch(?:es)?|")/gi;

/** The result families a brief can ask for, and the figure each one requires. */
const RESULT_FIGURE_RULES = Object.freeze([
  {
    key: 'bass_extension_figure',
    when: /\bextension\b|\bextends?\b|\bextending\b|\bHz\b|low[- ]frequency|deep\s+bass/i,
    figure: /\b\d+(?:\.\d+)?\s*Hz\b/i,
    detail: 'the item asks for the extension result and the copy states no frequency',
  },
  {
    key: 'output_figure',
    when: /\bdB\s?C\b|\bdBC\b|dynamic\s+range|headroom|output\s+capability|\bSPL\b|\bP1[23]\b/i,
    figure: /\b\d+(?:\.\d+)?\s*dB\s?C?\b/i,
    detail: 'the item asks for the output result and the copy states no output figure',
  },
  {
    key: 'viewing_angle',
    when: /\bangle\b|\bdegrees?\b|\bP23\b|RP23/i,
    figure: /\b\d+(?:\.\d+)?\s*°|\b\d+(?:\.\d+)?\s*degrees?\b/i,
    detail: 'the item asks for a viewing angle and the copy states none',
  },
]);

/** The channel family an item scopes its request to, when it names one. */
const SCREEN_STAGE = /\b(?:screen(?:\s+(?:channel|channels|stage|speakers?))?|lcr|front\s+stage)\b/i;
const FRONT_ROW = /\bfront[- ]row\b/i;
const REAR_ROW = /\brear[- ]row\b|\bback[- ]row\b/i;

/** A parameter code an item names ("P18", "P12"). */
function parameterCodes(text) {
  const found = [];
  const pattern = /\bP(\d{1,2})\b/g;
  let match = pattern.exec(String(text || ''));
  while (match) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && id >= 1 && id <= 23 && !found.includes(id)) found.push(id);
    match = pattern.exec(text);
  }
  return found;
}

/**
 * What the item requires before it can be called addressed: the figures it names,
 * the result family it asks for, the channel family it scopes that result to, and
 * whether it asks about every seating row it names.
 */
function requirementsOf(item, subjects) {
  const text = String(item || '');
  const requires = [];

  // A figure the item states itself has to appear in the copy.
  const pattern = new RegExp(NAMED_FIGURE.source, 'gi');
  let match = pattern.exec(text);
  while (match) {
    requires.push({ key: `named_figure:${match[1]}${match[2]}`, figure: `${match[1]}${match[2]}`, detail: `the item names ${match[1]}${match[2]} and the copy does not state it` });
    match = pattern.exec(text);
  }

  // A result family the item asks for needs its own figure in the copy.
  for (const rule of RESULT_FIGURE_RULES) {
    if (!rule.when.test(text)) continue;
    requires.push({ key: rule.key, figure: null, pattern: rule.figure, detail: rule.detail, screenScoped: rule.key === 'output_figure' && SCREEN_STAGE.test(text) });
  }

  // Both rows named means both rows stated.
  if (FRONT_ROW.test(text) && REAR_ROW.test(text)) {
    requires.push({ key: 'front_row_stated', pattern: FRONT_ROW, detail: 'the item asks about the front row and the copy does not mention it' });
    requires.push({ key: 'rear_row_stated', pattern: REAR_ROW, detail: 'the item asks about the rear row and the copy does not mention it' });
  }

  return { requires, subjects };
}

/** The sentences of the draft, so a screen-scoped figure is read in its own sentence. */
function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Whether a figure the item requires is stated, where the item scopes it. */
function figureStated(requirement, prose) {
  if (requirement.screenScoped) {
    // A screen-channel result is only stated where a sentence names the screen
    // stage and carries the figure: a subwoofer output figure is not the screen's.
    return sentences(prose).some((sentence) => SCREEN_STAGE.test(sentence) && requirement.pattern.test(sentence));
  }
  if (requirement.pattern) return requirement.pattern.test(prose);
  return requirement.figure ? prose.includes(requirement.figure) : true;
}

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

/** The parameter facts the pack states, keyed by parameter number. */
function statedParameterIds(pack) {
  const ids = new Set();
  for (const option of Array.isArray(pack?.options) ? pack.options : []) {
    for (const row of Array.isArray(option?.facts?.parameters) ? option.facts.parameters : []) {
      const id = Number(row?.parameter_id);
      if (Number.isFinite(id) && typeof row?.value === 'string' && row.value.trim().length > 0) ids.add(id);
    }
  }
  return ids;
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
 * What the finished draft did with each substantive request in the brief.
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
  const prose = draftText(sections);
  const draft = prose.toLowerCase();
  const models = new Set(modelTokens(evidenceText).map((token) => token.toLowerCase()));
  const statedParameters = statedParameterIds(pack);

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

    // A parameter the item names but the reports state no result for is not copy
    // that was left out: no source states it, so it can never be written.
    const codes = parameterCodes(item);
    const missingParameters = codes.filter((id) => !statedParameters.has(id));

    const { requires } = requirementsOf(item, subjects);
    const missing = requires.filter((requirement) => !figureStated(requirement, prose));

    const supported = (supportedTerms.length > 0 || subjects.length > 0) && missingParameters.length === 0;
    const subjectReached = matchedSubjects.length > 0 || matchedTerms.length > 0;

    let status = BRIEF_ITEM_STATUS.UNSUPPORTED;
    let reason = missingParameters.length > 0
      ? `the_saved_reports_state_no_result_for_${missingParameters.map((id) => `P${id}`).join(',')}`
      : 'no_source_states_this_request';
    if (supported) {
      if (!subjectReached) {
        status = BRIEF_ITEM_STATUS.UNADDRESSED;
        reason = 'the_evidence_supports_this_request_and_the_copy_does_not_reach_it';
      } else if (missing.length > 0) {
        status = BRIEF_ITEM_STATUS.PARTIALLY_ADDRESSED;
        reason = missing.map((requirement) => requirement.detail).join('; ');
      } else {
        status = BRIEF_ITEM_STATUS.ADDRESSED;
        reason = null;
      }
    }

    return {
      item,
      subjects,
      parameters: codes,
      status,
      reason,
      supported,
      required: requires.map((requirement) => requirement.key),
      missing: missing.map((requirement) => requirement.key),
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
    rule: 'a brief item is addressed only when the finished narrative communicates what it asked for: the evidence must support it, the copy must reach its subject, and every figure or named row it requires must be stated. A supported request the copy omits is unaddressed; one the copy only partly answers is partially addressed; one no source states is unsupported',
    items: rows,
    addressed_count: count(BRIEF_ITEM_STATUS.ADDRESSED),
    partially_addressed_count: count(BRIEF_ITEM_STATUS.PARTIALLY_ADDRESSED),
    unaddressed_count: count(BRIEF_ITEM_STATUS.UNADDRESSED),
    unsupported_count: count(BRIEF_ITEM_STATUS.UNSUPPORTED),
  };
}

export default buildClientBriefCoverage;