/**
 * proposalImagePlanner.js
 * -----------------------
 * The deterministic layout planner behind the Proposal's editorial image
 * placement.
 *
 * The rule it enforces, in one place:
 *   - the cover takes the strongest source, framed as a portrait cover crop;
 *   - the design overview takes a full-width landscape from another source;
 *   - EACH of the three core sound structures takes its own full-width landscape,
 *     composed below its copy on its own page, so no structure is left without
 *     the image that supports it and none is composed under the section before
 *     it;
 *   - an image the designer recorded a purpose for takes ONLY the section that
 *     purpose names: a detail image is never dropped into a structure because
 *     there is room for it, and where the document composes none of the sections
 *     its purpose names it joins the narrative flow, where its purpose is read
 *     again;
 *   - the last structure may be the visual break, and a cover source may
 *     return there because its cover placement never consumes its body inclusion;
 *   - a seating-style page carries the large lifestyle alternatives;
 *   - each comparison group the designer marked carries one page of its own,
 *     both options full width with the designer's own message;
 *   - the closing page takes a full-width landscape from the source least
 *     recently used.
 *
 * EVERY OTHER SELECTED PHOTOGRAPH JOINS THE NARRATIVE. There is no gallery
 * appendix by default: the photographs the opening rhythm above had no slot for
 * are integrated between the sections they support (proposalImageFlow), a pair to
 * a page, so the document reads as one brochure rather than a narrative with a
 * gallery bolted onto the end of it. A dedicated gallery spread carries only what
 * the flow genuinely cannot hold — the remainder once every narrative page is
 * full — and nothing a gallery holds is ever a repeat of a placed source.
 *
 * A source may appear twice at most, in two different crops, at least one full
 * page apart. Where no source satisfies the spacing rule for a page, that page
 * simply carries no image: the planner never fills a page to make a gallery.
 *
 * A photograph chosen for the cover is independent from body placement: the cover
 * page takes the cover crop, while the same source remains eligible for one body
 * placement whenever its Image Library card says Use in proposal. Its body role uses
 * the original source and the Library presentation (or the established unstated
 * presentation), never the cover crop.
 *
 * A source the designer marked FULL WIDTH is never composed as a smaller crop:
 * the prominent presentation that was chosen always leads, and a supporting
 * placement is taken from another source or not at all.
 *
 * Nothing here is written by an LLM. No coordinates, no page fit and no framing
 * decision is delegated to a model, and no evidence, copy or stored image is
 * touched. Pure functions — no imports beyond the placement vocabulary, so it can
 * be run from a plain node script.
 */

import { planImageFlow } from './proposalImageFlow.js';
import {
  COMPARISON_SECTION_ID,
  CROP_ORIENTATION,
  EDITORIAL_ROLE,
  PROPOSAL_COVER_SLOT,
  SEATING_STYLE_SECTION_ID,
  IMAGE_PRESENTATION,
  comparisonGroupsOf,
  comparisonOptionLabelOf,
  comparisonPageTitle,
  imagePresentationOf,
  imagePurposeOf,
  isComparisonImage,
  isProtectedDrawing,
  isUsableInProposal,
  makePlacement,
  purposeSectionTypes,
  seatingStyleOf,
} from './proposalImagePlacementAuthority.js';

/** At least one full page sits between two uses of the same source. */
export const MIN_PAGE_GAP = 2;

/** A source may carry the document twice: the cover and its return. */
export const MAX_USES_PER_SOURCE = 2;

/** Every selected source must print, even when only one unused photograph remains. */
export const RETAINED_GALLERY_MIN_IMAGES = 1;

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
  const usable = (Array.isArray(assets) ? assets : []).filter(isUsableInProposal)
    .map((asset, index) => asset.id ? asset : { ...asset, id: `selected-image-${index}` });
  const usableCount = usable.length;

  const coverAsset = usable.find((asset) => asset.id && asset.id === coverAssetId)
    || usable.find((asset) => asset.slot === PROPOSAL_COVER_SLOT)
    || usable[0]
    || null;

  // A comparison image is a deliberate visual comparison the designer marked:
  // it belongs to its group's own page and is never scattered through the
  // narrative, nor reused as an unrelated gallery image. It takes precedence
  // over the seating grouping — an image marked as a comparison option is
  // compared with its alternative, never used as a decorative lifestyle shot.
  const comparisonGroupList = comparisonGroupsOf(
    usable.filter((asset) => asset.id && asset !== coverAsset && isComparisonImage(asset)),
  );
  const comparisonIds = new Set(comparisonGroupList.flatMap((group) => group.images.map((image) => image.id)));
  const isCompared = (asset) => Boolean(asset?.id) && comparisonIds.has(asset.id);

  /**
   * Whether the designer composed this source as a SUPPORTING image. Only a
   * deliberate supporting choice is ever given the smaller portrait accent: a
   * photograph with nothing recorded is never converted into a portrait, and a
   * photograph the designer marked Full Width is never reduced to one.
   */
  const isSupportingPresentation = (asset) => {
    const presentation = imagePresentationOf(asset);
    return presentation === IMAGE_PRESENTATION.DETAIL
      || presentation === IMAGE_PRESENTATION.CROPPED_DETAIL;
  };

  // A seating-style image is a lifestyle alternative: it belongs to the seating
  // page and is never scattered through the narrative as a design feature.
  const seatingSources = usable.filter((asset) => asset !== coverAsset && !isCompared(asset) && seatingStyleOf(asset));
  // "Use in proposal" is the body-inclusion authority for every source, including
  // the source also selected for the cover. The cover placement is additional: it
  // neither consumes nor excludes the source from the narrative. Presentation says
  // HOW the body use is composed, not WHETHER the body use exists; an image with no
  // presentation recorded keeps the established narrative treatment.
  const narrativeSources = usable.filter((asset) => !isCompared(asset) && !seatingStyleOf(asset));

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
  const seatingCount = seatingSources.length > 0 ? 1 : 0;
  // Each comparison group takes a page of its own, immediately after the
  // seating-style page: the alternatives are read together, on their own page,
  // before the document closes.
  const comparisonPageCount = comparisonGroupList.length;
  const extraPages = seatingCount + comparisonPageCount;
  let seatingPage = null;
  let comparisonPageSlots = [];
  if (extraPages > 0) {
    const start = closingIndex >= 0
      ? entries[closingIndex].page
      : (entries.length > 0 ? entries[entries.length - 1].page + 1 : 2);
    if (seatingCount > 0) seatingPage = start;
    comparisonPageSlots = comparisonGroupList.map((group, index) => ({
      group,
      page: start + seatingCount + index,
    }));
    if (closingIndex >= 0) {
      entries.slice(closingIndex).forEach((entry) => { entry.page += extraPages; });
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
  const add = (asset, role, sectionId, pagePosition, extra = {}) => {
    if (!asset || !asset.id) return null;
    const placement = makePlacement({
      source: asset,
      role,
      sectionId,
      pagePosition,
      order: placements.length + 1,
      ...extra,
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
    // A source the designer composed as a SUPPORTING image is never taken for a
    // full-width page: DETAIL is a deliberate secondary presentation, so those
    // photographs stay with the section their own purpose names (step 4 below) and
    // are never promoted to a page's hero.
    const candidates = narrativeSources.filter(
      (asset) => asset.id && eligible(asset, pagePosition, CROP_ORIENTATION.LANDSCAPE_FULL)
        && !isSupportingPresentation(asset),
    );
    const coverReturn = candidates.find((asset) => asset.id === coverAsset?.id);
    // The break normally returns the cover source. Where the designer marked a
    // photograph FULL WIDTH and it has not been placed yet, that chosen photograph
    // takes the prominent placement instead: the designer's own presentation
    // choice leads, and the cover keeps its dedicated page. A document with no
    // such source keeps the established return exactly as it was.
    const chosenFullWidth = candidates.find(
      (asset) => usesOf(asset) === 0 && asset.id !== coverAsset?.id && isFullWidthPreference(asset),
    );
    if (preferCoverReturn && chosenFullWidth) return chosenFullWidth;
    if (preferCoverReturn && coverReturn) return coverReturn;
    const fresh = candidates.filter((asset) => usesOf(asset) === 0 && asset.id !== coverAsset?.id);
    if (fresh.length > 0) return fresh[0];
    if (coverReturn) return coverReturn;
    return candidates.slice().sort((a, b) => lastUsed(a) - lastUsed(b))[0] || null;
  };

  /**
   * Whether the designer asked for the prominent treatment on this source. FULL
   * WIDTH is the large editorial image, so it is never used for a smaller crop:
   * the designer's own choice always leads, and the supporting placement is taken
   * from another source rather than replacing it.
   */
  const isFullWidthPreference = (asset) => imagePresentationOf(asset) === IMAGE_PRESENTATION.FULL_WIDTH;

  // 1. The cover.
  add(coverAsset, EDITORIAL_ROLE.COVER, 'cover', 1);

  // 2. The design overview: the dominant full-width landscape.
  const overviewEntry = entries.find((entry) => DESIGN_OVERVIEW_TYPES.includes(entry.section_type));
  if (overviewEntry) {
    add(pickLandscape(overviewEntry.page), EDITORIAL_ROLE.LANDSCAPE_FEATURE, overviewEntry.section_id, overviewEntry.page);
  }

  const structures = entries.filter((entry) => STRUCTURE_TYPES.includes(entry.section_type));

  // 3. EVERY CORE SOUND SECTION TAKES THE PHOTOGRAPH THAT FOLLOWS ITS COPY. The
  // three structures each stand on their own page — heading, then the complete
  // text, then the image below — so each one takes a full-width photograph of its
  // own. A structure never carries the section before it's imagery, and no
  // photograph is shared between two of these pages: where the document has fewer
  // photographs than structures, the structures with none carry their copy alone.
  //
  // The last structure keeps the document's deliberate return — the cover source
  // may come back there, which is the visual break the rhythm is built on.
  structures.forEach((entry, index) => {
    add(
      pickLandscape(entry.page, { preferCoverReturn: index === structures.length - 1 }),
      EDITORIAL_ROLE.LANDSCAPE_FEATURE,
      entry.section_id,
      entry.page,
    );
  });

  // 4. The image that supports the copy: it sits smaller, beside the paragraphs
  // it explains, in the copy-and-image row the portrait accent already uses.
  //
  // A RECORDED PURPOSE IS AUTHORITY. The image takes only the section its own
  // purpose names, so a drawing or a detail is never separated from the account it
  // supports — and an image whose purpose is recorded but names no section this
  // document composes is never dropped into whichever structure happens to have
  // room: it joins the narrative flow below, where its purpose is read again. An
  // image with NOTHING recorded keeps the treatment the document has always given
  // it.
  const fallbackEntry = structures[0] || null;
  // The design-overview page already carries the document's leading photograph, so
  // a supporting image normally takes another section. It may take the overview
  // page only when it is a drawing the document must show whole: the seating
  // account a plan supports is read there, and the page's own copy-and-image row
  // composes the drawing beside it without a second photograph being placed.
  const purposeEntryFor = (asset) => purposeSectionTypes(imagePurposeOf(asset))
    .map((type) => entries.find((entry) => entry.section_type === type
      && (entry !== overviewEntry || isProtectedDrawing(asset))))
    .find(Boolean) || null;
  const supportingPick = narrativeSources
    .filter((asset) => asset.id && asset.id !== coverAsset?.id
      && isSupportingPresentation(asset) && usesOf(asset) === 0)
    .map((source) => {
      const fromPurpose = imagePurposeOf(source) !== null;
      return {
        source,
        fromPurpose,
        entry: fromPurpose ? purposeEntryFor(source) : fallbackEntry,
      };
    })
    .find(({ source, entry, fromPurpose }) => entry
      && (fromPurpose || entry !== overviewEntry)
      && eligible(source, entry.page, CROP_ORIENTATION.PORTRAIT));
  if (supportingPick) {
    add(
      supportingPick.source,
      EDITORIAL_ROLE.PORTRAIT_EDITORIAL,
      supportingPick.entry.section_id,
      supportingPick.entry.page,
    );
  }

  // 5. The seating-style page: the large lifestyle alternatives.
  if (seatingPage) {
    seatingSources.forEach((source) => {
      add(source, EDITORIAL_ROLE.SEATING_OPTION, SEATING_STYLE_SECTION_ID, seatingPage);
    });
  }

  // 5b. Each comparison group's own page: every option it holds, full width, in
  // the designer's display order, each stating what it stands for. The options
  // are read together — never separated across the document, and never shown as
  // decorative gallery images.
  comparisonPageSlots.forEach(({ group, page: pagePosition }) => {
    group.images.forEach((source) => {
      add(source, EDITORIAL_ROLE.COMPARISON_OPTION, COMPARISON_SECTION_ID, pagePosition, {
        comparison_group: group.name,
        comparison_option_label: comparisonOptionLabelOf(source),
      });
    });
  });

  // 6. The closing page: a full-width landscape from the source least recently used.
  const closingEntry = closingIndex >= 0 ? entries[closingIndex] : null;
  const closingFeature = closingEntry
    ? add(pickLandscape(closingEntry.page), EDITORIAL_ROLE.CLOSING_FEATURE, closingEntry.section_id, closingEntry.page)
    : null;

  // Every selected source the document has not placed in the body. An image's
  // explicit Do Not Use flag is the only exclusion, never a count threshold.
  //
  // A photograph chosen for the cover is not consumed by that choice: the cover
  // takes the portrait crop on page 1, and the same source still takes its own
  // place in the body. Only the body placements are counted here — the cover
  // page's own use is not one of them — so a cover photograph the editorial
  // rhythm had no slot for is integrated or retained rather than silently
  // dropped, and no source is ever listed twice.
  const bodyPlacedIds = new Set(
    placements
      .filter((placement) => placement.editorial_role !== EDITORIAL_ROLE.COVER)
      .map((placement) => placement.source_asset_id)
      .filter(Boolean),
  );
  const unplaced = usable.filter(
    (asset) => asset.id && !bodyPlacedIds.has(asset.id)
      && !seatingStyleOf(asset) && !isCompared(asset),
  );

  // 7. THE PHOTOGRAPHS THAT WOULD HAVE HAD A PAGE OF THEIR OWN JOIN THE
  // NARRATIVE INSTEAD. The rhythm above is the document's opening rhythm; every
  // other selected photograph is integrated between the sections it supports, at
  // most a pair to a page, so the pack reads as one brochure.
  //
  // 7a. Where the rhythm had no landscape left for the closing page, the
  //     designer's own prominent photograph closes the design: it is placed on
  //     that page rather than left for a spread, so the document still closes
  //     with a photograph and the spread carries only what the flow cannot hold.
  const closingPageTaken = placements.some(
    (placement) => placement.section_id === closingEntry?.section_id,
  );
  if (closingEntry && !closingFeature && !closingPageTaken) {
    const closingChoice = unplaced.find(isFullWidthPreference) || null;
    if (closingChoice) {
      add(closingChoice, EDITORIAL_ROLE.CLOSING_FEATURE, closingEntry.section_id, closingEntry.page);
    }
  }

  // 7b. The integration. The pages it may join are the document's own narrative
  //     pages, in publication order, and the plan states how many of each page's
  //     places are already taken — so a page that already carries a photograph
  //     takes one more, and a page that carries none may take a pair.
  // The cover page's own use is not a body placement: a photograph chosen for the
  // cover is never consumed by that choice, so the same source is still
  // integrated here when the rhythm had no body slot for it — it is never
  // dropped, and it is never kept out of the body for having been the cover.
  const placedIds = new Set(
    placements
      .filter((placement) => placement.editorial_role !== EDITORIAL_ROLE.COVER)
      .map((placement) => placement.source_asset_id)
      .filter(Boolean),
  );
  // A photograph the document has already shown on its cover is still available
  // to the narrative — the cover selection never consumes it — but among the
  // photographs that share a page it takes the later place, so the page two
  // photographs share carries the ones the client has not seen yet.
  const shownOnCover = new Set(
    placements
      .filter((placement) => placement.editorial_role === EDITORIAL_ROLE.COVER)
      .map((placement) => placement.source_asset_id)
      .filter(Boolean),
  );
  const flow = planImageFlow({
    sources: unplaced
      .filter((asset) => !placedIds.has(asset.id))
      .sort((a, b) => Number(shownOnCover.has(a.id)) - Number(shownOnCover.has(b.id))),
    targets: entries.map((entry) => ({
      ...entry,
      placed_count: placements.filter((placement) => placement.section_id === entry.section_id).length,
    })),
    // Every use already committed, so an integrated photograph is never composed
    // within the minimum page gap of its own earlier use.
    usedPages: Object.fromEntries(
      [...history.entries()].map(([id, uses]) => [id, uses.map((use) => use.pagePosition)]),
    ),
    minPageGap: MIN_PAGE_GAP,
  });
  flow.groups.forEach((group) => {
    group.sources.forEach((source) => {
      add(source, EDITORIAL_ROLE.FLOW_IMAGE, group.section_id, group.page);
    });
  });
  // The pair is composed in the order the LAYOUT asked for, not in the order the
  // placements happened to be created. Where a Full Width photograph shares a page
  // with a supporting one, the Full Width photograph leads it — so the group's own
  // sources are read back one by one. Filtering the placement list by section
  // instead hands the page whatever order the placements were made in, which puts
  // the designer's Full Width photograph into the supporting column and reduces it
  // to a supporting share: the one thing its presentation forbids.
  const flowGroups = flow.groups.map((group) => {
    const ordered = (Array.isArray(group.sources) ? group.sources : [])
      .map((source) => placements.find((placement) => (
        placement.editorial_role === EDITORIAL_ROLE.FLOW_IMAGE
        && placement.section_id === group.section_id
        && placement.source_asset_id === source?.id
      )))
      .filter(Boolean);
    return { ...group, placements: ordered };
  });

  // 7c. What is left is the image section's own: it is carried only when every
  //     narrative page is full, which is the one case in which integrating more
  //     photographs would harm the document's flow.
  const galleryImages = flow.remainder;

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
    // A comparison group's own page: the title it carries, the message the
    // designer supplied (or the neutral text), and the options it shows.
    comparisonPlacements: placements.filter(
      (placement) => placement.editorial_role === EDITORIAL_ROLE.COMPARISON_OPTION,
    ),
    comparisonPages: comparisonPageSlots.map(({ group, page: pagePosition }) => ({
      id: group.id,
      title: comparisonPageTitle(group),
      message: group.message,
      message_source: group.message_source,
      page: pagePosition,
      placements: placements.filter((placement) => placement.section_id === COMPARISON_SECTION_ID
        && placement.comparison_group === group.name),
    })),
    galleryImages,
    // The photographs integrated into the narrative, one entry per page that
    // received them: the section they joined, the layout the pair is composed
    // in, and the placements themselves, in reading order.
    flowGroups,
    flowImages: placements.filter((placement) => placement.editorial_role === EDITORIAL_ROLE.FLOW_IMAGE),
    selectedImageUrls: usable.map((asset) => asset.file_url),
    // The images the designer marked as comparison options, so the plan can be
    // checked against where they actually landed.
    comparisonImageIds: [...comparisonIds],
    retainedGallery: galleryImages.length >= RETAINED_GALLERY_MIN_IMAGES,
    usableCount,
    sourceUseCount: Object.fromEntries(
      [...history.entries()].map(([assetId, uses]) => [assetId, uses.length]),
    ),
  };
}

export default planProposalImages;