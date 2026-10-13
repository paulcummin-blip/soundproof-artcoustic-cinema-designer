/**
 * proposal-image-presentation.test.mjs
 * -------------------------------------
 * Guards the Proposal's three image presentation modes: FULL WIDTH, DETAIL and
 * CROPPED DETAIL.
 *
 * What it checks, and nothing else:
 *   - the three modes exist, labelled, with the two smaller modes at roughly
 *     half to two thirds of the usable width;
 *   - DETAIL is the mode that NEVER crops, and its crop permission is false
 *     however much room the page has;
 *   - CROPPED DETAIL is the mode where cropping IS permitted, so the focal
 *     point applies to it and only to it;
 *   - an image with NO preference recorded keeps the behaviour it always had,
 *     and an unrecognised value is ignored rather than shrinking or cropping an
 *     image;
 *   - the placement carries the choice and the permission, so the composer and
 *     the printed sheet read the same decision.
 *
 * Plain node assertions and no runner: the authority imports nothing, so it can
 * be exercised directly. No image file, page or PDF is read or written.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EDITORIAL_ROLE,
  IMAGE_PRESENTATION,
  IMAGE_PRESENTATION_HELP,
  IMAGE_PRESENTATION_LABELS,
  PRESENTATION_WIDTH_PERCENT,
  imagePresentationOf,
  makePlacement,
  presentationCropAllowed,
  presentationFocalApplies,
} from '../src/components/proposal/images/proposalImagePlacementAuthority.js';

const asset = (patch = {}) => ({
  id: 'asset-plan',
  file_url: 'https://example.test/plan.png',
  caption: 'Dimensioned plan',
  ...patch,
});

const placementFor = (patch) => makePlacement({
  source: asset(patch),
  role: EDITORIAL_ROLE.LANDSCAPE_FEATURE,
  sectionId: 'design_overview',
  pagePosition: 3,
  order: 2,
});

test('the three modes are declared, labelled and explained', () => {
  assert.deepEqual(
    Object.values(IMAGE_PRESENTATION).sort(),
    ['cropped_detail', 'detail', 'full_width'],
  );
  for (const mode of Object.values(IMAGE_PRESENTATION)) {
    assert.ok(IMAGE_PRESENTATION_LABELS[mode], `${mode} must carry a label`);
    assert.ok(IMAGE_PRESENTATION_HELP[mode], `${mode} must carry its guidance`);
  }
  assert.equal(IMAGE_PRESENTATION_LABELS[IMAGE_PRESENTATION.DETAIL], 'Detail');
  assert.equal(IMAGE_PRESENTATION_LABELS[IMAGE_PRESENTATION.CROPPED_DETAIL], 'Cropped detail');
  assert.equal(IMAGE_PRESENTATION_LABELS[IMAGE_PRESENTATION.FULL_WIDTH], 'Full width');
});

test('the two smaller modes sit between half and two thirds of the width', () => {
  assert.equal(PRESENTATION_WIDTH_PERCENT[IMAGE_PRESENTATION.FULL_WIDTH], 100);
  for (const mode of [IMAGE_PRESENTATION.DETAIL, IMAGE_PRESENTATION.CROPPED_DETAIL]) {
    const share = PRESENTATION_WIDTH_PERCENT[mode];
    assert.ok(share >= 50 && share <= 65, `${mode} must be composed between 50 and 65 per cent, got ${share}`);
  }
});

test('DETAIL never crops, whatever room the page has', () => {
  const placement = placementFor({ image_presentation: IMAGE_PRESENTATION.DETAIL });

  assert.equal(placement.image_presentation, IMAGE_PRESENTATION.DETAIL);
  assert.equal(placement.crop_allowed, false, 'a detail image is shown whole');
  assert.equal(presentationCropAllowed(IMAGE_PRESENTATION.DETAIL), false);
  assert.equal(presentationFocalApplies(IMAGE_PRESENTATION.DETAIL), false, 'the focal point has no effect on a detail image');
  assert.equal(placement.presentation_width_percent, 58);
  // The caption travels with the placement, so the caption stays attached.
  assert.equal(placement.source_caption, 'Dimensioned plan');
});

test('CROPPED DETAIL is the mode that permits cropping, and reads the focal point', () => {
  const placement = placementFor({
    image_presentation: IMAGE_PRESENTATION.CROPPED_DETAIL,
    focal_horizontal: 'right',
    focal_vertical: 'bottom',
  });

  assert.equal(placement.crop_allowed, true);
  assert.equal(presentationCropAllowed(IMAGE_PRESENTATION.CROPPED_DETAIL), true);
  assert.equal(presentationFocalApplies(IMAGE_PRESENTATION.CROPPED_DETAIL), true);
  assert.deepEqual(placement.focal_point, { horizontal: 'right', vertical: 'bottom' });
  assert.equal(placement.presentation_width_percent, 58);
});

test('FULL WIDTH keeps the prominent editorial treatment at the full width', () => {
  const placement = placementFor({ image_presentation: IMAGE_PRESENTATION.FULL_WIDTH });

  assert.equal(placement.image_presentation, IMAGE_PRESENTATION.FULL_WIDTH);
  assert.equal(placement.presentation_width_percent, 100);
  assert.equal(placement.crop_allowed, true, 'the full width mode keeps the treatment the document already gives a feature');
});

test('an image with no preference keeps the behaviour it always had', () => {
  for (const nothing of [undefined, null, '', 'wide']) {
    const value = nothing === undefined ? undefined : nothing;
    const placement = placementFor({ image_presentation: value });

    assert.equal(imagePresentationOf({ image_presentation: value }), null, `${String(value)} is not a declared mode`);
    assert.equal(placement.image_presentation, null);
    assert.equal(placement.presentation_width_percent, null, 'no width is stated, so no frame is changed');
    assert.equal(placement.crop_allowed, true, 'the image is composed exactly as before');
  }

  assert.equal(imagePresentationOf(asset()), null);
  assert.equal(makePlacement({
    source: asset(),
    role: EDITORIAL_ROLE.LANDSCAPE_FEATURE,
    sectionId: 'design_overview',
    pagePosition: 3,
    order: 2,
  }).image_presentation, null);
});

test('the choice travels on the placement without a second lookup of the record', () => {
  const placement = placementFor({ image_presentation: IMAGE_PRESENTATION.DETAIL });

  assert.equal(placement.source_asset_id, 'asset-plan');
  assert.equal(placement.source_file_url, 'https://example.test/plan.png');
  assert.equal(placement.editorial_role, EDITORIAL_ROLE.LANDSCAPE_FEATURE);
  assert.equal(placement.source_caption, 'Dimensioned plan');
});