/**
 * highlights-one-sheet-fitting.test.mjs
 * -------------------------------------
 * ACCEPTANCE — the Key Performance Highlights section is composed as ONE A4 sheet,
 * with its closing note inside every measurement.
 *
 * The confirmed defect: the one-sheet fit measured the section BEFORE the
 * compositor applied its own page frame, so the composition was measured at the
 * print window's own width. The table passed as fitting, no row was withdrawn,
 * and the section then measured 266.1 mm against 261.0 mm of printable height at
 * the real 210 mm page width — 5.1 mm over, with the 11.6 mm closing note the part
 * that could not be placed. The page then fell into the generic content-unit path,
 * where the closing note is a paragraph the paragraph fallback refuses.
 *
 * The fixture below reproduces exactly those numbers. What is asserted:
 *
 *   A  the reported composition (266.1 used / 261.0 printable / note 11.6) is
 *      measured in the compositor's own frame and fits by tightening spacing only,
 *      with no row withdrawn and the closing note kept
 *   B  when tightening is not enough the least valuable rows are withdrawn, one at
 *      a time, the COMPLETE composition — note included — being measured again
 *   C  a composition that carries a table but not its closing note is refused
 *      rather than accepted
 *   D  a section that cannot be fitted legibly is reported, never clipped: the note
 *      stays, no row below the legible floor is withdrawn, no text is rewritten
 *   E  the same authority composes a many-option comparison table, measured as ONE
 *      block
 *   F  the compositor keeps a highlights page WHOLE and never hands its closing note
 *      to the paragraph-fragmentation fallback
 *   G  a row that states a real limitation is kept while anything else can go
 *
 * BOUNDARY. The compositor's own arithmetic is exercised: the fixture is measured
 * with `pageMeasurement` itself against modelled geometry, so the sheet budget
 * (297 − 16 − 20 = 261.0 mm) is the real one. Only the browser's layout engine is
 * modelled; no rule is weakened to make the suite run, and no live proposal record
 * is read or written.
 */
import { describe, it, expect } from 'vitest';

import { fitHighlightsSection } from '../components/proposal/export/composition/highlightsFitting.js';
import { composeProposalFrames } from '../components/proposal/export/browserProposalComposition.js';
import { pageMeasurement } from '../components/proposal/export/composition/proposalPageGeometry.js';
import {
  nextHighlightRowToDrop,
  statesSignificantLimitation,
} from '../components/proposal/keyPerformanceHighlightsAuthority.js';

const MM_TO_PX = 96 / 25.4;
/** The proposal page frame: 22/18/20 mm padding, with the evidence page's 16 mm top. */
const PAGE_PADDING_TOP_MM = 16;
const PAGE_PADDING_BOTTOM_MM = 20;
const PRINTABLE_MM = 297 - PAGE_PADDING_TOP_MM - PAGE_PADDING_BOTTOM_MM;
/** The composition the reported Genesis export measured. */
const REPORTED_USED_MM = 266.1;
const NOTE_MM = 11.6;
const NOTE_GAP_MM = 2;
const TABLE_GAP_MM = 5;
const HEADER_ROW_MM = 9;
const ROW_PITCH_MM = 14;
/** The 1.2mm cell padding tightened to 0.9mm: 0.6mm per row, header included. */
const PADDING_SAVING_MM = 0.6;
/** Heading and introduction together: chosen so eight rows reproduce 266.1 mm. */
const HEADER_BLOCK_MM = 50;
const INTRO_MM = REPORTED_USED_MM - NOTE_MM - NOTE_GAP_MM - TABLE_GAP_MM - HEADER_ROW_MM
  - ROW_PITCH_MM * 8 - HEADER_BLOCK_MM;
const LEGIBLE_FLOOR = 4;

const SUMMARY_ROWS = Object.freeze([
  { key: 'rp23_viewing', area: 'Viewing Geometry', result: 'Row 1 L4, 63° / Row 2 L3, 45°' },
  { key: 'p4', area: 'Spatial Resolution', result: 'L3 · ±4 dB' },
  { key: 'p5', area: 'Spatial Resolution', result: 'L3 · 52°' },
  { key: 'p12', area: 'Dynamic Range', result: 'L3 · 108 dB' },
  { key: 'p16', area: 'Timbre Matching', result: 'L3 · ±3 dB' },
  { key: 'p18', area: 'Bass Performance', result: 'L3 · 25 Hz' },
  { key: 'p19', area: 'Bass Performance', result: 'L3 · −4 dB' },
  { key: 'p20', area: 'Bass Performance', result: 'L3 · ±5 dB' },
]);

/* ── A modelled print document, measured by the compositor's own arithmetic ── */

const documentStub = { defaultView: { getComputedStyle } };

function getComputedStyle(node) {
  if (node.kind === 'page') {
    return {
      paddingTop: `${PAGE_PADDING_TOP_MM * MM_TO_PX}px`,
      paddingBottom: `${PAGE_PADDING_BOTTOM_MM * MM_TO_PX}px`,
      borderTopWidth: '0px',
      borderBottomWidth: '0px',
      marginBottom: '0px',
    };
  }
  return {
    paddingTop: '0px', paddingBottom: '0px',
    borderTopWidth: '0px', borderBottomWidth: '0px', marginBottom: '0px',
  };
}

function matchesSimple(node, step) {
  if (step === '*') return true;
  const classes = [...step.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
  const tag = step.replace(/\..*$/, '');
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  return classes.every((name) => node.classNames.includes(name));
}

function matches(node, selector) {
  return String(selector).split(',').some((part) => {
    const steps = part.trim().split(/\s+/);
    let current = node;
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      if (index === steps.length - 1) {
        if (!matchesSimple(current, steps[index])) return false;
      } else {
        let ancestor = current.parent;
        let found = null;
        while (ancestor) {
          if (matchesSimple(ancestor, steps[index])) { found = ancestor; break; }
          ancestor = ancestor.parent;
        }
        if (!found) return false;
        current = found;
      }
    }
    return true;
  });
}

function descendants(node, visit) {
  node.childNodes.forEach((child) => { visit(child); descendants(child, visit); });
}

class FakeStyle {
  constructor() { this.props = new Map(); }
  setProperty(name, value) { this.props.set(name, String(value)); }
  getPropertyValue(name) { return this.props.get(name) ?? ''; }
}

class FakeNode {
  constructor({ tag = 'div', classes = [], kind = 'block', heightMm = 0, dataset = {}, text = '' } = {}) {
    this.tagName = tag.toUpperCase();
    this.classNames = classes;
    this.kind = kind;
    this.heightMm = heightMm;
    this.dataset = { ...dataset };
    this.ownText = text;
    this.style = new FakeStyle();
    this.parent = null;
    this.childNodes = [];
    this.ownerDocument = documentStub;
  }
  get children() { return this.childNodes; }
  get classList() { return this.classNames; }
  get textContent() {
    return [this.ownText, ...this.childNodes.map((child) => child.textContent)].filter(Boolean).join(' ');
  }
  append(child) { child.parent = this; this.childNodes.push(child); return child; }
  remove() {
    if (this.parent) this.parent.childNodes = this.parent.childNodes.filter((node) => node !== this);
    this.parent = null;
  }
  matches(selector) { return matches(this, selector); }
  querySelectorAll(selector) {
    const found = [];
    descendants(this, (node) => { if (matches(node, selector)) found.push(node); });
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  removeAttribute() {}
  setAttribute() {}
  getBoundingClientRect() {
    const offset = offsetFromPageTop(this);
    const height = boxHeightMm(this);
    return {
      top: offset * MM_TO_PX,
      bottom: (offset + height) * MM_TO_PX,
      height: height * MM_TO_PX,
      width: 794,
      left: 0,
      right: 794,
    };
  }
}

function gapMm(node, fallback) {
  const inline = node.style.getPropertyValue('margin-top');
  return inline ? parseFloat(inline) || 0 : fallback;
}

function boxHeightMm(node) {
  const children = node.childNodes.reduce((sum, child) => sum + boxHeightMm(child), 0);
  if (node.kind === 'page') {
    return PAGE_PADDING_TOP_MM + children + PAGE_PADDING_BOTTOM_MM;
  }
  if (node.kind === 'table') {
    const tight = node.dataset.padding === 'tight';
    const rows = node.querySelectorAll('tbody tr').length;
    const pitch = tight ? ROW_PITCH_MM - PADDING_SAVING_MM : ROW_PITCH_MM;
    const header = tight ? HEADER_ROW_MM - PADDING_SAVING_MM : HEADER_ROW_MM;
    return gapMm(node, TABLE_GAP_MM) + header + rows * pitch;
  }
  if (node.kind === 'note') return gapMm(node, NOTE_GAP_MM) + NOTE_MM;
  return node.heightMm + children;
}

function offsetFromPageTop(node) {
  if (node.kind === 'page') return 0;
  const chain = [];
  let current = node;
  while (current && current.kind !== 'page') { chain.unshift(current); current = current.parent; }
  if (!current) return 0;
  let offset = PAGE_PADDING_TOP_MM;
  let cursor = current;
  for (const child of chain) {
    for (const sibling of cursor.childNodes) {
      if (sibling === child) break;
      offset += boxHeightMm(sibling);
    }
    cursor = child;
  }
  return offset;
}

/** The evidence page: heading, introduction, and the table with its closing note. */
function highlightsPage({ rows = SUMMARY_ROWS, note = true, headerMm = HEADER_BLOCK_MM, introMm = INTRO_MM } = {}) {
  const page = new FakeNode({
    tag: 'section',
    classes: ['proposal-print-section', 'pp-page', 'pp-page--highlights', 'proposal-print-section--highlights'],
    kind: 'page',
  });
  page.append(new FakeNode({ tag: 'header', classes: ['pp-header'], heightMm: headerMm }));
  page.append(new FakeNode({ tag: 'div', classes: ['pp-body', 'pp-highlights__intro'], heightMm: introMm }));
  const wrapper = page.append(new FakeNode({ tag: 'div' }));
  const table = wrapper.append(new FakeNode({
    tag: 'table',
    classes: ['kph-table', 'kph-table--summary'],
    kind: 'table',
  }));
  const headRow = table.append(new FakeNode({ tag: 'thead' })).append(new FakeNode({ tag: 'tr' }));
  ['Performance area', 'Parameter', 'Result', 'What the room gains']
    .forEach((label) => headRow.append(new FakeNode({ tag: 'th', text: label })));
  const body = table.append(new FakeNode({ tag: 'tbody' }));
  rows.forEach((row) => {
    const tr = body.append(new FakeNode({
      tag: 'tr',
      dataset: { rowKey: row.key, rowArea: row.area },
      text: row.result,
    }));
    ['area', 'parameter', 'result', 'gain'].forEach(() => tr.append(new FakeNode({ tag: 'td' })));
  });
  if (note) wrapper.append(new FakeNode({ tag: 'p', classes: ['kph-table__note'], kind: 'note' }));
  return { page, table, body, wrapper };
}

/** The compositor's measurement, recording what it saw on each call. */
function recordingMeasure(page) {
  const calls = [];
  const measure = (node) => {
    const measured = pageMeasurement(node);
    calls.push({
      framedWidth: node.style.getPropertyValue('width'),
      notePresent: Boolean(node.querySelector?.('.kph-table__note')),
      usedMm: measured.usedMm,
      availableMm: measured.availableMm,
    });
    return measured;
  };
  measure.calls = calls;
  return measure;
}

const rowKeys = (body) => body.querySelectorAll('tbody tr').map((row) => row.dataset.rowKey);
const rowText = (body) => body.querySelectorAll('tbody tr').map((row) => row.textContent);

describe('Key Performance Highlights — one A4 sheet, closing note included', () => {
  it('the fixture reproduces the reported measurements: 266.1 mm used of 261.0 mm printable', () => {
    const { page } = highlightsPage();
    const measured = pageMeasurement(page);
    expect(measured.usedMm).toBeCloseTo(REPORTED_USED_MM, 1);
    expect(measured.availableMm).toBeCloseTo(PRINTABLE_MM, 1);
    expect(measured.usedMm - measured.availableMm).toBeCloseTo(5.1, 1);
    expect(measured.fits).toBe(false);
  });

  it('A. fits the reported composition on one sheet by its own spacing, keeping every row and the note', () => {
    const { page, table, body } = highlightsPage();
    const before = rowText(body);
    const measure = recordingMeasure(page);

    expect(fitHighlightsSection(page, measure)).toBe(true);

    // Measured in the compositor's own frame, from the very first measurement.
    expect(measure.calls.every((call) => call.framedWidth === '210mm')).toBe(true);
    // The complete composition was measured — the closing note was in every one.
    expect(measure.calls.every((call) => call.notePresent)).toBe(true);
    // Spacing gave way, not content: every row is still printed, values untouched.
    expect(rowKeys(body)).toHaveLength(SUMMARY_ROWS.length);
    expect(rowText(body)).toEqual(before);
    expect(table.dataset.padding).toBe('tight');
    expect(parseFloat(table.style.getPropertyValue('margin-top'))).toBe(3);
    // Spacing gave way in order and stopped as soon as the sheet was satisfied:
    // the closing note's own gap was not needed on this composition.
    const noteGap = page.querySelector('.kph-table__note').style.getPropertyValue('margin-top');
    expect(['', '1.2mm']).toContain(noteGap);
    // And it now fits the sheet with headroom.
    const fitted = pageMeasurement(page);
    expect(fitted.fits).toBe(true);
    expect(fitted.availableMm - fitted.usedMm).toBeGreaterThanOrEqual(1.5);
  });

  it('B. withdraws the least valuable row one at a time, re-measuring the complete composition', () => {
    const { page, body } = highlightsPage({ headerMm: 70 });
    const measure = recordingMeasure(page);
    const before = rowText(body);

    expect(fitHighlightsSection(page, measure)).toBe(true);

    const remaining = rowKeys(body);
    expect(remaining).toEqual(['rp23_viewing', 'p4', 'p5', 'p12', 'p16', 'p18']);
    // Only whole rows left the table, and no row that stayed was rewritten.
    const kept = rowText(body);
    expect(kept).toEqual(before.filter((_, index) => index < kept.length));
    // Every withdrawal was followed by a measurement of the whole composition.
    expect(measure.calls.length).toBeGreaterThanOrEqual(4);
    expect(measure.calls.every((call) => call.framedWidth === '210mm' && call.notePresent)).toBe(true);
    expect(pageMeasurement(page).availableMm - pageMeasurement(page).usedMm).toBeGreaterThanOrEqual(1.5);
  });

  it('C. refuses a composition that carries a table but not its closing note', () => {
    const { page, body } = highlightsPage({ note: false });
    const before = rowText(body);

    expect(fitHighlightsSection(page, pageMeasurement)).toBe(false);
    // Nothing was accepted, and nothing was cut to try to make it fit.
    expect(rowText(body)).toEqual(before);
    expect(page.querySelector('.kph-table__note')).toBeNull();
  });

  it('D. reports a section that cannot be fitted legibly instead of clipping it', () => {
    const { page, body } = highlightsPage({ headerMm: 220 });
    const before = rowText(body);

    expect(fitHighlightsSection(page, pageMeasurement)).toBe(false);
    // The legible floor is respected, the closing note stays, and every row that
    // was withdrawn is gone WHOLE: nothing that remains was re-worded or trimmed.
    expect(rowKeys(body)).toEqual(['rp23_viewing', 'p4', 'p12', 'p16']);
    expect(rowText(body)).toHaveLength(LEGIBLE_FLOOR);
    expect(rowText(body).every((text) => before.includes(text))).toBe(true);
    expect(page.querySelector('.kph-table__note')).not.toBeNull();
    expect(pageMeasurement(page).fits).toBe(false);
  });

  it('E. composes a many-option comparison table as one block, on one sheet', () => {
    const rows = [
      ...SUMMARY_ROWS,
      { key: 'p3', area: 'Spatial Resolution', result: 'L3 · 42°' },
      { key: 'p9', area: 'Spatial Resolution', result: 'L3 · 45°' },
      { key: 'p13', area: 'Dynamic Range', result: 'L3 · 104 dB' },
      { key: 'p17', area: 'Timbre Matching', result: 'L3 · ±4 dB' },
      { key: 'p14', area: 'Dynamic Range', result: 'L3 · 112 dB' },
    ];
    const { page, table, body } = highlightsPage({ rows: rows.map((row) => ({ ...row })) });

    expect(fitHighlightsSection(page, pageMeasurement)).toBe(true);
    // Still ONE table on the sheet, with its header row and its closing note.
    expect(page.querySelectorAll('table')).toHaveLength(1);
    expect(table.querySelector('thead')).not.toBeNull();
    expect(page.querySelector('.kph-table__note')).not.toBeNull();
    expect(rowKeys(body).length).toBeLessThan(rows.length);
    expect(rowKeys(body).length).toBeGreaterThanOrEqual(LEGIBLE_FLOOR);
  });

  it('F. the compositor keeps the highlights page whole and never fragments its closing note', () => {
    const { page } = highlightsPage();
    const completed = composeProposalFrames([page]);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toBe(page);
    expect(page.dataset.paginationFrame).toBe('0');

    const unfittable = highlightsPage({ headerMm: 220 });
    let error = null;
    try {
      composeProposalFrames([unfittable.page]);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).not.toBeNull();
    // The specific one-sheet failure, and NOT the paragraph fallback's refusal.
    expect(error.message).toMatch(/Key Performance Highlights section cannot fit one A4 sheet/);
    expect(error.paginationDiagnostics).toBeUndefined();
    expect(unfittable.page.querySelector('.kph-table__note')).not.toBeNull();
  });

  it('G. keeps a row that states a real limitation while anything else can be withdrawn', () => {
    expect(statesSignificantLimitation('L1 · 48°')).toBe(true);
    expect(statesSignificantLimitation('L2 · −8 dB')).toBe(true);
    expect(statesSignificantLimitation('L4 · 63°')).toBe(false);
    expect(statesSignificantLimitation('')).toBe(false);

    const printed = (rows) => rows.map((row) => ({ ...row, limitation: statesSignificantLimitation(row.result) }));
    const withLimitation = printed([
      { key: 'rp23_viewing', area: 'Viewing Geometry', result: 'Row 1 L4, 63°' },
      { key: 'p12', area: 'Dynamic Range', result: 'L3 · 108 dB' },
      { key: 'p16', area: 'Timbre Matching', result: 'L2 · ±5 dB' },
      { key: 'p18', area: 'Bass Performance', result: 'L3 · 25 Hz' },
      { key: 'p19', area: 'Bass Performance', result: 'L3 · −4 dB' },
    ]);
    // The repeated bass row goes; the timbre limitation stays.
    expect(nextHighlightRowToDrop(withLimitation)).toBe('p19');

    const onlyLimitationLeft = printed([
      { key: 'rp23_viewing', area: 'Viewing Geometry', result: 'Row 1 L4, 63°' },
      { key: 'p12', area: 'Dynamic Range', result: 'L3 · 108 dB' },
      { key: 'p16', area: 'Timbre Matching', result: 'L2 · ±5 dB' },
    ]);
    expect(nextHighlightRowToDrop(onlyLimitationLeft)).toBe('p12');

    const allLimitations = printed([
      { key: 'rp23_viewing', area: 'Viewing Geometry', result: 'Row 1 L1, 40°' },
      { key: 'p16', area: 'Timbre Matching', result: 'L2 · ±5 dB' },
    ]);
    // When nothing else can go the summary is still trimmed rather than frozen:
    // the viewing geometry is the last thing the client reads that is withdrawn.
    expect(nextHighlightRowToDrop(allLimitations)).toBe('p16');
  });
});