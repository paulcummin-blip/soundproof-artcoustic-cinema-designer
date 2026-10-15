/**
 * proposal-image-first-composition.test.mjs
 * -----------------------------------------
 * ACCEPTANCE — the proposal is composed image-first, block-aware.
 *
 * The confirmed defect: the layout flowed the text blocks down the sheet and then
 * shrank whatever photograph was left into the remaining space, so a sheet could
 * read "Dynamic Range [text] / Timbre Matching [text] / tiny centred image at the
 * bottom". The image was the thing that gave way, every time, because the fitting
 * walk reduced it until the sheet accepted it.
 *
 * What is asserted here, using the real authorities and the real allocator:
 *
 *   A  the Library role sets the area the layout reserves (FULL WIDTH 40% of the
 *      printable height, DETAIL 22%), and an image with NO role keeps the floor
 *      the compositor has always used, so nothing is re-composed by a new field
 *   B  a full-width photograph is never reduced below its reserved area: the fit
 *      REFUSES, which is what makes the copy move instead
 *   C  the copy does move: the measured partition realises an approved
 *      three-pillar composition (the blocks measured, the image reserved)
 *   D  the three pillars are classified as ONE composition group, whichever of
 *      the approved compositions the measurement produced
 *   E  a DETAIL photograph keeps a readable reserved area rather than becoming a
 *      thumbnail
 *   F  an image that fits needs no reduction at all: nothing changed for it
 *
 * BOUNDARY. The compositor's own arithmetic is exercised: `measuredPartition` is
 * the real allocator and is driven with modelled block heights (the browser's own
 * layout engine is what is modelled, as the other composition suites do). The
 * printable height used is the compositor's own sheet budget, 261.0 mm. No rule is
 * weakened to make the suite run, and no live proposal record is written.
 *
 * Run: npm run test:proposal-composition
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import {
  imageRoleFloorMm,
  imageRoleOf,
  mediaFloorMm,
  isFullWidthMedia,
  LEGACY_MIN_MEDIA_HEIGHT_MM,
} from '@/components/proposal/export/composition/proposalImageRoleAuthority';
import { reserveMediaUnit, isMediaUnit } from '@/components/proposal/export/composition/proposalMediaFitting';
import { measuredPartition } from '@/components/proposal/export/composition/proposalMeasuredPartition';
import { classifyPillarComposition, PILLAR_COMPOSITION } from '@/components/proposal/export/composition/pillarCompositionAuthority';

/** The compositor's own printable sheet height. */
const BUDGET_MM = 261;
const PX_PER_MM = 96 / 25.4;

/** A placed photograph, with the Library role its own card recorded. */
function fakeUnit({ role = null, naturalMm = 118, section = null, keepNext = false } = {}) {
  const image = {
    dataset: {},
    style: { setProperty() {} },
    getBoundingClientRect: () => ({ height: naturalMm * PX_PER_MM, width: 170 * PX_PER_MM }),
  };
  const node = {
    nodeType: 1,
    matches: () => false,
    querySelector: (selector) => (selector === 'img' ? image : null),
    closest: () => null,
    dataset: role ? { presentation: role } : {},
  };
  /** The unit is a figure, so the photograph lives inside its source. */
  const mediaSource = {
    matches: (selector) => selector === 'figure,.pp-media,img,svg,video',
    querySelector: (selector) => (selector === 'img' ? image : null),
  };
  return {
    source: mediaSource,
    node,
    image,
    section,
    keepNext,
    naturalMm,
    /** The height the composition actually gave this photograph. */
    heightMm: () => (image.dataset.imageReservedMm ? Number(image.dataset.imageReservedMm) : naturalMm),
  };
}

/** A block of copy on the sheet, measured by its block height. */
function textUnit(heightMm, section = null, keepNext = false) {
  return {
    source: { matches: () => false },
    node: {},
    section,
    keepNext,
    heightMm: () => heightMm,
  };
}

/** The modelled layout engine: blocks stack, the sheet has BUDGET_MM of room. */
const measureUnits = (units) => {
  const used = units.reduce((sum, unit) => sum + unit.heightMm(), 0);
  return { fits: used <= BUDGET_MM, used, budget: BUDGET_MM, usedMm: used, availableMm: BUDGET_MM };
};

describe('the Library role is layout authority', () => {
  const near = (actual, expected) => Math.abs(actual - expected) < 0.05;

  test('A — the role reserves the page area before any text is flowed', () => {
    assert.ok(near(imageRoleFloorMm({ role: 'full_width', budgetMm: 250 }), 100), 'full width reserves 40%');
    assert.ok(near(imageRoleFloorMm({ role: 'detail', budgetMm: 250 }), 55), 'detail reserves 22%');
    assert.ok(near(imageRoleFloorMm({ role: 'cropped_detail', budgetMm: 250 }), 55), 'cropped detail reserves 22%');
    // An image with nothing recorded keeps the smallest floor it has ever had.
    assert.equal(imageRoleFloorMm({ role: null, budgetMm: 250 }), LEGACY_MIN_MEDIA_HEIGHT_MM);
    const placedNode = (presentation) => ({
      nodeType: 1,
      matches: () => false,
      querySelector: () => null,
      closest: () => null,
      dataset: presentation ? { presentation } : {},
    });
    assert.ok(near(mediaFloorMm(placedNode('full_width'), 261), 104.4));
    assert.equal(isFullWidthMedia(placedNode('full_width')), true);
    assert.equal(isFullWidthMedia(placedNode('detail')), false);
    // An unknown value is NOT a role: the image keeps the legacy floor.
    assert.equal(imageRoleOf(placedNode('something_else')), null);
    assert.equal(imageRoleOf(placedNode(null)), null);
  });

  test('B — a FULL WIDTH photograph is never reduced below its reserved area; the copy moves', () => {
    const image = fakeUnit({ role: 'full_width', naturalMm: 118 });
    const copy = textUnit(200);
    assert.equal(isMediaUnit(image), true);
    const fitted = reserveMediaUnit(image, [copy], measureUnits);
    // The fit refuses rather than shrinking the hero image onto the copy's sheet.
    assert.equal(fitted, false);
    // It stopped at the reserved area (40% of 261 = 104.4 mm), never below it.
    assert.ok(image.heightMm() >= 104.4 - 0.01, `reserved ${image.heightMm()}mm`);
    // And the role that decided it is recorded on the image itself.
    assert.equal(image.image.dataset.imageRole, 'full_width');
  });

  test('C — an image that already fits is not touched at all', () => {
    const image = fakeUnit({ role: 'full_width', naturalMm: 118 });
    assert.equal(reserveMediaUnit(image, [textUnit(120)], measureUnits), true);
    assert.equal(image.heightMm(), 118);
    assert.equal(image.image.dataset.imageReservedMm, undefined);
  });

  test('E — a DETAIL photograph keeps a readable reserved area', () => {
    const image = fakeUnit({ role: 'detail', naturalMm: 90 });
    assert.equal(reserveMediaUnit(image, [textUnit(210)], measureUnits), false);
    // The reserved area is 22% of the printable height (57.4 mm here, the trace
    // rounds to 0.1 mm), never the 40 mm a photograph used to be cut back to.
    assert.ok(image.heightMm() >= imageRoleFloorMm({ role: 'detail', budgetMm: BUDGET_MM }) - 0.1, `reserved ${image.heightMm()}mm`);
    assert.ok(image.heightMm() > LEGACY_MIN_MEDIA_HEIGHT_MM);
  });

  test('F — an image with no role keeps the behaviour it had before the field existed', () => {
    const image = fakeUnit({ role: null, naturalMm: 118 });
    assert.equal(reserveMediaUnit(image, [textUnit(200)], measureUnits), true);
    assert.ok(image.heightMm() < 118);
    assert.ok(image.heightMm() >= LEGACY_MIN_MEDIA_HEIGHT_MM);
  });
});

describe('the measured partition moves the copy, not the image', () => {
  const partition = (units) => {
    const probe = { parts: [], replaceChildren() { this.parts = []; } };
    return measuredPartition(units, probe, {
      append: (target, unit) => target.parts.push(unit),
      measure: (target) => measureUnits(target.parts),
    });
  };

  const pillars = () => [
    textUnit(60, 'spatial_resolution'),
    textUnit(60, 'dynamic_range'),
    textUnit(60, 'timbre_matching'),
    fakeUnit({ role: 'full_width', naturalMm: 104.4 }),
  ];

  test('C — the blocks are measured and an approved composition is realised', () => {
    const units = pillars();
    const ranges = partition(units);
    assert.equal(ranges.length, 2);
    // Every unit is placed once, in order, and no sheet is over its own budget.
    const placed = ranges.flatMap(([start, end]) => units.slice(start, end));
    assert.equal(placed.length, units.length);
    const pages = ranges.map(([start, end], index) => {
      const sheet = units.slice(start, end);
      return {
        page: index + 1,
        sections: sheet.map((unit) => unit.section).filter(Boolean),
        roles: sheet.filter((unit) => isMediaUnit(unit)).map((unit) => (unit.node.dataset.presentation || 'unstated')),
        usedMm: sheet.reduce((sum, unit) => sum + unit.heightMm(), 0),
        availableMm: BUDGET_MM,
      };
    });
    pages.forEach((page) => assert.ok(page.usedMm <= page.availableMm));
    // The photograph is composed at its reserved area, on a sheet with room for it.
    const imageSheet = pages.find((page) => page.roles.includes('full_width'));
    assert.ok(imageSheet, 'the photograph is composed');
    assert.ok(imageSheet.usedMm >= imageRoleFloorMm({ role: 'full_width', budgetMm: BUDGET_MM }));
    const classified = classifyPillarComposition(pages);
    // Two blocks, then the third with the image at its reserved size.
    assert.equal(classified.composition, PILLAR_COMPOSITION.TWO_THEN_ONE_WITH_IMAGE);
    assert.equal(classified.sheets.length, 2);
  });

  test('D — the three pillars are read as ONE composition group', () => {
    const all = classifyPillarComposition([
      { page: 1, sections: ['spatial_resolution', 'dynamic_range', 'timbre_matching'], roles: [] },
      { page: 2, sections: [], roles: ['full_width'] },
    ]);
    assert.equal(all.composition, PILLAR_COMPOSITION.ALL_THREE);
    const split = classifyPillarComposition([
      { page: 1, sections: ['spatial_resolution', 'dynamic_range'], roles: [] },
      { page: 2, sections: ['timbre_matching'], roles: ['full_width'] },
    ]);
    assert.equal(split.composition, PILLAR_COMPOSITION.TWO_THEN_ONE_WITH_IMAGE);
    const paired = classifyPillarComposition([
      { page: 1, sections: ['spatial_resolution'], roles: ['full_width'] },
      { page: 2, sections: ['dynamic_range', 'timbre_matching'], roles: ['cropped_detail'] },
    ]);
    assert.equal(paired.composition, PILLAR_COMPOSITION.ONE_WITH_IMAGE_THEN_TWO);
    // A document with no pillar group is not labelled as one.
    assert.equal(classifyPillarComposition([{ page: 1, sections: ['executive_summary'], roles: [] }]).composition, null);
    // A sheet that carries only images never opens the group.
    assert.equal(classifyPillarComposition([{ page: 1, sections: [], roles: ['full_width'] }]).sheets.length, 0);
  });
});