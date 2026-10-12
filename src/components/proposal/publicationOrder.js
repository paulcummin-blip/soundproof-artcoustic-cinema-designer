/**
 * publicationOrder.js
 * -------------------
 * The one ordering authority for a published proposal document.
 *
 * The order a document is read in is decided HERE, from the report type's own
 * section definitions — never from the order a database read happened to return
 * rows in. The cover is first because it is first in the definitions; the
 * narrative follows the definitions' own sequence; Presented Options keeps its
 * defined place; the Appendix stays last.
 *
 * A section type the definitions do not list is placed after every known one, by
 * its stored order_index, so a legacy or duplicated record can never displace the
 * document's structure. Nothing here reads a record's body: this is order only.
 *
 * The server mirrors this module in
 * base44/shared/proposalEdit/publicationOrder.js (the two cannot import from each
 * other) and a test asserts they agree.
 *
 * Pure: no React, no fetching, no side effects.
 */

import { getSectionsForProposalType } from './proposalSections';

/** The canonical section types of a report type, in published order. */
export function canonicalSectionTypes(proposalType) {
  return getSectionsForProposalType(proposalType).map((def) => def.type);
}

/**
 * The document's sections in canonical published order.
 *
 * @param {{ sections?: Array, proposalType?: string|null }} input
 * @returns {Array} the same records, ordered — never modified
 */
export function orderPublicationSections({ sections = [], proposalType = null } = {}) {
  const order = canonicalSectionTypes(proposalType);
  const rank = new Map(order.map((type, index) => [type, index]));
  const rankOf = (section) => (rank.has(section?.section_type) ? rank.get(section.section_type) : order.length);

  return (Array.isArray(sections) ? sections : [])
    .map((section, position) => ({ section, position }))
    .sort((a, b) => {
      const rankA = rankOf(a.section);
      const rankB = rankOf(b.section);
      if (rankA !== rankB) return rankA - rankB;
      // Two records of the same type (or of unlisted types): the designer's own
      // saved order_index decides, then a stable key, then the read order.
      const indexA = Number(a.section?.order_index) || 0;
      const indexB = Number(b.section?.order_index) || 0;
      if (indexA !== indexB) return indexA - indexB;
      const keyA = String(a.section?.section_key || a.section?.id || '');
      const keyB = String(b.section?.section_key || b.section?.id || '');
      if (keyA !== keyB) return keyA < keyB ? -1 : 1;
      return a.position - b.position;
    })
    .map((entry) => entry.section);
}

/**
 * Where a document's alternatives are presented.
 *
 * The validated Presented Options section is the authority for the alternatives
 * as well as for their prose, so where that section is part of the document its
 * images belong to it — one explanation, presented with the images it describes.
 * Where the document has no such section the alternatives keep the page the
 * planner anchored them to.
 *
 * @param {{ alternativeGroups?: number, sectionTypes?: Array<string>, anchorType?: string|null }} input
 * @returns {string|null} the section type that carries the alternatives
 */
export function alternativesCarrier({ alternativeGroups = 0, sectionTypes = [], anchorType = null } = {}) {
  if (Number(alternativeGroups) < 1) return null;
  return (Array.isArray(sectionTypes) ? sectionTypes : []).includes('presented_options')
    ? 'presented_options'
    : anchorType;
}

/**
 * Where a document's seating alternatives are presented. A seating group is one
 * alternative group, and it only exists once there are two images to choose
 * between.
 *
 * @param {{ seatingCount?: number, sectionTypes?: Array<string>, anchorType?: string|null }} input
 * @returns {string|null} the section type that carries the seating presentation
 */
export function seatingPresentationTarget({ seatingCount = 0, sectionTypes = [], anchorType = null } = {}) {
  return alternativesCarrier({
    alternativeGroups: Number(seatingCount) >= 2 ? 1 : 0,
    sectionTypes,
    anchorType,
  });
}

export default orderPublicationSections;