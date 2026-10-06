//
// Phase 5 — the Proposal Editor's generated-copy surface.
//
// Cases A to I: opening a generated proposal, saving a valid edit, saving an
// invalid one, reverting, which copy the export uses, what an invalid newest edit
// blocks, what a legacy proposal does, who may see the audit, and the gates.
//
// The editor renders a model the server resolves from the shared Phase 3 and
// Phase 4 modules, and it saves by composing a copy from the frozen records and
// appending it through the store — the two calls the backend functions make. Both
// are exercised here exactly as those functions call them, over an in-memory world
// built from real frozen packs. No GPT call is made and no entity is written.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGenerationHistory } from '../base44/shared/proposalGeneration/proposalGenerationRepository.js';
import { createEditHistory } from '../base44/shared/proposalEdit/proposalEditRepository.js';
import { GENERATION_STATUS } from '../base44/shared/proposalGeneration/generationStatuses.js';
import { EDIT_VALIDATION_STATUS } from '../base44/shared/proposalEdit/editStatuses.js';
import { proposalIssueGate } from '../base44/shared/proposalEdit/proposalEditHistory.js';
import {
  WRITER_SECTIONS,
  WRITER_SECTION_IDS,
} from '../base44/shared/proposalWriter/writerContractSchema.js';
import {
  EDITOR_MODE,
  composeEditedSections,
  resolveEditorLayer,
  wordCountOf,
} from '../base44/shared/proposalEdit/proposalEditEditorModel.js';
import {
  LEGACY_TITLE,
  LATEST_EDIT_INVALID_SENTENCE,
} from '../base44/shared/proposalEdit/proposalEditEditorCopy.js';
import {
  PROPOSAL_ID,
  AT_LATER,
  attempt,
  evidenceFor,
  invalidClaimAttempt,
  invalidShapeAttempt,
  providerFailureAttempt,
} from './fixtures/proposalGenerationFixtures.mjs';
import {
  EDIT_AT_FIRST,
  EDIT_AT_FOURTH,
  EDIT_AT_SECOND,
  EDIT_AT_THIRD,
  EDIT_BY,
  changedParameterSections,
  editWorld,
  toneSections,
} from './fixtures/proposalEditFixtures.mjs';

/** The wording a save submits: one text per section, and nothing else. */
function draftsFrom(sections) {
  return Object.fromEntries(sections.map((entry) => [entry.section, entry.text]));
}

/** The copy the save composes, exactly as appendProposalEdit composes it. */
function composeForSave({ generation, layer, sections }) {
  return composeEditedSections({
    generatedSections: generation.gpt_output.sections,
    currentSections: layer.export_sections || [],
    drafts: draftsFrom(sections),
  });
}

const editorLayer = ({ generationRecords = [], editRecords = [], proposalId = PROPOSAL_ID, canViewAudit = true } = {}) => (
  resolveEditorLayer({ generationRecords, editRecords, proposalId, canViewAudit })
);

/* ── A. Open generated proposal ───────────────────────────────────────────── */

test('A. a generated proposal opens on the original generated copy', () => {
  const { generation } = editWorld();
  const layer = editorLayer({ generationRecords: [generation] });

  assert.equal(layer.mode, EDITOR_MODE.EDIT_LAYER);
  assert.equal(layer.legacy, false);
  assert.equal(layer.has_history, true);
  assert.equal(layer.copy.source, 'generated');
  assert.equal(layer.export_source, 'generated');
  assert.equal(layer.status, EDIT_VALIDATION_STATUS.VALID);
  assert.equal(layer.status_label, 'Ready to issue');
  assert.equal(layer.ready, true);
  assert.equal(layer.export_blocked_reason, null);
  assert.equal(layer.blocking_edit, null);
  assert.deepEqual(layer.blocked_issues, []);

  // The nine contract sections, in the contract's own order and titles.
  assert.equal(layer.fields.length, 9);
  assert.deepEqual(layer.fields.map((field) => field.section), [...WRITER_SECTION_IDS]);
  assert.deepEqual(layer.fields.map((field) => field.title), WRITER_SECTIONS.map((entry) => entry.title));
  assert.deepEqual(layer.fields.map((field) => field.word_limit), WRITER_SECTIONS.map((entry) => entry.word_limit));

  // …carrying the generated copy word for word, and the evidence it stands on.
  for (const field of layer.fields) {
    const generated = generation.gpt_output.sections.find((entry) => entry.section === field.section);
    assert.equal(field.text, generated.text, `${field.section} loaded a different text`);
    assert.deepEqual(field.claim_ids, generated.claim_ids);
    assert.equal(field.present, true);
  }
  assert.equal(layer.export_sections.length, 9);
});

/* ── B. Save valid edit ───────────────────────────────────────────────────── */

test('B. a valid edit is appended, the generation is untouched and the editor shows the new copy', () => {
  const { generation, edits, input } = editWorld();
  const before = editorLayer({ generationRecords: [generation] });
  const generationBefore = JSON.stringify(generation);

  const record = edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: before, sections: toneSections(input) }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_FIRST,
  });

  assert.equal(record.validation_status, EDIT_VALIDATION_STATUS.VALID);
  assert.equal(record.edit_number, 1);
  assert.equal(edits.records().length, 1);
  assert.equal(JSON.stringify(generation), generationBefore, 'the generation record was changed by an edit');

  const after = editorLayer({ generationRecords: [generation], editRecords: edits.records() });
  assert.equal(after.copy.source, 'edit');
  assert.equal(after.export_source, 'edit');
  assert.equal(after.status_label, 'Ready to issue');
  assert.equal(after.ready, true);
  assert.equal(after.export_blocked_reason, null);
  assert.deepEqual(after.export_sections, edits.latestValid(generation.generation_id).edited_sections);

  // The editor shows the new wording, section for section.
  const wanted = draftsFrom(toneSections(input));
  for (const field of after.fields) {
    assert.equal(field.text, wanted[field.section], `${field.section} did not show the saved wording`);
  }
});

/* ── C. Save invalid edit ─────────────────────────────────────────────────── */

test('C. an invalid edit is retained, reported and blocks issue and export', () => {
  const { generation, edits, input } = editWorld();
  const before = editorLayer({ generationRecords: [generation] });

  const record = edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: before, sections: changedParameterSections(input, 'P13') }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_FIRST,
  });

  // Retained: nothing is discarded, and no earlier copy is touched.
  assert.equal(record.validation_status, EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW);
  assert.equal(edits.records().length, 1);
  assert.ok(record.validation_errors.length > 0);

  const layer = editorLayer({ generationRecords: [generation], editRecords: edits.records() });
  assert.equal(layer.mode, EDITOR_MODE.EDIT_LAYER);
  assert.equal(layer.status_label, 'Needs review');
  assert.equal(layer.ready, false);
  assert.equal(layer.export_blocked_reason, LATEST_EDIT_INVALID_SENTENCE);
  assert.equal(layer.blocking_edit.edit_id, record.edit_id);
  assert.equal(layer.blocking_edit.status, EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW);

  // The issues are stated in plain language: a sentence per issue, no codes.
  assert.ok(layer.blocked_issues.length > 0);
  for (const line of layer.blocked_issues) {
    assert.equal(/_/.test(line), false, `a machine code reached the designer: ${line}`);
    assert.ok(line.length > 12);
  }

  // The last good copy is still shown, so it can be read and reverted to.
  assert.equal(layer.copy.source, 'generated');
  assert.equal(layer.export_sections.length, 9);
});

/* ── D. Revert ────────────────────────────────────────────────────────────── */

test('D. a revert appends a new record restoring the original or a previous valid copy', () => {
  const { generation, edits, input } = editWorld();
  const start = editorLayer({ generationRecords: [generation] });

  const valid = edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: start, sections: toneSections(input) }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_FIRST,
  });

  const invalid = edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: start, sections: changedParameterSections(input, 'P13') }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_SECOND,
  });
  const invalidBefore = JSON.stringify(invalid);

  // Revert to the previous valid copy…
  const restored = edits.appendRevert({
    generationId: generation.generation_id,
    toEditId: valid.edit_id,
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_THIRD,
  });

  assert.equal(restored.edit_source, 'revert');
  assert.equal(restored.base_edit_id, valid.edit_id);
  assert.equal(restored.edit_number, 3);
  assert.equal(restored.validation_status, EDIT_VALIDATION_STATUS.VALID);
  assert.deepEqual(restored.edited_sections, valid.edited_sections, 'the revert did not restore the copy it pointed at');
  assert.equal(JSON.stringify(invalid), invalidBefore, 'the revert changed the invalid record');
  assert.equal(edits.records().length, 3);

  const layer = editorLayer({ generationRecords: [generation], editRecords: edits.records() });
  assert.equal(layer.ready, true);
  assert.equal(layer.export_blocked_reason, null);
  assert.equal(layer.status_label, 'Ready to issue');
  assert.deepEqual(layer.export_sections, valid.edited_sections);

  // …and revert to the original generated copy.
  const original = edits.appendRevert({
    generationId: generation.generation_id,
    toEditId: null,
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_FOURTH,
  });

  assert.equal(original.base_edit_id, null);
  assert.deepEqual(original.edited_sections, generation.gpt_output.sections, 'the revert did not restore the generated copy');

  const afterOriginal = editorLayer({ generationRecords: [generation], editRecords: edits.records() });
  assert.deepEqual(afterOriginal.export_sections, generation.gpt_output.sections);
  assert.equal(edits.records().length, 4);

  // Only the copies that passed validation are offered as revert targets.
  assert.deepEqual(
    afterOriginal.revert_targets.map((target) => target.edit_id),
    [null, valid.edit_id, restored.edit_id, original.edit_id],
  );
  assert.equal(afterOriginal.revert_targets.some((target) => target.edit_id === invalid.edit_id), false);
});

/* ── E. Export source ─────────────────────────────────────────────────────── */

test('E. the exported copy is the latest valid edit, else the original generated output', () => {
  const { generation, edits, input } = editWorld();

  const none = editorLayer({ generationRecords: [generation] });
  assert.equal(none.export_source, 'generated');
  assert.deepEqual(none.export_sections, generation.gpt_output.sections);

  const valid = edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: none, sections: toneSections(input) }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_FIRST,
  });

  const withEdit = editorLayer({ generationRecords: [generation], editRecords: edits.records() });
  assert.equal(withEdit.export_source, 'edit');
  assert.deepEqual(withEdit.export_sections, valid.edited_sections);
  assert.equal(withEdit.gate.edit_id, valid.edit_id);
  assert.equal(withEdit.gate.source, 'edit');

  // A second valid edit becomes the copy: the newest valid one wins.
  const second = edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: withEdit, sections: toneSections(input) }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_SECOND,
  });
  const newest = editorLayer({ generationRecords: [generation], editRecords: edits.records() });
  assert.deepEqual(newest.export_sections, second.edited_sections);
  assert.equal(newest.gate.edit_id, second.edit_id);
});

/* ── F. Invalid latest edit ───────────────────────────────────────────────── */

test('F. an invalid newest edit blocks export until it is corrected or reverted', () => {
  const { generation, edits, input } = editWorld();
  const start = editorLayer({ generationRecords: [generation] });

  const valid = edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: start, sections: toneSections(input) }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_FIRST,
  });

  const invalid = edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: start, sections: changedParameterSections(input, 'P18') }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_SECOND,
  });

  const blocked = editorLayer({ generationRecords: [generation], editRecords: edits.records() });
  assert.equal(blocked.ready, false, 'an invalid newest edit left the copy issuable');
  assert.equal(blocked.export_blocked_reason, LATEST_EDIT_INVALID_SENTENCE);
  assert.equal(blocked.gate.issuable, false);
  assert.equal(blocked.status_label, 'Needs review');
  // The earlier valid copy is still recoverable, and still shown as the copy.
  assert.deepEqual(blocked.export_sections, valid.edited_sections);

  // Correcting it — by appending a valid copy — clears the block.
  const corrected = edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: blocked, sections: toneSections(input) }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_THIRD,
  });

  const cleared = editorLayer({ generationRecords: [generation], editRecords: edits.records() });
  assert.equal(cleared.ready, true);
  assert.equal(cleared.export_blocked_reason, null);
  assert.equal(cleared.gate.edit_id, corrected.edit_id);
  assert.equal(cleared.blocking_edit, null);
});

/* ── G. Legacy proposal ───────────────────────────────────────────────────── */

test('G. a proposal with no generation history opens as a legacy/manual proposal', () => {
  const { generation } = editWorld();

  const legacy = editorLayer({ generationRecords: [], editRecords: [] });
  assert.equal(legacy.mode, EDITOR_MODE.LEGACY);
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.has_history, false);
  assert.equal(legacy.title, LEGACY_TITLE);
  assert.ok(legacy.message.length > 0);
  // Never blocked: a legacy proposal has no generated copy to hold to a gate.
  assert.equal(legacy.export_blocked_reason, null);
  assert.equal(legacy.ready, false);
  assert.deepEqual(legacy.fields, []);
  assert.equal(legacy.audit, null);

  // Another proposal's history is not this proposal's history.
  const other = editorLayer({ generationRecords: [generation], editRecords: [], proposalId: 'another-proposal' });
  assert.equal(other.mode, EDITOR_MODE.LEGACY);
  assert.equal(other.export_blocked_reason, null);
});

/* ── H. Audit visibility ──────────────────────────────────────────────────── */

test('H. editors and admins may inspect the history; the model hides it from everyone else', () => {
  const { generation, edits, input } = editWorld();
  const start = editorLayer({ generationRecords: [generation] });
  const record = edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: start, sections: toneSections(input) }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_FIRST,
  });

  // An authorised editor sees the generation version, the edit history, the
  // validation statuses, the timestamps, the editor identity and the fingerprints.
  const authorised = editorLayer({
    generationRecords: [generation],
    editRecords: edits.records(),
    canViewAudit: true,
  });

  assert.ok(authorised.audit);
  assert.equal(authorised.audit.generation.generation_number, generation.generation_number);
  assert.equal(authorised.audit.generation.status, GENERATION_STATUS.VALID_GENERATED);
  assert.equal(authorised.audit.generation.created_by, generation.created_by);
  assert.equal(authorised.audit.generation.contract_version, generation.contract_version);
  assert.equal(authorised.audit.generation.evidence_pack_fingerprint, generation.evidence_pack_fingerprint);
  assert.equal(authorised.audit.generation.record_fingerprint, generation.record_fingerprint);
  assert.equal(authorised.audit.edits.length, 1);
  assert.equal(authorised.audit.edits[0].edit_id, record.edit_id);
  assert.equal(authorised.audit.edits[0].editor, EDIT_BY);
  assert.equal(authorised.audit.edits[0].edited_at, EDIT_AT_FIRST);
  assert.equal(authorised.audit.edits[0].status, 'Ready to issue');
  assert.equal(authorised.audit.edits[0].edit_fingerprint, record.edit_fingerprint);

  // A user who is not an authorised editor gets no audit block, and no
  // fingerprint, snapshot ID or evidence fingerprint anywhere in the model.
  const unauthorised = editorLayer({
    generationRecords: [generation],
    editRecords: edits.records(),
    canViewAudit: false,
  });

  assert.equal(unauthorised.audit, null);
  const serialised = JSON.stringify(unauthorised);
  assert.equal(serialised.includes(generation.evidence_pack_fingerprint), false);
  assert.equal(serialised.includes(generation.record_fingerprint), false);
  assert.equal(serialised.includes('visual_report_snapshot_ids'), false);
  // The copy and its editable fields are still there: only the audit is withheld.
  assert.equal(unauthorised.fields.length, 9);
  assert.equal(unauthorised.ready, true);

  // The audit is served only to an authorised editor, and is mounted only in the
  // editor — never on a client-facing page.
  const layerFunction = readFileSync(new URL('../base44/functions/readProposalEditLayer/entry.ts', import.meta.url), 'utf8');
  assert.ok(/resolveAccountAccess/.test(layerFunction));
  assert.ok(/canViewAudit/.test(layerFunction));
  assert.ok(/soundProof/.test(layerFunction));

  const editorPage = readFileSync(new URL('../src/pages/ProposalEditor.jsx', import.meta.url), 'utf8');
  assert.ok(/ProposalGenerationPanel/.test(editorPage));
  const panel = readFileSync(new URL('../src/components/proposal/generation/ProposalGenerationPanel.jsx', import.meta.url), 'utf8');
  assert.ok(/ProposalEditAuditPanel/.test(panel));
  const clientReport = readFileSync(new URL('../src/pages/RP22ClientReport.jsx', import.meta.url), 'utf8');
  assert.equal(/ProposalEdit|ProposalGeneration/.test(clientReport), false);
});

/* ── I. Gates ─────────────────────────────────────────────────────────────── */

test('I. only a valid generation or the latest valid edit may be issued', () => {
  // An attempt that broke a rule, one that was not the contract's shape, and one
  // the writer never returned: none of them offers a copy to edit or to issue.
  for (const failed of [
    invalidClaimAttempt(),
    invalidShapeAttempt(),
    providerFailureAttempt(),
  ]) {
    const generations = createGenerationHistory();
    const record = generations.append(failed);
    const layer = editorLayer({ generationRecords: generations.records() });

    assert.equal(layer.mode, EDITOR_MODE.NO_VALID_GENERATION, `${record.status} offered an editable copy`);
    assert.equal(layer.ready, false);
    assert.equal(layer.export_blocked_reason != null, true);
    assert.deepEqual(layer.fields, []);
    assert.equal(layer.failures.length, 1);
    assert.equal(layer.failures[0].generation_id, record.generation_id);
    // Stated in plain language, with no machine code leaking through.
    assert.equal(/_/.test(layer.failures[0].sentence), false);
  }

  // A valid generation may be issued; a superseded one may not, and the model
  // never picks a superseded generation as the copy to show.
  const generations = createGenerationHistory();
  const older = generations.append(attempt({ pack: evidenceFor().pack }));
  const newer = generations.append(attempt({
    pack: evidenceFor().pack,
    at: AT_LATER,
    generationNumber: 2,
  }));

  const layer = editorLayer({ generationRecords: generations.records() });
  assert.equal(layer.generation.generation_id, newer.generation_id);
  assert.equal(layer.ready, true);
  assert.equal(layer.generation_status, GENERATION_STATUS.VALID_GENERATED);
  assert.equal(
    proposalIssueGate({
      generationRecords: generations.records(),
      editRecords: [],
      generationId: older.generation_id,
    }).issuable,
    false,
  );
  assert.equal(
    proposalIssueGate({
      generationRecords: generations.records(),
      editRecords: [],
      generationId: newer.generation_id,
    }).issuable,
    true,
  );

  // With a valid generation and an invalid newest edit, nothing is issued.
  const { generation, edits, input } = editWorld();
  const start = editorLayer({ generationRecords: [generation] });
  edits.appendEdit({
    generationId: generation.generation_id,
    editedSections: composeForSave({ generation, layer: start, sections: changedParameterSections(input, 'P12') }),
    editedBy: EDIT_BY,
    editedAt: EDIT_AT_FIRST,
  });
  const blocked = editorLayer({ generationRecords: [generation], editRecords: edits.records() });
  assert.equal(blocked.gate.issuable, false);
  assert.equal(blocked.ready, false);
});

/* ── The edits a save may and may not make ────────────────────────────────── */

test('a save submits wording only: the evidence a section stands on cannot come from the form', () => {
  const { generation } = editWorld();
  const layer = editorLayer({ generationRecords: [generation] });

  // Anything that is not a string is not wording: the copy's own text is kept.
  const composed = composeEditedSections({
    generatedSections: generation.gpt_output.sections,
    currentSections: layer.export_sections,
    drafts: {
      decision_summary: { text: 'forged', claim_ids: ['claim_forged'] },
      dynamic_range: 'The dynamic range the reports record, in the designer’s own words.',
    },
  });

  assert.deepEqual(composed.map((entry) => entry.section), [...WRITER_SECTION_IDS]);
  const serialised = JSON.stringify(composed);
  assert.equal(serialised.includes('forged'), false);
  assert.equal(serialised.includes('claim_forged'), false);

  const decision = composed.find((entry) => entry.section === 'decision_summary');
  const decisionField = layer.fields.find((field) => field.section === 'decision_summary');
  assert.equal(decision.text, decisionField.text);
  assert.deepEqual(decision.claim_ids, decisionField.claim_ids);

  // Wording is taken from the drafts where it is given.
  assert.equal(
    composed.find((entry) => entry.section === 'dynamic_range').text,
    'The dynamic range the reports record, in the designer’s own words.',
  );

  // The word counter the editor shows.
  assert.equal(wordCountOf('one two three'), 3);
  assert.equal(wordCountOf('   '), 0);
  assert.equal(wordCountOf(null), 0);
});