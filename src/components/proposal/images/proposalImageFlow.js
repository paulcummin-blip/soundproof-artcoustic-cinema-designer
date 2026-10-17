/**
 * proposalImageFlow.js
 * --------------------
 * INTEGRATING THE PROJECT'S PHOTOGRAPHS INTO THE PROPOSAL'S EDITORIAL FLOW.
 *
 * The rule this module states, in one place: a project photograph belongs
 * BETWEEN the sections it supports, not on a gallery page bolted onto the end of
 * the document. A standalone Project Images appendix is not created by default —
 * it is what is left when the flow genuinely cannot carry the photographs, which
 * is the only remaining reason for one.
 *
 * What that means in practice:
 *
 *   WHERE A PHOTOGRAPH GOES. The narrative sections are the document's pages,
 *   read in their own publication order, and each is a place a photograph can
 *   join the copy: the System Design Summary takes the whole-room render, the
 *   design structures take the room renders that show the seating, the screen
 *   and the speaker context, the closing section takes the hero. A photograph
 *   with a recorded PURPOSE prefers the section that purpose belongs with, so a
 *   product detail sits near the product copy and a drawing sits with the
 *   account it explains; nothing is forced into one fixed section.
 *
 *   TWO PHOTOGRAPHS SHARE ONE PAGE. Two photographs that would each take a page
 *   of their own are composed TOGETHER on one page wherever that page can hold
 *   both. The layout follows the presentation metadata the designer recorded,
 *   never a count and never a coin toss:
 *     stacked              two Full Width photographs, or two photographs with
 *                          nothing recorded: each is composed at the full content
 *                          width in its own proportions, one under the other;
 *     side by side         two supporting (Detail / Cropped Detail) photographs,
 *                          each at the supporting share of the content width;
 *     feature and support  one Full Width photograph with one supporting
 *                          photograph: the prominent one leads, the supporting one
 *                          follows it smaller. A Full Width choice is never
 *                          reduced to sit beside anything.
 *
 *   A PAGE CARRIES AT MOST TWO PHOTOGRAPHS, and one that already carries one may
 *   take one more. Where every narrative page is full and photographs remain, the
 *   remainder is what the document holds back for its image section: THAT is the
 *   "enough photographs that integrating them would harm the document flow" case,
 *   and it is the only case in which a gallery spread is composed.
 *
 * Nothing here measures a page, chooses a crop, reads an engineering value or
 * writes anything: it decides WHICH PAGE a photograph joins and HOW two that
 * share one are composed. The measured compositor still decides how many sheets
 * a composition needs, and a page that cannot hold a pair continues onto its own
 * next sheet rather than shrinking a photograph against the designer's choice.
 *
 * Pure: no React, no DOM, no runtime reads, no imports beyond the placement
 * vocabulary, so it can be run from a plain node script.
 */

import {
  IMAGE_PRESENTATION,
  imagePresentationOf,
  imagePurposeOf,
  purposeSectionTypes,
} from './proposalImagePlacementAuthority.js';

/**
 * The narrative sections a project photograph may join, in the order the document
 * reads them. The design overview, the three design structures, the legacy
 * narrative sections and the closing statement are the document's story; the
 * evidence page, the Presented Options page and the image section itself are not
 * places a photograph is integrated into, because each states one thing on its
 * own sheet and adding imagery would mix unrelated material to fill space.
 */
export const FLOW_IMAGE_SECTION_TYPES = Object.freeze([
  'system_design_summary',
  'executive_summary',
  'design_philosophy',
  'system_overview',
  'spatial_resolution',
  'dynamic_range',
  'timbre_matching',
  'performance',
  'products',
  'overall_design',
  'conclusion',
]);

/** Whether a photograph may join this section's page. */
export function acceptsFlowImage(sectionType) {
  return FLOW_IMAGE_SECTION_TYPES.includes(String(sectionType || ''));
}

/** The most photographs one narrative page carries: a pair, and no more. */
export const FLOW_IMAGES_PER_PAGE = 2;

/** How many of those places are still free on a page that already carries some. */
export function flowImageCapacity(placedCount = 0) {
  const placed = Math.max(0, Number(placedCount) || 0);
  return Math.max(0, FLOW_IMAGES_PER_PAGE - placed);
}

/** How two photographs sharing a page are composed. */
export const FLOW_IMAGE_LAYOUT = Object.freeze({
  /** One photograph on the page: it alone follows the copy. */
  SINGLE: 'single',
  /** Two photographs at the full content width, one under the other. */
  STACKED: 'stacked',
  /** Two supporting photographs side by side, each at the supporting share. */
  SIDE_BY_SIDE: 'side_by_side',
  /** One prominent photograph with a smaller supporting one beneath it. */
  FEATURE_AND_SUPPORT: 'feature_and_support',
});

const isSupporting = (asset) => {
  const presentation = imagePresentationOf(asset);
  return presentation === IMAGE_PRESENTATION.DETAIL
    || presentation === IMAGE_PRESENTATION.CROPPED_DETAIL;
};

const isProminent = (asset) => imagePresentationOf(asset) === IMAGE_PRESENTATION.FULL_WIDTH;

/**
 * How two photographs that share a page are composed, read from the presentation
 * each designer recorded on its own card. An image with nothing recorded is
 * composed as the photograph the document has always composed it as.
 */
export function flowImageLayoutFor(a, b) {
  if (!a || !b) return FLOW_IMAGE_LAYOUT.SINGLE;
  // Two supporting images are the only pair that may sit side by side: at the
  // supporting share each stays readable, and neither is promoted or reduced.
  if (isSupporting(a) && isSupporting(b)) return FLOW_IMAGE_LAYOUT.SIDE_BY_SIDE;
  // A Full Width choice beside a supporting one: the prominent photograph keeps
  // the full content width and the supporting one follows it smaller.
  if (isProminent(a) !== isProminent(b)) return FLOW_IMAGE_LAYOUT.FEATURE_AND_SUPPORT;
  // Two Full Width photographs, or two with nothing recorded: the full content
  // width for each, one under the other, each in its own proportions.
  return FLOW_IMAGE_LAYOUT.STACKED;
}

/**
 * The pair in the reading order its layout asks for: where one photograph is the
 * prominent one, it leads the page, whatever order the gallery holds them in.
 */
export function flowImagePair(layout, a, b) {
  if (layout === FLOW_IMAGE_LAYOUT.FEATURE_AND_SUPPORT && isSupporting(a) && !isSupporting(b)) {
    return [b, a];
  }
  return [a, b];
}

/**
 * Place the photographs the document would otherwise have printed on pages of
 * their own into the narrative, two to a page where the page can hold both.
 *
 * @param {Object} args
 * @param {Array}  args.sources the photographs, in gallery order
 * @param {Array}  args.targets the document's narrative pages, in publication
 *   order: {section_id, section_type, page, placed_count}
 * @param {Object} args.usedPages the pages each source is already used on, keyed
 *   by source id, so an integrated photograph is never placed within the
 *   document's minimum page gap of its own earlier use — the cover page's use
 *   included. A photograph that has nowhere to go within that rule is kept for
 *   the image section rather than placed too close to itself.
 * @param {number} args.minPageGap the caller's own minimum page gap, passed in so
 *   the two rules can never drift apart.
 * @returns {{groups: Array, remainder: Array}} the pages that received
 *   photographs — {id, section_id, section_type, page, layout, sources} — and
 *   the photographs left over, which is what a gallery spread would carry.
 */
export function planImageFlow({
  sources = [],
  targets = [],
  usedPages = {},
  minPageGap = 2,
} = {}) {
  const pageGap = Math.max(1, Number(minPageGap) || 2);
  const list = (Array.isArray(sources) ? sources : []).filter((asset) => asset?.id);
  const pages = (Array.isArray(targets) ? targets : [])
    .filter((target) => target?.section_id && acceptsFlowImage(target.section_type))
    .map((target) => ({
      section_id: target.section_id,
      section_type: target.section_type,
      page: target.page,
      capacity: flowImageCapacity(target.placed_count),
    }))
    .filter((page) => page.capacity > 0);

  const groups = [];
  const remainder = [];
  let index = 0;

  // The page a photograph joins: the one its own purpose belongs with where the
  // document has such a page, then a page that carries no photograph yet — the
  // natural home for a new one — and only then a page that already carries one.
  // Whether a page is far enough from this source's own earlier uses — the cover
  // page's use included — for the source to be composed on it again.
  const clearOfEarlierUses = (page, asset) => (usedPages[asset?.id] || [])
    .every((used) => Math.abs(Number(page.page) - Number(used)) >= pageGap);
  const canTake = (page, asset, minimumCapacity = 1) => page.capacity >= minimumCapacity
    && clearOfEarlierUses(page, asset);

  const pageFor = (asset, minimumCapacity = 1) => {
    const preferred = purposeSectionTypes(imagePurposeOf(asset));
    const purposePage = pages.find((page) => canTake(page, asset, minimumCapacity)
      && preferred.includes(page.section_type));
    const emptyPage = pages.find((page) => canTake(page, asset, FLOW_IMAGES_PER_PAGE));
    const anyPage = pages.find((page) => canTake(page, asset, minimumCapacity));
    return purposePage || emptyPage || anyPage || null;
  };

  // The page two photographs can share: one that has room for both and is far
  // enough from each of their own earlier uses, preferring a section either of
  // them belongs with.
  const sharedPageFor = (a, b) => {
    const preferred = [
      ...purposeSectionTypes(imagePurposeOf(a)),
      ...purposeSectionTypes(imagePurposeOf(b)),
    ];
    const shared = pages.filter((page) => canTake(page, a, FLOW_IMAGES_PER_PAGE)
      && canTake(page, b, FLOW_IMAGES_PER_PAGE));
    return shared.find((page) => preferred.includes(page.section_type)) || shared[0] || null;
  };

  const openGroup = (page, layout, sources) => {
    const group = {
      id: `flow:${page.section_id}:${groups.length + 1}`,
      section_id: page.section_id,
      section_type: page.section_type,
      page: page.page,
      layout,
      sources,
    };
    groups.push(group);
    page.capacity -= sources.length;
    return group;
  };

  while (index < list.length) {
    const asset = list[index];
    const next = list[index + 1] || null;
    // TWO PHOTOGRAPHS THAT WOULD EACH TAKE A PAGE OF THEIR OWN SHARE ONE PAGE.
    // This is decided first: where such a page exists, both photographs are
    // composed on it, and only what cannot share a page takes a page alone.
    const sharedPage = next ? sharedPageFor(asset, next) : null;
    if (sharedPage) {
      const layout = flowImageLayoutFor(asset, next);
      openGroup(sharedPage, layout, flowImagePair(layout, asset, next));
      index += 2;
      continue;
    }
    const page = pageFor(asset);
    if (!page) {
      // Every narrative page is full, or used too recently by this source: what
      // is left is the image section's own, and nothing is dropped for want of a
      // page.
      remainder.push(...list.slice(index));
      break;
    }
    openGroup(page, FLOW_IMAGE_LAYOUT.SINGLE, [asset]);
    index += 1;
  }

  return { groups, remainder };
}

export default planImageFlow;