/**
 * highlightsPageAuthority.js
 * --------------------------
 * The printed Key Performance Highlights page is one page: the title, the table
 * and every row stay together, and the table never starts on the page after its
 * heading.
 *
 * The one thing that can push the table over is the section's own introduction.
 * The table is self-explanatory, so the introduction is printed only when it is
 * a single short sentence AND the table is short enough to leave room for it.
 * When either is not true the table prints on its own, whole.
 *
 * Pure: no React, no fetching, no side effects. Nothing here changes a value.
 */

import { countSentences, plainTextOf } from '@/components/proposal/sectionBodyAuthority';

/** The most rows that may share a page with an introduction. */
export const HIGHLIGHTS_INTRO_MAX_ROWS = 10;

/** The most sentences a printed introduction may carry. */
export const HIGHLIGHTS_INTRO_MAX_SENTENCES = 1;

/**
 * @param {{ body?: string, rowCount?: number }} params
 * @returns {boolean} whether the introduction prints above the table
 */
export function shouldPrintHighlightsIntro({ body = '', rowCount = 0 } = {}) {
  if (!plainTextOf(body)) return false;
  if (Number(rowCount) > HIGHLIGHTS_INTRO_MAX_ROWS) return false;
  return countSentences(body) <= HIGHLIGHTS_INTRO_MAX_SENTENCES;
}

export default shouldPrintHighlightsIntro;