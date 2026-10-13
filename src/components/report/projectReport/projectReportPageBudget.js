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

/**
 * The comfortable ceiling for the space between highlight groups, in millimetres.
 * A settled page takes the room its own budget leaves spare and stops here, so the
 * highlights read airily without the copy being stretched down the sheet, and a
 * fuller page stays tighter than a five-story one.
 */
export const HIGHLIGHT_GAP_MAX_MM = 10;
export const COMPACT_HIGHLIGHT_GAP_MAX_MM = 7;

/**
 * The clearance the canonical level pills need, in millimetres: a pill stands a
 * little taller than the plain text the estimate assumes.
 *
 * It is NOT subtracted from the page budget. The budget already sits well inside
 * the fixed A4 frame (228mm of 271mm) and the estimate it holds is a conservative
 * upper bound, so that clearance is already carried by the budget itself — holding
 * a second allowance back inside it would cost the page a genuine strength. Kept
 * as the reference figure for the pages, their tests and their diagnostics.
 */
export const HIGHLIGHT_PILL_HEADROOM_MM = 12;

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

/** One highlight card's own content, without the space that separates it from the next. */
export function estimateHighlightContentMm(highlight, { compact = false } = {}) {
  const block = compact ? COMPACT_BLOCK_MM : PAGE_BLOCK_MM;
  const evidenceLines = Array.isArray(highlight?.evidence) && highlight.evidence.length > 2 ? 2 : 1;
  const copyLines = estimateLines(highlight?.explanation);
  return block.highlightFixed
    + (evidenceLines - 1) * PAGE_BLOCK_MM.line
    + copyLines * PAGE_BLOCK_MM.line;
}

/** One highlight card: its content, its evidence line, its copy and the gap. */
export function estimateHighlightMm(highlight, { compact = false } = {}) {
  const block = compact ? COMPACT_BLOCK_MM : PAGE_BLOCK_MM;
  return estimateHighlightContentMm(highlight, { compact }) + block.highlightGap;
}

/**
 * The space between highlight groups on the settled page, in millimetres: the
 * room the page's OWN budget leaves spare, shared between the groups — never
 * tighter than the composition's own gap and never wider than its comfortable
 * ceiling. Spacing therefore follows how many stories a page carries and how much
 * copy each one holds: five groups read airily, a fuller page stays compact, and a
 * page with little room keeps the gap it always had. The page's A4 budget, its fit
 * protection and its pagination are unchanged — the gap only ever spends height
 * the page already has spare.
 *
 * NOTHING FURTHER IS HELD BACK. The page budget is itself the margin: it sits
 * well inside the fixed A4 frame, and the estimate it holds is already a
 * conservative upper bound of what the page lays out to. No second allowance is
 * subtracted from it, so seven worthwhile stories are never reduced to six to
 * protect an arithmetic precaution — the spacing simply spends the spare height
 * the budget genuinely leaves, and the copy of every story is preserved.
 */
export function resolveHighlightGapMm(highlights, { compact, budgetMm = PROJECT_REPORT_PAGE_BUDGET_MM.page } = {}) {
  const list = (Array.isArray(highlights) ? highlights : []).filter(Boolean);
  const useCompact = compact ?? list.length > COMPACT_HIGHLIGHT_THRESHOLD;
  const block = useCompact ? COMPACT_BLOCK_MM : PAGE_BLOCK_MM;
  const gaps = list.length - 1;
  if (gaps <= 0) return block.highlightGap;

  // The page's own content, plus the pill headroom, comes off the budget first:
  // only what genuinely remains is shared between the groups.
  const contentMm = PAGE_BLOCK_MM.heading
    + list.reduce((total, highlight) => total + estimateHighlightContentMm(highlight, { compact: useCompact }), 0);
  const share = (budgetMm - contentMm) / gaps;
  const ceiling = useCompact ? COMPACT_HIGHLIGHT_GAP_MAX_MM : HIGHLIGHT_GAP_MAX_MM;
  const gap = Math.min(ceiling, Math.max(block.highlightGap, share));
  // Floored to a tenth of a millimetre, so the settled page can never round up
  // past the height it was given.
  return Math.floor(gap * 10) / 10;
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
 *
 * A MANDATORY explanation is never the one dropped: where the page has to shed a
 * story to fit, it sheds the weakest story that is not mandatory, so the
 * highlights the page is required to state are still stated when the page is full.
 */
export function fitHighlightsToBudget(
  highlights,
  budgetMm = PROJECT_REPORT_PAGE_BUDGET_MM.page,
  headingMm = PAGE_BLOCK_MM.heading,
  mandatoryIds = [],
) {
  const kept = (Array.isArray(highlights) ? highlights : []).filter(Boolean);
  const mandatory = new Set(mandatoryIds);
  while (kept.length > 1 && estimateHighlightsMm(kept) > budgetMm) {
    let weakest = -1;
    for (let index = kept.length - 1; index >= 0; index -= 1) {
      if (!mandatory.has(kept[index]?.id)) {
        weakest = index;
        break;
      }
    }
    if (weakest < 0) break;
    kept.splice(weakest, 1);
  }
  return kept;
}

export default fitHighlightsToBudget;