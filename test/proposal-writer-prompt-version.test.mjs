//
// The writer prompt version, and the two things it has to keep apart: a
// generation made before the writing authority changed, and one made after it.
//
// The authority gained the proposal sales authority and began to be carried as
// ONE block rather than spread character by character, and it later gained the
// proposal-stage rule that sells what is strong and refuses design-stage
// commentary. Both are material changes to what the writer reads, so the version
// moved to 2, to 4, and to 6 when the sales authority gained the experience rule,
// the lower-priced-option rule, the repetition ban and the scoped-claim
// instruction, and every new record must store it. The live
// generation the review was run on is the fixture: it keeps the version it was
// filed under, its stored input is never rewritten, and the pack and contract it
// cites are unchanged — only the prompt version moved.
//
// No GPT call is made here.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WRITER_CONTRACT_VERSION, WRITER_PROMPT_VERSION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { buildWriterPrompt } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { buildGenerationRecord } from '../base44/shared/proposalGeneration/proposalGenerationRecord.js';
import { buildProposalWritingAuthority } from '../base44/shared/soundProofWritingAuthority.js';

/** The live generation filed under prompt 1: the historical record, untouched. */
const historical = JSON.parse(readFileSync(new URL('./fixtures/marqueeLiveGeneration.json', import.meta.url), 'utf8'));
const pack = historical.input.evidence_pack;

const VERSION_1 = 'proposal-writer-prompt-1';
const VERSION_3 = 'proposal-writer-prompt-3';
// Generation 13 is the design-context pass: the writer is given the verified ADI
// interpretation and the designer's brief, and the Design Summary introduces the
// cinema instead of opening on the top-ranked result.
// Generation 14 is the editorial-standard pass: the writer is given its role, the
// internal editorial plan, the Design Summary structure, the distinct job of each
// section, the house style and the brief-coverage responsibility. No validation
// rule, section identity or claim-grounding rule changed.
// Generation 15 is the design-philosophy pass: the writer is given the Sound
// Proof design philosophy (the best design satisfies the brief while balancing
// performance, practicality, aesthetics and cost, so a result below the highest
// available level is a legitimate design decision), the reasoning behind the
// recommendation, the value-engineering rule, the design team's own judgement
// written as we, and the engineering safeguards. No validation rule, section
// identity, word limit or claim-grounding rule changed.
// Generation 16 is the natural-writing pass: the editorial instructions are
// refined to the Sound Proof Natural Writing Standard (a natural British
// cinema-design voice, varied sentences, no stock connective, no mechanically
// repeated paragraph opener, no generic marketing phrase and no em dash), the
// whole document is reviewed as one document before it is returned, and the em
// dash, the stock connective, the generic phrase and the repeated opener are now
// refused by the validator. No section identity, word limit or claim-grounding
// rule changed.
// Generation 17 is the Presented Options pass: the contract no longer requires
// the writer to state that the predicted acoustic performance is unchanged when
// seating or layout alternatives are presented, because no allowed engineering
// claim establishes it and the validator correctly refused the ungrounded
// statement. The section presents the options as practical and visual
// alternatives instead. No section identity, word limit, claim-grounding rule or
// validation rule changed.
// Generation 18 is the confident-reasoning pass: the writing authority states the
// three forms of knowledge and the writer explains an established principle and a
// recorded designer intention confidently, while the result this design achieved is
// still read only from the frozen evidence and never weakened into an apology. The
// principle register tells a sentence that explains WHY an approach is used apart
// from one that claims what the design achieved, so design reasoning about bass
// consistency is no longer refused as an unsupported consistency claim. No section
// identity, word limit, figure, level, product or claim-grounding rule changed.
// Generation 19 is the narrative-synthesis pass: the writing authority keeps the
// three forms of knowledge distinct in ADI's own reasoning and writes them as one
// natural account of the design, moving between what has been specified, why the
// approach is appropriate, what it is intended to provide and what the engineering
// supports, with that movement varying from subject to subject rather than
// following one fixed order. No section identity, word limit, figure, level,
// product, claim-grounding or validation rule changed.
// Generation 20 is the presentation-and-identity pass: the guidance states that
// the project, client and reference names identify the document and are never the
// subject of a narrative sentence, that Dynamic Range opens on the experience in
// the room with each output figure following it as the proof, and that Overall
// Design closes on a fresh judgement rather than restating the Design Summary. No
// section identity, word limit, figure, level, product, claim-grounding or
// validation rule changed.
// Generation 21 is the professional-writing refinement: Dynamic Range opens on
// the experience of dynamic contrast with the output figures as proof of output
// capability alone, Timbre Matching leads with the tonal benefit the client
// hears across the seating area while P16 and P17 keep their own speaker-group
// scope, Spatial Resolution explains why the loudspeaker positions matter from
// this design's own arrangement and seating, Overall Design closes on a
// confident recommendation, and the sales authority states positively what a
// result below the highest available level contributes. No section identity,
// word limit, figure, level, product, claim-grounding or validation rule
// changed.
const CURRENT = 'proposal-writer-prompt-21';

test('the writer prompt version is the current one', () => {
  assert.equal(WRITER_PROMPT_VERSION, CURRENT);
  assert.notEqual(CURRENT, VERSION_3, 'the proposal-stage change is a new generation');
});

test('a new writer input carries the current prompt version', () => {
  const input = buildWriterInput({ pack });
  assert.equal(input.prompt_version, CURRENT);
});

test('a new generation records the current prompt version', () => {
  const input = buildWriterInput({ pack });

  const record = buildGenerationRecord({
    proposalId: 'proposal_live',
    projectId: 'project_live',
    pack,
    writerInput: input,
    createdBy: 'designer@example.com',
    createdAt: '2026-10-06T20:00:00.000Z',
    generationNumber: 1,
  });

  assert.equal(record.prompt_version, CURRENT);
  assert.equal(record.gpt_input.prompt_version, CURRENT);
  assert.equal(record.contract_version, WRITER_CONTRACT_VERSION, 'a new record carries the current contract generation');
  assert.equal(historical.contract_version, 1, 'a historical record keeps the contract generation it was filed under');
});

test('a generation filed under prompt 1 keeps prompt 1', () => {
  assert.equal(historical.prompt_version, VERSION_1);
  assert.equal(historical.input.prompt_version, VERSION_1);
});

test('the same pack builds the current input, and the historical input is never rewritten', () => {
  const input = buildWriterInput({ pack });

  assert.equal(input.contract_version, WRITER_CONTRACT_VERSION);
  assert.equal(historical.input.contract_version, 1, 'the historical input is still read against the agreement it was written under');
  assert.equal(input.evidence_pack.pack_fingerprint, historical.input.evidence_pack.pack_fingerprint);
  assert.equal(typeof historical.input.input_fingerprint, 'string');
  assert.notEqual(input.input_fingerprint, historical.input.input_fingerprint);
});

test('the full writing authority is carried as one intact block', () => {
  const prompt = buildWriterPrompt({ input: buildWriterInput({ pack }) });
  const authority = buildProposalWritingAuthority();

  assert.equal(prompt.split(authority).length, 2, 'the authority appears once, verbatim and whole');
  assert.deepEqual(
    prompt.split('\n').filter((line) => line.length === 1),
    [],
    'no line of the prompt is a single character: the authority is not spread',
  );
  assert.ok(prompt.includes(CURRENT), 'the prompt carries the input, which states the version it was written under');
});