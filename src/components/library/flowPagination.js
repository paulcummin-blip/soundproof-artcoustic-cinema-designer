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

/** The continuation page a page's overflow is moved onto. */
function continuationFor(pages, cursor, page, view) {
  if (pages[cursor + 1]) return pages[cursor + 1];
  const target = createContinuation(page, view);
  const anchor = pages[cursor];
  if (anchor.parentNode) anchor.parentNode.insertBefore(target, anchor.nextSibling || null);
  pages.push(target);
  return target;
}

/** True when the element is a table. */
function isTableElement(element) {
  return isElement(element) && String(element.tagName || '').toUpperCase() === 'TABLE';
}

/** The table a block carries, whether the block is the table or contains one. */
function findTable(element) {
  if (!isElement(element)) return null;
  if (isTableElement(element)) return element;
  return typeof element.querySelector === 'function' ? element.querySelector('table') : null;
}

/** A table's body rows, in printed order. */
function tableRows(table) {
  const bodies = table.tBodies ? Array.from(table.tBodies) : [];
  if (bodies.length) return bodies.flatMap((body) => Array.from(body.rows || []));
  return Array.from(table.rows || []);
}

/** A table's shell: its own attributes with its column headings repeated. */
function tableShell(table) {
  const shell = table.cloneNode(false);
  const head = table.tHead || (typeof table.querySelector === 'function' ? table.querySelector('thead') : null);
  if (head) shell.appendChild(head.cloneNode(true));
  return shell;
}

/** What the block printed after its table — the note that closes it. */
function nodesAfterTable(host, table) {
  if (host === table) return [];
  return Array.from(host.childNodes || []).filter((node) => node !== table && isElement(node));
}

/**
 * Continue a table between whole rows.
 *
 * A table is not one indivisible statement: its rows are. Where the trailing
 * block of an over-tall page is (or carries) a table, the rows that fit stay with
 * the heading and the introduction above them and the rest continue onto the next
 * sheet under the table's own repeated column headings. Every row travels whole,
 * in reading order, and the note that closes the table continues with the rows it
 * explains — so the heading is never left holding a sheet on its own.
 *
 * @returns {boolean} true when rows were moved
 */
function splitTrailingTable(current, budgetMm, measureHeightMm, continuation) {
  const chunks = contentChunks(current);
  const host = chunks.length ? chunks[chunks.length - 1].nodes[0] : null;
  const table = findTable(host);
  if (!table) return false;

  const rows = tableRows(table);
  // One row is one statement: a table of a single row is never divided.
  if (rows.length < 2) return false;

  const rowsHeightMm = rows.reduce((total, row) => total + measureHeightMm(row), 0);
  // Everything the page carries apart from those rows: its chrome, its heading,
  // its introduction and the table's own column headings.
  const withoutRowsMm = measureHeightMm(current) - rowsHeightMm;
  let keep = rows.length;
  let keptMm = rowsHeightMm;
  while (keep > 0 && withoutRowsMm + keptMm > budgetMm) {
    keep -= 1;
    keptMm -= measureHeightMm(rows[keep]);
  }
  // The table does fit on the sheet after all.
  if (keep >= rows.length) return false;

  const document_ = host.ownerDocument || null;
  const onContinuation = host === table ? tableShell(table) : host.cloneNode(false);
  if (host !== table) onContinuation.appendChild(tableShell(table));
  const continuationTable = host === table ? onContinuation : onContinuation.lastChild;
  const body = document_ && typeof document_.createElement === 'function'
    ? document_.createElement('tbody')
    : null;
  if (body) continuationTable.appendChild(body);

  // The rows are moved, never copied: the row prints once, in reading order.
  rows.slice(keep).forEach((row) => (body || continuationTable).appendChild(row));
  nodesAfterTable(host, table).forEach((node) => onContinuation.appendChild(node));

  continuation().appendChild(onContinuation);
  return true;
}

/**
 * Open a block that cannot itself fit a sheet.
 *
 * A wrapper is a container, not a statement: where the only block left on an
 * over-tall page is a container holding blocks of its own, those blocks are moved
 * up into the page so they can flow onto the next sheet. A page whose only block
 * is a real statement is left exactly as it is, so the capture's own fit check
 * still reports it rather than hiding it.
 */
function openContainer(page, chunk) {
  const element = chunk.nodes[0];
  if (!isElement(element)) return false;
  const children = Array.from(element.childNodes || []).filter(isElement);
  if (children.length < 2) return false;
  const parent = element.parentNode;
  if (!parent || typeof parent.insertBefore !== 'function') return false;

  Array.from(element.childNodes || []).forEach((node) => parent.insertBefore(node, element));
  if (typeof parent.removeChild === 'function' && element.parentNode === parent) parent.removeChild(element);
  return true;
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
    // A table continues between whole rows: the heading and its introduction keep
    // the rows that fit on this sheet and the rest print under the table's own
    // repeated column headings. A heading is never left holding a sheet alone.
    if (splitTrailingTable(current, budgetMm, measureHeightMm, () => continuationFor(pages, cursor, page, view))) {
      continue;
    }

    const chunks = contentChunks(current);
    // Nothing movable on the page itself. A container taller than a sheet is
    // opened so the blocks inside it can flow; a page carrying one real block is
    // left as it is, so the capture's own fit check still reports it rather than
    // silently clipping it.
    if (chunks.length <= 1) {
      if (chunks.length === 1 && openContainer(current, chunks[0])) continue;
      cursor += 1;
      continue;
    }

    const moved = [chunks.pop()];
    if (chunks.length > 1 && isHeadingBlock(chunks[chunks.length - 1].nodes[0])) {
      moved.unshift(chunks.pop());
    }

    const target = continuationFor(pages, cursor, page, view);
    // Read order: the earlier block is placed before the later one, and a block's
    // own nodes keep the order they had — each is placed before the first child,
    // so they are walked backwards to end up forwards.
    for (let index = moved.length - 1; index >= 0; index -= 1) {
      const nodes = moved[index].nodes;
      for (let position = nodes.length - 1; position >= 0; position -= 1) {
        target.insertBefore(nodes[position], target.firstChild || null);
      }
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