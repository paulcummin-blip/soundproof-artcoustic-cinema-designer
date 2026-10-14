/**
 * narrative-pillar-grouping.test.mjs
 * -----------------------------------
 * THE THREE PILLARS ORGANISE THE CLIENT STORY. RP22 PARAMETERS ARE THE EVIDENCE.
 *
 * The acceptance this suite proves:
 *   - the bass results become ONE Dynamic Range story, read in four parts (output,
 *     depth, control and consistency), with P19 and P20 supporting that same story;
 *   - the story is organised by three pillars, never by parameter, and the seating
 *     stays a design decision rather than a fourth pillar;
 *   - infrasonic language only where the extension genuinely supports it;
 *   - a consistency claim keeps the exact seat scope its result holds for;
 *   - the brief decides whether a result is a success, never the level alone;
 *   - the measured evidence is never merely reported;
 *   - the writer is given the pillars and their evidence, not a parameter list.
 *
 * The shared authorities are loaded from the repository root, so this suite runs
 * whether it is placed under src/test or test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = [
  new URL('../', import.meta.url),
  new URL('../../', import.meta.url),
].find((base) => existsSync(new URL('base44/shared/narrativePillars.js', base)))
  || new URL('../', import.meta.url);

const shared = (name) => import(new URL(`base44/shared/${name}`, ROOT).href);
const source = (path) => readFileSync(new URL(path, ROOT), 'utf8');

const {
  buildClientStoryPillarBlock,
  buildClientStoryPillars,
} = await shared('narrativePillarGrouping.js');
const {
  BASS_PART_ORDER,
  BRIEF_CONTEXT_RULE,
  EVIDENCE_NOT_HEADLINE_RULE,
  INFRASONIC_EXTENSION_HZ,
  PILLAR,
  PILLAR_EVIDENCE,
  PILLAR_ORDER,
  PILLARS,
  PILLAR_STRUCTURE_RULE,
  clientStoryTextIsSafe,
  extensionHz,
  infrasonicAllowance,
  pillarOf,
  rawMeasurementsIn,
} = await shared('narrativePillars.js');
const { buildNarrativePriorityRows } = await shared('narrativePriorityAuthority.js');
const { summaryFromReportEvidence } = await shared('strengthImportance.js');
const { BRIEF_INTENT } = await shared('briefRelevance.js');
const { NARRATIVE_PRIORITY } = await shared('narrativeRoles.js');
const { SEAT_SCOPE } = await shared('seatScopeNarrativeAuthority.js');

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

/* ── 1 · the bass is one Dynamic Range story in four parts ───────────────── */

test('the bass strengthens ONE pillar: Dynamic Range, read in four parts', () => {
  const { pillars } = buildClientStoryPillars({ rows: bassRows() });
  assert.equal(pillars.length, 1, `expected one pillar, read ${pillars.map((pillar) => pillar.label).join(', ')}`);

  const dynamic = pillars[0];
  assert.equal(dynamic.pillar, PILLAR.DYNAMIC_RANGE);
  assert.equal(dynamic.label, 'Dynamic Range');
  assert.deepEqual(dynamic.parameter_ids, ['P14', 'P18', 'P19', 'P20'], 'all four results strengthen the one pillar');
  assert.ok(!pillars.some((pillar) => /^bass/i.test(pillar.label)), 'the bass is never a pillar of its own');

  // P19 and P20 support the same story rather than creating two more.
  assert.deepEqual(PILLAR_EVIDENCE[PILLAR.DYNAMIC_RANGE].supporting, ['p19', 'p20']);
  assert.deepEqual(PILLAR_EVIDENCE[PILLAR.DYNAMIC_RANGE].primary, ['p12', 'p13', 'p14', 'p18']);

  assert.deepEqual(dynamic.parts.map((part) => part.part), [...BASS_PART_ORDER]);
  assert.deepEqual([...BASS_PART_ORDER], ['output', 'depth', 'control', 'consistency']);
  const part = (name) => dynamic.parts.find((entry) => entry.part === name);
  assert.equal(part('output').level, 'L3');
  assert.equal(part('depth').level, 'L3');
  assert.equal(part('control').level, 'L3');
  assert.equal(part('consistency').level, 'L3', 'the consistency part states the primary seats\' own result');
  assert.equal(part('control').supporting, true);
  assert.equal(part('consistency').supporting, true);
  assert.equal(part('output').supporting, false);

  // What the client notices, and the clause each result has already earned.
  assert.match(part('depth').notices, /scale and physical weight/);
  assert.match(part('consistency').notices, /shared rather than concentrated/);
  assert.match(part('depth').clause, /very deep, powerful bass/);
  assert.match(part('output').clause, /powerful/);
  assert.match(part('control').clause, /tightly controlled|well controlled|composed/, 'the response result carries the register\'s own control language');
  assert.equal(part('control').told, true, 'the qualifying part is told with the story it qualifies, never dropped for rank');
  assert.ok(dynamic.client_clauses.some((clause) => /bass consistency/.test(clause)));

  // Why the client cares is carried by the pillar itself.
  assert.match(dynamic.why_care, /excitement/);
  assert.match(dynamic.why_care, /contrast between quiet detail and explosive moments/);
  assert.match(dynamic.question, /quiet dialogue and detail to large-scale impact/);
});

/* ── 2 · three pillars, never a parameter per story ──────────────────────── */

test('the client story is organised by three pillars, never by parameter', () => {
  const rows = rowsOf([
    row(1, 'L3', { value: '1.4 m' }),
    row(12, 'L3'), row(13, 'L4'),
    row(14, 'L4'), row(18, 'L4', { value: '18 Hz' }), row(19, 'L4'),
    row(20, null, { scope: 'seat', seats: [['r1c1', 'L4', 'primary']] }),
    row(3, 'L4'), row(4, 'L3'), row(5, 'L3'), row(11, 'L3'),
    row(16, 'L4'), row(17, 'L3'),
  ]);
  const { pillars, non_pillar } = buildClientStoryPillars({ rows });

  assert.equal(pillars.length, 3, `expected three pillars, read ${pillars.map((pillar) => pillar.label).join(', ')}`);
  assert.deepEqual(pillars.map((pillar) => pillar.label).sort(), ['Dynamic Range', 'Spatial Resolution', 'Timbre Matching'].sort());
  assert.deepEqual([...PILLAR_ORDER], ['dynamic_range', 'spatial_resolution', 'timbre_matching']);
  assert.equal(PILLARS[PILLAR.DYNAMIC_RANGE].label, 'Dynamic Range');

  // Twelve results strengthen three pillars; the seating decision is not one of them.
  const placed = pillars.flatMap((pillar) => pillar.parameter_ids);
  assert.equal(placed.length, 12);
  assert.equal(new Set(placed).size, 12, 'a parameter strengthens exactly one pillar');
  assert.ok(non_pillar.includes('P1'), 'the seating is a design decision, not a pillar result');
  assert.ok(
    !non_pillar.some((key) => ['P12', 'P13', 'P14', 'P18', 'P19', 'P20', 'P3', 'P4', 'P5', 'P11', 'P16', 'P17'].includes(key)),
    `every pillar result is placed, read ${non_pillar.join(', ')}`,
  );
  assert.equal(pillarOf('p14'), PILLAR.DYNAMIC_RANGE);
  assert.equal(pillarOf('p20'), PILLAR.DYNAMIC_RANGE);
  assert.equal(pillarOf('p3'), PILLAR.SPATIAL_RESOLUTION);
  assert.equal(pillarOf('p11'), PILLAR.SPATIAL_RESOLUTION);
  assert.equal(pillarOf('p16'), PILLAR.TIMBRE_MATCHING);
  assert.equal(pillarOf('p1'), null, 'the seating is a design decision, not a pillar');

  // Spatial and tonal evidence is ONE story each; only the bass is read in parts.
  const spatial = pillars.find((pillar) => pillar.pillar === PILLAR.SPATIAL_RESOLUTION);
  const timbre = pillars.find((pillar) => pillar.pillar === PILLAR.TIMBRE_MATCHING);
  const dynamic = pillars.find((pillar) => pillar.pillar === PILLAR.DYNAMIC_RANGE);
  assert.deepEqual(spatial.parameter_ids.slice().sort(), ['P11', 'P3', 'P4', 'P5']);
  assert.deepEqual(timbre.parameter_ids.slice().sort(), ['P16', 'P17']);
  assert.equal(spatial.parts.length, 0, 'the placement results are one story, not four talking points');
  assert.equal(timbre.parts.length, 0);
  assert.equal(dynamic.parts.length, 4);
  assert.match(spatial.why_care, /believable space instead of sounding like individual speakers/);
  assert.match(timbre.why_care, /one coherent environment rather than a collection of different loudspeakers/);

  // The rules say so, in the module and in the block the writer receives.
  const block = buildClientStoryPillarBlock({ rows });
  assert.match(PILLAR_STRUCTURE_RULE, /never produce "Bass Output \/ Bass Extension \/ Bass Response \/ Bass Consistency" as four stories/);
  assert.match(block.structure_rule, /RP22 parameters are the evidence underneath them, never the structure/);
  assert.match(block.structure_rule, /Produce Dynamic Range as one fluent story/);
  assert.equal(block.pillars.length, 3);
  assert.deepEqual(block.pillars.map((pillar) => pillar.label).sort(), ['Dynamic Range', 'Spatial Resolution', 'Timbre Matching'].sort());
  assert.match(block.core_rule, /ASDR tells us what matters/);
  assert.match(block.core_rule, /brief tells us whether that performance is right for this project/);
  assert.match(block.hierarchy_rule, /It never runs parameter, paragraph, next parameter/);
  assert.match(block.method_rule, /which of the three pillars does this strengthen/);
  assert.match(block.seating_note, /never turned into a pillar of its own/);
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

  assert.equal(infrasonicAllowance({ depthLevel: 'L3', depthValue: '20 Hz' }).allowed, true);
  assert.equal(infrasonicAllowance({ depthLevel: 'L3' }).allowed, true);
  assert.equal(infrasonicAllowance({ depthLevel: 'L2', depthValue: '30 Hz' }).allowed, false);
  const disagreed = infrasonicAllowance({ depthLevel: 'L3', depthValue: '25 Hz' });
  assert.equal(disagreed.allowed, false);
  assert.match(disagreed.reason, /25 Hz/);
  assert.equal(infrasonicAllowance({}).allowed, false);

  const deep = buildClientStoryPillars({ rows: rowsOf([row(18, 'L4', { value: '18 Hz' }), row(14, 'L4')]) });
  assert.equal(deep.pillars[0].infrasonic.allowed, true);
  const moderate = buildClientStoryPillars({ rows: rowsOf([row(18, 'L2', { value: '30 Hz' }), row(14, 'L4')]) });
  assert.equal(moderate.pillars[0].infrasonic.allowed, false);
  assert.deepEqual(moderate.pillars[0].infrasonic.phrases, []);

  // The register example may claim infrasonic depth; the pillar decides when.
  const example = PILLARS[PILLAR.DYNAMIC_RANGE].register_examples[1];
  assert.match(example, /infrasonic depth/);
  assert.equal(clientStoryTextIsSafe(example).safe, true);
});

/* ── 4 · the consistency claim keeps its seat scope ──────────────────────── */

test('the bass consistency claim keeps the exact seat scope its result holds for', () => {
  const primary = buildClientStoryPillars({ rows: bassRows() }).pillars[0];
  assert.equal(primary.seat_scope, SEAT_SCOPE.PRIMARY);
  assert.equal(primary.scope_wording, 'across the primary seating area');
  assert.ok(primary.banned_scope_wording.includes('across the room'));
  const clause = primary.client_clauses.find((entry) => /consistency/.test(entry));
  assert.match(clause, /primary seats/);
  assert.ok(!/across the room/i.test(clause));

  const all = buildClientStoryPillars({
    rows: rowsOf([
      row(14, 'L3'), row(18, 'L3'), row(19, 'L3'),
      row(20, null, { scope: 'seat', seats: [['r1c1', 'L3', 'primary'], ['r2c1', 'L3', 'secondary']] }),
    ]),
  }).pillars[0];
  assert.equal(all.seat_scope, SEAT_SCOPE.ALL);
  assert.equal(all.scope_wording, 'across the seating');
  assert.deepEqual(all.banned_scope_wording, []);
});

/* ── 5 · the brief decides whether a result is a success ─────────────────── */

test('success is read against the brief, never from the level alone', () => {
  assert.match(BRIEF_CONTEXT_RULE, /television lounge may achieve L1 or L2/);
  assert.match(BRIEF_CONTEXT_RULE, /reference-quality twelve-seat dedicated cinema may be a limitation/);
  assert.match(BRIEF_CONTEXT_RULE, /Never judge success from an RP22 Performance Level alone/);

  const block = buildClientStoryPillarBlock({ rows: rowsOf([row(14, 'L2')]) });
  assert.equal(block.brief_rule, BRIEF_CONTEXT_RULE);
  assert.match(block.pillars[0].success_note, /right for the intended use/);
  assert.match(PILLARS[PILLAR.SPATIAL_RESOLUTION].success_note, /small room does not need theatre distances/);
  assert.match(PILLARS[PILLAR.TIMBRE_MATCHING].success_note, /whatever the level achieved/);
});

/* ── 6 · the evidence is never merely reported ───────────────────────────── */

test('a pillar is told in the client\'s language, never as a measured result', () => {
  assert.match(EVIDENCE_NOT_HEADLINE_RULE, /99 dBC/);
  assert.match(EVIDENCE_NOT_HEADLINE_RULE, /26 Hz/);
  assert.match(EVIDENCE_NOT_HEADLINE_RULE, /Level 3/);

  const dynamic = buildClientStoryPillars({ rows: bassRows() }).pillars[0];
  const prose = [dynamic.scope_wording, dynamic.why_care, ...dynamic.client_clauses].join(' ');
  assert.equal(clientStoryTextIsSafe(prose).safe, true);
  assert.deepEqual(rawMeasurementsIn(prose), []);

  // The technical line is where the parameter numbers and the measured results belong.
  assert.match(dynamic.evidence_text, /P14/);
  assert.match(dynamic.evidence_text, /P18/);
  assert.equal(dynamic.prose_scope, 'technical_evidence_table_only');
  assert.deepEqual(rawMeasurementsIn('99 dBC and 26 Hz'), ['99 dBC', '26 Hz']);
  assert.equal(clientStoryTextIsSafe('P14 L3 at 26 Hz').safe, false);
});

/* ── 7 · the writer is given the pillars and their evidence ──────────────── */

test('the pillars travel to the writer beside the ranked evidence', () => {
  const evidenceBuilder = source('base44/shared/proposalEvidence/proposalEvidenceBuilder.js');
  assert.match(evidenceBuilder, /buildClientStoryPillars/);
  assert.match(evidenceBuilder, /client_story_pillars/);
  assert.match(evidenceBuilder, /buildNarrativePriorityRows/);
  assert.match(evidenceBuilder, /strength_stories/, 'the ranking still travels: the pillars group what is told');

  const inputBuilder = source('base44/shared/proposalWriter/writerInputBuilder.js');
  assert.match(inputBuilder, /client_story_pillars/);
  assert.match(inputBuilder, /clientStoryPillarRules/);

  const promptBuilder = source('base44/shared/proposalWriter/writerPromptBuilder.js');
  assert.match(promptBuilder, /clientStoryPillarLines/);

  // One authority: the earlier theme grouping is gone from the pipeline.
  for (const body of [evidenceBuilder, inputBuilder, promptBuilder]) {
    assert.ok(!/narrativeThemeGrouping/.test(body));
  }
});

/* ── 8 · a silenced pillar is not told, and the evidence stays ───────────── */

test('a steering exclusion silences a pillar without touching its results', () => {
  const silencedRows = [
    { key: 'p3', level: 'L4', priority: NARRATIVE_PRIORITY.DO_NOT_DISCUSS, seat_scope: SEAT_SCOPE.NONE },
    { key: 'p4', level: 'L4', priority: NARRATIVE_PRIORITY.DO_NOT_DISCUSS, seat_scope: SEAT_SCOPE.NONE },
    { key: 'p5', level: 'L3', priority: NARRATIVE_PRIORITY.DO_NOT_DISCUSS, seat_scope: SEAT_SCOPE.NONE },
  ];
  const { pillars, silenced } = buildClientStoryPillars({ rows: silencedRows });

  assert.ok(silenced.some((entry) => entry.pillar === PILLAR.SPATIAL_RESOLUTION));
  assert.ok(!pillars.some((entry) => entry.pillar === PILLAR.SPATIAL_RESOLUTION));
  assert.match(silenced[0].reason, /may appear in the client-facing narrative/);

  // The exclusion changes what is told, not the evidence: the results are untouched.
  assert.deepEqual(silencedRows.map((entry) => entry.level), ['L4', 'L4', 'L3']);
  assert.deepEqual(silencedRows.map((entry) => entry.priority), Array(3).fill(NARRATIVE_PRIORITY.DO_NOT_DISCUSS));

  // The bass story is unaffected by an exclusion elsewhere.
  const { pillars: bassPillars } = buildClientStoryPillars({ rows: bassRows() });
  const dynamic = bassPillars.find((entry) => entry.pillar === PILLAR.DYNAMIC_RANGE);
  assert.deepEqual(dynamic.parameter_ids, ['P14', 'P18', 'P19', 'P20']);
  assert.equal(dynamic.parts.find((part) => part.part === 'depth').level, 'L3');
});