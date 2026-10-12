/**
 * narrativeFlowComposition.js
 * ---------------------------
 * The ONE authority for which proposal sections share an A4 sheet.
 *
 * Why it exists. Every section used to be composed as its own page frame, so a
 * section was always given a whole sheet however short its copy — a two-paragraph
 * structure section took a page, and its page read as mostly empty paper. The
 * composition is editorial, not arithmetic: sections that continue one story may
 * share a sheet, and the sheet is filled by the copy rather than by a rule that a
 * new section begins a new sheet.
 *
 * What may share a sheet, and what may not:
 *   - the narrative sections of the design story flow together (the three pillar
 *     structures, the system summary, the closing statement). They are read as
 *     one continuous account, so they continue on one sheet and onto the next
 *     when their copy needs it;
 *   - a designed page does not join the flow. At a Glance, the Method page, the
 *     Key Performance Highlights evidence page, an imagery page, the Presented
 *     Options page and a comparison page each state one thing on their own sheet,
 *     and combining them with prose would only mix unrelated material to fill
 *     white space.
 *
 * The flow is composed, not measured: this module decides which sections may
 * share a frame, and the pack's own pagination decides how many sheets that frame
 * really needs when it is measured.
 *
 * Pure: no React, no DOM, no runtime reads.
 */

/** The narrative sections that may share a sheet with the section before them. */
export const FLOW_SECTION_TYPES = Object.freeze([
  // The System Design structure — one continuous design account.
  'system_design_summary',
  'spatial_resolution',
  'dynamic_range',
  'timbre_matching',
  'overall_design',
  // The legacy ten-section report's narrative, kept so saved documents compose
  // under the same editorial rule.
  'executive_summary',
  'design_philosophy',
  'system_overview',
  'performance',
  'conclusion',
]);

/** True when a section is narrative prose that may continue on the open sheet. */
export function isFlowSection(sectionType) {
  return FLOW_SECTION_TYPES.includes(sectionType);
}

/**
 * The document's flow bands: each band is one consecutive run of narrative
 * sections, composed as a single frame. The first type of a band opens it — that
 * section carries the sheet's page number, and every following member continues
 * on the same sheet under its own heading.
 *
 * @param {string[]} sectionTypes — the section types the document prints, in
 *   publication order
 * @returns {Array<{ types: string[] }>}
 */
export function composeNarrativeBands(sectionTypes = []) {
  const bands = [];
  let open = null;
  (Array.isArray(sectionTypes) ? sectionTypes : []).forEach((type) => {
    if (!isFlowSection(type)) { open = null; return; }
    if (open) open.types.push(type);
    else { open = { types: [type] }; bands.push(open); }
  });
  return bands;
}

/** The type that opens each band — the one section that carries the number. */
export function bandOpeningTypes(sectionTypes = []) {
  return new Set(composeNarrativeBands(sectionTypes).map((band) => band.types[0]));
}

/**
 * The sheet a section is composed on, for the composition's own bookkeeping:
 * which frame it belongs to and whether it opens that frame.
 *
 * @param {string[]} sectionTypes — in publication order
 * @returns {Map<string, { band: number, opens: boolean }>}
 */
export function sheetMembership(sectionTypes = []) {
  const membership = new Map();
  composeNarrativeBands(sectionTypes).forEach((band, index) => {
    band.types.forEach((type, position) => {
      membership.set(type, { band: index, opens: position === 0 });
    });
  });
  return membership;
}

export default composeNarrativeBands;