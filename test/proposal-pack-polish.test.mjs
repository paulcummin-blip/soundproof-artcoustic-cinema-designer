/**
 * Acceptance tests for the System Design Summary pack polish:
 * an evidence table whose rows continue between whole rows under a repeated
 * column heading, prose-only narrative sections, honest
 * treatment of Level 1 / Level 2 results, consistent screen terminology, and
 * image-led project image pages.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  HIGHLIGHT_AREA,
  HIGHLIGHT_DISPLAY_LIMIT,
  buildHighlightDisplayRows,
} from '../src/components/proposal/keyPerformanceHighlightsAuthority.js';
import { prepareSectionBody } from '../src/components/proposal/sectionBodyAuthority.js';
import {
  buildAtAGlance,
  screenStatement,
} from '../src/components/proposal/print/proposalPackAuthority.js';
import { imagePagesFor, IMAGES_PER_PAGE } from '../src/components/proposal/print/imagePageLayout.js';
import {
  PACK_PAGE_BREAK_RULES,
  PACK_TABLE_FOLLOWS_HEADING_SELECTORS,
  proposalPackPageBreakCss,
} from '../src/components/proposal/print/proposalPageBreakRules.js';

/** The rows the Marquee System Design Summary carries, as stored calculated data. */
const MARQUEE_ROWS = [
  { key: 'rp23_viewing', area: 'Viewing geometry', result: 'L3 · 44° to 63°', what_the_room_gains: 'Places the seating inside the viewing angle the screen was specified for, across both rows.' },
  { key: 'p2', area: 'Discrete channels', result: 'L4 · 15 speakers', what_the_room_gains: 'More physical speaker positions around and above the seats.' },
  { key: 'p4', area: 'Screen consistency', result: 'L4 · 2 dB', what_the_room_gains: 'Stable dialogue and front-stage level across the seating area.' },
  { key: 'p5', area: 'Horizontal spacing', result: 'L1 · 48°', what_the_room_gains: 'Excellent movement between adjacent speakers around the room.' },
  { key: 'p7', area: 'Front wide position', result: 'L2 · 6°', what_the_room_gains: 'Bridges the front stage and the side speakers, so movement runs without a break.' },
  { key: 'p9', area: 'Overhead spacing', result: 'L3 · 44°', what_the_room_gains: 'Even overhead spacing keeps sound above the seats consistent front to back.' },
  { key: 'p12', area: 'Screen Dynamic Range', result: 'L3 · 106 dBC', what_the_room_gains: 'Strong front-stage headroom for demanding film soundtracks.' },
  { key: 'p13', area: 'Non-screen Dynamic Range', result: 'L2 · 100 dBC', what_the_room_gains: 'The surround channels have useful headroom for effects.' },
  { key: 'p14', area: 'LFE and subwoofer Dynamic Range', result: 'L3 · 115 dBC', what_the_room_gains: 'Low-frequency effects have the output the room needs.' },
  { key: 'p18', area: 'Bass extension', result: 'L4 · 16 Hz', what_the_room_gains: 'Low bass extension supports large-scale film effects.' },
  { key: 'p16', area: 'Screen timbre', result: 'L4 · 2 dB', what_the_room_gains: 'The screen speakers keep a consistent tonal character.' },
  { key: 'p17', area: 'Surround and overhead timbre', result: 'L3 · 3 dB', what_the_room_gains: 'Surround and overhead channels stay tonally consistent as effects move.' },
];

const PROJECTION_SCREEN = {
  size_inches: 170,
  viewable_width_inches: 170,
  diagonal_inches: 185,
  aspect_ratio: '2.35:1',
  television: false,
};

const SCREEN_SNAPSHOT = {
  available: true,
  project: { project_name: 'Marquee' },
  room: { dimensions_text: '6.4m × 4.5m × 2.4m (L × W × H)', screen: PROJECTION_SCREEN },
  version: { name: 'Current Design', number: 1 },
};

describe('Key Performance Highlights — one page, best rows only', () => {
  const rows = buildHighlightDisplayRows(MARQUEE_ROWS);

  it('never carries more rows than fit one printed page', () => {
    // Eight rows is the most the table carries on the one page that also holds
    // its heading, its header row and its footnote.
    expect(HIGHLIGHT_DISPLAY_LIMIT).toBe(8);
    expect(rows.length).toBeLessThanOrEqual(HIGHLIGHT_DISPLAY_LIMIT);
    expect(rows.length).toBe(8);
  });

  it('keeps every assessed performance area in the trimmed table', () => {
    const areas = new Set(rows.map((row) => row.area));
    [HIGHLIGHT_AREA.VIEWING, HIGHLIGHT_AREA.SPATIAL, HIGHLIGHT_AREA.DYNAMIC, HIGHLIGHT_AREA.TIMBRE, HIGHLIGHT_AREA.BASS]
      .forEach((area) => expect(areas.has(area)).toBe(true));
  });

  it('chooses the most useful rows, dropping the rest', () => {
    const keys = rows.map((row) => row.key);
    ['rp23_viewing', 'p2', 'p4', 'p5', 'p12', 'p14', 'p16', 'p18']
      .forEach((key) => expect(keys).toContain(key));
    // The screen size and the channel layout give up their places: P2 already
    // states how many physical speaker positions the room is built with.
    ['p7', 'p9', 'p13', 'p17', 'screen_size', 'system_layout']
      .forEach((key) => expect(keys).not.toContain(key));
  });

  it('reads by performance area, with the viewing result first', () => {
    expect(rows[0].area).toBe(HIGHLIGHT_AREA.VIEWING);
    const order = rows.map((row) => row.area);
    expect(order.indexOf(HIGHLIGHT_AREA.SPATIAL)).toBeLessThan(order.indexOf(HIGHLIGHT_AREA.DYNAMIC));
    expect(order.lastIndexOf(HIGHLIGHT_AREA.TIMBRE)).toBeLessThan(order.indexOf(HIGHLIGHT_AREA.BASS));
  });

  it('carries every row of a shorter table', () => {
    expect(buildHighlightDisplayRows(MARQUEE_ROWS.slice(0, 7)).length).toBe(7);
  });

  it('states a Level 1 result honestly instead of as a strength', () => {
    const p5 = rows.find((row) => row.key === 'p5');
    expect(p5.result).toBe('L1 · 48°');
    expect(p5.gain).not.toMatch(/excellent/i);
    expect(p5.gain).toMatch(/practical speaker positions and the seat geometry/i);
    expect(p5.gain).not.toMatch(/room geometry constraint|upgrade/i);
  });

  it('states a Level 2 result honestly and keeps usable prose', () => {
    // A Level 2 row is not one of the eight the trimmed table carries, so the
    // honesty rule is read from the full set.
    const p7 = buildHighlightDisplayRows(MARQUEE_ROWS, { limit: 20 }).find((row) => row.key === 'p7');
    expect(p7.result).toBe('L2 · 6°');
    expect(p7.gain).toMatch(/bridges the front stage/i);
    expect(p7.gain).not.toMatch(/outstanding|excellent/i);
  });

  it('leaves a strong result as written', () => {
    const p12 = rows.find((row) => row.key === 'p12');
    expect(p12.result).toBe('L3 · 106 dBC');
    expect(p12.gain).toBe('Strong front-stage headroom for demanding film soundtracks.');
  });
});

describe('Prose-only sections on the printed page', () => {
  const withList = '<h2>Spatial Resolution</h2><p>Prose.</p><ul><li>P2 discrete channels: L4</li></ul><table><tr><td>x</td></tr></table><p>More prose.</p>';

  it('drops a highlight list from a printed narrative section', () => {
    const printed = prepareSectionBody(withList, {
      title: 'Spatial Resolution',
      sectionType: 'spatial_resolution',
      proseOnly: true,
    });
    expect(printed).not.toContain('<ul');
    expect(printed).not.toContain('<table');
    expect(printed).toContain('More prose.');
  });

  it('applies to the summary and overall design sections', () => {
    ['system_design_summary', 'overall_design'].forEach((sectionType) => {
      const printed = prepareSectionBody(withList, { sectionType, proseOnly: true });
      expect(printed).not.toContain('<ul');
    });
  });

  it('leaves the editor body untouched when it is not printing', () => {
    expect(prepareSectionBody(withList, { sectionType: 'overall_design' })).toContain('<ul');
  });

  it('keeps the highlights introduction as prose without a second table', () => {
    const printed = prepareSectionBody(withList, {
      sectionType: 'key_performance_highlights',
      proseOnly: true,
    });
    expect(printed).not.toContain('<table');
    expect(printed).not.toContain('<ul');
  });
});

describe('Screen terminology', () => {
  it('states a projection screen by its viewable image width alone', () => {
    expect(screenStatement(PROJECTION_SCREEN)).toEqual({
      value: '170" 2.35:1 viewable image',
      hint: null,
    });
  });

  it('states the same screen for a saved snapshot written before the labelling change', () => {
    expect(screenStatement({ ...PROJECTION_SCREEN, size_inches: 185 })).toEqual({
      value: '170" 2.35:1 viewable image',
      hint: null,
    });
  });

  it('states a television by its nominal size, with no second figure', () => {
    expect(screenStatement({
      size_inches: 83,
      viewable_width_inches: 72,
      diagonal_inches: 83,
      aspect_ratio: '16:9',
      television: true,
    })).toEqual({ value: '83" TV', hint: null });
  });

  it('states a projection screen by its viewable image alone', () => {
    const card = buildAtAGlance({ snapshot: SCREEN_SNAPSHOT, projectName: 'Marquee' })
      .roomCards.find((entry) => entry.label === 'Display');
    expect(card.value).toBe('170" 2.35:1 viewable image');
    // The overall assembly the screen needs behind it is manufacturing detail:
    // it belongs in the technical data, not on the client's summary card.
    expect(card.hint).toBeUndefined();
    expect(card.span).toBeUndefined();
  });

  it('never states an unlabelled or secondary screen size', () => {
    const statement = screenStatement(PROJECTION_SCREEN);
    expect(statement.value).toMatch(/viewable/);
    expect(statement.hint).toBeNull();
    expect(JSON.stringify(statement)).not.toMatch(/overall screen assembly/);
  });
});

describe('One page for the project facts', () => {
  const pack = fs.readFileSync(
    new URL('../src/components/proposal/print/ProposalPackDocument.jsx', import.meta.url),
    'utf8'
  );

  it('composes the at a glance page and no separate room and brief page', () => {
    expect(pack).toContain('<AtAGlancePage');
    expect(pack).not.toContain('RoomAndBriefPage');
    expect(fs.existsSync(new URL('../src/components/proposal/print/RoomAndBriefPage.jsx', import.meta.url)))
      .toBe(false);
  });

  it('carries the project facts and the room facts on that one page', () => {
    const glance = buildAtAGlance({ snapshot: SCREEN_SNAPSHOT, projectName: 'Marquee' });
    expect(glance.projectCards.length).toBeGreaterThan(0);
    expect(glance.roomCards.length).toBeGreaterThan(0);
  });
});

describe('Project image pages are image-led', () => {
  const images = (count) => Array.from({ length: count }, (unused, index) => ({ id: `img-${index}`, file_url: `u${index}` }));

  it('keeps up to three images on one page', () => {
    expect(imagePagesFor(images(1)).map((page) => page.length)).toEqual([1]);
    expect(imagePagesFor(images(2)).map((page) => page.length)).toEqual([2]);
    expect(imagePagesFor(images(3)).map((page) => page.length)).toEqual([3]);
  });

  it('uses further image pages rather than shrinking four or more images', () => {
    expect(imagePagesFor(images(4)).map((page) => page.length)).toEqual([3, 1]);
    expect(imagePagesFor(images(6)).map((page) => page.length)).toEqual([3, 3]);
    expect(imagePagesFor(images(7)).map((page) => page.length)).toEqual([3, 3, 1]);
    imagePagesFor(images(8)).forEach((page) => expect(page.length).toBeLessThanOrEqual(IMAGES_PER_PAGE));
  });

  it('shows no image page when nothing has been uploaded', () => {
    expect(imagePagesFor([])).toEqual([]);
  });
});

describe('Print break rules in the pack authority', () => {
  const ruleFor = (id) => PACK_PAGE_BREAK_RULES.find((rule) => rule.id === id);
  const breakCss = proposalPackPageBreakCss();

  it('keeps the evidence heading with its table, and continues the page between whole rows', () => {
    // The heading, its introduction and the table are one printed statement: the
    // table may not begin a page away from the heading it belongs to…
    expect(PACK_TABLE_FOLLOWS_HEADING_SELECTORS)
      .toContain('.proposal-print-section--highlights .kph-table');
    // …and the evidence page continues onto a further sheet when the saved rows
    // need one, which is what stops a sheet printing the heading over nothing.
    const continuation = ruleFor('designed-pages-continue-when-they-must');
    expect(continuation.selectors).toContain('.pp-page--highlights');
    expect(continuation.declarations.breakInside).toBe('auto');
    // The continuation happens between WHOLE rows, under a column-heading group
    // the print engine repeats on the sheet the rows continue onto.
    const tableHeader = ruleFor('table-header-keeps-its-rows');
    expect(tableHeader.selectors).toContain('.kph-table thead');
    expect(tableHeader.declarations.headerGroup).toBe(true);
    const tableRow = ruleFor('table-row-is-never-split');
    expect(tableRow.selectors).toContain('.kph-table tr');
    expect(tableRow.declarations.breakInside).toBe('avoid');
    expect(breakCss).toContain('display: table-header-group;');
  });

  it('keeps headings with their first block and designed blocks whole', () => {
    const headings = ruleFor('heading-keeps-its-first-block');
    expect(headings.selectors).toContain('.pp-block__title');
    expect(headings.selectors).toContain('.pp-header');
    expect(headings.declarations.breakAfter).toBe('avoid');
    const blocks = ruleFor('block-is-never-split');
    expect(blocks.selectors).toContain('.pp-table');
    expect(blocks.declarations.breakInside).toBe('avoid');
  });

  it('keeps the one at a glance page whole', () => {
    const onePage = ruleFor('one-page-sections-are-read-as-one-thing');
    expect(onePage.selectors).toContain('.pp-page--glance');
    expect(onePage.declarations.breakInside).toBe('avoid');
    expect(breakCss).toContain('break-inside: avoid;');
  });

  it('gives the image pages their own page and keeps them whole', () => {
    const onePage = ruleFor('one-page-sections-are-read-as-one-thing');
    expect(onePage.selectors).toContain('.pp-page--images');
    expect(onePage.selectors).toContain('.pp-gallery__figure');
    expect(onePage.declarations.breakInside).toBe('avoid');
    const pageStart = ruleFor('page-starts-on-its-own-sheet');
    expect(pageStart.selectors).toContain('.pp-page');
    expect(pageStart.declarations.breakBefore).toBe('page');
  });
});