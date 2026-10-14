import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const ROOT = [new URL('../', import.meta.url), new URL('../../', import.meta.url)]
  .find((base) => existsSync(new URL('base44/shared/narrativePillars.js', base)));
const shared = (name) => import(new URL(`base44/shared/${name}`, ROOT).href);

const { buildClientStoryPillars } = await shared('narrativePillarGrouping.js');
const { PILLAR } = await shared('narrativePillars.js');
const { dynamicRangeOpening } = await shared('narrativeDynamicRangeOpening.js');
const { buildNarrativePriorityRows } = await shared('narrativePriorityAuthority.js');
const { summaryFromReportEvidence } = await shared('strengthImportance.js');
const { BRIEF_INTENT } = await shared('briefRelevance.js');

const row = (parameter_id, level, { scope = 'room', seats = [], value = null, state = 'scored' } = {}) => ({
  parameter_id, level, scope, state, value,
  supporting_per_seat: seats.map(([seat_id, seatLevel, priority]) => ({ seat_id, level: seatLevel, priority })),
});
const rowsOf = (parameters) => buildNarrativePriorityRows({
  summary: summaryFromReportEvidence({ parameters }),
  intent: BRIEF_INTENT.DEDICATED_CINEMA,
  design: { display: true, speakers: true, seats: 6, bass: true, spatial: true, timbre: true, screenChannels: true },
}).rows;
const cinemaRows = () => rowsOf([
  row(12, 'L4'), row(13, 'L4'), row(14, 'L4', { value: '119 dB' }), row(18, 'L4', { value: '18 Hz' }),
  row(19, 'L4', { value: '±1 dB' }),
]);

test('diag assertions', () => {
  const checks = [];
  const check = (name, fn) => {
    try { fn(); checks.push(['PASS', name]); }
    catch (error) { checks.push(['FAIL', name, String(error.message).slice(0, 300)]); }
  };

  const exceptional = buildClientStoryPillars({ rows: cinemaRows() }).byPillar[PILLAR.DYNAMIC_RANGE];
  check('exceptional tier', () => assert.equal(exceptional.opening.tier, 'exceptional'));
  check('exceptional claim A', () => assert.match(exceptional.opening.claim, /exceptional dynamic headroom across the front stage, surrounds and bass system/));
  check('exceptional claim B', () => assert.match(exceptional.opening.claim, /substantial scale, immediacy and physical impact/));
  check('exceptional emphasis parts', () => assert.deepEqual([...exceptional.opening.emphasis.parts].sort(),
    ['bass depth', 'the low-frequency output', 'the screen channels', 'the surrounds'].sort()));
  check('exceptional emphasis wording', () => assert.match(exceptional.opening.emphasis.wording, /no single layer dominates the telling/));

  const strong = buildClientStoryPillars({ rows: rowsOf([row(12, 'L3'), row(13, 'L3'), row(14, 'L3'), row(18, 'L3')]) }).byPillar[PILLAR.DYNAMIC_RANGE];
  check('strong tier', () => assert.equal(strong.opening.tier, 'strong'));
  check('strong claim', () => assert.match(strong.opening.claim, /strong dynamic range across the front stage, the surrounds and the bass system/));

  const bassEmphasised = buildClientStoryPillars({ rows: rowsOf([row(12, 'L1'), row(13, 'L1'), row(14, 'L3'), row(18, 'L3')]) }).byPillar[PILLAR.DYNAMIC_RANGE];
  check('bassEmphasised tier', () => assert.equal(bassEmphasised.opening.tier, 'standard'));
  check('bassEmphasised strongest', () => assert.equal(bassEmphasised.opening.strongest_level, 'L3'));
  check('bassEmphasised parts', () => assert.deepEqual(bassEmphasised.opening.emphasis.parts, ['the low-frequency output', 'bass depth']));
  check('bassEmphasised wording', () => assert.match(bassEmphasised.opening.emphasis.wording, /the low-frequency output and bass depth/));
  check('bassEmphasised claim', () => assert.match(bassEmphasised.opening.claim, /real energy when the soundtrack opens up/));

  const controlOnly = buildClientStoryPillars({ rows: rowsOf([row(12, 'L2'), row(13, 'L2'), row(14, 'L2'), row(19, 'L4', { value: '±1 dB' })]) }).byPillar[PILLAR.DYNAMIC_RANGE];
  check('controlOnly strongest', () => assert.equal(controlOnly.opening.strongest_level, 'L2'));
  check('controlOnly tier', () => assert.equal(controlOnly.opening.tier, 'standard'));

  const nothing = dynamicRangeOpening({ carryingParts: [{ part: 'control', label: 'bass control', level: null }] });
  check('nothing tier', () => assert.equal(nothing.tier, null));
  check('nothing claim', () => assert.equal(nothing.claim, null));
  check('nothing wording', () => assert.match(nothing.emphasis.wording, /open on what the evidence genuinely supports/));

  for (const [state, name, detail] of checks) console.log(`@@${state} ${name}${detail ? ` :: ${detail}` : ''}`);
});