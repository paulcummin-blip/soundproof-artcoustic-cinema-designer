// seating-purpose-consolidation.test.mjs
// ---------------------------------------------------------------------------
// Validates that the Seating Option control was consolidated into Image
// Purpose: seating-specific proposal logic now fires ONLY when the image's
// current purpose is "seating_option", while the saved seating_style is
// preserved and still displayed when the purpose is seating_option.
//
// Read-only against the pure modules. No React, no SDK, no records written.
// ---------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_PURPOSE,
  imagePurposeOf,
  seatingStyleOf,
  isSeatingOptionImage,
} from '../src/components/proposal/images/proposalImagePlacementAuthority.js';
import { buildOptionGuidance } from '../base44/shared/proposalWriter/writerOptionGuidance.js';

function asset(overrides = {}) {
  return {
    id: 'a1',
    file_url: 'x.jpg',
    usage: 'gallery',
    image_purpose: null,
    seating_style: null,
    ...overrides,
  };
}

// ── isSeatingOptionImage: the gating authority ──────────────────────────────

test('isSeatingOptionImage is true only when purpose is seating_option', () => {
  assert.equal(isSeatingOptionImage(asset({ image_purpose: 'seating_option' })), true);
  assert.equal(isSeatingOptionImage(asset({ image_purpose: 'whole_room' })), false);
  assert.equal(isSeatingOptionImage(asset({ image_purpose: 'other' })), false);
  assert.equal(isSeatingOptionImage(asset({ image_purpose: null })), false);
  assert.equal(isSeatingOptionImage(asset({ image_purpose: '' })), false);
});

test('seating_style alone does not make an image a seating-option image', () => {
  // Seating_style preserved but purpose is whole_room: no seating logic.
  assert.equal(isSeatingOptionImage(asset({ seating_style: 'lounge', image_purpose: 'whole_room' })), false);
  assert.equal(isSeatingOptionImage(asset({ seating_style: 'recliner', image_purpose: null })), false);
});

test('seating_style is still read for display when purpose is seating_option', () => {
  // The saved seating_style is preserved and readable for the Seating type dropdown.
  assert.equal(seatingStyleOf(asset({ seating_style: 'lounge', image_purpose: 'seating_option' })), 'lounge');
  assert.equal(seatingStyleOf(asset({ seating_style: 'recliner', image_purpose: 'seating_option' })), 'recliner');
  assert.equal(seatingStyleOf(asset({ seating_style: null, image_purpose: 'seating_option' })), null);
});

// ── Option guidance: seating-specific logic gated on purpose ────────────────

test('option guidance includes a seating-option image with a seating_style', () => {
  const images = [
    asset({ id: 's1', image_purpose: 'seating_option', seating_style: 'lounge', caption: 'Lounge' }),
    asset({ id: 's2', image_purpose: 'seating_option', seating_style: 'recliner', caption: 'Recliners' }),
  ];
  const guidance = buildOptionGuidance(images);
  assert.ok(guidance, 'guidance should be produced for two seating-option images');
  assert.equal(guidance.groups.length, 1);
  assert.equal(guidance.groups[0].group, 'Seating style');
  assert.deepEqual(guidance.groups[0].options, ['Lounge', 'Recliners']);
});

test('option guidance ignores seating_style when purpose is not seating_option', () => {
  // seating_style preserved on the record, but purpose is whole_room: the image
  // must not be pulled into seating option guidance.
  const images = [
    asset({ id: 's1', image_purpose: 'whole_room', seating_style: 'lounge', caption: 'Lounge' }),
    asset({ id: 's2', image_purpose: 'whole_room', seating_style: 'recliner', caption: 'Recliners' }),
  ];
  const guidance = buildOptionGuidance(images);
  assert.equal(guidance, null, 'no seating guidance when purpose is not seating_option');
});

test('switching purpose away from seating_option removes the image from seating guidance', () => {
  const before = [
    asset({ id: 's1', image_purpose: 'seating_option', seating_style: 'lounge', caption: 'Lounge' }),
    asset({ id: 's2', image_purpose: 'seating_option', seating_style: 'recliner', caption: 'Recliners' }),
  ];
  assert.ok(buildOptionGuidance(before), 'seating guidance before the switch');
  // The designer switches the purpose away; seating_style is NOT cleared.
  const after = before.map((a) => ({ ...a, image_purpose: 'whole_room' }));
  assert.equal(buildOptionGuidance(after), null, 'no seating guidance after the switch');
  // The seating_style is still on the records (preserved metadata).
  assert.equal(after[0].seating_style, 'lounge');
  assert.equal(after[1].seating_style, 'recliner');
});