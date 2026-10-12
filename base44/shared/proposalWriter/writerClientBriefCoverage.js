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
 * FIVE OUTCOMES, and each one means something different:
 *
 *   ADDRESSED             the copy communicates what the item asked for — including
 *                         the reasoning, where the item asked for reasoning;
 *   PARTIALLY ADDRESSED   the copy reaches the item's subject and states a fact or
 *                         figure, but omits something the item asked for: a figure,
 *                         one of two named rows, or the explanation of a decision;
 *   UNADDRESSED           the evidence supports the item and the copy does not
 *                         meaningfully cover it at all;
 *   NEEDS DESIGNER INPUT  the item asks for the reasoning behind a decision and no
 *                         source records one. Writing it would mean inventing it, so
 *                         it is the designer's to supply and never the writer's;
 *   UNSUPPORTED           no source states it: the frozen evidence carries no
 *                         result for the item, so it can never be written.
 *
 * A RESULT IS NOT AN EXPLANATION. An item that asks WHY or HOW a decision was made
 * is answered by the reasoning itself: "Overhead speaker spacing is 66.5°" reports
 * the figure and does not explain the decision, so it is never a complete answer.
 * The reasoning is read from the finished copy, and where no source records one the
 * request is flagged for the designer rather than forced out of the writer.
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
import { asksForReasoning, statesReasoning, groundedReason, sentences } from './writerBriefReasoning.js';

/** What became of one brief item. */
export const BRIEF_ITEM_STATUS = Object.freeze({
  ADDRESSED: 'addressed',
  PARTIALLY_ADDRESSED: 'partially_addressed',
  UNADDRESSED: 'unaddressed',
  NEEDS_DESIGNER_INPUT: 'needs_designer_input',
  UNSUPPORTED: 'unsupported',
});

/** The subjects a brief is likely to ask about, and the words that name them. */
const SUBJECT_TERMS = Object.freeze([
  { key: 'front_wides', pattern: /\bfront[\s-]*wides?\b/i },
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

/**
 * Words that name a request's SUBJECT but can never evidence an explanation of it:
 * they appear wherever the subject is mentioned, so a sentence carrying "front
 * wide", "screen", "overhead" or "position" is a mention and never an answer.
 * A request is answered only by the specific matter it asks for, which is why the
 * generic vocabulary of the domain is excluded from the terms that can evidence
 * coverage.
 */
const GENERIC_TERMS = new Set([
  'front', 'rear', 'side', 'sides', 'left', 'right', 'back', 'screen', 'screens', 'display',
  'tv', 'projector', 'speaker', 'speakers', 'channel', 'channels', 'subwoofer', 'subwoofers',
  'sub', 'subs', 'position', 'positions', 'positioning', 'location', 'locations', 'placement',
  'placements', 'zone', 'zones', 'level', 'levels', 'result', 'results', 'value', 'values',
  'system', 'systems', 'layout', 'arrangement', 'configuration', 'geometry', 'angle', 'angles',
  'room', 'cinema', 'sound', 'audio', 'acoustic', 'acoustics', 'design', 'area', 'areas', 'seat',
  'seats', 'seating', 'row', 'rows', 'overhead', 'overheads', 'bass', 'range', 'output',
  'extension', 'response', 'viewing', 'performance', 'quality', 'capability', 'content',
  'picture', 'image', 'impact', 'depth', 'weight', 'scale', 'immersion', 'assessment',
  'assessed', 'consideration', 'considerations', 'decision', 'decisions', 'treatment', 'panel',
  'panels', 'tonal', 'tonally', 'timbre', 'consistency', 'consistent', 'frequency', 'frequencies',
]);

/* What a request for reasoning is, and what counts as answering it, lives in
   writerBriefReasoning.js beside this audit. */

/** Which writer section an item's subject belongs to, so a gap is returned to the right place. */
const SUBJECT_WRITER_SECTION = Object.freeze({
  front_wides: 'spatial_resolution',
  overheads: 'spatial_resolution',
  viewing: 'spatial_resolution',
  spatial_resolution: 'spatial_resolution',
  bass_output: 'dynamic_range',
  bass_extension: 'dynamic_range',
  bass_response: 'dynamic_range',
  dynamic_range: 'dynamic_range',
  seat_consistency: 'timbre_matching',
  timbre: 'timbre_matching',
  system_layout: 'what_stays_same',
  subwoofers: 'what_stays_same',
  acoustic_treatment: 'what_changes',
});

/** The specific matter a request asks to be explained: its own words, minus the domain's generic vocabulary. */
function contentTermsOf(terms) {
  return terms.filter((term) => !GENERIC_TERMS.has(term));
}

/**
 * The copy as plain text: markup removed and whitespace collapsed. It is never
 * truncated here — a passage is read from the whole section, so an explanation in
 * the last paragraph of a section is found exactly like one in the first.
 */
function passageText(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** One sentence of the copy, as it is quoted back as evidence. */
function quotePassage(sentence) {
  return String(sentence || '').trim().slice(0, 400);
}

/**
 * The passages of the finished copy that actually answer ONE item: the sentences
 * that both reach its subject and state what it asked for — a required figure, or
 * the specific matter it names. A related word elsewhere in the document is not a
 * passage, and is never reported as one.
 */
function supportingPassages({ sections, subjectPatterns, contentTerms, requirements }) {
  const found = [];
  for (const entry of Array.isArray(sections) ? sections : []) {
    for (const sentence of sentences(passageText(entry?.text))) {
      if (!subjectPatterns.some((pattern) => pattern.test(sentence))) continue;
      const statesFigure = requirements.some((requirement) => figureStated(requirement, sentence));
      const statesMatter = contentTerms.length === 0
        || contentTerms.some((term) => sentence.toLowerCase().includes(term));
      if (!statesFigure && !statesMatter) continue;
      found.push({ section: entry?.section || null, passage: quotePassage(sentence) });
      if (found.length >= 3) return found;
    }
  }
  return found;
}

/** The sentence that reaches an item's subject without explaining it, when there is one. */
function mentionPassage({ sections, subjectPatterns }) {
  for (const entry of Array.isArray(sections) ? sections : []) {
    for (const sentence of sentences(passageText(entry?.text))) {
      if (subjectPatterns.some((pattern) => pattern.test(sentence))) {
        return { section: entry?.section || null, passage: quotePassage(sentence) };
      }
    }
  }
  return null;
}

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
    // A brief line may itself hold more than one request, and each request is
    // audited on its own: a bullet, a semicolon and a sentence end all separate
    // them, so one answered instruction can never carry an unanswered one with it.
    // A decimal figure (9.1.6, 2.35:1) is never read as a sentence end.
    for (const raw of source.split(/[\n\r•·;]+|\.\s+(?=[A-Z])/)) {
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
      // A slash-joined pair ("front/rear") is two of the item's own words and not
      // one term: it is split rather than kept, so no request can require the copy
      // to print a slug it would never write.
      .replace(/[^a-z0-9.\s-]/g, ' ')
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
 * @param {Object} [input.interpretation] — the verified interpretation the writer was given; a rationale may be read from it and from the frozen evidence, and from nowhere else
 * @returns {Object} the coverage audit
 */
export function buildClientBriefCoverage({ brief = null, pack = null, sections = [], interpretation = null } = {}) {
  const items = briefItems(brief);
  const evidenceText = packStrings(pack).toLowerCase();
  // What a documented rationale may be read from: the frozen evidence and the
  // interpretation the writer was given. A reason found nowhere in these has not
  // been established, and is never written from the writer's own invention.
  const rationaleText = `${evidenceText} \n ${packStrings(interpretation).toLowerCase()}`;
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

    // What the item asks to be explained, and whether it asks for REASONING rather
    // than for a result to be reported.
    const contentTerms = contentTermsOf(distinctive);
    const reasoningRequired = asksForReasoning(item);

    // A parameter the item names but the reports state no result for is not copy
    // that was left out: no source states it, so it can never be written.
    const codes = parameterCodes(item);
    const missingParameters = codes.filter((id) => !statedParameters.has(id));

    const { requires } = requirementsOf(item, subjects);
    const missing = requires.filter((requirement) => !figureStated(requirement, prose));

    const supported = (supportedTerms.length > 0 || subjects.length > 0) && missingParameters.length === 0;
    const subjectReached = matchedSubjects.length > 0 || matchedTerms.length > 0;

    // THE MEANING TEST. Coverage is the explanation the copy carries, read from the
    // passages that reach the item's subject: a request for a reason is answered
    // only where the reason is stated, and a request for a subject is answered only
    // where the specific matter it names is explained beside that subject.
    const evidence = supportingPassages({
      sections, subjectPatterns: matchedSubjectPatterns, contentTerms, requirements: requires,
    });
    const mention = evidence.length === 0
      ? mentionPassage({ sections, subjectPatterns: matchedSubjectPatterns })
      : null;
    // Whether the copy itself states the reasoning, and whether any source documents
    // a reason for this request at all. The first decides the verdict; the second
    // decides who can act on a gap — a documented reason can be written, an
    // undocumented one exists only in the designer's head.
    const reasoningStated = !reasoningRequired
      || evidence.some((entry) => statesReasoning(entry.passage));
    const rationaleDocumented = !reasoningRequired
      || statesReasoning(item)
      || groundedReason({ text: rationaleText, subjectPatterns: matchedSubjectPatterns, contentTerms });
    const missingTerms = contentTerms.filter((term) => !draft.includes(term));

    // A request whose own FIGURE is not the figure the evidence states is not a
    // writer omission. No revision can answer it without contradicting the frozen
    // evidence, so it is never returned to the writer: it is flagged for the
    // designer, and the brief stays incomplete until they settle it.
    const figureConflict = missing.some((requirement) => requirement.figure
      && !evidenceText.includes(String(requirement.figure).toLowerCase()));

    let status = BRIEF_ITEM_STATUS.UNSUPPORTED;
    let reason = missingParameters.length > 0
      ? `the_saved_reports_state_no_result_for_${missingParameters.map((id) => `P${id}`).join(',')}`
      : 'no_source_states_this_request';
    if (supported) {
      if (missing.length > 0) {
        status = BRIEF_ITEM_STATUS.PARTIALLY_ADDRESSED;
        reason = missing.map((requirement) => requirement.detail).join('; ');
      } else if (reasoningRequired) {
        // The request is the reasoning behind a decision, so it is answered by the
        // reasoning and by nothing less.
        if (reasoningStated) {
          status = BRIEF_ITEM_STATUS.ADDRESSED;
          reason = null;
        } else if (evidence.length === 0) {
          // No passage reaches the subject with anything the item asked for: the
          // requested subject is not meaningfully covered.
          status = BRIEF_ITEM_STATUS.UNADDRESSED;
          reason = 'the_item_asks_for_the_reason_and_the_copy_states_no_reason_for_it';
        } else if (rationaleDocumented) {
          // The result is reported and the decision is not explained. The reasoning
          // is recorded, so this is a gap the writer can close.
          status = BRIEF_ITEM_STATUS.PARTIALLY_ADDRESSED;
          reason = 'the_copy_states_the_result_and_not_the_reasoning_the_item_asks_for';
        } else {
          status = BRIEF_ITEM_STATUS.NEEDS_DESIGNER_INPUT;
          reason = 'the_requested_reasoning_is_not_established_in_the_frozen_evidence_interpretation_or_client_brief';
        }
      } else if (!subjectReached) {
        status = BRIEF_ITEM_STATUS.UNADDRESSED;
        reason = 'the_evidence_supports_this_request_and_the_copy_does_not_reach_it';
      } else if (missing.length > 0) {
        status = BRIEF_ITEM_STATUS.PARTIALLY_ADDRESSED;
        reason = missing.map((requirement) => requirement.detail).join('; ');
      } else if (evidence.length === 0) {
        // The subject is on the page and the specific matter the item asked to be
        // explained is not: the client is told part of it and not the rest.
        status = BRIEF_ITEM_STATUS.PARTIALLY_ADDRESSED;
        reason = `the_copy_reaches_the_subject_and_does_not_explain_${missingTerms.join('_') || 'the_requested_matter'}`;
      } else {
        status = BRIEF_ITEM_STATUS.ADDRESSED;
        reason = null;
      }
    }

    const requiredExplanation = [
      ...requires.map((requirement) => requirement.detail),
      contentTerms.length > 0 ? `the item asks for ${contentTerms.join(', ')} to be explained` : null,
      reasoningRequired ? 'the item asks for the reasoning behind a decision, so the reasoning itself must be stated' : null,
    ].filter(Boolean).join('; ') || 'the item asks for its subject to be explained';

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
      // The actual passages of the finished copy, and nothing else: an ADDRESSED
      // verdict always carries at least one, and a gap carries the mention that
      // shows what the client is told instead.
      evidence,
      mention,
      required_explanation: requiredExplanation,
      missing_subject: missingTerms.join(', '),
      figure_conflict: figureConflict,
      // A request the evidence contradicts, and a rationale no source records, are
      // both the designer's to settle: neither may be written by the writer.
      needs_designer_attention: supported
        && (figureConflict || status === BRIEF_ITEM_STATUS.NEEDS_DESIGNER_INPUT),
      revision_section: subjects.length > 0 ? (SUBJECT_WRITER_SECTION[subjects[0]] || null) : null,
      sections: sectionsCarrying(sections, {
        patterns: matchedSubjectPatterns,
        terms: matchedTerms,
      }),
    };
  });

  const count = (status) => rows.filter((row) => row.status === status).length;
  // What a supported request the copy has not answered is returned through: the
  // section that carries it and the explanation it is missing. An unsupported
  // request is never returned: nothing may be written for it.
  const outstanding = rows.filter((row) => row.supported
    && (row.status === BRIEF_ITEM_STATUS.UNADDRESSED
      || row.status === BRIEF_ITEM_STATUS.PARTIALLY_ADDRESSED
      || row.status === BRIEF_ITEM_STATUS.NEEDS_DESIGNER_INPUT));
  return {
    supplied: items.length > 0,
    rule: 'a brief item is addressed only when the finished narrative explains what it asked for: the evidence must support it, the copy must reach its subject, the specific matter it names must be explained there, every figure or named row it requires must be stated, and an item that asks why or how a decision was made is answered by the reasoning itself and never by a figure alone — where the copy states the result and not the reasoning it is partially addressed, and where no source records the reasoning at all it is returned to the designer rather than invented. Every verdict carries the passage it was read from or the mention that stands in its place. A supported request the copy omits is unaddressed; one the copy only partly answers is partially addressed; one no source states is unsupported',
    items: rows,
    addressed_count: count(BRIEF_ITEM_STATUS.ADDRESSED),
    partially_addressed_count: count(BRIEF_ITEM_STATUS.PARTIALLY_ADDRESSED),
    unaddressed_count: count(BRIEF_ITEM_STATUS.UNADDRESSED),
    needs_designer_input_count: count(BRIEF_ITEM_STATUS.NEEDS_DESIGNER_INPUT),
    unsupported_count: count(BRIEF_ITEM_STATUS.UNSUPPORTED),
    // EDITORIAL COMPLETENESS, kept separate from engineering validity: the brief is
    // complete only when every supported request it makes is answered in the copy.
    complete: items.length === 0 ? true : outstanding.length === 0,
    outstanding,
    outstanding_count: outstanding.length,
    revision_requests: outstanding
      .filter((row) => row.needs_designer_attention !== true)
      .map((row) => ({
        item: row.item,
        section: row.revision_section,
        status: row.status,
        required_explanation: row.required_explanation,
        missing_subject: row.missing_subject,
      })),
    // A request the evidence itself contradicts is the designer's to settle: it is
    // named here, never sent to the writer, and it keeps the brief incomplete.
    designer_attention: outstanding
      .filter((row) => row.needs_designer_attention === true)
      .map((row) => ({
        item: row.item,
        section: row.revision_section,
        status: row.status,
        reason: row.reason,
        required_explanation: row.required_explanation,
      })),
  };
}

export default buildClientBriefCoverage;