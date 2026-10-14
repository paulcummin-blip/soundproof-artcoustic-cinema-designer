/**
 * absent-feature-framing.test.mjs
 * -------------------------------
 * The proposal is a sales document: it states what the design does. This suite
 * reads the one authority that decides that (absentFeatureFraming.js) and the two
 * places it is applied — the writer's rule (proposalSalesVoice / the proposal
 * writing authority) and the deterministic narrative pass (proposalNarrativeSanitizer).
 *
 * No calculation, level, product or evidence meaning is read or changed here: the
 * rule is about wording only, and a sentence that states a figure is never removed.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  absentFeatureFramingRule,
  comparisonFramingRequested,
  removeAbsentFeatureFraming,
} from '../base44/shared/proposalWriter/absentFeatureFraming.js';
import { sanitizeNarrativeHtml } from '../base44/shared/proposalNarrativeSanitizer.js';
import { buildProposalSalesVoice } from '../base44/shared/proposalSalesVoice.js';
import { buildProposalWritingAuthority } from '../base44/shared/soundProofWritingAuthority.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// ── TEST 1 — the reported sentence: the contrast clause goes, the design stays ──
test('TEST 1 — the reported contrast clause is trimmed away and the design sentence kept', () => {
  const body = '<p>This is a listener-level surround arrangement, centred on the relationship between the TV, the front stage and the seating rather than an overhead sound layer.</p>';
  const cleaned = removeAbsentFeatureFraming(body);
  assert.doesNotMatch(cleaned, /rather than an overhead sound layer/i);
  assert.doesNotMatch(cleaned, /overhead/i);
  // The design itself is still described.
  assert.match(cleaned, /centred on the relationship between the TV, the front stage and the seating/i);
});

// ── TEST 2 — every banned absent-feature statement is removed ────────────────
test('TEST 2 — no absence statement survives in client-facing copy', () => {
  const banned = [
    '<p>There is no overhead layer in this design.</p>',
    '<p>This is not an Atmos system.</p>',
    '<p>It is not an immersive system, but the surrounds still work well.</p>',
    '<p>The room is without height speakers and that is a sensible choice.</p>',
    '<p>The layout lacks a height layer.</p>',
    '<p>The overhead speakers are missing from this design.</p>',
    '<p>This layout does not include overhead speakers.</p>',
    '<p>The client misses out on the overhead effect.</p>',
  ];
  for (const sentence of banned) {
    const cleaned = removeAbsentFeatureFraming(`<p>The design is described here.</p>${sentence}`);
    assert.match(cleaned, /The design is described here\./, `the positive sentence survives: ${sentence}`);
    assert.doesNotMatch(cleaned, /overhead|height|atmos|immersive|missing/i, `nothing absent-feature is left: ${cleaned}`);
  }
});

// ── TEST 3 — "only listener-level" and "limited to 5.1" are described positively ─
test('TEST 3 — a design is never qualified as the limited one', () => {
  const cleaned = removeAbsentFeatureFraming(
    '<p>The system is only listener-level, and it is limited to 5.1 channels.</p>',
  );
  assert.doesNotMatch(cleaned, /only listener-level/i);
  assert.doesNotMatch(cleaned, /limited to/i);
  assert.match(cleaned, /listener-level/);
  assert.match(cleaned, /5\.1 channels/);
});

// ── TEST 4 — an explicitly requested comparison is preserved ────────────────
test('TEST 4 — the client\'s own comparison request keeps the copy intact', () => {
  const body = '<p>This design is limited to 5.1, rather than the overhead layer of the upgrade.</p>';
  assert.equal(removeAbsentFeatureFraming(body, { allowed: true }), body);
  assert.equal(
    sanitizeNarrativeHtml(body, { sectionType: 'system_design_summary', absentFeatureFramingAllowed: true }),
    body,
    'and the sanitizer honours it',
  );
  // The request is read from the client's words, never inferred from the design.
  assert.equal(comparisonFramingRequested('Please compare the two options and explain the upgrade.'), true);
  assert.equal(comparisonFramingRequested('Show the budget trade-off between the options.'), true);
  assert.equal(comparisonFramingRequested('Focus on the immersive experience for films.'), false);
  assert.equal(comparisonFramingRequested(''), false);
});

// ── TEST 5 — a stated figure is evidence and is never removed ───────────────
test('TEST 5 — a sentence carrying an assessed figure is left alone', () => {
  const evidence = '<p>The assessed result is 114 dBC at Level 3 for the surround channels.</p>';
  assert.equal(removeAbsentFeatureFraming(evidence), evidence);
  const parameterised = '<p>P13 reaches L3 across the seating.</p>';
  assert.equal(removeAbsentFeatureFraming(parameterised), parameterised);
});

// ── TEST 6 — a body that was nothing but framing is kept, never emptied ─────
test('TEST 6 — an emptied body falls back to the copy that arrived', () => {
  const onlyFraming = '<p>This design has no overhead layer.</p>';
  const cleaned = removeAbsentFeatureFraming(onlyFraming);
  assert.equal(cleaned.length > 0, true);
  assert.equal(cleaned, onlyFraming, 'a section is never failed by this rule alone');
});

// ── TEST 7 — the writer is told the rule, positively and project-specifically ─
test('TEST 7 — the writer rule shapes positive copy instead of one fixed sentence', () => {
  const rule = absentFeatureFramingRule({ comparison: false });
  assert.match(rule, /DESCRIBE WHAT THE DESIGN DOES, NEVER WHAT IT DOES NOT DO/);
  // The banned shapes are named so the model can avoid them.
  for (const phrase of ['rather than an overhead sound layer', 'instead of overhead speakers', 'without height speakers', 'no overhead layer', 'no Atmos', 'not an immersive system', 'only listener-level', 'limited to 5.1', 'lacks', 'missing']) {
    assert.ok(rule.includes(phrase), `the rule names ${phrase}`);
  }
  // The positive register for a design with no height layer.
  assert.match(rule, /clear dialogue from the TV or the front stage/);
  assert.match(rule, /movement around the seating/);
  assert.match(rule, /sport, box sets, films and music/);
  // The example is offered as a shape, never as one sentence to paste everywhere.
  assert.match(rule, /Use the shape and not the words/);
  assert.equal(/must be written as: "The layout keeps/.test(rule), false);
  // The exception is stated, and reads differently for a comparison proposal.
  assert.match(rule, /Where the client has explicitly asked for a comparison/);
  assert.match(absentFeatureFramingRule({ comparison: true }), /This IS a comparison proposal/);
});

// ── TEST 8 — the rule reaches every proposal generation path ───────────────
test('TEST 8 — the rule is in the proposal prompt and the sanitizer, and nowhere else', () => {
  const voice = buildProposalSalesVoice('system_design_summary', 'single');
  assert.match(voice, /DESCRIBE WHAT THE DESIGN DOES, NEVER WHAT IT DOES NOT DO/);
  assert.match(buildProposalSalesVoice('system_design_summary', 'comparison'), /This IS a comparison proposal/);
  assert.match(buildProposalWritingAuthority(), /DESCRIBE WHAT THE DESIGN DOES, NEVER WHAT IT DOES NOT DO/);

  // The proposal narrative pass applies it, with the exception resolved by the caller.
  const sanitizer = read('base44/shared/proposalNarrativeSanitizer.js');
  assert.match(sanitizer, /removeAbsentFeatureFraming\(approved, \{ allowed: Boolean\(options\.absentFeatureFramingAllowed\) \}\)/);

  // Both generation paths pass the resolved exception in.
  for (const file of ['base44/shared/proposalDraftPipeline.js', 'base44/functions/regenerateProposalSection/entry.ts']) {
    const source = read(file);
    assert.match(source, /comparisonFramingRequested/, `${file} reads the client's own request`);
    assert.match(source, /absentFeatureFramingAllowed/, `${file} passes it to the narrative pass`);
  }
  assert.match(read('base44/shared/proposalDraftPipeline.js'), /resolvedType === 'comparison'/);
  assert.match(read('base44/functions/regenerateProposalSection/entry.ts'), /proposal\.proposal_type === 'comparison'/);
});

// ── TEST 9 — the shared report writing authority is untouched ──────────────
test('TEST 9 — the System Design report authority keeps its own wording', () => {
  const authority = read('base44/shared/soundProofWritingAuthority.js');
  // The shared authority (reports) is composed without the proposal-only rule.
  const sharedBlock = authority.slice(
    authority.indexOf('export const SOUND_PROOF_WRITING_AUTHORITY = ['),
    authority.indexOf('export const WRITING_AUTHORITY_SELF_CHECK'),
  );
  assert.equal(sharedBlock.includes('DESCRIBE WHAT THE DESIGN DOES'), false);
  // It is composed into the proposal authority only.
  assert.match(authority, /\$\{absentFeatureFramingRule\(\)\}/);
});

// ── TEST 10 — nothing outside proposal copy was touched ────────────────────
test('TEST 10 — no calculation, evidence or layout authority is read by the rule', () => {
  const rule = read('base44/shared/proposalWriter/absentFeatureFraming.js');
  for (const forbidden of ['publishEngineering', 'reportEvidenceAuthority', 'speakerDesignRows', 'rp22BassMetrics', 'ProjectAnalysisCache']) {
    assert.equal(rule.includes(forbidden), false, `${forbidden} is not touched by the framing rule`);
  }
  // The rule reads wording only.
  assert.match(rule, /Wording only\./);
});