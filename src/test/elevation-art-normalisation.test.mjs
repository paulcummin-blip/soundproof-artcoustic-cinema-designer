// ---------------------------------------------------------------------------
// elevation-art-normalisation — acceptance suite
// ---------------------------------------------------------------------------
// WHAT  Proves the elevation drawings place each model's artwork from ONE shared
//       renderer and ONE measured/approved crop authority: the page margin is
//       gone, the drawing keeps its own proportions, it is fitted inside the
//       cabinet's true footprint, and an artwork with no trustworthy crop is
//       drawn unchanged and reported instead of being over-cropped or stretched.
//
// WHAT IT NEVER DOES  It changes no geometry: the cabinet's own dimensions are
//       asserted here exactly as the registry holds them, so this suite fails if
//       a normalisation edit ever moves a physical size.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MODELS } from '../components/models/speakers/registry.jsx';
import { elevationArtAspectCheck } from '../components/report/elevation/elevationArtBounds.js';
import {
  ELEVATION_ART_AUTHORITY,
  ELEVATION_ART_MODE,
  ELEVATION_ART_FIT_NORMALISED,
  ELEVATION_ART_FIT_LEGACY,
  NORMALISATION_FALLBACK,
  elevationArtFitRatio,
  elevationArtworkKeyForModel,
  resetNormalisationFallbackLog,
  resolveElevationArtwork,
} from '../components/report/elevation/elevationArtAuthority.js';

const source = (relative) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

const iconsSource = source('../components/report/SpeakerFaceIcons.jsx');
const c41IconsSource = source('../components/report/C41ArtworkFaceIcons.jsx');
const rendererSource = source('../components/report/elevation/ElevationArtworkIcon.jsx');
const frontSource = source('../components/room/FrontElevation.jsx');
const sideSource = source('../components/room/SideElevation.jsx');
const reportDrawings = source('../components/report/technical/TechnicalReportDrawings.jsx');

/** One icon's own body, so a stale box can be shown to be gone from it. */
const iconBody = (text, name) => {
  const start = text.indexOf(`export function ${name}(`);
  if (start < 0) return '';
  const next = text.indexOf('\nexport function ', start + 1);
  return text.slice(start, next < 0 ? text.length : next);
};

const model = (key) => MODELS.find((item) => item.key === key);

const ACCEPTANCE = [
  { key: 'q63', model: 'q6-3', icon: 'Q63FaceIcon', face: [280, 280] },
  { key: 'q85', model: 'q8-5', icon: 'Q85FaceIcon', face: [500, 600] },
  { key: 'q43', model: 'q4-3', icon: 'Q43FaceIcon', face: [280, 210] },
  { key: 'q45', model: 'q4-5', icon: 'Q45FaceIcon', face: [500, 400] },
  { key: 'c41_1222', model: 'c4-1', icon: 'C41_1222FaceIcon', face: [1222, 120] },
  { key: 'evolve_2_1', model: 'evolve-2-1', icon: 'Evolve21FaceIcon', face: [200, 200] },
  { key: 'evolve_3_1', model: 'evolve-3-1', icon: 'Evolve31FaceIcon', face: [270, 370] },
  { key: 'c1', model: 'c-1', icon: 'C1FaceIcon', face: null },
];

describe('every acceptance model draws a trusted crop', () => {
  for (const entry of ACCEPTANCE) {
    it(`${entry.icon}: a crop is recorded, inside its own asset, and the fit is the footprint`, () => {
      const resolved = resolveElevationArtwork(entry.key);
      expect(resolved.mode === ELEVATION_ART_MODE.MEASURED
        || resolved.mode === ELEVATION_ART_MODE.APPROVED).toBe(true);
      expect(resolved.box.width).toBeGreaterThan(0);
      expect(resolved.box.height).toBeGreaterThan(0);
      expect(resolved.box.x + resolved.box.width).toBeLessThanOrEqual(resolved.native.width);
      expect(resolved.box.y + resolved.box.height).toBeLessThanOrEqual(resolved.native.height);
      expect(resolved.fitRatio).toBe(ELEVATION_ART_FIT_NORMALISED);
    });

    it(`${entry.icon}: the drawing is never stretched onto the footprint`, () => {
      const resolved = resolveElevationArtwork(entry.key);
      // C-1 keeps the one long-established treatment it has always had; every
      // other artwork is fitted with a single scale for both axes.
      if (entry.key === 'c1') {
        expect(resolved.preserveAspect).toBe('none');
      } else {
        expect(resolved.preserveAspect).toBe('xMidYMid meet');
      }
    });

    it(`${entry.icon}: the icon draws through the shared renderer, with no box of its own`, () => {
      const text = entry.icon.startsWith('C41_') ? c41IconsSource : iconsSource;
      const body = iconBody(text, entry.icon);
      expect(body).toMatch(new RegExp(`artworkKey="${entry.key}"`));
      expect(body).not.toMatch(/viewBox=/);
      expect(body).not.toMatch(/<svg/);
      expect(body).not.toMatch(/<image/);
    });

    it(`${entry.icon}: the cabinet's own face proportions are unchanged`, () => {
      const physical = model(entry.model);
      expect(physical).toBeTruthy();
      expect([physical.widthMm, physical.heightMm]).toEqual(entry.face);
    });
  }
});

describe('the crop authority trims the page without touching the drawing', () => {
  it('every recorded crop lies inside its asset and is not the whole page', () => {
    for (const [key, entry] of Object.entries(ELEVATION_ART_AUTHORITY)) {
      const { box, native } = entry;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(native.width);
      expect(box.y + box.height).toBeLessThanOrEqual(native.height);
      // A crop that covered the whole file would crop nothing at all.
      expect(box.width < native.width || box.height < native.height).toBe(true);
    }
  });

  it('the crops that carry a cabinet face agree with it when fitted', () => {
    // The measured drawings whose own proportions are the cabinet's: the crop is
    // drawn edge to edge in the footprint without distortion. EVOLVE 3-1 is not
    // in this list: its drawing is genuinely narrower than its cabinet, so it is
    // fitted inside the footprint and centred instead of being stretched to it.
    const agreeing = [
      ['q63', 280, 280],
      ['q85', 500, 600],
      ['q43', 280, 210],
      ['q45', 500, 400],
      ['c41_1222', 1222, 120],
      ['c41_1441', 1441, 120],
      ['c41_1711', 1711, 120],
      ['evolve_2_1', 200, 200],
      ['evolve_4_2', 270, 370],
      ['evolve_6_3', 270, 370],
      ['evolve_8_4', 270, 370],
    ];
    for (const [key, widthMm, heightMm] of agreeing) {
      const { box } = ELEVATION_ART_AUTHORITY[key];
      const check = elevationArtAspectCheck(box, { width: widthMm, height: heightMm }, 0.15);
      expect(check.known).toBe(true);
      expect(check.ok).toBe(true);
    }
  });

  it('the stale declared boxes are gone from the icons they misled', () => {
    for (const name of ['Q45FaceIcon', 'Q85FaceIcon', 'Evolve21FaceIcon', 'Evolve42FaceIcon', 'Evolve63FaceIcon', 'Evolve84FaceIcon']) {
      expect(iconBody(iconsSource, name)).not.toMatch(/viewBox="0 0 100 100"/);
    }
    expect(iconBody(iconsSource, 'Evolve31FaceIcon')).not.toMatch(/viewBox="0 0 751 1024"/);
    expect(iconBody(iconsSource, 'Q63FaceIcon')).not.toMatch(/916 916/);
  });
});

describe('artwork with no trustworthy crop is drawn unchanged, and reported', () => {
  it('a named artwork with no entry resolves to the fallback, with no box at all', () => {
    const resolved = resolveElevationArtwork('not-a-real-artwork');
    expect(resolved.mode).toBe(ELEVATION_ART_MODE.FALLBACK);
    expect(resolved.box).toBeNull();
    expect(resolved.fitRatio).toBe(ELEVATION_ART_FIT_LEGACY);
  });

  it('the fallback is logged with the artwork key', () => {
    resetNormalisationFallbackLog();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveElevationArtwork('unmeasured-artwork');
    expect(warn).toHaveBeenCalledWith(NORMALISATION_FALLBACK, {
      artworkKey: 'unmeasured-artwork',
      reason: 'no-crop-metadata',
    });
    warn.mockRestore();
  });

  it('a fallback keeps the legacy enlargement AND the artwork original box', () => {
    // The catalogue C4-1 drawing serves several cabinet lengths, so it has no
    // single face to check a crop against and is drawn exactly as it always was.
    expect(elevationArtFitRatio('c41')).toBe(ELEVATION_ART_FIT_LEGACY);
    expect(rendererSource).toMatch(/normalised\s*\n?\s*\?\s*resolved\.box/);
    expect(rendererSource).toMatch(/: declared\.box/);
    expect(rendererSource).toMatch(/declared\.width/);
    expect(rendererSource).toMatch(/declared\.height/);
  });

  it('a model with no elevation artwork keeps the legacy enlargement', () => {
    expect(elevationArtworkKeyForModel('sub3-12')).toBeNull();
    expect(elevationArtworkKeyForModel('architect-2-1')).toBeNull();
    expect(elevationArtFitRatio(elevationArtworkKeyForModel('sub3-12'))).toBe(ELEVATION_ART_FIT_LEGACY);
    expect(elevationArtFitRatio(elevationArtworkKeyForModel('architect-2-1'))).toBe(ELEVATION_ART_FIT_LEGACY);
  });
});

describe('one renderer, on a clean field, in the editor and in the export alike', () => {
  it('the renderer paints nothing behind the artwork', () => {
    expect(rendererSource).not.toMatch(/<rect/);
    expect(rendererSource).not.toMatch(/#fff/i);
    expect(rendererSource).not.toMatch(/background/);
  });

  it('the renderer crops only, and never resizes the drawing onto the crop', () => {
    // The image is drawn at its NATIVE size under the cropped viewBox, which is
    // what makes the crop bite instead of the drawing being squashed onto it.
    expect(rendererSource).toMatch(/resolved\.native\.width/);
    expect(rendererSource).toMatch(/resolved\.native\.height/);
  });

  it('both live elevations read the one authority', () => {
    expect(frontSource).toMatch(/elevationArtFitRatio/);
    expect(sideSource).toMatch(/elevationArtFitRatio/);
    expect(sideSource).toMatch(/elevationArtworkKeyForModel/);
    // No second copy of the figure survives at a draw site.
    expect(frontSource).not.toMatch(/= 0\.72;/);
    expect(sideSource).not.toMatch(/= 0\.72;/);
  });

  it('the exported elevation pages are the same components, with no export-only treatment', () => {
    expect(reportDrawings).toMatch(/from '@\/components\/room\/FrontElevation'/);
    expect(reportDrawings).toMatch(/from '@\/components\/room\/SideElevation'/);
    // The renderer is the only place the artwork is placed, so the export cannot
    // drift from the editor.
    for (const text of [iconsSource, c41IconsSource]) {
      expect(text).not.toMatch(/preserveAspectRatio="none"[\s\S]{0,120}<image/);
    }
  });
});