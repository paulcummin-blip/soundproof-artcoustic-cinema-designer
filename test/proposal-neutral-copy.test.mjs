// proposal-neutral-copy.test.mjs
// ------------------------------
// Guards the writing voice of the client-facing report surfaces.
//
// There are two voices in the app, and this file guards both:
//
//   1. The System Design reports (System Design Summary and System Design
//      Comparison) are design-led and room-focused: the designer explains the
//      room, the design and the listening result, and never addresses the client
//      as "you". They explain the design rather than describe parameters, and
//      they are built around Spatial Resolution, Dynamic Range and Timbre
//      Matching. The contract is
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
  DESIGN_LED_VOICE_RULES,
  DESIGN_LED_SUBJECTS,
  DESIGN_LED_BLOCKED_PHRASES,
  DESIGN_INDEX_HARD_RULES,
  DESIGN_INDEX_BANNED_TERMS,
  isDesignIndexRow,
  mentionsDesignIndex,
  NEUTRAL_VOICE_RULES,
  NEUTRAL_VOICE_SUBSTITUTIONS,
  BANNED_WORDS,
} from '../base44/shared/reportWritingStyleContract.js';
import { buildComparisonHighlightsPrompt } from '../base44/shared/comparisonTable.js';
import {
  buildEngineeringEvidence,
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

/** A whole-word pattern, so "you" never matches inside "your". */
function blockedPhrasePattern(phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
}

/** Reports every blocked construction in a block of System Design prose. */
function auditDesignLedCopy(text) {
  const source = String(text || '');
  const violations = DESIGN_LED_BLOCKED_PHRASES
    .filter((phrase) => blockedPhrasePattern(phrase).test(source))
    .map((phrase) => ({ phrase }));
  return {
    ok: violations.length === 0,
    violations,
    words: source.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * The Design Index constructions that must never appear in client-facing
 * proposal copy, exactly as listed in the exclusion rule.
 */
const DESIGN_INDEX_COPY_SAMPLES = [
  'Design Index',
  'Design Score',
  '82%',
  '82% (Primary)',
  'The design achieves an 82 percent score',
  'Primary score',
  'Design Rating',
];

/** Reports every Design Index construction in a block of client-facing copy. */
function auditDesignIndexCopy(text) {
  const source = String(text || '').toLowerCase();
  const violations = DESIGN_INDEX_COPY_SAMPLES
    .filter((sample) => source.includes(sample.toLowerCase()))
    .map((sample) => ({ sample }));
  return {
    ok: violations.length === 0,
    violations,
    words: String(text || '').split(/\s+/).filter(Boolean).length,
  };
}

const LEGACY_SAMPLE = 'Your cinema centres on a 3.5 m screen, and your screen holds 12 fL of peak '
  + 'luminance. You will hear effects move between adjacent speakers, and where you sit determines how '
  + 'continuous that movement feels. You can improve the rear pair with a small change in position.';

const NEUTRAL_SAMPLE = 'The cinema centres on a 3.5 m screen, and the screen holds 12 fL of peak '
  + 'luminance. Listeners will hear effects move between adjacent speakers, and the movement stays '
  + 'continuous across the seating area. This can be improved at the rear pair with a small change in position.';

/** The approved System Design voice: design-led, room-focused, no direct address. */
const DESIGN_LED_SAMPLE = 'The room is designed around a 3.5 m screen, and the screen holds 12 fL of peak '
  + 'luminance. The system uses matched loudspeakers across the screen wall and the side walls, so movement '
  + 'between adjacent speakers stays continuous. The seating area benefits from the raised rear row, and the '
  + 'result is a listening position that holds up across all five seats. The main compromise is the low '
  + 'ceiling, which limits where the overhead pair can be placed.';

/** Blocked by default in the System Design voice: second person, and "we". */
const SECOND_PERSON_SAMPLE = 'Your cinema is designed around a 3.5 m screen, and you will hear movement '
  + 'between adjacent speakers. We designed the seating area so you get a consistent result, and we recommend '
  + 'the raised rear row.';

/** System Design Summary copy that names the internal Design Index: must fail. */
const SUMMARY_INDEX_SAMPLE = '<p>The room reaches a Design Index of 124, and the design achieves an 82 percent '
  + 'score. The Primary score of 82% (Primary) confirms the overall Design Score, and the proposed Design Rating '
  + 'reflects it.</p>';

/** System Design Comparison copy that names the internal Design Index: must fail. */
const COMPARISON_INDEX_SAMPLE = 'Option A carries a Design Index of 58 and a Design Score of 55. Option B reaches '
  + 'an index of 68, a Primary score of 71 and an 82% (Primary) result, so the design achieves an 82 percent '
  + 'score. The Design Rating is unchanged between the options.';

/** The same point made from the design evidence instead of the index: must pass. */
const EVIDENCE_LED_SAMPLE = '<p>The room is designed around a 3.5 m screen, and the seating area holds a '
  + 'consistent result across all five seats. Spatial resolution is carried by 13 discrete channels, and the '
  + 'screen system reaches 108 dBC of dynamic range.</p>';

/** A minimal calculated snapshot carrying rows that must never reach the table. */
const SNAPSHOT = {
  available: true,
  room: { screen: { size_inches: 120, aspect_ratio: '16:9' } },
  system: { configuration: { text: '9.4.6 immersive layout' } },
  rp22: {
    // The snapshot carries the internal Design Index; client-facing copy never does.
    dpi: {
      primary: { available: true, index: 64, designation: 'Good', percentage: 64 },
      secondary: { available: true, index: 64, designation: 'Good', percentage: 64 },
      all_seat: { available: true, index: 60, designation: 'Good', percentage: 60 },
    },
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

test('the System Design contract is design-led, room-focused and never speaks to the client', () => {
  const contract = buildWritingStyleContract();

  assert.ok(contract.includes(DESIGN_LED_VOICE_RULES), 'the contract carries the design-led voice rules verbatim');
  assert.match(contract, /VOICE: DESIGNER-LED AND ROOM-FOCUSED \(mandatory/);

  // The approved rule, stated word for word.
  assert.match(contract, /The report should read as a professional design proposal written by an experienced cinema designer/);
  assert.match(contract, /It should explain the room, the design choices and the expected experience/);
  assert.match(contract, /It should not speak directly to the client as "you" unless quoting or referencing a clearly client-specific requirement/);

  assert.match(contract, /the experienced residential cinema designer/);
  assert.match(contract, /Never write like a marketer, a consultant, an AI or an engineering specification/);
  assert.match(contract, /Never write like a detached technical audit/);

  // The approved subject vocabulary carries the sentence.
  for (const subject of ['the room', 'the design', 'the system', 'the seating area', 'the experience', 'this layout', 'the result']) {
    assert.ok(DESIGN_LED_SUBJECTS.includes(subject), `"${subject}" must be an approved subject`);
    assert.ok(contract.includes(subject), `the contract must offer "${subject}" as a subject`);
  }

  // Direct address and the first-person design voice are blocked by default.
  for (const phrase of ['you', 'your', "you'll", 'you will', 'we designed', 'we recommend']) {
    assert.ok(DESIGN_LED_BLOCKED_PHRASES.includes(phrase), `"${phrase}" must be blocked`);
    assert.ok(contract.includes(`"${phrase}"`), `the contract must state the ban on "${phrase}"`);
  }

  // The previous direct-to-client rule is gone.
  assert.doesNotMatch(contract, /"you" and "your" where it feels natural/);
  assert.doesNotMatch(contract, /SPEAK TO THE CLIENT/);
  assert.match(contract, /Does it sound like an experienced cinema designer explaining the room and the design\?/);
  assert.match(contract, /Is there no "you", "your", "we designed" or "we recommend" anywhere in the prose\?/);
  assert.ok(!contract.includes(NEUTRAL_VOICE_RULES), 'the neutral audit voice is never imposed on the System Design report');
});

test('design-led copy passes the voice audit and second-person copy is blocked', () => {
  const approved = auditDesignLedCopy(DESIGN_LED_SAMPLE);
  assert.equal(approved.ok, true, `approved copy must pass: ${JSON.stringify(approved.violations)}`);
  assert.ok(approved.words > 40, 'the sample must be a realistic paragraph');

  const blocked = auditDesignLedCopy(SECOND_PERSON_SAMPLE);
  assert.equal(blocked.ok, false, 'second-person copy must be blocked by default');
  const flagged = blocked.violations.map((violation) => violation.phrase);
  for (const phrase of ['you', 'your', 'you will', 'we designed', 'we recommend']) {
    assert.ok(flagged.includes(phrase), `expected "${phrase}" to be flagged, flagged: ${flagged.join(', ')}`);
  }

  // The audit never confuses "you" with "your".
  assert.deepEqual(auditDesignLedCopy('The room is designed around the screen.').violations, []);
  assert.ok(blockedPhrasePattern('your').test('across your seating area'));
  assert.ok(!blockedPhrasePattern('you').test('across your seating area'));

  // The rewrite keeps every performance value it carried before.
  for (const value of ['3.5 m', '12 fL']) {
    assert.ok(DESIGN_LED_SAMPLE.includes(value) && SECOND_PERSON_SAMPLE.includes(value), `${value} must survive the rewrite`);
  }
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

  // The Design Index is an internal designer diagnostic. Both hard rules are
  // stated verbatim, every term that would give it away is named, and the old
  // published-in-the-tables rule is gone.
  for (const rule of DESIGN_INDEX_HARD_RULES.split('\n')) {
    assert.ok(contract.includes(rule), `the contract must state the Design Index hard rule: ${rule}`);
  }
  assert.match(contract, /DESIGN INDEX \(INTERNAL ONLY\)/);
  assert.match(contract, /Never mention Design Index in client-facing proposal copy\. Design Index is an internal designer diagnostic and must remain internal\./);
  assert.match(contract, /Never express Design Index as a percentage in proposal copy\./);
  for (const term of DESIGN_INDEX_BANNED_TERMS) {
    assert.ok(contract.includes(term), `the contract must name "${term}"`);
  }
  assert.match(contract, /never evidence in a section, a table row or a recommendation/);
  assert.match(contract, /Do not invent a replacement score/);
  assert.doesNotMatch(contract, /It appears in the tables as its own labelled row/);
  assert.doesNotMatch(contract, /Treat it as supporting evidence/);
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
  assert.match(contract, /Does it sound like an experienced cinema designer explaining the room and the design\?/);
  // The Design Index self-check is explicit.
  assert.match(contract, /Is the Design Index, a design score, a design rating or any percentage completely absent/);

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

  // The instructions describe the design to a reader: the client's experience is
  // never the subject of the prose.
  assert.match(prompts.system_design_summary, /Open the report by describing the design\./);
  assert.match(prompts.system_design_summary, /what the room delivers as a result/);
  assert.match(prompts.spatial_resolution, /explain what the room gains because of it/);
  assert.match(prompts.spatial_resolution, /Explain the listening result first/);
  assert.match(prompts.dynamic_range, /at the listening level the design assumes/);
  assert.match(prompts.timbre_matching, /describe what those choices give the room/);
  assert.match(prompts.overall_design, /leave the reader confident/);
  for (const [name, instructions] of Object.entries(prompts)) {
    assert.doesNotMatch(
      instructions,
      /what the client will hear|what the client hears|the client will experience|speak to the client as "you"/i,
      `${name} must not make the client's experience the subject`,
    );
  }
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
  assert.match(text, /what the room actually gains or gives up/);
});

test('the comparison introduction is design-led and writes no value', () => {
  const prompt = buildComparisonHighlightsPrompt();

  assert.match(prompt, /Write the introduction to the Key Performance Highlights section of a System Design Comparison\./);
  assert.match(prompt, /design-led voice defined in the style contract/);
  assert.match(prompt, /what the room gains or gives up/);
  assert.match(prompt, /Do not write a table, a row or a value\./);
  assert.doesNotMatch(prompt, /your job|What you experience/i);
});

test('the highlights table keeps calculated values final and never lists an excluded row', () => {
  assert.equal(HIGHLIGHT_ROW_LIMIT, 14, 'the table carries at most 14 rows');

  const rows = selectHighlightRows(SNAPSHOT);
  const keys = rows.map((row) => row.key);
  assert.ok(keys.includes('p2') && keys.includes('p12') && keys.includes('p19'), `expected usable rows, got ${keys.join(', ')}`);
  for (const forbidden of ['p8', 'p15', 'p20']) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must never be a client-facing row`);
  }
  // The Design Index is an internal designer diagnostic: it is never a row, and
  // no row may name it. (A separate test proves the snapshot still carries it.)
  assert.ok(!keys.some((key) => /^dpi/i.test(key)), `no Design Index row may be selected, got ${keys.join(', ')}`);
  rows.forEach((row) => {
    assert.ok(!isDesignIndexRow(row), `row "${row.area}" is a Design Index row`);
    assert.doesNotMatch(String(row.area), /design\s+(performance\s+)?index|design\s+(score|rating)/i);
  });
  rows.forEach((row) => assert.match(row.result, /\S/, 'every row carries a calculated Result'));

  const prompt = buildHighlightsPrompt('=== SOUND PROOF CALCULATED DATA ===', rows.slice(0, 1));
  assert.ok(prompt.includes(DESIGN_LED_VOICE_RULES), 'the table writer uses the design-led voice');
  assert.match(prompt, /"What the room gains" cell/);
  assert.match(prompt, /Never address the client as "you"/);
  assert.doesNotMatch(prompt, /speak to the client as "you"/);
  assert.doesNotMatch(prompt, /What listeners hear/);
  assert.match(prompt, /Never change, reorder, add or remove a row/);
  assert.match(prompt, /The Result values are calculated by Sound Proof and are already final/);
  assert.match(prompt, /never reference P8, P15 or P20/);
  assert.match(prompt, /Never mention the Design Index, a design score, a design rating or a percentage/);
  assert.match(prompt, /The numbers support the sentence\. They are not the sentence\./);
  assert.ok(!prompt.includes('\u2014'), 'no em dash reaches the writer');
});

test('Design Index copy fails the guard in both report types', () => {
  for (const [report, sample] of [
    ['System Design Summary', SUMMARY_INDEX_SAMPLE],
    ['System Design Comparison', COMPARISON_INDEX_SAMPLE],
  ]) {
    const audit = auditDesignIndexCopy(sample);
    assert.equal(audit.ok, false, `${report} copy naming the Design Index must fail`);
    assert.equal(mentionsDesignIndex(sample), true, `${report} must also fail the shared copy rule`);
    for (const term of DESIGN_INDEX_COPY_SAMPLES) {
      assert.ok(
        audit.violations.some((violation) => violation.sample === term),
        `${report} must flag "${term}", flagged: ${audit.violations.map((v) => v.sample).join(', ')}`,
      );
    }
  }

  // The same design point written from the evidence passes this guard, and the
  // voice guard, and keeps every value it carried.
  const approved = auditDesignIndexCopy(EVIDENCE_LED_SAMPLE);
  assert.equal(approved.ok, true, `evidence-led copy must pass: ${JSON.stringify(approved.violations)}`);
  assert.equal(mentionsDesignIndex(EVIDENCE_LED_SAMPLE), false, 'evidence-led copy passes the shared copy rule too');
  assert.equal(auditDesignLedCopy(EVIDENCE_LED_SAMPLE).ok, true, 'evidence-led copy also passes the voice guard');
  for (const value of ['3.5 m', '13 discrete channels', '108 dBC']) {
    assert.ok(EVIDENCE_LED_SAMPLE.includes(value), `${value} must be carried by the rewrite`);
  }
});

test('a snapshot may carry internal Design Index data while the proposal output omits it', () => {
  // The fixture snapshot carries a live Design Index for all three scopes.
  assert.equal(SNAPSHOT.rp22.dpi.primary.available, true);
  assert.equal(SNAPSHOT.rp22.dpi.all_seat.available, true);

  const rows = selectHighlightRows(SNAPSHOT);
  assert.ok(rows.length > 0, 'the design still produces client-facing rows');
  assert.ok(!rows.some((row) => isDesignIndexRow(row)), 'no Design Index row may be selected');

  const evidence = buildEngineeringEvidence(SNAPSHOT);
  // The rule travels to the writer; no value, scope or designation does.
  assert.ok(evidence.includes(DESIGN_INDEX_HARD_RULES), 'the writer is told the Design Index is internal');
  assert.doesNotMatch(evidence, /Design Performance Index \(/, 'no index value is supplied');
  assert.doesNotMatch(evidence, /primary seat \d/, 'no seat-scoped index value is supplied');
  assert.doesNotMatch(evidence, /\bGood\b/, 'no index designation is supplied');
  for (const value of [SNAPSHOT.rp22.dpi.primary.index, SNAPSHOT.rp22.dpi.all_seat.index]) {
    assert.ok(!new RegExp(`(^|\\D)${value}(\\D|$)`).test(evidence), `index value ${value} must not be supplied`);
  }
});

test('the frontend row guard mirrors the shared Design Index rule', () => {
  const guard = readSource('src/components/proposal/designIndexRowAuthority.js');
  for (const term of DESIGN_INDEX_BANNED_TERMS) {
    assert.ok(guard.includes(`'${term}'`), `the frontend guard must carry "${term}"`);
  }
  assert.match(guard, /key === 'dpi' \|\| key\.startsWith\('dpi_'\)/);
  assert.match(guard, /export function excludeDesignIndexRows/);

  // The renderer applies it to both table shapes, so a stored row never reaches
  // the editor, the preview or the PDF.
  const table = readSource('src/components/proposal/KeyPerformanceHighlightsTable.jsx');
  assert.match(table, /excludeDesignIndexRows\(rows\)/);
  assert.match(table, /excludeDesignIndexRows\(comparisonRows\)/);

  // The shared builders no longer publish it either.
  const evidenceSource = readSource('base44/shared/engineeringSnapshotEvidence.js');
  assert.doesNotMatch(evidenceSource, /designIndexHighlightRows/);
  assert.doesNotMatch(evidenceSource, /Design Performance Index \(Sound Proof index/);

  const comparisonTableSource = readSource('base44/shared/comparisonTable.js');
  assert.doesNotMatch(comparisonTableSource, /dpi_primary|dpi_secondary|dpi_all_seat/);

  const comparisonEvidenceSource = readSource('base44/shared/comparisonEvidence.js');
  assert.doesNotMatch(comparisonEvidenceSource, /describeDesignIndex/);
  assert.doesNotMatch(comparisonEvidenceSource, /design_index/);
});

test('the report surfaces carry the new table vocabulary', () => {
  const table = readSource('src/components/proposal/KeyPerformanceHighlightsTable.jsx');
  assert.match(table, /label: 'What the room gains'/);
  assert.match(table, /What changes/, 'the comparison change column is unchanged');
  assert.match(table, /row.what_the_room_gains \?\? row.what_you_hear/, 'rows written before the rename still render');
  assert.doesNotMatch(table, /What listeners hear/);

  const evidence = readSource('base44/shared/engineeringSnapshotEvidence.js');
  assert.match(evidence, /"What the room gains" cell/);
  assert.match(evidence, /what_the_room_gains: byKey/, 'the stored cell is written under the new key');
  assert.doesNotMatch(evidence, /what_you_hear: byKey/);

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