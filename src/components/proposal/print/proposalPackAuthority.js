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
 * A projection screen is stated by its viewable image width (170" 2.35:1
 * viewable image) with the overall screen assembly given separately (185"
 * overall screen assembly). A television is stated by its nominal size, which is
 * how a television is bought, and needs no second figure. Both figures are read
 * from the frozen snapshot: nothing is converted here.
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
      value: aspect ? `${viewable}" ${aspect} viewable image` : `${viewable}" viewable image`,
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

/** True when a product role is a subwoofer, which has its own card. */
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

/** The short form of the specified treatment: "8 Abfuser panels". */
export function treatmentGlanceStatement(treatment = {}) {
  const quantity = Number(treatment?.quantity) || 0;
  if (treatment?.enabled !== true || quantity <= 0) return null;
  return `${quantity} Abfuser panel${quantity === 1 ? '' : 's'}`;
}

/**
 * The viewing geometry as one compact fact: the floor the seating achieves and
 * the horizontal angle range across the seats, in whole degrees.
 *
 *   value: "L3 · 44° to 63°"
 *
 * Built from the viewing authority's own per-seat angles. Nothing is graded or
 * recalculated here.
 */
export function viewingGlanceStatement(viewing = {}) {
  const angles = (Array.isArray(viewing?.per_seat) ? viewing.per_seat : [])
    .map((seat) => Number(seat?.horizontal_angle_deg))
    .filter(Number.isFinite);
  if (angles.length === 0) return { value: null, hint: null };

  const minimum = Math.round(Math.min(...angles));
  const maximum = Math.round(Math.max(...angles));
  const range = minimum === maximum ? `${minimum}°` : `${minimum}° to ${maximum}°`;
  const floor = viewing?.primary_floor || viewing?.project_floor || null;
  return { value: floor ? `${floor} · ${range}` : range, hint: null };
}

/** The compact package label for each group of channel roles. */
const PACKAGE_GROUP_LABELS = Object.freeze({
  lcr: 'LCR',
  centre_soundbar: 'Centre',
  surround: 'Surrounds / wides',
  rear_surround: 'Surrounds / wides',
  front_wide: 'Surrounds / wides',
  overhead: 'Overheads',
});

const PACKAGE_GROUP_ORDER = Object.freeze(['LCR', 'Centre', 'Surrounds / wides', 'Overheads']);

/**
 * The selected package, one row per group of channel roles: what each group is,
 * and the model chosen for it. The subwoofers are stated once, as the count and
 * the model in the design.
 */
export function buildPackageRows(snapshot) {
  const system = snapshot?.system || {};
  const groups = new Map();

  for (const role of Array.isArray(system.product_roles) ? system.product_roles : []) {
    if (isSubwooferRole(role)) continue;
    const key = String(role?.role || '').toLowerCase();
    const label = PACKAGE_GROUP_LABELS[key] || role?.role_description || role?.role || null;
    const model = role?.model_label || role?.model_key || null;
    if (!label || !model) continue;
    const models = groups.get(label) || [];
    if (!models.includes(model)) models.push(model);
    groups.set(label, models);
  }

  const rank = (label) => {
    const index = PACKAGE_GROUP_ORDER.indexOf(label);
    return index === -1 ? PACKAGE_GROUP_ORDER.length : index;
  };

  const rows = [...groups.keys()]
    .sort((a, b) => rank(a) - rank(b))
    .map((label) => ({ role: label, model: groups.get(label).join(' · ') }));

  const subwoofers = subwooferGlanceStatement(system);
  if (subwoofers.value) rows.push({ role: 'Subwoofers', model: subwoofers.value });
  return rows;
}

/**
 * The one-line design brief: the room's own constraint, as the engineering
 * authority states it. Omitted when the snapshot states none, so the page never
 * carries commentary of its own.
 */
export function designBriefNote(snapshot) {
  const text = statementValue(snapshot?.room?.acoustic_implication);
  if (!text) return null;
  const trimmed = String(text).trim();
  return trimmed || null;
}

/**
 * The at-a-glance page model: the project, the room and screen, the system and
 * the selected package, in the order the page reads. This is the whole of the
 * page that orients the client: the room and the brief are stated here once and
 * nowhere else.
 *
 * Every value is a fact read from the frozen snapshot or the proposal's own
 * context. No card carries a sentence, a product count or a publication date.
 */
export function buildAtAGlance({ snapshot, projectName, dealerName, projectReference, generatedDate }) {
  const room = snapshot?.room || {};
  const screen = room.screen || {};
  const seating = room.seating || {};
  const system = snapshot?.system || {};
  const configuration = system.configuration || {};
  const layout = system.channel_layout || {};
  const version = snapshot?.version || {};
  const size = roomSizeStatement(room);
  const screenCard = screenStatement(screen);
  const viewing = viewingGlanceStatement(snapshot?.viewing);
  const seats = Number(seating.total_seats) || null;
  const rows = Number(seating.row_count) || null;
  const channels = Number(layout.total_discrete) || null;

  const projectCards = [
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
  ];

  const roomCards = [
    { label: 'Room size', value: size.value, hint: size.hint },
    // The screen states both figures the design sets: the viewable image the
    // screen is bought by, and the overall assembly it needs. It spans two
    // columns so neither line has to wrap.
    { label: 'Screen', value: screenCard.value, hint: screenCard.hint, span: 2 },
    {
      label: 'Seating',
      value: seats ? `${seats} seat${seats === 1 ? '' : 's'}` : null,
      hint: rows ? `${rows} row${rows === 1 ? '' : 's'}` : null,
    },
    { label: 'Viewing geometry', value: viewing.value, hint: viewing.hint },
    {
      label: 'Acoustic treatment',
      value: treatmentGlanceStatement(room.acoustic_treatment),
      hint: null,
    },
  ];

  const systemCards = [
    {
      label: 'System layout',
      value: configuration.dolby_config || null,
      hint: channels ? `${channels} discrete channels` : null,
    },
  ];

  // A card with no value is left out rather than printed empty.
  return {
    projectCards: projectCards.filter((card) => card.value),
    roomCards: roomCards.filter((card) => card.value),
    systemCards: systemCards.filter((card) => card.value),
    packageRows: buildPackageRows(snapshot),
    briefNote: designBriefNote(snapshot),
  };
}

export default buildAtAGlance;