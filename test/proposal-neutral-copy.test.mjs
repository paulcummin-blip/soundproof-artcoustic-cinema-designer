// proposal-neutral-copy.test.mjs
// ------------------------------
// Guards the neutral professional voice of Proposal / Client Summary copy.
//
// Scope: client-facing copy only. It checks the written authorities (the style
// contract, the System Design Summary section prompts, the client-summary
// prompts and the Key Performance Highlights prompt) and audits report copy for
// second-person language, using the legacy constructs named in the brief
// ("Your cinema centres ...", "your screen", "you will hear", "where you sit").
//
// Audit real generated copy, e.g. an exported proposal or client summary:
//   COPY_AUDIT_SOURCE=/path/to/proposal.md \
//     node --import ./test/_alias-register.mjs test/proposal-neutral-copy.test.mjs
//
// Text only: no calculations, RP22 values, project data, layout, proposal
// structure or image handling are read or touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildWritingStyleContract,
  NEUTRAL_VOICE_RULES,
  NEUTRAL_VOICE_SUBSTITUTIONS,
} from '../base44/shared/reportWritingStyleContract.js';
import { buildHighlightsPrompt } from '../base44/shared/engineeringSnapshotEvidence.js';
import {
  buildSingleSummaryPrompt,
  buildComparisonSummaryPrompt,
} from '../base44/shared/aiSummaryPromptBuilder.js';

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

/** Lines that state a prohibition are rules, not copy, so they are not scanned. */
const RULE_MARKERS = /NEUTRAL VOICE|never write|is always used|replaces|addressing the reader|your" anything|substitutions/i;
const stripRuleLines = (text) => String(text).split('\n').filter((line) => !RULE_MARKERS.test(line)).join('\n');

// The style contract is deliberately not scanned here: it is the rules
// authority, so it names each banned phrasing in order to prohibit it (checked
// positively in the contract test above). These files produce copy.
const COPY_SOURCES = [
  'base44/shared/systemDesignSummarySections.js',
  'base44/shared/aiSummaryPromptBuilder.js',
  'base44/shared/engineeringSnapshotEvidence.js',
  'base44/functions/generateProposal/entry.ts',
  'base44/functions/regenerateProposalSection/entry.ts',
  'src/components/proposal/KeyPerformanceHighlightsTable.jsx',
];

const readSource = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// The brief's own example: direct address, in the System Design Summary and
// Spatial Resolution style. Performance values are real so preservation can be
// checked against the neutral rewrite of the same copy.
const LEGACY_SAMPLE = 'Your cinema centres on a 3.5 m screen, and your screen holds 12 fL of peak '
  + 'luminance. You will hear effects move between adjacent speakers, and where you sit determines how '
  + 'continuous that movement feels. You can improve the rear pair with a small change in position.';

const NEUTRAL_SAMPLE = 'The cinema centres on a 3.5 m screen, and the screen holds 12 fL of peak '
  + 'luminance. Listeners will hear effects move between adjacent speakers, and the movement stays '
  + 'continuous across the seating area. This can be improved at the rear pair with a small change in position.';

test('legacy proposal copy is detected, and its neutral rewrite passes', () => {
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
});

test('the style contract mandates the neutral voice and no longer asks for you/your', () => {
  const contract = buildWritingStyleContract();

  assert.match(contract, /NEUTRAL VOICE \(mandatory/);
  assert.match(contract, /Write in the third person/);
  assert.match(contract, /"The screen" is always used, never "your screen"/);
  assert.match(contract, /Listeners will hear/);
  assert.match(contract, /The cinema" replaces "your cinema"/);
  assert.ok(contract.includes(NEUTRAL_VOICE_RULES), 'the contract must carry the shared voice rules verbatim');

  assert.doesNotMatch(contract, /Speak to the reader using "you" and "your"/);
  assert.match(contract, /Addressing the reader: "you", "your"/);
  assert.match(contract, /15\. Check that every sentence is in the third person/);

  // Readability and value preservation rules survive the change.
  assert.match(contract, /Explain what the client will experience/);
  assert.match(contract, /Sound like an experienced cinema designer writing for a client/);
  assert.match(contract, /Keep the tone human, calm and professional/);
  assert.match(contract, /Neutral is not cold/);
  assert.match(contract, /Include data, numbers, RP22\/RP23 levels, dB values/);
  assert.match(contract, /Never change an RP22\/RP23 level, a dB value, a viewing angle or a product name/);
});

test('client-summary and highlights prompts carry the same neutral voice', () => {
  const single = buildSingleSummaryPrompt({});
  const comparison = buildComparisonSummaryPrompt({ payloads: [], versionLabels: [] });

  for (const prompt of [single, comparison]) {
    assert.ok(prompt.includes(NEUTRAL_VOICE_RULES), 'summary prompts must carry the shared voice rules');
    assert.match(prompt, /WRITING RULES \(strict\)/);
  }

  // Summary rules that protect the engineering values are untouched.
  assert.match(single, /Copy every L1\/L2\/L3\/L4\/FAIL result exactly/);
  assert.match(comparison, /Copy every L1\/L2\/L3\/L4\/FAIL result exactly/);
});

test('the highlights prompt asks for listener-facing cells and keeps the values final', () => {
  const prompt = buildHighlightsPrompt('=== SOUND PROOF CALCULATED DATA ===', [
    { key: 'p2', area: 'Discrete channels', result: '9 channels' },
  ]);

  assert.ok(prompt.includes(NEUTRAL_VOICE_RULES));
  assert.match(prompt, /"What listeners hear" cell/);
  assert.doesNotMatch(prompt, /What you hear/);
  assert.match(prompt, /Never change, reorder, add or remove a row/);
  assert.match(prompt, /The Result values are calculated by Sound Proof and are already final/);
  assert.match(prompt, /9 channels/);
});

test('client-facing copy sources carry no second-person phrasing', () => {
  const findings = [];
  for (const path of COPY_SOURCES) {
    const audit = auditProposalCopy(stripRuleLines(readSource(path)));
    if (!audit.ok) findings.push({ path, phrases: audit.violations.map((v) => v.phrase) });
  }
  assert.deepEqual(findings, [], `second-person phrasing found: ${JSON.stringify(findings)}`);

  assert.match(readSource('src/components/proposal/KeyPerformanceHighlightsTable.jsx'), /label: 'What listeners hear'/);
});

test('audit of supplied report copy (COPY_AUDIT_SOURCE)', (t) => {
  const source = process.env.COPY_AUDIT_SOURCE;
  if (!source || !fs.existsSync(source)) {
    t.skip('set COPY_AUDIT_SOURCE=<proposal or client-summary file> to audit real generated copy');
    return;
  }
  const audit = auditProposalCopy(fs.readFileSync(source, 'utf8'));
  console.log(`[copy audit] ${source}: ${audit.violations.length} second-person pattern(s) in ${audit.words} words`);
  for (const violation of audit.violations.slice(0, 10)) {
    console.log(`  - "${violation.phrase}" x${violation.count}: ${violation.context}`);
  }
  assert.equal(audit.ok, true, 'report copy must use the neutral professional voice');
});