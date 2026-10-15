// proposal-export-only-action.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — Export Proposal PDF is the ONLY document action, and the
// approval of every generated narrative section is a condition of the PDF.
//
// Preview Document was removed from the Proposal Editor. The defect it left
// behind: an ungated read-only print path through which a PDF could be produced
// without the approval gate ever being answered. There is now one action, one
// preparation path, and every gate applies to it.
//
//   A  the export is the one entry point; no preview path, no preview state
//   B  the approval rule withholds the PDF, and names the sections outstanding
//   C  the evidence gate and the composition gate still withhold the PDF
//   D  the real A4 pack is mounted from the proposal's own source data
//   E  the export writes no record, no status and no section of its own
//   F  the application interface is never printed in the pack's place
//   G  the print resource checks are unchanged
//   H  nothing here touches a stored record
//
// BOUNDARY. The decisions live in the print hook (useProposalExport), which
// loads the client SDK chain and cannot be imported here. The hook's own guards
// are therefore asserted where they are written, alongside the pure readiness
// contract it prepares by. Nothing is weakened to make this executable.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PRINT_READINESS_BUDGET_MS } from '../src/components/report/printReadiness/readinessContract.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const countOf = (haystack, needle) => String(haystack).split(needle).length - 1;

const HOOK = read('src/components/proposal/export/useProposalExport.js');
const EDITOR = read('src/pages/ProposalEditor.jsx');
const TOOLBAR = read('src/components/proposal/ProposalWorkspaceToolbar.jsx');
const GATE = read('src/components/proposal/editor/useProposalReviewGate.js');
const APPROVAL_DIALOG = read('src/components/proposal/editor/ProposalApprovalRequiredDialog.jsx');

/* ── A · one document action ─────────────────────────────────────────────── */

test('A. the export is the only document action, with no preview path', () => {
  assert.equal(HOOK.includes('handlePreview'), false, 'no preview entry point');
  assert.equal(HOOK.includes('previewing'), false, 'no preview state');
  assert.equal(HOOK.includes('PREVIEW_MODE'), false, 'no second mode to print in');
  assert.equal(HOOK.includes('Preview Document'), false, 'no preview action');
  assert.equal(HOOK.includes('const handleExport = useCallback(() => runPrint(), [runPrint]);'), true);
  assert.equal(countOf(HOOK, 'const runPrint = useCallback('), 1, 'one preparation path');

  // The editor offers that one action and no preview handler.
  assert.equal(EDITOR.includes('handlePreview'), false);
  assert.equal(EDITOR.includes('onPreview='), false);
  assert.equal(EDITOR.includes('Preview Document'), false);

  // The toolbar carries Client Brief and Export Proposal PDF, and nothing else.
  assert.equal(TOOLBAR.includes('Export Proposal PDF'), true);
  assert.equal(TOOLBAR.includes('Preview Document'), false);
  assert.equal(TOOLBAR.includes('onPreview'), false);
  assert.equal(TOOLBAR.includes('Eye'), false, 'the preview icon went with the action');

  // The mode authority that carried the ungated read-only action is gone with it.
  assert.equal(
    fs.existsSync(path.join(ROOT, 'src/components/proposal/export/proposalExportMode.js')),
    false,
    'there is no second mode to print in',
  );
});

/* ── B · approval is a condition of the PDF ──────────────────────────────── */

test('B. the approval of every generated section is a condition of the PDF', () => {
  // The pure rule the hook decides by, and the fact that the hook applies it.
  assert.equal(HOOK.includes('if (approvalBlockReason) return approvalBlockReason;'), true);
  assert.equal(EDITOR.includes('approvalBlockReason,'), true, 'the editor states the rule to the export');
  // The export click is routed to the blocker rather than failing quietly.
  assert.equal(GATE.includes('approvalPending'), true, 'the gate answers the approval rule first');
  assert.equal(GATE.includes('showApprovalDialog'), true);
  assert.equal(EDITOR.includes('approval={approval}'), true);
  // The blocker states the rule, lists the outstanding sections as Needs review,
  // and offers the way to them. No approve-all exists.
  assert.equal(APPROVAL_DIALOG.includes('This proposal still contains sections that have not been approved.'), true);
  assert.equal(APPROVAL_DIALOG.includes('Review next section'), true);
  assert.equal(APPROVAL_DIALOG.includes('Cancel'), true);
  assert.equal(APPROVAL_DIALOG.includes('data-approval-cancel'), true);
  // Each outstanding section is stated as Needs review, from the shared label
  // authority rather than a second vocabulary written into the dialog.
  const APPROVAL_PRESENTATION = read('src/components/proposal/editor/sectionApprovalPresentation.js');
  assert.equal(APPROVAL_PRESENTATION.includes("'Needs review'"), true);
  assert.equal(APPROVAL_PRESENTATION.includes("'Approved'"), true);
  // No Approve All: the blocker offers exactly two controls — Review next section
  // and Cancel — so approval can never be given in bulk.
  assert.equal(countOf(APPROVAL_DIALOG, '<button'), 2, 'two controls, one of them Cancel');
  assert.equal(countOf(APPROVAL_DIALOG, 'Review next section'), 1);
  assert.equal(/[Aa]pprove [Aa]ll</.test(APPROVAL_DIALOG), false, 'no bulk approval control');
});

/* ── C · the other gates still withhold the PDF ──────────────────────────── */

test('C. the evidence gate and the composition gate still withhold the PDF', () => {
  assert.equal(HOOK.includes('if (issueBlockReason) return issueBlockReason;'), true,
    'an unreviewed copy still withholds the export');
  assert.equal(HOOK.includes('if (comparisonBlockReason) return comparisonBlockReason;'), true,
    'without its frozen evidence there is nothing to compose');
  assert.equal(HOOK.includes('if (!validation?.valid) {'), true,
    'the complete-document gate is applied unconditionally');
  assert.equal(
    HOOK.includes('This proposal could not be loaded. Reopen it from the Proposal Centre and try again.'),
    true,
  );
  assert.equal(HOOK.includes("if (proposal.status === 'generating')"), true);
  assert.equal(HOOK.includes('This proposal has no sections yet, so there is nothing to export.'), true);
  assert.equal(HOOK.includes('equipmentQuantityMessage(unresolved)'), true,
    'an unresolved equipment quantity still stops the document');
});

/* ── D · the composition is mounted from its own source data ─────────────── */

test('D. the real A4 composition is mounted from its own source data', () => {
  assert.equal(
    HOOK.includes('export function canMountPrintComposition({ proposal = null, sections = [] } = {}) {'),
    true,
  );
  assert.equal(HOOK.includes('return Boolean(proposal?.id)'), true, 'without the proposal there is nothing to mount');
  assert.equal(HOOK.includes('.some((section) => section?.is_enabled !== false);'), true,
    'a proposal with no enabled section is not mounted');

  assert.equal(EDITOR.includes('canMountPrintComposition({ proposal, sections: documentSections })'), true);
  assert.equal(EDITOR.includes('currentDocumentLayer?.document_validation?.valid && <ProposalPrintDocument'), false);
  assert.equal(countOf(EDITOR, '<ProposalPrintDocument'), 1, 'one composition, one mount site');
  const printDocument = read('src/components/proposal/export/ProposalPrintDocument.jsx');
  assert.equal(printDocument.includes('<ProposalPackDocument {...props} />'), true);
});

/* ── E · the export writes nothing of its own ────────────────────────────── */

test('E. the export writes no record, no status and no section of its own', () => {
  for (const write of ['base44.entities.', 'transitionProposalStatus', 'persistProposalSectionEdit', 'appendProposalEdit']) {
    assert.equal(HOOK.includes(write), false, `the export path must not call ${write}`);
  }
  assert.equal(countOf(HOOK, 'base44.functions.invoke('), 1, 'one server call: the read-only copy layer');
  // The issued copy is stored only behind that decision, and only when the export
  // carries an issued document.
  assert.equal(HOOK.includes('const shouldRecordIssued = Boolean(issuedDocument?.documentType);'), true);
  const guarded = HOOK.indexOf('if (isCurrent() && shouldRecordIssued) {');
  const write = HOOK.indexOf('recordIssuedExportInBackground({');
  assert.ok(guarded > -1 && write > guarded, 'the only issued-copy write is behind that decision');
});

/* ── F · never print the app interface ───────────────────────────────────── */

test('F. the application interface is never printed in the pack\'s place', () => {
  assert.equal(HOOK.includes('const fallbackNode = findPrintNode();'), true);
  assert.equal(HOOK.includes('if (!fallbackNode) {'), true);
  assert.equal(HOOK.includes('PRINT_READINESS_REASON.COMPOSITION_UNAVAILABLE'), true);
  // The failure is retryable and prints nothing: it is raised before window.print.
  const guard = HOOK.indexOf('if (!fallbackNode) {');
  const notReady = HOOK.indexOf('throw notReadyError', guard);
  const print = HOOK.indexOf('window.print()');
  assert.ok(guard > -1 && notReady > guard && print > notReady, 'nothing is printed without the composition');
});

/* ── G · the resource checks are unchanged ───────────────────────────────── */

test('G. the print resource checks are unchanged', () => {
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

/* ── H · nothing here writes ─────────────────────────────────────────────── */

test('H. the export path touches no stored record', () => {
  for (const file of [
    'base44/shared/proposalWriter/writerMultiCabinetRules.js',
    'base44/shared/proposalWriter/writerCabinetLanguage.js',
    'src/components/proposal/export/useProposalExport.js',
  ]) {
    const source = read(file);
    assert.equal(/base44\.entities|\.create\(|\.update\(|\.delete\(/.test(source), false, `${file} must not write`);
  }
  // The print path writes nothing either: the mounted pack and the print-window
  // helper are pure of entity writes, so the export cannot alter a record. The
  // editor's own section saves (lock, visibility, dealer notes) belong to the
  // editing path and are never reached by an export.
  for (const file of [
    'src/components/proposal/export/ProposalPrintDocument.jsx',
    'src/components/proposal/export/proposalPrintWindow.js',
  ]) {
    assert.equal(/base44\.entities|\.create\(|\.update\(|\.delete\(/.test(read(file)), false, `${file} must not write`);
  }
});