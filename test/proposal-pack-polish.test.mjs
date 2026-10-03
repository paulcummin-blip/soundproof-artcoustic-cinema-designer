/**
 * Acceptance tests for the System Design Summary pack polish:
 * one evidence table that fits one page, prose-only narrative sections, honest
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
  buildAtAGlanceCards,
  buildRoomBriefFacts,
  screenStatement,
} from '../src/components/proposal/print/proposalPackAuthority.js';
import { imagePagesFor, IMAGES_PER_PAGE } from '../src/components/proposal/print/imagePageLayout.js';

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
    expect(HIGHLIGHT_DISPLAY_LIMIT).toBeLessThanOrEqual(10);
    expect(rows.length).toBeLessThanOrEqual(HIGHLIGHT_DISPLAY_LIMIT);
    expect(rows.length).toBe(10);
  });

  it('keeps every assessed performance area in the trimmed table', () => {
    const areas = new Set(rows.map((row) => row.area));
    [HIGHLIGHT_AREA.VIEWING, HIGHLIGHT_AREA.SPATIAL, HIGHLIGHT_AREA.DYNAMIC, HIGHLIGHT_AREA.TIMBRE, HIGHLIGHT_AREA.BASS]
      .forEach((area) => expect(areas.has(area)).toBe(true));
  });

  it('chooses the most useful rows, dropping only the two lowest priorities', () => {
    const keys = rows.map((row) => row.key);
    ['rp23_viewing', 'p2', 'p4', 'p5', 'p7', 'p9', 'p12', 'p13', 'p16', 'p18']
      .forEach((key) => expect(keys).toContain(key));
    // Keeping one row for every assessed area costs the two lowest-priority
    // results (P14 and P17), rather than losing a whole area.
    expect(keys).not.toContain('p14');
    expect(keys).not.toContain('p17');
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
    expect(p5.gain).toMatch(/compromise/i);
  });

  it('states a Level 2 result honestly and keeps usable prose', () => {
    const p7 = rows.find((row) => row.key === 'p7');
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
  it('states a projection screen by its viewable image width and names the assembly', () => {
    expect(screenStatement(PROJECTION_SCREEN)).toEqual({
      value: '170" viewable 2.35:1 image',
      hint: '185" overall screen assembly',
    });
  });

  it('states the same screen for a saved snapshot written before the labelling change', () => {
    expect(screenStatement({ ...PROJECTION_SCREEN, size_inches: 185 })).toEqual({
      value: '170" viewable 2.35:1 image',
      hint: '185" overall screen assembly',
    });
  });

  it('states a television by its nominal size, with no second figure', () => {
    expect(screenStatement({
      size_inches: 83,
      viewable_width_inches: 72,
      diagonal_inches: 83,
      aspect_ratio: '16:9',
      television: true,
    })).toEqual({ value: '83" 16:9 screen', hint: null });
  });

  it('uses the same wording on every page that states the screen', () => {
    const card = buildAtAGlanceCards({ snapshot: SCREEN_SNAPSHOT, projectName: 'Marquee' })
      .find((entry) => entry.label === 'Screen');
    const fact = buildRoomBriefFacts(SCREEN_SNAPSHOT).facts
      .find((entry) => entry.label === 'Screen');
    expect(card.value).toBe('170" viewable 2.35:1 image');
    expect(card.hint).toBe('185" overall screen assembly');
    expect(fact.value).toBe(card.value);
    expect(fact.hint).toBe(card.hint);
  });

  it('never states an unlabelled screen size', () => {
    const text = `${screenStatement(PROJECTION_SCREEN).value} ${screenStatement(PROJECTION_SCREEN).hint}`;
    expect(text).toMatch(/viewable/);
    expect(text).toMatch(/overall screen assembly/);
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

describe('Print break rules in the pack stylesheet', () => {
  const css = fs.readFileSync(
    new URL('../src/components/proposal/print/ProposalPackStyles.jsx', import.meta.url),
    'utf8'
  );

  it('keeps the highlights section and its table indivisible', () => {
    expect(css).toMatch(/pp-page--highlights[\s\S]*break-inside: avoid/);
    expect(css).toMatch(/pp-page--highlights[\s\S]*page-break-inside: avoid/);
    expect(css).toMatch(/pp-page--highlights \.kph-table/);
  });

  it('keeps headings with their first block and designed blocks whole', () => {
    expect(css).toMatch(/pp-block__title[\s\S]*break-after: avoid/);
    expect(css).toMatch(/pp-header[\s\S]*break-after: avoid/);
    expect(css).toMatch(/pp-table[\s\S]*break-inside: avoid/);
  });

  it('gives the image pages their own page and keeps them whole', () => {
    expect(css).toMatch(/pp-page--images[\s\S]*break-inside: avoid/);
    expect(css).toMatch(/pp-gallery__figure[\s\S]*break-inside: avoid/);
  });
});