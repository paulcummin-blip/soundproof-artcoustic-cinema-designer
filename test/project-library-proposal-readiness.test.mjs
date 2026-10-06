// project-library-proposal-readiness.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Project Library's proposal readiness banner.
//
//   A  all reports current        Ready for Proposal · Create Proposal · no update action
//   B  the design has changed     Update reports before creating a proposal, naming the
//                                 version and the report · Update required reports
//   C  current reports + old PDFs the PDFs are history, and block nothing
//   D  readiness source           the banner's verdict IS the Proposal Centre contract
//   E  user wording               no internal diagnostic word reaches the Library
//
// The banner answers one question — can I go to Proposal now? — and it does so
// from the readiness authority the Proposal Centre already gates generation with,
// never from a second opinion derived in the Library. Its words are the dealer's
// words: ready, reports to update, or assessment still to complete.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LIBRARY_CHECKLIST_STATUS,
  LIBRARY_NOT_ASSESSED_DETAIL,
  LIBRARY_READINESS_ACTION,
  LIBRARY_READINESS_HEADLINE,
  LIBRARY_READY_DETAIL,
  LIBRARY_UPDATES_NEEDED_DETAIL,
  LIBRARY_VERDICT,
  buildLibraryProposalReadiness,
} from '../src/components/library/libraryProposalReadiness.js';
import {
  READINESS_STATE,
  buildReadinessCell,
  resolveProposalReadinessGate,
  resolveVersionReadinessRow,
} from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';
import {
  EXPORT_DESIGN_CHANGED_NOTE,
  EXPORT_SOURCE_CHANGED_LABEL,
  ISSUED_PDFS_HELPER,
  ISSUED_PDF_LABEL,
  liveReportNote,
  liveReportStateLabel,
  resolveExportLiveState,
  resolveLiveReportState,
} from '../src/components/library/librarySourceStatus.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const READINESS = read('src/components/library/libraryProposalReadiness.js');
const READINESS_HOOK = read('src/components/library/useLibraryProposalReadiness.js');
const BANNER = read('src/components/library/LibraryProposalReadinessBanner.jsx');
const SECTION = read('src/components/library/ProjectLibraryReportsSection.jsx');

const VERSIONS = [
  { id: 'v4', version_name: 'Level 4 version', version_number: 4 },
  { id: 'v1', version_name: 'Level 1 version', version_number: 1 },
];

const versionsWith = () => VERSIONS.map((version) => ({ ...version }));

const cell = (state) => buildReadinessCell({ state });

const versionRow = ({
  id,
  name,
  visual = READINESS_STATE.CURRENT,
  technical = READINESS_STATE.CURRENT,
  engineering = READINESS_STATE.CURRENT,
}) => resolveVersionReadinessRow({
  versionId: id,
  versionName: name,
  cells: { visual: cell(visual), technical: cell(technical), engineering: cell(engineering) },
});

const allCurrentRows = () => [
  versionRow({ id: 'v4', name: 'Level 4 version' }),
  versionRow({ id: 'v1', name: 'Level 1 version' }),
];

const readinessFor = (rows, versions = versionsWith()) => buildLibraryProposalReadiness({
  rows,
  loading: false,
  versions,
});

/** The words one compact-list cell reads as, e.g. "Technical Report: Not generated". */
const cellWords = (entry) => entry.cells.filter((item) => item.status)
  .map((item) => `${item.label}: ${item.status}`);

// ── A ───────────────────────────────────────────────────────────────────────

test('A — every report current: Ready for Proposal, and no update action', () => {
  const readiness = readinessFor(allCurrentRows());

  assert.equal(readiness.ready, true);
  assert.equal(readiness.verdict, LIBRARY_VERDICT.READY);
  assert.equal(readiness.headline, 'Ready for Proposal');
  assert.equal(readiness.headline, LIBRARY_READINESS_HEADLINE.READY);
  assert.equal(readiness.detail, 'The current Visual and Technical Reports are ready for proposal creation.');
  assert.equal(readiness.detail, LIBRARY_READY_DETAIL);

  assert.equal(readiness.primaryAction.label, 'Create Proposal');
  assert.equal(readiness.primaryAction.kind, 'create-proposal');
  assert.equal(readiness.secondaryAction.label, 'View Proposal Centre');
  assert.equal(readiness.secondaryAction.kind, 'proposal-centre');

  // No update action exists on a project whose reports are all current.
  const offered = [readiness.primaryAction.label, readiness.secondaryAction.label];
  assert.ok(!offered.includes(LIBRARY_READINESS_ACTION.UPDATE_REQUIRED));
  assert.ok(!offered.includes(LIBRARY_READINESS_ACTION.OPEN_ROOM_DESIGNER));
  assert.equal(readiness.showChecklist, false);

  // Every version states its own line, and every report reads Ready.
  assert.deepEqual(
    readiness.checklist.map((entry) => entry.line),
    ['Ready for Proposal', 'Ready for Proposal'],
  );
  assert.deepEqual(
    [...new Set(readiness.checklist.flatMap(cellWords))],
    ['Visual Report: Ready', 'Technical Report: Ready'],
  );
});

// ── B ───────────────────────────────────────────────────────────────────────

test('B — the design changed: update the reports, naming the version and the report', () => {
  const readiness = readinessFor([
    versionRow({ id: 'v4', name: 'Level 4 version' }),
    versionRow({ id: 'v1', name: 'Level 1 version', technical: READINESS_STATE.STALE }),
  ]);

  assert.equal(readiness.ready, false);
  assert.equal(readiness.verdict, LIBRARY_VERDICT.UPDATES_NEEDED);
  assert.equal(readiness.headline, 'Update reports before creating a proposal');
  assert.equal(
    readiness.detail,
    'The design has changed since one or more reports were created. Create updated reports before preparing the proposal.',
  );
  assert.equal(readiness.detail, LIBRARY_UPDATES_NEEDED_DETAIL);

  // ONE action unblocks exactly what was named, aimed at the first report in the way.
  assert.equal(readiness.primaryAction.label, 'Update required reports');
  assert.equal(readiness.primaryAction.kind, 'update');
  assert.equal(readiness.primaryAction.reportType, 'technical');
  assert.equal(readiness.primaryAction.versionId, 'v1');
  assert.notEqual(readiness.primaryAction.label, 'Create Proposal');
  assert.equal(readiness.secondaryAction.label, 'View reports');
  assert.equal(readiness.secondaryAction.kind, 'view-reports');

  // The compact list states each version and each report in the same three words.
  assert.equal(readiness.showChecklist, true);
  const lines = Object.fromEntries(readiness.checklist.map((entry) => [entry.versionId, entry]));
  assert.deepEqual(lines.v1, {
    versionId: 'v1',
    versionName: 'Level 1 version',
    ready: false,
    line: 'Update needed',
    cells: [
      { source: 'visual', label: 'Visual Report', status: 'Ready' },
      { source: 'technical', label: 'Technical Report', status: 'Update needed' },
    ],
  });
  assert.deepEqual(cellWords(lines.v4), ['Visual Report: Ready', 'Technical Report: Ready']);
  assert.equal(lines.v4.line, 'Ready for Proposal');
  assert.equal(lines.v4.ready, true);

  // Every report state other than Current reads Update needed; only a report that
  // does not exist reads Not generated.
  const many = readinessFor([
    versionRow({ id: 'v4', name: 'Level 4 version', visual: READINESS_STATE.STALE, technical: READINESS_STATE.LEGACY }),
    versionRow({ id: 'v1', name: 'Level 1 version', visual: READINESS_STATE.INCOMPLETE, technical: READINESS_STATE.MISSING }),
  ]);
  assert.equal(many.verdict, LIBRARY_VERDICT.UPDATES_NEEDED);
  assert.deepEqual(cellWords(many.checklist[0]), ['Visual Report: Update needed', 'Technical Report: Update needed']);
  assert.deepEqual(cellWords(many.checklist[1]), ['Visual Report: Update needed', 'Technical Report: Not generated']);
  assert.equal(LIBRARY_CHECKLIST_STATUS.READY, 'Ready');
  assert.equal(LIBRARY_CHECKLIST_STATUS.UPDATE_NEEDED, 'Update needed');
  assert.equal(LIBRARY_CHECKLIST_STATUS.NOT_GENERATED, 'Not generated');

  // A version that is not assessed at all says so, and sends the designer to the
  // design rather than to a report.
  const unassessed = readinessFor(
    [versionRow({ id: 'v1', name: 'Level 1 version', engineering: READINESS_STATE.MISSING })],
    [VERSIONS[1]],
  );
  assert.equal(unassessed.ready, false);
  assert.equal(unassessed.verdict, LIBRARY_VERDICT.NOT_ASSESSED);
  assert.equal(unassessed.headline, 'Reports are not ready yet');
  assert.equal(unassessed.detail, LIBRARY_NOT_ASSESSED_DETAIL);
  assert.equal(unassessed.primaryAction.label, 'Open Room Designer');
  assert.equal(unassessed.primaryAction.kind, 'room-designer');
  assert.equal(unassessed.secondaryAction.kind, 'view-reports');
  assert.equal(unassessed.checklist[0].line, 'Not assessed yet');
  assert.deepEqual(cellWords(unassessed.checklist[0]), ['Visual Report: Ready', 'Technical Report: Ready']);
});

// ── C ───────────────────────────────────────────────────────────────────────

test('C — current reports and old PDFs: the PDFs are history and block nothing', () => {
  const version = { id: 'v1', published_fingerprint: 'ENG-2' };
  const liveReport = {
    id: 'report-1',
    report_type: 'technical',
    version_id: 'v1',
    generated_at: '2026-10-05T10:00:00.000Z',
    status: 'current',
    sourceFingerprints: { engineeringFingerprint: 'ENG-2', calculationFingerprint: 'CALC-1' },
  };
  const issuedPdf = {
    id: 'export-1',
    document_type: 'technical',
    version_id: 'v1',
    selected_version_ids: ['v1'],
    exported_at: '2026-10-03T10:00:00.000Z',
    source_fingerprints: { engineeringFingerprint: 'ENG-1', calculationFingerprint: 'CALC-1' },
  };

  // The report the project holds now is Current, read from its readiness cell…
  const ready = { cell: cell(READINESS_STATE.CURRENT), hasReport: true };
  assert.equal(resolveLiveReportState(ready), 'current');
  assert.equal(liveReportStateLabel('current'), 'Current');
  assert.equal(liveReportNote(ready), null);

  // …while the PDF issued before the latest report says so, in the Library's words.
  const issued = resolveExportLiveState({ record: issuedPdf, version, liveReport });
  assert.equal(issued.label, 'Issued PDF — older than current design');
  assert.equal(issued.label, EXPORT_SOURCE_CHANGED_LABEL);
  assert.notEqual(issued.label, ISSUED_PDF_LABEL);
  assert.notEqual(issued.label, liveReportStateLabel('current'));
  assert.equal(
    EXPORT_DESIGN_CHANGED_NOTE,
    'This PDF is still available, but it was issued before the latest report update.',
  );
  assert.equal(
    ISSUED_PDFS_HELPER,
    'Issued PDFs are fixed exports from the date shown. They remain available for records; proposals use the current reports above.',
  );

  // A PDF is never a blocker: readiness reads the reports, not the exports.
  const readiness = readinessFor([versionRow({ id: 'v1', name: 'Level 1 version' })], [VERSIONS[1]]);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.headline, 'Ready for Proposal');
  assert.deepEqual(
    Object.keys(readiness).sort(),
    ['checking', 'checklist', 'detail', 'headline', 'primaryAction', 'ready', 'secondaryAction', 'showChecklist', 'verdict'],
  );
  assert.doesNotMatch(READINESS, /exported|ProjectAssetExport/, 'the readiness verdict never reads the exported PDFs');
  assert.doesNotMatch(issued.label, /needs updated report/i);

  // The Library says which PDFs are history, and separates them from the reports.
  assert.match(SECTION, /ISSUED_PDFS_HELPER/);
  assert.match(SECTION, /EXPORT_DESIGN_CHANGED_NOTE/);
  assert.match(SECTION, /LIBRARY_SOURCE_STATE\.SOURCE_CHANGED/);
  assert.match(SECTION, /<SectionHeading>Issued PDFs<\/SectionHeading>/);
});

// ── D ───────────────────────────────────────────────────────────────────────

test('D — the banner uses the Proposal Centre readiness contract, never a second opinion', () => {
  // The same rows, judged by the Library's words and by the Proposal Centre gate.
  const readyRows = allCurrentRows();
  const libraryReady = readinessFor(readyRows);
  const centreReady = resolveProposalReadinessGate({ rows: readyRows, loading: false, minVersions: 1 });
  assert.equal(libraryReady.ready, true);
  assert.equal(libraryReady.ready, centreReady.ready);

  const blockedRows = [versionRow({ id: 'v1', name: 'Level 1 version', technical: READINESS_STATE.STALE })];
  const libraryBlocked = readinessFor(blockedRows, [VERSIONS[1]]);
  const centreBlocked = resolveProposalReadinessGate({ rows: blockedRows, loading: false, minVersions: 1 });
  assert.equal(libraryBlocked.ready, false);
  assert.equal(libraryBlocked.ready, centreBlocked.ready);
  assert.equal(libraryBlocked.headline, 'Update reports before creating a proposal');

  // While the read is in flight neither side says Ready, and the banner offers
  // no action it cannot stand behind.
  const checkingRows = [versionRow({ id: 'v1', name: 'Level 1 version', engineering: READINESS_STATE.CHECKING })];
  const libraryChecking = buildLibraryProposalReadiness({
    rows: checkingRows,
    loading: true,
    versions: [VERSIONS[1]],
  });
  const centreChecking = resolveProposalReadinessGate({ rows: checkingRows, loading: true, minVersions: 1 });
  assert.equal(libraryChecking.ready, false);
  assert.equal(libraryChecking.ready, centreChecking.ready);
  assert.equal(libraryChecking.verdict, LIBRARY_VERDICT.CHECKING);
  assert.equal(libraryChecking.headline, null);
  assert.equal(libraryChecking.primaryAction, null);
  assert.equal(libraryChecking.secondaryAction, null);
  // Nothing is claimed per version while the read is still in flight.
  assert.equal(libraryChecking.checklist[0].line, null);
  // A report whose own cell is already known still states it: only the version's
  // verdict is unknown while the read is in flight.
  assert.deepEqual(libraryChecking.checklist[0].cells.map((item) => item.status), ['Ready', 'Ready']);

  // ONE authority: the read is imported, and the verdict is the gate's.
  assert.match(READINESS_HOOK, /useProposalReadiness/);
  assert.match(READINESS, /resolveProposalReadinessGate/);
  assert.doesNotMatch(READINESS, /base44|entities\.|source_fingerprints|reportEvidence/);
  assert.doesNotMatch(READINESS_HOOK, /base44|entities\./);

  // The banner sits above the version sections, and reads the verdict it is given.
  assert.ok(
    SECTION.indexOf('<LibraryProposalReadinessBanner') < SECTION.indexOf('{versions.map((version) => {'),
    'the banner is rendered above the version sections',
  );
  assert.match(SECTION, /useLibraryProposalReadiness/);
  assert.match(BANNER, /readiness\b/);
  assert.doesNotMatch(BANNER, /base44|entities\./, 'the banner derives nothing itself');
});

// ── E ───────────────────────────────────────────────────────────────────────

test('E — no internal diagnostic word reaches the Library', () => {
  const states = [
    readinessFor(allCurrentRows()),
    readinessFor([versionRow({ id: 'v1', name: 'Level 1 version', technical: READINESS_STATE.STALE })]),
    readinessFor([versionRow({ id: 'v1', name: 'Level 1 version', visual: READINESS_STATE.MISSING, technical: READINESS_STATE.MISSING })]),
    readinessFor([versionRow({ id: 'v1', name: 'Level 1 version', technical: READINESS_STATE.LEGACY })]),
    readinessFor([versionRow({ id: 'v1', name: 'Level 1 version', technical: READINESS_STATE.INCOMPLETE })]),
    readinessFor([versionRow({ id: 'v1', name: 'Level 1 version', engineering: READINESS_STATE.MISSING })]),
    readinessFor([versionRow({ id: 'v1', name: 'Level 1 version', engineering: READINESS_STATE.STALE })]),
  ];

  const shown = states.flatMap((readiness) => [
    readiness.headline,
    readiness.detail,
    readiness.primaryAction?.label,
    readiness.secondaryAction?.label,
    ...readiness.checklist.map((entry) => [entry.versionName, entry.line, ...cellWords(entry)]).flat(),
  ]).filter(Boolean).join(' | ');

  assert.ok(shown.length > 0, 'there is wording to check');
  assert.doesNotMatch(
    shown,
    /proposal_ready|reportEvidence|source fingerprint|fingerprint|snapshot|evidence|publication|stale|legacy|incomplete/i,
  );

  // The issued-PDF wording is a Library surface too.
  const pdfSurface = [EXPORT_SOURCE_CHANGED_LABEL, EXPORT_DESIGN_CHANGED_NOTE, ISSUED_PDFS_HELPER, ISSUED_PDF_LABEL].join(' | ');
  assert.doesNotMatch(pdfSurface, /proposal_ready|reportEvidence|fingerprint|snapshot|evidence|publication|stale|legacy|incomplete/i);

  // The words the designer does read.
  assert.match(shown, /Ready for Proposal/);
  assert.match(shown, /Update reports before creating a proposal/);
  assert.match(shown, /Reports are not ready yet/);
  assert.match(shown, /Update needed/);
  assert.match(shown, /Not generated/);
  assert.match(shown, /View reports/);
  assert.match(shown, /Open Room Designer/);
});