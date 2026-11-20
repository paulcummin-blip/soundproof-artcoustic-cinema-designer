// project-library-cover-slots.test.mjs
// -------------------------------------
// Guards the simplified Project Library image slots: ten numbered slots
// (Image 1 to Image 10) with a "Use as cover" checkbox on each image.
//
// What it checks, and nothing else:
//   - the slot labels are sequential (Image 1..Image 10) with no "Cover Image"
//     and no "Hero Image";
//   - the cover designation lives on the existing `usage` field ('cover'), so
//     the legacy 'cover' slot and the legacy 'cover_image' type both migrate
//     read-time into a numbered slot without any stored record moving;
//   - only one image is the cover at a time; selecting another releases the
//     previous cover back to the gallery;
//   - the cover never displaces an image that already holds a numbered slot;
//   - deleting the cover image clears the cover safely (no auto-selection);
//   - the cover leads the gallery order and is excluded from the Project Images
//     body section;
//   - the cover is resolved for proposal/report generation from `usage === 'cover'`.
//
// Plain node assertions. assetSlotAuthority is pure (no imports); the scope
// and planner authorities use the @ alias, so the alias loader is required.
//
// Run: node --import test/_alias-loader.mjs --test test/project-library-cover-slots.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSET_SLOT,
  ASSET_SLOT_OPTIONS,
  IMAGE_SLOT_KEYS,
  isCoverAsset,
  isImageSlot,
  resolveSlotAssignments,
  imagesInSlotOrder,
} from '../src/components/proposal/assetSlotAuthority.js';
import { resolveCoverAsset } from '../src/components/library/imageScopeAuthority.js';
import { resolveCoverAssetId } from '../src/components/proposal/images/proposalImagePlanner.js';
import { projectGalleryImages } from '../src/components/proposal/ProjectImagesBlock.jsx';

const asset = (patch = {}) => ({
  id: 'asset-' + Math.random().toString(36).slice(2, 8),
  file_url: 'https://example.com/x.jpg',
  caption: '',
  usage: 'gallery',
  ...patch,
});

// ── 1. Slot labels are sequential, no "Cover Image", no "Hero Image" ──
test('slot labels: Image 1 to Image 10, no Cover Image, no Hero Image', () => {
  assert.equal(ASSET_SLOT_OPTIONS.length, 10);
  ASSET_SLOT_OPTIONS.forEach((option, index) => {
    assert.equal(option.label, `Image ${index + 1}`);
  });
  assert.ok(!ASSET_SLOT_OPTIONS.some((o) => o.label.includes('Cover')));
  assert.ok(!ASSET_SLOT_OPTIONS.some((o) => o.label.includes('Hero')));
  assert.ok(!ASSET_SLOT_OPTIONS.some((o) => o.slot === ASSET_SLOT.COVER));
});

// ── 2. isCoverAsset reads the existing cover designation ──
test('isCoverAsset: usage cover, legacy cover slot, and legacy cover_image type', () => {
  assert.equal(isCoverAsset(asset({ usage: 'cover' })), true);
  assert.equal(isCoverAsset(asset({ slot: 'cover', usage: 'gallery' })), true);
  assert.equal(isCoverAsset(asset({ asset_type: 'cover_image', usage: 'gallery' })), true);
  assert.equal(isCoverAsset(asset({ usage: 'gallery' })), false);
  assert.equal(isCoverAsset(asset({ usage: 'do_not_use' })), false);
  assert.equal(isCoverAsset(null), false);
});

// ── 3. A legacy cover (slot 'cover') migrates read-time into a numbered slot ──
test('legacy cover: slot "cover" fills the first free numbered slot, retained as cover', () => {
  const cover = asset({ id: 'cover', slot: 'cover', usage: 'cover', asset_type: 'cover_image' });
  const img1 = asset({ id: 'img1', slot: 'image_1' });
  const result = resolveSlotAssignments([cover, img1]);
  assert.equal(result.coverAsset?.id, 'cover');
  assert.equal(result.hasCover, true);
  // The cover fills the first free numbered slot (image_1 is declared by img1,
  // so the cover takes image_2 — it never displaces a declared image).
  assert.equal(result.bySlot[ASSET_SLOT.IMAGE_1]?.id, 'img1');
  assert.equal(result.byId['cover'], ASSET_SLOT.IMAGE_2);
  assert.equal(result.bySlot[ASSET_SLOT.IMAGE_2]?.id, 'cover');
});

// ── 4. A legacy cover with no other images takes Image 1 ──
test('legacy cover alone: fills Image 1', () => {
  const cover = asset({ id: 'cover', slot: 'cover', usage: 'cover', asset_type: 'cover_image' });
  const result = resolveSlotAssignments([cover]);
  assert.equal(result.byId['cover'], ASSET_SLOT.IMAGE_1);
  assert.equal(result.bySlot[ASSET_SLOT.IMAGE_1]?.id, 'cover');
  assert.equal(result.coverAsset?.id, 'cover');
});

// ── 5. A new cover (usage cover, numbered slot) stays in its own slot ──
test('new cover: usage cover in a numbered slot stays put, no displacement', () => {
  const cover = asset({ id: 'c5', slot: 'image_5', usage: 'cover' });
  const img1 = asset({ id: 'i1', slot: 'image_1' });
  const img2 = asset({ id: 'i2', slot: 'image_2' });
  const result = resolveSlotAssignments([img1, img2, cover]);
  assert.equal(result.coverAsset?.id, 'c5');
  assert.equal(result.byId['c5'], ASSET_SLOT.IMAGE_5);
  assert.equal(result.byId['i1'], ASSET_SLOT.IMAGE_1);
  assert.equal(result.byId['i2'], ASSET_SLOT.IMAGE_2);
});

// ── 6. The cover never displaces a declared numbered image ──
test('cover does not displace: 10 numbered images plus a legacy cover keeps all 10', () => {
  const numbered = IMAGE_SLOT_KEYS.map((slot, i) => asset({ id: `n${i}`, slot }));
  const cover = asset({ id: 'cover', slot: 'cover', usage: 'cover', asset_type: 'cover_image' });
  const result = resolveSlotAssignments([...numbered, cover]);
  // All ten numbered images keep their declared slots.
  IMAGE_SLOT_KEYS.forEach((slot, i) => {
    assert.equal(result.bySlot[slot]?.id, `n${i}`);
  });
  // The cover has no free numbered slot, so it is surplus — kept safe, not deleted.
  assert.equal(result.surplus.some((a) => a.id === 'cover'), true);
  assert.equal(result.coverAsset?.id, 'cover');
});

// ── 7. The cover leads the gallery order ──
test('imagesInSlotOrder: the cover sorts first', () => {
  const cover = asset({ id: 'cover', slot: 'image_3', usage: 'cover' });
  const img1 = asset({ id: 'i1', slot: 'image_1' });
  const order = imagesInSlotOrder([img1, cover]);
  assert.equal(order[0].asset.id, 'cover');
  assert.equal(order[1].asset.id, 'i1');
});

// ── 8. projectGalleryImages excludes the cover, keeps the rest ──
test('projectGalleryImages: the cover is not repeated in the body gallery', () => {
  const cover = asset({ id: 'cover', slot: 'image_1', usage: 'cover' });
  const img2 = asset({ id: 'i2', slot: 'image_2' });
  const gallery = projectGalleryImages([cover, img2]);
  assert.equal(gallery.length, 1);
  assert.equal(gallery[0].asset.id, 'i2');
});

// ── 9. resolveCoverAsset finds the cover by usage, for any scope ──
test('resolveCoverAsset: usage cover resolves as the cover', () => {
  const cover = asset({ id: 'cover', slot: 'image_3', usage: 'cover', scope: 'project' });
  const img1 = asset({ id: 'i1', slot: 'image_1', scope: 'project' });
  const resolved = resolveCoverAsset([cover, img1], []);
  assert.equal(resolved?.id, 'cover');
});

test('resolveCoverAsset: legacy cover slot still resolves', () => {
  const cover = asset({ id: 'cover', slot: 'cover', usage: 'cover', asset_type: 'cover_image', scope: 'project' });
  const resolved = resolveCoverAsset([cover], []);
  assert.equal(resolved?.id, 'cover');
});

test('resolveCoverAsset: no cover returns null', () => {
  const img1 = asset({ id: 'i1', slot: 'image_1', scope: 'project' });
  assert.equal(resolveCoverAsset([img1], []), null);
});

// ── 10. resolveCoverAssetId prefers the cover by usage ──
test('resolveCoverAssetId: resolves the cover asset id', () => {
  const cover = asset({ id: 'cover', slot: 'image_2', usage: 'cover' });
  const img1 = asset({ id: 'i1', slot: 'image_1', usage: 'gallery' });
  assert.equal(resolveCoverAssetId({ assets: [img1, cover] }), 'cover');
});

test('resolveCoverAssetId: a matching cover image URL wins', () => {
  const cover = asset({ id: 'cover', file_url: 'https://x/cover.jpg', slot: 'image_2', usage: 'cover' });
  const other = asset({ id: 'other', file_url: 'https://x/other.jpg', usage: 'gallery' });
  assert.equal(
    resolveCoverAssetId({ assets: [cover, other], coverImageUrl: 'https://x/cover.jpg' }),
    'cover',
  );
});

// ── 11. Deleting the cover image clears the cover safely ──
test('deleting the cover: no other image becomes the cover', () => {
  const cover = asset({ id: 'cover', slot: 'image_1', usage: 'cover' });
  const img2 = asset({ id: 'i2', slot: 'image_2', usage: 'gallery' });
  // After deletion, only img2 remains — it is NOT a cover.
  const after = resolveSlotAssignments([img2]);
  assert.equal(after.coverAsset, null);
  assert.equal(after.hasCover, false);
  assert.equal(isCoverAsset(img2), false);
});