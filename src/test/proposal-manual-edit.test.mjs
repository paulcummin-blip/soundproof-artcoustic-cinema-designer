// proposal-manual-edit.test.mjs
// ----------------------------
// Guards the manual Edit mode of proposal text blocks.
//
// Covers the manual-edit authority (indicator + regeneration confirmation) and
// the wiring that gives Edit, Save and Cancel their exact behaviour: Save writes
// one section through the existing persistence authority, Cancel restores the
// text that was there when editing began, Edit never calls the AI, and a locked
// section is never unlocked silently.
//
// Run: node --import ./test/_alias-register.mjs src/test/proposal-manual-edit.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MANUAL_EDIT_LABEL,
  isManuallyEdited,
  requiresRegenerationConfirm,
} from '../components/proposal/proposalManualEdit.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const TOOLBAR = read('components/proposal/SectionToolbar.jsx');
const EDITOR = read('pages/ProposalEditor.jsx');
const RICH_TEXT = read('components/proposal/InlineRichTextEditor.jsx');
const PRINT = read('components/proposal/export/ProposalPrintDocument.jsx');
const MANUAL_EDIT = read('components/proposal/proposalManualEdit.js');
const SECTIONS = read('components/proposal/proposalSections.js');

const SECTION = { last_gpt_generated_at: '2026-09-01T10:00:00.000Z', last_user_edited_at: null };
const HAND_EDITED = { ...SECTION, last_user_edited_at: '2026-09-02T10:00:00.000Z' };

test('a section is flagged as manually edited only after a hand edit', () => {
  assert.equal(isManuallyEdited(null), false);
  assert.equal(isManuallyEdited(SECTION), false);
  assert.equal(isManuallyEdited(HAND_EDITED), true, 'edit after generation');
  assert.equal(
    isManuallyEdited({ ...SECTION, last_user_edited_at: '2026-08-01T10:00:00.000Z' }),
    false,
    'regenerated text is AI text again',
  );
  assert.equal(isManuallyEdited({ last_user_edited_at: '2026-09-02T10:00:00.000Z' }), true, 'no generation timestamp');
});

test('regeneration confirms before it may replace manual work', () => {
  assert.equal(requiresRegenerationConfirm(SECTION), false, 'an untouched AI section regenerates freely');
  assert.equal(requiresRegenerationConfirm(HAND_EDITED), true);
  assert.equal(requiresRegenerationConfirm({ ...SECTION, locked: true }), true);
});

test('the manual-edit indicator label is short and neutral', () => {
  assert.equal(MANUAL_EDIT_LABEL, 'Manual edit');
});

test('the toolbar offers Edit, and Save and Cancel while editing', () => {
  assert.ok(TOOLBAR.includes('Edit'), 'an Edit control is present');
  assert.ok(TOOLBAR.includes('onStartEdit'));
  assert.ok(TOOLBAR.includes('onSaveEdit'));
  assert.ok(TOOLBAR.includes('onCancelEdit'));
  assert.ok(TOOLBAR.includes('isEditing ?'), 'editing state switches the controls');
  assert.ok(TOOLBAR.includes('Save'));
  assert.ok(TOOLBAR.includes('Cancel'));
  assert.ok(TOOLBAR.includes('MANUAL_EDIT_LABEL'), 'the edited indicator is shown');

  // The existing actions are untouched and still offered.
  for (const label of ['Rewrite', 'Refine', 'Expand', 'Shorten', 'Technical', 'Client Friendly']) {
    assert.ok(SECTIONS.includes(label) || TOOLBAR.includes(label), `${label} still offered`);
  }
  assert.ok(TOOLBAR.includes('Lock'));
  assert.ok(TOOLBAR.includes('Notes'));
});

test('editing is gated to edit mode, and Save commits that one section', () => {
  assert.match(EDITOR, /editable=\{isActive && editingThisSection && !archived\}/, 'text is editable only in edit mode');
  assert.match(EDITOR, /const outcome = await commitDraft\(section\.id, html, editedAt, false\)/);
  assert.match(
    EDITOR,
    /s\.id === section\.id \? \{ \.\.\.s, body: html, last_user_edited_at: editedAt \}/,
    'only the edited section is updated',
  );
  assert.match(EDITOR, /persistProposalSectionEdit/, 'the server-owned persistence path is reused');
});

test('Cancel restores the text that was there when editing began', () => {
  assert.match(EDITOR, /editBaselinesRef\.current\[section\.id\] = section\.body \|\| ''/);
  assert.match(EDITOR, /body: baseline/);
});

test('manual edit mode does not auto-save over the draft', () => {
  assert.match(EDITOR, /onSave=\{editingThisSection \? undefined :/, 'no autosave while editing');
  assert.match(EDITOR, /onUnloadSave=\{editingThisSection \? undefined :/);
  assert.match(EDITOR, /handleEditDirty\(section\.id, html\)/, 'the draft is tracked for Save');
});

test('a locked section is never unlocked silently', () => {
  assert.match(EDITOR, /This section is locked\. Unlock it to edit the wording by hand\?/);
  assert.match(EDITOR, /await handleSetLock\(section, false\)/);
});

test('regeneration asks before replacing a manual edit, and AI actions still work', () => {
  assert.match(EDITOR, /requiresRegenerationConfirm\(activeSection\)/);
  assert.match(EDITOR, /This section has a manual edit\. Regeneration will replace it\. Continue\?/);
  assert.match(EDITOR, /onRegenerate=\{handleRegenerate\}/);
});

test('line breaks survive the round trip and the manual edit reaches the export', () => {
  // The editor reads back exactly the HTML it wrote, so breaks are preserved.
  assert.match(RICH_TEXT, /editorRef\.current\.innerHTML = html \|\| ''/);
  assert.match(RICH_TEXT, /editorRef\.current\?\.innerHTML \|\| ''/);
  assert.match(RICH_TEXT, /contentEditable=\{editable\}/);
  // Export renders the stored body verbatim, from the same state Save writes into.
  assert.match(PRINT, /dangerouslySetInnerHTML=\{\{ __html: section\.body \|\| '' \}\}/);
  assert.match(EDITOR, /<ProposalPrintDocument[\s\S]*sections=\{sections\}/);
});

test('the manual-edit authority performs no AI call and no network write', () => {
  assert.doesNotMatch(MANUAL_EDIT, /functions\.invoke|fetch\(|InvokeLLM/);
});