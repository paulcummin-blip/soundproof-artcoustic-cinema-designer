/**
 * proposal-inline-detail-section-target.test.mjs
 * ----------------------------------------------
 * PLACE WITH IS THE AUTHORITY FOR AN INLINE DETAIL IMAGE.
 *
 * The rule under test: an Inline Detail image is composed with the ONE Proposal
 * section the designer chose on its own card, and with no other. Nothing else
 * decides its section — not the image purpose, not the product or the model, not
 * the room left on a page, not a previous placement, not the file name. An Inline
 * Detail image that names no section is placed NOWHERE and reported as awaiting
 * one, rather than silently landing in whichever section happens to have space.
 *
 * The reported defect this covers: a Spitfire Q6-3 product image (purpose: Product
 * detail, presentation: Inline Detail) was composed under Spatial Resolution.
 *
 * Run: node test/proposal-inline-detail-section-target.test.mjs
 * (Plain node assertions, no test runner: the modules under test import nothing
 * but each other.)
 */

import assert from 'node:assert/strict';
import {
  EDITORIAL_ROLE,
  IMAGE_PRESENTATION,
  IMAGE_PURPOSE,
  PROPOSAL_SECTION_TARGET,
  PROPOSAL_SECTION_TARGET_LABELS,
  PROPOSAL_SECTION_TARGET_ORDER,
  SECTION_TARGET_CHOOSE,
  SECTION_TARGET_LABEL,
  inlineDetailAwaitingSection,
  sectionTargetOf,
} from '../src/components/proposal/images/proposalImagePlacementAuthority.js';
import {
  composeSectionSlots,
  planProposalImages,
  resolveCoverAssetId,
} from '../src/components/proposal/images/proposalImagePlanner.js';

const SECTION_TYPES = [
  'cover',
  'system_design_summary',
  'spatial_resolution',
  'dynamic_range',
  'timbre_matching',
  'overall_design',
];

const sections = SECTION_TYPES
  .filter((type) => type !== 'cover')
  .map((type, index) => ({ id: `section-${type}`, section_type: type, is_enabled: true, order_index: index + 1 }));

const sectionSlots = composeSectionSlots({ sections, sectionTypes: SECTION_TYPES });

const assets = [
  { id: 'asset-1', file_url: 'https://example.test/image-1.jpg', caption: 'Cover', slot: 'cover', order_index: 0 },
  {
    id: 'asset-2',
    file_url: 'https://example.test/image-2.jpg',
    caption: 'Room',
    slot: 'image_1',
    order_index: 1,
    image_presentation: IMAGE_PRESENTATION.FULL_WIDTH,
    image_purpose: IMAGE_PURPOSE.WHOLE_ROOM,
  },
  // THE REPORTED CASE: a product image the designer placed with Dynamic Range.
  {
    id: 'asset-3',
    file_url: 'https://example.test/image-3.jpg',
    caption: 'Spitfire Q6-3',
    slot: 'image_2',
    order_index: 2,
    image_presentation: IMAGE_PRESENTATION.DETAIL,
    image_purpose: IMAGE_PURPOSE.PRODUCT_DETAIL,
    section_target: PROPOSAL_SECTION_TARGET.DYNAMIC_RANGE,
  },
  // An older Inline Detail image with no section chosen: it must WAIT, not guess.
  {
    id: 'asset-4',
    file_url: 'https://example.test/image-4.jpg',
    caption: 'LCR detail',
    slot: 'image_3',
    order_index: 3,
    image_presentation: IMAGE_PRESENTATION.DETAIL,
    image_purpose: IMAGE_PURPOSE.PRODUCT_DETAIL,
  },
];

const coverAssetId = resolveCoverAssetId({ assets, coverImageUrl: 'https://example.test/image-1.jpg' });
const planned = planProposalImages({ assets, sectionSlots, coverAssetId });
const sectionIdOf = (type) => sections.find((section) => section.section_type === type).id;
const placementsOf = (assetId) => planned.placements.filter((placement) => placement.source_asset_id === assetId);

const results = [];
const test = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
};

// ── 1. The control's own vocabulary: five sections, and no Key Performance
//       Highlights. ──
test('offers the five Proposal sections and never Key Performance Highlights', () => {
  assert.equal(SECTION_TARGET_LABEL, 'Place with');
  assert.equal(SECTION_TARGET_CHOOSE, 'Choose Proposal section');
  assert.deepEqual([...PROPOSAL_SECTION_TARGET_ORDER], [
    'system_design_summary',
    'spatial_resolution',
    'dynamic_range',
    'timbre_matching',
    'overall_design',
  ]);
  assert.deepEqual(
    PROPOSAL_SECTION_TARGET_ORDER.map((value) => PROPOSAL_SECTION_TARGET_LABELS[value]),
    ['System Design Summary', 'Spatial Resolution', 'Dynamic Range', 'Timbre Matching', 'Overall Design'],
  );
  assert.equal(
    PROPOSAL_SECTION_TARGET_ORDER.includes('key_performance_highlights'),
    false,
    'the evidence-led page is never an image-placement target',
  );
  return PROPOSAL_SECTION_TARGET_ORDER.map((value) => PROPOSAL_SECTION_TARGET_LABELS[value]).join(', ');
});

// ── 2. Only the five declared sections are read; anything else is no target. ──
test('reads only the five declared sections as a target', () => {
  assert.equal(sectionTargetOf({ section_target: 'dynamic_range' }), 'dynamic_range');
  assert.equal(sectionTargetOf({ section_target: 'key_performance_highlights' }), null);
  assert.equal(sectionTargetOf({ section_target: 'products' }), null);
  assert.equal(sectionTargetOf({ section_target: '   ' }), null);
  assert.equal(sectionTargetOf({}), null);
  assert.equal(sectionTargetOf(null), null);
  assert.equal(inlineDetailAwaitingSection({ image_presentation: 'detail' }), true);
  assert.equal(
    inlineDetailAwaitingSection({ image_presentation: 'detail', section_target: 'dynamic_range' }),
    false,
  );
  assert.equal(inlineDetailAwaitingSection({ image_presentation: 'full_width' }), false);
  return 'a bad or unknown value can never place an image in a section that does not exist';
});

// ── 3. THE REPORTED CASE: the Inline Detail product image is composed with the
//       section its target names — smaller, beside that section's copy, whole. ──
test('an Inline Detail image is composed with the section its PLACE WITH target names', () => {
  const [placement] = placementsOf('asset-3');
  assert.ok(placement, 'the Inline Detail image is placed');
  assert.equal(placement.section_id, sectionIdOf('dynamic_range'), 'its section is Dynamic Range');
  assert.equal(placement.section_id, 'section-dynamic_range');
  assert.equal(placement.section_target, 'dynamic_range', 'the target travels with the placement');
  assert.equal(placement.image_presentation, IMAGE_PRESENTATION.DETAIL);
  // The supporting place beside the copy, at the supporting share of the content
  // column — never the page hero, never the full content width.
  assert.equal(placement.editorial_role, EDITORIAL_ROLE.PORTRAIT_EDITORIAL);
  assert.equal(placement.presentation_width_percent, 40);
  assert.equal(placement.crop_allowed, false, 'an Inline Detail image is never cropped');
  assert.equal(placement.crop_protected, false, 'it is shown whole because of its presentation, not its purpose');
  return `${placement.source_caption} → ${placement.section_target} (${placement.editorial_role}, ${placement.presentation_width_percent}%)`;
});

// ── 4. The section it was never given is not used, and no other section claims
//       it: the fallback that put it under Spatial Resolution is gone. ──
test('the Inline Detail image appears in Dynamic Range and nowhere else', () => {
  const sectionsUsed = placementsOf('asset-3').map((placement) => placement.section_id);
  assert.deepEqual(sectionsUsed, [sectionIdOf('dynamic_range')]);
  assert.equal(sectionsUsed.includes(sectionIdOf('spatial_resolution')), false,
    'the reported Spatial Resolution fallback is removed');
  assert.equal(sectionsUsed.includes(sectionIdOf('system_design_summary')), false);
  return `placed in ${sectionsUsed.join(', ')} only`;
});

// ── 5. The target beats the purpose: a Product detail purpose names no section
//       this rule may use, and Dynamic Range still wins. ──
test('the target wins over the image purpose', () => {
  const source = assets.find((asset) => asset.id === 'asset-3');
  // A product detail image's own purpose would never have named Dynamic Range:
  // the section below comes from the designer's PLACE WITH choice alone.
  assert.equal(source.image_purpose, IMAGE_PURPOSE.PRODUCT_DETAIL);
  const [placement] = placementsOf('asset-3');
  assert.equal(placement.section_id, sectionIdOf('dynamic_range'));
  assert.equal(placement.image_purpose, IMAGE_PURPOSE.PRODUCT_DETAIL, 'the purpose is still carried for context');
  return 'purpose recorded, target obeyed';
});

// ── 6. An Inline Detail image with no section chosen is placed NOWHERE, and it
//       is reported so the Image Library can ask for one. ──
test('an Inline Detail image with no target is withheld and reported, never guessed at', () => {
  assert.equal(placementsOf('asset-4').length, 0, 'it is composed nowhere');
  assert.equal(
    planned.placements.some((placement) => placement.source_asset_id === 'asset-4'
      && placement.section_id === sectionIdOf('spatial_resolution')),
    false,
    'in particular it is never dropped into Spatial Resolution',
  );
  assert.deepEqual(planned.detailImagesAwaitingTarget, ['asset-4']);
  assert.equal(planned.flowImages.some((placement) => placement.source_asset_id === 'asset-4'), false,
    'it does not join the narrative flow either: no page claims it because it has room');
  return 'asset-4 awaits a section and prints nowhere';
});

// ── 7. A Full Width image is untouched by this rule: it stays the document's
//       editorial flow image at the full content width. ──
test('Full Width images keep their own authority and are never made detail images', () => {
  const [placement] = placementsOf('asset-2');
  assert.ok(placement, 'the Full Width image is placed');
  assert.equal(placement.editorial_role, EDITORIAL_ROLE.LANDSCAPE_FEATURE);
  assert.equal(placement.image_presentation, IMAGE_PRESENTATION.FULL_WIDTH);
  assert.equal(placement.presentation_width_percent, 100, 'the full content width');
  assert.equal(placement.section_target, null, 'a Full Width image needs no section target');
  return `${placement.source_caption} → ${placement.editorial_role} at ${placement.presentation_width_percent}%`;
});

// ── 8. Nothing else on the plan changed: every other selected source still
//       prints, and the plan is still valid. ──
test('every other selected photograph still prints', () => {
  const placedIds = new Set(planned.placements.map((placement) => placement.source_asset_id));
  ['asset-1', 'asset-2', 'asset-3'].forEach((id) => {
    assert.equal(placedIds.has(id), true, `${id} prints`);
  });
  assert.equal(planned.usableCount, 4);
  return `${placedIds.size} of 4 sources placed, asset-4 awaiting its section`;
});

const failed = results.filter((result) => !result.ok);
results.forEach((result) => {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}`);
  console.log(`      ${result.detail}`);
});
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);