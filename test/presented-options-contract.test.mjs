//
// THE PRESENTED OPTIONS CONTRACT CORRECTION.
//
// Genesis AV / Original Design, generation gen_c35ff88e, validator
// proposal-validator-4. The single-option Presented Options contract required the
// writer to state that the predicted acoustic performance is unchanged when
// seating alternatives are presented. No allowed engineering claim establishes
// that a change of seating furniture leaves acoustic performance unchanged, so
// the required sentence was a claim the evidence cannot ground, and the
// validator correctly refused it: missing_claim_id, presented_options, detail
// same_claim_without_a_claim_id. The attempt was filed as a rejected diagnostic
// and the designer was left with no proposal.
//
// The correction removes the mandate from the writer contract. The section now
// presents the options as practical and visual alternatives — comfort, seating
// style, appearance and the practical arrangement of the room, and the seating
// dimensions, sightlines and loudspeaker clearance where the pack states them —
// says that each arrangement works within the seating positions the design
// specifies, and states nothing about acoustic performance unless an allowed
// claim supports it. The validator is untouched: an ungrounded claim is still
// missing_claim_id, and no claim ID is invented.
//
// The evidence is the stored attempt itself: the frozen writer input the attempt
// was made with, the exact output the provider returned, and the validation
// result the live path recorded. No GPT call, no entity write, no report touched.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import {
  WRITER_PROMPT_VERSION,
  WRITER_REJECTION,
  WRITER_SECTIONS,
  WRITER_WRITING_RULES,
  writerSectionRequirements,
} from '../base44/shared/proposalWriter/writerContractSchema.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { buildWriterPrompt } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import {
  GENERATION_STATUS,
  deriveGenerationStatus,
  generationGate,
} from '../base44/shared/proposalGeneration/generationStatuses.js';

/** The stored rejected generation, verbatim: the input, the output and the record. */
const stored = JSON.parse(readFileSync(
  new URL('./fixtures/genesisRejectedGeneration.json', import.meta.url), 'utf8',
));
const input = stored.input;
const output = stored.output;
const RECORDED = stored.generation.validation_errors;

/** The one sentence the contract required and the evidence could not ground. */
const UNSUPPORTED = 'Predicted acoustic performance is unchanged provided the assessed listening positions and relevant room geometry are maintained.';

/** The practical alternative the corrected contract asks for in its place. */
const PRACTICAL = 'Relaxed Sofas offer an informal, flexible seating arrangement, while Formal Cinema Seating provides motorised reclining seats and cupholders. Both work within the seating positions specified for this design, leaving the choice to comfort, style and personal preference.';

const section = (draft, id) => draft.sections.find((entry) => entry.section === id);
const codes = (result) => result.violations.map((entry) => entry.code);
const clone = (value) => JSON.parse(JSON.stringify(value));

/** The corrected draft: ONE sentence replaced in presented_options, nothing else. */
function correctedDraft() {
  const draft = clone(output);
  const options = section(draft, 'presented_options');
  assert.ok(options.text.includes(UNSUPPORTED), 'the stored draft still carries the rejected sentence');
  options.text = options.text.replace(UNSUPPORTED, PRACTICAL);
  return draft;
}

/* ── The recorded failure is reproduced from the stored attempt ─────────── */

test('A. the stored attempt reproduces the recorded missing_claim_id and nothing else', () => {
  const baseline = validateWriterOutput({ input, output });

  assert.equal(baseline.valid, false);
  assert.deepEqual(codes(baseline), [WRITER_REJECTION.MISSING_CLAIM_ID]);
  assert.equal(baseline.violations.length, 1, JSON.stringify(baseline.violations, null, 1));

  const rejection = baseline.violations[0];
  assert.equal(rejection.section, 'presented_options');
  assert.equal(rejection.detail, 'same_claim_without_a_claim_id');
  assert.equal(rejection.sentence, UNSUPPORTED, 'the recorded sentence is the stored one, verbatim');
  assert.deepEqual(rejection.cited_claim_ids, []);

  // Exactly what the live path filed for gen_c35ff88e.
  assert.equal(stored.generation.generation_id, 'gen_c35ff88e');
  assert.equal(stored.generation.status, 'validation_failed');
  assert.deepEqual(RECORDED.map((entry) => entry.code), [WRITER_REJECTION.MISSING_CLAIM_ID]);
  assert.deepEqual(RECORDED.map((entry) => entry.section), ['presented_options']);
  assert.equal(RECORDED[0].sentence, rejection.sentence);
  assert.equal(deriveGenerationStatus({
    outcome: 'generated', validation: baseline, outputReceived: true, providerError: null, evidenceReady: true,
  }), GENERATION_STATUS.VALIDATION_FAILED);
});

/* ── Replacing only that sentence resolves it, and nothing else moves ───── */

test('B. the corrected contract validates the existing draft once the unsupported sentence is replaced', () => {
  const corrected = correctedDraft();
  const fresh = buildWriterInput({ pack: input.evidence_pack, optionGuidance: input.option_guidance });
  const result = validateWriterOutput({ input: fresh, output: corrected });

  assert.equal(result.valid, true, JSON.stringify(result.violations, null, 1));
  assert.deepEqual(result.violations, []);

  // Only that sentence changed: every other section is byte-identical to the stored
  // draft, so nothing else in the attempt was rewritten to make it pass.
  for (const entry of output.sections) {
    if (entry.section === 'presented_options') continue;
    assert.deepEqual(section(corrected, entry.section), entry, entry.section);
  }
  const options = section(corrected, 'presented_options');
  assert.ok(options.text.includes(PRACTICAL));
  assert.ok(!options.text.includes('acoustic performance'));
  assert.deepEqual(options.claim_ids, section(output, 'presented_options').claim_ids);

  // A section-by-section reading of the stored draft reports nothing anywhere but
  // presented_options, so all other sections were already valid.
  const baseline = validateWriterOutput({ input: fresh, output });
  assert.deepEqual(codes(baseline), [WRITER_REJECTION.MISSING_CLAIM_ID]);
  assert.equal(baseline.violations[0].section, 'presented_options');
});

test('C. an unsupported acoustic-performance claim is still refused', () => {
  const fresh = buildWriterInput({ pack: input.evidence_pack, optionGuidance: input.option_guidance });

  // The stored draft, unchanged: no claim ID is cited, so the claim is unsupported.
  assert(codes(validateWriterOutput({ input: fresh, output })).includes(WRITER_REJECTION.MISSING_CLAIM_ID));

  // And the wording alone does not carry it: the same statement, reworded onto a
  // seating choice, is judged on its own grounding and is still refused.
  for (const sentence of [
    UNSUPPORTED,
    'The seating style leaves acoustic performance unchanged.',
    'Both arrangements deliver identical bass response across the seating positions.',
  ]) {
    const draft = clone(output);
    section(draft, 'presented_options').text = sentence;
    section(draft, 'presented_options').claim_ids = [];
    assert(codes(validateWriterOutput({ input: fresh, output: draft }))
      .includes(WRITER_REJECTION.MISSING_CLAIM_ID), sentence);
  }

  // The enforcement itself is untouched: no exemption for the section, no invented ID.
  const validator = readFileSync(new URL('../base44/shared/proposalWriter/writerProseScanner.js', import.meta.url), 'utf8');
  assert.match(validator, /WRITER_REJECTION\.MISSING_CLAIM_ID, \{ section, detail: `\$\{kind\}_claim_without_a_claim_id` \}/);
  assert.ok(!/presented_options/.test(validator), 'the section is not exempted from engineering claim validation');
});

/* ── The corrected contract permits a properly grounded section ─────────── */

test('D. a fresh attempt under the corrected contract is written, grounded and issued normally', () => {
  const fresh = buildWriterInput({ pack: input.evidence_pack, optionGuidance: input.option_guidance });
  const prompt = buildWriterPrompt({ input: fresh });
  const validation = validateWriterOutput({ input: fresh, output: correctedDraft() });

  // The contract the writer reads no longer asks for the statement — and no
  // acoustic qualification replaces it.
  const options = writerSectionRequirements('single').find((entry) => entry.section === 'presented_options');
  for (const text of [options.requirement, prompt]) {
    assert.ok(!/acoustic performance is unchanged/i.test(text));
    assert.ok(!/room geometry are maintained/i.test(text));
  }
  assert.match(options.requirement, /comfort, seating style, appearance/);
  assert.match(options.requirement, /identical, unchanged or equivalent acoustic performance/);
  assert.equal(WRITER_SECTIONS.find((entry) => entry.section === 'presented_options').optional_without_guidance, true);
  assert.equal(fresh.prompt_version, WRITER_PROMPT_VERSION);
  assert.equal(WRITER_PROMPT_VERSION, 'proposal-writer-prompt-26');
  assert.equal(fresh.contract_version, input.contract_version, 'the contract generation did not move');

  // The seating options the designer selected are still presented, and every other
  // writer section keeps its identity, its word limit and its grounding rule. A
  // later editorial refinement may sharpen a section's own requirement text; what
  // must never move is the section set, the word limits and the grounding rule.
  assert.deepEqual(fresh.option_guidance, input.option_guidance);
  const other = (source) => source.section_requirements
    .filter((entry) => entry.section !== 'presented_options')
    .map(({ section, word_limit, requires_grounding }) => ({ section, word_limit, requires_grounding }));
  assert.deepEqual(other(fresh), other(input));

  // The handoff is unchanged: a valid, issuable generation.
  const status = deriveGenerationStatus({
    outcome: 'generated', validation, outputReceived: true, providerError: null, evidenceReady: true,
  });
  assert.equal(status, GENERATION_STATUS.VALID_GENERATED);
  assert.equal(generationGate({ status }).issuable, true);

  // Nothing was written to the stored attempt or to any saved report: the frozen
  // evidence and the stored record are read-only and read the same after the run.
  assert.equal(JSON.stringify(stored.input), JSON.stringify(input));
  assert.equal(JSON.stringify(stored.output), JSON.stringify(output));
  assert.equal(stored.output.sections.length, fresh.section_requirements.length);
  assert.equal(section(output, 'presented_options').claim_ids.length, 0);
});

/* ── No mandate hides anywhere else the writer reads ────────────────────── */

test('E. the mandate is gone from every writing authority, and the validator keeps its rule', () => {
  const contract = readFileSync(new URL('../base44/shared/proposalWriter/writerContractSchema.js', import.meta.url), 'utf8');

  // The instructions the writer is actually given: the Presented Options
  // requirement in both modes, and every writing rule. This reads the instruction
  // text, never a comment or a historical version description elsewhere in the
  // file, so the module's own record of what it replaced cannot fail the test.
  const instructions = [];
  for (const mode of ['single', 'comparison']) {
    const spec = writerSectionRequirements(mode).find((entry) => entry.section === 'presented_options');
    instructions.push(spec.requirement, spec.requirement_single);
  }
  for (const text of [...instructions.filter(Boolean), ...WRITER_WRITING_RULES]) {
    assert.ok(!/acoustic performance is unchanged/i.test(text), 'no writing instruction requires the statement');
    assert.ok(!/room geometry are maintained/i.test(text), 'no writing instruction carries the qualification');
  }
  for (const rule of WRITER_WRITING_RULES) {
    assert.ok(!/identical, unchanged or equivalent acoustic performance/i.test(rule) || /never/i.test(rule),
      'any reference to unchanged acoustic performance is a prohibition, never a requirement');
  }
  assert.ok(WRITER_WRITING_RULES.some((rule) => /seating and layout options as practical alternatives/.test(rule)));
  assert.ok(!WRITER_WRITING_RULES.some((rule) => /Practical qualifications remain necessary/.test(rule)));
  assert.ok(WRITER_WRITING_RULES.some((rule) => /works within the seating positions this design specifies/.test(rule)));

  // The evidence safeguard is where it was: the ungrounded-claim rule and the
  // claim-ID prefixes are untouched.
  assert.equal(WRITER_REJECTION.MISSING_CLAIM_ID, 'missing_claim_id');
  assert.match(contract, /Every client-facing claim must cite one or more allowed claim IDs/);
});