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
import { excludeDesignIndexRows } from './designIndexRowAuthority';

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
    gain: 'Places the seating inside the viewing angle the screen was specified for, so the picture holds up across the room.',
  },
  system_layout: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'Channel layout',
    unit: DISPLAY_UNIT.NONE,
    gain: 'The channel layout the room is built for, so sound travels around and above the seats as the mix intends.',
  },
  p2: {
    area: HIGHLIGHT_AREA.SPATIAL,
    parameter: 'P2 discrete channels',
    unit: DISPLAY_UNIT.NONE,
    gain: 'More discrete channels give more precise movement between the screen, side and rear speakers.',
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
    gain: 'Keeps the screen sound consistent from seat to seat, so the front stage holds together across the room.',
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
    gain: 'Strong headroom on the screen channels for demanding film soundtracks.',
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
    gain: 'The low-frequency channel carries the deepest effects without running out of output.',
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
    gain: 'Even bass response across the seating area, so the low end holds together between seats.',
  },
  p20: {
    area: HIGHLIGHT_AREA.BASS,
    parameter: 'P20 bass consistency',
    unit: DISPLAY_UNIT.DB,
    gain: 'Consistent bass from seat to seat, so every listening position gets the same low-frequency balance.',
  },
});

/** Used only for a row that carries no recognised parameter source. */
const FALLBACK_GAIN = 'Part of how this system performs as a whole in the room.';

/** The most rows the table carries: the strongest results, never a full dump. */
export const HIGHLIGHT_DISPLAY_LIMIT = 12;

/** The shortest generated sentence treated as a real "what the room gains" cell. */
const MIN_GAIN_LENGTH = 20;

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
 * @param {{ limit?: number }} [options]
 * @returns {Array<{ key, area, parameter, result, gain }>} display rows
 */
export function buildHighlightDisplayRows(rows, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : HIGHLIGHT_DISPLAY_LIMIT;
  return excludeDesignIndexRows(rows)
    .filter((row) => row && (row.area || row.result || row.key))
    .slice(0, limit)
    .map((row, index) => {
      const key = String(row.key || `row_${index}`);
      const presentation = ROW_PRESENTATION[key] || null;
      const result = formatResultText(row.result, presentation?.unit ?? DISPLAY_UNIT.NONE);
      return {
        key,
        area: highlightAreaFor(key, row.area),
        parameter: highlightParameterFor(key, row.area),
        result,
        // The column is never blank: the approved line for the parameter stands
        // in whenever the generated sentence is missing or too thin to use.
        gain: usableGain(row) || presentation?.gain || FALLBACK_GAIN,
      };
    })
    .filter((row) => Boolean(row.area && (row.result || row.parameter)));
}

export default buildHighlightDisplayRows;