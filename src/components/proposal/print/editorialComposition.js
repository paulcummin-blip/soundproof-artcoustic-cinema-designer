/**
 * editorialComposition.js
 * -----------------------
 * The editorial composition rules of a client-facing proposal pack.
 *
 * Three rules, and no pagination of its own. This module says which copy belongs
 * together, which copy a client-facing document prints at all, and how the three
 * RP22 design structures are presented; the ONE measured compositor
 * (export/browserProposalComposition + export/composition/*) still decides how
 * many sheets a composition needs and where a composition that genuinely exceeds
 * a sheet continues.
 *
 *  1. A section's copy is read as COMPOSITIONS. Its opening composition is its
 *     own heading, the photograph that leads it and its first block of copy; the
 *     rest of the same section continues one story, so the remaining blocks form
 *     ONE further composition. A composition that fits a sheet is never broken
 *     across two, and the photograph that leads one is reduced in height — never
 *     cropped, never removed, never re-set in smaller type — where that is what
 *     it takes for the complete copy to reach one sheet.
 *
 *  2. The three RP22 design structures — Spatial Resolution, Dynamic Range and
 *     Timbre Matching — are presented as ONE connected section under one shared
 *     heading, in that order, with one hierarchy and one rhythm, and a supporting
 *     photograph BELOW the explanation it supports.
 *
 *  3. The Appendix is not part of a client-facing document. The Project Report
 *     carries the supporting technical evidence, so the pack prints neither the
 *     Appendix heading nor a generic closing note in its place, and the stored
 *     section is left exactly as it is in the database.
 *
 * Pure: no React, no DOM, no runtime reads.
 */

/**
 * Section types a client-facing document does not print. The stored record is
 * never touched — it simply has no place in the pack.
 */
export const CLIENT_EXCLUDED_SECTION_TYPES = Object.freeze(['appendix']);

/** Whether a section belongs in the client-facing document at all. */
export function isClientVisibleSection(sectionType) {
  return !CLIENT_EXCLUDED_SECTION_TYPES.includes(String(sectionType || ''));
}

/** The three RP22 structures that are presented as one connected section. */
export const PILLAR_SECTION_TYPES = Object.freeze([
  'spatial_resolution',
  'dynamic_range',
  'timbre_matching',
]);

/** The one heading the three structures are presented under. */
export const PILLAR_GROUP_HEADING = 'The Sound Experience';

/** Whether a section is one of the three presented structures. */
export function isPillarSection(sectionType) {
  return PILLAR_SECTION_TYPES.includes(String(sectionType || ''));
}

/** The member of the group that carries the shared heading and opens it. */
export function pillarGroupOpens(sectionType) {
  return String(sectionType || '') === PILLAR_SECTION_TYPES[0];
}

/**
 * Whether this section's supporting photograph follows its explanation. It does
 * for the three presented structures: the reading order is heading, complete
 * text, then the photograph that supports it.
 */
export function mediaFollowsBody(sectionType) {
  return isPillarSection(sectionType);
}

/** A block of copy opens with its own heading. */
const BLOCK_HEADING = /<h([1-6])\b[^>]*>[\s\S]*?<\/h\1>/i;

const stripTags = (value) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The copy of one section, split into its own blocks.
 *
 * A block is a heading and every paragraph it introduces. Copy that precedes the
 * first heading is not a block of its own: it belongs to the block that follows
 * it, so a lead-in sentence is never separated from what it leads into.
 *
 * Nothing is dropped, reordered or rewritten: the blocks together are the stored
 * body, character for character.
 *
 * @param {string} html — a prepared section body
 * @returns {Array<{ id: string, heading: string, html: string }>}
 */
export function splitEditorialBlocks(html = '') {
  const value = String(html || '');
  if (!value.trim()) return [];
  const blocks = [];
  value.split(/(?=<h[1-6]\b)/i).filter((part) => part.trim()).forEach((part) => {
    const previous = blocks[blocks.length - 1];
    if (previous && !BLOCK_HEADING.test(part)) {
      previous.html += part;
      return;
    }
    const heading = part.match(BLOCK_HEADING);
    blocks.push({
      id: `block:${blocks.length}`,
      heading: heading ? stripTags(heading[0]) : '',
      html: part,
    });
  });
  return blocks;
}

/**
 * The compositions one section's copy is read as.
 *
 * The opening composition is the section's heading, its leading photograph and
 * its first block; every further block continues the same account, so the
 * remaining blocks are ONE composition. A single-block section is one
 * composition, and a section with no copy is none.
 *
 * @param {Array} blocks — from splitEditorialBlocks
 * @returns {Array<Array>} compositions, in reading order
 */
export function groupEditorialCompositions(blocks = []) {
  const list = (Array.isArray(blocks) ? blocks : []).filter(Boolean);
  if (list.length === 0) return [];
  if (list.length === 1) return [list];
  return [[list[0]], list.slice(1)];
}

export default groupEditorialCompositions;