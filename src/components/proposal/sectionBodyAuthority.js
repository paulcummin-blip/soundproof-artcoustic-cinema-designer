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

/**
 * The body of one section, ready to render.
 *
 * @param {string} html - the stored section body
 * @param {{ title?: string, sectionType?: string }} section
 * @returns {string}
 */
export function prepareSectionBody(html, section = {}) {
  const deduped = stripDuplicateLeadingHeading(html, section.title);
  if (section.sectionType !== 'key_performance_highlights') return deduped;
  // The structured calculated table is the only table in this section, and the
  // introduction stays a short piece of prose.
  return limitSentences(stripListAndTableBlocks(deduped), 3);
}

export default prepareSectionBody;