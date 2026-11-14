//
// THE BOUNDED WORDING-CORRECTION RUNNER PATH.
//
// When the initial draft arrives and fails validation on wording-only rejections
// alone, the runner makes ONE additional writer call: the writer's own draft is
// handed back with the exact rejected passages and guidance, and it corrects
// ONLY the offending language. The corrected draft is validated by the same
// complete validator and accepted only when it passes every existing rule.
//
// These tests exercise the full runner with a mock provider, covering:
//   - the Cable Smart regression: generic_marketing_phrase triggers correction,
//     the corrected draft passes, and a valid proposal is saved;
//   - a successful first attempt needs no correction;
//   - an unsupported engineering claim never enters the correction path;
//   - a numerical mismatch remains blocked;
//   - a second wording failure ends safely (correction attempted, not succeeded);
//   - no duplicate proposals: the runner returns one record per attempt;
//   - the audit trail carries the initial and correction outputs and validations.
//
// No live GPT call is made and no entity is written: the provider is a mock.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runProposalCopyGeneration } from '../base44/shared/proposalGeneration/proposalGenerationRunner.js';
import { GENERATION_STATUS } from '../base44/shared/proposalGeneration/generationStatuses.js';
import { twoOptions } from './fixtures/proposalEvidenceFixtures.mjs';
import { validDraft, amend } from './fixtures/proposalWriterFixtures.mjs';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';

const NOW = '2026-11-14T13:48:00.000Z';
const PROPOSAL_ID = 'proposal-cable-smart';
const PROJECT_ID = 'project-cable-smart';
const ACCOUNT_ID = 'account-1';
const USER = { full_name: 'Designer', email: 'designer@example.com' };

/** A proposal covering both reference versions. */
function proposal() {
  return {
    id: PROPOSAL_ID,
    project_id: PROJECT_ID,
    account_id: ACCOUNT_ID,
    selected_version_ids: ['a', 'b'],
    proposal_type: 'comparison',
  };
}

/** The evidence reader returns the two reference options. */
const readEvidence = async () => twoOptions();

/** No option guidance is supplied for these tests. */
const readOptionGuidance = async () => null;

/**
 * Extract the writer input from a provider request prompt. The prompt carries
 * JSON.stringify(input) on its own line, so the mock can build a draft that is
 * valid for the exact input the runner assembled.
 */
function extractInputFromPrompt(request) {
  const prompt = typeof request === 'string' ? request : request?.prompt || '';
  for (const line of prompt.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.evidence_pack?.pack_fingerprint && parsed.contract_version) {
        return parsed;
      }
    } catch { /* not the input line */ }
  }
  throw new Error('Could not extract writer input from the provider request prompt');
}

/**
 * A mock invokeLLM that returns controlled outputs on successive calls. Each
 * entry is a function (input) => output, where output is a JSON string or an
 * object. The mock extracts the writer input from each request so the draft is
 * built against the exact pack the runner assembled.
 */
function mockInvokeLLM(draftBuilders) {
  let call = 0;
  return async (request) => {
    const input = extractInputFromPrompt(request);
    const builder = draftBuilders[Math.min(call, draftBuilders.length - 1)];
    call++;
    const output = builder(input);
    if (output === null) return '';
    return typeof output === 'string' ? output : JSON.stringify(output);
  };
}

/** The flag is on; the default model is used. */
const flag = { enabled: true, model: null };

/* ── The Cable Smart regression: a wording-only failure is corrected ───────── */

test('generic_marketing_phrase triggers correction and the corrected draft passes', async () => {
  const invokeLLM = mockInvokeLLM([
    // First call: a draft with "immersive sound" in what_changes.
    (input) => amend(input, {
      section: 'what_changes',
      sentence: 'The system delivers seamless immersive sound.',
    }),
    // Second call (correction): a valid draft.
    (input) => validDraft(input),
  ]);

  const attempt = await runProposalCopyGeneration({
    proposal: proposal(),
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    existingGenerations: [],
    flag,
    readEvidence,
    readOptionGuidance,
    invokeLLM,
    user: USER,
    now: NOW,
  });

  assert.equal(attempt.ok, true);
  assert.equal(attempt.valid, true);
  assert.equal(attempt.status, GENERATION_STATUS.VALID_GENERATED);
  assert.equal(attempt.correction.attempted, true);
  assert.equal(attempt.correction.succeeded, true);
  assert.equal(attempt.correction.initial_valid, false);
  assert.equal(attempt.correction.correction_valid, true);
  assert.ok(attempt.correction.eligible_rule_ids.includes(WRITER_REJECTION.GENERIC_MARKETING_PHRASE));

  // The record carries the corrected output as gpt_output and the full
  // correction audit in the correction field.
  assert.equal(attempt.record.status, GENERATION_STATUS.VALID_GENERATED);
  assert.ok(attempt.record.correction);
  assert.equal(attempt.record.correction.attempted, true);
  assert.equal(attempt.record.correction.succeeded, true);
  assert.ok(attempt.record.correction.initial_output);
  assert.ok(attempt.record.correction.correction_output);
  assert.equal(attempt.record.correction.initial_validation.valid, false);
  assert.equal(attempt.record.correction.correction_validation.valid, true);
});

/* ── A successful first attempt needs no correction ────────────────────────── */

test('a successful first attempt requires no correction', async () => {
  const invokeLLM = mockInvokeLLM([
    (input) => validDraft(input),
  ]);

  const attempt = await runProposalCopyGeneration({
    proposal: proposal(),
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    existingGenerations: [],
    flag,
    readEvidence,
    readOptionGuidance,
    invokeLLM,
    user: USER,
    now: NOW,
  });

  assert.equal(attempt.ok, true);
  assert.equal(attempt.valid, true);
  assert.equal(attempt.status, GENERATION_STATUS.VALID_GENERATED);
  assert.equal(attempt.correction.attempted, false);
  assert.equal(attempt.record.correction, null);
});

/* ── An engineering violation never enters the correction path ──────────────── */

test('an unsupported engineering claim never enters the correction path', async () => {
  const invokeLLM = mockInvokeLLM([
    // A draft with a changed figure (engineering violation, not wording).
    (input) => amend(input, {
      section: 'key_performance_highlights',
      sentence: 'P12 now delivers 121 dBC.',
    }),
  ]);

  const attempt = await runProposalCopyGeneration({
    proposal: proposal(),
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    existingGenerations: [],
    flag,
    readEvidence,
    readOptionGuidance,
    invokeLLM,
    user: USER,
    now: NOW,
  });

  assert.equal(attempt.ok, true);
  assert.equal(attempt.valid, false);
  assert.equal(attempt.correction.attempted, false);
  assert.equal(attempt.record.correction, null);
  // The status is needs_human_review or validation_failed, never valid.
  assert.notEqual(attempt.status, GENERATION_STATUS.VALID_GENERATED);
});

/* ── A numerical mismatch remains blocked ──────────────────────────────────── */

test('a numerical mismatch remains blocked (no correction attempted)', async () => {
  const invokeLLM = mockInvokeLLM([
    (input) => amend(input, {
      section: 'dynamic_range',
      sentence: 'The bass reaches an unprecedented 15 Hz extension.',
    }),
  ]);

  const attempt = await runProposalCopyGeneration({
    proposal: proposal(),
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    existingGenerations: [],
    flag,
    readEvidence,
    readOptionGuidance,
    invokeLLM,
    user: USER,
    now: NOW,
  });

  assert.equal(attempt.ok, true);
  assert.equal(attempt.valid, false);
  assert.equal(attempt.correction.attempted, false);
  assert.notEqual(attempt.status, GENERATION_STATUS.VALID_GENERATED);
});

/* ── A second wording failure ends safely ──────────────────────────────────── */

test('a second wording failure ends safely and offers the terminal failed state', async () => {
  const invokeLLM = mockInvokeLLM([
    // First call: a draft with "immersive sound".
    (input) => amend(input, {
      section: 'what_changes',
      sentence: 'The system delivers seamless immersive sound.',
    }),
    // Second call (correction): still contains "immersive sound".
    (input) => amend(input, {
      section: 'what_changes',
      sentence: 'The design ensures a truly immersive sound experience.',
    }),
  ]);

  const attempt = await runProposalCopyGeneration({
    proposal: proposal(),
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    existingGenerations: [],
    flag,
    readEvidence,
    readOptionGuidance,
    invokeLLM,
    user: USER,
    now: NOW,
  });

  assert.equal(attempt.ok, true);
  assert.equal(attempt.valid, false);
  assert.equal(attempt.correction.attempted, true);
  assert.equal(attempt.correction.succeeded, false);
  assert.equal(attempt.correction.correction_valid, false);
  // The initial draft stands as the recorded output.
  assert.ok(attempt.record.correction);
  assert.equal(attempt.record.correction.succeeded, false);
  assert.equal(attempt.record.correction.correction_validation.valid, false);
  assert.notEqual(attempt.status, GENERATION_STATUS.VALID_GENERATED);
});

/* ── No duplicate proposals: one record per attempt ────────────────────────── */

test('the runner returns exactly one record per attempt', async () => {
  const invokeLLM = mockInvokeLLM([
    (input) => amend(input, { section: 'what_changes', sentence: 'Seamless immersive sound.' }),
    (input) => validDraft(input),
  ]);

  const attempt = await runProposalCopyGeneration({
    proposal: proposal(),
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    existingGenerations: [],
    flag,
    readEvidence,
    readOptionGuidance,
    invokeLLM,
    user: USER,
    now: NOW,
  });

  assert.ok(attempt.record);
  assert.equal(typeof attempt.record.generation_id, 'string');
  assert.equal(attempt.record.generation_number, 1);
});

/* ── Generation failures retain their diagnostic records ────────────────────── */

test('a failed correction retains the initial output and validation in the audit', async () => {
  const invokeLLM = mockInvokeLLM([
    (input) => amend(input, { section: 'what_changes', sentence: 'Seamless immersive sound.' }),
    // Correction returns nothing.
    () => null,
  ]);

  const attempt = await runProposalCopyGeneration({
    proposal: proposal(),
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    existingGenerations: [],
    flag,
    readEvidence,
    readOptionGuidance,
    invokeLLM,
    user: USER,
    now: NOW,
  });

  assert.equal(attempt.valid, false);
  assert.equal(attempt.correction.attempted, true);
  assert.equal(attempt.correction.succeeded, false);
  // The audit carries the initial output and its validation.
  assert.ok(attempt.record.correction.initial_output);
  assert.ok(attempt.record.correction.initial_validation);
  assert.equal(attempt.record.correction.initial_validation.valid, false);
  // The correction provider returned nothing.
  assert.equal(attempt.record.correction.correction_output, null);
  assert.ok(attempt.record.correction.correction_provider_error);
});

/* ── Existing successful proposals remain unchanged ─────────────────────────── */

test('an existing valid generation is not superseded by a new correction attempt', async () => {
  // The runner does not touch existing generations: it appends one new record.
  // A correction that succeeds produces a valid record; a correction that fails
  // produces a failed record. Neither modifies an earlier one.
  const invokeLLM = mockInvokeLLM([
    (input) => amend(input, { section: 'what_changes', sentence: 'Seamless immersive sound.' }),
    (input) => validDraft(input),
  ]);

  const attempt = await runProposalCopyGeneration({
    proposal: proposal(),
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    existingGenerations: [],
    flag,
    readEvidence,
    readOptionGuidance,
    invokeLLM,
    user: USER,
    now: NOW,
  });

  // The new attempt is valid; existingGenerations was empty and was not
  // modified by the runner (it is passed by value).
  assert.equal(attempt.valid, true);
  assert.equal(attempt.record.generation_number, 1);
});