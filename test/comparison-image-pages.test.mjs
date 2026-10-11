/**
 * comparison-image-pages.test.mjs
 * -------------------------------
 * The rule under test: an image the DESIGNER marks as part of a comparison is one
 * option in a deliberate comparison — the group's options are read together on a
 * page of their own, full width, in the designer's display order, each stating
 * what it stands for, under the message the designer wrote. A comparison image is
 * never scattered through the narrative, never reused as an unrelated gallery
 * image, and never presented as a performance difference. Where no message exists
 * anywhere, the page carries neutral text instead of an invented one.
 *
 * The second half checks the wiring that puts those controls and pages on screen:
 * the Library image card, the proposal-creation prompt, the editor preview and the
 * printed pack. Those are read from source, because they are one-line renderings
 * of the authorities proven above.
 *
 * Run: node test/comparison-image-pages.test.mjs
 * (Plain node assertions, no test runner: the modules under test import nothing
 * but each other.)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COMPARISON_MESSAGE_QUESTION,
  COMPARISON_SECTION_ID,
  CROP_ORIENTATION,
  DEFAULT_COMPARISON_GROUP,
  EDITORIAL_ROLE,
  NEUTRAL_COMPARISON_MESSAGE,
  SEATING_STYLE,
  SEATING_STYLE_SECTION_ID,
  comparisonGroupNameOf,
  comparisonGroupsOf,
  comparisonOptionLabelOf,
  isComparisonImage,
  orderedComparisonImages,
} from '../src/components/proposal/images/proposalImagePlacementAuthority.js';
import {
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

const plan = (count, overrides = {}, plannerOptions = {}) => {
  const assets = images(count, overrides);
  const coverAssetId = resolveCoverAssetId({ assets, coverImageUrl: 'https://example.test/image-1.jpg' });
  const planned = planProposalImages({ assets, sectionSlots, coverAssetId, ...plannerOptions });
  return {
    planned,
    validation: validateProposalImagePlan(planned, {
      galleryImages: planned.galleryImages,
      comparisonImageIds: planned.comparisonImageIds,
    }),
  };
};

/** The message the client's own brief carries, used verbatim in these tests. */
const DESIGNER_MESSAGE = 'These two seating styles should both be considered. The relaxed sofa layout gives a more informal lounge feel, while the cinema recliners create a more traditional cinema environment. The system performance remains the same in either option, so this is a personal preference for the client.';

/** Two images marked as the two options of one comparison, in a stated order. */
const twoOptions = (extra = {}) => ({
  5: {
    comparison_enabled: true,
    comparison_group: 'Seating Style Options',
    comparison_option_label: 'Relaxed sofa seating',
    comparison_order: 2,
    ...(extra[5] || {}),
  },
  6: {
    comparison_enabled: true,
    comparison_group: 'Seating Style Options',
    comparison_option_label: 'Cinema recliner seating',
    comparison_order: 1,
    ...(extra[6] || {}),
  },
});

const rolesOf = (planned) => planned.placements.map((p) => `${p.editorial_role}:${p.source_asset_id}`);

const source = (relativePath) => readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

const results = [];
const test = (name, fn) => {
  try {
    results.push({ name, ok: true, detail: fn() });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
};

/* ── 1. The comparison mark: data the designer sets, never inferred ─────────── */

test('the comparison mark is the designer\u2019s statement, and a group or label stands as one', () => {
  assert.equal(isComparisonImage({ comparison_enabled: true }), true, 'marked');
  assert.equal(
    isComparisonImage({ comparison_enabled: false, comparison_group: 'Seating Style Options' }),
    false,
    'an explicit off wins, even with a group written',
  );
  assert.equal(isComparisonImage({ comparison_group: 'Seating Style Options' }), true, 'a group reads as marked');
  assert.equal(isComparisonImage({ comparison_option_label: 'Relaxed sofa seating' }), true, 'a label reads as marked');
  assert.equal(isComparisonImage({ caption: 'Relaxed sofa seating' }), false, 'a caption is never a comparison');
  assert.equal(isComparisonImage({}), false, 'nothing recorded is not a comparison');
  assert.equal(
    comparisonGroupNameOf({ comparison_enabled: true }),
    DEFAULT_COMPARISON_GROUP,
    'a blank group falls to the default name',
  );
  assert.equal(
    comparisonOptionLabelOf({ comparison_enabled: true, comparison_option_label: '  Relaxed sofa seating  ' }),
    'Relaxed sofa seating',
    'the label is read trimmed',
  );
  assert.equal(comparisonOptionLabelOf({ comparison_enabled: true }), null, 'no label stated is null');
  return 'marked / unmarked / blank-group / label-only all read as stated';
});

/* ── 2. The group's options read in the designer's own display order ───────── */

test('a comparison group\u2019s options read in the designer\u2019s display order', () => {
  const marked = {
    id: 'ordered',
    comparison_enabled: true,
    comparison_group: 'Seating Style Options',
  };
  const ordered = orderedComparisonImages([
    { ...marked, id: 'second', comparison_order: null },
    { ...marked, id: 'first', comparison_order: 3 },
    { ...marked, id: 'third', comparison_order: 7 },
  ]);
  assert.deepEqual(ordered.map((image) => image.id), ['first', 'third', 'second'],
    'a stated order leads, an unstated one follows in gallery order');

  const { planned } = plan(6, twoOptions());
  const page = planned.comparisonPages[0];
  assert.deepEqual(
    page.placements.map((placement) => placement.comparison_option_label),
    ['Cinema recliner seating', 'Relaxed sofa seating'],
    'display order 1 reads before display order 2, whichever slot each image sits in',
  );
  return page.placements.map((placement) => placement.comparison_option_label).join(' → ');
});

/* ── 3. The designer's own message, used exactly as written ─────────────────── */

test('the designer\u2019s own message is used as written', () => {
  const { planned } = plan(6, twoOptions({ 5: { comparison_note: DESIGNER_MESSAGE } }));
  const page = planned.comparisonPages[0];
  assert.equal(page.message, DESIGNER_MESSAGE);
  assert.equal(page.message_source, 'image_note', 'the note written on the image is the message');
  assert.equal(page.title, 'Seating Style Options', 'the group names the page');

  // A message supplied for the proposal is used when the group states none — and
  // a note that does exist is never overridden by it.
  const noNote = images(6, twoOptions());
  assert.equal(comparisonGroupsOf(noNote)[0].message_source, 'neutral');
  const withProposal = comparisonGroupsOf(noNote, { proposalMessage: 'Compare the two seating styles.' })[0];
  assert.equal(withProposal.message, 'Compare the two seating styles.');
  assert.equal(withProposal.message_source, 'proposal');
  const withNote = comparisonGroupsOf(
    images(6, twoOptions({ 5: { comparison_note: DESIGNER_MESSAGE } })),
    { proposalMessage: 'Compare the two seating styles.' },
  )[0];
  assert.equal(withNote.message, DESIGNER_MESSAGE, 'the designer\u2019s own note is never replaced');
  assert.equal(withNote.message_source, 'image_note');
  return 'image note wins; proposal message is the fallback';
});

/* ── 4. No message anywhere: neutral text, never an invented one ───────────── */

test('with no message anywhere the page states the neutral text', () => {
  const { planned } = plan(6, twoOptions());
  const page = planned.comparisonPages[0];
  assert.equal(page.message, NEUTRAL_COMPARISON_MESSAGE);
  assert.equal(page.message_source, 'neutral');
  assert.match(NEUTRAL_COMPARISON_MESSAGE, /two visual options for the same design/);
  return page.message;
});

/* ── 5. Two options, full width, on one page of their own ──────────────────── */

test('both options are placed full width on one page of their own', () => {
  const { planned, validation } = plan(6, twoOptions({ 5: { comparison_note: DESIGNER_MESSAGE } }));
  assert.equal(planned.comparisonPages.length, 1, 'one group, one page');
  const [page] = planned.comparisonPages;
  assert.equal(page.placements.length, 2, 'both options are on the page');
  page.placements.forEach((placement) => {
    assert.equal(placement.editorial_role, EDITORIAL_ROLE.COMPARISON_OPTION);
    assert.equal(placement.crop_orientation, CROP_ORIENTATION.LANDSCAPE_FULL, 'each option is full width');
    assert.equal(placement.section_id, COMPARISON_SECTION_ID);
    assert.ok(placement.comparison_option_label, 'each option states what it stands for');
  });
  assert.equal(
    new Set(page.placements.map((placement) => placement.page_position)).size,
    1,
    'both options are read on the same page',
  );
  assert.equal(planned.comparisonPlacements.length, 2);
  assert.equal(validation.valid, true, JSON.stringify(validation.violations));
  return `${page.placements.length} options, all ${CROP_ORIENTATION.LANDSCAPE_FULL}, page ${page.page}`;
});

/* ── 6. Comparison images: never in the narrative, never in the gallery ────── */

test('a comparison image is never scattered through the narrative nor reused as a gallery image', () => {
  // Asset 5 is marked as a seating style AND as a comparison option: the
  // comparison wins, so it is compared with its alternative rather than used as
  // a decorative lifestyle shot.
  const { planned, validation } = plan(6, twoOptions({
    5: { seating_style: SEATING_STYLE.LOUNGE },
  }));
  const compared = ['asset-5', 'asset-6'];
  assert.deepEqual(planned.comparisonImageIds.slice().sort(), compared, 'the marked images are reported');
  planned.placements
    .filter((placement) => compared.includes(placement.source_asset_id))
    .forEach((placement) => {
      assert.equal(placement.editorial_role, EDITORIAL_ROLE.COMPARISON_OPTION, 'placed only as a comparison option');
    });
  const usedInNarrative = planned.placements
    .filter((placement) => compared.includes(placement.source_asset_id)
      && placement.editorial_role !== EDITORIAL_ROLE.COMPARISON_OPTION);
  assert.deepEqual(usedInNarrative, [], 'no narrative use');
  const usedAsSeating = planned.seatingPlacements
    .filter((placement) => compared.includes(placement.source_asset_id));
  assert.deepEqual(usedAsSeating, [], 'a comparison option is never a seating-page lifestyle image');
  assert.deepEqual(
    planned.galleryImages.filter((image) => compared.includes(image.id)),
    [],
    'a comparison image is never a gallery image',
  );
  assert.equal(validation.valid, true, JSON.stringify(validation.violations));
  return 'marked images appear once, on their group\u2019s page only';
});

test('a comparison image that landed anywhere else is reported', () => {
  const broken = {
    placements: [
      {
        id: 'a',
        source_asset_id: 'asset-5',
        editorial_role: EDITORIAL_ROLE.LANDSCAPE_FEATURE,
        crop_orientation: CROP_ORIENTATION.LANDSCAPE_FULL,
        page_position: 3,
        section_id: 'section-spatial_resolution',
      },
    ],
    galleryImages: [],
  };
  const validation = validateProposalImagePlan(broken, {
    galleryImages: [{ id: 'asset-6' }],
    comparisonImageIds: ['asset-5', 'asset-6'],
  });
  const codes = validation.violations.map((violation) => violation.code);
  assert.ok(codes.includes('COMPARISON_IMAGE_OUTSIDE_ITS_PAGE'), 'a narrative use is reported');
  assert.ok(codes.includes('COMPARISON_IMAGE_REUSED_IN_GALLERY'), 'a gallery reuse is reported');
  assert.equal(validation.valid, false);
  return codes.join(', ');
});

/* ── 7. Non-comparison images: the existing planner, unchanged ─────────────── */

test('normal, non-comparison placement is unchanged', () => {
  const { planned, validation } = plan(3);
  assert.deepEqual(rolesOf(planned), [
    'cover:asset-1',
    'landscape_feature:asset-2',
    'portrait_editorial:asset-3',
    'landscape_feature:asset-1',
    'closing_feature:asset-3',
  ]);
  assert.deepEqual(planned.comparisonPages, [], 'no comparison page is invented');
  assert.deepEqual(planned.comparisonPlacements, []);
  assert.deepEqual(planned.comparisonImageIds, []);
  assert.equal(validation.valid, true, JSON.stringify(validation.violations));
  assert.deepEqual(
    planned.placements.filter((placement) => placement.section_id === SEATING_STYLE_SECTION_ID),
    [],
    'no seating page without seating images',
  );
  return rolesOf(planned).join(' → ');
});

/* ── 8. The wiring that puts the controls and the page on screen ───────────── */

test('the Library image card exposes the comparison controls', () => {
  const controls = source('src/components/library/ImageComparisonControls.jsx');
  assert.match(controls, /Comparison image/, 'the comparison toggle');
  assert.match(controls, /Comparison group/, 'the group field');
  assert.match(controls, /Option label/, 'the option-label field');
  assert.match(controls, /Comparison message/, 'the message field');
  assert.match(controls, /Display order/, 'the display-order field');
  assert.match(controls, /comparison_enabled/, 'the toggle writes the mark');
  assert.match(controls, /comparison_group/, 'the group is written');
  assert.match(controls, /comparison_option_label/, 'the option label is written');
  assert.match(controls, /comparison_note/, 'the message is written');
  assert.match(controls, /comparison_order/, 'the display order is written');

  const card = source('src/components/library/ImageProposalControls.jsx');
  assert.match(card, /ImageComparisonControls/, 'the card renders the comparison controls');
  assert.match(card, /onComparisonChange/, 'the card hands the change back');

  const panel = source('src/components/proposal/ProposalAssetsPanel.jsx');
  assert.match(panel, /handleComparisonChange/, 'the panel saves the change');
  assert.match(panel, /comparisonGroupOptions/, 'the panel offers the project\u2019s existing groups');
  return 'toggle, group, option label, message and display order are on the card';
});

test('proposal creation asks what is being compared when the images state no message', () => {
  assert.equal(COMPARISON_MESSAGE_QUESTION, 'What are we comparing, and what is the message?');
  const prompt = source('src/components/proposal/wizard/ComparisonMessagePrompt.jsx');
  assert.match(prompt, /COMPARISON_MESSAGE_QUESTION/, 'the question is the stated one');
  assert.match(prompt, /message_source !== 'image_note'/, 'a group that already states a message is not asked again');
  assert.match(prompt, /comparison_note/, 'the message is saved onto the group\u2019s images');
  assert.match(prompt, /comparison page/, 'it says the message is printed on the comparison page');

  const step = source('src/components/proposal/wizard/ClientBriefStep.jsx');
  assert.match(step, /<ComparisonMessagePrompt/, 'the prompt is part of proposal creation');
  return COMPARISON_MESSAGE_QUESTION;
});

test('the editor preview shows the same comparison page the PDF prints', () => {
  const editor = source('src/pages/ProposalEditor.jsx');
  assert.match(editor, /ComparisonPagesPreview/, 'the preview is composed');
  assert.match(editor, /comparisonPreviewGroups/, 'from the one plan the document was composed with');
  const preview = source('src/components/proposal/editor/ComparisonPagesPreview.jsx');
  assert.match(preview, /ComparisonOptionsPage/, 'the preview renders the comparison page itself');
  assert.match(preview, /message=\{group\.message\}/, 'with the designer\u2019s message');
  assert.match(preview, /placements=\{group\.placements\}/, 'and the options the plan placed');
  return 'preview renders the planned comparison page';
});

test('the printed pack gives each comparison group a page of its own', () => {
  const pack = source('src/components/proposal/print/ProposalPackDocument.jsx');
  assert.match(pack, /<ComparisonOptionsPage/, 'the pack renders the comparison page');
  assert.match(pack, /comparisonPages/, 'from the plan\u2019s comparison pages');
  assert.match(pack, /message=\{group\.message\}/, 'with the message as written');
  const page = source('src/components/proposal/print/ComparisonOptionsPage.jsx');
  assert.match(page, /comparison_option_label/, 'the option label leads under the image');
  assert.match(page, /pp-comparison--/, 'both options are composed at one visual scale');
  return 'comparison page is a first-class page of the pack';
});

const failed = results.filter((result) => !result.ok);
results.forEach((result) => {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}`);
  console.log(`      ${result.detail}`);
});
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);