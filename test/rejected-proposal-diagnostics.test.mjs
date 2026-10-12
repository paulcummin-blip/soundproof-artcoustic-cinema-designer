//
// Rejected proposal diagnostic persistence.
//
// A proposal whose copy fails its evidence check is rolled back: the designer is
// left with no proposal, and the temporary Proposal and its ProposalSections are
// deleted. The attempt itself is still an event that happened, and it is the one
// event a designer needs to be able to inspect. So the generation record is filed
// BEFORE the validity gate, and an attempt that did not produce a valid generation
// is filed on the DRAFT identity it was written under — its temporary proposal id,
// with no proposal id — so nothing that is stored points at a proposal that no
// longer exists.
//
// A valid generation keeps the existing contract exactly: it is filed on the
// proposal that goes on to carry its copy, and it is stored exactly once.
//
// Fixtures only: the real frozen pack, the real writer input, the real validator
// and the real record builder. No GPT call, no SDK, no entity written.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { createGenerationHistory } from '../base44/shared/proposalGeneration/proposalGenerationRepository.js';
import { draftAttemptRecord } from '../base44/shared/proposalGeneration/proposalGenerationRecord.js';
import { generationEntityPayload } from '../base44/shared/proposalGeneration/proposalGenerationEntity.js';
import {
  GENERATION_GATE_REASON,
  GENERATION_STATUS,
  generationGate,
} from '../base44/shared/proposalGeneration/generationStatuses.js';
import { amend, validDraft } from './fixtures/proposalWriterFixtures.mjs';
import {
  ACCOUNT_ID,
  AT_FIRST,
  AT_LATER,
  CREATED_BY,
  MODEL,
  PROJECT_ID,
  PROVIDER,
  evidenceFor,
} from './fixtures/proposalGenerationFixtures.mjs';

const live = readFileSync(new URL('../base44/functions/generateProposal/entry.ts', import.meta.url), 'utf8');

/** The proposal generateProposal creates first, and rolls back when the copy fails. */
const DRAFT_PROPOSAL_ID = 'draft-proposal-1';

/**
 * The designer's own seating alternatives, as the Presented Options section's
 * brief. Supplied here because the Presented Options section carries copy only
 * where the project states alternatives.
 */
const OPTION_GUIDANCE = {
  groups: [{
    group: 'Seating style options',
    options: ['Relaxed sofa seating', 'Cinema recliner seating'],
    note: null,
  }],
};

/**
 * The rejected draft the Genesis attempt produced: the Presented Options section
 * states a result drawn from the pack's own evidence and grounds nothing at all,
 * so the validator reports missing_claim_id in presented_options.
 *
 * @returns {{draft: Object, sentence: string}} the draft and the sentence it states
 */
function ungroundedOptionsDraft(input) {
  const draft = validDraft(input);
  const target = draft.sections.find((entry) => entry.section === 'presented_options');
  const claim = input.allowed_claims.find((entry) => entry.kind === 'material_gain')
    || input.allowed_claims[0];
  target.text = claim.statement;
  target.claim_ids = [];
  return { draft, sentence: claim.statement };
}

/**
 * One attempt, recorded exactly as the live runner records it: the real frozen
 * pack, the real writer input built from it, and the real validator reading the
 * output against that input.
 */
function writerAttempt({
  pack,
  guidance = OPTION_GUIDANCE,
  makeDraft = null,
  output = undefined,
  providerError = null,
  outcome = 'generated',
  at = AT_FIRST,
} = {}) {
  const input = buildWriterInput({ pack, optionGuidance: guidance });
  const resolved = output !== undefined
    ? { draft: output, sentence: null }
    : makeDraft(input);
  const validation = resolved.draft === null || resolved.draft === undefined
    ? null
    : validateWriterOutput({ input, output: resolved.draft });

  const history = createGenerationHistory();
  const record = history.append({
    // The proposal generateProposal has already created for this attempt.
    proposalId: DRAFT_PROPOSAL_ID,
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    proposalType: 'comparison',
    selectedVersionIds: ['a', 'b'],
    pack,
    writerInput: input,
    output: resolved.draft ?? null,
    validation,
    providerError,
    outcome,
    provider: PROVIDER,
    model: MODEL,
    createdBy: CREATED_BY,
    createdAt: at,
  });

  return { record, sentence: resolved.sentence };
}

/**
 * generateProposal's own filing rule: a generation that passed its contract is
 * filed on the proposal that carries its copy, and anything else on the draft
 * identity it was written under.
 */
const filedFor = (record) => (record.status === GENERATION_STATUS.VALID_GENERATED
  ? record
  : draftAttemptRecord(record, { draftProposalId: DRAFT_PROPOSAL_ID }));

/* ── A confirmed failure ────────────────────────────────────────────────── */

test('A. a missing_claim_id in presented_options stores exactly one rejected audit record', () => {
  const { pack } = evidenceFor();
  const { record } = writerAttempt({ pack, makeDraft: ungroundedOptionsDraft });

  assert.equal(record.status, GENERATION_STATUS.VALIDATION_FAILED);
  assert.equal(record.validation_errors.length, 1);
  assert.equal(record.validation_errors[0].code, WRITER_REJECTION.MISSING_CLAIM_ID);
  assert.equal(record.validation_errors[0].section, 'presented_options');

  const filed = filedFor(record);
  assert.equal(filed.status, GENERATION_STATUS.VALIDATION_FAILED);
  assert.equal(filed.proposal_id, null, 'a rejected attempt is never filed on the proposal that is rolled back');
  assert.equal(filed.draft_proposal_id, DRAFT_PROPOSAL_ID);

  // One record, and the identity it is stored under is derived from the attempt:
  // filing the same rejected attempt again produces the same record.
  assert.equal(filed.generation_id, filedFor(record).generation_id);
  assert.match(filed.generation_id, /^gen_[0-9a-f]{8}$/);
  assert.equal(createGenerationHistory({ records: [filed] }).records().length, 1);

  // The payload the entity is created with carries the draft identity.
  const payload = generationEntityPayload({ record: filed, accountId: ACCOUNT_ID });
  assert.equal(payload.proposal_id, null);
  assert.equal(payload.draft_proposal_id, DRAFT_PROPOSAL_ID);
  assert.equal(payload.status, GENERATION_STATUS.VALIDATION_FAILED);
  assert.equal(payload.account_id, ACCOUNT_ID);

  // The completed record itself is never mutated to produce it.
  assert.equal(record.proposal_id, DRAFT_PROPOSAL_ID);
  assert.equal(record.draft_proposal_id, null);
  assert.equal(Object.isFrozen(record), true);
});

/* ── The rejection is fully auditable ───────────────────────────────────── */

test('B. the record retains the exact offending sentence and its full validation attribution', () => {
  const { pack } = evidenceFor();
  const { record, sentence } = writerAttempt({ pack, makeDraft: ungroundedOptionsDraft });
  const filed = filedFor(record);

  assert.ok(sentence && sentence.length > 0, 'the fixture states a sentence');

  const rejection = filed.validation_errors[0];
  assert.equal(rejection.code, WRITER_REJECTION.MISSING_CLAIM_ID);
  assert.equal(rejection.section, 'presented_options');
  assert.equal(rejection.sentence, sentence, 'the rejected sentence is stored verbatim');
  assert.equal(typeof rejection.clause, 'string');
  assert.equal(typeof rejection.rule_id, 'string');
  assert.deepEqual(rejection.cited_claim_ids, []);

  // The whole audit payload is carried, not just the failing code.
  assert.equal(filed.project_id, PROJECT_ID);
  assert.deepEqual(filed.selected_version_ids, ['a', 'b']);
  assert.equal(filed.provider, PROVIDER);
  assert.equal(filed.model, MODEL);
  assert.equal(filed.generation_number, 1);
  assert.equal(filed.evidence_pack_fingerprint, pack.pack_fingerprint);
  assert.equal(filed.evidence_pack.pack_fingerprint, pack.pack_fingerprint);
  assert.equal(filed.gpt_input.evidence_pack.pack_fingerprint, pack.pack_fingerprint);
  assert.notEqual(filed.gpt_output, null, 'the rejected output is kept for review');
  assert.equal(filed.gpt_output_fingerprint.length, 8);
  assert.equal(filed.validation_result.valid, false);
  assert.equal(filed.validation_result.pack_fingerprint, pack.pack_fingerprint);
  assert.equal(filed.record_fingerprint.length, 8);
});

/* ── Nothing invalid survives the rollback ──────────────────────────────── */

test('C. no invalid Proposal or ProposalSection is left behind', () => {
  const { pack } = evidenceFor();
  const { record } = writerAttempt({ pack, makeDraft: ungroundedOptionsDraft });
  const filed = filedFor(record);

  // Nothing stored references the proposal that is deleted.
  assert.equal(filed.proposal_id, null);
  assert.equal(generationEntityPayload({ record: filed }).proposal_id, null);

  // The live path still deletes the temporary sections, then the temporary
  // proposal, and reports no proposal id at all when it succeeds.
  assert.match(live, /rollbackCreatedProposal\(base44, proposal\.id, sectionRecords\)/);
  assert.match(live, /ProposalSection\.delete\(sectionId\)/);
  assert.match(live, /Proposal\.delete\(proposalId\)/);
  assert.match(live, /proposal_id: cleanupSucceeded \? null : proposal\?\.id \|\| null/);

  // And a rejected copy never reaches the pass that publishes copy into sections.
  const throwAt = live.indexOf('throw new Error(WRITER_DRAFT_REJECTED_MESSAGE)');
  const publishAt = live.indexOf('ProposalSection.update(section.id, {');
  assert.ok(throwAt > 0 && publishAt > 0 && throwAt < publishAt,
    'a rejected draft must not reach the publishing pass');
});

/* ── The gate is unchanged ──────────────────────────────────────────────── */

test('D. the rejected generation cannot be issued, exported, completed or sent', () => {
  const { pack } = evidenceFor();
  const { record } = writerAttempt({ pack, makeDraft: ungroundedOptionsDraft });
  const filed = filedFor(record);

  const gate = generationGate({ status: filed.status });
  assert.equal(gate.issuable, false);
  assert.equal(gate.reason, GENERATION_GATE_REASON.INVALID_OUTPUT);

  for (const status of [
    GENERATION_STATUS.VALIDATION_FAILED,
    GENERATION_STATUS.PROVIDER_FAILED,
    GENERATION_STATUS.NEEDS_HUMAN_REVIEW,
    GENERATION_STATUS.EVIDENCE_READY,
    GENERATION_STATUS.DRAFT_CREATED,
    GENERATION_STATUS.DISCARDED,
  ]) {
    assert.equal(generationGate({ status }).issuable, false, `${status} must not be issuable`);
  }
  assert.equal(generationGate({ status: GENERATION_STATUS.VALID_GENERATED }).issuable, true);
});

/* ── A valid generation is unchanged ────────────────────────────────────── */

test('E. a valid generation is stored once, on the proposal, and proceeds normally', () => {
  const { pack } = evidenceFor();
  const { record } = writerAttempt({
    pack,
    // A proposal that states no alternatives returns the Presented Options
    // section empty, so the compliant draft stands as the writer wrote it.
    guidance: null,
    makeDraft: (input) => ({ draft: validDraft(input), sentence: null }),
  });

  assert.equal(record.status, GENERATION_STATUS.VALID_GENERATED);

  const filed = filedFor(record);
  assert.equal(filed, record, 'a valid generation is filed exactly as the runner recorded it');
  assert.equal(filed.proposal_id, DRAFT_PROPOSAL_ID);
  assert.equal(filed.draft_proposal_id, null);
  assert.equal(generationGate({ status: filed.status }).issuable, true);

  // The live path creates the generation entity exactly once, and only a draft
  // that passed keeps the proposal identity.
  assert.equal((live.match(/ProposalGeneration\.create\(/g) || []).length, 1);
  assert.match(live, /attempt\.valid === true\s*\?\s*attempt\.record\s*:\s*draftAttemptRecord\(/);
});

/* ── The other failed outcomes are retained too ─────────────────────────── */

test('F. a provider failure and a draft needing review are retained safely', () => {
  const { pack } = evidenceFor();

  const failed = writerAttempt({
    pack,
    output: null,
    providerError: 'The provider returned no output (gateway timeout).',
    outcome: 'provider_failed',
  });
  assert.equal(failed.record.status, GENERATION_STATUS.PROVIDER_FAILED);

  const filedFailure = filedFor(failed.record);
  assert.equal(filedFailure.proposal_id, null);
  assert.equal(filedFailure.draft_proposal_id, DRAFT_PROPOSAL_ID);
  assert.equal(filedFailure.status, GENERATION_STATUS.PROVIDER_FAILED);
  assert.match(filedFailure.provider_error, /no output/);
  assert.equal(filedFailure.gpt_output, null);
  assert.equal(filedFailure.validation_result, null);
  assert.equal(filedFailure.evidence_pack_fingerprint, pack.pack_fingerprint,
    'the evidence the attempt was made from is still recorded');
  assert.equal(generationGate({ status: filedFailure.status }).issuable, false);

  const review = writerAttempt({
    pack,
    at: AT_LATER,
    makeDraft: (input) => ({
      draft: amend(input, { section: 'key_performance_highlights', sentence: 'P12 now delivers 121 dBC.' }),
      sentence: null,
    }),
  });
  assert.equal(review.record.status, GENERATION_STATUS.NEEDS_HUMAN_REVIEW);

  const filedReview = filedFor(review.record);
  assert.equal(filedReview.proposal_id, null);
  assert.equal(filedReview.draft_proposal_id, DRAFT_PROPOSAL_ID);
  assert.equal(filedReview.status, GENERATION_STATUS.NEEDS_HUMAN_REVIEW);
  assert.ok(filedReview.validation_errors.length > 0);
  assert.ok(filedReview.validation_errors.every((entry) => entry.code === WRITER_REJECTION.CHANGED_PARAMETER_VALUE));
  assert.ok(filedReview.validation_errors.every((entry) => typeof entry.sentence === 'string'));
  assert.equal(generationGate({ status: filedReview.status }).issuable, false);
});