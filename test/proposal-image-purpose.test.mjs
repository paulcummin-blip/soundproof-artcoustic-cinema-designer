/**
 * proposal-image-purpose.test.mjs
 * -------------------------------
 * Guards IMAGE PURPOSE — what the designer intends an image to communicate — and
 * the one crop protection that follows from it.
 *
 * What it checks, and nothing else:
 *   - the six purposes exist, each labelled and explained;
 *   - a purpose is read only from the declared values: anything else is null, so
 *     an image with nothing recorded — or with a bad value — is composed exactly
 *     as the proposal always composed it;
 *   - A LAYOUT DRAWING IS NEVER CROPPED, whatever presentation was selected, and
 *     the protection cannot be overridden to fit a page;
 *   - the protection belongs to drawings alone: an ordinary image keeps the
 *     permission its presentation states;
 *   - the purpose and the permission travel on the placement, so the composer and
 *     the printed sheet read one decision;
 *   - a supporting image is placed in the section its purpose belongs with, and
 *     keeps the established treatment where no purpose is recorded;
 *   - the seating example: both renders full width, the plan smaller and
 *     uncropped, associated with its option through the EXISTING seating
 *     metadata, with no second association field and no image reassigned.
 *
 * Plain node assertions and no runner: the authority and the planner import
 * nothing but each other, so both can be exercised directly. No image file, page
 * or PDF is read or written.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EDITORIAL_ROLE,
  IMAGE_PRESENTATION,
  IMAGE_PURPOSE,
  IMAGE_PURPOSE_HELP,
  IMAGE_PURPOSE_LABELS,
  PURPOSE_SECTION_TYPES,
  SEATING_STYLE_SECTION_ID,
  imagePurposeOf,
  isDrawingPurpose,
  isProtectedDrawing,
  makePlacement,
  placementCropAllowed,
  purposeSectionTypes,
  seatingStyleOf,
} from '../src/components/proposal/images/proposalImagePlacementAuthority.js';
import {
  composeSectionSlots,
  planProposalImages,
} from '../src/components/proposal/images/proposalImagePlanner.js';

const asset = (patch = {}) => ({
  id: 'asset-1',
  file_url: 'https://files.example/one.jpg',
  usage: 'gallery',
  ...patch,
});

const placementFor = (patch, role = EDITORIAL_ROLE.LANDSCAPE_FEATURE) => makePlacement({
  source: asset(patch),
  role,
  sectionId: 'section-1',
  pagePosition: 2,
  order: 1,
});

const PURPOSES = [
  IMAGE_PURPOSE.WHOLE_ROOM,
  IMAGE_PURPOSE.SEATING_OPTION,
  IMAGE_PURPOSE.LAYOUT_DRAWING,
  IMAGE_PURPOSE.INTERIOR_DETAIL,
  IMAGE_PURPOSE.PRODUCT_DETAIL,
  IMAGE_PURPOSE.OTHER,
];

test('the six purposes exist, each labelled and explained', () => {
  PURPOSES.forEach((purpose) => {
    assert.ok(IMAGE_PURPOSE_LABELS[purpose], `${purpose} is labelled`);
    assert.ok(IMAGE_PURPOSE_HELP[purpose], `${purpose} is explained`);
  });
  assert.equal(IMAGE_PURPOSE_LABELS[IMAGE_PURPOSE.LAYOUT_DRAWING], 'Layout drawing');
  assert.equal(IMAGE_PURPOSE_LABELS[IMAGE_PURPOSE.SEATING_OPTION], 'Seating option');
  assert.equal(Object.keys(IMAGE_PURPOSE_LABELS).length, PURPOSES.length);
});

test('a purpose is read only from the declared values, and unrecorded means unchanged', () => {
  assert.equal(imagePurposeOf(asset()), null, 'no purpose recorded');
  assert.equal(imagePurposeOf(asset({ image_purpose: null })), null);
  assert.equal(imagePurposeOf(asset({ image_purpose: '' })), null);
  assert.equal(imagePurposeOf(asset({ image_purpose: '  ' })), null);
  assert.equal(imagePurposeOf(asset({ image_purpose: 'hero_shot' })), null, 'unknown is ignored');
  assert.equal(imagePurposeOf(asset({ image_purpose: 'LAYOUT_DRAWING' })), null, 'case is not guessed at');
  PURPOSES.forEach((purpose) => {
    assert.equal(imagePurposeOf(asset({ image_purpose: purpose })), purpose);
  });
});

test('a layout drawing is identified, and is never cropped whatever presentation was selected', () => {
  assert.equal(isDrawingPurpose(IMAGE_PURPOSE.LAYOUT_DRAWING), true);
  assert.equal(isProtectedDrawing(asset({ image_purpose: IMAGE_PURPOSE.LAYOUT_DRAWING })), true);
  PURPOSES.filter((purpose) => purpose !== IMAGE_PURPOSE.LAYOUT_DRAWING).forEach((purpose) => {
    assert.equal(isDrawingPurpose(purpose), false, `${purpose} is not a drawing`);
    assert.equal(isProtectedDrawing(asset({ image_purpose: purpose })), false);
  });

  // Every presentation, including the crop-permitting ones: the drawing is whole.
  [undefined, null, '', IMAGE_PRESENTATION.FULL_WIDTH, IMAGE_PRESENTATION.DETAIL,
    IMAGE_PRESENTATION.CROPPED_DETAIL, 'not_a_mode'].forEach((presentation) => {
    assert.equal(
      placementCropAllowed({ presentation, purpose: IMAGE_PURPOSE.LAYOUT_DRAWING }),
      false,
      `a drawing is uncropped with presentation ${String(presentation)}`,
    );
  });

  const drawing = placementFor({ image_purpose: IMAGE_PURPOSE.LAYOUT_DRAWING });
  assert.equal(drawing.crop_protected, true);
  assert.equal(drawing.crop_allowed, false);
  assert.equal(drawing.image_purpose, IMAGE_PURPOSE.LAYOUT_DRAWING);

  // A crop mode may be selected on a drawing: the selection is preserved and
  // reported, and the permission it would otherwise grant is withheld.
  const selectedCrop = placementFor({
    image_purpose: IMAGE_PURPOSE.LAYOUT_DRAWING,
    image_presentation: IMAGE_PRESENTATION.CROPPED_DETAIL,
  });
  assert.equal(selectedCrop.image_presentation, IMAGE_PRESENTATION.CROPPED_DETAIL);
  assert.equal(selectedCrop.crop_allowed, false);
  assert.equal(selectedCrop.crop_protected, true);
});

test('the protection belongs to drawings alone', () => {
  assert.equal(placementCropAllowed({ presentation: IMAGE_PRESENTATION.FULL_WIDTH, purpose: IMAGE_PURPOSE.WHOLE_ROOM }), true);
  assert.equal(placementCropAllowed({ presentation: IMAGE_PRESENTATION.DETAIL, purpose: IMAGE_PURPOSE.INTERIOR_DETAIL }), false);
  assert.equal(placementCropAllowed({ presentation: IMAGE_PRESENTATION.CROPPED_DETAIL, purpose: IMAGE_PURPOSE.PRODUCT_DETAIL }), true);
  // Nothing recorded: the behaviour the document has always had.
  assert.equal(placementCropAllowed({}), true);
  assert.equal(placementCropAllowed(), true);

  const ordinary = placementFor({
    image_purpose: IMAGE_PURPOSE.INTERIOR_DETAIL,
    image_presentation: IMAGE_PRESENTATION.CROPPED_DETAIL,
  });
  assert.equal(ordinary.crop_protected, false);
  assert.equal(ordinary.crop_allowed, true);
});

test('the purpose and the permission travel on the placement', () => {
  const placed = placementFor({
    image_purpose: IMAGE_PURPOSE.SEATING_OPTION,
    image_presentation: IMAGE_PRESENTATION.FULL_WIDTH,
  });
  assert.equal(placed.image_purpose, IMAGE_PURPOSE.SEATING_OPTION);
  assert.equal(placed.crop_allowed, true);
  assert.equal(placed.crop_protected, false);
  assert.equal(placed.image_presentation, IMAGE_PRESENTATION.FULL_WIDTH);
});

test('each purpose states the sections it belongs with, and none is invented', () => {
  PURPOSES.forEach((purpose) => {
    const types = purposeSectionTypes(purpose);
    assert.ok(Array.isArray(types), `${purpose} states a list`);
    assert.deepEqual(types, PURPOSE_SECTION_TYPES[purpose]);
  });
  assert.deepEqual(purposeSectionTypes(IMAGE_PURPOSE.OTHER), []);
  assert.deepEqual(purposeSectionTypes(null), []);
  assert.ok(purposeSectionTypes(IMAGE_PURPOSE.LAYOUT_DRAWING).includes('spatial_resolution'));
});

const SECTIONS = [
  { id: 'sec-overview', section_type: 'system_design_summary', is_enabled: true },
  { id: 'sec-spatial', section_type: 'spatial_resolution', is_enabled: true },
  { id: 'sec-dynamic', section_type: 'dynamic_range', is_enabled: true },
  { id: 'sec-timbre', section_type: 'timbre_matching', is_enabled: true },
  { id: 'sec-products', section_type: 'products', is_enabled: true },
  { id: 'sec-closing', section_type: 'conclusion', is_enabled: true },
];

const SECTION_SLOTS = composeSectionSlots({
  sections: SECTIONS,
  sectionTypes: SECTIONS.map((section) => section.section_type),
});

const plan = (assets) => planProposalImages({
  assets,
  sectionSlots: SECTION_SLOTS,
  coverAssetId: assets[0]?.id || null,
});

test('a supporting image takes the section its purpose belongs with, and keeps the established one without a purpose', () => {
  const withPurpose = [
    asset({ id: 'cover', file_url: 'https://files.example/cover.jpg', slot: 'cover' }),
    asset({ id: 'feature', file_url: 'https://files.example/room.jpg', image_purpose: IMAGE_PURPOSE.WHOLE_ROOM, image_presentation: IMAGE_PRESENTATION.FULL_WIDTH }),
    asset({ id: 'equipment', file_url: 'https://files.example/amp.jpg', image_purpose: IMAGE_PURPOSE.PRODUCT_DETAIL, image_presentation: IMAGE_PRESENTATION.DETAIL }),
  ];
  const placed = plan(withPurpose).placements
    .find((placement) => placement.source_asset_id === 'equipment');
  assert.ok(placed, 'the equipment image is placed');
  assert.equal(placed.section_id, 'sec-products', 'it sits with the products copy it explains');
  // Shown whole because the designer chose Inline Detail — not because the image
  // is a drawing. The two reasons are distinct and both are stated.
  assert.equal(placed.crop_allowed, false);
  assert.equal(placed.crop_protected, false);

  const withoutPurpose = withPurpose.map((item) => (
    item.id === 'equipment' ? { ...item, image_purpose: null, image_presentation: null } : item
  ));
  const fallback = plan(withoutPurpose).placements
    .find((placement) => placement.source_asset_id === 'equipment');
  assert.ok(fallback, 'the equipment image is still placed');
  assert.equal(fallback.source_asset_id, 'equipment');
  assert.equal(fallback.image_purpose, null);
  assert.equal(fallback.crop_allowed, true);
});

test('the seating example: both renders full width, the plan smaller and uncropped, its option read from the existing metadata', () => {
  const assets = [
    asset({ id: 'cover', file_url: 'https://files.example/cover.jpg', slot: 'cover' }),
    asset({
      id: 'recliner-render',
      file_url: 'https://files.example/recliner.jpg',
      caption: 'Formal cinema seating',
      seating_style: 'recliner',
      image_purpose: IMAGE_PURPOSE.SEATING_OPTION,
      image_presentation: IMAGE_PRESENTATION.FULL_WIDTH,
    }),
    asset({
      id: 'sofa-render',
      file_url: 'https://files.example/sofa.jpg',
      caption: 'Relaxed sofas',
      seating_style: 'lounge',
      image_purpose: IMAGE_PURPOSE.SEATING_OPTION,
      image_presentation: IMAGE_PRESENTATION.FULL_WIDTH,
    }),
    asset({
      id: 'sofa-plan',
      file_url: 'https://files.example/sofa-plan.png',
      caption: 'Plan view for sofa seating',
      seating_style: 'lounge',
      image_purpose: IMAGE_PURPOSE.LAYOUT_DRAWING,
      image_presentation: IMAGE_PRESENTATION.DETAIL,
    }),
  ];

  const result = plan(assets);
  const seating = result.placements.filter(
    (placement) => placement.section_id === SEATING_STYLE_SECTION_ID,
  );
  assert.equal(seating.length, 3, 'every seating image travels with the seating option');
  assert.equal(result.selectedImageUrls.length, 4, 'no selected image is dropped');

  const bySource = Object.fromEntries(seating.map((placement) => [placement.source_asset_id, placement]));
  assert.equal(bySource['recliner-render'].image_presentation, IMAGE_PRESENTATION.FULL_WIDTH);
  assert.equal(bySource['recliner-render'].crop_allowed, true);
  assert.equal(bySource['sofa-render'].image_presentation, IMAGE_PRESENTATION.FULL_WIDTH);
  assert.equal(bySource['sofa-render'].crop_allowed, true);

  const placedPlan = bySource['sofa-plan'];
  assert.ok(placedPlan, 'the plan is placed');
  assert.equal(placedPlan.image_presentation, IMAGE_PRESENTATION.DETAIL);
  assert.equal(placedPlan.crop_allowed, false, 'the drawing is never cropped');
  assert.equal(placedPlan.crop_protected, true);
  assert.equal(placedPlan.image_purpose, IMAGE_PURPOSE.LAYOUT_DRAWING);
  assert.equal(placedPlan.source_caption, 'Plan view for sofa seating', 'the caption stays with the drawing');

  // The association is the EXISTING seating metadata — one field, no duplicate.
  assert.equal(seatingStyleOf(assets[3]), 'lounge');
  assert.equal(seatingStyleOf(assets[2]), 'lounge');
  assert.equal(seatingStyleOf(assets[1]), 'recliner');
  assert.equal(placedPlan.comparison_option_label, null, 'no second association field is invented');

  // Nothing is reassigned: each placement still points at its own stored file.
  seating.forEach((placement) => {
    const source = assets.find((item) => item.id === placement.source_asset_id);
    assert.equal(placement.source_file_url, source.file_url);
  });
});