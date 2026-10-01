/**
 * buildImageAuthority.js
 * --------------------------------
 * Layer 1 — Project images sub-authority.
 * Pure function. No GPT. No side effects.
 * Returns metadata only. Never analyses image content.
 *
 * Images are read through the simple gallery model: one Cover Image plus
 * Image 1 to Image 10. An image's slot — not its former asset_type — decides
 * where it belongs, and images from the older labelled model are placed by the
 * same mapping the Project Images page uses.
 */

import {
  ASSET_SLOT,
  isImageSlot,
  resolveAssetSlot,
  resolveSlotAssignments,
  slotAssetType,
  slotNumber,
} from '../assetSlotAuthority';

const PLACEMENT_SUGGESTIONS = {
  cover: 'Cover page',
  image: 'Room Images section',
};

const LEGACY_PLACEMENT_SUGGESTIONS = {
  plan: 'System Overview or Appendix',
  elevation: 'Room Images or Appendix',
  construction: 'Appendix (construction details)',
  client_logo: 'Cover page or footer',
  reference_photography: 'Room Images section (reference)',
  technical_drawings: 'Appendix (technical data)',
  documents: 'Appendix (supporting documents)',
};

const IMPORTANCE_ORDER = { Essential: 3, Preferred: 2, Optional: 1, 'Do Not Use': 0 };

const suggestionFor = (slot, assetType) => {
  if (slot === ASSET_SLOT.COVER) return PLACEMENT_SUGGESTIONS.cover;
  if (isImageSlot(slot)) return PLACEMENT_SUGGESTIONS.image;
  return LEGACY_PLACEMENT_SUGGESTIONS[assetType] || PLACEMENT_SUGGESTIONS.image;
};

export function buildImageAuthority(proposalAssets) {
  if (!Array.isArray(proposalAssets) || proposalAssets.length === 0) {
    return { images: [], has_images: false };
  }

  const available = proposalAssets.filter((a) => a && a.file_url);
  const { byId } = resolveSlotAssignments(available);

  const images = available
    .map((asset) => {
      const slot = byId[asset.id] || resolveAssetSlot(asset) || null;
      const legacyType = asset.asset_type || 'gallery';
      return {
        slot,
        // The legacy type is kept so existing readers keep working; for new
        // uploads it is simply 'cover_image' or 'gallery'.
        asset_type: legacyType || slotAssetType(slot),
        file_url: asset.file_url,
        caption: asset.caption || '',
        category: asset.category || 'Other',
        proposal_importance: asset.proposal_importance || 'Preferred',
        order_index: asset.order_index || 0,
        suggested_placement: suggestionFor(slot, legacyType),
      };
    })
    .sort((a, b) => {
      // The gallery order comes first: cover, then Image 1 to Image 10. Anything
      // with no slot follows, ordered by the older importance rule.
      const aSlot = slotNumber(a.slot);
      const bSlot = slotNumber(b.slot);
      if (aSlot != null && bSlot != null) return aSlot - bSlot;
      if (aSlot != null) return -1;
      if (bSlot != null) return 1;
      const impDiff = (IMPORTANCE_ORDER[b.proposal_importance] || 0) - (IMPORTANCE_ORDER[a.proposal_importance] || 0);
      if (impDiff !== 0) return impDiff;
      return (a.order_index || 0) - (b.order_index || 0);
    });

  return {
    images,
    has_images: images.length > 0,
    cover_image: images.find((i) => i.slot === ASSET_SLOT.COVER) || null,
    gallery_images: images.filter((i) => isImageSlot(i.slot)),
    fixed_assets: images.filter((i) => i.slot == null),
  };
}