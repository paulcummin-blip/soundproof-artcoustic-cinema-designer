/**
 * narrativeThemeGrouping.js (base44/shared — CANONICAL)
 * ----------------------------------------------------
 * ONE STORY PER EXPERIENCE THEME, NEVER ONE PARAGRAPH PER PARAMETER.
 *
 * WHY IT EXISTS. ASDR decides WHICH areas matter and the brief decides which of
 * them matter for THIS project, but a parameter is an EVIDENCE FRAGMENT: P14, P18,
 * P19 and P20 are four readings of one thing the client experiences as a single
 * subject — the bass. Telling them separately produces a parameter-by-parameter
 * account ("P14 is L3. P18 is L4."), which is exactly what a client-facing proposal
 * must never be. This authority groups related results into the themes the client
 * actually experiences, and hands the writer ONE story per theme, read through the
 * facets that make the theme meaningful.
 *
 * WHAT A THEME CARRIES
 *   - its members, exactly as the evidence states them (level, value, seat scope);
 *   - for the bass, the FOUR FACETS the results answer together — output, depth,
 *     control and consistency — each at its OWN published result, never at an
 *     average and never at the strongest member;
 *   - the client's own vocabulary for the theme (power, depth, scale, impact,
 *     physicality, control, consistency for the bass);
 *   - the clause each facet's result has already earned, from the performance
 *     language register — this module invents no client language of its own;
 *   - the SEATS a consistency claim may be made for, and the wording that scope
 *     allows and forbids;
 *   - whether INFRASONIC language is genuinely supported by the extension, and the
 *     phrases it then allows.
 *
 * WHAT IT NEVER DOES. No figure, level, weight or scope is changed, averaged,
 * widened or inferred: a facet reads its own member's published result, a theme's
 * consistency is stated only for the seats its own result holds for, and infrasonic
 * language is refused wherever the extension does not reach it. Parameter numbers
 * and raw Performance Levels belong in the technical evidence and never in theme
 * prose — `parameterNamesIn` reads them out of client-facing text.
 *
 * Pure: no React, no SDK, no storage, no recalculation, no side effects.
 */

import { levelLabel, levelRank } from './strengthImportance.js';
import { PERFORMANCE_AREAS, performancePhrase } from './performanceLanguageAuthority.js';
import { PRIORITY_LABEL, PRIORITY_RANK, mayAppearInNarrative } from './narrativeRoles.js';
import { SEAT_SCOPE, p20ConsistencyPhrase } from './seatScopeNarrativeAuthority.js';

/** The theme generation, so a draft can be traced to the grouping it was written under. */
export const NARRATIVE_THEME_VERSION = 1;

/* ── The themes: the experience areas a proposal is told through ───────────── */

export const EXPERIENCE_THEME = Object.freeze({
  BASS: 'bass',
  DYNAMIC_IMPACT: 'dynamic_impact',
  TONAL_CONSISTENCY: 'tonal_consistency',
  SPATIAL_PRECISION: 'spatial_precision',
  SEATING_RATIONALE: 'seating_rationale',
});

/** The themes in the order a proposal reads them, bass first. */
export const EXPERIENCE_THEME_ORDER = Object.freeze([
  EXPERIENCE_THEME.BASS,
  EXPERIENCE_THEME.DYNAMIC_IMPACT,
  EXPERIENCE_THEME.TONAL_CONSISTENCY,
  EXPERIENCE_THEME.SPATIAL_PRECISION,
  EXPERIENCE_THEME.SEATING_RATIONALE,
]);

/**
 * The themes, and the results that tell each one. `kind` keeps a design decision
 * apart from a performance result: the seating theme is the seating decision
 * explained, and it is never a performance boast.
 */
export const EXPERIENCE_THEMES = Object.freeze({
  [EXPERIENCE_THEME.BASS]: {
    key: EXPERIENCE_THEME.BASS,
    label: 'Bass',
    kind: 'performance',
    keys: Object.freeze(['p14', 'p18', 'p19', 'p20']),
    facets: true,
    vocabulary: Object.freeze(['power', 'depth', 'scale', 'impact', 'physicality', 'control', 'consistency']),
    rule: 'the bass is told as ONE story: how much authority and headroom the system has, how low it reaches, how closely it follows the target, and how well that holds across the seats the result supports',
  },
  [EXPERIENCE_THEME.DYNAMIC_IMPACT]: {
    key: EXPERIENCE_THEME.DYNAMIC_IMPACT,
    label: 'Dynamic impact',
    kind: 'performance',
    keys: Object.freeze(['p12', 'p13']),
    facets: false,
    vocabulary: Object.freeze(['headroom', 'scale', 'impact', 'effortlessness']),
    rule: 'the screen and non-screen dynamic results are told together as the system\'s headroom and impact, weighted towards the channels this brief is built around',
  },
  [EXPERIENCE_THEME.TONAL_CONSISTENCY]: {
    key: EXPERIENCE_THEME.TONAL_CONSISTENCY,
    label: 'Tonal consistency',
    kind: 'performance',
    keys: Object.freeze(['p16', 'p17']),
    facets: false,
    vocabulary: Object.freeze(['tonal consistency', 'a single voice', 'natural handover']),
    rule: 'the two tonal results are told as one tonal story. They are seat-to-seat frequency-response results, one loudspeaker group each: never impact, weight or scale language, and never a match measured between the two groups',
  },
  [EXPERIENCE_THEME.SPATIAL_PRECISION]: {
    key: EXPERIENCE_THEME.SPATIAL_PRECISION,
    label: 'Spatial precision',
    kind: 'performance',
    keys: Object.freeze(['p3', 'p4', 'p5', 'p11']),
    facets: false,
    vocabulary: Object.freeze(['precision', 'placement', 'movement', 'immersion']),
    rule: 'the placement results are told as one spatial story of precision and immersion, and each result named holds on its own: a mixed spatial picture is never written as a uniformly strong one',
  },
  [EXPERIENCE_THEME.SEATING_RATIONALE]: {
    key: EXPERIENCE_THEME.SEATING_RATIONALE,
    label: 'Seating rationale',
    kind: 'rationale',
    keys: Object.freeze(['p1']),
    facets: false,
    vocabulary: Object.freeze(['comfort', 'viewing position', 'the room working with the seating']),
    rule: 'the seating clearance is a design decision the client and the installer ask about: explain in plain terms what the arrangement does for the listener, never as a performance boast, and attach no Performance Level to it',
  },
});

/** Every parameter's theme, built once from the themes themselves. */
export const PARAMETER_EXPERIENCE_THEME = Object.freeze(
  EXPERIENCE_THEME_ORDER.reduce((map, themeKey) => {
    for (const key of EXPERIENCE_THEMES[themeKey].keys) map[key] = themeKey;
    return map;
  }, {}),
);

/** The theme one parameter belongs to, or null. */
export function experienceThemeOf(parameterKey) {
  return PARAMETER_EXPERIENCE_THEME[String(parameterKey)] || null;
}

/* ── The bass facets: what the four bass results answer together ───────────── */

/**
 * The four readings of one bass story. Each facet reads its own member's published
 * result: the output result answers the authority question, the extension result
 * the depth question, the reference-seat response the control question, and the
 * seat-consistency result the question of how well it holds across seats.
 */
export const BASS_FACETS = Object.freeze([
  Object.freeze({
    facet: 'output',
    keys: Object.freeze(['p14']),
    question: 'How much authority and headroom is available?',
    area: PERFORMANCE_AREAS.BASS_OUTPUT,
    vocabulary: Object.freeze(['power', 'impact', 'physicality']),
  }),
  Object.freeze({
    facet: 'depth',
    keys: Object.freeze(['p18']),
    question: 'How low does the system reach?',
    area: PERFORMANCE_AREAS.BASS_EXTENSION,
    vocabulary: Object.freeze(['depth', 'scale', 'physical impact']),
  }),
  Object.freeze({
    facet: 'control',
    keys: Object.freeze(['p19']),
    question: 'How closely does the response follow the target?',
    // P19's own published result is the response at the reference seating
    // position. It is stated from the evidence and the report's own language; the
    // performance register holds no area for it, so no clause is invented here.
    area: null,
    vocabulary: Object.freeze(['control', 'composure']),
  }),
  Object.freeze({
    facet: 'consistency',
    keys: Object.freeze(['p20']),
    question: 'How well does that bass behaviour hold across the primary seats?',
    area: null,
    vocabulary: Object.freeze(['consistency', 'evenness across the seats']),
  }),
]);

export const BASS_FACET_ORDER = Object.freeze(BASS_FACETS.map((facet) => facet.facet));

/* ── The seat scope a consistency claim may be made for ────────────────────── */

/** The wording each seat scope allows. */
export const SEAT_SCOPE_WORDING = Object.freeze({
  [SEAT_SCOPE.ALL]: 'across the seating',
  [SEAT_SCOPE.PRIMARY]: 'across the primary seating area',
});

/** The wording a narrower result must never be widened into. */
export const WIDENED_SCOPE_WORDING = Object.freeze(['across the room', 'across every seat', 'throughout the room', 'at every seat']);

export const PRIMARY_SEAT_SCOPE_RULE = `SEAT SCOPE IS PART OF THE CLAIM. Where the bass consistency result holds for the primary seats only, say "across the primary seating area" and stop there: never widen it to "across the room", "across every seat" or "throughout the room". Where the result holds across the assessed seating, the wider wording is allowed. A seat-scoped result is never restated as a room-wide one, and the seats a claim is made for are read from the result itself, never chosen for emphasis.`;

/* ── Infrasonic language, only where the extension supports it ─────────────── */

/**
 * The RP22 boundary the depth result is graded against: a minimum-L3 in-room
 * extension reaches 20 Hz. Deepest-octave, infrasonic language therefore begins at
 * an L3 depth result, and where a published extension value exists it has to agree
 * with it.
 */
export const INFRASONIC_EXTENSION_HZ = 20;
export const INFRASONIC_MIN_DEPTH_LEVEL = 'L3';

/** The phrases a genuinely deep result has earned. */
export const INFRASONIC_PHRASES = Object.freeze([
  'infrasonic depth',
  'physical scale',
  'felt as much as heard',
  'genuine low-frequency authority',
]);

export const INFRASONIC_RULE = `INFRASONIC LANGUAGE MUST BE EARNED. Use "infrasonic", or phrases such as infrasonic depth, physical scale, felt as much as heard or genuine low-frequency authority, ONLY where the bass extension result genuinely supports it. A moderate or mid-band extension is written as the depth it gives the soundtrack: no infrasonic claim, no deepest-octave claim and no promise of performance below the published limit. Do not hedge a deep result either.`;

/** The Hz a published extension value states, or null. */
export function extensionHz(value) {
  if (value == null) return null;
  const match = String(value).match(/(\d+(?:\.\d+)?)\s*hz/i);
  if (!match) return null;
  const hz = Number(match[1]);
  return Number.isFinite(hz) ? hz : null;
}

/**
 * Whether the depth result supports infrasonic language, and why.
 *
 * @param {Object} input
 * @param {string|null} [input.depthLevel] — the published extension result
 * @param {string|number|null} [input.depthValue] — the published extension, e.g. '18 Hz'
 * @returns {{allowed: boolean, reason: string, phrases: Array<string>, extension_hz: number|null}}
 */
export function infrasonicAllowance({ depthLevel = null, depthValue = null } = {}) {
  const level = levelLabel(depthLevel);
  const hz = extensionHz(depthValue);
  const refused = (reason) => ({ allowed: false, reason, phrases: [], extension_hz: hz });
  if (level == null) {
    return refused('no extension result is published, so no deepest-octave claim can be made');
  }
  if (levelRank(level) < levelRank(INFRASONIC_MIN_DEPTH_LEVEL)) {
    return refused(`the extension result is ${level}, and infrasonic language begins at ${INFRASONIC_MIN_DEPTH_LEVEL} (${INFRASONIC_EXTENSION_HZ} Hz)`);
  }
  if (hz != null && hz > INFRASONIC_EXTENSION_HZ) {
    return refused(`the published extension states ${hz} Hz, which does not reach the ${INFRASONIC_EXTENSION_HZ} Hz infrasonic boundary`);
  }
  return {
    allowed: true,
    reason: hz == null
      ? `the extension result is ${level}, which reaches the ${INFRASONIC_EXTENSION_HZ} Hz boundary or below`
      : `the extension result is ${level} at ${hz} Hz`,
    phrases: [...INFRASONIC_PHRASES],
    extension_hz: hz,
  };
}

/* ── The rules the writer is held to ──────────────────────────────────────── */

export const ONE_STORY_PER_THEME_RULE = `ONE STORY PER EXPERIENCE THEME, NEVER ONE PARAGRAPH PER PARAMETER. Related results are evidence fragments of one subject; the client is choosing an experience, not a parameter set. Where several results belong to the same theme, read them TOGETHER and tell them as one passage in the client's own language — for the bass: how much authority and headroom the system has, how low it reaches, how closely it follows the target, and how well that holds across the seats the result supports. Never write a sentence, a bullet or a paragraph for each result, never work through them in order, and never give a theme a heading of its own. One theme is told once, in the place the design story needs it, and two themes may share a passage where that reads better.`;

export const THEME_PARAMETER_SILENCE_RULE = `A THEME IS TOLD IN THE CLIENT'S LANGUAGE. Never name a parameter, an RP22 parameter number, a Performance Level or an internal role in theme prose: no "P14 is L3", no "P18 is L4", no "bass extension (P18)". Parameter numbers, levels and values belong in the technical evidence and the tables that carry them. Write what the client will hear, and let the evidence support it.`;

export const THEME_TELLING_RULE = `TELL THE PROPOSAL THROUGH A SMALL NUMBER OF THEMES. The themes below are the experience areas this design can be told through, strongest first. Tell the proposal through the small number of them that carry this design's story — normally the lead themes, with another theme named briefly only where it genuinely helps — and never give every theme its own section, its own paragraph or its own sentence. ASDR says which areas matter; the brief says which of them matter for this project; the themes are then read together into one fluent account of the experience the design creates.`;

export const BASS_NARRATIVE_RULE = `THE BASS IS ONE STORY IN FOUR PARTS. Use the combined evidence to describe the bass in terms of power, depth, scale, impact, physicality, control and consistency across the seats the result supports. Never write "P14 is L3. P18 is L4. P20 is L3." Write one passage of the kind: "The bass system combines strong output with very deep extension and remains well controlled across the primary seating area." Each part states its own result — the authority the system has, the depth it reaches, the control it holds and the consistency it delivers — and no part is written stronger than its own result.`;

/* ── Reading client-facing text ───────────────────────────────────────────── */

const PARAMETER_NAME_PATTERN = /\bP(?:[1-9]|1\d|2[0-3])\b/g;
const LEVEL_NAME_PATTERN = /\b(?:Level\s*[1-4]|L[1-4])\b/g;

/** The parameter names a piece of client-facing text states, in the order read. */
export function parameterNamesIn(text) {
  if (text == null) return [];
  return [...String(text).matchAll(PARAMETER_NAME_PATTERN)].map((match) => match[0]);
}

/** The raw Performance Levels a piece of client-facing text states, in the order read. */
export function levelNamesIn(text) {
  if (text == null) return [];
  return [...String(text).matchAll(LEVEL_NAME_PATTERN)].map((match) => match[0]);
}

/**
 * Whether theme prose is client-safe: it names no parameter and states no raw
 * Performance Level. Audit only — it reports what it reads and changes nothing.
 */
export function themeClientTextIsSafe(text) {
  const parameters = parameterNamesIn(text);
  const levels = levelNamesIn(text);
  return {
    safe: parameters.length === 0 && levels.length === 0,
    parameters,
    levels,
    violations: [...parameters, ...levels],
  };
}

/* ── Building the themes from the classified evidence ────────────────────── */

/** The public member shape: the evidence, with nothing internal but the role. */
function memberOf(row) {
  return {
    key: String(row.key),
    parameter: row.parameter ?? null,
    level: row.level ?? null,
    value: row.value ?? null,
    priority: row.priority,
    role_label: PRIORITY_LABEL[row.priority] || null,
    weight: row.weight ?? null,
    seat_scope: row.seat_scope ?? SEAT_SCOPE.NONE,
    primary_seat_result: row.primary_seat_result ?? null,
    secondary_seat_result: row.secondary_seat_result ?? null,
  };
}

/** The stories that rest on any of this theme's parameters. */
function storiesOf(theme, stories) {
  const keys = new Set(theme.keys.map((key) => String(key).toUpperCase()));
  return (Array.isArray(stories) ? stories : []).filter((story) => (
    (Array.isArray(story?.evidence_parameter_ids) ? story.evidence_parameter_ids : [])
      .some((id) => keys.has(String(id).toUpperCase()))
  ));
}

/** The weakest published level among the rows a facet rests on. */
function facetRows(facet, members) {
  return members.filter((row) => facet.keys.includes(String(row.key)));
}

/** One bass facet, read at its own member's published result. */
function facetOf(facet, members) {
  const rows = facetRows(facet, members);
  const spoken = rows.filter((row) => mayAppearInNarrative(row.priority) && !row.silenced);
  const level = spoken.reduce(
    (acc, row) => (acc == null || levelRank(row.level) < levelRank(acc) ? row.level : acc),
    null,
  );
  const source = spoken.length > 0 ? spoken : rows;
  return {
    facet: facet.facet,
    question: facet.question,
    parameter_ids: facet.keys.map((key) => String(key).toUpperCase()),
    vocabulary: [...facet.vocabulary],
    level,
    values: source.map((row) => row.value).filter((value) => value != null),
    // The clause this facet's own result has already earned, from the register.
    clause: facet.area && level ? performancePhrase(facet.area, level) : null,
    available: spoken.length > 0 && level != null,
  };
}

/** The seat scope and the wording a theme's consistency claim allows. */
function seatScopeOf(members) {
  const row = members.find((member) => String(member.key) === 'p20') || null;
  const scope = row?.seat_scope && row.seat_scope !== SEAT_SCOPE.NONE ? row.seat_scope : null;
  if (!scope) return { seat_scope: null, scope_wording: null, banned_scope_wording: [] };
  return {
    seat_scope: scope,
    scope_wording: SEAT_SCOPE_WORDING[scope] || null,
    banned_scope_wording: scope === SEAT_SCOPE.PRIMARY ? [...WIDENED_SCOPE_WORDING] : [],
  };
}

/** The clause a consistency result has earned, at the seats it holds for. */
function consistencyClause(members) {
  const row = members.find((member) => String(member.key) === 'p20') || null;
  if (!row || row.silenced || !mayAppearInNarrative(row.priority)) return null;
  const scope = row.seat_scope;
  if (scope === SEAT_SCOPE.PRIMARY) {
    return p20ConsistencyPhrase({ level: row.primary_seat_result || row.level, scope });
  }
  if (scope === SEAT_SCOPE.ALL) {
    return p20ConsistencyPhrase({ level: row.level, scope });
  }
  return null;
}

/** The technical line the evidence table states: parameter, level and value. */
function evidenceTextOf(theme, members) {
  const stated = members
    .filter((member) => member.level || member.value)
    .map((member) => [
      String(member.key).toUpperCase(),
      member.level || null,
      member.value != null ? String(member.value) : null,
    ].filter(Boolean).join(' '));
  return stated.length > 0 ? `${theme.label}: ${stated.join(' · ')}` : `${theme.label}: no published result`;
}

/**
 * The themes one classified evidence set supports, ONE ENTRY PER THEME.
 *
 * @param {Object} input
 * @param {Array<Object>} input.rows — narrative rows (buildNarrativePriorityRows)
 * @param {Array<Object>} [input.stories] — the ranked strength stories of the same
 *   version, read ONLY for the claim IDs a theme may cite and for their rank
 * @returns {{themes: Array<Object>, byTheme: Object, silenced: Array<Object>}}
 */
export function buildClientStoryThemes({ rows = [], stories = [] } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const themes = [];
  const silenced = [];

  for (const themeKey of EXPERIENCE_THEME_ORDER) {
    const definition = EXPERIENCE_THEMES[themeKey];
    const members = list.filter((row) => row && definition.keys.includes(String(row.key))).map(memberOf);
    if (members.length === 0) continue;

    const spoken = members.filter((member) => mayAppearInNarrative(member.priority));
    if (spoken.length === 0) {
      silenced.push({
        theme: definition.key,
        label: definition.label,
        parameter_ids: members.map((member) => String(member.key).toUpperCase()),
        reason: 'no result in this theme may appear in the client-facing narrative',
      });
      continue;
    }

    const role = spoken.reduce(
      (acc, member) => (PRIORITY_RANK[member.priority] > PRIORITY_RANK[acc] ? member.priority : acc),
      spoken[0].priority,
    );
    const related = storiesOf(definition, stories);
    const ranks = related.map((story) => Number(story?.rank)).filter((rank) => Number.isFinite(rank));
    const claimIds = [...new Set(related.flatMap((story) => (
      Array.isArray(story?.allowed_claim_ids) ? story.allowed_claim_ids : []
    )))];
    const scope = seatScopeOf(members);
    const facets = definition.facets
      ? BASS_FACETS.map((facet) => facetOf(facet, members))
      : [];
    const clauses = [
      ...facets.map((facet) => facet.clause).filter(Boolean),
      definition.facets ? consistencyClause(members) : null,
    ].filter(Boolean);

    themes.push({
      theme: definition.key,
      label: definition.label,
      kind: definition.kind,
      rule: definition.rule,
      told: PRIORITY_RANK[role] >= PRIORITY_RANK.worth_mentioning || definition.kind === 'rationale',
      role,
      role_label: PRIORITY_LABEL[role] || null,
      rank: ranks.length > 0 ? Math.min(...ranks) : null,
      vocabulary: [...definition.vocabulary],
      parameter_ids: members.map((member) => String(member.key).toUpperCase()),
      members,
      // The bass facets: each read at its own member's published result.
      facets,
      facet_order: definition.facets ? [...BASS_FACET_ORDER] : [],
      seat_scope: scope.seat_scope,
      scope_wording: scope.scope_wording,
      banned_scope_wording: scope.banned_scope_wording,
      infrasonic: definition.facets
        ? infrasonicAllowance({
          depthLevel: facets.find((facet) => facet.facet === 'depth')?.level ?? null,
          depthValue: facets.find((facet) => facet.facet === 'depth')?.values?.[0] ?? null,
        })
        : null,
      // The clauses the register has already earned for this theme's own results.
      client_clauses: clauses,
      claim_ids: claimIds,
      // The technical line: this is where parameter numbers belong.
      evidence_text: evidenceTextOf(definition, members),
      prose_scope: 'technical_evidence_table_only',
    });
  }

  const ordered = [...themes].sort((a, b) => {
    const left = (a.rank ?? 99) - (b.rank ?? 99);
    if (left !== 0) return left;
    const right = PRIORITY_RANK[b.role] - PRIORITY_RANK[a.role];
    if (right !== 0) return right;
    return EXPERIENCE_THEME_ORDER.indexOf(a.theme) - EXPERIENCE_THEME_ORDER.indexOf(b.theme);
  });

  return {
    themes: ordered,
    byTheme: Object.fromEntries(ordered.map((theme) => [theme.theme, theme])),
    silenced,
  };
}

/**
 * The block the writer input carries: the rules the copy is held to, and the
 * themes themselves per option. It states no figure of its own — every figure the
 * writer uses still comes from the frozen evidence and its own claims.
 */
export function buildClientStoryThemeBlock({ rows = [], stories = [] } = {}) {
  const { themes, silenced } = buildClientStoryThemes({ rows, stories });
  return {
    version: NARRATIVE_THEME_VERSION,
    rule: ONE_STORY_PER_THEME_RULE,
    telling_rule: THEME_TELLING_RULE,
    parameter_silence_rule: THEME_PARAMETER_SILENCE_RULE,
    bass_rule: BASS_NARRATIVE_RULE,
    seat_scope_rule: PRIMARY_SEAT_SCOPE_RULE,
    infrasonic_rule: INFRASONIC_RULE,
    infrasonic_boundary_hz: INFRASONIC_EXTENSION_HZ,
    facets: BASS_FACETS.map((facet) => ({
      facet: facet.facet,
      question: facet.question,
      parameter_ids: facet.keys.map((key) => String(key).toUpperCase()),
      vocabulary: [...facet.vocabulary],
    })),
    vocabulary: [...EXPERIENCE_THEMES[EXPERIENCE_THEME.BASS].vocabulary],
    themes: themes.map((theme) => ({ ...theme })),
    silenced,
    source: 'the canonical narrative theme grouping, over the same classified evidence as strength_stories',
  };
}

/** The block as prompt lines, so the rules reach the writer as it reads its contract. */
export function clientStoryThemeLines() {
  return [
    '=== ONE STORY PER EXPERIENCE THEME ===',
    ONE_STORY_PER_THEME_RULE,
    THEME_TELLING_RULE,
    THEME_PARAMETER_SILENCE_RULE,
    BASS_NARRATIVE_RULE,
    INFRASONIC_RULE,
    PRIMARY_SEAT_SCOPE_RULE,
    'The themes and the results that tell each one are carried per option in evidence.options[].client_story_themes, with the facets of the bass story, the clause each result has earned, the claims to cite and the seats each claim holds for.',
    '',
  ];
}

export default buildClientStoryThemes;