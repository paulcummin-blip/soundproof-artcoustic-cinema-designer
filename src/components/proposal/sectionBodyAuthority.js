/**
 * sectionBodyAuthority.js
 * -----------------------
 * The one place that prepares a stored proposal section body for display.
 * The editor preview and the exported PDF both read from here, so the document
 * a dealer reviews on screen is the document that prints.
 *
 * Two rules, both presentation-only. A stored record is never modified:
 *
 *  1. A section heading appears once. The stored body must not repeat its own
 *     section title, so a leading heading that matches the section title is
 *     dropped on the way to the page.
 *  2. The Key Performance Highlights introduction is an introduction: any list
 *     or table inside it is dropped (the calculated table is the only table in
 *     that section) and it is held to a few short sentences.
 *
 * Pure: no React, no side effects, no document access.
 */

import { stripHighChannelUpgradeCopy } from '@/components/proposal/highChannelLayoutAuthority';

const LEADING_HEADING = /^\s*<h([1-4])[^>]*>([\s\S]*?)<\/h\1>\s*/i;
const ANY_TAG = /<[^>]*>/g;
const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

/** Plain text of a title: tags, entities, punctuation and case removed. */
export function normaliseTitleText(value) {
  if (value === null || value === undefined) return '';
  let text = String(value).replace(ANY_TAG, ' ');
  Object.entries(ENTITIES).forEach(([entity, replacement]) => {
    text = text.split(entity).join(replacement);
  });
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Remove a leading heading that simply repeats the section title.
 * The stored body is left alone; only the displayed copy loses the duplicate.
 *
 * @param {string} html
 * @param {string} title - the section's own heading
 * @returns {string}
 */
export function stripDuplicateLeadingHeading(html, title) {
  if (typeof html !== 'string' || !html.trim()) return '';
  const target = normaliseTitleText(title);
  if (!target) return html;

  let out = html;
  for (let guard = 0; guard < 4; guard += 1) {
    const match = LEADING_HEADING.exec(out);
    if (!match) break;
    if (normaliseTitleText(match[2]) !== target) break;
    out = out.slice(match[0].length);
  }
  return out;
}

/** Drop whole list and table blocks from a section body. */
export function stripListAndTableBlocks(html) {
  if (typeof html !== 'string' || !html.trim()) return '';
  return html
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<ul[\s\S]*?<\/ul>/gi, ' ')
    .replace(/<ol[\s\S]*?<\/ol>/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Keep at most `max` sentences of prose, cutting the body after the last
 * sentence end that is kept. A trailing half-written tag is removed.
 */
export function limitSentences(html, max = 3) {
  if (typeof html !== 'string' || !html.trim()) return '';
  let sentenceEnds = 0;
  let cut = -1;
  for (let index = 0; index < html.length; index += 1) {
    if (!/[.!?]/.test(html[index])) continue;
    const next = html[index + 1];
    // A sentence end is followed by whitespace or by the end of a tag.
    if (next !== undefined && !/[\s<]/.test(next)) continue;
    sentenceEnds += 1;
    cut = index + 1;
    if (sentenceEnds >= max) break;
  }
  if (cut === -1) return html;
  const sliced = html.slice(0, cut);
  return sliced.replace(/<[^>]*$/, '').trim();
}

/** Plain text of a body: tags, entities and extra spaces removed. */
export function plainTextOf(html) {
  if (html === null || html === undefined) return '';
  let text = String(html).replace(ANY_TAG, ' ');
  Object.entries(ENTITIES).forEach(([entity, replacement]) => {
    text = text.split(entity).join(replacement);
  });
  return text.replace(/\s+/g, ' ').trim();
}

/** How many sentences a piece of copy carries. */
export function countSentences(html) {
  const text = plainTextOf(html);
  if (!text) return 0;
  const ends = text.match(/[.!?](?=\s|$)/g);
  return ends ? ends.length : 1;
}

/** The most paragraphs a narrative page prints, and the longest one it prints. */
export const PROSE_PARAGRAPH_LIMIT = 3;
export const PARAGRAPH_SENTENCE_LIMIT = 4;
/**
 * A comparison's opening section introduces EVERY option in turn, so it carries
 * a list of the options and one paragraph per option rather than the
 * single-system page's three-paragraph limit.
 */
export const COMPARISON_PROSE_PARAGRAPH_LIMIT = 6;

/**
 * Keep at most `maxParagraphs` paragraphs, and no paragraph longer than
 * `maxSentences`. Headings and other blocks stay where they are, so a page is
 * shortened rather than rebuilt. Presentation only: the stored body is untouched.
 */
export function limitProseParagraphs(
  html,
  maxParagraphs = PROSE_PARAGRAPH_LIMIT,
  maxSentences = PARAGRAPH_SENTENCE_LIMIT,
) {
  if (typeof html !== 'string' || !html.trim()) return '';
  let seen = 0;
  return html.replace(/<p[^>]*>[\s\S]*?<\/p>/gi, (paragraph) => {
    seen += 1;
    if (seen > maxParagraphs) return '';
    const close = /<\/p>$/i.test(paragraph) ? '</p>' : '';
    const limited = limitSentences(paragraph, maxSentences);
    return close && !limited.endsWith(close) ? `${limited}${close}` : limited;
  });
}

/**
 * The body of one section, ready to render.
 *
 * @param {string} html - the stored section body
 * @param {{ title?: string, sectionType?: string }} section
 * @returns {string}
 */
/**
 * The sections that print as prose only. Each of these has its own designed
 * evidence (the structure cards) or is the narrative around the single
 * structured table, so a list or a table inside the prose would repeat it.
 * The stored body is never modified: the rule applies to the printed page only.
 */
const PROSE_ONLY_SECTIONS = new Set([
  'system_design_summary',
  'spatial_resolution',
  'dynamic_range',
  'timbre_matching',
  'overall_design',
]);

export function prepareSectionBody(html, section = {}) {
  const deduped = stripDuplicateLeadingHeading(html, section.title);
  // A high-channel-count design never carries an added-speaker or spacing
  // upgrade, whatever an older stored body still says: the copy is cleaned on the
  // way to the page and the stored record is never rewritten.
  const cleaned = section.highChannel ? stripHighChannelUpgradeCopy(deduped) : deduped;
  if (section.sectionType === 'key_performance_highlights') {
    // The structured calculated table is the only table in this section, and the
    // introduction stays a short piece of prose.
    return limitSentences(stripListAndTableBlocks(cleaned), 3);
  }
  // On the printed page the prose sections carry prose only: a highlight list
  // inside a section is repetition of the one evidence table. They are also held
  // to a few short paragraphs, so no page reads as a squeezed block of text.
  if (section.proseOnly && PROSE_ONLY_SECTIONS.has(section.sectionType)) {
    // The one exception is a comparison's opening section: it introduces each
    // system option in turn, so it keeps its own list of the options and one
    // paragraph per option.
    const isComparisonSummary = section.proposalType === 'comparison'
      && section.sectionType === 'system_design_summary';
    return limitProseParagraphs(
      isComparisonSummary ? cleaned : stripListAndTableBlocks(cleaned),
      isComparisonSummary ? COMPARISON_PROSE_PARAGRAPH_LIMIT : PROSE_PARAGRAPH_LIMIT,
    );
  }
  return cleaned;
}

export default prepareSectionBody;