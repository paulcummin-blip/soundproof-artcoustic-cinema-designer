// library-dealer-safe-readiness.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the dealer-safe readiness surfaces.
//
//   A  current project       Ready for Proposal · Create Proposal · rows Current,
//                            and no internal wording anywhere
//   B  design changed        Update reports before creating a proposal · the
//                            affected row Update needed, the others Current
//   C  report page current   no warning banner at all
//   D  report page changed   the plain two-sentence banner + Create updated report
//   E  dealer mode           no diagnostics in the Library or above a report
//   F  admin/debug mode      the diagnostics exist, collapsed, admin or Engineering
//                            Mode only
//   G  proposal consistency  the Library verdict IS the Proposal Centre gate
//
// The product rule: a report is either ready to use, or the design has changed
// and the report needs updating. Everything else — gate tables, snapshot ids,
// source fingerprints, evidence state, publication state — is a diagnostic, and
// a diagnostic never reaches a dealer or a client.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LIBRARY_READINESS_HEADLINE,
  LIBRARY_READINESS_ACTION,
  LIBRARY_VERDICT,
  buildLibraryProposalReadiness,
} from '../src/components/library/libraryProposalReadiness.js';
import {
  LIVE_REPORT_DESIGN_CHANGED_NOTE,
  LIVE_REPORT_STATE,
  LIVE_REPORT_STATE_LABEL,
  REPORT_ROW_ACTION,
  liveReportNote,
  resolveLiveReportState,
} from '../src/components/library/librarySourceStatus.js';
import {
  READINESS_STATE,
  buildReadinessCell,
  resolveProposalReadinessGate,
  resolveVersionReadinessRow,
} from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const SECTION = read('src/components/library/ProjectLibraryReportsSection.jsx');
const LIVE_ROW = read('src/components/library/LiveReportRow.jsx');
const BANNER = read('src/components/report/ReportSnapshotBanner.jsx');
const DIAGNOSTICS_PANEL = read('src/components/report/ReportGateDiagnosticsPanel.jsx');
const TECHNICAL_REPORT = read('src/pages/RP22Report.jsx');
const VISUAL_REPORT = read('src/pages/RP22ClientReport.jsx');

/** Wording no dealer or client may ever read. */
const INTERNAL_WORDING =
  /report gate|gate result|publication|evidence|fingerprint|snapshot|proposal_ready|stale|legacy|incomplete|diagnostic/i;

/**
 * The literal text nodes between JSX tags: what a screen actually renders. The
 * modules' own comments name the internals precisely in order to forbid them,
 * so the check is on the rendered words, never on the source text.
 */
const renderedText = (source) => (source.match(/>[^<>{}]+</g) || []).join(' ');

const cell = (state) => buildReadinessCell({ state });

const row = ({ id, name, visual, technical, engineering }) => resolveVersionReadinessRow({
  versionId: id,
  versionName: name,
  cells: {
    visual: cell(visual || READINESS_STATE.CURRENT),
    technical: cell(technical || READINESS_STATE.CURRENT),
    engineering: cell(engineering || READINESS_STATE.CURRENT),
  },
});

const readinessFor = (rows, versions) => buildLibraryProposalReadiness({ rows, loading: false, versions });

const V4 = { id: 'v4', version_name: 'Level 4 version', version_number: 4 };
const V1 = { id: 'v1', version_name: 'Level 1 version', version_number: 1 };

/** The words a version's compact list shows, e.g. "Visual Report: Update needed". */
const cellWords = (entry) => entry.cells
  .filter((item) => item.status)
  .map((item) => `${item.label}: ${item.status}`);

/** The state one report row shows, from the version's readiness cell. */
const rowState = (readiness, versionId, reportType) => {
  const entry = readiness.checklist.find((item) => item.versionId === versionId);
  return entry?.cells.find((item) => item.source === reportType)?.status;
};

// ── A — a current project ───────────────────────────────────────────────────

test('A — every report current: Ready for Proposal, every row Current, no internal wording', () => {
  const rows = [
    row({ id: V4.id, name: V4.version_name }),
    row({ id: V1.id, name: V1.version_name }),
  ];
  const readiness = readinessFor(rows, [V4, V1]);

  assert.equal(readiness.ready, true);
  assert.equal(readiness.verdict, LIBRARY_VERDICT.READY);
  assert.equal(readiness.headline, 'Ready for Proposal');
  assert.equal(readiness.detail, 'The current Visual and Technical Reports are ready for proposal creation.');
  assert.equal(readiness.primaryAction.label, LIBRARY_READINESS_ACTION.CREATE_PROPOSAL);
  assert.equal(readiness.secondaryAction.label, LIBRARY_READINESS_ACTION.VIEW_PROPOSAL_CENTRE);
  assert.equal(readiness.showChecklist, false, 'no checklist when there is nothing to fix');

  // Every row reads Current, from the same cells the banner summarises.
  for (const version of [V4, V1]) {
    for (const type of ['visual', 'technical']) {
      const cellForRow = rows.find((item) => item.versionId === version.id).cells[type];
      const state = resolveLiveReportState({ cell: cellForRow, hasReport: true });
      assert.equal(state, LIVE_REPORT_STATE.CURRENT);
      assert.equal(LIVE_REPORT_STATE_LABEL[state], 'Current');
      assert.equal(liveReportNote({ cell: cellForRow, hasReport: true }), null);
      assert.equal(rowState(readiness, version.id, type), 'Ready');
    }
  }

  // The three user-facing states, and nothing else.
  assert.deepEqual(
    [
      LIVE_REPORT_STATE_LABEL[LIVE_REPORT_STATE.CURRENT],
      LIVE_REPORT_STATE_LABEL[LIVE_REPORT_STATE.UPDATE_NEEDED],
      LIVE_REPORT_STATE_LABEL[LIVE_REPORT_STATE.MISSING],
    ],
    ['Current', 'Update needed', 'Not generated'],
  );

  // No internal wording on any surface the dealer sees: every row states one of
  // the three status words, and no surface renders an internal term as text.
  assert.deepEqual(
    [readiness.checklist[0].cells[0].status, readiness.checklist[0].cells[1].status],
    ['Ready', 'Ready'],
  );
  assert.doesNotMatch(renderedText(LIVE_ROW), INTERNAL_WORDING);
  assert.doesNotMatch(renderedText(SECTION), INTERNAL_WORDING);
  assert.doesNotMatch(renderedText(read('src/components/library/LibraryProposalReadinessBanner.jsx')), INTERNAL_WORDING);
});

// ── B — the design changed ──────────────────────────────────────────────────

test('B — one report out of date: the Library says so, and no row says Current when it blocks', () => {
  const rows = [
    // Level 4: the design moved past the Visual Report only.
    row({ id: V4.id, name: V4.version_name, visual: READINESS_STATE.STALE }),
    // Level 1: the design moved past the Technical Report only.
    row({ id: V1.id, name: V1.version_name, technical: READINESS_STATE.STALE }),
  ];
  const readiness = readinessFor(rows, [V4, V1]);

  assert.equal(readiness.ready, false);
  assert.equal(readiness.verdict, LIBRARY_VERDICT.UPDATES_NEEDED);
  assert.equal(readiness.headline, 'Update reports before creating a proposal');
  assert.equal(
    readiness.detail,
    'The design has changed since one or more reports were created. Create updated reports before preparing the proposal.',
  );
  assert.equal(readiness.primaryAction.label, 'Update required reports');
  assert.equal(readiness.secondaryAction.label, 'View reports');
  assert.equal(readiness.showChecklist, true);

  // The affected rows say Update needed; the untouched ones still say Current.
  assert.equal(rowState(readiness, V4.id, 'visual'), 'Update needed');
  assert.equal(rowState(readiness, V4.id, 'technical'), 'Ready');
  assert.equal(rowState(readiness, V1.id, 'visual'), 'Ready');
  assert.equal(rowState(readiness, V1.id, 'technical'), 'Update needed');

  assert.deepEqual(cellWords(readiness.checklist[0]), ['Visual Report: Update needed', 'Technical Report: Ready']);
  assert.deepEqual(cellWords(readiness.checklist[1]), ['Visual Report: Ready', 'Technical Report: Update needed']);

  // The contract: a report that blocks a proposal never renders as Current, and
  // the row's own line is the dealer-safe one.
  for (const version of [V4, V1]) {
    for (const type of ['visual', 'technical']) {
      const readinessCell = rows.find((item) => item.versionId === version.id).cells[type];
      const blocks = readinessCell.state !== READINESS_STATE.CURRENT;
      const state = resolveLiveReportState({ cell: readinessCell, hasReport: true });
      if (blocks) {
        assert.equal(state, LIVE_REPORT_STATE.UPDATE_NEEDED, `${version.id} ${type} blocks`);
        assert.equal(liveReportNote({ cell: readinessCell, hasReport: true }), LIVE_REPORT_DESIGN_CHANGED_NOTE);
        assert.doesNotMatch(LIVE_REPORT_DESIGN_CHANGED_NOTE, INTERNAL_WORDING);
      } else {
        assert.equal(state, LIVE_REPORT_STATE.CURRENT);
      }
    }
  }

  // The row's state is derived from the readiness cell — not from a stored
  // report status, which is what produced the contradiction.
  assert.match(SECTION, /resolveLiveReportState\(\{ cell, hasReport \}\)/);
  assert.doesNotMatch(SECTION, /liveReportStateLabel|report\.status|snapshot\.status/);
});

// ── C, D — the report page banner ───────────────────────────────────────────

test('C — a current report page shows no warning banner at all', () => {
  // The banner renders nothing unless the report is out of date.
  assert.match(BANNER, /if \(!stale && !evidenceIncomplete\) return null;/);
  assert.doesNotMatch(BANNER, /Report gate diagnostics/);
});

test('D — a report the design moved past states it plainly, and offers Create updated report', () => {
  assert.match(BANNER, /This report was created before the latest design update\./);
  assert.match(BANNER, /The saved report is shown unchanged\./);
  assert.match(BANNER, /'Create updated report'/);

  // The dealer sees those two sentences and nothing else: which inputs moved on,
  // when it was generated and any mismatch are diagnostics.
  assert.match(BANNER, /showDiagnostics && diagnosticLine/);
  assert.equal((BANNER.match(/buildStaleSentence\(/g) || []).length, 1, 'the changed-input sentence is built once');
  assert.doesNotMatch(
    [
      'This report was created before the latest design update.',
      'The saved report is shown unchanged.',
      'Create updated report',
    ].join(' | '),
    INTERNAL_WORDING,
  );
});

// ── E, F — diagnostics ──────────────────────────────────────────────────────

test('E, F — diagnostics are admin or Engineering Mode only, collapsed, and never a dealer surface', () => {
  // Unavailable to a dealer: the panel renders nothing unless the viewer is a
  // master admin or the development preview flag is on.
  assert.match(DIAGNOSTICS_PANEL, /isMasterAdmin\(user\) \|\| engineeringMode === true/);
  assert.match(DIAGNOSTICS_PANEL, /if \(!allowed \|\| !rows\.length\) return null;/);
  assert.match(DIAGNOSTICS_PANEL, /useEngineeringMode/);

  // Collapsed by default, and named as a diagnostic rather than stated as a fact
  // about the design.
  assert.match(DIAGNOSTICS_PANEL, /<details/);
  assert.match(DIAGNOSTICS_PANEL, />\s*Show diagnostics\s*<\/summary>/);
  assert.doesNotMatch(DIAGNOSTICS_PANEL, /Report gate diagnostics/);

  // The report pages still mount the panel, so an admin can inspect it…
  assert.match(TECHNICAL_REPORT, /<ReportGateDiagnosticsPanel/);
  assert.match(VISUAL_REPORT, /<ReportGateDiagnosticsPanel/);
  // …and it is the ONLY diagnostics surface that reaches a report page.
  assert.doesNotMatch(read('src/components/report/ReportStatePanel.jsx'), /Show diagnostics/);
});

// ── G — the Library and the Proposal Centre agree ───────────────────────────

test('G — the Library never says Ready while the Proposal Centre blocks', () => {
  const fixtures = [
    { name: 'all current', rows: [row({ id: V4.id, name: V4.version_name })] },
    { name: 'design changed', rows: [row({ id: V4.id, name: V4.version_name, technical: READINESS_STATE.STALE })] },
    { name: 'report not generated', rows: [row({ id: V4.id, name: V4.version_name, visual: READINESS_STATE.MISSING })] },
    { name: 'not assessed', rows: [row({ id: V4.id, name: V4.version_name, engineering: READINESS_STATE.MISSING })] },
  ];

  for (const { name, rows } of fixtures) {
    const readiness = readinessFor(rows, [V4]);
    const gate = resolveProposalReadinessGate({ rows, loading: false, minVersions: 1 });

    assert.equal(readiness.ready, gate.ready, `${name}: verdict`);
    assert.equal(readiness.headline, gate.ready ? LIBRARY_READINESS_HEADLINE.READY : readiness.headline, name);
    if (!gate.ready) {
      assert.notEqual(readiness.headline, LIBRARY_READINESS_HEADLINE.READY, `${name}: never Ready while blocked`);
      // The list is shown when a REPORT blocks; a version that merely has no
      // assessment yet is sent to the design instead.
      assert.equal(readiness.showChecklist, name !== 'not assessed', `${name}: the version list says what to do`);
    } else {
      assert.equal(readiness.primaryAction.label, LIBRARY_READINESS_ACTION.CREATE_PROPOSAL);
    }
  }
});

// ── The report rows keep their three actions ────────────────────────────────

test('the report row offers exactly the three dealer actions', () => {
  assert.deepEqual(
    [REPORT_ROW_ACTION.OPEN, REPORT_ROW_ACTION.EXPORT_PDF, REPORT_ROW_ACTION.OPEN_SAVED],
    ['Open', 'Export PDF', 'Open saved report'],
  );
  assert.equal(REPORT_ROW_ACTION.CREATE_UPDATED, 'Create updated report');
  assert.equal(REPORT_ROW_ACTION.GENERATE, 'Generate report');
});