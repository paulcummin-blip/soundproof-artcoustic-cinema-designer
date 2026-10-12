//
// THE SHARED-RESULT SEMANTIC CORRECTION.
//
// Genesis AV / Original Design. Three attempts were refused with the same single
// rejection — missing_claim_id, presented_options, same_claim_without_a_claim_id:
//
//   gen_c35ff88e  "Predicted acoustic performance is unchanged provided the
//                 assessed listening positions and relevant room geometry are
//                 maintained."           → a genuine, ungrounded equivalence claim
//   gen_41ff5877  "Relaxed Sofas give the room an informal, inviting appearance and
//                 flexible shared seating that can accommodate company."
//   gen_a636cdb9  "Relaxed Sofas offer an informal appearance and flexible shared
//                 seating for enjoying films together."
//
// The last two describe the seating the designer's own recorded option guidance
// offers, and the writer correctly wrote them that way. They state no result:
// "shared seating" is sofas people sit on together. The classifier read the
// sameness WORD as the claim, so a practical description of the room was refused
// as a claim about shared engineering results.
//
// The correction is semantic, never an exemption. A sameness word is an
// engineering equivalence claim only where it is said OF an engineering result —
// identical acoustic performance, the same bass response, unchanged RP22 results —
// and every such claim is still refused until its own allowed claim ID is cited.
// No section is exempt, no claim ID is invented, and the word alone is never the
// claim.
//
// The evidence is the three stored attempts themselves: the frozen writer input
// each was given, the exact output the provider returned, and the validation the
// live path recorded. No GPT call is made, no entity is written, no report and no
// stored record is touched.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { equivalenceAssertion } from '../base44/shared/proposalWriter/writerVocabulary.js';

/** The stored attempts, verbatim: the frozen input, the returned output and the record. */
const stored = JSON.parse(readFileSync(
  new URL('./fixtures/genesisSharedSeatingRejections.json', import.meta.url), 'utf8',
));

const attempt = (id) => {
  const entry = stored.rejected.find((row) => row.generation.generation_id === id);
  assert.ok(entry, `the stored attempt ${id} is in the fixture`);
  return entry;
};

/** The latest refusal: 12 October 2026, 23:45:51 UK. */
const LATEST = attempt('gen_a636cdb9');
/** The earlier lifestyle refusal: 18:35 the same evening. */
const EARLIER = attempt('gen_41ff5877');
/** The ungrounded acoustic-performance refusal: the prompt-16 attempt. */
const ACOUSTIC = attempt('gen_c35ff88e');

/** The sentence the stored record names, and the only rejection it filed. */
const LIFESTYLE_SENTENCE = 'Relaxed Sofas offer an informal appearance and flexible shared seating for enjoying films together.';
const UNGROUNDED_EQUIVALENCE = 'Predicted acoustic performance is unchanged provided the assessed listening positions and relevant room geometry are maintained.';

const codes = (result) => result.violations.map((entry) => entry.code);
const clone = (value) => JSON.parse(JSON.stringify(value));

/** One section of a draft. */
const section = (draft, id) => draft.sections.find((entry) => entry.section === id);

/** The stored draft with one section's copy and citations replaced. */
function withSection(entry, id, text, claimIds = []) {
  const draft = clone(entry.output);
  section(draft, id).text = text;
  section(draft, id).claim_ids = claimIds;
  return draft;
}

/* ── A. The stored attempt is the recorded one ──────────────────────────────── */

test('A. the stored attempt reproduces the recorded rejection, and nothing else', () => {
  assert.equal(LATEST.generation.generation_id, 'gen_a636cdb9');
  assert.equal(LATEST.generation.status, 'validation_failed');
  assert.equal(LATEST.generation.prompt_version, 'proposal-writer-prompt-17');
  assert.equal(LATEST.generation.validator_version, 'proposal-validator-4');

  const recorded = LATEST.generation.validation_errors;
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].code, WRITER_REJECTION.MISSING_CLAIM_ID);
  assert.equal(recorded[0].section, 'presented_options');
  assert.equal(recorded[0].detail, 'same_claim_without_a_claim_id');
  assert.equal(recorded[0].sentence, LIFESTYLE_SENTENCE);

  // The section itself carries no claim ID at all: it is a description of the
  // options the designer's own guidance supplies, not a performance claim.
  assert.ok(section(LATEST.output, 'presented_options').text.includes(LIFESTYLE_SENTENCE));
  assert.deepEqual(section(LATEST.output, 'presented_options').claim_ids, []);
  assert.equal(EARLIER.generation.validation_errors[0].section, 'presented_options');
  assert.equal(ACOUSTIC.generation.validation_errors[0].section, 'presented_options');
});

/* ── B. The corrected validator accepts it ──────────────────────────────────── */

test('B. the lifestyle sentence is accepted, and the whole stored draft validates', () => {
  const result = validateWriterOutput({ input: LATEST.input, output: LATEST.output });

  assert.equal(result.valid, true, JSON.stringify(result.violations, null, 1));
  assert.deepEqual(result.violations, []);
  assert.equal(result.pack_fingerprint, LATEST.generation.evidence_pack_fingerprint);

  // The draft is the stored one, unchanged: the fix is in the classification, not
  // in the copy. Not a word of the attempt was rewritten to make it pass.
  assert.equal(section(LATEST.output, 'presented_options').text.includes(LIFESTYLE_SENTENCE), true);
  assert.equal(JSON.stringify(section(LATEST.output, 'presented_options').claim_ids), '[]');
  assert.equal(LATEST.output.sections.length, 10);

  // The earlier lifestyle attempt passes as well, against its own frozen input.
  const earlier = validateWriterOutput({ input: EARLIER.input, output: EARLIER.output });
  assert.equal(earlier.valid, true, JSON.stringify(earlier.violations, null, 1));
});

/* ── C. The semantics, word by word ─────────────────────────────────────────── */

test('C. a sameness word is a claim only where it is said of an engineering result', () => {
  // Practical and visual descriptions of the room: no result, so no claim.
  for (const practical of [
    LIFESTYLE_SENTENCE,
    'Relaxed Sofas give the room an informal, inviting appearance and flexible shared seating that can accommodate company.',
    'Formal Cinema Seating provides individual motorised reclining seats with cupholders.',
    'Flexible seating arrangements suit informal family viewing and shared company.',
    'The sofas provide comfortable shared spaces for family and guests.',
    'Informal seating for family and guests leaves the room feeling relaxed.',
    'Both options use the same upholstery and the same carpet.',
    'Equal attention is given to comfort, appearance and the arrangement of the seating.',
    'Each arrangement works within the seating positions specified for this design.',
  ]) {
    assert.equal(equivalenceAssertion(practical), false, practical);
  }

  // Engineering equivalence claims: still claims, still grounded or refused.
  for (const engineering of [
    'Both options share identical acoustic performance.',
    'The seating alternatives produce the same bass response.',
    'All seats receive the same frequency response.',
    'The two layouts have unchanged RP22 results.',
    'Identical performance at different seats.',
    'Acoustic performance is unchanged.',
    'The seating style leaves acoustic performance unchanged.',
    'Headroom and output are equivalent between the options.',
    'The bass response remains unchanged across the seating.',
  ]) {
    assert.equal(equivalenceAssertion(engineering), true, engineering);
  }

  // The word is never the claim on its own, and the correction exempts no word:
  // "shared" is read exactly as every other sameness word is.
  assert.equal(equivalenceAssertion('Shared.'), false);
  assert.equal(equivalenceAssertion('Identical.'), false);
  assert.equal(equivalenceAssertion('Unchanged.'), false);
});

/* ── D. Engineering equivalence is still refused, in every section ──────────── */

test('D. an ungrounded equivalence claim is still refused wherever it is written', () => {
  const unsupported = [
    'Both options share identical acoustic performance.',
    'The seating alternatives produce the same bass response.',
    'All seats receive the same frequency response.',
    'The two layouts have unchanged RP22 results.',
    'Identical performance at different seats.',
  ];

  for (const sectionId of ['presented_options', 'dynamic_range', 'what_stays_same', 'overall_design', 'timbre_matching']) {
    for (const sentence of unsupported) {
      const result = validateWriterOutput({
        input: LATEST.input,
        output: withSection(LATEST, sectionId, sentence),
      });
      assert.equal(result.valid, false, `${sectionId}: ${sentence}`);
      assert.ok(codes(result).includes(WRITER_REJECTION.MISSING_CLAIM_ID), `${sectionId}: ${sentence}`);
    }
  }

  // The stored acoustic-performance claim is refused on its own pack, unchanged.
  const acoustic = validateWriterOutput({ input: ACOUSTIC.input, output: ACOUSTIC.output });
  assert.equal(acoustic.valid, false);
  assert.deepEqual(codes(acoustic), [WRITER_REJECTION.MISSING_CLAIM_ID]);
  assert.equal(acoustic.violations[0].sentence, UNGROUNDED_EQUIVALENCE);

  // And the section is refused for the same reason when it carries that sentence.
  const carried = validateWriterOutput({
    input: ACOUSTIC.input,
    output: withSection(ACOUSTIC, 'presented_options', UNGROUNDED_EQUIVALENCE),
  });
  assert.ok(codes(carried).includes(WRITER_REJECTION.MISSING_CLAIM_ID));
});

/* ── E. Nothing else was weakened or exempted ───────────────────────────────── */

test('E. the grounding rule, its scanner and every other section are untouched', () => {
  const scanner = readFileSync(
    new URL('../base44/shared/proposalWriter/writerProseScanner.js', import.meta.url), 'utf8',
  );
  const vocabulary = readFileSync(
    new URL('../base44/shared/proposalWriter/writerVocabulary.js', import.meta.url), 'utf8',
  );

  // The rule itself is where it was, and no section is named as an exemption.
  assert.match(scanner, /WRITER_REJECTION\.MISSING_CLAIM_ID, \{ section, detail: `\$\{kind\}_claim_without_a_claim_id` \}/);
  assert.ok(!/presented_options/.test(scanner), 'no section is exempted from claim grounding');
  assert.equal(WRITER_REJECTION.MISSING_CLAIM_ID, 'missing_claim_id');
  assert.match(vocabulary, /if \(equivalenceAssertion\(text\)\) return 'same';/);
  assert.ok(!/SAME_WORDS/.test(vocabulary), 'the keyword-alone classifier is gone, not bypassed');

  // An ungrounded claim of another kind is still a missing claim ID, and an
  // invented benefit is still reported where the sentence asserts one.
  const change = validateWriterOutput({
    input: LATEST.input,
    output: withSection(LATEST, 'what_changes', 'The subwoofer specification changes to SUB4-12 x 2 rather than SUB3-12 x 2.'),
  });
  assert.ok(codes(change).includes(WRITER_REJECTION.MISSING_CLAIM_ID), JSON.stringify(change.violations));

  const gain = validateWriterOutput({
    input: LATEST.input,
    output: withSection(LATEST, 'what_changes', 'Headroom is greater with this arrangement.'),
  });
  assert.equal(gain.valid, false, 'an ungrounded benefit is still refused');
  assert.ok(
    codes(gain).some((code) => [
      WRITER_REJECTION.MISSING_CLAIM_ID,
      WRITER_REJECTION.INVENTED_BENEFIT,
      WRITER_REJECTION.UNSUPPORTED_COMPARATIVE,
    ].includes(code)),
    JSON.stringify(gain.violations),
  );

  // A figure the reports do not state is still refused, and the stored attempts
  // themselves were only ever read: nothing was written back to any record.
  const figure = validateWriterOutput({
    input: LATEST.input,
    output: withSection(LATEST, 'dynamic_range', 'The system reaches 121 dBC at the reference seat.'),
  });
  assert.ok(codes(figure).includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE), JSON.stringify(figure.violations));

  assert.equal(LATEST.output.sections.length, 10);
  assert.equal(LATEST.generation.status, 'validation_failed');
  assert.equal(LATEST.generation.validation_errors.length, 1);
});