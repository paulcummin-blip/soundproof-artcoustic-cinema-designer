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
import {
  canMountPrintComposition,
  resolveProposalExportReadiness,
} from '../src/components/proposal/export/useProposalExport.js';
import { PRINT_READINESS_BUDGET_MS } from '../src/components/report/printReadiness/readinessContract.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const countOf = (haystack, needle) => String(haystack).split(needle).length - 1;

const EDITOR = read('src/pages/ProposalEditor.jsx');
const HOOK = read('src/components/proposal/export/useProposalExport.js');

const PROPOSAL = { id: 'proposal-1', status: 'generated', proposal_type: 'system_summary' };
const SECTIONS = [
  { id: 's1', section_type: 'system_design_summary', body: '<p>Written.</p>', is_enabled: true },
  { id: 's2', section_type: 'appendix', body: '<p>Written.</p>', is_enabled: true },
];
/** What the copy layer reports when the copy still needs editorial review. */
const NEEDS_REVIEW = 'Dynamic Range: the centre-channel description needs reviewing.';

/* ── A and B · the two actions do not share one rule ──────────────────────── */

test('A. preview opens for a document that still needs editorial review', () => {
  const readiness = resolveProposalExportReadiness({
    proposal: PROPOSAL,
    sections: SECTIONS,
    issueBlockReason: NEEDS_REVIEW,
    mode: PREVIEW_MODE,
  });
  assert.equal(readiness, null, 'a genuine editorial problem never withholds the preview');
  assert.equal(requiresIssueGate(PREVIEW_MODE), false);
  // The layer is still asked, read-only, so access control is unchanged: a login
  // that may not open the proposal is refused by the server, in both modes.
  assert.equal(HOOK.includes("base44.functions.invoke('readProposalEditLayer'"), true);
  assert.equal(HOOK.includes('readLayerAction(mode)'), true);
});

test('B. export is withheld by the same editorial block', () => {
  const readiness = resolveProposalExportReadiness({
    proposal: PROPOSAL,
    sections: SECTIONS,
    issueBlockReason: NEEDS_REVIEW,
    mode: EXPORT_MODE,
  });
  assert.equal(readiness, NEEDS_REVIEW);
  assert.equal(requiresIssueGate(EXPORT_MODE), true);
  // The editor states that block as an issue gate, and shows it to the designer.
  assert.equal(EDITOR.includes('issueBlockReason: editLayerBlockReason'), true);
  assert.equal(EDITOR.includes('comparisonBlockReason || exportBlockedReason || editLayerBlockReason'), true);
});

/* ── C · what must still withhold both ────────────────────────────────────── */

test('C. a document that cannot be composed is withheld in both modes', () => {
  const reasons = ['Comparison evidence requires regeneration.', 'Reading frozen comparison evidence for both versions…'];
  for (const comparisonBlockReason of reasons) {
    for (const mode of [PREVIEW_MODE, EXPORT_MODE]) {
      assert.equal(
        resolveProposalExportReadiness({ proposal: PROPOSAL, sections: SECTIONS, comparisonBlockReason, mode }),
        comparisonBlockReason,
        `${mode} must be withheld without its evidence`,
      );
    }
  }
  for (const mode of [PREVIEW_MODE, EXPORT_MODE]) {
    assert.match(resolveProposalExportReadiness({ proposal: null, sections: SECTIONS, mode }), /could not be loaded/);
    assert.match(resolveProposalExportReadiness({ proposal: PROPOSAL, sections: [], mode }), /no sections yet/);
    assert.match(
      resolveProposalExportReadiness({ proposal: PROPOSAL, sections: [{ is_enabled: false, body: '<p>x</p>' }], mode }),
      /no sections yet/,
    );
  }
});

/* ── D · the composition is mounted for both actions ─────────────────────── */

test('D. the real A4 composition is mounted from its own source data', () => {
  assert.equal(canMountPrintComposition({ proposal: PROPOSAL, sections: SECTIONS }), true);
  assert.equal(canMountPrintComposition({ proposal: PROPOSAL, sections: [{ is_enabled: false }] }), false);
  assert.equal(canMountPrintComposition({ proposal: null, sections: SECTIONS }), false);
  assert.equal(canMountPrintComposition(), false);

  // The editor mounts that one composition for both actions, and no longer gates
  // it on the complete-document verdict.
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
  assert.equal(HOOK.includes("'The complete proposal must pass validation before export.'"), true);
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
  // No timeout was widened and no stage was dropped.
  assert.deepEqual(PRINT_READINESS_BUDGET_MS, {
    inputs: 15000, stylesheets: 8000, fonts: 6000, images: 12000, layout: 2000, frame: 1000, poll: 50,
  });
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
  // The proposal's own records are read through the model, never rewritten by the
  // preview: the editor's load path is a read.
  assert.equal(/base44\.entities\.ProposalSection\.update/.test(EDITOR), false);
});