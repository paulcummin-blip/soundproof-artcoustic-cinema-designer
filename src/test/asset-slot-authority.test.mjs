// asset-slot-authority.test.mjs
// ---------------------------------------------------------------------------
// The simple gallery rule, stated once:
//
//   Cover image + Image 1–10. Captions explain what they are.
//
// These tests hold the two things that make the simplification safe:
//   1. the eleven labels, in order, with no legacy vocabulary exposed
//   2. images uploaded under the older labelled model placed into slots —
//      and nothing ever dropped, however many images a project already has
//
// The Marquee Home fixtures below mirror a project that was uploaded under the
// old model: a cover plus labelled views, plus gallery images.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import {
  ASSET_SLOT,
  ASSET_SLOT_OPTIONS,
  IMAGE_SLOT_KEYS,
  LEGACY_ASSET_TYPE_SLOTS,
  isValidSlot,
  resolveAssetSlot,
  resolveSlotAssignments,
  slotAssetType,
  slotLabel,
  slotNumber,
} from '../components/proposal/assetSlotAuthority.js';
import { buildImageAuthority } from '../components/proposal/engineeringAuthority/buildImageAuthority.js';

const asset = (id, asset_type, order_index = 0) => ({ id, asset_type, order_index, file_url: `https://files/${id}.jpg` });

describe('the gallery labels are the simple model', () => {
  it('offers Cover Image, then Image 1 as the hero image, then Image 2 to Image 10', () => {
    expect(ASSET_SLOT_OPTIONS.map((option) => option.label)).toEqual([
      'Cover Image',
      'Image 1 (Hero Image)',
      'Image 2',
      'Image 3',
      'Image 4',
      'Image 5',
      'Image 6',
      'Image 7',
      'Image 8',
      'Image 9',
      'Image 10',
    ]);
    expect(ASSET_SLOT_OPTIONS).toHaveLength(11);
    expect(IMAGE_SLOT_KEYS).toHaveLength(10);
    // No legacy label is offered to the designer.
    ASSET_SLOT_OPTIONS.forEach((option) => {
      expect(option.label).not.toMatch(/front|rear|plan|elevation|construction|logo|reference|technical|document/i);
    });
  });

  it('labels and numbers a slot, and reads it back as its legacy type', () => {
    expect(slotLabel(ASSET_SLOT.COVER)).toBe('Cover Image');
    expect(slotLabel(ASSET_SLOT.IMAGE_4)).toBe('Image 4');
    expect(slotNumber(ASSET_SLOT.COVER)).toBe(0);
    expect(slotNumber(ASSET_SLOT.IMAGE_10)).toBe(10);
    expect(slotNumber(null)).toBe(null);
    expect(slotAssetType(ASSET_SLOT.COVER)).toBe('cover_image');
    expect(slotAssetType(ASSET_SLOT.IMAGE_7)).toBe('gallery');
    expect(isValidSlot(ASSET_SLOT.IMAGE_10)).toBe(true);
    expect(isValidSlot('front_view')).toBe(false);
  });
});

describe('images from the older labelled model are placed, never lost', () => {
  it('maps every legacy type the page used to offer', () => {
    expect(LEGACY_ASSET_TYPE_SLOTS).toEqual({
      cover_image: ASSET_SLOT.COVER,
      front_view: ASSET_SLOT.IMAGE_1,
      rear_view: ASSET_SLOT.IMAGE_2,
      plan: ASSET_SLOT.IMAGE_3,
      elevation: ASSET_SLOT.IMAGE_4,
      construction: ASSET_SLOT.IMAGE_5,
      client_logo: ASSET_SLOT.IMAGE_6,
      reference_photography: ASSET_SLOT.IMAGE_7,
      technical_drawings: ASSET_SLOT.IMAGE_8,
      documents: ASSET_SLOT.IMAGE_9,
    });
    expect(resolveAssetSlot(asset('cover', 'cover_image'))).toBe(ASSET_SLOT.COVER);
    expect(resolveAssetSlot(asset('front', 'front_view'))).toBe(ASSET_SLOT.IMAGE_1);
    expect(resolveAssetSlot(asset('docs', 'documents'))).toBe(ASSET_SLOT.IMAGE_9);
    // An image already on the simple model keeps its declared slot.
    expect(resolveAssetSlot({ id: 'x', slot: ASSET_SLOT.IMAGE_6, asset_type: 'front_view' })).toBe(ASSET_SLOT.IMAGE_6);
  });

  it('places a legacy Marquee Home set exactly as the old page showed it', () => {
    const marquee = [
      asset('cover', 'cover_image'),
      asset('front', 'front_view'),
      asset('rear', 'rear_view'),
      asset('gallery-1', 'gallery', 0),
      asset('gallery-2', 'gallery', 1),
    ];
    const { byId, bySlot, surplus } = resolveSlotAssignments(marquee);

    expect(byId.cover).toBe(ASSET_SLOT.COVER);
    expect(byId.front).toBe(ASSET_SLOT.IMAGE_1);
    expect(byId.rear).toBe(ASSET_SLOT.IMAGE_2);
    // Gallery images fill the next free image slots, in their stored order.
    expect(byId['gallery-1']).toBe(ASSET_SLOT.IMAGE_3);
    expect(byId['gallery-2']).toBe(ASSET_SLOT.IMAGE_4);
    expect(bySlot[ASSET_SLOT.IMAGE_3].id).toBe('gallery-1');
    expect(surplus).toEqual([]);
    expect(Object.keys(byId)).toHaveLength(5);
  });

  it('keeps surplus images stored rather than dropping them', () => {
    const many = [
      asset('cover', 'cover_image'),
      ...Array.from({ length: 14 }, (_, index) => asset(`g${index}`, 'gallery', index)),
    ];
    const { byId, surplus } = resolveSlotAssignments(many);

    // Cover plus ten image slots are filled; the rest are reported, not lost.
    expect(Object.keys(byId)).toHaveLength(11);
    expect(surplus).toHaveLength(14 - 10);
    expect(surplus.map((item) => item.id)).toEqual(['g10', 'g11', 'g12', 'g13']);
    // Every input image is accounted for exactly once.
    const placed = new Set([...Object.keys(byId), ...surplus.map((item) => item.id)]);
    expect(placed.size).toBe(many.length);
  });

  it('lets an image with a declared slot outrank a legacy duplicate', () => {
    const { byId } = resolveSlotAssignments([
      { id: 'declared', slot: ASSET_SLOT.IMAGE_1, asset_type: 'gallery', file_url: 'u' },
      asset('legacy-front', 'front_view'),
    ]);

    expect(byId.declared).toBe(ASSET_SLOT.IMAGE_1);
    // The legacy image is preserved in the next free slot instead of being lost.
    expect(byId['legacy-front']).toBe(ASSET_SLOT.IMAGE_2);
  });
});

describe('reports and the proposal engine read the same gallery', () => {
  it('resolves the cover and the images in slot order', () => {
    const marquee = [
      asset('rear', 'rear_view'),
      asset('cover', 'cover_image'),
      asset('front', 'front_view'),
    ];
    const authority = buildImageAuthority(marquee);

    expect(authority.has_images).toBe(true);
    expect(authority.cover_image.file_url).toBe('https://files/cover.jpg');
    expect(authority.cover_image.slot).toBe(ASSET_SLOT.COVER);
    expect(authority.gallery_images.map((image) => image.slot)).toEqual([
      ASSET_SLOT.IMAGE_1,
      ASSET_SLOT.IMAGE_2,
    ]);
    // Gallery order, not upload order: cover first, then Image 1, Image 2.
    expect(authority.images.map((image) => image.slot)).toEqual([
      ASSET_SLOT.COVER,
      ASSET_SLOT.IMAGE_1,
      ASSET_SLOT.IMAGE_2,
    ]);
    // Nothing is left over, and every image keeps a caption field for context.
    expect(authority.fixed_assets).toEqual([]);
    authority.images.forEach((image) => expect(image).toHaveProperty('caption'));
  });

  it('keeps the legacy asset_type so existing readers do not break', () => {
    const authority = buildImageAuthority([asset('cover', 'cover_image'), asset('front', 'front_view')]);
    const cover = authority.images.find((image) => image.slot === ASSET_SLOT.COVER);
    const first = authority.images.find((image) => image.slot === ASSET_SLOT.IMAGE_1);
    expect(cover.asset_type).toBe('cover_image');
    expect(first.asset_type).toBe('front_view');
    expect(cover.suggested_placement).toBe('Cover page');
    expect(first.suggested_placement).toBe('Room Images section');
  });

  it('returns an empty authority for a project with no images', () => {
    expect(buildImageAuthority([])).toEqual({ images: [], has_images: false });
    expect(buildImageAuthority(null)).toEqual({ images: [], has_images: false });
  });
});