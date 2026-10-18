/**
 * proposal-image-composition.test.mjs
 * -----------------------------------
 * The Image Library presentation field is the authority for document
 * composition, so these tests hold the two weights apart:
 *
 *   Full Width        the primary image: the full content width, its own
 *                     proportions, eligible to lead a page — and never grouped
 *                     onto a sheet with another image.
 *   Detail            supporting evidence: deliberately smaller than the content
 *                     width (the 30 to 45 per cent band), never the page hero,
 *                     and never promoted to the full content width.
 *   nothing recorded  unchanged: the grouping the document always used.
 *
 * The last group reads the two surface stylesheets as text, because a
 * composition that never reaches the sheet is not a composition.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPOSITION_WEIGHT,
  IMAGE_PRESENTATION,
  PRESENTATION_WIDTH_PERCENT,
  presentationComposition,
} from '../components/proposal/images/proposalImagePlacementAuthority.js';
import { imagePageKind, imagePagesFor } from '../components/proposal/print/imagePageLayout.js';
import { planProposalImages } from '../components/proposal/images/proposalImagePlanner.js';

const asset = (id, extra = {}) => ({ id, file_url: `https://example.test/${id}.jpg`, ...extra });
const fullWidth = (id) => asset(id, { image_presentation: IMAGE_PRESENTATION.FULL_WIDTH });
const detail = (id) => asset(id, { image_presentation: IMAGE_PRESENTATION.DETAIL });
const croppedDetail = (id) => asset(id, { image_presentation: IMAGE_PRESENTATION.CROPPED_DETAIL });

describe('the recorded presentation is read as one composition weight', () => {
  it('reads a Full Width choice as the primary, page-leading image', () => {
    const composition = presentationComposition(fullWidth('a'));

    expect(composition.weight).toBe(COMPOSITION_WEIGHT.PRIMARY);
    expect(composition.widthPercent).toBe(100);
    expect(composition.heroEligible).toBe(true);
  });

  it('reads a Detail choice as supporting: never the hero, never the full width', () => {
    const composition = presentationComposition(detail('b'));

    expect(composition.weight).toBe(COMPOSITION_WEIGHT.SUPPORTING);
    expect(composition.heroEligible).toBe(false);
    expect(composition.widthPercent).toBeLessThan(100);
    expect(composition.widthPercent).toBeGreaterThanOrEqual(30);
    expect(composition.widthPercent).toBeLessThanOrEqual(45);
    expect(composition.cropAllowed).toBe(false);
  });

  it('holds both supporting modes at the same supporting share', () => {
    expect(PRESENTATION_WIDTH_PERCENT[IMAGE_PRESENTATION.DETAIL])
      .toBe(PRESENTATION_WIDTH_PERCENT[IMAGE_PRESENTATION.CROPPED_DETAIL]);
    expect(presentationComposition(croppedDetail('c')).weight).toBe(COMPOSITION_WEIGHT.SUPPORTING);
    expect(presentationComposition(croppedDetail('c')).heroEligible).toBe(false);
  });

  it('keeps a dimensioned drawing legible while still composing it as supporting', () => {
    const composition = presentationComposition({
      ...detail('d'),
      image_purpose: 'layout_drawing',
    });

    expect(composition.weight).toBe(COMPOSITION_WEIGHT.SUPPORTING);
    expect(composition.heroEligible).toBe(false);
    expect(composition.cropAllowed).toBe(false);
    expect(composition.widthPercent).toBeGreaterThan(PRESENTATION_WIDTH_PERCENT[IMAGE_PRESENTATION.DETAIL]);
    expect(composition.widthPercent).toBeLessThan(100);
  });

  it('keeps an image with nothing recorded exactly as the document composed it', () => {
    const composition = presentationComposition(asset('e'));

    expect(composition.weight).toBe(COMPOSITION_WEIGHT.UNSTATED);
    expect(composition.widthPercent).toBeNull();
    expect(composition.cropAllowed).toBe(true);
  });
});

describe('cover and body placement stay independent', () => {
  it('does not reuse a cover-only asset in the body merely because it has an image purpose', () => {
    const cover = asset('cover', {
      slot: 'cover',
      usage: 'gallery',
      image_purpose: 'whole_room',
      image_presentation: null,
    });
    const body = fullWidth('body');
    const plan = planProposalImages({
      assets: [cover, body],
      coverAssetId: cover.id,
      sectionSlots: [
        { section_type: 'system_design_summary', section_id: 'summary' },
        { section_type: 'spatial_resolution', section_id: 'spatial' },
        { section_type: 'dynamic_range', section_id: 'dynamic' },
        { section_type: 'timbre_matching', section_id: 'timbre' },
      ],
    });

    expect(plan.coverPlacement.source_asset_id).toBe(cover.id);
    expect(plan.placements.filter((placement) => placement.source_asset_id === cover.id)).toHaveLength(1);
    expect(plan.flowImages.some((placement) => placement.source_asset_id === cover.id)).toBe(false);
    expect(plan.placements.some((placement) => placement.source_asset_id === body.id)).toBe(true);
  });
});

describe('the image sheets are grouped by weight, not by count', () => {
  it('gives a Full Width image a sheet of its own, and never pairs it with another image', () => {
    const pages = imagePagesFor([fullWidth('f1'), fullWidth('f2'), detail('d1')]);

    expect(pages.map((page) => page.map((entry) => entry.id))).toEqual([['f1'], ['f2'], ['d1']]);
    expect(imagePageKind(pages[0])).toBe('feature');
    expect(imagePageKind(pages[1])).toBe('feature');
    expect(imagePageKind(pages[2])).toBe('supporting');
  });

  it('never lets a supporting image lead a sheet, or share one with a Full Width image', () => {
    const pages = imagePagesFor([detail('d1'), fullWidth('f1'), detail('d2'), detail('d3')]);

    expect(pages.map((page) => page.map((entry) => entry.id))).toEqual([['d1'], ['f1'], ['d2', 'd3']]);
    expect(imagePageKind(pages[0])).toBe('supporting');
    expect(imagePageKind(pages[1])).toBe('feature');
    expect(imagePageKind(pages[2])).toBe('supporting');
  });

  it('keeps the established grouping where nothing is recorded', () => {
    const photographs = Array.from({ length: 8 }, (unused, index) => asset(`p${index}`));

    expect(imagePagesFor(photographs).map((page) => page.length)).toEqual([3, 3, 2]);
    expect(imagePageKind(imagePagesFor(photographs)[0])).toBe('photographs');
  });
});

describe('the composition reaches the document sheets', () => {
  const read = (relative) => fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', relative), 'utf8',
  );

  it('composes a supporting image at the supporting share in the printed pack', () => {
    const placement = read('components/proposal/print/ProposalImagePlacementStyles.jsx');

    expect(placement).toMatch(/pp-media--presentation-detail \{ width: 40%/);
    expect(placement).toMatch(/pp-media--presentation-cropped-detail \{ width: 40%/);
  });

  it('gives the selected-image sheets a supporting layout of their own', () => {
    const pack = read('components/proposal/print/ProposalPackStyles.jsx');

    expect(pack).toMatch(/pp-gallery--supporting \{/);
    expect(pack).toMatch(/pp-gallery__figure--supporting \{[\s\S]*?width: 40%/);
  });

  it('composes the report image block at the two weights, in the preview and the PDF', () => {
    const styles = read('components/proposal/export/ProposalPrintStyles.jsx');
    const block = read('components/proposal/ProjectImagesBlock.jsx');

    expect(styles).toMatch(/\.proposal-images__support \{/);
    expect(styles).toMatch(/\.proposal-images__support \.proposal-images__figure \{[\s\S]*?width: 40%/);
    expect(block).toMatch(/proposal-images__figure--feature/);
  });

  it('prints no concept-visual explanation caption on an image page', () => {
    expect(read('components/proposal/print/ProjectImagesPage.jsx')).not.toMatch(/concept visual/i);
    expect(read('components/proposal/ProjectImagesBlock.jsx')).not.toMatch(/concept visual/i);
  });
});