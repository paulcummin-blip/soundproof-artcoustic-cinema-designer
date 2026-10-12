// proposal-editor-language.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — what the Proposal Editor says, and what it never says.
//
//   TEST 1  a single-design copy reads Design Overview and Why This Specification
//   TEST 2  a comparison copy keeps What Stays the Same and What Changes
//   TEST 3  section identities, order and word limits are the same in both modes
//   TEST 4  a raw validation code is never rendered
//   TEST 5  a blocked document is explained in plain language
//   TEST 6  the generation diagnostics are not in the Proposal Editor
//   TEST 7  a master admin reaches them through their own administrative view
//
// The copy itself is never rewritten by any of this: the headings are the
// contract's own names for the mode the copy was written under, and every
// rejection stays in the record exactly as it was filed. No GPT call is made and
// no entity is written.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { writer12Fixture } from './fixtures/proposalWriter12Fixtures.mjs';
import {
  editableSectionFields,
  frozenProposalMode,
  resolveEditorLayer,
} from '../base44/shared/proposalEdit/proposalEditEditorModel.js';
import {
  blockedReasonSentence,
  plainIssue,
  plainIssues,
} from '../base44/shared/proposalEdit/proposalEditEditorCopy.js';
import {
  WRITER_REJECTION,
  WRITER_SECTION_IDS,
} from '../base44/shared/proposalWriter/writerContractSchema.js';
import { MULTI_CABINET_REASONS } from '../base44/shared/proposalWriter/writerMultiCabinetRules.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/** A machine code: a snake_case token, which never belongs on a screen. */
const MACHINE_CODE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;

/**
 * The two frozen generations this suite reads: one written from a single-option
 * pack, one written as a comparison. Both are copies the writer contract accepts,
 * which is what lets an editor copy layer exist at all.
 *
 * They come from the writer-12 fixture rather than the Phase 4 fixture because
 * that fixture's copy repeats sentences across its sections and grounds its
 * figures in no claim at all, so the contract refuses it before any copy layer can
 * be resolved — the claim-grounding safeguard working as designed on a fixture
 * whose wiring predates this work, and unrelated to the headings under test here.
 */
const singleDesignGeneration = () => writer12Fixture().generationRecords[0];
const comparisonGeneration = () => writer12Fixture({ comparison: true }).generationRecords[0];

const titleOf = (fields, section) => fields.find((field) => field.section === section)?.title;

/* ── TEST 1 — single-design headings ─────────────────────────────────────── */

test('TEST 1 — a single-design copy reads Design Overview and Why This Specification', () => {
  const generation = singleDesignGeneration();
  assert.equal(frozenProposalMode(generation), 'single', 'the mode is read from the frozen generation');
  assert.equal(generation.status, 'valid_generated', 'the copy passed the contract, so a layer can exist');

  const layer = resolveEditorLayer({ generationRecords: [generation], proposalId: generation.proposal_id });
  assert.equal(layer.mode, 'edit_layer');
  assert.equal(titleOf(layer.fields, 'what_stays_same'), 'Design Overview');
  assert.equal(titleOf(layer.fields, 'what_changes'), 'Why This Specification');
  assert.equal(titleOf(layer.fields, 'decision_summary'), 'Design Summary');

  // The copy is the stored copy, word for word: the headings change, the approved
  // content and its section identities do not.
  for (const field of layer.fields) {
    const stored = generation.gpt_output.sections.find((entry) => entry.section === field.section);
    assert.equal(field.text, stored?.text || '', `${field.section} loaded different copy`);
  }
  const titles = layer.fields.map((field) => field.title);
  assert.ok(!titles.includes('What Stays the Same') && !titles.includes('What Changes'),
    'no comparison heading survives on a single-design copy');
});

/* ── TEST 2 — comparison headings ────────────────────────────────────────── */

test('TEST 2 — a comparison copy keeps What Stays the Same and What Changes', () => {
  // The two-option pack: the copy was written as a comparison.
  const generation = comparisonGeneration();
  assert.equal(frozenProposalMode(generation), 'comparison');

  const layer = resolveEditorLayer({ generationRecords: [generation], proposalId: generation.proposal_id });
  assert.equal(titleOf(layer.fields, 'what_stays_same'), 'What Stays the Same');
  assert.equal(titleOf(layer.fields, 'what_changes'), 'What Changes');

  // A generation filed before the mode was recorded is never relabelled: it keeps
  // the comparison headings it was written with.
  assert.equal(frozenProposalMode({ gpt_input: {}, evidence_pack: {} }), 'comparison');
  assert.equal(frozenProposalMode(null), 'comparison');
});

/* ── TEST 3 — one contract in both modes ─────────────────────────────────── */

test('TEST 3 — the section identities, order and word limits are the same in both modes', () => {
  const single = editableSectionFields([], 'single');
  const comparison = editableSectionFields([], 'comparison');

  assert.deepEqual(single.map((field) => field.section), [...WRITER_SECTION_IDS]);
  assert.deepEqual(single.map((field) => field.section), comparison.map((field) => field.section),
    'the mode changes the label, never the section ID or its place');
  assert.deepEqual(single.map((field) => field.word_limit), comparison.map((field) => field.word_limit));

  for (const field of single) {
    assert.ok(typeof field.title === 'string' && field.title.length > 0, `${field.section} has no heading`);
  }
});

/* ── TEST 4 — no raw code reaches the screen ─────────────────────────────── */

test('TEST 4 — a raw validation code is never rendered', () => {
  // The rejection the editor used to print verbatim: a multi-cabinet omission
  // whose filed detail is the rule, the stage position and the version.
  const omission = {
    code: WRITER_REJECTION.MULTI_CABINET_CHANNEL,
    section: null,
    detail: `${MULTI_CABINET_REASONS.OMITTED}:centre:version-4`,
  };
  assert.equal(plainIssue(omission), 'The centre-channel description needs reviewing.');
  // A centre-channel problem is stated in its own right, never headed with
  // whichever section the writer happened to file it against: a centre-channel
  // problem is not a Dynamic Range problem.
  assert.equal(plainIssue({ ...omission, section: 'dynamic_range' }),
    'The centre-channel description needs reviewing.');
  assert.equal(plainIssue({ ...omission, section: 'dynamic_range' }, 'single'),
    'The centre-channel description needs reviewing.');

  // A contradiction is stated from its own reason, not from its detail string.
  const multiplied = {
    code: WRITER_REJECTION.MULTI_CABINET_CHANNEL,
    section: 'system_overview',
    detail: `${MULTI_CABINET_REASONS.MULTIPLIED}:centre`,
  };
  assert.equal(plainIssue(multiplied),
    'The centre channel is described as more channels than the design places.');

  // A code the table does not know is stated in general words rather than shown.
  const unknown = { code: 'some_future_rule', section: null, detail: 'some_future_rule:centre:version-4' };
  assert.equal(plainIssue(unknown), 'A rule of the copy contract was broken.');
  assert.equal(plainIssue(unknown).toLowerCase().includes('some_future_rule'), false);
  assert.equal(plainIssues([unknown, unknown]).length, 1, 'each reason is stated once');

  for (const line of [
    plainIssue(omission),
    plainIssue({ ...omission, section: 'dynamic_range' }),
    plainIssue(multiplied),
    plainIssue(unknown),
  ]) {
    assert.equal(MACHINE_CODE.test(line), false, `a machine code reached the designer: ${line}`);
    assert.equal(/_/.test(line), false, `an internal identifier reached the designer: ${line}`);
  }
});

/* ── TEST 5 — a blocked document is explained ────────────────────────────── */

test('TEST 5 — a blocked document is explained in plain language', () => {
  // A document-level rejection whose own detail carries a rule token, a section ID
  // or a version ID is stated from the plain-language wording instead.
  assert.equal(
    blockedReasonSentence({
      code: 'published_content_missing',
      detail: 'Validated copy is missing from the published what_stays_same page: "x"',
    }),
    'Approved copy did not reach the published page.',
  );
  assert.equal(
    blockedReasonSentence({ code: 'required_section_missing', detail: 'Required copy is missing: presented_options' }),
    'Required copy is missing from this document.',
  );
  // A detail that is already a plain sentence is the message: nothing is rewritten.
  assert.equal(
    blockedReasonSentence({
      code: 'another_rejection',
      detail: 'The alternatives have changed since this copy was approved.',
    }),
    'The alternatives have changed since this copy was approved.',
  );
  assert.equal(blockedReasonSentence(null), null);

  // The complete-document check states its reason through that one wording, and
  // the validation result itself is untouched: every rejection is still returned
  // exactly as it was filed.
  const validation = read('base44/shared/proposalEdit/completeDocumentValidation.js');
  assert.ok(validation.includes('blockedReasonSentence(errors[0], documentMode)'));
  assert.ok(validation.includes('return { valid: errors.length === 0, errors,'));
});

/* ── TEST 6 — no diagnostics in the Proposal Editor ──────────────────────── */

test('TEST 6 — the generation diagnostics are not in the Proposal Editor', () => {
  const panel = read('src/components/proposal/generation/ProposalGenerationPanel.jsx');
  assert.equal(panel.includes('ProposalEditAuditPanel'), false, 'no audit panel is rendered');
  assert.equal(panel.includes('showAudit'), false, 'there is no audit toggle');
  assert.equal(panel.includes("'Audit'"), false, 'no Audit control is shown');

  // A copy that could not be used is explained without the attempt's own number or
  // the record id it was filed under.
  const banner = read('src/components/proposal/generation/ProposalEditStatusBanner.jsx');
  assert.equal(banner.includes('Attempt v'), false);
  assert.equal(banner.includes('failure.generation_id'), false);

  // What a save reports is the plain sentence the server composed, not the code.
  const fields = read('src/components/proposal/generation/ProposalEditFields.jsx');
  assert.equal(fields.includes('entry.detail || entry.code'), false);
  assert.ok(fields.includes('{lastSave.issues.map((line) => <li key={line}>{line}</li>)}'));
  assert.ok(read('src/components/proposal/generation/useProposalEditLayer.js')
    .includes('issues: data.plain_issues || []'));
  assert.ok(read('base44/functions/appendProposalEdit/entry.ts').includes('plain_issues: plainIssues('));
});

/* ── TEST 7 — the administrative diagnostics view ────────────────────────── */

test('TEST 7 — a master admin reaches the diagnostics through their own view', () => {
  // Diagnostics are administrative: they are not sent to a dealer's editor, to an
  // account with Sound Proof access, or merely because a login is an administrator.
  const layerFunction = read('base44/functions/readProposalEditLayer/entry.ts');
  assert.ok(layerFunction.includes('accessContext?.allowed === true && accessContext.isMasterAdmin === true'),
    'the audit block is returned to a master admin only');
  assert.equal(layerFunction.includes('capabilities?.soundProof'), false,
    'Sound Proof access alone does not receive the diagnostics');

  const page = read('src/pages/AdminProposalDiagnostics.jsx');
  assert.ok(page.includes('ProposalEditAuditPanel'), 'the diagnostics view mounts the audit panel');
  assert.ok(page.includes('useProposalEditLayer'), 'and reads the history it diagnoses');

  const app = read('src/App.jsx');
  assert.ok(app.includes('path="/admin/proposal-diagnostics"'), 'the view is a route of its own');
  assert.ok(app.includes('<AccessGate masterAdmin><AdminProposalDiagnostics /></AccessGate>'),
    'and it is behind the admin gate');

  const auditPanel = read('src/components/proposal/generation/ProposalEditAuditPanel.jsx');
  assert.equal(auditPanel.includes('Visible to designers and admins only'), false);
  assert.ok(auditPanel.includes('Generation diagnostics'), 'it names itself as the administrative view');
});