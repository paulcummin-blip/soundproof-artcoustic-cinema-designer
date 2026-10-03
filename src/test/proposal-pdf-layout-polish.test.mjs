/**
 * Acceptance: the System Design Summary PDF layout and copy polish.
 * -----------------------------------------------------------------
 * A layout, pagination and copy pass only: nothing here changes a calculation or
 * a report authority. The request's acceptance cases, as deterministic checks:
 *
 *   A  prose pages are not stuck to the top, and read at one type scale
 *   B  Key Performance Highlights keeps its heading, table and rows on one page
 *   C  Project Images is a visualisation page: Image 1 is the hero, full width,
 *      with deliberate space above and below it, and further pages for 4 to 8
 *   D  a 9.1.6 / 15-channel design carries no added-speaker, middle-overhead-pair
 *      or future-spacing upgrade, and states P5 as a room geometry constraint
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

import {
  HIGHLIGHT_DISPLAY_LIMIT,
  buildHighlightDisplayRows,
} from '../components/proposal/keyPerformanceHighlightsAuthority.js';
import {
  PARAGRAPH_SENTENCE_LIMIT,
  PROSE_PARAGRAPH_LIMIT,
  countSentences,
  limitProseParagraphs,
  prepareSectionBody,
} from '../components/proposal/sectionBodyAuthority.js';
import {
  HIGH_CHANNEL_PREFERRED_SENTENCE,
  isHighChannelDesign,
  mentionsHighChannelUpgrade,
  stripHighChannelUpgradeCopy,
} from '../components/proposal/highChannelLayoutAuthority.js';
import {
  HIGHLIGHTS_INTRO_MAX_ROWS,
  shouldPrintHighlightsIntro,
} from '../components/proposal/highlightsPageAuthority.js';
import { ASSET_SLOT, ASSET_SLOT_OPTIONS, slotLabel } from '../components/proposal/assetSlotAuthority.js';
import { IMAGES_PER_PAGE, imagePagesFor } from '../components/proposal/print/imagePageLayout.js';

// The repository root: the stylesheet checks read the files as they ship.
const REPO = new URL('../../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, REPO), 'utf8');
const PRINT = read('src/components/proposal/export/ProposalPrintStyles.jsx');
const PACK = read('src/components/proposal/print/ProposalPackStyles.jsx');
const DOC = read('src/components/proposal/print/ProposalPackDocument.jsx');
const EDITOR = read('src/pages/ProposalEditor.jsx');
const WRITING_RULE = read('base44/shared/highChannelDensityRule.js');

/** The rows the Marquee System Design Summary carries, as stored calculated data. */
const MARQUEE_ROWS = [
  { key: 'rp23_viewing', area: 'Viewing geometry', result: 'L3 · 44° to 63°' },
  { key: 'p2', area: 'Discrete channels', result: 'L4 · 15 speakers' },
  { key: 'p4', area: 'Screen consistency', result: 'L4 · 2 dB' },
  { key: 'p5', area: 'Horizontal spacing', result: 'L1 · 48°' },
  { key: 'p7', area: 'Front wide position', result: 'L2 · 6°' },
  { key: 'p9', area: 'Overhead spacing', result: 'L3 · 44°' },
  { key: 'p12', area: 'Screen Dynamic Range', result: 'L3 · 106 dBC' },
  { key: 'p13', area: 'Non-screen Dynamic Range', result: 'L2 · 100 dBC' },
  { key: 'p14', area: 'LFE and subwoofer Dynamic Range', result: 'L3 · 115 dBC' },
  { key: 'p18', area: 'Bass extension', result: 'L4 · 16 Hz' },
  { key: 'p16', area: 'Screen timbre', result: 'L4 · 2 dB' },
  { key: 'p17', area: 'Surround and overhead timbre', result: 'L3 · 3 dB' },
];

const FORBIDDEN_SENTENCE = 'If greater precision in the side-to-side soundstage is required in the future, the primary potential for improvement lies in the physical placement of these units to further close the gaps between the surround channels.';

const MARQUEE_LAYOUT = {
  available: true,
  system: { channel_layout: { total_discrete: 15 }, configuration: { dolby_config: '9.1.6' } },
};
const LOW_LAYOUT = {
  available: true,
  system: { channel_layout: { total_discrete: 7 }, configuration: { dolby_config: '5.1.2' } },
};

describe('A. page vertical rhythm and prose type scale', () => {
  it('gives every content page the same top and bottom margin', () => {
    expect(PRINT).toMatch(/\.proposal-print-section \{\s*padding: 22mm 18mm 20mm;/);
    // No page is a special case any more: that was what left later pages stuck
    // to the top of the sheet.
    expect(PRINT).not.toMatch(/:first-of-type \{\s*padding-top/);
    expect(PRINT).not.toMatch(/:last-of-type \{\s*padding-bottom/);
  });

  it('keeps the number and category at the top, then the title, rule and a generous gap', () => {
    expect(PACK).toMatch(/\.pp-header \{\s*margin: 0 0 14mm;/);
    expect(PACK).toMatch(/\.pp-header__meta \{[\s\S]*margin-bottom: 5mm/);
    expect(PACK).toMatch(/\.pp-header__rule \{[\s\S]*margin-top: 7mm/);
  });

  it('reads every narrative page at one size, leading and column width', () => {
    expect(PACK).toMatch(/--pp-body-size: 11pt/);
    expect(PACK).toMatch(/--pp-body-leading: 1\.55/);
    expect(PACK).toMatch(/\.pp-body \{[\s\S]*max-width: 148mm/);
    expect(PACK).toMatch(/\.pp-body p \{[\s\S]*margin: 0 0 var\(--pp-paragraph-gap\)/);
    expect(PACK).toMatch(/--pp-paragraph-gap: 4\.2mm/);
  });

  it('holds a narrative page to three short paragraphs without touching the stored body', () => {
    expect(PROSE_PARAGRAPH_LIMIT).toBe(3);
    expect(PARAGRAPH_SENTENCE_LIMIT).toBe(4);

    const four = '<h2>Overall Design</h2><p>One.</p><p>Two.</p><p>Three.</p><p>Four.</p>';
    const printed = prepareSectionBody(four, { sectionType: 'overall_design', proseOnly: true });
    expect(printed).toContain('<h2>Overall Design</h2>');
    expect(printed).toContain('<p>Three.</p>');
    expect(printed).not.toContain('<p>Four.</p>');

    const longParagraph = `<p>${['One.', 'Two.', 'Three.', 'Four.', 'Five.'].join(' ')}</p>`;
    const limited = limitProseParagraphs(longParagraph);
    expect(countSentences(limited)).toBe(4);
    expect(limited.endsWith('</p>')).toBe(true);
  });
});

describe('B. Key Performance Highlights stays on one page', () => {
  it('binds the heading, the table and its rows together', () => {
    expect(PRINT).toMatch(/proposal-print-section--highlights \.pp-header[\s\S]*break-after: avoid/);
    expect(PRINT).toMatch(/proposal-print-section--highlights \.kph-table[\s\S]*break-before: avoid/);
    expect(PRINT).toMatch(/kph-table tr \{\s*break-inside: avoid/);
    expect(PACK).toMatch(/pp-page--highlights \.kph-table/);
  });

  it('compacts the table so the trimmed rows fit, and stays readable', () => {
    expect(PRINT).toMatch(/\.kph-table \{[\s\S]*font-size: 8\.5pt/);
    expect(PRINT).toMatch(/\.kph-table th \{[\s\S]*padding: 1\.8mm 2\.5mm/);
    expect(PRINT).toMatch(/\.kph-table td \{\s*padding: 1\.8mm 2\.5mm/);
    expect(Number(PRINT.match(/font-size: 8\.5pt/)[0].replace(/\D/g, ''))).toBeGreaterThan(8);
  });

  it('carries the eleven most useful rows, by assessed area', () => {
    expect(HIGHLIGHT_DISPLAY_LIMIT).toBeLessThanOrEqual(11);
    const rows = buildHighlightDisplayRows(MARQUEE_ROWS);
    expect(rows.length).toBe(11);
    expect(rows[0].area).toBe('Viewing Geometry');
    ['rp23_viewing', 'p2', 'p4', 'p5', 'p7', 'p12', 'p13', 'p14', 'p16', 'p18']
      .forEach((key) => expect(rows.map((row) => row.key)).toContain(key));
    // The lowest-priority result gives up its place before an assessed area does.
    expect(rows.map((row) => row.key)).not.toContain('p17');
  });

  it('prints the introduction only when the table leaves room for it', () => {
    expect(HIGHLIGHTS_INTRO_MAX_ROWS).toBe(10);
    expect(shouldPrintHighlightsIntro({ body: '<p>One short sentence.</p>', rowCount: 10 })).toBe(true);
    expect(shouldPrintHighlightsIntro({ body: '<p>One short sentence.</p>', rowCount: 11 })).toBe(false);
    expect(shouldPrintHighlightsIntro({ body: '<p>First sentence. Second sentence.</p>', rowCount: 4 })).toBe(false);
    expect(shouldPrintHighlightsIntro({ body: '', rowCount: 0 })).toBe(false);
    // The document reads that rule, so the table never follows a page break.
    expect(DOC).toMatch(/shouldPrintHighlightsIntro\(\{ body, rowCount \}\)/);
    expect(DOC).toContain('pp-page--highlights proposal-print-section--highlights');
  });
});

describe('C. Project Images is a visualisation page', () => {
  it('labels Image 1 as the hero image in the selection UI', () => {
    expect(slotLabel(ASSET_SLOT.IMAGE_1)).toBe('Image 1 (Hero Image)');
    expect(slotLabel(ASSET_SLOT.IMAGE_2)).toBe('Image 2');
    expect(ASSET_SLOT_OPTIONS[1].label).toBe('Image 1 (Hero Image)');
  });

  it('makes the hero full width and larger than its supporting images', () => {
    expect(PACK).toMatch(/pp-gallery__figure img \{\s*display: block;\s*width: 100%/);
    expect(PACK).toMatch(/pp-gallery--3 \.pp-gallery__hero img \{\s*height: 140mm/);
    expect(PACK).toMatch(/pp-gallery--3 \.pp-gallery__support img \{\s*height: 70mm/);
    expect(PACK).toMatch(/pp-gallery--2 \.pp-gallery__hero img \{\s*height: 150mm/);
    expect(PACK).toMatch(/pp-gallery--1 \.pp-gallery__hero img \{\s*height: 200mm/);
  });

  it('leaves deliberate space above and below the hero image', () => {
    expect(PACK).toMatch(/\.pp-gallery \{\s*margin-top: 8mm/);
    expect(PACK).toMatch(/\.pp-gallery__hero \{\s*margin: 0 0 8mm/);
    expect(PACK).toMatch(/\.pp-page--images \.pp-header \{\s*margin-bottom: 8mm/);
    expect(PRINT).toMatch(/proposal-print-section\.pp-page--images \{\s*padding-top: 14mm/);
    // The fact-card page keeps its own one-page rule with a shorter top margin.
    expect(PRINT).toMatch(/proposal-print-section\.pp-page--glance \{\s*padding-top: 16mm/);
    expect(PACK).toMatch(/pp-page--glance[\s\S]*break-inside: avoid/);
  });

  it('gives one to eight images clean layouts, always hero first', () => {
    const images = (count) => Array.from({ length: count }, (unused, index) => ({ id: `img-${index}`, file_url: `u${index}` }));
    expect(imagePagesFor(images(1)).map((page) => page.length)).toEqual([1]);
    expect(imagePagesFor(images(2)).map((page) => page.length)).toEqual([2]);
    expect(imagePagesFor(images(3)).map((page) => page.length)).toEqual([3]);
    expect(imagePagesFor(images(4)).map((page) => page.length)).toEqual([3, 1]);
    expect(imagePagesFor(images(8)).map((page) => page.length)).toEqual([3, 3, 2]);
    imagePagesFor(images(8)).forEach((page) => expect(page.length).toBeLessThanOrEqual(IMAGES_PER_PAGE));
    // Image 1 leads the first image page, and no image is dropped.
    expect(imagePagesFor(images(6))[0][0].id).toBe('img-0');
    expect(imagePagesFor(images(8)).flat()).toHaveLength(8);
  });
});

describe('D. no forbidden upgrade wording for a 9.1.6 / 15-channel design', () => {
  it('recognises a high-channel-count design from the frozen snapshot', () => {
    expect(isHighChannelDesign(MARQUEE_LAYOUT)).toBe(true);
    expect(isHighChannelDesign(LOW_LAYOUT)).toBe(false);
    expect(mentionsHighChannelUpgrade(FORBIDDEN_SENTENCE)).toBe(true);
    expect(mentionsHighChannelUpgrade('Adding a middle pair of height speakers would be a natural upgrade.')).toBe(true);
    expect(mentionsHighChannelUpgrade('The horizontal spacing between the surround channels is set by the room width.')).toBe(false);
  });

  it('removes the forbidden sentence and the middle overhead pair from an older body', () => {
    const body = `<p>The room is designed around a 9.1.6 layout.</p>`
      + `<p>Adding a middle pair of height speakers would be a natural upgrade. ${FORBIDDEN_SENTENCE}</p>`;
    const cleaned = stripHighChannelUpgradeCopy(body);
    expect(cleaned).not.toContain('middle pair');
    expect(cleaned).not.toContain('greater precision');
    expect(cleaned).not.toContain('close the gaps');
    expect(cleaned).toContain('The room is designed around a 9.1.6 layout.');
  });

  it('states a removed spacing upgrade as a room geometry constraint instead', () => {
    const body = '<p>Horizontal spacing is limited by the room, and improving it later would need more speakers.</p>';
    const cleaned = stripHighChannelUpgradeCopy(body);
    expect(cleaned).toContain(HIGH_CHANNEL_PREFERRED_SENTENCE);
    expect(cleaned).not.toMatch(/more speakers/i);
  });

  it('leaves the approved constraint wording exactly as it stands', () => {
    const body = `<p>${HIGH_CHANNEL_PREFERRED_SENTENCE}</p>`;
    expect(stripHighChannelUpgradeCopy(body)).toBe(body);
  });

  it('cleans the copy on the printed page and in the editor preview, never the record', () => {
    expect(prepareSectionBody(FORBIDDEN_SENTENCE, {
      sectionType: 'overall_design',
      proseOnly: true,
      highChannel: true,
    })).not.toContain('greater precision');
    expect(DOC).toMatch(/const highChannel = isHighChannelDesign\(snapshot\);/);
    expect(DOC).toMatch(/proseOnly: true,\s*highChannel,/);
    expect(EDITOR).toMatch(/highChannel: isHighChannelDesign\(proposal\?\.engineering_snapshot\)/);
  });

  it('leaves a lower-channel report untouched', () => {
    const body = '<p>Horizontal spacing is limited by the room, and improving it later would need more speakers.</p>';
    expect(prepareSectionBody(body, {
      sectionType: 'overall_design',
      proseOnly: true,
      highChannel: false,
    })).toBe(body);
  });

  it('states a limited P5 result as a room geometry constraint', () => {
    const rows = buildHighlightDisplayRows([{ key: 'p5', area: 'Horizontal spacing', result: 'L1 · 48°' }]);
    expect(rows[0].gain).toMatch(/room geometry constraint/i);
    expect(rows[0].gain).not.toMatch(/excellent|outstanding/i);
  });

  it('names the middle overhead pair as forbidden in the writing rule itself', () => {
    expect(WRITING_RULE).toMatch(/middle overhead pair/);
    expect(WRITING_RULE).toMatch(/middle pair of height speakers/);
    expect(WRITING_RULE).toMatch(/HIGH-CHANNEL-DENSITY UPGRADE RULE/);
  });
});