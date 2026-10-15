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
 * FOUR THINGS DECIDE A PLACE, and nothing else:
 *
 *   1. ASDR IMPORTANCE — the parameter's own canonical weight (the one ASDR
 *      importance table, shared with the Project Report's highlights and the
 *      proposal writer's strength selection).
 *   2. BRIEF RELEVANCE — the areas the designer's own brief names. Where the
 *      brief names an area, its result is preferred over an equally weighted
 *      result the brief says nothing about, and a solid result in an area the
 *      project is genuinely about earns a place at a level that would otherwise
 *      not be enough.
 *   3. ACHIEVED PERFORMANCE — the level the result actually reached, read from
 *      the row as it was calculated. Importance and achievement are read
 *      together: a strong result at a peripheral parameter and a moderate one at
 *      the heaviest parameter can each earn a place.
 *   4. CLIENT USEFULNESS — whether the result is one the client can picture.
 *      Each performance category has the parameter that tells ITS story in the
 *      client's own terms: how deep the bass reaches, how consistent the tonal
 *      character is, how the front stage holds together. A reading that only
 *      QUALIFIES another result — the bass control, the bass consistency — never
 *      becomes the row that carries its category.
 *
 * A CATEGORY APPEARS ON ITS OWN MERIT, NEVER TO FILL A GAP. One row per
 * performance category (Spatial Resolution, Dynamic Range, Timbre Matching, Bass
 * Capability), and only where that category's own story result is a genuine
 * strength (Level 3 or above), or where a heavily weighted parameter the project
 * is built around reached a solid result. A category with nothing to say says
 * nothing: the table is never padded with one result per area, and a design with
 * three worthwhile results prints three.
 *
 * WHAT IS NEVER SELECTED
 *   · a Level 1 result — the lowest passing level is never presented as a
 *     highlight of the design, however heavily its parameter is weighted and
 *     whatever else the table would carry;
 *   · a quality qualifier as the row that carries its category (bass control,
 *     bass consistency): they support the bass story the bass extension tells,
 *     they do not replace it;
 *   · an assumed parameter (P8, P15, P21) and the internal Design Index;
 *   · a room fact (the display, the viewing geometry, the system format) — the
 *     facts stay in the table as the design's own facts, and are never claimed
 *     as performance.
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
 * A parameter this heavy is one the project is built around: its own ASDR weight
 * is at the top of the table (bass extension, bass control and consistency, the
 * low-frequency output, the screen-channel and non-screen dynamic range, the
 * discrete channel count). A solid result at one of these is part of what the
 * design is for, rather than an incidental reading, so it earns a place where a
 * moderate result at a peripheral parameter would not.
 */
const HEAVY_WEIGHT = 10;

/**
 * The performance category each assessed parameter belongs to. The categories
 * are the three pillars plus the bass layer the pillars are told through.
 */
const PARAMETER_CATEGORY = Object.freeze({
  p1: 'spatial_resolution',
  p2: 'spatial_resolution',
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

/**
 * THE STORY ROW OF EACH CATEGORY, in the order that category's own results are
 * read for it. A category is represented by the first of these that reached a
 * presentable result, so the row the client reads is the one that tells that
 * part of the experience: how the front stage holds together, how the tonal
 * character stays the same, how low the bass reaches. The readings that only
 * qualify another result stand behind it.
 */
const CATEGORY_STORY_ORDER = Object.freeze({
  spatial_resolution: Object.freeze(['p4', 'p6', 'p5', 'p9', 'p10', 'p7', 'p2', 'p1', 'p3', 'p11']),
  dynamic_capability: Object.freeze(['p12', 'p13']),
  timbre_matching: Object.freeze(['p16', 'p17']),
  bass_capability: Object.freeze(['p18', 'p14']),
});

/** The reading order of the categories in the selected set. */
const CATEGORY_ORDER = Object.freeze([
  'spatial_resolution',
  'dynamic_capability',
  'timbre_matching',
  'bass_capability',
]);

/** Room and system facts: stated as the design's own facts, never a highlight. */
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

/** The key of a row, trimmed, and whether it is a room fact rather than a result. */
function keyOf(row) {
  return String(row?.key || '').trim();
}

function isRoomFact(row) {
  return ROOM_FACT_KEYS.includes(keyOf(row));
}

/**
 * The rows that earn a highlight, in the reading order of their categories.
 *
 * @param {Array<{ key, area, level?, result? }>} rows the stored calculated rows
 * @param {{ limit?: number, briefText?: string }} [options]
 * @returns {Array} the selected rows
 */
export function selectKeyHighlights(rows, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : HIGHLIGHT_SELECTION_LIMIT;
  const areas = briefAreas(options.briefText);
  const list = (Array.isArray(rows) ? rows : []).filter((row) => row
    && !isRoomFact(row)
    && !ROOM_FACT_KEYS.includes(keyOf(row))
    && !ASSUMED_PARAMETER_KEYS.includes(keyOf(row)));

  // Every presentable result, scored once: its canonical weight, the level it
  // actually reached, and the preference the brief gives its area.
  const scored = new Map();
  list.forEach((row, index) => {
    const key = keyOf(row);
    if (!key || scored.has(key)) return;
    const level = achievedLevel(row);
    const weight = rowImportance(key);
    const category = PARAMETER_CATEGORY[key] || null;
    if (!category || !level || level < LOWEST_PRESENTABLE_LEVEL || weight <= 0) return;
    const multiplier = LEVEL_MULTIPLIERS[`L${level}`] || 0;
    const preferred = areas.includes(category) ? BRIEF_PREFERENCE : 1;
    scored.set(key, {
      row,
      index,
      key,
      level,
      weight,
      category,
      brief_named: areas.includes(category),
      score: weight * multiplier * preferred,
    });
  });

  const chosen = [];
  for (const category of CATEGORY_ORDER) {
    if (chosen.length >= limit) break;
    const entry = CATEGORY_STORY_ORDER[category]
      .map((key) => scored.get(key))
      .find(Boolean);
    if (!entry) continue;
    // The category's own story result has to be worth reading on its own: a
    // strength, or a solid result at a parameter this project is built around,
    // or an area the brief asks about.
    const earnsPlace = entry.level >= STRENGTH_LEVEL
      || entry.brief_named
      || entry.weight >= HEAVY_WEIGHT;
    if (!earnsPlace) continue;
    chosen.push(entry);
  }

  // The strongest result of the selected set reads first within its category.
  return chosen
    .sort((a, b) => (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
      || (b.score - a.score)
      || (a.index - b.index))
    .map((entry) => entry.row);
}

/**
 * The rows the Key Performance Highlights SUMMARY table carries: the design's own
 * facts, then the results that earned a highlight. The facts are read exactly as
 * they were calculated — they state what the room is, claim no performance, and
 * are never counted as one of the highlights.
 *
 * @param {Array} rows the section's stored calculated rows
 * @param {{ limit?: number, briefText?: string }} [options]
 * @returns {Array} the rows to print, stored rows untouched
 */
export function curateSummaryHighlights(rows, options = {}) {
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const facts = list.filter(isRoomFact);
  const selected = selectKeyHighlights(list, options);
  const taken = new Set(facts.map(keyOf));
  return [...facts, ...selected.filter((row) => !taken.has(keyOf(row)))];
}

/**
 * The rows a table with nothing genuinely worthwhile prints instead: the design's
 * own stated facts. They claim no performance and are always true, so the page
 * still says something rather than printing a heading over nothing.
 */
export function fallbackHighlightRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && isRoomFact(row))
    .slice(0, 3);
}

export default selectKeyHighlights;