//
// Phase 2 — the writer contract and the output validator.
//
// The writer is given the frozen Phase 1 evidence pack and nothing else. These
// tests prove the contract names what it must, and that a returned draft is
// rejected for every reason the contract lists: an unsupported claim, a blocked
// claim, a changed figure or level, an unselected or mis-attributed product, an
// unsupported recommendation or improvement, a bass consistency claim P20 does
// not support, a section over its limit, and any schema violation.
//
// No GPT call is made here and nothing is generated: the fixtures are drafts,
// and the validator is a pure function of (input, draft).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import {
  WRITER_REJECTION,
  WRITER_SECTIONS,
} from '../base44/shared/proposalWriter/writerContractSchema.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import {
  parseWriterOutput,
  validateWriterOutput,
} from '../base44/shared/proposalWriter/writerOutputValidator.js';
import {
  EVIDENCE_AT as AT,
  marqueeOptions,
  option,
  twoOptions,
} from './fixtures/proposalEvidenceFixtures.mjs';
import {
  amend,
  asOutputText,
  marqueeDraft,
  validDraft,
  withExtraTopLevelField,
  withoutClaimIds,
} from './fixtures/proposalWriterFixtures.mjs';

/** The recorded Marquee pack fingerprint, from the Phase 1 audit. */
// The Marquee pack's own content fingerprint. It moved from 4fe44d7e when the
// pack's P20 block gained the sentence that says which scope it governs — the
// block is part of the pack, so its wording is part of what the fingerprint
// identifies. Nothing else in the pack changed, and the draft's values are
// untouched by it: this is the pack the audit's draft is still read against.
const MARQUEE_PACK_FINGERPRINT = '77d48356';

const pack = (versions = twoOptions()) => buildProposalEvidence({ versions, generatedAt: AT });
const writerInput = (versions) => buildWriterInput({ pack: pack(versions) });
const validate = (input, output) => validateWriterOutput({ input, output });
const codes = (result) => result.violations.map((entry) => entry.code);

/* ── The input contract ────────────────────────────────────────────────────── */

test('the writer input carries the pack, the sections, the claims and the rule', () => {
  const input = writerInput();

  for (const key of [
    'contract_version', 'prompt_version', 'output', 'evidence', 'evidence_pack',
    'writing_rules', 'word_limits', 'section_requirements', 'allowed_claims',
    'blocked_claims', 'bass', 'claim_grounding', 'input_fingerprint',
  ]) {
    assert.ok(key in input, `the input carries ${key}`);
  }

  assert.equal(input.contract_version, 1);
  assert.equal(input.evidence_pack.schema_version, 2);
  assert.equal(input.evidence.pack_fingerprint, input.evidence_pack.pack_fingerprint);
  assert.equal(input.evidence_pack.pack_fingerprint, pack().pack_fingerprint);

  // The nine sections, each with its own word limit and requirement.
  assert.deepEqual(input.section_requirements.map((entry) => entry.section), WRITER_SECTIONS.map((entry) => entry.section));
  assert.equal(input.section_requirements.length, 9);
  assert.ok(input.section_requirements.every((entry) => entry.requires_grounding === true));
  assert.ok(input.section_requirements.every((entry) => Number.isFinite(entry.word_limit) && entry.word_limit > 0));
  assert.deepEqual(input.output.sections.map((entry) => entry.section), WRITER_SECTIONS.map((entry) => entry.section));
  assert.equal(input.output.mode, 'json_only');

  // Every allowed claim, with its ID; every blocked claim, with its rule.
  assert.ok(input.allowed_claims.length > 0);
  assert.ok(input.allowed_claims.every((claim) => claim.claim_id.startsWith('claim_') && claim.statement));
  assert.ok(input.allowed_claims.some((claim) => claim.claim_id === 'claim_p12_material_gain_01'));
  assert.ok(input.blocked_claims.length > 0);
  assert.ok(input.blocked_claims.every((block) => block.block_id.startsWith('block_') && block.prohibited));
  assert.equal(input.claim_grounding.section_field, 'claim_ids');
  assert.ok(input.writing_rules.length >= 8);

  // Deterministic, and never built from another pack generation.
  assert.deepEqual(writerInput(), writerInput());
  assert.equal(writerInput().input_fingerprint, writerInput().input_fingerprint);
  assert.notEqual(writerInput([option('a'), option('b', { layout: '7.1.4' })]).input_fingerprint, writerInput().input_fingerprint);
  assert.throws(() => buildWriterInput({ pack: { schema_version: 1, options: [] } }), /generation/);
  assert.throws(() => buildWriterInput({ pack: null }), /frozen proposal evidence pack/);
});

/* ── A. A valid output ─────────────────────────────────────────────────────── */

test('A. a compliant draft passes validation', () => {
  const input = writerInput();
  const result = validate(input, validDraft(input));

  assert.equal(result.valid, true, JSON.stringify(result.violations));
  assert.deepEqual(result.violations, []);
  assert.equal(result.pack_fingerprint, input.evidence_pack.pack_fingerprint);
  assert.equal(result.sections.length, 9);
  assert.ok(result.sections.every((entry) => entry.words > 0 && entry.words <= entry.word_limit));
  assert.ok(result.sections.every((entry) => Array.isArray(entry.claim_ids)));
  assert.ok(result.sections.find((entry) => entry.section === 'key_performance_highlights').claim_ids.length > 0);
});

/* ── B. A changed figure or level ──────────────────────────────────────────── */

test('B. a changed figure or level is blocked for every graded parameter', () => {
  const input = writerInput();

  const cases = [
    { section: 'key_performance_highlights', sentence: 'P12 now delivers 121 dBC.', code: WRITER_REJECTION.CHANGED_PARAMETER_VALUE },
    { section: 'key_performance_highlights', sentence: 'P13 now delivers 115 dBC.', code: WRITER_REJECTION.CHANGED_PARAMETER_VALUE },
    { section: 'dynamic_range', sentence: 'P14 now delivers 124 dB.', code: WRITER_REJECTION.CHANGED_PARAMETER_VALUE },
    { section: 'timbre_matching', sentence: 'P18 now extends to 18 Hz.', code: WRITER_REJECTION.CHANGED_PARAMETER_VALUE },
    { section: 'timbre_matching', sentence: 'P19 now holds +/-4 dB.', code: WRITER_REJECTION.CHANGED_PARAMETER_VALUE },
    { section: 'dynamic_range', sentence: 'P12 now reaches L1.', code: WRITER_REJECTION.CHANGED_LEVEL },
    { section: 'overall_design', sentence: 'P20 now reaches L4.', code: WRITER_REJECTION.CHANGED_LEVEL },
  ];

  for (const entry of cases) {
    const result = validate(input, amend(input, entry));
    assert.equal(result.valid, false, `${entry.sentence} must be blocked`);
    assert.ok(codes(result).includes(entry.code), `${entry.sentence} -> ${entry.code} (${JSON.stringify(codes(result))})`);
  }

  // The figures the reports do state remain allowed, so the rule is a change of
  // value and not a blanket refusal of numbers.
  const unchanged = amend(input, { section: 'dynamic_range', sentence: 'P12 records 114 dBC at L4 and P14 records 118 dB at L4.' });
  assert.deepEqual(codes(validate(input, unchanged)), []);
});

/* ── C. Products ───────────────────────────────────────────────────────────── */

test('C. an unselected product, or one belonging to the other option, is blocked', () => {
  const input = writerInput();

  const unselected = amend(input, {
    section: 'what_changes',
    sentence: 'The Level 4 design is specified with SUB6-15 x 2.',
  });
  assert.equal(validate(input, unselected).valid, false);
  assert.ok(codes(validate(input, unselected)).includes(WRITER_REJECTION.UNSELECTED_PRODUCT));

  const misattributed = amend(input, {
    section: 'key_performance_highlights',
    sentence: 'The Level 4 design is specified with SUB3-12 x 2 behind the screen.',
  });
  const result = validate(input, misattributed);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes(WRITER_REJECTION.EXTRA_PRODUCT), JSON.stringify(result.violations));

  // The products the pack does list, named against their own option, pass.
  const stated = amend(input, {
    section: 'what_changes',
    sentence: 'The subwoofer specification changes to SUB4-12 x 2 rather than SUB3-12 x 2.',
  });
  assert.deepEqual(codes(validate(input, stated)), []);
});

/* ── D. Blocked claims and the bass rule ───────────────────────────────────── */

test('D. a blocked bass claim, a cited blocked claim and a refused recommendation are rejected', () => {
  const input = writerInput();

  const bass = amend(input, {
    section: 'appendix_notes',
    sentence: 'The Level 4 design solves bass consistency across the room.',
  });
  assert.equal(bass === null, false);
  assert.ok(codes(validate(input, bass)).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION));

  const uniform = amend(input, {
    section: 'overall_design',
    sentence: 'Both designs now deliver uniform bass across all seats.',
  });
  assert.ok(codes(validate(input, uniform)).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION));

  const blockId = input.blocked_claims
    .find((block) => block.reason === 'no_solved_bass_consistency').block_id;
  const citedBlock = amend(input, { section: 'appendix_notes', sentence: 'See the evidence note.', claim_ids: [blockId] });
  assert.ok(codes(validate(input, citedBlock)).includes(WRITER_REJECTION.BLOCKED_CLAIM));

  // A recommendation where the pack allows none: the screen changed, so there is
  // no shared design for a framing, and no recommendation claim was minted.
  const refused = buildWriterInput({
    pack: buildProposalEvidence({ versions: [option('a'), option('b', { screen: '150" (16:9)' })], generatedAt: AT }),
  });
  assert.equal(refused.allowed_claims.some((claim) => claim.kind === 'recommendation'), false);
  const recommendation = amend(refused, {
    section: 'decision_summary',
    sentence: 'We recommend the Level 4 design for maximum performance.',
  });
  assert.ok(codes(validate(refused, recommendation)).includes(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION));
  assert.deepEqual(codes(validate(refused, validDraft(refused))), []);
});

/* ── E. An unsupported benefit ─────────────────────────────────────────────── */

test('E. an improvement claimed in an area the pack shares is blocked', () => {
  const input = writerInput();
  const screen = input.allowed_claims.find((claim) => claim.area === 'screen_size' && claim.kind === 'shared_result');
  const seating = input.allowed_claims.find((claim) => claim.area === 'seating' && claim.kind === 'shared_result');

  const result = validate(input, amend(input, {
    section: 'what_stays_same',
    sentence: 'The screen improves with this option and the seating improves as well.',
    claim_ids: [screen.claim_id, seating.claim_id],
  }));

  assert.equal(result.valid, false);
  assert.ok(codes(result).includes(WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT), JSON.stringify(result.violations));
  assert.ok(codes(result).includes(WRITER_REJECTION.INVENTED_BENEFIT), JSON.stringify(result.violations));

  const improvements = result.violations.filter((entry) => entry.code === WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT);
  assert.equal(improvements.length >= 2, true, 'the screen and the seating are each reported');
});

/* ── F. Claim-ID grounding ─────────────────────────────────────────────────── */

test('F. a claim without grounding, and an unknown claim ID, are blocked', () => {
  const input = writerInput();

  const ungrounded = validate(input, withoutClaimIds(input, 'what_changes'));
  assert.equal(ungrounded.valid, false);
  assert.ok(codes(ungrounded).includes(WRITER_REJECTION.MISSING_CLAIM_ID), JSON.stringify(ungrounded.violations));
  assert.equal(codes(ungrounded).includes(WRITER_REJECTION.INVENTED_BENEFIT), false, 'nothing is invented; nothing is cited');

  const unknown = amend(input, {
    section: 'what_changes',
    sentence: 'Headroom is greater.',
    claim_ids: ['claim_p99_material_gain_01'],
  });
  assert.equal(validate(input, unknown).valid, false);
  assert.ok(codes(validate(input, unknown)).includes(WRITER_REJECTION.UNSUPPORTED_CLAIM));

  const malformed = amend(input, { section: 'what_changes', claim_ids: ['p12'] });
  assert.ok(codes(validate(input, malformed)).includes(WRITER_REJECTION.SCHEMA_VIOLATION));

  // A shared result cannot carry a gain: the kind of claim cited has to match
  // what the sentence asserts.
  const shared = input.allowed_claims.find((claim) => claim.area === 'room' && claim.kind === 'shared_result');
  const asGain = amend(input, {
    section: 'what_stays_same',
    sentence: 'The room gives considerably more headroom in this option.',
    claim_ids: [shared.claim_id],
  });
  assert.ok(codes(validate(input, asGain)).includes(WRITER_REJECTION.INVENTED_BENEFIT));
});

/* ── G. Word limits ────────────────────────────────────────────────────────── */

test('G. a section over its word limit is blocked', () => {
  const input = writerInput();
  const filler = 'The room and the seating are described here as a dedicated space. '.repeat(40);
  const result = validate(input, amend(input, { section: 'decision_summary', sentence: filler }));

  assert.equal(result.valid, false);
  assert.ok(codes(result).includes(WRITER_REJECTION.SECTION_TOO_LONG));
  assert.ok(result.violations.every((entry) => entry.code === WRITER_REJECTION.SECTION_TOO_LONG), JSON.stringify(result.violations));

  const limit = input.word_limits.decision_summary;
  const over = result.violations.find((entry) => entry.code === WRITER_REJECTION.SECTION_TOO_LONG);
  assert.equal(over.section, 'decision_summary');
  assert.match(over.detail, new RegExp(`over_the_${limit}_word_limit`));
  assert.ok(result.sections.find((entry) => entry.section === 'decision_summary').words > limit);
});

/* ── H. JSON and schema failures ───────────────────────────────────────────── */

test('H. invalid JSON, extra fields and a foreign pack are blocked', () => {
  const input = writerInput();

  const notJson = validate(input, '{ "contract_version": 1, "sections": [');
  assert.equal(notJson.valid, false);
  assert.ok(codes(notJson).includes(WRITER_REJECTION.SCHEMA_VIOLATION));
  assert.equal(notJson.violations[0].detail, 'output_is_not_json');

  const array = validate(input, '[]');
  assert.equal(array.valid, false);
  assert.ok(array.violations.some((entry) => entry.detail === 'output_is_a_json_array'));

  const extraTopLevel = validate(input, withExtraTopLevelField(input));
  assert.equal(extraTopLevel.valid, false);
  assert.ok(extraTopLevel.violations.some((entry) => entry.detail === 'unexpected_output_key:notes'));

  const extraInSection = validDraft(input);
  extraInSection.sections[0].confidence = 0.9;
  assert.ok(validate(input, extraInSection).violations.some((entry) => entry.detail === 'unexpected_section_key:confidence'));

  const missingSection = validDraft(input);
  missingSection.sections = missingSection.sections.filter((entry) => entry.section !== 'appendix_notes');
  assert.ok(validate(input, missingSection).violations.some((entry) => entry.detail === 'missing_section:appendix_notes'));

  const unknownSection = validDraft(input);
  unknownSection.sections[0].section = 'closing_pitch';
  assert.ok(validate(input, unknownSection).violations.some((entry) => entry.detail === 'unknown_section:closing_pitch'));

  const foreignPack = { ...validDraft(input), pack_fingerprint: 'deadbeef' };
  assert.ok(validate(input, foreignPack).violations.some((entry) => entry.detail === 'pack_fingerprint_mismatch'));

  const wrongContract = { ...validDraft(input), contract_version: 2 };
  assert.ok(validate(input, wrongContract).violations.some((entry) => entry.detail === 'contract_version_mismatch:2'));

  // A fenced code block is still JSON, so it is read rather than refused.
  const fenced = parseWriterOutput(`\`\`\`json\n${asOutputText(validDraft(input))}\n\`\`\``);
  assert.deepEqual(fenced.violations, []);
  assert.equal(fenced.output.contract_version, input.contract_version);
});

/* ── I. The Marquee draft ──────────────────────────────────────────────────── */

test('I. the Marquee draft passes against its own pack and preserves every value', () => {
  const input = buildWriterInput({
    pack: buildProposalEvidence({ versions: marqueeOptions(), generatedAt: AT }),
  });

  // The pack this draft is written from is the one the Phase 1 audit recorded.
  assert.equal(input.evidence_pack.pack_fingerprint, MARQUEE_PACK_FINGERPRINT, 'the Marquee pack fingerprint');

  const draft = marqueeDraft(input);
  const result = validate(input, draft);

  assert.equal(result.valid, true, JSON.stringify(result.violations));
  assert.deepEqual(result.violations, []);

  // Every value the pack states is still exactly what the draft says.
  for (const value of ['100 dBC', '116 dBC', '112 dBC', '120 dB', '20 Hz', '+/-2 dB']) {
    assert.ok(
      draft.sections.some((entry) => entry.text.includes(value)),
      `the draft states ${value}`,
    );
    const stated = input.evidence_pack.options
      .some((entry) => JSON.stringify(entry.facts.parameters).includes(value));
    assert.ok(stated, `the pack states ${value}`);
  }

  // The bass rule held: the draft describes output authority, never a solved
  // seat-to-seat consistency, and P20 is stated as the reports state it.
  assert.match(draft.sections.find((entry) => entry.section === 'overall_design').text, /Level 1 for seat-to-seat bass consistency/);
  assert.equal(JSON.stringify(draft).includes('solved'), false);
  assert.ok(codes(result).length === 0);
});