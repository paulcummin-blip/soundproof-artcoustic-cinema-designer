//
// The writer prompt version, and the two things it has to keep apart: a
// generation made before the writing authority changed, and one made after it.
//
// The authority gained the proposal sales authority and began to be carried as
// ONE block rather than spread character by character. Both are material changes
// to what the writer reads, so the version moved to 2 and every new record must
// store it. The live generation the review was run on is the fixture: it keeps
// the version it was filed under, its stored input is never rewritten, and the
// pack and contract it cites are unchanged — only the prompt version moved.
//
// No GPT call is made here.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WRITER_PROMPT_VERSION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { buildWriterPrompt } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { buildGenerationRecord } from '../base44/shared/proposalGeneration/proposalGenerationRecord.js';
import { buildProposalWritingAuthority } from '../base44/shared/soundProofWritingAuthority.js';

/** The live generation filed under prompt 1: the historical record, untouched. */
const historical = JSON.parse(readFileSync(new URL('./fixtures/marqueeLiveGeneration.json', import.meta.url), 'utf8'));
const pack = historical.input.evidence_pack;

const VERSION_1 = 'proposal-writer-prompt-1';
const VERSION_2 = 'proposal-writer-prompt-3';

test('the writer prompt version is 3', () => {
  assert.equal(WRITER_PROMPT_VERSION, VERSION_2);
});

test('a new writer input carries the current prompt version', () => {
  const input = buildWriterInput({ pack });
  assert.equal(input.prompt_version, VERSION_2);
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

  assert.equal(record.prompt_version, VERSION_2);
  assert.equal(record.gpt_input.prompt_version, VERSION_2);
  assert.equal(record.contract_version, historical.contract_version, 'the contract generation it was written under is unchanged');
});

test('a generation filed under prompt 1 keeps prompt 1', () => {
  assert.equal(historical.prompt_version, VERSION_1);
  assert.equal(historical.input.prompt_version, VERSION_1);
});

test('only the prompt version moved: the same pack and contract build a different input', () => {
  const input = buildWriterInput({ pack });

  assert.equal(input.contract_version, historical.input.contract_version);
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
  assert.ok(prompt.includes(VERSION_2), 'the prompt carries the input, which states the version it was written under');
});