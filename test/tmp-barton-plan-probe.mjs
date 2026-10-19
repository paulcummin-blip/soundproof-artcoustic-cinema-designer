// TEMPORARY probe (deleted after use): prints the image plan the planner builds
// for the Barton-shaped selection and for a range of source counts.
import { planProposalImages, composeSectionSlots, resolveCoverAssetId } from '../src/components/proposal/images/proposalImagePlanner.js';
import { validateProposalImagePlan } from '../src/components/proposal/images/proposalImagePlanValidator.js';

const SECTION_TYPES = [
  'cover', 'system_design_summary', 'spatial_resolution', 'dynamic_range',
  'timbre_matching', 'key_performance_highlights', 'overall_design', 'room_images',
];
const sections = SECTION_TYPES.filter((t) => t !== 'cover')
  .map((t, i) => ({ id: `sec-${t}`, section_type: t, is_enabled: true, order_index: i + 1 }));
const sectionSlots = composeSectionSlots({ sections, sectionTypes: SECTION_TYPES });

const show = (label, assets) => {
  const coverAssetId = resolveCoverAssetId({ assets, coverImageUrl: assets[0]?.file_url });
  const plan = planProposalImages({ assets, sectionSlots, coverAssetId });
  const validation = validateProposalImagePlan(plan, { galleryImages: plan.galleryImages, comparisonImageIds: plan.comparisonImageIds });
  console.log(`\n── ${label} (usable ${plan.usableCount}) ─────────────────────`);
  plan.placements.forEach((p) => {
    console.log(`  ${String(p.editorial_role).padEnd(18)} ${String(p.source_asset_id).padEnd(10)} section=${String(p.section_id).padEnd(34)} page=${p.page_position} pres=${p.image_presentation || 'unstated'} purpose=${p.image_purpose || 'unstated'}`);
  });
  const placed = new Set(plan.placements.filter((p) => p.editorial_role !== 'cover').map((p) => p.source_asset_id));
  console.log(`  integrated=${plan.flowImages.length} gallery=${plan.galleryImages.length} retainedGallery=${plan.retainedGallery} bodyPlaced=${placed.size} valid=${validation.valid} ${validation.valid ? '' : JSON.stringify(validation.violations)}`);
  return plan;
};

const images = (count) => Array.from({ length: count }, (_, i) => ({
  id: `asset-${i + 1}`,
  file_url: `https://example.test/image-${i + 1}.jpg`,
  slot: i === 0 ? 'cover' : `image_${i}`,
}));

[7, 9, 10, 12].forEach((count) => show(`${count} sources, nothing recorded`, images(count)));

show('BARTON selection', [
  { id: 'b-cover', file_url: 'https://example.test/cover.jpg', slot: 'cover', image_presentation: 'full_width', image_purpose: 'whole_room', caption: '' },
  { id: 'b-1', file_url: 'https://example.test/i1.jpg', slot: 'image_1', image_presentation: 'full_width', image_purpose: 'whole_room' },
  { id: 'b-2', file_url: 'https://example.test/i2.jpg', slot: 'image_2', image_presentation: 'full_width', image_purpose: 'whole_room' },
  { id: 'b-3', file_url: 'https://example.test/i3.jpg', slot: 'image_3', image_presentation: 'full_width', image_purpose: 'whole_room' },
  { id: 'b-4', file_url: 'https://example.test/i4.jpg', slot: 'image_4', image_presentation: 'full_width', image_purpose: 'whole_room' },
  { id: 'b-q63', file_url: 'https://example.test/q63.jpg', slot: 'image_5', image_presentation: 'detail', image_purpose: 'product_detail', caption: 'Spitfire Q6-3' },
]);