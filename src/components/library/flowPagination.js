/**
 * flowPagination.js
 * -----------------
 * Flow pagination for the compositions that are paginated by their own content
 * rather than by a fixed page frame: the client specification pack.
 *
 * Why it exists. A proposal section is as tall as its copy (see
 * proposalPageBreakRules.js): the pack composes ONE page frame per section and
 * lets the copy flow. The printed document is fine — a browser breaks a tall
 * frame across two sheets at block boundaries — but the capture that stores the
 * issued PDF rasterises ONE canvas per page frame, so a frame taller than the
 * sheet is a page that "does not fit" and the document cannot be stored.
 *
 * What this does. Before the capture measures and rasterises the pages, a page
 * frame taller than the sheet it prints on is split into continuation pages:
 * whole blocks are moved, in document order, onto a continuation page that
 * carries the SAME page design — the same margins, the same column width, the
 * same typography, because it is the same page class — and the section's own
 * page header stays on the first page alone, exactly as a printed continuation
 * sheet continues without repeating it. Nothing is cut, nothing is dropped and
 * no text is shrunk: the content of every page is the content the browser would
 * print, on as many sheets as it needs.
 *
 * The split is decided by measurement, not by a guess: a page is only finished
 * with when it really fits. A block that cannot be moved (a page carrying a
 * single block, or a block that is itself taller than a sheet) is left exactly
 * where it is, so the capture's own fit check still reports it rather than
 * hiding it.
 *
 * Pure except for the DOM it is handed: no React, no fetching, and the
 * measurement is injectable so the splitting logic can be tested without a
 * layout engine.
 */

const CSS_PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;
const MM_TO_PX = CSS_PX_PER_INCH / MM_PER_INCH;

/** The class every continuation page carries. */
export const CONTINUATION_CLASS = 'pp-page--continuation';

/** Sub-millimetre rounding is not an overflow: the capture's own tolerance. */
export const FLOW_FIT_TOLERANCE_MM = 2;

/**
 * The heading blocks of the pack (mirrors PACK_HEADING_SELECTORS in
 * proposalPageBreakRules.js: the two are asserted to agree). A heading never
 * ends a page: it travels with the block that follows it.
 */
export const FLOW_HEADING_CLASSES = Object.freeze([
  'pp-header__title',
  'pp-header__lead',
  'pp-block__title',
  'pp-facts-group__title',
  'pp-decision__title',
  'pp-method__heading',
]);

const HEADING_TAG = /^H[1-6]$/;

/** A run of one element together with the nodes that immediately follow it. */
function isElement(node) {
  return Boolean(node) && node.nodeType === 1;
}

/** True when a chunk is a heading block that must keep the block under it. */
export function isHeadingBlock(element) {
  if (!isElement(element)) return false;
  if (HEADING_TAG.test(String(element.tagName || '').toUpperCase())) return true;
  const classes = element.classList;
  if (!classes || typeof classes.contains !== 'function') return false;
  return FLOW_HEADING_CLASSES.some((name) => classes.contains(name));
}

/** The default measurement: the element's laid-out height in millimetres. */
export function layoutHeightMm(element) {
  const rect = element?.getBoundingClientRect?.();
  const height = Number(rect?.height);
  return Number.isFinite(height) && height > 0 ? height / MM_TO_PX : 0;
}

/**
 * A page's content as movable chunks, in document order. Each chunk is one
 * element plus the nodes that follow it, so a text node is never separated from
 * the element it belongs to and no sentence is ever cut in half.
 */
export function contentChunks(container) {
  const chunks = [];
  let current = null;
  Array.from(container?.childNodes || []).forEach((node) => {
    if (isElement(node)) {
      current = { nodes: [node] };
      chunks.push(current);
      return;
    }
    if (current) current.nodes.push(node);
  });
  return chunks;
}

/**
 * A continuation page: the same page element, its own established margins, and
 * no repeated header.
 */
function createContinuation(page, view) {
  const continuation = page.cloneNode(false);
  if (continuation.classList?.add) continuation.classList.add(CONTINUATION_CLASS);
  const computed = view?.getComputedStyle ? view.getComputedStyle(page) : null;
  ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'].forEach((side) => {
    const value = computed ? computed[side] : null;
    if (value && continuation.style) continuation.style[side] = value;
  });
  return continuation;
}

/** A runaway guard only: every pass moves content forward, so this cannot bind. */
const MAX_PASSES = 4000;

/**
 * Split one page into as many pages as its content needs.
 *
 * @returns {{ pages: Array, continuations: number }}
 */
export function splitOverflowingPage(page, { budgetMm, measureHeightMm = layoutHeightMm } = {}) {
  if (!page || !(Number.isFinite(budgetMm) || budgetMm === Infinity)) return { pages: [page], continuations: 0 };
  if (measureHeightMm(page) <= budgetMm) return { pages: [page], continuations: 0 };

  const view = page.ownerDocument?.defaultView || null;
  const pages = [page];
  let cursor = 0;
  let passes = 0;

  while (cursor < pages.length && passes < MAX_PASSES) {
    passes += 1;
    const current = pages[cursor];
    if (measureHeightMm(current) <= budgetMm) {
      cursor += 1;
      continue;
    }
    const chunks = contentChunks(current);
    // Nothing left to move: the page is left as it is, so the capture's own fit
    // check still reports it rather than silently clipping it.
    if (chunks.length <= 1) {
      cursor += 1;
      continue;
    }

    const moved = [chunks.pop()];
    if (chunks.length > 1 && isHeadingBlock(chunks[chunks.length - 1].nodes[0])) {
      moved.unshift(chunks.pop());
    }

    let target = pages[cursor + 1] || null;
    if (!target) {
      target = createContinuation(page, view);
      const anchor = pages[cursor];
      if (anchor.parentNode) anchor.parentNode.insertBefore(target, anchor.nextSibling || null);
      pages.push(target);
    }
    // Read order: the earlier block is placed before the later one.
    for (let index = moved.length - 1; index >= 0; index -= 1) {
      moved[index].nodes.forEach((node) => target.insertBefore(node, target.firstChild || null));
    }
  }

  return { pages, continuations: pages.length - 1 };
}

/**
 * Every page that fits its sheet, in document order.
 *
 * @param {Object} params
 * @param {Array<Element>} params.pages — the composed page frames
 * @param {{heightMm: number}} params.paper — the sheet they print on
 * @param {number} [params.toleranceMm]
 * @param {(element: Element) => number} [params.measureHeightMm] — injectable
 *   measurement, so the composition itself is never assumed
 * @returns {{ pages: Array<Element>, continuations: number }}
 */
export function paginateFlowPages({
  pages = [],
  paper = null,
  toleranceMm = FLOW_FIT_TOLERANCE_MM,
  measureHeightMm = layoutHeightMm,
} = {}) {
  const sheetMm = Number(paper?.heightMm);
  const budgetMm = Number.isFinite(sheetMm) && sheetMm > 0 ? sheetMm + toleranceMm : Infinity;
  const ordered = [];
  let continuations = 0;

  (Array.isArray(pages) ? pages : []).forEach((page) => {
    const split = splitOverflowingPage(page, { budgetMm, measureHeightMm });
    ordered.push(...split.pages);
    continuations += split.continuations;
  });

  return { pages: ordered, continuations };
}

export default paginateFlowPages;