/**
 * projectReportPageBudget.js
 * --------------------------
 * The Project Report's opening pages (1–3) have a FIXED A4 composition: each is
 * one A4 page and its content must fit that page. The print frame is fixed at
 * 271mm tall with `overflow: hidden`, so anything that does not fit is clipped —
 * silently. This module is the authority that prevents that: it estimates, in
 * millimetres, what a block of copy will occupy, and the opening's own
 * authorities use it to reduce copy (drop the weakest highlight) rather than let
 * a page overflow. Content is never truncated mid-block and never allowed to
 * spill below the page.
 *
 * The estimates are deliberately conservative: they are the upper bound of what
 * the block occupies at the report's fixed A4 body size (9pt Didact Gothic over
 * a 186mm text column). Being conservative means a page that fits the estimate
 * always fits the paper.
 *
 * Pure module: no React, no DOM, no side effects.
 */

/** The printable A4 frame the report lays every page out in. */
export const A4_CONTENT_MM = Object.freeze({ width: 186, height: 271 });

/**
 * The content budget for each opening page, in millimetres, inside that frame.
 * Page 1 carries the report masthead above its content, so it has less room.
 */
export const PROJECT_REPORT_PAGE_BUDGET_MM = Object.freeze({
  // The first page carries the report masthead above its content; the second and
  // third are full-height content pages. Both figures are deliberately below what
  // the 271mm frame can hold, so a page that fits its budget always fits paper.
  first: 146,
  page: 228,
});

/** Fixed costs, in millimetres, of the blocks the opening pages use. */
export const PAGE_BLOCK_MM = Object.freeze({
  heading: 16,
  factRow: 8,
  paragraphSpacing: 12,
  line: 5,
  highlightFixed: 15,
  highlightGap: 7,
});

/** Characters of body copy that fit on one 186mm line at the report body size. */
export const CHARS_PER_LINE = 108;

/**
 * The Compact composition cost, used by the highlights page once it carries more
 * than COMPACT_HIGHLIGHT_THRESHOLD cards. The page's own hierarchy is tightened
 * for a fuller page — the title sits in the standard size, the evidence stays on
 * one row and the copy is kept to its short form — so six or seven genuine
 * strengths can be stated without the page ever clipping, and without dropping a
 * materially important story to preserve a four-card layout.
 *
 * These figures remain an upper bound (they are still well above what the page
 * actually occupies), so a page that fits this estimate always fits the paper.
 */
export const COMPACT_HIGHLIGHT_THRESHOLD = 5;
export const COMPACT_BLOCK_MM = Object.freeze({
  highlightFixed: 12,
  highlightGap: 4,
});

/** How many lines a piece of copy occupies. */
export function estimateLines(text, charsPerLine = CHARS_PER_LINE) {
  const length = String(text ?? '').replace(/\s+/g, ' ').trim().length;
  if (length === 0) return 0;
  return Math.max(1, Math.ceil(length / charsPerLine));
}

/** One paragraph: its lines plus the space that separates it from the block above. */
export function estimateParagraphMm(text, spacingMm = PAGE_BLOCK_MM.paragraphSpacing) {
  const lines = estimateLines(text);
  if (lines === 0) return 0;
  return lines * PAGE_BLOCK_MM.line + spacingMm;
}

/** Page 1: heading + fact rows + one paragraph. */
export function estimateProjectSummaryMm({ factCount = 0, paragraph = null } = {}) {
  return PAGE_BLOCK_MM.heading
    + Math.max(0, factCount) * PAGE_BLOCK_MM.factRow
    + estimateParagraphMm(paragraph);
}

/** One highlight card: heading block, its evidence line, its copy and the gap. */
export function estimateHighlightMm(highlight, { compact = false } = {}) {
  const block = compact ? COMPACT_BLOCK_MM : PAGE_BLOCK_MM;
  const evidenceLines = Array.isArray(highlight?.evidence) && highlight.evidence.length > 2 ? 2 : 1;
  const copyLines = estimateLines(highlight?.explanation);
  return block.highlightFixed
    + (evidenceLines - 1) * PAGE_BLOCK_MM.line
    + copyLines * PAGE_BLOCK_MM.line
    + block.highlightGap;
}

/**
 * The whole highlights page: heading + every card. Once the page carries more
 * cards than COMPACT_HIGHLIGHT_THRESHOLD it is composed compactly, and the
 * estimate follows that same composition — so the authority and the page always
 * agree on what fits, and a fuller page is never cut back to a four-card layout.
 */
export function estimateHighlightsMm(highlights, { compact } = {}) {
  const list = Array.isArray(highlights) ? highlights : [];
  const useCompact = compact ?? list.length > COMPACT_HIGHLIGHT_THRESHOLD;
  return PAGE_BLOCK_MM.heading
    + list.reduce((total, highlight) => total + estimateHighlightMm(highlight, { compact: useCompact }), 0);
}

/**
 * Fit the selected highlights to the page: drop the lowest-ranked highlight
 * until the page fits. The list arrives already ranked strongest first, so the
 * weakest are the ones that go, and the page never clips. Because the compact
 * composition is used for a fuller page, a materially important story is never
 * dropped merely to preserve a four-card layout.
 */
export function fitHighlightsToBudget(
  highlights,
  budgetMm = PROJECT_REPORT_PAGE_BUDGET_MM.page,
  headingMm = PAGE_BLOCK_MM.heading,
) {
  const kept = (Array.isArray(highlights) ? highlights : []).filter(Boolean);
  while (kept.length > 1 && estimateHighlightsMm(kept) > budgetMm) {
    kept.pop();
  }
  return kept;
}

export default fitHighlightsToBudget;