/**
 * pagination-failure-diagnostics.test.mjs
 * ---------------------------------------
 * The export already refuses to remove content: when a block cannot be
 * fragmented it stops. This proves the stop now SAYS WHICH block it was — the
 * section, the editorial composition, the element, its measured height and the
 * printable height it exceeded — and that the record carries no narrative.
 *
 * The failure itself is unchanged: the message the designer sees is the existing
 * safe one. Only the diagnostics are new.
 */

import { describe, it, expect } from 'vitest';
import {
  describePaginationFailure,
  formatPaginationFailureDiagnostics,
  FRAGMENT_REFUSAL,
  REFUSAL_MESSAGE,
  paginationFailureError,
} from '../components/proposal/export/composition/paginationFailureDiagnostics.js';

const ATTRIBUTES = {
  '[data-editorial-section]': 'editorialSection',
  '[data-editorial-composition]': 'editorialComposition',
  '[data-editorial-block]': 'editorialBlock',
};

function fakeElement({ tag = 'div', classes = [], dataset = {}, children = [], text = '' } = {}) {
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: classes.join(' '),
    classList: classes,
    dataset,
    id: '',
    textContent: text,
    children,
    parentElement: null,
    matches(selector) {
      return selector.split(',').some((part) => {
        const value = part.trim();
        if (value.startsWith('.')) return classes.includes(value.slice(1));
        if (value.startsWith('[')) return dataset[ATTRIBUTES[value]] !== undefined;
        return tag.toLowerCase() === value.toLowerCase();
      });
    },
    closest(selector) {
      let current = node;
      while (current) {
        if (current.matches(selector)) return current;
        current = current.parentElement;
      }
      return null;
    },
    querySelectorAll(selector) {
      const found = [];
      const walk = (parent) => parent.children.forEach((child) => {
        if (child.matches(selector)) found.push(child);
        walk(child);
      });
      walk(node);
      return found;
    },
    querySelector(selector) {
      return node.querySelectorAll(selector)[0] || null;
    },
    getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }),
  };
  children.forEach((child) => { child.parentElement = node; });
  return node;
}

/** The measured sheet: an element alone, then the sheet carrying it with one prefix block. */
const measure = (units) => ({
  fits: false,
  used: 0,
  budget: 273 * (96 / 25.4),
  usedMm: units.length === 1 ? 214.6 : 291.2,
  availableMm: 273,
});

function genesisLikeBlock() {
  const image = fakeElement({ tag: 'img', classes: ['pp-media__image'] });
  const figure = fakeElement({
    tag: 'figure',
    classes: ['pp-media', 'pp-media--comparison'],
    dataset: { paginationOrigin: '3:128' },
    children: [image],
    text: 'Comparison option',
  });
  const block = fakeElement({
    classes: ['pp-pillar'],
    dataset: { editorialBlock: 'pillar' },
    children: [figure],
  });
  const composition = fakeElement({
    classes: ['pp-composition'],
    dataset: { editorialComposition: 'opening' },
    children: [block],
  });
  const title = fakeElement({ tag: 'h2', classes: ['pp-header__title'], text: 'Timbre Matching' });
  const section = fakeElement({
    classes: ['pp-pillar'],
    dataset: { editorialSection: 'timbre_matching' },
    children: [title, composition],
  });
  const page = fakeElement({
    classes: ['pp-page', 'pp-page--timbre_matching'],
    dataset: { paginationFrame: '3' },
    children: [section],
  });
  page.parentElement = null;
  return { page, figure };
}

describe('pagination failure diagnostics', () => {
  it('names the exact section, composition, element and measurements', () => {
    const { figure } = genesisLikeBlock();
    const diagnostics = describePaginationFailure({
      unit: { source: figure, node: figure, via: 'block-fragments' },
      prefix: [{ source: figure }],
      measureUnits: measure,
      allocation: { index: 4, total: 9, frame: '3' },
      refusal: FRAGMENT_REFUSAL.NO_FRAGMENTABLE_PARAGRAPH,
      target: null,
    });

    expect(diagnostics.section).toEqual({ type: 'timbre_matching', name: 'Timbre Matching' });
    expect(diagnostics.composition).toBe('opening');
    expect(diagnostics.block).toBe('pillar');
    expect(diagnostics.element.label).toBe('figure.pp-media.pp-media--comparison');
    expect(diagnostics.element.identifier).toBe('3:128');
    expect(diagnostics.element.containerPath).toContain('figure.pp-media');
    expect(diagnostics.page).toContain('pp-page--timbre_matching');
    expect(diagnostics.allocation).toEqual({ frame: '3', unitIndex: 4, unitCount: 9 });
    expect(diagnostics.deliveredBy).toBe('block-fragments');
    expect(diagnostics.fallbackPath).toContain('section:timbre_matching');
    expect(diagnostics.fallbackPath).toContain('delivered-by:block-fragments');
  });

  it('states the measured element height, the printable height and the overflow', () => {
    const { figure } = genesisLikeBlock();
    const diagnostics = describePaginationFailure({
      unit: { source: figure, node: figure, via: 'composition-whole' },
      prefix: [{ source: figure }],
      measureUnits: measure,
      refusal: FRAGMENT_REFUSAL.INDIVISIBLE_CONTENT,
      target: null,
    });

    expect(diagnostics.measurements.elementMm).toBe(214.6);
    expect(diagnostics.measurements.sheetUsedMm).toBe(291.2);
    expect(diagnostics.measurements.printableMm).toBe(273);
    expect(diagnostics.measurements.overflowMm).toBe(18.2);
    expect(diagnostics.measurements.precedingBlocks).toBe(1);
  });

  it('records what the block holds, by kind and count, and never its copy', () => {
    const { figure } = genesisLikeBlock();
    const diagnostics = describePaginationFailure({
      unit: { source: figure, node: figure },
      prefix: [],
      measureUnits: measure,
      refusal: FRAGMENT_REFUSAL.INDIVISIBLE_CONTENT,
      target: null,
    });

    expect(diagnostics.content.image).toBe(1);
    expect(diagnostics.content.table).toBe(0);
    expect(diagnostics.content.text).toBe(true);
    expect(diagnostics.content.characters).toBeGreaterThan(0);
    expect(JSON.stringify(diagnostics)).not.toContain('Comparison option');
  });

  it('keeps the existing safe failure message and carries the record on it', () => {
    const { figure } = genesisLikeBlock();
    const error = paginationFailureError({
      unit: { source: figure, node: figure, via: 'block-fragments' },
      prefix: [],
      measureUnits: measure,
      refusal: FRAGMENT_REFUSAL.NO_FRAGMENTABLE_PARAGRAPH,
      target: null,
    });

    expect(error.message).toBe(REFUSAL_MESSAGE[FRAGMENT_REFUSAL.NO_FRAGMENTABLE_PARAGRAPH]);
    expect(error.message).toContain('Export stopped without removing content');
    expect(error.paginationDiagnostics.element.identifier).toBe('3:128');
  });

  it('formats a copyable record without console access', () => {
    const { figure } = genesisLikeBlock();
    const text = formatPaginationFailureDiagnostics(describePaginationFailure({
      unit: { source: figure, node: figure, via: 'block-fragments' },
      prefix: [{ source: figure }],
      measureUnits: measure,
      allocation: { index: 4, total: 9, frame: '3' },
      refusal: FRAGMENT_REFUSAL.NO_FRAGMENTABLE_PARAGRAPH,
      target: null,
    }));

    expect(text).toContain('PROPOSAL EXPORT — PAGINATION STOPPED');
    expect(text).toContain('Section: Timbre Matching [timbre_matching]');
    expect(text).toContain('Element: figure.pp-media.pp-media--comparison');
    expect(text).toContain('Element height: 214.6 mm');
    expect(text).toContain('of 273.0 mm printable');
    expect(text).toContain('Allocation position: 4 of 9');
    expect(text).toContain('Refused because:');
  });

  it('survives a block with no identity at all, rather than failing the export report', () => {
    const orphan = fakeElement({ tag: 'p', classes: ['pp-body'], text: 'Copy' });
    const diagnostics = describePaginationFailure({
      unit: { source: orphan, node: orphan },
      prefix: [],
      measureUnits: measure,
      refusal: FRAGMENT_REFUSAL.INDIVISIBLE_CONTENT,
      target: orphan,
    });

    expect(diagnostics.section).toBeNull();
    expect(diagnostics.element.label).toBe('p.pp-body');
    expect(formatPaginationFailureDiagnostics(diagnostics)).toContain('not an editorial section');
  });
});