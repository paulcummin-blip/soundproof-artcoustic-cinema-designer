/**
 * Project Library — the readiness banner and the version report rows.
 *
 * ONE report per design version: the Project Report. Every version states one
 * live row for it, read from the same authority the Proposal Centre gates
 * generation with, and the row reads as one of three words:
 *
 *   Ready          the version has a current, proposal-ready Project Report
 *   Update needed  the report exists but the design has moved past it
 *   Not generated  no Project Report has been saved for the version
 *
 * Issued PDFs stay historical: they are never a live report row, they never
 * satisfy readiness, and they never block it. The retired Visual and Technical
 * Reports are inert in the same way.
 *
 *   TEST 1  One live report row per version, and it is the Project Report
 *   TEST 2  The three states read as the designer's words
 *   TEST 3  The verdict and its headline follow the gate's own rows
 *   TEST 4  The one action is the job that is actually outstanding
 *   TEST 5  The Library states one live report type and lists issued PDFs apart
 *   TEST 6  Retired report identities neither satisfy readiness nor block it
 *
 * Run: npx vitest run test/project-library-proposal-readiness.test.mjs
 */

import { test, expect } from 'vitest';
import fs from 'node:fs';
import {
  READINESS_STATE,
  buildReadinessCell,
  resolveProposalReadinessGate,
  resolveVersionReadinessRow,
} from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';
import {
  LIBRARY_CHECKLIST_STATUS,
  LIBRARY_READINESS_ACTION,
  LIBRARY_READINESS_CELLS,
  LIBRARY_READINESS_HEADLINE,
  LIBRARY_VERDICT,
  buildLibraryProposalReadiness,
  libraryCellStatus,
  libraryVersionReadinessLine,
} from '../src/components/library/libraryProposalReadiness.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SECTION = read('src/components/library/ProjectLibraryReportsSection.jsx');

const cell = (state) => buildReadinessCell({ state, generatedAt: '2026-10-04T17:11:05.564Z' });

/** One version's row, with its Project Report in the state under test. */
const versionRow = ({ id = 'v1', name = 'Level 4 version', project = READINESS_STATE.CURRENT, extraCells = {} } = {}) => resolveVersionReadinessRow({
  versionId: id,
  versionName: name,
  versionNumber: 1,
  cells: { project: cell(project), ...extraCells },
});

const readinessFor = (rows, versions = []) => buildLibraryProposalReadiness({ rows, versions });

/* ── TEST 1 — one live report row per version ─────────────────────────── */

test('TEST 1 — every version states ONE live report row, and it is the Project Report', () => {
  const versions = [
    { id: 'v1', version_name: 'Level 4 version', version_number: 1 },
    { id: 'v2', version_name: 'Original Design', version_number: 2 },
  ];
  const readiness = readinessFor([
    versionRow({ id: 'v1', name: 'Level 4 version' }),
    versionRow({ id: 'v2', name: 'Original Design' }),
  ], versions);

  expect(LIBRARY_READINESS_CELLS.map((entry) => entry.label)).toEqual(['Project Report']);
  expect(readiness.checklist).toHaveLength(2);
  readiness.checklist.forEach((entry) => {
    expect(entry.cells).toHaveLength(1);
    expect(entry.cells[0].label).toBe('Project Report');
    expect(entry.cells[0].source).toBe('project');
  });
  // The list reads in the order the version sections are shown.
  expect(readiness.checklist.map((entry) => entry.versionName))
    .toEqual(['Level 4 version', 'Original Design']);
});

/* ── TEST 2 — the three states, in the designer's words ───────────────── */

test('TEST 2 — the row reads Ready, Update needed or Not generated', () => {
  expect(libraryCellStatus({ cell: cell(READINESS_STATE.CURRENT) })).toBe(LIBRARY_CHECKLIST_STATUS.READY);
  expect(libraryCellStatus({ cell: cell(READINESS_STATE.STALE) })).toBe(LIBRARY_CHECKLIST_STATUS.UPDATE_NEEDED);
  expect(libraryCellStatus({ cell: cell(READINESS_STATE.INCOMPLETE) })).toBe(LIBRARY_CHECKLIST_STATUS.UPDATE_NEEDED);
  expect(libraryCellStatus({ cell: cell(READINESS_STATE.MISSING) })).toBe(LIBRARY_CHECKLIST_STATUS.NOT_GENERATED);
  // A read in flight states nothing at all.
  expect(libraryCellStatus({ cell: cell(READINESS_STATE.CHECKING) })).toBeNull();

  // The status words are the designer's, never an internal state name.
  const words = Object.values(LIBRARY_CHECKLIST_STATUS).join(' | ');
  expect(words).not.toMatch(/current|stale|incomplete|missing|fingerprint|evidence|authority/i);
});

/* ── TEST 3 — the verdict follows the gate ────────────────────────────── */

test('TEST 3 — the verdict and headline follow the gate’s own rows', () => {
  const ready = readinessFor([versionRow()]);
  expect(ready.verdict).toBe(LIBRARY_VERDICT.READY);
  expect(ready.ready).toBe(true);
  expect(ready.headline).toBe(LIBRARY_READINESS_HEADLINE.READY);

  const blocked = readinessFor([versionRow({ project: READINESS_STATE.STALE })]);
  expect(blocked.verdict).toBe(LIBRARY_VERDICT.UPDATES_NEEDED);
  expect(blocked.headline).toBe(LIBRARY_READINESS_HEADLINE.UPDATES_NEEDED);
  expect(blocked.showChecklist).toBe(true);

  // A report that was never created is a different job, and says so.
  const neverCreated = readinessFor([versionRow({ project: READINESS_STATE.MISSING })]);
  expect(neverCreated.verdict).toBe(LIBRARY_VERDICT.UPDATES_NEEDED);
  expect(neverCreated.showChecklist).toBe(true);

  // Nothing assessed at all is its own verdict, never "ready".
  const unassessed = readinessFor([]);
  expect(unassessed.verdict).toBe(LIBRARY_VERDICT.NOT_ASSESSED);
  expect(unassessed.ready).toBe(false);
  expect(unassessed.headline).toBe(LIBRARY_READINESS_HEADLINE.NOT_ASSESSED);

  // The banner's verdict is the gate's verdict — one authority, no second opinion.
  for (const rows of [[versionRow()], [versionRow({ project: READINESS_STATE.STALE })], []]) {
    const gate = resolveProposalReadinessGate({ rows, minVersions: 1 });
    expect(readinessFor(rows).ready).toBe(gate.ready);
  }
});

/* ── TEST 4 — the one action ──────────────────────────────────────────── */

test('TEST 4 — the action offered is the job that is outstanding', () => {
  const ready = readinessFor([versionRow()]);
  expect(ready.primaryAction.label).toBe(LIBRARY_READINESS_ACTION.CREATE_PROPOSAL);
  expect(ready.secondaryAction.label).toBe(LIBRARY_READINESS_ACTION.VIEW_PROPOSAL_CENTRE);

  const neverCreated = readinessFor([versionRow({ project: READINESS_STATE.MISSING })]);
  expect(neverCreated.primaryAction.label).toBe(LIBRARY_READINESS_ACTION.GENERATE_REQUIRED);
  expect(neverCreated.primaryAction.reportType).toBe('project');
  expect(neverCreated.primaryAction.versionId).toBe('v1');

  const movedOn = readinessFor([versionRow({ project: READINESS_STATE.STALE })]);
  expect(movedOn.primaryAction.label).toBe(LIBRARY_READINESS_ACTION.UPDATE_REQUIRED);
  expect(movedOn.primaryAction.reportType).toBe('project');

  // Nothing assessed is not a report job: the Room Designer is where it starts.
  const unassessed = readinessFor([]);
  expect(unassessed.primaryAction.label).toBe(LIBRARY_READINESS_ACTION.OPEN_ROOM_DESIGNER);

  // A version's own line is the same vocabulary the report rows use.
  expect(libraryVersionReadinessLine(versionRow())).toBe(LIBRARY_READINESS_HEADLINE.READY);
  expect(libraryVersionReadinessLine(versionRow({ project: READINESS_STATE.STALE })))
    .toBe(LIBRARY_CHECKLIST_STATUS.UPDATE_NEEDED);
});

/* ── TEST 5 — one live report type, issued PDFs apart ─────────────────── */

test('TEST 5 — the Library states ONE live report type and keeps issued PDFs historical', () => {
  // The live rows are the Project Report and nothing else.
  expect(SECTION).toContain('const REPORT_TYPES = [PROPOSAL_SOURCE_REPORT.PROJECT];');
  // Issued PDFs are their own historical list, rendered apart from the live rows.
  expect(SECTION).toContain('ExportedDocumentRow');
  expect(SECTION).toMatch(/liveReports/);
  expect(SECTION).toMatch(/reportExports/);
  // The readiness banner reads the readiness rows, never an issued document.
  expect(SECTION).toMatch(/buildLibraryProposalReadiness|<LibraryProposalReadinessBanner/);
});

/* ── TEST 6 — retired report identities are inert, both ways ──────────── */

test('TEST 6 — old Visual and Technical assets neither satisfy readiness nor block it', () => {
  // Retired cells cannot make a version ready: readiness reads its own row.
  const withRetiredCurrent = readinessFor([versionRow({
    project: READINESS_STATE.MISSING,
    extraCells: { visual: cell(READINESS_STATE.CURRENT), technical: cell(READINESS_STATE.CURRENT) },
  })]);
  expect(withRetiredCurrent.ready).toBe(false);
  expect(withRetiredCurrent.checklist[0].cells[0].status).toBe(LIBRARY_CHECKLIST_STATUS.NOT_GENERATED);

  // And retired cells cannot block a version whose Project Report is current.
  const withRetiredMissing = readinessFor([versionRow({
    project: READINESS_STATE.CURRENT,
    extraCells: { visual: cell(READINESS_STATE.MISSING), technical: cell(READINESS_STATE.STALE) },
  })]);
  expect(withRetiredMissing.ready).toBe(true);
  expect(withRetiredMissing.verdict).toBe(LIBRARY_VERDICT.READY);
  expect(withRetiredMissing.showChecklist).toBe(false);

  // The banner's own block message names the Project Report only.
  const blocked = readinessFor([versionRow({ project: READINESS_STATE.MISSING })]);
  expect(blocked.detail).not.toMatch(/Visual Report|Technical Report/);
  expect(blocked.checklist[0].cells[0].label).toBe('Project Report');
});