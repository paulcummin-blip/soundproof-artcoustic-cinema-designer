// comparison-voice.test.mjs
// ---------------------------------------------------------------------------
// A System Design Comparison must explain a difference, not list it. Four things
// are connected for every difference that matters:
//
//   WHAT CHANGED      the product, the count or the layout
//   WHICH PARAMETER   the RP22 / RP23 parameter that carries the result
//   WHAT THE VALUE IS each option's own value and level, and the size of the change
//   WHY IT MATTERS    what that value gives the room
//
// The calculated table stays the authority on the values (comparisonTable.js);
// comparisonStoryRule.js tells the writer how to explain them, and both backend
// generators apply it to a comparison and to nothing else.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildComparisonSectionRule,
  COMPARISON_STORY_STRUCTURE,
  COMPARISON_PARAMETER_VOCABULARY,
  COMPARISON_REFERENCE_STYLE,
  COMPARISON_LANGUAGE_RULES,
  COMPARISON_BASS_RULE,
  COMPARISON_ENTRY_OPTION_RULE,
} from '../base44/shared/comparisonStoryRule.js';
import {
  buildComparisonTable,
  formatComparisonTableForPrompt,
  buildComparisonHighlightsPrompt,
} from '../base44/shared/comparisonTable.js';
import { getSystemSummarySectionPrompt } from '../base44/shared/systemDesignSummarySections.js';

const read = (path) => fs.readFileSync(path, 'utf8');

/** A Marquee Home shaped pair: the same 9.1.6 room, specified at two levels. */
function version(overrides = {}) {
  return {
    available: true,
    label: 'Option A',
    version_name: 'Level 1 version',
    system_format_short: '9.1.6',
    screen_data: { size_inches: 150, aspect_ratio: '16:9', manual_dimensions: false },
    seating_data: { interpretation: '3 rows, 9 seats', seat_count: 9, row_count: 3 },
    rp23_results: { available: true, summary: '60° primary viewing angle', primary_floor: 'Level 4' },
    speaker_package: [
      { role: 'lcr', role_description: 'Left/Centre/Right', model: 'Evolve 2-1 / Architect 2-1' },
    ],
    subwoofer_package: { strategy: '2 × SUB2-12', summary: null },
    amplification: '400 W',
    rp22_results: [
      { parameter_id: 2, label: 'P2 discrete channels', text: 'L4 · 15 channels' },
      { parameter_id: 5, label: 'P5 horizontal spacing', text: 'L4 · 50°' },
      { parameter_id: 12, label: 'P12 screen Dynamic Range', text: 'L3 · 106 dBC' },
      { parameter_id: 13, label: 'P13 non-screen Dynamic Range', text: 'L3 · 101 dBC' },
      { parameter_id: 16, label: 'P16 screen timbre', text: 'L3 · ±3 dB' },
      { parameter_id: 17, label: 'P17 surround timbre', text: 'L3 · ±3 dB' },
    ],
    bass_evidence_if_reliable: {
      p14: { parameter_id: 14, text: 'L3 · 115 dBC' },
      p18: { parameter_id: 18, text: '28 Hz' },
      p19: { parameter_id: 19, text: '±4 dB' },
      p20: null,
    },
    ...overrides,
  };
}

const LEVEL_4 = version({
  label: 'Option B',
  version_name: 'Level 4 version',
  speaker_package: [
    { role: 'lcr', role_description: 'Left/Centre/Right', model: 'Spitfire Q8-5' },
  ],
  subwoofer_package: { strategy: '4 × SUB4-12', summary: null },
  amplification: '800 W',
  rp22_results: [
    { parameter_id: 2, label: 'P2 discrete channels', text: 'L4 · 15 channels' },
    { parameter_id: 5, label: 'P5 horizontal spacing', text: 'L4 · 50°' },
    { parameter_id: 12, label: 'P12 screen Dynamic Range', text: 'L4 · 116 dBC' },
    { parameter_id: 13, label: 'P13 non-screen Dynamic Range', text: 'L3 · 101 dBC' },
    { parameter_id: 16, label: 'P16 screen timbre', text: 'L4 · ±1 dB' },
    { parameter_id: 17, label: 'P17 surround timbre', text: 'L4 · ±1 dB' },
  ],
  bass_evidence_if_reliable: {
    p14: { parameter_id: 14, text: 'L4 · 118 dBC' },
    p18: { parameter_id: 18, text: '22 Hz' },
    p19: { parameter_id: 19, text: '±3 dB' },
    p20: null,
  },
});

test('every difference is explained in the four steps, in order', () => {
  const steps = ['WHAT CHANGED', 'WHICH PARAMETER IT AFFECTS', 'WHAT THE VALUE IS', 'WHY THE CLIENT SHOULD CARE'];
  const positions = steps.map((step) => COMPARISON_STORY_STRUCTURE.indexOf(step));

  positions.forEach((at, index) => {
    assert.ok(at > -1, `${steps[index]} must be stated`);
    if (index > 0) assert.ok(at > positions[index - 1], `${steps[index]} must follow ${steps[index - 1]}`);
  });
  assert.match(COMPARISON_STORY_STRUCTURE, /Connect the product change to the parameter, the parameter to the value, and the value to the experience in the room/);
  assert.match(COMPARISON_STORY_STRUCTURE, /Never state a value without saying what it gives the room/);
});

test('the parameters are named as evidence, never as a list', () => {
  for (const parameter of ['P2', 'P5', 'P7', 'P9', 'P12', 'P13', 'P14', 'P16', 'P17', 'P18', 'P19', 'P20', 'RP23']) {
    assert.ok(COMPARISON_PARAMETER_VOCABULARY.includes(parameter), `${parameter} must be available to the writer`);
  }
  assert.match(COMPARISON_PARAMETER_VOCABULARY, /Screen Dynamic Range/);
  assert.match(COMPARISON_PARAMETER_VOCABULARY, /bass seat-to-seat consistency/);
  assert.match(COMPARISON_PARAMETER_VOCABULARY, /never as a list/);
  // The exclusions the evidence rules already enforce stay enforced here.
  assert.match(COMPARISON_PARAMETER_VOCABULARY, /Never reference P15/);
  assert.match(COMPARISON_PARAMETER_VOCABULARY, /ignore P8 completely/);
  assert.match(COMPARISON_PARAMETER_VOCABULARY, /do not mention P21/);
});

test('the evidence references name the reports the client holds, never a file', () => {
  assert.match(COMPARISON_REFERENCE_STYLE, /RP22 Parameter 12 in the Technical Report shows/);
  assert.match(COMPARISON_REFERENCE_STYLE, /The Visual Report confirms/);
  assert.match(COMPARISON_REFERENCE_STYLE, /The P20 seat map shows/);
  assert.match(COMPARISON_REFERENCE_STYLE, /RP23 viewing geometry remains strong in both versions/);
  assert.match(COMPARISON_REFERENCE_STYLE, /Never cite a file name, a page number or a link/);
});

test('the dull openers are banned and the decision-led openers are preferred', () => {
  for (const banned of [
    'The system is designed to',
    'This design provides',
    'The screen does',
    'The speakers do',
    'The subwoofers provide',
    'This ensures',
  ]) {
    assert.ok(COMPARISON_LANGUAGE_RULES.includes(banned), `${banned} must be named as banned`);
  }
  assert.match(COMPARISON_LANGUAGE_RULES, /"not just X, but Y"/);

  for (const preferred of [
    'The main upgrade is',
    'This matters because',
    'For the listener, that means',
    'The measured difference is',
    'Parameter 12 shows',
    'The Level 1 version still keeps',
  ]) {
    assert.ok(COMPARISON_LANGUAGE_RULES.includes(preferred), `${preferred} must be offered as the way to write it`);
  }
  // A superlative is only allowed with the numbers behind it.
  assert.match(COMPARISON_LANGUAGE_RULES, /only together with the values that show it/);
});

test('bass consistency is claimed only where P20 carries it', () => {
  assert.match(COMPARISON_BASS_RULE, /Parameters 14, 18, 19 and 20/);
  assert.match(COMPARISON_BASS_RULE, /only where the P20 result is supplied for every option/);
  assert.match(COMPARISON_BASS_RULE, /never claim it/);
  assert.match(COMPARISON_BASS_RULE, /Never claim perfect bass/);
  assert.match(COMPARISON_ENTRY_OPTION_RULE, /Never describe the smaller option as poor, limited or a compromise/);
  assert.match(COMPARISON_ENTRY_OPTION_RULE, /what it keeps/);
});

test('each section carries its own parameter story', () => {
  const dynamicRange = buildComparisonSectionRule('dynamic_range');
  assert.match(dynamicRange, /Screen Dynamic Range \(P12\)/);
  assert.match(dynamicRange, /LFE and subwoofer Dynamic Range \(P14\)/);
  assert.match(dynamicRange, /values and levels exactly as supplied/);
  assert.match(dynamicRange, /dialogue that stays clean when the soundtrack becomes demanding/);

  const spatial = buildComparisonSectionRule('spatial_resolution');
  assert.match(spatial, /Parameter 2/);
  assert.match(spatial, /horizontal spacing \(P5\)/);
  assert.match(spatial, /front wide position \(P7\)/);
  assert.match(spatial, /overhead spacing \(P9\)/);
  assert.match(spatial, /the difference is not speaker count/);

  const timbre = buildComparisonSectionRule('timbre_matching');
  assert.match(timbre, /screen timbre \(P16\)/);
  assert.match(timbre, /surround and overhead timbre \(P17\)/);
  assert.match(timbre, /bass extension \(P18\)/);
  assert.match(timbre, /bass response at the listening position \(P19\)/);

  const overall = buildComparisonSectionRule('overall_design');
  assert.match(overall, /bring the differences together for the decision/);
  assert.match(overall, /without ranking one as best/);

  // A section with no story of its own still carries every shared rule.
  const cover = buildComparisonSectionRule('cover');
  assert.ok(cover.includes(COMPARISON_STORY_STRUCTURE));
  assert.ok(cover.includes(COMPARISON_BASS_RULE));
});

test('the comparison rule reaches a comparison and is absent from a single report', () => {
  const proposal = read('base44/functions/generateProposal/entry.ts');
  const regenerate = read('base44/functions/regenerateProposalSection/entry.ts');
  assert.match(proposal, /proposalType === 'comparison'/, 'the comparison branch decides');
  assert.match(proposal, /buildComparisonSectionRule\(sectionDef\.type\)/);
  assert.match(regenerate, /buildComparisonSectionRule\(section\.section_type\)/);

  // A single-system report's own section prompt is untouched by the comparison
  // rule: the two voices never mix.
  const single = getSystemSummarySectionPrompt('dynamic_range', 'Dynamic Range');
  assert.doesNotMatch(single, /WHAT CHANGED/);
  assert.doesNotMatch(single, /THE SMALLER OPTION/);
});

test('the calculated table carries the values the story explains', () => {
  const table = buildComparisonTable([version(), LEVEL_4]);
  const byKey = new Map(table.rows.map((row) => [row.key, row]));

  for (const key of ['system_layout', 'speakers', 'subwoofers', 'amplification', 'seating', 'rp23_viewing', 'p2', 'p12', 'p13', 'p14', 'p18', 'p19']) {
    assert.ok(byKey.has(key), `${key} must be a row for a fully assessed pair`);
  }

  // P12: both values, both levels, and the change the story quotes.
  assert.deepEqual(byKey.get('p12').values, ['L3 · 106 dBC', 'L4 · 116 dBC']);
  assert.equal(byKey.get('p12').change, 'L3 → L4');
  assert.deepEqual(byKey.get('p14').values, ['L3 · 115 dBC', 'L4 · 118 dBC']);
  assert.equal(byKey.get('p14').change, 'L3 → L4');

  // The shared top level for P2 is a row the report can state as a strength.
  assert.equal(byKey.get('p2').identical, true);
  assert.equal(byKey.get('p2').change, 'No change');

  // Bass consistency is absent when it was not supplied: there is nothing in the
  // table for a writer to over-claim from.
  assert.ok(!byKey.has('p20'), 'no P20 row without a supplied P20 result');

  // The writer receives those values as final, so the story can quote them.
  const prompt = formatComparisonTableForPrompt(table);
  for (const value of ['L3 · 106 dBC', 'L4 · 116 dBC', 'L3 · 115 dBC', 'L4 · 118 dBC']) {
    assert.ok(prompt.includes(value), `${value} must be supplied to the writer`);
  }
  assert.match(prompt, /already final/);
});

test('the Key Differences introduction frames the decision and writes no value', () => {
  const prompt = buildComparisonHighlightsPrompt();
  assert.match(prompt, /what the options share, then say where the differences lie/);
  assert.match(prompt, /Frame the decision/);
  assert.match(prompt, /Do not write a table, a row or a value\./);
  assert.doesNotMatch(prompt, /\b\d+ dBC\b/, 'the introduction is never given a value to quote');
});