/**
 * publicationOrder.js
 * -------------------
 * The one ordering authority for a published proposal document.
 *
 * The order a document is read in is decided HERE, from the report type's own
 * section definitions — never from the order a database read happened to return
 * rows in. The cover is first because it is first in the definitions; the
 * narrative follows the definitions' own sequence; Presented Options keeps its
 * defined place. A WITHDRAWN section is not part of the document at all.
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

import { getSectionsForProposalType, isRetiredSectionType } from './proposalSections';

/** The canonical section types of a report type, in published order. */
export function canonicalSectionTypes(proposalType) {
  return getSectionsForProposalType(proposalType).map((def) => def.type);
}

/**
 * Section types that are FIXED structural elements of the document and keep
 * their canonical position regardless of a saved order_index. The cover opens
 * the document; a dealer cannot move it by dragging the section list.
 *
 * Mirrored verbatim in base44/shared/proposalEdit/publicationOrder.js — a test
 * asserts the two agree.
 */
export const FIXED_SECTION_TYPES = Object.freeze(['cover']);

/** Whether a section type is a fixed structural element pinned to its canonical slot. */
export function isFixedSectionType(type) {
  return FIXED_SECTION_TYPES.includes(String(type || ''));
}

/**
 * The document's sections in published order.
 *
 * The canonical section sequence establishes the INITIAL order when a proposal
 * is generated. Once the dealer deliberately reorders the sections, the saved
 * `order_index` becomes authoritative for the proposal's REORDERABLE sections:
 * the sidebar, the editor, the document preview and the exported PDF all read
 * this one function, so they all show the same sequence, and a saved order
 * survives refresh, closing and reopening.
 *
 * Fixed structural elements (the cover) keep their canonical position. For
 * older proposals that never had a deliberate order saved — where every
 * reorderable section shares the same (or missing) order_index — the saved
 * indices resolve to the canonical sequence, so the default order is retained.
 *
 * A WITHDRAWN section forms no part of the document at all.
 *
 * @param {{ sections?: Array, proposalType?: string|null }} input
 * @returns {Array} the same records, ordered — never modified
 */
export function orderPublicationSections({ sections = [], proposalType = null } = {}) {
  const order = canonicalSectionTypes(proposalType);
  const rank = new Map(order.map((type, index) => [type, index]));
  const rankOf = (section) => (rank.has(section?.section_type) ? rank.get(section.section_type) : order.length);

  const list = (Array.isArray(sections) ? sections : [])
    // A WITHDRAWN section forms no part of the document. Its stored record is left
    // exactly as it is — nothing is migrated, rewritten or deleted — but it is
    // never ordered into the document, and so is never published, never printed
    // and never approved. Every surface downstream reads the document this
    // function returns, so this is the only place that has to know.
    .filter((section) => !isRetiredSectionType(section?.section_type))
    .map((section, position) => ({ section, position }));

  // Fixed structural elements (the cover) keep their canonical position.
  const fixed = list.filter((entry) => isFixedSectionType(entry.section?.section_type));
  const reorderable = list.filter((entry) => !isFixedSectionType(entry.section?.section_type));

  // Reorderable sections follow the dealer's saved order_index. Where two share
  // an index (an older proposal that never had a deliberate order saved) the
  // canonical sequence is the tiebreak, so the default order is retained.
  const sortedReorderable = [...reorderable].sort((a, b) => {
    const indexA = Number(a.section?.order_index) || 0;
    const indexB = Number(b.section?.order_index) || 0;
    if (indexA !== indexB) return indexA - indexB;
    const rankA = rankOf(a.section);
    const rankB = rankOf(b.section);
    if (rankA !== rankB) return rankA - rankB;
    const keyA = String(a.section?.section_key || a.section?.id || '');
    const keyB = String(b.section?.section_key || b.section?.id || '');
    if (keyA !== keyB) return keyA < keyB ? -1 : 1;
    return a.position - b.position;
  });

  // Place fixed sections at their canonical slots; the dealer's reorderable
  // sections fill every remaining position in saved order.
  const fixedByType = new Map();
  fixed.forEach((entry) => {
    const type = entry.section.section_type;
    if (!fixedByType.has(type)) fixedByType.set(type, []);
    fixedByType.get(type).push(entry);
  });
  const usedFixed = new Set();
  const result = [];
  let ri = 0;
  for (let i = 0; i < order.length; i++) {
    const type = order[i];
    if (isFixedSectionType(type)) {
      const entries = fixedByType.get(type);
      if (entries && entries.length) {
        const entry = entries.shift();
        result.push(entry.section);
        usedFixed.add(entry);
      }
    } else if (ri < sortedReorderable.length) {
      result.push(sortedReorderable[ri++].section);
    }
  }
  // Any leftover reorderable sections (types not in the canonical list) follow
  // the saved order at the end; any leftover fixed sections follow after.
  while (ri < sortedReorderable.length) result.push(sortedReorderable[ri++].section);
  fixed.forEach((entry) => {
    if (!usedFixed.has(entry)) result.push(entry.section);
  });
  return result;
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