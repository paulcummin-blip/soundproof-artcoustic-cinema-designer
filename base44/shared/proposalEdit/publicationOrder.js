/**
 * publicationOrder.js (shared, server half)
 * ----------------------------------------
 * The server's copy of the document ordering authority. The frontend mirrors it
 * in src/components/proposal/publicationOrder.js (the two cannot import from each
 * other) and a test asserts they agree.
 *
 * The order a client reads a proposal in is decided from the report type's own
 * section definitions — never from the order a database read returned rows in.
 * Presented Options therefore cannot appear before the cover, and a WITHDRAWN
 * section forms no part of the document at all.
 *
 * The legacy 'single' report set is listed here because the frontend's legacy set
 * is UI-only and is not shared to the backend.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { SYSTEM_SUMMARY_SECTIONS, isRetiredSectionType } from '../systemDesignSummarySections.js';

/** The legacy ten-section set, in order. Readable history only. */
export const LEGACY_PROPOSAL_SECTION_TYPES = Object.freeze([
  'cover',
  'executive_summary',
  'design_philosophy',
  'system_overview',
  'room_images',
  'performance',
  'products',
  'comparison',
  'conclusion',
]);

/** The canonical section types of a report type, in published order. */
export function canonicalSectionTypes(proposalType = null) {
  if (proposalType === 'single') return [...LEGACY_PROPOSAL_SECTION_TYPES];
  return SYSTEM_SUMMARY_SECTIONS.map((def) => def.type);
}

/**
 * Section types that are FIXED structural elements of the document and keep
 * their canonical position regardless of a saved order_index. The cover opens
 * the document; a dealer cannot move it by dragging the section list.
 *
 * Mirrored verbatim in src/components/proposal/publicationOrder.js — a test
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
 * the server's published document and the editor's preview read this one
 * function, so they show the same sequence, and a saved order survives refresh
 * and reopening.
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
    // and never approved.
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

export default orderPublicationSections;