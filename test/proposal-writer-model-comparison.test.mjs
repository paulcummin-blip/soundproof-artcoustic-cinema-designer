/**
 * test/proposal-writer-model-comparison.test.mjs
 * ----------------------------------------------
 * The read-only GPT model comparison, verified in memory with a mocked provider:
 *
 *   A. an explicitly selected identifier reaches the provider on the request;
 *   B. an unsupported identifier is refused;
 *   C. no model is ever silently substituted;
 *   D. both models are sent ONE identical input, the identifier the only difference;
 *   E. the draft is read by the same validator the production path uses;
 *   F. nothing in the preview path can write;
 *   G. production generation keeps its own model and its own switch.
 *
 * No live provider call is made and nothing is written.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COMPARISON_REFUSAL,
  MODEL_SELECTION,
  SUPPORTED_WRITER_MODELS,
  resolveComparisonModel,
  runWriterModelPreview,
} from '../base44/shared/proposalWriter/writerComparisonPreview.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { WRITER_DEFAULT_MODEL, WRITER_PROVIDER } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { writerModelFor } from '../base44/shared/proposalWriter/writerProvider.js';
import { WRITER_SECTION_IDS } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { WRITER_REFUSAL, runProposalCopyGeneration } from '../base44/shared/proposalGeneration/proposalGenerationRunner.js';

const PREVIEW_ENTRY = '../base44/functions/previewStrengthProposalWriter/entry.ts';
const PREVIEW_SHARED = '../base44/shared/proposalWriter/writerComparisonPreview.js';

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

/** One frozen writer input, as the preview assembles it. */
function writerInput() {
  return {
    contract_version: 2,
    input_fingerprint: 'input-fingerprint-genesis-01',
    evidence_pack: {
      pack_fingerprint: 'pack-fingerprint-genesis-01',
      schema_version: 2,
      mode: 'single',
      options: [{ version_id: 'v1', version_name: 'Original Design', facts: {} }],
      allowed_claims: [],
      blocked_claims: [],
    },
    editorial_brief: { supplied: false, client_brief: '' },
    section_requirements: [],
  };
}

/** A draft in the contract's own shape, one line of copy per section. */
function draft(text = 'The system is arranged around this room and the seats it holds.') {
  return {
    contract_version: 2,
    pack_fingerprint: 'pack-fingerprint-genesis-01',
    sections: WRITER_SECTION_IDS.map((id) => ({ section: id, text, claim_ids: [] })),
  };
}

// — A. EXPLICIT MODEL SELECTION REACHES THE PROVIDER

test('A — the selected identifier is written onto the request the provider receives', async () => {
  const seen = [];
  const preview = await runWriterModelPreview({
    input: writerInput(),
    requestedModel: 'gpt_6_astra',
    invokeLLM: async (request) => { seen.push(request); return draft(); },
  });

  assert.equal(seen.length, 1, 'exactly one provider call is made');
  assert.equal(seen[0].model, 'gpt_6_astra', 'the request carries the selected identifier');
  assert.equal(typeof seen[0].prompt, 'string');
  assert.equal(seen[0].response_json_schema.type, 'object');

  assert.equal(preview.model_audit.requested_model, 'gpt_6_astra');
  assert.equal(preview.model_audit.resolved_model, 'gpt_6_astra');
  assert.equal(preview.model_audit.model_selection, MODEL_SELECTION.EXPLICIT);
  assert.equal(preview.model_audit.provider, WRITER_PROVIDER);
  assert.equal(typeof preview.model_audit.duration_ms, 'number');
});

test('A — both approved identifiers are supported, and only those', async () => {
  assert.deepEqual([...SUPPORTED_WRITER_MODELS], ['gpt_5_mini', 'gpt_6_astra']);

  for (const model of SUPPORTED_WRITER_MODELS) {
    const resolution = resolveComparisonModel(model);
    assert.equal(resolution.ok, true, `${model} is supported`);
    assert.equal(resolution.model, model);
    assert.equal(resolution.selection, MODEL_SELECTION.EXPLICIT);

    const seen = [];
    await runWriterModelPreview({
      input: writerInput(),
      requestedModel: model,
      invokeLLM: async (request) => { seen.push(request); return draft(); },
    });
    assert.equal(seen[0].model, model, `${model} reaches the request unchanged`);
  }
});

test('A — a model named in another case still resolves to its canonical identifier', () => {
  assert.equal(resolveComparisonModel(' GPT_6_ASTRA ').model, 'gpt_6_astra');
  assert.equal(resolveComparisonModel('gpt_5_mini').model, 'gpt_5_mini');
});

test('A — with no identifier the production baseline is stated, never implied', async () => {
  const seen = [];
  const preview = await runWriterModelPreview({
    input: writerInput(),
    requestedModel: null,
    invokeLLM: async (request) => { seen.push(request); return draft(); },
  });

  assert.equal(WRITER_DEFAULT_MODEL, 'gpt_5_mini');
  assert.equal(seen[0].model, 'gpt_5_mini', 'the gateway is never reached without an identifier');
  assert.equal(preview.model_audit.requested_model, null);
  assert.equal(preview.model_audit.resolved_model, 'gpt_5_mini');
  assert.equal(preview.model_audit.model_selection, MODEL_SELECTION.DEFAULT);

  assert.equal(resolveComparisonModel('').model, WRITER_DEFAULT_MODEL);
  assert.equal(resolveComparisonModel(undefined).selection, MODEL_SELECTION.DEFAULT);
});

// — B and C. AN UNSUPPORTED IDENTIFIER IS REFUSED, WITH NO SUBSTITUTE

test('B — an unsupported identifier is refused', () => {
  for (const bad of ['gpt_4o', 'automatic', 'gpt-6-astra', 'gpt_6_astra_mini', 'claude-sonnet-5', 'gpt_6']) {
    const resolution = resolveComparisonModel(bad);
    assert.equal(resolution.ok, false, `${bad} is not supported`);
    assert.equal(resolution.model, null, `${bad} resolves to no model`);
    assert.match(resolution.reason, /Supported identifiers/);
    assert.match(resolution.reason, /No other model was substituted/);
  }
});

test('C — a refused identifier makes no provider call and carries no fallback model', async () => {
  let called = 0;
  const provider = async () => { called += 1; return draft(); };

  for (const bad of ['gpt_4o', 'automatic', 'claude-sonnet-5']) {
    const preview = await runWriterModelPreview({
      input: writerInput(),
      requestedModel: bad,
      invokeLLM: provider,
    });
    assert.equal(preview.ok, false);
    assert.equal(preview.code, COMPARISON_REFUSAL.UNSUPPORTED_MODEL);
    assert.equal(preview.provider_called, false);
    assert.equal(preview.output, null);
    assert.equal(preview.validation, null);
    assert.equal(preview.model_audit.resolved_model, null, `${bad} fell back to nothing`);
    assert.equal(preview.model_audit.provider, null);
    assert.equal(preview.model_audit.duration_ms, null);
  }

  assert.equal(called, 0, 'no provider call was made for any unsupported identifier');
});

// — D. ONE IDENTICAL INPUT, THE IDENTIFIER THE ONLY DIFFERENCE

test('D — both models are sent one identical input, and the input is never mutated', async () => {
  const input = writerInput();
  const before = structuredClone(input);
  const calls = [];
  const provider = async (request) => { calls.push(request); return draft(); };

  const mini = await runWriterModelPreview({ input, requestedModel: 'gpt_5_mini', invokeLLM: provider });
  const astra = await runWriterModelPreview({ input, requestedModel: 'gpt_6_astra', invokeLLM: provider });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].prompt, calls[1].prompt, 'the same prompt for both models');
  assert.deepEqual(calls[0].response_json_schema, calls[1].response_json_schema, 'the same schema for both models');
  assert.equal(calls[0].model, 'gpt_5_mini');
  assert.equal(calls[1].model, 'gpt_6_astra');

  assert.deepEqual(input, before, 'the frozen input is identical after both runs');
  assert.equal(mini.model_audit.input_fingerprint, astra.model_audit.input_fingerprint);
  assert.equal(mini.model_audit.pack_fingerprint, astra.model_audit.pack_fingerprint);
  assert.equal(mini.model_audit.prompt_version, astra.model_audit.prompt_version);
  assert.notEqual(mini.model_audit.resolved_model, astra.model_audit.resolved_model);
});

// — E. THE SAME VALIDATOR READS THE DRAFT

test('E — the draft is read by the same validator the production path uses', async () => {
  const input = writerInput();
  const bad = draft('The system is arranged for the seating this design specifies.');
  bad.sections[0].claim_ids = ['claim_not_in_this_pack_01'];

  const preview = await runWriterModelPreview({
    input,
    requestedModel: 'gpt_6_astra',
    invokeLLM: async () => bad,
  });

  assert.deepEqual(preview.validation, validateWriterOutput({ input, output: bad }));
  assert.equal(preview.validation.valid, false);
  assert.equal(
    preview.validation.violations.some((row) => row.code === 'unsupported_claim'),
    true,
    'an unsupported claim is still refused',
  );

  const asText = await runWriterModelPreview({
    input,
    requestedModel: 'gpt_5_mini',
    invokeLLM: async () => JSON.stringify(bad),
  });
  assert.deepEqual(asText.validation, validateWriterOutput({ input, output: JSON.stringify(bad) }));
});

test('E — a provider failure is reported as a result, with no draft and no validation', async () => {
  const preview = await runWriterModelPreview({
    input: writerInput(),
    requestedModel: 'gpt_6_astra',
    invokeLLM: async () => { throw new Error('gateway timeout'); },
  });

  assert.equal(preview.ok, false);
  assert.equal(preview.code, 'provider_failed');
  assert.equal(preview.output, null);
  assert.equal(preview.validation, null);
  assert.equal(preview.provider_called, true);
  assert.match(preview.provider_error, /gateway timeout/);
});

// — F. THE PREVIEW CANNOT WRITE

test('F — the preview path carries no persistence call anywhere', () => {
  const writeVerbs = [
    '.create(', '.update(', '.delete(', '.bulkCreate(', '.bulkUpdate(',
    '.deleteMany(', '.updateMany(', '.upsert(',
  ];

  for (const file of [PREVIEW_ENTRY, PREVIEW_SHARED]) {
    const source = readSource(file);
    for (const verb of writeVerbs) {
      assert.equal(source.includes(verb), false, `${file} contains a write call: ${verb}`);
    }
  }

  // The records it reads are read, and nothing else.
  const entry = readSource(PREVIEW_ENTRY);
  for (const read of [
    'entities.Project.get(', 'entities.ProjectVersion.get(',
    'entities.Proposal.get(', 'entities.ProposalSection.filter(',
  ]) {
    assert.equal(entry.includes(read), true, `${read} is a read`);
  }

  // It never reaches the production path that appends a generation record.
  assert.equal(entry.includes('runProposalCopyGeneration'), false);
  assert.equal(readSource(PREVIEW_SHARED).includes('proposalGeneration'), false);
});

// — G. PRODUCTION GENERATION IS UNCHANGED

test('G — production generation keeps its own model resolution and its own switch', async () => {
  assert.equal(WRITER_DEFAULT_MODEL, 'gpt_5_mini');
  assert.equal(writerModelFor(null), 'gpt_5_mini');
  assert.equal(writerModelFor(''), 'gpt_5_mini');
  assert.equal(writerModelFor('gpt_6_astra'), 'gpt_6_astra', 'a flag override is still honoured');

  let called = 0;
  const refused = await runProposalCopyGeneration({
    proposal: { id: 'proposal-1', project_id: 'project-1', selected_version_ids: ['v1'] },
    projectId: 'project-1',
    flag: { enabled: false },
    invokeLLM: async () => { called += 1; return null; },
    user: { email: 'admin@example.com' },
    now: '2026-10-12T00:00:00.000Z',
  });

  assert.equal(refused.ok, false);
  assert.equal(refused.code, WRITER_REFUSAL.FLAG_OFF, 'the production switch still refutes everything while off');
  assert.equal(called, 0, 'the production path calls no provider while the writer is off');

  const runner = readSource('../base44/shared/proposalGeneration/proposalGenerationRunner.js');
  assert.equal(
    runner.includes('callWriterProvider({ invokeLLM, input: writerInput, model: flag?.model ?? null })'),
    true,
    'production still resolves its model from its own flag',
  );
  assert.equal(runner.includes('writerComparisonPreview'), false, 'production does not use the comparison path');
});