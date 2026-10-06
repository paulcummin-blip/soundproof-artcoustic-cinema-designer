//
// Phase 3 — the append-only proposal generation history.
//
// Every generation attempt is stored as an immutable, auditable record: what
// evidence it was made from, the exact GPT input, the output if one arrived, the
// validation result and every rejection, the fingerprints, who made it and when.
// Nothing is ever overwritten — a retry, a regeneration, or an attempt against
// changed evidence appends a new linked record — and only a valid generation may
// be issued, exported, completed or sent.
//
// No GPT call is made here, no entity is written, and no Proposal record is
// touched: the history under test is held in memory.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GENERATION_DERIVED_STATUSES,
  GENERATION_GATE_REASON,
  GENERATION_ISSUABLE_STATUSES,
  GENERATION_STATUS,
  GENERATION_STATUSES,
  GENERATION_WRITE_STATUSES,
  generationGate,
} from '../base44/shared/proposalGeneration/generationStatuses.js';
import { GENERATION_RECORD_FIELDS } from '../base44/shared/proposalGeneration/proposalGenerationRecord.js';
import { createGenerationHistory } from '../base44/shared/proposalGeneration/proposalGenerationRepository.js';
import {
  evidencePackForGeneration,
  generationById,
  generationEvidenceChanged,
  generationStatusOf,
  latestValidGeneration,
} from '../base44/shared/proposalGeneration/proposalGenerationHistory.js';
import {
  GENERATION_ENTITY,
  generationEntityPayload,
} from '../base44/shared/proposalGeneration/proposalGenerationEntity.js';
import {
  ACCOUNT_ID,
  AT_FIRST,
  AT_LATER,
  AT_RETRY,
  PROPOSAL_ID,
  attempt,
  changedVersions,
  discardedAttempt,
  evidenceFor,
  invalidClaimAttempt,
  invalidShapeAttempt,
  providerFailureAttempt,
} from './fixtures/proposalGenerationFixtures.mjs';

/** A history with one attempt against the reference evidence. */
const historyWith = (pack) => {
  const history = createGenerationHistory();
  const record = history.append(attempt({ pack }));
  return { history, record };
};

/* ── The status vocabulary and the one-way gate ────────────────────────────── */

test('the eight statuses exist, and only a valid generation may be issued', () => {
  assert.deepEqual(GENERATION_STATUSES, [
    'draft_created', 'evidence_ready', 'provider_failed', 'validation_failed',
    'needs_human_review', 'valid_generated', 'discarded', 'superseded',
  ]);
  assert.deepEqual(GENERATION_ISSUABLE_STATUSES, [GENERATION_STATUS.VALID_GENERATED]);

  for (const status of GENERATION_STATUSES) {
    assert.equal(
      generationGate({ status }).issuable,
      status === GENERATION_STATUS.VALID_GENERATED,
      `${status} is ${status === GENERATION_STATUS.VALID_GENERATED ? '' : 'not '}issuable`,
    );
  }

  // Supersession is derived at read time, so it is never written to a record.
  assert.deepEqual(GENERATION_DERIVED_STATUSES, [GENERATION_STATUS.SUPERSEDED]);
  assert.equal(GENERATION_WRITE_STATUSES.includes(GENERATION_STATUS.SUPERSEDED), false);
  assert.equal(generationGate({ status: GENERATION_STATUS.SUPERSEDED }).reason, GENERATION_GATE_REASON.SUPERSEDED);
});

/* ── A. A valid attempt ────────────────────────────────────────────────────── */

test('A. a valid attempt is stored as an immutable record with its pack, fingerprints, input, output and validation', () => {
  const { pack, input } = evidenceFor();
  const { history, record } = historyWith(pack);

  for (const field of GENERATION_RECORD_FIELDS) {
    assert.ok(field in record, `the record stores ${field}`);
  }

  assert.equal(record.status, GENERATION_STATUS.VALID_GENERATED);
  assert.equal(record.proposal_id, PROPOSAL_ID);
  assert.equal(record.draft_proposal_id, null);
  assert.equal(record.project_id, 'project');
  assert.equal(record.proposal_type, 'comparison');
  assert.deepEqual(record.selected_version_ids, ['a', 'b']);
  assert.equal(record.generation_number, 1);
  assert.equal(record.retry_of_generation_id, null);
  assert.match(record.generation_id, /^gen_[0-9a-f]{8}$/);
  assert.equal(record.record_fingerprint.length, 8);

  // The evidence it was made from.
  assert.equal(record.evidence_pack_fingerprint, pack.pack_fingerprint);
  assert.equal(record.evidence_pack.pack_fingerprint, pack.pack_fingerprint);
  assert.equal(record.evidence_pack_schema_version, 2);
  assert.deepEqual(record.visual_report_snapshot_ids, ['a-visual', 'b-visual']);
  assert.deepEqual(record.technical_report_snapshot_ids, ['a-technical', 'b-technical']);
  assert.equal(record.evidence_fingerprints.pack, pack.pack_fingerprint);
  assert.deepEqual(record.evidence_fingerprints.reports.map((entry) => entry.visual_evidence), ['re-a-visual', 're-b-visual']);
  assert.deepEqual(record.evidence_fingerprints.reports.map((entry) => entry.technical_evidence), ['re-a-technical', 're-b-technical']);
  assert.deepEqual(record.engineering_fingerprints.versions.map((entry) => entry.engineering), ['eng:v1:design', 'eng:v1:design']);

  // The input, the output and the validation that read it.
  assert.equal(record.gpt_input_fingerprint, input.input_fingerprint);
  assert.equal(record.gpt_input.evidence_pack.pack_fingerprint, pack.pack_fingerprint);
  assert.equal(record.gpt_output.sections.length, 9);
  assert.equal(record.gpt_output_fingerprint.length, 8);
  assert.equal(record.validation_result.valid, true);
  assert.equal(record.validation_result.pack_fingerprint, pack.pack_fingerprint);
  assert.deepEqual(record.validation_errors, []);
  assert.equal(record.provider_error, null);

  // Immutable: the record, and everything inside it.
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.evidence_pack), true);
  assert.equal(Object.isFrozen(record.gpt_input), true);
  assert.equal(Object.isFrozen(record.gpt_output), true);
  assert.equal(Object.isFrozen(record.validation_errors), true);

  assert.equal(history.records().length, 1);
  assert.equal(history.byId(record.generation_id).generation_id, record.generation_id);
  assert.equal(evidencePackForGeneration(history.records(), record.generation_id).pack_fingerprint, pack.pack_fingerprint);

  // The stored payload is the record's own fields, plus the account for access control.
  const payload = generationEntityPayload({ record, accountId: ACCOUNT_ID });
  assert.equal(GENERATION_ENTITY, 'ProposalGeneration');
  assert.equal(payload.account_id, ACCOUNT_ID);
  assert.equal(payload.generation_id, record.generation_id);
  assert.equal(payload.status, GENERATION_STATUS.VALID_GENERATED);
});

/* ── B. An append-only retry ───────────────────────────────────────────────── */

test('B. a retry appends a linked record and leaves the first attempt exactly as it was', () => {
  const { pack } = evidenceFor();
  const history = createGenerationHistory();
  const first = history.append(invalidClaimAttempt({ pack, at: AT_FIRST }));
  const before = JSON.stringify(first);

  assert.equal(first.status, GENERATION_STATUS.NEEDS_HUMAN_REVIEW);

  const retry = history.append(attempt({ pack, at: AT_RETRY, retryOfGenerationId: first.generation_id }));

  assert.equal(retry.retry_of_generation_id, first.generation_id);
  assert.equal(retry.generation_number, first.generation_number + 1);
  assert.notEqual(retry.generation_id, first.generation_id);
  assert.equal(retry.status, GENERATION_STATUS.VALID_GENERATED);
  assert.equal(retry.evidence_pack_fingerprint, first.evidence_pack_fingerprint, 'a retry reuses the same evidence pack');
  assert.equal(history.records().length, 2);

  // The failed attempt is untouched, and it is still the one to review.
  assert.equal(JSON.stringify(history.byId(first.generation_id)), before);
  assert.equal(history.byId(first.generation_id).status, GENERATION_STATUS.NEEDS_HUMAN_REVIEW);
  assert.deepEqual(history.needsReview(PROPOSAL_ID).map((entry) => entry.generation_id), [first.generation_id]);
  assert.equal(history.latestValid(PROPOSAL_ID).generation_id, retry.generation_id);
  assert.equal(history.issueGate(first.generation_id).issuable, false);

  // A retry points at a real attempt, of the same proposal, made from the same evidence.
  assert.throws(() => history.append(attempt({ pack, at: AT_LATER, retryOfGenerationId: 'gen_missing' })), /is not in this history/);
  const other = evidenceFor(changedVersions());
  assert.throws(
    () => history.append(attempt({ pack: other.pack, at: AT_LATER, retryOfGenerationId: first.generation_id })),
    /same evidence pack/,
  );
});

/* ── C. A failed validation ────────────────────────────────────────────────── */

test('C. an invalid output is retained with its errors and blocked from issue', () => {
  const { pack } = evidenceFor();
  const history = createGenerationHistory();
  const record = history.append(invalidClaimAttempt({ pack }));

  assert.equal(record.status, GENERATION_STATUS.NEEDS_HUMAN_REVIEW);
  assert.equal(record.validation_result.valid, false);
  assert.ok(record.validation_errors.length > 0);
  assert.ok(record.validation_errors.every((entry) => entry.code === 'changed_parameter_value'));
  assert.ok(record.validation_errors.every((entry) => typeof entry.section === 'string'));
  assert.notEqual(record.gpt_output, null, 'the rejected output is kept for review');
  assert.equal(record.gpt_output_fingerprint.length, 8);

  const gate = history.issueGate(record.generation_id);
  assert.equal(gate.issuable, false);
  assert.equal(gate.reason, GENERATION_GATE_REASON.NEEDS_HUMAN_REVIEW);
  assert.equal(history.latestValid(PROPOSAL_ID), null);

  // A failure of shape is filed as a validation failure rather than as a review.
  const shape = history.append(invalidShapeAttempt({ pack, at: AT_RETRY }));
  assert.equal(shape.status, GENERATION_STATUS.VALIDATION_FAILED);
  assert.ok(shape.validation_errors.some((entry) => entry.code === 'schema_violation'));
  assert.equal(history.issueGate(shape.generation_id).reason, GENERATION_GATE_REASON.INVALID_OUTPUT);
  assert.equal(history.issueGate(shape.generation_id).issuable, false);
});

/* ── D. A provider failure ─────────────────────────────────────────────────── */

test('D. a provider failure is retained with its own status and no output', () => {
  const { pack } = evidenceFor();
  const history = createGenerationHistory();
  const record = history.append(providerFailureAttempt({ pack }));

  assert.equal(record.status, GENERATION_STATUS.PROVIDER_FAILED);
  assert.match(record.provider_error, /no output/);
  assert.equal(record.gpt_output, null);
  assert.equal(record.gpt_output_fingerprint, null);
  assert.equal(record.validation_result, null);
  assert.deepEqual(record.validation_errors, []);
  assert.equal(record.evidence_pack_fingerprint, pack.pack_fingerprint, 'the evidence it was attempted from is still recorded');
  assert.equal(record.gpt_input_fingerprint.length > 0, true, 'the input it would have sent is recorded');
  assert.equal(history.issueGate(record.generation_id).reason, GENERATION_GATE_REASON.PROVIDER_FAILED);
  assert.deepEqual(history.needsReview(PROPOSAL_ID).map((entry) => entry.generation_id), [record.generation_id]);
});

/* ── E. Changed evidence ───────────────────────────────────────────────────── */

test('E. changed evidence creates a new record and the old generation stays readable on its own fingerprints', () => {
  const { pack } = evidenceFor();
  const history = createGenerationHistory();
  const first = history.append(attempt({ pack, at: AT_FIRST }));

  const changed = evidenceFor(changedVersions());
  assert.notEqual(changed.pack.pack_fingerprint, pack.pack_fingerprint);

  const second = history.append(attempt({ pack: changed.pack, at: AT_LATER }));

  assert.notEqual(second.generation_id, first.generation_id);
  assert.notEqual(second.evidence_pack_fingerprint, first.evidence_pack_fingerprint);
  assert.equal(second.retry_of_generation_id, null, 'different evidence is a new generation, not a retry');
  assert.equal(second.generation_number, 2);
  assert.equal(history.records().length, 2);

  // The old generation is still there, tied to exactly the evidence it used.
  const old = history.byId(first.generation_id);
  assert.equal(old.evidence_pack_fingerprint, pack.pack_fingerprint);
  assert.equal(old.evidence_pack.pack_fingerprint, pack.pack_fingerprint);
  assert.equal(old.gpt_output_fingerprint, first.gpt_output_fingerprint);
  assert.equal(old.status, GENERATION_STATUS.VALID_GENERATED);
  assert.equal(old.record_fingerprint, first.record_fingerprint);
  assert.equal(evidencePackForGeneration(history.records(), first.generation_id).pack_fingerprint, pack.pack_fingerprint);

  // Its evidence has moved on, so it is superseded and may no longer be issued.
  assert.equal(generationEvidenceChanged(old, changed.pack), true);
  assert.equal(generationEvidenceChanged(old, pack), false);
  assert.equal(generationStatusOf(old, history.records()), GENERATION_STATUS.SUPERSEDED);
  assert.equal(history.issueGate(first.generation_id).reason, GENERATION_GATE_REASON.SUPERSEDED);
  assert.equal(history.latestValid(PROPOSAL_ID).generation_id, second.generation_id);
});

/* ── F. No overwrite ───────────────────────────────────────────────────────── */

test('F. a stored generation is never overwritten, and the entity refuses it too', () => {
  const { pack } = evidenceFor();
  const { history, record } = historyWith(pack);

  // 1. The record refuses change, inside and out.
  assert.throws(() => { record.status = GENERATION_STATUS.DISCARDED; }, TypeError);
  assert.throws(() => { record.gpt_output.sections[0].text = 'rewritten'; }, TypeError);
  assert.throws(() => { record.validation_errors.push({ code: 'invented' }); }, TypeError);
  assert.equal(record.status, GENERATION_STATUS.VALID_GENERATED);
  assert.equal(record.record_fingerprint.length, 8);

  // 2. The store has no update or delete path at all.
  assert.equal(typeof history.update, 'undefined');
  assert.equal(typeof history.delete, 'undefined');
  assert.equal(typeof history.overwrite, 'undefined');

  // 3. The same attempt cannot be appended twice, by ID or by content.
  assert.throws(() => history.append(attempt({ pack, generationId: record.generation_id })), /already stored/);
  assert.throws(() => history.append(attempt({ pack })), /already stored/);
  assert.equal(history.records().length, 1);

  // 4. Regenerating against the same evidence creates a new record — never an edit.
  const again = history.append(attempt({ pack, at: AT_RETRY }));
  assert.notEqual(again.generation_id, record.generation_id);
  assert.equal(history.records().length, 2);
  assert.equal(history.byId(record.generation_id).record_fingerprint, record.record_fingerprint);
  assert.equal(history.byId(record.generation_id).gpt_output_fingerprint, record.gpt_output_fingerprint);

  // 5. The stored schema refuses updates and deletes as well.
  const entity = JSON.parse(readFileSync('base44/entities/ProposalGeneration.jsonc', 'utf8'));
  assert.equal(entity.name, GENERATION_ENTITY);
  assert.equal(entity.rls.update, false);
  assert.equal(entity.rls.delete, false);
  assert.deepEqual(GENERATION_STATUSES.filter((status) => !entity.properties.status.enum.includes(status)), []);
  for (const field of GENERATION_RECORD_FIELDS) {
    assert.ok(field in entity.properties, `the entity stores ${field}`);
  }
});

/* ── G. The latest valid generation ────────────────────────────────────────── */

test('G. the latest valid generation is the only record returned', () => {
  const { pack } = evidenceFor();
  const history = createGenerationHistory();

  const failed = history.append(invalidClaimAttempt({ pack, at: AT_FIRST }));
  assert.equal(latestValidGeneration(history.records(), PROPOSAL_ID), null, 'a failed attempt is not a valid generation');

  const firstValid = history.append(attempt({ pack, at: AT_RETRY }));
  assert.equal(latestValidGeneration(history.records(), PROPOSAL_ID).generation_id, firstValid.generation_id);
  assert.equal(history.latestValid(PROPOSAL_ID).generation_id, firstValid.generation_id);

  // A newer failure does not replace the valid generation.
  history.append(providerFailureAttempt({ pack, at: '2026-10-06T10:10:00.000Z' }));
  assert.equal(history.latestValid(PROPOSAL_ID).generation_id, firstValid.generation_id);
  assert.equal(latestValidGeneration([...history.records()].reverse(), PROPOSAL_ID).generation_id, firstValid.generation_id, 'record order does not decide it');

  // A newer valid generation supersedes it and becomes the latest valid.
  const secondValid = history.append(attempt({ pack, at: AT_LATER, retryOfGenerationId: firstValid.generation_id }));
  assert.equal(history.latestValid(PROPOSAL_ID).generation_id, secondValid.generation_id);
  assert.equal(generationStatusOf(firstValid, history.records()), GENERATION_STATUS.SUPERSEDED);
  assert.equal(generationStatusOf(secondValid, history.records()), GENERATION_STATUS.VALID_GENERATED);
  assert.equal(generationStatusOf(failed, history.records()), GENERATION_STATUS.NEEDS_HUMAN_REVIEW);
  assert.equal(history.issueGate(secondValid.generation_id).issuable, true);
  assert.equal(history.issueGate(firstValid.generation_id).issuable, false);
  assert.equal(history.issueGate('gen_missing').reason, GENERATION_GATE_REASON.NOT_FOUND);
  assert.equal(generationById(history.records(), 'gen_missing'), null);

  // All generation versions, in chain order.
  assert.deepEqual(history.versions(PROPOSAL_ID).map((entry) => entry.generation_number), [1, 2, 3, 4]);
  assert.deepEqual(history.versions(PROPOSAL_ID).map((entry) => entry.status), [
    GENERATION_STATUS.NEEDS_HUMAN_REVIEW,
    GENERATION_STATUS.VALID_GENERATED,
    GENERATION_STATUS.PROVIDER_FAILED,
    GENERATION_STATUS.VALID_GENERATED,
  ]);
});

/* ── H. What needs review ──────────────────────────────────────────────────── */

test('H. the failed attempts are returned for editor review, newest first', () => {
  const { pack } = evidenceFor();
  const history = createGenerationHistory();

  const failed = history.append(invalidClaimAttempt({ pack, at: AT_FIRST }));
  const shape = history.append(invalidShapeAttempt({ pack, at: AT_RETRY }));
  const provider = history.append(providerFailureAttempt({ pack, at: '2026-10-06T10:10:00.000Z' }));
  const valid = history.append(attempt({ pack, at: AT_LATER }));
  const discarded = history.append(discardedAttempt({ pack, at: '2026-10-06T10:20:00.000Z' }));

  const review = history.needsReview(PROPOSAL_ID);
  assert.deepEqual(
    review.map((entry) => entry.generation_id),
    [provider.generation_id, shape.generation_id, failed.generation_id],
  );
  assert.equal(review.some((entry) => entry.generation_id === valid.generation_id), false, 'a valid generation needs no review');
  assert.equal(review.some((entry) => entry.generation_id === discarded.generation_id), false, 'a discarded attempt produced nothing to review');
  assert.equal(discarded.status, GENERATION_STATUS.DISCARDED);
  assert.equal(discarded.gpt_output, null);

  // Each failed attempt keeps what went wrong, in a form a reviewer can read.
  assert.ok(review.every((entry) => entry.validation_errors.length > 0 || entry.provider_error));
  assert.ok(review.every((entry) => entry.evidence_pack_fingerprint === pack.pack_fingerprint));

  // And none of them may be issued.
  assert.ok(review.every((entry) => history.issueGate(entry.generation_id).issuable === false));
});

/* ── I. Audit metadata ─────────────────────────────────────────────────────── */

test('I. every record carries its permission and audit metadata, and refuses an incomplete one', () => {
  const { pack, input } = evidenceFor();
  const { history, record } = historyWith(pack);

  assert.equal(record.created_by, 'designer@example.com');
  assert.equal(record.created_at, AT_FIRST);
  assert.equal(record.provider, 'base44');
  assert.equal(record.model, 'gpt-5');
  assert.equal(record.prompt_version, 'proposal-writer-prompt-4');
  assert.equal(record.schema_version, 1);
  assert.equal(record.contract_version, 1);
  assert.equal(record.account_id, ACCOUNT_ID);

  const payload = generationEntityPayload({ record });
  assert.equal(payload.account_id, ACCOUNT_ID);
  for (const field of GENERATION_RECORD_FIELDS) {
    assert.ok(field in payload, `the entity payload carries ${field}`);
  }

  // An attempt with no audit identity cannot be recorded at all.
  assert.throws(() => history.append(attempt({ pack, overrides: { createdBy: null } })), /created it/);
  assert.throws(() => history.append(attempt({ pack, overrides: { createdAt: null } })), /created/);
  assert.throws(() => history.append(attempt({ pack, overrides: { projectId: null } })), /project/);
  assert.throws(() => history.append(attempt({ pack, overrides: { proposalId: null } })), /belongs to a proposal/);
  assert.throws(() => history.append(attempt({ pack, overrides: { outcome: 'looks_good' } })), /Unknown generation outcome/);

  // An attempt against a pack its GPT input was not built from cannot be filed either.
  const other = evidenceFor(changedVersions());
  assert.throws(
    () => history.append(attempt({ pack, overrides: { writerInput: other.input } })),
    /not built from this evidence pack/,
  );
  assert.equal(input.evidence_pack.pack_fingerprint, pack.pack_fingerprint);

  // A draft proposal is recorded on its own identity until the proposal is saved.
  const draft = history.append(attempt({ pack, at: AT_LATER, overrides: { proposalId: null, draftProposalId: 'draft-1' } }));
  assert.equal(draft.proposal_id, null);
  assert.equal(draft.draft_proposal_id, 'draft-1');
  assert.equal(history.records().length, 2);
  assert.deepEqual(history.versions('draft-1').map((entry) => entry.generation_id), [draft.generation_id]);
  assert.deepEqual(history.versions(PROPOSAL_ID).map((entry) => entry.generation_id), [record.generation_id]);
  assert.equal(history.latestValid('draft-1').generation_id, draft.generation_id);
  assert.equal(history.latestValid(PROPOSAL_ID).generation_id, record.generation_id);
});