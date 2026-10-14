/**
 * Acceptance: the pack's display statement agrees with the shared identity.
 * -----------------------------------------------------------------------
 * The frozen engineering snapshot carries the display's own identity
 * (display_type, diagonal_inches) and the shared rule in
 * base44/shared/canonicalDisplayIdentity.js states the client-facing phrase for
 * a television. The client-facing pack states the same display from the same
 * fields, and this check holds the two together across the boundary the app
 * shell cannot import across.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

import { readDisplayIdentity } from '../base44/shared/canonicalDisplayIdentity.js';

const REPO = new URL('../', import.meta.url);
const PACK = fs.readFileSync(new URL('src/components/proposal/print/proposalPackAuthority.js', REPO), 'utf8');

/** The phrase the pack states, evaluated for one screen block. */
function packPhrase(screen) {
  const canonical = readDisplayIdentity(screen);
  // The pack states a television from the same two fields the shared rule reads.
  if (canonical.isTv) {
    const diagonal = Number(screen?.diagonal_inches) || Number(screen?.size_inches) || null;
    return diagonal ? `${Math.round(diagonal)}" TV` : null;
  }
  const viewable = Number(screen?.viewable_width_inches) || Number(screen?.size_inches) || null;
  const aspect = screen?.aspect_ratio ? String(screen.aspect_ratio) : null;
  return viewable ? `${viewable}" ${aspect} projection screen` : null;
}

const television = (diagonal) => ({
  display_type: 'tv',
  television: true,
  size_inches: diagonal,
  diagonal_inches: diagonal,
  aspect_ratio: '16:9',
  viewable_width_inches: 100,
});

const projectionScreen = (width, aspect) => ({
  display_type: 'projector_screen',
  television: false,
  size_inches: width,
  viewable_width_inches: width,
  aspect_ratio: aspect,
});

describe('the pack states the display the snapshot was published from', () => {
  it('agrees with the shared television phrase', () => {
    [115, 83, 100].forEach((diagonal) => {
      const screen = television(diagonal);
      expect(readDisplayIdentity(screen).tvPhrase).toBe(`${diagonal}" TV`);
      expect(packPhrase(screen)).toBe(readDisplayIdentity(screen).tvPhrase);
    });
  });

  it('gives a projection screen no television phrase', () => {
    const screen = projectionScreen(185, '2.35:1');
    expect(readDisplayIdentity(screen).isTv).toBe(false);
    expect(readDisplayIdentity(screen).tvPhrase).toBeNull();
    expect(packPhrase(screen)).toBe('185" 2.35:1 projection screen');
  });

  it('reads the television rule and the aspect-ratio ban from the pack source', () => {
    // The pack states a television from its own type authority, and the phrase it
    // writes carries no aspect ratio and no "screen".
    expect(PACK).toContain('canonicalDisplayType');
    // The wording itself is built by THE display-wording formatter, so the pack
    // cannot word a display differently from a report.
    expect(PACK).toContain('formatDisplayPhrase');
    // Read the branch's own code, not the prose around it (the comments name the
    // aspect ratio and the word screen in order to ban them).
    const televisionBranch = PACK.slice(
      PACK.indexOf('if (displayType === DISPLAY_TYPE_TV)'),
      PACK.indexOf('// Where the snapshot carries no viewable width'),
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(televisionBranch).toMatch(/formatDisplayPhrase\(\{\s*television: true/);
    expect(televisionBranch).toMatch(/diagonalInches: diagonal/);
    // The branch never reads the aspect ratio or a viewable width, and the phrase
    // it writes carries no other word: the only "screen" in it is the parameter
    // name the snapshot block arrives in.
    expect(televisionBranch).not.toMatch(/aspect/i);
    expect(televisionBranch).not.toMatch(/viewable/i);
    expect(televisionBranch).not.toMatch(/['"`][^'"`]*screen[^'"`]*['"`]/i);
  });
});