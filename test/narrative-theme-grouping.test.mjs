/**
 * narrative-theme-grouping.test.mjs
 * ---------------------------------
 * ONE STORY PER EXPERIENCE THEME.
 *
 * The acceptance this suite proves:
 *   - the four bass results (P14, P18, P19, P20) become ONE bass theme, read
 *     through output, depth, control and consistency at their own results;
 *   - no paragraph per parameter: every parameter sits in exactly one theme;
 *   - infrasonic language only where the extension genuinely supports it;
 *   - a consistency claim is scoped to the seats that support it, and the wider
 *     wording is refused where only the primary seats hold it;
 *   - the families are grouped (dynamic impact, tonal consistency, spatial
 *     precision, seating rationale), with the seating kept as rationale;
 *   - theme prose names no parameter and states no raw Performance Level;
 *   - the writer is given the themes, not a parameter list.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BASS_FACETS,
  BASS_FACET_ORDER,
  EXPERIENCE_THEMES,
  EXPERIENCE_THEME,
  INFRASONIC_EXTENSION_HZ,
  WIDENED_SCOPE_WORDING,
  buildClientStoryThemeBlock,
  buildClientStoryThemes,
  experienceThemeOf,
  extensionHz,
  infrasonicAllowance,
  parameterNamesIn,
  themeClientTextIsSafe,
} from '../base44/shared/narrativeThemeGrouping.js';
import { buildNarrativePriorityRows } from '../base44/shared/narrativePriorityAuthority.js';
import { summaryFromReportEvidence } from '../base44/shared/strengthImportance.js';
import { BRIEF_INTENT } from '../base44/shared/briefRelevance.js';
import { SEAT_SCOPE } from '../base44/shared/seatScopeNarrativeAuthority.js';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** One frozen evidence parameter row, with optional per-seat results. */
const row = (parameter_id, level, { scope = 'room', seats = [], value = null, state = 'scored' } = {}) => ({
  parameter_id,
  level,
  scope,
  state,
  value,
  supporting_per_seat: seats.map(([seat_id, seatLevel, priority]) => ({ seat_id, level: seatLevel, priority })),
});

const rowsOf = (parameters) => buildNarrativePriorityRows({
  summary: summaryFromReportEvidence({ parameters }),
  intent: BRIEF_INTENT.DEDICATED_CINEMA,
  design: { display: true, speakers: true, seats: 6, bass: true, spatial: true, timbre: true, screenChannels: true },
}).rows;

/** The four bass results, with the consistency result holding for the primary seats. */
const bassRows = () => rowsOf([
  row(14, 'L3', { value: '119 dB' }),
  row(18, 'L3', { value: '20 Hz' }),
  row(19, 'L3', { value: '±2 dB' }),
  row(20, null, { scope: 'seat', seats: [['r1c1', 'L3', 'primary'], ['r1c2', 'L3', 'primary'], ['r2c1', 'L1', 'secondary']] }),
]);

/* ── 1 · the bass is one story in four parts ──────────────────────────────── */

test('the four bass results become ONE theme, read as output, depth, control and consistency', () => {
  const { themes } = buildClientStoryThemes({ rows: bassRows() });
  assert.equal(themes.length, 1, `expected one theme, read ${themes.map((theme) => theme.theme).join(', ')}`);

  const bass = themes[0];
  assert.equal(bass.theme, EXPERIENCE_THEME.BASS);
  assert.equal(bass.kind, 'performance');
  assert.deepEqual(bass.parameter_ids, ['P14', 'P18', 'P19', 'P20'], 'all four results tell the one story');
  assert.deepEqual(bass.facets.map((facet) => facet.facet), [...BASS_FACET_ORDER]);
  assert.deepEqual([...BASS_FACET_ORDER], ['output', 'depth', 'control', 'consistency']);

  const facet = (name) => bass.facets.find((entry) => entry.facet === name);
  assert.equal(facet('output').level, 'L3');
  assert.equal(facet('depth').level, 'L3');
  assert.equal(facet('control').level, 'L3');
  assert.equal(facet('consistency').level, 'L3');
  assert.deepEqual(facet('output').parameter_ids, ['P14']);
  assert.deepEqual(facet('depth').parameter_ids, ['P18']);
  assert.deepEqual(facet('control').parameter_ids, ['P19']);
  assert.deepEqual(facet('consistency').parameter_ids, ['P20']);

  // Each facet answers its own question, in the client's language.
  assert.match(facet('output').question, /authority and headroom/);
  assert.match(facet('depth').question, /how low/);
  assert.match(facet('control').question, /follow the target/);
  assert.match(facet('consistency').question, /primary seats/);
  assert.deepEqual(bass.vocabulary, ['power', 'depth', 'scale', 'impact', 'physicality', 'control', 'consistency']);

  // The clause each result has already earned, from the register — the theme
  // invents no client language of its own.
  assert.match(facet('depth').clause, /very deep, powerful bass/);
  assert.match(facet('output').clause, /powerful/);
  assert.equal(facet('control').clause, null, 'P19 has no register area, so no clause is invented');
  assert.ok(bass.client_clauses.length >= 2);
  assert.ok(bass.client_clauses.some((clause) => /bass consistency/.test(clause)));
});

/* ── 2 · never one paragraph per parameter ───────────────────────────────── */

test('every parameter sits in exactly one theme: no paragraph per parameter', () => {
  const rows = rowsOf([
    row(1, 'L3', { value: '1.4 m' }),
    row(3, 'L4'), row(4, 'L3'), row(5, 'L3'), row(11, 'L3'),
    row(12, 'L3'), row(13, 'L4'),
    row(14, 'L4'), row(18, 'L4', { value: '18 Hz' }), row(19, 'L4'), row(20, null, { scope: 'seat', seats: [['r1c1', 'L4', 'primary']] }),
    row(16, 'L4'), row(17, 'L3'),
  ]);
  const { themes } = buildClientStoryThemes({ rows });
  assert.equal(themes.length, 5, `expected five themes, read ${themes.map((theme) => theme.theme).join(', ')}`);
  assert.deepEqual(themes.map((theme) => theme.theme).sort(), [
    EXPERIENCE_THEME.BASS, EXPERIENCE_THEME.DYNAMIC_IMPACT, EXPERIENCE_THEME.SEATING_RATIONALE,
    EXPERIENCE_THEME.SPATIAL_PRECISION, EXPERIENCE_THEME.TONAL_CONSISTENCY,
  ].sort());

  // Thirteen parameters, five stories: the bass alone is four results in one.
  const placed = themes.flatMap((theme) => theme.parameter_ids);
  assert.equal(placed.length, 13);
  assert.equal(new Set(placed).size, 13, 'a parameter belongs to exactly one theme');
  const bass = themes.find((theme) => theme.theme === EXPERIENCE_THEME.BASS);
  assert.equal(bass.members.length, 4);
  assert.equal(bass.facets.length, 4);

  // The theme families, and the parameters in each.
  assert.deepEqual(EXPERIENCE_THEMES[EXPERIENCE_THEME.DYNAMIC_IMPACT].keys, ['p12', 'p13']);
  assert.deepEqual(EXPERIENCE_THEMES[EXPERIENCE_THEME.TONAL_CONSISTENCY].keys, ['p16', 'p17']);
  assert.deepEqual(EXPERIENCE_THEMES[EXPERIENCE_THEME.SPATIAL_PRECISION].keys, ['p3', 'p4', 'p5', 'p11']);
  assert.equal(experienceThemeOf('p14'), EXPERIENCE_THEME.BASS);
  assert.equal(experienceThemeOf('p20'), EXPERIENCE_THEME.BASS);
  assert.equal(experienceThemeOf('p1'), EXPERIENCE_THEME.SEATING_RATIONALE);

  // A small number of themes is told: only the strongest are told through.
  const told = themes.filter((theme) => theme.told);
  assert.ok(told.length <= 4, `expected a small number of told themes, read ${told.length}`);
  assert.ok(told.length >= 1);
});

/* ── 3 · infrasonic language must be earned ──────────────────────────────── */

test('infrasonic language only where the extension genuinely supports it', () => {
  assert.equal(INFRASONIC_EXTENSION_HZ, 20);
  assert.equal(extensionHz('18 Hz'), 18);
  assert.equal(extensionHz('1.4 m'), null);

  const allowed = infrasonicAllowance({ depthLevel: 'L4', depthValue: '18 Hz' });
  assert.equal(allowed.allowed, true);
  assert.ok(allowed.phrases.includes('infrasonic depth'));
  assert.ok(allowed.phrases.includes('physical scale'));
  assert.ok(allowed.phrases.includes('felt as much as heard'));
  assert.ok(allowed.phrases.includes('genuine low-frequency authority'));

  // A minimum-L3 extension reaches the 20 Hz boundary, with or without a value.
  assert.equal(infrasonicAllowance({ depthLevel: 'L3', depthValue: '20 Hz' }).allowed, true);
  assert.equal(infrasonicAllowance({ depthLevel: 'L3' }).allowed, true);

  // Refused: a moderate result, a value that disagrees with the level, and nothing.
  assert.equal(infrasonicAllowance({ depthLevel: 'L2', depthValue: '30 Hz' }).allowed, false);
  assert.equal(infrasonicAllowance({ depthLevel: 'L2' }).allowed, false);
  const disagreed = infrasonicAllowance({ depthLevel: 'L3', depthValue: '25 Hz' });
  assert.equal(disagreed.allowed, false);
  assert.match(disagreed.reason, /25 Hz/);
  assert.equal(infrasonicAllowance({}).allowed, false);
  assert.equal(infrasonicAllowance({ depthLevel: 'L4' }).phrases.length, 4);

  // The theme reads its own depth facet, so a moderate extension allows none.
  const moderate = buildClientStoryThemes({
    rows: rowsOf([row(18, 'L2', { value: '30 Hz' }), row(14, 'L4')]),
  }).themes.find((theme) => theme.theme === EXPERIENCE_THEME.BASS);
  assert.equal(moderate.infrasonic.allowed, false);
  assert.deepEqual(moderate.infrasonic.phrases, []);

  const deep = buildClientStoryThemes({
    rows: rowsOf([row(18, 'L4', { value: '18 Hz' }), row(14, 'L4')]),
  }).themes.find((theme) => theme.theme === EXPERIENCE_THEME.BASS);
  assert.equal(deep.infrasonic.allowed, true);
});

/* ── 4 · the consistency claim keeps its seat scope ──────────────────────── */

test('a consistency result is stated for the seats that support it, never wider', () => {
  const primary = buildClientStoryThemes({ rows: bassRows() }).themes[0];
  assert.equal(primary.seat_scope, SEAT_SCOPE.PRIMARY);
  assert.equal(primary.scope_wording, 'across the primary seating area');
  assert.deepEqual(primary.banned_scope_wording, [...WIDENED_SCOPE_WORDING]);
  const clause = primary.client_clauses.find((entry) => /consistency/.test(entry));
  assert.match(clause, /primary seats/);
  assert.ok(!/across the room/i.test(clause), 'a primary-seat result is never widened');

  // Where the whole assessed seating holds the result, the wider wording is allowed.
  const all = buildClientStoryThemes({
    rows: rowsOf([
      row(14, 'L3'), row(18, 'L3'), row(19, 'L3'),
      row(20, null, { scope: 'seat', seats: [['r1c1', 'L3', 'primary'], ['r2c1', 'L3', 'secondary']] }),
    ]),
  }).themes.find((theme) => theme.theme === EXPERIENCE_THEME.BASS);
  assert.equal(all.seat_scope, SEAT_SCOPE.ALL);
  assert.equal(all.scope_wording, 'across the seating');
  assert.deepEqual(all.banned_scope_wording, []);
});

/* ── 5 · the seating is rationale, not a performance boast ───────────────── */

test('the seating theme is the seating decision explained, never a headline result', () => {
  const rows = rowsOf([row(1, 'L4', { value: '1.4 m' })]);
  const { themes } = buildClientStoryThemes({ rows });
  assert.equal(themes.length, 1);
  const seating = themes[0];
  assert.equal(seating.theme, EXPERIENCE_THEME.SEATING_RATIONALE);
  assert.equal(seating.kind, 'rationale');
  assert.equal(seating.told, true, 'a design decision is still part of the narrative');
  assert.equal(seating.facets.length, 0, 'the seating has no bass facets');
  assert.deepEqual(seating.parameter_ids, ['P1']);
  assert.match(seating.rule, /never as a performance boast/);
  assert.ok(!/flagship|headline performance/.test(seating.rule));
  assert.match(experienceThemeOf('p1'), /seating_rationale/);
});

/* ── 6 · theme prose names no parameter and no raw level ─────────────────── */

test('a theme is told in the client\'s language, never as parameter statements', () => {
  const bass = buildClientStoryThemes({ rows: bassRows() }).themes[0];
  const prose = [bass.scope_wording, ...bass.client_clauses].join(' ');
  assert.deepEqual(parameterNamesIn(prose), []);
  assert.equal(themeClientTextIsSafe(prose).safe, true);

  // The technical line is where parameter numbers belong.
  assert.match(bass.evidence_text, /P14/);
  assert.match(bass.evidence_text, /P18/);
  assert.equal(bass.prose_scope, 'technical_evidence_table_only');

  // What must never be written, and what may be.
  const forbidden = themeClientTextIsSafe('P14 is L3. P18 is L4. P20 is L3.');
  assert.equal(forbidden.safe, false);
  assert.deepEqual(forbidden.parameters, ['P14', 'P18', 'P20']);
  assert.deepEqual(forbidden.levels, ['L3', 'L4', 'L3']);
  const approved = themeClientTextIsSafe(
    'The bass system combines strong output with very deep extension and remains well controlled across the primary seating area.',
  );
  assert.equal(approved.safe, true);

  // The rules the writer is held to say so, in the module and in the prompt lines.
  const block = buildClientStoryThemeBlock({ rows: bassRows() });
  assert.match(block.rule, /ONE STORY PER EXPERIENCE THEME, NEVER ONE PARAGRAPH PER PARAMETER/);
  assert.match(block.parameter_silence_rule, /no "P14 is L3"/);
  assert.match(block.bass_rule, /ONE STORY IN FOUR PARTS/);
  assert.match(block.seat_scope_rule, /across the primary seating area/);
  assert.match(block.infrasonic_rule, /INFRASONIC LANGUAGE MUST BE EARNED/);
  assert.equal(block.themes.length, 1);
  assert.deepEqual(block.facets.map((entry) => entry.facet), ['output', 'depth', 'control', 'consistency']);
  assert.deepEqual(block.vocabulary, ['power', 'depth', 'scale', 'impact', 'physicality', 'control', 'consistency']);
  assert.match(block.source, /theme grouping/);
});

/* ── 7 · the writer is given the themes ──────────────────────────────────── */

test('the themes travel to the writer beside the ranked evidence', () => {
  const evidenceBuilder = source('base44/shared/proposalEvidence/proposalEvidenceBuilder.js');
  assert.match(evidenceBuilder, /buildClientStoryThemes/);
  assert.match(evidenceBuilder, /client_story_themes/);
  assert.match(evidenceBuilder, /buildNarrativePriorityRows/);

  const inputBuilder = source('base44/shared/proposalWriter/writerInputBuilder.js');
  assert.match(inputBuilder, /client_story_themes/);
  assert.match(inputBuilder, /ONE_STORY_PER_THEME_RULE/);

  const promptBuilder = source('base44/shared/proposalWriter/writerPromptBuilder.js');
  assert.match(promptBuilder, /clientStoryThemeLines/);

  // The themes do not replace the ranked evidence: the ranking still governs emphasis.
  assert.match(evidenceBuilder, /strength_stories/);
  assert.match(source('base44/shared/strengthStories.js'), /low-frequency-extension/);

  // The theme grouping is a reading of the evidence and changes nothing in it.
  const module = source('base44/shared/narrativeThemeGrouping.js');
  assert.ok(!/write|update|mutate/.test(module.split('WHAT IT NEVER DOES')[1].split('*/')[0] || ''));
});

/* ── 8 · a silenced subject is not told, and the evidence stays ───────────── */

test('a steering exclusion silences a theme without touching its results', () => {
  const rows = buildNarrativePriorityRows({
    summary: summaryFromReportEvidence({
      parameters: [
        row(1, 'L3', { value: '1.4 m' }),
        row(14, 'L4'), row(18, 'L4', { value: '18 Hz' }), row(19, 'L4'),
        row(20, null, { scope: 'seat', seats: [['r1c1', 'L4', 'primary']] }),
      ],
    }),
    intent: BRIEF_INTENT.DEDICATED_CINEMA,
    design: { display: true, speakers: true, seats: 6, bass: true, spatial: true, timbre: true, screenChannels: true },
    excludedTopics: ['seating_arrangement'],
  }).rows;

  const { themes, silenced } = buildClientStoryThemes({ rows });
  assert.ok(silenced.some((entry) => entry.theme === EXPERIENCE_THEME.SEATING_RATIONALE));
  assert.ok(!themes.some((entry) => entry.theme === EXPERIENCE_THEME.SEATING_RATIONALE));

  // The bass story is untouched: the exclusion changes what is told, not the evidence.
  const bass = themes.find((entry) => entry.theme === EXPERIENCE_THEME.BASS);
  assert.deepEqual(bass.parameter_ids, ['P14', 'P18', 'P19', 'P20']);
  assert.equal(bass.facets.find((entry) => entry.facet === 'depth').level, 'L4');
  assert.equal(bass.members.find((member) => member.key === 'p14').level, 'L4');
  assert.equal(bass.infrasonic.allowed, true);
});