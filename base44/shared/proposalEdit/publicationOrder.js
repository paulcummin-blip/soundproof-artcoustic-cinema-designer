/**
 * publicationOrder.js (shared, server half)
 * ----------------------------------------
 * The server's copy of the document ordering authority. The frontend mirrors it
 * in src/components/proposal/publicationOrder.js (the two cannot import from each
 * other) and a test asserts they agree.
 *
 * The order a client reads a proposal in is decided from the report type's own
 * section definitions — never from the order a database read returned rows in.
 * Presented Options and the Appendix therefore cannot appear before the cover.
 *
 * The legacy 'single' report set is listed here because the frontend's legacy set
 * is UI-only and is not shared to the backend.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { SYSTEM_SUMMARY_SECTIONS } from '../systemDesignSummarySections.js';

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
  'appendix',
]);

/** The canonical section types of a report type, in published order. */
export function canonicalSectionTypes(proposalType = null) {
  if (proposalType === 'single') return [...LEGACY_PROPOSAL_SECTION_TYPES];
  return SYSTEM_SUMMARY_SECTIONS.map((def) => def.type);
}

/**
 * The document's sections in canonical published order. The same records, ordered.
 *
 * @param {{ sections?: Array, proposalType?: string|null }} input
 * @returns {Array}
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

export default orderPublicationSections;