/**
 * Focused acceptance: THE display-wording formatter.
 * ------------------------------------------------
 * Two shapes only, and nothing else:
 *   TV               → `100" TV`   (nominal diagonal, no aspect ratio, no width)
 *   Projector screen → `150" 2.35:1 projection screen` (viewable width + aspect
 *                      ratio, never a diagonal)
 *
 * A television preset is a named television: a stale `projector_screen` value
 * left behind by an earlier manual entry must never override tv77 / tv100 and
 * print the panel's viewable width as the screen size.
 */
import { describe, it, expect } from 'vitest';

import {
  displayPhrase,
  formatDisplayPhrase,
  isTvDisplay,
  resolveDisplayType,
} from '../components/models/screen/displayTypeAuthority.js';

describe('A. the formatter states a television by its nominal diagonal alone', () => {
  it('writes the nominal diagonal and the word TV', () => {
    expect(formatDisplayPhrase({ television: true, diagonalInches: 100 })).toBe('100" TV');
    expect(formatDisplayPhrase({ television: true, diagonalInches: 77 })).toBe('77" TV');
    expect(formatDisplayPhrase({ television: true, diagonalInches: 114.6 })).toBe('115" TV');
  });

  it('never writes an aspect ratio or a width for a television', () => {
    const phrase = formatDisplayPhrase({
      television: true,
      diagonalInches: 100,
      widthInches: 87.8,
      aspectRatio: '16:9',
    });
    expect(phrase).toBe('100" TV');
    expect(phrase).not.toMatch(/16:9/);
    expect(phrase).not.toMatch(/87/);
    expect(phrase).not.toMatch(/projection screen/i);
  });
});

describe('B. the formatter states a projection screen by width and aspect ratio', () => {
  it('writes the viewable width and the aspect ratio', () => {
    expect(formatDisplayPhrase({ widthInches: 150, aspectRatio: '2.35:1' }))
      .toBe('150" 2.35:1 projection screen');
    expect(formatDisplayPhrase({ widthInches: 170, aspectRatio: '16:9' }))
      .toBe('170" 16:9 projection screen');
  });

  it('never writes a diagonal for a projection screen', () => {
    const phrase = formatDisplayPhrase({ widthInches: 150, aspectRatio: '2.35:1', diagonalInches: 163 });
    expect(phrase).toBe('150" 2.35:1 projection screen');
    expect(phrase).not.toMatch(/163/);
    expect(phrase).not.toMatch(/\bTV\b/);
  });
});

describe('C. a TV preset is a named television and settles the type', () => {
  it('reads tv100 as a 100" TV, never as its 87.8" viewable width', () => {
    const screen = {
      tvPresetKey: 'tv100',
      tvWidthMm: 2230,
      visibleWidthInches: 87.8,
      screen_size: 87.8,
      aspectRatio: '16:9',
    };
    expect(resolveDisplayType(screen)).toBe('tv');
    expect(isTvDisplay(screen)).toBe(true);
    expect(displayPhrase(screen)).toBe('100" TV');
  });

  it('reads tv77 as a 77" TV', () => {
    const screen = { tv_preset_key: 'tv77', tv_width_mm: 1711, screen_size: 67.36, aspect_ratio: '16:9' };
    expect(displayPhrase(screen)).toBe('77" TV');
  });

  it('is not overridden by a stale projector_screen value', () => {
    const stale = {
      display_type: 'projector_screen',
      tv_preset_key: 'tv100',
      tv_width_mm: 2230,
      screen_size: 87.8,
      aspect_ratio: '16:9',
    };
    expect(resolveDisplayType(stale)).toBe('tv');
    expect(displayPhrase(stale)).toBe('100" TV');
  });

  it('still honours a television the designer typed in the manual section', () => {
    const manualTv = {
      display_type: 'tv',
      screen_manual_config: { enabled: true, mode: 'diagonal', diagonalInches: 115 },
      screen_size: 100,
      aspect_ratio: '16:9',
    };
    expect(resolveDisplayType(manualTv)).toBe('tv');
    expect(displayPhrase(manualTv)).toBe('115" TV');
  });
});

describe('D. a projection screen project is unchanged', () => {
  it('states the viewable width and the aspect ratio', () => {
    const screen = { screen_size: 150, aspect_ratio: '2.35:1' };
    expect(resolveDisplayType(screen)).toBe('projector_screen');
    expect(isTvDisplay(screen)).toBe(false);
    expect(displayPhrase(screen)).toBe('150" 2.35:1 projection screen');
  });

  it('never invents a television from a dimension or an aspect ratio', () => {
    expect(resolveDisplayType({ screen_size: 87.8, aspect_ratio: '16:9' })).toBe('projector_screen');
    expect(resolveDisplayType({ screen_size: 120, aspect_ratio: '2.35:1' })).toBe('projector_screen');
  });
});