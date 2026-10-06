//
// Phase 4 — the editable proposal layer.
//
// A valid generated proposal can be edited inside Sound Proof. The generation is
// never touched: its frozen evidence pack, GPT input, GPT output, validation
// result, report snapshot IDs, evidence fingerprints and record fingerprint stay
// byte-identical, and the designer's copy lives in an append-only edit record
// linked back to it.
//
// Every copy is validated by the Phase 2 writer validator, unchanged, against the
// frozen GPT input of the generation it edits — the same evidence pack, the same
// word limits, the same allowed and blocked claims, the same figures, levels and
// products. So an edit may change wording and tone but can never change a fact,
// and only the validated GPT output or the latest valid edit may be issued,
// exported, completed or sent.
//
// No GPT call is made here, no entity is written, and no Proposal record is
// touched: the histories under test are held in memory.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGenerationHistory } from '../base44/shared/proposalGeneration/proposalGenerationRepository.js';
import { GENERATION_GATE_REASON } from '../base44/shared/proposalGeneration/generationStatuses.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { editEntityPayload } from '../base44/shared/proposalEdit/proposalEditEntity.js';
import { EDIT_RECORD_FIELDS } from '../base44/shared/proposalEdit/proposalEditRecord.js';
import { createEditHistory } from '../base44/shared/proposalEdit/proposalEditRepository.js';
import {
  EDIT_GATE_REASON,
  EDIT_ISSUABLE_STATUSES,
  EDIT_SOURCE,
  EDIT_VALIDATION_STATUS,
  editGate,
} from '../base44/shared/proposalEdit/editStatuses.js';
import {
  editById,
  editIssueGate,
  editsForGeneration,
  editsNeedingReview,
  latestEdit,
  latestValidEdit,
} from '../base44/shared/proposalEdit/proposalEditHistory.js';
import { AT_LATER, attempt, invalidShapeAttempt } from './fixtures/proposalGenerationFixtures.mjs';
import {
  codesOf,
  EDIT_AT_FIRST,
  EDIT_AT_FOURTH,
  EDIT_AT_SECOND,
  EDIT_AT_THIRD,
  EDIT_BY,
  blockedClaimSections,
  changedLevelSections,
  changedParameterSections,
  shortenedSections,
  toneSections,
  unselectedProductSections,
  editWorld as world,
  writeEdit,
} from './fixtures/proposalEditFixtures.mjs';

/* ── A. Create edit ────────────────────────────────────────────────────────── */

test('A. saving an edit appends one edit record linked to its generation', () => {
  const { input, generation, edits } = world();

  const edit = writeEdit(edits, generation, toneSections(input));

  assert.equal(edits.records().length, 1);
  assert.match(edit.edit_id, /^edit_/);
  assert.equal(edit.edit_number, 1);
  assert.equal(edit.generation_id, generation.generation_id);
  assert.equal(edit.proposal_id, generation.proposal_id);
  assert.equal(edit.draft_proposal_id, generation.draft_proposal_id);
  assert.equal(edit.project_id, generation.project_id);
  assert.equal(edit.account_id, generation.account_id);
  assert.equal(edit.edit_source, EDIT_SOURCE.MANUAL);
  assert.equal(edit.base_edit_id, null);
  assert.equal(edit.edited_by, EDIT_BY);
  assert.equal(edit.edited_at, EDIT_AT_FIRST);
  assert.equal(edit.created_at, EDIT_AT_FIRST);
  assert.equal(edit.base_generation_fingerprint, generation.record_fingerprint);
  assert.equal(edit.validation_status, EDIT_VALIDATION_STATUS.VALID);
  assert.deepEqual(edit.validation_errors, []);
  assert.match(edit.edit_fingerprint, /^[0-9a-f]{8}$/);

  // Every field the record promises is on the record.
  for (const field of EDIT_RECORD_FIELDS) assert.ok(field in edit, `the edit record is missing ${field}`);

  // The record is a snapshot: frozen, and a copy of what was handed in.
  assert.equal(Object.isFrozen(edit), true);
  assert.equal(Object.isFrozen(edit.edited_sections), true);
  assert.throws(() => { edit.edited_sections[0].text = 'rewritten afterwards'; }, TypeError);
  assert.throws(() => { edit.validation_status = EDIT_VALIDATION_STATUS.VALID; }, TypeError);

  // The entity payload stores the record's own fields, plus the account.
  const payload = editEntityPayload({ record: edit });
  assert.equal(payload.account_id, generation.account_id);
  assert.deepEqual(payload.edited_sections, edit.edited_sections);
  assert.equal(payload.edit_id, edit.edit_id);

  // The same edit saved twice is one edit, not two records.
  assert.throws(() => writeEdit(edits, generation, toneSections(input)), /already stored/);
  assert.equal(edits.records().length, 1);

  // An edit is made against a generation the history holds, and only a valid one.
  assert.throws(
    () => writeEdit(edits, { generation_id: 'gen_not_here' }, toneSections(input)),
    /not one of them/,
  );
  const invalidGeneration = { generation_id: 'gen_other', status: 'needs_human_review' };
  assert.throws(() => writeEdit(edits, invalidGeneration, toneSections(input)), /not in this history|not one of them/);
});

/* ── B. Original output unchanged ──────────────────────────────────────────── */

test('B. the generation stays byte-identical while edits accumulate', () => {
  const { input, generations, generation, edits } = world();

  const before = {
    output: JSON.stringify(generation.gpt_output),
    input: JSON.stringify(generation.gpt_input),
    pack: JSON.stringify(generation.evidence_pack),
    validation: JSON.stringify(generation.validation_result),
    errors: JSON.stringify(generation.validation_errors),
    evidence: JSON.stringify(generation.evidence_fingerprints),
    engineering: JSON.stringify(generation.engineering_fingerprints),
    snapshots: JSON.stringify([
      generation.visual_report_snapshot_ids,
      generation.technical_report_snapshot_ids,
    ]),
    record: generation.record_fingerprint,
    packFingerprint: generation.evidence_pack_fingerprint,
    outputFingerprint: generation.gpt_output_fingerprint,
  };

  writeEdit(edits, generation, toneSections(input), EDIT_AT_FIRST);
  writeEdit(edits, generation, changedParameterSections(input, 'P12'), EDIT_AT_SECOND);
  edits.appendRevert({
    generationId: generation.generation_id,
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_THIRD,
  });

  const reread = generations.byId(generation.generation_id);
  assert.equal(JSON.stringify(reread.gpt_output), before.output);
  assert.equal(JSON.stringify(reread.gpt_input), before.input);
  assert.equal(JSON.stringify(reread.evidence_pack), before.pack);
  assert.equal(JSON.stringify(reread.validation_result), before.validation);
  assert.equal(JSON.stringify(reread.validation_errors), before.errors);
  assert.equal(JSON.stringify(reread.evidence_fingerprints), before.evidence);
  assert.equal(JSON.stringify(reread.engineering_fingerprints), before.engineering);
  assert.equal(JSON.stringify([
    reread.visual_report_snapshot_ids,
    reread.technical_report_snapshot_ids,
  ]), before.snapshots);
  assert.equal(reread.record_fingerprint, before.record);
  assert.equal(reread.evidence_pack_fingerprint, before.packFingerprint);
  assert.equal(reread.gpt_output_fingerprint, before.outputFingerprint);

  // The edited copy lives in the edit records and nowhere else.
  assert.notEqual(JSON.stringify(edits.records()[0].edited_sections), before.output);
  assert.equal(edits.records().length, 3);
});

/* ── C. Multiple edits ─────────────────────────────────────────────────────── */

test('C. a second edit appends a second record and the first stays readable', () => {
  const { input, generation, edits } = world();

  const first = writeEdit(edits, generation, toneSections(input), EDIT_AT_FIRST);
  const firstCopy = JSON.stringify(first.edited_sections);
  const second = writeEdit(edits, generation, shortenedSections(input), EDIT_AT_SECOND);

  assert.equal(edits.records().length, 2);
  assert.equal(second.edit_number, 2);
  assert.notEqual(second.edit_id, first.edit_id);
  assert.notEqual(second.edit_fingerprint, first.edit_fingerprint);

  const rereadFirst = editById(edits.records(), first.edit_id);
  assert.equal(JSON.stringify(rereadFirst.edited_sections), firstCopy);
  assert.equal(rereadFirst.edit_fingerprint, first.edit_fingerprint);
  assert.equal(rereadFirst.validation_status, EDIT_VALIDATION_STATUS.VALID);

  const chain = editsForGeneration(edits.records(), generation.generation_id);
  assert.deepEqual(chain.map((entry) => entry.edit_id), [first.edit_id, second.edit_id]);
  assert.equal(latestEdit(edits.records(), generation.generation_id).edit_id, second.edit_id);
  assert.equal(latestValidEdit(edits.records(), generation.generation_id).edit_id, second.edit_id);
  assert.equal(edits.records().length, editsForGeneration(edits.records(), generation.generation_id).length);
});

/* ── D. Valid edit render ──────────────────────────────────────────────────── */

test('D. the renderable copy is the latest valid edit', () => {
  const { input, generation, edits } = world();

  writeEdit(edits, generation, toneSections(input), EDIT_AT_FIRST);
  const latest = writeEdit(edits, generation, shortenedSections(input), EDIT_AT_SECOND);

  const renderable = edits.renderableCopy(generation.generation_id);
  assert.equal(renderable.source, 'edit');
  assert.equal(renderable.edit_id, latest.edit_id);
  assert.equal(renderable.edit_status, EDIT_VALIDATION_STATUS.VALID);
  assert.deepEqual(renderable.copy, latest.edited_sections);
  assert.equal(renderable.blocked_by_latest_edit, false);
  assert.equal(renderable.blocked_edit_id, null);
  assert.deepEqual(renderable.blocked_errors, []);
  assert.equal(renderable.reason, EDIT_GATE_REASON.LATEST_VALID_EDIT);
});

/* ── E. No edit render ─────────────────────────────────────────────────────── */

test('E. with no edit layer the renderable copy is the validated GPT output', () => {
  const { generations, generation, edits } = world();

  const renderable = edits.renderableCopy(generation.generation_id);
  assert.equal(renderable.source, 'generated');
  assert.equal(renderable.edit_id, null);
  assert.deepEqual(renderable.copy, generation.gpt_output.sections);
  assert.equal(renderable.reason, EDIT_GATE_REASON.GENERATED_COPY);
  assert.equal(renderable.blocked_by_latest_edit, false);

  // An attempt that did not pass validation holds no copy to render at all.
  const failed = generations.append(invalidShapeAttempt());
  const empty = createEditHistory({ generations: generations.records() });
  const noCopy = empty.renderableCopy(failed.generation_id);
  assert.notEqual(failed.status, 'valid_generated');
  assert.equal(noCopy.source, null);
  assert.equal(noCopy.copy, null);
  assert.equal(noCopy.reason, EDIT_GATE_REASON.NO_COPY);
});

/* ── F. Invalid edit ───────────────────────────────────────────────────────── */

test('F. an invalid edit is retained but blocked, and the last valid copy still renders', () => {
  const { input, generation, edits } = world();

  const valid = writeEdit(edits, generation, toneSections(input), EDIT_AT_FIRST);
  const invalid = writeEdit(edits, generation, changedParameterSections(input, 'P12'), EDIT_AT_SECOND);

  // Retained, with its own status and its rejections.
  assert.equal(edits.records().length, 2);
  assert.equal(invalid.validation_status, EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW);
  assert.ok(codesOf(invalid).includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE));
  assert.equal(edits.byId(invalid.edit_id).validation_status, EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW);

  // Blocked from issue, export, completion and sending.
  assert.equal(edits.editIssueGate(invalid.edit_id).issuable, false);
  assert.equal(edits.editIssueGate(invalid.edit_id).reason, EDIT_GATE_REASON.NEEDS_HUMAN_REVIEW);
  const gate = edits.issueGate(generation.generation_id);
  assert.equal(gate.issuable, false);
  assert.equal(gate.reason, EDIT_GATE_REASON.LATEST_EDIT_INVALID);
  assert.equal(gate.edit_id, invalid.edit_id);
  assert.ok(gate.errors.length > 0);

  // The last valid copy is still renderable, with the block reported beside it.
  const renderable = edits.renderableCopy(generation.generation_id);
  assert.equal(renderable.source, 'edit');
  assert.equal(renderable.edit_id, valid.edit_id);
  assert.deepEqual(renderable.copy, valid.edited_sections);
  assert.equal(renderable.blocked_by_latest_edit, true);
  assert.equal(renderable.blocked_edit_id, invalid.edit_id);
  assert.ok(renderable.blocked_errors.some((entry) => entry.code === WRITER_REJECTION.CHANGED_PARAMETER_VALUE));

  // It is what the review list shows.
  assert.deepEqual(edits.needsReview(generation.generation_id).map((entry) => entry.edit_id), [invalid.edit_id]);
  assert.deepEqual(editsNeedingReview(edits.records()).map((entry) => entry.edit_id), [invalid.edit_id]);
});

/* ── G. Changed value ──────────────────────────────────────────────────────── */

test('G. an edit that changes a P12, P13, P14, P18, P19 or P20 value is blocked', () => {
  for (const parameter of ['P12', 'P13', 'P14', 'P18', 'P19', 'P20']) {
    const { input, generation, edits } = world();
    const edit = writeEdit(edits, generation, changedParameterSections(input, parameter));

    assert.notEqual(edit.validation_status, EDIT_VALIDATION_STATUS.VALID, `${parameter} should be blocked`);
    assert.ok(
      codesOf(edit).includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
      `${parameter} should report a changed parameter value`,
    );
    assert.equal(
      edits.issueGate(generation.generation_id).issuable,
      false,
      `${parameter} must not reach export`,
    );
  }

  // A Performance Level the parameter's own reports do not state is blocked too.
  const { input, generation, edits } = world();
  const level = writeEdit(edits, generation, changedLevelSections(input));
  assert.notEqual(level.validation_status, EDIT_VALIDATION_STATUS.VALID);
  assert.ok(codesOf(level).includes(WRITER_REJECTION.CHANGED_LEVEL));
  assert.ok(level.validation_errors.some((entry) => /P13:L3/.test(entry.detail)));
});

/* ── H. Unsupported product ────────────────────────────────────────────────── */

test('H. an edit that adds a product no option lists is blocked', () => {
  const { input, generation, edits } = world();

  const edit = writeEdit(edits, generation, unselectedProductSections(input));

  assert.notEqual(edit.validation_status, EDIT_VALIDATION_STATUS.VALID);
  assert.ok(codesOf(edit).includes(WRITER_REJECTION.UNSELECTED_PRODUCT));
  assert.ok(edit.validation_errors.some((entry) => /SUB9-99/.test(entry.detail)));
  assert.equal(edits.issueGate(generation.generation_id).issuable, false);
});

/* ── I. Blocked claim ──────────────────────────────────────────────────────── */

test('I. an edit that claims solved bass consistency is blocked', () => {
  const { input, generation, edits } = world();

  const edit = writeEdit(edits, generation, blockedClaimSections(input));

  assert.notEqual(edit.validation_status, EDIT_VALIDATION_STATUS.VALID);
  assert.ok(codesOf(edit).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION));
  assert.equal(edits.issueGate(generation.generation_id).issuable, false);
});

/* ── J. Tone-only edit ─────────────────────────────────────────────────────── */

test('J. a wording and tone edit passes', () => {
  const { input, generation, edits } = world();

  const edit = writeEdit(edits, generation, toneSections(input));

  assert.equal(edit.validation_status, EDIT_VALIDATION_STATUS.VALID);
  assert.deepEqual(edit.validation_errors, []);

  // The facts are untouched: same sections, same claim IDs, same figures.
  const generatedSections = generation.gpt_output.sections;
  assert.deepEqual(
    edit.edited_sections.map((entry) => entry.section),
    generatedSections.map((entry) => entry.section),
  );
  assert.deepEqual(
    edit.edited_sections.map((entry) => entry.claim_ids),
    generatedSections.map((entry) => entry.claim_ids),
  );
  assert.notEqual(JSON.stringify(edit.edited_sections), JSON.stringify(generatedSections));

  // The edit is the copy, and it may be issued.
  assert.equal(edits.renderableCopy(generation.generation_id).edit_id, edit.edit_id);
  assert.equal(edits.issueGate(generation.generation_id).issuable, true);
});

/* ── K. Revert ─────────────────────────────────────────────────────────────── */

test('K. a revert appends a new valid copy without mutating the records it restores', () => {
  const { input, generation, edits } = world();

  const valid = writeEdit(edits, generation, toneSections(input), EDIT_AT_FIRST);
  const invalid = writeEdit(edits, generation, changedParameterSections(input, 'P12'), EDIT_AT_SECOND);
  const validCopy = JSON.stringify(valid.edited_sections);

  // Revert to the original generated copy: the sections come from the generation.
  const toOriginal = edits.appendRevert({
    generationId: generation.generation_id,
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_THIRD,
  });
  assert.equal(toOriginal.edit_source, EDIT_SOURCE.REVERT);
  assert.equal(toOriginal.base_edit_id, null);
  assert.deepEqual(toOriginal.edited_sections, generation.gpt_output.sections);
  assert.equal(toOriginal.validation_status, EDIT_VALIDATION_STATUS.VALID);
  assert.equal(toOriginal.edit_number, 3);

  // Nothing was overwritten, and the block the invalid edit left is cleared.
  assert.equal(edits.records().length, 3);
  assert.equal(edits.byId(invalid.edit_id).validation_status, EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW);
  assert.equal(JSON.stringify(edits.byId(valid.edit_id).edited_sections), validCopy);
  assert.equal(edits.issueGate(generation.generation_id).issuable, true);
  assert.equal(edits.issueGate(generation.generation_id).edit_id, toOriginal.edit_id);

  // Revert to a previous valid edit: the sections come from that edit.
  const toEdit = edits.appendRevert({
    generationId: generation.generation_id,
    toEditId: valid.edit_id,
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_FOURTH,
  });
  assert.equal(toEdit.base_edit_id, valid.edit_id);
  assert.deepEqual(toEdit.edited_sections, valid.edited_sections);
  assert.equal(JSON.stringify(edits.byId(valid.edit_id).edited_sections), validCopy);

  // A revert restores only a copy that passed validation, and only from this history.
  assert.throws(
    () => edits.appendRevert({
      generationId: generation.generation_id,
      toEditId: invalid.edit_id,
      editedBy: EDIT_BY,
      editedAt: EDIT_AT_FOURTH,
    }),
    /restores a copy that passed validation/,
  );
  assert.throws(
    () => edits.appendRevert({
      generationId: generation.generation_id,
      toEditId: 'edit_not_here',
      editedBy: EDIT_BY,
      editedAt: EDIT_AT_FOURTH,
    }),
    /not one of them/,
  );
});

/* ── L. Issue/export gate ──────────────────────────────────────────────────── */

test('L. only the validated GPT output or the latest valid edit may be issued', () => {
  const { pack, input, generations, generation, edits } = world();

  // No edit layer: the validated GPT output goes out.
  let gate = edits.issueGate(generation.generation_id);
  assert.equal(gate.issuable, true);
  assert.equal(gate.source, 'generated');
  assert.equal(gate.edit_id, null);
  assert.equal(gate.reason, EDIT_GATE_REASON.VALID);

  // A valid edit becomes the copy that goes out.
  const edit = writeEdit(edits, generation, toneSections(input));
  gate = edits.issueGate(generation.generation_id);
  assert.equal(gate.issuable, true);
  assert.equal(gate.source, 'edit');
  assert.equal(gate.edit_id, edit.edit_id);

  // An invalid edit at the head of the chain blocks, even though a valid copy exists.
  writeEdit(edits, generation, changedLevelSections(input), EDIT_AT_SECOND);
  gate = edits.issueGate(generation.generation_id);
  assert.equal(gate.issuable, false);
  assert.equal(gate.reason, EDIT_GATE_REASON.LATEST_EDIT_INVALID);
  assert.equal(edits.renderableCopy(generation.generation_id).edit_id, edit.edit_id);

  // The Phase 3 rule still holds over both layers: a superseded generation is refused.
  generations.append(attempt({ pack, at: AT_LATER, retryOfGenerationId: generation.generation_id }));
  const withBoth = createEditHistory({ generations: generations.records() });
  const superseded = withBoth.issueGate(generation.generation_id);
  assert.equal(superseded.issuable, false);
  assert.equal(superseded.reason, GENERATION_GATE_REASON.SUPERSEDED);
  assert.equal(superseded.source, null);

  // And a generation that never passed validation is refused whatever the edits say.
  assert.deepEqual(EDIT_ISSUABLE_STATUSES, [EDIT_VALIDATION_STATUS.VALID]);
  assert.equal(editGate({ status: EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW }).issuable, false);
  assert.equal(editGate({ status: EDIT_VALIDATION_STATUS.VALIDATION_FAILED }).issuable, false);
  assert.equal(editGate({ status: null }).issuable, false);
});