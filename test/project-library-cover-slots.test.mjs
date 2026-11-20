// project-library-cover-slots.test.mjs
// -------------------------------------
// Guards the simplified Project Library image model: ten numbered slots
// (Image 1 to Image 10) with a "Use as cover" checkbox on each image.
//
// What it checks, and nothing else:
//   - the slot labels are sequential (Image 1..Image 10) with no "Cover Image"
//     and no "Hero Image";
//   - the cover designation lives on the existing `usage` field ('cover'),
//     retained from the legacy 'cover' slot and the legacy 'cover_image' type,
//     so no stored record is moved;
//   - checking "Use as cover" on an image that holds a numbered slot does NOT
//     move it to Image 1, reorder it, or reassign any other image;
//   - only one image is resolved as the cover at a time;
//   - existing numbered images keep their slots when the cover changes;
//   - the cover is excluded from the Project Images body gallery;
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

const asset = (patch = {}) => ({
  id: 'asset-' + Math.random().toString(36).slice(2, 8),
  file_url: 'https://example.com/x.jpg',
  caption: '',
  usage: 'gallery',
  ...patch,
});

// projectGalleryImages (ProjectImagesBlock) is imagesInSlotOrder filtered by
// !isCoverAsset — the body gallery excludes the cover. Tested inline to avoid
// importing the JSX component.
const projectGalleryImages = (images) =>
  imagesInSlotOrder(images).filter(({ asset }) => !isCoverAsset(asset));

// ── 1. Slot labels: Image 1 to Image 10, no Cover Image, no Hero Image ──
test('slot labels: Image 1 to Image 10, no Cover Image, no Hero Image', () => {
  assert.equal(ASSET_SLOT_OPTIONS.length, 10);
  ASSET_SLOT_OPTIONS.forEach((option, index) => {
    assert.equal(option.label, `Image ${index + 1}`);
  });
  assert.ok(!ASSET_SLOT_OPTIONS.some((o) => /cover/i.test(o.label)));
  assert.ok(!ASSET_SLOT_OPTIONS.some((o) => /hero/i.test(o.label)));
  assert.ok(!ASSET_SLOT_OPTIONS.some((o) => o.slot === ASSET_SLOT.COVER));
  IMAGE_SLOT_KEYS.forEach((slot) => assert.ok(isImageSlot(slot)));
  assert.ok(!isImageSlot(ASSET_SLOT.COVER));
});

// ── 2. isCoverAsset reads the cover flag from usage, legacy slot, legacy type ──
test('isCoverAsset: usage cover, legacy cover slot, and legacy cover_image type', () => {
  assert.equal(isCoverAsset(asset({ usage: 'cover' })), true);
  assert.equal(isCoverAsset(asset({ slot: 'cover', usage: 'gallery' })), true);
  assert.equal(isCoverAsset(asset({ asset_type: 'cover_image', usage: 'gallery' })), true);
  assert.equal(isCoverAsset(asset({ usage: 'gallery' })), false);
  assert.equal(isCoverAsset(asset({ usage: 'do_not_use' })), false);
  assert.equal(isCoverAsset(null), false);
});

// ── 3. Checking "Use as cover" on a numbered image does NOT move it to Image 1 ──
test('cover checkbox: a cover in image_3 stays in image_3, not moved to image_1', () => {
  const img1 = asset({ id: 'i1', slot: ASSET_SLOT.IMAGE_1, usage: 'gallery' });
  const img2 = asset({ id: 'i2', slot: ASSET_SLOT.IMAGE_2, usage: 'gallery' });
  const img3 = asset({ id: 'i3', slot: ASSET_SLOT.IMAGE_3, usage: 'gallery' });

  // Before: img3 is a gallery image in slot 3.
  let r = resolveSlotAssignments([img1, img2, img3]);
  assert.equal(r.byId['i3'], ASSET_SLOT.IMAGE_3);

  // After: the designer checks "Use as cover" on img3 — only `usage` changes.
  const img3Covered = { ...img3, usage: 'cover' };
  r = resolveSlotAssignments([img1, img2, img3Covered]);
  assert.equal(r.coverAsset?.id, 'i3');
  assert.equal(r.byId['i3'], ASSET_SLOT.IMAGE_3, 'cover stays in image_3');
  assert.equal(r.byId['i1'], ASSET_SLOT.IMAGE_1, 'image_1 unchanged');
  assert.equal(r.byId['i2'], ASSET_SLOT.IMAGE_2, 'image_2 unchanged');
  assert.equal(r.hasCover, true);
});

// ── 4. Changing the cover does not reorder, duplicate, delete or reassign ──
test('cover change: reassigning the cover leaves every other slot identical', () => {
  const img1 = asset({ id: 'i1', slot: ASSET_SLOT.IMAGE_1, usage: 'cover' });
  const img2 = asset({ id: 'i2', slot: ASSET_SLOT.IMAGE_2, usage: 'gallery' });
  const img3 = asset({ id: 'i3', slot: ASSET_SLOT.IMAGE_3, usage: 'gallery' });

  const before = resolveSlotAssignments([img1, img2, img3]);

  // Move the cover from img1 to img3 (only usage changes on both).
  const after = resolveSlotAssignments([
    { ...img1, usage: 'gallery' },
    img2,
    { ...img3, usage: 'cover' },
  ]);

  assert.equal(after.coverAsset?.id, 'i3');
  // Every image keeps exactly the slot it had.
  assert.equal(after.byId['i1'], before.byId['i1']);
  assert.equal(after.byId['i2'], before.byId['i2']);
  assert.equal(after.byId['i3'], before.byId['i3']);
  assert.equal(after.surplus.length, 0);
});

// ── 5. Only one cover is resolved at a time ──
test('only one cover: resolveSlotAssignments picks the first cover asset', () => {
  const a = asset({ id: 'a', slot: ASSET_SLOT.IMAGE_1, usage: 'cover' });
  const b = asset({ id: 'b', slot: ASSET_SLOT.IMAGE_2, usage: 'cover' });
  const r = resolveSlotAssignments([a, b]);
  assert.equal(r.coverAsset?.id, 'a');
  assert.equal(r.hasCover, true);
});

// ── 6. The cover never displaces a declared numbered image ──
test('cover does not displace: 10 numbered images plus a legacy cover keeps all 10', () => {
  const numbered = IMAGE_SLOT_KEYS.map((slot, i) => asset({ id: `n${i}`, slot }));
  const cover = asset({ id: 'cover', slot: ASSET_SLOT.COVER, usage: 'cover', asset_type: 'cover_image' });
  const r = resolveSlotAssignments([...numbered, cover]);
  IMAGE_SLOT_KEYS.forEach((slot, i) => {
    assert.equal(r.bySlot[slot]?.id, `n${i}`);
  });
  assert.equal(r.surplus.some((a) => a.id === 'cover'), true);
  assert.equal(r.coverAsset?.id, 'cover');
});

// ── 7. imagesInSlotOrder keeps a numbered cover in its slot, not first ──
test('imagesInSlotOrder: a numbered cover stays in its slot position, not reordered first', () => {
  const img1 = asset({ id: 'i1', slot: ASSET_SLOT.IMAGE_1, usage: 'gallery' });
  const cover = asset({ id: 'c3', slot: ASSET_SLOT.IMAGE_3, usage: 'cover' });
  const order = imagesInSlotOrder([img1, cover]);
  assert.equal(order[0].asset.id, 'i1', 'image_1 still leads');
  assert.equal(order[1].asset.id, 'c3', 'cover stays in slot 3 position');
  assert.equal(order[1].slot, ASSET_SLOT.IMAGE_3);
});

// ── 8. projectGalleryImages excludes the cover, keeps the rest in order ──
test('projectGalleryImages: the cover is not repeated in the body gallery', () => {
  const cover = asset({ id: 'cover', slot: ASSET_SLOT.IMAGE_1, usage: 'cover' });
  const img2 = asset({ id: 'i2', slot: ASSET_SLOT.IMAGE_2, usage: 'gallery' });
  const gallery = projectGalleryImages([cover, img2]);
  assert.equal(gallery.length, 1);
  assert.equal(gallery[0].asset.id, 'i2');
});

// ── 9. resolveCoverAsset finds the cover by usage, for any scope ──
test('resolveCoverAsset: usage cover resolves as the cover', () => {
  const cover = asset({ id: 'cover', slot: ASSET_SLOT.IMAGE_3, usage: 'cover' });
  const img1 = asset({ id: 'i1', slot: ASSET_SLOT.IMAGE_1, usage: 'gallery' });
  assert.equal(resolveCoverAsset([cover, img1], [])?.id, 'cover');
});

test('resolveCoverAsset: legacy cover slot still resolves', () => {
  const cover = asset({ id: 'cover', slot: ASSET_SLOT.COVER, usage: 'cover', asset_type: 'cover_image' });
  assert.equal(resolveCoverAsset([cover], [])?.id, 'cover');
});

test('resolveCoverAsset: no cover returns null', () => {
  const img1 = asset({ id: 'i1', slot: ASSET_SLOT.IMAGE_1, usage: 'gallery' });
  assert.equal(resolveCoverAsset([img1], []), null);
});

// ── 10. resolveCoverAssetId prefers the cover by usage, then a URL match ──
test('resolveCoverAssetId: resolves the cover asset id by usage', () => {
  const cover = asset({ id: 'cover', slot: ASSET_SLOT.IMAGE_2, usage: 'cover' });
  const img1 = asset({ id: 'i1', slot: ASSET_SLOT.IMAGE_1, usage: 'gallery' });
  assert.equal(resolveCoverAssetId({ assets: [img1, cover] }), 'cover');
});

test('resolveCoverAssetId: a matching cover image URL wins', () => {
  const cover = asset({ id: 'cover', file_url: 'https://x/cover.jpg', slot: ASSET_SLOT.IMAGE_2, usage: 'cover' });
  const other = asset({ id: 'other', file_url: 'https://x/other.jpg', usage: 'gallery' });
  assert.equal(
    resolveCoverAssetId({ assets: [cover, other], coverImageUrl: 'https://x/cover.jpg' }),
    'cover',
  );
});

// ── 11. Deleting the cover clears the cover safely (no auto-selection) ──
test('deleting the cover: no other image becomes the cover', () => {
  const img2 = asset({ id: 'i2', slot: ASSET_SLOT.IMAGE_2, usage: 'gallery' });
  const r = resolveSlotAssignments([img2]);
  assert.equal(r.coverAsset, null);
  assert.equal(r.hasCover, false);
  assert.equal(isCoverAsset(img2), false);
});