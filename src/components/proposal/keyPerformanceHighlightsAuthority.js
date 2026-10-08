/**
 * keyPerformanceHighlightsAuthority.js
 * ------------------------------------
 * The presentation authority for the Key Performance Highlights table.
 *
 * The Result values are never calculated here: they are read from the
 * calculated rows stored on the section (selectHighlightRows in
 * base44/shared/engineeringSnapshotEvidence.js). This module does three things,
 * all presentation:
 *
 *   1. names each row's Performance area and its source Parameter, so every row
 *      says which RP22 / RP23 parameter the result came from;
 *   2. rounds the calculated value to the Sound Proof display policy (whole
 *      degrees, whole dB, whole Hz);
 *   3. guarantees the "What the room gains" cell is populated, using the
 *      generated sentence when it is a usable one and the approved line for that
 *      parameter when it is not.
 *
 * The Design Index is never a row here (see designIndexRowAuthority).
 *
 * Pure: no React, no fetching, no side effects.
 */

import { DISPLAY_UNIT, formatResultText } from './displayValueFormat';
import { excludeClientFacingRows } from './designIndexRowAuthority';

/** The performance areas a client-facing row may belong to, in table order. */
export const HIGHLIGHT_AREA = Object.freeze({
  VIEWING: 'Viewing Geometry',
  SPATIAL: 'Spatial Resolution',
  DYNAMIC: 'Dynamic Range',
  TIMBRE: 'Timbre Matching',
  BASS: 'Bass Performance',
});

/** Where to keep a row that does not map to a known parameter. */
const UNMAPPED_AREA = HIGHLIGHT_AREA.SPATIAL;

/**
 * How each row reads in the table: the performance area it belongs to, the
 * parameter it comes from, the unit its value is stated in, and the approved
 * sentence for what that result gives the room.
 */
const ROW_PRESENTATION = Object.freeze({
  screen_size: {
    area: HIGHLIGHT_AREA.VIEWING,
    parameter: 'Screen size',
    unit: DISPLAY_UNIT.NONE,
    gain: 'Sets the screen scale that the seating layout and viewing distance were designed around.',
  },
  rp23_viewing: {
    area: HIGHLIGHT_AREA.VIEWING,
    parameter: 'RP23 viewing',
    unit: DISPLAY_UNIT.DEGREES,
    gain: 'Shows how the screen scale works across both seating rows.',
  },
  system_layout: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'Channel layout',
    unit: DISPLAY_UNIT.NONE,
    gain: 'More speaker positions around and above the seats.',
  },
  speakers: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'Speaker package',
    unit: DISPLAY_UNIT.NONE,
    gain: 'The speakers specified for each position, which is what the spatial results are delivered with.',
  },
  subwoofers: {
    area: HIGHLIGHT_AREA.BASS,
    parameter: 'Subwoofer package',
    unit: DISPLAY_UNIT.NONE,
    gain: 'The subwoofers specified, which set the low-frequency output the room gets.',
  },
  amplification: {
    area: HIGHLIGHT_AREA.DYNAMIC,
    parameter: 'Amplification',
    unit: DISPLAY_UNIT.NONE,
    gain: 'The power behind the speakers, which is what the dynamic range results are delivered with.',
  },
  seating: {
    area: HIGHLIGHT_AREA.VIEWING,
    parameter: 'Seating',
    unit: DISPLAY_UNIT.NONE,
    gain: 'The seats the design was assessed across.',
  },
  p2: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'P2 discrete channels',
    unit: DISPLAY_UNIT.NONE,
    gain: 'More speaker positions around and above the seats.',
  },
  p3: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'P3 screen speaker placement',
    unit: DISPLAY_UNIT.DEGREES,
    gain: 'Keeps the screen speakers positioned so dialogue stays anchored to the picture.',
  },
  p4: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'P4 screen consistency',
    unit: DISPLAY_UNIT.DB,
    gain: 'Keeps dialogue and screen effects stable across the seating area.',
  },
  p5: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'P5 horizontal spacing',
    unit: DISPLAY_UNIT.DEGREES,
    gain: 'Even spacing between the listener-level speakers gives smoother movement around the room.',
  },
  p6: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'P6 surround level consistency',
    unit: DISPLAY_UNIT.DB,
    gain: 'Keeps the surround speakers level-matched, so effects do not jump in loudness as they move around the room.',
  },
  p7: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'P7 front wide position',
    unit: DISPLAY_UNIT.DEGREES,
    gain: 'Fills the gap between the screen and the side speakers, so the front stage runs without a break.',
  },
  p9: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'P9 overhead spacing',
    unit: DISPLAY_UNIT.DEGREES,
    gain: 'Even overhead spacing keeps sound above the seats consistent from row to row.',
  },
  p10: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'P10 overhead level consistency',
    unit: DISPLAY_UNIT.DB,
    gain: 'Keeps the overhead channels matched in level, so sound above the room stays even across the seats.',
  },
  p11: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'P11 surround speaker placement',
    unit: DISPLAY_UNIT.DEGREES,
    gain: 'Positions the surround speakers where the seating can hear them evenly, front to back.',
  },
  p12: {
    area: HIGHLIGHT_AREA.DYNAMIC,
    parameter: 'P12 screen Dynamic Range',
    unit: DISPLAY_UNIT.DB,
    gain: 'Strong front-stage headroom for demanding soundtracks.',
  },
  p13: {
    area: HIGHLIGHT_AREA.DYNAMIC,
    parameter: 'P13 non-screen Dynamic Range',
    unit: DISPLAY_UNIT.DB,
    gain: 'Headroom across the surround channels, so effects keep their impact without strain.',
  },
  p14: {
    area: HIGHLIGHT_AREA.DYNAMIC,
    parameter: 'P14 LFE/subwoofer Dynamic Range',
    unit: DISPLAY_UNIT.DB,
    gain: 'Low-frequency output supports the scale of the room.',
  },
  p16: {
    area: HIGHLIGHT_AREA.TIMBRE,
    parameter: 'P16 screen timbre',
    unit: DISPLAY_UNIT.DB,
    gain: 'Voices and effects keep a consistent tonal character across the screen channels.',
  },
  p17: {
    area: HIGHLIGHT_AREA.TIMBRE,
    parameter: 'P17 surround/overhead timbre',
    unit: DISPLAY_UNIT.DB,
    gain: 'Surround and overhead effects keep the same tonal character as they move around and above the room.',
  },
  p18: {
    area: HIGHLIGHT_AREA.BASS,
    parameter: 'P18 bass extension',
    unit: DISPLAY_UNIT.HZ,
    gain: 'Bass reaches low enough to support large-scale film effects.',
  },
  p19: {
    area: HIGHLIGHT_AREA.BASS,
    parameter: 'P19 bass response',
    unit: DISPLAY_UNIT.DB,
    // P19 is the response AT the reference seating position, so its gain line
    // never claims evenness across the seats: seat-to-seat balance is P20.
    gain: 'Bass balance at the reference seating position, where the response is set against the target.',
  },
  p20: {
    area: HIGHLIGHT_AREA.BASS,
    parameter: 'P20 bass consistency',
    unit: DISPLAY_UNIT.DB,
    gain: 'Consistent bass from seat to seat, so the low-frequency balance holds more evenly across the listening positions.',
  },
});

/** Used only for a row that carries no recognised parameter source. */
const FALLBACK_GAIN = 'Part of how this system performs as a whole in the room.';

/**
 * The most rows the printed table carries. The System Design Summary table is
 * one indivisible printed block — its heading, its header row and every row sit
 * on a single page — so it carries the eight most useful results and no more.
 * A concise table that holds together reads as designed; a longer one that
 * breaks across two pages reads as an accident.
 */
export const HIGHLIGHT_DISPLAY_LIMIT = 8;

/**
 * The order rows are chosen in when a design has more results than the table
 * carries. The eight places go to the results that carry the design: the
 * viewing geometry, then the spatial results, then headroom, bass and tone.
 *
 * The screen size row and the channel layout row are deliberately not exempt:
 * the screen scale is already stated on the at-a-glance page, and P2 already
 * states how many physical speaker positions the room is built with. A row that
 * is not listed is chosen last.
 */
export const HIGHLIGHT_PRINT_PRIORITY = Object.freeze([
  'rp23_viewing',
  'p2',
  'p4',
  'p5',
  'p12',
  'p14',
  'p18',
  'p16',
  'p7',
  'p9',
  'p13',
  'p17',
  'p19',
  'p20',
  'p3',
  'p6',
  'p10',
  'p11',
  'screen_size',
  'system_layout',
]);

/**
 * The rows that are never the ones a trimmed table drops. Only the viewing
 * result qualifies: it is the client's own seat geometry, stated once in the
 * table and nowhere else. Every other row, including the screen size and the
 * channel layout, gives up its place to a more useful result when the eight
 * places are filled.
 */
export const HIGHLIGHT_ROOM_FACT_KEYS = Object.freeze([
  'rp23_viewing',
]);

/** The order the performance areas are read in, top to bottom. */
const AREA_ORDER = Object.freeze([
  HIGHLIGHT_AREA.VIEWING,
  HIGHLIGHT_AREA.SPATIAL,
  HIGHLIGHT_AREA.DYNAMIC,
  HIGHLIGHT_AREA.TIMBRE,
  HIGHLIGHT_AREA.BASS,
]);

/** Where a row sits in the print priority order. */
function printRank(key) {
  const index = HIGHLIGHT_PRINT_PRIORITY.indexOf(String(key || '').trim());
  return index === -1 ? HIGHLIGHT_PRINT_PRIORITY.length : index;
}

/** Where a row's performance area sits in the reading order. */
function areaRank(area) {
  const index = AREA_ORDER.indexOf(area);
  return index === -1 ? AREA_ORDER.length : index;
}

/**
 * The rows the table prints, trimmed to what fits one page.
 *
 * Every performance area the design was assessed in keeps its strongest row, so
 * a trimmed table still covers each area rather than only the first few results;
 * the remaining places go to the highest-priority results. The stored rows are
 * never modified, and a table that already fits is returned unchanged.
 */
export function selectTableRows(rows = [], limit = HIGHLIGHT_DISPLAY_LIMIT) {
  const ranked = rows.slice().sort((a, b) => printRank(a.key) - printRank(b.key));
  if (ranked.length <= limit) return ranked;

  const chosen = [];
  const taken = new Set();
  const take = (row) => {
    if (!row || taken.has(row.key)) return;
    taken.add(row.key);
    chosen.push(row);
  };

  // The room and system facts are carried whatever else is trimmed.
  for (const row of ranked) {
    if (chosen.length >= limit) break;
    if (HIGHLIGHT_ROOM_FACT_KEYS.includes(String(row.key))) take(row);
  }

  // One row per performance area first, so no assessed area disappears.
  const areasTaken = new Set();
  for (const row of ranked) {
    if (chosen.length >= limit) break;
    if (areasTaken.has(row.area)) continue;
    areasTaken.add(row.area);
    take(row);
  }
  for (const row of ranked) {
    if (chosen.length >= limit) break;
    take(row);
  }
  return chosen;
}

/** The shortest generated sentence treated as a real "what the room gains" cell. */
const MIN_GAIN_LENGTH = 20;

/**
 * The most characters a stored "What the room gains" sentence may carry and
 * still print. The column holds two printed lines at the table's size: a longer
 * sentence would wrap to three or four and make the table taller than the page
 * it has to share with its heading, so it is replaced by the approved line for
 * that parameter. The stored sentence is never modified - only what prints.
 */
const MAX_PRINTED_GAIN = 96;

/** A result at RP22 Level 1 or Level 2 is stated plainly, never as a strength. */
const LOW_GRADE = /\bL[12]\b/i;

/** Wording that would oversell a Level 1 or Level 2 result. */
const OVERSELL = /\b(excellent|outstanding|exceptional|superb|perfect|flawless|remarkable|impeccable|class[- ]leading|reference[- ]grade|unmatched|ideal)\b/i;

/**
 * The rows whose approved line is a claim about evenness across the seating
 * area. Such a claim is only made when the result itself states a level that
 * supports it: a design whose bass consistency was not assessed at Level 3 or
 * Level 4 is never described as consistent seat to seat.
 */
const CONSISTENCY_ROW_KEYS = Object.freeze(['p4', 'p6', 'p10', 'p19', 'p20']);

/** A result that states a level the evenness claim can stand on. */
const SUPPORTED_GRADE = /\bL[34]\b/i;

/**
 * The honest line for a Level 1 or Level 2 result. A low result is a real part
 * of the design, so it is stated as what it is and what limits it, never as a
 * strength and never as an apology.
 */
const MODEST_GAIN = Object.freeze({
  p2: 'The channel count follows the system format the room is designed to, so movement is built from the positions this room allows.',
  p3: 'The screen speakers sit where the room and the screen allow, so dialogue stays anchored to the picture.',
  p4: 'Screen level consistency is set by the room and the screen wall, so the front stage holds together without being perfectly even seat to seat.',
  p5: 'The spacing between the listener-level speakers is set by the practical speaker positions and the seat geometry rather than by the channel count.',
  p6: 'The surround speakers are matched in level as far as the seating positions and the room allow.',
  p7: 'The front wide positions bridge the screen and the side speakers as far as the room geometry allows.',
  p9: 'Overhead spacing is set by the ceiling height and the seating layout, so sound above the seats is even rather than ideal.',
  p10: 'The overhead channels are kept close in level as the ceiling layout allows, rather than identical at every seat.',
  p11: 'The surround speakers sit where the seating can hear them, within what the room allows.',
  p12: 'Front-stage headroom is adequate for this room rather than generous, so the screen channels have less spare capacity at the highest levels.',
  p13: 'The surround channels have usable headroom, with less reserve than the screen stage.',
  p14: 'Low-frequency output supports the room, with less spare capacity than the main channels.',
  p16: 'The screen channels keep a broadly consistent tonal character, with some variation across the screen.',
  p17: 'Surround and overhead tone stays reasonably consistent, with some variation as effects move around the room.',
  p18: 'Bass extension is useful for film effects without reaching the deepest low-frequency content.',
  p19: 'Bass response is even across the main seats rather than identical at every position.',
  p20: 'Bass level varies between seats as the room and the subwoofer positions allow.',
});

/**
 * The client meaning of a comparison row — what the area gives the room, in the
 * approved words for that parameter.
 *
 * The comparison table states values only, so this column is what the client
 * reads them by. It follows the same honesty rule as the single-report table: a
 * row either version carries at Level 1 or Level 2 is described by the modest
 * line for that parameter, never by a line that reads as a strength.
 *
 * @param {{ key?: string, values?: string[] }} row
 * @returns {string}
 */
/**
 * What the change column says for one comparison row.
 *
 * An area every version shares is stated plainly as unchanged. A change is
 * stated only where it was derived from two comparable values; otherwise the
 * row points the client at the values rather than inventing a change, and never
 * claims there is none.
 */
export function changeCellText(row, optionCount) {
  if (row?.identical === true) return 'No change';
  if (row?.change) return String(row.change);
  return Number(optionCount) === 2 ? 'Values differ' : 'See values';
}

export function comparisonClientMeaning(row) {
  if (row?.client_meaning) return row.client_meaning;
  const key = String(row?.key || '').trim();
  if (key === 'p17' && row?.identical !== true) return 'A lower achieved level is a real trade-off in surround and overhead tonal consistency, even when output capability is higher.';
  const equipmentMeaning = { lcr: 'The screen-speaker specification sets front-stage capability.', surrounds: 'These speakers carry effects around the listening area.', overheads: 'These speakers carry the height layer.', subwoofers: 'The count and model change the bass system; output is compared in P14.', system_layout: 'The channel format defines the sound positions.' };
  if (equipmentMeaning[key]) return equipmentMeaning[key];
  if (key === 'p20') return 'Measured seat-to-seat variation; lower variation means less difference between seats.';
  if (key === 'p19') return 'Deviation from the bass target at the reference seating position.';
  const approved = ROW_PRESENTATION[key]?.gain || FALLBACK_GAIN;
  const stated = (Array.isArray(row?.values) ? row.values : []).map((value) => String(value)).join(' ');
  const low = LOW_GRADE.test(stated);
  // The same rule as the single-report table: a Level 1 or Level 2 result is
  // never described as a strength, and an evenness claim needs a stated level
  // that supports it.
  const unsupportedClaim = CONSISTENCY_ROW_KEYS.includes(key) && !SUPPORTED_GRADE.test(stated);
  return low || unsupportedClaim ? (MODEST_GAIN[key] || approved) : approved;
}

/** The performance area for a row. */
export function highlightAreaFor(key, fallbackArea = null) {
  const presentation = ROW_PRESENTATION[String(key || '').trim()];
  if (presentation) return presentation.area;
  return fallbackArea || UNMAPPED_AREA;
}

/** The parameter source label for a row, e.g. "P5 horizontal spacing". */
export function highlightParameterFor(key, fallbackArea = null) {
  const presentation = ROW_PRESENTATION[String(key || '').trim()];
  if (presentation) return presentation.parameter;
  return fallbackArea || 'Design result';
}

/** A generated "What the room gains" cell, or null when it is not usable. */
function usableGain(row) {
  const raw = row?.what_the_room_gains ?? row?.what_you_hear ?? '';
  const text = String(raw).trim();
  if (text.length < MIN_GAIN_LENGTH) return null;
  return text;
}

/**
 * The rows the table renders.
 *
 * @param {Array} rows - calculated highlight rows from the section metadata
 * @param {{ limit?: number, viewingResult?: string|null }} [options]
 *   viewingResult — the compact per-row RP23 line ('Row 1 L4, 63° / Row 2 L3,
 *   45°'), built from the published per-seat angles by the same authority the
 *   reports read. It states in one line the geometry the stored sentence
 *   describes, so the Result column stays narrow. Nothing is derived here: when
 *   no compact line is supplied the stored result prints as it always has.
 * @returns {Array<{ key, area, parameter, result, gain }>} display rows
 */
export function buildHighlightDisplayRows(rows, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : HIGHLIGHT_DISPLAY_LIMIT;
  const compactViewing = String(options.viewingResult || '').trim();
  const display = excludeClientFacingRows(rows)
    .filter((row) => row && (row.area || row.result || row.key))
    .map((row, index) => {
      const key = String(row.key || `row_${index}`);
      const presentation = ROW_PRESENTATION[key] || null;
      const calculated = formatResultText(row.result, presentation?.unit ?? DISPLAY_UNIT.NONE);
      const result = key === 'rp23_viewing' && compactViewing ? compactViewing : calculated;
      const generated = usableGain(row);
      const approved = presentation?.gain || FALLBACK_GAIN;
      // A generated sentence prints only when it is short enough to hold the
      // column at one or two lines. A longer one is replaced by the approved
      // line for the parameter, so no single row can stretch the table off the
      // page it shares with its heading. The stored sentence is never changed.
      const short = Boolean(generated) && generated.length <= MAX_PRINTED_GAIN;
      const proposed = short ? generated : approved;
      // A Level 1 or Level 2 result is stated plainly: a sentence that reads as a
      // strength, or one long enough to need trimming, gives way to the honest
      // line for that parameter.
      // A row's grade is read from its structured level when it carries one,
      // and from its stated result otherwise: a result stated as a number is
      // still a Level 1 or Level 2 result when the row's level says so.
      const stated = `${row.level || ''} ${row.result || ''}`;
      const lowGrade = LOW_GRADE.test(stated);
      // A result that does not state a level at all supports no claim about
      // evenness, so none is made: the row is described by the honest line for
      // its parameter until its own report states a level that backs the claim.
      const consistencyClaimUnsupported = CONSISTENCY_ROW_KEYS.includes(key)
        && !SUPPORTED_GRADE.test(stated);
      const oversold = OVERSELL.test(proposed);
      return {
        key,
        area: highlightAreaFor(key, row.area),
        parameter: highlightParameterFor(key, row.area),
        result,
        // The column is never blank: the approved line for the parameter stands
        // in whenever the generated sentence is missing or too thin to use.
        gain: (consistencyClaimUnsupported || (lowGrade && (!short || oversold)))
          ? (MODEST_GAIN[key] || proposed)
          : proposed,
      };
    })
    .filter((row) => Boolean(row.area && (row.result || row.parameter)));

  // The table reads by performance area, strongest result first within an area.
  return selectTableRows(display, limit).sort(
    (a, b) => (areaRank(a.area) - areaRank(b.area)) || (printRank(a.key) - printRank(b.key))
  );
}

export default buildHighlightDisplayRows;