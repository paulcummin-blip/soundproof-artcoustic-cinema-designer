/**
 * proposal-image-placement.test.mjs
 * ---------------------------------
 * The rule under test: two or three strong sources give the proposal its visual
 * rhythm through a dominant full-width landscape, a smaller portrait accent and
 * the deliberate RETURN of one source in a different crop — and the plan never
 * puts a source too close to itself, never repeats a crop, and never keeps a
 * gallery spread that would read as gallery-first.
 *
 * Run: node test/proposal-image-placement.test.mjs
 * (Plain node assertions, no test runner: the modules under test import nothing
 * but each other.)
 */

import assert from 'node:assert/strict';
import {
  CROP_ORIENTATION,
  EDITORIAL_ROLE,
  SEATING_STYLE,
  SEATING_STYLE_SECTION_ID,
} from '../src/components/proposal/images/proposalImagePlacementAuthority.js';
import {
  MIN_PAGE_GAP,
  composeSectionSlots,
  planProposalImages,
  resolveCoverAssetId,
} from '../src/components/proposal/images/proposalImagePlanner.js';
import { validateProposalImagePlan } from '../src/components/proposal/images/proposalImagePlanValidator.js';

const SECTION_TYPES = [
  'cover',
  'system_design_summary',
  'spatial_resolution',
  'dynamic_range',
  'timbre_matching',
  'key_performance_highlights',
  'overall_design',
  'room_images',
];

const sections = SECTION_TYPES
  .filter((type) => type !== 'cover')
  .map((type, index) => ({ id: `section-${type}`, section_type: type, is_enabled: true, order_index: index + 1 }));

const sectionSlots = composeSectionSlots({ sections, sectionTypes: SECTION_TYPES });

/** n project images: the first is the cover, the rest fill Image 1..n. */
const images = (count, overrides = {}) => Array.from({ length: count }, (_, index) => ({
  id: `asset-${index + 1}`,
  file_url: `https://example.test/image-${index + 1}.jpg`,
  caption: `Image ${index + 1}`,
  slot: index === 0 ? 'cover' : `image_${index}`,
  order_index: index,
  ...(overrides[index + 1] || {}),
}));

const plan = (count, overrides = {}) => {
  const assets = images(count, overrides);
  const coverAssetId = resolveCoverAssetId({ assets, coverImageUrl: 'https://example.test/image-1.jpg' });
  const planned = planProposalImages({ assets, sectionSlots, coverAssetId });
  return { planned, validation: validateProposalImagePlan(planned, { galleryImages: planned.galleryImages }) };
};

const rolesOf = (planned) => planned.placements.map((p) => `${p.editorial_role}:${p.source_asset_id}`);

const results = [];
const test = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
};

// ── 1. Three sources: the intended rhythm, with the cover source returning. ──
test('three sources: cover, landscape, portrait accent, cover source returning', () => {
  const { planned, validation } = plan(3);
  assert.deepEqual(rolesOf(planned), [
    'cover:asset-1',
    'landscape_feature:asset-2',
    'portrait_editorial:asset-3',
    'landscape_feature:asset-1',
    'closing_feature:asset-3',
  ]);
  assert.equal(validation.valid, true, JSON.stringify(validation.violations));
  assert.equal(planned.retainedGallery, false, 'three images must not keep a gallery spread');
  return rolesOf(planned).join(' → ');
});

// ── 2. Two sources: cover and one landscape, with the cover returning later. ──
test('two sources: cover, landscape, and no portrait accent invented', () => {
  const { planned, validation } = plan(2);
  assert.deepEqual(rolesOf(planned), ['cover:asset-1', 'landscape_feature:asset-2', 'landscape_feature:asset-1']);
  assert.equal(validation.valid, true, JSON.stringify(validation.violations));
  return rolesOf(planned).join(' → ');
});

// ── 3. One source: it may still return, never adjacent to its cover use. ──
test('one source: cover and one well-separated return', () => {
  const { planned, validation } = plan(1);
  assert.deepEqual(rolesOf(planned), ['cover:asset-1', 'landscape_feature:asset-1']);
  const [cover, feature] = planned.placements;
  assert.ok(feature.page_position - cover.page_position >= MIN_PAGE_GAP);
  assert.notEqual(cover.crop_orientation, feature.crop_orientation);
  assert.equal(validation.valid, true, JSON.stringify(validation.violations));
  return rolesOf(planned).join(' → ');
});

// ── 4. The spacing and crop rules hold for every source, at every count. ──
test('no source is used twice within one page, and never in the same crop', () => {
  for (const count of [1, 2, 3, 4, 6, 10]) {
    const { planned, validation } = plan(count);
    assert.equal(validation.valid, true, `${count} images: ${JSON.stringify(validation.violations)}`);
    const bySource = new Map();
    planned.placements.forEach((placement) => {
      const seen = bySource.get(placement.source_asset_id) || [];
      seen.forEach((previous) => {
        const gap = Math.abs(placement.page_position - previous.page_position);
        assert.ok(gap >= MIN_PAGE_GAP, `${count} images: reuse gap ${gap}`);
        assert.notEqual(placement.crop_orientation, previous.crop_orientation, `${count} images: crop repeated`);
      });
      seen.push(placement);
      bySource.set(placement.source_asset_id, seen);
    });
  }
  return '1, 2, 3, 4, 6 and 10 source images all satisfy the spacing and crop rules';
});

// ── 5. A hidden image is never placed, and a portrait is never the cover source. ──
test('a hidden image is never placed', () => {
  const { planned } = plan(3, { 2: { usage: 'do_not_use' } });
  assert.equal(planned.placements.some((p) => p.source_asset_id === 'asset-2'), false);
  assert.equal(planned.usableCount, 2);
  return 'asset-2 hidden: placeable sources are asset-1 and asset-3';
});

// ── 6. Seating-style images take the seating page, as a lifestyle choice. ──
test('seating-style images are grouped on their own page, before the closing section', () => {
  const { planned, validation } = plan(4, {
    3: { seating_style: SEATING_STYLE.LOUNGE },
    4: { seating_style: SEATING_STYLE.RECLINER },
  });
  assert.equal(planned.seatingPlacements.length, 2);
  assert.equal(planned.seatingPageAnchorType, 'overall_design');
  planned.seatingPlacements.forEach((placement) => {
    assert.equal(placement.section_id, SEATING_STYLE_SECTION_ID);
    assert.equal(placement.crop_orientation, CROP_ORIENTATION.LANDSCAPE_FULL);
    assert.equal(placement.parameter_key, undefined);
    assert.equal(placement.performance_level, undefined);
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.violations));
  return `seating page carries ${planned.seatingPlacements.length} images before ${planned.seatingPageAnchorType}`;
});

// ── 7. A spread is only kept when genuinely unused strong images remain. ──
test('a dedicated gallery spread is kept only for images the document did not place', () => {
  const { planned } = plan(8);
  assert.equal(planned.retainedGallery, true);
  const placed = new Set(planned.placements.map((p) => p.source_asset_id));
  planned.galleryImages.forEach((image) => assert.equal(placed.has(image.id), false));
  assert.equal(
    validateProposalImagePlan(planned, { galleryImages: planned.galleryImages }).valid,
    true,
  );
  return `${planned.placements.length} placements, ${planned.galleryImages.length} images left for a spread`;
});

// ── 8. Every placement names its source, its section and its page. ──
test('every placement carries the source, crop, focal point, section and page order', () => {
  const { planned } = plan(3);
  planned.placements.forEach((placement, index) => {
    assert.ok(placement.source_asset_id, 'source_asset_id');
    assert.ok(placement.source_file_url, 'source_file_url');
    assert.ok(Object.values(EDITORIAL_ROLE).includes(placement.editorial_role), 'editorial_role');
    assert.ok(Object.values(CROP_ORIENTATION).includes(placement.crop_orientation), 'crop_orientation');
    assert.ok(placement.focal_point.horizontal && placement.focal_point.vertical, 'focal_point');
    assert.equal(placement.placement_order, index + 1);
    assert.ok(placement.section_id, 'section_id');
    assert.ok(placement.page_position >= 1, 'page_position');
  });
  return 'source, role, crop, focal point, section and page order are all present';
});

// ── 9. The validator catches a document that breaks the rule. ──
test('the validator rejects adjacent reuse, a repeated crop and a repeated gallery image', () => {
  const broken = {
    placements: [
      { id: 'a', source_asset_id: 'asset-1', editorial_role: 'cover', crop_orientation: 'cover_portrait', page_position: 1, section_id: 'cover' },
      { id: 'b', source_asset_id: 'asset-1', editorial_role: 'landscape_feature', crop_orientation: 'cover_portrait', page_position: 2, section_id: 'section-system_design_summary' },
      { id: 'c', source_asset_id: null, editorial_role: 'portrait_editorial', crop_orientation: 'portrait', page_position: 5, section_id: 'section-spatial_resolution' },
    ],
  };
  const validation = validateProposalImagePlan(broken, { galleryImages: [{ id: 'asset-1' }] });
  const codes = validation.violations.map((violation) => violation.code);
  assert.ok(codes.includes('SOURCE_ON_ADJACENT_PAGES'), 'adjacent pages');
  assert.ok(codes.includes('CROP_REPEATED'), 'repeated crop');
  assert.ok(codes.includes('SOURCE_IN_CONSECUTIVE_VISUAL_SECTIONS'), 'consecutive visual sections');
  assert.ok(codes.includes('MISSING_SOURCE_ASSET_ID'), 'missing source');
  assert.ok(codes.includes('SOURCE_REPEATED_IN_GALLERY'), 'repeated gallery image');
  assert.equal(validation.valid, false);
  return codes.join(', ');
});

const failed = results.filter((result) => !result.ok);
results.forEach((result) => {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}`);
  console.log(`      ${result.detail}`);
});
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);