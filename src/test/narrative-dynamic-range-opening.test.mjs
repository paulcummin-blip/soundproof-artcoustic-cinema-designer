/**
 * narrative-dynamic-range-opening.test.mjs
 * ----------------------------------------
 * DYNAMIC RANGE OPENS ON THE CLIENT EXPERIENCE, NOT ON A RESULT.
 *
 * The acceptance this suite proves:
 *   - the pillar opens with a whole-system statement of what the system does as the
 *     soundtrack moves from quiet detail to a major peak;
 *   - the opening is never the highest-level result, never the bass by default and
 *     never the front stage by default;
 *   - the system's own evidence supports the opening, woven in rather than listed;
 *   - the result levels decide how strong the claim may be and which layer is
 *     emphasised, and never decide the sentence order;
 *   - the rule travels to the writer beside the pillar evidence it governs.
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
  PILLAR,
  clientStoryTextIsSafe,
} = await shared('narrativePillars.js');
const {
  DYNAMIC_RANGE_EVIDENCE_WEAVE_RULE,
  DYNAMIC_RANGE_OPENING_RULE,
  dynamicRangeOpening,
} = await shared('narrativeDynamicRangeOpening.js');
const { buildNarrativePriorityRows } = await shared('narrativePriorityAuthority.js');
const { summaryFromReportEvidence } = await shared('strengthImportance.js');
const { BRIEF_INTENT } = await shared('briefRelevance.js');

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

/** A strong cinema: the front stage, the surrounds and the bass all reach L4. */
const cinemaRows = () => rowsOf([
  row(12, 'L4'), row(13, 'L4'), row(14, 'L4', { value: '119 dB' }), row(18, 'L4', { value: '18 Hz' }),
  row(19, 'L4', { value: '±1 dB' }),
]);

/** Marquee Home's Original Design: the bass depth result (L2) is stronger than the L1 front stage. */
const mediaLoungeRows = () => buildNarrativePriorityRows({
  summary: summaryFromReportEvidence({
    parameters: [
      row(1, 'L1', { value: '1.29 m' }),
      row(12, 'L1'), row(13, 'L1'),
      row(14, 'L1', { value: '112 dB' }), row(18, 'L2', { value: '25 Hz' }), row(19, 'L4', { value: '±1 dB' }),
      row(20, null, { scope: 'seat', seats: [['r1c1', 'L1', 'primary'], ['r1c2', 'L1', 'primary']] }),
      row(3, 'L4'), row(4, 'L4'), row(5, 'L1'), row(11, 'L4'),
      row(16, 'L4'), row(17, 'L4'),
    ],
  }),
  intent: BRIEF_INTENT.MEDIA_LOUNGE,
  design: { display: true, speakers: true, seats: 5, bass: true, spatial: true, timbre: true, screenChannels: true },
}).rows;

/* ── 1 · the experience opens the pillar, not the strongest result ───────── */

test('Dynamic Range opens on the client experience, not on its strongest result', () => {
  // Marquee Home's Original Design: the bass depth result (L2) is stronger than the
  // screen and surround results (L1). It is emphasised inside the story and never
  // becomes the opening sentence.
  const dynamic = buildClientStoryPillars({ rows: mediaLoungeRows() }).byPillar[PILLAR.DYNAMIC_RANGE];

  assert.equal(dynamic.opening.tier, 'standard');
  assert.match(dynamic.opening.claim, /keeps dialogue and everyday viewing clear and relaxed/);
  assert.match(dynamic.opening.claim, /real energy when the soundtrack opens up/);
  // The opening states the whole system's consequence: no layer named, no result quoted.
  assert.equal(
    /bass|subwoofer|low-frequency|screen|surround/i.test(dynamic.opening.claim),
    false,
    `the opening names no layer: ${dynamic.opening.claim}`,
  );
  assert.equal(clientStoryTextIsSafe(dynamic.opening.claim).safe, true);

  // THE LEVELS DECIDE STRENGTH AND EMPHASIS, NEVER THE ORDER.
  assert.equal(dynamic.opening.strongest_level, 'L2', 'the strongest carrying result is read for emphasis');
  assert.equal(dynamic.opening.strength_level, 'L1', 'the whole-system claim is read at the least capable carrying result');
  assert.deepEqual(dynamic.opening.emphasis.parts, ['bass depth']);
  assert.match(dynamic.opening.emphasis.wording, /Give bass depth the strongest emphasis inside the story/);
  assert.match(dynamic.opening.emphasis.wording, /never as the opening sentence/);
  assert.match(dynamic.lead_note, /DYNAMIC RANGE OPENS ON ITS OPENING CLAIM \(standard\)/);
  assert.match(dynamic.lead_note, /never as the opening sentence/);
  // The strongest result is still the pillar's lead EVIDENCE.
  assert.equal(dynamic.lead_evidence.level, 'L2');
  assert.ok(dynamic.lead_evidence.ids.includes('P18'));

  // The evidence supports the opening in the order the story weaves it, never as a list.
  assert.deepEqual(dynamic.opening.evidence_order, [
    'the screen-channel capability',
    'the surround capability',
    'the low-frequency output',
    'the bass depth',
    'the bass control',
  ]);
  assert.match(dynamic.opening.weave_rule, /woven into the opening statement as they naturally arise/);

  // Only Dynamic Range opens this way: the other pillars are told from their own evidence.
  const others = buildClientStoryPillars({ rows: mediaLoungeRows() }).pillars
    .filter((pillar) => pillar.pillar !== PILLAR.DYNAMIC_RANGE);
  assert.ok(others.length > 0);
  assert.ok(others.every((pillar) => pillar.opening === null));
});

/* ── 2 · a stronger system scales, and emphasis never reorders the opening ─ */

test('a stronger system opens with a stronger whole-system claim, and emphasis never reorders it', () => {
  // Everything L4: one exceptional whole-system opening.
  const exceptional = buildClientStoryPillars({ rows: cinemaRows() }).byPillar[PILLAR.DYNAMIC_RANGE];
  assert.equal(exceptional.opening.tier, 'exceptional');
  assert.match(exceptional.opening.claim, /exceptional dynamic headroom across the front stage, surrounds and bass system/);
  assert.match(exceptional.opening.claim, /substantial scale, immediacy and physical impact/);
  assert.deepEqual([...exceptional.opening.emphasis.parts].sort(),
    ['bass depth', 'the low-frequency output', 'the screen channels', 'the surrounds'].sort());
  assert.match(exceptional.opening.emphasis.wording, /no single layer dominates the telling/);

  // Strong, not exceptional.
  const strong = buildClientStoryPillars({
    rows: rowsOf([row(12, 'L3'), row(13, 'L3'), row(14, 'L3'), row(18, 'L3')]),
  }).byPillar[PILLAR.DYNAMIC_RANGE];
  assert.equal(strong.opening.tier, 'strong');
  assert.match(strong.opening.claim, /strong dynamic range across the front stage, the surrounds and the bass system/);

  // A strong bass behind a modest front stage: the bass is EMPHASISED inside a
  // whole-system opening, and the claim is not escalated by it.
  const bassEmphasised = buildClientStoryPillars({
    rows: rowsOf([row(12, 'L1'), row(13, 'L1'), row(14, 'L3'), row(18, 'L3')]),
  }).byPillar[PILLAR.DYNAMIC_RANGE];
  assert.equal(bassEmphasised.opening.tier, 'standard', 'the claim is read at the least capable carrying result');
  assert.equal(bassEmphasised.opening.strongest_level, 'L3');
  assert.deepEqual(bassEmphasised.opening.emphasis.parts, ['the low-frequency output', 'bass depth']);
  assert.match(bassEmphasised.opening.emphasis.wording, /the low-frequency output and bass depth/);
  assert.match(bassEmphasised.opening.claim, /real energy when the soundtrack opens up/);

  // The bass control still carries no claim of its own: it never sets the strength.
  const controlOnly = buildClientStoryPillars({
    rows: rowsOf([row(12, 'L2'), row(13, 'L2'), row(14, 'L2'), row(19, 'L4', { value: '±1 dB' })]),
  }).byPillar[PILLAR.DYNAMIC_RANGE];
  assert.equal(controlOnly.opening.strongest_level, 'L2', 'the qualifying result is never read into the opening');
  assert.equal(controlOnly.opening.tier, 'standard');

  // Nothing is published to carry a claim: the pillar is opened from the evidence it holds.
  const nothing = dynamicRangeOpening({ carryingParts: [{ part: 'control', label: 'bass control', level: null }] });
  assert.equal(nothing.tier, null);
  assert.equal(nothing.claim, null);
  assert.match(nothing.emphasis.wording, /open on what the evidence genuinely supports/);
});

/* ── 3 · the rule travels to the writer with the evidence it governs ─────── */

test('the opening rule travels to the writer with the pillar evidence it governs', () => {
  const block = buildClientStoryPillarBlock({ rows: mediaLoungeRows() });
  assert.equal(block.opening_rule, DYNAMIC_RANGE_OPENING_RULE);
  assert.equal(block.opening_weave_rule, DYNAMIC_RANGE_EVIDENCE_WEAVE_RULE);
  assert.match(block.opening_rule, /OPENS ON THE CLIENT EXPERIENCE, NEVER ON A RESULT/);
  assert.match(block.opening_rule, /THEY NEVER DECIDE THE SENTENCE ORDER/);
  assert.match(block.opening_rule, /the bass never opens the pillar by default/);
  assert.match(block.opening_rule, /only as strong as the least capable part of the system that carries it/);
  assert.match(block.opening_field, /pillars\[\]\.opening/);
  assert.ok(block.pillars.find((pillar) => pillar.pillar === PILLAR.DYNAMIC_RANGE).opening);

  // The rule reaches the writer's prompt lines, beside the pillar rules.
  const grouping = source('base44/shared/narrativePillarGrouping.js');
  assert.match(grouping, /DYNAMIC_RANGE_OPENING_RULE/);
  assert.match(grouping, /narrativeDynamicRangeOpening\.js/);
  const openingLines = grouping.slice(grouping.indexOf('export function clientStoryPillarLines'));
  assert.match(openingLines, /DYNAMIC_RANGE_OPENING_RULE/);
  assert.match(openingLines, /DYNAMIC_RANGE_EVIDENCE_WEAVE_RULE/);
  assert.match(openingLines, /OPENING CLAIM in pillars\[\]\.opening/);
});