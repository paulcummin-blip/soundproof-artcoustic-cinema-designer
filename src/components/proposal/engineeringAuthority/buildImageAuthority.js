/**
 * buildImageAuthority.js
 * --------------------------------
 * Layer 1 — Project images sub-authority.
 * Pure function. No GPT. No side effects.
 * Returns metadata only. Never analyses image content.
 */

const PLACEMENT_SUGGESTIONS = {
  cover_image: 'Cover page',
  front_view: 'Room Images section',
  rear_view: 'Room Images section',
  plan: 'System Overview or Appendix',
  elevation: 'Room Images or Appendix',
  construction: 'Appendix (construction details)',
  client_logo: 'Cover page or footer',
  reference_photography: 'Room Images section (reference)',
  technical_drawings: 'Appendix (technical data)',
  documents: 'Appendix (supporting documents)',
  gallery: 'Room Images section (gallery)',
};

const IMPORTANCE_ORDER = { Essential: 3, Preferred: 2, Optional: 1, 'Do Not Use': 0 };

export function buildImageAuthority(proposalAssets) {
  if (!Array.isArray(proposalAssets) || proposalAssets.length === 0) {
    return { images: [], has_images: false };
  }

  const images = proposalAssets
    .filter((a) => a && a.file_url)
    .map((asset) => ({
      asset_type: asset.asset_type || 'gallery',
      file_url: asset.file_url,
      caption: asset.caption || '',
      category: asset.category || 'Other',
      proposal_importance: asset.proposal_importance || 'Preferred',
      order_index: asset.order_index || 0,
      suggested_placement: PLACEMENT_SUGGESTIONS[asset.asset_type] || 'Room Images section',
    }))
    .sort((a, b) => {
      const impDiff = (IMPORTANCE_ORDER[b.proposal_importance] || 0) - (IMPORTANCE_ORDER[a.proposal_importance] || 0);
      if (impDiff !== 0) return impDiff;
      return (a.order_index || 0) - (b.order_index || 0);
    });

  return {
    images,
    has_images: images.length > 0,
    cover_image: images.find((i) => i.asset_type === 'cover_image') || null,
    gallery_images: images.filter((i) => i.asset_type === 'gallery'),
    fixed_assets: images.filter((i) => i.asset_type !== 'gallery' && i.asset_type !== 'cover_image'),
  };
}