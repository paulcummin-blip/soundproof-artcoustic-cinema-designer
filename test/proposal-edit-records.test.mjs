//
// Phase 4 — the editable proposal layer: the records themselves.
//
// The audit retrieval, the copy rules and the append-only entity. Every question
// asked of a generation's edits is answered from the records; a copy that breaks
// the contract's shape, or that removes the evidence-backed meaning of a section,
// is retained for review and blocked; and a record cannot be filed without its
// audit identity, against another evidence pack, or as something it is not.
//
// The render and issue tests live in proposal-edit-layer.test.mjs, over the same
// in-memory world. No GPT call is made here and no entity is written.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { EDIT_ENTITY } from '../base44/shared/proposalEdit/proposalEditEntity.js';
import {
  EDIT_RECORD_FIELDS,
  buildEditRecord,
} from '../base44/shared/proposalEdit/proposalEditRecord.js';
import {
  EDIT_GATE_REASON,
  EDIT_RULE_REJECTION,
  EDIT_SOURCES,
  EDIT_VALIDATION_STATUS,
  EDIT_VALIDATION_STATUSES,
  deriveEditValidationStatus,
} from '../base44/shared/proposalEdit/editStatuses.js';
import {
  editValidationResult,
  editsForGeneration,
  editsNeedingReview,
  latestValidEdit,
  proposalIssueGate,
  renderableProposalCopy,
} from '../base44/shared/proposalEdit/proposalEditHistory.js';
import {
  EDIT_AT_FIRST,
  EDIT_AT_FOURTH,
  EDIT_AT_SECOND,
  EDIT_AT_THIRD,
  EDIT_BY,
  codesOf,
  editWorld as world,
  toneSections,
  unselectedProductSections,
  withHeading,
  withoutClaimIds,
  withoutSection,
  writeEdit,
} from './fixtures/proposalEditFixtures.mjs';

/* ── M. Audit retrieval ────────────────────────────────────────────────────── */

test('M. every audit question is answered from the records', () => {
  const { input, generation, edits } = world();

  const valid = writeEdit(edits, generation, toneSections(input), EDIT_AT_FIRST);
  const invalid = writeEdit(edits, generation, unselectedProductSections(input), EDIT_AT_SECOND);

  assert.equal(latestValidEdit(edits.records(), generation.generation_id).edit_id, valid.edit_id);
  assert.deepEqual(
    editsForGeneration(edits.records(), generation.generation_id).map((entry) => entry.edit_id),
    [valid.edit_id, invalid.edit_id],
  );
  assert.deepEqual(editsNeedingReview(edits.records(), generation.generation_id).map((entry) => entry.edit_id), [invalid.edit_id]);

  const result = editValidationResult(edits.records(), invalid.edit_id);
  assert.equal(result.valid, false);
  assert.equal(result.status, EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW);
  assert.equal(result.generation_id, generation.generation_id);
  assert.equal(result.base_generation_fingerprint, generation.record_fingerprint);
  assert.ok(result.errors.length > 0);
  assert.equal(edits.validationOf(invalid.edit_id).status, EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW);
  assert.equal(editValidationResult(edits.records(), 'edit_not_here'), null);

  const renderable = renderableProposalCopy({
    generation,
    edits: edits.records(),
  });
  assert.equal(renderable.edit_id, valid.edit_id);
  assert.deepEqual(renderable.copy, edits.renderableCopy(generation.generation_id).copy);
  assert.equal(proposalIssueGate({
    generationRecords: [generation],
    editRecords: edits.records(),
    generationId: generation.generation_id,
  }).reason, EDIT_GATE_REASON.LATEST_EDIT_INVALID);
});

/* ── N. Contract shape and stripped meaning ────────────────────────────────── */

test('N. a copy that breaks the contract shape or strips a section is retained and blocked', () => {
  const { input, generation, edits } = world();

  // A section left with no grounding at all: the evidence-backed meaning of the
  // copy has been removed, which the edit layer refuses in its own right.
  const ungrounded = writeEdit(edits, generation, withoutClaimIds(input, 'what_stays_same'));
  assert.equal(ungrounded.validation_status, EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW);
  assert.ok(codesOf(ungrounded).includes(EDIT_RULE_REJECTION.GROUNDING_REMOVED));

  // The shared writer rule still catches a section whose own words lost their
  // grounding, and the copied claim IDs are reported as removed either way.
  const stripped = writeEdit(edits, generation, withoutClaimIds(input, 'what_changes'), EDIT_AT_SECOND);
  assert.notEqual(stripped.validation_status, EDIT_VALIDATION_STATUS.VALID);
  assert.ok(codesOf(stripped).includes(WRITER_REJECTION.MISSING_CLAIM_ID));
  assert.ok(codesOf(stripped).includes(EDIT_RULE_REJECTION.GROUNDING_REMOVED));

  // A section removed: the copy is no longer the contract's shape.
  const gutted = writeEdit(edits, generation, withoutSection(input, 'spatial_resolution'), EDIT_AT_THIRD);
  assert.equal(gutted.validation_status, EDIT_VALIDATION_STATUS.VALIDATION_FAILED);
  assert.ok(gutted.validation_errors.some((entry) => entry.detail === 'missing_section:spatial_resolution'));

  // A section heading: the writer contract defines the nine section titles and
  // gives no section a heading field, so a heading cannot be edited in.
  const heading = writeEdit(edits, generation, withHeading(input, 'decision_summary', 'Our Recommendation'), EDIT_AT_FOURTH);
  assert.equal(heading.validation_status, EDIT_VALIDATION_STATUS.VALIDATION_FAILED);
  assert.ok(heading.validation_errors.some(
    (entry) => entry.code === WRITER_REJECTION.SCHEMA_VIOLATION && /unexpected_section_key:heading/.test(entry.detail),
  ));

  assert.equal(edits.records().length, 4);
  assert.equal(edits.issueGate(generation.generation_id).issuable, false);
});

/* ── P. The record's own rules ─────────────────────────────────────────────── */

test('P. a copy is never called valid without passing, and carries its audit identity', () => {
  const { input, generation, edits } = world();
  const base = {
    generationId: generation.generation_id,
    projectId: generation.project_id,
    editedSections: toneSections(input),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_FIRST,
    baseGenerationFingerprint: generation.record_fingerprint,
    basePackFingerprint: generation.evidence_pack_fingerprint,
    validation: { valid: true, violations: [], pack_fingerprint: generation.evidence_pack_fingerprint },
    editNumber: 1,
  };

  // An unvalidated copy is never valid, and neither is a result that claims
  // validity while carrying a rejection.
  assert.equal(deriveEditValidationStatus(null), EDIT_VALIDATION_STATUS.VALIDATION_FAILED);
  assert.equal(deriveEditValidationStatus({ valid: true }), EDIT_VALIDATION_STATUS.VALIDATION_FAILED);
  assert.equal(
    deriveEditValidationStatus({ valid: false, violations: [{ code: WRITER_REJECTION.CHANGED_PARAMETER_VALUE }] }),
    EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW,
  );
  assert.equal(
    deriveEditValidationStatus({ valid: true, violations: [{ code: WRITER_REJECTION.CHANGED_PARAMETER_VALUE }] }),
    EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW,
  );

  // The audit identity is required, the copy must be a section list, and a
  // validation from another evidence pack is refused.
  assert.throws(() => buildEditRecord({ ...base, editedBy: null }), /who saved it/);
  assert.throws(() => buildEditRecord({ ...base, editedAt: null }), /time it was saved/);
  assert.throws(() => buildEditRecord({ ...base, baseGenerationFingerprint: null }), /generation fingerprint/);
  assert.throws(() => buildEditRecord({ ...base, editedSections: 'the decision summary' }), /section list/);
  assert.throws(
    () => buildEditRecord({
      ...base,
      validation: { valid: true, violations: [], pack_fingerprint: 'pack_of_another_attempt' },
    }),
    /another evidence pack/,
  );
  assert.throws(() => buildEditRecord({ ...base, baseEditId: 'edit_of_another_copy' }), /belongs to a revert/);

  // Building a record writes nothing.
  assert.equal(edits.records().length, 0);
});

/* ── O. The edit entity ────────────────────────────────────────────────────── */

test('O. the edit entity is append-only and stores every record field', () => {
  const schema = JSON.parse(readFileSync(new URL('../base44/entities/ProposalEdit.jsonc', import.meta.url), 'utf8'));

  assert.equal(schema.name, EDIT_ENTITY);
  assert.equal(schema.rls.update, false);
  assert.equal(schema.rls.delete, false);
  assert.equal(schema.rls.read != null, true);
  assert.equal(schema.rls.create != null, true);

  for (const field of EDIT_RECORD_FIELDS) {
    assert.ok(schema.properties[field], `the edit entity has no ${field} field`);
  }
  for (const field of schema.required) {
    assert.ok(field in schema.properties, `the edit entity requires ${field} but does not define it`);
  }
  assert.deepEqual(schema.properties.validation_status.enum, [...EDIT_VALIDATION_STATUSES]);
  assert.deepEqual(schema.properties.edit_source.enum, [...EDIT_SOURCES]);
  for (const status of EDIT_VALIDATION_STATUSES) {
    assert.ok(schema.properties.validation_status.enum.includes(status));
  }
});