/**
 * Acceptance: the client-facing display statement of the proposal pack.
 * -------------------------------------------------------------------
 * A television is stated as a television and nothing else:
 *
 *   115" TV
 *
 * Its nominal diagonal, then the word TV — never an aspect ratio, never a
 * viewable width, and never "screen", because a television is not a projection
 * screen and is not bought by its format. A projection screen keeps its own
 * wording, including its aspect ratio, unchanged.
 *
 * One formatter states it for the whole client-facing pack. The agreement with
 * the shared display identity the snapshot was published from is asserted on the
 * server side of the boundary, in test/display-label-parity.test.mjs.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

import { buildAtAGlance, screenStatement } from '../components/proposal/print/proposalPackAuthority.js';

const REPO = new URL('../../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, REPO), 'utf8');
const GLANCE_PAGE = read('src/components/proposal/print/AtAGlancePage.jsx');
const GLANCE_VERSIONS = read('src/components/proposal/print/atAGlanceVersions.js');

/** A frozen snapshot television screen block, as a publication carries it. */
const television = (diagonalInches, extra = {}) => ({
  display_type: 'tv',
  television: true,
  size_inches: diagonalInches,
  diagonal_inches: diagonalInches,
  aspect_ratio: '16:9',
  viewable_width_inches: 100,
  viewable_width_cm: 254,
  viewable_height_cm: 143,
  screen_type: 'Television',
  ...extra,
});

/** A frozen snapshot projection screen block. */
const projectionScreen = (viewableWidthInches, aspectRatio) => ({
  display_type: 'projector_screen',
  television: false,
  size_inches: viewableWidthInches,
  viewable_width_inches: viewableWidthInches,
  aspect_ratio: aspectRatio,
});

describe('A. a television is stated by its diagonal and the word TV', () => {
  it('states 115, 83 and 100 inch televisions as TV', () => {
    expect(screenStatement(television(115)).value).toBe('115" TV');
    expect(screenStatement(television(83)).value).toBe('83" TV');
    expect(screenStatement(television(100)).value).toBe('100" TV');
  });

  it('never states an aspect ratio, a width or the word screen for a television', () => {
    const value = screenStatement(television(115)).value;
    expect(value).not.toMatch(/16:9|2\.35/);
    expect(value).not.toMatch(/screen/i);
    expect(value).not.toMatch(/viewable/i);
    expect(value).not.toMatch(/\d+\.\d/);
  });

  it('states the nominal size when the publication carries no separate diagonal', () => {
    expect(screenStatement({ display_type: 'tv', size_inches: 100 }).value).toBe('100" TV');
    // The identity a publication already carried, before display_type existed.
    expect(screenStatement({ television: true, size_inches: 83, diagonal_inches: 83 }).value).toBe('83" TV');
  });

  it('states no display figure rather than inventing one', () => {
    expect(screenStatement({ display_type: 'tv' }).value).toBeNull();
  });
});

describe('B. a projection screen keeps its own wording, aspect ratio included', () => {
  it('states the viewable width and the aspect ratio, and never a diagonal', () => {
    expect(screenStatement(projectionScreen(185, '2.35:1')).value).toBe('185" 2.35:1 projection screen');
    expect(screenStatement(projectionScreen(170, '16:9')).value).toBe('170" 16:9 projection screen');
    expect(screenStatement({ aspect_ratio: '2.35:1', viewable_width_inches: 185 }).value)
      .toBe('185" 2.35:1 projection screen');
  });

  it('is never called a television', () => {
    expect(screenStatement(projectionScreen(185, '2.35:1')).value).not.toMatch(/\bTV\b/);
  });
});

describe('C. the display reaches the At a Glance page as a display', () => {
  it('carries the phrase onto the page', () => {
    const glance = buildAtAGlance({
      snapshot: { room: { screen: television(115), dimensions: { length_m: 6, width_m: 4.5, height_m: 2.4 } } },
      projectName: 'Genesis AV',
      generatedDate: '2026-10-12',
    });
    expect(glance.roomCards.find((card) => card.label === 'Display')).toMatchObject({ value: '115" TV' });
    expect(glance.roomCards.some((card) => card.label === 'Screen')).toBe(false);
    expect(JSON.stringify(glance.roomCards)).not.toMatch(/16:9/);
  });

  it('heads the group Room and display and labels the card Display', () => {
    expect(GLANCE_PAGE).toContain('Room and display');
    expect(GLANCE_PAGE).not.toContain('Room and screen');
    expect(GLANCE_VERSIONS).toMatch(/key: 'screen_size', label: 'Display'/);
  });

  it('leaves the room and its technical wording alone', () => {
    const glance = buildAtAGlance({
      snapshot: { room: { screen: television(115), dimensions: { length_m: 6, width_m: 4.5, height_m: 2.4 } } },
      projectName: 'Genesis AV',
      generatedDate: '2026-10-12',
    });
    expect(glance.roomCards.find((card) => card.label === 'Room size')).toMatchObject({ value: '6 × 4.5 × 2.4 m' });
    expect(glance.packageRows).toEqual([]);
  });
});