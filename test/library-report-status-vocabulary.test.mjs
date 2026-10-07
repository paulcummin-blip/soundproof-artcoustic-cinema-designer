// library-report-status-vocabulary.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Project Library's three user-facing report states and the
// actions each one offers.
//
//   A  Current report      Current · Open · Export PDF, and no refresh action
//   B  Design changed      Update needed · Open saved report · Create updated report
//   C  Issued PDF current  Issued PDF · Open · Download
//   D  Issued PDF changed  Issued PDF — older than current design · Open · Download
//   E  Exporting a PDF never stales the report
//   F  Opening a report never stales it
//   G  Generating a proposal never stales it
//   H  Duplicate saved reports list ONE live report: the canonical current one
//
// A row's state is the version's proposal-readiness cell — the same authority
// the banner and the Proposal Centre read — so the Library can never show
// Current on a report a proposal may not use. The state is derived, never
// stored: nothing the designer does to the document — export, open, propose — is
// allowed to move it.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  EXPORT_DESIGN_CHANGED_NOTE,
  EXPORT_SOURCE_CHANGED_LABEL,
  ISSUED_PDF_LABEL,
  ISSUED_PDFS_HELPER,
  LIVE_REPORT_DESIGN_CHANGED_NOTE,
  LIVE_REPORT_STATE,
  LIVE_REPORT_STATE_LABEL,
  LIVE_REPORT_UPDATE_NEEDED_NOTE,
  REPORT_ROW_ACTION,
  collapseLiveReports,
  liveReportNote,
  liveReportStateLabel,
  resolveExportLiveState,
  resolveLiveReportState,
  selectLatestExports,
} from '../src/components/library/librarySourceStatus.js';
import {
  READINESS_STATE,
  buildReadinessCell,
} from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const VOCABULARY = read('src/components/library/librarySourceStatus.js');
const LIVE_ROW = read('src/components/library/LiveReportRow.jsx');
const REPORTS_SECTION = read('src/components/library/ProjectLibraryReportsSection.jsx');
const LIBRARY_HOOK = read('src/components/library/useProjectLibraryAssets.js');
const ACTION_INTENT = read('src/components/report/reportActionIntent.js');

const VERSION = {
  id: 'version-4',
  published_fingerprint: 'ENG-1',
};

/** One readiness cell, as the Proposal Centre builds it. */
const cell = (state) => buildReadinessCell({ state });

const issuedPdf = ({ engineering = 'ENG-1', exportedAt = '2026-10-03T10:00:00.000Z' } = {}) => ({
  id: 'export-1',
  document_type: 'technical',
  version_id: 'version-4',
  selected_version_ids: ['version-4'],
  exported_at: exportedAt,
  source_fingerprints: {
    engineeringFingerprint: engineering,
    calculationFingerprint: `CALC-${engineering}`,
    seatPriorityFingerprint: 'SEATS-1',
  },
  source_status_at_export: 'current',
});

const savedReport = ({ status = 'current', generatedAt = '2026-10-02T09:00:00.000Z', engineering = 'ENG-1' } = {}) => ({
  id: 'snap-1',
  project_id: 'project-1',
  version_id: 'version-4',
  report_type: 'technical',
  report_schema_version: 1,
  generated_at: generatedAt,
  status,
  source_fingerprints: {
    engineeringFingerprint: engineering,
    calculationFingerprint: `CALC-${engineering}`,
    seatPriorityFingerprint: 'SEATS-1',
  },
  payload: { engineeringFingerprint: engineering },
});

/** The action lines a row renders, in source order. */
const actionOrder = () => [
  ['OPEN', LIVE_ROW.indexOf('REPORT_ROW_ACTION.OPEN')],
  ['EXPORT_PDF', LIVE_ROW.indexOf('REPORT_ROW_ACTION.EXPORT_PDF')],
  ['OPEN_SAVED', LIVE_ROW.indexOf('REPORT_ROW_ACTION.OPEN_SAVED')],
  ['CREATE_UPDATED', LIVE_ROW.indexOf('REPORT_ROW_ACTION.CREATE_UPDATED')],
];

/* ── A — a Current report ─────────────────────────────────────────────────── */

test('A — a Current report offers Open and Export PDF, and no refresh action', () => {
  const ready = { cell: cell(READINESS_STATE.CURRENT), hasReport: true };
  const state = resolveLiveReportState(ready);
  assert.equal(state, LIVE_REPORT_STATE.CURRENT);
  assert.equal(liveReportStateLabel(state), 'Current');
  assert.equal(liveReportStateLabel(state), LIVE_REPORT_STATE_LABEL[LIVE_REPORT_STATE.CURRENT]);
  assert.equal(liveReportNote(ready), null, 'a Current report carries no note');

  const actions = Object.fromEntries(actionOrder());
  assert.ok(actions.OPEN > -1, 'the row offers Open');
  assert.ok(actions.EXPORT_PDF > -1, 'the row offers Export PDF');
  assert.equal(REPORT_ROW_ACTION.OPEN, 'Open');
  assert.equal(REPORT_ROW_ACTION.EXPORT_PDF, 'Export PDF');

  // The Current branch is the one that ends before the update-needed branch, so
  // neither refresh action can ever sit on a Current report.
  const currentBranch = LIVE_ROW.slice(LIVE_ROW.indexOf('{hasReport && !updateNeeded && ('));
  assert.doesNotMatch(currentBranch, /CREATE_UPDATED|OPEN_SAVED|Regenerate/i);

  // No surface in the vocabulary carries internal wording. The check is on the
  // words the Library actually renders.
  const rowLabels = [
    liveReportStateLabel(LIVE_REPORT_STATE.CURRENT),
    liveReportStateLabel(LIVE_REPORT_STATE.UPDATE_NEEDED),
    liveReportStateLabel(LIVE_REPORT_STATE.MISSING),
    ISSUED_PDF_LABEL,
    EXPORT_SOURCE_CHANGED_LABEL,
    EXPORT_DESIGN_CHANGED_NOTE,
    ISSUED_PDFS_HELPER,
    LIVE_REPORT_DESIGN_CHANGED_NOTE,
    LIVE_REPORT_UPDATE_NEEDED_NOTE,
    ...Object.values(REPORT_ROW_ACTION),
    resolveExportLiveState({ record: issuedPdf(), version: VERSION }).label,
    resolveExportLiveState({ record: issuedPdf({ engineering: 'ENG-0' }), version: VERSION }).label,
    resolveExportLiveState({ record: issuedPdf(), version: null }).label,
    resolveExportLiveState({ record: issuedPdf(), version: VERSION, superseded: true }).label,
  ].filter(Boolean);
  const vocabularySurface = rowLabels.join(' | ');

  assert.doesNotMatch(vocabularySurface, /Regenerate/);
  assert.doesNotMatch(vocabularySurface, /Previous report|Older export|Source changed since export/);
  assert.doesNotMatch(vocabularySurface, /stale|legacy|incomplete|evidence|fingerprint|publication/i);

  // An issued PDF states what it IS, whatever state its source is in: it never
  // borrows the report vocabulary.
  assert.equal(
    resolveExportLiveState({ record: issuedPdf(), version: VERSION }).label,
    ISSUED_PDF_LABEL,
  );
  assert.equal(
    resolveExportLiveState({ record: issuedPdf({ engineering: 'ENG-0' }), version: VERSION }).label,
    EXPORT_SOURCE_CHANGED_LABEL,
  );
  assert.equal(
    resolveExportLiveState({ record: issuedPdf(), version: null }).label,
    ISSUED_PDF_LABEL,
  );
});

/* ── B — the design changed ───────────────────────────────────────────────── */

test('B — a report the design moved past reads Update needed, and offers an updated report', () => {
  const moved = { cell: cell(READINESS_STATE.STALE), hasReport: true };
  const state = resolveLiveReportState(moved);
  assert.equal(state, LIVE_REPORT_STATE.UPDATE_NEEDED);
  assert.equal(liveReportStateLabel(state), 'Update needed');
  assert.equal(LIVE_REPORT_STATE_LABEL[LIVE_REPORT_STATE.UPDATE_NEEDED], 'Update needed');
  assert.equal(LIVE_REPORT_DESIGN_CHANGED_NOTE, 'Design changed since this report was created.');
  assert.equal(liveReportNote(moved), LIVE_REPORT_DESIGN_CHANGED_NOTE);

  // A report that must be recreated before a proposal may read it reads the same
  // state, with its own plain line — never an internal name.
  const refresh = { cell: cell(READINESS_STATE.LEGACY), hasReport: true };
  assert.equal(resolveLiveReportState(refresh), LIVE_REPORT_STATE.UPDATE_NEEDED);
  assert.equal(liveReportNote(refresh), LIVE_REPORT_UPDATE_NEEDED_NOTE);
  assert.equal(LIVE_REPORT_UPDATE_NEEDED_NOTE, 'This report needs updating before a proposal can use it.');
  assert.equal(
    resolveLiveReportState({ cell: cell(READINESS_STATE.INCOMPLETE), hasReport: true }),
    LIVE_REPORT_STATE.UPDATE_NEEDED,
  );

  const actions = Object.fromEntries(actionOrder());
  assert.ok(actions.OPEN_SAVED > -1, 'the row offers Open saved report');
  assert.ok(actions.CREATE_UPDATED > -1, 'the row offers Create updated report');
  assert.equal(REPORT_ROW_ACTION.OPEN_SAVED, 'Open saved report');
  assert.equal(REPORT_ROW_ACTION.CREATE_UPDATED, 'Create updated report');

  const updateBranch = LIVE_ROW.slice(
    LIVE_ROW.indexOf('{hasReport && updateNeeded && ('),
    LIVE_ROW.indexOf('{hasReport && !updateNeeded && ('),
  );
  assert.match(updateBranch, /REPORT_ROW_ACTION\.OPEN_SAVED/);
  assert.match(updateBranch, /REPORT_ROW_ACTION\.CREATE_UPDATED/);
  assert.doesNotMatch(LIVE_ROW, /Regenerate/i);

  // The Library renders the plain line such a row carries, supplied by the
  // vocabulary and never written inline in the row.
  assert.match(LIVE_ROW, /\{note &&/);
});

/* ── C — an issued PDF that matches ───────────────────────────────────────── */

test('C — an issued PDF that still matches the design reads Issued PDF', () => {
  const live = savedReport({ status: 'current' });
  const matched = resolveExportLiveState({
    record: issuedPdf(),
    version: VERSION,
    liveReport: { generatedAt: live.generated_at, sourceFingerprints: live.source_fingerprints },
  });
  assert.equal(matched.label, ISSUED_PDF_LABEL);
  assert.equal(matched.label, 'Issued PDF');

  // With no live report to compare against, the pointer decides — and the export
  // still reads as an issued PDF, never as a live report.
  const withoutLive = resolveExportLiveState({ record: issuedPdf(), version: VERSION, liveReport: null });
  assert.equal(withoutLive.label, ISSUED_PDF_LABEL);
});

/* ── D — an issued PDF after the design changed ───────────────────────────── */

test('D — an issued PDF after a design change says so, and is never regenerated', () => {
  const live = savedReport({ status: 'current', generatedAt: '2026-10-05T09:00:00.000Z', engineering: 'ENG-2' });
  const changed = resolveExportLiveState({
    record: issuedPdf(),
    version: VERSION,
    liveReport: { generatedAt: live.generated_at, sourceFingerprints: live.source_fingerprints },
  });
  assert.equal(changed.label, EXPORT_SOURCE_CHANGED_LABEL);
  assert.equal(changed.label, 'Issued PDF — older than current design');
  assert.equal(
    EXPORT_DESIGN_CHANGED_NOTE,
    'This PDF is still available, but it was issued before the latest report update.',
  );

  // The version's published pointer moved on with no live report to compare to.
  const movedPointer = resolveExportLiveState({
    record: issuedPdf(),
    version: { id: 'version-4', published_fingerprint: 'ENG-2' },
    liveReport: null,
  });
  assert.equal(movedPointer.label, EXPORT_SOURCE_CHANGED_LABEL);

  // An issued PDF is only ever opened or downloaded.
  assert.deepEqual(
    [REPORT_ROW_ACTION.OPEN, REPORT_ROW_ACTION.EXPORT_PDF, REPORT_ROW_ACTION.OPEN_SAVED],
    ['Open', 'Export PDF', 'Open saved report'],
  );
  assert.doesNotMatch(EXPORT_SOURCE_CHANGED_LABEL, /regenerate/i);
});

/* ── E, F, G — nothing the designer does to a document moves its status ──── */

test('E, F, G — export, open and proposal paths never write a report status', () => {
  // The Library's status is derivation only: no entity access, no writes.
  assert.doesNotMatch(VOCABULARY, /base44|entities\.|\.update\(|\.create\(/);
  assert.match(LIBRARY_HOOK, /ReportSnapshot\.filter/, 'the Library only READS saved reports');
  assert.doesNotMatch(LIBRARY_HOOK, /ReportSnapshot\.(update|create|bulkUpdate|delete)/);

  // Exporting stores a fixed PDF asset and touches nothing else.
  const exportPath = read('src/components/library/issuedDocument/recordIssuedExport.js');
  assert.match(exportPath, /ProjectAssetExport/);
  assert.doesNotMatch(exportPath, /ReportSnapshot\.(update|create|bulkUpdate|delete)/);
  assert.doesNotMatch(read('src/components/library/issuedDocument/issuedDocumentActions.js'), /ReportSnapshot/);

  // Opening a report is navigation; the intent it carries writes no status.
  assert.doesNotMatch(REPORTS_SECTION, /ReportSnapshot/);
  assert.doesNotMatch(ACTION_INTENT, /ReportSnapshot/);

  // Generating a proposal reads the saved reports and writes only the proposal.
  const proposal = read('base44/functions/generateProposal/entry.ts');
  assert.match(proposal, /ReportSnapshot\.filter/);
  assert.doesNotMatch(proposal, /ReportSnapshot\.(update|create|bulkUpdate|delete)/);

  // The only writer of a saved report is the report snapshot store itself.
  const writes = ['src/components/library/LiveReportRow.jsx', 'src/components/library/ExportedDocumentRow.jsx']
    .filter((path) => /ReportSnapshot/.test(read(path)));
  assert.deepEqual(writes, [], 'no Library row writes a saved report');
});

/* ── H — duplicates list one canonical report ─────────────────────────────── */

test('H — several saved reports for one version and type list ONE live report', () => {
  const rows = collapseLiveReports([
    savedReport({ generatedAt: '2026-10-02T09:00:00.000Z' }),
    { ...savedReport({ generatedAt: '2026-10-05T09:00:00.000Z' }), id: 'snap-2' },
    { ...savedReport({ generatedAt: '2026-10-01T09:00:00.000Z' }), id: 'snap-3' },
    { ...savedReport({ generatedAt: '2026-10-09T09:00:00.000Z' }), id: 'snap-visual', report_type: 'visual' },
  ]);

  assert.equal(rows.filter((row) => row.report_type === 'technical').length, 1, 'one technical row');
  assert.equal(rows.filter((row) => row.report_type === 'visual').length, 1, 'one visual row');
  assert.equal(rows.find((row) => row.report_type === 'technical').id, 'snap-2', 'the newest generation');

  // The hook lists exactly what collapseLiveReports returns — collapsed by the ONE
  // canonical rule, told which authority each version holds now.
  assert.match(LIBRARY_HOOK, /collapseLiveReports\(savedReports, \{[\s\S]{0,80}currentFingerprintByVersion: publishedFingerprintByVersionId/);

  // And one issued PDF per version and report type, however often it was exported.
  const kept = selectLatestExports([
    { record: issuedPdf({ exportedAt: '2026-10-02T10:00:00.000Z' }) },
    { record: { ...issuedPdf({ exportedAt: '2026-10-04T10:00:00.000Z' }), id: 'export-2' } },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].record.id, 'export-2');
});