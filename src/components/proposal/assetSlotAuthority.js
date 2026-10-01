/**
 * assetSlotAuthority.js
 * ---------------------------------------------------------------------------
 * The one authority for the simple project gallery: a Cover Image plus
 * Image 1 to Image 10. Captions explain what each image is, so the system never
 * has to know whether an image is a front view, a plan or a construction shot.
 *
 * It also places images uploaded under the older labelled model into the new
 * slots, read-time and losslessly:
 *
 *   cover_image          → cover
 *   front_view           → image_1
 *   rear_view            → image_2
 *   plan                 → image_3
 *   elevation            → image_4
 *   construction         → image_5
 *   client_logo          → image_6
 *   reference_photography→ image_7
 *   technical_drawings   → image_8
 *   documents            → image_9
 *   gallery              → the next free image slot, in order
 *
 * An image that already carries a slot keeps it. Anything that cannot be placed
 * in the ten image slots is returned as `surplus` — still stored, never deleted,
 * and shown as such rather than silently disappearing.
 *
 * Pure functions. No fetching, no writing, no side effects.
 */

export const ASSET_SLOT = Object.freeze({
  COVER: "cover",
  IMAGE_1: "image_1",
  IMAGE_2: "image_2",
  IMAGE_3: "image_3",
  IMAGE_4: "image_4",
  IMAGE_5: "image_5",
  IMAGE_6: "image_6",
  IMAGE_7: "image_7",
  IMAGE_8: "image_8",
  IMAGE_9: "image_9",
  IMAGE_10: "image_10",
});

/** The ten project image slots, in gallery order. */
export const IMAGE_SLOT_KEYS = Object.freeze([
  ASSET_SLOT.IMAGE_1,
  ASSET_SLOT.IMAGE_2,
  ASSET_SLOT.IMAGE_3,
  ASSET_SLOT.IMAGE_4,
  ASSET_SLOT.IMAGE_5,
  ASSET_SLOT.IMAGE_6,
  ASSET_SLOT.IMAGE_7,
  ASSET_SLOT.IMAGE_8,
  ASSET_SLOT.IMAGE_9,
  ASSET_SLOT.IMAGE_10,
]);

/** Every slot the page offers, cover first. */
export const ASSET_SLOT_OPTIONS = Object.freeze([
  { slot: ASSET_SLOT.COVER, label: "Cover Image" },
  ...IMAGE_SLOT_KEYS.map((slot, index) => ({ slot, label: `Image ${index + 1}` })),
]);

/** Where an image from the older labelled model belongs in the simple gallery. */
export const LEGACY_ASSET_TYPE_SLOTS = Object.freeze({
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

const ALL_SLOT_KEYS = new Set([ASSET_SLOT.COVER, ...IMAGE_SLOT_KEYS]);

export function isImageSlot(slot) {
  return IMAGE_SLOT_KEYS.includes(slot);
}

export function isValidSlot(slot) {
  return ALL_SLOT_KEYS.has(slot);
}

/** 1–10 for an image slot, 0 for the cover, null when there is no slot. */
export function slotNumber(slot) {
  if (slot === ASSET_SLOT.COVER) return 0;
  const index = IMAGE_SLOT_KEYS.indexOf(slot);
  return index === -1 ? null : index + 1;
}

/** "Cover Image" / "Image 4" / null. */
export function slotLabel(slot) {
  return ASSET_SLOT_OPTIONS.find((option) => option.slot === slot)?.label || null;
}

/**
 * The legacy asset_type a slot records, so older readers keep working:
 * the cover slot records 'cover_image', every image slot records 'gallery'.
 */
export function slotAssetType(slot) {
  return slot === ASSET_SLOT.COVER ? "cover_image" : "gallery";
}

/**
 * The slot an image declares, or the slot its legacy type maps to.
 * Null when the image has no place in the gallery yet.
 */
export function resolveAssetSlot(asset) {
  if (!asset) return null;
  const declared = asset.slot || asset.slot_key || null;
  if (isValidSlot(declared)) return declared;
  const legacy = LEGACY_ASSET_TYPE_SLOTS[asset.asset_type || asset.type || ""];
  return legacy || null;
}

const orderOf = (asset, index) => {
  // order_index 0 is a real position (the first stored image), so it is only the
  // array index that stands in when the field carries no number at all.
  const value = Number(asset?.order_index);
  return Number.isFinite(value) ? value : index;
};

/**
 * Place the project's images into the gallery slots.
 *
 * @param {Array} assets - the project's images (any mix of new and legacy rows)
 * @returns {{byId: Object, bySlot: Object, surplus: Array, hasCover: boolean, imageSlotsUsed: string[]}}
 *   byId    - image id → slot
 *   bySlot  - slot → image
 *   surplus - images with no free slot left; they stay stored and are never deleted
 */
export function resolveSlotAssignments(assets = []) {
  const list = (Array.isArray(assets) ? assets : []).filter((asset) => asset && asset.id != null);
  const byId = {};
  const bySlot = {};
  const surplus = [];

  const claim = (asset, slot) => {
    if (!slot || bySlot[slot]) return false;
    bySlot[slot] = asset;
    byId[asset.id] = slot;
    return true;
  };

  // 1. An image's own declared slot wins, first one first.
  list.forEach((asset) => {
    const declared = asset.slot || asset.slot_key || null;
    if (isValidSlot(declared)) claim(asset, declared);
  });

  // 2. Images from the older labelled model take the slot their type maps to.
  list.forEach((asset) => {
    if (byId[asset.id]) return;
    claim(asset, LEGACY_ASSET_TYPE_SLOTS[asset.asset_type || asset.type || ""] || null);
  });

  // 3. Anything left (gallery images, unknown types, duplicate slots) fills the
  //    next free image slot in its stored order — preserved, never dropped.
  list
    .map((asset, index) => ({ asset, order: orderOf(asset, index) }))
    .filter(({ asset }) => !byId[asset.id])
    .sort((a, b) => a.order - b.order)
    .forEach(({ asset }) => {
      const free = IMAGE_SLOT_KEYS.find((slot) => !bySlot[slot]);
      if (!free) {
        surplus.push(asset);
        return;
      }
      claim(asset, free);
    });

  return {
    byId,
    bySlot,
    surplus,
    hasCover: Boolean(bySlot[ASSET_SLOT.COVER]),
    imageSlotsUsed: IMAGE_SLOT_KEYS.filter((slot) => Boolean(bySlot[slot])),
  };
}

/** The gallery's images in slot order (cover first), for reports and proposals. */
export function imagesInSlotOrder(assets = []) {
  const { byId } = resolveSlotAssignments(assets);
  return (Array.isArray(assets) ? assets : [])
    .filter((asset) => asset && byId[asset.id])
    .map((asset) => ({ asset, slot: byId[asset.id] }))
    .sort((a, b) => slotNumber(a.slot) - slotNumber(b.slot));
}