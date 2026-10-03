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
 * The screen as the client-facing statement, so no page can state one figure
 * while another implies a different one.
 *
 * A projection screen is stated by its viewable image width (170" viewable
 * 2.35:1 image) with the overall screen assembly given separately (185" overall
 * screen assembly). A television is stated by its nominal size, which is how a
 * television is bought, and needs no second figure. Both figures are read from
 * the frozen snapshot: nothing is converted here.
 *
 * @returns {{ value: string|null, hint: string|null }}
 */
export function screenStatement(screen = {}) {
  const viewable = Number(screen.viewable_width_inches) || null;
  const diagonal = Number(screen.diagonal_inches) || null;
  const stated = Number(screen.size_inches) || null;
  const aspect = screen.aspect_ratio ? String(screen.aspect_ratio) : null;

  if (screen.television === true && stated) {
    return { value: aspect ? `${stated}" ${aspect} screen` : `${stated}" screen`, hint: null };
  }

  // The overall screen assembly is the derived diagonal where the snapshot
  // carries one; where it does not, the stated size is the assembly whenever it
  // differs from the viewable width. That is what a snapshot written before the
  // diagonal was recorded holds, so an older saved report reads the same way.
  const assembly = diagonal || (stated && viewable && stated !== viewable ? stated : null);

  // The viewable image width is the figure a projection screen is designed and
  // bought by. Where the snapshot carries no viewable width, the stated size
  // stands on its own rather than being labelled as something it may not be.
  if (viewable) {
    return {
      value: aspect ? `${viewable}" viewable ${aspect} image` : `${viewable}" viewable image`,
      hint: assembly && assembly !== viewable ? `${assembly}" overall screen assembly` : null,
    };
  }
  return {
    value: stated ? (aspect ? `${stated}" ${aspect} screen` : `${stated}" screen`) : null,
    hint: assembly && stated && assembly !== stated ? `${assembly}" overall screen assembly` : null,
  };
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

/**
 * The room size as the at-a-glance card states it: the three dimensions in one
 * clean line, with the axis order named once underneath.
 *
 *   value: "7.3 × 5.2 × 2.8 m"   hint: "L × W × H"
 *
 * Read from the snapshot's own numbers where it carries them, otherwise from the
 * dimension text the snapshot already states. Nothing is measured or converted.
 */
export function roomSizeStatement(room = {}) {
  const dimensions = room.dimensions || {};
  const length = Number(dimensions.length_m) || null;
  const width = Number(dimensions.width_m) || null;
  const height = Number(dimensions.height_m) || null;

  if (length && width && height) {
    return { value: `${length} × ${width} × ${height} m`, hint: 'L × W × H' };
  }

  const text = room.dimensions_text;
  if (!text || text === 'Not specified') return { value: null, hint: null };
  const cleaned = String(text)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*m\b/g, ' ')
    .replace(/\s*×\s*/g, ' × ')
    .replace(/\s+/g, ' ')
    .trim();
  return { value: cleaned ? `${cleaned} m` : null, hint: 'L × W × H' };
}

/** True when a product role is a subwoofer, which is stated on its own row. */
function isSubwooferRole(role) {
  const key = String(role?.role || '').toLowerCase();
  const description = String(role?.role_description || '').toLowerCase();
  const category = String(role?.category || '').toLowerCase();
  return key === 'subwoofer' || description.includes('subwoofer') || category.includes('subwoofer');
}

/** The subwoofers as one clean line: "2 × SUB4-12", with the models when mixed. */
export function subwooferGlanceStatement(system = {}) {
  const strategy = system.subwoofer_strategy || {};
  const layout = system.channel_layout || {};
  const count = Number(strategy.count) || Number(layout.subwoofer_count) || 0;
  if (!count) return { value: null, hint: null };

  // The subwoofer model is stated the way a subwoofer is labelled everywhere in
  // the app (SUB4-12), whether it arrives as a product role or as a stored key.
  const labels = [];
  for (const role of Array.isArray(system.product_roles) ? system.product_roles : []) {
    if (!isSubwooferRole(role)) continue;
    const label = role?.model_label || role?.model_key;
    const stated = label ? String(label).toUpperCase() : null;
    if (stated && !labels.includes(stated)) labels.push(stated);
  }
  for (const model of Array.isArray(strategy.models) ? strategy.models : []) {
    const stated = model ? String(model).toUpperCase() : null;
    if (stated && !labels.includes(stated)) labels.push(stated);
  }

  if (labels.length === 1) return { value: `${count} × ${labels[0]}`, hint: null };
  if (labels.length > 1) return { value: `${count} subwoofers`, hint: labels.join(' · ') };
  return { value: `${count} subwoofer${count === 1 ? '' : 's'}`, hint: null };
}

/**
 * The viewing geometry as the at-a-glance card states it: the RP23 level the
 * design reaches and the horizontal viewing angle the seating actually covers.
 *
 *   value: "L3 · 44° to 63°"   hint: "Horizontal viewing angle"
 *
 * Read from the published per-seat viewing results the snapshot already carries.
 * Nothing is measured, converted or re-graded here, and the angles are stated as
 * whole degrees.
 */
export function viewingGlanceStatement(viewing = {}) {
  const angles = (Array.isArray(viewing.per_seat) ? viewing.per_seat : [])
    .map((seat) => Number(seat?.horizontal_angle_deg))
    .filter((angle) => Number.isFinite(angle));
  if (angles.length === 0) return { value: null, hint: null };

  const minimum = Math.round(Math.min(...angles));
  const maximum = Math.round(Math.max(...angles));
  const range = minimum === maximum ? `${minimum}°` : `${minimum}° to ${maximum}°`;
  const level = viewing.project_floor ? String(viewing.project_floor) : null;

  return {
    value: level ? `${level} · ${range}` : range,
    hint: 'Horizontal viewing angle',
  };
}

/**
 * The at-a-glance cards: the essential project facts, the room and screen the
 * design answers, and the system that has been specified.
 *
 * Each card is a label and its value, with a second line only where it states
 * the same fact more precisely (the axis order, the screen terminology, the row
 * count, the viewing terminology, the discrete channel count). Nothing here
 * comments on the design, and no card carries a sentence.
 */
export function buildAtAGlanceCards({ snapshot, projectName, dealerName, projectReference, generatedDate }) {
  const room = snapshot?.room || {};
  const screen = room.screen || {};
  const seating = room.seating || {};
  const treatment = room.acoustic_treatment || {};
  const system = snapshot?.system || {};
  const configuration = system.configuration || {};
  const version = snapshot?.version || {};
  const size = roomSizeStatement(room);
  const screenCard = screenStatement(screen);
  const viewing = viewingGlanceStatement(snapshot?.viewing || {});
  const seats = Number(seating.total_seats) || null;
  const rows = Number(seating.row_count) || null;
  const discreteChannels = Number(configuration.total_discrete_channels)
    || Number(system.channel_layout?.total_discrete)
    || null;
  const treatmentQuantity = Number(treatment.quantity) || 0;
  const treatmentProduct = String(treatment.product || 'Abfuser').split(' ').pop();

  const cards = [
    { label: 'Project', value: projectName || statementValue(snapshot?.project?.project_name) || null },
    { label: 'Client', value: statementValue(snapshot?.project?.client_name) || null },
    {
      label: 'Dealer',
      value: dealerName || statementValue(snapshot?.project?.dealer_company) || statementValue(snapshot?.dealer?.company_name) || 'Sound Proof',
    },
    { label: 'Project reference', value: projectReference || null },
    {
      label: 'Design version',
      value: version.name ? `${version.name}${version.number ? ` · V${version.number}` : ''}` : null,
    },
    { label: 'Date', value: ukDate(generatedDate) },
    { label: 'Room size', value: size.value, hint: size.hint },
    { label: 'Screen', value: screenCard.value, hint: screenCard.hint },
    {
      label: 'Seating',
      value: seats ? `${seats} seat${seats === 1 ? '' : 's'}` : null,
      hint: rows ? `${rows} row${rows === 1 ? '' : 's'}` : null,
    },
    { label: 'Viewing geometry', value: viewing.value, hint: viewing.hint },
    {
      label: 'System layout',
      value: configuration.dolby_config || null,
      hint: discreteChannels ? `${discreteChannels} discrete channels` : null,
    },
    {
      // Stated only where the design specifies treatment, and by quantity alone:
      // the explanation belongs to the acoustic treatment page, not to a card.
      label: 'Acoustic treatment',
      value: treatment.enabled && treatmentQuantity > 0
        ? `${treatmentQuantity} ${treatmentProduct} panel${treatmentQuantity === 1 ? '' : 's'}`
        : null,
    },
  ];

  // A card with no value is left out rather than printed empty.
  return cards.filter((card) => card.value);
}

/** The channel groups the package is stated by, in design order. */
const PACKAGE_BUCKETS = Object.freeze([
  { key: 'lcr', label: 'LCR', roles: Object.freeze(['lcr', 'centre_soundbar']) },
  { key: 'surround', label: 'Surrounds / wides', roles: Object.freeze(['surround', 'rear_surround', 'front_wide']) },
  { key: 'overhead', label: 'Overheads', roles: Object.freeze(['overhead']) },
]);

/**
 * The channel group a product role belongs to, from its role key where the
 * snapshot carries one and from its description otherwise, so a snapshot written
 * before the role keys were stored still groups into the same package rows.
 */
const ROLE_GROUP_KEYWORDS = Object.freeze([
  { key: 'lcr', words: Object.freeze(['left/centre/right', 'centre channel']) },
  { key: 'overhead', words: Object.freeze(['overhead']) },
  { key: 'surround', words: Object.freeze(['surround', 'front wide']) },
]);

function roleGroupKey(role) {
  const key = String(role?.role || '').toLowerCase();
  if (key) return key;
  const description = String(role?.role_description || '').toLowerCase();
  for (const group of ROLE_GROUP_KEYWORDS) {
    if (group.words.some((word) => description.includes(word))) return group.key;
  }
  return '';
}

/**
 * The selected package as a compact table: each channel group and the model
 * chosen for it, with the subwoofer count on its own row. Read only from the
 * frozen snapshot's product roles and its subwoofer strategy, so the package is
 * stated once and never re-listed per channel.
 */
export function buildSelectedPackageRows(snapshot) {
  const system = snapshot?.system || {};
  const roles = Array.isArray(system.product_roles) ? system.product_roles : [];
  const grouped = new Set();
  const rows = [];

  for (const bucket of PACKAGE_BUCKETS) {
    const models = [];
    for (const role of roles) {
      if (isSubwooferRole(role)) continue;
      if (!bucket.roles.includes(roleGroupKey(role))) continue;
      grouped.add(role);
      const label = role?.model_label || role?.model_key;
      if (label && !models.includes(label)) models.push(label);
    }
    if (models.length > 0) rows.push({ role: bucket.label, model: models.join(' + ') });
  }

  // A role no channel group covers still names its own product.
  for (const role of roles) {
    if (grouped.has(role) || isSubwooferRole(role)) continue;
    const model = role?.model_label || role?.model_key;
    if (model) rows.push({ role: role?.role_description || role?.role || '', model });
  }

  const subwoofers = subwooferGlanceStatement(system);
  if (subwoofers.value) rows.push({ role: 'Subwoofers', model: subwoofers.value });

  return rows.filter((row) => row.role && row.model);
}

/**
 * The design brief note: one or two short lines, and only where the design
 * itself has something to say. The first line is the design question the room
 * and the seating set, and the second is the room constraint the engineering
 * summary states. Nothing else is written here, and no number is invented.
 */
export function buildDesignBriefNote(snapshot) {
  const room = snapshot?.room || {};
  const screen = room.screen || {};
  const rows = Number(room.seating?.row_count) || 0;
  const aspect = screen.aspect_ratio ? String(screen.aspect_ratio) : null;
  const viewable = Number(screen.viewable_width_inches) || 0;
  const wideScreen = (aspect && aspect.startsWith('2.3')) || viewable >= 150;

  const lines = [];
  if (rows >= 2) {
    lines.push(aspect && wideScreen
      ? `Two rows and a ${aspect} screen make viewing geometry and seat-to-seat consistency the key design questions.`
      : 'Two rows make seat-to-seat consistency across the seating area a key design question.');
  } else if (rows === 1 && aspect && wideScreen) {
    lines.push(`A single row and a ${aspect} screen put viewing distance at the centre of the design.`);
  }

  const constraint = statementValue(room.acoustic_implication);
  if (constraint) lines.push(constraint);

  return lines.slice(0, 2);
}

export default buildAtAGlanceCards;