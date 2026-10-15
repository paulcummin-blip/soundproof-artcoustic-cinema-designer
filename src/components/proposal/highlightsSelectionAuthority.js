/**
 * highlightsSelectionAuthority.js
 * -------------------------------
 * WHICH RESULTS EARN A PLACE IN A KEY PERFORMANCE HIGHLIGHTS TABLE.
 *
 * The table is a short, curated statement of what this design genuinely does
 * well. It is not a transcript of the assessment and it is not a second RP22
 * scorecard: a table that lists every assessed area, including the areas this
 * design only just met, tells the client nothing about the design they are
 * buying and reads as a report rather than as a recommendation.
 *
 * THREE THINGS DECIDE A PLACE, and nothing else:
 *
 *   1. ASDR IMPORTANCE — the parameter's own canonical weight (the one ASDR
 *      importance table, shared with the Project Report's highlights and the
 *      proposal writer's strength selection). A result at a parameter the rating
 *      considers central is worth more room than one at a peripheral parameter.
 *   2. ACHIEVED PERFORMANCE — the level the result actually reached, read from
 *      the row as it was calculated. Importance and achievement are read
 *      together: a strong result at a peripheral parameter and a moderate one at
 *      the heaviest parameter can each earn a place.
 *   3. BRIEF RELEVANCE — the areas the designer's own brief names. Where the
 *      brief names an area, its result is preferred over an equally weighted
 *      result the brief says nothing about.
 *
 * WHAT IS NEVER SELECTED
 *   · a Level 1 result: the lowest passing level is never presented as a
 *     highlight of the design, automatically or otherwise;
 *   · an assumed parameter (P8, P15, P21) and the internal Design Index;
 *   · a room fact (the screen, the layout, the viewing geometry) — those are
 *     stated on the document's own at-a-glance page, not claimed as performance.
 *
 * HOW THE PLACES ARE FILLED
 *   One place goes to each performance area whose strongest result is a genuine
 *   strength (Level 3 or above), so a design strong in several areas is
 *   represented in each. The remaining places go to the highest-scoring results
 *   by their own weight and achievement. The table carries at most four rows and
 *   is never padded: a design with two worthwhile results prints two.
 *
 * Nothing is calculated, graded or re-measured here. Every level, weight and
 * figure is read from the row or from the canonical importance table, and a row
 * that is withdrawn is withdrawn from the PAGE only — the stored rows, the
 * section and the report that carries every result are untouched.
 *
 * Pure: no React, no fetching, no side effects.
 */

import { PARAM_WEIGHTS, LEVEL_MULTIPLIERS, ASSUMED_PARAMETER_KEYS } from '@/shared/canonicalParameterWeights';

/** How many rows the table carries at most. Three or four is a summary. */
export const HIGHLIGHT_SELECTION_LIMIT = 4;

/** A result at this level or above is a genuine strength of the design. */
const STRENGTH_LEVEL = 3;

/** The level below which a result is never presented as a highlight. */
const LOWEST_PRESENTABLE_LEVEL = 2;

/** The extra preference a result the brief asks about earns. */
const BRIEF_PREFERENCE = 1.25;

/**
 * The areas the brief's own words can name, per parameter. Read from the brief
 * relevance authority's own vocabulary (base44/shared/briefRelevance.js) so a
 * brief is read the same way here as it is everywhere else.
 */
const PARAMETER_BRIEF_AREA = Object.freeze({
  p1: 'spatial_resolution',
  p2: 'loudspeaker_configuration',
  p3: 'spatial_resolution',
  p4: 'spatial_resolution',
  p5: 'spatial_resolution',
  p6: 'spatial_resolution',
  p7: 'spatial_resolution',
  p9: 'spatial_resolution',
  p10: 'spatial_resolution',
  p11: 'spatial_resolution',
  p12: 'dynamic_capability',
  p13: 'dynamic_capability',
  p14: 'bass_capability',
  p16: 'timbre_matching',
  p17: 'timbre_matching',
  p18: 'bass_capability',
  p19: 'bass_capability',
  p20: 'bass_capability',
});

/** Room and system facts: stated on the at-a-glance page, never a highlight. */
const ROOM_FACT_KEYS = Object.freeze([
  'screen_size',
  'system_layout',
  'rp23_viewing',
  'seating',
  'speakers',
  'subwoofers',
  'amplification',
  'rp23_distance',
]);

/** The brief's own words, read for the areas it names. */
function briefAreas(briefText) {
  const text = String(briefText || '');
  if (!text.trim()) return [];
  const subjects = Object.freeze([
    [/subwoofer|\bbass\b|low[- ]frequenc|lfe/i, 'bass_capability'],
    [/dynamic range|dynamic|impact|headroom|concert level|reference level/i, 'dynamic_capability'],
    [/timbre|tonal|timbre match|voice|dialogue clarity/i, 'timbre_matching'],
    [/overhead|atmos|immersive|height|spatial|placement|spacing|surround/i, 'spatial_resolution'],
    [/\btv\b|television|screen|projector|projection|picture|large format|cinemascope/i, 'display_viewing'],
    [/seating|seat|viewing|comfort|lounge|recliner|sofa|rows?/i, 'client_experience'],
    [/5\.1|7\.1|9\.1|\bchannels?\b|system|format|layout/i, 'loudspeaker_configuration'],
  ]);
  const out = [];
  for (const [pattern, area] of subjects) {
    if (pattern.test(text) && !out.includes(area)) out.push(area);
  }
  return out;
}

/** The level a row's result states, as a number, or null. */
export function achievedLevel(row) {
  const stated = `${row?.level || ''} ${row?.result || ''}`;
  const match = /\bL([1-4])\b/i.exec(stated);
  return match ? Number(match[1]) : null;
}

/** The canonical importance of a row's parameter, or 0 when it states none. */
export function rowImportance(key) {
  const weight = PARAM_WEIGHTS[String(key || '').trim()];
  return Number(weight) || 0;
}

/**
 * The rows that earn a highlight, strongest first.
 *
 * @param {Array<{ key, area, level?, result? }>} rows the stored calculated rows
 * @param {{ limit?: number, briefText?: string }} [options]
 * @returns {Array} the selected rows, in the order they were read
 */
export function selectKeyHighlights(rows, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : HIGHLIGHT_SELECTION_LIMIT;
  const areas = briefAreas(options.briefText);
  const list = (Array.isArray(rows) ? rows : []).filter((row) => row
    && !ROOM_FACT_KEYS.includes(String(row.key || '').trim())
    && !ASSUMED_PARAMETER_KEYS.includes(String(row.key || '').trim()));

  const scored = [];
  list.forEach((row, index) => {
    const key = String(row.key || '').trim();
    const level = achievedLevel(row);
    const weight = rowImportance(key);
    // A result below the lowest presentable level, or one at a parameter the
    // importance table does not carry, is never a highlight.
    if (!level || level < LOWEST_PRESENTABLE_LEVEL || weight <= 0) return;
    const area = PARAMETER_BRIEF_AREA[key] || null;
    const multiplier = LEVEL_MULTIPLIERS[`L${level}`] || 0;
    const preferred = area && areas.includes(area) ? BRIEF_PREFERENCE : 1;
    scored.push({
      row,
      index,
      key,
      level,
      weight,
      area: row.area || null,
      score: weight * multiplier * preferred,
    });
  });

  if (scored.length === 0) return [];

  const chosen = [];
  const taken = new Set();
  // One place to each performance area whose strongest result is a strength, so
  // an area the design genuinely delivers in is never crowded out.
  const areasTaken = new Set();
  scored
    .filter((entry) => entry.level >= STRENGTH_LEVEL)
    .sort((a, b) => b.score - a.score)
    .forEach((entry) => {
      const area = String(entry.row.area || entry.area || '');
      if (chosen.length >= limit || areasTaken.has(area)) return;
      areasTaken.add(area);
      taken.add(entry.key);
      chosen.push(entry);
    });
  // The remaining places go to the highest-scoring results; an equal score is
  // settled by the heavier canonical parameter.
  scored
    .slice()
    .sort((a, b) => (b.score - a.score) || (b.weight - a.weight) || (a.index - b.index))
    .forEach((entry) => {
      if (chosen.length >= limit || taken.has(entry.key)) return;
      taken.add(entry.key);
      chosen.push(entry);
    });

  return chosen
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.row);
}

/**
 * The rows a table with nothing genuinely worthwhile prints instead: the design's
 * own stated facts. They claim no performance and are always true, so the page
 * still says something rather than printing a heading over nothing.
 */
export function fallbackHighlightRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && ROOM_FACT_KEYS.includes(String(row.key || '').trim()))
    .slice(0, 3);
}

export default selectKeyHighlights;