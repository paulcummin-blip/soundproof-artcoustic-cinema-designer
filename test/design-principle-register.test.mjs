/**
 * design-principle-register.test.mjs
 * ----------------------------------
 * Guards the established-principle register: the boundary between DESIGN REASONING
 * (why an approach is used at all) and a RESULT CLAIM (what this design achieved).
 *
 * ADI holds three forms of knowledge and only one of them states an achieved
 * result: an established principle, the designer's recorded intention, and the
 * project's calculated performance. The consistency rules on the bass wording
 * protect the third form; they must never refuse the first two, and they must
 * never be weakened into a general exemption for claims that need evidence.
 *
 * It checks, against the real writer contract and the real evidence pack:
 *   - reasoning about an approach is accepted with no citation of its own;
 *   - a statement of what the design achieved is still refused unless the frozen
 *     evidence states it;
 *   - a figure, a comparison and a guarantee are NOT exempted by the register;
 *   - the register reads a sentence, never a level or a figure.
 *
 * Text and the validator only: no RP22 value, grade or threshold is read or
 * changed, no pack is rewritten, and no model is called.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { seatConsistencyClaim, unsupportedOutputCapability } from '../base44/shared/proposalWriter/writerOutputTextRules.js';
import {
  KNOWLEDGE_FORM,
  PRINCIPLE_REGISTER_RULE,
  isPrincipleRationale,
  knowledgeForm,
  principleRationale,
} from '../base44/shared/proposalWriter/writerPrincipleRegister.js';
import { EVIDENCE_AT as AT, twoOptions } from './fixtures/proposalEvidenceFixtures.mjs';
import { amend, withoutClaimIds } from './fixtures/proposalWriterFixtures.mjs';

/* ── Harness ───────────────────────────────────────────────────────────────── */

const writerInput = () => buildWriterInput({
  pack: buildProposalEvidence({ versions: twoOptions(), generatedAt: AT }),
});

/**
 * The violations the validator reports for one appended sentence, and only that
 * sentence. The fixture draft repeats a few claim statements across sections, so
 * the whole result carries duplication noise that is nothing to do with the
 * sentence under test.
 */
function violationsFor(sentence, section = 'overall_design', claimIds = []) {
  const input = writerInput();
  const output = amend(input, { section, sentence, claim_ids: claimIds });
  const result = validateWriterOutput({ input, output });
  return result.violations
    .filter((entry) => String(entry.sentence || '').trim() === sentence.trim())
    .map((entry) => entry.code);
}

/* ── The sentences under test ──────────────────────────────────────────────── */

/** Design reasoning: why the approach is used. Accepted without evidence of its own. */
const REASONING = [
  'Distributing subwoofers between the front and rear helps manage room resonances that produce bass peaks and dips.',
  'The arrangement is intended to improve bass consistency between seating positions.',
];

/** A capability statement: the third form, supported by the published P14 result. */
const CAPABILITY = 'Four subwoofers provide substantial low-frequency output capability.';

/** Claims of what this design achieved: refused unless the frozen evidence states it. */
const REFUSED = [
  'The system delivers identical bass at every seat.',
  'The four-subwoofer layout achieves excellent P20 consistency.',
  'The arrangement improves bass response by 6 dB compared with two subwoofers.',
  'Four subwoofers guarantee the elimination of room modes.',
];

/* ── The register reads reasoning, and nothing else ────────────────────────── */

test('the register reads design reasoning as reasoning', () => {
  for (const sentence of REASONING) {
    const read = principleRationale(sentence);
    assert.ok(read, `read as design reasoning: ${sentence}`);
    assert.equal(read.rule, PRINCIPLE_REGISTER_RULE);
  }
});

test('the register never reads an achieved result as reasoning', () => {
  for (const sentence of [...REFUSED, CAPABILITY]) {
    assert.equal(isPrincipleRationale(sentence), false, `not design reasoning: ${sentence}`);
  }
});

test('an outcome or an unframed improvement is a result claim, not reasoning', () => {
  const cases = [
    'Distributing subwoofers between the front and rear helps deliver consistent bass at every seat.',
    'The arrangement is intended to achieve consistent bass across the seats.',
    'The arrangement improves bass consistency between seating positions.',
    'Four subwoofers provide consistent bass at every seat.',
  ];
  for (const sentence of cases) {
    assert.equal(isPrincipleRationale(sentence), false, `not design reasoning: ${sentence}`);
  }
});

test('the register reads intent framing as intent', () => {
  for (const sentence of [
    'The arrangement is designed to spread the room\'s resonances so that they are less concentrated at one seat.',
    'Two subwoofers at the front and two at the rear are positioned so that the low-frequency output is distributed around the room.',
  ]) {
    assert.equal(isPrincipleRationale(sentence), true, `read as design reasoning: ${sentence}`);
  }
});

test('a level or a figure alone removes a sentence from the register', () => {
  assert.equal(isPrincipleRationale('Spreading the subwoofers reduces the influence of room modes to L2.'), false);
  assert.equal(isPrincipleRationale('Spreading the subwoofers reduces the influence of room modes by 6 dB.'), false);
});

/* ── Through the writer contract ───────────────────────────────────────────── */

test('design reasoning is accepted, and the register is what accepts it', () => {
  for (const sentence of REASONING) {
    assert.deepEqual(violationsFor(sentence), [], `accepted: ${sentence}`);
  }
  // The consistency rules would refuse this wording on their own, which is why
  // the register exists: the sentence is a consistency claim in shape only.
  assert.ok(seatConsistencyClaim(REASONING[1]), 'the wording reads as a consistency claim');
});

test('a claim the evidence does not state is still refused', () => {
  assert.ok(
    violationsFor(REFUSED[0]).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION),
    'identical bass at every seat',
  );
  assert.ok(
    violationsFor(REFUSED[1]).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION),
    'excellent P20 consistency',
  );
});

test('the register is not an exemption from figure, comparison or guarantee rules', () => {
  const comparison = violationsFor(REFUSED[2]);
  assert.ok(
    comparison.includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
    `a figure the reports do not state is refused: ${comparison.join(',')}`,
  );

  const guarantee = violationsFor(REFUSED[3]);
  assert.ok(guarantee.length > 0, 'a guarantee of elimination is refused');
  assert.ok(
    !guarantee.includes(PRINCIPLE_REGISTER_RULE),
    'the register never reports a sentence it exempted',
  );
});

test('the capability statement is held to the published P14 result', () => {
  const input = writerInput();
  const p14 = input.allowed_claims.find((claim) => claim.area === 'p14');

  const supported = validateWriterOutput({
    input,
    output: amend(input, { section: 'dynamic_range', sentence: CAPABILITY, claim_ids: [p14.claim_id] }),
  });
  assert.deepEqual(
    supported.violations
      .filter((entry) => String(entry.sentence || '').trim() === CAPABILITY)
      .map((entry) => entry.code),
    [],
    'supported by the published P14 result',
  );

  // WITHOUT a capability result: the same statement, in a section that cites no
  // capability claim, is refused. It never rests on its own authority.
  const bare = withoutClaimIds(writerInput(), 'dynamic_range');
  const bareSection = bare.sections.find((entry) => entry.section === 'dynamic_range');
  bareSection.text = `${bareSection.text} ${CAPABILITY}`;
  const refused = validateWriterOutput({ input: writerInput(), output: bare }).violations
    .filter((entry) => String(entry.sentence || '').trim() === CAPABILITY)
    .map((entry) => entry.code);
  assert.ok(
    refused.includes(WRITER_REJECTION.INVENTED_BENEFIT),
    `refused without a capability claim: ${refused.join(',')}`,
  );

  // The rule reads the cited claims, and needs no grade to be named: P14 and the
  // other applicable capability areas ground the statement, and nothing else does.
  assert.equal(
    unsupportedOutputCapability({ sentence: CAPABILITY, claims: [] }),
    'qualitative_output_capability_needs_a_cited_capability_result',
  );
  assert.equal(unsupportedOutputCapability({ sentence: CAPABILITY, claims: [{ area: 'p14' }] }), null);
  assert.equal(unsupportedOutputCapability({ sentence: CAPABILITY, claims: [{ area: 'p13' }] }), null);
  assert.equal(unsupportedOutputCapability({ sentence: 'The screen is 115 inches wide.', claims: [] }), null);
});

/* ── The three forms of knowledge, told apart ──────────────────────────────── */

test('the classifier states which form of knowledge a sentence carries', () => {
  assert.equal(knowledgeForm(REASONING[0]), KNOWLEDGE_FORM.ESTABLISHED_PRINCIPLE);
  assert.equal(knowledgeForm(REASONING[1]), KNOWLEDGE_FORM.DESIGNER_INTENTION);
  for (const sentence of REFUSED) {
    assert.equal(knowledgeForm(sentence), KNOWLEDGE_FORM.ACHIEVED_PERFORMANCE, sentence);
  }
  assert.equal(knowledgeForm(CAPABILITY), KNOWLEDGE_FORM.ACHIEVED_PERFORMANCE);
});

/* ── Framing words never buy back an achieved result ───────────────────────── */

test('helps, designed to, intended to and expected to never exempt an achieved result', () => {
  const bypasses = [
    'The four-subwoofer layout is intended to deliver identical bass at every seat.',
    'Four subwoofers are designed to eliminate room modes.',
    'The arrangement is expected to improve bass response by 6 dB compared with two subwoofers.',
    'Distributing subwoofers between the front and rear helps achieve consistent bass across every seat.',
  ];
  for (const sentence of bypasses) {
    assert.equal(knowledgeForm(sentence), KNOWLEDGE_FORM.ACHIEVED_PERFORMANCE, `not reasoning: ${sentence}`);
    const codes = violationsFor(sentence);
    assert.ok(codes.length > 0, `refused: ${sentence} (${codes.join(',')})`);
    assert.ok(!codes.includes(PRINCIPLE_REGISTER_RULE), `never exempted by the register: ${sentence}`);
  }
});

test('an achieved result asserted in a second clause is still read on its own', () => {
  // The first clause is the designer's intention; the second attributes a
  // delivered result. The exemption is clause-scoped, so the second clause is not
  // covered by the first.
  const sentence = 'The arrangement is intended to improve bass consistency, and the system delivers identical bass at every seat.';
  const codes = violationsFor(sentence);
  assert.ok(codes.length > 0, `refused: ${codes.join(',')}`);
  assert.ok(!isPrincipleRationale('the system delivers identical bass at every seat.'));
});