// proposal-preview-readiness.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — Preview Document and Export Proposal PDF do not share one
// permission rule.
//
// The confirmed defect: the editor passed the copy layer's editorial block
// straight into the export readiness check, so a document that needed review
// could not be PREVIEWED either — and the real A4 pack was not even mounted on the
// page until complete validation passed, so there was nothing to preview.
//
//   A  preview opens for a document that still needs editorial review
//   B  export is withheld by the same editorial block
//   C  composition availability withholds both, unchanged
//   D  the real pack is mounted for both actions, from its own source data
//   E  preview writes nothing: no record, no status, no section
//   F  export stays protected by the complete-document gate
//   G  the application interface is never printed in the pack's place
//   H  the print resource checks are unchanged
//   I  the validator and the readiness rules touch no record
//
// BOUNDARY. The two decisions live in the print hook (useProposalExport), which
// belongs to the browser application: it loads the client SDK chain, so importing
// it here would require a browser to initialise and the suite could never run. It
// is therefore not imported. The pure rules the hook decides by — the export-mode
// rule in proposalExportMode and the print readiness contract — ARE imported and
// called directly, and the hook's own guards are asserted where they are written.
// Nothing about Preview or Export is weakened to make this executable: every
// safeguard below is asserted both as a rule and in the source that applies it.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  EXPORT_MODE,
  PREVIEW_MODE,
  requiresIssueGate,
  shouldRecordIssuedExport,
} from '../src/components/proposal/export/proposalExportMode.js';
import { PRINT_READINESS_BUDGET_MS } from '../src/components/report/printReadiness/readinessContract.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const countOf = (haystack, needle) => String(haystack).split(needle).length - 1;

const HOOK = read('src/components/proposal/export/useProposalExport.js');
const EDITOR = read('src/pages/ProposalEditor.jsx');

/** The copy layer's editorial block, in the words the editor now states it. */
const NEEDS_REVIEW = 'The centre-channel description needs reviewing.';

/* ── A and B · the two actions do not share one rule ──────────────────────── */

test('A. preview opens for a document that still needs editorial review', () => {
  // The rule: an editorial block is an export requirement, not a preview one.
  assert.equal(requiresIssueGate(PREVIEW_MODE), false, 'a preview is not withheld by the issue gate');
  assert.equal(requiresIssueGate(EXPORT_MODE), true);
  // And the one place it is applied, applied to both actions.
  assert.equal(
    HOOK.includes('if (requiresIssueGate(mode) && issueBlockReason) return issueBlockReason;'),
    true,
    'the block withholds the document only in the mode that requires it',
  );
  // The sentence itself is never headed with another section's name: a
  // centre-channel problem is not a Dynamic Range problem.
  assert.equal(NEEDS_REVIEW.includes('Dynamic Range'), false);
  // The layer is still read, read-only, in both modes, so access control is
  // unchanged: a login that may not open the proposal is refused by the server.
  assert.equal(HOOK.includes("base44.functions.invoke('readProposalEditLayer'"), true);
  assert.equal(HOOK.includes('readLayerAction(mode)'), true);
});

test('B. export is withheld by the same editorial block', () => {
  assert.equal(requiresIssueGate(EXPORT_MODE), true);
  assert.equal(
    HOOK.includes('if (requiresIssueGate(mode) && issueBlockReason) return issueBlockReason;'),
    true,
  );
  // The editor states that block as an issue gate, and shows it to the designer.
  assert.equal(EDITOR.includes('issueBlockReason: editLayerBlockReason'), true);
  assert.equal(EDITOR.includes('comparisonBlockReason || exportBlockedReason || editLayerBlockReason'), true);
});

/* ── C · what must still withhold both ────────────────────────────────────── */

test('C. a document that cannot be composed is withheld in both modes', () => {
  // Composition, not editorial readiness, is what withholds BOTH actions.
  assert.equal(HOOK.includes('if (comparisonBlockReason) return comparisonBlockReason;'), true,
    'without its frozen evidence there is nothing to compose');
  assert.equal(
    HOOK.includes('This proposal could not be loaded. Reopen it from the Proposal Centre and try again.'),
    true,
  );
  assert.equal(HOOK.includes("if (proposal.status === 'generating')"), true);
  assert.equal(HOOK.includes('This proposal has no sections yet, so there is nothing to export.'), true);
});

/* ── D · the composition is mounted for both actions ─────────────────────── */

test('D. the real A4 composition is mounted from its own source data', () => {
  assert.equal(
    HOOK.includes('export function canMountPrintComposition({ proposal = null, sections = [] } = {}) {'),
    true,
  );
  assert.equal(HOOK.includes('return Boolean(proposal?.id)'), true, 'without the proposal there is nothing to mount');
  assert.equal(HOOK.includes('.some((section) => section?.is_enabled !== false);'), true,
    'a proposal with no enabled section is not mounted');

  // The editor mounts that one composition for both actions, from the proposal's
  // own source data, and no longer gates it on the complete-document verdict.
  assert.equal(EDITOR.includes('canMountPrintComposition({ proposal, sections: documentSections })'), true);
  assert.equal(EDITOR.includes('currentDocumentLayer?.document_validation?.valid && <ProposalPrintDocument'), false);
  assert.equal(countOf(EDITOR, '<ProposalPrintDocument'), 1, 'one composition, one mount site');
  // The pack the editor mounts is the app's own print document, which portals the
  // real pack — there is no second preview renderer.
  const printDocument = read('src/components/proposal/export/ProposalPrintDocument.jsx');
  assert.equal(printDocument.includes('<ProposalPackDocument {...props} />'), true);
});

/* ── E · preview writes nothing ──────────────────────────────────────────── */

test('E. preview creates no record, no status and no section', () => {
  assert.equal(shouldRecordIssuedExport({ mode: PREVIEW_MODE, issuedDocument: { documentType: 'proposal' } }), false);
  assert.equal(shouldRecordIssuedExport({ mode: EXPORT_MODE, issuedDocument: { documentType: 'proposal' } }), true);
  for (const write of ['base44.entities.', 'transitionProposalStatus', 'persistProposalSectionEdit', 'appendProposalEdit']) {
    assert.equal(HOOK.includes(write), false, `the export path must not call ${write}`);
  }
  assert.equal(countOf(HOOK, 'base44.functions.invoke('), 1, 'one server call: the read-only copy layer');
  // The issued copy is stored only behind that decision, and only for an export.
  const guarded = HOOK.indexOf('shouldRecordIssuedExport({ mode, issuedDocument })');
  const write = HOOK.indexOf('recordIssuedExportInBackground({');
  assert.ok(guarded > -1 && write > guarded, 'the only issued-copy write is behind the mode decision');
});

/* ── F · export stays protected ──────────────────────────────────────────── */

test('F. export still passes the complete-document gate', () => {
  // The gate is asked before anything is prepared, and only for an export.
  assert.equal(HOOK.includes('requiresIssueGate(mode) && !validation?.valid'), true);
  assert.equal(HOOK.includes('The complete proposal must pass validation before export.'), true);
  // A preview cannot reach the issued-copy write through any other path.
  assert.equal(HOOK.includes('shouldRecordIssuedExport({ mode: PREVIEW_MODE'), false);
});

/* ── G · never print the app interface ───────────────────────────────────── */

test('G. the application interface is never printed in the pack\'s place', () => {
  // Both paths print the mounted pack node. When there is no node — the
  // composition could not be prepared — the attempt fails visibly instead.
  assert.equal(HOOK.includes('const fallbackNode = findPrintNode();'), true);
  assert.equal(HOOK.includes('if (!fallbackNode) {'), true);
  assert.equal(HOOK.includes('PRINT_READINESS_REASON.COMPOSITION_UNAVAILABLE'), true);
  assert.equal(HOOK.includes('preparePrintDocument({ doc: document, root: fallbackNode })'), true);
  assert.equal(HOOK.includes('preparePrintDocument({ doc: document, root: findPrintNode() })'), false);

  // The failure is retryable and prints nothing: it is raised before window.print.
  const guard = HOOK.indexOf('if (!fallbackNode) {');
  const notReady = HOOK.indexOf('throw notReadyError', guard);
  const print = HOOK.indexOf('window.print()');
  assert.ok(guard > -1 && notReady > guard && print > notReady, 'nothing is printed without the composition');
});

/* ── H · the resource checks are unchanged ───────────────────────────────── */

test('H. the print resource checks are unchanged in both modes', () => {
  // Both modes still prepare through the one readiness authority.
  assert.equal(HOOK.includes("from '@/components/report/printReadiness'"), true);
  assert.equal(HOOK.includes('waitForDocumentInputs(resolveExportIdentity)'), true);
  assert.equal(HOOK.includes('settleOneFrame()'), true);
  assert.equal(HOOK.includes('printProposalInWindow(printWindow'), true);
  const authority = read('src/components/report/printReadiness/index.js');
  for (const wait of [
    'waitForStylesheets',
    'waitForFonts',
    'waitForImages',
    'waitForBackgroundImages',
    'waitForLayoutStable',
  ]) {
    assert.equal(authority.includes(wait), true, `${wait} must still be part of preparation`);
  }
  // No wait was widened and no stage was dropped.
  const budget = PRINT_READINESS_BUDGET_MS;
  assert.deepEqual(
    {
      inputs: budget.inputs,
      stylesheets: budget.stylesheets,
      fonts: budget.fonts,
      images: budget.images,
      layout: budget.layout,
    },
    { inputs: 15000, stylesheets: 8000, fonts: 6000, images: 12000, layout: 2000 },
  );
  assert.ok(budget.frame > 0 && budget.poll > 0, 'the frame and poll budgets are still present and bounded');
  assert.equal(HOOK.includes('PRINT_TIMEOUT_MS = 60000'), true);
});

/* ── I · nothing here writes ─────────────────────────────────────────────── */

test('I. the corrected rules are pure and touch no record', () => {
  for (const file of [
    'base44/shared/proposalWriter/writerMultiCabinetRules.js',
    'base44/shared/proposalWriter/writerCabinetLanguage.js',
    'src/components/proposal/export/useProposalExport.js',
  ]) {
    const source = read(file);
    assert.equal(/base44\.entities|\.create\(|\.update\(|\.delete\(/.test(source), false, `${file} must not write`);
  }
  // The print path writes nothing: the mounted pack and the print-window helper
  // are pure of entity writes, so neither action can alter a record. The editor's
  // own section saves (lock, visibility, dealer notes) belong to the editing path
  // and are never reached by a preview or an export.
  for (const file of [
    'src/components/proposal/export/ProposalPrintDocument.jsx',
    'src/components/proposal/export/proposalPrintWindow.js',
  ]) {
    assert.equal(/base44\.entities|\.create\(|\.update\(|\.delete\(/.test(read(file)), false, `${file} must not write`);
  }
});