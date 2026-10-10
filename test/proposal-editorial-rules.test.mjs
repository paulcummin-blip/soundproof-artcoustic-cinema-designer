//
// The proposal sales-language pass: the editorial rules of the writer.
//
// The grounding rules are untouched by this pass. These tests prove the four
// editorial rules fire, and that they are scoped: comparative language is
// refused only in a single-option proposal, and display terminology is held only
// for a TV. A single-option proposal also carries no comparison headings, while
// the section IDs, order and word limits are identical in both modes.
//
// No GPT call is made here and nothing is generated: the validator is a pure
// function of (input, draft).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import {
  displayTerminologyIssue,
  installationStateClaim,
  reportVoicePhrase,
  unsupportedComparative,
} from '../base44/shared/proposalWriter/writerEditorialRules.js';
import { EVIDENCE_AT as AT, option, twoOptions } from './fixtures/proposalEvidenceFixtures.mjs';
import { amend } from './fixtures/proposalWriterFixtures.mjs';

const singleInput = () => buildWriterInput({
  pack: buildProposalEvidence({ versions: [option('a')], generatedAt: AT }),
});
const comparisonInput = () => buildWriterInput({
  pack: buildProposalEvidence({ versions: twoOptions(), generatedAt: AT }),
});
const codes = (input, amendment) => validateWriterOutput({ input, output: amend(input, amendment) })
  .violations.map((entry) => entry.code);

/* ── 1. A single-option proposal is labelled, not compared ─────────────────── */

test('a single-option proposal carries no comparison headings', () => {
  const single = singleInput();
  const comparison = comparisonInput();

  assert.equal(single.section_structure.proposal_mode, 'single');
  assert.equal(single.section_structure.comparison, false);
  assert.equal(single.section_structure.labels.what_stays_same, 'Design Overview');
  assert.equal(single.section_structure.labels.what_changes, 'Why This Specification');

  // Identical section IDs and word limits: only the label and the requirement
  // change, so the returned draft is the same shape either way.
  assert.deepEqual(single.output.sections.map((entry) => entry.section),
    comparison.output.sections.map((entry) => entry.section));
  assert.deepEqual(single.output.sections.map((entry) => entry.word_limit),
    comparison.output.sections.map((entry) => entry.word_limit));

  assert.equal(comparison.section_structure.labels.what_stays_same, 'What Stays the Same');
  assert.equal(comparison.section_structure.labels.what_changes, 'What Changes');
});

/* ── 2. Comparative language, and where it is refused ──────────────────────── */

test('comparative capability language is refused in a single-option proposal only', () => {
  const sentences = [
    'This design introduces an increase in output capability.',
    'The screen stage has greater headroom.',
    'The surround layer is improved this time.',
    'It is more capable than before.',
    'The subwoofers add additional headroom.',
  ];

  const single = singleInput();
  for (const sentence of sentences) {
    assert.ok(
      codes(single, { section: 'what_stays_same', sentence }).includes(WRITER_REJECTION.UNSUPPORTED_COMPARATIVE),
      `${sentence} must be refused in a single-option proposal`,
    );
  }

  // A comparison proposal compares, so the same words are not refused for it.
  const comparison = comparisonInput();
  for (const sentence of sentences) {
    assert.equal(
      codes(comparison, { section: 'what_changes', sentence }).includes(WRITER_REJECTION.UNSUPPORTED_COMPARATIVE),
      false,
      `${sentence} is a legitimate comparison`,
    );
  }

  // The capability itself is still written directly.
  assert.equal(unsupportedComparative('The system is specified to deliver 118 dBC of low-frequency output.'), null);
});

/* ── 3. No software voice, and no filler ───────────────────────────────────── */

test('the software-report register is refused in both modes', () => {
  assert.ok(reportVoicePhrase('The screen stage is assessed for 114 dBC.'));
  assert.ok(reportVoicePhrase('According to the report, the seats are inside the zone.'));
  assert.ok(reportVoicePhrase('Performance result: 116 dBC.'));

  const input = comparisonInput();
  assert.ok(codes(input, { section: 'what_stays_same', sentence: 'The screen stage is assessed for 114 dBC.' })
    .includes(WRITER_REJECTION.REPORT_VOICE));
  assert.ok(codes(singleInput(), { section: 'what_changes', sentence: 'There are no changes to report.' })
    .includes(WRITER_REJECTION.REPORT_VOICE));

  // The engineering vocabulary a proposal legitimately carries is untouched.
  assert.equal(reportVoicePhrase('The assessed seating positions sit inside the recommended zone.'), null);
  assert.equal(reportVoicePhrase('The screen channels keep their scale.'), null);
});

/* ── 4. Installation is never claimed ──────────────────────────────────────── */

test('an installation-state claim is refused', () => {
  assert.ok(installationStateClaim('The system is installed behind the screen.'));

  const input = comparisonInput();
  assert.ok(codes(input, { section: 'appendix_notes', sentence: 'The system is installed behind the screen.' })
    .includes(WRITER_REJECTION.INSTALLATION_STATE_CLAIM));

  // What a proposal is written with instead.
  assert.equal(installationStateClaim('The system is specified for this room.'), null);
  assert.equal(installationStateClaim('Each layer keeps its scale.'), null);
});

/* ── 5. The display is named as the frozen authority names it ──────────────── */

test('a TV is never written as a screen, an aspect ratio or a projector', () => {
  const tv = { displayType: 'tv' };
  assert.ok(displayTerminologyIssue({ ...tv, text: 'The 115" screen fills the wall.' }));
  assert.ok(displayTerminologyIssue({ ...tv, text: 'The screen size suits the room.' }));
  assert.ok(displayTerminologyIssue({ ...tv, text: 'The 16:9 image fills the wall.' }));
  assert.ok(displayTerminologyIssue({ ...tv, text: 'The projector lights the front wall.' }));

  // The TV identity itself, and the speaker-role vocabulary, are what pass.
  assert.equal(displayTerminologyIssue({ ...tv, text: 'The front row makes the most of the 115" TV, at a 57.3° viewing angle.' }), null);
  assert.equal(displayTerminologyIssue({ ...tv, text: 'The screen channels are inside the recommended zone.' }), null);

  // A projection screen keeps its own language.
  assert.equal(displayTerminologyIssue({ displayType: 'projector_screen', text: 'The 150" screen fills the wall.' }), null);
  assert.equal(displayTerminologyIssue({ displayType: 'projector_screen', text: 'The projector lights the front wall.' }), null);
});