//
// Proposal-stage writing: sell what is strong, and never review the design.
//
// The proposal states the FINISHED design, so its copy sells the supported
// strengths of the design that was selected, keeps every claim inside the scope
// the evidence states it for, and carries no design-stage corrective commentary.
// These tests prove the acceptance rules for that:
//
//   A/B/C  a primary-seat result is stated positively at its own level, and no
//          secondary-seat caveat is added or required;
//   D      an all-seat claim is refused unless the all-seat evidence supports it;
//   E      design-stage wording is refused: needs attention, needs calibration,
//          needs optimisation, should be improved;
//   F      a genuine material issue is held for human review instead of becoming
//          design-stage advice in the copy.
//
// Every pack here is built by the real evidence builder from report evidence in
// the shape `readProposalReportEvidence` returns it. No GPT call is made.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { buildWriterPrompt } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { WRITER_REJECTION, WRITER_WRITING_RULES } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { DESIGN_STAGE_RULES } from '../base44/shared/proposalWriter/writerDesignStageRules.js';
import { WRITER_SECTIONS } from '../base44/shared/proposalWriter/writerContractSchema.js';
import {
  deriveGenerationStatus, GENERATION_REVIEW_REJECTIONS, GENERATION_STATUS,
} from '../base44/shared/proposalGeneration/generationStatuses.js';
import { CLAIM_KIND } from '../base44/shared/proposalEvidence/evidencePackSchema.js';
import { buildProposalWritingAuthority } from '../base44/shared/soundProofWritingAuthority.js';
import { PROPOSAL_STAGE_BOUNDARY } from '../base44/shared/proposalStageBoundary.js';
import {
  MARQUEE_LEVELS_FOUR, MARQUEE_LEVELS_ONE, MARQUEE_VALUES_FOUR, MARQUEE_VALUES_ONE,
  option, seatScopes,
} from './fixtures/proposalEvidenceFixtures.mjs';
import { validDraft } from './fixtures/proposalWriterFixtures.mjs';

const AT = '2026-10-06T10:00:00.000Z';

/** The Marquee pair carrying the scoped results a saved report states. */
function packFor({ primary = {}, secondary = {}, primarySeats = 3, secondarySeats = 3, levels = {} } = {}) {
  const scopes = seatScopes({ primary, secondary, primarySeats, secondarySeats });
  return buildProposalEvidence({
    versions: [
      option('a', {
        levels: { ...MARQUEE_LEVELS_ONE, ...(levels.one || {}) },
        values: MARQUEE_VALUES_ONE,
        subwoofers: 'SUB3-12 x 2',
        seatScopes: scopes,
      }),
      option('b', {
        levels: { ...MARQUEE_LEVELS_FOUR, ...(levels.four || {}) },
        values: MARQUEE_VALUES_FOUR,
        subwoofers: 'SUB4-12 x 4',
        seatScopes: scopes,
      }),
    ],
    generatedAt: AT,
  });
}

const scopedOf = (pack, area) => pack.allowed_claims
  .filter((claim) => claim.kind === CLAIM_KIND.SCOPED_RESULT && claim.area === area);

/** One sentence alone in one section, citing only the claims handed to it. */
function validateSentence(pack, section, sentence, claimIds) {
  const input = buildWriterInput({ pack });
  const draft = validDraft(input);
  const target = draft.sections.find((entry) => entry.section === section);
  target.text = sentence;
  target.claim_ids = claimIds;
  return validateWriterOutput({ input, output: draft });
}

const codes = (result) => result.violations.map((entry) => entry.code);

/** The refusals that would mean the sentence oversold, widened or reviewed the design. */
const SALES_REFUSALS = Object.freeze([
  WRITER_REJECTION.DESIGN_STAGE_COMMENTARY,
  WRITER_REJECTION.SCOPE_MISMATCH,
  WRITER_REJECTION.P20_BASS_CONTRADICTION,
  WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT,
  WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION,
  WRITER_REJECTION.INVENTED_BENEFIT,
  WRITER_REJECTION.MISSING_CLAIM_ID,
]);

const salesRefusals = (result) => result.violations.filter((entry) => SALES_REFUSALS.includes(entry.code));

/** A statement is clean when it sells the result without a single refusal above. */
function assertClean(pack, section, sentence, claimIds) {
  const result = validateSentence(pack, section, sentence, claimIds);
  assert.deepEqual(salesRefusals(result), [], `${sentence} -> ${JSON.stringify(result.violations)}`);
  return result;
}

/* ── A, B and C: the primary seats, at each positive level ─────────────────── */

test('A. a Level 4 primary-seat result is stated positively, with no secondary-seat caveat', () => {
  const pack = packFor({ primary: { p20: 'L4' }, secondary: { p20: 'L1' } });
  const claim = 'claim_p20_primary_consistency_01';

  assertClean(pack, 'overall_design', 'Excellent consistency across the primary seats.', [claim]);
  // The pack's own statement of the same result reads identically and is clean too.
  assertClean(pack, 'overall_design', scopedOf(pack, 'p20')[0].statement, [claim]);

  // The secondary seats are L1: they support no claim, and the copy states
  // nothing about them. No caveat is added, and none is required.
  const scoped = scopedOf(pack, 'p20');
  assert.deepEqual(
    scoped.map((entry) => entry.claim_id),
    ['claim_p20_primary_consistency_01', 'claim_p20_primary_consistency_02'],
    'only the primary seats carry a scoped claim',
  );
  const single = validateSentence(pack, 'overall_design', 'Excellent consistency across the primary seats.', [claim]);
  assert.equal(single.sections.find((entry) => entry.section === 'overall_design').words > 0, true);
});

test('B and C. a Great Level 3 and a Good Level 2 primary result read the same way', () => {
  const cases = [
    ['L3', 'Great', 'claim_p20_primary_consistency_01'],
    ['L2', 'Good', 'claim_p20_primary_consistency_01'],
  ];

  for (const [level, adjective] of cases.map((entry) => entry.slice(0, 2))) {
    const pack = packFor({ primary: { p20: level }, secondary: { p20: 'L1' } });
    const claim = scopedOf(pack, 'p20')[0];
    assert.equal(claim.wording, adjective, `${level} states its own adjective`);
    assertClean(pack, 'overall_design', `${adjective} consistency across the primary seats.`, [claim.claim_id]);
    // And the pack's own sentence for that scope, word for word.
    assertClean(pack, 'overall_design', claim.statement, [claim.claim_id]);
  }
});

test('the same rule carries every parameter: spacing, overhead consistency and bass', () => {
  const pack = packFor({
    primary: { p5: 'L2', p10: 'L3', p19: 'L4' },
    secondary: { p5: 'L1', p10: 'L1', p19: 'L1' },
  });

  const expected = [
    ['p5', 'Good spacing across the primary seats.'],
    ['p10', 'Great overhead consistency across the primary seats.'],
    ['p19', 'Excellent bass consistency across the primary seats.'],
  ].map(([area, sentence]) => {
    const claim = scopedOf(pack, area).find((entry) => entry.scope === 'primary');
    assert.ok(claim, `${area} states a primary-seat result: ${JSON.stringify(scopedOf(pack, area).map((e) => e.claim_id))}`);
    return [sentence, claim.claim_id];
  });

  for (const [sentence, claimId] of expected) {
    assertClean(pack, 'key_performance_highlights', sentence, [claimId]);
  }
});

test('a weaker secondary scope is never written, and its claim is never borrowed', () => {
  const pack = packFor({ primary: { p10: 'L4' }, secondary: { p10: 'L1' } });
  const primary = 'claim_p10_primary_consistency_01';

  // The caveats the proposal stage forbids are refused, not written.
  for (const sentence of [
    'Secondary seats need more attention.',
    'Full-room consistency still needs calibration attention.',
  ]) {
    const result = validateSentence(pack, 'overall_design', sentence, [primary]);
    assert.ok(
      codes(result).includes(WRITER_REJECTION.DESIGN_STAGE_COMMENTARY),
      `${sentence} -> ${JSON.stringify(result.violations)}`,
    );
  }

  // And a primary result may not be re-worded for the secondary seats.
  const borrowed = validateSentence(pack, 'overall_design', 'Excellent overhead consistency across the secondary seats.', [primary]);
  assert.ok(codes(borrowed).includes(WRITER_REJECTION.SCOPE_MISMATCH), JSON.stringify(borrowed.violations));
});

/* ── D: an all-seat claim needs all-seat evidence ──────────────────────────── */

test('D. an all-seat claim is refused unless the all-seat evidence supports it', () => {
  const pack = packFor({ primary: { p20: 'L4' }, secondary: { p20: 'L1' } });
  const primary = 'claim_p20_primary_consistency_01';

  for (const sentence of [
    'Excellent consistency across the seating area.',
    'Excellent consistency across all seats.',
    'Excellent consistency for every seat.',
  ]) {
    const result = validateSentence(pack, 'overall_design', sentence, [primary]);
    assert.ok(codes(result).includes(WRITER_REJECTION.SCOPE_MISMATCH), `${sentence} -> ${JSON.stringify(result.violations)}`);
  }

  // Where the whole-seat evidence states the level, the same sentence stands.
  const supported = packFor({ levels: { one: { 20: 'L1' }, four: { 20: 'L4' } } });
  const whole = supported.allowed_claims
    .find((claim) => claim.area === 'p20' && claim.kind === CLAIM_KIND.MATERIAL_GAIN);
  assert.ok(whole, JSON.stringify(supported.allowed_claims.filter((claim) => claim.area === 'p20')));

  const result = validateSentence(supported, 'overall_design', 'Excellent bass consistency across the seating area.', [whole.claim_id]);
  assert.equal(result.valid, true, JSON.stringify(result.violations));
});

/* ── E: no design-stage wording ────────────────────────────────────────────── */

test('E. design-stage wording is refused, however it is phrased', () => {
  const pack = packFor({ primary: { p20: 'L4' }, secondary: { p20: 'L1' } });
  const claimed = pack.allowed_claims.filter((claim) => claim.area === 'p20').map((claim) => claim.claim_id);

  const refused = [
    'Secondary seats need more attention.',
    'Full-room consistency still needs calibration attention.',
    'The rear row remains compromised.',
    'Further optimisation is required.',
    'The spacing should be improved.',
    'The bass response needs calibration in the room.',
    'Further design work would be needed to even out the bass.',
    'Future optimisation of the response is recommended.',
  ];

  for (const sentence of refused) {
    const result = validateSentence(pack, 'overall_design', sentence, claimed);
    assert.ok(
      codes(result).includes(WRITER_REJECTION.DESIGN_STAGE_COMMENTARY),
      `${sentence} -> ${JSON.stringify(result.violations)}`,
    );
  }

  // The words themselves are refused, not the honesty: the same facts stated as
  // the design's own scoped strength are clean.
  assertClean(pack, 'overall_design', 'Excellent consistency across the primary seats.', ['claim_p20_primary_consistency_01']);
  assert.ok(DESIGN_STAGE_RULES.length >= 4, JSON.stringify(DESIGN_STAGE_RULES));
});

/* ── F: a material issue goes to a human ──────────────────────────────────── */

test('F. a genuine issue is held for human review instead of becoming design-stage advice', () => {
  assert.ok(
    GENERATION_REVIEW_REJECTIONS.includes(WRITER_REJECTION.DESIGN_STAGE_COMMENTARY),
    'the refusal is a review-class rejection',
  );

  const status = deriveGenerationStatus({
    outcome: 'generated',
    outputReceived: true,
    validation: {
      valid: false,
      violations: [{
        code: WRITER_REJECTION.DESIGN_STAGE_COMMENTARY, section: 'overall_design', detail: 'design_stage_commentary:design_shortfall', claim_ids: [],
      }],
    },
  });
  assert.equal(status, GENERATION_STATUS.NEEDS_HUMAN_REVIEW);
});

/* ── The guidance the writer reads ─────────────────────────────────────────── */

test('the proposal prompt sells scoped strengths and asks for no design-stage caveat', () => {
  const authority = buildProposalWritingAuthority();
  const prompt = buildWriterPrompt({ input: buildWriterInput({ pack: packFor({ primary: { p20: 'L4' }, secondary: { p20: 'L1' } }) }) });

  for (const line of [
    'Excellent consistency across the primary seats.',
    'Great consistency across the primary seats.',
    'Good consistency across the primary seats.',
    'Sell what is strong',
  ]) {
    assert.ok(authority.includes(line), `the proposal authority must carry: ${line}`);
  }

  // The instruction that produced the calibration caveat is gone.
  assert.equal(/calibration attention/.test(authority), false, 'the authority no longer asks for a calibration caveat');
  assert.equal(/calibration attention/.test(PROPOSAL_STAGE_BOUNDARY), false);
  assert.equal(/does not support it:[\s\S]*?calibration/.test(authority), false);

  assert.match(authority, /A MATERIAL ISSUE IS NOT A DESIGN NOTE/);
  assert.match(prompt, /held for human review/);
  assert.match(prompt, /not a design review/i);
  assert.ok(WRITER_WRITING_RULES.some((rule) => /not a design review/i.test(rule)), JSON.stringify(WRITER_WRITING_RULES));
  assert.ok(WRITER_WRITING_RULES.some((rule) => /Sell what is strong/i.test(rule)));
  assert.equal(WRITER_SECTIONS.length, 9, 'the nine sections are untouched');
  assert.ok(prompt.includes('proposal-writer-prompt-4'), 'the generation is filed under the current prompt version');
});