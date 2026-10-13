/**
 * proposal-jooced-image-plan.test.mjs
 * -----------------------------------
 * Jooced's own saved image settings, composed by the ONE planner — plus the
 * guidance the writer is given about the design's identity.
 *
 * What it checks, and nothing else:
 *   - the cover keeps its dedicated cover-page treatment, and the photograph chosen
 *     for the cover is not consumed by it: the same source still takes its own
 *     place in the body, so all four cinema photographs print;
 *   - the three photographs the designer marked FULL WIDTH each take one
 *     prominent placement, and none of them is composed as a smaller crop;
 *   - the seating plan (Layout drawing / Inline Detail) is placed with the account
 *     it explains, whole and uncropped, and never becomes a gallery page of its
 *     own;
 *   - no selected image is dropped, and the plan stays inside the editorial rules;
 *   - the writer is told that a stored project name identifies the document and is
 *     never the subject of a narrative sentence, that Dynamic Range opens on the
 *     experience in the room, and that Overall Design closes on a fresh judgement —
 *     with every engineering requirement and grounding rule unchanged.
 *
 * The assets, purposes, presentations and the section set are the ones the Jooced
 * proposal actually holds. No image file, page or PDF is read or written, and no
 * record is changed: the planner is a pure function of the records it is given,
 * and no GPT call is made here.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  EDITORIAL_ROLE,
  IMAGE_PRESENTATION,
  IMAGE_PURPOSE,
} from '../src/components/proposal/images/proposalImagePlacementAuthority.js';
import {
  composeSectionSlots,
  planProposalImages,
  resolveCoverAssetId,
} from '../src/components/proposal/images/proposalImagePlanner.js';
import { validateProposalImagePlan } from '../src/components/proposal/images/proposalImagePlanValidator.js';
import { SYSTEM_SUMMARY_SECTIONS } from '../src/components/proposal/proposalSections.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { buildWriterPrompt } from '../base44/shared/proposalWriter/writerPromptBuilder.js';

/** One saved project image, with the fields Jooced's cards actually carry. */
const savedImage = (id, slot, patch = {}) => ({
  id,
  slot,
  scope: 'project',
  version_id: null,
  asset_type: slot === 'cover' ? 'cover_image' : 'gallery',
  file_url: `https://files.example/jooced-${id}.png`,
  caption: '',
  proposal_importance: 'Preferred',
  usage: 'gallery',
  seating_style: null,
  comparison_enabled: false,
  ...patch,
});

const JOOCED_IMAGES = [
  savedImage('cover', 'cover', {
    image_purpose: IMAGE_PURPOSE.WHOLE_ROOM,
    image_presentation: IMAGE_PRESENTATION.FULL_WIDTH,
  }),
  savedImage('image-1', 'image_1', {
    image_purpose: IMAGE_PURPOSE.WHOLE_ROOM,
    image_presentation: IMAGE_PRESENTATION.FULL_WIDTH,
  }),
  savedImage('image-2', 'image_2', {
    image_purpose: IMAGE_PURPOSE.WHOLE_ROOM,
    image_presentation: IMAGE_PRESENTATION.FULL_WIDTH,
  }),
  savedImage('image-3', 'image_3', {
    image_purpose: IMAGE_PURPOSE.WHOLE_ROOM,
    image_presentation: IMAGE_PRESENTATION.FULL_WIDTH,
  }),
  savedImage('image-4', 'image_4', {
    image_purpose: IMAGE_PURPOSE.LAYOUT_DRAWING,
    image_presentation: IMAGE_PRESENTATION.DETAIL,
  }),
];

const FULL_WIDTH_PHOTOS = ['image-1', 'image-2', 'image-3'];
const DRAWING = 'image-4';

const SECTIONS = SYSTEM_SUMMARY_SECTIONS
  .filter((def) => def.type !== 'cover')
  .map((def, index) => ({
    id: `sec-${def.type}`,
    section_type: def.type,
    is_enabled: true,
    order_index: index + 1,
  }));

const PLAN = planProposalImages({
  assets: JOOCED_IMAGES,
  sectionSlots: composeSectionSlots({
    sections: SECTIONS,
    sectionTypes: SYSTEM_SUMMARY_SECTIONS.map((def) => def.type),
  }),
  coverAssetId: resolveCoverAssetId({
    assets: JOOCED_IMAGES,
    coverImageUrl: JOOCED_IMAGES[0].file_url,
  }),
});

const placementsOf = (assetId) => PLAN.placements.filter(
  (placement) => placement.source_asset_id === assetId,
);

const PROMINENT_ROLES = [EDITORIAL_ROLE.LANDSCAPE_FEATURE, EDITORIAL_ROLE.CLOSING_FEATURE];

test('the cover keeps its dedicated cover-page treatment', () => {
  assert.equal(PLAN.coverPlacement.source_asset_id, 'cover');
  assert.equal(PLAN.coverPlacement.editorial_role, EDITORIAL_ROLE.COVER);
  assert.equal(PLAN.coverPlacement.crop_orientation, 'cover_portrait');
});

test('each Full Width photograph takes one prominent placement and is never reduced to a smaller crop', () => {
  FULL_WIDTH_PHOTOS.forEach((id) => {
    const placed = placementsOf(id);
    assert.equal(placed.length, 1, `${id} is placed exactly once`);
    assert.ok(
      PROMINENT_ROLES.includes(placed[0].editorial_role),
      `${id} is composed as ${placed[0].editorial_role}`,
    );
    assert.equal(placed[0].image_presentation, IMAGE_PRESENTATION.FULL_WIDTH);
    assert.equal(placed[0].presentation_width_percent, 100);
  });

  const pages = FULL_WIDTH_PHOTOS.map((id) => placementsOf(id)[0].page_position);
  assert.equal(new Set(pages).size, 3, `the three photographs lead three separate pages: ${pages.join(', ')}`);
});

test('the seating plan is placed with the seating account, whole and uncropped', () => {
  const placements = placementsOf(DRAWING);
  assert.equal(placements.length, 1, 'the drawing is placed exactly once');

  const drawing = placements[0];
  assert.equal(drawing.editorial_role, EDITORIAL_ROLE.PORTRAIT_EDITORIAL);
  assert.equal(
    drawing.section_id,
    'sec-system_design_summary',
    'it sits with the section that carries the two-row seating account',
  );
  assert.equal(drawing.crop_allowed, false, 'a drawing is never cropped');
  assert.equal(drawing.crop_protected, true);
  assert.equal(drawing.image_presentation, IMAGE_PRESENTATION.DETAIL);
  assert.equal(drawing.presentation_width_percent, 58, 'smaller than the hero photography');
  // Jooced stores no caption on the drawing: the caption travels with the
  // placement as the record states it, and none is invented for it.
  assert.equal(drawing.source_caption, null);
});

test('the photograph chosen for the cover is not consumed by it, and no image is dropped', () => {
  // The cover page keeps its own treatment …
  assert.equal(PLAN.coverPlacement.source_asset_id, 'cover');
  assert.equal(PLAN.coverPlacement.editorial_role, EDITORIAL_ROLE.COVER);

  // … and the same photograph takes its own place in the body, so the four
  // cinema photographs the proposal holds are all printed: each photographs once
  // in the body, none of them omitted.
  const bodyPhotographIds = PLAN.placements
    .filter((placement) => placement.editorial_role !== EDITORIAL_ROLE.COVER)
    .map((placement) => placement.source_asset_id)
    .filter((id) => id !== DRAWING);
  const printedPhotographs = [...new Set([...bodyPhotographIds, ...PLAN.galleryImages.map((image) => image.id)])];
  assert.deepEqual(
    printedPhotographs.slice().sort(),
    ['cover', 'image-1', 'image-2', 'image-3'],
    'four distinct photographs appear within the body',
  );
  bodyPhotographIds.forEach((id) => {
    assert.equal(
      bodyPhotographIds.filter((placed) => placed === id).length,
      1,
      `${id} occupies one body placement`,
    );
  });

  // The photograph the editorial rhythm had no slot for is the one kept for the
  // image page — the cover photograph, and only it. The drawing stays with its
  // text and never becomes a page of its own.
  assert.deepEqual(PLAN.galleryImages.map((image) => image.id), ['cover']);
  assert.equal(PLAN.retainedGallery, true);
  assert.equal(PLAN.galleryImages.some((image) => image.id === DRAWING), false);
  assert.equal(PLAN.selectedImageUrls.length, JOOCED_IMAGES.length);
});

test('the plan stays inside the editorial rules', () => {
  const validation = validateProposalImagePlan(PLAN, {
    galleryImages: PLAN.galleryImages,
    comparisonImageIds: PLAN.comparisonImageIds,
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.violations));
  assert.equal(validation.checked, JOOCED_IMAGES.length);
});

/** The live generation record the writer prompt is built from: the pack only. */
const pack = JSON.parse(
  readFileSync(new URL('./fixtures/marqueeLiveGeneration.json', import.meta.url), 'utf8'),
).input.evidence_pack;

const writerInput = buildWriterInput({ pack });
const writerPrompt = buildWriterPrompt({ input: writerInput });

test('the writer is told a stored name identifies the document and never becomes the prose subject', () => {
  assert.match(writerPrompt, /never the subject of a narrative sentence/);
  assert.match(writerPrompt, /written about the cinema itself/);
});

test('Dynamic Range opens on the experience, and Overall Design is a fresh judgement', () => {
  assert.match(
    writerPrompt,
    /the experience in the room opening the section and each output figure following it/,
  );
  assert.match(writerPrompt, /never restates the Design Summary/);
});

test('the engineering the copy is written from is unchanged', () => {
  const dynamic = writerInput.section_requirements.find((row) => row.section === 'dynamic_range');
  assert.match(dynamic.requirement_single, /frozen output figures/);
  assert.equal(
    writerInput.section_requirements.every((row) => row.requires_grounding === true),
    true,
    'every section still carries the claim-grounding rule',
  );
  assert.equal(writerInput.prompt_version, 'proposal-writer-prompt-20');
});