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
 *     or table inside it is dropped, because the calculated table is the only
 *     table in that section. Its prose is never shortened.
 *
 * NO paragraph or sentence limit is applied to a published body. Every approved
 * paragraph and sentence reaches the page: a section too long for one sheet flows
 * onto the next, and the Editor and the PDF read this one preparation, so neither
 * can present less of the approved copy than the other.
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
    // The structured calculated table is the only table in this section, so a
    // list or table inside the introduction would repeat it. The introduction's
    // own prose is published entire, however long the writer made it.
    return stripListAndTableBlocks(cleaned);
  }
  // On the printed page the prose sections carry prose only: a highlight list
  // inside a section would repeat the one evidence table. Nothing else is
  // removed — no paragraph and no sentence is dropped to make a page fit.
  if (section.proseOnly && PROSE_ONLY_SECTIONS.has(section.sectionType)) {
    // The one exception is a comparison's opening section: it introduces each
    // system option in turn, so it keeps its own list of the options and one
    // paragraph per option.
    const isComparisonSummary = section.proposalType === 'comparison'
      && section.sectionType === 'system_design_summary';
    return isComparisonSummary ? cleaned : stripListAndTableBlocks(cleaned);
  }
  return cleaned;
}

export default prepareSectionBody;