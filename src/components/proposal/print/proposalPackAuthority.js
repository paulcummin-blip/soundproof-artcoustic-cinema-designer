/**
 * proposalPackAuthority.js
 * ------------------------
 * The page model behind the designed client specification pack.
 *
 * Everything here is read from authorities that already exist:
 *   - the frozen Engineering Snapshot on the proposal (room, screen, seating,
 *     system layout, product package, RP23 viewing),
 *   - the calculated Key Performance Highlights rows for the evidence cards.
 *
 * No value is calculated, rounded or invented here. The approved explainer copy
 * on the method and appendix pages is fixed text, held in this one place.
 *
 * Pure: no React, no fetching, no side effects.
 */

import { buildHighlightDisplayRows } from '../keyPerformanceHighlightsAuthority';

/** Unwrap an Engineering Authority { statement, confidence, source } value. */
export function statementValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value.statement ?? null;
  return value;
}

/** A date in UK format, DD/MM/YYYY. */
export function ukDate(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

/** Plain-language name for each parameter, for the appendix reference list. */
export const PARAMETER_NAMES = Object.freeze({
  2: 'Discrete channels',
  4: 'Screen consistency',
  5: 'Horizontal spacing',
  6: 'Surround level consistency',
  7: 'Front wide position',
  9: 'Overhead spacing',
  10: 'Overhead level consistency',
  12: 'Screen Dynamic Range',
  13: 'Non-screen Dynamic Range',
  14: 'LFE and subwoofer Dynamic Range',
  16: 'Screen timbre',
  17: 'Surround and overhead timbre',
  18: 'Bass extension',
  19: 'Bass response',
  20: 'Bass consistency',
});

/** The parameters each design structure section shows as evidence. */
export const STRUCTURE_PARAMETER_KEYS = Object.freeze({
  spatial_resolution: Object.freeze(['p2', 'p4', 'p5', 'p6', 'p7', 'p9', 'p10']),
  dynamic_range: Object.freeze(['p12', 'p13', 'p14']),
  timbre_matching: Object.freeze(['p16', 'p17', 'p18', 'p19', 'p20']),
});

/** How the design was reached. Approved explainer copy, held here once. */
export const METHOD_PAGE = Object.freeze({
  lead: 'Sound Proof models the room first and selects equipment second. The design is tested in the model before anything is specified.',
  blocks: Object.freeze([
    {
      title: 'Spatial Resolution',
      text: 'How evenly sound is presented across the seating area, and how well it moves between the screen, the sides and above. It is set by the number of speakers and where they are placed.',
    },
    {
      title: 'Dynamic Range',
      text: 'The headroom available above the listening level, so a demanding soundtrack keeps its impact without strain. It is set by the capability of the speakers and amplification in this room.',
    },
    {
      title: 'Timbre Matching',
      text: 'Whether voices and effects keep the same tonal character as they move around the room and above the seats. It is set by the speaker families used and how they are voiced together.',
    },
  ]),
  notes: Object.freeze([
    'RP22 separates performance into three structures: Spatial Resolution, Dynamic Range and Timbre Matching. Each structure is graded from Level 1 to Level 4.',
    'Level 4 is demanding and is not always practical in a real room. The aim is a conscious, credible design rather than chasing every parameter at any cost.',
    'Results are predicted from the room model and the published product data. Final performance is confirmed by in-room calibration.',
  ]),
});

/** Appendix: method notes, references and the prediction disclaimer. */
export const APPENDIX_PAGE = Object.freeze({
  title: 'Method and notes',
  notes: Object.freeze([
    {
      title: 'Assessment basis',
      text: 'Performance is assessed against CEDIA/CTA-RP22 for audio and RP23 for viewing geometry. RP22 grades each design structure from Level 1 to Level 4.',
    },
    {
      title: 'Predicted performance',
      text: 'Every result in this document is predicted from the room model and the published product data. Final performance is confirmed by in-room calibration.',
    },
    {
      title: 'Design Index',
      text: 'The Design Index is an internal design diagnostic used by the designer to compare options. It is not a client-facing performance result and is not reported here.',
    },
  ]),
  parameters_title: 'Parameters referenced in this document',
});

/** The parameter reference list shown in the appendix, in parameter order. */
export function parameterReferenceList() {
  return Object.keys(PARAMETER_NAMES)
    .map(Number)
    .sort((a, b) => a - b)
    .map((id) => ({ id, label: `P${id} ${PARAMETER_NAMES[id]}` }));
}

/**
 * The evidence cards for one design structure section.
 * Only that structure's own parameters appear, and only where the design has a
 * calculated result for them.
 */
export function buildEvidenceCards(rows, sectionType) {
  const keys = STRUCTURE_PARAMETER_KEYS[sectionType];
  if (!keys) return [];
  const byKey = new Map(buildHighlightDisplayRows(rows).map((row) => [row.key, row]));
  return keys.map((key) => byKey.get(key)).filter(Boolean);
}

/** The selected system in one line: the speaker families in the design. */
export function buildSystemHeadline(snapshot, limit = 4) {
  const roles = Array.isArray(snapshot?.system?.product_roles) ? snapshot.system.product_roles : [];
  const labels = [];
  for (const role of roles) {
    const label = role?.model_label || role?.model_key;
    if (label && !labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) return null;
  const shown = labels.slice(0, limit).join(' · ');
  return labels.length > limit ? `${shown} +${labels.length - limit}` : shown;
}

/** The at-a-glance summary cards: the page that orients the client. */
export function buildAtAGlanceCards({ snapshot, projectName, dealerName, projectReference, generatedDate }) {
  const room = snapshot?.room || {};
  const screen = room.screen || {};
  const seating = room.seating || {};
  const system = snapshot?.system || {};
  const configuration = system.configuration || {};
  const layout = system.channel_layout || {};
  const viewing = snapshot?.viewing || {};
  const version = snapshot?.version || {};
  const headline = buildSystemHeadline(snapshot);
  const seats = Number(seating.total_seats) || null;
  const rows = Number(seating.row_count) || null;

  const cards = [
    { label: 'Project', value: projectName || statementValue(snapshot?.project?.project_name) || null },
    { label: 'Client', value: statementValue(snapshot?.project?.client_name) || null },
    {
      label: 'Dealer',
      value: dealerName || statementValue(snapshot?.project?.dealer_company) || statementValue(snapshot?.dealer?.company_name) || 'Sound Proof',
    },
    {
      label: 'Room size',
      value: room.dimensions_text || null,
      hint: statementValue(room.classification) || null,
    },
    {
      label: 'Screen',
      value: screen.size_inches ? `${screen.size_inches}" ${screen.aspect_ratio || ''}`.trim() : null,
      hint: screen.viewable_width_inches ? `${screen.viewable_width_inches}" viewable width` : null,
    },
    {
      label: 'Seating',
      value: seats ? `${seats} seat${seats === 1 ? '' : 's'}${rows ? ` · ${rows} row${rows === 1 ? '' : 's'}` : ''}` : null,
      hint: viewing.available && viewing.project_floor ? `RP23 viewing ${viewing.project_floor}` : null,
    },
    {
      label: 'System layout',
      value: configuration.dolby_config || layout.configuration_text || null,
      hint: layout.total_discrete
        ? `${layout.total_discrete} discrete channels · ${layout.subwoofer_count || 0} subwoofer${layout.subwoofer_count === 1 ? '' : 's'}`
        : null,
    },
    {
      label: 'Recommended system',
      value: headline,
      hint: Array.isArray(snapshot?.products) && snapshot.products.length > 0
        ? `${snapshot.products.length} products specified`
        : null,
    },
    { label: 'Project reference', value: projectReference || null },
    {
      label: 'Design reference',
      value: version.name ? `${version.name}${version.number ? ` · V${version.number}` : ''}` : null,
      hint: snapshot?.identity?.generatedAt ? `Published ${ukDate(snapshot.identity.generatedAt)}` : null,
    },
    { label: 'Modelled against', value: 'CEDIA/CTA-RP22 and RP23' },
    { label: 'Prepared by', value: dealerName || 'Sound Proof', hint: ukDate(generatedDate) },
  ];

  // A card with no value is left out rather than printed empty.
  return cards.filter((card) => card.value);
}

/** The room and brief facts, and the product package rows. */
export function buildRoomBriefFacts(snapshot) {
  const room = snapshot?.room || {};
  const screen = room.screen || {};
  const seating = room.seating || {};
  const viewing = snapshot?.viewing || {};
  const treatment = room.acoustic_treatment || {};
  const system = snapshot?.system || {};

  const facts = [
    {
      label: 'Room',
      value: room.dimensions_text || null,
      hint: room.volume_m3 ? `${room.volume_m3} m³` : null,
    },
    {
      label: 'Room form',
      value: statementValue(room.classification) || null,
      hint: statementValue(room.ratio) || null,
    },
    {
      label: 'Screen',
      value: screen.size_inches
        ? `${screen.size_inches}" ${screen.aspect_ratio || ''}`.trim()
        : null,
      hint: screen.mount_mode ? `${screen.mount_mode === 'floating' ? 'floating' : 'baffle wall'} mount` : null,
    },
    {
      label: 'Seating',
      value: seating.total_seats
        ? `${seating.total_seats} seats · ${seating.row_count || 1} rows`
        : null,
      hint: seating.row_spacing_m ? `${seating.row_spacing_m}m row spacing` : null,
    },
    {
      label: 'Viewing',
      value: viewing.available ? viewing.summary : null,
      hint: viewing.primary_floor ? `Primary seats ${viewing.primary_floor}` : null,
    },
    {
      label: 'Screen wall',
      value: statementValue(room.screen_wall?.construction_type) || null,
      hint: statementValue(room.screen_wall?.detail) || null,
    },
    {
      label: 'Acoustic treatment',
      value: treatment.enabled ? treatment.interpretation : 'None specified',
      hint: treatment.enabled ? null : 'The room is designed to perform without added treatment.',
    },
    {
      label: 'Room constraint',
      value: statementValue(room.acoustic_implication) || null,
      wide: true,
    },
    {
      label: 'System',
      value: system.configuration?.text || null,
      wide: true,
    },
  ].filter((fact) => fact.value);

  const products = (Array.isArray(system.product_roles) ? system.product_roles : []).map((role) => ({
    role: role.role_description || role.role || '',
    model: role.model_label || role.model_key || '',
  }));

  return { facts, products };
}

export default buildAtAGlanceCards;