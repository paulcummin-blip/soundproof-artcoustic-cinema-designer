// proposal-neutral-copy.test.mjs
// ------------------------------
// Guards the writing voice of the client-facing report surfaces.
//
// There are two voices in the app, and this file guards both:
//
//   1. The System Design reports (System Design Summary and System Design
//      Comparison) are written by the designer speaking directly to the client.
//      They use "you" and "your", they explain the design rather than describe
//      parameters, and they are built around Spatial Resolution, Dynamic Range
//      and Timbre Matching. The contract is
//      base44/shared/reportWritingStyleContract.js (buildWritingStyleContract).
//
//   2. The internal AI Client Summary and the Visual Report describe the design
//      in the neutral third person (NEUTRAL_VOICE_RULES). Those surfaces are
//      unchanged, and the neutral audit below still applies to them.
//
// Audit real generated neutral-surface copy (a client summary or a visual
// report export):
//   COPY_AUDIT_SOURCE=/path/to/client-summary.md \
//     node --import ./test/_alias-register.mjs test/proposal-neutral-copy.test.mjs
//
// Text only: no calculations, RP22 values, project data, layout, proposal
// structure or image handling are read or touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildWritingStyleContract,
  CLIENT_ADDRESS_VOICE_RULES,
  NEUTRAL_VOICE_RULES,
  NEUTRAL_VOICE_SUBSTITUTIONS,
  BANNED_WORDS,
} from '../base44/shared/reportWritingStyleContract.js';
import {
  buildHighlightsPrompt,
  selectHighlightRows,
} from '../base44/shared/engineeringSnapshotEvidence.js';
import {
  COMPARISON_REPORT_INSTRUCTIONS,
  SYSTEM_SUMMARY_SECTION_PROMPTS,
} from '../base44/shared/systemDesignSummarySections.js';
import {
  buildSingleSummaryPrompt,
  buildComparisonSummaryPrompt,
} from '../base44/shared/aiSummaryPromptBuilder.js';
import { HIGHLIGHT_ROW_LIMIT } from '../base44/shared/adiReportEvidenceRules.js';

const LEGACY_PHRASES = NEUTRAL_VOICE_SUBSTITUTIONS.map(([from]) => from);

/** Reports every legacy personal phrase in a block of copy. */
function auditProposalCopy(text) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const violations = LEGACY_PHRASES.map((phrase) => {
    const count = lower.split(phrase).length - 1;
    if (count === 0) return null;
    const at = lower.indexOf(phrase);
    return {
      phrase,
      count,
      context: source.slice(Math.max(0, at - 40), at + phrase.length + 40).replace(/\s+/g, ' ').trim(),
    };
  }).filter(Boolean);
  return {
    ok: violations.length === 0,
    violations,
    words: source.split(/\s+/).filter(Boolean).length,
  };
}

const readSource = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const LEGACY_SAMPLE = 'Your cinema centres on a 3.5 m screen, and your screen holds 12 fL of peak '
  + 'luminance. You will hear effects move between adjacent speakers, and where you sit determines how '
  + 'continuous that movement feels. You can improve the rear pair with a small change in position.';

const NEUTRAL_SAMPLE = 'The cinema centres on a 3.5 m screen, and the screen holds 12 fL of peak '
  + 'luminance. Listeners will hear effects move between adjacent speakers, and the movement stays '
  + 'continuous across the seating area. This can be improved at the rear pair with a small change in position.';

/** A minimal calculated snapshot carrying rows that must never reach the table. */
const SNAPSHOT = {
  available: true,
  room: { screen: { size_inches: 120, aspect_ratio: '16:9' } },
  system: { configuration: { text: '9.4.6 immersive layout' } },
  rp22: {
    parameter_headlines: [
      { parameter_id: 2, title: 'Discrete channels', achieved_level: 'L4', formatted_value: '13 channels' },
      { parameter_id: 8, title: 'Upfiring speaker allowance', achieved_level: 'L4', formatted_value: 'No' },
      { parameter_id: 12, title: 'Screen Dynamic Range', achieved_level: 'L3', formatted_value: '108 dBC' },
      { parameter_id: 15, title: 'Background noise assumption', achieved_level: 'L2', formatted_value: 'NCB 22' },
      { parameter_id: 20, title: 'Bass seat-to-seat consistency', achieved_level: 'L3', formatted_value: '±2 dB' },
    ],
  },
  bass: {
    p19: { rsp: { level: 'L3', display_value: '±3 dB' } },
    p20: { rsp: { level: 'L2', display_value: '±4 dB' } },
  },
};

test('the neutral surfaces still use the neutral professional voice', () => {
  const legacy = auditProposalCopy(LEGACY_SAMPLE);
  assert.equal(legacy.ok, false, 'legacy copy must be flagged');
  const flagged = legacy.violations.map((v) => v.phrase);
  for (const phrase of ['your cinema', 'your screen', 'you will hear', 'where you sit', 'you can improve']) {
    assert.ok(flagged.includes(phrase), `expected "${phrase}" to be flagged, flagged: ${flagged.join(', ')}`);
  }

  const neutral = auditProposalCopy(NEUTRAL_SAMPLE);
  assert.equal(neutral.ok, true, JSON.stringify(neutral.violations));

  // The rewrite keeps every performance value it carried before.
  for (const value of ['3.5 m', '12 fL']) {
    assert.ok(LEGACY_SAMPLE.includes(value) && NEUTRAL_SAMPLE.includes(value), `${value} must survive the rewrite`);
  }

  const single = buildSingleSummaryPrompt({});
  const comparison = buildComparisonSummaryPrompt({ payloads: [], versionLabels: [] });
  for (const prompt of [single, comparison]) {
    assert.ok(prompt.includes(NEUTRAL_VOICE_RULES), 'summary prompts must carry the shared neutral voice');
    assert.match(prompt, /WRITING RULES \(strict\)/);
    assert.match(prompt, /Copy every L1\/L2\/L3\/L4\/FAIL result exactly/);
  }
});

test('the System Design contract speaks directly to the client', () => {
  const contract = buildWritingStyleContract();

  assert.ok(contract.includes(CLIENT_ADDRESS_VOICE_RULES), 'the contract carries the client-facing voice rules verbatim');
  assert.match(contract, /VOICE: SPEAK TO THE CLIENT \(mandatory/);
  assert.match(contract, /"you" and "your" where it feels natural/);
  assert.match(contract, /the experienced residential cinema designer/);
  assert.match(contract, /Never write like a marketer, a consultant, an AI or an engineering specification/);
  assert.doesNotMatch(contract, /Write in the third person/, 'the System Design report is not written in the third person');
  assert.ok(!contract.includes(NEUTRAL_VOICE_RULES), 'the neutral voice is never imposed on the System Design report');
});

test('the contract carries the report purpose, philosophy and priorities', () => {
  const contract = buildWritingStyleContract();

  assert.match(contract, /WHAT THE REPORT MUST ANSWER/);
  for (const question of [
    /1\. What has been designed\?/,
    /2\. Why has it been designed this way\?/,
    /3\. What will the client experience\?/,
    /4\. Where is the design strongest\?/,
    /5\. What limitations come from the room, the budget or the brief\?/,
    /6\. What sensible upgrade or alternative exists, if relevant\?/,
  ]) {
    assert.match(contract, question);
  }

  assert.match(contract, /The numbers support the story\. They are not the story\./);
  assert.match(contract, /describe the room as one complete system/);
  assert.match(contract, /Never present RP22 as the story/);
  assert.match(contract, /Never translate parameters one by one/);
  assert.match(contract, /every major design decision has a reason, and the components were selected to work together/);
  assert.match(contract, /where the main compromises are/);
  assert.match(contract, /what the investment delivers/);

  // Challenge assumptions, including the low-cost and high-spec framing.
  assert.match(contract, /Do not reinforce the selected design when the evidence shows a clear limitation/);
  assert.match(contract, /clean, simple and credible for its budget/);
  assert.match(contract, /Never describe a higher specification as excessive/);
  assert.match(contract, /Never apologise for reducing specification/);
});

test('the contract builds the report around the three themes with hard exclusions', () => {
  const contract = buildWritingStyleContract();

  assert.match(contract, /THE THREE THEMES/);
  assert.match(contract, /Spatial Resolution, Dynamic Range and Timbre Matching/);
  assert.match(contract, /P12\) and Non-screen Dynamic Range \(P13\) are the main evidence/);
  assert.match(contract, /Never reference P15\./);
  assert.match(contract, /Never reference P20\./);
  assert.match(contract, /Ignore P8 completely\./);
  assert.match(contract, /Do not mention P21\./);
  assert.match(contract, /never mention an assumed parameter/);

  // The Design Index stays supporting evidence, never an RP22 score.
  assert.match(contract, /Design Performance Index is supporting evidence only/);
  assert.match(contract, /Never present it as an RP22 score/);
  assert.match(contract, /never as the basis of the recommendation/);
});

test('the contract carries the language rules, banned words and final quality check', () => {
  const contract = buildWritingStyleContract();

  assert.match(contract, /Em dashes\. Use commas, full stops or semicolons only\./);
  assert.match(contract, /"Not just X, but Y"/);
  assert.match(contract, /"In conclusion", "to sum up", "it is important to note"/);
  assert.match(contract, /Corporate language, generic marketing copy, vague claims and cliches/);

  for (const banned of ['World-class', 'Ultimate experience', 'Unparalleled', 'State of the art', 'Revolutionary', 'Optimise']) {
    assert.ok(BANNED_WORDS.includes(banned), `"${banned}" must be banned`);
    assert.ok(contract.includes(banned), `the contract must state the ban on "${banned}"`);
  }

  assert.match(contract, /FINAL QUALITY CHECK/);
  assert.match(contract, /Does this explain the design rather than describe parameters\?/);
  assert.match(contract, /Does it identify the strongest part of the design\?/);
  assert.match(contract, /Does it suggest practical upgrades where they are useful\?/);
  assert.match(contract, /Does it avoid em dashes\?/);
  assert.match(contract, /Does it sound like an experienced cinema designer speaking to a client\?/);

  // The value-preservation rules survive the change.
  assert.match(contract, /Never change an RP22 or RP23 level, a dB value, a viewing angle, a distance or a product name/);
  assert.match(contract, /Never invent data/);
});

test('every System Design section explains the design rather than the parameters', () => {
  const prompts = SYSTEM_SUMMARY_SECTION_PROMPTS;

  assert.match(prompts.system_design_summary, /Open with the room, the screen and the system concept/);
  assert.match(prompts.system_design_summary, /Do not open with an equipment list/);
  assert.match(prompts.system_design_summary, /why that product was chosen/);

  assert.match(prompts.spatial_resolution, /how sound moves around and above the listener/);
  assert.match(prompts.spatial_resolution, /Do not mention P8\./);
  assert.match(prompts.spatial_resolution, /Lead with the strongest area of the design/);

  assert.match(prompts.dynamic_range, /Never reference P15\./);
  assert.match(prompts.dynamic_range, /headroom rather than loudness/);

  assert.match(prompts.timbre_matching, /Never reference P20/);
  assert.match(prompts.timbre_matching, /one system rather than a collection of loudspeakers/);

  assert.match(prompts.overall_design, /Bring the room back together/);
  assert.match(prompts.overall_design, /Do not end with a generic closing phrase/);

  // The highlights section writes the introduction only: the table is built by
  // Sound Proof from calculated data.
  assert.match(prompts.key_performance_highlights, /Do not write a table/);
});

test('the comparison follows the same voice, then what changes, then the consequence', () => {
  const text = COMPARISON_REPORT_INSTRUCTIONS;

  assert.match(text, /same voice, tone and structure as a single system report/);
  const order = ['what stays the same', 'what changes', 'listening consequence'];
  const positions = order.map((phrase) => text.indexOf(phrase));
  positions.forEach((at, index) => {
    assert.ok(at > -1, `"${order[index]}" must be stated`);
    if (index > 0) assert.ok(at > positions[index - 1], `"${order[index]}" must follow "${order[index - 1]}"`);
  });
  assert.match(text, /Dynamic Range, Spatial Resolution, Timbre Matching/);
  assert.match(text, /without attacking the alternative/);
  assert.match(text, /Do not automatically recommend the largest system/);
  assert.match(text, /never rank the options as "best"/);
});

test('the highlights table keeps calculated values final and never lists an excluded row', () => {
  assert.equal(HIGHLIGHT_ROW_LIMIT, 14, 'the table carries at most 14 rows');

  const rows = selectHighlightRows(SNAPSHOT);
  const keys = rows.map((row) => row.key);
  assert.ok(keys.includes('p2') && keys.includes('p12') && keys.includes('p19'), `expected usable rows, got ${keys.join(', ')}`);
  for (const forbidden of ['p8', 'p15', 'p20']) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must never be a client-facing row`);
  }
  assert.ok(!keys.some((key) => /^dpi_/i.test(key)), 'the internal Design Index is never a client-facing row');
  rows.forEach((row) => assert.match(row.result, /\S/, 'every row carries a calculated Result'));

  const prompt = buildHighlightsPrompt('=== SOUND PROOF CALCULATED DATA ===', rows.slice(0, 1));
  assert.ok(prompt.includes(CLIENT_ADDRESS_VOICE_RULES), 'the table writer uses the client-facing voice');
  assert.match(prompt, /"What you experience" cell/);
  assert.doesNotMatch(prompt, /What listeners hear/);
  assert.match(prompt, /Never change, reorder, add or remove a row/);
  assert.match(prompt, /The Result values are calculated by Sound Proof and are already final/);
  assert.match(prompt, /never reference P8, P15 or P20/);
  assert.match(prompt, /The numbers support the sentence\. They are not the sentence\./);
  assert.ok(!prompt.includes('\u2014'), 'no em dash reaches the writer');
});

test('the report surfaces carry the new table vocabulary', () => {
  const table = readSource('src/components/proposal/KeyPerformanceHighlightsTable.jsx');
  assert.match(table, /label: 'What you experience'/);
  assert.doesNotMatch(table, /What listeners hear/);

  const summarySections = readSource('base44/shared/systemDesignSummarySections.js');
  assert.match(summarySections, /COMPARISON_REPORT_INSTRUCTIONS/);
  assert.doesNotMatch(summarySections, /What listeners hear/);
});

test('audit of supplied neutral-surface copy (COPY_AUDIT_SOURCE)', (t) => {
  const source = process.env.COPY_AUDIT_SOURCE;
  if (!source || !fs.existsSync(source)) {
    t.skip('set COPY_AUDIT_SOURCE=<client summary or visual report file> to audit real generated copy');
    return;
  }
  const audit = auditProposalCopy(fs.readFileSync(source, 'utf8'));
  console.log(`[copy audit] ${source}: ${audit.violations.length} second-person pattern(s) in ${audit.words} words`);
  for (const violation of audit.violations.slice(0, 10)) {
    console.log(`  - "${violation.phrase}" x${violation.count}: ${violation.context}`);
  }
  assert.equal(audit.ok, true, 'neutral-surface copy must use the neutral professional voice');
});