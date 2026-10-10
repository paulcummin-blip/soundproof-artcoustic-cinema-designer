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
import { resolveViewingRows } from './snapshotViewingRows';
import { rp23DisplayAngleDeg } from '@/components/utils/viewingAngleUtils';

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

/**
 * The seating-style page. Fixed, approved copy, held here with the other page
 * copy. It states the seating style for what it is — a comfort and interior
 * choice — and never as a performance result.
 */
export const SEATING_STYLE_PAGE = Object.freeze({
  lead: 'Seating style is your own choice. Both of these alternatives work with the seating layout this design specifies.',
  notes: Object.freeze([
    {
      title: 'A personal choice',
      text: 'The style of seating is a comfort and interior decision rather than a technical one. Both alternatives are compatible with the seating layout described in this document.',
    },
    {
      title: 'The layout stays the same',
      text: 'The seating style itself does not change the system performance. What the engineering depends on is where the seating positions are, and that is what this design specifies.',
    },
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
 * A projection screen is stated by its viewable image width — the figure the
 * screen is designed and bought by:
 *
 *   "170" 2.35:1 viewable image"
 *
 * The overall screen assembly the screen needs behind it is manufacturing detail,
 * not a client-facing fact, so no client surface carries it: it lives in the
 * technical and admin data. A television is stated by its nominal size, which is
 * how a television is bought.
 *
 * Read from the frozen snapshot: nothing is converted here.
 *
 * @returns {{ value: string|null, hint: null }}
 */
export function screenStatement(screen = {}) {
  const viewable = Number(screen.viewable_width_inches) || null;
  const stated = Number(screen.size_inches) || null;
  const aspect = screen.aspect_ratio ? String(screen.aspect_ratio) : null;

  if (screen.television === true && stated) {
    return { value: aspect ? `${stated}" ${aspect} screen` : `${stated}" screen`, hint: null };
  }
  // Where the snapshot carries no viewable width, the stated size stands on its
  // own rather than being labelled as something it may not be.
  if (viewable) {
    return {
      value: aspect ? `${viewable}" ${aspect} viewable image` : `${viewable}" viewable image`,
      hint: null,
    };
  }
  return {
    value: stated ? (aspect ? `${stated}" ${aspect} screen` : `${stated}" screen`) : null,
    hint: null,
  };
}

/**
 * The evidence cards for one design structure section.
 * Only that structure's own parameters appear, and only where the design has a
 * calculated result for them.
 *
 * The cards read the section's own parameters in full: the eight-row cap belongs
 * to the one-page evidence table, not to a page that carries one card per
 * parameter.
 */
export function buildEvidenceCards(rows, sectionType) {
  const keys = STRUCTURE_PARAMETER_KEYS[sectionType];
  if (!keys) return [];
  // A section that carries no stored calculated rows (a proposal generated
  // before the rows were stored, or one whose section metadata is absent) has no
  // evidence cards. That is a quiet page, never a failure: the page still prints
  // its own prose, and the pack must not throw on it.
  const list = Array.isArray(rows) ? rows : [];
  const byKey = new Map(
    buildHighlightDisplayRows(list, { limit: list.length || keys.length }).map((row) => [row.key, row])
  );
  return keys.map((key) => byKey.get(key)).filter(Boolean);
}

/**
 * The room size as the at-a-glance card states it: the three dimensions in one
 * clean line.
 *
 *   value: "7.29 × 5.18 × 2.8 m"
 *
 * The axis order is not restated on the card. The dimensions read length × width
 * × height in that order, which is how every other surface in the app states
 * them, so a second line naming the axes only takes space. Read from the
 * snapshot's own numbers where it carries them, otherwise from the dimension text
 * the snapshot already states. Nothing is measured or converted.
 */
export function roomSizeStatement(room = {}) {
  const dimensions = room.dimensions || {};
  const length = Number(dimensions.length_m) || null;
  const width = Number(dimensions.width_m) || null;
  const height = Number(dimensions.height_m) || null;

  if (length && width && height) {
    return { value: `${length} × ${width} × ${height} m`, hint: null };
  }

  const text = room.dimensions_text;
  if (!text || text === 'Not specified') return { value: null, hint: null };
  const cleaned = String(text)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*m\b/g, ' ')
    .replace(/\s*×\s*/g, ' × ')
    .replace(/\s+/g, ' ')
    .trim();
  return { value: cleaned ? `${cleaned} m` : null, hint: null };
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
 * The viewing geometry as the pack states it: one line per seating row, because
 * RP23 is a per-row result. A single level for the whole room would contradict
 * the report whenever the rows differ, so no level is ever stated for the room.
 *
 *   value: "Row 1 · 63° · RP23 L4
 *           Row 2 · 45° · RP23 L3"
 *
 * Read from the snapshot's own seats and its published viewing results, one
 * representative seat per row. Whole degrees. Nothing is averaged.
 */
export function viewingGlanceStatement(snapshot) {
  const rows = resolveViewingRows(snapshot);
  if (rows.length > 0) {
    return { value: rows.map((row) => row.line).join('\n'), hint: null };
  }

  // No per-row authority behind the snapshot: state the angle spread alone. A
  // level is withheld rather than assigned to the room as a whole.
  const angles = (Array.isArray(snapshot?.viewing?.per_seat) ? snapshot.viewing.per_seat : [])
    .map((seat) => Number(seat?.horizontal_angle_deg))
    .filter(Number.isFinite);
  if (angles.length === 0) return { value: null, hint: null };

  // Whole degrees as the app displays them, rather than plain rounding.
  const displayed = angles.map((angle) => rp23DisplayAngleDeg(angle) ?? Math.round(angle));
  const minimum = Math.min(...displayed);
  const maximum = Math.max(...displayed);
  return { value: minimum === maximum ? `${minimum}°` : `${minimum}° to ${maximum}°`, hint: null };
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
 * The at-a-glance page model: the project, the room and screen, and the system
 * with the selected package, in the order the page reads.
 *
 * Every value is a fact read from the frozen snapshot or the proposal's own
 * context. A card states one fact and nothing else: no second line of
 * explanation, no count that repeats another card, and no restatement of the
 * dealer, who is named on the cover. The room's modelled acoustic implication is
 * not reprinted here either — it is a modelled classification, not a brief the
 * designer wrote.
 */
export function buildAtAGlance({ snapshot, projectName, projectReference, generatedDate }) {
  const room = snapshot?.room || {};
  const screen = room.screen || {};
  const seating = room.seating || {};
  const system = snapshot?.system || {};
  const configuration = system.configuration || {};
  const version = snapshot?.version || {};
  const size = roomSizeStatement(room);
  const screenCard = screenStatement(screen);
  const viewing = viewingGlanceStatement(snapshot);
  const seats = Number(seating.total_seats) || null;

  const projectCards = [
    { label: 'Project', value: projectName || statementValue(snapshot?.project?.project_name) || null },
    { label: 'Client', value: statementValue(snapshot?.project?.client_name) || null },
    { label: 'Project reference', value: projectReference || null },
    {
      // The saved version name IS the identity: stated exactly, with no version
      // slot marker appended, so "Level 4 version" is never written
      // "Level 4 version · V4". No saved name leaves the card out.
      label: 'Design version',
      value: version.name || null,
    },
    { label: 'Prepared date', value: ukDate(generatedDate) },
  ];

  const roomCards = [
    { label: 'Room size', value: size.value },
    { label: 'Screen', value: screenCard.value },
    { label: 'Seating', value: seats ? `${seats} seat${seats === 1 ? '' : 's'}` : null },
    // One line per row, each with its own RP23 level: the row count is stated
    // here rather than on the seating card.
    { label: 'Viewing geometry', value: viewing.value },
    { label: 'Acoustic treatment', value: treatmentGlanceStatement(room.acoustic_treatment) },
  ];

  const systemCards = [
    { label: 'System layout', value: configuration.dolby_config || null },
  ];

  // A card with no value is left out rather than printed empty.
  return {
    projectCards: projectCards.filter((card) => card.value),
    roomCards: roomCards.filter((card) => card.value),
    systemCards: systemCards.filter((card) => card.value),
    packageRows: buildPackageRows(snapshot),
  };
}

export default buildAtAGlance;