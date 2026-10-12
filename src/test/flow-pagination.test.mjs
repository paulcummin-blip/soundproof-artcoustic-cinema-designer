/**
 * Acceptance: flow pagination for the client specification pack.
 * -------------------------------------------------------------
 * A proposal section is as tall as its copy. The printed document flows it onto
 * the next sheet, but the capture that stores the issued PDF rasterises one
 * canvas per page frame — so a frame taller than A4 was a page that could not be
 * stored at all.
 *
 * These checks run the real splitting logic against a measured page model: the
 * page's own chrome plus the blocks it carries. Nothing is clipped, nothing is
 * dropped, and a page that genuinely cannot be split is left alone so the
 * capture's own fit check still reports it.
 */
import { describe, it, expect } from 'vitest';

import {
  CONTINUATION_CLASS,
  FLOW_HEADING_CLASSES,
  contentChunks,
  paginateFlowPages,
  splitOverflowingPage,
} from '../components/library/flowPagination.js';
import { PACK_HEADING_SELECTORS } from '../components/proposal/print/proposalPageBreakRules.js';
import { ISSUED_DOCUMENT_COMPOSITION, ISSUED_DOCUMENT_TYPE } from '../components/library/issuedDocument/issuedDocumentTypes.js';

const MM_TO_PX = 96 / 25.4;

/* ── A measured page model: chrome + the blocks the page carries ───────────── */

class FakeClassList {
  constructor(names = []) { this.names = new Set(names); }
  add(name) { this.names.add(name); }
  contains(name) { return this.names.has(name); }
  list() { return [...this.names]; }
}

class FakeElement {
  constructor(tagName = 'SECTION', { classes = [], chromeMm = 0, blockMm = 0 } = {}) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList(classes);
    this.style = {};
    this.childNodes = [];
    this.parentNode = null;
    this.pageChromeMm = chromeMm;
    this.blockHeightMm = blockMm;
    this.computed = { paddingTop: '22mm', paddingBottom: '20mm', paddingLeft: '18mm', paddingRight: '18mm' };
    const self = this;
    this.ownerDocument = { defaultView: { getComputedStyle: (element) => element.computed || self.computed } };
  }

  get firstChild() { return this.childNodes[0] || null; }

  get nextSibling() {
    const parent = this.parentNode;
    if (!parent) return null;
    const index = parent.childNodes.indexOf(this);
    return index >= 0 ? parent.childNodes[index + 1] || null : null;
  }

  detach(node) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
  }

  insertBefore(node, reference) {
    if (node.parentNode && node.parentNode !== this) node.parentNode.detach(node);
    else if (node.parentNode === this) this.detach(node);
    const index = reference ? this.childNodes.indexOf(reference) : -1;
    if (index === -1) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }

  appendChild(node) { return this.insertBefore(node, null); }

  cloneNode() {
    const clone = new FakeElement(this.tagName, {
      classes: this.classList.list(),
      chromeMm: this.pageChromeMm,
    });
    clone.ownerDocument = this.ownerDocument;
    return clone;
  }
}

const text = () => ({ nodeType: 3, textContent: ' ', parentNode: null });

/** The page's laid-out height: its own chrome plus the blocks it carries. */
function measureHeightMm(page) {
  const pageChrome = page.pageChromeMm || 0;
  const blocks = page.childNodes
    .filter((node) => node.nodeType === 1)
    .reduce((total, child) => total + (child.blockHeightMm || 0), 0);
  return pageChrome + blocks;
}

const block = (tagName, blockMm, classes = []) => new FakeElement(tagName, { classes, blockMm });

/** A page frame with its own chrome, carrying the given blocks. */
function pageWith(blocks, chromeMm = 42, classes = ['proposal-print-section', 'pp-page']) {
  const page = new FakeElement('section', { classes, chromeMm });
  blocks.forEach((child) => page.appendChild(child));
  return page;
}

const elementsOf = (page) => page.childNodes.filter((node) => node.nodeType === 1);
const PAPER = { widthMm: 210, heightMm: 297, marginMm: 0 };
const BUDGET = PAPER.heightMm + 2;

describe('A. a page taller than its sheet continues onto further pages', () => {
  it('moves whole blocks forward until every page fits, losing nothing', () => {
    const blocks = [block('div', 30, ['pp-header']), block('div', 60), block('div', 60), block('div', 60), block('div', 60)];
    const page = pageWith(blocks);
    // 42 chrome + 270 blocks = 312mm: over the sheet.
    expect(measureHeightMm(page)).toBeGreaterThan(BUDGET);

    const { pages, continuations } = paginateFlowPages({ pages: [page], paper: PAPER, measureHeightMm });

    expect(continuations).toBe(1);
    expect(pages).toHaveLength(2);
    pages.forEach((printed) => expect(measureHeightMm(printed)).toBeLessThanOrEqual(BUDGET));
    // Every block is still printed, once, in the order it was written.
    const printedBlocks = pages.flatMap(elementsOf);
    expect(printedBlocks).toHaveLength(blocks.length);
    expect(printedBlocks.map((element) => element.blockHeightMm))
      .toEqual(blocks.map((element) => element.blockHeightMm));
    // The first page keeps the section's own header; the continuation does not
    // repeat it, exactly as a printed continuation sheet does not.
    expect(elementsOf(pages[0])[0].classList.contains('pp-header')).toBe(true);
    expect(elementsOf(pages[1]).some((element) => element.classList.contains('pp-header'))).toBe(false);
  });

  it('composes a continuation in the page\u2019s own design', () => {
    const page = pageWith([block('div', 30, ['pp-header']), block('div', 260)]);
    const { pages } = paginateFlowPages({ pages: [page], paper: PAPER, measureHeightMm });
    const continuation = pages[1];

    expect(continuation.classList.contains(CONTINUATION_CLASS)).toBe(true);
    // The page's own class carries its column width, typography and surfaces.
    expect(continuation.classList.contains('pp-page')).toBe(true);
    // The page's own margins: no page of this document starts at the paper edge.
    expect(continuation.style.paddingTop).toBe('22mm');
    expect(continuation.style.paddingLeft).toBe('18mm');
    expect(continuation.style.paddingBottom).toBe('20mm');
  });

  it('splits into as many pages as the content needs', () => {
    const page = pageWith([
      block('div', 30, ['pp-header']),
      block('div', 120), block('div', 120), block('div', 120), block('div', 120), block('div', 120),
    ]);
    const { pages, continuations } = paginateFlowPages({ pages: [page], paper: PAPER, measureHeightMm });

    expect(continuations).toBe(2);
    expect(pages).toHaveLength(3);
    pages.forEach((printed) => expect(measureHeightMm(printed)).toBeLessThanOrEqual(BUDGET));
    expect(pages.flatMap(elementsOf)).toHaveLength(6);
  });

  it('leaves a page that already fits exactly as it is', () => {
    const page = pageWith([block('div', 30, ['pp-header']), block('div', 180)]);
    const { pages, continuations } = paginateFlowPages({ pages: [page], paper: PAPER, measureHeightMm });
    expect(continuations).toBe(0);
    expect(pages).toEqual([page]);
  });

  it('leaves a page it cannot split alone, so the fit check still reports it', () => {
    const page = pageWith([block('div', 400)]);
    const { pages, continuations } = paginateFlowPages({ pages: [page], paper: PAPER, measureHeightMm });
    expect(continuations).toBe(0);
    expect(pages).toEqual([page]);
    expect(measureHeightMm(pages[0])).toBeGreaterThan(BUDGET);
  });
});

describe('B. the pack\u2019s own reading rules survive the split', () => {
  it('never leaves a heading at the foot of a page', () => {
    const heading = block('h2', 10);
    const page = pageWith([block('div', 30, ['pp-header']), block('div', 220), heading, block('div', 60)]);
    const { pages } = paginateFlowPages({ pages: [page], paper: PAPER, measureHeightMm });

    expect(pages).toHaveLength(2);
    const continuation = elementsOf(pages[1]);
    // The heading travelled with the block it introduces, in that order.
    expect(continuation[0]).toBe(heading);
    expect(continuation[1].blockHeightMm).toBe(60);
    expect(elementsOf(pages[0])).not.toContain(heading);
  });

  it('keeps a text node with the element it belongs to', () => {
    const page = pageWith([block('div', 30, ['pp-header'])]);
    const paragraph = block('div', 300);
    page.appendChild(paragraph);
    const trailingText = text();
    page.appendChild(trailingText);

    const chunks = contentChunks(page);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].nodes).toEqual([paragraph, trailingText]);

    const { pages } = paginateFlowPages({ pages: [page], paper: PAPER, measureHeightMm });
    expect(elementsOf(pages[1])).toEqual([paragraph]);
    expect(pages[1].childNodes).toEqual([paragraph, trailingText]);
  });

  it('reads the pack\u2019s heading set from the one page-break authority', () => {
    const headingSelectors = PACK_HEADING_SELECTORS
      .filter((selector) => selector.startsWith('.'))
      .map((selector) => selector.slice(1));
    // The selectors that name a block by its own class must all be known here,
    // so a heading added to the pack is never stranded by a split.
    headingSelectors
      .filter((selector) => !selector.startsWith('pp-body'))
      .filter((selector) => !selector.includes(' '))
      .forEach((className) => {
        expect(FLOW_HEADING_CLASSES).toContain(className);
      });
    // And every class it claims is a heading the pack really renders.
    FLOW_HEADING_CLASSES.forEach((className) => {
      expect(PACK_HEADING_SELECTORS).toContain(`.${className}`);
    });
  });

  it('measures the real element when no measurement is injected', () => {
    const page = pageWith([]);
    page.getBoundingClientRect = () => ({ height: BUDGET * MM_TO_PX + 5 * MM_TO_PX });
    const { pages } = splitOverflowingPage(page, { budgetMm: BUDGET });
    // Nothing movable inside it, so it is reported rather than silently dropped.
    expect(pages).toEqual([page]);
  });
});

describe('C. only the flow-paginated compositions are re-paginated', () => {
  it('paginates the proposal pack and never a report', () => {
    const packTypes = [
      ISSUED_DOCUMENT_TYPE.PROPOSAL,
      ISSUED_DOCUMENT_TYPE.SYSTEM_DESIGN_SUMMARY,
      ISSUED_DOCUMENT_TYPE.COMPARISON,
    ];
    packTypes.forEach((type) => {
      expect(ISSUED_DOCUMENT_COMPOSITION[type]).toMatchObject({ paginate: true, pageFrame: { heightMm: 297 } });
    });
    [ISSUED_DOCUMENT_TYPE.PROJECT, ISSUED_DOCUMENT_TYPE.VISUAL, ISSUED_DOCUMENT_TYPE.TECHNICAL].forEach((type) => {
      expect(ISSUED_DOCUMENT_COMPOSITION[type].paginate).toBeFalsy();
    });
  });
});