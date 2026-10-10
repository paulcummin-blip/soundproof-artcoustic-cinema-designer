/**
 * proposalImagePlanner.js
 * -----------------------
 * The deterministic layout planner behind the Proposal's editorial image
 * placement.
 *
 * The rule it enforces, in one place:
 *   - the cover takes the strongest source, framed as a portrait cover crop;
 *   - the design overview takes a full-width landscape from another source;
 *   - the first structure section takes a portrait accent from a third source;
 *   - the last structure section is the visual break, where the COVER source
 *     returns in the landscape crop;
 *   - a seating-style page carries the large lifestyle alternatives;
 *   - the closing page takes a full-width landscape from the source least
 *     recently used.
 *
 * A source may appear twice at most, in two different crops, at least one full
 * page apart. Where no source satisfies the spacing rule for a page, that page
 * simply carries no image: the planner never fills a page to make a gallery.
 *
 * Nothing here is written by an LLM. No coordinates, no page fit and no framing
 * decision is delegated to a model, and no evidence, copy or stored image is
 * touched. Pure functions — no imports beyond the placement vocabulary, so it can
 * be run from a plain node script.
 */

import {
  CROP_ORIENTATION,
  EDITORIAL_ROLE,
  PROPOSAL_COVER_SLOT,
  SEATING_STYLE_SECTION_ID,
  isUsableInProposal,
  makePlacement,
  seatingStyleOf,
} from './proposalImagePlacementAuthority.js';

/** At least one full page sits between two uses of the same source. */
export const MIN_PAGE_GAP = 2;

/** A source may carry the document twice: the cover and its return. */
export const MAX_USES_PER_SOURCE = 2;

/** A dedicated gallery spread is kept only when this many strong images are unused. */
export const RETAINED_GALLERY_MIN_IMAGES = 4;

/** Seating-style images share a page this many at a time. */
export const SEATING_IMAGES_PER_PAGE = 2;

/** The section that states the design and takes the first landscape. */
const DESIGN_OVERVIEW_TYPES = Object.freeze([
  'system_design_summary',
  'executive_summary',
  'design_philosophy',
]);

/** The three design structures: the first takes a portrait accent, the last the break. */
const STRUCTURE_TYPES = Object.freeze([
  'spatial_resolution',
  'dynamic_range',
  'timbre_matching',
]);

/** The section that closes the document. */
const CLOSING_TYPES = Object.freeze(['overall_design', 'conclusion']);

/**
 * The ordered section slots a document composes, read from the section records
 * it will print. One record per type (the first wins), in the canonical order the
 * pack composes, excluding the cover — so the planner and the pack can never
 * disagree about which page a placement belongs to.
 *
 * @param {{sections: Array, sectionTypes: Array<string>}} args
 * @returns {Array<{section_type: string, section_id: string}>}
 */
export function composeSectionSlots({ sections = [], sectionTypes = [] } = {}) {
  const byType = new Map();
  (Array.isArray(sections) ? sections : [])
    .filter((section) => section && section.is_enabled !== false && section.section_type)
    .forEach((section) => {
      if (!byType.has(section.section_type)) byType.set(section.section_type, section);
    });

  return (Array.isArray(sectionTypes) ? sectionTypes : [])
    .filter((type) => type && type !== 'cover')
    .map((type) => {
      const section = byType.get(type);
      return section ? { section_type: type, section_id: section.id } : null;
    })
    .filter(Boolean);
}

/**
 * The cover image's source asset, from the cover URL the document resolved.
 * Falls back to the image in the cover slot, then to the first image, so a
 * document whose cover URL could not be matched still plans a cover.
 */
export function resolveCoverAssetId({ assets = [], coverImageUrl = null } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  if (coverImageUrl) {
    const matched = list.find((asset) => asset?.file_url && asset.file_url === coverImageUrl);
    if (matched?.id) return matched.id;
  }
  const slotCover = list.find((asset) => asset?.slot === PROPOSAL_COVER_SLOT);
  if (slotCover?.id) return slotCover.id;
  return list.find((asset) => asset?.id)?.id || null;
}

/**
 * Plan the document's image placements.
 *
 * @param {Object} args
 * @param {Array}  args.assets        the project images, in gallery order
 * @param {Array}  args.sectionSlots  the composed page order (composeSectionSlots)
 * @param {string} args.coverAssetId  the chosen cover image's source asset id
 */
export function planProposalImages({ assets = [], sectionSlots = [], coverAssetId = null } = {}) {
  const usable = (Array.isArray(assets) ? assets : []).filter(isUsableInProposal);
  const usableCount = usable.length;

  const coverAsset = usable.find((asset) => asset.id && asset.id === coverAssetId)
    || usable.find((asset) => asset.slot === PROPOSAL_COVER_SLOT)
    || usable[0]
    || null;

  // A seating-style image is a lifestyle alternative: it belongs to the seating
  // page and is never scattered through the narrative as a design feature.
  const seatingSources = usable.filter((asset) => asset !== coverAsset && seatingStyleOf(asset));
  const narrativeSources = usable.filter((asset) => !seatingStyleOf(asset));

  // ── Page order. The cover is page 1; each composed section takes the next
  // page; the seating-style page sits immediately before the closing section,
  // or at the end of the narrative when there is no closing section. ──
  let page = 1;
  const entries = (Array.isArray(sectionSlots) ? sectionSlots : []).map((slot) => {
    page += 1;
    return { ...slot, page };
  });
  const closingIndex = entries.findIndex((entry) => CLOSING_TYPES.includes(entry.section_type));
  const seatingPageAnchorType = closingIndex >= 0 ? entries[closingIndex].section_type : null;
  let seatingPage = null;
  if (seatingSources.length > 0) {
    if (closingIndex >= 0) {
      seatingPage = entries[closingIndex].page;
      entries.slice(closingIndex).forEach((entry) => { entry.page += 1; });
    } else {
      seatingPage = entries.length > 0 ? entries[entries.length - 1].page + 1 : 2;
    }
  }

  // ── Source use, so the spacing rule is measured, not hoped for. ──
  const history = new Map();
  const usesOf = (asset) => (history.get(asset?.id) || []).length;
  const lastUsed = (asset) => {
    const list = history.get(asset?.id);
    return list && list.length ? list[list.length - 1].pagePosition : -Infinity;
  };
  const cropUsed = (asset, crop) => (history.get(asset?.id) || []).some((use) => use.crop === crop);
  const eligible = (asset, pagePosition, crop) => usesOf(asset) < MAX_USES_PER_SOURCE
    && !cropUsed(asset, crop)
    && (pagePosition - lastUsed(asset)) >= MIN_PAGE_GAP;

  const placements = [];
  const add = (asset, role, sectionId, pagePosition) => {
    if (!asset || !asset.id) return null;
    const placement = makePlacement({
      source: asset,
      role,
      sectionId,
      pagePosition,
      order: placements.length + 1,
    });
    const list = history.get(asset.id) || [];
    list.push({ pagePosition, crop: placement.crop_orientation });
    history.set(asset.id, list);
    placements.push(placement);
    return placement;
  };

  /**
   * The source for a full-width landscape.
   *
   * The visual break asks for the cover source's return (`preferCoverReturn`):
   * that deliberate return is what the rhythm is built on. Every other landscape
   * prefers a source the document has not used yet, and falls back to the cover
   * source, then to whichever source can return at all — least recently used, so
   * a return is never bunched up behind another.
   */
  const pickLandscape = (pagePosition, { preferCoverReturn = false } = {}) => {
    const candidates = narrativeSources.filter(
      (asset) => asset.id && eligible(asset, pagePosition, CROP_ORIENTATION.LANDSCAPE_FULL),
    );
    const coverReturn = candidates.find((asset) => asset.id === coverAsset?.id);
    if (preferCoverReturn && coverReturn) return coverReturn;
    const fresh = candidates.filter((asset) => usesOf(asset) === 0 && asset.id !== coverAsset?.id);
    if (fresh.length > 0) return fresh[0];
    if (coverReturn) return coverReturn;
    return candidates.slice().sort((a, b) => lastUsed(a) - lastUsed(b))[0] || null;
  };

  /**
   * The source for a portrait accent. It is a source of its own: returning the
   * cover source here would repeat the cover treatment rather than add an accent
   * to it, so no portrait is placed when no such source exists.
   */
  const pickPortrait = (pagePosition) => narrativeSources.find(
    (asset) => asset.id
      && asset.id !== coverAsset?.id
      && usesOf(asset) === 0
      && eligible(asset, pagePosition, CROP_ORIENTATION.PORTRAIT),
  ) || null;

  // 1. The cover.
  add(coverAsset, EDITORIAL_ROLE.COVER, 'cover', 1);

  // 2. The design overview: the dominant full-width landscape.
  const overviewEntry = entries.find((entry) => DESIGN_OVERVIEW_TYPES.includes(entry.section_type));
  if (overviewEntry) {
    add(pickLandscape(overviewEntry.page), EDITORIAL_ROLE.LANDSCAPE_FEATURE, overviewEntry.section_id, overviewEntry.page);
  }

  // 3. The first structure section: a portrait accent among the copy.
  const structures = entries.filter((entry) => STRUCTURE_TYPES.includes(entry.section_type));
  const portraitEntry = structures[0] || null;
  if (portraitEntry && portraitEntry !== overviewEntry) {
    add(pickPortrait(portraitEntry.page), EDITORIAL_ROLE.PORTRAIT_EDITORIAL, portraitEntry.section_id, portraitEntry.page);
  }

  // 4. The visual break: the cover source returns as a full-width landscape.
  const featureEntry = structures.length > 1 ? structures[structures.length - 1] : null;
  if (featureEntry) {
    add(
      pickLandscape(featureEntry.page, { preferCoverReturn: true }),
      EDITORIAL_ROLE.LANDSCAPE_FEATURE,
      featureEntry.section_id,
      featureEntry.page,
    );
  }

  // 5. The seating-style page: the large lifestyle alternatives.
  if (seatingPage) {
    seatingSources.forEach((source) => {
      add(source, EDITORIAL_ROLE.SEATING_OPTION, SEATING_STYLE_SECTION_ID, seatingPage);
    });
  }

  // 6. The closing page: a full-width landscape from the source least recently used.
  const closingEntry = closingIndex >= 0 ? entries[closingIndex] : null;
  if (closingEntry) {
    add(pickLandscape(closingEntry.page), EDITORIAL_ROLE.CLOSING_FEATURE, closingEntry.section_id, closingEntry.page);
  }

  // ── What is left. Only genuinely unused, strong images may fill a dedicated
  // gallery spread: a spread can never repeat a source the document already
  // placed, and with two or three images no spread is kept at all. ──
  const placedIds = new Set(placements.map((placement) => placement.source_asset_id).filter(Boolean));
  const galleryImages = usable.filter(
    (asset) => asset.id && !placedIds.has(asset.id) && asset !== coverAsset && !seatingStyleOf(asset),
  );

  const bySection = {};
  placements.forEach((placement) => {
    const key = placement.section_id || 'unplaced';
    if (!bySection[key]) bySection[key] = [];
    bySection[key].push(placement);
  });

  return {
    placements,
    bySection,
    coverPlacement: placements.find((placement) => placement.editorial_role === EDITORIAL_ROLE.COVER) || null,
    seatingPlacements: placements.filter((placement) => placement.editorial_role === EDITORIAL_ROLE.SEATING_OPTION),
    seatingPageAnchorType,
    seatingPage,
    galleryImages,
    retainedGallery: galleryImages.length >= RETAINED_GALLERY_MIN_IMAGES,
    usableCount,
    sourceUseCount: Object.fromEntries(
      [...history.entries()].map(([assetId, uses]) => [assetId, uses.length]),
    ),
  };
}

export default planProposalImages;