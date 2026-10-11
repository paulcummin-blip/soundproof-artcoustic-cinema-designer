/**
 * writerSectionMapping.js (shared)
 * --------------------------------
 * THE boundary between the approved writer's draft and the proposal a dealer
 * opens, edits and exports.
 *
 * The writer returns its copy in its own nine sections — decision_summary,
 * what_stays_same, what_changes, key_performance_highlights, spatial_resolution,
 * dynamic_range, timbre_matching, overall_design, appendix_notes — because that
 * is the structure its contract, its prompt and its validator are written
 * against. The proposal document is composed of the report's own sections, and
 * those are the sections the editor, the image planner, the page-break rules and
 * the printed pack already read.
 *
 * This module is the one place the two are put together, so neither the contract
 * nor the document has to change for the other. Nothing here writes, validates,
 * calls a provider or touches the SDK: it turns a draft that has ALREADY passed
 * the writer's contract into the bodies the proposal's sections carry.
 *
 * Publishing rule:
 *
 *   - a proposal section that receives ONE writer section carries its prose alone
 *     (the section already has its own heading on the page);
 *   - a proposal section that receives MORE THAN ONE carries each part under the
 *     writer's own heading for it, so the approved structure survives inside the
 *     document's own structure;
 *   - the writer's plain prose becomes paragraphs of HTML, and any markup
 *     character in it is escaped, so a draft can never inject a table or a tag
 *     into the document.
 *
 * A writer section the proposal's own section set has no home for is reported
 * rather than dropped: a caller that cannot publish the whole draft must fail
 * visibly instead of printing a proposal with copy missing from it.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { WRITER_SECTION_IDS, writerSectionsForMode } from './writerContractSchema.js';

/**
 * Which proposal section each of the writer's sections is published into.
 *
 * The three opening sections share the report's own opening section, which is
 * exactly what that section is for: the summary of the design being offered, the
 * overview of what it is, and why this specification was chosen — in a
 * comparison that same section is where the options are introduced before they
 * are contrasted. `appendix_notes` is the source-only note, so it is published
 * into the report's Appendix section.
 */
export const PROPOSAL_SECTION_FOR_WRITER_SECTION = Object.freeze({
  decision_summary: 'system_design_summary',
  what_stays_same: 'system_design_summary',
  what_changes: 'system_design_summary',
  key_performance_highlights: 'key_performance_highlights',
  spatial_resolution: 'spatial_resolution',
  dynamic_range: 'dynamic_range',
  timbre_matching: 'timbre_matching',
  overall_design: 'overall_design',
  appendix_notes: 'appendix',
});

/**
 * The proposal sections a writer draft is published into, in document order.
 * Used only when a caller supplies no section order of its own.
 */
export const WRITER_TARGET_SECTION_ORDER = Object.freeze([
  'system_design_summary',
  'key_performance_highlights',
  'spatial_resolution',
  'dynamic_range',
  'timbre_matching',
  'overall_design',
  'appendix',
]);

/** A markup character in a draft is written as text, never as markup. */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The writer's plain prose as the HTML the document and the editor render: one
 * paragraph per blank-line-separated block, with the draft's own markup
 * characters escaped.
 *
 * @param {string} text
 * @returns {string} the section body, or '' when there is no copy
 */
export function narrativeHtml(text) {
  const paragraphs = String(text ?? '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);

  if (paragraphs.length === 0) return '';
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
}

/**
 * Publish a validated writer draft into the proposal's own sections.
 *
 * @param {Object} input
 * @param {Object|null} input.output — the draft the writer returned (contract shape)
 * @param {string} [input.mode] — 'single' | 'comparison', from the frozen pack
 * @param {Array<string>} [input.sectionTypes] — the proposal's section set, in document order
 * @returns {{ bodies: Array<{section_type: string, html: string, writer_sections: Array<string>}>,
 *   unmapped: Array<string> }}
 *   `bodies` in document order, and `unmapped`: writer sections that arrived but
 *   have no section in this proposal's set to be published into.
 */
export function composeWriterSectionBodies({ output = null, mode = 'comparison', sectionTypes = [] } = {}) {
  const draft = Array.isArray(output?.sections) ? output.sections : [];
  const bodyById = new Map();

  for (const entry of draft) {
    const id = typeof entry?.section === 'string' ? entry.section : null;
    if (!id || !WRITER_SECTION_IDS.includes(id) || bodyById.has(id)) continue;
    const html = narrativeHtml(entry?.text);
    if (html) bodyById.set(id, html);
  }

  const titleById = new Map(
    writerSectionsForMode(mode).map((entry) => [entry.section, entry.title]),
  );
  const order = Array.isArray(sectionTypes) && sectionTypes.length > 0
    ? sectionTypes
    : [...WRITER_TARGET_SECTION_ORDER];

  const bodies = [];
  for (const sectionType of order) {
    const writerSections = WRITER_SECTION_IDS.filter(
      (id) => PROPOSAL_SECTION_FOR_WRITER_SECTION[id] === sectionType && bodyById.has(id),
    );
    if (writerSections.length === 0) continue;

    // A part the section shares with another part keeps the writer's own heading
    // for it; a section carrying one part is written under the section's own.
    const html = writerSections
      .map((id) => (writerSections.length > 1 ? `<h2>${escapeHtml(titleById.get(id) || id)}</h2>` : '')
        + bodyById.get(id))
      .join('');

    bodies.push({ section_type: sectionType, html, writer_sections: [...writerSections] });
  }

  const published = new Set(bodies.flatMap((body) => body.writer_sections));
  const unmapped = WRITER_SECTION_IDS.filter((id) => bodyById.has(id) && !published.has(id));

  return { bodies, unmapped };
}

export default composeWriterSectionBodies;